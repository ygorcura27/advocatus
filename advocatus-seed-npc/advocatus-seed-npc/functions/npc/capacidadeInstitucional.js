'use strict';

/**
 * GDD v5.10 §13 — correção P1.5 da auditoria v5.9.
 *
 * PROBLEMA (v5.9): o lote de expansão institucional não era retomável.
 *   - O cooldown de 60s evitava duplicação simultânea imediata.
 *   - Mas crash a meio do lote deixava NPCs parcialmente criados sem rastro.
 *   - Após o cooldown expirar, nova execução criava +5 sem verificar o que
 *     já havia sido criado, podendo resultar em mais NPCs do que necessário.
 *
 * CORREÇÃO (v5.10): introduzir um documento de lote em
 *   /expansao_institucional_slots/{jurisdicao}_{subtipo}_{tick}
 * com slots [slot_0 … slot_{LOTE_EXPANSAO-1}], cada um seguindo o padrão
 * de criarAdvogadoNPCComSlot(). O retry encontra o documento existente e
 * continua de onde parou — cada slot já 'completed' é pulado sem re-executar.
 *
 * O lock de cooldown é mantido para evitar que dois processos inicializem
 * lotes simultâneos com o mesmo tick (o que criaria dois documentos de lote
 * com IDs idênticos e causaria conflito na transaction de claim do slot).
 * O lock protege a CRIAÇÃO do lote; os slots protegem a EXECUÇÃO.
 *
 * Comportamento após crash:
 *   - O documento de lote persiste com slots parcialmente 'completed'.
 *   - O retry re-executa apenas os slots ainda em 'creating' ou ausentes.
 *   - Slots já 'completed' são pulados via o mecanismo nativo de
 *     criarAdvogadoNPCComSlot (slotDoc.status === 'completed').
 */

const { criarAdvogadoNPCComSlot } = require('./seedAdvogadosNPC');
const { mediaSkillsPrincipais }    = require('./geradores');

const CAPACIDADE_BASE = 15;
const LOTE_EXPANSAO   = 5;

function capacidadeMaximaInstitucional(npc) {
  const porSkill = Math.floor(mediaSkillsPrincipais(npc.skills) / 5);
  return CAPACIDADE_BASE + porSkill; // tipicamente 15–25 casos simultâneos
}

async function capacidadeTotalInstitucional(db, jurisdicao, subtipo) {
  const snap = await db
    .collection('perfis')
    .where('tipo', '==', 'npc')
    .where('subtipo_npc', '==', subtipo)
    .where('banca.jurisdicao', '==', jurisdicao)
    .where('ciclo_vida.status', '==', 'ativo')
    .where('sistema.inicializacao', '==', 'ready')
    .get();

  const npcs = snap.docs.map((d) => d.data());
  const capacidadeTotal = npcs.reduce((soma, npc) => soma + capacidadeMaximaInstitucional(npc), 0);
  return { npcs, capacidadeTotal };
}

/**
 * Verifica se a demanda atual da jurisdição excede a capacidade instalada
 * e, se sim, adiciona um lote de novos institucionais via slots retomáveis.
 *
 * [v5.10 — P1.5] O lote é materializado como um documento em
 * /expansao_institucional_slots/{loteId} antes de qualquer criação de NPC.
 * O retry encontra o documento e continua apenas os slots incompletos.
 */
async function garantirCapacidadeInstitucional({
  db, jurisdicao, subtipo, casosAtivosNaJurisdicao,
  confeccionarPecaSincrona, poolTeses, tickAtualFn,
}) {
  if (subtipo !== 'procurador' && subtipo !== 'promotor') {
    throw new Error(
      `garantirCapacidadeInstitucional: subtipo inválido "${subtipo}" (esperado "procurador" ou "promotor")`,
    );
  }

  // ── Lock de cooldown: evita que dois processos iniciem lotes simultâneos ──
  const lockRef    = db.collection('locks').doc(`expansao_institucional_${jurisdicao}_${subtipo}`);
  const COOLDOWN_MS = 60000;

  const tick = await tickAtualFn(db);

  const podeExpandir = await db.runTransaction(async (tx) => {
    const lockDoc = await tx.get(lockRef);
    const agora = Date.now();
    if (lockDoc.exists && (agora - lockDoc.data().em) < COOLDOWN_MS) {
      return false;
    }
    tx.set(lockRef, { em: agora, tick });
    return true;
  });

  if (!podeExpandir) {
    return { expandido: false, criados: [], motivo: 'lock_ativo_cooldown' };
  }

  // ── Verificar se a capacidade realmente precisa de expansão ──
  const { capacidadeTotal } = await capacidadeTotalInstitucional(db, jurisdicao, subtipo);
  if (casosAtivosNaJurisdicao <= capacidadeTotal) {
    return { expandido: false, criados: [] };
  }

  // ── Materializar documento de lote (retomável) ──
  // O ID do lote inclui o tick para que ticks diferentes gerem lotes distintos.
  // Dois processos que passaram pelo lock no mesmo tick tentarão o mesmo loteId;
  // o segundo encontrará o documento existente e apenas completará os slots restantes.
  const loteId    = `expansao_${jurisdicao}_${subtipo}_${tick}`;
  const loteRef   = db.collection('expansao_institucional_slots').doc(loteId);
  const loteSnap  = await loteRef.get();

  if (!loteSnap.exists) {
    // Inicializar o documento de lote com os IDs dos slots.
    const slots = Array.from({ length: LOTE_EXPANSAO }, (_, i) =>
      `${loteId}_slot_${String(i).padStart(3, '0')}`,
    );
    await loteRef.set({ lote_id: loteId, jurisdicao, subtipo, tick, slots, criado_em: Date.now() });
  }

  const loteAtual = (await loteRef.get()).data();
  const criados   = [];

  for (const slotId of loteAtual.slots) {
    // criarAdvogadoNPCComSlot lida internamente com 'completed'/'creating'/novo.
    const { profileId, emAndamento } = await criarAdvogadoNPCComSlot(
      {
        db, jurisdicao, sub: subtipo, skillMin: 18, skillMax: 36, tiers: null,
        confeccionarPecaSincrona, poolTeses, tickAtualFn,
      },
      slotId,
    );
    if (!emAndamento && profileId) criados.push(profileId);
  }

  return { expandido: true, criados };
}

module.exports = {
  capacidadeMaximaInstitucional,
  capacidadeTotalInstitucional,
  garantirCapacidadeInstitucional,
  CAPACIDADE_BASE,
  LOTE_EXPANSAO,
};
