'use strict';

/**
 * Suite node:test pros Atributos RPG (GDD v6.0 §4.4).
 * Rodar: node --test functions/test/atributos.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ESCALA_BASE,
  atributosDefault,
  getAtributo,
  bonusEnergiaConstituicao,
  bonusTetoTeseRaciocinio,
} = require('../atributos');

test('atributosDefault: todos os 6 na base (11)', () => {
  const d = atributosDefault();
  assert.equal(Object.keys(d).length, 6);
  Object.values(d).forEach(v => assert.equal(v, ESCALA_BASE));
});

test('getAtributo: sem atributos salvos, cai na base — nunca falha', () => {
  assert.equal(getAtributo(null, 'constituicao'), ESCALA_BASE);
  assert.equal(getAtributo({}, 'constituicao'), ESCALA_BASE);
  assert.equal(getAtributo({ atributos: {} }, 'constituicao'), ESCALA_BASE);
});

test('getAtributo: clampa 1-21 mesmo com valor salvo fora da escala', () => {
  assert.equal(getAtributo({ atributos: { constituicao: 999 } }, 'constituicao'), 21);
  assert.equal(getAtributo({ atributos: { constituicao: -5 } }, 'constituicao'), 1);
});

test('bonusEnergiaConstituicao: base (11) não dá bônus nem penalidade', () => {
  assert.equal(bonusEnergiaConstituicao({ atributos: { constituicao: 11 } }), 0);
});

test('bonusEnergiaConstituicao: acima da base dá bônus, abaixo dá penalidade', () => {
  assert.equal(bonusEnergiaConstituicao({ atributos: { constituicao: 21 } }), 15);
  assert.equal(bonusEnergiaConstituicao({ atributos: { constituicao: 1 } }), -15);
});

test('bonusTetoTeseRaciocinio: base neutro, escala 0,5pp por ponto', () => {
  assert.equal(bonusTetoTeseRaciocinio({ atributos: { raciocinio_juridico: 11 } }), 0);
  assert.equal(bonusTetoTeseRaciocinio({ atributos: { raciocinio_juridico: 21 } }), 5);
  assert.equal(bonusTetoTeseRaciocinio({ atributos: { raciocinio_juridico: 1 } }), -5);
});
