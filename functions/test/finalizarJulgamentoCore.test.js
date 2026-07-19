'use strict';

/**
 * Suite node:test pro núcleo extraído de finalizarJulgamento
 * (functions/investigacao.js::_finalizarJulgamentoCore), reaproveitado no
 * auto-resolve mensal (GDD v6.0 §1.2, avancar_mes.js::
 * _autoResolverJulgamentosPendentesCF). Cobre só os 2 guard-clauses (sem
 * Firestore de verdade) — o caminho de resolução completo (jUpdates/
 * pUpdates/honorários) já é coberto indiretamente pelo uso real de
 * exports.finalizarJulgamento em produção antes desta extração; aqui só
 * garante que a extração não alterou o contrato de entrada/saída dos 2
 * casos de borda.
 * Rodar: node --test functions/test/finalizarJulgamentoCore.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { _finalizarJulgamentoCore } = require('../investigacao');

test('julgamento sem investigacao.julgamento: lança failed-precondition', async () => {
  const p = { investigacao: {} };
  await assert.rejects(
    () => _finalizarJulgamentoCore(null, 'uid1', {}, {}, p, {}),
    /Julgamento não foi iniciado/,
  );
});

test('julgamento já com veredito: idempotente, retorna sem tocar Firestore', async () => {
  const p = { investigacao: { julgamento: { veredito: 'procedente', pecas_restantes: [] } } };
  let jogadorTocado = false, processoTocado = false;
  const jogadorRef = { update: async () => { jogadorTocado = true; } };
  const processoRef = { update: async () => { processoTocado = true; } };
  const r = await _finalizarJulgamentoCore(null, 'uid1', processoRef, jogadorRef, p, {});
  assert.equal(r.jaResolvido, true);
  assert.equal(r.veredito, 'procedente');
  assert.equal(jogadorTocado, false);
  assert.equal(processoTocado, false);
});

test('ainda há peças a resolver: lança failed-precondition, não idempotente', async () => {
  const p = { investigacao: { julgamento: { veredito: null, pecas_restantes: [{ no_id: 'x' }] } } };
  await assert.rejects(
    () => _finalizarJulgamentoCore(null, 'uid1', {}, {}, p, {}),
    /Ainda há peças a resolver/,
  );
});
