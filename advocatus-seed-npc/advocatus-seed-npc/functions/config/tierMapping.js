'use strict';

/**
 * GDD v5.3 §14 — correção #4 da revisão crítica.
 *
 * A v5.2 usava `tier_do_caso - 1` para achar tiers de escritório elegíveis,
 * mas tier_do_caso é string ("C"|"B"|"A"|"S") e tier_escritorio é número
 * (1-5) — a subtração simplesmente não funciona. Este mapeamento explícito
 * substitui aquela expressão em todo o matchmaking (Parte IV do GDD).
 */
const CASE_TIER_TO_OFFICE_TIERS = Object.freeze({
  C: Object.freeze([1, 2]),
  B: Object.freeze([1, 2, 3]),
  A: Object.freeze([2, 3, 4]),
  S: Object.freeze([4, 5]),
});

function tiersDeEscritorioElegiveis(tierCaso) {
  const tiers = CASE_TIER_TO_OFFICE_TIERS[tierCaso];
  if (!tiers) {
    throw new Error(`Tier de caso desconhecido: "${tierCaso}" (esperado C, B, A ou S)`);
  }
  return tiers;
}

module.exports = { CASE_TIER_TO_OFFICE_TIERS, tiersDeEscritorioElegiveis };
