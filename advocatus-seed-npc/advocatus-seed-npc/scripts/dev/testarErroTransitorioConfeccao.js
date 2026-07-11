'use strict';

/**
 * TESTE: testarErroTransitorioConfeccao.js
 *
 * Valida que um erro transitório em confeccionarPecaSincrona() na primeira
 * tentativa não impede que o retry conclua com sucesso.
 *
 * Fluxo simulado:
 *   1. confeccionarPecaSincrona() lança erro na primeira chamada.
 *   2. O claim fica em estado 'creating' (nenhuma peça persistida).
 *   3. Segunda chamada a seedCatalogoInicial() deve retomar e concluir.
 */

const { MockFirestore } = require('./mockFirestore');
const { seedCatalogoInicial, idPecaEssencial } = require('../../functions/npc/seedCatalogoInicial');

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

const poolTeses = { civil: ['tese_a'], employment: ['tese_b'], empresarial: ['tese_c'] };
function escolherEstiloNPCInicial() { return 'legalista'; }

// ── Teste 1: erro transitório → retry conclui ─────────────────────────────────

async function testeErroTransitorioRetomado() {
  console.log('\n[Teste 1] Erro transitório em confeccionarPecaSincrona → retry conclui');
  const db = new MockFirestore();
  const profileId = '50';
  const area      = 'civil';
  const tipo      = 'inicial';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  // Contagem por peça (id_determinista), não um total global — 'civil' tem
  // mais de um tipo essencial (inicial, contestacao) e cada um deve ser
  // confeccionado no máximo 1x, exceto 'inicial' que sofre o erro
  // transitório e por isso é chamado 2x (falha + retry bem-sucedido).
  let chamadasTotais = 0;
  const chamadasPorPeca = {};
  function confeccionarComErroTransitorio({ db: _db, id_determinista }) {
    chamadasTotais++;
    chamadasPorPeca[id_determinista] = (chamadasPorPeca[id_determinista] || 0) + 1;
    if (chamadasTotais === 1) throw new Error('Erro transitório simulado na primeira chamada');
    // Demais chamadas: sucesso.
    _db._dados['peticoes'] = _db._dados['peticoes'] || {};
    _db._dados['peticoes'][id_determinista] = { id: id_determinista };
    return Promise.resolve({ id: id_determinista });
  }

  // Primeira tentativa — deve lançar erro mas deixar claim em 'creating'.
  let errou = false;
  try {
    await seedCatalogoInicial({
      db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona: confeccionarComErroTransitorio,
      poolTeses, escolherEstiloNPCInicial,
    });
  } catch {
    errou = true;
  }
  assert(errou, 'Primeira tentativa lançou erro (comportamento esperado do erro transitório)');

  const claimApos1 = db._dados['peticoes_claims'] && db._dados['peticoes_claims'][idPeca];
  assert(claimApos1 && claimApos1.status === 'creating', 'Claim ficou em "creating" após erro');

  const pecaApos1 = db._dados['peticoes'] && db._dados['peticoes'][idPeca];
  assert(!pecaApos1, 'Peça não foi criada na primeira tentativa (erro interrompeu)');

  // Segunda tentativa (retry) — deve retomar e concluir.
  await seedCatalogoInicial({
    db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona: confeccionarComErroTransitorio,
    poolTeses, escolherEstiloNPCInicial,
  });

  const pecaFinal = db._dados['peticoes'] && db._dados['peticoes'][idPeca];
  assert(!!pecaFinal, 'Peça criada com sucesso no retry');

  const claimFinal = db._dados['peticoes_claims'][idPeca];
  assert(claimFinal && claimFinal.status === 'completed', 'Claim marcado como completed após retry');

  assert(
    chamadasPorPeca[idPeca] === 2,
    `confeccionarPecaSincrona chamada exatamente 2 vezes para a peça que sofreu o erro transitório (foi: ${chamadasPorPeca[idPeca]})`,
  );

  const idPecaContestacao = idPecaEssencial(profileId, area, 'contestacao');
  assert(
    chamadasPorPeca[idPecaContestacao] === 1,
    `confeccionarPecaSincrona chamada exatamente 1 vez para a peça não afetada pelo erro (foi: ${chamadasPorPeca[idPecaContestacao]})`,
  );

  const totalPecasDistintas = Object.keys(chamadasPorPeca).length;
  assert(totalPecasDistintas === 2, `exatamente 2 peças distintas confeccionadas nesta run (foram: ${totalPecasDistintas})`);
}

// ── Teste 2: erro no adapter que não lança mas não persiste ───────────────────

async function testeAdapterSemPersistencia() {
  console.log('\n[Teste 2] Adapter que não persiste a peça → lança erro na transaction de conclusão');
  const db = new MockFirestore();
  const profileId = '51';
  const area      = 'civil';
  const tipo      = 'contestacao';
  const idPeca    = idPecaEssencial(profileId, area, tipo);

  // Adapter defeituoso: retorna sem persistir no caminho /peticoes/{idPeca}.
  function adapterDefeituoso() {
    return Promise.resolve({ id: 'outro_id_qualquer' });
  }

  let errou = false;
  let mensagemErro = '';
  try {
    await seedCatalogoInicial({
      db, profileId, areas: [area], skills: {}, confeccionarPecaSincrona: adapterDefeituoso,
      poolTeses, escolherEstiloNPCInicial,
    });
  } catch (e) {
    errou = true;
    mensagemErro = e.message;
  }

  assert(errou, 'Lançou erro quando adapter não persistiu com id_determinista');
  assert(
    mensagemErro.includes('id_determinista'),
    `Mensagem de erro menciona "id_determinista" (foi: "${mensagemErro.slice(0, 80)}")`
  );
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ testarErroTransitorioConfeccao.js ═══');
  try {
    await testeErroTransitorioRetomado();
    await testeAdapterSemPersistencia();
  } catch (err) {
    console.error('\n[ERRO INESPERADO]', err);
    falhos++;
  }

  console.log(`\n══════════════════════`);
  console.log(`Resultado: ${passados} passaram, ${falhos} falharam.`);
  if (falhos > 0) process.exit(1);
})();
