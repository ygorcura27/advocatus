'use strict';

/**
 * CATÁLOGO DE PODCASTS / APARIÇÕES NA INTERNET — Advocatus Online (GDD v5.1)
 * 7 áreas jurídicas (mesma taxonomia de functions/peticoes.js) × 5 tiers cada.
 * Tier 1 = menos popular/exigente, Tier 5 = mais popular/exigente.
 */

const AREA_LABELS_CURTO = {
  employment:  'Trabalhista',
  tax:         'Tributário',
  civil:       'Cível',
  criminal:    'Criminal',
  corporate:   'Empresarial',
  immigration: 'Imigração',
  bankruptcy:  'Recuperação Jud.',
};

// Requisitos mínimos por tier (comunicacao_midiatica / reputacao, ambos 0-100
// para reputação e 0-50 para a skill — reputação normalizada em % no cálculo).
const REQ_POR_TIER = {
  1: { req_comunicacao: 10, req_reputacao: 15 },
  2: { req_comunicacao: 20, req_reputacao: 30 },
  3: { req_comunicacao: 30, req_reputacao: 45 },
  4: { req_comunicacao: 38, req_reputacao: 60 },
  5: { req_comunicacao: 45, req_reputacao: 75 },
};

// Audiência-base por tier (mesma escala do exemplo do usuário: 5mil → 4mi)
const AUDIENCIA_POR_TIER = { 1: 5000, 2: 40000, 3: 400000, 4: 1000000, 5: 4000000 };

const NOMES_POR_AREA = {
  employment: ['Trampo Legal Talks', 'RH & Direito Cast', 'Trabalhista em Pauta', 'Flow Trabalhista', 'Jornal do Trabalho Nacional'],
  tax:        ['Fisco Café', 'Impostômetro Cast', 'Tributário em Foco', 'Flow Tributário', 'Economia & Direito Nacional'],
  civil:      ['Direito Civil Descomplicado', 'Cível em Pauta', 'Justiça Cível Cast', 'Flow Cível', 'TV Justiça Nacional'],
  criminal:   ['Criminologia Cast', 'Direito Penal na Prática', 'Crime em Pauta', 'Flow Criminal', 'Crime & Justiça Nacional'],
  corporate:  ['Startup Jurídico Cast', 'Compliance em Foco', 'Empresarial na Prática', 'Flow Empresarial', 'Mercado & Direito Nacional'],
  immigration:['Migra Cast', 'Direito Migratório Hoje', 'Fronteiras Jurídicas', 'Flow Imigração', 'TV Global — Imigração'],
  bankruptcy: ['Recupera Cast', 'Falências em Pauta', 'Direito Concursal Cast', 'Flow Recuperação Judicial', 'TV Economia Nacional'],
};

const AREAS = Object.keys(AREA_LABELS_CURTO);

/** Gera o catálogo completo (7 áreas × 5 tiers = 35 podcasts) com id estável. */
function gerarCatalogoPodcasts() {
  const catalogo = [];
  for (const area of AREAS) {
    for (let tier = 1; tier <= 5; tier++) {
      const nome = NOMES_POR_AREA[area][tier - 1];
      catalogo.push({
        id: `${area}_t${tier}`,
        area,
        area_label: AREA_LABELS_CURTO[area],
        tier,
        nome,
        audiencia_base: AUDIENCIA_POR_TIER[tier],
        ...REQ_POR_TIER[tier],
      });
    }
  }
  return catalogo;
}

const CATALOGO_PODCASTS = gerarCatalogoPodcasts();

function getPodcastPorId(id) {
  return CATALOGO_PODCASTS.find(p => p.id === id) || null;
}

module.exports = {
  AREAS,
  AREA_LABELS_CURTO,
  CATALOGO_PODCASTS,
  getPodcastPorId,
};
