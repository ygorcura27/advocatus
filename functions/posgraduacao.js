'use strict';

/**
 * SISTEMA DE PÓS-GRADUAÇÃO — Advocatus Online (GDD v5.1 §17-24)
 *
 * Árvore: Bar Exam → Especialização → Mestrado/LLM → Doutorado/JSD → Cátedra
 *
 * Callables:
 *   matricularPosGraduacao   — inicia programa (mestrado/doutorado/catedral)
 *   comparecer_aula          — gasta 5⚡, registra frequência
 *   darAula                  — +5⚡ devolvidos, salário fixo + XP Didática
 *   submeterDissertacao      — submete peça categoria dissertacao/tese para avaliação
 *
 * Ação "Comparecer à Aula":
 *   - Consome 5 energia
 *   - Mínimo 75% de frequência para não reprovar automaticamente
 *
 * Dar Aula:
 *   - Disponível para Mestres/Doutores/Cátedra com Didática ≥ 10
 *   - +5 energia devolvida (excepcionalmente — docência energiza)
 *   - +XP Didática Acadêmica
 *   - Bônus de teto de skill: +10% (Mestre) / +25% (Doutor)
 *
 * Cátedra:
 *   - Requisito cumulativo: Doutorado + 2 livros + 500 citações + Rep ≥ 60
 *   - Mentoria recebe peso 2,0x
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

// ─── Configurações dos programas ──────────────────────────────────────────────

const PROGRAMAS = {
  mestrado: {
    label:        'Mestrado / LLM',
    duracao_meses: 12,
    req_legal_research: 20,
    req_legal_drafting: 20,
    req_didatica:   10,
    req_area:       15,
    req_cargo:      ['asc', 'soc', 'snm', 'snr'],  // Associate+
    categoria_peca: 'dissertacao',
    nota_min_peca:  18,
    bonus_teto_skill_pct: 0.10,
    custo_matricula: 15000,
    salario_dar_aula: 3000,
  },
  doutorado: {
    label:        'Doutorado / JSD',
    duracao_meses: 24,
    req_legal_research: 30,
    req_legal_drafting: 30,
    req_didatica:   20,
    req_area:       25,
    req_cargo:      ['snr', 'asc', 'soc', 'snm'],  // Senior+
    req_grau_anterior: 'mestrado',
    categoria_peca: 'tese',
    nota_min_peca:  22,
    bonus_teto_skill_pct: 0.25,
    custo_matricula: 25000,
    salario_dar_aula: 6000,
  },
  catedral: {
    label:        'Cátedra',
    duracao_meses: 0,  // Aprovação direta por requisitos
    req_grau_anterior: 'doutorado',
    req_livros:    2,
    req_citacoes:  500,
    req_reputacao: 60,
    categoria_peca: null,
    bonus_mentoria_mult: 2.0,
    custo_matricula: 0,
    salario_dar_aula: 12000,
  },
};

const ENERGIA_AULA = 5;
const CAP_FREQUENCIA = 12;  // meses de aula por programa

// ─── Callable: matricularPosGraduacao ────────────────────────────────────────

exports.matricularPosGraduacao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { programa, practice_area } = request.data || {};

  const cfg = PROGRAMAS[programa];
  if (!cfg) {
    throw new HttpsError('invalid-argument', `Programa inválido. Use: ${Object.keys(PROGRAMAS).join(', ')}.`);
  }

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  const skJur = j.skills_jur || {};

  // Verificar se já está matriculado
  if (j.posgrad_status === 'cursando') {
    throw new HttpsError('failed-precondition', `Você já está cursando ${j.posgrad_programa}. Conclua antes de iniciar outro.`);
  }

  // Verificar grau anterior
  if (cfg.req_grau_anterior && j.posgrad_concluido !== cfg.req_grau_anterior && j.posgrad_concluido !== 'catedral') {
    throw new HttpsError('failed-precondition', `Você precisa ter concluído ${cfg.req_grau_anterior} antes.`);
  }

  // Verificar skills
  if (cfg.req_legal_research && (skJur.legal_research || 0) < cfg.req_legal_research) {
    throw new HttpsError('failed-precondition', `Legal Research insuficiente. Mínimo: ${cfg.req_legal_research}.`);
  }
  if (cfg.req_legal_drafting && (skJur.legal_drafting || 0) < cfg.req_legal_drafting) {
    throw new HttpsError('failed-precondition', `Legal Drafting insuficiente. Mínimo: ${cfg.req_legal_drafting}.`);
  }
  if (cfg.req_didatica && (j.didatica_academica || 0) < cfg.req_didatica) {
    throw new HttpsError('failed-precondition', `Didática Acadêmica insuficiente. Mínimo: ${cfg.req_didatica}.`);
  }
  if (cfg.req_area && (skJur[practice_area] || 0) < cfg.req_area) {
    throw new HttpsError('failed-precondition', `Skill da área insuficiente. Mínimo: ${cfg.req_area}.`);
  }
  if (cfg.req_cargo && !cfg.req_cargo.includes(j.cargo_id)) {
    throw new HttpsError('failed-precondition', `Cargo insuficiente para ${cfg.label}.`);
  }

  // Verificar requisitos de Cátedra
  if (programa === 'catedral') {
    if ((j.livros_publicados || 0) < cfg.req_livros) {
      throw new HttpsError('failed-precondition', `Publicar ${cfg.req_livros} livros antes da Cátedra.`);
    }
    if ((j.citacoes_totais || 0) < cfg.req_citacoes) {
      throw new HttpsError('failed-precondition', `Mínimo ${cfg.req_citacoes} citações para a Cátedra.`);
    }
    if ((j.reputacao || 0) < cfg.req_reputacao) {
      throw new HttpsError('failed-precondition', `Reputação mínima ${cfg.req_reputacao} para a Cátedra.`);
    }
  }

  // Verificar saldo
  if (cfg.custo_matricula > 0 && (j.caixa || 0) < cfg.custo_matricula) {
    throw new HttpsError('failed-precondition', `Saldo insuficiente. Matrícula: R$${cfg.custo_matricula.toLocaleString('pt-BR')}.`);
  }

  const mesGlobal  = j.mes_global_pessoal || 0;
  const mesConclusao = mesGlobal + cfg.duracao_meses;

  const upd = {
    posgrad_status:       programa === 'catedral' ? 'catedral' : 'cursando',
    posgrad_programa:     programa,
    posgrad_area:         practice_area || null,
    posgrad_mes_inicio:   mesGlobal,
    posgrad_mes_conclusao: mesConclusao,
    posgrad_frequencia:   0,   // meses de aula comparecidos
    posgrad_faltas:       0,
  };

  if (cfg.custo_matricula > 0) {
    upd.caixa = FieldValue.increment(-cfg.custo_matricula);
  }

  // Cátedra é concluída imediatamente (aprovação direta)
  if (programa === 'catedral') {
    upd.posgrad_concluido    = 'catedral';
    upd.posgrad_status       = 'catedral';
    upd.posgrad_bonus_mentoria = cfg.bonus_mentoria_mult;
  }

  await db.collection('jogadores').doc(uid).update(upd);

  // Notificação
  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de:         'sistema',
    assunto:    `🎓 Matrícula confirmada — ${cfg.label}`,
    corpo:      programa === 'catedral'
      ? `Parabéns! Você atingiu todos os requisitos da Cátedra. Sua mentoria agora tem peso ${cfg.bonus_mentoria_mult}x.`
      : `Matrícula no ${cfg.label} confirmada. Duração: ${cfg.duracao_meses} meses. Compare à aula mensalmente (mín. 75% frequência).`,
    tipo:       'sistema',
    tipo_noticia: 'positivo',
    lida:       false,
    criado_em:  new Date().toISOString(),
  });

  logger.info(`[POSGRAD] ${uid} matriculado em ${programa} (area: ${practice_area})`);
  return { ok: true, programa, mes_conclusao: mesConclusao };
});

// ─── Callable: compararecerAula ───────────────────────────────────────────────

exports.compararecerAula = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if (j.posgrad_status !== 'cursando') {
    throw new HttpsError('failed-precondition', 'Você não está cursando nenhum programa no momento.');
  }
  if ((j.energia || 0) < ENERGIA_AULA) {
    throw new HttpsError('failed-precondition', `Energia insuficiente. Comparecer à aula custa ${ENERGIA_AULA}⚡.`);
  }

  const mesGlobal = j.mes_global_pessoal || 0;
  if (j.posgrad_ultima_aula === mesGlobal) {
    throw new HttpsError('failed-precondition', 'Você já compareceu à aula este mês.');
  }

  await db.collection('jogadores').doc(uid).update({
    energia:              FieldValue.increment(-ENERGIA_AULA),
    energia_usada_mes:    FieldValue.increment(ENERGIA_AULA),
    posgrad_frequencia:   FieldValue.increment(1),
    posgrad_ultima_aula:  mesGlobal,
  });

  logger.info(`[POSGRAD] ${uid} compareceu à aula (mes ${mesGlobal})`);
  return { ok: true, energia_gasta: ENERGIA_AULA };
});

// ─── Callable: darAula ────────────────────────────────────────────────────────

exports.darAula = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  const grau = j.posgrad_concluido;

  if (!grau || !['mestrado', 'doutorado', 'catedral'].includes(grau)) {
    throw new HttpsError('failed-precondition', 'Você precisa de grau de Mestre ou superior para dar aula.');
  }
  if ((j.didatica_academica || 0) < 10) {
    throw new HttpsError('failed-precondition', 'Didática Acadêmica mínima 10 para dar aula.');
  }

  const mesGlobal = j.mes_global_pessoal || 0;
  if (j.posgrad_ultima_aula_dada === mesGlobal) {
    throw new HttpsError('failed-precondition', 'Você já deu aula este mês.');
  }

  const cfg = PROGRAMAS[grau] || PROGRAMAS['mestrado'];
  const salario = cfg.salario_dar_aula || 3000;

  // XP de Didática Acadêmica
  const didaticaAtual = j.didatica_academica || 0;
  const xpGanho = 1;
  const novaDid = Math.min(50, didaticaAtual + xpGanho);

  await db.collection('jogadores').doc(uid).update({
    energia:                   FieldValue.increment(ENERGIA_AULA),  // Bônus — docência energiza
    caixa:                     FieldValue.increment(salario),
    didatica_academica:        novaDid,
    posgrad_ultima_aula_dada:  mesGlobal,
  });

  logger.info(`[POSGRAD] ${uid} deu aula — salário R$${salario}, Didática ${novaDid}`);
  return { ok: true, salario, didatica: novaDid, energia_bonus: ENERGIA_AULA };
});

// ─── Callable: submeterDissertacao ────────────────────────────────────────────

exports.submeterDissertacao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id } = request.data || {};

  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');

  const [jogSnap, petSnap] = await Promise.all([
    db.collection('jogadores').doc(uid).get(),
    db.collection('peticoes').doc(peticao_id).get(),
  ]);
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');

  const j   = jogSnap.data();
  const pet = petSnap.data();
  const cfg = PROGRAMAS[j.posgrad_programa];

  if (j.posgrad_status !== 'cursando') {
    throw new HttpsError('failed-precondition', 'Você não está cursando nenhum programa.');
  }
  if (!cfg) throw new HttpsError('internal', 'Configuração do programa não encontrada.');

  if (pet.jogador_uid !== uid) {
    throw new HttpsError('permission-denied', 'Esta petição não é sua.');
  }
  if (pet.categoria !== cfg.categoria_peca) {
    throw new HttpsError('failed-precondition', `O programa exige uma peça do tipo ${cfg.categoria_peca}.`);
  }
  if (pet.status !== 'pronta') {
    throw new HttpsError('failed-precondition', 'A peça deve estar finalizada (pronta).');
  }

  const notaEfetiva = pet.nota_teto || 0;
  const aprovado    = notaEfetiva >= cfg.nota_min_peca;

  if (!aprovado) {
    return {
      ok:      false,
      aprovado: false,
      nota:    notaEfetiva,
      nota_min: cfg.nota_min_peca,
      msg:     `Nota insuficiente (${notaEfetiva}/${cfg.nota_min_peca}). Melhore a peça antes de submeter.`,
    };
  }

  // Aprovado — concluir o programa
  const bonus = cfg.bonus_teto_skill_pct
    ? `Bônus de teto de skill: +${Math.round(cfg.bonus_teto_skill_pct * 100)}%`
    : '';

  await db.collection('jogadores').doc(uid).update({
    posgrad_status:       'concluido',
    posgrad_concluido:    j.posgrad_programa,
    posgrad_peca_final:   peticao_id,
    posgrad_nota_final:   notaEfetiva,
    posgrad_bonus_skill:  cfg.bonus_teto_skill_pct || 0,
    reputacao:            FieldValue.increment(10),
    prestigio_academico:  FieldValue.increment(j.posgrad_programa === 'doutorado' ? 30 : 15),
  });

  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de:         'sistema',
    assunto:    `🎓 ${cfg.label} concluído!`,
    corpo:      `Parabéns! Sua ${cfg.categoria_peca} obteve nota ${notaEfetiva}/26 — aprovado!\n${bonus}\n+10 reputação pelo grau obtido.`,
    tipo:       'sistema',
    tipo_noticia: 'positivo',
    lida:       false,
    criado_em:  new Date().toISOString(),
  });

  logger.info(`[POSGRAD] ${uid} concluiu ${j.posgrad_programa} — nota ${notaEfetiva}`);
  return { ok: true, aprovado: true, nota: notaEfetiva, programa: j.posgrad_programa };
});
