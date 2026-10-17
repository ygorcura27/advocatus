'use strict';

/**
 * Suite node:test pro fechamento do Avançar Mês (avancar_mes.js::_commit /
 * _rebasearSobreAtual): o que outras etapas gravaram no doc do jogador
 * DURANTE o avanço (royalties, receita recorrente, cursos, julgamentos
 * auto-resolvidos) não pode ser apagado pelo commit final, que é calculado
 * sobre o snapshot lido no início.
 * Rodar: node --test functions/test/avancar_mes_commit.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { _rebasearSobreAtual, _commit } = require('../avancar_mes');
const { MockFirestore } = require('./mockFirestore');

test('sem escrita no meio do avanço: grava exatamente o calculado', () => {
  const base  = { dinheiro: 1000, reputacao: 30 };
  const atual = { dinheiro: 1000, reputacao: 30 };
  const out = _rebasearSobreAtual({ dinheiro: 700, reputacao: 28, mes_pessoal: 5 }, base, atual);
  assert.deepEqual(out, { dinheiro: 700, reputacao: 28, mes_pessoal: 5 });
});

test('royalties creditados no meio do avanço não somem', () => {
  const base  = { dinheiro: 1000 };
  const atual = { dinheiro: 1500 };            // +500 de royalties durante o avanço
  const out = _rebasearSobreAtual({ dinheiro: 700 }, base, atual); // avanço: -300
  assert.equal(out.dinheiro, 1200);
});

test('clamp 0-100 reaplicado depois do rebase', () => {
  const out = _rebasearSobreAtual({ reputacao: 99 }, { reputacao: 90 }, { reputacao: 95 });
  assert.equal(out.reputacao, 100);
  const out2 = _rebasearSobreAtual({ saude_mental: 2 }, { saude_mental: 10 }, { saude_mental: 5 });
  assert.equal(out2.saude_mental, 0);
});

test('skills: ganho de curso no meio do avanço preservado junto com o estudo concluído', () => {
  const base  = { skills: { oratoria: 20, escrita: 10 } };
  const atual = { skills: { oratoria: 20, escrita: 15, gestao: 3 } }; // curso: +5 escrita, gestao nova
  const out = _rebasearSobreAtual({ skills: { oratoria: 24, escrita: 10 } }, base, atual); // estudo: +4 oratoria
  assert.deepEqual(out.skills, { oratoria: 24, escrita: 15, gestao: 3 });
});

test('campos não numéricos seguem o valor calculado', () => {
  const out = _rebasearSobreAtual({ study_queue: [], pat: { moradia: 'x' } }, { study_queue: [1] }, { study_queue: [1, 2] });
  assert.deepEqual(out.study_queue, []);
});

test('_commit: aplica o rebase no doc e grava as mensagens na inbox', async () => {
  const db = new MockFirestore();
  const ref = db.collection('jogadores').doc('u1');
  await ref.set({ dinheiro: 1000, honorarios_mes: 0 });
  const base = { dinheiro: 1000, honorarios_mes: 0 };
  // receita recorrente creditada no meio do avanço
  await ref.update({ dinheiro: 1800, honorarios_mes: 800 });

  await _commit(db, 'u1', { dinheiro: 600, honorarios_mes: 0, mes_global_pessoal: 7 },
    [{ assunto: 'Oi', corpo: 'teste', tipo: 'neutro' }], 6, 1, base);

  const final = (await ref.get()).data();
  assert.equal(final.dinheiro, 1400);        // 1800 + (600 - 1000)
  assert.equal(final.honorarios_mes, 800);   // reset do mês velho mantém o do mês novo
  assert.equal(final.ultimo_mes_processado, 7);
  const inbox = await db.collection('jogadores').doc('u1').collection('inbox').get();
  assert.equal(inbox.size ?? inbox.docs.length, 1);
});
