/**
 * FINANÇAS DO ESCRITÓRIO — Advocatus Online
 * Caixa separado do dinheiro pessoal. Aporte de capital, distribuição de lucros,
 * upgrade de tier. Não há folha de pagamento mensal: a equipe não consome o caixa.
 *
 * Aportar capital e distribuir lucros passam por Cloud Functions para suportar
 * sociedades com outros jogadores reais (regras do Firestore não permitem um
 * jogador atualizar o saldo de outro diretamente).
 */

import { collection, doc, getDoc, getDocs, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';
import './upgrade_escritorio.js';

export const MESES_TOLERANCIA_SALARIO = 3;
export const PERDA_PRODUTIVIDADE_SEM_SALARIO = 0.25; // -25% de produtividade por mês sem pagar

// ════════════════════════════════════════════════════════
// NORMALIZAR SÓCIOS — lida com schemas antigos e novos
// Formatos possíveis no banco:
//  - socios: [{uid, participacao_pct}]   (formato correto/novo)
//  - socios: ['uid1', 'uid2']            (formato antigo, array de strings)
//  - sem campo socios, mas com dono_uid ou fundador_uid
// ════════════════════════════════════════════════════════
function _normalizarSocios(esc) {
  const donoFallback = esc.dono_uid || esc.fundador_uid || window.JOGADOR?.uid || window.JOGADOR_UID;

  if (Array.isArray(esc.socios) && esc.socios.length > 0) {
    // Verifica se já são objetos válidos com uid e participacao_pct
    const primeiroValido = esc.socios[0] && typeof esc.socios[0] === 'object' && esc.socios[0].uid;
    if (primeiroValido) {
      // Filtra qualquer entrada malformada e garante participacao_pct numérico
      return esc.socios
        .filter(s => s && typeof s === 'object' && s.uid)
        .map(s => ({ uid: s.uid, participacao_pct: s.participacao_pct || 0 }));
    }
    // Formato antigo: array de strings (uids). Dono fica com 100%, demais 0%
    // (não deveria ocorrer em escritórios criados após esta correção)
    return esc.socios.map((uidStr, i) => ({
      uid: typeof uidStr === 'string' ? uidStr : donoFallback,
      participacao_pct: i === 0 ? 100 : 0,
    }));
  }

  // Sem array de sócios — fallback: 100% pro dono
  return [{ uid: donoFallback, participacao_pct: 100 }];
}

// ════════════════════════════════════════════════════════
// RENDERIZAR BLOCO DE FINANÇAS (usado no painel Escritório)
// Caixa/participação/aportar/distribuir já aparecem nos KPIs e nas
// Ações Rápidas do novo dashboard — aqui ficam só alertas operacionais
// o progresso de upgrade de tier.
// ════════════════════════════════════════════════════════
export function renderBlocoFinancas(esc, j) {
  return renderBlocoUpgradeTier(esc, j);
}

// ════════════════════════════════════════════════════════
// UPGRADE DE TIER — exibe progresso das 3 travas e botão de ação
// ════════════════════════════════════════════════════════
function renderBlocoUpgradeTier(esc, j) {
  const tierAtual = esc.tier || 1;
  if (tierAtual >= 5) return '';

  const check = window.verificarUpgradeEscritorio(esc, j);
  const caixa = esc.caixa || 0;
  const repEsc = esc.reputacao || 0;
  const anos = j.anos_carreira || 0;

  const linha = (label, atual, necessario, ok) => `
    <div style="display:flex;justify-content:space-between;font-size:.72rem;padding:.15rem 0">
      <span style="color:var(--txt3)">${label}</span>
      <span style="color:${ok?'var(--verde2)':'var(--txt3)'}">${atual}/${necessario} ${ok?'✅':''}</span>
    </div>`;

  return `
    <div class="secao-header" style="margin-top:1rem">
      <div class="secao-titulo">Upgrade — Tier ${tierAtual} → ${tierAtual+1}</div>
    </div>
    <div class="card" style="background:var(--surface2)">
      ${linha('Capital', `R$ ${caixa.toLocaleString('pt-BR')}`, `R$ ${check.capitalNecessario.toLocaleString('pt-BR')}`, caixa>=check.capitalNecessario)}
      ${linha('Reputação do escritório', repEsc, check.reputacaoMinima, repEsc>=check.reputacaoMinima)}
      ${linha('Carreira (anos desde Júnior)', anos, check.anosMinimos, anos>=check.anosMinimos)}
      <div style="display:flex;justify-content:space-between;font-size:.72rem;padding:.15rem 0">
        <span style="color:var(--txt3)">Cargo mínimo</span>
        <span style="color:${(window.CARGO_IDX?.[j.cargo_id]??0)>=(window.CARGO_IDX?.[check.cargoMinimo]??0)?'var(--verde2)':'var(--txt3)'}">${check.cargoMinimo.toUpperCase()}+</span>
      </div>
      <button class="btn btn-prim btn-block" style="margin-top:.7rem" ${check.liberado?'':'disabled'} onclick="window.confirmarUpgradeEscritorio('${esc.id}')">
        ${check.liberado ? '🎉 Fazer Upgrade' : '🔒 Requisitos pendentes'}
      </button>
    </div>
  `;
}
window.renderBlocoUpgradeTier = renderBlocoUpgradeTier;

window.confirmarUpgradeEscritorio = async function(escId) {
  try {
    const j = window.JOGADOR;
    const result = await window.fazerUpgradeEscritorio(escId, j);
    toast(`🎉 Escritório promovido para Tier ${result.novoTier}!`, 'ok', 5000);
    setTimeout(()=>window.navTo&&window.navTo('escritorio',null), 700);
  } catch (err) {
    toast('Erro: ' + (err.message||'falha no upgrade'), 'ko', 5000);
    console.error('[UPGRADE ESCRITÓRIO]', err);
  }
};

// Expor globalmente para ser usado pelo ui-main.js sem import direto
window.renderBlocoFinancas = renderBlocoFinancas;

// ════════════════════════════════════════════════════════
// APORTAR CAPITAL (via Cloud Function)
// ════════════════════════════════════════════════════════
window.abrirModalAportarCapital = function(escId) {
  abrirModal('💵 Aportar Capital',
    `<div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Transfira dinheiro do seu bolso pessoal para o caixa do escritório.
      Útil para cobrir despesas em meses difíceis.
    </div>
    <div class="campo">
      <label>Valor a aportar</label>
      <input type="number" id="aporte-valor" placeholder="Ex: 5000" min="1" step="100">
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window.confirmarAporte('${escId}')">Aportar →</button>
    </div>`
  );
};

window.confirmarAporte = async function(escId) {
  const valor = parseFloat(document.getElementById('aporte-valor')?.value || 0);
  if (!valor || valor <= 0) { toast('Digite um valor válido.', 'ko'); return; }

  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'aportarCapital');
    const result = await fn({ escritorio_id: escId, valor });
    fecharModal();
    toast(`💵 ${result.data.msg}`, 'ok', 4000);
    setTimeout(()=>window.navTo&&window.navTo('escritorio',null), 600);
  } catch (err) {
    toast('Erro: ' + (err.message||'falha ao aportar'), 'ko', 5000);
    console.error('[APORTAR CAPITAL]', err);
  }
};

// ════════════════════════════════════════════════════════
// DISTRIBUIR LUCROS (via Cloud Function)
// ════════════════════════════════════════════════════════
window.abrirModalDistribuirLucros = async function(escId) {
  const escSnap = await getDoc(doc(db,'escritorios',escId));
  if (!escSnap.exists()) return;
  const esc = escSnap.data();
  const caixa = esc.caixa || 0;
  const socios = _normalizarSocios(esc);

  if (caixa <= 0) { toast('Caixa do escritório está zerado ou negativo.', 'ko'); return; }

  abrirModal('📤 Distribuir Lucros',
    `<div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Caixa disponível: <b style="color:var(--verde2)">R$ ${caixa.toLocaleString('pt-BR')}</b><br>
      Cada sócio recebe o valor digitado multiplicado pela sua % de participação.
    </div>
    <div class="campo">
      <label>Valor base a distribuir</label>
      <input type="number" id="distrib-valor" placeholder="Ex: 10000" min="1" step="100" max="${caixa}">
    </div>
    <div id="distrib-preview" style="background:var(--surface2);border-radius:var(--r);padding:.6rem;margin:.6rem 0;font-size:.72rem;color:var(--txt3)">
      Digite um valor para ver a distribuição entre os sócios.
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window.confirmarDistribuicao('${escId}')">Distribuir →</button>
    </div>`
  );

  const sociosJson = JSON.stringify(socios);
  setTimeout(() => {
    const input = document.getElementById('distrib-valor');
    const preview = document.getElementById('distrib-preview');
    if (input) {
      input.addEventListener('input', () => {
        const v = parseFloat(input.value || 0);
        const s = JSON.parse(sociosJson);
        preview.innerHTML = s.map(socio => {
          const parte = Math.floor(v * socio.participacao_pct / 100);
          const socioUid = socio.uid || '—';
          const label = socioUid === (window.JOGADOR?.uid||window.JOGADOR_UID) ? 'Você' : socioUid.slice(0, 8);
          return `<div style="display:flex;justify-content:space-between;padding:.1rem 0">
            <span>${label} (${socio.participacao_pct}%)</span><span style="font-weight:600;color:var(--verde2)">R$ ${parte.toLocaleString('pt-BR')}</span>
          </div>`;
        }).join('');
      });
    }
  }, 100);
};

window.confirmarDistribuicao = async function(escId) {
  const valor = parseFloat(document.getElementById('distrib-valor')?.value || 0);
  if (!valor || valor <= 0) { toast('Digite um valor válido.', 'ko'); return; }

  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'distribuirLucros');
    const result = await fn({ escritorio_id: escId, valor });
    fecharModal();
    toast(`📤 ${result.data.msg}`, 'ok', 5000);
    setTimeout(()=>window.navTo&&window.navTo('escritorio',null), 700);
  } catch (err) {
    toast('Erro: ' + (err.message||'falha ao distribuir'), 'ko', 5000);
    console.error('[DISTRIBUIR LUCROS]', err);
  }
};
