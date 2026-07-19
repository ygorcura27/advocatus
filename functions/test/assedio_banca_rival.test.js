'use strict';

/**
 * Suite node:test pra Assédio de Banca Rival (GDD v6.0 §7.2).
 * Rodar: node --test functions/test/assedio_banca_rival.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { gerarOfertaRival, elegivelParaAssedio, REPUTACAO_INTERNA_RISCO } = require('../assedio_banca_rival');

test('gerarOfertaRival: nome com 2 sobrenomes distintos, oferta entre 1.15x-1.35x', () => {
  for (let i = 0; i < 30; i++) {
    const o = gerarOfertaRival();
    assert.match(o.nome, /^\w[\w çãáéêôíõ]* & \w[\w çãáéêôíõ]* Advogados$/i);
    const [a, b] = o.nome.replace(' Advogados', '').split(' & ');
    assert.notEqual(a, b);
    assert.ok(o.oferta_mult >= 1.15 && o.oferta_mult <= 1.35);
  }
});

test('elegivelParaAssedio: NPC com reputação interna baixa e sem assédio pendente é elegível', () => {
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: true, reputacao_interna: 20 }), true);
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: true, reputacao_interna: REPUTACAO_INTERNA_RISCO }), true);
});

test('elegivelParaAssedio: reputação acima do risco não é elegível', () => {
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: true, reputacao_interna: 26 }), false);
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: true }), false); // default 50
});

test('elegivelParaAssedio: já com assédio pendente, inativo, ou jogador (não NPC) não é elegível', () => {
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: true, reputacao_interna: 10, assedio_pendente: { nome: 'X' } }), false);
  assert.equal(elegivelParaAssedio({ tipo: 'npc', ativo: false, reputacao_interna: 10 }), false);
  assert.equal(elegivelParaAssedio({ tipo: 'jogador', ativo: true, reputacao_interna: 10 }), false);
});
