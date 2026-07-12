'use strict';

/**
 * FINANCEIRO AVANÇADO — Advocatus Online (GDD Seção 31-33)
 * Antecipação de honorários, linha de crédito, sócio investidor, investimentos.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { comIdempotencia } = require('./shared/nonce');

// ════════════════════════════════════════════════════════
// CONSTANTES ESTÁTICAS (espelhadas no frontend)
// ════════════════════════════════════════════════════════
const _INVESTIDORES_POOL = [
  'João Paulo Capital Partners', 'Fundo Veritas Advocatus', 'BH Equity Legal',
  'Capital Legal RJ', 'Fundo Âncora Jurídico', 'Partners Prime Legal',
  'Rio Capital Management', 'Ventures Advocatus SP', 'Nova Era Investments',
  'Torres & Filhos Capital',
];

const _FIRMAS_NPC = [
  { id: 'alves_ferreira',      nome: 'Alves & Ferreira',    setor: 'civil',       min_inv: 30000, pct_base: 0.008, volatilidade: 0.15 },
  { id: 'costa_tributario',    nome: 'Costa Tributário',    setor: 'tributario',  min_inv: 50000, pct_base: 0.012, volatilidade: 0.20 },
  { id: 'pereira_criminal',    nome: 'Pereira & Criminal',  setor: 'criminal',    min_inv: 40000, pct_base: 0.010, volatilidade: 0.30 },
  { id: 'melo_digital',        nome: 'Melo Digital Law',    setor: 'tech',        min_inv: 80000, pct_base: 0.015, volatilidade: 0.35 },
  { id: 'ribeiro_trabalhista', nome: 'Ribeiro Trabalhista', setor: 'trabalhista', min_inv: 20000, pct_base: 0.007, volatilidade: 0.10 },
];

// ════════════════════════════════════════════════════════
// ANTECIPAÇÃO DE HONORÁRIOS (GDD Seção 31)
// Até 60% do total de hon_pendente nos processos ativos.
// Desconto: 25% se rep < 40, 20% se rep 40-60, 15% se rep >= 60.
// ════════════════════════════════════════════════════════
exports.anteciparHonorarios = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { nonce } = request.data || {};
  const db  = getFirestore();

  return comIdempotencia(db, { uid, nonce, acao: 'anteciparHonorarios' }, async () => {
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
    msg: `R$ ${valorLiquido.toLocaleString('pt-BR')} recebidos pela venda de precatórios (deságio ${descPctDisplay}% sobre R$ ${maxAntecipavel.toLocaleString('pt-BR')}).`,
  };
  });
});

// ════════════════════════════════════════════════════════
// CONTRATAR LINHA DE CRÉDITO (GDD Seção 32)
// Requisito: reputação ≥ 40. Juros: 2,5%/mês sobre saldo.
// Teto: reputacao * 500 (ex: rep 40 → R$20.000)
// ════════════════════════════════════════════════════════
exports.contratarLinhaCredito = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { valor, nonce } = request.data || {};
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new HttpsError('invalid-argument', 'Valor inválido.');
  }

  const db = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'contratarLinhaCredito' }, async () => {
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
});

// ════════════════════════════════════════════════════════
// PAGAR LINHA DE CRÉDITO
// ════════════════════════════════════════════════════════
exports.pagarLinhaCredito = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { valor, nonce } = request.data || {};
  // valor é opcional (omitido = quita o saldo inteiro), mas se enviado
  // precisa ser positivo — um valor negativo aqui creditava dinheiro E
  // aumentava o saldo devedor ao mesmo tempo (Math.min(negativo, saldo)
  // sempre escolhe o negativo, e saldo - negativo = saldo + |negativo|).
  if (valor !== undefined && valor !== null &&
      (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0)) {
    throw new HttpsError('invalid-argument', 'Valor inválido.');
  }

  const db = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'pagarLinhaCredito' }, async () => {
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
});

// ════════════════════════════════════════════════════════
// SÓCIO INVESTIDOR (GDD Seção 33)
// Tier 3+, investidor aporta capital em troca de 20% dos honorários por 36 meses.
// ════════════════════════════════════════════════════════
exports.contratarSocioInvestidor = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { nonce } = request.data || {};
  const db  = getFirestore();

  return comIdempotencia(db, { uid, nonce, acao: 'contratarSocioInvestidor' }, async () => {
  const jogRef  = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogSnap.data();

  if (!j.escritorio_proprio_id) throw new HttpsError('failed-precondition', 'Necessário ter escritório próprio.');

  const escRef  = db.collection('escritorios').doc(j.escritorio_proprio_id);
  const escSnap = await escRef.get();
  if (!escSnap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
  const esc  = escSnap.data();
  const tier = esc.tier || 1;

  if (tier < 3) throw new HttpsError('failed-precondition', `Tier mínimo 3 para sócio investidor (atual: Tier ${tier}).`);
  if (esc.investidor?.ativo) throw new HttpsError('already-exists', 'Já existe um sócio investidor ativo.');

  const ranges = { 3: [80000, 200000], 4: [200000, 600000], 5: [600000, 2000000] };
  const [rMin, rMax] = ranges[Math.min(tier, 5)] || ranges[5];
  const capital = Math.floor(rMin + Math.random() * (rMax - rMin));
  const nome    = _INVESTIDORES_POOL[Math.floor(Math.random() * _INVESTIDORES_POOL.length)];
  const mesAtual = `${j.ano_pessoal || 1}-${String(j.mes_pessoal || 1).padStart(2, '0')}`;

  await escRef.update({
    caixa: (esc.caixa || 0) + capital,
    investidor: {
      ativo: true,
      nome,
      capital_aportado: capital,
      pct: 0.20,
      meses_restantes: 36,
      meses_total: 36,
      total_pago: 0,
      contratado_em: mesAtual,
    },
  });

  return {
    ok: true, nome, capital,
    msg: `${nome} aportou R$${capital.toLocaleString('pt-BR')} em troca de 20% dos honorários por 36 meses.`,
  };
  });
});

// ════════════════════════════════════════════════════════
// APLICAR INVESTIMENTO (GDD Seção 32)
// tipos: renda_fixa | fundo | imovel_renda | firma_npc
// ════════════════════════════════════════════════════════
exports.aplicarInvestimento = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { tipo, valor, subtipo, firma_id, nonce } = request.data || {};
  if (!tipo || typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new HttpsError('invalid-argument', 'tipo e valor são obrigatórios.');
  }

  const db      = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'aplicarInvestimento' }, async () => {
  const jogRef  = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jogSnap.data();

  if ((j.dinheiro || 0) < valor) throw new HttpsError('failed-precondition', 'Saldo insuficiente.');

  const inv  = j.investimentos || {};
  const now  = `${j.ano_pessoal || 1}-${String(j.mes_pessoal || 1).padStart(2, '0')}`;
  const id   = `${tipo}_${Date.now()}`;
  const updates = { dinheiro: (j.dinheiro || 0) - valor };

  if (tipo === 'renda_fixa') {
    if (valor < 1000) throw new HttpsError('invalid-argument', 'Mínimo R$1.000 para renda fixa.');
    updates['investimentos.renda_fixa'] = [
      ...(inv.renda_fixa || []),
      { id, valor_aplicado: valor, taxa_mensal: 0.008, aplicado_em: now },
    ];

  } else if (tipo === 'fundo') {
    const taxas = {
      conservador: { min: 0.004, max: 0.009 },
      moderado:    { min: 0.002, max: 0.014 },
      arrojado:    { min: -0.005, max: 0.020 },
    };
    if (!taxas[subtipo]) throw new HttpsError('invalid-argument', 'subtipo deve ser conservador, moderado ou arrojado.');
    if (valor < 2000) throw new HttpsError('invalid-argument', 'Mínimo R$2.000 para fundos.');
    updates['investimentos.fundos'] = [
      ...(inv.fundos || []),
      { id, subtipo, valor_aplicado: valor, ...taxas[subtipo], aplicado_em: now },
    ];

  } else if (tipo === 'imovel_renda') {
    if (inv.imovel_renda) throw new HttpsError('already-exists', 'Já possui imóvel para renda.');
    if (valor < 50000) throw new HttpsError('invalid-argument', 'Mínimo R$50.000 para imóvel.');
    const aluguel = Math.floor(valor * (0.004 + Math.random() * 0.002));
    updates['investimentos.imovel_renda'] = { id, valor_aplicado: valor, aluguel_mensal: aluguel, aplicado_em: now };

  } else if (tipo === 'firma_npc') {
    const firma = _FIRMAS_NPC.find(f => f.id === firma_id);
    if (!firma) throw new HttpsError('not-found', 'Firma não encontrada.');
    if (valor < firma.min_inv) throw new HttpsError('invalid-argument', `Mínimo R$${firma.min_inv.toLocaleString('pt-BR')} para ${firma.nome}.`);
    updates['investimentos.firma_npc'] = [
      ...(inv.firma_npc || []),
      { id, firma_id, nome: firma.nome, setor: firma.setor, valor_investido: valor, pct_base: firma.pct_base, volatilidade: firma.volatilidade, aplicado_em: now },
    ];

  } else {
    throw new HttpsError('invalid-argument', 'Tipo de investimento inválido.');
  }

  await jogRef.update(updates);
  return { ok: true, msg: `R$${valor.toLocaleString('pt-BR')} aplicados em ${tipo.replace('_', ' ')}.` };
  });
});

// ════════════════════════════════════════════════════════
// RESGATAR INVESTIMENTO
// ════════════════════════════════════════════════════════
exports.resgatarInvestimento = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { tipo, id, nonce } = request.data || {};
  if (!tipo) throw new HttpsError('invalid-argument', 'tipo obrigatório.');

  const db      = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'resgatarInvestimento' }, async () => {
  const jogRef  = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j   = jogSnap.data();
  const inv = j.investimentos || {};

  let valorDevolvido = 0;
  const updates = {};

  if (tipo === 'renda_fixa') {
    const lista = inv.renda_fixa || [];
    const item  = lista.find(i => i.id === id);
    if (!item) throw new HttpsError('not-found', 'Investimento não encontrado.');
    valorDevolvido = item.valor_aplicado;
    updates['investimentos.renda_fixa'] = lista.filter(i => i.id !== id);

  } else if (tipo === 'fundo') {
    const lista = inv.fundos || [];
    const item  = lista.find(i => i.id === id);
    if (!item) throw new HttpsError('not-found', 'Fundo não encontrado.');
    valorDevolvido = item.valor_aplicado;
    updates['investimentos.fundos'] = lista.filter(i => i.id !== id);

  } else if (tipo === 'imovel_renda') {
    if (!inv.imovel_renda) throw new HttpsError('not-found', 'Sem imóvel para renda.');
    valorDevolvido = inv.imovel_renda.valor_aplicado;
    updates['investimentos.imovel_renda'] = null;

  } else if (tipo === 'firma_npc') {
    const lista = inv.firma_npc || [];
    const item  = lista.find(i => i.id === id);
    if (!item) throw new HttpsError('not-found', 'Participação não encontrada.');
    valorDevolvido = item.valor_investido;
    updates['investimentos.firma_npc'] = lista.filter(i => i.id !== id);

  } else {
    throw new HttpsError('invalid-argument', 'Tipo inválido.');
  }

  updates.dinheiro = (j.dinheiro || 0) + valorDevolvido;
  await jogRef.update(updates);
  return { ok: true, valorDevolvido, msg: `R$${valorDevolvido.toLocaleString('pt-BR')} resgatados com sucesso.` };
  });
});
