'use strict';

/**
 * GDD v5.3 Parte III §4 — pool de traços do advogado NPC e derivação da
 * `politica` numérica (4 eixos: agressividade, meticulosidade, apetite_acordo,
 * vaidade), usada pelas 4 funções de decisão da Parte V.
 *
 * ADAPTER: este é o pool referenciado no GDD (mesmo espírito dos traços já
 * usados no sistema de dinâmica de equipe / funcionários do projeto). Se o
 * seu POOL_TRACOS_EXISTENTE tiver nomes diferentes ou traços adicionais,
 * é seguro estender PESO_TRACO abaixo — qualquer traço sem entrada aqui é
 * ignorado silenciosamente por derivarPolitica() (não quebra o seed, só não
 * influencia a política daquele traço específico). Recomendo reconciliar
 * este pool com o seu antes de rodar o seed em produção, para os advogados
 * adversos "conversarem" com o mesmo vocabulário de traços do resto do jogo.
 */
const POOL_TRACOS_ADVOGADO = Object.freeze([
  'agressivo',
  'meticuloso',
  'cauteloso',
  'mercenario',
  'vaidoso',
  'leal',
  'rancoroso',
  'perfeccionista',
  'preguicoso',
  'ambicioso',
]);

// eixos: ag = agressividade, me = meticulosidade, ac = apetite_acordo, va = vaidade
const PESO_TRACO = Object.freeze({
  agressivo: { ag: 0.30, me: -0.10, ac: -0.20, va: 0.05 },
  meticuloso: { ag: -0.05, me: 0.35, ac: 0.00, va: 0.00 },
  cauteloso: { ag: -0.20, me: 0.15, ac: 0.20, va: -0.05 },
  mercenario: { ag: 0.05, me: -0.05, ac: 0.25, va: 0.00 },
  vaidoso: { ag: 0.10, me: 0.00, ac: -0.15, va: 0.35 },
  leal: { ag: 0.00, me: 0.10, ac: -0.05, va: -0.05 },
  rancoroso: { ag: 0.15, me: 0.00, ac: -0.25, va: 0.10 },
  perfeccionista: { ag: -0.05, me: 0.30, ac: -0.05, va: 0.10 },
  preguicoso: { ag: 0.00, me: -0.30, ac: 0.30, va: -0.10 },
  ambicioso: { ag: 0.15, me: 0.05, ac: -0.10, va: 0.15 },
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Converte um array de traços na política numérica de 4 eixos.
 * Chamada 1x na criação do NPC (seed ou reposição) e cacheada em
 * /perfis/{id}/privado/npc — só recalculada se os traços do NPC mudarem
 * por evento (ex.: um evento de RH que altere personalidade, se existir).
 */
function derivarPolitica(tracos) {
  const base = { agressividade: 0.5, meticulosidade: 0.5, apetite_acordo: 0.5, vaidade: 0.3 };

  for (const traco of tracos) {
    const peso = PESO_TRACO[traco];
    if (!peso) continue; // traço fora do pool conhecido — ignorado, não quebra o seed
    base.agressividade += peso.ag;
    base.meticulosidade += peso.me;
    base.apetite_acordo += peso.ac;
    base.vaidade += peso.va;
  }

  for (const eixo of Object.keys(base)) {
    base[eixo] = clamp(base[eixo], 0.05, 0.95);
  }
  return base;
}

module.exports = { POOL_TRACOS_ADVOGADO, PESO_TRACO, derivarPolitica, clamp };
