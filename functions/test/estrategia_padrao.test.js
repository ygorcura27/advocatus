'use strict';

/**
 * Suite node:test pra Estratégia Padrão (GDD v6.0 §1.2 item 3).
 * Rodar: node --test functions/test/estrategia_padrao.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estrategiaPadrao,
  normalizarEstrategia,
  dentroDoTetoAcordo,
  chanceAceiteComPostura,
} = require('../estrategia_padrao');

test('estrategiaPadrao: default conservadora, teto 50', () => {
  assert.deepEqual(estrategiaPadrao(), { postura: 'conservadora', teto_acordo_pct: 50 });
});

test('normalizarEstrategia: sem config nenhuma cai no default', () => {
  assert.deepEqual(normalizarEstrategia(null), estrategiaPadrao());
  assert.deepEqual(normalizarEstrategia(undefined), estrategiaPadrao());
});

test('normalizarEstrategia: postura inválida cai no default, teto clampa 0-100', () => {
  assert.equal(normalizarEstrategia({ postura: 'lixo' }).postura, 'conservadora');
  assert.equal(normalizarEstrategia({ teto_acordo_pct: 500 }).teto_acordo_pct, 100);
  assert.equal(normalizarEstrategia({ teto_acordo_pct: -10 }).teto_acordo_pct, 0);
});

test('dentroDoTetoAcordo: cv <= teto autoriza, cv > teto não', () => {
  const e = { postura: 'conservadora', teto_acordo_pct: 50 };
  assert.equal(dentroDoTetoAcordo(50, e), true);
  assert.equal(dentroDoTetoAcordo(49, e), true);
  assert.equal(dentroDoTetoAcordo(51, e), false);
});

test('chanceAceiteComPostura: conservadora usa a fórmula-base sem modificador', () => {
  const e = { postura: 'conservadora', teto_acordo_pct: 100 };
  assert.equal(chanceAceiteComPostura(38, e), 38/120 + 0.25);
});

test('chanceAceiteComPostura: agressiva reduz, conciliatória aumenta, clampado 0-1', () => {
  const cv = 38;
  const base = cv/120 + 0.25;
  assert.ok(Math.abs(chanceAceiteComPostura(cv, { postura: 'agressiva' }) - (base - 0.15)) < 1e-9);
  assert.ok(Math.abs(chanceAceiteComPostura(cv, { postura: 'conciliatoria' }) - (base + 0.15)) < 1e-9);
  assert.equal(chanceAceiteComPostura(200, { postura: 'conciliatoria' }), 1); // clamp teto
  assert.equal(chanceAceiteComPostura(-200, { postura: 'agressiva' }), 0); // clamp piso
});
