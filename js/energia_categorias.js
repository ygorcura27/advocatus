'use strict';

/**
 * ENERGIA POR CATEGORIA — versão frontend (GDD v6.0 §3.1).
 * Espelho de functions/energia_categorias.js — mesma lógica, mesma migração
 * sem quebra (conta sem `energia_alocada` continua no pool único legado),
 * mas sem lançar exception: retorna {ok, patch, mensagemErro} porque o
 * padrão do frontend é `toast(...,'ko')`, não HttpsError.
 *
 * Uso típico (substituindo um bloco antigo tipo
 *   if ((j.energia_usada_mes||0) + CUSTO > 100) { toast('Energia insuficiente','ko'); return; }
 *   ... updateDoc(ref, { energia_usada_mes: (j.energia_usada_mes||0) + CUSTO }) ...
 * ):
 *   const r = window.checarEnergiaCategoria(j, 'processos', CUSTO, 'aceitar o caso');
 *   if (!r.ok) { toast(r.mensagemErro, 'ko'); return; }
 *   await updateDoc(ref, { ...outrosCampos, ...r.patch });
 */

window.CATEGORIAS_ENERGIA = ['processos', 'supervisao', 'estudo', 'captacao', 'pessoal', 'descanso'];

window.categoriaEnergiaVazia = function() {
  return { processos: 0, supervisao: 0, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 };
};

/** Energia já gasta no mês (pote único) — maior entre o registro legado e a soma por categoria. */
window.energiaGastaMes = function(j) {
  if (!j) return 0;
  const soma = Object.values(j.energia_usada || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.max(Number(j.energia_usada_mes) || 0, soma);
};

function _patchUso(j, categoria, delta) {
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const usado = { ...window.categoriaEnergiaVazia(), ...(j.energia_usada || {}) };
  usado[categoria] = Math.max(0, (usado[categoria] || 0) + delta);
  const gasto = Math.max(0, window.energiaGastaMes(j) + delta);
  return { energia_usada: usado, energia_usada_mes: gasto, energia: Math.max(0, total - gasto) };
}

/** Checa e monta o patch de débito (pote único). Não lança — retorna {ok:false, mensagemErro} se não couber. */
window.checarEnergiaCategoria = function(j, categoria, valor, rotuloAcao) {
  if (!window.CATEGORIAS_ENERGIA.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const gasto = window.energiaGastaMes(j);
  if (gasto + valor > total) {
    return { ok: false, mensagemErro: `Energia insuficiente para ${rotuloAcao || 'esta ação'} (${Math.max(0, total - gasto)}/${valor}). Avance o mês para recuperar.` };
  }
  return { ok: true, patch: _patchUso(j, categoria, valor) };
};

/** Energia disponível (pote único — a categoria é ignorada, mantida por compatibilidade). */
window.energiaDisponivelCategoria = function(j, categoria) {
  if (!j) return 0;
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  return Math.max(0, total - window.energiaGastaMes(j));
};

/**
 * GDD v6.0 §7.4 — "Supervisão do Sócio": espelho frontend de
 * functions/energia_categorias.js::calcularModSupervisaoSocio, só pra
 * mostrar o multiplicador atual na tela de Energia (o cálculo que vale de
 * verdade roda no backend, em avancar_mes.js).
 */
window.calcularModSupervisaoSocio = function(j) { return 1.0; };

/** Devolve energia gasta (ex: docência energiza). Sempre floor em 0. */
window.creditarEnergiaCategoriaPatch = function(j, categoria, valor) {
  const atual = (j.energia_usada || {})[categoria] || 0;
  return _patchUso(j, categoria, -Math.min(valor, Math.max(atual, window.energiaGastaMes(j))));
};
