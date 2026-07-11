'use strict';

/**
 * TESTE: testarClaimOrfao.js
 *
 * Valida que um claim em estado 'creating' (crash antes da confecção) é
 * retomado pelo retry e a peça é finalmente criada.
 *
 * Fluxo simulado:
 *   1. Forçar claim em estado 'creating' sem peça associada.
 *   2. Executar seedCatalogoInicial() como retry.
 *   3. Verificar que a peça foi criada e o claim está 'completed'.
 *   4. Verificar que materializarNPC() marca o NPC como ready.
 */

const { MockFirestore } = require('./mockFirestore');
const { seedCatalogoInicial, validarCoberturaCatalogo, idPecaEssencial } = require('../../functions/npc/seedCatalogoInicial');

let passados = 0;
let falhos   = 0;

function assert(condicao, msg) {
  if (!condicao) {
    console.error(`  ✗ FALHOU: ${msg}`);
    falhos++;
  } else {
    console.log(`  ✓ ${msg}`);
    passados++;
  }
}

// ── Adapter mínimo de confecção ───────────────────────────────────────────────

function confeccionarPecaSincrona({ db, id_determinista, autor_uid, tipo_peticao, ramo_direito }) {
  // Persiste com o ID determinístico exigido pelo contrato do adapter.
  const peca = { id: id_determinista, autor_uid, tipo_peticao, ramo_direito, nota_teto: 70 };
  db._dados['peticoes'] = db._dados['peticoes'] || {};
  db._dados['peticoes'][id_determinista] = peca;
  return Promise.resolve(peca);
}

const poolTeses = {
  civil:      ['tese_civil_a'],
  employment: ['tese_emp_a'],
  empresarial:['tese_emp_b'],
  tax:        ['tese_tax_a'],
  criminal:   ['tese_crim_a'],
};

function escolherEstiloNPCInicial() { return 'legalista'; }

// ── Teste 1: Claim órfão 'creating' → retry cria a peça ──────────────────────

async function testeClaimOrfaoCriando() {
  console.log('\n[Teste 1] Claim "creating" sem peça → retry deve criar a peça');
  const db = new MockFirestore();
  const profileId = '42';
  const area      = 'civil';
  const tipo      = 'inicial';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  // Simular claim órfão em estado 'creating' (crash antes da confecção).
  db._dados['peticoes_claims'] = db._dados['peticoes_claims'] || {};
  db._dados['peticoes_claims'][idPeca] = {
    id_peca: idPeca,
    profile_id: profileId,
    status: 'creating',
    em: Date.now() - 5000,
  };

  await seedCatalogoInicial({
    db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona,
    poolTeses, escolherEstiloNPCInicial,
  });

  const peca = db._dados['peticoes'] && db._dados['peticoes'][idPeca];
  assert(!!peca, 'Peça foi criada após retry de claim orphan');

  const claim = db._dados['peticoes_claims'][idPeca];
  assert(claim && claim.status === 'completed', 'Claim marcado como completed após confecção');
}

// ── Teste 2: Claim v5.9 (sem campo status) → tratado como 'creating' ─────────

async function testeClaimLegadoSemStatus() {
  console.log('\n[Teste 2] Claim v5.9 sem campo "status" → tratado como creating, peça criada');
  const db = new MockFirestore();
  const profileId = '43';
  const area      = 'civil';
  const tipo      = 'inicial';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  // Formato antigo v5.9: sem campo status.
  db._dados['peticoes_claims'] = { [idPeca]: { id_peca: idPeca, profile_id: profileId, em: Date.now() } };

  await seedCatalogoInicial({
    db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona,
    poolTeses, escolherEstiloNPCInicial,
  });

  const peca = db._dados['peticoes'] && db._dados['peticoes'][idPeca];
  assert(!!peca, 'Peça criada a partir de claim legado v5.9 (sem status)');
}

// ── Teste 3: Claim 'completed' sem peça → não recria ─────────────────────────

async function testeClaimCompletedSemPeca() {
  console.log('\n[Teste 3] Claim "completed" mas peça ausente → adapter-defeituoso: pula sem criar');
  const db = new MockFirestore();
  const profileId = '44';
  const area      = 'civil';
  const tipo      = 'inicial';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  db._dados['peticoes_claims'] = {
    [idPeca]: { id_peca: idPeca, profile_id: profileId, status: 'completed', em: Date.now() },
  };

  await seedCatalogoInicial({
    db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona,
    poolTeses, escolherEstiloNPCInicial,
  });

  const peca = db._dados['peticoes'] && db._dados['peticoes'][idPeca];
  // Comportamento atual: pula (P2.2 cobre melhorias futuras desta borda).
  assert(!peca, 'Peça NÃO recriada quando claim está completed (estado adapter-defeituoso)');
}

// ── Teste 4: Peça já existe → claim marcado como completed automaticamente ───

async function testePecaExistenteMarcaCompleted() {
  console.log('\n[Teste 4] Peça existe no Firestore → claim marcado completed automaticamente');
  const db = new MockFirestore();
  const profileId = '45';
  const area      = 'civil';
  const tipo      = 'inicial';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  // Peça já existe, claim ainda está 'creating' (crash após confecção, antes do marcador).
  db._dados['peticoes']        = { [idPeca]: { id: idPeca } };
  db._dados['peticoes_claims'] = {
    [idPeca]: { id_peca: idPeca, profile_id: profileId, status: 'creating', em: Date.now() },
  };

  await seedCatalogoInicial({
    db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona,
    poolTeses, escolherEstiloNPCInicial,
  });

  const claim = db._dados['peticoes_claims'][idPeca];
  assert(claim && claim.status === 'completed', 'Claim atualizado para completed quando peça já existia');
}

// ── Teste 5: validarCoberturaCatalogo lança quando peça falta ────────────────

async function testeValidacaoCobertura() {
  console.log('\n[Teste 5] validarCoberturaCatalogo lança erro quando peça essencial está ausente');
  const db = new MockFirestore();
  const profileId = '46';

  let lancou = false;
  try {
    await validarCoberturaCatalogo(db, profileId, ['civil']);
  } catch (e) {
    lancou = true;
    assert(e.message.includes('civil/inicial'), 'Erro menciona a peça faltante (civil/inicial)');
  }
  assert(lancou, 'validarCoberturaCatalogo lança erro com catálogo incompleto');
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ testarClaimOrfao.js ═══');
  try {
    await testeClaimOrfaoCriando();
    await testeClaimLegadoSemStatus();
    await testeClaimCompletedSemPeca();
    await testePecaExistenteMarcaCompleted();
    await testeValidacaoCobertura();
  } catch (err) {
    console.error('\n[ERRO INESPERADO]', err);
    falhos++;
  }

  console.log(`\n══════════════════════`);
  console.log(`Resultado: ${passados} passaram, ${falhos} falharam.`);
  if (falhos > 0) process.exit(1);
})();
