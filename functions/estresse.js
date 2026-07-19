'use strict';

/**
 * ESTRESSE & FÔLEGO — GDD v6.0 §3.2/§3.3.
 *
 * Δestresse mensal (aplicado na fase "Pessoal" de avancar_mes.js) usa só os
 * termos do GDD que têm sinal real no jogo hoje. Termos fora de escopo,
 * documentados em vez de ignorados silenciosamente:
 *  - horaextra×0.5: não aplicável — energia é ponto-capped
 *    (debitarEnergiaCategoria já impede estourar o teto), não existe "hora
 *    extra" pra penalizar.
 *  - evento_negativo: o baralho de eventos do GDD (§ carta do mês) ainda é
 *    só mockup, sem hook real.
 *  - terapia ($, -5 estresse): ação paga ainda não existe no jogo real.
 *
 * Fôlego não vira um teto de "rodadas por sessão" (esse conceito não existe
 * na estrutura real do Julgamento — resolve peça por peça até esvaziar,
 * sem noção de sessão/dia) — em vez disso, aplica-se como o mesmo
 * multiplicador de nota (ver multiplicadorNota) direto na força final antes
 * da decisão de veredito. Mantém a fórmula do GDD (10-estresse/20) exposta
 * via calcularFolego só pra exibição na UI (HUD "🫁 Fôlego" do mockup).
 */

const ESTRESSE_MAX = 100;

function calcularFolego(estresse) {
  return Math.max(0, 10 - Math.floor((estresse || 0) / 20));
}

// Faixas do GDD: 0-39 normal · 40-69 -5% nota · 70-89 e 90-100 -12% nota
// (burnout já corta a ação antes de chegar aqui na maioria dos casos, mas o
// multiplicador continua valendo pros períodos de transição).
function multiplicadorNota(estresse) {
  const e = estresse || 0;
  if (e >= 70) return 0.88;
  if (e >= 40) return 0.95;
  return 1.0;
}

// -20% em ganho de estudo nas faixas 70+ (GDD).
function multiplicadorEstudo(estresse) {
  return (estresse || 0) >= 70 ? 0.8 : 1.0;
}

function emBurnoutPorEstresse(estresse) {
  return (estresse || 0) >= 90;
}

/**
 * Delta mensal de estresse. `derrotasNoMes` já vem contado (campo
 * `derrotas_mes`, incrementado em investigacao.js/processar_sentenca.js);
 * `horasDescanso`/`horasPessoal` vêm de `energia_usada.descanso`/`.pessoal`
 * (só existe pra quem já configurou os baldes — conta legado não desconta
 * nada aqui, incentivo a configurar); `teveRecesso` é o mês de Janeiro.
 */
function calcularDeltaEstresseMensal({ derrotasNoMes, horasDescanso, horasPessoal, teveRecesso }) {
  let delta = 0;
  delta += (derrotasNoMes || 0) * 5; // ponto médio do range 3-8 do GDD
  delta -= Math.floor((horasDescanso || 0) / 10);
  delta -= Math.floor((horasPessoal || 0) / 15);
  if (teveRecesso) delta -= 25;
  return delta;
}

function aplicarDeltaEstresse(estresseAtual, delta) {
  return Math.max(0, Math.min(ESTRESSE_MAX, (estresseAtual || 0) + delta));
}

module.exports = {
  ESTRESSE_MAX,
  calcularFolego,
  multiplicadorNota,
  multiplicadorEstudo,
  emBurnoutPorEstresse,
  calcularDeltaEstresseMensal,
  aplicarDeltaEstresse,
};
