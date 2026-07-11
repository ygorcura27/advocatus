'use strict';

/**
 * TESTE: testarValidacaoCatalogo.js
 *
 * Valida que validarCoberturaCatalogo() impede que materializarNPC() marque
 * um NPC como ready quando alguma peça essencial está ausente.
 *
 * Fluxo simulado:
 *   1. Criar perfil com peças de catálogo incompletas.
 *   2. Chamar validarCoberturaCatalogo() diretamente → deve lançar erro.
 *   3. Criar perfil com catálogo completo → deve passar sem erro.
 *   4. Simular materializarNPC() com peça removida → NPC não fica ready.
 */

const { MockFirestore } = require('./mockFirestore');
const {
  validarCoberturaCatalogo,
  idPecaEssencial,
  TIPOS_PETICAO_ESSENCIAIS,
} = require('../../functions/npc/seedCatalogoInicial');

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

// ── Teste 1: catálogo incompleto → lança erro ─────────────────────────────────

async function testeCatalogoIncompleto() {
  console.log('\n[Teste 1] Catálogo incompleto → validarCoberturaCatalogo lança erro');
  const db = new MockFirestore();
  const profileId = '60';
  const areas = ['civil'];

  // Criar apenas um dos dois tipos obrigatórios (inicial mas não contestacao).
  const idInicial = idPecaEssencial(profileId, 'civil', 'inicial');
  db._dados['peticoes'] = { [idInicial]: { id: idInicial } };

  let lancou = false;
  let mensagem = '';
  try {
    await validarCoberturaCatalogo(db, profileId, areas);
  } catch (e) {
    lancou = true;
    mensagem = e.message;
  }

  assert(lancou, 'Lançou erro com catálogo incompleto');
  assert(mensagem.includes('contestacao'), `Mensagem menciona "contestacao" (foi: "${mensagem.slice(0,100)}")`);
  assert(mensagem.includes(String(profileId)), 'Mensagem inclui o profileId');
}

// ── Teste 2: catálogo completo → não lança ────────────────────────────────────

async function testeCatalogoCompleto() {
  console.log('\n[Teste 2] Catálogo completo → validarCoberturaCatalogo não lança');
  const db = new MockFirestore();
  const profileId = '61';
  const areas = ['civil', 'employment'];

  // Criar todas as peças obrigatórias.
  db._dados['peticoes'] = {};
  for (const area of areas) {
    for (const tipo of (TIPOS_PETICAO_ESSENCIAIS[area] || [])) {
      const id = idPecaEssencial(profileId, area, tipo);
      db._dados['peticoes'][id] = { id };
    }
  }

  let lancou = false;
  try {
    await validarCoberturaCatalogo(db, profileId, areas);
  } catch {
    lancou = true;
  }

  assert(!lancou, 'Não lançou erro com catálogo completo');
}

// ── Teste 3: peça removida após confecção → NPC não fica ready ────────────────

async function testePecaRemovidaImpede() {
  console.log('\n[Teste 3] Peça removida deliberadamente → NPC não pode ficar ready');
  const db = new MockFirestore();
  const profileId = '62';
  const areas = ['criminal'];

  // Criar todas as peças obrigatórias.
  db._dados['peticoes'] = {};
  for (const tipo of (TIPOS_PETICAO_ESSENCIAIS['criminal'] || [])) {
    const id = idPecaEssencial(profileId, 'criminal', tipo);
    db._dados['peticoes'][id] = { id };
  }

  // Verificar que está completo.
  let lancouAntes = false;
  try { await validarCoberturaCatalogo(db, profileId, areas); } catch { lancouAntes = true; }
  assert(!lancouAntes, 'Catálogo inicialmente completo');

  // Remover deliberadamente uma peça.
  const idRemovida = idPecaEssencial(profileId, 'criminal', 'defesa_previa');
  delete db._dados['peticoes'][idRemovida];

  let lancouDepois = false;
  let msgDepois = '';
  try {
    await validarCoberturaCatalogo(db, profileId, areas);
  } catch (e) {
    lancouDepois = true;
    msgDepois = e.message;
  }

  assert(lancouDepois, 'Lançou erro após remoção da peça');
  assert(msgDepois.includes('defesa_previa'), `Erro menciona a peça removida (foi: "${msgDepois.slice(0,100)}")`);
}

// ── Teste 4: múltiplas áreas, uma peça faltando ───────────────────────────────

async function testeMultiplasAreasParciais() {
  console.log('\n[Teste 4] Múltiplas áreas, peça faltando em tax → erro identifica corretamente');
  const db = new MockFirestore();
  const profileId = '63';
  const areas = ['civil', 'tax'];

  db._dados['peticoes'] = {};
  // Completar civil.
  for (const tipo of TIPOS_PETICAO_ESSENCIAIS['civil']) {
    const id = idPecaEssencial(profileId, 'civil', tipo);
    db._dados['peticoes'][id] = { id };
  }
  // Completar apenas impugnacao de tax (falta recurso_voluntario).
  const idImpug = idPecaEssencial(profileId, 'tax', 'impugnacao');
  db._dados['peticoes'][idImpug] = { id: idImpug };

  let lancou = false;
  let msg = '';
  try {
    await validarCoberturaCatalogo(db, profileId, areas);
  } catch (e) {
    lancou = true;
    msg = e.message;
  }

  assert(lancou, 'Lançou erro com peça de tax faltando');
  assert(msg.includes('recurso_voluntario'), `Identifica "recurso_voluntario" como faltante (foi: "${msg.slice(0,120)}")`);
  assert(!msg.includes('civil/inicial'), 'Não menciona peças de civil (estão completas)');
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ testarValidacaoCatalogo.js ═══');
  try {
    await testeCatalogoIncompleto();
    await testeCatalogoCompleto();
    await testePecaRemovidaImpede();
    await testeMultiplasAreasParciais();
  } catch (err) {
    console.error('\n[ERRO INESPERADO]', err);
    falhos++;
  }

  console.log(`\n══════════════════════`);
  console.log(`Resultado: ${passados} passaram, ${falhos} falharam.`);
  if (falhos > 0) process.exit(1);
})();
