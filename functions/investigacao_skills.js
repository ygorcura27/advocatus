'use strict';

/**
 * SKILLS DO LOOP DE INVESTIGAÇÃO/FAVORES/JULGAMENTO — GDD addendum v1.0, Parte VII.
 *
 * Mesma escala universal 0–50 (estrelas de 10 em 10) já usada em skills_jur.
 * Bônus contínuos seguem a curva de diminishing returns já validada:
 *   bonus = k × √(skill / 50)
 * Bônus "em degrau" (ex.: só ativa a partir de 3★) usam estrelaDe(skill) e
 * checagens explícitas de tier, em vez da curva contínua.
 *
 * Constantes marcadas `// calibrar` são as "pendências de calibração" da
 * Parte VIII do addendum — valores de exemplo validados só na demo, não em
 * simulação numérica. Ajustar aqui sem precisar tocar em investigacao.js.
 */

// ─── Utilitário de estrelas ──────────────────────────────────────────────

/** Converte skill 0–50 em estrelas 0–5 (10 pontos por estrela). */
function estrelaDe(skill) {
  return Math.floor(Math.max(0, Math.min(50, skill)) / 10);
}

// ─── k por skill (bônus máximo em 5★, Parte VII) ─────────────────────────

const K_ORATORIA           = 12;  // calibrar — +pts na chance de defesa no julgamento
const K_PERSUASAO          = 20;  // calibrar — +pts de confiança efetiva ao pedir favor
const K_PESQUISA_JURIDICA  = 2;   // calibrar — +bônus de tese no Vade Mecum
const K_DIREITO_PROCESSUAL = 4;   // calibrar — -pts no limiar de vitória
const K_ANALISE_FORENSE    = 3;   // calibrar — +força obtida ao errar campo/detalhe
const K_DISCRICAO_EXPOSICAO   = 25;   // calibrar — -pts no risco de exposição de peça suja
const K_DISCRICAO_VELOCIDADE  = 0.40; // calibrar — até -40% na velocidade da investigação adversária

function bonusContinuo(skill, k) {
  return k * Math.sqrt(Math.max(0, Math.min(50, skill)) / 50);
}

/** Oratória: bônus na chance de defesa no julgamento (%pts) e no tom Pressionar. */
function bonusOratoria(skill) {
  return bonusContinuo(skill, K_ORATORIA);
}

/** Persuasão: bônus de confiança efetiva ao pedir favor (%pts) e no tom Empatia. */
function bonusPersuasao(skill) {
  return bonusContinuo(skill, K_PERSUASAO);
}

/** Pesquisa Jurídica: bônus de limiar ao aplicar tese correta no Vade Mecum. */
function bonusPesquisaJuridica(skill) {
  return bonusContinuo(skill, K_PESQUISA_JURIDICA);
}

/** Pesquisa Jurídica ≥3★: perdoa o turno extra perdido ao aplicar tese errada. */
function perdoaTurnoTeseErrada(skill) {
  return estrelaDe(skill) >= 3;
}

/** Direito Processual: redução do limiar de vitória no julgamento. */
function reducaoLimiarDireitoProcessual(skill) {
  return bonusContinuo(skill, K_DIREITO_PROCESSUAL);
}

/**
 * Análise Forense: reduz a penalidade de escolher o campo/detalhe errado.
 * Sem a skill, o erro ainda rende força mínima (base); em 5★, a penalidade
 * cai a quase metade da diferença para o acerto.
 */
function forcaAoErrar(forcaBase, forcaCerta, skill) {
  const bonus = bonusContinuo(skill, K_ANALISE_FORENSE);
  return Math.min(forcaCerta, forcaBase + bonus);
}

/**
 * Perfil Comportamental: pista visual da declaração evasiva a partir de 3★;
 * usos de Intuição por caso = 1 base + 1 a cada 2★ atingidas.
 */
function temPistaEvasiva(skill) {
  return estrelaDe(skill) >= 3;
}

function usosIntuicaoPorCaso(skill) {
  return 1 + Math.floor(estrelaDe(skill) / 2);
}

/** Discrição: redução do risco de exposição de peça suja (pts) no julgamento. */
function reducaoRiscoExposicao(skill) {
  return bonusContinuo(skill, K_DISCRICAO_EXPOSICAO);
}

/** Discrição: redução percentual (0–1) na velocidade da investigação adversária. */
function reducaoVelocidadeAdversaria(skill) {
  return (K_DISCRICAO_VELOCIDADE) * Math.sqrt(Math.max(0, Math.min(50, skill)) / 50);
}

/** Gestão de Tempo ≥3★: ações diretas (consulta/entrevista/perícia/análise) custam -1 turno (mínimo 1). */
function descontoGestaoTempo(custoBase, skill) {
  if (estrelaDe(skill) < 3) return custoBase;
  return Math.max(1, custoBase - 1);
}

module.exports = {
  estrelaDe,
  bonusContinuo,
  bonusOratoria,
  bonusPersuasao,
  bonusPesquisaJuridica,
  perdoaTurnoTeseErrada,
  reducaoLimiarDireitoProcessual,
  forcaAoErrar,
  temPistaEvasiva,
  usosIntuicaoPorCaso,
  reducaoRiscoExposicao,
  reducaoVelocidadeAdversaria,
  descontoGestaoTempo,
  // constantes (para testes/ajuste)
  K_ORATORIA, K_PERSUASAO, K_PESQUISA_JURIDICA, K_DIREITO_PROCESSUAL,
  K_ANALISE_FORENSE, K_DISCRICAO_EXPOSICAO, K_DISCRICAO_VELOCIDADE,
};
