'use strict';

/**
 * SISTEMAS SOCIAIS — Advocatus Online (GDD v5.1 §25-30)
 *
 * §25 — Moot Court (competição universitária)
 * §26 — Intercâmbio / Secondment (6-12 meses, jurisdição externa)
 * §27 — Podcast / Talk Show (skill Oral Advocacy, popularidade)
 * §28 — Seguro Malpractice (3 tiers, sinistro por nota < 8)
 * §29 — Pro Bono (sem honorários, Rep 2-3x mais rápida, meio caso limite)
 * §30 — Alumni Network (colegas_curso[] nos julgadores, bônus Networking)
 *
 * Callables exportadas:
 *   participarMootCourt    — desafio NPC, sem impacto negativo na Rep pública
 *   iniciarIntercambio     — começa período de 6-12 meses
 *   gravarPodcast          — pulso de popularidade + Rep
 *   contratarSeguroMalpractice — 3 tiers
 *   abrirCasoProBono       — sem honorários, Rep 2-3x mais rápida
 *   registrarAlumni        — adiciona colegas_curso ao julgador
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

// ════════════════════════════════════════════════════════
// §25 — MOOT COURT
// ════════════════════════════════════════════════════════

const ENERGIA_MOOT = 8;
const XP_MOOT_VITORIA = 5;
const XP_MOOT_DERROTA = 2;

exports.participarMootCourt = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if ((j.energia || 0) < ENERGIA_MOOT) {
    throw new HttpsError('failed-precondition', `Energia insuficiente. Moot Court custa ${ENERGIA_MOOT}⚡.`);
  }

  const mesGlobal = j.mes_global_pessoal || 0;
  if (j.moot_ultimo_mes === mesGlobal) {
    throw new HttpsError('failed-precondition', 'Você já participou do Moot Court este mês.');
  }

  // Resultado simples baseado em skills jurídicas
  const skJur = j.skills_jur || {};
  const score = (skJur.legal_drafting || 0) + (skJur.legal_research || 0) + (j.didatica_academica || 0) / 2;
  const nivel  = 20 + Math.floor(Math.random() * 30); // NPC com nível 20-50
  const vitoria = score >= nivel * 0.8;

  const xpGanho    = vitoria ? XP_MOOT_VITORIA : XP_MOOT_DERROTA;
  const reputacao  = vitoria ? 1 : 0;  // Sem penalidade de Rep por derrota (GDD §25)
  const premioDinheiro = vitoria ? Math.floor(Math.random() * 3000) + 2000 : 0;

  await db.collection('jogadores').doc(uid).update({
    energia:           FieldValue.increment(-ENERGIA_MOOT),
    energia_usada_mes: FieldValue.increment(ENERGIA_MOOT),
    xp:                FieldValue.increment(xpGanho),
    reputacao:         FieldValue.increment(reputacao),
    dinheiro:          FieldValue.increment(premioDinheiro),
    moot_ultimo_mes:   mesGlobal,
    moot_vitorias:     vitoria ? FieldValue.increment(1) : FieldValue.increment(0),
    moot_partidas:     FieldValue.increment(1),
  });

  const resultado = vitoria
    ? `Vitória! Score: ${Math.round(score)} vs ${nivel}. +${xpGanho} XP, +1 Rep, +R$${premioDinheiro.toLocaleString('pt-BR')}.`
    : `Derrota. Score: ${Math.round(score)} vs ${nivel}. +${xpGanho} XP. Sem penalidade de reputação.`;

  logger.info(`[MOOT] ${uid} — ${vitoria ? 'vitória' : 'derrota'}`);
  return { ok: true, vitoria, resultado, xp: xpGanho, premio: premioDinheiro };
});

// ════════════════════════════════════════════════════════
// §26 — INTERCÂMBIO / SECONDMENT
// ════════════════════════════════════════════════════════

const INTERCAMBIO_OPCOES = {
  eua:       { label: 'EUA',      duracao: 6,  custo: 20000, bonus_rep: 5,  bonus_area: 'corporate', badge: '🇺🇸' },
  uk:        { label: 'Reino Unido', duracao: 8, custo: 25000, bonus_rep: 5, bonus_area: 'civil',   badge: '🇬🇧' },
  europa:    { label: 'Europa',   duracao: 6,  custo: 18000, bonus_rep: 4,  bonus_area: 'employment', badge: '🇪🇺' },
  asia:      { label: 'Ásia',    duracao: 12, custo: 30000, bonus_rep: 8,  bonus_area: 'tax',       badge: '🌏' },
};

exports.iniciarIntercambio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { destino } = request.data || {};

  const opt = INTERCAMBIO_OPCOES[destino];
  if (!opt) {
    throw new HttpsError('invalid-argument', `Destino inválido. Opções: ${Object.keys(INTERCAMBIO_OPCOES).join(', ')}.`);
  }

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if (j.intercambio_ativo) {
    throw new HttpsError('failed-precondition', 'Você já está em intercâmbio.');
  }
  if ((j.dinheiro || 0) < opt.custo) {
    throw new HttpsError('failed-precondition', `Saldo insuficiente. Custo: R$${opt.custo.toLocaleString('pt-BR')}.`);
  }

  const mesGlobal  = j.mes_global_pessoal || 0;
  const mesConclusao = mesGlobal + opt.duracao;

  await db.collection('jogadores').doc(uid).update({
    dinheiro:           FieldValue.increment(-opt.custo),
    intercambio_ativo:  true,
    intercambio_destino: destino,
    intercambio_mes_inicio: mesGlobal,
    intercambio_mes_conclusao: mesConclusao,
    intercambio_badge:  opt.badge,
  });

  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de:       'sistema',
    assunto:  `${opt.badge} Intercâmbio — ${opt.label}`,
    corpo:    `Você iniciou intercâmbio no ${opt.label} por ${opt.duracao} meses. Ao concluir: +${opt.bonus_rep} Rep e bônus em ${opt.bonus_area}.`,
    tipo:     'sistema', tipo_noticia: 'positivo', lida: false, criado_em: new Date().toISOString(),
  });

  logger.info(`[INTERCAMBIO] ${uid} → ${destino}, conclusão mes ${mesConclusao}`);
  return { ok: true, destino, mes_conclusao: mesConclusao, badge: opt.badge };
});

// ════════════════════════════════════════════════════════
// §27 — PODCAST / TALK SHOW
// ════════════════════════════════════════════════════════

const ENERGIA_PODCAST = 6;
const VIRAL_CHANCE    = 0.12;  // 12% de chance de viralizar

exports.gravarPodcast = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if ((j.energia || 0) < ENERGIA_PODCAST) {
    throw new HttpsError('failed-precondition', `Energia insuficiente. Gravar podcast custa ${ENERGIA_PODCAST}⚡.`);
  }
  const mesGlobal = j.mes_global_pessoal || 0;
  if (j.podcast_ultimo_mes === mesGlobal) {
    throw new HttpsError('failed-precondition', 'Você já gravou um podcast este mês.');
  }

  // Skill Oral Advocacy — base para o resultado
  const oralAdvocacy = j.oral_advocacy || 0;
  const viral  = Math.random() < VIRAL_CHANCE + (oralAdvocacy / 500);
  const baseRep = viral ? 3 : 1;
  const basePop = viral ? 15 : 5;
  const xpDidatica = 1;

  const novaOral = Math.min(50, oralAdvocacy + 1);

  await db.collection('jogadores').doc(uid).update({
    energia:           FieldValue.increment(-ENERGIA_PODCAST),
    energia_usada_mes: FieldValue.increment(ENERGIA_PODCAST),
    reputacao:         FieldValue.increment(baseRep),
    popularidade_pessoal: FieldValue.increment(basePop),
    oral_advocacy:     novaOral,
    podcast_ultimo_mes: mesGlobal,
    podcast_total:     FieldValue.increment(1),
    didatica_academica: Math.min(50, (j.didatica_academica || 0) + xpDidatica),
  });

  const msg = viral
    ? `🔥 Viralizou! Seu podcast foi compartilhado massivamente. +${baseRep} Rep, +${basePop} popularidade.`
    : `Episódio publicado. +${baseRep} Rep, +${basePop} popularidade. Oral Advocacy: ${novaOral}/50.`;

  logger.info(`[PODCAST] ${uid} — ${viral ? 'viral' : 'normal'}`);
  return { ok: true, viral, rep: baseRep, popularidade: basePop, oral_advocacy: novaOral };
});

// ════════════════════════════════════════════════════════
// §28 — SEGURO MALPRACTICE
// ════════════════════════════════════════════════════════

const TIERS_MALPRACTICE = {
  basico:       { label: 'Básico',       cobertura_pct: 30, custo_mensal: 500,  req_nota_min: 8 },
  intermediario:{ label: 'Intermediário', cobertura_pct: 50, custo_mensal: 1200, req_nota_min: 8 },
  amplo:        { label: 'Amplo',        cobertura_pct: 70, custo_mensal: 2500, req_nota_min: 8 },
};

exports.contratarSeguroMalpractice = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { tier } = request.data || {};

  const cfg = TIERS_MALPRACTICE[tier];
  if (!cfg) {
    throw new HttpsError('invalid-argument', `Tier inválido. Opções: ${Object.keys(TIERS_MALPRACTICE).join(', ')}.`);
  }

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if (j.malpractice_tier) {
    throw new HttpsError('already-exists', `Você já possui seguro ${j.malpractice_tier}. Cancele antes de contratar outro.`);
  }

  await db.collection('jogadores').doc(uid).update({
    malpractice_tier:        tier,
    malpractice_cobertura:   cfg.cobertura_pct,
    malpractice_custo_mensal: cfg.custo_mensal,
    malpractice_inicio_mes:  j.mes_global_pessoal || 0,
  });

  logger.info(`[MALPRACTICE] ${uid} contratou tier ${tier}`);
  return { ok: true, tier, cobertura_pct: cfg.cobertura_pct, custo_mensal: cfg.custo_mensal };
});

// ════════════════════════════════════════════════════════
// §29 — PRO BONO
// ════════════════════════════════════════════════════════

// A lógica de pro_bono é integrada na criação do processo:
// - Sem honorários → valorBase = 0, honPotencial = 0
// - Rep 2-3x mais rápida → repDelta é multiplicado
// - Conta como 0.5 no limite mensal de casos

exports.abrirCasoProBono = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { practice_area, descricao } = request.data || {};

  if (!practice_area) throw new HttpsError('invalid-argument', 'practice_area obrigatório.');

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if (!j.oab) {
    throw new HttpsError('failed-precondition', 'OAB necessária para abrir casos Pro Bono.');
  }

  // Consome 0.5 do limite mensal de casos (conta inteira para verificação, soma 0.5)
  const casosAbertos = j.pool_casos_criados_mes || 0;
  const limiteMax    = (j.limite_casos_mes || 3) * 2; // multiplicado por 2 para suportar meio-caso
  if (casosAbertos >= limiteMax) {
    throw new HttpsError('failed-precondition', 'Limite mensal de casos atingido.');
  }

  const mesGlobal = j.mes_global_pessoal || 0;
  const novoProcesso = {
    uid,
    autor:         j.nome_personagem || j.nome || 'Advogado',
    practice_area,
    titulo:        descricao || `Caso Pro Bono — ${practice_area}`,
    tipo:          practice_area,
    instancia:     'trial',
    valor:         0,
    status:        'pendente',
    pro_bono:      true,
    multiplier_rep: 2.5,  // Rep 2-3x mais rápida
    criado_mes:    mesGlobal,
    criado_em:     new Date().toISOString(),
  };

  const ref = await db.collection('processos').add(novoProcesso);
  await db.collection('jogadores').doc(uid).update({
    pool_casos_criados_mes: FieldValue.increment(1),  // conta como 1 no sistema, mas é 0.5 visualmente
    pro_bono_total:         FieldValue.increment(1),
  });

  logger.info(`[PRO_BONO] ${uid} abriu caso pro bono ${ref.id}`);
  return { ok: true, processo_id: ref.id };
});

// ════════════════════════════════════════════════════════
// §30 — ALUMNI NETWORK
// ════════════════════════════════════════════════════════

// Jogador nunca escolhe faculdade na criação de personagem (não existe esse
// passo) — atribuída uma vez, na primeira vez que toca em Alumni Network,
// por sorteio fixo entre as mesmas 10 faculdades usadas no seed de
// julgadores (functions/julgadores_seed.js), e persistida pra sempre.
async function _garantirFaculdadeJogador(db, jogRef, j) {
  if (j.faculdade) return j.faculdade;
  const { FACULDADES_DIREITO } = require('./julgadores_seed');
  const faculdade = FACULDADES_DIREITO[Math.floor(Math.random() * FACULDADES_DIREITO.length)];
  await jogRef.update({ faculdade });
  return faculdade;
}

// Lista o roster de julgadores (seed de functions/julgadores_seed.js) pra
// tela de Alumni Network. Atribui faculdade ao jogador na primeira chamada,
// se ainda não tiver.
exports.listarJulgadores = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const db  = getFirestore();

  const jogRef  = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogSnap.data();

  const faculdade = await _garantirFaculdadeJogador(db, jogRef, j);

  const julgSnap = await db.collection('julgadores').get();
  if (julgSnap.empty) {
    return { ok: true, faculdade, julgadores: [], seed_pendente: true };
  }

  const julgadores = julgSnap.docs.map(d => {
    const jl = d.data();
    return {
      id: d.id,
      nome: jl.nome,
      instancia: jl.instancia,
      faculdade: jl.faculdade,
      mesma_faculdade: jl.faculdade === faculdade,
      ja_alumni: (jl.colegas_curso || []).includes(uid),
    };
  });

  return { ok: true, faculdade, julgadores };
});

exports.registrarAlumni = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { julgador_id } = request.data || {};

  if (!julgador_id) throw new HttpsError('invalid-argument', 'julgador_id obrigatório.');

  const jogRef = db.collection('jogadores').doc(uid);
  const [jogSnap, julgSnap] = await Promise.all([
    jogRef.get(),
    db.collection('julgadores').doc(julgador_id).get(),
  ]);
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  if (!julgSnap.exists) throw new HttpsError('not-found', 'Julgador não encontrado.');

  const j    = jogSnap.data();
  const julg = julgSnap.data();

  // Verifica que o jogador tem a mesma faculdade que o julgador (atribui
  // faculdade ao jogador agora, se essa for a primeira vez que ele mexe
  // com Alumni Network sem ter passado por listarJulgadores antes).
  const facJogador  = await _garantirFaculdadeJogador(db, jogRef, j);
  const facJulgador = julg.faculdade || null;
  if (facJogador !== facJulgador) {
    throw new HttpsError('failed-precondition', `Vocês precisam ter cursado a mesma faculdade (você: ${facJogador}, julgador: ${facJulgador}).`);
  }

  // Adiciona o jogador ao colegas_curso do julgador (sem duplicar)
  const colegas = julg.colegas_curso || [];
  if (colegas.includes(uid)) {
    return { ok: true, ja_registrado: true };
  }

  await julgSnap.ref.update({
    colegas_curso: FieldValue.arrayUnion(uid),
  });

  // Bônus de Networking para o jogador
  await jogRef.update({
    networking: FieldValue.increment(2),
    alumni_registrados: FieldValue.increment(1),
  });

  logger.info(`[ALUMNI] ${uid} registrado como ex-aluno de ${julgador_id}`);
  return { ok: true, bonus_networking: 2 };
});
