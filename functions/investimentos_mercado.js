'use strict';

/**
 * MERCADO DE AÇÕES E CRIPTOMOEDAS — Advocatus Online
 * Compra/venda real, persistida em investimentos.carteira_mercado.{acoes,cripto}.
 * Preço nunca vem do cliente — sempre re-buscado aqui (brapi.dev / CoinGecko,
 * APIs públicas gratuitas, sem chave) pra não dar brecha de manipulação de preço.
 * Universo de tickers é só o que essas APIs cobrem de graça — ver js/financeiro_avancado.js.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { comIdempotencia } = require('./shared/nonce');

const TICKERS_ACOES = ['PETR4', 'VALE3', 'ITUB4'];
const CRIPTOS = [
  { ticker: 'BTC',   coingeckoId: 'bitcoin' },
  { ticker: 'ETH',   coingeckoId: 'ethereum' },
  { ticker: 'BNB',   coingeckoId: 'binancecoin' },
  { ticker: 'SOL',   coingeckoId: 'solana' },
  { ticker: 'XRP',   coingeckoId: 'ripple' },
  { ticker: 'ADA',   coingeckoId: 'cardano' },
  { ticker: 'DOGE',  coingeckoId: 'dogecoin' },
  { ticker: 'DOT',   coingeckoId: 'polkadot' },
  { ticker: 'AVAX',  coingeckoId: 'avalanche-2' },
  { ticker: 'MATIC', coingeckoId: 'polygon-ecosystem-token' },
];

async function _precoAcao(ticker) {
  if (!TICKERS_ACOES.includes(ticker)) return null;
  const r = await fetch(`https://brapi.dev/api/quote/${ticker}`);
  if (!r.ok) return null;
  const d = await r.json();
  const res = (d.results || [])[0];
  return res?.regularMarketPrice ?? null;
}

async function _precoCripto(ticker) {
  const alvo = CRIPTOS.find(c => c.ticker === ticker);
  if (!alvo) return null;
  const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&ids=${alvo.coingeckoId}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d[0]?.current_price ?? null;
}

async function _precoAtual(tipo, ticker) {
  return tipo === 'acao' ? _precoAcao(ticker) : _precoCripto(ticker);
}

// ════════════════════════════════════════════════════════
// COMPRAR ATIVO — tipo: 'acao' | 'cripto'
// ════════════════════════════════════════════════════════
exports.comprarAtivo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { tipo, ticker, qtd, nonce } = request.data || {};
  if (!['acao', 'cripto'].includes(tipo)) throw new HttpsError('invalid-argument', 'tipo deve ser acao ou cripto.');
  if (typeof qtd !== 'number' || !Number.isFinite(qtd) || qtd <= 0) throw new HttpsError('invalid-argument', 'qtd inválida.');

  const db = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'comprarAtivo' }, async () => {
    const preco = await _precoAtual(tipo, ticker);
    if (preco == null) throw new HttpsError('not-found', 'Ativo não encontrado ou API de preço indisponível.');

    const jogRef  = db.collection('jogadores').doc(uid);
    const jogSnap = await jogRef.get();
    if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const j = jogSnap.data();

    const custo = preco * qtd;
    if ((j.dinheiro || 0) < custo) throw new HttpsError('failed-precondition', 'Saldo insuficiente.');

    const campo = `investimentos.carteira_mercado.${tipo === 'acao' ? 'acoes' : 'cripto'}`;
    const inv = j.investimentos?.carteira_mercado?.[tipo === 'acao' ? 'acoes' : 'cripto'] || [];
    const existente = inv.find(h => h.ticker === ticker);
    let novaLista;
    if (existente) {
      const qtdTotal = existente.qtd + qtd;
      const precoMedio = (existente.preco_medio * existente.qtd + custo) / qtdTotal;
      novaLista = inv.map(h => h.ticker === ticker ? { ...h, qtd: qtdTotal, preco_medio: precoMedio } : h);
    } else {
      novaLista = [...inv, { ticker, qtd, preco_medio: preco }];
    }

    await jogRef.update({
      dinheiro: (j.dinheiro || 0) - custo,
      [campo]: novaLista,
    });

    return { ok: true, preco, custo, msg: `${qtd} ${ticker} comprado(s) a R$${preco.toLocaleString('pt-BR')} (total R$${custo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}).` };
  });
});

// ════════════════════════════════════════════════════════
// VENDER ATIVO
// ════════════════════════════════════════════════════════
exports.venderAtivo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { tipo, ticker, qtd, nonce } = request.data || {};
  if (!['acao', 'cripto'].includes(tipo)) throw new HttpsError('invalid-argument', 'tipo deve ser acao ou cripto.');
  if (typeof qtd !== 'number' || !Number.isFinite(qtd) || qtd <= 0) throw new HttpsError('invalid-argument', 'qtd inválida.');

  const db = getFirestore();
  return comIdempotencia(db, { uid, nonce, acao: 'venderAtivo' }, async () => {
    const jogRef  = db.collection('jogadores').doc(uid);
    const jogSnap = await jogRef.get();
    if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const j = jogSnap.data();

    const subcampo = tipo === 'acao' ? 'acoes' : 'cripto';
    const inv = j.investimentos?.carteira_mercado?.[subcampo] || [];
    const holding = inv.find(h => h.ticker === ticker);
    if (!holding || holding.qtd < qtd) throw new HttpsError('failed-precondition', 'Quantidade insuficiente em carteira.');

    const preco = await _precoAtual(tipo, ticker);
    if (preco == null) throw new HttpsError('not-found', 'Ativo não encontrado ou API de preço indisponível.');

    const receita = preco * qtd;
    const qtdRestante = holding.qtd - qtd;
    const novaLista = qtdRestante > 0
      ? inv.map(h => h.ticker === ticker ? { ...h, qtd: qtdRestante } : h)
      : inv.filter(h => h.ticker !== ticker);

    await jogRef.update({
      dinheiro: (j.dinheiro || 0) + receita,
      [`investimentos.carteira_mercado.${subcampo}`]: novaLista,
    });

    return { ok: true, preco, receita, msg: `${qtd} ${ticker} vendido(s) a R$${preco.toLocaleString('pt-BR')} (total R$${receita.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}).` };
  });
});
