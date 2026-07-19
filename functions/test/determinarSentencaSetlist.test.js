'use strict';

/**
 * Suite node:test pro modificador de perfil de juiz em
 * determinarSentencaSetlist (GDD v6.0 §6.3 — 5 arquétipos + conservador).
 * Cobre o bug corrigido nesta sessão: `julgador.perfil` (sempre undefined,
 * campo real é `perfil_oculto`) e valor fantasma 'fiscal' que nunca era
 * sorteado — todo o bloco de modificador de juiz era morto antes disso,
 * mesmo pros 3 perfis que já existiam.
 * Rodar: node --test functions/test/determinarSentencaSetlist.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { determinarSentencaSetlist } = require('../processar_sentenca');

const CTX_BASE = { processos_concluidos: 50, supervisao_ativa: false, tipo_caso: 'civil', alta_originalidade: false };

// Roda N vezes e mede a taxa de cada resultado (Math.random() real, não mockado —
// checa direção/magnitude estatística, não valor exato).
function amostrar(nota, posicao, julgador, ctx, n = 4000) {
  const contagem = { procedente: 0, parcial: 0, improcedente: 0 };
  for (let i = 0; i < n; i++) {
    const { resultado } = determinarSentencaSetlist(nota, posicao, julgador, 0, ctx);
    contagem[resultado]++;
  }
  return contagem;
}

test('sem julgador: modificador de perfil não se aplica (bloco todo pulado)', () => {
  const r = determinarSentencaSetlist(15, 'autor', null, 0, CTX_BASE);
  assert.ok(['procedente', 'parcial', 'improcedente'].includes(r.resultado));
});

test('formalista com alta_originalidade: usa perfil_oculto (não .perfil), some mais procedente', () => {
  const ctx = { ...CTX_BASE, alta_originalidade: true };
  const semJuiz = amostrar(15, 'autor', null, ctx);
  const comJuizFormalista = amostrar(15, 'autor', { perfil_oculto: 'formalista' }, ctx);
  assert.ok(comJuizFormalista.procedente > semJuiz.procedente - 50, 'formalista deveria manter ou aumentar procedente com alta originalidade');
});

test('produtivista e conciliador empurram pra parcial (meio-termo)', () => {
  const semJuiz = amostrar(15, 'autor', null, CTX_BASE);
  const produtivista = amostrar(15, 'autor', { perfil_oculto: 'produtivista' }, CTX_BASE);
  const conciliador = amostrar(15, 'autor', { perfil_oculto: 'conciliador' }, CTX_BASE);
  assert.ok(produtivista.parcial > semJuiz.parcial - 100, 'produtivista deveria puxar pra parcial');
  assert.ok(conciliador.parcial > produtivista.parcial - 150, 'conciliador puxa pra parcial ainda mais forte que produtivista');
});

test('imprevisível não quebra (roda sem lançar, resultado válido)', () => {
  for (let i = 0; i < 50; i++) {
    const r = determinarSentencaSetlist(15, 'autor', { perfil_oculto: 'imprevisivel' }, 0, CTX_BASE);
    assert.ok(['procedente', 'parcial', 'improcedente'].includes(r.resultado));
  }
});

test('perfil desconhecido/inválido: nenhum modificador aplicado, não lança', () => {
  const r = determinarSentencaSetlist(15, 'autor', { perfil_oculto: 'xxx_invalido' }, 0, CTX_BASE);
  assert.ok(['procedente', 'parcial', 'improcedente'].includes(r.resultado));
});
