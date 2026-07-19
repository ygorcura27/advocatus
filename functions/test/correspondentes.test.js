'use strict';

/**
 * Suite node:test pra Correspondentes (GDD v6.0 §7.5).
 * Rodar: node --test functions/test/correspondentes.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { TRICKLE_REP_MENSAL, processarContratoMensal } = require('../correspondentes');

test('sem caixa suficiente: contrato cai (retorna null)', () => {
  const r = processarContratoMensal(500, { comarca: 'sao_paulo', valor_mensal: 3000, tipo: 'npc' }, {});
  assert.equal(r, null);
});

test('com caixa suficiente: debita custo, aplica trickle de reputação', () => {
  const r = processarContratoMensal(5000, { comarca: 'sao_paulo', valor_mensal: 3000, tipo: 'npc' }, {});
  assert.equal(r.caixaNovo, 2000);
  assert.deepEqual(r.reputacaoComarcasNova, { sao_paulo: TRICKLE_REP_MENSAL });
  assert.equal(r.creditoParaCorrespondente, 0);
});

test('correspondente tipo jogador: crédito vai pro correspondente, tipo npc não', () => {
  const rNpc = processarContratoMensal(5000, { comarca: 'brasilia', valor_mensal: 6000 - 1000, tipo: 'npc' }, {});
  assert.equal(rNpc.creditoParaCorrespondente, 0);
  const rJogador = processarContratoMensal(5000, { comarca: 'brasilia', valor_mensal: 4000, tipo: 'jogador' }, {});
  assert.equal(rJogador.creditoParaCorrespondente, 4000);
});

test('trickle soma em cima da reputação de comarca já existente, sem afetar outras', () => {
  const r = processarContratoMensal(5000, { comarca: 'petropolis', valor_mensal: 800, tipo: 'npc' }, { rio: 60, petropolis: 10 });
  assert.deepEqual(r.reputacaoComarcasNova, { rio: 60, petropolis: 12 });
});
