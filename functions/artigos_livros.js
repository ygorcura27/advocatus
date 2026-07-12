'use strict';

/**
 * ARTIGOS E LIVROS — Advocatus Online (GDD v5.1 §31-34)
 *
 * Artigos acadêmicos e livros são peças com categoria 'artigo' | 'livro'.
 * Em vez de fama (usada nos processos), acumulam CITAÇÕES.
 * Citações contribuem para: Cátedra (req 500), prestígio acadêmico, Didática.
 *
 * Livros têm royalties mensais — o autor recebe uma porcentagem do preço
 * por cada cópia vendida durante a vigência do livro no Mercado.
 *
 * Callables:
 *   confeccionarObra    — inicia composição de artigo (2 meses) ou livro (3 meses)
 *   publicarLivro       — publica livro no Mercado com preço-base
 *   citarObra           — registra citação de outro jogador; +XP Didática ao autor
 *   obterObrasPublicas  — lista artigos/livros de um autor (por profile_id)
 *
 * Processamento mensal:
 *   processarRoyaltiesLivros — chamado por avancar_mes; paga royalties ao autor
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const ROYALTY_PCT   = 0.15;   // 15% do preço-base por cópia vendida no mês
const MESES_VIGENCIA_LIVRO = 24;  // Livro no mercado por até 24 meses

// ─── Callable: confeccionarObra ───────────────────────────────────────────────

exports.confeccionarObra = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { categoria, practice_area, titulo, tese_central } = request.data || {};

  if (!['artigo', 'livro'].includes(categoria)) {
    throw new HttpsError('invalid-argument', 'categoria deve ser "artigo" ou "livro".');
  }
  if (!practice_area) throw new HttpsError('invalid-argument', 'practice_area obrigatório.');

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();

  // Requisitos mínimos
  const grau = j.posgrad_concluido;
  if (!grau) {
    throw new HttpsError('failed-precondition', 'Você precisa ter pelo menos Mestrado para publicar obras acadêmicas.');
  }
  if (categoria === 'livro' && !['doutorado', 'catedral'].includes(grau)) {
    throw new HttpsError('failed-precondition', 'Apenas Doutores e Catedráticos podem publicar livros.');
  }

  const mesGlobal   = j.mes_global_pessoal || 0;
  const duracao     = categoria === 'livro' ? 3 : 2;
  const mesConclusao = mesGlobal + duracao;

  const nomeAuto = titulo || `${categoria === 'livro' ? '📗 Livro' : '📄 Artigo'} — ${practice_area}`;

  const novaObra = {
    jogador_uid:      uid,
    autores:          [{ uid, contribuicao_pct: 100 }],
    titulo:           nomeAuto,
    nome:             nomeAuto,
    titulo_travado:   false,
    document_type:    categoria === 'livro' ? 'book' : 'academic_article',
    categoria,
    practice_area,
    tese_central:     tese_central || null,
    estilo_escrita:   'legalista',
    nota_teto:        null,
    nota_argumentacao: null,
    nota_redacao:     null,
    fama:             0,
    fama_teto_desbloqueado: 0,   // Obras académicas não têm fama — têm citações
    citacoes:         0,
    citacoes_mes:     0,
    popularidade:     0,
    decaimento_ativo: false,
    usos_total:       0,
    vitorias:         0,
    derrotas:         0,
    vitorias_por_instancia: {},
    ultimo_uso:       null,
    processos_usada:  [],
    status:           'em_composicao',
    mes_conclusao:    mesConclusao,
    mes_global_inicio: mesGlobal,
    generica:         false,
    transferivel:     true,
    royalties_acumulados: 0,
    criada_em:        new Date().toISOString(),
  };

  const ref = await db.collection('peticoes').add(novaObra);

  // Atualiza contadores
  await db.collection('jogadores').doc(uid).update({
    peticoes_compostas_mes: FieldValue.increment(1),
  });

  logger.info(`[OBRA] ${uid} iniciou ${categoria} (${practice_area}), finaliza mês ${mesConclusao}`);
  return { ok: true, peticao_id: ref.id, mes_conclusao: mesConclusao, duracao };
});

// ─── Callable: publicarLivro ──────────────────────────────────────────────────

exports.publicarLivro = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id, preco_base } = request.data || {};

  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');
  const preco = Number(preco_base);
  if (!preco || preco < 100) throw new HttpsError('invalid-argument', 'preco_base mínimo R$100.');

  const petRef  = db.collection('peticoes').doc(peticao_id);
  const petSnap = await petRef.get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Obra não encontrada.');

  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Esta obra não é sua.');
  if (pet.categoria !== 'livro') throw new HttpsError('failed-precondition', 'Apenas livros podem ser publicados no Mercado.');
  if (pet.status !== 'pronta') throw new HttpsError('failed-precondition', 'O livro deve estar finalizado antes de publicar.');
  if (pet.no_mercado) throw new HttpsError('already-exists', 'Livro já publicado no Mercado.');

  const jogSnap = await db.collection('jogadores').doc(uid).get();
  const j = jogSnap.data();
  const mesGlobal = j.mes_global_pessoal || 0;

  await petRef.update({
    no_mercado:         true,
    preco_mercado:      preco,
    preco_base_livro:   preco,
    publicada_em:       new Date().toISOString(),
    mes_publicacao:     mesGlobal,
    mes_vigencia_fim:   mesGlobal + MESES_VIGENCIA_LIVRO,
    copias_vendidas:    0,
    copias_mes_atual:   0,
    royalties_pagos_total: 0,
  });

  // Registra publicação no jogador
  await db.collection('jogadores').doc(uid).update({
    livros_publicados: FieldValue.increment(1),
    prestigio_academico: FieldValue.increment(5),
  });

  logger.info(`[LIVRO] ${uid} publicou "${pet.titulo}" por R$${preco}`);
  return { ok: true, peticao_id, preco_base: preco };
});

// ─── Callable: citarObra ─────────────────────────────────────────────────────

exports.citarObra = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { obra_id } = request.data || {};

  if (!obra_id) throw new HttpsError('invalid-argument', 'obra_id obrigatório.');

  const petRef  = db.collection('peticoes').doc(obra_id);
  const petSnap = await petRef.get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Obra não encontrada.');

  const pet = petSnap.data();
  if (!['artigo', 'livro'].includes(pet.categoria)) {
    throw new HttpsError('failed-precondition', 'Só é possível citar artigos ou livros.');
  }
  if (pet.jogador_uid === uid) {
    throw new HttpsError('failed-precondition', 'Você não pode citar sua própria obra.');
  }

  // Registra citação na obra
  await petRef.update({
    citacoes:     FieldValue.increment(1),
    citacoes_mes: FieldValue.increment(1),
    ultimo_uso:   new Date().toISOString(),
  });

  // Atualiza totais do autor: citacoes_totais + Didática Acadêmica (cap 50)
  if (pet.jogador_uid) {
    const autoRef  = db.collection('jogadores').doc(pet.jogador_uid);
    const autoSnap = await autoRef.get();
    if (autoSnap.exists) {
      const autoD = autoSnap.data();
      await autoRef.update({
        citacoes_totais:    FieldValue.increment(1),
        didatica_academica: Math.min(50, (autoD.didatica_academica || 0) + 1),
        prestigio_academico: FieldValue.increment(1),
      });
    }
  }

  logger.info(`[CITACAO] ${uid} citou obra ${obra_id} de ${pet.jogador_uid}`);
  return { ok: true, citacoes: (pet.citacoes || 0) + 1 };
});

// ─── Callable: obterObrasPublicas ────────────────────────────────────────────

exports.obterObrasPublicas = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const { uid_autor, profile_id } = request.data || {};
  const db = getFirestore();

  let uidAlvo = uid_autor;

  if (!uidAlvo && profile_id) {
    const snap = await db.collection('jogadores')
      .where('profile_id', '==', String(profile_id))
      .limit(1).get();
    if (!snap.empty) uidAlvo = snap.docs[0].id;
  }
  if (!uidAlvo) throw new HttpsError('invalid-argument', 'uid_autor ou profile_id obrigatório.');

  const snap = await db.collection('peticoes')
    .where('jogador_uid', '==', uidAlvo)
    .where('categoria', 'in', ['artigo', 'livro'])
    .where('status', '==', 'pronta')
    .orderBy('citacoes', 'desc')
    .limit(20)
    .get();

  const obras = snap.docs.map(d => {
    const p = d.data();
    return {
      id:         d.id,
      titulo:     p.titulo || '—',
      categoria:  p.categoria,
      practice_area: p.practice_area,
      citacoes:   p.citacoes || 0,
      nota_teto:  p.nota_teto || null,
      no_mercado: p.no_mercado || false,
      preco:      p.preco_mercado || null,
      publicada_em: p.publicada_em || p.criada_em,
    };
  });

  return { ok: true, obras };
});

// ─── Processamento mensal: royalties de livros ────────────────────────────────

/**
 * Chamado por avancar_mes para cada jogador.
 * Paga royalties baseado em cópias vendidas no mês atual.
 * Returns: total_royalties pago ao jogador.
 */
async function processarRoyaltiesLivros(db, uid, mesGlobal) {
  const snap = await db.collection('peticoes')
    .where('jogador_uid', '==', uid)
    .where('categoria', '==', 'livro')
    .where('no_mercado', '==', true)
    .get();

  if (snap.empty) return 0;

  let totalRoyalties = 0;
  const proms = [];

  for (const doc of snap.docs) {
    const p = doc.data();

    // Encerrar livro expirado
    if (p.mes_vigencia_fim && mesGlobal > p.mes_vigencia_fim) {
      proms.push(doc.ref.update({ no_mercado: false, vigencia_encerrada_em: new Date().toISOString() }));
      continue;
    }

    const copiasMes = p.copias_mes_atual || 0;
    if (copiasMes <= 0) continue;

    const royaltiesMes = Math.floor((p.preco_base_livro || 0) * copiasMes * ROYALTY_PCT);
    if (royaltiesMes <= 0) continue;

    totalRoyalties += royaltiesMes;
    proms.push(doc.ref.update({
      copias_mes_atual:       0,   // zera para o próximo mês
      royalties_acumulados:   FieldValue.increment(royaltiesMes),
      royalties_pagos_total:  FieldValue.increment(royaltiesMes),
    }));
  }

  if (proms.length > 0) await Promise.all(proms);

  if (totalRoyalties > 0) {
    await db.collection('jogadores').doc(uid).update({
      dinheiro: FieldValue.increment(totalRoyalties),
    });
    logger.info(`[ROYALTIES] ${uid} recebeu R$${totalRoyalties} em royalties`);
  }

  return totalRoyalties;
}

// ─── Hook: registrar cópia vendida ───────────────────────────────────────────

/**
 * Chamado quando um livro é comprado no Mercado.
 * Registra a cópia para que o royalty seja processado no próximo avancar_mes.
 */
async function registrarCopiaVendida(db, peticaoId) {
  try {
    await db.collection('peticoes').doc(peticaoId).update({
      copias_vendidas:  FieldValue.increment(1),
      copias_mes_atual: FieldValue.increment(1),
    });
  } catch (e) {
    logger.warn('[ROYALTIES] Erro ao registrar cópia:', e.message);
  }
}

module.exports = Object.assign(module.exports, {
  processarRoyaltiesLivros,
  registrarCopiaVendida,
});
