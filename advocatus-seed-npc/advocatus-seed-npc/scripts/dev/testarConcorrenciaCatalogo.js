'use strict';

/**
 * GDD v5.8 — prova os dois achados novos da 6ª auditoria:
 *
 *  1. [P1.1] Duas execuções concorrentes para o MESMO slot consomem no
 *     máximo UMA vaga de escritório (a perdedora não vaza vaga).
 *  2. [P1.2] Catálogo VERDADEIRAMENTE parcial: uma peça essencial já
 *     existe, outra falta — o retry não recria a existente, cria só a
 *     faltante. E funciona SEM o caller injetar pecaJaExiste (idempotência
 *     interna por chave determinística).
 *
 * Rodar: node scripts/dev/testarConcorrenciaCatalogo.js
 */
const { MockFirestore } = require('./mockFirestore');
const {
  criarAdvogadoNPCComSlot,
  decidirReceitaPuraNPC,
  reservarRecursosDaReceita,
  materializarNPC,
} = require('../../functions/npc/seedAdvogadosNPC');
const { idPecaEssencial } = require('../../functions/npc/seedCatalogoInicial');
const { gerarProximoId } = require('../../functions/utils/ids');

function assert(cond, msg) {
  if (!cond) { console.error('❌ FALHA:', msg); process.exit(1); }
}

async function main() {
  const db = new MockFirestore();
  await db.collection('contadores').doc('personagens').set({ proximo_id: 4000000 });

  async function tickAtualFn(d) {
    const r = d.collection('config').doc('tick_global');
    const doc = await r.get();
    if (!doc.exists) { await r.set({ tick_atual: 0 }); return 0; }
    return doc.data().tick_atual;
  }

  // Stub que persiste peças usando o ID determinístico sugerido — é assim
  // que a idempotência INTERNA (sem callback) consegue detectá-las.
  let contadorPecas = 0;
  async function confeccionarPecaSincrona(dados) {
    contadorPecas += 1;
    const id = dados.id_determinista || `peca_auto_${contadorPecas}`;
    await db.collection('peticoes').doc(id).set({
      id, autor_uid: dados.autor_uid, ramo_direito: dados.ramo_direito, tipo_peticao: dados.tipo_peticao,
    });
    return { id };
  }
  const poolTeses = {
    civil: ['t1'], employment: ['t2'], empresarial: ['t3'], tax: ['t4'], criminal: ['t5'],
  };

  // Cria UM escritório NPC Tier 1 com EXATAMENTE 1 vaga, para tornar o
  // vazamento visível: se as duas execuções reservarem, a vaga vai a -1 ou
  // um segundo escritório é criado.
  await db.collection('escritorios').doc('esc_unico').set({
    nome: 'Escritório Teste', e_npc: true, jurisdicao: 'circuit_1', tier: 1, tier_desde: 0,
    caixa: 0, reputacao: 0, fundador_uid: null, socios_uids: [], vagas_advogado_disponiveis: 1,
  });

  const paramsBase = {
    db, jurisdicao: 'circuit_1', sub: 'advogado', skillMin: 6, skillMax: 12, tiers: [1],
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
    // NOTE: pecaJaExiste NÃO é injetado — força o uso da idempotência interna [P1.2/P3.3]
  };

  console.log('== 1. [P1.1] Duas execuções concorrentes para o MESMO slot ==');
  const slotDisputado = 'circuit_1_v5_5_advogado_6-12_disputado';
  const [r1, r2] = await Promise.all([
    criarAdvogadoNPCComSlot(paramsBase, slotDisputado),
    criarAdvogadoNPCComSlot(paramsBase, slotDisputado),
  ]);

  const vencedores = [r1, r2].filter((r) => r.profileId !== null && !r.emAndamento);
  const perdedores = [r1, r2].filter((r) => r.emAndamento);
  assert(vencedores.length === 1, `Deveria haver exatamente 1 vencedor do slot, houve ${vencedores.length}`);
  assert(perdedores.length === 1, `Deveria haver exatamente 1 perdedor (emAndamento), houve ${perdedores.length}`);

  // A invariante crítica: exatamente 1 vaga consumida no total.
  const escritorios = await db.collection('escritorios').where('jurisdicao', '==', 'circuit_1').get();
  const totalEscritorios = escritorios.size;
  const escUnico = (await db.collection('escritorios').doc('esc_unico').get()).data();
  assert(escUnico.vagas_advogado_disponiveis === 0, `A vaga do escritório único deveria estar em 0 (1 consumida), está ${escUnico.vagas_advogado_disponiveis}`);
  // Nenhum segundo escritório deveria ter sido criado pela execução perdedora:
  assert(totalEscritorios === 1, `A execução perdedora NÃO deveria ter criado um 2º escritório — total de escritórios: ${totalEscritorios}`);
  console.log(`✅ [P1.1] Vaga não vazou: 1 vencedor, 1 perdedor, exatamente 1 vaga consumida, ${totalEscritorios} escritório(s) (perdedor não reservou nada)`);

  console.log('\n== 2. [P1.2] Catálogo VERDADEIRAMENTE parcial — sem injetar pecaJaExiste ==');
  const slotParcial = 'circuit_1_v5_5_advogado_6-12_parcial';
  const idParcial = await gerarProximoId(db);
  const receitaPura = await decidirReceitaPuraNPC({ ...paramsBase });
  // Força a receita a ter só o ramo 'civil' para o teste ser previsível:
  receitaPura.areas = ['civil'];
  const receita = await reservarRecursosDaReceita({ db, receita: receitaPura, jurisdicao: 'circuit_1', tiers: [1], tickAtualFn, reservaId: slotParcial });

  await db.collection('npc_seed_slots').doc(slotParcial).set({
    status: 'creating', profile_id: idParcial, receita, iniciado_em: Date.now(),
  });

  // Cria o perfil (creating) + a peça civil/inicial JÁ existente, mas NÃO a
  // civil/contestacao — catálogo genuinamente parcial.
  await db.collection('perfis').doc(idParcial).set({
    profile_id: idParcial, tipo: 'npc', subtipo_npc: 'advogado', nome: receita.nome,
    skills: receita.skills, tracos: receita.tracos,
    banca: { escritorio_id: receita.escritorio_id, jurisdicao: 'circuit_1', tier_escritorio: receita.tier_escritorio, areas_atuacao: ['civil'], polo_preferencial: receita.polo_preferencial },
    stats_confronto: {}, ciclo_vida: { tick_criacao: 0, status: 'ativo', tick_aposentadoria: null },
    sistema: { inicializacao: 'creating' }, saude_mental: 80,
  });
  const idInicialJaExiste = idPecaEssencial(idParcial, 'civil', 'inicial');
  await db.collection('peticoes').doc(idInicialJaExiste).set({
    id: idInicialJaExiste, autor_uid: idParcial, ramo_direito: 'civil', tipo_peticao: 'inicial',
  });

  const pecasAntes = contadorPecas;
  await criarAdvogadoNPCComSlot(paramsBase, slotParcial);

  // civil/inicial NÃO deveria ter sido recriada; civil/contestacao SIM.
  const inicialAindaUnica = (await db.collection('peticoes').where('autor_uid', '==', idParcial).where('tipo_peticao', '==', 'inicial').get()).size;
  const contestacaoCriada = (await db.collection('peticoes').where('autor_uid', '==', idParcial).where('tipo_peticao', '==', 'contestacao').get()).size;
  assert(inicialAindaUnica === 1, `civil/inicial deveria continuar única (não recriada), há ${inicialAindaUnica}`);
  assert(contestacaoCriada === 1, `civil/contestacao deveria ter sido criada no retry, há ${contestacaoCriada}`);
  assert(contadorPecas === pecasAntes + 1, `Deveria ter criado exatamente 1 peça nova (a contestacao), criou ${contadorPecas - pecasAntes}`);

  const perfilFinal = (await db.collection('perfis').doc(idParcial).get()).data();
  assert(perfilFinal.sistema.inicializacao === 'ready', 'NPC deveria terminar ready após completar o catálogo parcial');
  console.log('✅ [P1.2] Catálogo parcial: civil/inicial NÃO recriada, civil/contestacao criada, NPC virou ready — idempotência interna funcionou SEM callback injetado');

  console.log('\n🎉 TODOS OS TESTES DE CONCORRÊNCIA E CATÁLOGO PARCIAL PASSARAM');
}

main().catch((err) => { console.error('❌ ERRO NÃO TRATADO:', err); process.exit(1); });
