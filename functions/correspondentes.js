'use strict';

/**
 * CORRESPONDENTES — GDD v6.0 §7.5. B2B: contratar presença numa comarca
 * sem presença própria, sem abrir filial. Decisão híbrida (usuário
 * escolheu): correspondente pode ser um escritório NPC "flagship" do
 * catálogo da comarca (sempre disponível, js/escritorios_npc.js::
 * CORRESPONDENTE_NPC_POR_COMARCA) OU outro jogador que ofereça
 * correspondência lá (esc.oferece_correspondencia) — hoje esse 2º caminho
 * nasce vazio porque ninguém tem escritório fora do Rio ainda
 * (criarEscritorio só aceita bairros do Rio; "abrir filial" é feature
 * separada não construída) — a estrutura já fica pronta pra quando existir.
 *
 * Efeito mensal: trickle de reputação na comarca (não precisa de "captar
 * caso lá" — esse gancho não existe, processos do jogador não têm comarca
 * própria hoje) + custo fixo mensal, debitado do caixa do escritório
 * contratante. Se tipo='jogador', o custo é creditado no caixa do
 * escritório correspondente (receita real pro outro jogador); se
 * tipo='npc', o custo só é um sink (sem destino, igual outras despesas
 * fixas do jogo).
 */

const TRICKLE_REP_MENSAL = 2;
const { aplicarDeltaRepComarca } = require('./territorio');

/**
 * Processa 1 mês de 1 contrato. Retorna null se o caixa não cobre o custo
 * (contrato cai). `caixaAtual` é do escritório CONTRATANTE (paga a conta);
 * `reputacaoComarcasAtual` é do JOGADOR dono desse escritório (dono é quem
 * ganha reputação territorial, não o escritório).
 */
function processarContratoMensal(caixaAtual, contrato, reputacaoComarcasAtual) {
  const custo = contrato.valor_mensal || 0;
  if ((caixaAtual || 0) < custo) return null;

  return {
    caixaNovo: (caixaAtual || 0) - custo,
    reputacaoComarcasNova: aplicarDeltaRepComarca(reputacaoComarcasAtual, contrato.comarca, TRICKLE_REP_MENSAL),
    creditoParaCorrespondente: contrato.tipo === 'jogador' ? custo : 0,
  };
}

module.exports = {
  TRICKLE_REP_MENSAL,
  processarContratoMensal,
};
