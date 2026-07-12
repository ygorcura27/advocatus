'use strict';

/**
 * SKILLS DE COMPOSIÇÃO — Advocatus Online (GDD v4.1)
 * Escala universal: 0–50 para todas as skills de composição jurídica.
 *
 * Skills armazenadas em /jogadores/{uid} sob o campo `skills_jur` (objeto),
 * separado do campo `skills` legado (escala antiga de NPCs).
 *
 * Etapa 3: Legal Drafting + Legal Research (base obrigatória).
 * Etapas 5–6 (Document Type Mastery, Practice Area Mastery) já têm
 * as tabelas de lookup aqui, mas são zeradas no schema inicial — serão
 * ativadas progressivamente nas etapas seguintes.
 */

// ─── Tabelas de interpolação (ponto chave → valor) ──────────────────────────

// Teto de nota dado o nível de Legal Drafting (0–50 → nota máxima 1–26)
const TETO_LEGAL_DRAFTING = { 0: 12, 10: 16, 20: 19, 30: 22, 40: 24, 50: 26 };

// Modificador aditivo da nota base dado Legal Research (0–50 → delta de nota)
const MOD_LEGAL_RESEARCH = { 0: -5, 10: -2, 20: 0, 30: 1, 40: 2, 50: 4 };

// Multiplicador por nível de Document Type Mastery (0–50 → fator)
const MOD_DOCUMENT_TYPE = { 0: 0.70, 10: 0.85, 20: 0.95, 30: 1.05, 40: 1.15, 50: 1.25 };

// Multiplicador por nível de Practice Area Mastery (0–50 → fator)
const MOD_PRACTICE_AREA = { 0: 0.55, 10: 0.65, 20: 0.80, 30: 0.92, 40: 1.00, 50: 1.15 };

// Mapa de compatibilidade entre áreas (penalidade quando área da petição ≠ área do caso)
const COMPAT_AREAS = {
  employment: { employment:1.00, tax:0.60, civil:0.75, criminal:0.65, corporate:0.60, immigration:0.70, bankruptcy:0.60 },
  tax:        { employment:0.60, tax:1.00, civil:0.65, criminal:0.55, corporate:0.75, immigration:0.55, bankruptcy:0.70 },
  civil:      { employment:0.75, tax:0.65, civil:1.00, criminal:0.70, corporate:0.65, immigration:0.65, bankruptcy:0.65 },
  criminal:   { employment:0.65, tax:0.55, civil:0.70, criminal:1.00, corporate:0.55, immigration:0.65, bankruptcy:0.55 },
  corporate:  { employment:0.60, tax:0.75, civil:0.65, criminal:0.55, corporate:1.00, immigration:0.55, bankruptcy:0.75 },
  immigration:{ employment:0.70, tax:0.55, civil:0.65, criminal:0.65, corporate:0.55, immigration:1.00, bankruptcy:0.55 },
  bankruptcy: { employment:0.60, tax:0.70, civil:0.65, criminal:0.55, corporate:0.75, immigration:0.55, bankruptcy:1.00 },
};

// ─── Interpolação linear entre pontos da tabela ─────────────────────────────

function interpolate(table, skill) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const s    = Math.max(0, Math.min(50, skill));
  if (s <= keys[0]) return table[keys[0]];
  if (s >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1];
    if (s >= lo && s <= hi) {
      const t = (s - lo) / (hi - lo);
      return table[lo] + t * (table[hi] - table[lo]);
    }
  }
  return table[keys[0]];
}

// ─── Funções de lookup públicas ─────────────────────────────────────────────

/** Teto máximo de nota (1–26) baseado no nível de Legal Drafting. */
function calcTetoLegalDrafting(skill) {
  return Math.round(interpolate(TETO_LEGAL_DRAFTING, skill));
}

/** Delta aditivo à nota base baseado no nível de Legal Research. */
function calcModLegalResearch(skill) {
  return Math.round(interpolate(MOD_LEGAL_RESEARCH, skill));
}

/** Multiplicador de nota por nível de Document Type Mastery. */
function calcModDocumentType(skill) {
  return interpolate(MOD_DOCUMENT_TYPE, skill);
}

/** Multiplicador de nota por nível de Practice Area Mastery. */
function calcModPracticeArea(skill) {
  return interpolate(MOD_PRACTICE_AREA, skill);
}

/**
 * Fator de compatibilidade entre área da petição e área do caso.
 * Retorna 1.0 quando a petição está na área correta.
 */
function calcCompatAreasCross(areaPeticao, areaCaso) {
  return (COMPAT_AREAS[areaPeticao] || {})[areaCaso] ?? 0.55;
}

// ─── Schema inicial de skills_jur ───────────────────────────────────────────

/** Retorna o objeto skills_jur padrão para um jogador novo (tudo em 0). */
function defaultSkillsJur() {
  return {
    // Base obrigatória (Etapa 3)
    legal_drafting: 0,
    legal_research: 0,
    // Outras base (Etapas futuras)
    argumentation:  0,
    oral_advocacy:  0,
    negotiation:    0,
    procedure:      0,
    gestao:         0,
    // Document Type Mastery — 8 skills (Etapa 5)
    doc_initial_filing: 0,
    doc_responsive:     0,
    doc_motion:         0,
    doc_appellate:      0,
    doc_supreme:        0,
    doc_trial_brief:    0,
    doc_evidence:       0,
    doc_deposition:     0,
    // Practice Area Mastery — 7 skills (Etapa 6)
    area_employment: 0,
    area_tax:        0,
    area_civil:      0,
    area_criminal:   0,
    area_corporate:  0,
    area_immigration:0,
    area_bankruptcy: 0,
    // Mídia / Comunicação (GDD v5.1 — Podcasts/Vídeos Virais)
    comunicacao_midiatica: 0,
    // Investigação/Favores/Julgamento (GDD addendum v1.0, Parte VII)
    analise_forense:        0,
    perfil_comportamental:  0,
    discricao:              0,
  };
}

/** Garante que o objeto skills_jur do jogador tem todos os campos. */
function normalizarSkillsJur(skillsJur) {
  return { ...defaultSkillsJur(), ...(skillsJur || {}) };
}

// ─── Cap de skills (nunca passa de 50, nunca cai de 0) ──────────────────────

function capSkill(val) { return Math.max(0, Math.min(50, Math.round(val))); }

// ─── Bar Exam — concede a "primeira estrela" ─────────────────────────────────

/**
 * Chamado ao aprovar o Bar Exam/OAB.
 * Concede +10 XP em legal_drafting e legal_research (cap: 50).
 */
async function concederBarExamBonus(db, uid) {
  const ref  = db.collection('jogadores').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;

  const j     = snap.data();
  const atual = normalizarSkillsJur(j.skills_jur);

  await ref.update({
    'skills_jur.legal_drafting': capSkill(atual.legal_drafting + 10),
    'skills_jur.legal_research': capSkill(atual.legal_research + 10),
  });
}

// ─── Evolução mensal de skills de composição ────────────────────────────────

/**
 * Processa a evolução mensal das skills de composição do jogador.
 * Chamado por avancar_mes.js no loop mensal.
 *
 * Fontes de XP (Etapa 3):
 *   • +1/petição composta neste mês (legal_drafting + legal_research)
 *   • +4/mês se mentoria ativa de NPC sênior (legal_drafting + legal_research)
 *   • Cursos e estudo autônomo são gerenciados pelo study_queue existente
 *     (avancar_mes.js já processa study_queue — basta enfileirar lá)
 */
async function processarEvolucaoSkillsJurMensalCF(db, uid, jogadorData) {
  const j = jogadorData;

  const peticoesCompostas = j.peticoes_compostas_mes || 0;
  const mentoriaAtiva     = j.mentoria_composicao_ativa || false;
  const temEscritorio     = !!j.escritorio_proprio_id;

  const atual = normalizarSkillsJur(j.skills_jur);
  const upd   = {};

  // legal_drafting + legal_research: +1/petição composta, +4/mês com mentoria
  const ganhoJur = peticoesCompostas + (mentoriaAtiva ? 4 : 0);
  if (ganhoJur > 0) {
    const novoLD = capSkill(atual.legal_drafting + ganhoJur);
    const novoLR = capSkill(atual.legal_research + ganhoJur);
    if (novoLD !== atual.legal_drafting) upd['skills_jur.legal_drafting'] = novoLD;
    if (novoLR !== atual.legal_research) upd['skills_jur.legal_research'] = novoLR;
  }

  // gestao: +1/mês por ter escritório próprio com equipe (passivo de gestão)
  // cap em +3/mês mesmo que tenha equipe grande
  if (temEscritorio) {
    const escSnap = await db.collection('escritorios').doc(j.escritorio_proprio_id).collection('funcionarios').limit(5).get();
    const numNpcs = escSnap.docs.filter(d => d.data().tipo === 'npc' && !d.data().burnout_npc).length;
    if (numNpcs > 0) {
      const ganhoGestao = Math.min(3, numNpcs); // +1 por NPC ativo, max 3/mês
      const novoGestao  = capSkill(atual.gestao + ganhoGestao);
      if (novoGestao !== atual.gestao) upd['skills_jur.gestao'] = novoGestao;
    }
  }

  if (Object.keys(upd).length > 0) {
    await db.collection('jogadores').doc(uid).update(upd);
  }
}

// ─── Etapas 5–6: evolução de Document Type e Practice Area por uso ──────────

/**
 * Aplica XP de Document Type Mastery após composição de uma petição.
 * Chamado por peticoes.js ao concluir composição.
 * +1 por composição; +2 bônus de vitória (aplicado em atualizarFama).
 * +50% (arredondado) se o jogador tem "Trabalhar Intensamente" travado como
 * foco do mês (js/ui-main.js:renderFoco, `foco_atual` na jogador doc) — custo
 * em disposição é cobrado à parte, no tick mensal (avancar_mes.js).
 */
async function aplicarXpDocType(db, uid, docType, vitoria) {
  const ref  = db.collection('jogadores').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const dados = snap.data();
  const skJur = normalizarSkillsJur(dados.skills_jur);
  const campo = `doc_${docType}`;
  if (!(campo in skJur)) return;
  let ganho = vitoria ? 2 : 1;
  if (dados.foco_atual === 'trabalhar_intensamente') ganho = Math.round(ganho * 1.5);
  await ref.update({ [`skills_jur.${campo}`]: capSkill(skJur[campo] + ganho) });
}

/**
 * Aplica XP de Practice Area Mastery ao concluir um caso.
 * +2 por caso concluído; +3 bônus vitória; +1 bônus derrota.
 * Chamado por processarSentenca/peticoes ao fechar o processo.
 * Mesmo bônus de "Trabalhar Intensamente" do aplicarXpDocType acima.
 */
async function aplicarXpPracticeArea(db, uid, area, resultado) {
  const ref  = db.collection('jogadores').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const dados = snap.data();
  const skJur = normalizarSkillsJur(dados.skills_jur);
  const campo = `area_${area}`;
  if (!(campo in skJur)) return;
  let ganho = resultado === 'procedente' ? 3 : resultado === 'improcedente' ? 1 : 2;
  if (dados.foco_atual === 'trabalhar_intensamente') ganho = Math.round(ganho * 1.5);
  await ref.update({ [`skills_jur.${campo}`]: capSkill(skJur[campo] + ganho) });
}

// ─── Exposição de constantes (para testes e outros módulos) ─────────────────

module.exports = {
  // Lookup
  calcTetoLegalDrafting,
  calcModLegalResearch,
  calcModDocumentType,
  calcModPracticeArea,
  calcCompatAreasCross,
  // Schema
  defaultSkillsJur,
  normalizarSkillsJur,
  // Ações
  concederBarExamBonus,
  processarEvolucaoSkillsJurMensalCF,
  aplicarXpDocType,
  aplicarXpPracticeArea,
  // Tabelas (para consumo externo se necessário)
  TETO_LEGAL_DRAFTING,
  MOD_LEGAL_RESEARCH,
  MOD_DOCUMENT_TYPE,
  MOD_PRACTICE_AREA,
  COMPAT_AREAS,
  // Utilitários genéricos (reuso em outros módulos, ex. podcasts_social.js)
  interpolate,
  capSkill,
};
