'use strict';

/**
 * PETIÇÕES GENÉRICAS GLOBAIS — Advocatus Online (GDD v5.1 §8-10)
 *
 * Exatamente 3 documentos em /peticoes_genericas/ — compartilhados por todos
 * os jogadores e NPCs que não possuem peça própria para a situação.
 *
 * Diferente das peças próprias:
 *   - Fama e popularidade são agregadas do servidor inteiro
 *   - Toda escrita usa FieldValue.increment() — concorrência alta
 *   - nota_teto fixo em 12 para todos os 3 documentos
 *
 * Exporta:
 *   calcularNotaEfetivaGenerica — nota efetiva baseada na fama/pop do servidor
 *   registrarUsoGenerica        — atualiza métricas após uso em processo
 *   inicializarGenericas        — cria os 3 documentos se não existirem (idempotente)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { modPopularidade, bonusFama } = require('./peticoes');

const NOTA_TETO_GENERICA = 12;

// IDs fixos das 3 genéricas (não mudam nunca)
const IDS_GENERICAS = ['generica_1', 'generica_2', 'generica_3'];

// Critério de seleção: qual genérica usar para qual caso
// generica_1 → padrão universal (todos os tipos)
// generica_2 → casos trabalhistas/previdenciários
// generica_3 → casos criminais
function selecionarGenerica(practiceArea) {
  if (['employment', 'immigration', 'bankruptcy'].includes(practiceArea)) return 'generica_2';
  if (practiceArea === 'criminal') return 'generica_3';
  return 'generica_1';
}

/**
 * Calcula nota efetiva de uma genérica global — mesma fórmula das peças próprias
 * mas capped em NOTA_TETO_GENERICA.
 */
function calcularNotaEfetivaGenerica(generica) {
  const notaTeto = NOTA_TETO_GENERICA;
  const modPop   = modPopularidade(generica.popularidade ?? 0);
  const bFama    = bonusFama(generica.fama ?? 0);
  const raw      = Math.round(notaTeto * modPop) + bFama;
  return Math.max(1, Math.min(notaTeto, raw));
}

/**
 * Registra uso de uma genérica após sentença — usa FieldValue.increment() em
 * todos os campos para suportar alta concorrência.
 */
async function registrarUsoGenerica(db, genericaId, resultado) {
  const ganhoFama = resultado === 'procedente' ? 8 : resultado === 'acordo' ? 4 : 2;
  try {
    await db.collection('peticoes_genericas').doc(genericaId).update({
      fama:        FieldValue.increment(Math.min(ganhoFama, NOTA_TETO_GENERICA * 3 - /* cap implícito */ 0)),
      usos_total:  FieldValue.increment(1),
    });
    // Fama é capped em 100 — não há teto diferenciado por instância para genéricas
    const snap = await db.collection('peticoes_genericas').doc(genericaId).get();
    if (snap.exists && (snap.data().fama || 0) > 100) {
      await snap.ref.update({ fama: 100 });
    }
  } catch (e) {
    logger.warn(`[GENERICA] Erro ao registrar uso de ${genericaId}:`, e.message);
  }
}

/**
 * Cria os 3 documentos genéricos fixos se ainda não existirem.
 * Idempotente — seguro chamar múltiplas vezes.
 */
async function inicializarGenericas(db) {
  const proms = IDS_GENERICAS.map(async (id) => {
    const ref  = db.collection('peticoes_genericas').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id,
        nota_teto:   NOTA_TETO_GENERICA,
        fama:        0,
        popularidade: 0,
        usos_total:  0,
        criada_em:   new Date().toISOString(),
      });
      logger.info(`[GENERICA] Criada ${id}`);
    }
  });
  await Promise.all(proms);
}

// ─── Decaimento de popularidade (tick global) ────────────────────────────────

/**
 * Processa decaimento de popularidade das genéricas globais.
 * Chamado por tick_mensal.js ou avancar_mes_global.js.
 * Genéricas decaem mais rápido que peças próprias — uso em massa desgasta.
 */
async function processarDecaimentoGenericas(db) {
  const snaps = await db.collection('peticoes_genericas').get();
  const proms = [];
  for (const d of snaps.docs) {
    const pop = d.data().popularidade || 0;
    if (pop <= 0) continue;
    // Decaimento maior que peças próprias (uso em massa)
    const decaim = pop >= 80 ? 12 : pop >= 60 ? 8 : 4;
    const novaPop = Math.max(0, pop - decaim);
    proms.push(d.ref.update({ popularidade: novaPop }));
  }
  if (proms.length > 0) await Promise.all(proms);
}

// ─── Callable: obterPeticaoGenerica ──────────────────────────────────────────

/**
 * Retorna dados da genérica global adequada para o contexto do processo.
 * Não cria nada — apenas lê o estado atual da genérica do servidor.
 */
exports.obterPeticaoGenerica = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const { practice_area } = request.data || {};
  const db = getFirestore();

  const genericaId = selecionarGenerica(practice_area || 'civil');
  const snap = await db.collection('peticoes_genericas').doc(genericaId).get();

  if (!snap.exists) {
    // Inicialização lazy — cria se não existe
    await inicializarGenericas(db);
    const snap2 = await db.collection('peticoes_genericas').doc(genericaId).get();
    const gen = snap2.data();
    const notaEfetiva = calcularNotaEfetivaGenerica(gen);
    return { ok: true, generica_id: genericaId, nota_teto: NOTA_TETO_GENERICA, nota_efetiva: notaEfetiva, ...gen };
  }

  const gen = snap.data();
  const notaEfetiva = calcularNotaEfetivaGenerica(gen);

  return { ok: true, generica_id: genericaId, nota_teto: NOTA_TETO_GENERICA, nota_efetiva: notaEfetiva, ...gen };
});

// ─── Exportações internas ────────────────────────────────────────────────────

module.exports = Object.assign(module.exports, {
  calcularNotaEfetivaGenerica,
  registrarUsoGenerica,
  inicializarGenericas,
  processarDecaimentoGenericas,
  selecionarGenerica,
  NOTA_TETO_GENERICA,
  IDS_GENERICAS,
});
