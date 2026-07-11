'use strict';

/**
 * Prova a correção do bug central da 2ª revisão crítica: crash entre
 * etapas não deve deixar estado incompleto, e retry completo não deve
 * duplicar nada — nem via FieldValue.increment, nem no head-to-head.
 *
 * Rodar: node scripts/dev/testarIdempotencia.js
 */
const { MockFirestore, FieldValue } = require('./mockFirestore');
const { idPar, ladoNoConfronto } = require('../../functions/confrontos/idPar');
const {
  aplicarEtapaEconomia,
  aplicarEtapaConfronto,
  aplicarResultadoCompleto,
} = require('../../functions/resolucao/aplicarResultado');
const { gerarResolutionNonce, rollDoJulgamento } = require('../../functions/resolucao/rng');

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FALHA:', msg);
    process.exit(1);
  }
}

async function main() {
  const db = new MockFirestore();

  // --- setup: dois advogados e um processo fictício ---
  const idAutor = '1000010';
  const idReu = '1000020';
  await db.collection('perfis').doc(idAutor).set({ fama: 50, xp: 100, reputacao: 10 });
  await db.collection('perfis').doc(idReu).set({ fama: 50, xp: 100, reputacao: 10 });

  const processoId = 'processo_abc';
  const resultado = {
    resolucao_id: `${processoId}_101`,
    vencedor_confronto: 'autor',
    tipo_sentenca: 'procedente',
  };
  const ctx = {
    perfilAutorRef: db.collection('perfis').doc(idAutor),
    perfilReuRef: db.collection('perfis').doc(idReu),
    deltaFamaAutor: 8, deltaFamaReu: 2,
    deltaXpAutor: 10, deltaXpReu: 5,
    deltaReputacaoAutor: 2, deltaReputacaoReu: -1,
    idAutor, idReu,
  };
  const deps = { idPar, ladoNoConfronto };

  console.log('== 1. Teste de RNG: determinístico com o mesmo nonce, imprevisível sem ele ==');
  const nonce = gerarResolutionNonce();
  const roll1 = rollDoJulgamento(nonce, processoId, 101, 'delta_v1');
  const roll2 = rollDoJulgamento(nonce, processoId, 101, 'delta_v1');
  assert(roll1 === roll2, 'Mesmo nonce+processo+tick+versão deveria produzir o mesmo roll (reprodutibilidade)');
  const nonceOutro = gerarResolutionNonce();
  const roll3 = rollDoJulgamento(nonceOutro, processoId, 101, 'delta_v1');
  assert(roll1 !== roll3, 'Nonces diferentes deveriam (quase certamente) produzir rolls diferentes');
  let lancouSemNonce = false;
  try { rollDoJulgamento(null, processoId, 101, 'delta_v1'); } catch (e) { lancouSemNonce = true; }
  assert(lancouSemNonce, 'rollDoJulgamento sem nonce deveria lançar erro, não silenciosamente usar dados públicos');
  console.log(`✅ roll determinístico=${roll1.toFixed(6)}, muda com outro nonce, exige nonce`);

  console.log('\n== 2. Simulando CRASH: só a etapa economia roda, confronto nunca chega a rodar ==');
  const r1 = await aplicarEtapaEconomia(db, FieldValue, processoId, resultado, ctx);
  assert(r1.jaAplicado === false, 'Primeira aplicação de economia deveria ir adiante');

  const perfilAutorPosCrash = (await db.collection('perfis').doc(idAutor).get()).data();
  assert(perfilAutorPosCrash.fama === 58, `Esperava fama 58 após 1 aplicação, veio ${perfilAutorPosCrash.fama}`);
  console.log(`✅ Economia aplicada 1x: fama autor 50→${perfilAutorPosCrash.fama}`);
  console.log('   (aqui, no mundo real, a Cloud Function "caiu" antes da etapa confronto rodar)');

  console.log('\n== 3. RETRY completo — economia deve ser PULADA (já marcada), confronto deve aplicar pela 1ª vez ==');
  const retry1 = await aplicarResultadoCompleto(db, FieldValue, deps, processoId, resultado, ctx);
  const [economiaRetry, confrontoRetry] = retry1;
  assert(economiaRetry.jaAplicado === true, 'Retry deveria pular economia (marcador já existe)');
  assert(confrontoRetry.jaAplicado === false, 'Retry deveria aplicar confronto pela 1ª vez (nunca rodou antes do crash)');

  const perfilAutorPosRetry = (await db.collection('perfis').doc(idAutor).get()).data();
  assert(perfilAutorPosRetry.fama === 58, `Fama deveria continuar 58 (sem duplicar), veio ${perfilAutorPosRetry.fama}`);
  console.log(`✅ Pós-retry: fama autor continua 58 (não duplicou), confronto foi aplicado pela primeira vez`);

  const parId = idPar(idAutor, idReu);
  const confronto1 = (await db.collection('confrontos').doc(parId).get()).data();
  assert(confronto1.placar.a === 1, `Placar do lado 'a' deveria ser 1, veio ${confronto1.placar.a}`);
  console.log(`✅ /confrontos/${parId} placar:`, confronto1.placar);

  console.log('\n== 4. RETRY DE NOVO (dupla re-execução completa) — nada deve mudar ==');
  const retry2 = await aplicarResultadoCompleto(db, FieldValue, deps, processoId, resultado, ctx);
  assert(retry2[0].jaAplicado === true && retry2[1].jaAplicado === true, 'Segundo retry deveria pular AMBAS as etapas');

  const perfilAutorFinal = (await db.collection('perfis').doc(idAutor).get()).data();
  const confrontoFinal = (await db.collection('confrontos').doc(parId).get()).data();
  assert(perfilAutorFinal.fama === 58, `Fama final deveria ser 58, veio ${perfilAutorFinal.fama}`);
  assert(confrontoFinal.placar.a === 1, `Placar final 'a' deveria ser 1, veio ${confrontoFinal.placar.a}`);
  assert(confrontoFinal.ultimos.length === 1, `ultimos[] deveria ter 1 entrada, veio ${confrontoFinal.ultimos.length}`);
  console.log('✅ Após 2 retries completos: fama=58, placar.a=1, ultimos.length=1 — ZERO duplicação');

  console.log('\n== 5. Resultado de OUTRO processo (novo resolucao_id, mesmo par) aplica normalmente ==');
  // Nota: com o fix P0.4, a MESMA etapa "economia" do MESMO processo não
  // aceita mais um segundo resolucao_id (ver teste 6 abaixo) — isso é
  // intencional, um processo não tem duas resoluções finais. Para simular
  // dois RESULTADOS legítimos entre o mesmo par (dois processos
  // diferentes), usamos aplicarEtapaConfronto isoladamente com um
  // resolucao_id de outro processo:
  const resultado2 = { ...resultado, resolucao_id: 'processo_xyz_50', vencedor_confronto: 'reu' };
  await aplicarEtapaConfronto(db, deps, 'processo_xyz', resultado2, ctx);
  const confrontoDepoisSegundo = (await db.collection('confrontos').doc(parId).get()).data();
  assert(confrontoDepoisSegundo.placar.a === 1 && confrontoDepoisSegundo.placar.b === 1, 'Segundo resultado deveria incrementar o lado b sem tocar no a');
  assert(confrontoDepoisSegundo.ultimos.length === 2, 'ultimos[] deveria crescer para 2 com o novo resultado');
  console.log('✅ Novo processo entre o mesmo par aplica normalmente:', confrontoDepoisSegundo.placar, confrontoDepoisSegundo.ultimos);

  console.log('\n== 6. Testando fix P0.4 — resolucao_id diferente na mesma etapa deve LANÇAR, não sobrescrever ==');
  const resultadoConflitante = { ...resultado, resolucao_id: `${processoId}_999` }; // etapa economia já foi aplicada com _101 e _102 acima
  let lancouConflito = false;
  try {
    await aplicarEtapaEconomia(db, FieldValue, processoId, resultadoConflitante, ctx);
  } catch (e) {
    lancouConflito = e.message.includes('Conflito de resolução');
  }
  assert(lancouConflito, 'aplicarEtapaEconomia deveria lançar erro de conflito para resolucao_id novo sobre etapa já concluída');
  const perfilAutorPosConflito = (await db.collection('perfis').doc(idAutor).get()).data();
  assert(perfilAutorPosConflito.fama === 58, `Fama não deveria mudar após tentativa conflitante, veio ${perfilAutorPosConflito.fama}`);
  console.log('✅ Tentativa de aplicar economia com resolucao_id conflitante foi REJEITADA (antes: sobrescrevia silenciosamente)');

  console.log('\n🎉 TODOS OS TESTES DE IDEMPOTÊNCIA PASSARAM — crash simulado não duplicou nem perdeu efeitos, conflito de resolução é rejeitado');
}

main().catch((err) => {
  console.error('❌ ERRO NÃO TRATADO:', err);
  process.exit(1);
});
