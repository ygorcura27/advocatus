/**
 * AVANÇAR MÊS — Frontend
 * Botão de avanço + lógica de energia + resumo mensal.
 */

import { doc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';
import { icon } from './icons.js';

// ENERGIA_TOTAL deixou de ser uma constante fixa (era 100, e por isso nunca
// refletia o bônus de até +25⚡ da academia — bug visual: card sempre mostrava
// "/100" e a barra calculava % sobre um teto errado quando havia bônus ativo).
// O teto real agora é sempre obtido via window.getEnergiaTotal(j), que já
// existe globalmente e soma o bônus de academia (teto: 100 a 125⚡).
const ENERGIA_MIN   = 20;   // abaixo disso, botão de avançar aparece em destaque

// ════════════════════════════════════════════════════════
// RENDERIZAR BOTÃO DE ENERGIA (injetado na sidebar direita)
// ════════════════════════════════════════════════════════
export function renderBlocoEnergia(j) {
  const el = document.getElementById('bloco-energia');
  if (!el) return;

  // ── Verificar bloqueio de férias de janeiro ──
  const mesAtual     = j.mes_pessoal !== undefined ? j.mes_pessoal : -1;
  const bloqueadoAte = j.janeiro_bloqueado_ate ? new Date(j.janeiro_bloqueado_ate) : null;
  const emFerias     = mesAtual === 0 && bloqueadoAte && Date.now() < bloqueadoAte.getTime();

  if (emFerias) {
    el.innerHTML = `<button class="btn btn-ghost btn-block" disabled style="opacity:.45;font-size:.78rem;cursor:not-allowed">
      <span class="ni-icon">${icon('cadeado')}</span> Recesso de Janeiro — aguarde
    </button>`;
    return;
  }

  el.innerHTML = `<button id="btn-avancar" class="btn btn-prim btn-block" onclick="window.avancarMes()">
    ▶ Avançar mês
  </button>`;
}

// ── Bloco visual de férias de janeiro ──
function _renderBlocoFerias(disponivel, pct, corBarra, bloqueadoAte, energiaTotal) {
  return `
    <div class="bloco-titulo">
      <span class="bt-label"><span class="ni-icon">${icon('habilidades')}</span>Energia do Mês</span>
      <span style="color:${corBarra};font-weight:700">${disponivel}/${energiaTotal}</span>
    </div>
    <div class="energia-bar-wrap" style="margin-bottom:.6rem">
      <div class="energia-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${corBarra}88,${corBarra})"></div>
    </div>
    <div style="background:rgba(176,138,78,.08);border:1px solid rgba(176,138,78,.25);border-radius:2px;padding:.75rem;text-align:center;margin-bottom:.5rem">
      <div style="font-size:1.4rem;margin-bottom:.25rem">🏖️</div>
      <div style="font-size:.78rem;font-weight:600;color:var(--ouro2);margin-bottom:.2rem">Recesso de Janeiro</div>
      <div style="font-size:.68rem;color:var(--ardosia2);margin-bottom:.5rem">Tribunais fechados. Descanse antes de avançar para Fevereiro.</div>
      <div style="font-size:1rem;font-weight:700;color:var(--perg);font-family:var(--font-mono)" id="countdown-ferias">--:--</div>
      <div style="font-size:.6rem;color:var(--ardosia);margin-top:.15rem">para liberar Fevereiro</div>
    </div>
    <button class="btn btn-ghost btn-block" disabled style="opacity:.35;font-size:.72rem;cursor:not-allowed">
      <span class="ni-icon">${icon('cadeado')}</span> Avançar bloqueado — aguarde o recesso
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
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const usado = j.energia_usada_mes || 0;
  const disponivel = Math.max(0, energiaTotal - usado);

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
