/**
 * FINANCEIRO AVANÇADO — Advocatus Online (GDD Seção 31-33)
 * Venda de precatórios (honorários pendentes), linha de crédito, sócio investidor, investimentos.
 */

import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { collection, getDocs, query, where, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// Nonce por chamada — protege contra reenvio duplicado da mesma ação (GDD P1.7).
function _gerarNonce() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

function _fmtR(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

// Espelho da lista backend — dados estáticos de config
const _FIRMAS_NPC = [
  { id: 'alves_ferreira',      nome: 'Alves & Ferreira',    setor: 'Civil',       min_inv: 30000, pct_base: 0.008, vol: 0.15, desc: 'Advocacia civil consolidada, retorno estável.' },
  { id: 'costa_tributario',    nome: 'Costa Tributário',    setor: 'Tributário',  min_inv: 50000, pct_base: 0.012, vol: 0.20, desc: 'Especialista tributário, bom potencial de ganho.' },
  { id: 'pereira_criminal',    nome: 'Pereira & Criminal',  setor: 'Criminal',    min_inv: 40000, pct_base: 0.010, vol: 0.30, desc: 'Alto risco/retorno, depende do volume de casos.' },
  { id: 'melo_digital',        nome: 'Melo Digital Law',    setor: 'Tech',        min_inv: 80000, pct_base: 0.015, vol: 0.35, desc: 'Mercado tech em expansão — máxima volatilidade.' },
  { id: 'ribeiro_trabalhista', nome: 'Ribeiro Trabalhista', setor: 'Trabalhista', min_inv: 20000, pct_base: 0.007, vol: 0.10, desc: 'Demanda estável, retorno conservador e previsível.' },
];

// ── Ações (B3) e Criptomoedas — real: compra/venda persiste em
// investimentos.carteira_mercado (functions/investimentos_mercado.js,
// comprarAtivo/venderAtivo, preço sempre re-buscado no servidor, nunca
// confia no preço que o cliente mandar). Preço/variação exibidos vêm de
// API pública gratuita (_invCarregarPrecosReais, abaixo): cripto via
// CoinGecko (10/10), ações via brapi.dev (só 3 tickers — PETR4/VALE3/ITUB4
// são os únicos cobertos pelo sandbox grátis sem token).
const _INV_ACOES_TICKERS = ['PETR4','VALE3','ITUB4'];
const _INV_ACOES_NOMES = { PETR4:'Petrobras', VALE3:'Vale', ITUB4:'Itaú Unibanco' };
const _INV_ACOES = _INV_ACOES_TICKERS.map(t => ({ ticker:t, nome:_INV_ACOES_NOMES[t], preco:+(8+Math.random()*72).toFixed(2), variacao:+((Math.random()*10)-5).toFixed(2), real:false }));
const _INV_CRIPTOS_LISTA = [
  { ticker:'BTC', nome:'Bitcoin',    coingeckoId:'bitcoin',                 preco: 340000+Math.random()*40000 },
  { ticker:'ETH', nome:'Ethereum',   coingeckoId:'ethereum',                preco: 12000+Math.random()*3000 },
  { ticker:'BNB', nome:'BNB',        coingeckoId:'binancecoin',             preco: 2000+Math.random()*400 },
  { ticker:'SOL', nome:'Solana',     coingeckoId:'solana',                  preco: 600+Math.random()*150 },
  { ticker:'XRP', nome:'XRP',        coingeckoId:'ripple',                  preco: 2.5+Math.random()*1.5 },
  { ticker:'ADA', nome:'Cardano',    coingeckoId:'cardano',                 preco: 1.8+Math.random()*0.8 },
  { ticker:'DOGE',nome:'Dogecoin',   coingeckoId:'dogecoin',                preco: 0.6+Math.random()*0.4 },
  { ticker:'DOT', nome:'Polkadot',   coingeckoId:'polkadot',                preco: 25+Math.random()*10 },
  { ticker:'AVAX',nome:'Avalanche',  coingeckoId:'avalanche-2',             preco: 130+Math.random()*40 },
  { ticker:'MATIC',nome:'Polygon',   coingeckoId:'polygon-ecosystem-token', preco: 3.5+Math.random()*1.5 }, // MATIC migrou pra POL em 2024, id antigo 'matic-network' não retorna mais preço
];
const _INV_CRIPTOS = _INV_CRIPTOS_LISTA.map(c => ({ ...c, preco:+c.preco.toFixed(2), variacao:+((Math.random()*14)-7).toFixed(2), real:false }));
let _invTabAtiva = 'visao';
let _invPrecosReaisCarregados = false;

// Preços reais via APIs públicas gratuitas, sem chave/token:
// brapi.dev (Bovespa, sandbox sem token = só PETR4/VALE3/ITUB4/MGLU3) e
// CoinGecko (cripto, endpoint público). Roda 1x por sessão (guard acima),
// silencioso em erro/timeout — se a API cair, fica no valor ilustrativo.
async function _invCarregarPrecosReais() {
  if (_invPrecosReaisCarregados) return;
  _invPrecosReaisCarregados = true;

  try {
    const r = await fetch(`https://brapi.dev/api/quote/${_INV_ACOES_TICKERS.join(',')}`);
    const d = await r.json();
    for (const res of (d.results || [])) {
      const alvo = _INV_ACOES.find(a => a.ticker === res.symbol);
      if (alvo) { alvo.preco = res.regularMarketPrice; alvo.variacao = +res.regularMarketChangePercent.toFixed(2); alvo.real = true; }
    }
  } catch (e) { /* silencioso — mantém preço ilustrativo */ }

  try {
    const ids = _INV_CRIPTOS.map(c => c.coingeckoId).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&ids=${ids}`);
    const d = await r.json();
    for (const coin of d) {
      const alvo = _INV_CRIPTOS.find(c => c.coingeckoId === coin.id);
      if (alvo && coin.current_price != null) { alvo.preco = coin.current_price; alvo.variacao = +(coin.price_change_percentage_24h ?? 0).toFixed(2); alvo.real = true; }
    }
  } catch (e) { /* silencioso — mantém preço ilustrativo */ }

  if (_invTabAtiva === 'acoes' || _invTabAtiva === 'cripto') window._invRenderTab(_invTabAtiva);
}

// ════════════════════════════════════════════════════════
// RENDERIZAR PAINEL FINANCEIRO AVANÇADO
// ════════════════════════════════════════════════════════
window.renderFinanceiroAvancado = async function(j, el) {
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--txt3)">Carregando…</div>`;

  const rep   = j.reputacao || 0;
  const lc    = j.linha_credito;
  const inv   = j.investimentos || {};
  const escId = j.escritorio_proprio_id;
  const uid   = j.uid || window.JOGADOR_UID;

  // Escritório (para sócio investidor)
  let esc = null, escTier = 0;
  if (escId) {
    try {
      const snap = await getDoc(doc(db, 'escritorios', escId));
      if (snap.exists()) { esc = snap.data(); escTier = esc.tier || 1; }
    } catch(e) { /* silencioso */ }
  }

  // Hon. pendente (antecipação)
  let totalHonPendente = 0;
  try {
    const procSnap = escId
      ? await getDocs(query(collection(db,'processos'), where('pool_escritorio_id','==',escId), where('status','==','aguardando_decisao_sentenca')))
      : await getDocs(query(collection(db,'processos'), where('advogado_uid','==',uid), where('status','==','aguardando_decisao_sentenca')));
    for (const d of procSnap.docs) totalHonPendente += (d.data().hon_pendente || 0);
  } catch(e) { /* silencioso */ }

  const maxAntecipavel = Math.floor(totalHonPendente * 0.60);
  const descPct  = rep >= 60 ? 15 : rep >= 40 ? 20 : 25;
  const valorLiq = Math.floor(maxAntecipavel * (1 - descPct / 100));
  const tetoLC   = rep >= 40 ? rep * 500 : 0;
  const saldoLC  = lc?.saldo || 0;
  const dispLC   = Math.max(0, tetoLC - saldoLC);
  const jurosMes = saldoLC > 0 ? Math.ceil(saldoLC * 0.025) : 0;

  const { rf, fd, im, fn, total } = _invTotais(inv);
  const rend = _invRendimento(inv);
  const count = (inv.renda_fixa||[]).length + (inv.fundos||[]).length + (inv.imovel_renda?1:0) + (inv.firma_npc||[]).length;

  el.innerHTML = `
    ${window._capaHeader(`FINANCEIRO · ${(j.nome_personagem||'—').toUpperCase()}`, '📊 Investimentos', '')}
    <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      4 categorias reais (functions/financeiro.js, GDD Seção 32, rodam todo mês em avancar_mes.js): Renda Fixa, Fundos,
      Imóvel para Renda, Firmas NPC. Ações (B3) e Criptomoedas (functions/investimentos_mercado.js) também são reais —
      compra/venda persiste, preço sempre re-checado no servidor via API pública grátis (CoinGecko pra cripto,
      brapi.dev pra ações — 3 tickers, único plano sem custo dessa API).
    </div>

    <div class="stat-row">
      <div class="stat"><div class="stat-label">Total investido</div><div class="stat-value">${_fmtR(total)}</div></div>
      <div class="stat"><div class="stat-label">Rendimento estimado/mês</div><div class="stat-value up">${_fmtR(rend)}</div></div>
      <div class="stat"><div class="stat-label">Saldo disponível</div><div class="stat-value">${_fmtR(j.dinheiro||0)}</div></div>
      <div class="stat"><div class="stat-label">Posições ativas</div><div class="stat-value">${count}</div></div>
    </div>

    <div class="equipe-tabs">
      <div class="equipe-tab${_invTabAtiva==='visao'?' ativo':''}" onclick="window._invTab(this,'visao')">Visão Geral</div>
      <div class="equipe-tab${_invTabAtiva==='rf'?' ativo':''}" onclick="window._invTab(this,'rf')">Renda Fixa</div>
      <div class="equipe-tab${_invTabAtiva==='fd'?' ativo':''}" onclick="window._invTab(this,'fd')">Fundos</div>
      <div class="equipe-tab${_invTabAtiva==='im'?' ativo':''}" onclick="window._invTab(this,'im')">Imóvel p/ Renda</div>
      <div class="equipe-tab${_invTabAtiva==='fn'?' ativo':''}" onclick="window._invTab(this,'fn')">Firmas (Ações reais)</div>
      <div class="equipe-tab${_invTabAtiva==='acoes'?' ativo':''}" onclick="window._invTab(this,'acoes')">Ações (B3)</div>
      <div class="equipe-tab${_invTabAtiva==='cripto'?' ativo':''}" onclick="window._invTab(this,'cripto')">Criptomoedas</div>
    </div>
    <div id="inv-conteudo"></div>

    <div style="margin:1.6rem 0 .6rem;padding-top:.6rem;border-top:var(--borda)">
      <div style="font-size:.66rem;color:var(--txt4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.6rem">Outras ferramentas financeiras</div>
    </div>
    ${_htmlSocioInvestidor(esc, escTier, escId)}
    ${_htmlAntecipacao(totalHonPendente, maxAntecipavel, valorLiq, descPct, rep)}
    ${_htmlLinhaCredito(saldoLC, dispLC, tetoLC, jurosMes, rep)}
  `;

  window._invRenderTab(_invTabAtiva);
  _invCarregarPrecosReais();
};

function _invTotais(inv) {
  const rf = (inv.renda_fixa||[]).reduce((s,i)=>s+i.valor_aplicado,0);
  const fd = (inv.fundos||[]).reduce((s,i)=>s+i.valor_aplicado,0);
  const im = inv.imovel_renda?.valor_aplicado || 0;
  const fn = (inv.firma_npc||[]).reduce((s,i)=>s+i.valor_investido,0);
  return { rf, fd, im, fn, total: rf+fd+im+fn };
}
function _invRendimento(inv) {
  const rendRf = (inv.renda_fixa||[]).reduce((s,i)=>s+i.valor_aplicado*(i.taxa_mensal||0.008),0);
  const rendFd = (inv.fundos||[]).reduce((s,i)=>s+i.valor_aplicado*(((i.min||0)+(i.max||0.008))/2),0);
  const rendIm = inv.imovel_renda?.aluguel_mensal || 0;
  const rendFn = (inv.firma_npc||[]).reduce((s,i)=>s+i.valor_investido*(i.pct_base||0.009),0);
  return rendRf+rendFd+rendIm+rendFn;
}

window._invTab = function(btn, tab) {
  _invTabAtiva = tab;
  btn.parentElement.querySelectorAll('.equipe-tab').forEach(t => t.classList.toggle('ativo', t === btn));
  window._invRenderTab(tab);
};

window._invRenderTab = function(tab) {
  const el = document.getElementById('inv-conteudo');
  if (!el) return;
  const j = window.JOGADOR || {};
  const inv = j.investimentos || {};
  const { rf, fd, im, fn, total } = _invTotais(inv);

  if (tab === 'visao') {
    const linhas = [
      ['📈 Renda Fixa', rf, 'var(--verde2)'],
      ['💹 Fundos', fd, 'var(--ouro)'],
      ['🏠 Imóvel p/ Renda', im, 'var(--amber)'],
      ['🏢 Firmas (Ações)', fn, 'var(--navy3)'],
    ].filter(l => l[1] > 0);
    let acumulado = 0;
    const gradientParts = linhas.map(([,valor,cor]) => {
      const pctStart = acumulado / total * 100;
      acumulado += valor;
      const pctEnd = acumulado / total * 100;
      return `${cor} ${pctStart}% ${pctEnd}%`;
    });
    const donutBg = total > 0 ? `conic-gradient(${gradientParts.join(',')})` : 'var(--surface2)';
    const todasPosicoes = [
      ...(inv.renda_fixa||[]).map(i=>({ nome:'Tesouro/CDB', tipo:'Renda Fixa', valor:i.valor_aplicado, rend:`+${((i.taxa_mensal||0.008)*100).toFixed(1)}%/mês` })),
      ...(inv.fundos||[]).map(i=>({ nome:'Fundo '+(i.subtipo?i.subtipo[0].toUpperCase()+i.subtipo.slice(1):'—'), tipo:'Fundos', valor:i.valor_aplicado, rend:`${((i.min||0)*100).toFixed(1)}% a ${((i.max||0)*100).toFixed(1)}%/mês` })),
      ...(inv.imovel_renda ? [{ nome:'Imóvel p/ Renda', tipo:'Imóvel', valor:inv.imovel_renda.valor_aplicado, rend:`+${_fmtR(inv.imovel_renda.aluguel_mensal)}/mês` }] : []),
      ...(inv.firma_npc||[]).map(i=>({ nome:i.nome, tipo:'Firma (Ação)', valor:i.valor_investido, rend:`±${((i.volatilidade||0.2)*100).toFixed(0)}% sobre ${((i.pct_base||0.009)*100).toFixed(1)}%/mês` })),
    ];
    el.innerHTML = `
      <div class="equipe-layout" style="grid-template-columns:1fr 1fr">
        <section class="painel">
          <div class="painel-head"><span class="painel-titulo">Alocação da Carteira</span></div>
          <div style="padding:1.2rem 1.1rem;display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap">
            <div style="width:120px;height:120px;border-radius:50%;background:${donutBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <div style="width:76px;height:76px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:.58rem;color:var(--txt4)">Total</div>
                <div style="font-size:.74rem;color:var(--txt);font-weight:600">${_fmtR(total)}</div>
              </div>
            </div>
            <div style="flex:1;min-width:160px">
              ${total===0?`<div style="font-size:.78rem;color:var(--txt4)">Nenhum investimento ativo.</div>`:
                linhas.map(([nome,valor,cor]) => `<div class="perf-row"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor};margin-right:.4rem"></span>${nome}</span><b>${Math.round(valor/total*100)}%</b></div>`).join('')}
            </div>
          </div>
        </section>
        <section class="painel">
          <div class="painel-head"><span class="painel-titulo">Evolução do Patrimônio</span><span class="painel-link">ilustrativo — sem histórico real salvo</span></div>
          <div style="padding:1.5rem 1.1rem;font-size:.72rem;color:var(--txt4);text-align:center">Sem histórico de patrimônio salvo — o jogo real não guarda isso hoje.</div>
        </section>
      </div>
      <section class="painel" style="margin-top:1.1rem">
        <div class="painel-head"><span class="painel-titulo">Meus Investimentos</span></div>
        <div style="padding:.4rem 1.1rem 1rem">
          ${todasPosicoes.length===0?`<div style="font-size:.78rem;color:var(--txt4);padding:.6rem 0">Nenhum investimento ativo — use as abas acima.</div>`:
            todasPosicoes.map(p=>`<div class="perf-row"><span>${p.nome} <em style="color:var(--txt4);font-style:normal">· ${p.tipo}</em></span><b>${_fmtR(p.valor)} <span style="color:var(--verde2);font-weight:400">· ${p.rend}</span></b></div>`).join('')}
        </div>
      </section>`;
  } else if (tab === 'rf') {
    el.innerHTML = `
      <section class="painel" style="margin-bottom:1rem">
        <div class="painel-head"><span class="painel-titulo">📈 Renda Fixa — 0,8%/mês fixo <span style="color:var(--verde2);font-size:.62rem">real</span></span></div>
        <div style="padding:1rem 1.1rem">
          ${(inv.renda_fixa||[]).length===0?`<div style="font-size:.78rem;color:var(--txt4);margin-bottom:.8rem">Nenhuma aplicação ativa.</div>`:
            (inv.renda_fixa||[]).map(i=>`
            <div class="perf-row"><span>${_fmtR(i.valor_aplicado)} aplicado</span><b style="color:var(--verde2)">+${_fmtR(i.valor_aplicado*(i.taxa_mensal||0.008))}/mês</b></div>
            <div style="text-align:right;margin-bottom:.6rem"><button class="btn-sair oport-btn" onclick="window._resgatarInv('renda_fixa','${i.id}',${i.valor_aplicado})">Resgatar</button></div>`).join('')}
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.6rem;flex-wrap:wrap">
            <input type="number" id="inv-rf-valor" class="equipe-select" placeholder="Valor (mín. R$1.000)" style="flex:1;min-width:140px">
            <button class="btn-avancar oport-btn" onclick="window._invAplicarInline('renda_fixa')">Aplicar</button>
          </div>
        </div>
      </section>`;
  } else if (tab === 'fd') {
    el.innerHTML = `
      <section class="painel" style="margin-bottom:1rem">
        <div class="painel-head"><span class="painel-titulo">💹 Fundos — taxa sorteada por subtipo <span style="color:var(--verde2);font-size:.62rem">real</span></span></div>
        <div style="padding:1rem 1.1rem">
          ${(inv.fundos||[]).length===0?`<div style="font-size:.78rem;color:var(--txt4);margin-bottom:.8rem">Nenhum fundo ativo.</div>`:
            (inv.fundos||[]).map(i=>`
            <div class="perf-row"><span>${i.subtipo?i.subtipo[0].toUpperCase()+i.subtipo.slice(1):'—'} · ${_fmtR(i.valor_aplicado)}</span><b>${_fmtR(i.valor_aplicado*(i.min||0))} a ${_fmtR(i.valor_aplicado*(i.max||0))}/mês</b></div>
            <div style="text-align:right;margin-bottom:.6rem"><button class="btn-sair oport-btn" onclick="window._resgatarInv('fundo','${i.id}',${i.valor_aplicado})">Resgatar</button></div>`).join('')}
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.6rem;flex-wrap:wrap">
            <select id="inv-fd-subtipo" class="equipe-select">
              <option value="conservador">🛡️ Conservador (0,4% a 0,9%/mês)</option>
              <option value="moderado">⚖️ Moderado (0,2% a 1,4%/mês)</option>
              <option value="arrojado">🚀 Arrojado (-0,5% a 2,0%/mês)</option>
            </select>
            <input type="number" id="inv-fd-valor" class="equipe-select" placeholder="Valor (mín. R$2.000)" style="flex:1;min-width:140px">
            <button class="btn-avancar oport-btn" onclick="window._invAplicarInline('fundo')">Aplicar</button>
          </div>
        </div>
      </section>`;
  } else if (tab === 'im') {
    el.innerHTML = `
      <section class="painel" style="margin-bottom:1rem">
        <div class="painel-head"><span class="painel-titulo">🏠 Imóvel para Renda — só 1 por vez <span style="color:var(--verde2);font-size:.62rem">real</span></span></div>
        <div style="padding:1rem 1.1rem">
          ${inv.imovel_renda ? `
            <div class="perf-row"><span>${_fmtR(inv.imovel_renda.valor_aplicado)} aplicado</span><b style="color:var(--verde2)">+${_fmtR(inv.imovel_renda.aluguel_mensal)}/mês</b></div>
            <div style="text-align:right"><button class="btn-sair oport-btn" onclick="window._resgatarInv('imovel_renda',null,${inv.imovel_renda.valor_aplicado})">Resgatar</button></div>` : `
            <div style="font-size:.78rem;color:var(--txt4);margin-bottom:.8rem">Nenhum imóvel para renda. Aluguel sorteado entre 0,4% e 0,6%/mês, fixado na compra.</div>
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
              <input type="number" id="inv-im-valor" class="equipe-select" placeholder="Valor (mín. R$50.000)" style="flex:1;min-width:140px">
              <button class="btn-avancar oport-btn" onclick="window._invAplicarInline('imovel_renda')">Comprar</button>
            </div>`}
        </div>
      </section>`;
  } else if (tab === 'fn') {
    const investidas = (inv.firma_npc||[]).map(p=>p.firma_id);
    el.innerHTML = `
      <section class="painel" style="margin-bottom:1rem">
        <div class="painel-head"><span class="painel-titulo">🏢 Firmas NPC — mais próximo de "ações" real <span style="color:var(--verde2);font-size:.62rem">real, 5 firmas</span></span></div>
        <div style="padding:1rem 1.1rem">
          ${(inv.firma_npc||[]).length===0?`<div style="font-size:.78rem;color:var(--txt4);margin-bottom:.8rem">Nenhuma participação ativa.</div>`:
            (inv.firma_npc||[]).map(i=>{
              const minD=i.valor_investido*(i.pct_base||0.009)*(1-(i.volatilidade||0.2)), maxD=i.valor_investido*(i.pct_base||0.009)*(1+(i.volatilidade||0.2));
              return `<div class="perf-row"><span>${i.nome} · ${_fmtR(i.valor_investido)}</span><b>${_fmtR(minD)} a ${_fmtR(maxD)}/mês</b></div>
              <div style="text-align:right;margin-bottom:.6rem"><button class="btn-sair oport-btn" onclick="window._resgatarInv('firma_npc','${i.id}',${i.valor_investido})">Resgatar</button></div>`;
            }).join('')}
        </div>
      </section>
      <div class="peca-grid">
        ${_FIRMAS_NPC.filter(f=>!investidas.includes(f.id)).map(f => `
          <div class="peca-card">
            <div class="peca-topo"><div><div class="peca-kicker">🏢 ${f.setor.toUpperCase()}</div><div class="peca-titulo">${f.nome}</div></div></div>
            <div class="perf-row"><span>Mínimo</span><b>${_fmtR(f.min_inv)}</b></div>
            <div class="perf-row"><span>Dividendo base</span><b>${(f.pct_base*100).toFixed(1)}%/mês</b></div>
            <div class="perf-row"><span>Volatilidade</span><b>${(f.vol*100).toFixed(0)}%</b></div>
            <input type="number" id="inv-fn-valor-${f.id}" class="equipe-select" placeholder="Valor a investir" style="width:100%;margin:.5rem 0;box-sizing:border-box">
            <button class="btn-avancar oport-btn" style="width:100%" onclick="window._invAplicarInline('firma_npc','${f.id}')">Investir</button>
          </div>`).join('')}
      </div>`;
  } else if (tab === 'acoes' || tab === 'cripto') {
    const lista = tab === 'acoes' ? _INV_ACOES : _INV_CRIPTOS;
    const carteira = j.investimentos?.carteira_mercado?.[tab] || [];
    const carteiraValor = carteira.reduce((s,h)=>{
      const atual = lista.find(x=>x.ticker===h.ticker);
      return s + (atual ? atual.preco*h.qtd : h.preco_medio*h.qtd);
    },0);
    const carregado = lista.every(a=>a.real);
    el.innerHTML = `
      <div style="font-size:.7rem;color:var(--txt3);margin-bottom:.8rem">Preço: ${carregado?`<b style="color:var(--verde2)">100% real, ao vivo (${tab==='acoes'?'brapi.dev':'CoinGecko'})</b>`:'carregando preços reais…'} — compra/venda persiste, valor sempre re-checado no servidor.</div>
      ${carteira.length>0?`
      <section class="painel" style="margin-bottom:1rem">
        <div class="painel-head"><span class="painel-titulo">Minha Carteira — ${_fmtR(carteiraValor)}</span></div>
        <div style="padding:.4rem 1.1rem 1rem">
          ${carteira.map(h=>{
            const atual = lista.find(x=>x.ticker===h.ticker);
            const precoAtual = atual ? atual.preco : h.preco_medio;
            return `<div class="perf-row"><span>${h.ticker} <em style="color:var(--txt4);font-style:normal">· ${h.qtd} ${tab==='acoes'?'ações':'unid.'} · PM ${_fmtR(h.preco_medio)}</em></span>
              <span style="display:flex;align-items:center;gap:.4rem"><b>${_fmtR(precoAtual*h.qtd)}</b>
              <input type="number" id="inv-${tab}-vend-${h.ticker}" class="equipe-select" placeholder="${h.qtd}" style="width:56px;padding:.2rem" max="${h.qtd}">
              <button class="btn-sair oport-btn" onclick="window._invVender('${tab}','${h.ticker}',${h.qtd})">Vender</button></span></div>`;
          }).join('')}
        </div>
      </section>`:''}
      <section class="painel">
        <div class="painel-head"><span class="painel-titulo">${tab==='acoes'?'Ações — B3':'Top 10 Criptomoedas'}</span></div>
        <div style="padding:.4rem 1.1rem 1rem">
          ${lista.map(a => `
          <div class="perf-row">
            <span>${a.ticker} <em style="color:var(--txt4);font-style:normal">${a.nome}</em></span>
            <span style="display:flex;align-items:center;gap:.6rem">
              <b>${_fmtR(a.preco)}</b>
              <b style="color:${a.variacao>=0?'var(--verde2)':'var(--verm2)'};min-width:52px;text-align:right">${a.variacao>=0?'+':''}${a.variacao}%</b>
              <input type="number" id="inv-${tab}-qtd-${a.ticker}" class="equipe-select" placeholder="Qtd" style="width:64px;padding:.3rem">
              <button class="btn-avancar oport-btn" onclick="window._invComprar('${tab}','${a.ticker}')">Comprar</button>
            </span>
          </div>`).join('')}
        </div>
      </section>`;
  }
};

window._invAplicarInline = async function(tipo, firmaId) {
  let valor, subtipo;
  if (tipo === 'renda_fixa') valor = parseFloat(document.getElementById('inv-rf-valor')?.value);
  else if (tipo === 'fundo') { valor = parseFloat(document.getElementById('inv-fd-valor')?.value); subtipo = document.getElementById('inv-fd-subtipo')?.value; }
  else if (tipo === 'imovel_renda') valor = parseFloat(document.getElementById('inv-im-valor')?.value);
  else if (tipo === 'firma_npc') valor = parseFloat(document.getElementById(`inv-fn-valor-${firmaId}`)?.value);
  if (!valor || valor <= 0) { toast('Informe um valor válido.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'aplicarInvestimento');
    const r  = await fn({ tipo, valor, subtipo, firma_id: firmaId, nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 4000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao aplicar investimento.', 'ko');
  }
};

window._resgatarInv = async function(tipo, id, valor) {
  const label = { renda_fixa:'Renda Fixa', fundo:'Fundo', imovel_renda:'Imóvel', firma_npc:'Participação' }[tipo] || tipo;
  abrirModal(`Resgatar ${label}?`, `
    <div style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem">
      O capital de <b>${_fmtR(valor)}</b> será devolvido ao seu saldo. Os rendimentos acumulados já foram creditados normalmente.
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-ghost btn-block" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim btn-block" onclick="window.__confirmarResgate('${tipo}','${id||''}',${valor})">Resgatar</button>
    </div>
  `);
};

window.__confirmarResgate = async function(tipo, id, valor) {
  fecharModal();
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'resgatarInvestimento');
    const r  = await fn({ tipo, id: id || null, nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 5000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao resgatar.', 'ko');
  }
};

// ── Ações (B3) / Criptomoedas — real, persiste via comprarAtivo/venderAtivo
// (functions/investimentos_mercado.js). Preço é sempre re-buscado no servidor,
// nunca confia em valor calculado no cliente.
window._invComprar = async function(tab, ticker) {
  const el = document.getElementById(`inv-${tab}-qtd-${ticker}`);
  const qtd = parseFloat(el?.value);
  if (!qtd || qtd <= 0) { toast('Informe uma quantidade válida.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'comprarAtivo');
    const r  = await fn({ tipo: tab === 'acoes' ? 'acao' : 'cripto', ticker, qtd, nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 4000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao comprar.', 'ko');
  }
};
window._invVender = async function(tab, ticker, qtdMax) {
  const el  = document.getElementById(`inv-${tab}-vend-${ticker}`);
  const qtd = parseFloat(el?.value) || qtdMax;
  if (!qtd || qtd <= 0 || qtd > qtdMax) { toast('Quantidade inválida.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'venderAtivo');
    const r  = await fn({ tipo: tab === 'acoes' ? 'acao' : 'cripto', ticker, qtd, nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 4000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao vender.', 'ko');
  }
};


// ────────────────────────────────────────────────────────
// SEÇÃO: SÓCIO INVESTIDOR
// ────────────────────────────────────────────────────────
function _htmlSocioInvestidor(esc, tier, escId) {
  if (!escId) return '';

  const invEsc = esc?.investidor;

  if (invEsc?.ativo) {
    const total    = invEsc.meses_total || 36;
    const restant  = invEsc.meses_restantes || 0;
    const progPct  = Math.round(((total - restant) / total) * 100);
    return `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">🤝 Sócio Investidor</div>
      <div style="font-size:.73rem;font-weight:600;margin-bottom:.15rem">${invEsc.nome}</div>
      <div style="font-size:.68rem;color:var(--txt3);margin-bottom:.5rem">
        Capital aportado: <b>${_fmtR(invEsc.capital_aportado)}</b> · ${Math.round((invEsc.pct||0.20)*100)}% dos honorários mensais<br>
        Total pago: <b>${_fmtR(invEsc.total_pago||0)}</b> · <b>${restant}</b> meses restantes
      </div>
      <div style="background:var(--borda-cor,#eee);border-radius:4px;height:6px;margin-bottom:.25rem">
        <div style="background:var(--verde2);width:${progPct}%;height:100%;border-radius:4px"></div>
      </div>
      <div style="font-size:.64rem;color:var(--txt4);text-align:right">${progPct}% do contrato cumprido</div>
    </div>`;
  }

  if (tier >= 3) {
    const faixas = { 3:'R$80k–200k', 4:'R$200k–600k', 5:'R$600k–2M' };
    return `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">🤝 Sócio Investidor</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
        Atraia um investidor para aportar capital no escritório em troca de <b>20% dos honorários</b> por <b>36 meses</b>.<br>
        Capital esperado para Tier ${tier}: <b>${faixas[Math.min(tier,5)]}</b>.
      </div>
      <button class="btn btn-prim btn-block" onclick="window._contratarInvestidor()">🤝 Buscar Sócio Investidor</button>
    </div>`;
  }

  return `<div class="card" style="margin-bottom:.7rem;opacity:.55">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">🤝 Sócio Investidor</div>
    <div style="font-size:.72rem;color:var(--txt4)">Disponível a partir do Tier 3 (escritório atual: Tier ${tier}).</div>
  </div>`;
}

// ────────────────────────────────────────────────────────
// SEÇÃO: VENDER PRECATÓRIOS (era "Antecipação de Honorários" —
// nome trocado pra bater com o termo real do mercado jurídico
// brasileiro; mecânica/callable por baixo continuam as mesmas)
// ────────────────────────────────────────────────────────
function _htmlAntecipacao(total, maxAnt, valorLiq, descPct, rep) {
  return `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">⏩ Vender Precatórios</div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
      Venda até <b>60%</b> dos honorários pendentes agora, com deságio de <b>${descPct}%</b>
      ${rep >= 60 ? '(rep ≥ 60 — deságio mínimo)' : rep >= 40 ? '(rep 40-59)' : '(rep < 40 — deságio máximo)'}.
    </div>
    ${total > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.3rem">
        <span style="color:var(--txt3)">Hon. pendente total</span>
        <span style="font-weight:600">${_fmtR(total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
        <span style="color:var(--txt3)">Você recebe (líquido)</span>
        <span style="font-weight:700;color:var(--verde2)">${_fmtR(valorLiq)}</span>
      </div>
      <button class="btn btn-prim btn-block" onclick="window.solicitarAntecipacaoHonorarios()">⏩ Vender por ${_fmtR(valorLiq)}</button>`
    : `<div style="font-size:.72rem;color:var(--txt4);text-align:center;padding:.5rem 0">Nenhum honorário pendente no momento.</div>`}
  </div>`;
}

// ────────────────────────────────────────────────────────
// SEÇÃO: LINHA DE CRÉDITO
// ────────────────────────────────────────────────────────
function _htmlLinhaCredito(saldo, disp, teto, juros, rep) {
  return `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">🏦 Linha de Crédito</div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
      Juros de <b>2,5%/mês</b> sobre saldo. Teto: <b>Rep × 500</b>${rep >= 40 ? ` = ${_fmtR(teto)}` : ' (reputação mínima 40)'}.
    </div>
    ${saldo > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.25rem">
        <span style="color:var(--txt3)">Saldo devedor</span>
        <span style="font-weight:700;color:var(--verm2)">${_fmtR(saldo)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
        <span style="color:var(--txt3)">Juros próximo mês</span>
        <span style="color:var(--amber)">${_fmtR(juros)}</span>
      </div>
      <div style="display:flex;gap:.5rem">
        ${disp > 0 ? `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window.abrirModalLinhaCredito(${disp})">+ Sacar mais</button>` : ''}
        <button class="btn btn-prim btn-sm" style="flex:1" onclick="window.pagarLinhaCredito()">Pagar tudo</button>
      </div>`
    : rep >= 40 ? `
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
        <span style="color:var(--txt3)">Disponível</span>
        <span style="font-weight:600;color:var(--verde2)">${_fmtR(teto)}</span>
      </div>
      <button class="btn btn-prim btn-block" onclick="window.abrirModalLinhaCredito(${teto})">🏦 Contratar Linha de Crédito</button>`
    : `<div style="font-size:.72rem;color:var(--txt4);text-align:center;padding:.5rem 0">Reputação mínima 40 necessária (atual: ${rep}).</div>`}
  </div>`;
}

// ════════════════════════════════════════════════════════
// SÓCIO INVESTIDOR
// ════════════════════════════════════════════════════════
window._contratarInvestidor = async function() {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'contratarSocioInvestidor');
    const r  = await fn({ nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 8000);
    setTimeout(() => window.navTo?.('financeiro', null), 600);
  } catch (e) {
    toast(e.message || 'Erro ao contratar investidor.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// ANTECIPAÇÃO
// ════════════════════════════════════════════════════════
window.solicitarAntecipacaoHonorarios = async function() {
  const j   = window.JOGADOR;
  const rep = j?.reputacao || 0;
  if (rep < 20) { toast('Reputação mínima 20 para vender precatórios.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'anteciparHonorarios');
    const r  = await fn({ nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 6000);
    setTimeout(() => window.navTo?.('financeiro', null), 600);
  } catch (e) {
    toast(e.message || 'Erro ao vender precatórios.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// LINHA DE CRÉDITO
// ════════════════════════════════════════════════════════
window.abrirModalLinhaCredito = function(disponivel) {
  const j         = window.JOGADOR;
  const saldoAtual = j?.linha_credito?.saldo || 0;

  abrirModal('🏦 Linha de Crédito', `
    <div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Juros de 2,5% ao mês sobre o saldo devedor, cobrados a cada avanço de mês.
      ${saldoAtual > 0 ? `<br>Saldo devedor atual: <b>R$ ${saldoAtual.toLocaleString('pt-BR')}</b>.` : ''}
    </div>
    <div style="margin-bottom:.6rem">
      <label style="font-size:.74rem;color:var(--txt3)">Valor a sacar (máx. ${_fmtR(disponivel)})</label>
      <input id="lc-valor" type="number" min="500" max="${disponivel}" step="500"
        value="${Math.min(5000, disponivel)}"
        style="width:100%;margin-top:.3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem;box-sizing:border-box">
    </div>
    <div style="font-size:.68rem;color:var(--txt4);margin-bottom:1rem" id="lc-preview">Juros estimados no 1º mês: —</div>
    <button class="btn btn-prim btn-block" onclick="window._confirmarLinhaCredito()">Contratar</button>
  `);

  const inputEl = document.getElementById('lc-valor');
  const prevEl  = document.getElementById('lc-preview');
  if (inputEl && prevEl) {
    inputEl.addEventListener('input', () => {
      const v = parseInt(inputEl.value) || 0;
      prevEl.textContent = `Juros estimados no 1º mês: ${_fmtR(Math.ceil((v + saldoAtual) * 0.025))}`;
    });
    inputEl.dispatchEvent(new Event('input'));
  }
};

window._confirmarLinhaCredito = async function() {
  const valor = parseInt(document.getElementById('lc-valor')?.value) || 0;
  if (valor < 500) { toast('Valor mínimo: R$ 500.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'contratarLinhaCredito');
    const r  = await fn({ valor, nonce: _gerarNonce() });
    fecharModal();
    toast(`✅ ${_fmtR(r.data.valor)} creditados via linha de crédito!`, 'ok', 5000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao contratar linha de crédito.', 'ko');
  }
};

window.pagarLinhaCredito = async function() {
  const j  = window.JOGADOR;
  const lc = j?.linha_credito;
  if (!lc?.saldo) { toast('Sem linha de crédito ativa.', 'ko'); return; }

  const saldo  = lc.saldo;
  const pagar  = Math.min(saldo, j.dinheiro || 0);
  if (pagar <= 0) { toast('Saldo insuficiente para pagar a linha.', 'ko'); return; }

  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'pagarLinhaCredito');
    const r  = await fn({ valor: pagar, nonce: _gerarNonce() });
    toast(r.data.saldoRestante > 0
      ? `✅ ${_fmtR(r.data.pago)} pagos. Restante: ${_fmtR(r.data.saldoRestante)}.`
      : '✅ Linha de crédito quitada!', 'ok', 4000);
    setTimeout(() => window.navTo?.('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao pagar.', 'ko');
  }
};
