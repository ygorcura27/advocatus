'use strict';

/**
 * AUDIÊNCIA COMO DUELO — callables (docs/DUELO_AUDIENCIA.md, fase 1).
 * Regras em duelo_motor.js; aqui só carrega, valida, salva e encerra.
 *
 * O estado COMPLETO fica em processos/{id}/privado/duelo (as regras não
 * deixam nenhum cliente ler — processos/{id} é legível por qualquer jogador
 * logado). O cliente recebe estadoPublico() em investigacao.julgamento.duelo.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const motor = require('./duelo_motor');
const { autorizadoParaProcessar, _finalizarJulgamentoCore } = require('./investigacao');
const { _aceitarDecisaoSentenca } = require('./processar_sentenca');

const CARGO_IDX = { est: 0, ass: 1, jnr: 2, pln: 3, snr: 4, asc: 5, soc: 6, snm: 7 };

function _refs(db, processoId, uid) {
  const processoRef = db.collection('processos').doc(processoId);
  return {
    processoRef,
    privadoRef: processoRef.collection('privado').doc('duelo'),
    jogadorRef: db.collection('jogadores').doc(uid),
  };
}

// ─── Iniciar ────────────────────────────────────────────────────────────────
exports.iniciarDuelo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id } = request.data || {};
  if (typeof processo_id !== 'string') throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const { processoRef, privadoRef, jogadorRef } = _refs(db, processo_id, uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  const p = pSnap.data();
  const j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  return db.runTransaction(async (tx) => {
    const atual = (await tx.get(processoRef)).data();
    const julg = atual.investigacao?.julgamento;
    if (!julg || atual.investigacao.fase !== 'julgamento') throw new HttpsError('failed-precondition', 'Monte o caso antes da audiência.');
    if (julg.modo === 'duelo') return { duelo: julg.duelo }; // idempotente
    if (julg.veredito || (julg.rodada_atual || 0) > 0) throw new HttpsError('failed-precondition', 'Este julgamento já começou no formato antigo.');

    const estado = motor.criarDuelo(atual, j, Math.random, processo_id);
    const publico = motor.estadoPublico(estado);
    tx.set(privadoRef, estado);
    tx.update(processoRef, {
      'investigacao.julgamento.modo': 'duelo',
      'investigacao.julgamento.duelo': publico,
    });
    return { duelo: publico };
  });
});

// ─── Jogar uma rodada ───────────────────────────────────────────────────────
const ACOES = ['contestar', 'objecao', 'conceder', 'favor', 'argumentar', 'traco_memoria', 'propor_acordo', 'aceitar_acordo', 'recusar_acordo'];

exports.jogarRodadaDuelo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, acao, carta_id, blefe, favor_id } = request.data || {};
  if (typeof processo_id !== 'string' || !ACOES.includes(acao)) throw new HttpsError('invalid-argument', 'Ação inválida.');

  const db = getFirestore();
  const { processoRef, privadoRef, jogadorRef } = _refs(db, processo_id, uid);
  const jSnap0 = await jogadorRef.get();
  const p0 = (await processoRef.get()).data();
  if (!p0 || !jSnap0.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!(await autorizadoParaProcessar(db, p0, uid, jSnap0.data()))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const resultado = await db.runTransaction(async (tx) => {
    const [pSnap, privSnap] = await Promise.all([tx.get(processoRef), tx.get(privadoRef)]);
    const p = pSnap.data();
    if (p.investigacao?.julgamento?.modo !== 'duelo' || !privSnap.exists) throw new HttpsError('failed-precondition', 'Não há audiência em andamento.');
    const estado = privSnap.data();

    let favorRef = null;
    if (acao === 'favor') {
      const reservados = p.investigacao.favores_reservados || [];
      if (!favor_id || !reservados.includes(favor_id)) throw new HttpsError('invalid-argument', 'Favor inválido ou não reservado para este caso.');
      favorRef = db.collection('favores').doc(favor_id);
    }

    try {
      motor.aplicarAcao(estado, { tipo: acao, carta_id, blefe: !!blefe, favor: favorRef ? favor_id : null }, Math.random);
    } catch (e) {
      throw new HttpsError('failed-precondition', e.message);
    }

    const publico = motor.estadoPublico(estado);
    const upd = { 'investigacao.julgamento.duelo': publico };
    if (favorRef) {
      upd['investigacao.favores_reservados'] = FieldValue.arrayRemove(favor_id);
      tx.update(favorRef, { status: 'consumido' });
    }
    if (estado.fase === 'fim') {
      upd['investigacao.julgamento.pecas_restantes'] = [];
      upd['investigacao.julgamento.duelo_final'] = { ...estado.final, expostas: estado.expostas, juiz: estado.juiz.nome };
    }
    tx.set(privadoRef, estado);
    tx.update(processoRef, upd);
    return { publico, fim: estado.fase === 'fim', juiz: estado.juiz.nome };
  });

  if (!resultado.fim) return { duelo: resultado.publico };

  // Encerrou: veredito, honorários, XP e reputação pelo fluxo de sempre.
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  const r = await _finalizarJulgamentoCore(db, uid, processoRef, jogadorRef, pSnap.data(), jSnap.data());
  // Acordo não tem recurso: já fecha o caso (honorário do acordo) em vez de
  // parar em "aguardando decisão de recorrer".
  if (resultado.publico.final?.resultado === 'acordo' && !r.jaResolvido) {
    await _aceitarDecisaoSentenca(db, processoRef, jogadorRef, r.pAtualizado, r.jAtualizado, true);
  }
  // FieldPath: o nome do juiz tem ponto ("Dr."), que viraria subcampo.
  await jogadorRef.update(new FieldPath('juizes_vistos', resultado.juiz), FieldValue.increment(1));
  return { duelo: resultado.publico, veredito: r.veredito, hon_pendente: r.hon_pendente, repDelta: r.repDelta, xpGanho: r.xpGanho };
});

// ─── Traço de assinatura ────────────────────────────────────────────────────
exports.escolherTracoAssinatura = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const { traco_id } = request.data || {};
  if (!motor.TRACOS[traco_id]) throw new HttpsError('invalid-argument', 'Traço inválido.');

  const db = getFirestore();
  const jRef = db.collection('jogadores').doc(request.auth.uid);
  return db.runTransaction(async (tx) => {
    const j = (await tx.get(jRef)).data();
    if (!j) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const atuais = j.tracos_assinatura || [];
    const idx = CARGO_IDX[j.cargo_id] ?? 0;
    const permitidos = idx >= CARGO_IDX.snm ? 3 : idx >= CARGO_IDX.soc ? 2 : idx >= CARGO_IDX.pln ? 1 : 0;
    if (atuais.some((t) => t.id === traco_id)) throw new HttpsError('failed-precondition', 'Você já tem esse traço.');
    if (atuais.length >= permitidos) {
      throw new HttpsError('failed-precondition', permitidos === 0
        ? 'Traços de assinatura destravam ao virar Advogado Pleno.'
        : 'Você já escolheu todos os traços disponíveis no seu cargo.');
    }
    tx.update(jRef, { tracos_assinatura: [...atuais, { id: traco_id, escolhido_em: new Date().toISOString() }] });
    return { ok: true, tracos: [...atuais.map((t) => t.id), traco_id] };
  });
});
