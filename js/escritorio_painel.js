/**
 * ESCRITÓRIO PAINEL — Advocatus Online
 * Equipe, Clientes Corporativos e Oportunidades do mês.
 */

import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const CARGO_INFO = {
  soc: { l: 'Sócio',             ordem: 6 },
  asc: { l: 'Associado',         ordem: 5 },
  snr: { l: 'Advogado Sênior',   ordem: 4 },
  pln: { l: 'Advogado Pleno',    ordem: 3 },
  jnr: { l: 'Advogado Júnior',   ordem: 2 },
  ass: { l: 'Assistente Jurídico', ordem: 1 },
  est: { l: 'Estagiário',        ordem: 0 },
};

const ESP_LABEL = {
  tributario:'Tributário', contencioso:'Contencioso', trabalhista:'Trabalhista',
  criminal:'Criminal', societario:'Societário', civil:'Civil',
  consumidor:'Consumidor', ambiental:'Ambiental', administrativo:'Administrativo',
  familia:'Família', imobiliario:'Imobiliário', empresarial:'Empresarial',
};

// Placeholder SVG com iniciais e fundo navy
function _avatar(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%232E4270'/%3E%3Ctext x='18' y='23' font-size='12' font-weight='700' fill='%23C9A227' text-anchor='middle' font-family='DM Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E`;
}

// Ícone de empresa (iniciais douradas em fundo navy)
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
      const prod      = func.produtividade ?? func.desemp ?? Math.floor(60 + Math.random()*35);
      const prodColor = prod >= 80 ? 'var(--verde2)' : prod >= 60 ? 'var(--amber)' : 'var(--verm2)';
      const dots      = [1,2,3].map(i => `<span style="width:6px;height:6px;border-radius:50%;background:${i<=Math.ceil(prod/34)?prodColor:'var(--bg3)'}"></span>`).join('');

      return `
      <div class="esc-membro">
        <img class="esc-membro-avatar" src="${_avatar(nome)}" alt="${nome}">
        <div class="esc-membro-info">
          <div class="esc-membro-nome">${nome}</div>
          <div class="esc-membro-cargo">${cargo}</div>
          <div class="esc-membro-esp" style="color:var(--txt4)">${esp}</div>
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
    // Re-renderizar painel
    const el = document.getElementById('esc-equipe-embed');
    if (el && window.JOGADOR) window.renderEquipePainel(window.JOGADOR, escId, el);
  } catch (e) {
    console.error('[DEMITIR]', e);
    toast('Erro ao demitir funcionário.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// CLIENTES CORPORATIVOS
// ════════════════════════════════════════════════════════
window.renderClientesPainel = async function(j, escId, el) {
  try {
    const procsSnap = await getDocs(
      query(collection(db, 'processos'), where('escritorio_id', '==', escId))
    );

    const procs = procsSnap.docs.map(d => d.data());

    // Agrupar por cliente
    const clienteMap = {};
    procs.forEach(p => {
      const nome = p.autor || p.reu || 'Cliente Desconhecido';
      if (!clienteMap[nome]) {
        clienteMap[nome] = {
          nome,
          processos: 0,
          faturamento: 0,
          area: p.area || p.especialidade || '—',
          tipo: p.tipo_cliente || p.setor || '—',
        };
      }
      clienteMap[nome].processos   += 1;
      clienteMap[nome].faturamento += p.valor || 0;
      if (p.area || p.especialidade) clienteMap[nome].area = ESP_LABEL[p.area||p.especialidade] || p.area || p.especialidade;
    });

    // Pagamento mensal estimado (0.8% do faturamento/mês)
    Object.values(clienteMap).forEach(c => {
      c.pagMensal = Math.max(500, Math.round(c.faturamento * 0.008));
    });

    // Ordenar por maior pagamento mensal
    const clientes   = Object.values(clienteMap).sort((a, b) => b.pagMensal - a.pagMensal);
    const top5       = clientes.slice(0, 5);
    const temMais    = clientes.length > 5;

    if (top5.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:1.2rem 0">
          <div style="font-size:.78rem;color:var(--txt3);margin-bottom:.8rem">Nenhum cliente corporativo ainda.</div>
          <button class="btn btn-sec btn-sm" onclick="window.navTo('processos',null)">Ver processos</button>
        </div>`;
      return;
    }

    const rows = top5.map(c => `
      <div class="esc-cliente">
        ${_logoEmpresa(c.nome)}
        <div class="esc-cliente-info">
          <div class="esc-cliente-nome">${c.nome}</div>
          <div class="esc-cliente-tipo">${c.tipo !== '—' ? c.tipo : c.area}</div>
        </div>
        <div class="esc-cliente-stats">
          <div class="esc-cliente-procs">${c.processos} processo${c.processos!==1?'s':''}</div>
          <div class="esc-cliente-area" style="color:var(--txt4)">${c.area}</div>
          <div class="esc-cliente-pag">${_fmt(c.pagMensal)}/mês</div>
        </div>
      </div>`).join('');

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
// OPORTUNIDADES DO MÊS
// ════════════════════════════════════════════════════════
window.renderOportunidadesPainel = async function(j, escId, el) {
  try {
    const eventsSnap = await getDocs(
      query(collection(db, 'eventos'), where('ativo', '==', true), limit(50))
    );

    const todas = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const top5  = todas.slice(0, 5);
    const temMais = todas.length > 5;

    if (top5.length === 0) {
      el.innerHTML = '';
      return;
    }

    const rows = top5.map(op => `
      <div class="esc-opport">
        <div class="esc-opport-icone">${op.icone || '🌟'}</div>
        <div>
          <div class="esc-opport-titulo">${op.titulo || 'Oportunidade'}</div>
          ${op.descricao ? `<div class="esc-opport-desc">${op.descricao}</div>` : ''}
        </div>
      </div>`).join('');

    el.innerHTML = `
      <div class="esc-card-bloco esc-opport-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.8rem;border-bottom:1px solid var(--borda-sub);padding-bottom:.5rem">
          <div class="secao-titulo" style="font-size:.88rem;font-weight:700">Oportunidades do Mês</div>
          ${temMais ? `<a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todas (${todas.length})</a>` : ''}
        </div>
        ${rows}
      </div>`;

  } catch (err) {
    console.error('[OPORTUNIDADES PAINEL]', err);
    el.innerHTML = '';
  }
};
