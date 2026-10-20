'use strict';

const { bonusEnergiaConstituicao } = require('./atributos');

/**
 * ENERGIA POR CATEGORIA — GDD v6.0 §3.1, decisão "B" (reforma completa).
 *
 * Substitui o pool único `energia_usada_mes` por 6 baldes reais que o
 * jogador aloca via slider (tela real ainda a construir em js/ui-main.js):
 * Processos Estratégicos, Supervisão da Carteira, Estudo, Gestão/Captação,
 * Vida Pessoal, Descanso.
 *
 * Escala continua em pontos (0-100+bônus, mesma de sempre) e NÃO migra pro
 * literal 200-260h do GDD — essa conversão de unidade forçaria retunar ~35
 * custos de energia já calibrados em todo o jogo. Constituição (§4.4) já é
 * real agora (functions/atributos.js) — dá um bônus de PONTOS nessa mesma
 * escala (calcularEnergiaTotal abaixo), não uma migração de unidade.
 *
 * MIGRAÇÃO SEM QUEBRAR CONTAS ANTIGAS: enquanto o jogador não tiver
 * `energia_alocada` definido (ele só existe depois que a tela nova salva
 * pelo menos uma vez), `debitarEnergiaCategoria` cai pro comportamento
 * legado — debita direto de `energia_usada_mes`, sem checar categoria. Só
 * depois que o jogador mexe nos sliders (grava `energia_alocada`) é que a
 * checagem por categoria passa a valer pra ele.
 */

const CATEGORIAS = ['processos', 'supervisao', 'estudo', 'captacao', 'pessoal', 'descanso'];

const ENERGIA_TOTAL = 100;

function categoriasVazias() {
  return { processos: 0, supervisao: 0, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 };
}

/** Porta de js/relacionamento_dados.js::bonusEnergiaDisposicao — Cloud Functions não tinham acesso a essa fórmula (window.*), cada uma usava um teto fixo diferente. */
function bonusEnergiaDisposicao(disposicao) {
  const d = disposicao ?? 80;
  if (d >= 80) return 10;
  if (d >= 50) return 0;
  if (d >= 20) return -10;
  return -20;
}

/** Porta de js/relacionamento_dados.js::getEnergiaTotal — mesma fórmula, agora disponível no backend, + bônus de Constituição (GDD v6.0 §4.4). */
function calcularEnergiaTotal(j) {
  if (!j) return ENERGIA_TOTAL;
  const bonus = j.academia_ativa ? (j.academia_bonus_energia || 0) : 0;
  const dispBonus = bonusEnergiaDisposicao(j.disposicao);
  const pen = j.penalidade_energia_val || 0;
  const bonusConstituicao = bonusEnergiaConstituicao(j);
  return Math.max(10, ENERGIA_TOTAL + bonus + dispBonus + bonusConstituicao - pen);
}

/**
 * Checa e retorna o patch de update pra debitar `valor` de energia da
 * categoria `categoria` do jogador `j` (doc já lido, não faz leitura aqui).
 * Lança HttpsError('resource-exhausted', ...) se não couber.
 *
 * Uso: const patch = debitarEnergiaCategoria(j, 'estudo', ENERGIA_AULA, 'Frequentar aula');
 *      Object.assign(updates, patch); // depois um único jRef.update(updates)
 */
function debitarEnergiaCategoria(j, categoria, valor, rotuloAcao) {
  const { HttpsError } = require('firebase-functions/v2/https');

  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }

  // Pote único: toda ação gasta da mesma energia mensal. A categoria só
  // fica registrada em `energia_usada` (estatística e descanso/vida pessoal
  // no cálculo de estresse) — não existe mais teto por categoria.
  const gasto = energiaGastaMes(j);
  const total = calcularEnergiaTotal(j);
  if (gasto + valor > total) {
    throw new HttpsError('resource-exhausted', `Energia insuficiente para ${rotuloAcao || 'esta ação'} (${Math.max(0, total - gasto)}/${valor}).`);
  }
  return patchUso(j, categoria, valor, total);
}

/** Energia já gasta no mês. Lê os dois registros (pool legado e baldes) e fica com o maior, para contas de qualquer época. */
function energiaGastaMes(j) {
  if (!j) return 0;
  const somaCategorias = Object.values(j.energia_usada || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return Math.max(Number(j.energia_usada_mes) || 0, somaCategorias);
}

function patchUso(j, categoria, delta, total) {
  const usado = { ...categoriasVazias(), ...(j.energia_usada || {}) };
  usado[categoria] = Math.max(0, (usado[categoria] || 0) + delta);
  const gasto = Math.max(0, energiaGastaMes(j) + delta);
  return { energia_usada: usado, energia_usada_mes: gasto, energia: Math.max(0, total - gasto) };
}

/**
 * Devolve `valor` de energia gasta na categoria (ex: darAula devolvendo o
 * custo de comparecer_aula — "docência energiza", GDD). Floor em 0.
 */
function creditarEnergiaCategoria(j, categoria, valor) {
  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }
  const atual = (j.energia_usada || {})[categoria] || 0;
  return patchUso(j, categoria, -Math.min(valor, Math.max(atual, energiaGastaMes(j))), calcularEnergiaTotal(j));
}

/**
 * GDD v6.0 §7.4 — "Supervisão do Sócio": horas do dono alocadas na
 * categoria Supervisão multiplicam a produção de TODA a carteira automática
 * (NPCs do pool), 0,85x a 1,15x. Lê a ALOCAÇÃO (o compromisso de horas),
 * não o uso/restante — gastar ações pontuais de coordenar/designar/mediar
 * dentro desse mesmo balde não devia punir o multiplicador; a tensão do
 * GDD é "advogar vs. administrar" (alocar em supervisão vs. outras
 * categorias), não "usar vs. não usar" dentro da categoria já escolhida.
 *
 * Conta legado (sem `energia_alocada`) não sofre efeito nenhum (1.0,
 * neutro) até configurar os baldes — mesmo princípio de migração sem
 * quebra do resto deste módulo.
 *
 * Teto de referência: mockup usava 40h de um total de ~200h no GDD literal
 * (20%) — aqui é proporcional ao teto real em pontos (calcularEnergiaTotal),
 * não o número "40" copiado, já que a escala de energia deste jogo ficou em
 * pontos 0-100+bônus (decisão de não migrar unidade pro literal do GDD).
 */
function calcularModSupervisaoSocio(j) {
  // Com o pote único de energia não há mais alocação em Supervisão: neutro.
  return 1.0;
}

/** Reset mensal — chamado por avancar_mes.js e tick_mensal.js. Zera uso, mantém a alocação (sliders) que o jogador já tinha configurado. */
function resetEnergiaMensal(j) {
  return { energia: calcularEnergiaTotal(j), energia_usada_mes: 0, energia_usada: categoriasVazias() };
}

module.exports = {
  CATEGORIAS,
  ENERGIA_TOTAL,
  categoriasVazias,
  calcularEnergiaTotal,
  debitarEnergiaCategoria,
  creditarEnergiaCategoria,
  resetEnergiaMensal,
  energiaGastaMes,
  calcularModSupervisaoSocio,
};
