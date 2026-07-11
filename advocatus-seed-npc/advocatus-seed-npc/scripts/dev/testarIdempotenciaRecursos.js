'use strict';

/**
 * GDD v5.9 — prova as duas janelas de idempotência que a 7ª auditoria
 * apontou:
 *
 *  1. [P1.1] Crash DEPOIS de reservar a vaga e ANTES de persistir a receita
 *     no slot. O retry NÃO pode consumir uma segunda vaga.
 *  2. [P1.2/P3.3] Duas materializações concorrentes do MESMO catálogo (sem
 *     peça pré-existente). Deve resultar em exatamente 1 peça por área×tipo
 *     e exatamente 1 execução do efeito de confecção por peça.
 *
 * Rodar: node scripts/dev/testarIdempotenciaRecursos.js
 */
const { MockFirestore } = require('./mockFirestore');
const {
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
  await db.collection('contadores').doc('personagens').set({ proximo_id: 5000000 });
  async function tickAtualFn(d) {
    const r = d.collection('config').doc('tick_global');
    const doc = await r.get();
    if (!doc.exists) { await r.set({ tick_atual: 0 }); return 0; }
    return doc.data().tick_atual;
  }

  console.log('== 1. [P1.1] Crash entre reservar vaga e persistir receita — retry não consome 2ª vaga ==');
  // Escritório com exatamente 1 vaga:
  await db.collection('escritorios').doc('esc1').set({
    nome: 'E1', e_npc: true, jurisdicao: 'c1', tier: 1, tier_desde: 0,
    caixa: 0, reputacao: 0, fundador_uid: null, socios_uids: [], vagas_advogado_disponiveis: 1,
  });

  const slotId = 'c1_v5_5_advogado_6-12_reserva';
  const receitaPura = await decidirReceitaPuraNPC({ db, sub: 'advogado', skillMin: 6, skillMax: 12, tickAtualFn });

  // 1ª tentativa: reserva a vaga...
  const receita1 = await reservarRecursosDaReceita({ db, receita: receitaPura, jurisdicao: 'c1', tiers: [1], tickAtualFn, reservaId: slotId });
  const escDepois1 = (await db.collection('escritorios').doc('esc1').get()).data();
  assert(escDepois1.vagas_advogado_disponiveis === 0, `Após 1ª reserva a vaga deveria ser 0, é ${escDepois1.vagas_advogado_disponiveis}`);
  assert(receita1.escritorio_id === 'esc1', 'Deveria ter reservado no esc1');
  console.log('   1ª reserva: vaga 1→0');

  // ...CRASH aqui, antes de persistir receita1 no slot. O slot ainda "acha"
  // que recursos_reservados=false (simulamos re-reservando a partir da
  // receita PURA original, como faria um retry que só tem a receita pura no slot):
  const receita2 = await reservarRecursosDaReceita({ db, receita: receitaPura, jurisdicao: 'c1', tiers: [1], tickAtualFn, reservaId: slotId });
  const escDepois2 = (await db.collection('escritorios').doc('esc1').get()).data();
  assert(escDepois2.vagas_advogado_disponiveis === 0, `Após o RETRY a vaga deveria CONTINUAR 0 (não -1), é ${escDepois2.vagas_advogado_disponiveis}`);
  assert(receita2.escritorio_id === 'esc1', 'Retry deveria devolver o MESMO escritório, não reservar outro');

  const totalEsc = (await db.collection('escritorios').where('jurisdicao', '==', 'c1').get()).size;
  assert(totalEsc === 1, `Retry não deveria ter criado um 2º escritório — total ${totalEsc}`);
  console.log('✅ [P1.1] Retry após crash: vaga continua 0 (não vazou 2ª vaga), mesmo escritório devolvido, 1 escritório total');

  console.log('\n== 2. [P1.2/P3.3] Duas materializações CONCORRENTES do mesmo catálogo ==');
  let execucoesConfeccao = 0;
  async function confeccionarPecaSincrona(dados) {
    execucoesConfeccao += 1;
    const id = dados.id_determinista;
    await db.collection('peticoes').doc(id).set({ id, autor_uid: dados.autor_uid, ramo_direito: dados.ramo_direito, tipo_peticao: dados.tipo_peticao });
    return { id };
  }
  const poolTeses = { civil: ['t1'], employment: ['t2'], empresarial: ['t3'], tax: ['t4'], criminal: ['t5'] };

  const pid = await gerarProximoId(db);
  const receita = {
    sub: 'advogado', nome: 'X', tracos: ['leal'], skills: { legal_drafting: 10, legal_research: 10, oral_advocacy: 10, networking: 10, procedure: 10 },
    areas: ['civil'], polo_preferencial: 'ambos', tick_criacao: 0, saude_mental: 80,
    escritorio_id: 'esc1', tier_escritorio: 1, recursos_reservados: true,
  };

  // Duas materializações do MESMO perfil, disparadas juntas:
  await Promise.all([
    materializarNPC({ db, profileId: pid, receita, confeccionarPecaSincrona, poolTeses }),
    materializarNPC({ db, profileId: pid, receita, confeccionarPecaSincrona, poolTeses }),
  ]);

  // civil tem 2 tipos essenciais (inicial, contestacao) → no máximo 2 confecções:
  const pecas = await db.collection('peticoes').where('autor_uid', '==', pid).get();
  assert(pecas.size === 2, `Deveria haver exatamente 2 peças (civil/inicial + civil/contestacao), há ${pecas.size}`);
  assert(execucoesConfeccao === 2, `A confecção deveria ter rodado exatamente 2x (uma por peça), rodou ${execucoesConfeccao}x — efeito duplicado!`);

  const perfil = (await db.collection('perfis').doc(pid).get()).data();
  assert(perfil.sistema.inicializacao === 'ready', 'Perfil deveria terminar ready');
  console.log(`✅ [P1.2/P3.3] Materializações concorrentes: exatamente 2 peças, confecção rodou exatamente 2x (efeito de confecção NÃO duplicou), perfil ready`);

  console.log('\n🎉 TODOS OS TESTES DE IDEMPOTÊNCIA DE RECURSOS PASSARAM');
}

main().catch((err) => { console.error('❌ ERRO NÃO TRATADO:', err); process.exit(1); });
