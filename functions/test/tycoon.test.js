'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _motor: m, catalogoTycoon: cat } = require('../tycoon');

const T0 = 1_000_000_000_000;

test('começa com o Juizado no nível 1 e caixa zerado', () => {
  const e = m.estadoInicial(T0);
  assert.equal(e.frentes.forum.nivel, 1);
  assert.equal(e.caixa, 0);
});

test('sem gerente: atender inicia um ciclo que paga uma vez ao terminar', () => {
  const e = m.estadoInicial(T0);
  m.atender(e, 'forum', T0);
  m.calcular(e, T0 + 2000);
  assert.equal(e.caixa, 0);
  m.calcular(e, T0 + 60000);
  assert.equal(e.caixa, 10);              // um ciclo só, mesmo depois de muito tempo
  assert.equal(e.frentes.forum.ciclo_inicio, null);
  assert.throws(() => m.atender(e, 'delegacia', T0), /ainda não atua/);
});

test('não dá para atender de novo com o ciclo em andamento', () => {
  const e = m.estadoInicial(T0);
  m.atender(e, 'forum', T0);
  assert.throws(() => m.atender(e, 'forum', T0 + 1000), /em andamento/);
});

test('com gerente: ciclos contínuos, inclusive offline, com teto de 24h', () => {
  const e = m.estadoInicial(T0);
  e.caixa = 1000;
  m.contratarGerente(e, 'forum', T0);
  assert.equal(e.caixa, 0);
  m.calcular(e, T0 + 30_000);            // 10 ciclos de 3s
  assert.equal(e.caixa, 100);
  const antes = e.caixa;
  m.calcular(e, T0 + 30_000 + 10 * 24 * 3600 * 1000);   // 10 dias fora
  const ciclos24h = (24 * 3600) / 3;
  assert.equal(e.caixa - antes, ciclos24h * 10);
});

test('custo de níveis segue a progressão geométrica e o "max" cabe no caixa', () => {
  const c1 = m.custoNiveis('forum', 1, 1);
  assert.ok(Math.abs(c1 - 40 * 1.07) < 1e-9);
  const e = m.estadoInicial(T0);
  e.caixa = 5000;
  const n = m.maxComprável('forum', 1, e.caixa);
  assert.ok(m.custoNiveis('forum', 1, n) <= 5000);
  assert.ok(m.custoNiveis('forum', 1, n + 1) > 5000);
  const r = m.comprar(e, 'forum', 'max');
  assert.equal(r.comprados, n);
  assert.equal(e.frentes.forum.nivel, 1 + n);
});

test('comprar sem dinheiro falha e não mexe no estado', () => {
  const e = m.estadoInicial(T0);
  assert.throws(() => m.comprar(e, 'delegacia', 1), /insuficiente/);
  assert.equal(e.frentes.delegacia.nivel, 0);
});

test('marcos de nível dobram a velocidade', () => {
  assert.equal(m.tempoCiclo('forum', 24), 3);
  assert.equal(m.tempoCiclo('forum', 25), 1.5);
  assert.equal(m.tempoCiclo('forum', 50), 0.75);
});

test('melhorias multiplicam a receita da frente certa', () => {
  const e = m.estadoInicial(T0);
  e.caixa = 1e12;
  e.frentes.forum.nivel = 10;
  const antes = m.receitaCiclo(e, 'forum');
  m.comprarMelhoria(e, 'esp_forum');
  assert.equal(m.receitaCiclo(e, 'forum'), antes * 3);
  assert.throws(() => m.comprarMelhoria(e, 'esp_forum'), /já tem/);
});

test('catálogo: cada frente custa mais e paga mais que a anterior', () => {
  for (let i = 1; i < cat.FRENTES.length; i++) {
    assert.ok(cat.FRENTES[i].custo > cat.FRENTES[i - 1].custo);
    assert.ok(cat.FRENTES[i].receita > cat.FRENTES[i - 1].receita);
  }
});

test('publico calcula renda por segundo só das frentes com gerente', () => {
  const e = m.estadoInicial(T0);
  let p = m.publico(e, T0);
  assert.equal(p.por_segundo, 0);
  e.caixa = 1000;
  m.contratarGerente(e, 'forum', T0);
  p = m.publico(e, T0);
  assert.ok(Math.abs(p.por_segundo - 10 / 3) < 1e-9);
});
