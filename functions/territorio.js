'use strict';

/**
 * TERRITÓRIO — GDD v6.0 §8. Reputação por comarca (0-100), "cresce com
 * vitórias locais" — endgame territorial (Brasília = STJ/STF, mercado mais
 * caro/estressante/prestigiado).
 *
 * Comarcas reais: `js/escritorios_npc.js::COMARCAS` (rio, sao_paulo,
 * brasilia, petropolis, volta_redonda) — catálogo de escritórios NPC
 * pequeno mas real em cada uma (não é decoração: dá pra trabalhar lá de
 * verdade, tem vagas reais).
 *
 * `comarcaAtual(j)` lê `j.escritorio_comarca` (gravado no momento da
 * contratação, js/vagas.js) — jogadores donos do próprio escritório
 * (`escritorio_proprio_id`) sempre caem em 'rio' porque a criação de
 * escritório próprio (functions/criar_escritorio.js) só aceita bairros do
 * Rio hoje — "abrir filial em outra comarca" (GDD, forma de expandir)
 * ainda não existe, fora de escopo desta passada (jogador só tem UM
 * escritório próprio, campo singular, não uma lista).
 *
 * Delta de reputação por comarca espelha o MESMO delta da reputação
 * global do jogador no momento da resolução do caso (positivo em vitória,
 * negativo em derrota) — decisão de design: o GDD só diz "cresce com
 * vitórias", não formaliza se derrota reduz; tratar simetricamente evita
 * inventar uma segunda fórmula só pra reputação local.
 */

function comarcaAtual(j) {
  return j?.escritorio_comarca || 'rio';
}

/** Retorna o objeto `reputacao_comarcas` atualizado — nunca muta o original. */
function aplicarDeltaRepComarca(reputacaoComarcas, comarca, delta) {
  const atual = (reputacaoComarcas || {})[comarca] || 0;
  return { ...(reputacaoComarcas || {}), [comarca]: Math.max(0, Math.min(100, atual + delta)) };
}

module.exports = {
  comarcaAtual,
  aplicarDeltaRepComarca,
};
