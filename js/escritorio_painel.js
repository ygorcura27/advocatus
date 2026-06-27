/**
 * ESCRITÓRIO PAINEL — Advocatus Online
 * Equipe, Clientes Corporativos e Oportunidades do mês.
 */

import { collection, query, where, orderBy, limit, getDocs, doc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const CARGO_INFO = {
  soc: { l: 'Sócio',               ordem: 6 },
  asc: { l: 'Associado',           ordem: 5 },
  snr: { l: 'Advogado Sênior',     ordem: 4 },
  pln: { l: 'Advogado Pleno',      ordem: 3 },
  jnr: { l: 'Advogado Júnior',     ordem: 2 },
  ass: { l: 'Assistente Jurídico', ordem: 1 },
  est: { l: 'Estagiário',          ordem: 0 },
};

const ESP_LABEL = {
  tributario:'Tributário', contencioso:'Contencioso', trabalhista:'Trabalhista',
  criminal:'Criminal', societario:'Societário', civil:'Civil',
  consumidor:'Consumidor', ambiental:'Ambiental', administrativo:'Administrativo',
  familia:'Família', imobiliario:'Imobiliário', empresarial:'Empresarial',
};

// Placeholder SVG com iniciais douradas em fundo navy
function _avatar(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%232E4270'/%3E%3Ctext x='18' y='23' font-size='12' font-weight='700' fill='%23C9A227' text-anchor='middle' font-family='DM Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E`;
}

// Ícone de empresa (iniciais em fundo navy)
function _logoEmpresa(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `<div class="esc-cliente-logo">${ini}</div>`;
}

function _fmt(n) {
  if (!n && n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

// ════════════════════════════════════════════════════════
// EQUIPE
// ════════════════════════════════════════════════════════
window.renderEquipePainel = async function(j, escId, el) {
  try {
    const fSnap = await getDocs(
      query(collection(db, 'escritorios', escId, 'funcionarios'), orderBy('criado_em', 'asc'))
    );

    const funcs = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    funcs.sort((a, b) => (CARGO_INFO[b.cargo_id]?.ordem ?? -1) - (CARGO_INFO[a.cargo_id]?.ordem ?? -1));

    const top5    = funcs.slice(0, 5);
    const temMais = funcs.length > 5;

    if (top5.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:1.2rem 0">
          <div style="font-size:.78rem;color:var(--txt3);margin-bottom:.8rem">Nenhum membro na equipe ainda.</div>
          <button class="btn btn-sec btn-sm" onclick="window.navTo('equipe',null)">Contratar agora</button>
        </div>`;
      return;
    }

    const rows = top5.map(func => {
      const cargo     = CARGO_INFO[func.cargo_id]?.l || func.cargo_id;
      const nome      = func.nome || func.name || `${cargo} #${func.id.slice(0,4)}`;
      const esp       = ESP_LABEL[func.especialidade] || func.especialidade || '—';
      const prod      = func.produtividade ?? func.desemp ?? 70;
      const prodColor = prod >= 80 ? 'var(--verde2)' : prod >= 60 ? 'var(--amber)' : 'var(--verm2)';
      const dots      = [1,2,3].map(i =>
        `<span style="width:6px;height:6px;border-radius:50%;background:${i<=Math.ceil(prod/34)?prodColor:'var(--bg3)'}"></span>`
      ).join('');

      return `
      <div class="esc-membro">
        <img class="esc-membro-avatar" src="${_avatar(nome)}" alt="${nome}">
        <div class="esc-membro-info">
          <div class="esc-membro-nome">${nome}</div>
          <div class="esc-membro-cargo">${cargo}</div>
          <div class="esc-membro-esp">${esp}</div>
        </div>
        <div class="esc-membro-prod">
          <div class="esc-membro-prod-label">Produtividade</div>
          <div class="esc-membro-prod-val" style="color:${prodColor}">${prod}%</div>
          <div style="display:flex;gap:3px;margin-top:2px">${dots}</div>
        </div>
        <div class="esc-membro-acoes">
          <button class="esc-membro-btn" title="Designar processo" onclick="window.navTo('processos',null)">📋</button>
          <button class="esc-membro-btn demitir" title="Demitir" onclick="window._demitirFuncionario('${escId}','${func.id}','${nome.replace(/'/g,"\\'")}')">✕</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div>${rows}</div>
      <button class="btn btn-prim btn-sm btn-block" style="margin-top:.8rem" onclick="window.navTo('equipe',null)">
        👥 Gerenciar Equipe${temMais ? ` (${funcs.length} total)` : ''}
      </button>`;

  } catch (err) {
    console.error('[EQUIPE PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar equipe.</div>';
  }
};

// Demitir funcionário
window._demitirFuncionario = async function(escId, funcId, nome) {
  if (!confirm(`Desligar ${nome} do escritório?`)) return;
  try {
    await deleteDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
    toast(`${nome} foi desligado(a).`, 'ok');
    const el = document.getElementById('esc-equipe-embed');
    if (el && window.JOGADOR) window.renderEquipePainel(window.JOGADOR, escId, el);
  } catch (e) {
    console.error('[DEMITIR]', e);
    toast('Erro ao demitir funcionário.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// CLIENTES CORPORATIVOS — dados reais da subcoleção
// ════════════════════════════════════════════════════════
window.renderClientesPainel = async function(j, escId, el) {
  try {
    // Carregar clientes reais da subcoleção do escritório
    const clSnap = await getDocs(collection(db, 'escritorios', escId, 'clientes'));
    const clientes = clSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.recorrente || (c.valor_mensal && c.valor_mensal > 0) || c.confianca > 0)
      .sort((a, b) => (b.valor_mensal || 0) - (a.valor_mensal || 0));

    const top5    = clientes.slice(0, 5);
    const temMais = clientes.length > 5;

    if (top5.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:1.2rem 0">
          <div style="font-size:.78rem;color:var(--txt3);margin-bottom:.8rem">Nenhum cliente corporativo ainda.</div>
          <button class="btn btn-sec btn-sm" onclick="window.navTo('clientes',null)">Ver oportunidades</button>
        </div>`;
      return;
    }

    const rows = top5.map(c => {
      const area    = ESP_LABEL[c.area || c.especialidade] || c.area || c.especialidade || '—';
      const tipo    = c.tipo === 'PJ' ? (c.porte ? `PJ · ${c.porte[0].toUpperCase()+c.porte.slice(1)}` : 'PJ') : (c.tipo || '—');
      const recBadge = c.recorrente
        ? `<div style="font-size:.6rem;color:var(--verde2);font-weight:600">🔁 Recorrente</div>`
        : '';
      return `
      <div class="esc-cliente">
        ${_logoEmpresa(c.nome)}
        <div class="esc-cliente-info">
          <div class="esc-cliente-nome">${c.nome}</div>
          <div class="esc-cliente-tipo">${tipo}</div>
        </div>
        <div class="esc-cliente-stats">
          ${c.valor_mensal ? `<div class="esc-cliente-pag">${_fmt(c.valor_mensal)}/mês</div>` : ''}
          <div class="esc-cliente-area">${area}</div>
          ${recBadge}
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div>${rows}</div>
      <button class="btn btn-prim btn-sm btn-block" style="margin-top:.8rem" onclick="window.navTo('clientes',null)">
        🏢 Ver todos os clientes${temMais ? ` (${clientes.length})` : ''}
      </button>`;

  } catch (err) {
    console.error('[CLIENTES PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar clientes.</div>';
  }
};

// ════════════════════════════════════════════════════════
// OPORTUNIDADES DO MÊS — da subcoleção real do escritório
// ════════════════════════════════════════════════════════
window.renderOportunidadesPainel = async function(j, escId, el) {
  try {
    const opSnap = await getDocs(query(
      collection(db, 'escritorios', escId, 'oportunidades'),
      where('status', '==', 'disponivel'),
      limit(20)
    ));

    const todas = opSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const top5  = todas.slice(0, 5);
    const temMais = todas.length > 5;

    if (top5.length === 0) {
      el.innerHTML = '';
      return;
    }

    const tipoIcon = { PF:'👤', PJ:'🏢', consulta:'📋', contrato:'📄', causa:'⚖️' };

    const rows = top5.map(op => {
      const icone = op.icone || tipoIcon[op.tipo_cliente] || tipoIcon[op.tipo] || '🌟';
      const valor = op.valor_estimado || op.valor || 0;
      return `
      <div class="esc-opport">
        <div class="esc-opport-icone">${icone}</div>
        <div style="flex:1;min-width:0">
          <div class="esc-opport-titulo">${op.titulo || op.nome || 'Oportunidade'}</div>
          ${op.descricao ? `<div class="esc-opport-desc">${op.descricao}</div>` : ''}
        </div>
        ${valor ? `<div style="font-size:.72rem;font-weight:700;color:var(--verde2);flex-shrink:0;font-variant-numeric:tabular-nums">${_fmt(valor)}</div>` : ''}
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.8rem;border-bottom:1px solid var(--borda-sub);padding-bottom:.5rem">
          <div class="secao-titulo" style="font-size:.88rem;font-weight:700">Oportunidades do Mês</div>
          ${temMais
            ? `<a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todas (${todas.length})</a>`
            : `<a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todas</a>`}
        </div>
        ${rows}
      </div>`;

  } catch (err) {
    console.error('[OPORTUNIDADES PAINEL]', err);
    el.innerHTML = '';
  }
};
