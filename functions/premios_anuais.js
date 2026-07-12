'use strict';

/**
 * PRÊMIOS ANUAIS — Advocatus Online (GDD v5.1 §13)
 *
 * 5 categorias, processadas 1× por ano de jogo (todo Janeiro no tick global).
 * Vencedores recebem notificação + bônus permanente de reputação.
 *
 * Categorias:
 *   1. Advogado do Ano       — maior wins_ano entre todos os jogadores
 *   2. Escritório do Ano     — maior prestígio entre todos os escritórios
 *   3. Petição do Ano        — maior fama entre todas as petições ativas
 *   4. Júnior Revelação      — maior wins_ano entre est/jnr/ass
 *   5. Paladino da Justiça   — maior reputação entre advogados não-sócios
 *
 * Os contadores anuais (wins_ano, etc.) são zerados após a apuração.
 */

const { FieldValue } = require('firebase-admin/firestore');
const { logger }     = require('firebase-functions');

const BONUS_PREMIADO = {
  advogado_do_ano:   { rep: 8,  dinheiro: 50000,  label: '🏆 Advogado do Ano' },
  escritorio_do_ano: { rep: 5,  dinheiro: 100000, label: '🏢 Escritório do Ano' },
  peticao_do_ano:    { rep: 5,  dinheiro: 30000,  label: '📜 Petição do Ano'   },
  junior_revelacao:  { rep: 6,  dinheiro: 25000,  label: '⭐ Júnior Revelação' },
  paladino_justica:  { rep: 5,  dinheiro: 20000,  label: '⚖️ Paladino da Justiça' },
};

/**
 * Processa os 5 prêmios anuais.
 * Deve ser chamado no tick de Janeiro (mes_jogo === 0) após o processamento dos jogadores.
 */
async function processarPremiosAnuais(db, anoJogo) {
  logger.info(`[PREMIOS] Apurando prêmios — Ano ${anoJogo}`);

  const proms = await Promise.allSettled([
    _premioAdvogadoDoAno(db, anoJogo),
    _premioEscritorioDoAno(db, anoJogo),
    _premioPeticaoDoAno(db, anoJogo),
    _premioJuniorRevelacao(db, anoJogo),
    _premioPaladinoDaJustica(db, anoJogo),
  ]);

  proms.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.warn(`[PREMIOS] Categoria ${i + 1} falhou:`, r.reason?.message);
    }
  });

  // Registrar no documento de histórico
  try {
    await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
      ano_jogo: anoJogo,
      processado_em: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    logger.warn('[PREMIOS] Erro ao registrar histórico:', e.message);
  }

  logger.info(`[PREMIOS] Prêmios do Ano ${anoJogo} concluídos`);
}

// ─── Categoria 1: Advogado do Ano ────────────────────────────────────────────

async function _premioAdvogadoDoAno(db, anoJogo) {
  const snap = await db.collection('jogadores')
    .orderBy('wins_ano', 'desc')
    .limit(1).get();
  if (snap.empty) return;

  const vencedor = snap.docs[0];
  const d = vencedor.data();
  const cfg = BONUS_PREMIADO.advogado_do_ano;

  await _concederPremio(db, vencedor.id, 'advogado_do_ano', cfg, anoJogo,
    `${d.nome_personagem || 'Você'} ganhou ${d.wins_ano || 0} processos este ano — o maior do servidor!`);

  // Registrar no histórico global
  await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
    advogado_do_ano: { uid: vencedor.id, nome: d.nome_personagem, wins: d.wins_ano || 0 },
  }, { merge: true });
}

// ─── Categoria 2: Escritório do Ano ──────────────────────────────────────────

async function _premioEscritorioDoAno(db, anoJogo) {
  const snap = await db.collection('escritorios')
    .orderBy('prestigio', 'desc')
    .limit(1).get();
  if (snap.empty) return;

  const esc = snap.docs[0];
  const d   = esc.data();
  const cfg = BONUS_PREMIADO.escritorio_do_ano;

  // Notifica e bonifica o fundador
  if (d.fundador_uid) {
    await _concederPremio(db, d.fundador_uid, 'escritorio_do_ano', cfg, anoJogo,
      `${d.nome || 'Seu escritório'} foi eleito o melhor do ano com ${d.prestigio || 0} de prestígio!`);
  }
  // Bônus de reputação a todos os sócios
  const socios = d.socios_uids || [];
  await Promise.all(socios.filter(uid => uid !== d.fundador_uid).map(uid =>
    db.collection('jogadores').doc(uid).update({ reputacao: FieldValue.increment(3) }).catch(() => {})
  ));
  // Bônus ao escritório em si
  await esc.ref.update({ caixa: FieldValue.increment(cfg.dinheiro) });

  await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
    escritorio_do_ano: { id: esc.id, nome: d.nome, prestigio: d.prestigio || 0 },
  }, { merge: true });
}

// ─── Categoria 3: Petição do Ano ─────────────────────────────────────────────

async function _premioPeticaoDoAno(db, anoJogo) {
  const snap = await db.collection('peticoes')
    .where('status', '==', 'pronta')
    .orderBy('fama', 'desc')
    .limit(1).get();
  if (snap.empty) return;

  const pet = snap.docs[0];
  const d   = pet.data();
  const cfg = BONUS_PREMIADO.peticao_do_ano;

  if (d.jogador_uid) {
    await _concederPremio(db, d.jogador_uid, 'peticao_do_ano', cfg, anoJogo,
      `"${d.titulo || 'Sua petição'}" foi a peça mais famosa do ano (fama: ${d.fama || 0}/100)!`);
  }
  // Co-autores também recebem bônus proporcional
  if (Array.isArray(d.autores) && d.autores.length > 1) {
    await Promise.all(d.autores.filter(a => a.uid !== d.jogador_uid).map(a =>
      db.collection('jogadores').doc(a.uid).update({
        reputacao: FieldValue.increment(Math.floor(cfg.rep * a.contribuicao_pct / 100)),
      }).catch(() => {})
    ));
  }

  await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
    peticao_do_ano: { id: pet.id, titulo: d.titulo, fama: d.fama || 0, autor: d.jogador_uid },
  }, { merge: true });
}

// ─── Categoria 4: Júnior Revelação ────────────────────────────────────────────

async function _premioJuniorRevelacao(db, anoJogo) {
  const snap = await db.collection('jogadores')
    .where('cargo_id', 'in', ['est', 'ass', 'jnr'])
    .orderBy('wins_ano', 'desc')
    .limit(1).get();
  if (snap.empty) return;

  const vencedor = snap.docs[0];
  const d = vencedor.data();
  const cfg = BONUS_PREMIADO.junior_revelacao;

  await _concederPremio(db, vencedor.id, 'junior_revelacao', cfg, anoJogo,
    `${d.nome_personagem || 'Você'} foi o melhor novato do ano com ${d.wins_ano || 0} vitórias!`);

  await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
    junior_revelacao: { uid: vencedor.id, nome: d.nome_personagem, wins: d.wins_ano || 0, cargo: d.cargo_id },
  }, { merge: true });
}

// ─── Categoria 5: Paladino da Justiça ────────────────────────────────────────

async function _premioPaladinoDaJustica(db, anoJogo) {
  // Maior reputação entre não-sócios (advogados independentes/empregados)
  const snap = await db.collection('jogadores')
    .where('cargo_id', 'in', ['jnr', 'pln', 'snr', 'asc'])
    .orderBy('reputacao', 'desc')
    .limit(1).get();
  if (snap.empty) return;

  const vencedor = snap.docs[0];
  const d = vencedor.data();
  const cfg = BONUS_PREMIADO.paladino_justica;

  await _concederPremio(db, vencedor.id, 'paladino_justica', cfg, anoJogo,
    `${d.nome_personagem || 'Você'} demonstrou integridade e excelência — o maior defensor do Ano ${anoJogo}!`);

  await db.collection('premios_anuais').doc(`ano_${anoJogo}`).set({
    paladino_justica: { uid: vencedor.id, nome: d.nome_personagem, rep: d.reputacao || 0 },
  }, { merge: true });
}

// ─── Utilitário: conceder prêmio ─────────────────────────────────────────────

async function _concederPremio(db, uid, categoria, cfg, anoJogo, detalhes) {
  const jogRef = db.collection('jogadores').doc(uid);
  await Promise.all([
    jogRef.update({
      reputacao: FieldValue.increment(cfg.rep),
      dinheiro:  FieldValue.increment(cfg.dinheiro),
      [`premios.${categoria}_${anoJogo}`]: true,
    }),
    jogRef.collection('inbox').add({
      de:         'sistema',
      assunto:    `${cfg.label} — Ano ${anoJogo}`,
      corpo:      `Parabéns! ${detalhes}\n\nBônus: +${cfg.rep} reputação e +R$${cfg.dinheiro.toLocaleString('pt-BR')}.`,
      tipo:       'sistema',
      tipo_noticia: 'positivo',
      lida:       false,
      criado_em:  new Date().toISOString(),
    }),
  ]);
  logger.info(`[PREMIOS] ${cfg.label} (Ano ${anoJogo}) → ${uid}`);
}

/**
 * Zera contadores anuais de todos os jogadores após a apuração.
 */
async function zerarContadoresAnuais(db) {
  let cursor = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection('jogadores').orderBy('uid').limit(400);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { wins_ano: 0, losses_ano: 0 }));
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 400) break;
  }
  logger.info('[PREMIOS] Contadores anuais zerados');
}

module.exports = { processarPremiosAnuais, zerarContadoresAnuais };
