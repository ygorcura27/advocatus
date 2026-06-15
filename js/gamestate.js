/**
 * GAMESTATE — Advocatus Online
 * Ouve o Firestore em tempo real e atualiza toda a UI.
 * Não tem estado próprio — tudo vem do banco.
 */

import { collection, query, where, orderBy, limit,
         onSnapshot, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ── Constantes de jogo ──
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

const CARGO_LABEL = {
  est:'Estagiário', ass:'Assistente Jurídico',
  jnr:'Advogado Júnior', pln:'Advogado Pleno',
  snr:'Advogado Sênior', asc:'Associado',
  soc:'Sócio', snm:'Sócio Nominal',
  jsub:'Juiz Substituto', jtit:'Juiz Titular',
  dsb:'Desembargador', mstj:'Ministro',
  padj:'Promotor Adjunto', prom:'Promotor',
  pjus:'Procurador de Justiça', pgj:'Procurador-Geral',
  dadj:'Defensor Adjunto', def:'Defensor Público',
  dch:'Defensor-Chefe', dge:'Defensor Público-Geral',
};

window.CARGO_LABEL = CARGO_LABEL;
window.REP_CAP     = REP_CAP;

// ════════════════════════════════════════════════════════
// LISTENER: JOGADOR
// Recebe updates do auth.js via evento
// ════════════════════════════════════════════════════════
window.addEventListener('jogador:update', (e) => {
  const j = e.detail;
  if (!j) return;
  _atualizarSidebarEsquerda(j);
  _atualizarSidebarDireita(j);
  _atualizarTopbar(j);
  // Notificar ui-main.js para re-renderizar o painel ativo
  window.dispatchEvent(new CustomEvent('gamestate:ready', { detail: j }));
});

// ════════════════════════════════════════════════════════
// LISTENER: SERVIDOR
// ════════════════════════════════════════════════════════
window.addEventListener('server:update', (e) => {
  const s = e.detail;
  if (!s) return;
  _atualizarRelógio(s);
  _carregarEventoGlobal(s.mes_global);
});

// ════════════════════════════════════════════════════════
// SIDEBAR ESQUERDA
// ════════════════════════════════════════════════════════
function _atualizarSidebarEsquerda(j) {
  const cap    = REP_CAP[j.cargo_id] || 55;
  const rep    = j.reputacao || 0;
  const pct    = Math.round((rep / cap) * 100);
  const label  = CARGO_LABEL[j.cargo_id] || j.cargo_id;
  const total  = (j.wins || 0) + (j.losses || 0);
  const aprov  = total > 0 ? Math.round((j.wins / total) * 100) : 0;
  const saldo  = j.dinheiro || 0;
  const energia = j.energia || 0;

  _set('sl-nome',     j.nome_personagem || '—');
  _set('sl-cargo',    label);
  _set('sl-rep-val', `Rep ${rep}`);
  _set('sl-rep-cap', `Cap ${cap}`);
  _style('sl-rep-fill', 'width', `${Math.min(100, pct)}%`);

  // Stats rápidos
  _set('sm-dinheiro', fmt(saldo));
  _set('sm-rep',      String(rep));
  _set('sm-energia',  String(energia));
  _set('sm-wins',     `${aprov}%`);

  // Brasão dinâmico
  _renderBrasao(j.cargo_id, rep);

  // Badge de processos ativos
  const procs = j._processos_count || 0;
  const badgeP = document.getElementById('badge-proc');
  if (badgeP) {
    badgeP.style.display = procs > 0 ? '' : 'none';
    badgeP.textContent   = procs;
  }
}

// ════════════════════════════════════════════════════════
// SIDEBAR DIREITA
// ════════════════════════════════════════════════════════
function _atualizarSidebarDireita(j) {
  // Bloco de energia + botão avançar mês
  if (window.renderBlocoEnergia) {
    window.renderBlocoEnergia(j);
  } else {
    // Fallback simples enquanto o módulo carrega
    const el = document.getElementById('bloco-energia');
    if (el) {
      const usado = j.energia_usada_mes || 0;
      const disp  = Math.max(0, 100 - usado);
      const cor   = disp > 50 ? '#5A9A3A' : disp > 20 ? '#B8922A' : '#A83A3A';
      const pronto = disp <= 20;
      el.innerHTML = `
        <div class="bloco-titulo">⚡ Energia Mensal <span style="font-weight:700;color:${cor}">${disp}/100</span></div>
        <div class="energia-bar-wrap" style="margin-bottom:.6rem">
          <div class="energia-bar-fill" style="width:${disp}%;background:${cor}"></div>
        </div>
        <div style="font-size:.63rem;color:var(--txt4);line-height:1.85;margin-bottom:.7rem">
          <div style="display:flex;justify-content:space-between"><span>Pesquisa jurídica</span><span>-10 ⚡</span></div>
          <div style="display:flex;justify-content:space-between"><span>Audiência</span><span>-20 ⚡</span></div>
          <div style="display:flex;justify-content:space-between"><span>Acordo</span><span>-5 ⚡</span></div>
        </div>
        <button class="btn-avancar-mes ${pronto ? 'pronto' : ''}"
          onclick="window.avancarMes(${pronto ? 'false' : 'true'})"
          ${!pronto ? 'style="background:linear-gradient(135deg,#6B7FA0,#9BAAC4);border-color:#D1D8EE;color:#fff;opacity:.75"' : ''}>
          <span class="bam-icon">${pronto ? '▶' : '⚡'}</span>
          <div>
            ${pronto ? 'Avançar mês' : 'Forçar avanço'}
            <span class="bam-hint">${pronto ? 'Energia esgotada — pronto!' : disp + ' ⚡ restantes'}</span>
          </div>
        </button>`;
    }
  }

  const wA  = j.wins_ano   || 0;
  const lA  = j.losses_ano || 0;
  const tot = wA + lA;
  const ap  = tot > 0 ? Math.round(wA / tot * 100) : 0;

  _set('sr-wins-ano',   String(wA));
  _set('sr-losses-ano', String(lA));
  _set('sr-aprov-ano',  tot > 0 ? `${ap}%` : '—');

  // Bônus esperado
  let bonus = '—';
  if (ap >= 70 && tot > 0) {
    const sal = j.renda_calculada || 5000;
    if (ap === 100)    bonus = `6× sal (${fmt(sal*6)})`;
    else if (ap >= 90) bonus = `3× sal (${fmt(sal*3)})`;
    else if (ap >= 80) bonus = `2× sal (${fmt(sal*2)})`;
    else               bonus = `1× sal (${fmt(sal)})`;
  } else if (tot > 0) {
    bonus = 'Sem bônus (<70%)';
  }
  _set('sr-bonus', bonus);

  // Serasa
  const serasaEl = document.getElementById('tb-serasa');
  if (serasaEl) serasaEl.style.display = j.no_serasa ? '' : 'none';

  // Carregar mini ranking
  _carregarMiniRanking(j.uid);
}

// ════════════════════════════════════════════════════════
// TOPBAR UPDATES (rep, saldo)
// ════════════════════════════════════════════════════════
function _atualizarTopbar(j) {
  _set('tb-rep',   String(j.reputacao || 0));
  _set('tb-saldo', fmt(j.dinheiro || 0));

  // Badge inbox
  const naoLidas = j.notificacoes_nao_lidas || 0;
  ['badge-inbox','badge-inbox-nav'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = naoLidas > 0 ? '' : 'none';
    el.textContent   = naoLidas > 9 ? '9+' : String(naoLidas);
  });
}

// ════════════════════════════════════════════════════════
// RELÓGIO GLOBAL
// ════════════════════════════════════════════════════════
function _atualizarRelógio(server) {
  // Usa calendário pessoal do jogador se disponível, senão o do servidor
  const j = window.JOGADOR;
  let texto;
  if (j && j.mes_pessoal !== undefined) {
    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    texto = `${MESES_PT[j.mes_pessoal]}, Ano ${j.ano_pessoal || 1}`;
  } else {
    texto = `${server.mes_nome || 'Janeiro'}, Ano ${server.ano_jogo || 1}`;
  }
  _set('server-data',  texto);
  _set('sr-data-jogo', texto);
}

// ════════════════════════════════════════════════════════
// EVENTO GLOBAL DO MÊS
// ════════════════════════════════════════════════════════
async function _carregarEventoGlobal(mesGlobal) {
  if (!mesGlobal) return;
  try {
    const q    = query(
      collection(db, 'eventos'),
      where('mes_global', '==', mesGlobal),
      where('ativo', '==', true),
      orderBy('fixo', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    const bloco = document.getElementById('sr-evento');
    if (!snap.empty && bloco) {
      const ev = snap.docs[0].data();
      _set('sr-evento-titulo', ev.titulo || '—');
      _set('sr-evento-desc',   ev.descricao || '');
      bloco.style.display = '';
    } else if (bloco) {
      bloco.style.display = 'none';
    }
  } catch (_) { /* silencioso */ }
}

// ════════════════════════════════════════════════════════
// MINI RANKING
// ════════════════════════════════════════════════════════
async function _carregarMiniRanking(meuUid) {
  try {
    const { doc, getDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const snap  = await getDoc(
      (await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'))
        .doc(db, 'rankings', 'reputacao')
    );
    const lista = document.getElementById('sr-ranking-lista');
    if (!lista) return;

    if (!snap.exists()) {
      lista.innerHTML = '<div style="font-size:.7rem;color:var(--ardosia)">Sem dados ainda.</div>';
      return;
    }

    const top = snap.data().top100 || [];
    const top5 = top.slice(0, 5);
    const eu   = top.find(r => r.uid === meuUid);
    const euPos = eu ? eu.pos : null;

    const medals = ['👑','🥈','🥉'];
    let html = top5.map((r, i) => `
      <div class="rank-row ${r.uid === meuUid ? 'eu' : ''}">
        <span class="rank-pos">${r.pos}.</span>
        <span class="rank-medal">${medals[i] || '⚖️'}</span>
        <span class="rank-nome ${r.uid === meuUid ? 'eu' : ''}">${r.nome}</span>
        <span class="rank-val">Rep ${r.valor}</span>
      </div>`).join('');

    // Mostrar posição do jogador se não estiver no top 5
    if (euPos && euPos > 5) {
      html += `<div style="border-top:var(--borda-sub);margin:.35rem 0"></div>
        <div class="rank-row eu">
          <span class="rank-pos">${euPos}.</span>
          <span class="rank-medal">⚖️</span>
          <span class="rank-nome eu">${eu.nome}</span>
          <span class="rank-val">Rep ${eu.valor}</span>
        </div>`;
    }

    lista.innerHTML = html || '<div style="font-size:.7rem;color:var(--ardosia)">Sem rankings.</div>';
  } catch (_) { /* silencioso */ }
}

// ════════════════════════════════════════════════════════
// BRASÃO SVG POR CARGO
// ════════════════════════════════════════════════════════
function _renderBrasao(cargoId, rep) {
  const container = document.getElementById('brasao-container');
  if (!container) return;

  // Número de estrelas por cargo
  const estrelas = {
    est:0, ass:0, jnr:1, pln:2, snr:3, asc:4, soc:5, snm:6,
    jsub:1, jtit:2, dsb:3, mstj:4,
    padj:1, prom:2, pjus:3, pgj:4,
    dadj:1, def:2, dch:3, dge:4,
  };
  const numEstrelas = estrelas[cargoId] || 0;
  const starsHtml   = numEstrelas > 0
    ? `<text x="${45 - numEstrelas * 4}" y="74" font-size="8" fill="#B8922A" font-family="sans-serif">${'★'.repeat(numEstrelas)}</text>`
    : '';

  // Cores por tier
  const corEscudo = cargoId === 'snm' ? '#4E3820' :
                    ['soc','asc'].includes(cargoId) ? '#3D2B18' : '#2A1C0E';

  container.innerHTML = `
    <svg class="brasao-svg" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M45 6 L78 18 L78 50 C78 68 62 80 45 86 C28 80 12 68 12 50 L12 18 Z"
            fill="${corEscudo}" stroke="#B8922A" stroke-width="1.5"/>
      <path d="M30 18 L45 12 L60 18" stroke="#8A6A1A" stroke-width="1" fill="none"/>
      <line x1="45" y1="28" x2="45" y2="62" stroke="#B8922A" stroke-width="1.2"/>
      <line x1="30" y1="36" x2="60" y2="36" stroke="#B8922A" stroke-width="1.2"/>
      <circle cx="30" cy="45" r="6" fill="none" stroke="#B8922A" stroke-width="1"/>
      <circle cx="60" cy="45" r="6" fill="none" stroke="#B8922A" stroke-width="1"/>
      <circle cx="45" cy="28" r="2.5" fill="#B8922A"/>
      <path d="M16 40 C18 36 22 34 20 40 C18 44 16 46 16 40Z" fill="#3D5030" opacity=".8"/>
      <path d="M16 46 C18 42 22 42 20 48 C18 52 14 52 16 46Z" fill="#3D5030" opacity=".8"/>
      <path d="M18 52 C20 48 24 50 22 56 C20 60 16 58 18 52Z" fill="#3D5030" opacity=".6"/>
      <path d="M74 40 C72 36 68 34 70 40 C72 44 74 46 74 40Z" fill="#3D5030" opacity=".8"/>
      <path d="M74 46 C72 42 68 42 70 48 C72 52 76 52 74 46Z" fill="#3D5030" opacity=".8"/>
      <path d="M72 52 C70 48 66 50 68 56 C70 60 74 58 72 52Z" fill="#3D5030" opacity=".6"/>
      ${starsHtml}
    </svg>`;
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function _set(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function _style(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}
function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

// Expor para uso externo
window.MESES      = MESES;
window.CARGO_LABEL = CARGO_LABEL;

// renderBlocoEnergia é definido em avancar_mes.js e exposto via window
// chamado em _atualizarSidebarDireita
