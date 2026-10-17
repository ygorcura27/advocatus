'use strict';

/**
 * PATRIMÔNIO — compra e venda de imóvel, veículo e itens da loja.
 *
 * Antes tudo isso era gravado direto do navegador (js/patrimonio.js), e as
 * regras do Firestore aceitavam qualquer valor: dava pra marcar um imóvel
 * como "comprado" sem pagar e vendê-lo em seguida, ou simplesmente escrever
 * o próprio saldo pelo console (F12). Agora dinheiro, posse (moradias_
 * compradas, carros_comprados, compras) e financiamentos só mudam aqui,
 * com preço tirado do catálogo do servidor (shared/catalogo_patrimonio.js).
 *
 * As regras de negócio (60% na venda de imóvel, 50% de veículo/item,
 * financiamento 36/48x com 35% de juros, reembolso de 50% das parcelas
 * pagas na devolução, congresso só no mês certo e 1x por ano) são as
 * mesmas que já existiam no cliente.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { MORADIAS, CARROS, SHOP } = require('./shared/catalogo_patrimonio');
const { repCapDoCargo } = require('./shared/repCap');

const HABILIDADE_CAP = 50;

const clampRep = (v) => Math.max(0, Math.min(100, v));
const falha = (msg) => { throw new HttpsError('failed-precondition', msg); };

/**
 * Calcula o patch de uma ação de patrimônio sobre o jogador `j` (doc já
 * lido). Pura — não grava nada — pra poder ser testada sem Firestore.
 * Retorna { updates, msg }.
 */
function calcularAcaoPatrimonio(j, { acao, id, modo }) {
  const dinheiro = j.dinheiro || 0;
  const rep      = j.reputacao ?? 30;
  const skills   = j.skills || {};
  const updates  = {};

  switch (acao) {
    case 'comprar_imovel': {
      const m = MORADIAS[id];
      if (!m || m.pais) falha('Imóvel inválido.');
      if (j.moradias_compradas?.[id]) falha('Você já possui este imóvel.');
      if (dinheiro < m.v) falha(`Saldo insuficiente. Necessário: R$ ${m.v.toLocaleString('pt-BR')}`);
      updates.dinheiro = dinheiro - m.v;
      updates[`moradias_compradas.${id}`] = true;
      updates['pat.moradia'] = id;
      updates.reputacao = clampRep(rep + m.rep_cp);
      return { updates, msg: `🏠 ${m.l} comprada! +${m.rep_cp} rep` };
    }

    case 'vender_imovel': {
      const m = MORADIAS[id];
      if (!m || m.pais || !j.moradias_compradas?.[id]) falha('Imóvel não encontrado.');
      const vVenda = Math.floor(m.v * 0.6);
      const novasComp = { ...(j.moradias_compradas || {}) };
      delete novasComp[id];
      updates.moradias_compradas = novasComp;
      updates.dinheiro = dinheiro + vVenda;
      if (j.pat?.moradia === id) {
        const outras = Object.keys(novasComp).filter((k) => novasComp[k]);
        updates['pat.moradia'] = outras.length > 0 ? outras[0] : 'pais';
        if ((m.rep_cp || 0) > 0) updates.reputacao = clampRep(rep - m.rep_cp);
      }
      return { updates, msg: `🏠 ${m.l} vendida por R$ ${vVenda.toLocaleString('pt-BR')}.` };
    }

    case 'comprar_carro': {
      const cr = CARROS[id];
      if (!cr || id === 'onibus') falha('Veículo inválido.');
      if (j.carros_comprados?.[id]) falha('Você já possui este veículo.');
      if (modo === 'vista') {
        if (dinheiro < cr.v) falha('Saldo insuficiente.');
        updates.dinheiro = dinheiro - cr.v;
        updates[`carros_comprados.${id}`] = true;
        updates['pat.transporte'] = id;
        updates.reputacao = clampRep(rep + cr.rep);
        return { updates, msg: `${cr.l} comprado!` };
      }
      if (modo !== 'fin36' && modo !== 'fin48') falha('Modalidade inválida.');
      if (j.no_serasa) falha('Financiamento bloqueado — nome no Serasa.');
      const parcelas = modo === 'fin36' ? 36 : 48;
      const parcela  = Math.ceil(cr.v / parcelas * 1.35);
      updates[`financiamentos.${id}`] = { nome: cr.l, parcela_mensal: parcela, parcelas_restantes: parcelas, valor_total: parcela * parcelas };
      updates[`carros_comprados.${id}`] = true;
      updates['pat.transporte'] = id;
      updates.reputacao = clampRep(rep + Math.floor(cr.rep * 0.6));
      return { updates, msg: `${cr.l} financiado! ${parcelas}× R$ ${parcela.toLocaleString('pt-BR')}/mês` };
    }

    case 'vender_carro': {
      const cr = CARROS[id];
      if (!cr || id === 'onibus' || !j.carros_comprados?.[id]) falha('Veículo não encontrado.');
      const vVenda = Math.floor(cr.v * 0.5);
      const novosCom = { ...(j.carros_comprados || {}) };
      delete novosCom[id];
      updates.carros_comprados = novosCom;
      updates.dinheiro = dinheiro + vVenda;
      if (j.pat?.transporte === id) {
        const outros = Object.keys(novosCom).filter((k) => novosCom[k] && k !== 'onibus');
        updates['pat.transporte'] = outros.length > 0 ? outros[0] : 'onibus';
        if (cr.rep > 0) updates.reputacao = clampRep(rep - cr.rep);
      }
      if (j.financiamentos?.[id]) {
        const f = { ...j.financiamentos };
        delete f[id];
        updates.financiamentos = f;
      }
      return { updates, msg: `🚗 ${cr.l} vendido por R$ ${vVenda.toLocaleString('pt-BR')}!` };
    }

    case 'devolver_carro': {
      const fin = (j.financiamentos || {})[id];
      if (!fin || fin.parcelas_restantes <= 0) falha('Nenhum financiamento ativo para este veículo.');
      const totalParcelas = Math.round(fin.valor_total / fin.parcela_mensal) || 1;
      const pagas         = totalParcelas - fin.parcelas_restantes;
      const reembolso     = Math.floor(pagas * fin.parcela_mensal * 0.5);
      const novosFins = { ...(j.financiamentos || {}) };
      delete novosFins[id];
      const novosCom = { ...(j.carros_comprados || {}) };
      delete novosCom[id];
      updates.financiamentos = novosFins;
      updates.carros_comprados = novosCom;
      updates['pat.transporte'] = 'onibus';
      updates.dinheiro = dinheiro + reembolso;
      return { updates, msg: `🚗 Carro devolvido. +R$ ${reembolso.toLocaleString('pt-BR')} de reembolso.` };
    }

    case 'comprar_item': {
      const it = SHOP[id];
      if (!it) falha('Item inválido.');
      if (dinheiro < it.p) falha('Saldo insuficiente.');

      if (it.cat === 'cong') {
        const mesAtual = ((j.mes_pessoal ?? 0) % 12) + 1;
        const anoAtual = j.ano_pessoal || 1;
        if (mesAtual !== it.mes) falha('Congresso fora do mês de realização.');
        if ((j.congressos_usados || {})[id] === anoAtual) falha('Você já participou deste congresso este ano.');
        updates.dinheiro = dinheiro - it.p;
        updates[`congressos_usados.${id}`] = anoAtual;
        if (it.rep > 0) updates.reputacao = Math.min(repCapDoCargo(j.cargo_id), rep + it.rep);
        updates['skills.networking'] = Math.min(HABILIDADE_CAP, (skills.networking || 10) + it.networking);
        return { updates, msg: `✈️ ${it.n} — participação confirmada!${it.rep > 0 ? ` +${it.rep} rep` : ''}` };
      }

      if ((j.compras || []).some((c) => c.id === id)) falha('Você já possui este item.');
      updates.dinheiro = dinheiro - it.p;
      updates.compras = [...(j.compras || []), { id, n: it.n, rep: it.rep || 0, p: it.p, img: it.img }];
      if (it.rep > 0) updates.reputacao = clampRep(rep + it.rep);
      for (const [sk, [bonus, padrao]] of Object.entries(it.skills || {})) {
        const alvo = sk === 'todas' ? Object.keys(skills) : [sk];
        for (const k of alvo) updates[`skills.${k}`] = Math.min(HABILIDADE_CAP, (skills[k] || padrao) + bonus);
      }
      return { updates, msg: `${it.n} adquirido!${it.rep > 0 ? ` +${it.rep} rep` : ''}` };
    }

    case 'vender_item': {
      const it = SHOP[id];
      if (!it || !(j.compras || []).some((c) => c.id === id)) falha('Item não encontrado.');
      const vVenda = Math.floor(it.p * 0.5);
      updates.dinheiro = dinheiro + vVenda;
      updates.compras = (j.compras || []).filter((c) => c.id !== id);
      if (it.rep > 0) updates.reputacao = clampRep(rep - it.rep);
      return { updates, msg: `${it.n} vendido por R$ ${vVenda.toLocaleString('pt-BR')}.${it.rep > 0 ? ` -${it.rep} rep` : ''}` };
    }

    default:
      throw new HttpsError('invalid-argument', 'Ação de patrimônio inválida.');
  }
}

exports.acaoPatrimonio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const { acao, id, modo } = request.data || {};
  if (typeof acao !== 'string' || typeof id !== 'string') throw new HttpsError('invalid-argument', 'Parâmetros inválidos.');

  const db   = getFirestore();
  const jRef = db.collection('jogadores').doc(request.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const { updates, msg } = calcularAcaoPatrimonio(snap.data(), { acao, id, modo });
    tx.update(jRef, updates);
    return { ok: true, msg };
  });
});

exports.calcularAcaoPatrimonio = calcularAcaoPatrimonio;
