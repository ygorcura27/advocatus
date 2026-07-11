'use strict';

/**
 * GDD v5.10 §10 — correção P2.1 da auditoria v5.9.
 *
 * PROBLEMA (v5.9): a unicidade do reservaId era garantida apenas dentro de
 * cada escritório (/escritorios/{id}/reservas_npc/{reservaId}). Duas chamadas
 * diretas concorrentes com o mesmo reservaId poderiam reservar vagas em dois
 * escritórios distintos — o marcador era único por escritório, não globalmente.
 *
 * CORREÇÃO (v5.10): introduzir um documento global em
 *   /reservas_npc/{reservaId}
 * que é reivindicado atomicamente ANTES de tentar qualquer escritório candidato.
 * Só o vencedor do claim global avança para o decremento de vaga. O documento
 * global também registra o escritorio_id escolhido, permitindo que o retry
 * encontre o mesmo escritório sem precisar de collectionGroup.
 *
 * Hierarquia de garantias (v5.10):
 *   1. /reservas_npc/{reservaId} — claim global: apenas um vencedor por reservaId.
 *   2. /escritorios/{id}/reservas_npc/{reservaId} — marcador local (mantido para
 *      consistência intra-escritório e para reads locais rápidos).
 *   3. Transaction que decrementa vaga e grava marcador local atomicamente.
 *
 * Compatibilidade retroativa: se /reservas_npc/{reservaId} já existir com
 * escritorio_id gravado (tentativa anterior completa ou parcial), a função
 * devolve esse escritório sem tentar candidatos novos.
 */

async function vincularEscritorioNPC(db, jurisdicao, tiersElegiveis, tickAtualFn, reservaId) {
  if (!reservaId) {
    throw new Error(
      'vincularEscritorioNPC: reservaId obrigatório (idempotência da reserva de vaga — P1.1/P2.1)',
    );
  }

  const globalReservaRef = db.collection('reservas_npc').doc(reservaId);

  // ── 1. Verificar se esta reserva já foi concluída (claim global já gravado) ──
  const globalSnap = await globalReservaRef.get();
  if (globalSnap.exists && globalSnap.data().escritorio_id) {
    // Reserva já concluída em tentativa anterior — devolver o mesmo escritório.
    return {
      id:   globalSnap.data().escritorio_id,
      tier: globalSnap.data().tier,
    };
  }

  // ── 2. Reivindicar o claim global atomicamente ──
  // Apenas o vencedor avança para a busca de escritório candidato.
  const venceuGlobal = await db.runTransaction(async (tx) => {
    const doc = await tx.get(globalReservaRef);
    if (doc.exists) return false; // outra execução chegou primeiro
    tx.set(globalReservaRef, {
      reserva_id: reservaId,
      status: 'claiming',
      escritorio_id: null,
      tier: null,
      em: Date.now(),
    });
    return true;
  });

  if (!venceuGlobal) {
    // Perdeu o claim global — aguardar o vencedor completar e devolver o resultado.
    // Na prática, o chamador (criarAdvogadoNPCComSlot) é o único que usa reservaId,
    // então esse cenário só ocorre em chamadas diretas concorrentes. Ler o documento
    // final após curta espera (best-effort); se ainda incompleto, lançar erro.
    await new Promise((r) => setTimeout(r, 200));
    const final = await globalReservaRef.get();
    if (final.exists && final.data().escritorio_id) {
      return { id: final.data().escritorio_id, tier: final.data().tier };
    }
    throw new Error(
      `vincularEscritorioNPC: concorrência no claim global de reservaId="${reservaId}". ` +
      `O vencedor ainda não concluiu a reserva. Reprocesse o slot para retomar.`,
    );
  }

  // ── 3. Vencedor busca escritório candidato e decrementa vaga ──
  const resultado = await _reservarVagaEmCandidato(
    db, jurisdicao, tiersElegiveis, tickAtualFn, reservaId,
  );

  // ── 4. Persistir o escritório escolhido no claim global (torna idempotente) ──
  await globalReservaRef.update({
    status: 'completed',
    escritorio_id: resultado.id,
    tier: resultado.tier,
    concluido_em: Date.now(),
  });

  return resultado;
}

/**
 * Busca um escritório candidato com vaga disponível e decrementa atomicamente.
 * Mantém os marcadores locais /escritorios/{id}/reservas_npc/{reservaId} para
 * consistência intra-escritório (herdado da v5.9).
 * Cria um escritório novo se nenhum candidato tiver vaga.
 *
 * [Nota P2.1] Esta função só é chamada pelo vencedor do claim global, então
 * a proteção contra dois decrementos para o mesmo reservaId já está garantida
 * pelo passo anterior. Os marcadores locais são mantidos como defesa extra
 * e para histórico de ocupação por escritório.
 */
async function _reservarVagaEmCandidato(db, jurisdicao, tiersElegiveis, tickAtualFn, reservaId) {
  // (cobre o caso de crash entre gravar o marcador local e atualizar o claim global)
  // Como o claim global usa a coleção 'reservas_npc', o collectionGroup vai achar
  // tanto o global quanto o local. Vamos filtrar para pegar só o local (que tem pai).
  const todasReservas = await db
    .collectionGroup('reservas_npc')
    .where('reserva_id', '==', reservaId)
    .limit(2)
    .get();

  const reservaLocal = todasReservas.docs.find((d) => d.ref.parent.parent !== null);

  if (reservaLocal) {
    const escritorioRef = reservaLocal.ref.parent.parent;
    const escritorio = await escritorioRef.get();
    return { id: escritorio.id, tier: escritorio.data().tier };
  }

  // Buscar candidatos com vaga.
  const query = tiersElegiveis
    ? db.collection('escritorios')
        .where('jurisdicao', '==', jurisdicao)
        .where('tier', 'in', tiersElegiveis)
        .where('e_npc', '==', true)
        .where('vagas_advogado_disponiveis', '>', 0)
        .limit(5)
    : db.collection('escritorios')
        .where('jurisdicao', '==', jurisdicao)
        .where('e_npc', '==', true)
        .where('vagas_advogado_disponiveis', '>', 0)
        .limit(5);

  const candidatos = await query.get();

  for (const doc of candidatos.docs) {
    const reserva = await db.runTransaction(async (tx) => {
      const reservaLocalRef = doc.ref.collection('reservas_npc').doc(reservaId);
      const reservaLocalDoc = await tx.get(reservaLocalRef);
      if (reservaLocalDoc.exists) {
        return { id: doc.id, tier: doc.data().tier }; // já reservado — idempotente
      }
      const atual = await tx.get(doc.ref);
      if (!atual.exists || atual.data().vagas_advogado_disponiveis <= 0) {
        return null;
      }
      const dadosDoc = atual.data();
      tx.update(doc.ref, {
        vagas_advogado_disponiveis: dadosDoc.vagas_advogado_disponiveis - 1,
      });
      tx.set(reservaLocalRef, { reserva_id: reservaId, em: Date.now() });
      return { id: atual.id, tier: atual.data().tier };
    });
    if (reserva) return reserva;
  }

  // Nenhum candidato tinha vaga — criar escritório novo com ID derivado do reservaId.
  const tier = tiersElegiveis ? Math.min(...tiersElegiveis) : 1;
  const tick  = await tickAtualFn(db);
  const novoRef = db.collection('escritorios').doc(`npc_esc_${reservaId}`);

  return db.runTransaction(async (tx) => {
    const existente = await tx.get(novoRef);
    if (existente.exists) {
      return { id: novoRef.id, tier: existente.data().tier };
    }
    tx.set(novoRef, {
      nome: `Escritório ${_gerarNomeFachada()}`,
      e_npc: true, jurisdicao, tier, tier_desde: tick,
      caixa: 0, reputacao: 0, fundador_uid: null, socios_uids: [],
      vagas_advogado_disponiveis: _capacidadePorTier(tier) - 1,
    });
    tx.set(
      novoRef.collection('reservas_npc').doc(reservaId),
      { reserva_id: reservaId, em: Date.now() },
    );
    return { id: novoRef.id, tier };
  });
}

function _capacidadePorTier(tier) {
  return { 1: 2, 2: 4, 3: 8, 4: 15, 5: 25 }[tier] ?? 2;
}

const _SUFIXOS = ['& Associados', 'Advocacia', '& Partners', 'Sociedade de Advogados'];
function _gerarNomeFachada() {
  return _SUFIXOS[Math.floor(Math.random() * _SUFIXOS.length)];
}

module.exports = { vincularEscritorioNPC, _capacidadePorTier };
