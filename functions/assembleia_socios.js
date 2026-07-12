'use strict';

/**
 * ASSEMBLEIA DE SÓCIOS — Advocatus Online
 * Votação ponderada por participacao_pct entre os sócios de um escritório.
 * abrirVotacao | votar | encerrarVotacao
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

function _normalizarSocios(esc) {
  const donoFallback = esc.dono_uid || esc.fundador_uid;
  if (Array.isArray(esc.socios) && esc.socios.length > 0) {
    const primeiroValido = esc.socios[0] && typeof esc.socios[0] === 'object' && esc.socios[0].uid;
    if (primeiroValido) {
      return esc.socios
        .filter(s => s && typeof s === 'object' && s.uid)
        .map(s => ({ uid: s.uid, participacao_pct: s.participacao_pct || 0 }));
    }
    return esc.socios.map((uidStr, i) => ({
      uid: typeof uidStr === 'string' ? uidStr : donoFallback,
      participacao_pct: i === 0 ? 100 : 0,
    }));
  }
  return [{ uid: donoFallback, participacao_pct: 100 }];
}

// ════════════════════════════════════════════════════════
// ABRIR VOTAÇÃO
// ════════════════════════════════════════════════════════
exports.abrirVotacao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escritorio_id, titulo, descricao } = request.data;

  if (!escritorio_id) throw new HttpsError('invalid-argument', 'escritorio_id obrigatório.');
  const tit = (titulo || '').trim();
  if (tit.length < 5 || tit.length > 120) {
    throw new HttpsError('invalid-argument', 'Título deve ter entre 5 e 120 caracteres.');
  }
  const desc = (descricao || '').trim().slice(0, 800);

  const db = getFirestore();
  const escRef = db.collection('escritorios').doc(escritorio_id);
  const escSnap = await escRef.get();
  if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
  const esc = escSnap.data();
  const socios = _normalizarSocios(esc);

  if (!socios.some(s => s.uid === uid)) {
    throw new HttpsError('permission-denied', 'Apenas sócios podem abrir uma votação.');
  }
  if (socios.length < 2) {
    throw new HttpsError('failed-precondition', 'Assembleia exige pelo menos 2 sócios.');
  }

  const abertas = await escRef.collection('votacoes').where('status', '==', 'aberta').get();
  if (abertas.size >= 5) {
    throw new HttpsError('resource-exhausted', 'Máximo de 5 votações abertas simultâneas.');
  }

  const server = await db.collection('config').doc('server').get();
  const mesAtual = server.data()?.mes_global || 1;

  const jogSnap = await db.collection('jogadores').doc(uid).get();
  const nomeAutor = jogSnap.data()?.nome_personagem || uid;

  const votRef = await escRef.collection('votacoes').add({
    titulo: tit,
    descricao: desc,
    criado_por: uid,
    criado_por_nome: nomeAutor,
    criado_mes: mesAtual,
    criado_em: new Date().toISOString(),
    status: 'aberta',
    votos: {},
    socios_snapshot: socios,
  });

  await escRef.collection('log_gestao').add({
    tipo: 'assembleia',
    texto: `📋 ${nomeAutor} abriu a votação "${tit}".`,
    mes: mesAtual,
    criado_em: new Date().toISOString(),
  });

  logger.info(`[ASSEMBLEIA] ${uid} abriu votação ${votRef.id} em ${escritorio_id}`);
  return { ok: true, votacao_id: votRef.id, msg: 'Votação aberta.' };
});

// ════════════════════════════════════════════════════════
// VOTAR
// ════════════════════════════════════════════════════════
exports.votar = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escritorio_id, votacao_id, voto } = request.data;

  if (!escritorio_id || !votacao_id) {
    throw new HttpsError('invalid-argument', 'escritorio_id e votacao_id obrigatórios.');
  }
  if (voto !== 'sim' && voto !== 'nao') {
    throw new HttpsError('invalid-argument', "voto precisa ser 'sim' ou 'nao'.");
  }

  const db = getFirestore();
  const escRef = db.collection('escritorios').doc(escritorio_id);
  const escSnap = await escRef.get();
  if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
  const socios = _normalizarSocios(escSnap.data());
  if (!socios.some(s => s.uid === uid)) {
    throw new HttpsError('permission-denied', 'Apenas sócios podem votar.');
  }

  const votRef = escRef.collection('votacoes').doc(votacao_id);
  const votSnap = await votRef.get();
  if (!votSnap.exists) throw new HttpsError('not-found', 'Votação não encontrada.');
  if (votSnap.data().status !== 'aberta') {
    throw new HttpsError('failed-precondition', 'Esta votação já foi encerrada.');
  }

  await votRef.update({ [`votos.${uid}`]: voto });

  logger.info(`[ASSEMBLEIA] ${uid} votou '${voto}' em ${votacao_id}`);
  return { ok: true, msg: 'Voto registrado.' };
});

// ════════════════════════════════════════════════════════
// ENCERRAR VOTAÇÃO — apura pelo participacao_pct de quem votou
// ════════════════════════════════════════════════════════
exports.encerrarVotacao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escritorio_id, votacao_id } = request.data;

  if (!escritorio_id || !votacao_id) {
    throw new HttpsError('invalid-argument', 'escritorio_id e votacao_id obrigatórios.');
  }

  const db = getFirestore();
  const escRef = db.collection('escritorios').doc(escritorio_id);
  const escSnap = await escRef.get();
  if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
  const socios = _normalizarSocios(escSnap.data());
  if (!socios.some(s => s.uid === uid)) {
    throw new HttpsError('permission-denied', 'Apenas sócios podem encerrar uma votação.');
  }

  const votRef = escRef.collection('votacoes').doc(votacao_id);
  const votSnap = await votRef.get();
  if (!votSnap.exists) throw new HttpsError('not-found', 'Votação não encontrada.');
  const vot = votSnap.data();
  if (vot.status !== 'aberta') {
    throw new HttpsError('failed-precondition', 'Esta votação já foi encerrada.');
  }

  const votos = vot.votos || {};
  let pctSim = 0, pctNao = 0, pctAbstencao = 0;
  socios.forEach(s => {
    const v = votos[s.uid];
    if (v === 'sim') pctSim += s.participacao_pct;
    else if (v === 'nao') pctNao += s.participacao_pct;
    else pctAbstencao += s.participacao_pct;
  });

  const aprovada = pctSim > pctNao;
  const status = aprovada ? 'aprovada' : 'rejeitada';

  await votRef.update({
    status,
    resultado_pct_sim: pctSim,
    resultado_pct_nao: pctNao,
    resultado_pct_abstencao: pctAbstencao,
    encerrado_por: uid,
    encerrado_em: new Date().toISOString(),
  });

  const server = await db.collection('config').doc('server').get();
  const mesAtual = server.data()?.mes_global || 1;
  await escRef.collection('log_gestao').add({
    tipo: 'assembleia',
    texto: `${aprovada ? '✅ Aprovada' : '❌ Rejeitada'}: "${vot.titulo}" (${pctSim}% sim / ${pctNao}% não / ${pctAbstencao}% absteve).`,
    mes: mesAtual,
    criado_em: new Date().toISOString(),
  });

  logger.info(`[ASSEMBLEIA] ${votacao_id} encerrada: ${status} (${pctSim}/${pctNao})`);
  return { ok: true, status, pct_sim: pctSim, pct_nao: pctNao, msg: `Votação encerrada: ${status}.` };
});
