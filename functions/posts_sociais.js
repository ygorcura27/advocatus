'use strict';

/**
 * POSTS (Redes Sociais) — Advocatus Online
 * Feed real e persistido: publicar, curtir, apagar. Sem grafo de
 * seguidores nem ganho de skill — só o registro social em si, feed
 * global ordenado por data (não personalizado por quem você segue).
 * publicarPost | curtirPost | deletarPost
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const LIMITE_HORAS_ENTRE_POSTS = 20;
const TEXTO_MAX = 280;

exports.publicarPost = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const texto = (request.data?.texto || '').trim();

  if (texto.length < 1 || texto.length > TEXTO_MAX) {
    throw new HttpsError('invalid-argument', `Texto deve ter entre 1 e ${TEXTO_MAX} caracteres.`);
  }

  const db = getFirestore();
  const jogRef = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogSnap.data();

  if (j.ultimo_post_em) {
    const horasDesde = (Date.now() - new Date(j.ultimo_post_em).getTime()) / 3600000;
    if (horasDesde < LIMITE_HORAS_ENTRE_POSTS) {
      const faltam = Math.ceil(LIMITE_HORAS_ENTRE_POSTS - horasDesde);
      throw new HttpsError('resource-exhausted', `Aguarde mais ${faltam}h pra publicar de novo.`);
    }
  }

  const agora = new Date().toISOString();
  const postRef = await db.collection('posts').add({
    autor_uid:  uid,
    autor_nome: j.nome_personagem || 'Advogado(a)',
    autor_cargo: j.cargo_id || null,
    texto,
    curtidas: 0,
    curtido_por: [],
    criado_em: agora,
  });

  await jogRef.update({ ultimo_post_em: agora });

  logger.info(`[POST] ${uid} publicou ${postRef.id}`);
  return { ok: true, post_id: postRef.id, msg: 'Publicado.' };
});

exports.curtirPost = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { post_id } = request.data || {};
  if (!post_id) throw new HttpsError('invalid-argument', 'post_id obrigatório.');

  const db = getFirestore();
  const postRef = db.collection('posts').doc(post_id);

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Post não encontrado.');
    const p = snap.data();
    const curtiu = (p.curtido_por || []).includes(uid);
    if (curtiu) {
      tx.update(postRef, { curtido_por: FieldValue.arrayRemove(uid), curtidas: FieldValue.increment(-1) });
      return { curtiu: false };
    }
    tx.update(postRef, { curtido_por: FieldValue.arrayUnion(uid), curtidas: FieldValue.increment(1) });
    return { curtiu: true };
  });

  return { ok: true, ...resultado };
});

exports.deletarPost = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { post_id } = request.data || {};
  if (!post_id) throw new HttpsError('invalid-argument', 'post_id obrigatório.');

  const db = getFirestore();
  const postRef = db.collection('posts').doc(post_id);
  const snap = await postRef.get();
  if (!snap.exists) return { ok: true, msg: 'Já não existia.' };
  if (snap.data().autor_uid !== uid) {
    throw new HttpsError('permission-denied', 'Só o autor pode apagar o post.');
  }
  await postRef.delete();
  return { ok: true, msg: 'Post apagado.' };
});
