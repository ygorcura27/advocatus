'use strict';

/**
 * IMPRENSA JURÍDICA — Advocatus Online (GDD v5.1 §15)
 *
 * 3 veículos de imprensa que cobrem o servidor:
 *   - Supreme Wire       — cobertura de decisões de instância superior
 *   - The Daily Docket   — resumo diário (mensal in-game) de processos notáveis
 *   - The Brief          — foco em petições e doutrina jurídica
 *
 * A imprensa gera notícias automaticamente no tick mensal quando:
 *   - Um processo é concluído em appeals/supreme com resultado procedente
 *   - Uma petição atinge fama ≥ 80
 *   - Um jogador atinge reputação ≥ 80
 *
 * Notícias ficam em /noticias_imprensa/ — listas públicas.
 * Jogadores afetados recebem notificação em /jogadores/{uid}/inbox/.
 *
 * Callable:
 *   obterNoticiasImprensa — retorna as últimas N notícias de um veículo
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

const VEICULOS = {
  supreme_wire:    { label: 'Supreme Wire',       foco: 'decisoes_superiores' },
  the_daily_docket:{ label: 'The Daily Docket',   foco: 'processos_notaveis'  },
  the_brief:       { label: 'The Brief',           foco: 'doutrina_peticoes'   },
};

// ─── Templates de manchetes ───────────────────────────────────────────────────

const MANCHETES_DECISAO = [
  '{{nome}} obtém decisão histórica no {{tribunal}}',
  'Vitória expressiva: {{nome}} vence em {{tribunal}}',
  '{{nome}} consolida trajetória com acórdão favorável',
  'Precedente fixado: {{nome}} vence em {{tribunal}}',
];

const MANCHETES_FAMA_PETICAO = [
  '"{{titulo}}" torna-se referência no mercado jurídico',
  'A peça de {{nome}} é a mais citada do servidor esta semana',
  '{{nome}} e sua {{tipo}} dominam o cenário doutrinário',
];

const MANCHETES_REP_JOGADOR = [
  '{{nome}} alcança o ápice da carreira — reputação histórica',
  'Destaque do servidor: {{nome}} ultrapassa a barreira dos 80 pontos',
  '{{nome}}: a trajetória que inspira toda uma geração',
];

function _sortear(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function _manchete(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || k);
}

// ─── Callable: obterNoticiasImprensa ─────────────────────────────────────────

exports.obterNoticiasImprensa = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const { veiculo, limite = 10 } = request.data || {};
  const db = getFirestore();

  if (veiculo && !VEICULOS[veiculo]) {
    throw new HttpsError('invalid-argument', `Veículo inválido. Use: ${Object.keys(VEICULOS).join(', ')}.`);
  }

  let query = db.collection('noticias_imprensa')
    .orderBy('publicado_em', 'desc')
    .limit(Math.min(limite, 50));

  if (veiculo) query = query.where('veiculo', '==', veiculo);

  const snap = await query.get();
  const noticias = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { ok: true, noticias };
});

// ─── Funções internas: geração de notícias ────────────────────────────────────

/**
 * Publica uma notícia de decisão notável (appeals ou supreme).
 * Chamado por processar_sentenca / processar_acordao após sentença.
 */
async function publicarNoticiaSentenca(db, { nomeJogador, uid, resultado, instancia, tituloProcesso, mesGlobal }) {
  if (!['appeals', 'circuit', 'supreme'].includes(instancia)) return;
  if (resultado !== 'procedente') return;

  const tribunal = instancia === 'supreme' ? 'STF' : instancia === 'circuit' ? 'TRF' : 'TJRJ';
  const tpl = _sortear(MANCHETES_DECISAO);
  const manchete = _manchete(tpl, { nome: nomeJogador, tribunal });

  const noticia = {
    veiculo:      'supreme_wire',
    manchete,
    subtitulo:    `Em "${tituloProcesso}", a decisão reforça a relevância do advogado no cenário nacional.`,
    uid_citado:   uid,
    nome_citado:  nomeJogador,
    instancia,
    resultado,
    mes_global:   mesGlobal || 0,
    publicado_em: new Date().toISOString(),
    lida_por:     [],
  };

  try {
    const ref = await db.collection('noticias_imprensa').add(noticia);
    // Notifica o jogador
    await db.collection('jogadores').doc(uid).collection('inbox').add({
      de:         'imprensa',
      assunto:    `📰 Supreme Wire: "${manchete}"`,
      corpo:      `Você foi destaque no Supreme Wire! A imprensa cobriu sua vitória em "${tituloProcesso}" no ${tribunal}. +1 reputação pelo destaque.`,
      tipo:       'sistema',
      tipo_noticia: 'positivo',
      lida:       false,
      criado_em:  new Date().toISOString(),
    });
    // Pequeno bônus de reputação pela cobertura
    await db.collection('jogadores').doc(uid).update({ reputacao: FieldValue.increment(1) });
    logger.info(`[IMPRENSA] Supreme Wire publicou: ${ref.id}`);
  } catch (e) {
    logger.warn('[IMPRENSA] Erro ao publicar notícia:', e.message);
  }
}

/**
 * Verifica e publica notícias do tick mensal (fama de petição / reputação alta).
 * Chamado pelo tick_mensal no passo 4 de eventos globais.
 */
async function processarImprensaMensal(db, mesGlobal) {
  // ── Petições de fama ≥ 80 → The Brief ──
  try {
    const petSnap = await db.collection('peticoes')
      .where('fama', '>=', 80)
      .where('status', '==', 'pronta')
      .limit(3)
      .get();

    for (const doc of petSnap.docs) {
      const p = doc.data();
      // Evita publicar a mesma notícia duas vezes no mesmo mês
      const jaPublicou = await db.collection('noticias_imprensa')
        .where('tipo', '==', 'fama_peticao')
        .where('peticao_id', '==', doc.id)
        .where('mes_global', '==', mesGlobal)
        .limit(1).get();
      if (!jaPublicou.empty) continue;

      const nomeJogador = await _nomeJogador(db, p.jogador_uid);
      const tpl = _sortear(MANCHETES_FAMA_PETICAO);
      const manchete = _manchete(tpl, {
        titulo: p.titulo || 'petição',
        nome:   nomeJogador,
        tipo:   p.document_type || 'petição',
      });

      await db.collection('noticias_imprensa').add({
        veiculo:     'the_brief',
        tipo:        'fama_peticao',
        peticao_id:  doc.id,
        manchete,
        subtitulo:   `"${p.titulo}" acumulou fama ${p.fama}/100 e consolida a reputação doutrinária de ${nomeJogador}.`,
        uid_citado:  p.jogador_uid,
        nome_citado: nomeJogador,
        mes_global:  mesGlobal,
        publicado_em: new Date().toISOString(),
        lida_por:    [],
      });

      if (p.jogador_uid) {
        await db.collection('jogadores').doc(p.jogador_uid).collection('inbox').add({
          de:        'imprensa',
          assunto:   `📰 The Brief: "${manchete}"`,
          corpo:     `Sua petição "${p.titulo}" ganhou destaque no The Brief por atingir fama ${p.fama}/100.`,
          tipo:      'sistema',
          tipo_noticia: 'positivo',
          lida:      false,
          criado_em: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    logger.warn('[IMPRENSA] Erro ao processar fama de petições:', e.message);
  }

  // ── Jogadores com reputação ≥ 80 → The Daily Docket ──
  try {
    const jogSnap = await db.collection('jogadores')
      .where('reputacao', '>=', 80)
      .limit(2)
      .get();

    for (const doc of jogSnap.docs) {
      const j = doc.data();
      const jaPublicou = await db.collection('noticias_imprensa')
        .where('tipo', '==', 'rep_alta')
        .where('uid_citado', '==', doc.id)
        .where('mes_global', '==', mesGlobal)
        .limit(1).get();
      if (!jaPublicou.empty) continue;

      const tpl = _sortear(MANCHETES_REP_JOGADOR);
      const manchete = _manchete(tpl, { nome: j.nome_personagem || j.nome || '—' });

      await db.collection('noticias_imprensa').add({
        veiculo:     'the_daily_docket',
        tipo:        'rep_alta',
        manchete,
        subtitulo:   `Com ${j.reputacao} pontos de reputação, ${j.nome_personagem || 'o advogado'} é referência no servidor.`,
        uid_citado:  doc.id,
        nome_citado: j.nome_personagem || j.nome || '—',
        mes_global:  mesGlobal,
        publicado_em: new Date().toISOString(),
        lida_por:    [],
      });
    }
  } catch (e) {
    logger.warn('[IMPRENSA] Erro ao processar reputação alta:', e.message);
  }
}

async function _nomeJogador(db, uid) {
  if (!uid) return 'Advogado';
  try {
    const snap = await db.collection('jogadores').doc(uid).get();
    return snap.exists ? (snap.data().nome_personagem || snap.data().nome || 'Advogado') : 'Advogado';
  } catch { return 'Advogado'; }
}

module.exports = {
  obterNoticiasImprensa: exports.obterNoticiasImprensa,
  publicarNoticiaSentenca,
  processarImprensaMensal,
};
