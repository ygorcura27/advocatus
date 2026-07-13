'use strict';

/**
 * PODCASTS / APARIÇÕES NA INTERNET — Advocatus Online (GDD v5.1)
 *
 * Convites chegam de duas formas:
 *  - Genérico ao escritório: escritorios/{escId}/convites_midia — o sócio/gestor
 *    escolhe qual advogado vai.
 *  - Direcionado: quando uma petição do advogado atinge alta popularidade, o
 *    convite cai direto no inbox dele (jogadores/{uid}/inbox), pré-selecionado.
 *
 * Fórmula de views (índice de potencial viral 0-100 → multiplicador exponencial
 * leve sobre a audiência-base do podcast), conforme especificação do usuário:
 *   potencial = 35% comunicação midiática + 20% popularidade da petição
 *             + 20% reputação + 10% oratória + 10% networking + 5% tema em alta
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { normalizarSkillsJur, capSkill, interpolate } = require('./skills');
const { AREAS, CATALOGO_PODCASTS, getPodcastPorId } = require('./podcasts_catalogo');
const { clampReputacao } = require('./shared/repCap');

const ENERGIA_MIDIA = 6;

// Curva exponencial leve — potencial viral (0-100) → multiplicador sobre a audiência-base
const CURVA_MULTIPLICADOR = { 0: 0.2, 20: 0.4, 40: 0.8, 60: 1.3, 70: 2.0, 80: 3.2, 90: 5.5, 100: 9.0 };
const LIMIAR_VIRAL = 3.2; // multiplicador a partir do qual consideramos "viralizou"

function calcularPotencialViral({ comunicacaoPct, popPeticaoPct, reputacaoPct, oratoriaPct, networkingPct, temaBonus }) {
  const bruto = 0.35 * comunicacaoPct + 0.20 * popPeticaoPct + 0.20 * reputacaoPct
              + 0.10 * oratoriaPct + 0.10 * networkingPct + 0.05 * temaBonus;
  return Math.max(0, Math.min(100, bruto));
}

/** Calcula as views finais de uma participação, dado o jogador, o podcast e a petição (opcional) vinculada. */
function calcularViews(jogador, podcast, peticao, temaTrendingMes) {
  const skJur = normalizarSkillsJur(jogador.skills_jur);
  const comunicacaoPct = (skJur.comunicacao_midiatica || 0) * 2;      // 0-50 → 0-100
  const oratoriaPct    = (skJur.oral_advocacy || 0) * 2;              // 0-50 → 0-100
  const reputacaoPct   = Math.min(100, jogador.reputacao || 0);
  const networkingPct  = Math.min(100, jogador.networking || 0);
  const popPeticaoPct  = Math.min(100, (peticao && peticao.popularidade) || 0);
  const temaBonus      = (podcast.area === temaTrendingMes) ? 100 : 0;

  const potencial    = calcularPotencialViral({ comunicacaoPct, popPeticaoPct, reputacaoPct, oratoriaPct, networkingPct, temaBonus });
  const multiplicador = interpolate(CURVA_MULTIPLICADOR, potencial);
  const aleatoriedade = 0.85 + Math.random() * 0.30; // 0.85–1.15

  const views = Math.round(podcast.audiencia_base * multiplicador * aleatoriedade);
  const viral = multiplicador >= LIMIAR_VIRAL;

  return { views, viral, potencial: Math.round(potencial), multiplicador };
}

// ════════════════════════════════════════════════════════
// RESPONDER CONVITE (aceitar/recusar + escolher advogado quando genérico)
// ════════════════════════════════════════════════════════
exports.responderConviteMidia = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { convite_id, escritorio_id, aceito, advogado_uid } = request.data || {};

  if (!convite_id) throw new HttpsError('invalid-argument', 'convite_id obrigatório.');

  // Convite de escritório (coleção escritorios/{id}/convites_midia) ou direto no inbox do jogador
  const conviteRef = escritorio_id
    ? db.collection('escritorios').doc(escritorio_id).collection('convites_midia').doc(convite_id)
    : db.collection('jogadores').doc(uid).collection('convites_midia').doc(convite_id);

  const conviteSnap = await conviteRef.get();
  if (!conviteSnap.exists) throw new HttpsError('not-found', 'Convite não encontrado.');
  const convite = conviteSnap.data();

  if (convite.status !== 'pendente') {
    throw new HttpsError('failed-precondition', 'Este convite já foi respondido.');
  }

  if (escritorio_id) {
    const escSnap = await db.collection('escritorios').doc(escritorio_id).get();
    if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
    const esc = escSnap.data();
    const ehDono = esc.dono_uid === uid || esc.fundador_uid === uid;
    const ehSocio = (esc.socios || []).some(s => s.uid === uid) || esc.gestor_id === uid;
    if (!ehDono && !ehSocio) {
      throw new HttpsError('permission-denied', 'Só sócios ou o gestor podem responder convites de mídia.');
    }
  } else if (convite.uid && convite.uid !== uid) {
    throw new HttpsError('permission-denied', 'Convite não é seu.');
  }

  if (!aceito) {
    await conviteRef.update({ status: 'recusado', respondido_em: new Date().toISOString() });
    return { ok: true, msg: 'Convite recusado.' };
  }

  const advUid = escritorio_id ? advogado_uid : uid;
  if (!advUid) throw new HttpsError('invalid-argument', 'É preciso selecionar um advogado.');

  const jogSnap = await db.collection('jogadores').doc(advUid).get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Advogado não encontrado.');
  const j = jogSnap.data();

  if ((j.energia || 0) < ENERGIA_MIDIA) {
    throw new HttpsError('failed-precondition', `Energia insuficiente. Participar custa ${ENERGIA_MIDIA}⚡.`);
  }
  const mesGlobal = j.mes_global_pessoal || 0;
  if (j.midia_ultimo_mes === mesGlobal) {
    throw new HttpsError('failed-precondition', 'Esse advogado já participou de uma aparição na mídia este mês.');
  }

  const podcast = getPodcastPorId(convite.podcast_id);
  if (!podcast) throw new HttpsError('failed-precondition', 'Podcast do convite não encontrado no catálogo.');

  // Petição vinculada (convite direcionado) — usada como fator de popularidade
  let peticao = null;
  if (convite.peticao_id) {
    const pSnap = await db.collection('peticoes').doc(convite.peticao_id).get();
    if (pSnap.exists) peticao = pSnap.data();
  }

  const serverSnap = await db.collection('config').doc('server').get();
  const temaTrendingMes = serverSnap.data()?.tema_trending_mes || null;

  const { views, viral, potencial } = calcularViews(j, podcast, peticao, temaTrendingMes);

  const skJur = normalizarSkillsJur(j.skills_jur);
  const novaComunicacao = capSkill(skJur.comunicacao_midiatica + (viral ? 2 : 1));

  const repGanho = Math.min(5, Math.round(views / 100000));
  const popGanho = Math.min(10, Math.round(views / 50000));
  const honorarios = podcast.tier * 800;
  const influenciaGanha = Math.round((views * novaComunicacao) / 50);

  await db.collection('jogadores').doc(advUid).update({
    energia:              FieldValue.increment(-ENERGIA_MIDIA),
    energia_usada_mes:    FieldValue.increment(ENERGIA_MIDIA),
    reputacao:            clampReputacao(j.reputacao, j.cargo_id, repGanho),
    popularidade_pessoal: FieldValue.increment(popGanho),
    dinheiro:             FieldValue.increment(honorarios),
    'skills_jur.comunicacao_midiatica': novaComunicacao,
    midia_ultimo_mes:     mesGlobal,
    midia_total:          FieldValue.increment(1),
    podcast_views_mes:    FieldValue.increment(views),
    podcast_views_acumul: FieldValue.increment(views),
    podcast_influencia:   FieldValue.increment(influenciaGanha),
  });

  await conviteRef.update({
    status: 'concluido',
    advogado_uid: advUid,
    views, viral, potencial,
    rep_ganho: repGanho,
    pop_ganho: popGanho,
    honorarios,
    respondido_em: new Date().toISOString(),
  });

  logger.info(`[MIDIA] ${advUid} → ${podcast.nome} (tier ${podcast.tier}), views=${views}, viral=${viral}`);

  return { ok: true, views, viral, potencial, rep_ganho: repGanho, pop_ganho: popGanho, honorarios, podcast_nome: podcast.nome };
});

// ════════════════════════════════════════════════════════
// GERAÇÃO MENSAL — tema em alta + convites (chamado pelo tick_mensal)
// ════════════════════════════════════════════════════════

// Sem regionalização — sorteia apenas entre as 7 áreas jurídicas canônicas.
async function sortearTemaEGerarConvites(db, mesGlobal) {
  const temaTrendingMes = AREAS[Math.floor(Math.random() * AREAS.length)];
  await db.collection('config').doc('server').set({ tema_trending_mes: temaTrendingMes }, { merge: true });

  // ── Convites genéricos ao escritório (tier do podcast = tier do escritório) ──
  try {
    const escSnap = await db.collection('escritorios').limit(200).get();
    for (const doc of escSnap.docs) {
      const esc = doc.data();
      const area = esc.especialidade_principal || esc.especialidade;
      const tier = Math.max(1, Math.min(5, esc.tier || 1));
      if (!area || !AREAS.includes(area)) continue;
      if (Math.random() > 0.30) continue; // ~30% de chance de convite/mês

      const podcast = CATALOGO_PODCASTS.find(p => p.area === area && p.tier === tier);
      if (!podcast) continue;

      await db.collection('escritorios').doc(doc.id).collection('convites_midia').add({
        podcast_id: podcast.id,
        podcast_nome: podcast.nome,
        area, tier,
        tipo: 'generico',
        status: 'pendente',
        mes_global: mesGlobal,
        criado_em: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error('[MIDIA] Erro ao gerar convites genéricos:', err);
  }

  // ── Convites direcionados (petição com popularidade alta) ──
  try {
    const pSnap = await db.collection('peticoes')
      .where('popularidade', '>=', 80)
      .limit(50)
      .get();

    for (const doc of pSnap.docs) {
      const p = doc.data();
      if (!p.jogador_uid || !AREAS.includes(p.practice_area)) continue;
      if (Math.random() > 0.40) continue; // ~40% de chance de convite direcionado

      const tier = Math.max(1, Math.min(5, Math.ceil((p.popularidade || 80) / 20)));
      const podcast = CATALOGO_PODCASTS.find(pc => pc.area === p.practice_area && pc.tier === tier);
      if (!podcast) continue;

      await db.collection('jogadores').doc(p.jogador_uid).collection('convites_midia').add({
        uid: p.jogador_uid,
        podcast_id: podcast.id,
        podcast_nome: podcast.nome,
        area: podcast.area,
        tier,
        tipo: 'direcionado',
        peticao_id: doc.id,
        peticao_titulo: p.titulo || p.nome || null,
        status: 'pendente',
        mes_global: mesGlobal,
        criado_em: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error('[MIDIA] Erro ao gerar convites direcionados:', err);
  }
}

module.exports = {
  responderConviteMidia: exports.responderConviteMidia,
  sortearTemaEGerarConvites,
  calcularViews,
};
