'use strict';

/**
 * FINANCEIRO AVANÇADO — Advocatus Online (GDD Seção 31-33)
 * Antecipação de honorários e linha de crédito.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ════════════════════════════════════════════════════════
// ANTECIPAÇÃO DE HONORÁRIOS (GDD Seção 31)
// Até 60% do total de hon_pendente nos processos ativos.
// Desconto: 25% se rep < 40, 20% se rep 40-60, 15% se rep >= 60.
// ════════════════════════════════════════════════════════
exports.anteciparHonorarios = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const db  = getFirestore();

  const jogadorRef  = db.collection('jogadores').doc(uid);
  const jogadorSnap = await jogadorRef.get();
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogadorSnap.data();

  const rep = j.reputacao || 0;
  if (rep < 20) throw new HttpsError('failed-precondition', 'Reputação mínima de 20 para antecipação.');

  // Busca processos com hon_pendente > 0 do jogador ou do escritório dele
  const escId = j.escritorio_proprio_id;
  const procSnap = escId
    ? await db.collection('processos')
        .where('pool_escritorio_id', '==', escId)
        .where('status', '==', 'aguardando_decisao_sentenca')
        .get()
    : await db.collection('processos')
        .where('advogado_uid', '==', uid)
        .where('status', '==', 'aguardando_decisao_sentenca')
        .get();

  const processosComPendente = procSnap.docs.filter(d => (d.data().hon_pendente || 0) > 0);
  if (processosComPendente.length === 0) {
    throw new HttpsError('failed-precondition', 'Nenhum honorário pendente para antecipar.');
  }

  const totalPendente = processosComPendente.reduce((s, d) => s + (d.data().hon_pendente || 0), 0);
  const maxAntecipavel = Math.floor(totalPendente * 0.60);
  if (maxAntecipavel < 1000) {
    throw new HttpsError('failed-precondition', `Honorários pendentes insuficientes (mínimo R$1.666 para antecipar R$1.000).`);
  }

  const descPct = rep >= 60 ? 0.15 : rep >= 40 ? 0.20 : 0.25;
  const valorLiquido = Math.floor(maxAntecipavel * (1 - descPct));

  // Marca cada processo antecipado proporcionalmente
  const batch = db.batch();
  for (const procDoc of processosComPendente) {
    const p = procDoc.data();
    const fracHon = (p.hon_pendente || 0) / totalPendente;
    const antecipado = Math.floor(maxAntecipavel * fracHon);
    if (antecipado <= 0) continue;
    batch.update(procDoc.ref, {
      hon_antecipado: (p.hon_antecipado || 0) + antecipado,
    });
  }

  // Crédita o valor líquido ao jogador/escritório
  if (escId) {
    const escRef  = db.collection('escritorios').doc(escId);
    const escSnap = await escRef.get();
    if (escSnap.exists) batch.update(escRef, { caixa: FieldValue.increment(valorLiquido) });
  } else {
    batch.update(jogadorRef, { dinheiro: FieldValue.increment(valorLiquido) });
  }

  // Registra operação no jogador para rastreamento
  batch.update(jogadorRef, {
    ultima_antecipacao: new Date().toISOString(),
    antecipacoes_realizadas: FieldValue.increment(1),
  });

  await batch.commit();

  const descPctDisplay = Math.round(descPct * 100);
  return {
    ok: true,
    valorBruto:   maxAntecipavel,
    desconto:     descPctDisplay,
    valorLiquido,
    msg: `R$ ${valorLiquido.toLocaleString('pt-BR')} antecipados (desconto ${descPctDisplay}% sobre R$ ${maxAntecipavel.toLocaleString('pt-BR')}).`,
  };
});

// ════════════════════════════════════════════════════════
// CONTRATAR LINHA DE CRÉDITO (GDD Seção 32)
// Requisito: reputação ≥ 40. Juros: 2,5%/mês sobre saldo.
// Teto: reputacao * 500 (ex: rep 40 → R$20.000)
// ════════════════════════════════════════════════════════
exports.contratarLinhaCredito = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { valor } = request.data || {};
  if (!valor || valor <= 0) throw new HttpsError('invalid-argument', 'Valor inválido.');

  const db = getFirestore();
  const jogadorRef  = db.collection('jogadores').doc(uid);
  const jogadorSnap = await jogadorRef.get();
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogadorSnap.data();

  const rep = j.reputacao || 0;
  if (rep < 40) throw new HttpsError('failed-precondition', 'Reputação mínima 40 para linha de crédito.');

  const teto = rep * 500;
  const lc   = j.linha_credito || { saldo: 0, teto: 0 };
  const usadoAtual  = lc.saldo || 0;
  const dispAtual   = Math.max(0, teto - usadoAtual);
  const valorEfetivo = Math.min(valor, dispAtual);
  if (valorEfetivo < 500) throw new HttpsError('failed-precondition', 'Saldo disponível na linha insuficiente.');

  await jogadorRef.update({
    linha_credito: {
      saldo:   usadoAtual + valorEfetivo,
      teto,
      juros_pct: 0.025,
      contratada_em: lc.contratada_em || new Date().toISOString(),
    },
    dinheiro: (j.dinheiro || 0) + valorEfetivo,
  });

  return { ok: true, valor: valorEfetivo, saldoTotal: usadoAtual + valorEfetivo, teto };
});

// ════════════════════════════════════════════════════════
// PAGAR LINHA DE CRÉDITO
// ════════════════════════════════════════════════════════
exports.pagarLinhaCredito = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { valor } = request.data || {};

  const db = getFirestore();
  const jogadorRef  = db.collection('jogadores').doc(uid);
  const jogadorSnap = await jogadorRef.get();
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogadorSnap.data();

  const lc = j.linha_credito;
  if (!lc || !lc.saldo) throw new HttpsError('failed-precondition', 'Sem linha de crédito ativa.');

  const pagamento = Math.min(valor || lc.saldo, lc.saldo);
  if ((j.dinheiro || 0) < pagamento) throw new HttpsError('failed-precondition', 'Saldo insuficiente.');

  const novoSaldo = lc.saldo - pagamento;
  await jogadorRef.update({
    dinheiro: (j.dinheiro || 0) - pagamento,
    linha_credito: novoSaldo <= 0
      ? null
      : { ...lc, saldo: novoSaldo },
  });

  return { ok: true, pago: pagamento, saldoRestante: novoSaldo };
});
