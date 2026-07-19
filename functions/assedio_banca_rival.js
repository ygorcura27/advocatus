'use strict';

/**
 * ASSÉDIO DE BANCA RIVAL — GDD v6.0 §7.2. Churn de funcionário-NPC por
 * satisfação baixa: uma banca rival oferece mais e o NPC pode sair.
 *
 * Constrói em cima da infra de turnover já real
 * (functions/avancar_mes.js::_verificarTurnoverNPCsCF, gatilho por
 * `estresse`) — este é um gatilho NOVO e independente, por
 * `reputacao_interna` baixa (satisfação com a cultura/tratamento do
 * escritório, não estresse físico/mental). Mesmo padrão de "aviso antes de
 * sair" (2 meses de sinal antes de disparar, dá tempo do jogador reagir).
 *
 * NÃO inclui "contraproposta salarial" como override permanente de salário
 * por NPC — isso exigiria adicionar um novo grau de liberdade ao modelo de
 * dados de equipe (hoje salário é só uma tabela fixa por cargo,
 * `CARGO_INFO`, sem override por indivíduo — confirmado grep, zero
 * resultado). Em vez disso, a contraproposta é um custo único (bônus de
 * retenção pago do caixa do escritório) que reseta o contador e recupera
 * reputação interna — real, testável, sem inventar payroll por NPC.
 *
 * "Investir em prestígio do escritório" (2º botão do mockup) ficou de fora
 * — efeito seria vago demais sem uma métrica de prestígio de escritório já
 * real pra amarrar (existe prestígio do JOGADOR, não do escritório).
 */

const MESES_ATE_DISPARAR = 2;
const REPUTACAO_INTERNA_RISCO = 25;

// Pool local de nomes de banca — não usa o catálogo real de 90 escritórios
// (js/escritorios_npc.js), que é browser-only e não tem cópia no backend
// (confirmado: functions/npc_escritorios_empregadores.js só valida
// tier a partir do formato do ID, nunca duplicou os nomes reais). Aqui é
// puro flavor narrativo — o NPC simplesmente deixa de existir no roster do
// jogador, não "migra" pra um documento de escritório real.
const SOBRENOMES_BANCA = [
  'Andrade', 'Barbosa', 'Cavalcanti', 'Drummond', 'Esteves', 'Ferraz',
  'Guimarães', 'Homem de Mello', 'Junqueira', 'Lacerda', 'Malta', 'Nogueira',
  'Ortiz', 'Pacheco', 'Queiroga', 'Ribas', 'Sarmento', 'Teles', 'Uchôa', 'Vilela',
];

function gerarOfertaRival() {
  const a = SOBRENOMES_BANCA[Math.floor(Math.random() * SOBRENOMES_BANCA.length)];
  let b = SOBRENOMES_BANCA[Math.floor(Math.random() * SOBRENOMES_BANCA.length)];
  while (b === a) b = SOBRENOMES_BANCA[Math.floor(Math.random() * SOBRENOMES_BANCA.length)];
  const oferta_mult = 1.15 + Math.random() * 0.20; // 1.15x-1.35x
  return { nome: `${a} & ${b} Advogados`, oferta_mult: Math.round(oferta_mult * 100) / 100 };
}

/** NPC ativo, sem assédio já pendente, com reputação interna em risco. */
function elegivelParaAssedio(f) {
  return f.tipo === 'npc' && f.ativo !== false && !f.assedio_pendente
    && (f.reputacao_interna ?? 50) <= REPUTACAO_INTERNA_RISCO;
}

module.exports = {
  MESES_ATE_DISPARAR,
  REPUTACAO_INTERNA_RISCO,
  gerarOfertaRival,
  elegivelParaAssedio,
};
