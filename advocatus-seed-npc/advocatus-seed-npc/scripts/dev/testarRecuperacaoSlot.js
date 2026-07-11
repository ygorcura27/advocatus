'use strict';

/**
 * GDD v5.6 — prova o fix P0.1: um slot preso em 'creating' precisa ser
 * retomável, não travar para sempre nem duplicar. Simula os dois cenários
 * exatos da 4ª auditoria:
 *
 *  A. Crash DEPOIS do /perfis/{id} ser criado, mas ANTES do slot virar
 *     'completed' — retry não pode criar um segundo NPC.
 *  B. Crash ANTES do /perfis/{id} existir (slot reivindicado, profile_id
 *     reservado, mas nada mais aconteceu) — retry precisa criar o NPC
 *     usando o MESMO profile_id, não travar para sempre nem pular um ID.
 *
 * Rodar: node scripts/dev/testarRecuperacaoSlot.js
 */
const { MockFirestore } = require('./mockFirestore');
const { criarAdvogadoNPCComSlot } = require('../../functions/npc/seedAdvogadosNPC');
const { gerarProximoId } = require('../../functions/utils/ids');

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FALHA:', msg);
    process.exit(1);
  }
}

async function main() {
  const db = new MockFirestore();
  await db.collection('contadores').doc('personagens').set({ proximo_id: 2000000 });

  async function tickAtualFn(dbRef) {
    const ref = dbRef.collection('config').doc('tick_global');
    const doc = await ref.get();
    if (!doc.exists) { await ref.set({ tick_atual: 0 }); return 0; }
    return doc.data().tick_atual;
  }

  let contadorPecas = 0;
  async function confeccionarPecaSincrona(dados) {
    contadorPecas += 1;
    // ADAPTER OBRIGATÓRIO (v5.10): deve persistir usando id_determinista como doc ID.
    const id = dados.id_determinista;
    await db.collection('peticoes').doc(id).set({
      id, autor_uid: dados.autor_uid, ramo_direito: dados.ramo_direito,
      tipo_peticao: dados.tipo_peticao, nota_teto: 15, popularidade: 0,
    });
    return { id, nota_teto: 15, popularidade: 0 };
  }
  const poolTeses = {
    civil: ['tese_a'], employment: ['tese_b'], empresarial: ['tese_c'],
    tax: ['tese_d'], criminal: ['tese_e'],
  };

  const paramsBase = {
    db, jurisdicao: 'circuit_1', sub: 'advogado', skillMin: 6, skillMax: 12, tiers: [1],
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
  };

  console.log('== CENÁRIO A: crash DEPOIS do perfil ficar READY, ANTES de marcar o slot completed ==');
  const slotIdA = 'circuit_1_v5_5_advogado_6-12_teste_A';

  const { decidirReceitaNPC, materializarNPC } = require('../../functions/npc/seedAdvogadosNPC');
  const idReservadoA = await gerarProximoId(db);
  const receitaA = await decidirReceitaNPC({ ...paramsBase, reservaId: slotIdA });
  await db.collection('npc_seed_slots').doc(slotIdA).set({
    status: 'creating', profile_id: idReservadoA, receita: receitaA, iniciado_em: Date.now(),
  });
  await materializarNPC({ db, profileId: idReservadoA, receita: receitaA, confeccionarPecaSincrona, poolTeses });
  // ^ perfil criado e READY, mas o slot continua 'creating' — o crash foi entre 'ready' e fechar o slot.

  const totalAntesRetryA = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  const resultadoRetryA = await criarAdvogadoNPCComSlot(paramsBase, slotIdA);
  assert(resultadoRetryA.profileId === idReservadoA, `Retry deveria devolver o MESMO profile_id (${idReservadoA}), veio ${resultadoRetryA.profileId}`);
  assert(resultadoRetryA.retomado === true, 'Retry deveria sinalizar que retomou (perfil já ready), não criou de novo');
  const totalDepoisRetryA = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  assert(totalDepoisRetryA === totalAntesRetryA, `Não deveria criar NPC novo — antes ${totalAntesRetryA}, depois ${totalDepoisRetryA}`);
  const slotFinalA = (await db.collection('npc_seed_slots').doc(slotIdA).get()).data();
  assert(slotFinalA.status === 'completed', `Slot deveria estar 'completed' após o retry, está '${slotFinalA.status}'`);
  console.log(`✅ Cenário A: retry NÃO duplicou (continua ${totalDepoisRetryA}), slot travado fechado como 'completed'`);

  console.log('\n== CENÁRIO P1.1 (o achado da auditoria): perfil EXISTE mas está creating, catálogo parcial ==');
  const slotIdP = 'circuit_1_v5_5_advogado_6-12_teste_P11';
  const idReservadoP = await gerarProximoId(db);
  const receitaP = await decidirReceitaNPC({ ...paramsBase, reservaId: slotIdP });
  await db.collection('npc_seed_slots').doc(slotIdP).set({
    status: 'creating', profile_id: idReservadoP, receita: receitaP, iniciado_em: Date.now(),
  });
  // Simula crash NO MEIO do catálogo: cria só o perfil (creating) e a
  // política, mas NENHUMA peça de catálogo.
  await db.collection('perfis').doc(idReservadoP).set({
    profile_id: idReservadoP, tipo: 'npc', subtipo_npc: 'advogado', nome: receitaP.nome,
    skills: receitaP.skills, tracos: receitaP.tracos,
    banca: { escritorio_id: receitaP.escritorio_id, jurisdicao: 'circuit_1', tier_escritorio: receitaP.tier_escritorio, areas_atuacao: receitaP.areas, polo_preferencial: receitaP.polo_preferencial },
    stats_confronto: {}, ciclo_vida: { tick_criacao: 0, status: 'ativo', tick_aposentadoria: null },
    sistema: { inicializacao: 'creating' }, saude_mental: 80,
  });
  const pecasAntesP = contadorPecas;

  const resultadoRetryP = await criarAdvogadoNPCComSlot(paramsBase, slotIdP);
  assert(resultadoRetryP.profileId === idReservadoP, 'Retry deveria continuar o mesmo NPC, não criar outro');

  const perfilP = (await db.collection('perfis').doc(idReservadoP).get()).data();
  assert(perfilP.sistema.inicializacao === 'ready', `P1.1: perfil deveria ter sido COMPLETADO para 'ready', está '${perfilP.sistema.inicializacao}'`);
  assert(contadorPecas > pecasAntesP, 'P1.1: o catálogo faltante deveria ter sido criado no retry (não foi só fechar o slot)');
  const slotFinalP = (await db.collection('npc_seed_slots').doc(slotIdP).get()).data();
  assert(slotFinalP.status === 'completed', 'Slot deveria estar completed só APÓS o perfil virar ready');
  console.log('✅ P1.1 CORRIGIDO: perfil creating NÃO fez o slot fechar prematuramente — foi completado até ready, catálogo incluído');

  console.log('\n== CENÁRIO B: crash ANTES do perfil existir (só o profile_id foi reservado) ==');
  const slotIdB = 'circuit_1_v5_5_advogado_6-12_teste_B';
  const idReservadoB = await gerarProximoId(db);
  await db.collection('npc_seed_slots').doc(slotIdB).set({
    status: 'creating', profile_id: idReservadoB, iniciado_em: Date.now(),
  });
  // Nenhum /perfis/{idReservadoB} foi criado — exatamente o crash mais cedo possível.

  const perfilAntesB = await db.collection('perfis').doc(idReservadoB).get();
  assert(!perfilAntesB.exists, 'Setup do teste: perfil não deveria existir ainda');

  const resultadoRetryB = await criarAdvogadoNPCComSlot(paramsBase, slotIdB);
  assert(resultadoRetryB.profileId === idReservadoB, `Retry deveria criar o perfil usando o profile_id JÁ RESERVADO (${idReservadoB}), veio ${resultadoRetryB.profileId}`);

  const perfilDepoisB = await db.collection('perfis').doc(idReservadoB).get();
  assert(perfilDepoisB.exists, 'Perfil deveria ter sido criado no retry, usando o ID reservado');
  assert(perfilDepoisB.data().sistema.inicializacao === 'ready', 'Perfil retomado deveria terminar em sistema.inicializacao = "ready"');

  const slotFinalB = (await db.collection('npc_seed_slots').doc(slotIdB).get()).data();
  assert(slotFinalB.status === 'completed', 'Slot do cenário B deveria estar completed após o retry');
  console.log(`✅ Cenário B: retry criou o NPC usando o MESMO profile_id reservado (${idReservadoB}) — não travou, não pulou o ID, não duplicou`);

  console.log('\n== CENÁRIO C (regressão): slot já completed continua idempotente ==');
  const totalAntesC = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  const resultadoRetryC = await criarAdvogadoNPCComSlot(paramsBase, slotIdA); // slot A já está completed
  assert(resultadoRetryC.jaExistia === true, 'Chamar de novo um slot completed deveria retornar jaExistia=true');
  assert(resultadoRetryC.profileId === idReservadoA, 'Deveria continuar retornando o mesmo profile_id original');
  const totalFinal = (await db.collection('perfis').where('tipo', '==', 'npc').get()).size;
  assert(totalFinal === totalAntesC, `Uma 3ª chamada sobre slot já completed não deveria criar nada — antes ${totalAntesC}, depois ${totalFinal}`);
  console.log('✅ Cenário C: slot já completed continua idempotente (comportamento da versão anterior preservado)');

  console.log('\n🎉 TODOS OS TESTES DE RECUPERAÇÃO DE SLOT PASSARAM — nenhum crash simulado travou ou duplicou');
}

main().catch((err) => {
  console.error('❌ ERRO NÃO TRATADO:', err);
  process.exit(1);
});
