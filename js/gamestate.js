/**
 * GAMESTATE — Advocatus Online
 * Ouve o Firestore em tempo real e atualiza toda a UI.
 * Não tem estado próprio — tudo vem do banco.
 */

import { collection, query, where, orderBy, limit,
         onSnapshot, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import { icon } from './icons.js';

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

// Teto ÚNICO e flat de habilidade (Habilidades Gerais + Skills Jurídicas) —
// antes Habilidades Gerais usava REP_CAP (0-100, escalado por cargo, uma
// cópia por arquivo: SKILL_CAP em escritorios_npc.js, CARGO_CAP_SKL em
// avancar_mes.js), enquanto Skills Jurídicas já era flat 0-50. Unificado:
// toda habilidade (não confundir com reputação, que segue cargo-escalada
// via REP_CAP normalmente) tem o mesmo teto pra todo mundo.
window.HABILIDADE_CAP = 50;

// ════════════════════════════════════════════════════════
// ÍCONES ESTÁTICOS DO CHROME (topbar / sidebar direita)
// Rodam uma vez no load — substituem os emojis crus por SVG (icons.js)
// ════════════════════════════════════════════════════════
(function _renderIconesChrome() {
  const injetar = (id, nome, texto) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<span class="ni-icon">${icon(nome)}</span>${texto}`;
  };
  const injetarBlocoTitulo = (id, nome, texto) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<span class="bt-label"><span class="ni-icon">${icon(nome)}</span>${texto}</span>`;
  };
  injetar('tb-serasa',       'alerta', 'Serasa');
  injetar('sr-evento-label', 'alerta', 'Evento Global');
  injetarBlocoTitulo('bt-performance-anual', 'balancete', 'Performance Anual');
  injetarBlocoTitulo('bt-top-reputacao',     'ranking',   'Top Reputação');
})();

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
  _iniciarListenerInbox(j.uid);
  // Atualizar calendário com dados pessoais do jogador (mais precisos que o server)
  _atualizarRelógio(window.SERVER || {}, j);
  // Notificar ui-main.js para re-renderizar o painel ativo
  window.dispatchEvent(new CustomEvent('gamestate:ready', { detail: j }));
});

// ════════════════════════════════════════════════════════
// BADGE DE MENSAGENS NÃO LIDAS — em tempo real.
// j.notificacoes_nao_lidas é um campo morto (inicializado na criação
// do personagem, nunca incrementado em lugar nenhum — inbox inteiro
// já roda por query where('lida','==',false), ver js/ui-main.js
// renderInbox/marcarTodasLidas). O badge lia esse campo morto e por
// isso nunca aparecia mesmo com mensagens não lidas de verdade.
// ════════════════════════════════════════════════════════
let _inboxListenerUid = null;
function _iniciarListenerInbox(uid) {
  if (!uid || uid === _inboxListenerUid) return;
  _inboxListenerUid = uid;
  const q = query(collection(db, 'jogadores', uid, 'inbox'), where('lida', '==', false));
  onSnapshot(q, (snap) => _atualizarBadgeInbox(snap.size));
}

function _atualizarBadgeInbox(naoLidas) {
  ['badge-inbox', 'badge-inbox-nav'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = naoLidas > 0 ? '' : 'none';
    el.textContent   = naoLidas > 9 ? '9+' : String(naoLidas);
  });
}

// ════════════════════════════════════════════════════════
// LISTENER: SERVIDOR
// ════════════════════════════════════════════════════════
window.addEventListener('server:update', (e) => {
  const s = e.detail;
  if (!s) return;
  _atualizarRelógio(s, window.JOGADOR);
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

  _set('sl-nome',     j.nome_personagem || '—');
  _set('sl-cargo',    label);
  _set('sl-rep-val', `Rep ${rep}`);
  _set('sl-rep-cap', `Cap ${cap}`);
  _style('sl-rep-fill', 'width', `${Math.min(100, pct)}%`);

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
  if (serasaEl) serasaEl.style.display = j.no_serasa ? 'flex' : 'none';

  // Carregar mini ranking
  _carregarMiniRanking(j.uid);
}

// ════════════════════════════════════════════════════════
// TOPBAR UPDATES (rep, saldo)
// ════════════════════════════════════════════════════════
function _atualizarTopbar(j) {
  _set('tb-rep',   String(j.reputacao || 0));
  _set('tb-saldo', fmt(j.dinheiro || 0));
  // Badge de inbox: ver _iniciarListenerInbox — roda por listener próprio em tempo real.
}

// ════════════════════════════════════════════════════════
// RELÓGIO GLOBAL / CRONOLOGIA DO JOGO / PROGRESSO DO ANO
// O jogo trabalha por meses (sem dias da semana) — substituímos o
// calendário tradicional por uma grade de 12 meses + barra de progresso.
// ════════════════════════════════════════════════════════
const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function _atualizarRelógio(server, jogador) {
  // Prioridade: calendário pessoal do jogador > servidor global
  const j = jogador || window.JOGADOR;
  let texto, mesIdx, ano;
  if (j && j.mes_pessoal !== undefined && j.ano_pessoal !== undefined) {
    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    mesIdx = j.mes_pessoal;
    ano    = j.ano_pessoal;
    texto  = `${MESES_PT[mesIdx]}, Ano ${ano}`;
  } else {
    mesIdx = (server.mes_global !== undefined ? (server.mes_global - 1) % 12 : 0);
    ano    = server.ano_jogo || 1;
    texto  = `${server.mes_nome || 'Janeiro'}, Ano ${ano}`;
  }
  _set('server-data', texto);
  _atualizarCronologia(mesIdx, ano, j);
}

function _atualizarCronologia(mesIdx, ano, j) {
  // ── Cronologia do Jogo: data + grade de 12 meses ──
  const MESES_PT_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  _set('cron-data', `${MESES_PT_FULL[mesIdx] || '—'}, Ano ${ano || 1}`);

  const grid = document.getElementById('cron-grid');
  if (grid) {
    grid.innerHTML = MESES_ABREV.map((m, i) => {
      const cls = i === mesIdx ? 'atual' : i < mesIdx ? 'passado' : '';
      return `<div class="cron-mes ${cls}">${m}</div>`;
    }).join('');
  }

  // Countdown = energia restante até poder avançar o mês
  if (j) {
    const usado = j.energia_usada_mes || 0;
    const disp  = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - usado);
    _set('cron-countdown', disp <= 5 ? 'Pronto ▶' : `${disp} ⚡ energia`);
  }

  // ── Progresso do Ano ──
  _set('pa-ano', `Ano ${ano || 1}`);
  _set('pa-mes', `Mês ${String(mesIdx + 1).padStart(2,'0')} de 12`);
  const pct = Math.round(((mesIdx + 1) / 12) * 100);
  _style('pa-bar-fill', 'width', `${pct}%`);
  _set('pa-pct', `${pct}% concluído`);
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
// BRASÃO POR CARGO — imagem PNG (img/brasoes/{sigla}.png) com
// fallback automático pro SVG gerado, para cargos sem imagem ainda.
// ════════════════════════════════════════════════════════

// Cache de quais cargos já confirmaram ter (ou não ter) imagem,
// para não tentar carregar a mesma imagem inexistente repetidas vezes.
const _brasaoImgCache = {};

function _renderBrasao(cargoId, rep) {
  const container = document.getElementById('brasao-container');
  if (!container) return;

  // Se já sabemos que não existe imagem para esse cargo, vai direto pro SVG.
  if (_brasaoImgCache[cargoId] === false) {
    _renderBrasaoSVG(container, cargoId, rep);
    return;
  }

  // Se já sabemos que a imagem existe, usa direto (sem re-testar).
  if (_brasaoImgCache[cargoId] === true) {
    _renderBrasaoImagem(container, cargoId);
    return;
  }

  // Primeira vez vendo esse cargo: testa se a imagem existe.
  const caminho = `img/brasoes/${cargoId}.png`;
  const testeImg = new Image();
  testeImg.onload = () => {
    _brasaoImgCache[cargoId] = true;
    _renderBrasaoImagem(container, cargoId);
  };
  testeImg.onerror = () => {
    _brasaoImgCache[cargoId] = false;
    _renderBrasaoSVG(container, cargoId, rep);
  };
  testeImg.src = caminho;
}

function _renderBrasaoImagem(container, cargoId) {
  container.innerHTML = `<img class="brasao-svg" src="img/brasoes/${cargoId}.png" alt="Brasão" />`;
}

// ════════════════════════════════════════════════════════
// BRASÃO SVG POR CARGO (fallback)
// ════════════════════════════════════════════════════════
function _renderBrasaoSVG(container, cargoId, rep) {
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
