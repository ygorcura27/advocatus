'use strict';

/**
 * Adapter do relógio global para o módulo de seed/ciclo de vida de NPC.
 * O tick real do jogo é /config/server.mes_global (tick_mensal.js) — um
 * inteiro absoluto que avança 1x por dia real (1 dia = 1 mês de jogo).
 */
async function tickAtualFn(db) {
  const doc = await db.collection('config').doc('server').get();
  const tick = doc.exists ? doc.data().mes_global : undefined;
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(
      `tickAtualFn: /config/server.mes_global ausente ou inválido (${tick}). ` +
      `O servidor precisa ter rodado ao menos 1 tick_mensal antes do seed de NPCs.`,
    );
  }
  return tick;
}

module.exports = { tickAtualFn };
