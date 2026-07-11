'use strict';

const crypto = require('crypto');

/**
 * GDD v5.4 — correção #3 da 2ª revisão crítica.
 *
 * A v5.3 derivava o seed só de dados que o cliente pode conhecer
 * (processo.id, tick, motor_resolucao_versao). Num jogo competitivo, isso
 * significa que um jogador consegue pré-calcular o roll ANTES de decidir
 * se aceita acordo ou segue a julgamento — quebra a informação assimétrica
 * do próprio confronto.
 *
 * Correção: um `resolution_nonce` de alta entropia é gerado com CSPRNG no
 * momento em que o caso entra na fase de resolução elegível (ex.: ao
 * concluir a fase de investigação, ou ao ser aceito — o momento exato é
 * decisão de implementação, mas TEM que ser antes do jogador poder inferir
 * o resultado, e o nonce nunca é exposto a nenhum cliente). O seed final
 * depende do nonce + os mesmos identificadores de antes — determinístico e
 * reproduzível para auditoria (quem tem acesso admin consegue recalcular),
 * mas impossível de prever de fora porque o nonce é secreto.
 *
 * ADAPTER: onde guardar o nonce é decisão de schema — recomendo um
 * documento totalmente fora de alcance de qualquer client rule, por
 * exemplo /processos/{id}/servidor/interno (nenhuma regra de leitura de
 * cliente, nem para os próprios donos dos polos).
 */

function gerarResolutionNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function seedDeterministico(resolutionNonce, processoId, tick, versaoMotor) {
  if (!resolutionNonce) {
    throw new Error(
      'seedDeterministico: resolution_nonce ausente — nunca gere o roll sem o nonce ' +
      'do servidor, ou o resultado volta a ser previsível pelo cliente.'
    );
  }
  const hash = crypto
    .createHash('sha256')
    .update(`${resolutionNonce}:${processoId}:${tick}:${versaoMotor}`)
    .digest();
  return hash.readUInt32BE(0);
}

// PRNG determinístico simples (mulberry32) — não precisa ser
// criptograficamente forte aqui, só reprodutível a partir do seed acima
// (que já concentra toda a imprevisibilidade via o nonce).
function seededRandom(seed) {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Conveniência: gera o roll final a partir dos identificadores públicos +
 * do nonce secreto, num só passo.
 */
function rollDoJulgamento(resolutionNonce, processoId, tick, versaoMotor) {
  const seed = seedDeterministico(resolutionNonce, processoId, tick, versaoMotor);
  return seededRandom(seed);
}

module.exports = { gerarResolutionNonce, seedDeterministico, seededRandom, rollDoJulgamento };
