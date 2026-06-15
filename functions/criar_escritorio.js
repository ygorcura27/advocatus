'use strict';

/**
 * FUNÇÕES AUXILIARES — Advocatus Online
 * criar_escritorio | convidar_socio | responder_convite | calcular_ranking
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

// ════════════════════════════════════════════════════════
// CRIAR ESCRITÓRIO
// ════════════════════════════════════════════════════════
exports.criarEscritorio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const { nome, bairro_sede, zona_sede, especialidade_principal } = request.data;

  if (!nome || nome.trim().length < 3 || nome.trim().length > 60) {
    throw new HttpsError('invalid-argument', 'Nome deve ter entre 3 e 60 caracteres.');
  }

  const db = getFirestore();

  // Verificar cargo mínimo (Júnior ou superior)
  const jogadorSnap = await db.collection('jogadores').doc(uid).get();
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = jogadorSnap.data();
  const CARGO_MINIMO = ['jnr','pln','snr','asc','soc','snm',
                         'jsub','jtit','dsb','mstj',
                         'padj','prom','pjus','pgj',
                         'dadj','def','dch','dge'];

  if (!j.oab || !CARGO_MINIMO.includes(j.cargo_id)) {
    throw new HttpsError('failed-precondition', 'Você precisa ter OAB aprovada e ser Advogado Júnior ou superior para criar um escritório.');
  }

  // Verificar se já tem escritório
  if (j.escritorio_proprio_id) {
    throw new HttpsError('already-exists', 'Você já possui um escritório.');
  }

  const server    = await db.collection('config').doc('server').get();
  const mesAtual  = server.data()?.mes_global || 1;
  const anoAtual  = server.data()?.ano_jogo   || 1;

  // Criar escritório
  const escritorioData = {
    nome:                  nome.trim(),
    fundador_uid:          uid,
    socios_uids:           [uid],
    socios:                [{ uid, participacao_pct: 100, cargo: j.cargo_id }],
    nivel:                 1,
    prestigio:             0,
    caixa:                 0,
    especialidade_principal: especialidade_principal || j.especialidade || 'civil',
    bairro_sede:           bairro_sede || 'Centro',
    zona_sede:             zona_sede   || 'centro',
    equipe:                [],
    estagiarios:           [],
    clientes:              [],
    cliente_count:         0,
    imoveis:               [],
    total_casos:           0,
    casos_ganhos:          0,
    casos_perdidos:        0,
    faturamento_total:     0,
    founded_mes:           mesAtual,
    founded_ano:           anoAtual,
    criado_em:             new Date().toISOString(),
  };

  const escritorioRef = await db.collection('escritorios').add(escritorioData);

  // Atualizar jogador
  await db.collection('jogadores').doc(uid).update({
    escritorio_proprio_id:   escritorioRef.id,
    escritorio_id:           escritorioRef.id,
    escritorio_empregado_id: escritorioRef.id,
    escritorio_nome:         nome.trim(),
  });

  logger.info(`[ESCRITÓRIO] Criado: ${nome} (${escritorioRef.id}) por ${uid}`);

  return {
    ok:           true,
    escritorio_id: escritorioRef.id,
    msg:          `Escritório "${nome}" criado com sucesso!`,
  };
});

// ════════════════════════════════════════════════════════
// CONVIDAR SÓCIO
// ════════════════════════════════════════════════════════
exports.convidarSocio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const { escritorio_id, para_uid, participacao_pct, cargo_oferta, mensagem_pessoal } = request.data;

  if (!escritorio_id || !para_uid) {
    throw new HttpsError('invalid-argument', 'escritorio_id e para_uid são obrigatórios.');
  }
  if (uid === para_uid) {
    throw new HttpsError('invalid-argument', 'Você não pode convidar a si mesmo.');
  }

  const db = getFirestore();

  // Verificar que quem convida é sócio
  const escSnap = await db.collection('escritorios').doc(escritorio_id).get();
  if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
  const esc = escSnap.data();

  if (!esc.socios_uids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'Apenas sócios podem convidar novos membros.');
  }

  // Verificar que o convidado existe e tem OAB
  const convidadoSnap = await db.collection('jogadores').doc(para_uid).get();
  if (!convidadoSnap.exists) throw new HttpsError('not-found', 'Jogador convidado não encontrado.');
  const convidado = convidadoSnap.data();
  if (!convidado.oab) {
    throw new HttpsError('failed-precondition', 'O convidado precisa ter OAB aprovada.');
  }

  // Verificar se já existe convite pendente
  const convPend = await db.collection('convites')
    .where('para_uid', '==', para_uid)
    .where('escritorio_id', '==', escritorio_id)
    .where('status', '==', 'pendente')
    .limit(1).get();

  if (!convPend.empty) {
    throw new HttpsError('already-exists', 'Já existe um convite pendente para este jogador.');
  }

  const server   = await db.collection('config').doc('server').get();
  const mesAtual = server.data()?.mes_global || 1;

  // Criar convite
  const conviteRef = await db.collection('convites').add({
    de_uid:          uid,
    de_nome:         (await db.collection('jogadores').doc(uid).get()).data()?.nome_personagem || uid,
    para_uid,
    para_nome:       convidado.nome_personagem || para_uid,
    escritorio_id,
    escritorio_nome: esc.nome,
    participacao_pct: participacao_pct || 0,
    cargo_oferta:    cargo_oferta || 'advogado',
    mensagem_pessoal: mensagem_pessoal || '',
    status:          'pendente',
    criado_mes:      mesAtual,
    criado_em:       new Date().toISOString(),
  });

  // Enviar mensagem para o inbox do convidado
  await db.collection('jogadores').doc(para_uid)
    .collection('inbox').add({
      de:       uid,
      para_uid,
      assunto:  `📬 Convite para ${esc.nome}`,
      corpo:    `${esc.nome} te convidou para fazer parte do escritório como ${cargo_oferta || 'advogado'}. ${mensagem_pessoal || ''}\n\nAcesse Convites para aceitar ou recusar.`,
      tipo:     'convite',
      tipo_noticia: 'positivo',
      convite_id: conviteRef.id,
      lida:     false,
      criado_em: new Date().toISOString(),
    });

  return {
    ok:        true,
    convite_id: conviteRef.id,
    msg:       `Convite enviado para ${convidado.nome_personagem}.`,
  };
});

// ════════════════════════════════════════════════════════
// RESPONDER CONVITE
// ════════════════════════════════════════════════════════
exports.responderConvite = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const { convite_id, aceitar } = request.data;

  if (!convite_id) throw new HttpsError('invalid-argument', 'convite_id obrigatório.');

  const db         = getFirestore();
  const conviteRef = db.collection('convites').doc(convite_id);
  const conviteSnap = await conviteRef.get();

  if (!conviteSnap.exists) throw new HttpsError('not-found', 'Convite não encontrado.');
  const conv = conviteSnap.data();

  if (conv.para_uid !== uid) {
    throw new HttpsError('permission-denied', 'Este convite não é para você.');
  }
  if (conv.status !== 'pendente') {
    throw new HttpsError('failed-precondition', 'Este convite já foi respondido.');
  }

  // Atualizar status do convite
  await conviteRef.update({
    status:        aceitar ? 'aceito' : 'recusado',
    respondido_em: new Date().toISOString(),
  });

  if (aceitar) {
    // Adicionar jogador ao escritório
    const escRef  = db.collection('escritorios').doc(conv.escritorio_id);
    const escSnap = await escRef.get();
    if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
    const esc = escSnap.data();

    const novosSocios    = [...(esc.socios || []),
      { uid, participacao_pct: conv.participacao_pct || 0, cargo: conv.cargo_oferta }];
    const novosSociosUids = [...(esc.socios_uids || []), uid];

    await escRef.update({
      socios:      novosSocios,
      socios_uids: novosSociosUids,
    });

    // Atualizar jogador
    await db.collection('jogadores').doc(uid).update({
      escritorio_empregado_id: conv.escritorio_id,
      escritorio_id:           conv.escritorio_id,
      escritorio_nome:         esc.nome,
      sal_mult:                1.0, // escritório pode ajustar depois
    });

    // Notificar quem convidou
    await db.collection('jogadores').doc(conv.de_uid)
      .collection('inbox').add({
        de:       uid,
        para_uid: conv.de_uid,
        assunto:  `✅ Convite aceito — ${esc.nome}`,
        corpo:    `${conv.para_nome} aceitou o convite e agora faz parte de ${esc.nome}!`,
        tipo:     'sistema',
        tipo_noticia: 'positivo',
        lida:     false,
        criado_em: new Date().toISOString(),
      });

    return { ok: true, aceito: true, msg: `Bem-vindo a ${esc.nome}!` };
  }

  // Recusou
  await db.collection('jogadores').doc(conv.de_uid)
    .collection('inbox').add({
      de:       uid,
      para_uid: conv.de_uid,
      assunto:  `❌ Convite recusado — ${conv.escritorio_nome}`,
      corpo:    `${conv.para_nome} recusou o convite para ${conv.escritorio_nome}.`,
      tipo:     'sistema',
      tipo_noticia: 'neutro',
      lida:     false,
      criado_em: new Date().toISOString(),
    });

  return { ok: true, aceito: false, msg: 'Convite recusado.' };
});

// ════════════════════════════════════════════════════════
// CALCULAR RANKING (agendado: 1x por dia, separado do tick)
// ════════════════════════════════════════════════════════
exports.calcularRanking = onSchedule({
  schedule:      'every 24 hours',
  timeZone:      'America/Sao_Paulo',
  memory:        '512MiB',
  timeoutSeconds: 120,
}, async () => {
  const db = getFirestore();
  logger.info('[RANKING] Atualizando rankings globais');

  const categorias = [
    { id: 'reputacao',  campo: 'reputacao',          label: 'Reputação' },
    { id: 'patrimonio', campo: 'dinheiro',            label: 'Maior Patrimônio' },
    { id: 'networking', campo: 'networking',          label: 'Networking' },
    { id: 'academico',  campo: 'prestigio_academico', label: 'Prestígio Acadêmico' },
  ];

  for (const cat of categorias) {
    try {
      const snap = await db.collection('jogadores')
        .orderBy(cat.campo, 'desc')
        .limit(100)
        .get();

      const top = snap.docs.map((doc, i) => {
        const d = doc.data();
        return {
          pos:           i + 1,
          uid:           d.uid,
          nome:          d.nome_personagem || d.nome || '—',
          valor:         d[cat.campo] || 0,
          cargo_id:      d.cargo_id    || 'est',
          especialidade: d.especialidade || '—',
          escritorio_nome: d.escritorio_nome || null,
          geracao:       d.geracao || 1,
        };
      });

      const server   = await db.collection('config').doc('server').get();
      const mesGlobal = server.data()?.mes_global || 0;

      await db.collection('rankings').doc(cat.id).set({
        tipo:           cat.id,
        label:          cat.label,
        top100:         top,
        atualizado_mes: mesGlobal,
        atualizado_em:  new Date().toISOString(),
      });

      logger.info(`[RANKING] ${cat.label}: ${top.length} posições`);
    } catch (err) {
      logger.error(`[RANKING] Erro em ${cat.id}:`, err);
    }
  }

  // Ranking de escritórios
  try {
    const snap = await db.collection('escritorios')
      .orderBy('prestigio', 'desc')
      .limit(50)
      .get();

    const top = snap.docs.map((doc, i) => {
      const d = doc.data();
      return {
        pos:             i + 1,
        id:              doc.id,
        nome:            d.nome          || '—',
        nivel:           d.nivel         || 1,
        prestigio:       d.prestigio     || 0,
        num_socios:      (d.socios_uids  || []).length,
        total_casos:     d.total_casos   || 0,
        faturamento:     d.faturamento_total || 0,
        bairro_sede:     d.bairro_sede   || '—',
      };
    });

    await db.collection('rankings').doc('escritorios').set({
      tipo:          'escritorios',
      label:         'Maiores Escritórios',
      top50:         top,
      atualizado_em: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[RANKING] Erro em escritórios:', err);
  }

  logger.info('[RANKING] Rankings atualizados com sucesso');
});
