/**
 * ESCRITÓRIO PAINEL — Advocatus Online
 * Equipe, Clientes Corporativos e Oportunidades do mês.
 */

import { collection, query, where, orderBy, limit, getDocs, doc, deleteDoc,
  getDoc, updateDoc, arrayUnion, arrayRemove }
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

function _avatarSvg(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='153' height='153'%3E%3Ccircle cx='76' cy='76' r='76' fill='%232E4270'/%3E%3Ctext x='76' y='96' font-size='36' font-weight='700' fill='%23C9A227' text-anchor='middle' font-family='DM Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E`;
}

// Função global de fallback: garante que quotes no SVG não quebrem o onerror
window._svgNpcFallback = function(el, nome) {
  el.onerror = null;
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  el.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="153" height="153">' +
    '<circle cx="76" cy="76" r="76" fill="#2E4270"/>' +
    '<text x="76" y="96" font-size="36" font-weight="700" fill="#C9A227" text-anchor="middle" font-family="DM Sans,Arial">' + ini + '</text>' +
    '</svg>'
  );
};

// Retorna src da foto do NPC; cai para SVG com iniciais se não tiver foto
function _avatarSrc(func) {
  const nome = func.nome || func.name || '?';
  if (func.tipo === 'npc' && func.foto_npc) {
    return `img/npcs%20escritorio/${func.foto_npc}`;
  }
  return _avatarSvg(nome);
}

// Foto placeholder para cliente PF (pessoa física)
function _fotoClientePF(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `<div class="esc-cliente-logo">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='153' height='153'%3E%3Ccircle cx='76' cy='76' r='76' fill='%232E4270'/%3E%3Ctext x='76' y='96' font-size='36' font-weight='700' fill='%23C9A227' text-anchor='middle' font-family='DM Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E"
         alt="${nome}" style="width:100%;height:100%;object-fit:cover;border-radius:0">
  </div>`;
}

function _slugEmpresa(nome) {
  return (nome||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Tenta carregar img/empresas/{slug}.png; cai para iniciais se slug vazio ou imagem não existir
function _logoEmpresa(nome) {
  const slug = _slugEmpresa(nome);
  const ini  = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  if (!slug) {
    return `<div class="esc-cliente-logo">${ini}</div>`;
  }
  return `<div class="esc-cliente-logo" style="overflow:hidden;padding:0">
    <img src="img/empresas/${slug}.png" class="esc-emp-img" alt="${nome}"
         onerror="this.parentElement.removeAttribute('style');this.parentElement.textContent='${ini}'">
  </div>`;
}

// Constantes para aceitar/delegar oportunidades
const ACEITAR_ENERGIA = 25;
const DELEGAR_ENERGIA = { est:5, ass:5, jnr:6, pln:7, snr:8, asc:10, soc:5 };
const DELEGAR_PCT     = { est:.20, ass:.20, jnr:.30, pln:.40, snr:.50, asc:.70, soc:1.00 };

// Produtividade dinâmica: skills média / cap do cargo (70%) + bônus senioridade (20%) + base (10%)
const _SKILL_CAP  = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
const _CARGO_BON  = { est:0,  ass:5,  jnr:10, pln:15, snr:20, asc:25, soc:30  };

function calcProdutividade(func) {
  const skills = func.skills || {};
  const vals   = Object.values(skills).filter(v => typeof v === 'number');
  const media  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 15;
  const cap    = _SKILL_CAP[func.cargo_id] || 35;
  const bon    = _CARGO_BON[func.cargo_id] || 0;
  // Penalidade leve se sobrecarregado (ação em andamento com < 20% progresso)
  const pen    = (func.acao_atual && (func.acao_atual.progresso_delegado || 0) < 20) ? -5 : 0;
  return Math.min(98, Math.max(20, Math.round((media / cap) * 70 + bon + pen + 10)));
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

    const _SKILLS_REL_P  = ['escrita_juridica','pesquisa','oratoria','persuasao','argumentacao'];
    const _CARGO_CAP_P   = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
    const calcEficPainel = f => {
      const vals = _SKILLS_REL_P.map(s => (f.skills||{})[s] || 0);
      const media = vals.reduce((a,b)=>a+b,0) / vals.length;
      return Math.round(Math.min(100, (media / (_CARGO_CAP_P[f.cargo_id]||35)) * 100));
    };

    const rows = top5.map(func => {
      const cargo     = CARGO_INFO[func.cargo_id]?.l || func.cargo_id;
      const nome      = func.nome || func.name || `${cargo} #${func.id.slice(0,4)}`;
      const esp       = ESP_LABEL[func.especialidade] || func.especialidade || '—';
      const prod      = calcProdutividade(func);
      const prodColor = prod >= 80 ? 'var(--verde2)' : prod >= 60 ? 'var(--amber)' : 'var(--verm2)';
      const dots      = [1,2,3].map(i =>
        `<span style="width:6px;height:6px;border-radius:50%;background:${i<=Math.ceil(prod/34)?prodColor:'var(--bg3)'}"></span>`
      ).join('');

      const temProc = !!func.processo_id;
      const emBurnout = !!func.burnout_npc;
      const npcUsado  = func.energia_npc_usada_mes || 0;
      const npcDisp   = (window.NPC_ENERGIA_MES || 100) - npcUsado;
      const sobrecarregado = !emBurnout && npcDisp < (window.NPC_OVERLOAD_TH || 20);
      const energiaBadge = window._npcEnergiaBadge ? window._npcEnergiaBadge(func) : '';

      const isNpc     = func.tipo === 'npc';
      const efic      = isNpc ? calcEficPainel(func) : null;
      const eficColor = efic >= 80 ? 'var(--verde2)' : efic >= 55 ? 'var(--amber)' : 'var(--verm2)';

      return `
      <div class="esc-membro${emBurnout?' npc-em-burnout':sobrecarregado?' npc-sobrecarregado-card':''}" id="membro-${func.id}">
        <img class="esc-membro-avatar" src="${_avatarSrc(func)}" alt="${nome}"
             onerror="window._svgNpcFallback(this,'${nome.replace(/'/g,"\\'")}')">
        <div class="esc-membro-info">
          <div class="esc-membro-nome">${nome} ${energiaBadge}</div>
          <div class="esc-membro-cargo">${cargo}</div>
          <div class="esc-membro-esp">${esp}</div>
          ${emBurnout
            ? `<div style="font-size:.6rem;color:var(--verm2)">Burnout — ${func.burnout_npc_restante||0} mês(es) afastado</div>`
            : `<div style="font-size:.6rem;color:var(--txt4)">NPC⚡ ${npcDisp}/100</div>`}
        </div>
        <div class="esc-membro-prod">
          <div class="esc-membro-prod-label">Produtividade</div>
          <div class="esc-membro-prod-val" style="color:${prodColor}">${prod}%</div>
          <div style="display:flex;gap:3px;margin-top:2px">${dots}</div>
        </div>
        ${isNpc ? `
        <div class="esc-membro-prod" style="min-width:62px">
          <div class="esc-membro-prod-label">Eficiência</div>
          <div class="esc-membro-prod-val" style="color:${eficColor}">${efic}%</div>
        </div>` : ''}
        <div class="esc-membro-acoes">
          <button class="esc-membro-btn" title="Ver perfil" onclick="window._abrirPerfilFuncionario('${escId}','${func.id}')">👤</button>
          <button class="esc-membro-btn${temProc?' em-proc':''}${emBurnout?' em-proc':''}"
            title="${emBurnout?'Em burnout':'Designar processo'}"
            onclick="${emBurnout
              ? `toast('${nome.replace(/'/g,"\\'")} está em burnout e não pode trabalhar.','ko')`
              : temProc
                ? `toast('${nome.replace(/'/g,"\\'")} já está em um processo.','ko')`
                : `window._abrirDesignarParaFunc('${escId}','${func.id}','${func.cargo_id}','membro-${func.id}')`}">
            📋
          </button>
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
// OPORTUNIDADES DO MÊS — com aceitar/delegar
// ════════════════════════════════════════════════════════
window.renderOportunidadesPainel = async function(j, escId, el) {
  try {
    const opSnap = await getDocs(query(
      collection(db, 'escritorios', escId, 'oportunidades'),
      where('status', '==', 'disponivel'),
      limit(20)
    ));

    const todas   = opSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const top5    = todas.slice(0, 5);
    const temMais = todas.length > 5;

    const ESP_L = { tributario:'Tributário', contencioso:'Contencioso', trabalhista:'Trabalhista', criminal:'Criminal', societario:'Societário', civil:'Civil', consumidor:'Consumidor', ambiental:'Ambiental', administrativo:'Administrativo', familia:'Família', imobiliario:'Imobiliário', empresarial:'Empresarial' };

    const TIPO_LABEL = {
      consulta:    '📋 Consulta Jurídica',
      parecer:     '📑 Parecer Jurídico',
      contrato:    '📄 Elaboração de Contrato',
      notificacao: '📨 Notificação Extrajudicial',
      cobranca:    '💰 Cobrança / Recuperação',
    };
    const TIPO_COR = {
      consulta:    'var(--verde2)',
      parecer:     'var(--amber)',
      contrato:    'var(--navy3)',
      notificacao: 'var(--txt3)',
      cobranca:    'var(--verm2)',
    };

    const energiaUsada = j.energia_usada_mes || 0;
    const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
    const energiaDisp  = Math.max(0, energiaTotal - energiaUsada);

    const rows = top5.map(op => {
      const valor    = op.valor_estimado || op.valor || 0;
      const area     = ESP_L[op.area || op.especialidade] || op.area || '';
      const cliente  = op.nome_cliente || op.cliente || '';
      const podAceit = energiaDisp >= ACEITAR_ENERGIA;
      const tipoLabel = TIPO_LABEL[op.tipo] || op.tipo || 'Serviço Jurídico';
      const tipoCor   = TIPO_COR[op.tipo] || 'var(--navy3)';
      const fotoBloco = op.cliente_tipo === 'PJ'
        ? _logoEmpresa(cliente)
        : _fotoClientePF(cliente);

      return `
      <div class="esc-opport" id="opport-${op.id}" style="align-items:start;padding:.5rem .6rem">
        ${fotoBloco}
        <div style="flex:1;min-width:0">
          <div style="margin-bottom:.3rem">
            <span style="font-size:.6rem;font-weight:700;padding:.12rem .4rem;border-radius:6px;background:${tipoCor}20;color:${tipoCor};border:1px solid ${tipoCor}">${tipoLabel}</span>
          </div>
          <div class="esc-opport-titulo" style="margin-bottom:.15rem">${cliente || 'Cliente'}</div>
          ${area ? `<div style="font-size:.63rem;color:var(--txt4)">📁 ${area}</div>` : ''}
          ${op.descricao ? `<div class="esc-opport-desc">${op.descricao}</div>` : ''}
          <div style="font-size:.82rem;font-weight:700;color:var(--verde2);margin-top:.35rem;font-variant-numeric:tabular-nums">${valor ? _fmt(valor) : '—'}</div>
          <div style="font-size:.6rem;color:var(--txt4);margin-top:.1rem">⚡${op.energia||25} energia · +${op.confianca_gerada||0} confiança</div>
        </div>
        <div class="esc-opport-acoes">
          <button class="btn btn-sm btn-prim esc-opbtn"
            title="Aceitar pessoalmente — 25⚡ — 100% do valor"
            onclick="${podAceit ? `window._aceitarOpPessoalmente('${escId}','${op.id}',${valor})` : `toast('⚡ Energia insuficiente (${energiaDisp}/${ACEITAR_ENERGIA}).','ko')`}"
            style="${!podAceit?'opacity:.45;cursor:not-allowed':''}">
            ⚡25 Aceitar
          </button>
          <button class="btn btn-sm btn-sec esc-opbtn"
            onclick="window._mostrarDelegacaoPicker('${escId}','${op.id}',${valor},'opport-${op.id}')">
            Delegar ↓
          </button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.6rem;border-bottom:1px solid var(--borda-sub);padding-bottom:.5rem">
          <div class="secao-titulo" style="font-size:.88rem;font-weight:700">Oportunidades do Mês</div>
          ${temMais
            ? `<a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todas (${todas.length})</a>`
            : `<a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todas</a>`}
        </div>
        <div style="font-size:.64rem;color:var(--txt4);margin-bottom:.5rem">⚡ Energia disponível: <b style="color:${energiaDisp>50?'var(--verde2)':energiaDisp>20?'var(--amber)':'var(--verm2)'}">${energiaDisp}/${energiaTotal}</b></div>
        ${top5.length === 0
          ? `<div style="font-size:.78rem;color:var(--txt3);text-align:center;padding:.8rem 0">Sem oportunidades do mês no momento.</div>`
          : rows}
      </div>`;

  } catch (err) {
    console.error('[OPORTUNIDADES PAINEL]', err);
    el.innerHTML = '';
  }
};

// ─── Aceitar pessoalmente: 25⚡, 100% do valor pro caixa ──────────────────
window._aceitarOpPessoalmente = async function(escId, opId, valor) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < ACEITAR_ENERGIA) {
    toast(`⚡ Energia insuficiente (requer ${ACEITAR_ENERGIA}).`, 'ko');
    return;
  }

  try {
    const { doc: fDoc, updateDoc: fUpd, increment: fInc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fDb } = await import('./firebase-init.js');

    await Promise.all([
      fUpd(fDoc(fDb, 'jogadores', uid),
        { energia_usada_mes: energiaUsada + ACEITAR_ENERGIA }),
      fUpd(fDoc(fDb, 'escritorios', escId),
        { caixa: fInc(valor), faturamento_mes_atual: fInc(valor) }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'oportunidades', opId),
        { status: 'aceita', aceito_por: 'dono', valor_recebido: valor, aceito_em: new Date().toISOString() }),
    ]);

    j.energia_usada_mes = energiaUsada + ACEITAR_ENERGIA;
    window.JOGADOR = j;
    toast(`✅ +${_fmt(valor)} no caixa do escritório!`, 'ok');

    const elOp = document.getElementById('esc-oportunidades-bloco');
    if (elOp) window.renderOportunidadesPainel(j, escId, elOp);
  } catch (e) {
    console.error('[ACEITAR OP]', e);
    toast('Erro ao aceitar oportunidade.', 'ko');
  }
};

// ─── Mostrar picker de funcionários para delegar ──────────────────────────
window._mostrarDelegacaoPicker = async function(escId, opId, valor, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Toggle: fechar se já aberto
  const existente = container.querySelector('.delegar-picker');
  if (existente) { existente.remove(); return; }

  const j = window.JOGADOR;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  let funcs = [];
  try {
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    funcs = fSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.ativo !== false)
      .sort((a, b) => (CARGO_INFO[b.cargo_id]?.ordem ?? 0) - (CARGO_INFO[a.cargo_id]?.ordem ?? 0));
  } catch (e) { console.error('[PICKER]', e); }

  const picker = document.createElement('div');
  picker.className = 'delegar-picker';

  if (!funcs.length) {
    picker.innerHTML = `<div style="font-size:.75rem;color:var(--txt3)">Nenhum funcionário ativo para delegar.</div>`;
  } else {
    const NPC_TOT = window.NPC_ENERGIA_MES || 100;
    const NPC_OVL = window.NPC_OVERLOAD_TH || 20;

    const linhas = funcs.filter(f => !f.burnout_npc).map(f => {
      const cargo  = CARGO_INFO[f.cargo_id]?.l || f.cargo_id;
      const nome   = f.nome || f.name || cargo;
      const eng    = DELEGAR_ENERGIA[f.cargo_id] || 5;
      const pct    = DELEGAR_PCT[f.cargo_id] || .20;
      const recebe = Math.round(valor * pct);
      const ok     = energiaDisp >= eng;
      const npcUsado = f.energia_npc_usada_mes || 0;
      const npcDisp  = NPC_TOT - npcUsado;
      const sobrecarg = npcDisp < NPC_OVL;
      const sobLabel  = sobrecarg ? `<span style="font-size:.58rem;color:var(--amber)"> ⚠️</span>` : '';
      return `
      <div class="delegar-picker-linha">
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:600;color:var(--txt1)">${nome}${sobLabel}</div>
          <div style="font-size:.63rem;color:var(--txt4)">${cargo} · NPC⚡ ${npcDisp}</div>
        </div>
        <div style="font-size:.67rem;text-align:right;margin-right:.5rem">
          <div style="color:${ok?'var(--amber)':'var(--verm2)'}">⚡${eng}</div>
          <div style="color:var(--verde2);font-variant-numeric:tabular-nums">${_fmt(recebe)}</div>
          <div style="color:var(--txt4)">${Math.round(pct*100)}%</div>
        </div>
        <button class="btn btn-sm btn-sec" style="font-size:.62rem;padding:.2rem .4rem;${!ok?'opacity:.4;cursor:not-allowed':''}"
          onclick="${ok ? `window._confirmarDelegacao('${escId}','${opId}',${valor},'${f.id}','${f.cargo_id}',${eng},${recebe},${sobrecarg})` : `toast('⚡ Energia insuficiente.','ko')`}">
          Delegar
        </button>
      </div>`;
    }).join('');

    const emBurnout = funcs.filter(f => f.burnout_npc);
    const avisoB = emBurnout.length
      ? `<div style="font-size:.63rem;color:var(--txt4);margin-bottom:.3rem">🔴 ${emBurnout.length} funcionário(s) em burnout não listado(s).</div>`
      : '';

    picker.innerHTML = `
      ${avisoB}
      <div style="font-size:.68rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem">Escolher funcionário:</div>
      ${linhas || '<div style="font-size:.75rem;color:var(--txt3)">Nenhum disponível.</div>'}`;
  }

  container.appendChild(picker);
};

// ─── Confirmar delegação ──────────────────────────────────────────────────
window._confirmarDelegacao = async function(escId, opId, valor, funcId, cargoId, eng, recebe, sobrecarregado = false) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < eng) {
    toast(`⚡ Energia insuficiente (requer ${eng}).`, 'ko');
    return;
  }

  if (sobrecarregado) {
    const continuar = confirm(`⚠️ Este funcionário está sobrecarregado este mês. Designar pode causar burnout. Continuar?`);
    if (!continuar) return;
  }

  try {
    const { doc: fDoc, updateDoc: fUpd, increment: fInc, getDoc: fGet } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fDb } = await import('./firebase-init.js');

    // Atualizar energia NPC ao delegar
    const CUSTO_OP_NPC = window.NPC_CUSTO_OP || 25;
    const NPC_TOT      = window.NPC_ENERGIA_MES || 100;
    const NPC_OVL      = window.NPC_OVERLOAD_TH || 20;

    const fSnap = await fGet(fDoc(fDb, 'escritorios', escId, 'funcionarios', funcId));
    const fData = fSnap.exists() ? fSnap.data() : {};
    const npcNova = (fData.energia_npc_usada_mes || 0) + CUSTO_OP_NPC;
    const novosMeses = npcNova >= NPC_TOT - NPC_OVL
      ? (fData.meses_sobrecarregado || 0) + 1
      : 0;

    await Promise.all([
      fUpd(fDoc(fDb, 'jogadores', uid),
        { energia_usada_mes: energiaUsada + eng }),
      fUpd(fDoc(fDb, 'escritorios', escId),
        { caixa: fInc(recebe), faturamento_mes_atual: fInc(recebe) }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'oportunidades', opId),
        { status: 'delegada', delegado_func_id: funcId, delegado_cargo: cargoId,
          valor_recebido: recebe, valor_total: valor, aceito_em: new Date().toISOString() }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'funcionarios', funcId),
        { energia_npc_usada_mes: npcNova, meses_sobrecarregado: novosMeses }),
    ]);

    j.energia_usada_mes = energiaUsada + eng;
    window.JOGADOR = j;

    const pctLabel = Math.round((DELEGAR_PCT[cargoId] || .20) * 100);
    toast(`✅ Delegado! +${_fmt(recebe)} no caixa (${pctLabel}% de ${_fmt(valor)}).`, 'ok');

    const elOp = document.getElementById('esc-oportunidades-bloco');
    if (elOp) window.renderOportunidadesPainel(j, escId, elOp);
  } catch (e) {
    console.error('[DELEGAR OP]', e);
    toast('Erro ao delegar oportunidade.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// PERFIL DO FUNCIONÁRIO
// ════════════════════════════════════════════════════════

const _SKILL_JUR_LABEL = {
  legal_drafting:'Redação Jurídica', legal_research:'Pesquisa Jurídica',
  argumentation:'Argumentação', oral_advocacy:'Sustentação Oral',
  negotiation:'Negociação', procedure:'Processo Civil',
};
const _DOC_LABEL = {
  doc_initial_filing:'Petição Inicial', doc_responsive_pleading:'Contestação',
  doc_motion:'Requerimento', doc_appellate_brief:'Razões de Apelação',
  doc_supreme_brief:'Razões de Rec. Especial', doc_trial_brief:'Memoriais',
  doc_evidence:'Prova Documental', doc_deposition:'Depoimento',
};
const _AREA_JUR_LABEL = {
  area_employment:'Trabalhista', area_tax:'Tributário', area_civil:'Cível',
  area_criminal:'Criminal', area_corporate:'Empresarial',
  area_immigration:'Imigração', area_bankruptcy:'Rec. Judicial',
};
const _SKILL_TRAD_LABEL = {
  escrita_juridica:'Escrita Jurídica', pesquisa:'Pesquisa', oratoria:'Oratória',
  persuasao:'Persuasão', argumentacao:'Argumentação', negociacao:'Negociação',
  gestao:'Gestão', networking:'Networking',
};

function _skBarPerfil(val, max) {
  const pct = Math.round(Math.min(100, (val / max) * 100));
  return `<div style="flex:1;height:4px;background:#e0e0e0;border-radius:2px">
    <div style="width:${pct}%;height:100%;background:#1B2A4A;border-radius:2px"></div>
  </div>`;
}
function _skRowPerfil(label, val, max) {
  return `<div style="display:flex;align-items:center;gap:.5rem;padding:.2rem 0">
    <span style="flex:0 0 140px;font-size:.73rem;color:#444">${label}</span>
    ${_skBarPerfil(val, max)}
    <span style="font-size:.72rem;font-weight:600;min-width:36px;text-align:right;color:#111">${val}/${max}</span>
  </div>`;
}

window._abrirPerfilFuncionario = async function(escId, funcId) {
  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) { toast('Funcionário não encontrado.', 'ko'); return; }
  const f    = snap.data();
  const nome = f.nome || f.name || 'Funcionário';
  const cargo     = CARGO_INFO[f.cargo_id]?.l || f.cargo_id || '—';
  const esp       = ESP_LABEL[f.especialidade] || f.especialidade || '—';
  const emBurnout = !!f.burnout_npc;
  const npcDisp   = (window.NPC_ENERGIA_MES || 100) - (f.energia_npc_usada_mes || 0);
  const avatarSrc = _avatarSrc(f);

  // Skills jurídicas (novo sistema)
  const skJur = f.skills_jur || {};
  const temSkJur = Object.values(skJur).some(v => v > 0);

  // Skills tradicionais (sistema antigo / NPCs)
  const skTrad = f.skills || {};
  const cargoCapTrad = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 }[f.cargo_id] || 50;
  const temSkTrad = Object.values(skTrad).some(v => v > 0);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `
    <div style="background:#fff;border:2px solid #111;border-radius:10px;width:100%;max-width:440px;max-height:88vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.4);color:#111">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:.9rem;padding:1.2rem 1.2rem .8rem;border-bottom:1px solid #ddd">
        <img src="${avatarSrc}" alt="${nome}"
          onerror="window._svgNpcFallback(this,'${nome.replace(/'/g,"\\'")}');"
          style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.95rem;color:#111">${nome}</div>
          <div style="font-size:.75rem;color:#555">${cargo} · ${esp}</div>
          <div style="display:flex;gap:.4rem;margin-top:.3rem;flex-wrap:wrap">
            ${emBurnout
              ? `<span style="font-size:.65rem;background:#c0392b;color:#fff;padding:.15rem .5rem;border-radius:10px">Burnout</span>`
              : `<span style="font-size:.65rem;background:#f0f0f0;color:#333;padding:.15rem .5rem;border-radius:10px">⚡ ${npcDisp}/100</span>`}
          </div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()"
          style="background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:#888;align-self:flex-start">✕</button>
      </div>

      <div style="padding:.9rem 1.2rem">

        ${temSkJur ? `
        <div style="font-size:.72rem;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Skills Jurídicas</div>
        ${Object.entries(_SKILL_JUR_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}

        <details style="margin-top:.6rem">
          <summary style="font-size:.72rem;color:#555;cursor:pointer;margin-bottom:.3rem">Tipos de Documento</summary>
          ${Object.entries(_DOC_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}
        </details>

        <details style="margin-top:.4rem">
          <summary style="font-size:.72rem;color:#555;cursor:pointer;margin-bottom:.3rem">Áreas do Direito</summary>
          ${Object.entries(_AREA_JUR_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}
        </details>
        ` : ''}

        ${temSkTrad ? `
        <div style="font-size:.72rem;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-top:${temSkJur?'1rem':0};margin-bottom:.4rem">Habilidades</div>
        ${Object.entries(_SKILL_TRAD_LABEL)
            .filter(([k]) => skTrad[k] != null)
            .map(([k,l]) => _skRowPerfil(l, skTrad[k]||0, cargoCapTrad)).join('')}
        ` : ''}

        ${!temSkJur && !temSkTrad ? `
        <div style="text-align:center;padding:1rem 0;font-size:.78rem;color:#888">Nenhuma skill registrada.</div>
        ` : ''}
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// ════════════════════════════════════════════════════════
// ESPECIALIZAÇÕES DO ESCRITÓRIO
// Máx de áreas por tier: 1→1, 2→2, 3→3, 4→4, 5→todas
// ════════════════════════════════════════════════════════

const TODAS_AREAS = [
  { k:'civil',         l:'Cível'          },
  { k:'tributario',    l:'Tributário'      },
  { k:'trabalhista',   l:'Trabalhista'     },
  { k:'criminal',      l:'Criminal'        },
  { k:'empresarial',   l:'Empresarial'     },
  { k:'societario',    l:'Societário'      },
  { k:'consumidor',    l:'Consumidor'      },
  { k:'familia',       l:'Família'         },
  { k:'imobiliario',   l:'Imobiliário'     },
  { k:'contencioso',   l:'Contencioso'     },
  { k:'ambiental',     l:'Ambiental'       },
  { k:'administrativo',l:'Administrativo'  },
];
const MAX_AREAS_TIER = { 1:1, 2:2, 3:3, 4:4, 5:99 };

window.renderEspecializacoesEsc = async function(escId, el) {
  const j = window.JOGADOR;
  if (!j || !escId) return;

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) return;
  const esc = escSnap.data();

  const tier   = esc.tier || esc.nivel || 1;
  const maxAr  = MAX_AREAS_TIER[tier] ?? 1;
  const areas  = esc.areas_atuacao?.length
    ? esc.areas_atuacao
    : [esc.especialidade_principal || j.especialidade || 'civil'];
  const isSocio = (esc.socios_uids || []).includes(j.uid || window.JOGADOR_UID);

  function renderizar() {
    const podeAdicionar = isSocio && areas.length < maxAr;
    const podeRemover   = isSocio && areas.length > 1;
    const disponíveis   = TODAS_AREAS.filter(a => !areas.includes(a.k));

    el.innerHTML = `
      <div style="margin-top:1.2rem;border-top:1px solid var(--borda2);padding-top:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
          <div style="font-weight:600;font-size:.88rem">Especializações</div>
          <span style="font-size:.7rem;color:var(--ardosia2)">Tier ${tier} · ${areas.length}/${maxAr === 99 ? 'ilimitado' : maxAr} área(s)</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem">
          ${areas.map(a => {
            const lbl = TODAS_AREAS.find(x => x.k === a)?.l || a;
            return `<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--navy3);color:#fff;font-size:.72rem;padding:.2rem .6rem;border-radius:12px">
              ${lbl}
              ${podeRemover ? `<button onclick="window._removerAreaEsc('${escId}','${a}')" style="background:transparent;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:.75rem;padding:0;line-height:1">✕</button>` : ''}
            </span>`;
          }).join('')}
        </div>
        ${podeAdicionar && disponíveis.length > 0 ? `
          <select id="_sel-nova-area" style="font-size:.78rem;padding:.3rem .5rem;border:1px solid var(--borda2);border-radius:4px;background:var(--fundo2);color:inherit;margin-right:.4rem">
            <option value="">Escolher área…</option>
            ${disponíveis.map(a => `<option value="${a.k}">${a.l}</option>`).join('')}
          </select>
          <button onclick="window._adicionarAreaEsc('${escId}')" style="font-size:.78rem;padding:.3rem .7rem;border:1px solid var(--navy3);border-radius:4px;background:transparent;color:var(--navy3);cursor:pointer">+ Adicionar</button>
        ` : !podeAdicionar && isSocio ? `
          <div style="font-size:.72rem;color:var(--ardosia2)">
            ${maxAr === 99 ? 'Todas as áreas disponíveis.' : `Máximo de áreas para Tier ${tier} atingido. Faça upgrade para desbloquear mais.`}
          </div>
        ` : ''}
      </div>`;
  }

  renderizar();
};

window._adicionarAreaEsc = async function(escId) {
  const sel = document.getElementById('_sel-nova-area');
  if (!sel?.value) { toast('Selecione uma área.', 'ko'); return; }
  const novaArea = sel.value;
  try {
    await updateDoc(doc(db, 'escritorios', escId), { areas_atuacao: arrayUnion(novaArea) });
    toast(`✅ ${TODAS_AREAS.find(a=>a.k===novaArea)?.l||novaArea} adicionado às especializações.`, 'ok');
    const el = document.getElementById('esc-especializacoes-bloco');
    if (el) window.renderEspecializacoesEsc(escId, el);
  } catch(e) { toast('Erro ao adicionar área.', 'ko'); }
};

window._removerAreaEsc = async function(escId, area) {
  const lbl = TODAS_AREAS.find(a=>a.k===area)?.l || area;
  if (!confirm(`Remover "${lbl}" das especializações? Casos desta área em andamento não são afetados.`)) return;
  try {
    await updateDoc(doc(db, 'escritorios', escId), { areas_atuacao: arrayRemove(area) });
    toast(`${lbl} removido das especializações.`, 'ok');
    const el = document.getElementById('esc-especializacoes-bloco');
    if (el) window.renderEspecializacoesEsc(escId, el);
  } catch(e) { toast('Erro ao remover área.', 'ko'); }
};
