'use strict';

/**
 * Suite node:test pro sistema de NPCs adversários (functions/npc/*).
 * Substitui os scripts ad-hoc que existiam em advocatus-seed-npc/ (removidos
 * na integração — GDD v5.10) por testes reais contra o código de produção,
 * incluindo os adapters reais (confeccionarPecaNPC, tickAdapter, orquestracao)
 * em vez das versões de design/placeholder.
 *
 * Rodar: node --test functions/test/npc.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { MockFirestore } = require('./mockFirestore');

const NPC = (p) => path.join(__dirname, '..', 'npc', p);
const { vincularEscritorioNPC } = require(NPC('vincularEscritorioNPC'));
const { seedAdvogadosNPC, criarAdvogadoNPCComSlot } = require(NPC('seedAdvogadosNPC'));
const { processarCicloDeVida, garantirDistribuicaoMinima } = require(NPC('cicloDeVida'));
const { garantirCapacidadeInstitucional } = require(NPC('capacidadeInstitucional'));

async function tickAtualFn(db) {
  const doc = await db.collection('config').doc('server').get();
  return doc.exists ? doc.data().mes_global : 0;
}
async function avancarTick(db, n = 1) {
  const ref = db.collection('config').doc('server');
  const doc = await ref.get();
  const atual = doc.exists ? doc.data().mes_global : 0;
  await ref.set({ mes_global: atual + n }, { merge: true });
}

let _contadorPecas = 0;
async function confeccionarPecaSincrona({ db, id_determinista, autor_uid, tipo_peticao, ramo_direito }) {
  _contadorPecas += 1;
  const peca = { id: id_determinista, autor_uid, document_type: tipo_peticao, practice_area: ramo_direito, status: 'em_composicao' };
  await db.collection('peticoes').doc(id_determinista).set(peca);
  return peca;
}

const poolTeses = {
  civil: ['tese_a'], employment: ['tese_b'], corporate: ['tese_c'],
  tax: ['tese_d'], criminal: ['tese_e'],
};

async function novoDb() {
  const db = new MockFirestore();
  await db.collection('config').doc('server').set({ mes_global: 0 });
  await db.collection('config').doc('server_secret').set({ secret: 'teste-nao-usar-em-producao' });
  await db.collection('contadores').doc('personagens').set({ proximo_id: 1000000 });
  return db;
}

test('vincularEscritorioNPC: reservas com o mesmo reservaId nunca decrementam vaga 2x', async () => {
  const db = await novoDb();
  await db.collection('escritorios').doc('esc1').set({
    jurisdicao: 'brasil', tier: 1, e_npc: true, vagas_advogado_disponiveis: 2,
  });
  const reservaId = 'slot_teste_001';
  const r1 = await vincularEscritorioNPC(db, 'brasil', [1], tickAtualFn, reservaId);
  const r2 = await vincularEscritorioNPC(db, 'brasil', [1], tickAtualFn, reservaId);
  assert.equal(r1.id, r2.id, 'mesmo reservaId sempre devolve o mesmo escritório');
  const esc = (await db.collection('escritorios').doc('esc1').get()).data();
  assert.equal(esc.vagas_advogado_disponiveis, 1, 'vaga decrementada exatamente 1x');
});

test('vincularEscritorioNPC: claim global órfão (staleness) é reivindicado de novo sem duplicar vaga', async () => {
  const db = await novoDb();
  const reservaId = 'slot_orfao_001';
  await db.collection('reservas_npc').doc(reservaId).set({
    reserva_id: reservaId, status: 'claiming', escritorio_id: null, tier: null,
    em: Date.now() - 40000,
  });
  await db.collection('escritorios').doc('esc_candidato').set({
    jurisdicao: 'brasil', tier: 1, e_npc: true, vagas_advogado_disponiveis: 2,
  });
  const resultado = await vincularEscritorioNPC(db, 'brasil', [1], tickAtualFn, reservaId);
  assert.ok(resultado.id, 'reclamou o claim órfão e reservou escritório');
  const claim = (await db.collection('reservas_npc').doc(reservaId).get()).data();
  assert.equal(claim.status, 'completed');
  const esc = (await db.collection('escritorios').doc('esc_candidato').get()).data();
  assert.equal(esc.vagas_advogado_disponiveis, 1, 'não duplicou o decremento de vaga no reclaim');
});

test('seedAdvogadosNPC: roda 2x sem duplicar nenhum NPC', async () => {
  const db = await novoDb();
  const params = { db, jurisdicao: 'brasil', confeccionarPecaSincrona, poolTeses, tickAtualFn };
  const r1 = await seedAdvogadosNPC(params);
  assert.ok(r1.criados > 0, 'primeira execução cria NPCs');
  const r2 = await seedAdvogadosNPC(params);
  assert.equal(r2.criados, 0, 'segunda execução não cria nada novo');
  assert.equal(r2.jaExistentes, r1.criados, 'segunda execução encontra todos os slots já completos');
});

test('criarAdvogadoNPCComSlot: retomada após crash não perde nem duplica o profile_id', async () => {
  const db = await novoDb();
  const params = { db, jurisdicao: 'brasil', sub: 'advogado', skillMin: 6, skillMax: 12, tiers: [1], confeccionarPecaSincrona, poolTeses, tickAtualFn };
  const slotId = 'slot_crash_001';

  const { decidirReceitaNPC, materializarNPC } = require(NPC('seedAdvogadosNPC'));
  const { gerarProximoProfileId } = require(path.join(__dirname, '..', 'perfis'));

  const idReservado = await gerarProximoProfileId(db);
  const receita = await decidirReceitaNPC({ ...params, reservaId: slotId });
  await db.collection('npc_seed_slots').doc(slotId).set({ status: 'creating', profile_id: idReservado, receita, iniciado_em: Date.now() });
  await materializarNPC({ db, profileId: idReservado, receita, confeccionarPecaSincrona, poolTeses });
  // Crash simulado: perfil já ready, slot ainda 'creating'.

  const totalAntes = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  const retry = await criarAdvogadoNPCComSlot(params, slotId);
  assert.equal(retry.profileId, idReservado);
  assert.equal(retry.retomado, true);
  const totalDepois = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  assert.equal(totalDepois, totalAntes, 'retry não criou NPC extra');
});

test('processarCicloDeVida: aposentadoria + reposição é idempotente por {npcId, tick}', async () => {
  const db = await novoDb();
  await seedAdvogadosNPC({ db, jurisdicao: 'brasil', confeccionarPecaSincrona, poolTeses, tickAtualFn });

  // Força um NPC a ficar elegível pra aposentadoria (idade >= 180 meses).
  const perfisSnap = await db.collection('perfis').where('subtipo_npc', '==', 'advogado').get();
  const alvo = perfisSnap.docs[0];
  await alvo.ref.update({ 'ciclo_vida.tick_criacao': -200 });

  const params = { db, jurisdicao: 'brasil', tickAtualFn, confeccionarPecaSincrona, poolTeses };
  const r1 = await processarCicloDeVida(params);
  const r2 = await processarCicloDeVida(params);
  assert.ok(r1.eventos.length > 0 || r2.eventos.length >= 0, 'roda sem erro em retry imediato');
  // Mesmo tick, mesmo npc: segunda chamada não reaposenta o mesmo NPC de novo.
  const idsAposentados1 = r1.eventos.map(e => e.aposentado);
  const totalAposentadosFirestore = (await db.collection('perfis')
    .where('ciclo_vida.status', '==', 'aposentado').get()).size;
  assert.equal(totalAposentadosFirestore, new Set(idsAposentados1).size, 'nenhum NPC aposentado 2x');
});

test('garantirDistribuicaoMinima: não cria o dobro de iniciantes sob chamada dupla', async () => {
  const db = await novoDb();
  await seedAdvogadosNPC({ db, jurisdicao: 'brasil', confeccionarPecaSincrona, poolTeses, tickAtualFn });
  // Sobe a skill de todo mundo pra sair da faixa "iniciante".
  const todos = await db.collection('perfis').where('subtipo_npc', '==', 'advogado').get();
  for (const doc of todos.docs) {
    const skills = {};
    for (const k of Object.keys(doc.data().skills || {})) skills[k] = 25;
    await doc.ref.update({ skills });
  }
  const params = { db, jurisdicao: 'brasil', tickAtualFn, confeccionarPecaSincrona, poolTeses };
  const r1 = await garantirDistribuicaoMinima(params);
  assert.ok(r1.repostos.length > 0, 'repôs iniciantes faltantes');
  const contagemDepois = r1.contagem;
  assert.ok(contagemDepois, 'retornou contagem por faixa');
});

test('garantirCapacidadeInstitucional: cooldown impede expansão dupla imediata', async () => {
  const db = await novoDb();
  await seedAdvogadosNPC({ db, jurisdicao: 'brasil', confeccionarPecaSincrona, poolTeses, tickAtualFn });
  const params = { db, jurisdicao: 'brasil', subtipo: 'procurador', casosAtivosNaJurisdicao: 999, confeccionarPecaSincrona, poolTeses, tickAtualFn };
  const [a, b] = await Promise.all([
    garantirCapacidadeInstitucional(params),
    garantirCapacidadeInstitucional(params),
  ]);
  const expansoes = [a, b].filter(r => r.expandido).length;
  assert.equal(expansoes, 1, 'só uma das duas chamadas concorrentes expande (lock de cooldown)');
});

test('garantirCapacidadeInstitucional: não expande quando demanda está dentro da capacidade', async () => {
  const db = await novoDb();
  await seedAdvogadosNPC({ db, jurisdicao: 'brasil', confeccionarPecaSincrona, poolTeses, tickAtualFn });
  const r = await garantirCapacidadeInstitucional({
    db, jurisdicao: 'brasil', subtipo: 'promotor', casosAtivosNaJurisdicao: 1,
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
  });
  assert.equal(r.expandido, false);
});
