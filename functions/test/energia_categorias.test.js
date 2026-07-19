'use strict';

/**
 * Suite node:test pro módulo de energia por categoria (GDD v6.0 §3.1).
 * Rodar: node --test functions/test/energia_categorias.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularEnergiaTotal,
  debitarEnergiaCategoria,
  creditarEnergiaCategoria,
  resetEnergiaMensal,
  categoriasVazias,
  calcularModSupervisaoSocio,
} = require('../energia_categorias');

test('calcularEnergiaTotal replica a fórmula do frontend (base 100 + bônus academia + disposição - penalidade, piso 10)', () => {
  assert.equal(calcularEnergiaTotal(null), 100);
  // disposicao ausente -> default 80 (?? 80) -> faixa >=80 -> bônus +10, igual ao frontend
  assert.equal(calcularEnergiaTotal({}), 110);
});

test('disposição alta (>=80) dá +10, média (50-79) 0, baixa (20-49) -10, muito baixa (<20) -20', () => {
  assert.equal(calcularEnergiaTotal({ disposicao: 90 }), 110);
  assert.equal(calcularEnergiaTotal({ disposicao: 60 }), 100);
  assert.equal(calcularEnergiaTotal({ disposicao: 30 }), 90);
  assert.equal(calcularEnergiaTotal({ disposicao: 5 }), 80);
});

test('penalidade de exaustão reduz o teto, piso em 10', () => {
  assert.equal(calcularEnergiaTotal({ disposicao: 60, penalidade_energia_val: 200 }), 10);
});

test('academia só conta bônus se academia_ativa=true', () => {
  assert.equal(calcularEnergiaTotal({ disposicao: 60, academia_bonus_energia: 20, academia_ativa: false }), 100);
  assert.equal(calcularEnergiaTotal({ disposicao: 60, academia_bonus_energia: 20, academia_ativa: true }), 120);
});

test('conta antiga sem energia_alocada: debita do pool único legado, mantendo os 2 espelhos (energia_usada_mes e energia) em sincronia', () => {
  const j = { energia_usada_mes: 40, disposicao: 60 };
  const patch = debitarEnergiaCategoria(j, 'estudo', 30, 'teste');
  assert.deepEqual(patch, { energia_usada_mes: 70, energia: 30 });
});

test('conta antiga sem energia_alocada: estoura o pool único -> resource-exhausted', () => {
  const j = { energia_usada_mes: 90, disposicao: 60 };
  assert.throws(() => debitarEnergiaCategoria(j, 'estudo', 30, 'teste'), /resource-exhausted|Energia insuficiente/);
});

test('conta configurada: debita só do balde da categoria, ignora outros baldes', () => {
  const j = {
    disposicao: 60,
    energia_alocada: { processos: 40, supervisao: 10, estudo: 20, captacao: 10, pessoal: 15, descanso: 5 },
    energia_usada: { processos: 0, supervisao: 0, estudo: 5, captacao: 0, pessoal: 0, descanso: 0 },
  };
  const patch = debitarEnergiaCategoria(j, 'estudo', 8, 'aula');
  assert.deepEqual(patch, { energia_usada: { processos: 0, supervisao: 0, estudo: 13, captacao: 0, pessoal: 0, descanso: 0 } });
});

test('conta configurada: estoura o balde específico -> resource-exhausted, mesmo com espaço sobrando em outro balde', () => {
  const j = {
    disposicao: 60,
    energia_alocada: { processos: 40, supervisao: 10, estudo: 20, captacao: 10, pessoal: 15, descanso: 5 },
    energia_usada: { processos: 0, supervisao: 0, estudo: 18, captacao: 0, pessoal: 0, descanso: 0 },
  };
  assert.throws(() => debitarEnergiaCategoria(j, 'estudo', 5, 'aula'), /resource-exhausted|insuficiente/);
});

test('resetEnergiaMensal: conta legado só zera o pool único', () => {
  const j = { energia_usada_mes: 80, disposicao: 60 };
  const patch = resetEnergiaMensal(j);
  assert.equal(patch.energia, 100);
  assert.equal(patch.energia_usada_mes, 0);
  assert.equal(patch.energia_usada, undefined);
});

test('creditarEnergiaCategoria: conta legado devolve nos 2 espelhos, floor em 0', () => {
  const j = { energia_usada_mes: 3, disposicao: 60 };
  const patch = creditarEnergiaCategoria(j, 'estudo', 5);
  assert.equal(patch.energia_usada_mes, 0);
  assert.equal(patch.energia, 100);
});

test('creditarEnergiaCategoria: conta configurada devolve só no balde da categoria, floor em 0', () => {
  const j = {
    disposicao: 60,
    energia_alocada: { processos: 40, supervisao: 10, estudo: 20, captacao: 10, pessoal: 15, descanso: 5 },
    energia_usada: { processos: 0, supervisao: 0, estudo: 3, captacao: 0, pessoal: 0, descanso: 0 },
  };
  const patch = creditarEnergiaCategoria(j, 'estudo', 5);
  assert.equal(patch.energia_usada.estudo, 0);
});

test('calcularModSupervisaoSocio: conta legado (sem energia_alocada) fica neutra em 1.0', () => {
  assert.equal(calcularModSupervisaoSocio({ disposicao: 60 }), 1.0);
  assert.equal(calcularModSupervisaoSocio(null), 1.0);
});

test('calcularModSupervisaoSocio: 0 alocado em supervisao = piso 0.85x', () => {
  const j = { disposicao: 60, energia_alocada: { processos: 100, supervisao: 0, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 } };
  assert.equal(calcularModSupervisaoSocio(j), 0.85);
});

test('calcularModSupervisaoSocio: 20% do teto alocado (ou mais) = teto 1.15x', () => {
  // total = 100 (disposicao 60 -> bônus 0), 20% = 20
  const j20 = { disposicao: 60, energia_alocada: { processos: 0, supervisao: 20, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 } };
  assert.equal(calcularModSupervisaoSocio(j20), 1.15);
  const jAcima = { disposicao: 60, energia_alocada: { processos: 0, supervisao: 80, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 } };
  assert.equal(calcularModSupervisaoSocio(jAcima), 1.15); // não passa do teto
});

test('calcularModSupervisaoSocio: interpola linear entre 0.85 e 1.15', () => {
  // metade do teto de referência (10 de 20) -> metade do caminho (0.85 + 0.15 = 1.0)
  const j = { disposicao: 60, energia_alocada: { processos: 0, supervisao: 10, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 } };
  assert.equal(calcularModSupervisaoSocio(j), 1.0);
});

test('resetEnergiaMensal: conta configurada zera os 6 baldes de uso, mantém a alocação intocada (não faz parte do patch)', () => {
  const j = {
    disposicao: 60,
    energia_alocada: { processos: 40, supervisao: 10, estudo: 20, captacao: 10, pessoal: 15, descanso: 5 },
    energia_usada: { processos: 40, supervisao: 10, estudo: 20, captacao: 10, pessoal: 15, descanso: 5 },
  };
  const patch = resetEnergiaMensal(j);
  assert.deepEqual(patch.energia_usada, categoriasVazias());
  assert.equal(patch.energia_alocada, undefined);
});
