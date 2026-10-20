'use strict';

/**
 * Suite node:test do motor da Audiência como Duelo (functions/duelo_motor.js).
 * Rodar: node --test functions/test/duelo_motor.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../duelo_motor');

function rngSeed(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function caso(valor = 50000, pecas) {
  return {
    titulo: 'Silva x Banco', valor,
    investigacao: {
      nos: [{ id: 'n0', tipo: 'consulta' }, { id: 'n1', tipo: 'analise_documental' }, { id: 'n2', tipo: 'pericia' }],
      julgamento: { pecas_restantes: pecas || [{ no_id: 'n0', forca: 14 }, { no_id: 'n1', forca: 28 }, { no_id: 'n2', forca: 24, pilar: true }] },
    },
  };
}
const jogador = (extra = {}) => ({ skills: { pesquisa: 15 }, skills_jur: {}, estresse: 10, ...extra });

function jogarAteOFim(e, rng) {
  while (e.fase !== 'fim') {
    const livre = e.mao.find((c) => !c.usada);
    if (e.fase === 'ataque') m.aplicarAcao(e, { tipo: 'conceder' }, rng);
    else m.aplicarAcao(e, livre ? { tipo: 'argumentar', carta_id: livre.id } : { tipo: 'conceder' }, rng);
  }
  return e;
}

test('cartas vêm das peças da montagem, com o tipo do nó', () => {
  const e = m.criarDuelo(caso(), jogador(), rngSeed(1), 'p1');
  assert.deepEqual(e.mao.map((c) => c.tipo), ['testemunho', 'prova_documental', 'prova_pericial']);
  assert.equal(e.mao[2].pilar, true);
  assert.equal(e.fase, 'ataque');
});

test('mesmo processo = mesmo juiz (determinístico)', () => {
  const a = m.criarDuelo(caso(), jogador(), rngSeed(1), 'proc-x');
  const b = m.criarDuelo(caso(), jogador(), rngSeed(99), 'proc-x');
  assert.equal(a.juiz.nome, b.juiz.nome);
});

test('estado público não vaza baralho, vício nem perfil de juiz desconhecido', () => {
  const e = m.criarDuelo(caso(), jogador({ skills: { pesquisa: 0 } }), rngSeed(3), 'p3');
  const pub = m.estadoPublico(e);
  assert.equal(pub.baralho, undefined);
  assert.equal(pub.juiz.classe, null);
  assert.equal(pub.jogada.tipo, undefined);
  assert.equal(pub.jogada.vicio, undefined);
  assert.ok(pub.jogada.fala.length > 0);
});

test('leitura alta mostra tipo, força aproximada e vício', () => {
  const e = m.criarDuelo(caso(), jogador({ skills: { pesquisa: 50 } }), rngSeed(3), 'p3');
  const pub = m.estadoPublico(e);
  assert.ok(pub.jogada.tipo);
  assert.ok(['forte', 'média', 'fraca'].includes(pub.jogada.faixa));
  assert.equal(typeof pub.jogada.vicio, 'boolean');
});

test('juiz visto 2+ vezes tem o perfil revelado', () => {
  const base = m.criarDuelo(caso(), jogador(), rngSeed(1), 'p9');
  const e = m.criarDuelo(caso(), jogador({ juizes_vistos: { [base.juiz.nome]: 2 } }), rngSeed(1), 'p9');
  assert.equal(m.estadoPublico(e).juiz.classe, e.juiz.classe);
});

test('audiência termina em 6 rodadas com veredito coerente com o convencimento', () => {
  const e = jogarAteOFim(m.criarDuelo(caso(), jogador(), rngSeed(5), 'p5'), rngSeed(6));
  assert.equal(e.rodada, 6);
  assert.equal(e.final.resultado, m.vereditoDe(e.final.convencimento));
});

test('causa de 300 mil ou mais ganha 2 rodadas extras', () => {
  const e = m.criarDuelo(caso(500000), jogador(), rngSeed(5), 'p5');
  assert.equal(e.plano.length, 8);
});

test('carta usada não pode ser jogada de novo', () => {
  const rng = rngSeed(7);
  const e = m.criarDuelo(caso(), jogador(), rng, 'p7');
  m.aplicarAcao(e, { tipo: 'contestar', carta_id: 'c0' }, rng);
  m.aplicarAcao(e, { tipo: 'conceder' }, rng); // sua vez: passa
  assert.throws(() => m.aplicarAcao(e, { tipo: 'contestar', carta_id: 'c0' }, rng), /já usada/);
});

test('argumentar na fase de ataque é inválido', () => {
  const e = m.criarDuelo(caso(), jogador(), rngSeed(8), 'p8');
  assert.throws(() => m.aplicarAcao(e, { tipo: 'argumentar', carta_id: 'c1' }, rngSeed(8)), /Ação inválida/);
});

test('objeção sem vício custa compostura e paciência', () => {
  const rng = () => 0.99; // nunca acolhe por sorte
  const e = m.criarDuelo(caso(), jogador(), rngSeed(10), 'p10');
  e.baralho[0].vicio = false;
  const comp = e.compostura, pac = e.paciencia;
  m.aplicarAcao(e, { tipo: 'objecao' }, rng);
  assert.ok(e.compostura <= comp - 2);
  assert.equal(e.paciencia, pac - 2);
});

test('objeção com vício anula o golpe', () => {
  const e = m.criarDuelo(caso(), jogador(), rngSeed(11), 'p11');
  e.baralho[0].vicio = true;
  const conv = e.convencimento;
  m.aplicarAcao(e, { tipo: 'objecao' }, rngSeed(11));
  assert.equal(Math.round(e.convencimento), Math.round(conv));
});

test('acordo: só a partir da 3ª rodada, encerra com honorário', () => {
  const rng = rngSeed(12);
  const e = m.criarDuelo(caso(), jogador(), rng, 'p12');
  assert.throws(() => m.aplicarAcao(e, { tipo: 'propor_acordo' }, rng), /cedo/);
  m.aplicarAcao(e, { tipo: 'conceder' }, rng);
  m.aplicarAcao(e, { tipo: 'conceder' }, rng);
  m.aplicarAcao(e, { tipo: 'propor_acordo' }, rng);
  assert.ok(m.estadoPublico(e).acordo.oferta > 0);
  assert.throws(() => m.aplicarAcao(e, { tipo: 'conceder' }, rng), /proposta de acordo/);
  m.aplicarAcao(e, { tipo: 'aceitar_acordo' }, rng);
  assert.equal(e.fase, 'fim');
  assert.equal(e.final.resultado, 'acordo');
  assert.ok(e.final.honorario > 0);
});

test('Memória Eidética revela a jogada e as cartas que a contradizem', () => {
  const e = m.criarDuelo(caso(), jogador({ tracos_assinatura: [{ id: 'memoria_eidetica' }] }), rngSeed(13), 'p13');
  m.aplicarAcao(e, { tipo: 'traco_memoria' }, rngSeed(13));
  const pub = m.estadoPublico(e);
  assert.equal(typeof pub.jogada.forca, 'number');
  assert.ok(Array.isArray(pub.jogada.cartas_contra));
  assert.equal(pub.tracos[0].usos, 0);
  assert.throws(() => m.aplicarAcao(e, { tipo: 'traco_memoria' }, rngSeed(13)), /indisponível/);
});

test('blefe sem o traço O Fechador é recusado', () => {
  const rng = rngSeed(14);
  const e = m.criarDuelo(caso(), jogador(), rng, 'p14');
  m.aplicarAcao(e, { tipo: 'conceder' }, rng);
  assert.throws(() => m.aplicarAcao(e, { tipo: 'argumentar', carta_id: 'c1', blefe: true }, rng), /indisponível/);
});

test('juiz que valoriza o tipo da carta dá mais convencimento', () => {
  const e = m.criarDuelo(caso(), jogador(), rngSeed(15), 'p15');
  const carta = { tipo: 'prova_documental', forca: 20, suja: false };
  e.juiz.classe = 'formalista'; // prova documental peso 7
  const alto = m.ganhoCarta(e, carta);
  e.juiz.classe = 'humanista';  // prova documental peso 2
  const baixo = m.ganhoCarta(e, carta);
  assert.ok(alto > baixo * 2);
});

test('recurso: adversário fica mais forte a cada instância (1º grau < TJ < STJ < STF)', () => {
  const base = { valor: 50000, investigacao: { nos: [{ id: 'n0', tipo: 'consulta' }], julgamento: { pecas_restantes: [{ no_id: 'n0', forca: 20 }] } } };
  const soma = (inst) => {
    const e = m.criarDuelo({ ...base, instancia_atual: inst }, {}, rngSeed(42), 'x');
    return e.baralho.reduce((s, c) => s + c.forca, 0);
  };
  const [g1, tj, stj, stf] = ['1grau', 'TJ', 'STJ', 'STF'].map(soma);
  assert.ok(g1 < tj && tj < stj && stj < stf, `${g1} ${tj} ${stj} ${stf}`);
});
