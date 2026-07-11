'use strict';

/**
 * GDD v5.3 Parte III §10 — seed do pool de advogados NPC por jurisdição.
 *
 * `criarAdvogadoNPC()` é extraída como função única e reutilizável de
 * propósito: é chamada tanto pelo seed inicial quanto pela reposição de
 * iniciantes (cicloDeVida.js) quanto pela expansão institucional
 * (capacidadeInstitucional.js). Ter um único ponto de criação evita
 * duas operações independentes decidindo a mesma informação e divergindo.
 *
 * gerarProximoProfileId vem de functions/perfis.js — mesmo contador
 * /contadores/personagens compartilhado com jogadores (profile_id é um
 * espaço de numeração único entre jogadores e NPCs, GDD v5.1 §39-40).
 *
 * ADAPTER: confeccionarPecaSincrona, poolTeses e tickAtualFn são injeção
 * de dependência explícita — ver functions/npc/confeccionarPecaNPC.js,
 * functions/teses.js (TESES_POOL) e functions/npc/tickAdapter.js.
 */
const { gerarProximoProfileId } = require('../perfis');
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

// 'corporate' — alinhado com functions/skills.js (area_corporate), não 'empresarial'.
const AREAS_POR_SUBTIPO = Object.freeze({
  advogado: ['civil', 'employment', 'corporate'],
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
      corporate: { v: 0, d: 0, a: 0 },
      tax: { v: 0, d: 0, a: 0 },
      criminal: { v: 0, d: 0, a: 0 },
    },
    estilo_dominante: null,
  };
}

/**
 * Cria UM advogado NPC completo — perfil público, subcoleção privada de
 * política (nunca no documento público) e catálogo inicial. Único ponto de
 * criação, reutilizado por seed, reposição e expansão.
 *
 * A criação separa duas responsabilidades:
 *
 *   (A) decidirReceitaPuraNPC() — só decide DADOS (traços, skills, áreas,
 *       nome, saúde). Função pura, sem efeito colateral externo. Pode rodar
 *       antes ou depois do claim sem risco.
 *
 *   (B) reservarRecursosDaReceita() — reserva a vaga de escritório (o único
 *       recurso externo). SÓ é chamada DEPOIS que a execução tem posse
 *       legítima do slot, evitando vazamento de vaga sob concorrência.
 */
async function decidirReceitaPuraNPC({ sub, skillMin, skillMax, tickAtualFn, db, poolTracos = POOL_TRACOS_ADVOGADO }) {
  const tracos = sortearTracos(poolTracos, 2 + rndInt(0, 1));
  const { skills } = gerarSkillsAdvogado(skillMin, skillMax, sub);
  const areasDisponiveis = AREAS_POR_SUBTIPO[sub];
  if (!areasDisponiveis) throw new Error(`decidirReceitaPuraNPC: subtipo inválido "${sub}"`);
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
    escritorio_id: null,
    tier_escritorio: null,
    recursos_reservados: false,
  };
}

async function reservarRecursosDaReceita({ db, receita, jurisdicao, tiers, tickAtualFn, reservaId }) {
  if (receita.recursos_reservados) return receita; // idempotente — já reservado numa tentativa anterior
  if (!reservaId) throw new Error('reservarRecursosDaReceita: reservaId obrigatório (idempotência da vaga)');
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
 * refazer.
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
  // ainda não existem para este autor, com state machine de claim)
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
  receita = null,
  pecaJaExiste = null,
}) {
  const profileId = profileIdReservado || await gerarProximoProfileId(db);
  // reservaId default = o próprio profileId: único por NPC, torna a reserva
  // de vaga idempotente também nos caminhos diretos (ciclo de vida, expansão).
  const receitaFinal = receita || await decidirReceitaNPC({ db, jurisdicao, sub, skillMin, skillMax, tiers, tickAtualFn, poolTracos, reservaId: `pid_${profileId}` });
  await materializarNPC({ db, profileId, receita: receitaFinal, confeccionarPecaSincrona, poolTeses, pecaJaExiste });
  return profileId;
}

/**
 * Criação de NPC via slot idempotente. Casos de retomada:
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
      receita = await decidirReceitaPuraNPC({ ...params });
      receita = await reservarRecursosDaReceita({ db: params.db, receita, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: slotId });
      await slotRef.update({ receita });
    } else if (!receita.recursos_reservados) {
      receita = await reservarRecursosDaReceita({ db: params.db, receita, jurisdicao: params.jurisdicao, tiers: params.tiers, tickAtualFn: params.tickAtualFn, reservaId: slotId });
      await slotRef.update({ receita });
    }
  } else {
    const idReservado = await gerarProximoProfileId(params.db);
    const receitaPura = await decidirReceitaPuraNPC({ ...params });

    const claim = await params.db.runTransaction(async (tx) => {
      const doc = await tx.get(slotRef);
      if (doc.exists) return false; // outra execução chegou primeiro
      tx.set(slotRef, { status: 'creating', profile_id: idReservado, receita: receitaPura, iniciado_em: Date.now() });
      return true;
    });
    if (!claim) {
      return { profileId: null, jaExistia: false, emAndamento: true };
    }
    profileId = idReservado;

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
      'confeccionarPecaSincrona, poolTeses, tickAtualFn).',
    );
  }

  const resumo = { criados: 0, jaExistentes: 0, porSubtipo: {}, profileIds: [], slotsEmAndamento: 0 };
  const seedVersion = 'v5_10';

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
