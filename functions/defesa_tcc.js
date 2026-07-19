'use strict';

/**
 * DEFESA DE TCC — Advocatus Online
 * Etapa final de Mestrado/Doutorado depois que a frequência bate 12/12 —
 * banca de defesa em rodadas, mesmo esquema de turnos/força/limiar do
 * Julgamento (functions/investigacao.js::executarRodadaJulgamento),
 * adaptado: sem fase de investigação (não há fato oculto numa defesa
 * acadêmica) e sem sistema de favores (não existe rede de contatos numa
 * banca) — só pergunta → defender/deixar cair → força acumulada vs limiar.
 *
 * Estado vive na própria peça (dissertação/tese), não em processos:
 * peticao.defesa_banca = { pecas_restantes:[{id,tema,dificuldade}],
 *   forca_total, forca_max, rodada_atual, log, veredito }
 *
 * Callables: iniciarDefesaTCC | responderBancaTCC | finalizarDefesaTCC
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { normalizarSkillsJur } = require('./skills');
const { PROGRAMAS, concluirProgramaAoAprovar, elegibilidadeFrequencia } = require('./posgraduacao');
const { debitarEnergiaCategoria } = require('./energia_categorias');

const ENERGIA_DEFESA = 8;
const N_PERGUNTAS = { mestrado: 3, doutorado: 4 };
const LIMIAR_APROVACAO_PCT = 0.60; // 60% da força máxima possível das perguntas

const TEMAS_BANCA = [
  'Metodologia', 'Referencial teórico', 'Originalidade da tese central',
  'Aplicação prática', 'Consistência argumentativa', 'Revisão bibliográfica',
];

// Peça "no limite" (nota rente ao mínimo do programa) puxa perguntas mais
// difíceis — banca mais cética quanto menos folga a nota_teto tem acima
// do nota_min_peca exigido.
function _gerarPerguntas(n, notaTeto, notaMin) {
  const folga = Math.max(0, notaTeto - notaMin);
  const dificuldadeBase = Math.max(15, 45 - folga * 2);
  const temas = [...TEMAS_BANCA].sort(() => Math.random() - 0.5);
  const perguntas = [];
  for (let i = 0; i < n; i++) {
    const dificuldade = Math.max(10, Math.round(dificuldadeBase + (Math.random() * 20 - 10)));
    perguntas.push({ id: `pb_${i}`, tema: temas[i % temas.length], dificuldade });
  }
  return perguntas;
}

exports.iniciarDefesaTCC = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { peticao_id } = request.data || {};
  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');

  const db = getFirestore();
  const [jSnap, pSnap] = await Promise.all([
    db.collection('jogadores').doc(uid).get(),
    db.collection('peticoes').doc(peticao_id).get(),
  ]);
  if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  if (!pSnap.exists) throw new HttpsError('not-found', 'Peça não encontrada.');
  const j = jSnap.data(), p = pSnap.data();
  const cfg = PROGRAMAS[j.posgrad_programa];

  if (p.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Esta peça não é sua.');
  if (j.posgrad_status !== 'cursando' || !cfg) {
    throw new HttpsError('failed-precondition', 'Você não está cursando nenhum programa.');
  }
  if (p.categoria !== cfg.categoria_peca) {
    throw new HttpsError('failed-precondition', `O programa exige uma peça do tipo ${cfg.categoria_peca}.`);
  }
  if (p.status !== 'pronta') throw new HttpsError('failed-precondition', 'A peça deve estar finalizada (pronta).');
  const freq = elegibilidadeFrequencia(j, cfg);
  if (!freq.elegivel) {
    const motivo = !freq.tempoOk
      ? `aulas ainda não concluídas (${freq.decorridos}/${freq.duracao} meses)`
      : `frequência abaixo de 70% (atual: ${Math.round(freq.pctFreq*100)}%)`;
    throw new HttpsError('failed-precondition', `A defesa só libera com as aulas concluídas: ${motivo}.`);
  }
  if (p.defesa_banca && !p.defesa_banca.veredito) {
    throw new HttpsError('failed-precondition', 'Defesa já em andamento.');
  }
  // GDD v6.0 §3.1 — categoria Estudo (defesa é etapa de pós-graduação).
  const energiaPatch = debitarEnergiaCategoria(j, 'estudo', ENERGIA_DEFESA, 'apresentar a defesa');

  const n = N_PERGUNTAS[j.posgrad_programa] || 3;
  const perguntas = _gerarPerguntas(n, p.nota_teto || 0, cfg.nota_min_peca);
  const defesa_banca = {
    pecas_restantes: perguntas,
    forca_total: 0,
    forca_max: perguntas.reduce((s, q) => s + q.dificuldade, 0),
    rodada_atual: 0,
    log: [],
    veredito: null,
  };

  await Promise.all([
    db.collection('peticoes').doc(peticao_id).update({ defesa_banca }),
    db.collection('jogadores').doc(uid).update(energiaPatch),
  ]);

  logger.info(`[DEFESA TCC] ${uid} iniciou defesa de ${peticao_id} (${j.posgrad_programa}, ${n} perguntas)`);
  return { ok: true, perguntas: perguntas.map(q => ({ id: q.id, tema: q.tema })), total: n };
});

exports.responderBancaTCC = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { peticao_id, reacao } = request.data || {}; // 'defender' | 'deixar_cair'
  if (!peticao_id || !reacao) throw new HttpsError('invalid-argument', 'peticao_id e reacao obrigatórios.');

  const db = getFirestore();
  const [jSnap, pSnap] = await Promise.all([
    db.collection('jogadores').doc(uid).get(),
    db.collection('peticoes').doc(peticao_id).get(),
  ]);
  if (!jSnap.exists || !pSnap.exists) throw new HttpsError('not-found', 'Jogador ou peça não encontrados.');
  const j = jSnap.data(), p = pSnap.data();
  if (p.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Esta peça não é sua.');

  const defesa = p.defesa_banca;
  if (!defesa || defesa.veredito) throw new HttpsError('failed-precondition', 'Defesa não está em andamento.');
  if (defesa.pecas_restantes.length === 0) {
    throw new HttpsError('failed-precondition', 'Não há mais perguntas — chame finalizarDefesaTCC.');
  }
  if (reacao !== 'defender' && reacao !== 'deixar_cair') {
    throw new HttpsError('invalid-argument', 'reacao inválida.');
  }

  const skJur = normalizarSkillsJur(j.skills_jur);
  const pergunta = defesa.pecas_restantes[0];

  let forcaFinal = 0, sucesso = null;
  if (reacao === 'defender') {
    // Domínio da matéria (Legal Drafting/Research) + capacidade de se expor
    // com clareza pra banca (Didática Acadêmica) — mesmo espírito do
    // sk.bonusOratoria em executarRodadaJulgamento, sem reaproveitar o
    // módulo (aquele é calibrado pra audiência de processo, não pra banca).
    const dominio = (skJur.legal_drafting + skJur.legal_research) / 2 + (j.didatica_academica || 0) * 0.4;
    const chance  = Math.min(92, Math.max(8, 35 + dominio * 0.8 - pergunta.dificuldade * 0.3));
    sucesso = Math.random() * 100 < chance;
    forcaFinal = sucesso ? pergunta.dificuldade : Math.round(pergunta.dificuldade * 0.4);
  } else {
    forcaFinal = 0;
    sucesso = false;
  }

  defesa.forca_total += forcaFinal;
  defesa.pecas_restantes = defesa.pecas_restantes.filter(q => q.id !== pergunta.id);
  defesa.rodada_atual += 1;
  defesa.log.push({ pergunta_id: pergunta.id, tema: pergunta.tema, reacao, forca_obtida: forcaFinal, sucesso });

  await db.collection('peticoes').doc(peticao_id).update({ defesa_banca: defesa });

  return {
    rodada: defesa.rodada_atual, tema: pergunta.tema, forca_obtida: forcaFinal, sucesso,
    perguntas_restantes: defesa.pecas_restantes.length, forca_total: defesa.forca_total,
  };
});

exports.finalizarDefesaTCC = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { peticao_id } = request.data || {};
  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');

  const db = getFirestore();
  const [jSnap, pSnap] = await Promise.all([
    db.collection('jogadores').doc(uid).get(),
    db.collection('peticoes').doc(peticao_id).get(),
  ]);
  if (!jSnap.exists || !pSnap.exists) throw new HttpsError('not-found', 'Jogador ou peça não encontrados.');
  const j = jSnap.data(), p = pSnap.data();
  if (p.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Esta peça não é sua.');

  const defesa = p.defesa_banca;
  if (!defesa) throw new HttpsError('failed-precondition', 'Defesa não foi iniciada.');
  if (defesa.veredito) return { veredito: defesa.veredito, aprovado: defesa.veredito === 'aprovado' };
  if (defesa.pecas_restantes.length > 0) throw new HttpsError('failed-precondition', 'Ainda há perguntas a responder.');

  const cfg = PROGRAMAS[j.posgrad_programa];
  if (!cfg) throw new HttpsError('internal', 'Configuração do programa não encontrada.');

  const pctObtido = defesa.forca_max > 0 ? defesa.forca_total / defesa.forca_max : 0;
  const aprovado  = pctObtido >= LIMIAR_APROVACAO_PCT;
  const veredito  = aprovado ? 'aprovado' : 'reprovado';

  if (aprovado) {
    await concluirProgramaAoAprovar(db, uid, j, j.posgrad_programa, cfg, peticao_id, p.nota_teto || 0);
    await db.collection('peticoes').doc(peticao_id).update({ 'defesa_banca.veredito': veredito });
  } else {
    // Reprovado na banca: NÃO conclui o programa, mas a peça continua
    // 'pronta' (nota intacta) — pode tentar a defesa de novo depois, mesmo
    // padrão de "sempre pode tentar de novo" já usado pra reescrever peça
    // (js/posgraduacao_ui.js).
    await db.collection('peticoes').doc(peticao_id).update({ defesa_banca: null });
  }

  logger.info(`[DEFESA TCC] ${uid} — ${veredito} (${Math.round(pctObtido*100)}%) em ${peticao_id}`);
  return {
    veredito, aprovado, forca_total: defesa.forca_total, forca_max: defesa.forca_max,
    pct: Math.round(pctObtido * 100),
  };
});
