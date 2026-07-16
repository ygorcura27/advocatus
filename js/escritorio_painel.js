/**
 * ESCRITÓRIO PAINEL — Advocatus Online
 * Equipe, Clientes Corporativos e Oportunidades do mês.
 */

import { collection, query, where, orderBy, limit, getDocs, doc, deleteDoc,
  getDoc, updateDoc, arrayUnion, arrayRemove }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const CARGO_INFO = {
  soc: { l: 'Sócio',               ordem: 6, sal: 65000 },
  asc: { l: 'Associado',           ordem: 5, sal: 35000 },
  snr: { l: 'Advogado Sênior',     ordem: 4, sal: 9000  },
  pln: { l: 'Advogado Pleno',      ordem: 3, sal: 5500  },
  jnr: { l: 'Advogado Júnior',     ordem: 2, sal: 3500  },
  ass: { l: 'Assistente Jurídico', ordem: 1, sal: 2500  },
  est: { l: 'Estagiário',          ordem: 0, sal: 1700  },
};

const ESP_LABEL = {
  tributario:'Tributário', contencioso:'Contencioso', trabalhista:'Trabalhista',
  criminal:'Criminal', societario:'Societário', civil:'Civil',
  consumidor:'Consumidor', ambiental:'Ambiental', administrativo:'Administrativo',
  familia:'Família', imobiliario:'Imobiliário', empresarial:'Empresarial',
};

function _avatarSvg(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='153' height='153'%3E%3Ccircle cx='76' cy='76' r='76' fill='%231E293C'/%3E%3Ctext x='76' y='96' font-size='36' font-weight='700' fill='%23D9B573' text-anchor='middle' font-family='IBM Plex Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E`;
}

// Função global de fallback: garante que quotes no SVG não quebrem o onerror
window._svgNpcFallback = function(el, nome) {
  el.onerror = null;
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  el.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="153" height="153">' +
    '<circle cx="76" cy="76" r="76" fill="#1E293C"/>' +
    '<text x="76" y="96" font-size="36" font-weight="700" fill="#D9B573" text-anchor="middle" font-family="IBM Plex Sans,Arial">' + ini + '</text>' +
    '</svg>'
  );
};

// Retorna src da foto do NPC; cai para SVG com iniciais se não tiver foto
function _avatarSrc(func) {
  const nome = func.nome || func.name || '?';
  if (func.tipo === 'npc' && func.foto_npc) {
    return `img/npcs%20cartoon/${func.foto_npc}`;
  }
  return _avatarSvg(nome);
}

// Foto placeholder para cliente PF (pessoa física)
function _fotoClientePF(nome) {
  const ini = (nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  return `<div class="esc-cliente-logo">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='153' height='153'%3E%3Ccircle cx='76' cy='76' r='76' fill='%231E293C'/%3E%3Ctext x='76' y='96' font-size='36' font-weight='700' fill='%23D9B573' text-anchor='middle' font-family='IBM Plex Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E"
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

// Produtividade dinâmica: skills média / cap flat de habilidade (70%) + bônus senioridade (20%) + base (10%)
const _CARGO_BON  = { est:0,  ass:5,  jnr:10, pln:15, snr:20, asc:25, soc:30  };

function calcProdutividade(func) {
  const skills = func.skills || {};
  const vals   = Object.values(skills).filter(v => typeof v === 'number');
  const media  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 15;
  const cap    = window.HABILIDADE_CAP || 50;
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
// ATIVIDADE RECENTE DO ESCRITÓRIO (feed compacto na visão geral)
// ════════════════════════════════════════════════════════
const _ATIV_ICONE = {
  conflito_leve:'⚡', conflito_estrutural:'🔥', mediacao:'🤝', mentoria:'📚',
  promocao:'⭐', ferias:'🏖️', competicao:'🏆', saida:'👋',
  feedback_cliente:'💬', bonus:'💰', caso_importante:'⚖️',
};

window.renderAtividadeEscritorioPainel = async function(escId, el) {
  try {
    const snap = await getDocs(query(
      collection(db, 'escritorios', escId, 'log_equipe'),
      orderBy('criado_em', 'desc'),
      limit(6)
    ));

    if (snap.empty) {
      el.innerHTML = `<div style="text-align:center;padding:1rem 0;color:var(--txt4);font-size:.76rem">
        Nenhuma atividade registrada ainda.
      </div>`;
      return;
    }

    const rows = snap.docs.map(d => {
      const e     = d.data();
      const msg   = e.msg || e.texto || '';
      const icone = _ATIV_ICONE[e.tipo] || '📋';
      const data  = e.criado_em
        ? new Date(e.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
        : '';
      return `
      <div class="esc-atividade-item">
        <span class="esc-atividade-icone">${icone}</span>
        <span class="esc-atividade-texto">${msg}</span>
        <span class="esc-atividade-data">${data}</span>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="esc-atividade-feed">${rows}</div>`;
  } catch (err) {
    console.error('[ATIVIDADE ESCRITÓRIO]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar atividade recente.</div>';
  }
};

// ════════════════════════════════════════════════════════
// EQUIPE
// ════════════════════════════════════════════════════════
window.renderEquipePainel = async function(j, escId, el) {
  try {
    const escSnap = await getDoc(doc(db, 'escritorios', escId));
    const gestorId = escSnap.exists() ? (escSnap.data().gestor_id || null) : null;

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
      <div class="membro-row${emBurnout?' npc-em-burnout':sobrecarregado?' npc-sobrecarregado-card':''}" id="membro-${func.id}">
        <div class="membro-quem">
          <img class="membro-avatar${isNpc?' npc':''}" src="${_avatarSrc(func)}" alt="${nome}"
               onerror="window._svgNpcFallback(this,'${nome.replace(/'/g,"\\'")}')">
          <div>
            <div class="membro-nome">${nome} ${isNpc?'<span class="tag-npc">NPC</span>':''} ${func.id===gestorId?'<span style="font-size:.6rem;background:var(--ouro,#D9B573);color:#1E293C;padding:.05rem .4rem;border-radius:99px;font-weight:700;margin-left:.2rem">👑 Gestor</span>':''} ${energiaBadge}</div>
            <div class="membro-cargo">${cargo} · ${esp}</div>
            ${emBurnout
              ? `<div class="membro-gestor-tag" style="color:var(--verm3)">Burnout — ${func.burnout_npc_restante||0} mês(es) afastado</div>`
              : `<div class="membro-gestor-tag">NPC⚡ ${npcDisp}/100</div>`}
          </div>
        </div>
        <div class="membro-prod">
          <div class="membro-prod-label">Produtividade</div>
          <div class="membro-prod-bar"><div class="membro-prod-fill" style="width:${prod}%;background:${prodColor}"></div></div>
        </div>
        ${isNpc ? `
        <div class="membro-prod">
          <div class="membro-prod-label">Eficiência</div>
          <div class="membro-prod-bar"><div class="membro-prod-fill" style="width:${efic}%;background:${eficColor}"></div></div>
        </div>` : '<div></div>'}
        <div class="membro-acoes">
          <button class="membro-btn" title="Ver perfil" onclick="window._abrirPerfilFuncionario('${escId}','${func.id}')">👤</button>
          <button class="membro-btn${temProc?' em-proc':''}${emBurnout?' em-proc':''}"
            title="${emBurnout?'Em burnout':'Designar processo'}"
            onclick="${emBurnout
              ? `toast('${nome.replace(/'/g,"\\'")} está em burnout e não pode trabalhar.','ko')`
              : temProc
                ? `toast('${nome.replace(/'/g,"\\'")} já está em um processo.','ko')`
                : `window._abrirDesignarParaFunc('${escId}','${func.id}','${func.cargo_id}','membro-${func.id}')`}">
            📋
          </button>
          <button class="membro-btn membro-btn-demitir" title="Demitir" onclick="window._demitirFuncionario('${escId}','${func.id}','${nome.replace(/'/g,"\\'")}')">✕</button>
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
      const area = ESP_LABEL[c.area || c.especialidade] || c.area || c.especialidade || '—';
      const tipo = c.tipo === 'PJ' ? (c.porte ? `PJ · ${c.porte[0].toUpperCase()+c.porte.slice(1)}` : 'PJ') : (c.tipo || '—');
      const tagHtml = c.recorrente
        ? `<span class="tag tag-ganho">🔁 Recorrente</span>`
        : `<span class="tag tag-andamento">Pontual</span>`;
      return `
      <div class="docket-row" style="grid-template-columns:1fr 96px 108px">
        <span class="docket-titulo">${c.nome}<span>${tipo} · ${area}</span></span>
        <span class="docket-num" style="text-align:right">${c.valor_mensal ? _fmt(c.valor_mensal)+'/mês' : '—'}</span>
        ${tagHtml}
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
        <div class="secao-header">
          <div class="secao-titulo">Oportunidades do Mês</div>
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
        { caixa: fInc(valor), faturamento_mes_atual: fInc(valor), faturamento_honorarios_mes: fInc(valor) }),
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
        { caixa: fInc(recebe), faturamento_mes_atual: fInc(recebe), faturamento_honorarios_mes: fInc(recebe) }),
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
  negotiation:'Negociação', procedure:'Litigância', gestao:'Gestão',
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

function _skRowPerfil(label, val, max) {
  const pct = Math.round(Math.min(100, (val / max) * 100));
  return `<div class="equipe-skrow">
    <span class="equipe-skrow-l">${label}</span>
    <div class="membro-prod-bar" style="flex:1"><div class="membro-prod-fill" style="width:${pct}%;background:var(--navy3)"></div></div>
    <span class="equipe-skrow-v">${val}/${max}</span>
  </div>`;
}
function _estrelasPerfil(v, max) {
  const n = Math.round((v||0) / max * 5);
  return `<span class="equipe-estrelas">${'★'.repeat(n)}${'☆'.repeat(5-n)}</span>`;
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

  // Se for o jogador atual, pega skills_jur do documento do jogador
  const j = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const isJogador = f.uid === uid || funcId === uid;

  // NPC: mapeia skills antigas para skills_jur aproximadas se não tiver skills_jur
  const skTrad = f.skills || {};
  const cargoCapTrad = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 }[f.cargo_id] || 50;
  let skJur = isJogador ? (j?.skills_jur || {}) : (f.skills_jur || {});
  if (!isJogador && Object.keys(skJur).length === 0 && Object.keys(skTrad).length > 0) {
    // Converte skills antigas (sistema NPC) para o formato skills_jur
    // NPCs usam 'escrita' (não 'escrita_juridica') e cap proporcional ao cargo
    const cap = cargoCapTrad;
    const sk  = v => Math.round((v || 0) / cap * 50);
    skJur = {
      legal_drafting: sk(skTrad.escrita_juridica || skTrad.escrita),
      legal_research: sk((skTrad.pesquisa || 0) + (skTrad.legislacao || 0)),
      argumentation:  sk(skTrad.argumentacao),
      oral_advocacy:  sk(skTrad.oratoria),
      negotiation:    sk(skTrad.negociacao || skTrad.persuasao),
      gestao:         sk(skTrad.gestao),
      // procedure não tem equivalente no sistema antigo
    };
  }
  const temSkJur  = Object.keys(skJur).length > 0;
  const temSkTrad = false;
  const skillsHtml = `
    ${temSkJur ? `
    <div class="equipe-skrow-grupo">Skills principais</div>
    ${Object.entries(_SKILL_JUR_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}
    <details class="equipe-skills-todas">
      <summary>Ver todas as skills →</summary>
      <div class="equipe-skrow-grupo">Tipos de documento</div>
      ${Object.entries(_DOC_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}
      <div class="equipe-skrow-grupo">Áreas do direito</div>
      ${Object.entries(_AREA_JUR_LABEL).map(([k,l]) => _skRowPerfil(l, skJur[k]||0, 50)).join('')}
    </details>` : ''}
    ${temSkTrad ? `
    <div class="equipe-skrow-grupo">Habilidades</div>
    ${Object.entries(_SKILL_TRAD_LABEL).filter(([k]) => skTrad[k] != null)
        .map(([k,l]) => _skRowPerfil(l, skTrad[k]||0, cargoCapTrad)).join('')}` : ''}
    ${!temSkJur && !temSkTrad ? `<div style="text-align:center;padding:.6rem 0;font-size:.76rem;color:var(--txt4)">Nenhuma skill registrada.</div>` : ''}`;

  const isNpc  = f.tipo === 'npc';
  const prod   = calcProdutividade(f);
  const _SKILLS_REL_P = ['escrita_juridica','pesquisa','oratoria','persuasao','argumentacao'];
  const _CARGO_CAP_P  = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
  const efic = isNpc ? Math.round(Math.min(100, ((_SKILLS_REL_P.map(s => (f.skills||{})[s]||0).reduce((a,b)=>a+b,0) / _SKILLS_REL_P.length) / (_CARGO_CAP_P[f.cargo_id]||35)) * 100)) : null;
  const repInterna = f.reputacao_interna ?? 50;
  const bemEstar   = 100 - (f.estresse || 0);
  const aneis = [
    { l:'Produtividade', v:prod, cor:'var(--verde2)' },
    efic != null ? { l:'Eficiência', v:efic, cor:'var(--amber)' } : null,
    { l:'Reputação interna', v:repInterna, cor:'var(--ouro2)' },
    { l:'Bem-estar', v:bemEstar, cor: bemEstar>=60?'var(--verde2)':'var(--verm2)' },
  ].filter(Boolean);

  const salario = CARGO_INFO[f.cargo_id]?.sal || 0;
  const mesGlobal = window.SERVER?.mes_global ?? 0;
  const feriasInfo = f.em_ferias
    ? 'Em férias este mês'
    : f.ultimas_ferias_mes_total == null
      ? 'Nunca tirou férias'
      : `Última: ${mesGlobal - f.ultimas_ferias_mes_total} mês(es) atrás`;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--borda-navy);border-radius:var(--r2);width:100%;max-width:440px;max-height:88vh;overflow-y:auto;box-shadow:var(--sombra2);color:var(--txt);position:relative">
      <button onclick="this.closest('[style*=fixed]').remove()"
        style="position:absolute;top:1rem;right:1rem;background:transparent;border:none;font-size:1.1rem;cursor:pointer;color:var(--txt3)">✕</button>

      <div class="equipe-detalhe-head" style="padding:1.2rem 1.2rem .6rem">
        <img src="${avatarSrc}" alt="${nome}"
          onerror="window._svgNpcFallback(this,'${nome.replace(/'/g,"\\'")}');"
          style="width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0">
        <div>
          <div class="equipe-detalhe-nome">${nome} ${isNpc?'<span class="tag-npc">NPC</span>':'<span class="tag-voce">você</span>'}</div>
          <div class="membro-cargo">${cargo} · ${esp}</div>
          <span class="equipe-status-pill" style="margin-top:.3rem;${emBurnout?'color:var(--verm3);border-color:var(--verm3)':'color:var(--verde2);border-color:var(--verde2)'}">
            ${emBurnout ? 'Burnout' : `⚡ ${npcDisp}/100`}
          </span>
        </div>
      </div>

      <div style="padding:0 1.2rem 1.1rem">
        <div class="equipe-tabs">
          <div class="equipe-tab ativo" data-pftab="geral" onclick="window._perfilFuncTab(this,'geral')">Visão Geral</div>
          <div class="equipe-tab" data-pftab="desemp" onclick="window._perfilFuncTab(this,'desemp')">Desempenho</div>
          <div class="equipe-tab" data-pftab="hist" onclick="window._perfilFuncTab(this,'hist')">Histórico</div>
        </div>

        <div data-pfpane="geral">
          <div class="ficha-item" style="padding:.5rem 0"><span class="ficha-label">Salário</span><span class="ficha-valor">R$ ${salario.toLocaleString('pt-BR')}/mês</span></div>
          <div class="ficha-item" style="padding:.5rem 0"><span class="ficha-label">Tempo no cargo</span><span class="ficha-valor">${f.meses_no_cargo||0} meses</span></div>
          <div class="ficha-item" style="padding:.5rem 0"><span class="ficha-label">🏖️ Férias</span><span class="ficha-valor">${feriasInfo}</span></div>
        </div>

        <div data-pfpane="desemp" hidden>
          <div class="equipe-anel-row">
            ${aneis.map(a => `
            <div class="equipe-anel">
              <div class="donut" style="background:conic-gradient(${a.cor} 0% ${a.v}%, var(--bg2) ${a.v}% 100%)">
                <div class="donut-hole"><div class="donut-pct" style="font-size:.8rem">${a.v}%</div></div>
              </div>
              <div class="equipe-anel-label">${a.l}</div>
            </div>`).join('')}
          </div>
          <div class="perf-row"><span>Casos resolvidos</span><b>${f.casos_resolvidos_total||0}</b></div>
          <div class="perf-row"><span>Satisfação do cliente</span><b>${_estrelasPerfil(f.feedback_media_estrelas??3, 5)} ${(f.feedback_media_estrelas??3).toFixed(1)}</b></div>
          ${skillsHtml}
        </div>

        <div data-pfpane="hist" hidden id="perfil-func-hist">
          <div style="font-size:.76rem;color:var(--txt4);padding:.5rem 0">Carregando histórico...</div>
        </div>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // Histórico — best-effort: log_equipe do escritório mencionando o nome
  // do funcionário (não existe um índice por funcionário, filtra client-side).
  try {
    const logSnap = await getDocs(query(
      collection(db, 'escritorios', escId, 'log_equipe'),
      orderBy('criado_em', 'desc'), limit(60)
    ));
    const relevantes = logSnap.docs.map(d => d.data())
      .filter(l => (l.texto||'').includes(nome)).slice(0, 8);
    const histEl = document.getElementById('perfil-func-hist');
    if (histEl) {
      histEl.innerHTML = relevantes.length
        ? relevantes.map(l => `
          <div class="equipe-hist-item">
            <span class="equipe-hist-icone">📋</span>
            <span class="equipe-hist-texto">${l.texto}</span>
            <span class="equipe-hist-data">${l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : ''}</span>
          </div>`).join('')
        : `<div style="font-size:.76rem;color:var(--txt4);padding:.5rem 0">Nenhum evento registrado ainda.</div>`;
    }
  } catch (e) {
    const histEl = document.getElementById('perfil-func-hist');
    if (histEl) histEl.innerHTML = `<div style="font-size:.76rem;color:var(--txt4)">Erro ao carregar histórico.</div>`;
  }
};

window._perfilFuncTab = function(btn, tab) {
  btn.parentElement.querySelectorAll('.equipe-tab').forEach(t => t.classList.toggle('ativo', t === btn));
  const overlay = btn.closest('[style*=fixed]');
  overlay.querySelectorAll('[data-pfpane]').forEach(p => { p.hidden = p.dataset.pfpane !== tab; });
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
            return `<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--navy3);color:#fff;font-size:.72rem;padding:.2rem .6rem;border-radius:2px">
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

// ════════════════════════════════════════════════════════
// BANCO DE TESES — GDD v6.0 §5. Ativo permanente do escritório (não do
// processo): nota rolada no servidor (força de área + redação), Atualização%
// decai todo mês (avancar_mes.js) e sobe com manutenção. Usada como peça
// extra em Montagem de Estratégia (js/investigacao.js).
// ════════════════════════════════════════════════════════
async function _callFnTeses(nome, payload) {
  let tentativas = 0;
  while (!window.FB_FUNCTIONS && tentativas < 30) { await new Promise(r=>setTimeout(r,300)); tentativas++; }
  if (!window.FB_FUNCTIONS) throw new Error('Firebase Functions não inicializado. Recarregue a página.');
  const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
  const r = await httpsCallable(window.FB_FUNCTIONS, nome)(payload || {});
  return r.data;
}

window.renderBancoTesesPainel = async function(j, escId, el) {
  try {
    const snap = await getDocs(collection(db, 'escritorios', escId, 'teses'));
    const teses = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.criada_em||'').localeCompare(a.criada_em||''));

    const optsArea = TODAS_AREAS.map(a => `<option value="${a.k}">${a.l}</option>`).join('');

    el.innerHTML = `
      <div style="display:flex;gap:.4rem;align-items:center;margin-bottom:.8rem;flex-wrap:wrap">
        <select id="tese-nova-materia" style="flex:1;min-width:160px">${optsArea}</select>
        <button class="btn btn-sm btn-prim" onclick="window._criarTeseBanco('${escId}')">+ compor tese (30⚡)</button>
      </div>
      ${teses.length === 0 ? `<div style="font-size:.78rem;color:var(--txt3);padding:.4rem 0">Nenhuma tese composta ainda.</div>` : teses.map(t => `
        <div class="card" style="margin-bottom:.5rem;padding:.6rem .8rem">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">
            <div>
              <div style="font-weight:700;color:var(--txt);font-size:.82rem">${t.titulo || (TODAS_AREAS.find(a=>a.k===t.materia)?.l || t.materia)}</div>
              <div style="font-size:.7rem;color:var(--ardosia2)">Nota ${t.nota}/100 · Atualização ${Math.round(t.atualizacao_pct)}% · usada ${(t.historico_uso||[]).length}x</div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="window._manterTeseBanco('${escId}','${t.id}')">🔧 manter (15⚡)</button>
          </div>
          <div class="membro-prod-bar" style="height:5px;margin-top:.4rem"><div class="membro-prod-fill" style="width:${Math.round(t.atualizacao_pct)}%"></div></div>
        </div>`).join('')}`;
  } catch (e) {
    console.error('[BANCO DE TESES]', e);
    el.innerHTML = `<div style="color:var(--verm2);font-size:.78rem">Erro ao carregar Banco de Teses.</div>`;
  }
};

window._criarTeseBanco = async function(escId) {
  const materia = document.getElementById('tese-nova-materia')?.value;
  if (!materia) return;
  try {
    const r = await _callFnTeses('criarTese_banco', { escritorio_id: escId, materia });
    toast(`📚 Tese composta — nota ${r.nota}/100!`, 'ok', 5000);
    const el = document.getElementById('esc-teses-embed');
    if (el) window.renderBancoTesesPainel(window.JOGADOR, escId, el);
  } catch (e) {
    toast('Erro: ' + (e.message||'não foi possível compor a tese'), 'ko');
  }
};

window._manterTeseBanco = async function(escId, teseId) {
  try {
    const r = await _callFnTeses('manterTese_banco', { escritorio_id: escId, tese_id: teseId });
    toast(`🔧 Atualização subiu pra ${Math.round(r.atualizacao_pct)}% (teto ${Math.round(r.teto)}%).`, 'ok', 5000);
    const el = document.getElementById('esc-teses-embed');
    if (el) window.renderBancoTesesPainel(window.JOGADOR, escId, el);
  } catch (e) {
    toast('Erro: ' + (e.message||'não foi possível fazer a manutenção'), 'ko');
  }
};
