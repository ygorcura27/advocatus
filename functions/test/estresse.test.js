'use strict';

/**
 * Suite node:test pro módulo de Estresse/Fôlego (GDD v6.0 §3.2/§3.3).
 * Rodar: node --test functions/test/estresse.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularFolego,
  multiplicadorNota,
  multiplicadorEstudo,
  emBurnoutPorEstresse,
  calcularDeltaEstresseMensal,
  aplicarDeltaEstresse,
} = require('../estresse');

test('calcularFolego: 10-floor(estresse/20), piso 0', () => {
  assert.equal(calcularFolego(0), 10);
  assert.equal(calcularFolego(19), 10);
  assert.equal(calcularFolego(20), 9);
  assert.equal(calcularFolego(100), 5);
  assert.equal(calcularFolego(null), 10);
});

test('multiplicadorNota: faixas 0-39 normal, 40-69 -5%, 70+ -12%', () => {
  assert.equal(multiplicadorNota(0), 1.0);
  assert.equal(multiplicadorNota(39), 1.0);
  assert.equal(multiplicadorNota(40), 0.95);
  assert.equal(multiplicadorNota(69), 0.95);
  assert.equal(multiplicadorNota(70), 0.88);
  assert.equal(multiplicadorNota(100), 0.88);
});

test('multiplicadorEstudo: -20% a partir de 70', () => {
  assert.equal(multiplicadorEstudo(69), 1.0);
  assert.equal(multiplicadorEstudo(70), 0.8);
});

test('emBurnoutPorEstresse: gatilho em 90+', () => {
  assert.equal(emBurnoutPorEstresse(89), false);
  assert.equal(emBurnoutPorEstresse(90), true);
});

test('calcularDeltaEstresseMensal: derrota soma, descanso/pessoal/recesso subtraem', () => {
  assert.equal(calcularDeltaEstresseMensal({ derrotasNoMes: 2, horasDescanso: 0, horasPessoal: 0, teveRecesso: false }), 10);
  assert.equal(calcularDeltaEstresseMensal({ derrotasNoMes: 0, horasDescanso: 20, horasPessoal: 0, teveRecesso: false }), -2);
  assert.equal(calcularDeltaEstresseMensal({ derrotasNoMes: 0, horasDescanso: 0, horasPessoal: 30, teveRecesso: false }), -2);
  assert.equal(calcularDeltaEstresseMensal({ derrotasNoMes: 0, horasDescanso: 0, horasPessoal: 0, teveRecesso: true }), -25);
  assert.equal(calcularDeltaEstresseMensal({}), 0);
});

test('aplicarDeltaEstresse: clampa 0-100', () => {
  assert.equal(aplicarDeltaEstresse(5, -20), 0);
  assert.equal(aplicarDeltaEstresse(95, 20), 100);
  assert.equal(aplicarDeltaEstresse(50, 10), 60);
  assert.equal(aplicarDeltaEstresse(undefined, 10), 10);
});
