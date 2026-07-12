/**
 * FINANCEIRO AVANÇADO — Advocatus Online (GDD Seção 31-33)
 * Antecipação de honorários, linha de crédito, sócio investidor, investimentos.
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

  el.innerHTML = `
    <style>
      .inv-item{display:flex;align-items:center;gap:.4rem;padding:.35rem 0;border-bottom:1px solid var(--borda-cor,#eee)}
      .inv-item:last-child{border-bottom:none}
      .inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin:.5rem 0}
      .inv-tipo-card{border:1px solid var(--borda-cor,#ddd);border-radius:8px;padding:.55rem .4rem;text-align:center;cursor:pointer;transition:.15s}
      .inv-tipo-card:hover{border-color:var(--azul-accent,#4A90E2);background:rgba(74,144,226,.06)}
    </style>

    <div class="secao-header" style="margin-top:0">
      <div class="secao-titulo">💳 Financeiro Avançado</div>
    </div>

    ${_htmlPortfolio(inv)}
    ${_htmlSocioInvestidor(esc, escTier, escId)}
    ${_htmlAntecipacao(totalHonPendente, maxAntecipavel, valorLiq, descPct, rep)}
    ${_htmlLinhaCredito(saldoLC, dispLC, tetoLC, jurosMes, rep)}
  `;
};

// ────────────────────────────────────────────────────────
// SEÇÃO: PORTFÓLIO DE INVESTIMENTOS
// ────────────────────────────────────────────────────────
function _htmlPortfolio(inv) {
  const rf = inv.renda_fixa || [];
  const fd = inv.fundos     || [];
  const im = inv.imovel_renda;
  const fn = inv.firma_npc  || [];

  const totalInvestido = rf.reduce((s,i)=>s+i.valor_aplicado,0)
    + fd.reduce((s,i)=>s+i.valor_aplicado,0)
    + (im?.valor_aplicado||0)
    + fn.reduce((s,i)=>s+i.valor_investido,0);

  let items = '';

  for (const i of rf) {
    const rend = Math.floor(i.valor_aplicado * 0.008);
    items += `<div class="inv-item">
      <div style="flex:1">
        <span style="font-size:.70rem;font-weight:600">📈 Renda Fixa</span>
        <span style="font-size:.63rem;color:var(--txt3);margin-left:.3rem">${i.aplicado_em}</span>
        <div style="font-size:.66rem;color:var(--txt4)">${_fmtR(i.valor_aplicado)} · <span style="color:var(--verde2)">+${_fmtR(rend)}/mês</span></div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="window._resgatarInv('renda_fixa','${i.id}',${i.valor_aplicado})">Resgatar</button>
    </div>`;
  }

  for (const f of fd) {
    const lbl = { conservador:'🛡️ Conservador', moderado:'⚖️ Moderado', arrojado:'🚀 Arrojado' }[f.subtipo] || f.subtipo || '';
    const minR = Math.floor(f.valor_aplicado * (f.min || 0));
    const maxR = Math.floor(f.valor_aplicado * (f.max || 0.008));
    items += `<div class="inv-item">
      <div style="flex:1">
        <span style="font-size:.70rem;font-weight:600">💹 Fundo ${lbl}</span>
        <span style="font-size:.63rem;color:var(--txt3);margin-left:.3rem">${f.aplicado_em}</span>
        <div style="font-size:.66rem;color:var(--txt4)">${_fmtR(f.valor_aplicado)} · ${_fmtR(minR)} a <span style="color:var(--verde2)">${_fmtR(maxR)}/mês</span></div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="window._resgatarInv('fundo','${f.id}',${f.valor_aplicado})">Resgatar</button>
    </div>`;
  }

  if (im) {
    items += `<div class="inv-item">
      <div style="flex:1">
        <span style="font-size:.70rem;font-weight:600">🏠 Imóvel para Renda</span>
        <span style="font-size:.63rem;color:var(--txt3);margin-left:.3rem">${im.aplicado_em}</span>
        <div style="font-size:.66rem;color:var(--txt4)">${_fmtR(im.valor_aplicado)} · <span style="color:var(--verde2)">+${_fmtR(im.aluguel_mensal)}/mês</span></div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="window._resgatarInv('imovel_renda',null,${im.valor_aplicado})">Resgatar</button>
    </div>`;
  }

  for (const p of fn) {
    const minDiv = Math.floor(p.valor_investido * (p.pct_base||0.009) * (1-(p.volatilidade||0.20)));
    const maxDiv = Math.floor(p.valor_investido * (p.pct_base||0.009) * (1+(p.volatilidade||0.20)));
    items += `<div class="inv-item">
      <div style="flex:1">
        <span style="font-size:.70rem;font-weight:600">🏢 ${p.nome}</span>
        <span style="font-size:.63rem;color:var(--txt3);margin-left:.3rem">${p.setor}</span>
        <div style="font-size:.66rem;color:var(--txt4)">${_fmtR(p.valor_investido)} · ${_fmtR(minDiv)} a <span style="color:var(--verde2)">${_fmtR(maxDiv)}/mês</span></div>
      </div>
      <button class="btn btn-ghost btn-xs" onclick="window._resgatarInv('firma_npc','${p.id}',${p.valor_investido})">Resgatar</button>
    </div>`;
  }

  return `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">📊 Portfólio de Investimentos</div>
    ${totalInvestido > 0 ? `
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.3rem">
        <span style="color:var(--txt3)">Total investido</span>
        <span style="font-weight:600">${_fmtR(totalInvestido)}</span>
      </div>` : ''}
    ${items || `<div style="font-size:.72rem;color:var(--txt4);padding:.3rem 0">Nenhum investimento ativo.</div>`}
    <button class="btn btn-prim btn-block" style="margin-top:.6rem" onclick="window._abrirModalInvestir()">＋ Novo Investimento</button>
  </div>`;
}

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
// SEÇÃO: ANTECIPAÇÃO DE HONORÁRIOS
// ────────────────────────────────────────────────────────
function _htmlAntecipacao(total, maxAnt, valorLiq, descPct, rep) {
  return `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.4rem">⏩ Antecipação de Honorários</div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
      Receba até <b>60%</b> dos honorários pendentes agora, com desconto de <b>${descPct}%</b>
      ${rep >= 60 ? '(rep ≥ 60 — tarifa mínima)' : rep >= 40 ? '(rep 40-59)' : '(rep < 40 — tarifa máxima)'}.
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
      <button class="btn btn-prim btn-block" onclick="window.solicitarAntecipacaoHonorarios()">⏩ Antecipar ${_fmtR(valorLiq)}</button>`
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
// MODAL: NOVO INVESTIMENTO
// ════════════════════════════════════════════════════════
window._abrirModalInvestir = function() {
  const inv       = window.JOGADOR?.investimentos || {};
  const investidas = (inv.firma_npc || []).map(p => p.firma_id);
  const firmasDisp = _FIRMAS_NPC.filter(f => !investidas.includes(f.id));
  const temImovel  = !!inv.imovel_renda;

  abrirModal('📊 Novo Investimento', `
    <div style="font-size:.74rem;color:var(--txt3);margin-bottom:.7rem">Escolha o tipo:</div>
    <div class="inv-grid">
      <div class="inv-tipo-card" onclick="window._modalTipoInv('renda_fixa')">
        <div style="font-size:1rem">📈</div>
        <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Renda Fixa</div>
        <div style="font-size:.62rem;color:var(--txt3)">0,8%/mês fixo</div>
        <div style="font-size:.60rem;color:var(--txt4)">mín. R$1.000</div>
      </div>
      <div class="inv-tipo-card" onclick="window._modalTipoInv('fundo')">
        <div style="font-size:1rem">💹</div>
        <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Fundos</div>
        <div style="font-size:.62rem;color:var(--txt3)">0,4–2%/mês variável</div>
        <div style="font-size:.60rem;color:var(--txt4)">mín. R$2.000</div>
      </div>
      ${temImovel
        ? `<div class="inv-tipo-card" style="opacity:.4;pointer-events:none">
            <div style="font-size:1rem">🏠</div>
            <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Imóvel Renda</div>
            <div style="font-size:.62rem;color:var(--txt3)">Já possui um</div>
          </div>`
        : `<div class="inv-tipo-card" onclick="window._modalTipoInv('imovel_renda')">
            <div style="font-size:1rem">🏠</div>
            <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Imóvel Renda</div>
            <div style="font-size:.62rem;color:var(--txt3)">0,4–0,6%/mês fixo</div>
            <div style="font-size:.60rem;color:var(--txt4)">mín. R$50.000</div>
          </div>`}
      ${firmasDisp.length === 0
        ? `<div class="inv-tipo-card" style="opacity:.4;pointer-events:none">
            <div style="font-size:1rem">🏢</div>
            <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Firmas NPC</div>
            <div style="font-size:.62rem;color:var(--txt3)">Todas as posições abertas</div>
          </div>`
        : `<div class="inv-tipo-card" onclick="window._modalTipoInv('firma_npc')">
            <div style="font-size:1rem">🏢</div>
            <div style="font-size:.72rem;font-weight:600;margin:.15rem 0">Firmas NPC</div>
            <div style="font-size:.62rem;color:var(--txt3)">0,7–1,5%/mês · risco</div>
            <div style="font-size:.60rem;color:var(--txt4)">${firmasDisp.length} disponíveis</div>
          </div>`}
    </div>
  `);
};

window._modalTipoInv = function(tipo) {
  const j        = window.JOGADOR || {};
  const dinheiro = j.dinheiro || 0;
  const inv      = j.investimentos || {};
  const investidas = (inv.firma_npc || []).map(p => p.firma_id);
  const firmasDisp = _FIRMAS_NPC.filter(f => !investidas.includes(f.id));

  const _previewInput = (inputId, previewId, fn, onSetup) => {
    setTimeout(() => {
      const elI = document.getElementById(inputId);
      const elP = document.getElementById(previewId);
      if (elI && elP) {
        elI.addEventListener('input', () => { elP.textContent = fn(parseInt(elI.value) || 0); });
        elI.dispatchEvent(new Event('input'));
        onSetup?.();
      }
    }, 50);
  };

  if (tipo === 'renda_fixa') {
    abrirModal('📈 Renda Fixa', `
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:.7rem">Rendimento garantido de <b>0,8%/mês</b> sobre o valor aplicado. Sem risco. Resgatável a qualquer momento (sem penalidade).</div>
      <div style="font-size:.70rem;color:var(--txt3);margin-bottom:.3rem">Saldo disponível: <b>${_fmtR(dinheiro)}</b></div>
      <label style="font-size:.72rem;color:var(--txt3)">Valor a aplicar</label>
      <input id="inv-valor" type="number" min="1000" max="${dinheiro}" step="1000" value="${Math.min(10000, dinheiro)}"
        style="width:100%;margin:.3rem 0 .3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem;box-sizing:border-box">
      <div id="inv-prev" style="font-size:.68rem;color:var(--verde2);min-height:1rem;margin-bottom:.8rem"></div>
      <button class="btn btn-prim btn-block" onclick="window._confirmarInvestimento('renda_fixa')">Aplicar</button>
    `);
    _previewInput('inv-valor', 'inv-prev', v => `+${_fmtR(Math.floor(v * 0.008))}/mês garantido`);
  }

  else if (tipo === 'fundo') {
    const taxas = { conservador:[0.004,0.009], moderado:[0.002,0.014], arrojado:[-0.005,0.020] };
    abrirModal('💹 Fundos de Investimento', `
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:.7rem">Retorno variável. Quanto maior o risco, maior o potencial — e o prejuízo possível.</div>
      <div style="font-size:.70rem;color:var(--txt3);margin-bottom:.4rem">Saldo disponível: <b>${_fmtR(dinheiro)}</b></div>
      <label style="font-size:.72rem;color:var(--txt3)">Tipo de fundo</label>
      <div style="display:flex;gap:.4rem;margin:.3rem 0 .6rem">
        ${[['conservador','🛡️','0,4–0,9%'],['moderado','⚖️','0,2–1,4%'],['arrojado','🚀','-0,5–2%']].map(([t,e,r],i)=>`
          <label style="flex:1;cursor:pointer;display:block">
            <input type="radio" name="fund-tipo" value="${t}" ${i===0?'checked':''} style="display:none">
            <div class="inv-tipo-card" style="padding:.4rem .2rem;font-size:.64rem">
              <div>${e}</div><div style="font-weight:600;font-size:.68rem">${t.charAt(0).toUpperCase()+t.slice(1)}</div><div style="color:var(--txt3)">${r}</div>
            </div>
          </label>`).join('')}
      </div>
      <label style="font-size:.72rem;color:var(--txt3)">Valor a aplicar</label>
      <input id="inv-valor" type="number" min="2000" max="${dinheiro}" step="500" value="${Math.min(10000, dinheiro)}"
        style="width:100%;margin:.3rem 0 .3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem;box-sizing:border-box">
      <div id="inv-prev" style="font-size:.68rem;color:var(--txt3);min-height:1rem;margin-bottom:.8rem"></div>
      <button class="btn btn-prim btn-block" onclick="window._confirmarInvestimento('fundo')">Aplicar</button>
    `);
    _previewInput('inv-valor', 'inv-prev', v => {
      const t = document.querySelector('[name="fund-tipo"]:checked')?.value || 'conservador';
      const [mn, mx] = taxas[t];
      return `Retorno: ${_fmtR(Math.floor(v*mn))} a ${_fmtR(Math.floor(v*mx))}/mês`;
    }, () => {
      document.querySelectorAll('[name="fund-tipo"]').forEach(r =>
        r.addEventListener('change', () => document.getElementById('inv-valor')?.dispatchEvent(new Event('input')))
      );
    });
  }

  else if (tipo === 'imovel_renda') {
    abrirModal('🏠 Imóvel para Renda', `
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:.7rem">Invista em imóvel para aluguel. Retorno fixo de <b>0,4–0,6%/mês</b> determinado na compra.</div>
      <div style="font-size:.70rem;color:var(--txt3);margin-bottom:.3rem">Saldo disponível: <b>${_fmtR(dinheiro)}</b></div>
      <label style="font-size:.72rem;color:var(--txt3)">Valor do imóvel</label>
      <input id="inv-valor" type="number" min="50000" max="${dinheiro}" step="5000" value="${Math.min(150000, dinheiro)}"
        style="width:100%;margin:.3rem 0 .3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem;box-sizing:border-box">
      <div id="inv-prev" style="font-size:.68rem;color:var(--verde2);min-height:1rem;margin-bottom:.8rem"></div>
      <button class="btn btn-prim btn-block" onclick="window._confirmarInvestimento('imovel_renda')">Comprar Imóvel</button>
    `);
    _previewInput('inv-valor', 'inv-prev', v => `Aluguel estimado: ${_fmtR(Math.floor(v*0.004))} a ${_fmtR(Math.floor(v*0.006))}/mês`);
  }

  else if (tipo === 'firma_npc') {
    const primeiraFirma = firmasDisp[0];
    abrirModal('🏢 Participação em Firma', `
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:.5rem">Receba dividendos mensais variáveis de uma firma jurídica NPC.</div>
      <div style="font-size:.70rem;color:var(--txt3);margin-bottom:.5rem">Saldo disponível: <b>${_fmtR(dinheiro)}</b></div>
      ${firmasDisp.map((f,i) => `
        <label style="display:flex;align-items:flex-start;gap:.4rem;cursor:pointer;margin-bottom:.4rem;padding:.35rem;border:1px solid var(--borda-cor,#ddd);border-radius:6px">
          <input type="radio" name="firma-id" value="${f.id}" ${i===0?'checked':''} style="margin-top:.15rem;flex-shrink:0">
          <div>
            <div style="font-size:.72rem;font-weight:600">${f.nome} <span style="font-weight:400;color:var(--txt3)">— ${f.setor}</span></div>
            <div style="font-size:.64rem;color:var(--txt4)">${f.desc}</div>
            <div style="font-size:.64rem;color:var(--txt3)">Base ${(f.pct_base*100).toFixed(1)}%/mês · volatilidade ${(f.vol*100).toFixed(0)}% · mín. ${_fmtR(f.min_inv)}</div>
          </div>
        </label>`).join('')}
      <label style="font-size:.72rem;color:var(--txt3)">Valor a investir</label>
      <input id="inv-valor" type="number" min="${primeiraFirma?.min_inv||20000}" max="${dinheiro}" step="5000"
        value="${Math.min(primeiraFirma?.min_inv||20000, dinheiro)}"
        style="width:100%;margin:.3rem 0 .3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem;box-sizing:border-box">
      <div id="inv-prev" style="font-size:.68rem;color:var(--txt3);min-height:1rem;margin-bottom:.8rem"></div>
      <button class="btn btn-prim btn-block" onclick="window._confirmarInvestimento('firma_npc')">Investir</button>
    `);
    _previewInput('inv-valor', 'inv-prev', v => {
      const fId = document.querySelector('[name="firma-id"]:checked')?.value;
      const f   = _FIRMAS_NPC.find(x => x.id === fId) || primeiraFirma;
      if (!f || v < f.min_inv) return `Mínimo ${_fmtR(f?.min_inv || 0)}`;
      const mnDiv = Math.floor(v * f.pct_base * (1 - f.vol));
      const mxDiv = Math.floor(v * f.pct_base * (1 + f.vol));
      return `Dividendos estimados: ${_fmtR(mnDiv)} a ${_fmtR(mxDiv)}/mês`;
    }, () => {
      document.querySelectorAll('[name="firma-id"]').forEach(r =>
        r.addEventListener('change', () => document.getElementById('inv-valor')?.dispatchEvent(new Event('input')))
      );
    });
  }
};

window._confirmarInvestimento = async function(tipo) {
  const valor    = parseInt(document.getElementById('inv-valor')?.value) || 0;
  const subtipo  = document.querySelector('[name="fund-tipo"]:checked')?.value;
  const firma_id = document.querySelector('[name="firma-id"]:checked')?.value;
  if (valor <= 0) { toast('Valor inválido.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'aplicarInvestimento');
    const r  = await fn({ tipo, valor, subtipo, firma_id, nonce: _gerarNonce() });
    fecharModal();
    toast(`✅ ${r.data.msg}`, 'ok', 5000);
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
  if (rep < 20) { toast('Reputação mínima 20 para antecipação.', 'ko'); return; }
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'anteciparHonorarios');
    const r  = await fn({ nonce: _gerarNonce() });
    toast(`✅ ${r.data.msg}`, 'ok', 6000);
    setTimeout(() => window.navTo?.('financeiro', null), 600);
  } catch (e) {
    toast(e.message || 'Erro ao antecipar honorários.', 'ko');
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
