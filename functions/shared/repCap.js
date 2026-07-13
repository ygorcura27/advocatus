'use strict';

/**
 * CAP DE REPUTAÇÃO POR CARGO — compartilhado.
 * Existiam ~6 cópias locais de REP_CAP espalhadas (avancar_mes.js,
 * investigacao.js, processar_acordao.js, processar_sentenca.js, etc.) —
 * mantidas como estão (risco de tocar em código já calibrado sem necessidade).
 * Este módulo é só para os pontos que ganham reputação via FieldValue.increment
 * sem clamp nenhum (bug real: reputação passava de 100, travando toda escrita
 * subsequente no documento do jogador — a regra do Firestore exige
 * reputacao <= 100 em QUALQUER update, não só nos que mexem em reputação).
 */

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

function repCapDoCargo(cargoId) {
  return REP_CAP[cargoId] || 55;
}

/** Soma delta à reputação atual, travando no cap do cargo (nunca > 100). */
function clampReputacao(atual, cargoId, delta) {
  const cap = repCapDoCargo(cargoId);
  return Math.max(0, Math.min(cap, (atual || 0) + delta));
}

module.exports = { REP_CAP, repCapDoCargo, clampReputacao };
