'use strict';

/**
 * Suite node:test pra Território (GDD v6.0 §8).
 * Rodar: node --test functions/test/territorio.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { comarcaAtual, aplicarDeltaRepComarca } = require('../territorio');

test('comarcaAtual: sem escritorio_comarca, default rio', () => {
  assert.equal(comarcaAtual(null), 'rio');
  assert.equal(comarcaAtual({}), 'rio');
});

test('comarcaAtual: usa escritorio_comarca quando presente', () => {
  assert.equal(comarcaAtual({ escritorio_comarca: 'sao_paulo' }), 'sao_paulo');
});

test('aplicarDeltaRepComarca: cria a comarca do zero se ainda não existir', () => {
  const out = aplicarDeltaRepComarca(null, 'rio', 5);
  assert.deepEqual(out, { rio: 5 });
});

test('aplicarDeltaRepComarca: soma ao valor existente, não mexe nas outras comarcas', () => {
  const out = aplicarDeltaRepComarca({ rio: 60, sao_paulo: 10 }, 'rio', 5);
  assert.deepEqual(out, { rio: 65, sao_paulo: 10 });
});

test('aplicarDeltaRepComarca: clampa 0-100', () => {
  assert.deepEqual(aplicarDeltaRepComarca({ rio: 98 }, 'rio', 10), { rio: 100 });
  assert.deepEqual(aplicarDeltaRepComarca({ rio: 3 }, 'rio', -10), { rio: 0 });
});

test('aplicarDeltaRepComarca: nunca muta o objeto original', () => {
  const original = { rio: 50 };
  aplicarDeltaRepComarca(original, 'rio', 10);
  assert.deepEqual(original, { rio: 50 });
});
