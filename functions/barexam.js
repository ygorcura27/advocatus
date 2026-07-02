'use strict';

/**
 * BAR EXAM / OAB — Advocatus Online (GDD v4.1 — Etapa 4)
 *
 * O exame não testa conhecimento jurídico regional — avalia as skills
 * que o jogador já desenvolveu. Aprovação em 32,5/50 (65%).
 *
 * Callables exportadas:
 *   fazerBarExam   — tenta o exame (valida cooldown, cobra taxa, processa)
 *   matricularBarPrep — enfileira o Bar Prep Course no study_queue
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const { concederBarExamBonus, normalizarSkillsJur } = require('./skills');
const { carregarJurisdicao } = require('./jurisdicao');

const SCORE_APROVACAO = 32.5; // 65% de 0–50
const COOLDOWN_MESES  = 3;    // meses entre tentativas

// Taxa: 1ª tentativa grátis; 2ª = taxa_base; 3ª+ dobra a cada tentativa
const TAXA_BASE_USD = 1500;
const TAXA_BASE_BRL = 2000;

// Bar Prep Course: +10 XP nas 4 skills, 2 meses, entra no study_queue
const PREP_CUSTO_USD = 2500;
const PREP_CUSTO_BRL = 3000;
const PREP_XP        = 10;
const PREP_DURACAO   = 2; // meses

// ─── Cálculo do score ────────────────────────────────────────────────────────

function calcularScoreBarExam(skillsJur) {
  const s = normalizarSkillsJur(skillsJur);
  return (
    s.legal_drafting * 0.30 +
    s.legal_research  * 0.30 +
    s.argumentation   * 0.25 +
    s.procedure       * 0.15
  );
}

// ─── Taxa por tentativa ──────────────────────────────────────────────────────

function calcularTaxa(tentativa, jurisdicaoId) {
  if (tentativa <= 1) return 0;
  const base   = jurisdicaoId === 'brasil' ? TAXA_BASE_BRL : TAXA_BASE_USD;
  const fator  = Math.pow(2, tentativa - 2); // 2ª→×1, 3ª→×2, 4ª→×4 ...
  return base * fator;
}

// ─── Callable: fazerBarExam ──────────────────────────────────────────────────

exports.fazerBarExam = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j    = snap.data();
  const jur  = carregarJurisdicao(j.jurisdicao_id || 'brasil');

  // Já aprovado
  if (j.oab) throw new HttpsError('failed-precondition', `${jur.bar_exam.nome} já aprovado.`);

  const tentativa    = (j.bar_exam_tentativas || 0) + 1;
  const mesGlobal    = j.mes_global_pessoal || 0;
  const ultimoExame  = j.bar_exam_ultimo_mes || 0;

  // Cooldown entre tentativas
  if (tentativa > 1 && mesGlobal - ultimoExame < COOLDOWN_MESES) {
    const faltam = COOLDOWN_MESES - (mesGlobal - ultimoExame);
    throw new HttpsError('resource-exhausted',
      `Aguarde mais ${faltam} mês(es) antes de tentar novamente.`);
  }

  // Cobrar taxa
  const taxa = calcularTaxa(tentativa, j.jurisdicao_id || 'brasil');
  if (taxa > 0) {
    const saldo = j.dinheiro || 0;
    if (saldo < taxa) {
      const moeda = jur.currency_symbol;
      throw new HttpsError('failed-precondition',
        `Saldo insuficiente. Taxa desta tentativa: ${moeda} ${taxa.toLocaleString('pt-BR')}.`);
    }
  }

  // Calcular score
  const score    = calcularScoreBarExam(j.skills_jur);
  const aprovado = score >= SCORE_APROVACAO;

  const upd = {
    bar_exam_tentativas:  tentativa,
    bar_exam_ultimo_mes:  mesGlobal,
    bar_exam_ultimo_score: Math.round(score * 10) / 10,
  };

  if (taxa > 0) upd.dinheiro = (j.dinheiro || 0) - taxa;

  // Penalidade de reputação a partir da 3ª tentativa
  if (tentativa >= 3) {
    upd.reputacao = Math.max(0, (j.reputacao || 30) - 5);
  }

  if (aprovado) {
    upd.oab = true;
    await db.collection('jogadores').doc(uid).update(upd);
    await concederBarExamBonus(db, uid); // +10 LD + LR

    // Inbox
    await db.collection('jogadores').doc(uid).collection('inbox').add({
      de: 'sistema',
      assunto: `✅ ${jur.bar_exam.nome} aprovado!`,
      corpo: `Score: ${Math.round(score * 10) / 10}/50. Você está habilitado para atuar como advogado.`,
      tipo: 'positivo', lida: false, criado_em: new Date().toISOString(),
    });

    logger.info(`[BAR EXAM] ${uid} aprovado — score ${score.toFixed(1)}`);
    return { ok: true, aprovado: true, score: Math.round(score * 10) / 10 };
  }

  await db.collection('jogadores').doc(uid).update(upd);

  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de: 'sistema',
    assunto: `❌ ${jur.bar_exam.nome} — reprovado`,
    corpo: `Score: ${Math.round(score * 10) / 10}/50. Mínimo: ${SCORE_APROVACAO}. Tente novamente em ${COOLDOWN_MESES} meses.`,
    tipo: 'negativo', lida: false, criado_em: new Date().toISOString(),
  });

  logger.info(`[BAR EXAM] ${uid} reprovado — score ${score.toFixed(1)}, tentativa ${tentativa}`);
  return { ok: true, aprovado: false, score: Math.round(score * 10) / 10, proxima_tentativa_mes: mesGlobal + COOLDOWN_MESES };
});

// ─── Callable: matricularBarPrep ─────────────────────────────────────────────

exports.matricularBarPrep = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j   = snap.data();
  const jur = carregarJurisdicao(j.jurisdicao_id || 'brasil');

  if (j.oab) throw new HttpsError('failed-precondition', `${jur.bar_exam.nome} já aprovado.`);

  const custo = j.jurisdicao_id === 'brasil' ? PREP_CUSTO_BRL : PREP_CUSTO_USD;
  if ((j.dinheiro || 0) < custo) {
    throw new HttpsError('failed-precondition',
      `Saldo insuficiente. Curso custa ${jur.currency_symbol} ${custo.toLocaleString('pt-BR')}.`);
  }

  const mesGlobal    = j.mes_global_pessoal || 0;
  const mesConclusao = mesGlobal + PREP_DURACAO;

  // Enfileira as 4 skills no study_queue existente (avancar_mes já processa)
  const SKILLS_PREP = ['legal_drafting', 'legal_research', 'argumentation', 'procedure'];
  const novosItens  = SKILLS_PREP.map(sk => ({
    tipo: 'skills_jur',
    skill: sk,
    skill_label: sk.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    ganho: PREP_XP,
    mes_conclusao: mesConclusao,
    fonte: 'bar_prep',
  }));

  const studyQueue = [...(j.study_queue || []), ...novosItens];

  await db.collection('jogadores').doc(uid).update({
    dinheiro:    (j.dinheiro || 0) - custo,
    study_queue: studyQueue,
  });

  return {
    ok: true,
    mes_conclusao: mesConclusao,
    custo,
    mensagem: `Bar Prep Course matriculado. +${PREP_XP} XP nas 4 skills em ${PREP_DURACAO} meses.`,
  };
});
