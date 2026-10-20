'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _motor: m, catalogoTycoon: cat } = require('../tycoon');

const T0 = 1_000_000_000_000;

test('começa com a divisão Cível aberta e 1 advogado', () => {
  const e = m.estadoInicial(T0);
  assert.equal(e.divisoes.civel.aberta, true);
  assert.equal(e.divisoes.civel.equipe, 1);
  assert.equal(m.rendaTotal(e), 2);
});

test('renda entra por segundo e respeita o teto offline de 12h', () => {
  const e = m.estadoInicial(T0);
  m.calcular(e, T0 + 10_000);
  assert.equal(e.caixa, 20);
  m.calcular(e, T0 + 10_000 + 3 * 24 * 3600 * 1000);
  assert.equal(e.caixa, 20 + 2 * 12 * 3600);
});

test('contratar respeita as vagas da sala; ampliar a sala abre mais 2', () => {
  const e = m.estadoInicial(T0);
  e.caixa = 1e9;
  m.melhorar(e, 'civel', 'equipe', 'max');
  assert.equal(e.divisoes.civel.equipe, 3);
  assert.throws(() => m.melhorar(e, 'civel', 'equipe', 1), /sala está cheia/);
  m.melhorar(e, 'civel', 'sala', 1);
  m.melhorar(e, 'civel', 'equipe', 'max');
  assert.equal(e.divisoes.civel.equipe, 5);
});

test('treino e tecnologia multiplicam a renda da divisão', () => {
  const e = m.estadoInicial(T0);
  e.caixa = 1e9;
  const base = m.rendaDivisao(e, 'civel');
  m.melhorar(e, 'civel', 'treino', 10);          // +10% por nível
  assert.ok(Math.abs(m.rendaDivisao(e, 'civel') - base * 2) < 1e-9);
  m.melhorar(e, 'civel', 'tecnologia', 1);       // ×1,05
  assert.ok(Math.abs(m.rendaDivisao(e, 'civel') - base * 2 * 1.05) < 1e-9);
});

test('comprar sem dinheiro falha e não muda nada', () => {
  const e = m.estadoInicial(T0);
  assert.throws(() => m.melhorar(e, 'civel', 'treino', 1), /insuficiente/);
  assert.equal(e.divisoes.civel.treino, 0);
});

test('abrir divisão exige estrelas e dinheiro', () => {
  const e = m.estadoInicial(T0);
  e.caixa = 1e6;
  assert.throws(() => m.abrir(e, 'trabalhista'), /estrelas/);
  m.abrir(e, 'familia');
  assert.equal(e.divisoes.familia.aberta, true);
  assert.equal(e.divisoes.familia.equipe, 1);
  assert.throws(() => m.melhorar(e, 'consumidor', 'treino', 1), /Abra a divisão/);
});

test('missões: 3 ativas, só resgata concluída, dá estrela e dinheiro', () => {
  const e = m.estadoInicial(T0);
  const ativas = m.missoesAtivas(e);
  assert.equal(ativas.length, 3);
  assert.equal(ativas[0].id, 'equipe3_civel');
  assert.throws(() => m.resgatar(e, 'equipe3_civel'), /não concluída/);
  e.caixa = 1e6;
  m.melhorar(e, 'civel', 'equipe', 2);
  const antes = e.caixa;
  const r = m.resgatar(e, 'equipe3_civel');
  assert.equal(e.estrelas, 1);
  assert.equal(e.caixa, antes + r.dinheiro);
  assert.throws(() => m.resgatar(e, 'equipe3_civel'), /não está ativa/);
  assert.throws(() => m.resgatar(e, 'equipe7_superiores'), /não está ativa/);
});

test('estrelas somam +2% de receita cada', () => {
  const e = m.estadoInicial(T0);
  e.estrelas = 10;
  assert.ok(Math.abs(m.rendaTotal(e) - 2 * 1.2) < 1e-9);
});

test('conta da 1ª versão do Império migra mantendo só o caixa', () => {
  const e = m.normalizar({ caixa: 500, frentes: {} }, T0);
  assert.equal(e.versao, 2);
  assert.equal(e.caixa, 500);
  assert.equal(e.divisoes.civel.aberta, true);
});

test('catálogo: estrelas das missões bastam para abrir todas as divisões', () => {
  const maxReq = Math.max(...cat.DIVISOES.map((d) => d.estrelas));
  // missões das divisões anteriores à última precisam render estrelas suficientes
  const ultima = cat.DIVISOES[cat.DIVISOES.length - 1].id;
  const antes = cat.MISSOES.filter((x) => x.div !== ultima).length;
  assert.ok(antes >= maxReq);
});
