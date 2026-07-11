'use strict';

/**
 * Teste local de ponta a ponta — sem Firebase real. Roda:
 *   1. seedAdvogadosNPC() para uma jurisdição
 *   2. verificações estruturais (fix #5, fix #24, fix #9)
 *   3. várias rodadas de processarCicloDeVida() (fix #16)
 *   4. garantirCapacidadeInstitucional() sob demanda simulada (fix #37)
 *
 * Rodar: node scripts/dev/testarSeedLocal.js
 */
const { MockFirestore } = require('./mockFirestore');
const { seedAdvogadosNPC, FAIXAS_SEED } = require('../../functions/npc/seedAdvogadosNPC');
const { processarCicloDeVida } = require('../../functions/npc/cicloDeVida');
const { garantirCapacidadeInstitucional } = require('../../functions/npc/capacidadeInstitucional');

// --- Stubs de adaptação (ver comentários de ADAPTER nos módulos reais) ---

// tickAtualFn: mock de relógio global — inicializa o doc e incrementa sob controle do teste.
async function tickAtualFn(db) {
  const ref = db.collection('config').doc('tick_global');
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({ tick_atual: 0 });
    return 0;
  }
  return doc.data().tick_atual;
}
async function avancarTick(db, n = 1) {
  const ref = db.collection('config').doc('tick_global');
  const doc = await ref.get();
  const atual = doc.exists ? doc.data().tick_atual : 0;
  await ref.set({ tick_atual: atual + n });
}

// confeccionarPecaSincrona: stub que só registra a chamada e devolve uma
// peça mínima — no projeto real, troque pela função de confecção do v5.1.
let contadorPecas = 0;
async function confeccionarPecaSincrona({ autor_uid, tipo_peticao, ramo_direito, estilo_escrita, tese_central }) {
  contadorPecas += 1;
  return {
    id: `peca_${contadorPecas}`,
    autor_uid, tipo_peticao, ramo_direito, estilo_escrita, tese_central,
    nota_teto: 10 + Math.floor(Math.random() * 16), // 10–25, só para o teste ter variação
    popularidade: 0,
  };
}

// poolTeses: stub mínimo por ramo — no projeto real, aponte para POOL_TESES (v5.1 §20).
const poolTeses = {
  civil: ['responsabilidade_objetiva', 'inadimplemento_contratual', 'vicio_produto'],
  employment: ['horas_extras', 'assedio_moral', 'equiparacao_salarial'],
  empresarial: ['quebra_contratual', 'concorrencia_desleal', 'dissolucao_societaria'],
  tax: ['creditamento_indevido', 'base_calculo_erronea', 'decadencia'],
  criminal: ['excludente_ilicitude', 'nulidade_processual', 'atipicidade'],
};

async function main() {
  const db = new MockFirestore();
  const jurisdicao = 'circuit_1';

  // Mesma inicialização única exigida pelo contador atômico real
  // (GDD v5.1 Parte XI): /contadores/personagens precisa existir antes do
  // primeiro gerarProximoId(). No projeto real isso já está feito.
  await db.collection('contadores').doc('personagens').set({ proximo_id: 1000000 });

  console.log('== 1. Rodando seedAdvogadosNPC (1ª execução) ==');
  const resumo = await seedAdvogadosNPC({ db, jurisdicao, confeccionarPecaSincrona, poolTeses, tickAtualFn });
  console.log('Resumo:', JSON.stringify({ criados: resumo.criados, jaExistentes: resumo.jaExistentes, porSubtipo: resumo.porSubtipo }, null, 2));

  const totalEsperado = FAIXAS_SEED.reduce((s, f) => s + f.n, 0);
  assert(resumo.criados === totalEsperado, `Esperava ${totalEsperado} NPCs criados na 1ª execução, veio ${resumo.criados}`);
  console.log(`✅ 1ª execução criou exatamente ${resumo.criados} NPCs`);

  console.log('\n== 1b. RODANDO O SEED DE NOVO (fix P0.1 — não pode duplicar) ==');
  const resumo2 = await seedAdvogadosNPC({ db, jurisdicao, confeccionarPecaSincrona, poolTeses, tickAtualFn });
  console.log('Resumo da 2ª execução:', JSON.stringify({ criados: resumo2.criados, jaExistentes: resumo2.jaExistentes }, null, 2));
  assert(resumo2.criados === 0, `2ª execução deveria criar 0 NPCs novos, criou ${resumo2.criados}`);
  assert(resumo2.jaExistentes === totalEsperado, `2ª execução deveria encontrar ${totalEsperado} slots já completos, encontrou ${resumo2.jaExistentes}`);

  const snapAposSegundaExecucao = await db.collection('perfis').where('tipo', '==', 'npc').get();
  assert(snapAposSegundaExecucao.size === totalEsperado, `Total de NPCs após 2 execuções deveria continuar ${totalEsperado}, veio ${snapAposSegundaExecucao.size}`);
  console.log(`✅ Rodar o seed 2x não duplicou nada — continua em ${snapAposSegundaExecucao.size} NPCs (não ${totalEsperado * 2})`);

  console.log('\n== 2. Verificações estruturais ==');
  const snap = await db.collection('perfis').where('tipo', '==', 'npc').get();
  assert(snap.size === totalEsperado, 'Contagem de /perfis não bate com o resumo do seed');

  // [Correção P1.8] Antes só checava !== null, o que deixava passar um bug
  // de tier_escritorio=5 num escritório que na verdade é tier=1. Agora
  // confere contra o documento REAL do escritório, para TODOS os NPCs.
  let tierIncoerente = 0;
  let comPoliticaNoDocPublico = 0;
  for (const doc of snap.docs) {
    const perfil = doc.data();
    if ('politica' in perfil) comPoliticaNoDocPublico++; // [correção #24] NÃO pode existir
    if (perfil.subtipo_npc === 'advogado') {
      if (perfil.banca.tier_escritorio === null || !perfil.banca.escritorio_id) {
        tierIncoerente++;
        continue;
      }
      const escritorioReal = await db.collection('escritorios').doc(perfil.banca.escritorio_id).get();
      if (!escritorioReal.exists || escritorioReal.data().tier !== perfil.banca.tier_escritorio) {
        tierIncoerente++;
      }
    }
  }
  assert(tierIncoerente === 0, `${tierIncoerente} advogados NPC com tier_escritorio divergente do escritório real (fix #5 quebrado)`);
  assert(comPoliticaNoDocPublico === 0, 'politica vazou para o documento público /perfis — fix #24 quebrado');
  console.log('✅ TODOS os advogados têm tier_escritorio == tier real do escritório vinculado (fix #5, verificado contra o documento real)');
  console.log('✅ Nenhum documento público /perfis contém o campo politica (fix #24)');

  // [Correção P1.9] Antes só checava o NPC snap.docs[0]. Agora confere a
  // subcoleção privada/npc de TODOS os 57, não só do primeiro.
  let semPoliticaPrivada = 0;
  let politicaForaDoClamp = 0;
  for (const doc of snap.docs) {
    const privado = await db.collection('perfis').doc(doc.id).collection('privado').doc('npc').get();
    if (!privado.exists || !('politica' in privado.data())) { semPoliticaPrivada++; continue; }
    const pol = privado.data().politica;
    for (const eixo of ['agressividade', 'meticulosidade', 'apetite_acordo', 'vaidade']) {
      if (pol[eixo] < 0.05 || pol[eixo] > 0.95) politicaForaDoClamp++;
    }
  }
  assert(semPoliticaPrivada === 0, `${semPoliticaPrivada} de ${snap.size} NPCs sem subcoleção privada/npc`);
  assert(politicaForaDoClamp === 0, `${politicaForaDoClamp} valores de política fora do clamp 0.05-0.95`);
  console.log(`✅ TODOS os ${snap.size} NPCs têm subcoleção privada/npc com política dentro do clamp (verificado individualmente, não só o primeiro)`);

  console.log(`\n✅ confeccionarPecaSincrona foi chamada ${contadorPecas} vezes (cobertura mínima de catálogo — fix #9)`);

  console.log('\n== 3. Simulando ciclo de vida ao longo de 200 ticks ==');
  let totalAposentados = 0;
  for (let mes = 0; mes < 200; mes++) {
    await avancarTick(db);
    const resultado = await processarCicloDeVida({ db, jurisdicao, tickAtualFn, confeccionarPecaSincrona, poolTeses });
    totalAposentados += resultado.eventos.length;
    if (resultado.eventos.length > 0 && mes % 20 === 0) {
      console.log(`  tick ${resultado.tick}: ${resultado.eventos.length} aposentadoria(s) —`, resultado.eventos.map(e => `${e.nome_aposentado} → ${e.reposto_por}`));
    }
  }
  console.log(`✅ ${totalAposentados} aposentadorias processadas em 200 ticks, cada uma reposta por um novo iniciante`);

  const snapDepois = await db.collection('perfis').where('tipo', '==', 'npc').where('subtipo_npc', '==', 'advogado').get();
  const ativos = snapDepois.docs.filter(d => d.data().ciclo_vida.status === 'ativo').length;
  const aposentados = snapDepois.docs.filter(d => d.data().ciclo_vida.status === 'aposentado').length;
  console.log(`   Advogados ativos: ${ativos} | aposentados (histórico preservado): ${aposentados}`);
  assert(aposentados === totalAposentados, 'Contagem de aposentados no Firestore não bate com os eventos processados');

  console.log('\n== 4a. Testando garantirDistribuicaoMinima — fix #7 (classificação por skill ATUAL) ==');
  const { garantirDistribuicaoMinima, contarPorFaixaAtual } = require('../../functions/npc/cicloDeVida');

  // Simula o cenário do revisor: todos os 20 "iniciantes" originais sobem
  // de skill por XP (ex: para 25, faixa "estabelecido") sem nenhuma
  // reposição — se a classificação fosse por ORIGEM, o sistema pensaria
  // que ainda há 20 iniciantes. Por SKILL ATUAL, deveria detectar 0.
  const todosOsPerfis = await db.collection('perfis').where('subtipo_npc', '==', 'advogado').get();
  for (const doc of todosOsPerfis.docs) {
    const dados = doc.data();
    if (dados.ciclo_vida.status !== 'ativo') continue;
    const skillsSubidas = {};
    for (const k of Object.keys(dados.skills)) skillsSubidas[k] = 25; // força todo mundo pra faixa "estabelecido"
    await db.collection('perfis').doc(doc.id).update({ skills: skillsSubidas });
  }

  const contagemAntes = await contarPorFaixaAtual(db, jurisdicao);
  console.log('   Contagem por skill atual após "todo mundo subiu de nível":', contagemAntes);
  assert(contagemAntes.iniciante === 0, `Esperava 0 iniciantes por skill atual, veio ${contagemAntes.iniciante}`);

  const resultadoReposicao = await garantirDistribuicaoMinima({ db, jurisdicao, tickAtualFn, confeccionarPecaSincrona, poolTeses });
  console.log(`   Repostos: ${resultadoReposicao.repostos.length} novos iniciantes`);
  assert(resultadoReposicao.repostos.length === 14, `Esperava repor 14 (70% de 20), veio ${resultadoReposicao.repostos.length}`);

  const contagemDepois = await contarPorFaixaAtual(db, jurisdicao);
  assert(contagemDepois.iniciante === 14, `Esperava 14 iniciantes após reposição, veio ${contagemDepois.iniciante}`);
  console.log('✅ garantirDistribuicaoMinima detectou 0 iniciantes reais (apesar de 20 terem "nascido" iniciantes) e repôs 14 — classificação por skill atual funciona');


  const antesProc = await db.collection('perfis').where('subtipo_npc', '==', 'procurador').get();
  console.log(`   Procuradores antes: ${antesProc.size}`);
  const expansao = await garantirCapacidadeInstitucional({
    db, jurisdicao, subtipo: 'procurador',
    casosAtivosNaJurisdicao: 999, // força estourar a capacidade instalada
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
  });
  assert(expansao.expandido === true, 'Esperava expansão institucional com demanda de 999 casos');
  const depoisProc = await db.collection('perfis').where('subtipo_npc', '==', 'procurador').get();
  console.log(`   Procuradores depois: ${depoisProc.size} (+${expansao.criados.length})`);
  assert(depoisProc.size === antesProc.size + expansao.criados.length, 'Contagem pós-expansão não bate');
  console.log('✅ Expansão institucional adicionou um lote sem re-semear as 6 faixas inteiras');

  console.log('\n== 4b. Testando fix P0.3 — duas chamadas próximas no tempo não podem expandir 2x ==');
  const antesPromotor = await db.collection('perfis').where('subtipo_npc', '==', 'promotor').get();
  const [expA, expB] = await Promise.all([
    garantirCapacidadeInstitucional({ db, jurisdicao, subtipo: 'promotor', casosAtivosNaJurisdicao: 999, confeccionarPecaSincrona, poolTeses, tickAtualFn }),
    garantirCapacidadeInstitucional({ db, jurisdicao, subtipo: 'promotor', casosAtivosNaJurisdicao: 999, confeccionarPecaSincrona, poolTeses, tickAtualFn }),
  ]);
  assert(!(expA.expandido && expB.expandido), 'Duas chamadas quase simultâneas não deveriam AMBAS expandir (lock de cooldown deveria bloquear uma)');
  const depoisPromotor = await db.collection('perfis').where('subtipo_npc', '==', 'promotor').get();
  const criadosPromotor = depoisPromotor.size - antesPromotor.size;
  assert(criadosPromotor === 5, `Esperava exatamente +5 promotores (1 expansão, não 2), veio +${criadosPromotor}`);
  console.log(`✅ Chamadas concorrentes: só uma expandiu (+${criadosPromotor} promotores, não +10) — lock de cooldown funcionou`);

  const semDemanda = await garantirCapacidadeInstitucional({
    db, jurisdicao, subtipo: 'procurador', casosAtivosNaJurisdicao: 1,
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
  });
  assert(semDemanda.expandido === false, 'Não deveria expandir com demanda baixa (1 caso)');
  console.log('✅ Não expande quando a demanda está dentro da capacidade instalada');

  console.log('\n🎉 TODOS OS TESTES PASSARAM');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FALHA:', msg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ ERRO NÃO TRATADO:', err);
  process.exit(1);
});
