/**
 * RANKING — Advocatus Online
 * Tabelas de líderes em tempo real do Firestore.
 */

import { doc, getDoc, collection, query, orderBy, limit, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// RENDERIZAÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════
window.renderRanking = async function(j, el) {
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🏆 Rankings Globais</div>
      <span class="secao-badge" id="rank-atualizacao">Carregando...</span>
    </div>

    <!-- Abas de categoria -->
    <div style="display:flex;gap:.3rem;margin-bottom:1.2rem;flex-wrap:wrap">
      <button class="btn btn-sm btn-sec ativo-rank" id="aba-reputacao"   onclick="window.mudarAbaRank('reputacao',this)">⚖️ Reputação</button>
      <button class="btn btn-sm btn-ghost"           id="aba-patrimonio"  onclick="window.mudarAbaRank('patrimonio',this)">💰 Patrimônio</button>
      <button class="btn btn-sm btn-ghost"           id="aba-networking"  onclick="window.mudarAbaRank('networking',this)">🌐 Networking</button>
      <button class="btn btn-sm btn-ghost"           id="aba-academico"   onclick="window.mudarAbaRank('academico',this)">🎓 Acadêmico</button>
      <button class="btn btn-sm btn-ghost"           id="aba-escritorios" onclick="window.mudarAbaRank('escritorios',this)">🏢 Escritórios</button>
    </div>

    <!-- Tabela -->
    <div id="rank-tabela">
      <div style="font-size:.78rem;color:var(--ardosia);text-align:center;padding:2rem">Carregando ranking...</div>
    </div>

    <!-- Posição do jogador -->
    <div id="rank-minha-posicao" style="display:none;margin-top:1rem;border-top:var(--borda);padding-top:.8rem"></div>`;

  // Carregar aba padrão
  await _carregarRanking('reputacao', j);
};

// ════════════════════════════════════════════════════════
// MUDAR ABA
// ════════════════════════════════════════════════════════
window.mudarAbaRank = async function(tipo, el) {
  // Atualizar estilos das abas
  document.querySelectorAll('[id^="aba-"]').forEach(b => {
    b.className = 'btn btn-sm btn-ghost';
  });
  if (el) el.className = 'btn btn-sm btn-sec ativo-rank';

  await _carregarRanking(tipo, window.JOGADOR);
};

// ════════════════════════════════════════════════════════
// CARREGAR RANKING
// ════════════════════════════════════════════════════════
async function _carregarRanking(tipo, j) {
  const tabela  = document.getElementById('rank-tabela');
  const minhaPos = document.getElementById('rank-minha-posicao');
  if (!tabela) return;

  tabela.innerHTML = '<div style="font-size:.78rem;color:var(--ardosia);text-align:center;padding:2rem">⏳ Carregando...</div>';

  try {
    const snap = await getDoc(doc(db, 'rankings', tipo));

    // Atualização
    const atuEl = document.getElementById('rank-atualizacao');
    if (snap.exists() && atuEl) {
      const s = window.SERVER || {};
      atuEl.textContent = `${s.mes_nome||'Janeiro'}, Ano ${s.ano_jogo||1}`;
    }

    if (!snap.exists() || !snap.data()) {
      tabela.innerHTML = '<div style="font-size:.78rem;color:var(--ardosia);text-align:center;padding:2rem">Nenhum dado de ranking ainda. Volte depois do próximo tick.</div>';
      return;
    }

    const data = snap.data();

    if (tipo === 'escritorios') {
      tabela.innerHTML = _renderTabelaEscritorios(data.top50 || []);
      if (minhaPos) minhaPos.style.display = 'none';
    } else {
      const lista = data.top100 || [];
      tabela.innerHTML = _renderTabelaJogadores(lista, tipo, j?.uid);

      // Mostrar posição do jogador se não estiver no top 20
      const eu  = lista.find(r => r.uid === j?.uid);
      if (eu && eu.pos > 20 && minhaPos) {
        minhaPos.style.display = '';
        minhaPos.innerHTML = `
          <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:.4rem">Sua posição:</div>
          <div style="background:rgba(184,146,42,.08);border:var(--borda);border-radius:2px;padding:.6rem">
            ${_linhaRanking(eu, tipo, true)}
          </div>`;
      } else if (minhaPos) {
        minhaPos.style.display = 'none';
      }
    }
  } catch (err) {
    tabela.innerHTML = `<div style="font-size:.78rem;color:var(--verm3);text-align:center;padding:2rem">Erro ao carregar ranking: ${err.message}</div>`;
    console.error('[RANKING]', err);
  }
}

// ════════════════════════════════════════════════════════
// TABELA DE JOGADORES
// ════════════════════════════════════════════════════════
function _renderTabelaJogadores(lista, tipo, meuUid) {
  if (!lista.length) {
    return '<div style="font-size:.78rem;color:var(--ardosia);text-align:center;padding:2rem">Sem jogadores no ranking ainda.</div>';
  }

  const TIPO_LABEL = {
    reputacao:  { label: 'Reputação', fmt: v => String(v) },
    patrimonio: { label: 'Patrimônio', fmt: v => fmt(v) },
    networking: { label: 'Networking', fmt: v => String(v) },
    academico:  { label: 'Prest. Acadêmico', fmt: v => String(v) },
  };
  const cfg = TIPO_LABEL[tipo] || TIPO_LABEL.reputacao;

  return `
    <table class="ranking-tabela">
      <thead>
        <tr>
          <th class="pos-col">#</th>
          <th class="medal-col"></th>
          <th>Advogado</th>
          <th>Cargo</th>
          <th>Especialidade</th>
          <th class="val-col">${cfg.label}</th>
        </tr>
      </thead>
      <tbody>
        ${lista.slice(0, 50).map(r => `
          <tr class="${r.uid === meuUid ? 'eu' : ''}">
            <td class="pos-col">${r.pos}</td>
            <td class="medal-col">${_medalha(r.pos)}</td>
            <td style="font-weight:${r.uid===meuUid?'600':'400'};color:${r.uid===meuUid?'var(--ouro2)':'var(--perg2)'}">
              ${r.nome || '—'}
              ${r.uid === meuUid ? ' <span style="font-size:.6rem;color:var(--ardosia)">(você)</span>' : ''}
            </td>
            <td style="font-size:.7rem;color:var(--ardosia2)">${_cargoLabel(r.cargo_id)}</td>
            <td style="font-size:.7rem;color:var(--ardosia2)">${_espLabel(r.especialidade)}</td>
            <td class="val-col">${cfg.fmt(r.valor)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:.65rem;color:var(--ardosia);text-align:center;margin-top:.6rem">
      Exibindo top ${Math.min(50, lista.length)} de ${lista.length} jogadores
    </div>`;
}

function _linhaRanking(r, tipo, isEu) {
  const TIPO_FMT = {
    reputacao:  v => `Rep ${v}`,
    patrimonio: v => fmt(v),
    networking: v => `Net ${v}`,
    academico:  v => `Acad ${v}`,
  };
  const fmtV = TIPO_FMT[tipo]?.(r.valor) || String(r.valor);
  return `
    <div style="display:flex;align-items:center;gap:.7rem;font-size:.78rem">
      <span style="color:var(--ardosia);font-family:var(--font-mono);width:28px">${r.pos}.</span>
      <span>${_medalha(r.pos)}</span>
      <span style="flex:1;color:var(--ouro2);font-weight:600">${r.nome}</span>
      <span style="color:var(--ardosia2)">${_cargoLabel(r.cargo_id)}</span>
      <span style="font-weight:700;color:var(--ouro2)">${fmtV}</span>
    </div>`;
}

// ════════════════════════════════════════════════════════
// TABELA DE ESCRITÓRIOS
// ════════════════════════════════════════════════════════
function _renderTabelaEscritorios(lista) {
  if (!lista.length) {
    return '<div style="font-size:.78rem;color:var(--ardosia);text-align:center;padding:2rem">Nenhum escritório registrado ainda.</div>';
  }

  const NIVEL_LABEL = ['','Autônomo','Individual','Boutique','Regional','Nacional','Full Service','Big Law'];

  return `
    <table class="ranking-tabela">
      <thead>
        <tr>
          <th class="pos-col">#</th>
          <th class="medal-col"></th>
          <th>Escritório</th>
          <th>Nível</th>
          <th>Sócios</th>
          <th>Sede</th>
          <th class="val-col">Prestígio</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(e => `
          <tr>
            <td class="pos-col">${e.pos}</td>
            <td class="medal-col">${_medalha(e.pos)}</td>
            <td style="font-weight:600;color:var(--perg)">${e.nome || '—'}</td>
            <td style="font-size:.7rem;color:var(--ouro2)">${NIVEL_LABEL[e.nivel] || '—'}</td>
            <td style="font-size:.7rem;color:var(--ardosia2)">${e.num_socios || 1}</td>
            <td style="font-size:.7rem;color:var(--ardosia2)">${e.bairro_sede || '—'}</td>
            <td class="val-col">${e.prestigio || 0}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:.65rem;color:var(--ardosia);text-align:center;margin-top:.6rem">
      Top ${lista.length} escritórios do servidor
    </div>`;
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function _medalha(pos) {
  if (pos === 1) return '👑';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  if (pos <= 10) return '⭐';
  return '';
}

function _cargoLabel(id) {
  return (window.CARGO_LABEL || {})[id] || id || '—';
}

function _espLabel(esp) {
  const MAP = {
    tributario:'Tributário', trabalhista:'Trabalhista', civil:'Civil',
    criminal:'Criminal', empresarial:'Empresarial', constitucional:'Constitucional',
    ambiental:'Ambiental', previdenciario:'Previdenciário',
  };
  return MAP[esp] || esp || '—';
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
