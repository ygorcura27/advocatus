'use strict';

/**
 * Suite node:test pra Regras de Captação (GDD v6.0 §1.2).
 * Rodar: node --test functions/test/regras_captacao.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { regraPadrao, filtrarOportunidadesElegiveis } = require('../regras_captacao');

const OPS = [
  { id: 'a', tipo: 'consulta', valor: 500 },
  { id: 'b', tipo: 'parecer', valor: 2000 },
  { id: 'c', tipo: 'cobranca', valor: 800 },
];

test('regra inativa (padrão): retorna tudo, comportamento legado cego', () => {
  assert.deepEqual(filtrarOportunidadesElegiveis(OPS, regraPadrao()), OPS);
  assert.deepEqual(filtrarOportunidadesElegiveis(OPS, null), OPS);
  assert.deepEqual(filtrarOportunidadesElegiveis(OPS, undefined), OPS);
});

test('regra ativa com tipos vazio: só valor mínimo filtra', () => {
  const r = { ativo: true, tipos: [], valor_minimo: 1000 };
  const out = filtrarOportunidadesElegiveis(OPS, r);
  assert.deepEqual(out.map(o => o.id), ['b']);
});

test('regra ativa com tipos específicos: só bate tipo E valor', () => {
  const r = { ativo: true, tipos: ['consulta', 'cobranca'], valor_minimo: 600 };
  const out = filtrarOportunidadesElegiveis(OPS, r);
  assert.deepEqual(out.map(o => o.id), ['c']); // consulta(500) fica de fora pelo valor
});

test('regra ativa sem valor_minimo (0): só filtra por tipo', () => {
  const r = { ativo: true, tipos: ['parecer'] };
  const out = filtrarOportunidadesElegiveis(OPS, r);
  assert.deepEqual(out.map(o => o.id), ['b']);
});
