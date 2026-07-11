'use strict';

/**
 * GDD v5.3 Parte III — geradores auxiliares para o seed de advogados NPC.
 *
 * ADAPTER: os pools de nomes e os nomes de skill abaixo são um ponto de
 * partida razoável, não o seu conteúdo definitivo. Troque livremente:
 *  - NOMES_PRIMEIROS / NOMES_SOBRENOMES por um gerador que já exista no
 *    projeto (ex.: reaproveitar o estilo dos 22 perfis de NPC de
 *    relacionamento, se fizer sentido ter "sabor" consistente).
 *  - As chaves de skill em ARQUETIPOS_ADVOGADO devem bater exatamente com
 *    os nomes internos do seu Character Sheet (v4.1/v5.1). Se usar
 *    camelCase em vez de snake_case, ou nomes diferentes, ajuste aqui.
 */

function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rndFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function sortear(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('sortear: array vazio ou inválido — não é possível sortear');
  }
  return arr[rndInt(0, arr.length - 1)];
}

function sortearSemRepeticao(arr, n) {
  const copia = [...arr];
  const resultado = [];
  for (let i = 0; i < n && copia.length > 0; i++) {
    const idx = rndInt(0, copia.length - 1);
    resultado.push(copia.splice(idx, 1)[0]);
  }
  return resultado;
}

function sortearTracos(poolTracos, n) {
  return sortearSemRepeticao(poolTracos, n);
}

function sortearAreas(poolAreas, n) {
  return sortearSemRepeticao(poolAreas, n);
}

// --- Nomes ---
const NOMES_PRIMEIROS = [
  'Ricardo', 'Fernanda', 'Marcelo', 'Juliana', 'Rodrigo', 'Camila', 'Eduardo',
  'Patrícia', 'André', 'Luciana', 'Felipe', 'Renata', 'Gustavo', 'Bianca',
  'Thiago', 'Carolina', 'Bruno', 'Vanessa', 'Diego', 'Larissa', 'Rafael',
  'Amanda', 'Leonardo', 'Débora', 'Vinícius', 'Priscila', 'Alexandre', 'Tatiane',
];
const NOMES_SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Dantas', 'Esteves', 'Ferraz', 'Guimarães',
  'Henriques', 'Junqueira', 'Lacerda', 'Marinho', 'Nogueira', 'Oliveira',
  'Pimentel', 'Queiroz', 'Ribas', 'Salgado', 'Teixeira', 'Uchôa', 'Vasconcelos',
];

function gerarNomeAdvogado() {
  return `${sortear(NOMES_PRIMEIROS)} ${sortear(NOMES_SOBRENOMES)}`;
}

// --- Skills por arquétipo de build ---
// Garante que NPCs tenham fraquezas exploráveis (GDD v5.3 §10, nota final)
// em vez de todos distribuírem pontos igualmente.
const ARQUETIPOS_ADVOGADO = Object.freeze({
  redator: { legal_drafting: 1.3, legal_research: 1.1, oral_advocacy: 0.6, networking: 0.7, procedure: 0.9 },
  oralista: { legal_drafting: 0.7, legal_research: 0.8, oral_advocacy: 1.4, networking: 1.0, procedure: 0.8 },
  generalista: { legal_drafting: 1.0, legal_research: 1.0, oral_advocacy: 1.0, networking: 1.0, procedure: 1.0 },
});

const ARQUETIPOS_INSTITUCIONAL = Object.freeze({
  procurador: { legal_drafting: 1.0, legal_research: 1.2, oral_advocacy: 1.0, networking: 0.5, procedure: 1.3 },
  promotor: { legal_drafting: 0.9, legal_research: 1.1, oral_advocacy: 1.2, networking: 0.5, procedure: 1.3 },
});

function clampSkill(v) {
  return Math.max(0, Math.min(50, Math.round(v)));
}

function gerarSkillsAdvogado(skillMin, skillMax, subtipo) {
  const dicionario = subtipo === 'advogado'
    ? ARQUETIPOS_ADVOGADO
    : { [subtipo]: ARQUETIPOS_INSTITUCIONAL[subtipo] || ARQUETIPOS_ADVOGADO.generalista };

  const nomeArquetipo = sortear(Object.keys(dicionario));
  const pesos = dicionario[nomeArquetipo];
  const media = rndFloat(skillMin, skillMax);

  const skills = {};
  for (const [skill, peso] of Object.entries(pesos)) {
    skills[skill] = clampSkill(media * peso + rndFloat(-2, 2));
  }
  return { skills, arquetipo: nomeArquetipo };
}

function mediaSkillsPrincipais(skills) {
  const valores = Object.values(skills || {});
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// ADAPTER: ajuste os nomes de estilo para o POOL real de estilo_escrita
// (v5.1 — inovadora / jurisprudencial / legalista / agressiva).
const ESTILOS_ESCRITA = Object.freeze(['inovadora', 'jurisprudencial', 'legalista', 'agressiva']);

function escolherEstiloNPCInicial() {
  return sortear(ESTILOS_ESCRITA);
}

module.exports = {
  rndInt, rndFloat, sortear, sortearSemRepeticao, sortearTracos, sortearAreas,
  gerarNomeAdvogado, gerarSkillsAdvogado, mediaSkillsPrincipais, escolherEstiloNPCInicial,
  ARQUETIPOS_ADVOGADO, ARQUETIPOS_INSTITUCIONAL, ESTILOS_ESCRITA,
};
