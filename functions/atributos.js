'use strict';

/**
 * ATRIBUTOS RPG — GDD v6.0 §4.4. Confirmado por grep em sessões anteriores:
 * não existiam no jogo real (só mockup) — Banco de Teses e o resto do jogo
 * contornaram usando skills reais em vez desses atributos fictícios.
 *
 * ESCOPO DESTA IMPLEMENTAÇÃO (documentado, não é meia-implementação por
 * descuido): os 6 atributos agora são dado REAL, armazenado e visível
 * (`jogadores/{uid}.atributos`), com DEFAULT LAZY (`getAtributo`, mesmo
 * padrão de `j.saude_mental ?? 80` usado em todo o resto do jogo — não
 * precisa de migração nem tela de criação de personagem nova).
 *
 * Só 2 dos 6 têm hook mecânico real nesta passada — os outros 4 têm o
 * hint do GDD documentado abaixo, mas SEM efeito ainda (não fingido):
 *  - Constituição → bônus de energia total (calcularEnergiaTotal, GDD "horas").
 *  - Raciocínio Jurídico → teto de atualização% das Teses (banco_teses.js,
 *    GDD "teto das Teses").
 *  - Charm ("captação, negociação, júri"), Inteligência ("aprendizado, teto
 *    de Redação"), Retórica ("audiências, sustentação oral"), Aparência
 *    ("clientes, mídia") — sem hook ainda. Cada um exigiria tocar um
 *    sistema separado (economia de captação, velocidade de estudo,
 *    Julgamento, ganhos de mídia) — bem maior que os 2 acima, ficou de
 *    fora desta passada por escopo.
 */

const ESCALA_MIN = 1;
const ESCALA_MAX = 21; // 23 só com suporte externo (GDD) — não modelado ainda, sem mecanismo de "suporte externo" real
const ESCALA_BASE = 11; // ponto médio — personagem novo nasce aqui, sem vantagem nem desvantagem

const ATRIBUTOS = ['charm', 'inteligencia', 'retorica', 'raciocinio_juridico', 'aparencia', 'constituicao'];

function atributosDefault() {
  const out = {};
  ATRIBUTOS.forEach(a => { out[a] = ESCALA_BASE; });
  return out;
}

/** Lê 1 atributo com default lazy — nunca falha mesmo se `atributos` nunca foi salvo. */
function getAtributo(j, nome) {
  const v = j?.atributos?.[nome];
  return Number.isFinite(v) ? Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, v)) : ESCALA_BASE;
}

/** Constituição → bônus de energia total. +1,5 por ponto acima da base (11), floor. Ex.: 21 → +15; 1 → -15. */
function bonusEnergiaConstituicao(j) {
  const c = getAtributo(j, 'constituicao');
  return Math.round((c - ESCALA_BASE) * 1.5);
}

/** Raciocínio Jurídico → bônus no teto de atualização% das Teses (banco_teses.js::tetoAtualizacao). +0,5pp por ponto acima da base. */
function bonusTetoTeseRaciocinio(j) {
  const r = getAtributo(j, 'raciocinio_juridico');
  return (r - ESCALA_BASE) * 0.5;
}

module.exports = {
  ESCALA_MIN, ESCALA_MAX, ESCALA_BASE, ATRIBUTOS,
  atributosDefault,
  getAtributo,
  bonusEnergiaConstituicao,
  bonusTetoTeseRaciocinio,
};
