'use strict';

/**
 * ESCRITÓRIOS NPC EMPREGADORES — Advocatus Online
 *
 * O catálogo de 90 escritórios fixos (js/escritorios_npc.js) onde jogadores
 * se candidatam/são convidados é dado 100% client-side — nunca teve doc real
 * em /escritorios/{id}. Isso derrubava toda leitura das subcoleções que
 * dependem de get() no doc pai pra checar dono/sócio/funcionário
 * (clientes, oportunidades, processos_pool, log_equipe — ver firestore.rules),
 * com "Missing or insufficient permissions" em cascata, e o jogador contratado
 * nunca era de fato registrado como funcionário (funcionarios_uids nunca
 * ganhava o uid), então nunca via processos do pool — sem processo, sem XP.
 *
 * Esta callable materializa o doc (idempotente) na hora da primeira
 * contratação, com um dono/sócio NPC de verdade (skills reais, mesma curva
 * skills_jur usada pros funcionários — CAP_JUR_NPC=50, ver js/equipe.js) e
 * uma equipe inicial já contratada, escalada pelo tier. Cloud Function (Admin
 * SDK) porque a criação do doc e da equipe inicial não passa pelas regras de
 * cliente — ninguém é "dono" real de um escritório NPC pra satisfazer
 * isDono() na escrita.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { gerarNomeAdvogado } = require('./npc/geradores');

// IDs do catálogo seguem o padrão <especialidade>_t<tier>_<letra>, ex.: 'tri_t3_b'.
// O tier vem embutido no próprio id — não precisa duplicar os 90 registros
// do catálogo aqui, só validar o formato e extrair o tier.
const ID_RE = /^[a-z]+_t([1-5])_[a-z]$/;

const CAP_JUR_NPC = 50;
const CARGO_JUR_BASE = { est: 4, ass: 8, jnr: 14, pln: 20, snr: 26, soc: 34 };
const SKILL_JUR_KEYS = [
  'legal_drafting', 'legal_research', 'argumentation', 'oral_advocacy',
  'negotiation', 'procedure', 'gestao',
  'doc_initial_filing', 'doc_responsive_pleading', 'doc_motion',
  'doc_appellate_brief', 'doc_supreme_brief', 'doc_trial_brief',
  'doc_evidence', 'doc_deposition',
  'area_employment', 'area_tax', 'area_civil', 'area_criminal',
  'area_corporate', 'area_immigration', 'area_bankruptcy',
];
const SKILLS_BASE_CARGO = {
  est: { pesquisa: 12, escrita: 10, argumentacao: 10, oratoria: 8, gestao: 3 },
  ass: { pesquisa: 22, escrita: 20, argumentacao: 18, oratoria: 15, gestao: 8 },
  jnr: { pesquisa: 30, escrita: 28, argumentacao: 28, oratoria: 25, gestao: 15 },
  pln: { pesquisa: 40, escrita: 38, argumentacao: 38, oratoria: 35, gestao: 25 },
  snr: { pesquisa: 50, escrita: 48, argumentacao: 48, oratoria: 45, gestao: 35 },
  soc: { pesquisa: 50, escrita: 50, argumentacao: 50, oratoria: 50, gestao: 50 },
};
// Quantos funcionários NPC já vêm contratados quando o escritório nasce,
// por tier — mesma capacidade usada em js/vagas.js (TIER_CAPACIDADE), só que
// já parcialmente ocupada em vez de vazia (escritório "vivo" desde o início).
const STAFF_INICIAL_POR_TIER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
const CARGOS_STAFF_POR_TIER = {
  1: ['est'], 2: ['est', 'ass'], 3: ['ass', 'jnr'],
  4: ['jnr', 'pln'], 5: ['pln', 'snr'],
};

function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function gerarSkillsJur(cargoId) {
  const base = CARGO_JUR_BASE[cargoId] || CARGO_JUR_BASE.est;
  const skills = {};
  for (const k of SKILL_JUR_KEYS) {
    skills[k] = Math.max(0, Math.min(CAP_JUR_NPC, Math.round(base * (0.6 + Math.random() * 0.6))));
  }
  return skills;
}

function gerarSkills(cargoId) {
  const base = SKILLS_BASE_CARGO[cargoId] || SKILLS_BASE_CARGO.est;
  const skills = {};
  for (const [k, v] of Object.entries(base)) {
    skills[k] = Math.max(1, Math.round(v * (0.7 + Math.random() * 0.6)));
  }
  return skills;
}

function gerarFuncionarioNPC(cargoId) {
  return {
    nome: gerarNomeAdvogado(),
    cargo_id: cargoId,
    skills: gerarSkills(cargoId),
    skills_jur: gerarSkillsJur(cargoId),
    sexo: Math.random() < 0.5 ? 'm' : 'f',
    tipo: 'npc',
    foto_npc: null,
    dono_uid: null, // ninguém "contratou" — já veio com o escritório
    ativo: true,
    acoes_mes_usadas: 0,
    acao_atual: null,
    criado_em: new Date().toISOString(),
    estresse: 0,
    afinidade_com_npcs: {},
    mentor_id: null,
    aprendizes_ids: [],
    skill_sendo_treinada: null,
    skill_em_estudo: null,
    meses_no_cargo: rndInt(1, 6),
    casos_resolvidos_mes: 0,
    casos_resolvidos_total: 0,
    feedback_media_estrelas: 3,
    feedback_media_acumulada: 0,
    feedback_ruim_acumulado: 0,
    reputacao_interna: 50,
    conflitos_ativos: [],
    ultimas_ferias_mes_total: null,
    clientes_vetados: [],
  };
}

async function _garantirEscritorioEmpregadorNPC(db, escId, catalogo = {}) {
  const escRef = db.collection('escritorios').doc(escId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(escRef);
    if (snap.exists) return { id: escId, data: snap.data(), criado: false };

    const match = ID_RE.exec(escId);
    if (!match) throw new HttpsError('invalid-argument', `escId fora do padrão do catálogo NPC: "${escId}".`);
    const tier = Number(match[1]);

    const donoNpc = {
      nome: gerarNomeAdvogado(),
      cargo_id: 'soc',
      skills: gerarSkills('soc'),
      skills_jur: gerarSkillsJur('soc'),
    };

    const escData = {
      // Nome/bairro/especialidade só cosméticos (mesmo dado estático já
      // visível ao cliente em js/escritorios_npc.js) — o único campo
      // economicamente relevante, tier, vem do próprio ID, não do payload.
      nome: typeof catalogo.nome === 'string' ? catalogo.nome.slice(0, 80) : 'Escritório',
      esp: typeof catalogo.esp === 'string' ? catalogo.esp : null,
      bairro: typeof catalogo.bairro === 'string' ? catalogo.bairro : null,
      e_npc: true,
      npc_catalogo: true,
      tier,
      dono_uid: null,
      fundador_uid: null,
      dono_npc: donoNpc,
      socios_uids: [],
      socios: [],
      gestor_id: null,
      caixa: tier * 5000,
      vagas_ocupadas: { est: 0, ass: 0, adv: 0 },
      funcionarios_uids: [],
      criado_em: new Date().toISOString(),
    };
    tx.set(escRef, escData, { merge: true });

    const cargosDisponiveis = CARGOS_STAFF_POR_TIER[tier] || CARGOS_STAFF_POR_TIER[1];
    const nStaff = STAFF_INICIAL_POR_TIER[tier] || 1;
    for (let i = 0; i < nStaff; i++) {
      const cargoId = cargosDisponiveis[rndInt(0, cargosDisponiveis.length - 1)];
      const funcRef = escRef.collection('funcionarios').doc();
      tx.set(funcRef, gerarFuncionarioNPC(cargoId));
    }

    return { id: escId, data: escData, criado: true };
  });
}

/**
 * Callable: garante que o doc do escritório NPC exista (idempotente) e,
 * opcionalmente, promove o jogador a sócio (trilha gestor → sócio, GDD
 * "escritórios NPC precisam ter vida" — ver vagas.js::_confirmarCandidatura,
 * chamada quando o jogador aceita a promoção 'socio_associado').
 * A escrita em socios_uids/socios exige Admin SDK: as regras do Firestore só
 * deixam dono/sócio existente alterar esses campos, e um funcionário virando
 * sócio ainda não é nenhum dos dois.
 */
exports.garantirEscritorioEmpregadorNPC = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escId, tornarSocio, cargoOferta, nome, esp, bairro } = request.data || {};
  if (!escId) throw new HttpsError('invalid-argument', 'escId obrigatório.');

  const db = getFirestore();
  const resultado = await _garantirEscritorioEmpregadorNPC(db, escId, { nome, esp, bairro });

  if (tornarSocio) {
    const escRef = db.collection('escritorios').doc(escId);
    const escSnap = await escRef.get();
    const esc = escSnap.data();

    if (!(esc.socios_uids || []).includes(uid)) {
      // Participação modesta e fixa — o dono NPC não é um sócio real no
      // array (é uma persona à parte em dono_npc), então não há "de quem
      // tirar" percentual: o jogador simplesmente ganha uma fatia nova.
      const participacaoPct = Math.min(15, 5 + esc.tier);
      await escRef.update({
        socios_uids: FieldValue.arrayUnion(uid),
        socios: FieldValue.arrayUnion({
          uid, participacao_pct: participacaoPct, cargo: cargoOferta || 'soc',
        }),
      });
      await db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema', para_uid: uid,
        assunto: `⭐ Você é sócio(a) — ${esc.nome || 'escritório'}`,
        corpo: `Sua promoção foi confirmada: você agora é sócio(a) com ${participacaoPct}% de participação nos lucros de ${esc.nome || 'escritório'}.`,
        tipo: 'sistema', tipo_noticia: 'positivo', lida: false, criado_em: new Date().toISOString(),
      });
      logger.info(`[ESCRITÓRIO NPC] ${uid} virou sócio(a) de ${escId} (${participacaoPct}%)`);
    }
  }

  const escFinalSnap = await db.collection('escritorios').doc(escId).get();
  return { ok: true, criado: resultado.criado, escritorio: { id: escId, ...escFinalSnap.data() } };
});

exports._garantirEscritorioEmpregadorNPC = _garantirEscritorioEmpregadorNPC;
