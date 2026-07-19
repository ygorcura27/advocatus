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

/** Checa e monta o patch de débito. Não lança — retorna {ok:false, mensagemErro} se não couber. */
window.checarEnergiaCategoria = function(j, categoria, valor, rotuloAcao) {
  if (!window.CATEGORIAS_ENERGIA.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }

  // Conta antiga (ou jogador que nunca abriu a tela de alocação): legado —
  // mesmos 2 espelhos que o código legado já mantinha (energia_usada_mes,
  // que a UI mostra, e energia, que outras telas checam).
  if (!j.energia_alocada) {
    const usoAtual = j.energia_usada_mes || 0;
    const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
    if (usoAtual + valor > total) {
      return { ok: false, mensagemErro: `Energia insuficiente para ${rotuloAcao || 'esta ação'}.` };
    }
    return {
      ok: true,
      patch: { energia_usada_mes: usoAtual + valor, energia: Math.max(0, total - (usoAtual + valor)) },
    };
  }

  // Jogador já configurou os 6 baldes: checa só o balde da categoria.
  const alocado = j.energia_alocada[categoria] || 0;
  const usado = (j.energia_usada || window.categoriaEnergiaVazia())[categoria] || 0;
  if (usado + valor > alocado) {
    return {
      ok: false,
      mensagemErro: `Energia de ${categoria} insuficiente para ${rotuloAcao || 'esta ação'} (${usado}/${alocado}).`,
    };
  }
  const novoUsado = { ...(j.energia_usada || window.categoriaEnergiaVazia()) };
  novoUsado[categoria] = usado + valor;
  return { ok: true, patch: { energia_usada: novoUsado } };
};

/** Energia disponível numa categoria, pra exibir na UI (habilitar/desabilitar botão, mostrar barra). Cai pro pool único legado se a conta não tiver configurado os baldes. */
window.energiaDisponivelCategoria = function(j, categoria) {
  if (!j) return 0;
  if (!j.energia_alocada) {
    const usoAtual = j.energia_usada_mes || 0;
    const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
    return Math.max(0, total - usoAtual);
  }
  const alocado = j.energia_alocada[categoria] || 0;
  const usado = (j.energia_usada || window.categoriaEnergiaVazia())[categoria] || 0;
  return Math.max(0, alocado - usado);
};

/**
 * GDD v6.0 §7.4 — "Supervisão do Sócio": espelho frontend de
 * functions/energia_categorias.js::calcularModSupervisaoSocio, só pra
 * mostrar o multiplicador atual na tela de Energia (o cálculo que vale de
 * verdade roda no backend, em avancar_mes.js).
 */
window.calcularModSupervisaoSocio = function(j) {
  if (!j || !j.energia_alocada) return 1.0;
  const alocado = j.energia_alocada.supervisao || 0;
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const tetoReferencia = total * 0.2;
  const pct = tetoReferencia > 0 ? Math.min(1, alocado / tetoReferencia) : 0;
  return Math.min(1.15, 0.85 + pct * 0.30);
};

/** Devolve energia gasta (ex: docência energiza). Sempre floor em 0. */
window.creditarEnergiaCategoriaPatch = function(j, categoria, valor) {
  if (!j.energia_alocada) {
    const usoAtual = j.energia_usada_mes || 0;
    const novoUso = Math.max(0, usoAtual - valor);
    const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
    return { energia_usada_mes: novoUso, energia: Math.max(0, total - novoUso) };
  }
  const usado = (j.energia_usada || window.categoriaEnergiaVazia())[categoria] || 0;
  const novoUsado = { ...(j.energia_usada || window.categoriaEnergiaVazia()) };
  novoUsado[categoria] = Math.max(0, usado - valor);
  return { energia_usada: novoUsado };
};
