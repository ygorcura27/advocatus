'use strict';

/**
 * GDD v5.10 §11 — correção P1.1 da auditoria v5.9.
 *
 * PROBLEMA (v5.9): o claim em /peticoes_claims/{idPeca} era permanente e sem
 * estado. Se a execução criava o claim e caía ANTES da confecção, todos os
 * retries viam `claim.exists` e pulavam para sempre. O NPC podia ficar
 * `ready` com catálogo incompleto.
 *
 * CORREÇÃO (v5.10): o claim passa a ser uma state machine com dois estados:
 *
 *   creating  — claim ativo, peça ainda não confirmada no Firestore.
 *   completed — peça confirmada existente; pode pular com segurança.
 *
 * Regra de transição no retry:
 *   peça existe no Firestore           → pular (concluído; marca claim se necessário)
 *   claim.status === 'completed'       → pular
 *   claim.status === 'creating'        → RETOMAR (re-executar confecção com idPeca)
 *   claim ausente                      → tentar reivindicar atomicamente
 *
 * Compatibilidade retroativa: claim sem campo `status` (formato v5.9 antigo)
 * é tratado como `creating`, evitando que um deploy deixe claims legados presos.
 *
 * Nova exportação: validarCoberturaCatalogo() — usada por materializarNPC()
 * como barreira final antes de gravar `sistema.inicializacao = 'ready'`.
 * Garante a invariante: toda área × tipo essencial deve ter peça no Firestore.
 *
 * ADAPTER OBRIGATÓRIO: este módulo assume uma função
 * `confeccionarPecaSincrona()` que recebe `id_determinista` e usa exatamente
 * esse ID como doc ID em /peticoes. A v5.10 depende dessa propriedade para
 * que a checagem `peça existe → pular` seja confiável.
 */

// ADAPTER — confirme/ajuste os tipos essenciais por ramo:
const TIPOS_PETICAO_ESSENCIAIS = Object.freeze({
  civil: ['inicial', 'contestacao'],
  employment: ['inicial', 'contestacao'],
  empresarial: ['inicial', 'contestacao'],
  tax: ['impugnacao', 'recurso_voluntario'],
  criminal: ['defesa_previa', 'alegacoes_finais'],
});

/**
 * Determina o estado atual de uma peça essencial a partir das leituras de
 * claim e peça no Firestore. Centraliza a lógica de transição da state machine
 * para que não fique espalhada por múltiplos if/else ao longo da função.
 *
 * Retorna um dos seguintes:
 *   'done'    — peça existe ou claim está completed; não confeccionar.
 *   'retomar' — claim existe no estado creating; retomar confecção com mesmo idPeca.
 *   'claim'   — nem claim nem peça existem; tentar reivindicar.
 */
function _estadoAtual(claimDoc, pecaDoc) {
  // Peça confirmada no Firestore → concluído independente do claim.
  if (pecaDoc && pecaDoc.exists) return 'done';

  if (claimDoc && claimDoc.exists) {
    const status = claimDoc.data().status;
    // Sem status = formato v5.9 antigo → tratar como 'creating' para retomada.
    if (!status || status === 'creating') return 'retomar';
    if (status === 'completed') return 'done';
  }

  return 'claim'; // nem claim nem peça — reivindicar
}

async function seedCatalogoInicial({
  db,
  profileId,
  areas,
  skills,
  confeccionarPecaSincrona,
  poolTeses,
  escolherEstiloNPCInicial,
  pecaJaExiste = null, // opcional: override da checagem (usado em testes).
}) {
  const criadas = [];

  for (const area of areas) {
    const tipos = TIPOS_PETICAO_ESSENCIAIS[area] || [];
    for (const tipo of tipos) {
      const idPeca = idPecaEssencial(profileId, area, tipo);
      const claimRef = db.collection('peticoes_claims').doc(idPeca);
      const pecaRef  = db.collection('peticoes').doc(idPeca);

      const [claimSnap, pecaSnap] = await Promise.all([
        claimRef.get(),
        pecaRef.get(),
      ]);

      const pecaExisteExternamente = pecaJaExiste
        ? await pecaJaExiste(profileId, area, tipo)
        : pecaSnap.exists;

      const estadoRapido = _estadoAtual(
        claimSnap,
        pecaExisteExternamente ? { exists: true } : pecaSnap,
      );

      if (estadoRapido === 'done') {
        // Se a peça já existe mas o claim não está 'completed', atualizamos o claim.
        if (claimSnap && claimSnap.exists && claimSnap.data().status !== 'completed') {
          await db.runTransaction(async (tx) => {
            const claim = await tx.get(claimRef);
            if (claim.exists && claim.data().status !== 'completed') {
              tx.update(claimRef, { status: 'completed', concluido_em: Date.now() });
            }
          });
        }
        continue;
      }

      // ── Verificar teses antes de qualquer efeito externo ──
      const teses = poolTeses[area] || [];
      if (teses.length === 0) {
        throw new Error(
          `seedCatalogoInicial: sem teses em poolTeses["${area}"] para a peça ` +
          `"${tipo}" do NPC ${profileId}. Cobertura mínima não pode ser cumprida — ` +
          `NPC permanece 'creating'. Confirme poolTeses antes de reprocessar.`,
        );
      }

      // ── Transaction: reivindicar ou confirmar estado atual ──
      // Resultado: 'confeccionar' | 'retomar' | 'done'
      const acao = await db.runTransaction(async (tx) => {
        const claim = await tx.get(claimRef);
        const peca  = await tx.get(pecaRef);

        // Peça existe → concluído. Marcar claim como completed se ainda não estiver.
        if (peca.exists) {
          if (claim.exists && claim.data().status !== 'completed') {
            tx.update(claimRef, { status: 'completed', concluido_em: Date.now() });
          }
          return 'done';
        }

        if (claim.exists) {
          const status = claim.data().status;
          // Sem status = v5.9 legado → tratar como creating para retomada.
          if (!status || status === 'creating') return 'retomar';
          if (status === 'completed') return 'done'; // concluído sem peça? — pula (adapter-defeituoso; P2.2 cobre isso)
        }

        // Novo claim: estado 'creating'.
        tx.set(claimRef, {
          id_peca: idPeca,
          profile_id: profileId,
          status: 'creating',
          em: Date.now(),
        });
        return 'confeccionar';
      });

      if (acao === 'done') continue;

      // 'confeccionar' e 'retomar' seguem o mesmo caminho abaixo.
      // Em 'retomar', o idPeca é idêntico ao do claim existente, portanto o
      // adapter que usa id_determinista produzirá exatamente o mesmo doc ID.
      const tese = teses[Math.floor(Math.random() * teses.length)];
      const peca = await confeccionarPecaSincrona({
        db,
        id_determinista: idPeca,
        autor_uid: profileId,
        tipo_peticao: tipo,
        ramo_direito: area,
        estilo_escrita: escolherEstiloNPCInicial(skills),
        tese_central: tese,
        autores: [{ uid: profileId, proporcao: 1.0, papel: 'lider' }],
      });
      criadas.push(peca);

      // Marcar claim como completed na mesma transaction que confirma a peça.
      // Se o adapter já persistiu a peça em /peticoes/{idPeca}, a próxima
      // leitura da peça no retry verá o doc e marcará completed automaticamente
      // mesmo que esta transaction falhe — cobertura extra.
      await db.runTransaction(async (tx) => {
        const pecaConfirmada = await tx.get(pecaRef);
        if (!pecaConfirmada.exists) {
          // Adapter não persisitiu com o id_determinista esperado — erro de adapter.
          throw new Error(
            `seedCatalogoInicial: adapter não persistiu a peça com id_determinista="${idPeca}". ` +
            `Verifique se confeccionarPecaSincrona usa obrigatoriamente id_determinista como doc ID em /peticoes.`,
          );
        }
        tx.set(claimRef, {
          id_peca: idPeca,
          profile_id: profileId,
          status: 'completed',
          concluido_em: Date.now(),
        }, { merge: true }); // Usando merge para suportar mockFirestore
      });
    }
  }

  return criadas;
}

/**
 * Valida que todas as peças essenciais de um NPC existem no Firestore.
 * Deve ser chamada por materializarNPC() ANTES de gravar `sistema.inicializacao = 'ready'`.
 *
 * Lança erro explicitando qual peça está faltando se a invariante não for satisfeita.
 * Retorna void em caso de sucesso.
 *
 * Isso funciona como barreira final contra:
 *   - claim órfão (P1.1)
 *   - adapter defeituoso
 *   - persistência ausente
 *   - qualquer inconsistência não coberta pelo fluxo de claim
 */
async function validarCoberturaCatalogo(db, profileId, areas) {
  const faltando = [];

  for (const area of areas) {
    const tipos = TIPOS_PETICAO_ESSENCIAIS[area] || [];
    for (const tipo of tipos) {
      const idPeca = idPecaEssencial(profileId, area, tipo);
      const snap = await db.collection('peticoes').doc(idPeca).get();
      if (!snap.exists) {
        faltando.push({ area, tipo, idPeca });
      }
    }
  }

  if (faltando.length > 0) {
    const lista = faltando.map((f) => `${f.area}/${f.tipo} (${f.idPeca})`).join(', ');
    throw new Error(
      `validarCoberturaCatalogo: NPC ${profileId} não pode ser marcado ready — ` +
      `peças essenciais ausentes no Firestore: ${lista}. ` +
      `Reprocesse via materializarNPC() para completar o catálogo.`,
    );
  }
}

// Chave determinística de peça essencial de NPC — usada tanto pela
// checagem de idempotência interna quanto oferecida ao adapter de
// confecção como ID sugerido.
function idPecaEssencial(profileId, area, tipo) {
  return `npc_${profileId}_${area}_${tipo}`;
}

module.exports = {
  seedCatalogoInicial,
  validarCoberturaCatalogo,
  TIPOS_PETICAO_ESSENCIAIS,
  idPecaEssencial,
};
