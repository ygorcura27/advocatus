'use strict';

/**
 * BANCO DE TESES DO ESCRITÓRIO — Advocatus Online (GDD v6.0 §5)
 * "Sistema musical" do jogo: uma tese não pertence a um processo, é um
 * ativo permanente do escritório. Fundamento (skill de área) + Redação
 * (Legal Drafting) definem a nota na criação; Atualização% decai todo mês
 * por matéria e é restaurada por manutenção (Pesquisa) — sem manutenção, a
 * tese apodrece e vale cada vez menos num Julgamento.
 *
 * Nota deliberadamente numa escala 0-100 compatível com a força de peça de
 * investigacao.js (não a escala 1-26 de peticoes.js — são sistemas
 * diferentes, ver functions/teses.js pra "Tese Central" de petição avulsa).
 *
 * SEGURANÇA: nota é rolada aqui a partir da skill salva no servidor, nunca
 * enviada pelo cliente — mesmo padrão de peticoes.js/investigacao.js.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { normalizarSkillsJur } = require('./skills');
const { debitarEnergiaCategoria } = require('./energia_categorias');

// Decaimento mensal de Atualização% por matéria (GDD v6.0 §5.2) — tributário
// decai mais rápido de propósito (reforma tributária como feature de jogo).
const DECAIMENTO_MATERIA = {
  civil: 3, familia: 3, imobiliario: 3,
  trabalhista: 6, consumidor: 6,
  tributario: 10,
};
const DECAIMENTO_PADRAO = 5;
function decaimentoMensal(materia) { return DECAIMENTO_MATERIA[materia] ?? DECAIMENTO_PADRAO; }

// Espelho de investigacao.js::AREA_PARA_TAG_VADEMECUM — matéria do
// escritório (TODAS_AREAS, PT-BR) → chave skills_jur.area_* (COMPAT_AREAS).
const MATERIA_PARA_AREA_SKILL = {
  civil: 'area_civil', consumidor: 'area_civil', familia: 'area_civil',
  imobiliario: 'area_civil', contencioso: 'area_civil', ambiental: 'area_civil',
  tributario: 'area_tax', trabalhista: 'area_employment',
  empresarial: 'area_corporate', societario: 'area_corporate', administrativo: 'area_corporate',
  criminal: 'area_criminal',
};

const CUSTO_ENERGIA_CRIAR  = 30;
const CUSTO_ENERGIA_MANTER = 15;
const GANHO_ATUALIZACAO_MANTER = 12; // por ação de manutenção, respeitando o teto
// Escala de força de Julgamento (investigacao.js, pós-recalibração 2026-07-11):
// uma peça isolada boa fica ~25-40. Tese pesa mais que uma peça sozinha, por
// design (memória do projeto: "petição deveria valer 2-3x mais que peça de
// investigação") — mas não o suficiente pra vencer um julgamento sozinha
// numa matéria travada em 50% de atualização (LIMIAR_VITORIA_BASE = 45).
const FORCA_TESE_MAX = 50;

function tetoAtualizacao(mediaSkillMateria) {
  // GDD v6.0 §5.2: 50% + 10% × (skill/10) — skill 0-50 numa escala /10 vira 0-5, +0 a +50.
  return Math.min(100, 50 + 10 * (Math.max(0, mediaSkillMateria) / 10));
}

function forcaDaTese(tese) {
  if (!tese) return 0;
  return Math.round((Math.max(0, tese.nota || 0) / 100) * (Math.max(0, tese.atualizacao_pct ?? 0) / 100) * FORCA_TESE_MAX);
}

async function membroDoEscritorio(uid, j, escritorioId) {
  return j.escritorio_proprio_id === escritorioId || j.escritorio_empregado_id === escritorioId;
}

async function mediaSkillMateriaEquipe(db, escritorioId, materia) {
  const areaKey = MATERIA_PARA_AREA_SKILL[materia] || 'area_civil';
  const funcSnap = await db.collection('escritorios').doc(escritorioId).collection('funcionarios').get();
  if (funcSnap.empty) return 0;
  let soma = 0, n = 0;
  funcSnap.forEach((d) => {
    const f = d.data();
    soma += f.skills_jur?.[areaKey] || f.areaSkills?.[materia] || 0;
    n += 1;
  });
  return n ? soma / n : 0;
}

// ─── criarTese — compor uma tese nova (Fundamento + Redação) ───────────────

exports.criarTese = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escritorio_id, materia, titulo } = request.data || {};
  if (!escritorio_id || !materia) throw new HttpsError('invalid-argument', 'escritorio_id e materia obrigatórios.');

  const db = getFirestore();
  const jRef = db.collection('jogadores').doc(uid);
  const jSnap = await jRef.get();
  if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jSnap.data();
  if (!(await membroDoEscritorio(uid, j, escritorio_id))) throw new HttpsError('permission-denied', 'Você não pertence a este escritório.');

  // GDD v6.0 §3.1 — categoria Processos Estratégicos: Tese alimenta
  // Julgamento direto (mesmo papel que Petição tinha antes da unificação).
  const energiaPatch = debitarEnergiaCategoria(j, 'processos', CUSTO_ENERGIA_CRIAR, 'compor uma tese');

  const skJur = normalizarSkillsJur(j.skills_jur);
  const areaKey = MATERIA_PARA_AREA_SKILL[materia] || 'area_civil';
  const areaSkill = skJur[areaKey] || 0;
  const redacaoSkill = skJur.legal_drafting || 0;

  // Fundamento (área) pesa mais que Redação — GDD v6.0 §5.1: "Fundamento
  // (melodia): teto pela skill de matéria; Redação (letra): teto por Legal
  // Drafting". Nota efetiva rolada <= teto, nunca enviada pelo cliente.
  const tetoFundamento = areaSkill * 1.6;    // 0-50 → 0-80
  const tetoRedacao    = redacaoSkill * 0.8; // 0-50 → 0-40
  const notaMax = Math.min(100, tetoFundamento + tetoRedacao);
  const nota = Math.round(notaMax * (0.75 + Math.random() * 0.25));

  const teseRef = db.collection('escritorios').doc(escritorio_id).collection('teses').doc();
  await teseRef.set({
    materia, titulo: titulo || null,
    nota, atualizacao_pct: 100,
    decaimento_pct_mes: decaimentoMensal(materia),
    criada_por_uid: uid, criada_por_personagem_id: j.personagem_ativo_id || null,
    criada_em: new Date().toISOString(),
    historico_uso: [],
  });
  await jRef.update(energiaPatch);

  return { ok: true, tese_id: teseRef.id, nota, teto_fundamento: Math.round(tetoFundamento), teto_redacao: Math.round(tetoRedacao) };
});

// ─── manterTese — Pesquisa: re-sobe Atualização% até o teto da equipe ──────

exports.manterTese = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escritorio_id, tese_id } = request.data || {};
  if (!escritorio_id || !tese_id) throw new HttpsError('invalid-argument', 'escritorio_id e tese_id obrigatórios.');

  const db = getFirestore();
  const jRef = db.collection('jogadores').doc(uid);
  const teseRef = db.collection('escritorios').doc(escritorio_id).collection('teses').doc(tese_id);
  const [jSnap, teseSnap] = await Promise.all([jRef.get(), teseRef.get()]);
  if (!jSnap.exists || !teseSnap.exists) throw new HttpsError('not-found', 'Jogador ou tese não encontrado.');
  const j = jSnap.data();
  const tese = teseSnap.data();
  if (!(await membroDoEscritorio(uid, j, escritorio_id))) throw new HttpsError('permission-denied', 'Você não pertence a este escritório.');

  // GDD v6.0 §3.1 — mesma categoria de criarTese (Processos Estratégicos).
  const energiaPatch = debitarEnergiaCategoria(j, 'processos', CUSTO_ENERGIA_MANTER, 'manutenção de tese');

  const mediaSkill = await mediaSkillMateriaEquipe(db, escritorio_id, tese.materia);
  const teto = tetoAtualizacao(mediaSkill);
  const novaAtualizacao = Math.min(teto, (tese.atualizacao_pct || 0) + GANHO_ATUALIZACAO_MANTER);

  await teseRef.update({ atualizacao_pct: novaAtualizacao });
  await jRef.update(energiaPatch);

  return { ok: true, atualizacao_pct: novaAtualizacao, teto: Math.round(teto) };
});

// ─── decaimento mensal — chamado por avancar_mes.js pra cada escritório ────

async function processarDecaimentoMensal(db, escritorioId) {
  const snap = await db.collection('escritorios').doc(escritorioId).collection('teses').get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.forEach((d) => {
    const t = d.data();
    const nova = Math.max(0, (t.atualizacao_pct || 0) - (t.decaimento_pct_mes ?? decaimentoMensal(t.materia)));
    batch.update(d.ref, { atualizacao_pct: nova });
  });
  await batch.commit();
}

// ─── registrar uso — chamado por investigacao.js::confirmarMontagem ───────

async function registrarUsoTese(db, escritorioId, teseId, processoId, mesGlobal) {
  const teseRef = db.collection('escritorios').doc(escritorioId).collection('teses').doc(teseId);
  const teseSnap = await teseRef.get();
  if (!teseSnap.exists) return null;
  const tese = teseSnap.data();
  const historico = [...(tese.historico_uso || []), { processo_id: processoId, mes_global: mesGlobal }].slice(-20);
  await teseRef.update({ historico_uso: historico });
  return tese;
}

module.exports = Object.assign(module.exports, {
  decaimentoMensal,
  tetoAtualizacao,
  forcaDaTese,
  processarDecaimentoMensal,
  registrarUsoTese,
  membroDoEscritorio,
  MATERIA_PARA_AREA_SKILL,
  FORCA_TESE_MAX,
});
