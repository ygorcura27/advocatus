'use strict';

/**
 * GDD v5.3 Parte III §10 — seed do pool de advogados NPC por jurisdição.
 *
 * `criarAdvogadoNPC()` é extraída como função única e reutilizável de
 * propósito: é chamada tanto pelo seed inicial quanto pela reposição de
 * iniciantes (cicloDeVida.js, correção #16) e pela expansão institucional
 * (capacidadeInstitucional.js, correção #37). Ter um único ponto de
 * criação evita reintroduzir o tipo de bug da correção #5 (duas operações
 * independentes decidindo a mesma informação e podendo divergir).
 *
 * COMO RODAR (execução única na criação do servidor, ou sob demanda para
 * expandir capacidade — não é uma Cloud Function agendada):
 *   node scripts/runSeedAdvogadosNPC.js <jurisdicao>
 *
 * ADAPTER: confeccionarPecaSincrona, poolTeses e tickAtualFn são injeção
 * de dependência explícita — aponte para os módulos reais do seu projeto
 * ao chamar seedAdvogadosNPC() a partir do seu script/Cloud Function real.
 */
const { gerarProximoId } = require('../utils/ids');
const { vincularEscritorioNPC } = require('./vincularEscritorioNPC');
const { seedCatalogoInicial, validarCoberturaCatalogo } = require('./seedCatalogoInicial');
const { derivarPolitica, POOL_TRACOS_ADVOGADO } = require('./pesoTraco');
const {
  rndInt,
  sortear,
  sortearTracos,
  sortearAreas,
  gerarNomeAdvogado,
  gerarSkillsAdvogado,
  escolherEstiloNPCInicial,
} = require('./geradores');

const FAIXAS_SEED = Object.freeze([
  { n: 20, skillMin: 6, skillMax: 12, tiers: [1], sub: 'advogado' },
  { n: 15, skillMin: 14, skillMax: 24, tiers: [1, 2], sub: 'advogado' },
  { n: 8, skillMin: 24, skillMax: 34, tiers: [2, 3], sub: 'advogado' },
  { n: 4, skillMin: 34, skillMax: 44, tiers: [4, 5], sub: 'advogado' },
  { n: 5, skillMin: 18, skillMax: 36, tiers: null, sub: 'procurador' },
  { n: 5, skillMin: 18, skillMax: 36, tiers: null, sub: 'promotor' },
]);

const AREAS_POR_SUBTIPO = Object.freeze({
  advogado: ['civil', 'employment', 'empresarial'],
  procurador: ['tax'],
  promotor: ['criminal'],
});

function statsVazias() {
  return {
    vitorias: 0,
    derrotas: 0,
    acordos: 0,
    por_ramo: {
      civil: { v: 0, d: 0, a: 0 },
      employment: { v: 0, d: 0, a: 0 },
      empresarial: { v: 0, d: 0, a: 0 },
      tax: { v: 0, d: 0, a: 0 },
      criminal: { v: 0, d: 0, a: 0 },
    },
    estilo_dominante: null,
  };
}

/**
 * Cria UM advogado NPC completo — perfil público, subcoleção privada de
 * política (correção #24: nunca no documento público) e catálogo inicial.
 * Único ponto de criação, reutilizado por seed, reposição e expansão.
 *
 * [Correção P1.1 + P1.2 — 6ª auditoria] A criação separa agora DUAS
 * responsabilidades que antes estavam misturadas em decidirReceitaNPC():
 *
 *   (A) decidirReceitaPuraNPC() — só decide DADOS (traços, skills, áreas,
 *       nome, saúde). Função pura, sem efeito colateral, sem tocar em
 *       nenhum recurso externo. Pode rodar antes ou depois do claim sem
 *       risco — se a execução perder a corrida pelo slot, nada foi
 *       consumido.
 *
 *   (B) reservarRecursosDaReceita() — reserva a vaga de escritório (o
 *       único recurso externo). SÓ é chamada DEPOIS que a execução tem
 *       posse legítima do slot. Assim a execução que perde a corrida nunca
 *       reserva vaga nenhuma — corrige o vazamento de vaga do P1.1 (6ª
 *       auditoria).
 *
 * A receita continua sendo decidida uma vez e gravada no slot; a diferença
 * é QUANDO cada parte acontece em relação ao claim atômico.
 */
async function decidirReceitaPuraNPC({ sub, skillMin, skillMax, tickAtualFn, db, poolTracos = POOL_TRACOS_ADVOGADO }) {
  const tracos = sortearTracos(poolTracos, 2 + rndInt(0, 1));
  const { skills } = gerarSkillsAdvogado(skillMin, skillMax, sub);
  const areasDisponiveis = AREAS_POR_SUBTIPO[sub];
  if (!areasDisponiveis) throw new Error(`decidirReceitaPuraNPC: subtipo inválido "${sub}"`); // [P3.3]
  const areas = sub === 'advogado'
    ? sortearAreas(areasDisponiveis, 1 + rndInt(0, 1))
    : areasDisponiveis;
  const tick = await tickAtualFn(db);
  return {
    sub,
    nome: gerarNomeAdvogado(),
    tracos, skills, areas,
    polo_preferencial: sub === 'advogado' ? sortear(['autor', 'reu', 'ambos', 'ambos']) : null,
    tick_criacao: tick,
    saude_mental: 70 + rndInt(0, 20),
    // escritorio_id / tier_escritorio adicionados por reservarRecursosDaReceita()
    escritorio_id: null,
    tier_escritorio: null,
    recursos_reservados: false,
  };
}

async function reservarRecursosDaReceita({ db, receita, jurisdicao, tiers, tickAtualFn, reservaId }) {
  if (receita.recursos_reservados) return receita; // idempotente — já reservado numa tentativa anterior
  if (!reservaId) throw new Error('reservarRecursosDaReceita: reservaId obrigatório (idempotência da vaga — P1.1, 7ª auditoria)');
  const escritorio = receita.sub === 'advogado'
    ? await vincularEscritorioNPC(db, jurisdicao, tiers, tickAtualFn, reservaId)
    : null;
  return {
    ...receita,
    jurisdicao,
    escritorio_id: escritorio ? escritorio.id : null,
    tier_escritorio: escritorio ? escritorio.tier : null,
    recursos_reservados: true,
  };
}

/**
 * Mantida por compatibilidade para chamadas diretas fora do fluxo de slot.
 * Requer um reservaId explícito para a idempotência da vaga.
 */
async function decidirReceitaNPC(params) {
  const pura = await decidirReceitaPuraNPC(params);
  return reservarRecursosDaReceita({ db: params.db, receita: pura, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: params.reservaId });
}

/**
 * Executa (ou retoma) a criação de um NPC a partir de uma receita fixa.
 * Idempotente por etapa: cada passo verifica se já foi concluído antes de
 * refazer. Chamável com segurança quantas vezes for preciso para o mesmo
 * profileId + receita — o resultado final é sempre o mesmo NPC completo.
 */
async function materializarNPC({ db, profileId, receita, confeccionarPecaSincrona, poolTeses, pecaJaExiste = null }) {
  const perfilRef = db.collection('perfis').doc(profileId);
  const perfilDoc = await perfilRef.get();

  // Etapa 1 — perfil público (só cria se ainda não existe)
  if (!perfilDoc.exists) {
    await perfilRef.set({
      profile_id: profileId,
      tipo: 'npc',
      subtipo_npc: receita.sub,
      nome: receita.nome,
      skills: receita.skills,
      tracos: receita.tracos,
      banca: {
        escritorio_id: receita.escritorio_id,
        jurisdicao: receita.jurisdicao,
        tier_escritorio: receita.tier_escritorio,
        areas_atuacao: receita.areas,
        polo_preferencial: receita.polo_preferencial,
      },
      stats_confronto: statsVazias(),
      ciclo_vida: { tick_criacao: receita.tick_criacao, status: 'ativo', tick_aposentadoria: null },
      sistema: { inicializacao: 'creating' },
      saude_mental: receita.saude_mental,
    });
  } else if (perfilDoc.data().sistema && perfilDoc.data().sistema.inicializacao === 'ready') {
    return profileId; // já totalmente pronto — nada a fazer
  }

  // Etapa 2 — política privada (só cria se ainda não existe)
  const privadoRef = perfilRef.collection('privado').doc('npc');
  const privadoDoc = await privadoRef.get();
  if (!privadoDoc.exists) {
    await privadoRef.set({ politica: derivarPolitica(receita.tracos), memoria_relacional: {} });
  }

  // Etapa 3 — catálogo (idempotente: só cria as peças de área×tipo que
  // ainda não existem para este autor, com state machine de claim v5.10)
  await seedCatalogoInicial({
    db,
    profileId,
    areas: receita.areas,
    skills: receita.skills,
    confeccionarPecaSincrona,
    poolTeses,
    escolherEstiloNPCInicial,
    pecaJaExiste,
  });

  // Etapa 4 — validar cobertura integral antes de marcar pronto.
  // [v5.10 — P1.1] Barreira final: garante que toda área × tipo essencial
  // existe no Firestore. Se faltar alguma peça (claim órfão, adapter
  // defeituoso, etc.), lança erro explícito — o slot permanece 'creating'
  // e pode ser retomado sem perda de dados.
  await validarCoberturaCatalogo(db, profileId, receita.areas);

  // Etapa 5 — marcar pronto (só após cobertura confirmada)
  await perfilRef.update({ 'sistema.inicializacao': 'ready' });
  return profileId;
}

async function criarAdvogadoNPC({
  db,
  jurisdicao,
  sub,
  skillMin,
  skillMax,
  tiers,
  confeccionarPecaSincrona,
  poolTeses,
  tickAtualFn,
  poolTracos = POOL_TRACOS_ADVOGADO,
  profileIdReservado = null,
  receita = null, // [P1.2] quando presente, retoma sem re-decidir a receita
  pecaJaExiste = null,
}) {
  const profileId = profileIdReservado || await gerarProximoId(db);
  // reservaId default = o próprio profileId: é único por NPC, então torna a
  // reserva de vaga idempotente também nos caminhos diretos (ciclo de vida,
  // expansão, seed sem slot). No fluxo de slot, criarAdvogadoNPCComSlot usa
  // o slotId como reservaId antes de chegar aqui.
  const receitaFinal = receita || await decidirReceitaNPC({ db, jurisdicao, sub, skillMin, skillMax, tiers, tickAtualFn, poolTracos, reservaId: `pid_${profileId}` });
  await materializarNPC({ db, profileId, receita: receitaFinal, confeccionarPecaSincrona, poolTeses, pecaJaExiste });
  return profileId;
}

/**
 * [Correção P0.1 — 4ª auditoria] A versão anterior reivindicava o slot
 * ('creating') SEM reservar o profile_id antecipadamente. Se a execução
 * caísse depois de reivindicar o slot mas antes de terminar de criar o
 * NPC, o slot ficava preso em 'creating' PARA SEMPRE — nenhuma execução
 * futura sabia se devia gerar um NPC novo (arriscando duplicar, se o
 * anterior já tinha criado o perfil) ou retomar (arriscando nunca criar,
 * se travasse por segurança). A proteção contra duplicação virou risco de
 * perda permanente — pior que o problema original.
 *
 * [Correção P1.1 + P1.2 — 5ª auditoria] Duas melhorias sobre a v5.6:
 *
 *  (a) A fonte de verdade para "já pronto" é `sistema.inicializacao ===
 *      'ready'`, NÃO a mera existência de /perfis/{id}. Um perfil que
 *      existe mas está 'creating' (crash no meio do catálogo) NÃO fecha o
 *      slot — é retomado.
 *
 *  (b) A RECEITA do NPC é decidida uma vez e gravada no próprio slot. A
 *      retomada usa a mesma receita via materializarNPC() (idempotente por
 *      etapa), em vez de re-sortear tudo.
 *
 * [Correção P1.1 — 6ª auditoria] A ORDEM foi corrigida: a v5.7 reservava a
 * vaga de escritório DENTRO de decidirReceitaNPC(), ANTES do claim atômico
 * do slot. Duas execuções concorrentes decidiam receitas (cada uma
 * reservando uma vaga) e só uma vencia o slot — a perdedora vazava a vaga.
 * Agora:
 *   1. decide só a receita PURA (sem efeito colateral)
 *   2. reivindica o slot atomicamente
 *   3. SÓ o vencedor reserva a vaga de escritório e grava a receita
 *      completa no slot
 * A execução perdedora nunca chega ao passo 3 — nenhuma vaga vazada.
 *
 * Casos de retomada:
 *   slot completed                          → nada a fazer
 *   slot creating + perfil ready            → só fecha o slot
 *   slot creating + perfil creating/ausente → materializa a receita gravada
 *   slot creating SEM recursos reservados   → reserva agora (retomável)
 */
async function criarAdvogadoNPCComSlot(params, slotId) {
  const slotRef = params.db.collection('npc_seed_slots').doc(slotId);
  const slotDoc = await slotRef.get();

  if (slotDoc.exists && slotDoc.data().status === 'completed') {
    return { profileId: slotDoc.data().profile_id, jaExistia: true };
  }

  let profileId;
  let receita;

  if (slotDoc.exists && slotDoc.data().status === 'creating' && slotDoc.data().profile_id) {
    // Slot já reservado de uma tentativa anterior.
    profileId = slotDoc.data().profile_id;
    receita = slotDoc.data().receita;

    const perfilExistente = await params.db.collection('perfis').doc(profileId).get();
    const jaReady = perfilExistente.exists
      && perfilExistente.data().sistema
      && perfilExistente.data().sistema.inicializacao === 'ready';

    if (jaReady) {
      await slotRef.update({ status: 'completed', concluido_em: Date.now() });
      return { profileId, jaExistia: true, retomado: true };
    }

    if (!receita) {
      // Slot de versão antiga sem receita — decide pura + reserva agora.
      receita = await decidirReceitaPuraNPC({ ...params });
      receita = await reservarRecursosDaReceita({ db: params.db, receita, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: slotId });
      await slotRef.update({ receita });
    } else if (!receita.recursos_reservados) {
      // Crash entre gravar a receita pura e reservar a vaga — retoma a
      // reserva (idempotente) sem re-sortear os dados já decididos.
      receita = await reservarRecursosDaReceita({ db: params.db, receita, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: slotId });
      await slotRef.update({ receita });
    }
  } else {
    // Slot novo. ORDEM CORRIGIDA (P1.1):
    // 1. decide receita PURA (sem tocar em escritório)
    const idReservado = await gerarProximoId(params.db);
    const receitaPura = await decidirReceitaPuraNPC({ ...params });

    // 2. reivindica o slot atomicamente, gravando a receita PURA (ainda sem vaga)
    const claim = await params.db.runTransaction(async (tx) => {
      const doc = await tx.get(slotRef);
      if (doc.exists) return false; // outra execução chegou primeiro
      tx.set(slotRef, { status: 'creating', profile_id: idReservado, receita: receitaPura, iniciado_em: Date.now() });
      return true;
    });
    if (!claim) {
      // Perdeu a corrida — como NENHUMA vaga foi reservada ainda, não há
      // nada para vazar. Só descarta o profile_id gerado (gap aceitável).
      return { profileId: null, jaExistia: false, emAndamento: true };
    }
    profileId = idReservado;

    // 3. SÓ o vencedor reserva a vaga e persiste a receita completa
    receita = await reservarRecursosDaReceita({ db: params.db, receita: receitaPura, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: slotId });
    await slotRef.update({ receita });
  }

  await materializarNPC({
    db: params.db,
    profileId,
    receita,
    confeccionarPecaSincrona: params.confeccionarPecaSincrona,
    poolTeses: params.poolTeses,
    pecaJaExiste: params.pecaJaExiste || null,
  });
  await slotRef.update({ status: 'completed', concluido_em: Date.now() });
  return { profileId, jaExistia: false };
}

async function seedAdvogadosNPC({
  db,
  jurisdicao,
  confeccionarPecaSincrona,
  poolTeses,
  tickAtualFn,
  poolTracos = POOL_TRACOS_ADVOGADO,
}) {
  if (!db || !jurisdicao || !confeccionarPecaSincrona || !poolTeses || !tickAtualFn) {
    throw new Error(
      'seedAdvogadosNPC: parâmetros obrigatórios ausentes (db, jurisdicao, ' +
      'confeccionarPecaSincrona, poolTeses, tickAtualFn) — ver comentário de ' +
      'ADAPTER no topo deste arquivo e em seedCatalogoInicial.js.'
    );
  }

  const resumo = { criados: 0, jaExistentes: 0, porSubtipo: {}, profileIds: [], slotsEmAndamento: 0 };
  const seedVersion = 'v5_4';

  for (const faixa of FAIXAS_SEED) {
    resumo.porSubtipo[faixa.sub] = resumo.porSubtipo[faixa.sub] || 0;

    for (let i = 0; i < faixa.n; i++) {
      const slotId = `${jurisdicao}_${seedVersion}_${faixa.sub}_${faixa.skillMin}-${faixa.skillMax}_${String(i + 1).padStart(3, '0')}`;

      const { profileId, jaExistia, emAndamento } = await criarAdvogadoNPCComSlot(
        {
          db, jurisdicao, sub: faixa.sub, skillMin: faixa.skillMin, skillMax: faixa.skillMax,
          tiers: faixa.tiers, confeccionarPecaSincrona, poolTeses, tickAtualFn, poolTracos,
        },
        slotId
      );

      if (emAndamento) {
        resumo.slotsEmAndamento += 1;
        continue;
      }

      if (jaExistia) resumo.jaExistentes += 1;
      else resumo.criados += 1;

      resumo.porSubtipo[faixa.sub] += 1;
      resumo.profileIds.push(profileId);
    }
  }

  return resumo;
}

module.exports = {
  seedAdvogadosNPC,
  criarAdvogadoNPC,
  criarAdvogadoNPCComSlot,
  decidirReceitaNPC,
  decidirReceitaPuraNPC,
  reservarRecursosDaReceita,
  materializarNPC,
  FAIXAS_SEED,
  AREAS_POR_SUBTIPO,
  statsVazias,
};
