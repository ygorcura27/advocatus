/**
 * AVANÇAR MÊS — Frontend
 * Botão de avanço + lógica de energia + resumo mensal.
 */

import { doc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

const ENERGIA_TOTAL = 100;
const ENERGIA_MIN   = 20;   // abaixo disso, botão de avançar aparece em destaque

// ════════════════════════════════════════════════════════
// RENDERIZAR BOTÃO DE ENERGIA (injetado na sidebar direita)
// ════════════════════════════════════════════════════════
export function renderBlocoEnergia(j) {
  const el = document.getElementById('bloco-energia');
  if (!el) return;

  const usado       = j.energia_usada_mes || 0;
  const disponivel  = Math.max(0, ENERGIA_TOTAL - usado);
  const pct         = Math.round((disponivel / ENERGIA_TOTAL) * 100);
  const podeAvancar = disponivel <= ENERGIA_MIN;
  const corBarra    = disponivel > 50 ? '#5A9A3A' : disponivel > 20 ? '#B8922A' : '#A83A3A';

  // ── Verificar bloqueio de férias de janeiro ──
  const mesAtual        = j.mes_pessoal !== undefined ? j.mes_pessoal : -1;
  const bloqueadoAte    = j.janeiro_bloqueado_ate ? new Date(j.janeiro_bloqueado_ate) : null;
  const emFerias        = mesAtual === 0 && bloqueadoAte && Date.now() < bloqueadoAte.getTime();

  if (emFerias) {
    // Mostrar countdown de férias
    el.innerHTML = _renderBlocoFerias(disponivel, pct, corBarra, bloqueadoAte);
    _iniciarCountdownFerias(bloqueadoAte, el, j);
    return;
  }

  el.innerHTML = `
    <div class="bloco-titulo">
      ⚡ Energia do Mês
      <span style="color:${corBarra};font-weight:700">${disponivel}/${ENERGIA_TOTAL}</span>
    </div>
    <div class="energia-bar-wrap" style="margin-bottom:.5rem">
      <div class="energia-bar-fill" id="energia-fill"
        style="width:${pct}%;background:linear-gradient(90deg,${corBarra}88,${corBarra})">
      </div>
    </div>
    <div style="font-size:.63rem;color:var(--ardosia);line-height:1.8;margin-bottom:.6rem">
      <div style="display:flex;justify-content:space-between"><span>Pesquisa jurídica</span><span>-10 ⚡</span></div>
      <div style="display:flex;justify-content:space-between"><span>Audiência</span><span>-20 ⚡</span></div>
      <div style="display:flex;justify-content:space-between"><span>Caso complexo/STJ/STF</span><span>-35 ⚡</span></div>
      <div style="display:flex;justify-content:space-between"><span>Networking</span><span>-5 ⚡</span></div>
      <div style="display:flex;justify-content:space-between"><span>Curso</span><span>-10 ⚡</span></div>
    </div>
    ${podeAvancar
      ? `<button id="btn-avancar" class="btn btn-prim btn-block"
           style="animation:pulseGold .8s ease infinite alternate"
           onclick="window.avancarMes()">
           ▶ Avançar mês →
         </button>
         <div style="font-size:.63rem;color:var(--ardosia2);text-align:center;margin-top:.3rem">
           Energia baixa — mês pronto para avançar
         </div>`
      : `<button id="btn-avancar" class="btn btn-ghost btn-block"
           onclick="window.avancarMes(true)"
           style="font-size:.72rem;opacity:.7">
           Avançar mês agora (${disponivel} ⚡ restantes)
         </button>
         <div style="font-size:.63rem;color:var(--ardosia);text-align:center;margin-top:.3rem">
           Use mais ações para maximizar o mês
         </div>`}`;
}

// ── Bloco visual de férias de janeiro ──
function _renderBlocoFerias(disponivel, pct, corBarra, bloqueadoAte) {
  return `
    <div class="bloco-titulo">⚡ Energia do Mês
      <span style="color:${corBarra};font-weight:700">${disponivel}/${ENERGIA_TOTAL}</span>
    </div>
    <div class="energia-bar-wrap" style="margin-bottom:.6rem">
      <div class="energia-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${corBarra}88,${corBarra})"></div>
    </div>
    <div style="background:rgba(184,146,42,.08);border:1px solid rgba(184,146,42,.25);border-radius:2px;padding:.75rem;text-align:center;margin-bottom:.5rem">
      <div style="font-size:1.4rem;margin-bottom:.25rem">🏖️</div>
      <div style="font-size:.78rem;font-weight:600;color:var(--ouro2);margin-bottom:.2rem">Recesso de Janeiro</div>
      <div style="font-size:.68rem;color:var(--ardosia2);margin-bottom:.5rem">Tribunais fechados. Descanse antes de avançar para Fevereiro.</div>
      <div style="font-size:1rem;font-weight:700;color:var(--perg);font-family:var(--font-mono)" id="countdown-ferias">--:--</div>
      <div style="font-size:.6rem;color:var(--ardosia);margin-top:.15rem">para liberar Fevereiro</div>
    </div>
    <button class="btn btn-ghost btn-block" disabled style="opacity:.35;font-size:.72rem;cursor:not-allowed">
      🔒 Avançar bloqueado — aguarde o recesso
    </button>`;
}

// ── Countdown ao vivo para fim do recesso ──
let _countdownFeriasInterval = null;
function _iniciarCountdownFerias(bloqueadoAte, container, j) {
  if (_countdownFeriasInterval) clearInterval(_countdownFeriasInterval);

  function atualizar() {
    const restMs  = bloqueadoAte.getTime() - Date.now();
    const elC     = document.getElementById('countdown-ferias');
    if (!elC) { clearInterval(_countdownFeriasInterval); return; }

    if (restMs <= 0) {
      // Desbloqueado — re-renderizar sem o modo férias
      clearInterval(_countdownFeriasInterval);
      const jAtual = window.JOGADOR || j;
      // Forçar re-render sem o bloqueio
      const jSemBloqueio = { ...jAtual, janeiro_bloqueado_ate: null };
      renderBlocoEnergia(jSemBloqueio);
      toast('🎉 Recesso encerrado! Você pode avançar para Fevereiro.', 'ok', 5000);
      return;
    }

    const h  = Math.floor(restMs / 3600000);
    const m  = Math.floor((restMs % 3600000) / 60000);
    const s  = Math.floor((restMs % 60000) / 1000);
    elC.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  atualizar();
  _countdownFeriasInterval = setInterval(atualizar, 1000);
}

// ════════════════════════════════════════════════════════
// GASTAR ENERGIA (chamado pelos módulos de ação)
// ════════════════════════════════════════════════════════
window.gastarEnergia = async function(custo, descricao) {
  const j   = window.JOGADOR;
  if (!j)   return false;
  const uid = j.uid || window.JOGADOR_UID;
  const usado = j.energia_usada_mes || 0;
  const disponivel = Math.max(0, ENERGIA_TOTAL - usado);

  if (disponivel < custo) {
    toast(`⚡ Energia insuficiente. Restam ${disponivel} ⚡, ação requer ${custo} ⚡.`, 'ko');
    return false;
  }

  try {
    await updateDoc(doc(db, 'jogadores', uid), {
      energia_usada_mes: usado + custo,
    });
    toast(`⚡ -${custo} energia (${descricao}). Restam ${disponivel - custo} ⚡.`, 'neutro', 2000);
    return true;
  } catch (err) {
    toast('Erro ao gastar energia.', 'ko');
    return false;
  }
};

// ════════════════════════════════════════════════════════
// AVANÇAR MÊS
// ════════════════════════════════════════════════════════
window.avancarMes = async function(forcar = false) {
  const j   = window.JOGADOR;
  if (!j)   return;
  const uid = j.uid || window.JOGADOR_UID;

  const usado      = j.energia_usada_mes || 0;
  const disponivel = Math.max(0, ENERGIA_TOTAL - usado);

  // Se ainda tem muita energia e não está forçando
  if (!forcar && disponivel > ENERGIA_MIN) {
    const confirmar = confirm(
      `Você ainda tem ${disponivel} ⚡ de energia disponível.\n\n` +
      `Avançar agora significa desperdiçar essas ações.\n\n` +
      `Deseja avançar mesmo assim?`
    );
    if (!confirmar) return;
  }

  // Desabilitar botão
  const btn = document.getElementById('btn-avancar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Processando...'; }

  try {
    toast('⏳ Avançando mês...', 'neutro', 4000);

    const fn     = httpsCallable(window.FB_FUNCTIONS, 'avancarMes');
    const result = await fn({});
    const r      = result.data;

    if (!r.ok) throw new Error(r.msg || 'Erro desconhecido');

    // Zerar ações dos funcionários do escritório próprio
    const _j = window.JOGADOR;
    if (_j?.escritorio_proprio_id) {
      try {
        const { collection: _col, getDocs: _get, updateDoc: _upd, doc: _doc } =
          await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const { db: _db } = await import('./firebase-init.js');
        const _snap = await _get(_col(_db, 'escritorios', _j.escritorio_proprio_id, 'funcionarios'));
        await Promise.all(_snap.docs.map(d =>
          _upd(_doc(_db, 'escritorios', _j.escritorio_proprio_id, 'funcionarios', d.id),
            { acoes_mes_usadas: 0, acao_atual: null })
        ));
      } catch(e) { console.warn('Reset funcionários:', e.message); }
    }

    // Processar relacionamentos, academia, filhos (módulo relacionamento.js)
    if (window._processarRelacionamentosMensal) {
      try { await window._processarRelacionamentosMensal(_j); }
      catch(e) { console.warn('Processar relacionamentos:', e.message); }
    }

    // Processar serviços, clientes e contratos recorrentes (módulo servicos.js)
    if (window._processarServicosMensal) {
      try { await window._processarServicosMensal(_j); }
      catch(e) { console.warn('Processar serviços:', e.message); }
    }

    // Processar folha de pagamento e caixa do escritório (módulo escritorio_financas.js)
    if (window._processarFinancasEscritorioMensal) {
      try { await window._processarFinancasEscritorioMensal(_j); }
      catch(e) { console.warn('Processar finanças escritório:', e.message); }
    }

    // Processar cursos (aprovação/reprovação por frequência) (módulo carreira.js)
    if (window._processarCursosMensal) {
      try { await window._processarCursosMensal(_j); }
      catch(e) { console.warn('Processar cursos:', e.message); }
    }

    // Processar distribuição de processos pelo escritório e deserção (módulo processos.js)
    if (window._processarDistribuicaoProcessosMensal) {
      try { await window._processarDistribuicaoProcessosMensal(_j); }
      catch(e) { console.warn('Processar distribuição processos:', e.message); }
    }

    // Mostrar resumo mensal
    _mostrarResumoMensal(r);

  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Avançar mês →'; }

    // Mensagem de erro amigável
    if (err.message?.includes('energia') || err.message?.includes('Voce ainda')) {
      toast('⚡ ' + err.message, 'ko', 5000);
    } else if (err.message?.includes('Ferias') || err.message?.includes('volte em') || err.message?.includes('Volte em')) {
      // Mostrar no bloco de energia também
      toast('🏖️ ' + err.message, 'ko', 6000);
    } else {
      toast('Erro: ' + err.message, 'ko');
    }
    console.error('[AVANÇAR MÊS]', err);
  }
};

// ════════════════════════════════════════════════════════
// RESUMO DO MÊS (modal)
// ════════════════════════════════════════════════════════
function _mostrarResumoMensal(r) {
  const { mes, resumo, delta_rep_pat } = r;
  const { renda, despesas, custo_vida, saldo_mes } = resumo || {};
  const corSaldo = saldo_mes >= 0 ? 'var(--verde3)' : 'var(--verm3)';
  const corPat   = delta_rep_pat > 0 ? 'var(--verde3)' : delta_rep_pat < 0 ? 'var(--verm3)' : 'var(--ardosia2)';

  abrirModal(
    `📅 ${mes} — Resumo do Mês`,
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1rem">
      <div style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.65rem;text-align:center">
        <div style="font-size:.6rem;color:var(--ardosia);text-transform:uppercase">Renda</div>
        <div style="font-size:1rem;font-weight:700;color:var(--verde3)">${fmt(renda)}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.65rem;text-align:center">
        <div style="font-size:.6rem;color:var(--ardosia);text-transform:uppercase">Despesas</div>
        <div style="font-size:1rem;font-weight:700;color:var(--verm3)">-${fmt(despesas)}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.65rem;text-align:center">
        <div style="font-size:.6rem;color:var(--ardosia);text-transform:uppercase">Custo de vida</div>
        <div style="font-size:1rem;font-weight:700;color:var(--verm3)">-${fmt(custo_vida)}</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.65rem;text-align:center">
        <div style="font-size:.6rem;color:var(--ardosia);text-transform:uppercase">Saldo do mês</div>
        <div style="font-size:1rem;font-weight:700;color:${corSaldo}">${saldo_mes >= 0 ? '+' : ''}${fmt(saldo_mes)}</div>
      </div>
    </div>
    <div style="background:rgba(184,146,42,.06);border:var(--borda);border-radius:2px;padding:.7rem;margin-bottom:.8rem;font-size:.78rem">
      <span style="color:var(--ardosia2)">Reputação por patrimônio: </span>
      <span style="font-weight:700;color:${corPat}">${delta_rep_pat >= 0 ? '+' : ''}${delta_rep_pat} rep</span>
      <span style="font-size:.65rem;color:var(--ardosia);display:block;margin-top:.2rem">
        Moradia e carro adequados aumentam sua reputação mensalmente.
      </span>
    </div>
    <button class="btn btn-prim btn-block" onclick="fecharModal()">
      Iniciar ${mes} →
    </button>`,
    null
  );
}

// ════════════════════════════════════════════════════════
// CSS — animação do botão quando pronto
// ════════════════════════════════════════════════════════
const style = document.createElement('style');
style.textContent = `
@keyframes pulseGold {
  from { box-shadow: 0 0 0 0 rgba(184,146,42,.4); }
  to   { box-shadow: 0 0 0 8px rgba(184,146,42,0); }
}`;
document.head.appendChild(style);

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
