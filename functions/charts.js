'use strict';

/**
 * CHARTS DO SERVIDOR — Advocatus Online (GDD v5.1 §14)
 *
 * Retorna os Top 10 de 4 categorias num único call.
 * Os dados são pré-computados pelo tick_mensal e armazenados em /rankings/.
 * Inclui também o chart de petições mais famosas (top10 por fama).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

const CATEGORIAS_JOGADOR = ['reputacao', 'dinheiro', 'wins', 'networking'];

exports.obterCharts = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const db = getFirestore();

  // Busca os 4 rankings em paralelo + peticoes top fama
  const [rankingSnaps, petSnap] = await Promise.all([
    Promise.all(CATEGORIAS_JOGADOR.map(cat =>
      db.collection('rankings').doc(cat).get()
    )),
    db.collection('peticoes')
      .where('status', '==', 'pronta')
      .orderBy('fama', 'desc')
      .limit(10)
      .get(),
  ]);

  const charts = {};

  for (let i = 0; i < CATEGORIAS_JOGADOR.length; i++) {
    const cat  = CATEGORIAS_JOGADOR[i];
    const snap = rankingSnaps[i];
    if (snap.exists) {
      const d = snap.data();
      charts[cat] = {
        label:        d.label || cat,
        top10:        d.top10 || [],
        atualizado_em: d.atualizado_em || null,
      };
    } else {
      charts[cat] = { label: cat, top10: [], atualizado_em: null };
    }
  }

  // Chart de petições mais famosas
  charts.peticoes_fama = {
    label: 'Petições Mais Famosas',
    top10: petSnap.docs.map((doc, i) => {
      const d = doc.data();
      return {
        pos:        i + 1,
        id:         doc.id,
        titulo:     d.titulo || '—',
        fama:       d.fama || 0,
        popularidade: d.popularidade || 0,
        autor_uid:  d.jogador_uid || null,
        nota_teto:  d.nota_teto || null,
      };
    }),
    atualizado_em: new Date().toISOString(),
  };

  logger.info(`[CHARTS] Retornando charts para ${request.auth.uid}`);
  return { ok: true, charts };
});
