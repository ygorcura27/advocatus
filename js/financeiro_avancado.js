/**
 * FINANCEIRO AVANÇADO — Advocatus Online (GDD Seção 31-33)
 * Antecipação de honorários, linha de crédito.
 * Renderiza na seção "Finanças" do perfil ou painel de escritório.
 */

import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { collection, getDocs, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

function _fmtR(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

// ════════════════════════════════════════════════════════
// RENDERIZAR PAINEL FINANCEIRO AVANÇADO
// Chamado por window.renderFinanceiroAvancado(j, el)
// ════════════════════════════════════════════════════════
window.renderFinanceiroAvancado = async function(j, el) {
  if (!el) return;

  const rep    = j.reputacao || 0;
  const lc     = j.linha_credito;
  const escId  = j.escritorio_proprio_id;
  const uid    = j.uid || window.JOGADOR_UID;

  // Buscar hon_pendente total
  let totalHonPendente = 0;
  try {
    const procSnap = escId
      ? await getDocs(query(collection(db, 'processos'),
          where('pool_escritorio_id', '==', escId),
          where('status', '==', 'aguardando_decisao_sentenca')))
      : await getDocs(query(collection(db, 'processos'),
          where('advogado_uid', '==', uid),
          where('status', '==', 'aguardando_decisao_sentenca')));
    for (const d of procSnap.docs) totalHonPendente += (d.data().hon_pendente || 0);
  } catch(e) { /* silencioso */ }

  const maxAntecipavel = Math.floor(totalHonPendente * 0.60);
  const descPct  = rep >= 60 ? 15 : rep >= 40 ? 20 : 25;
  const valorLiq = Math.floor(maxAntecipavel * (1 - descPct / 100));

  // Linha de crédito
  const tetoLC    = rep >= 40 ? rep * 500 : 0;
  const saldoLC   = lc?.saldo || 0;
  const dispLC    = Math.max(0, tetoLC - saldoLC);
  const podeLC    = rep >= 40;
  const jurosMes  = saldoLC > 0 ? Math.ceil(saldoLC * 0.025) : 0;

  el.innerHTML = `
    <div class="secao-header" style="margin-top:0">
      <div class="secao-titulo">💳 Financeiro Avançado</div>
    </div>

    <!-- Antecipação de Honorários -->
    <div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--navy);margin-bottom:.4rem">⏩ Antecipação de Honorários</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
        Receba até <b>60%</b> dos honorários pendentes agora, com desconto de <b>${descPct}%</b>
        ${rep >= 60 ? '(rep ≥ 60 — tarifa mínima)' : rep >= 40 ? '(rep 40-59)' : '(rep < 40 — tarifa máxima)'}.
      </div>
      ${totalHonPendente > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.3rem">
          <span style="color:var(--txt3)">Hon. pendente total</span>
          <span style="font-weight:600">${_fmtR(totalHonPendente)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
          <span style="color:var(--txt3)">Você recebe (líquido)</span>
          <span style="font-weight:700;color:var(--verde2)">${_fmtR(valorLiq)}</span>
        </div>
        <button class="btn btn-prim btn-block" onclick="window.solicitarAntecipacaoHonorarios()">
          ⏩ Antecipar ${_fmtR(valorLiq)}
        </button>` : `
        <div style="font-size:.72rem;color:var(--txt4);text-align:center;padding:.5rem 0">
          Nenhum honorário pendente no momento.
        </div>`}
    </div>

    <!-- Linha de Crédito -->
    <div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--navy);margin-bottom:.4rem">🏦 Linha de Crédito</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
        Juros de <b>2,5%/mês</b> sobre saldo. Teto: <b>Rep × 500</b>
        ${podeLC ? ` = ${_fmtR(tetoLC)}` : ' (reputação mínima 40)'}.
      </div>
      ${saldoLC > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.25rem">
          <span style="color:var(--txt3)">Saldo devedor</span>
          <span style="font-weight:700;color:var(--verm2)">${_fmtR(saldoLC)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
          <span style="color:var(--txt3)">Juros próximo mês</span>
          <span style="color:var(--amber)">${_fmtR(jurosMes)}</span>
        </div>
        <div style="display:flex;gap:.5rem">
          ${dispLC > 0
            ? `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window.abrirModalLinhaCredito(${dispLC})">+ Sacar mais</button>`
            : ''}
          <button class="btn btn-prim btn-sm" style="flex:1" onclick="window.pagarLinhaCredito()">Pagar tudo</button>
        </div>` :
       podeLC ? `
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.5rem">
          <span style="color:var(--txt3)">Disponível</span>
          <span style="font-weight:600;color:var(--verde2)">${_fmtR(tetoLC)}</span>
        </div>
        <button class="btn btn-prim btn-block" onclick="window.abrirModalLinhaCredito(${tetoLC})">
          🏦 Contratar Linha de Crédito
        </button>` : `
        <div style="font-size:.72rem;color:var(--txt4);text-align:center;padding:.5rem 0">
          Reputação mínima 40 necessária (atual: ${rep}).
        </div>`}
    </div>`;
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
    const r  = await fn({});
    toast(`✅ ${r.data.msg}`, 'ok', 6000);
    setTimeout(() => window.navTo && window.navTo('financeiro', null), 600);
  } catch (e) {
    toast(e.message || 'Erro ao antecipar honorários.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// LINHA DE CRÉDITO
// ════════════════════════════════════════════════════════
window.abrirModalLinhaCredito = function(disponivel) {
  const j   = window.JOGADOR;
  const lc  = j?.linha_credito;
  const saldoAtual = lc?.saldo || 0;

  abrirModal('🏦 Linha de Crédito', `
    <div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Juros de 2,5% ao mês sobre o saldo devedor, cobrados a cada avanço de mês.
      ${saldoAtual > 0 ? `<br>Saldo devedor atual: <b>R$ ${saldoAtual.toLocaleString('pt-BR')}</b>.` : ''}
    </div>
    <div style="margin-bottom:.6rem">
      <label style="font-size:.74rem;color:var(--txt3)">Valor a sacar (máx. R$ ${disponivel.toLocaleString('pt-BR')})</label>
      <input id="lc-valor" type="number" min="500" max="${disponivel}" step="500"
        value="${Math.min(5000, disponivel)}"
        style="width:100%;margin-top:.3rem;padding:.5rem;border:1px solid var(--borda-cor,#ccc);border-radius:6px;font-size:.85rem">
    </div>
    <div style="font-size:.68rem;color:var(--txt4);margin-bottom:1rem" id="lc-preview">
      Juros estimados no 1º mês: —
    </div>
    <button class="btn btn-prim btn-block" onclick="window._confirmarLinhaCredito()">Contratar</button>
  `);

  const inputEl = document.getElementById('lc-valor');
  const prevEl  = document.getElementById('lc-preview');
  if (inputEl && prevEl) {
    inputEl.addEventListener('input', () => {
      const v = parseInt(inputEl.value) || 0;
      const j2 = Math.ceil((v + saldoAtual) * 0.025);
      prevEl.textContent = `Juros estimados no 1º mês: R$ ${j2.toLocaleString('pt-BR')}`;
    });
    inputEl.dispatchEvent(new Event('input'));
  }
};

window._confirmarLinhaCredito = async function() {
  const inputEl = document.getElementById('lc-valor');
  const valor   = parseInt(inputEl?.value) || 0;
  if (valor < 500) { toast('Valor mínimo: R$ 500.', 'ko'); return; }

  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'contratarLinhaCredito');
    const r  = await fn({ valor });
    fecharModal();
    toast(`✅ R$ ${r.data.valor.toLocaleString('pt-BR')} creditados via linha de crédito!`, 'ok', 5000);
    setTimeout(() => window.navTo && window.navTo('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao contratar linha de crédito.', 'ko');
  }
};

window.pagarLinhaCredito = async function() {
  const j  = window.JOGADOR;
  const lc = j?.linha_credito;
  if (!lc?.saldo) { toast('Sem linha de crédito ativa.', 'ko'); return; }

  const saldo = lc.saldo;
  if ((j.dinheiro || 0) < saldo) {
    const pagar = Math.min(saldo, j.dinheiro || 0);
    if (pagar <= 0) { toast('Saldo insuficiente para pagar a linha.', 'ko'); return; }
    try {
      const fn = httpsCallable(window.FB_FUNCTIONS, 'pagarLinhaCredito');
      const r  = await fn({ valor: pagar });
      toast(`✅ R$ ${r.data.pago.toLocaleString('pt-BR')} pagos. Restante: R$ ${r.data.saldoRestante.toLocaleString('pt-BR')}.`, 'ok', 5000);
      setTimeout(() => window.navTo && window.navTo('financeiro', null), 500);
    } catch (e) {
      toast(e.message || 'Erro ao pagar.', 'ko');
    }
    return;
  }

  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'pagarLinhaCredito');
    await fn({ valor: saldo });
    toast('✅ Linha de crédito quitada!', 'ok', 4000);
    setTimeout(() => window.navTo && window.navTo('financeiro', null), 500);
  } catch (e) {
    toast(e.message || 'Erro ao pagar.', 'ko');
  }
};
