/**
 * FINANÇAS DO ESCRITÓRIO — Advocatus Online
 * Caixa separado do dinheiro pessoal. Aporte de capital, distribuição de lucros,
 * pagamento de salários com queda de produtividade e demissão por inadimplência.
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

export const MESES_TOLERANCIA_SALARIO = 3;
export const PERDA_PRODUTIVIDADE_SEM_SALARIO = 0.25; // -25% de produtividade por mês sem pagar

// ════════════════════════════════════════════════════════
// RENDERIZAR BLOCO DE FINANÇAS (usado no painel Escritório)
// ════════════════════════════════════════════════════════
export function renderBlocoFinancas(esc, j) {
  const caixa = esc.caixa || 0;
  const corCaixa = caixa >= 0 ? 'var(--verde2)' : 'var(--verm2)';
  const socios = esc.socios || [{ uid: esc.dono_uid || esc.fundador_uid, participacao_pct: 100 }];
  const minhaUid = j.uid || window.JOGADOR_UID;
  const meuSocio = socios.find(s => s.uid === minhaUid);
  const minhaCota = meuSocio ? meuSocio.participacao_pct : 100;

  return `
    <div class="secao-header" style="margin-top:1rem">
      <div class="secao-titulo">💰 Caixa do Escritório</div>
    </div>
    <div class="card" style="background:var(--surface2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem">
        <div>
          <div style="font-size:.65rem;color:var(--txt4);text-transform:uppercase">Saldo em caixa</div>
          <div style="font-size:1.3rem;font-weight:700;color:${corCaixa}">R$ ${caixa.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.65rem;color:var(--txt4)">Sua participação</div>
          <div style="font-size:1rem;font-weight:700;color:var(--navy)">${minhaCota}%</div>
        </div>
      </div>
      ${(esc.meses_sem_pagar_salario||0) > 0 ? `
        <div style="background:var(--verm-bg);border:1px solid var(--verm3);border-radius:var(--r);padding:.5rem .7rem;margin-bottom:.7rem;font-size:.72rem;color:var(--verm2)">
          ⚠️ ${esc.meses_sem_pagar_salario} mês(es) sem pagar salário. Produtividade reduzida em ${Math.round(esc.meses_sem_pagar_salario*PERDA_PRODUTIVIDADE_SEM_SALARIO*100)}%.
          ${esc.meses_sem_pagar_salario >= MESES_TOLERANCIA_SALARIO ? ' Funcionários podem pedir demissão!' : ''}
        </div>` : ''}
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-sm btn-prim" style="flex:1" onclick="window.abrirModalAportarCapital('${esc.id}')">
          💵 Aportar Capital
        </button>
        <button class="btn btn-sm btn-sec" style="flex:1" onclick="window.abrirModalDistribuirLucros('${esc.id}')">
          📤 Distribuir Lucros
        </button>
      </div>
    </div>

    <!-- Sócios e cotas -->
    ${socios.length > 1 ? `
      <div style="margin-top:.6rem">
        <div style="font-size:.68rem;color:var(--txt3);margin-bottom:.3rem">Sociedade:</div>
        ${socios.map(s =>
          `<div style="display:flex;justify-content:space-between;font-size:.7rem;padding:.2rem 0">
            <span style="color:var(--txt2)">${s.uid === minhaUid ? 'Você' : s.uid.slice(0,8)}</span>
            <span style="font-weight:600;color:var(--navy)">${s.participacao_pct}%</span>
          </div>`
        ).join('')}
      </div>` : ''}
  `;
}

// ════════════════════════════════════════════════════════
// APORTAR CAPITAL (via Cloud Function)
// ════════════════════════════════════════════════════════
window.abrirModalAportarCapital = function(escId) {
  abrirModal('💵 Aportar Capital',
    `<div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Transfira dinheiro do seu bolso pessoal para o caixa do escritório.
      Útil para cobrir salários ou despesas em meses difíceis.
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
  const socios = esc.socios || [{ uid: esc.dono_uid||esc.fundador_uid, participacao_pct:100 }];

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
          const label = socio.uid === (window.JOGADOR?.uid||window.JOGADOR_UID) ? 'Você' : socio.uid.slice(0,8);
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

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL — pagar salários do caixa, queda de
// produtividade, demissão por inadimplência (chamado pelo avancar_mes.js)
// ════════════════════════════════════════════════════════
export async function processarFinancasEscritorioMensal(j) {
  const escId = j.escritorio_proprio_id;
  if (!escId) return {};

  const escSnap = await getDoc(doc(db,'escritorios',escId));
  if (!escSnap.exists()) return {};
  const esc = escSnap.data();
  let caixa = esc.caixa || 0;

  // Buscar funcionários e calcular folha
  const fSnap = await getDocs(collection(db,'escritorios',escId,'funcionarios'));
  const CARGO_SAL = { est:1700, ass:2500, jnr:3500, pln:5500, snr:9000 };
  const TIER_CUSTO_FIXO = { 1:3500, 2:8000, 3:18000, 4:35000, 5:70000 };
  const custoFixo = TIER_CUSTO_FIXO[esc.tier||1] || 3500;

  let folha = custoFixo;
  fSnap.docs.forEach(d => { folha += CARGO_SAL[d.data().cargo_id] || 0; });

  const escUpdates = {};
  let mesesSemPagar = esc.meses_sem_pagar_salario || 0;
  let demissoesPorFalta = [];

  if (caixa >= folha) {
    // Caixa suficiente — paga normalmente
    caixa -= folha;
    escUpdates.meses_sem_pagar_salario = 0;
    // Restaurar produtividade se estava reduzida
    for (const fDoc of fSnap.docs) {
      if (fDoc.data().produtividade_penalidade) {
        await updateDoc(doc(db,'escritorios',escId,'funcionarios',fDoc.id), { produtividade_penalidade: 0 });
      }
    }
  } else {
    // Caixa insuficiente — não paga, penaliza produtividade
    mesesSemPagar += 1;
    escUpdates.meses_sem_pagar_salario = mesesSemPagar;

    for (const fDoc of fSnap.docs) {
      const penalidadeAtual = fDoc.data().produtividade_penalidade || 0;
      const novaPenalidade = Math.min(0.9, penalidadeAtual + PERDA_PRODUTIVIDADE_SEM_SALARIO);
      await updateDoc(doc(db,'escritorios',escId,'funcionarios',fDoc.id), { produtividade_penalidade: novaPenalidade });

      // Após 3 meses sem pagar, funcionário pede demissão
      if (mesesSemPagar >= MESES_TOLERANCIA_SALARIO) {
        await updateDoc(doc(db,'escritorios',escId,'funcionarios',fDoc.id), { ativo: false, demitido_motivo: 'salario_atrasado' });
        demissoesPorFalta.push(fDoc.data().nome);
      }
    }
  }

  escUpdates.caixa = caixa;
  await updateDoc(doc(db,'escritorios',escId), escUpdates);

  return {
    folha_paga: caixa >= 0 && mesesSemPagar === 0,
    caixa_final: caixa,
    meses_sem_pagar: mesesSemPagar,
    demissoes: demissoesPorFalta,
  };
}

window._processarFinancasEscritorioMensal = processarFinancasEscritorioMensal;
