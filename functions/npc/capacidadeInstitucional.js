'use strict';

/**
 * GDD v5.10 §13 — correção P1.5 da auditoria v5.9.
 *
 * Lote de expansão institucional retomável: documento em
 *   /expansao_institucional_slots/{jurisdicao}_{subtipo}_{tick}
 * com slots [slot_0 … slot_{LOTE_EXPANSAO-1}], cada um seguindo o padrão
 * de criarAdvogadoNPCComSlot(). O retry encontra o documento existente e
 * continua de onde parou.
 *
 * O lock de cooldown evita que dois processos inicializem lotes simultâneos
 * com o mesmo tick. O lock protege a CRIAÇÃO do lote; os slots protegem a
 * EXECUÇÃO.
 *
 * NOTA DE INTEGRAÇÃO (2026-07): esta função ainda NÃO está conectada a
 * nenhum gatilho automático (tick_mensal.js). O jogo real não mantém hoje
 * um contador de "casos ativos por jurisdição" — /processos não tem campo
 * jurisdicao (jurisdicao_id vive no jogador, não no processo) — então
 * `casosAtivosNaJurisdicao` não tem fonte de dado real ainda. Disponível
 * para chamada manual (ex.: admin.js) até essa métrica ser definida.
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

  const { capacidadeTotal } = await capacidadeTotalInstitucional(db, jurisdicao, subtipo);
  if (casosAtivosNaJurisdicao <= capacidadeTotal) {
    return { expandido: false, criados: [] };
  }

  const loteId    = `expansao_${jurisdicao}_${subtipo}_${tick}`;
  const loteRef   = db.collection('expansao_institucional_slots').doc(loteId);
  const loteSnap  = await loteRef.get();

  if (!loteSnap.exists) {
    const slots = Array.from({ length: LOTE_EXPANSAO }, (_, i) =>
      `${loteId}_slot_${String(i).padStart(3, '0')}`,
    );
    await loteRef.set({ lote_id: loteId, jurisdicao, subtipo, tick, slots, criado_em: Date.now() });
  }

  const loteAtual = (await loteRef.get()).data();
  const criados   = [];

  for (const slotId of loteAtual.slots) {
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
