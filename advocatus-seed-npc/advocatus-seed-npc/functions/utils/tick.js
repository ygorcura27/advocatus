'use strict';

/**
 * ADAPTER OBRIGATÓRIO — ajuste para o caminho real do seu relógio global
 * (GDD v5.0/v5.1, Parte IV — 1 tick = 1 mês de jogo). Estou assumindo aqui
 * um documento único /config/tick_global com campo `tick_atual` (inteiro).
 * Se seu projeto usa outro nome de coleção/campo, troque só a leitura
 * abaixo — a assinatura da função (recebe db, devolve number) é o que o
 * resto do módulo de seed espera.
 */
async function tickAtual(db) {
  const doc = await db.collection('config').doc('tick_global').get();
  if (!doc.exists) {
    throw new Error(
      'Documento config/tick_global não encontrado — ajuste o adapter em utils/tick.js para o caminho real do seu relógio global.'
    );
  }
  const tick = doc.data().tick_atual;
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`tickAtual: tick_atual corrompido ou inválido: ${tick}`);
  }
  return tick;
}

module.exports = { tickAtual };
