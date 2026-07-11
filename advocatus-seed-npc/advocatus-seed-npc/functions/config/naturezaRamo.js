'use strict';

/**
 * GDD v5.3 §2 — fonte de verdade para a NATUREZA do ramo (adversarial vs.
 * contra Estado). Correção #38 da revisão crítica: esta tabela é a fonte
 * de verdade SÓ para esta classificação — adicionar um ramo novo ainda
 * exige tocar seed (seedAdvogadosNPC.js), POOL_TESES, TIPOS_PETICAO_ESSENCIAIS
 * (seedCatalogoInicial.js), matchmaking (áreas de atuação) e stats por ramo.
 */
const NATUREZA_POR_RAMO = Object.freeze({
  civil: 'adversarial',
  employment: 'adversarial',
  empresarial: 'adversarial',
  tax: 'contra_estado',
  criminal: 'contra_estado',
});

function naturezaDoRamo(ramo) {
  const natureza = NATUREZA_POR_RAMO[ramo];
  if (!natureza) {
    throw new Error(`Ramo desconhecido em NATUREZA_POR_RAMO: "${ramo}"`);
  }
  return natureza;
}

module.exports = { NATUREZA_POR_RAMO, naturezaDoRamo };
