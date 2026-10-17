'use strict';

/**
 * XP PARCIAL DE INSTRUÇÃO — portado de js/processos.js:
 * _creditarXpParcialInstrucao. Estagiário/Assistente que leva um caso do
 * pool até o ponto em que só um Advogado Júnior+ pode concluir recebe um
 * XP simbólico, uma única vez por caso. Antes o navegador somava o XP
 * direto no doc do jogador; agora as regras não deixam mais o cliente
 * aumentar XP, então o crédito (e a trava de "uma vez por caso") vem daqui.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Espelho de js/processos.js (XP_PARCIAL_INSTRUCAO / PROGRESSO_MAX_SEM_ADVOGADO).
const XP_PARCIAL_INSTRUCAO = { est: 3, ass: 6 };
const PROGRESSO_MAX_SEM_ADVOGADO = 90;

exports.creditarXpParcialInstrucao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { procId } = request.data || {};
  if (typeof procId !== 'string') throw new HttpsError('invalid-argument', 'procId obrigatório.');

  const db    = getFirestore();
  const pRef  = db.collection('processos').doc(procId);
  const jRef  = db.collection('jogadores').doc(uid);

  return db.runTransaction(async (tx) => {
    const [pSnap, jSnap] = await Promise.all([tx.get(pRef), tx.get(jRef)]);
    if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
    const p = pSnap.data();
    const j = jSnap.data();

    const xpGanho = XP_PARCIAL_INSTRUCAO[j.cargo_id] || 0;
    if (!xpGanho) return { ok: true, xp: 0 };
    if (p.xp_parcial_creditado) return { ok: true, xp: 0 };
    if (!p.pool_escritorio_id || (p.progresso || 0) < PROGRESSO_MAX_SEM_ADVOGADO) {
      throw new HttpsError('failed-precondition', 'Instrução ainda não concluída.');
    }
    const vinculado = p.advogado_uid === uid || p.assumido_uid === uid
      || j.escritorio_empregado_id === p.pool_escritorio_id || j.escritorio_proprio_id === p.pool_escritorio_id;
    if (!vinculado) throw new HttpsError('permission-denied', 'Caso de outro escritório.');

    tx.update(pRef, { xp_parcial_creditado: true });
    tx.update(jRef, { xp: FieldValue.increment(xpGanho) });
    return { ok: true, xp: xpGanho };
  });
});
