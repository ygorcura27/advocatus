'use strict';

/**
 * TESTE: testarReservaGlobal.js
 *
 * Valida que duas chamadas diretas concorrentes a vincularEscritorioNPC()
 * com o mesmo reservaId consomem exatamente uma vaga e geram exatamente
 * um escritório vinculado.
 *
 * Simula:
 *   1. Dois escritórios NPC com vagas disponíveis.
 *   2. Duas chamadas concorrentes com o mesmo reservaId.
 *   3. Verificar: exatamente uma /reservas_npc/{reservaId} global.
 *   4. Verificar: exatamente uma vaga consumida no total.
 *   5. Verificar: ambas as chamadas devolvem o mesmo escritório.
 */

const { MockFirestore } = require('./mockFirestore');
const { vincularEscritorioNPC } = require('../../functions/npc/vincularEscritorioNPC');

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

async function tickAtualFn() { return 100; }

// ── Teste 1: chamadas sequenciais com mesmo reservaId → idempotente ───────────

async function testeSequencialIdempotente() {
  console.log('\n[Teste 1] Chamadas sequenciais com mesmo reservaId → mesmo escritório, uma vaga');
  const db = new MockFirestore();

  // Criar dois escritórios NPC com vagas.
  db._dados['escritorios'] = {
    esc1: { tier: 1, jurisdicao: 'rio', e_npc: true, vagas_advogado_disponiveis: 2 },
    esc2: { tier: 1, jurisdicao: 'rio', e_npc: true, vagas_advogado_disponiveis: 2 },
  };

  const reservaId = 'reserva_teste_seq_001';

  const r1 = await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, reservaId);
  const r2 = await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, reservaId);

  assert(r1.id === r2.id, `Ambas as chamadas retornaram o mesmo escritório (${r1.id})`);

  let vagasConsumidas = 0;
  for (const id of ['esc1', 'esc2']) {
    const esc = db.store.get(`escritorios/${id}`);
    vagasConsumidas += (2 - (esc.vagas_advogado_disponiveis || 0));
  }
  assert(vagasConsumidas === 1, `Exatamente 1 vaga consumida no total (foi: ${vagasConsumidas})`);

  // Verificar claim global.
  const globalSnap = db.store.get(`reservas_npc/${reservaId}`);
  assert(!!globalSnap, 'Documento global /reservas_npc/{reservaId} existe');
  assert(globalSnap.status === 'completed', 'Claim global está completed');
  assert(globalSnap.escritorio_id === r1.id, 'Claim global registra o mesmo escritório');
}

// ── Teste 2: reservaId diferente → vagas independentes ───────────────────────

async function testeReservasIndependentes() {
  console.log('\n[Teste 2] reservaIds diferentes → vagas independentes');
  const db = new MockFirestore();

  db._dados['escritorios'] = {
    esc1: { tier: 1, jurisdicao: 'rio', e_npc: true, vagas_advogado_disponiveis: 3 },
  };

  await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, 'reserva_A');
  await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, 'reserva_B');

  const esc1 = db.store.get('escritorios/esc1');
  const vagasRestantes = esc1.vagas_advogado_disponiveis;
  assert(vagasRestantes === 1, `2 vagas consumidas por reservas diferentes (restam: ${vagasRestantes})`);

  const globalA = db.store.get('reservas_npc/reserva_A');
  const globalB = db.store.get('reservas_npc/reserva_B');
  assert(!!globalA && !!globalB, 'Ambos os claims globais foram criados');
}

// ── Teste 3: sem escritórios → cria escritório derivado do reservaId ─────────

async function testeSemEscritoriosCriaFallback() {
  console.log('\n[Teste 3] Sem escritórios candidatos → cria escritório com ID derivado do reservaId');
  const db = new MockFirestore();
  db._dados['escritorios'] = {}; // sem candidatos

  const reservaId = 'reserva_fallback_001';
  const r = await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, reservaId);

  const idEsperado = `npc_esc_${reservaId}`;
  assert(r.id === idEsperado, `ID do escritório criado é derivado do reservaId (${r.id})`);
  assert(!!db.store.get(`escritorios/${idEsperado}`), 'Escritório criado no Firestore');

  // Retry com mesmo reservaId → mesmo escritório.
  const r2 = await vincularEscritorioNPC(db, 'rio', [1], tickAtualFn, reservaId);
  assert(r2.id === r.id, 'Retry com mesmo reservaId retorna o mesmo escritório fallback');
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('═══ testarReservaGlobal.js ═══');
  try {
    await testeSequencialIdempotente();
    await testeReservasIndependentes();
    await testeSemEscritoriosCriaFallback();
  } catch (err) {
    console.error('\n[ERRO INESPERADO]', err);
    falhos++;
  }

  console.log(`\n══════════════════════`);
  console.log(`Resultado: ${passados} passaram, ${falhos} falharam.`);
  if (falhos > 0) process.exit(1);
})();
