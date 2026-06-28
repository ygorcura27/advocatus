/**
 * PROCESSOS DO ESCRITÓRIO — pool, fase recursal, histórico
 * Layout de 3 colunas no painel do escritório.
 */

import { collection, query, where, orderBy, limit, getDocs, addDoc, doc, updateDoc, getDoc, increment }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ─── Constantes do pool de processos ─────────────────────────────────────────

const SKILLS_REL     = ['escrita_juridica', 'pesquisa', 'oratoria', 'persuasao', 'argumentacao'];
const CARGO_MULT     = { est:.30, ass:.42, jnr:.58, pln:.70, snr:.85, asc:.94, soc:1.00 };
const CARGO_CAP_P    = { est:20,  ass:35,  jnr:45,  pln:55,  snr:65,  asc:80,  soc:100  };
const CARGO_L_P      = { est:'Estagiário', ass:'Assistente', jnr:'Jur. Júnior', pln:'Jur. Pleno', snr:'Jur. Sênior', asc:'Associado', soc:'Sócio' };

const TIER_ORDER     = { D:0, C:1, B:2, A:3, S:4 };
const CARGO_TIER_MAX = { est:'D', ass:'C', jnr:'B', pln:'A', snr:'S', asc:'S', soc:'S' };
const TIER_CHANCE    = { S:.10, A:.15, B:.25, C:.35, D:.50 };
const TIER_CAP_ESC   = { 1:2, 2:5, 3:7, 4:10, 5:13 };
const PROG_MES       = { est:18, ass:22, jnr:30, pln:38, snr:48, asc:55, soc:65 };

const TIER_COR = { S:'var(--verm2)', A:'var(--amber)', B:'var(--navy3)', C:'var(--verde2)', D:'var(--txt4)' };

// ─── Constantes de energia NPC ────────────────────────────────────────────────

const NPC_ENERGIA_MES = 100;
const NPC_CUSTO_PROC  = 40;   // energia NPC por processo designado
const NPC_OVERLOAD_TH = 20;   // abaixo disso, aviso de sobrecarga

// Exportar para uso em escritorio_painel.js
window.NPC_CUSTO_OP   = 25;   // energia NPC por oportunidade delegada
window.NPC_ENERGIA_MES = NPC_ENERGIA_MES;
window.NPC_OVERLOAD_TH = NPC_OVERLOAD_TH;

const PROC_TITULOS = {
  civil:          ['Ação de Cobrança','Ação de Reparação de Danos','Ação Declaratória de Nulidade','Ação de Obrigação de Fazer'],
  trabalhista:    ['Reclamação Trabalhista','Ação de Reconhecimento de Vínculo Empregatício','Ação de Horas Extras','Ação de Dano Moral'],
  tributario:     ['Mandado de Segurança Tributário','Embargos à Execução Fiscal','Ação de Restituição de Tributos','Ação Declaratória de Inexigibilidade'],
  contencioso:    ['Ação de Indenização','Ação Revisional de Contratos','Ação de Rescisão Contratual','Ação Monitória'],
  criminal:       ['Defesa em Ação Penal','Habeas Corpus','Ação de Liberdade Provisória','Revisão Criminal'],
  societario:     ['Dissolução Parcial de Sociedade','Ação de Prestação de Contas','Ação de Exclusão de Sócio','Apuração de Haveres'],
  consumidor:     ['Ação de Restituição por Vício','Ação de Reparação ao Consumidor','Ação de Revisão de Contrato'],
  administrativo: ['Mandado de Segurança','Ação Anulatória de Ato Administrativo','Ação Popular'],
  familia:        ['Ação de Alimentos','Divórcio Litigioso','Ação de Guarda','Ação de Inventário'],
  imobiliario:    ['Ação de Despejo','Ação de Usucapião','Ação de Manutenção de Posse'],
  empresarial:    ['Dissolução de Empresa','Ação de Responsabilidade de Administradores','Recuperação Extrajudicial'],
};

const AREA_DEFAULT = ['civil','trabalhista','tributario','contencioso','consumidor'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _fmtP(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n / 1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

function _clienteTier(valor_mensal) {
  if (valor_mensal >= 50000) return 'S';
  if (valor_mensal >= 20000) return 'A';
  if (valor_mensal >= 8000)  return 'B';
  if (valor_mensal >= 3000)  return 'C';
  return 'D';
}

function _tierHonorarios(tier) {
  const ranges = { D:[1500,4500], C:[5000,14000], B:[15000,38000], A:[40000,95000], S:[100000,240000] };
  const [min, max] = ranges[tier] || ranges.D;
  return Math.round((min + Math.random() * (max - min)) / 500) * 500;
}

function _randTitulo(area) {
  const lista = PROC_TITULOS[area] || PROC_TITULOS.civil;
  return lista[Math.floor(Math.random() * lista.length)];
}

function _calcEficiencia(func) {
  const skills = func.skills || {};
  const vals   = SKILLS_REL.map(s => skills[s] || 0);
  const media  = vals.reduce((a, b) => a + b, 0) / vals.length;
  const cap    = CARGO_CAP_P[func.cargo_id] || 35;
  const mult   = CARGO_MULT[func.cargo_id] || .30;
  return Math.min(mult, (media / cap) * mult);
}

function _sentencaOutcome(efic) {
  if (efic >= .85) return _roll([.38,.45,.17]);
  if (efic >= .70) return _roll([.25,.50,.25]);
  if (efic >= .55) return _roll([.14,.48,.38]);
  if (efic >= .40) return _roll([.07,.38,.55]);
  if (efic >= .25) return _roll([.03,.25,.72]);
  return                    _roll([.01,.12,.87]);
}

function _roll([a, b]) {
  const r = Math.random();
  if (r < a) return 'procedente';
  if (r < a + b) return 'parcial';
  return 'improcedente';
}

function _podeManejar(cargoId, tierProc) {
  return TIER_ORDER[tierProc] <= TIER_ORDER[CARGO_TIER_MAX[cargoId] || 'D'];
}

function _tierBadge(tier) {
  return `<span style="font-size:.58rem;font-weight:700;padding:.1rem .35rem;border-radius:8px;background:${TIER_COR[tier]}20;color:${TIER_COR[tier]};border:1px solid ${TIER_COR[tier]}">Tier ${tier}</span>`;
}

function _barraProgresso(pct) {
  const cor = pct >= 80 ? 'var(--verde2)' : pct >= 50 ? 'var(--amber)' : 'var(--navy3)';
  return `<div style="height:4px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:.25rem">
    <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;transition:width .4s"></div>
  </div>`;
}

// ─── Checagem de energia do NPC ───────────────────────────────────────────────

function _npcEnergiaBadge(func) {
  if (func.burnout_npc) {
    return `<span class="npc-badge npc-burnout" title="Em burnout — ${func.burnout_npc_restante || 0} mês(es) restantes">🔴 Burnout</span>`;
  }
  const usado = func.energia_npc_usada_mes || 0;
  const disp  = NPC_ENERGIA_MES - usado;
  if (disp < NPC_OVERLOAD_TH) {
    return `<span class="npc-badge npc-sobrecarregado" title="Sobrecarregado este mês (${disp}⚡ restantes)">⚠️ Sobrecarregado</span>`;
  }
  return '';
}

// Exportar para uso no escritorio_painel.js
window._npcEnergiaBadge = _npcEnergiaBadge;

// ─── RENDER principal — 3 colunas ────────────────────────────────────────────

window.renderProcessosPool = async function(j, escId, el) {
  try {
    // Carregar todos os processos do pool
    const poolSnap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), orderBy('criado_em', 'desc'), limit(60))
    );
    const todos = poolSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const disponiveis  = todos.filter(p => p.status === 'disponivel');
    const emAndamento  = todos.filter(p => p.status === 'em_andamento');
    const aguardSent   = todos.filter(p => p.status === 'aguardando_sentenca');

    // Col 2: Fase recursal (processos da coleção principal vinculados a este escritório)
    let recursais = [];
    try {
      const recSnap = await getDocs(query(
        collection(db, 'processos'),
        where('pool_escritorio_id', '==', escId),
        where('status', 'in', ['recurso_pendente', 'aguardando_decisao_recurso'])
      ));
      recursais = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* sem índice ainda — deixa vazio */ }

    // Col 3: Histórico últimos 5
    let historico = [];
    try {
      const histSnap = await getDocs(
        query(collection(db, 'escritorios', escId, 'processos_pool'),
          where('status', '==', 'concluido'),
          orderBy('concluido_em', 'desc'),
          limit(5))
      );
      historico = histSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* sem índice — tenta fallback */ }

    // Gestor + tier do escritório (fonte de verdade: doc do escritório)
    let gestorNome = null;
    let tierEsc    = j.escritorio_tier || 1;
    try {
      const escSnap = await getDoc(doc(db, 'escritorios', escId));
      if (escSnap.exists()) {
        gestorNome = escSnap.data().gestor_nome || null;
        tierEsc    = escSnap.data().tier || j.escritorio_tier || 1;
      }
    } catch(e) {}
    const uid     = j.uid || window.JOGADOR_UID;

    // Coluna 1 — pool + em andamento + aguardando sentença
    const col1Html = _renderColPool(disponiveis, emAndamento, aguardSent, j, escId);

    // Coluna 2 — fase recursal
    const col2Html = _renderColRecursal(recursais);

    // Coluna 3 — histórico
    const col3Html = _renderColHistorico(historico);

    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.8rem;border-bottom:1px solid #E8ECF5;padding-bottom:.5rem">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            <div class="secao-titulo" style="font-size:.88rem;font-weight:700">⚖️ Gestão de Processos</div>
            ${gestorNome ? `<span style="font-size:.65rem;color:var(--verde2)">👤 Gestor: ${gestorNome}</span>` : ''}
          </div>
          <div style="display:flex;gap:.3rem;flex-shrink:0">
            <button class="btn btn-sm btn-ghost" style="font-size:.62rem;padding:.18rem .5rem"
              onclick="window.gerarProcessosMensais('${escId}',${tierEsc})">
              🔄 Gerar do mês
            </button>
            <button class="btn btn-sm btn-sec" style="font-size:.62rem;padding:.18rem .5rem"
              onclick="window.abrirDelegacaoGestao('${escId}')">
              👤 Delegar Gestão
            </button>
          </div>
        </div>
        <div class="proc-tres-cols">
          <div class="proc-col">
            <div class="proc-col-header">📂 Novos Processos (${disponiveis.length + emAndamento.length + aguardSent.length})</div>
            ${col1Html}
          </div>
          <div class="proc-col">
            <div class="proc-col-header">📁 Fase Recursal (${recursais.length})</div>
            ${col2Html}
          </div>
          <div class="proc-col">
            <div class="proc-col-header">✅ Histórico</div>
            ${col3Html}
          </div>
        </div>
      </div>`;

  } catch (e) {
    console.error('[PROCESSOS POOL]', e);
    el.innerHTML = `<div class="card" style="color:var(--verm2);font-size:.8rem;padding:1rem">⚠️ Erro ao carregar processos. Recarregue a página.</div>`;
  }
};

// ─── Coluna 1: Pool de novos processos ────────────────────────────────────────

function _renderColPool(disponiveis, emAndamento, aguardSent, j, escId) {
  const uid = j.uid || window.JOGADOR_UID;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  const CUSTO_DESIGN  = 5;

  // Aguardando sentença
  const rowsSent = aguardSent.map(p => `
    <div class="proc-pool-row" id="sent-${p.id}">
      <div class="proc-pool-area">⏳</div>
      <div style="flex:1;min-width:0">
        <div class="proc-pool-titulo">${p.titulo}</div>
        <div class="proc-pool-meta">${p.cliente_nome||'—'} · ${p.assumido_uid ? 'você' : (p.func_nome||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:.5rem">
        <div style="font-size:.7rem;font-weight:700;color:var(--amber)">${_fmtP(p.honorarios)}</div>
        <div style="margin-top:.1rem">${_tierBadge(p.tier||'D')}</div>
      </div>
      ${energiaDisp >= 10
        ? `<button class="btn btn-sm btn-prim" style="font-size:.62rem;padding:.2rem .45rem;white-space:nowrap"
             onclick="window._processarSentenca('${escId}','${p.id}','${uid}')">
             ⚖️ Sentença
           </button>`
        : `<span style="font-size:.6rem;color:var(--txt4)">⚡ insuf.</span>`}
    </div>`).join('');

  // Em andamento
  const rowsAnd = emAndamento.map(p => `
    <div class="proc-pool-row">
      <div class="proc-pool-area">⚙️</div>
      <div style="flex:1;min-width:0">
        <div class="proc-pool-titulo">${p.titulo}</div>
        <div class="proc-pool-meta">${p.assumido_uid === uid ? 'você' : (p.func_nome||'—')} · ${p.cliente_nome||'—'}</div>
        ${_barraProgresso(p.progresso||0)}
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:.3rem">
        <div style="font-size:.68rem;font-weight:700;color:var(--navy)">${p.progresso||0}%</div>
        <div style="font-size:.6rem;color:var(--txt4)">${_fmtP(p.honorarios)}</div>
      </div>
      ${p.assumido_uid === uid
        ? `<button class="btn btn-sm btn-prim" style="font-size:.6rem;padding:.18rem .38rem;white-space:nowrap"
             onclick="window._abrirModalProcessoPool('${escId}','${p.id}')">
             Trabalhar
           </button>`
        : ''}
    </div>`).join('');

  // Disponíveis — botões "Assumir" e "Designar ↓"
  const rowsDisp = disponiveis.map(p => `
    <div class="proc-pool-row" id="proc-${p.id}">
      <div class="proc-pool-area">${p.icone||'⚖️'}</div>
      <div style="flex:1;min-width:0">
        <div class="proc-pool-titulo">${p.titulo}</div>
        <div class="proc-pool-meta">${p.cliente_nome||'—'} · ${p.area||'Civil'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:.3rem">
        <div style="font-size:.7rem;font-weight:700;color:var(--verde2)">${_fmtP(p.honorarios)}</div>
        <div style="margin-top:.1rem">${_tierBadge(p.tier||'D')}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:.2rem">
        <button class="btn btn-sm btn-prim" style="font-size:.6rem;padding:.18rem .38rem;white-space:nowrap"
          onclick="window._assumirCasoPool('${escId}','${p.id}')">
          Assumir
        </button>
        <button class="btn btn-sm btn-sec" style="font-size:.6rem;padding:.18rem .38rem;white-space:nowrap"
          onclick="window._designarProcessoPicker('${escId}','${p.id}','proc-${p.id}')">
          👥 Designar ↓
        </button>
      </div>
    </div>`).join('');

  if (!disponiveis.length && !emAndamento.length && !aguardSent.length) {
    return `<div style="font-size:.75rem;color:var(--txt3);padding:.5rem 0;text-align:center">
      Nenhum processo no pool. Use "Gerar do mês" acima.
    </div>`;
  }

  return `
    ${aguardSent.length ? `
      <div class="proc-pool-grupo">
        <div class="proc-pool-grupo-titulo" style="color:var(--amber)">⏳ Ag. sentença (${aguardSent.length})</div>
        ${rowsSent}
      </div>` : ''}
    ${disponiveis.length ? `
      <div class="proc-pool-grupo">
        <div class="proc-pool-grupo-titulo">📂 Disponíveis (${disponiveis.length})</div>
        ${rowsDisp}
      </div>` : ''}
    ${emAndamento.length ? `
      <div class="proc-pool-grupo">
        <div class="proc-pool-grupo-titulo" style="color:var(--navy3)">⚙️ Em andamento (${emAndamento.length})</div>
        ${rowsAnd}
      </div>` : ''}`;
}

// ─── Coluna 2: Fase recursal ──────────────────────────────────────────────────

function _renderColRecursal(recursais) {
  if (!recursais.length) {
    return `<div style="font-size:.75rem;color:var(--txt3);padding:.5rem 0;text-align:center">
      Nenhum processo em fase recursal.
    </div>`;
  }

  return recursais.map(p => {
    if (p.status === 'aguardando_decisao_recurso') {
      return `
      <div class="proc-recursal-row">
        <div style="font-size:.6rem;color:var(--txt4);font-family:monospace">${p.numero||'—'}</div>
        <div style="font-size:.75rem;font-weight:600;color:var(--navy);margin:.1rem 0">${p.autor||'—'} vs ${p.reu||'—'}</div>
        <div style="font-size:.63rem;color:var(--txt4)">${p.tipo||'—'} · sentença desfavorável</div>
        <div style="display:flex;gap:.35rem;margin-top:.5rem">
          <button class="btn btn-sm btn-prim" style="flex:1;font-size:.62rem"
            onclick="window.decidirRecursoSentencaProducao && window.decidirRecursoSentencaProducao('${p.id}',true)">
            ⚖️ Recorrer
          </button>
          <button class="btn btn-sm btn-ghost" style="flex:1;font-size:.62rem"
            onclick="window.decidirRecursoSentencaProducao && window.decidirRecursoSentencaProducao('${p.id}',false)">
            Aceitar
          </button>
        </div>
      </div>`;
    }
    const label = p.quem_recorre === 'jogador' ? 'Você recorreu' : 'Parte contrária recorreu';
    return `
    <div class="proc-recursal-row">
      <div style="font-size:.6rem;color:var(--txt4);font-family:monospace">${p.numero||'—'}</div>
      <div style="font-size:.75rem;font-weight:600;color:var(--navy);margin:.1rem 0">${p.autor||'—'} vs ${p.reu||'—'}</div>
      <div style="font-size:.63rem;color:var(--txt4)">${label} · ${p.instancia_seguinte||'—'}</div>
      <button class="btn btn-sm btn-prim btn-block" style="margin-top:.4rem;font-size:.62rem"
        onclick="window.jogarRecursoProducao && window.jogarRecursoProducao('${p.id}')">
        ⚖️ Sustentar Recurso
      </button>
    </div>`;
  }).join('');
}

// ─── Coluna 3: Histórico ──────────────────────────────────────────────────────

function _renderColHistorico(historico) {
  if (!historico.length) {
    return `<div style="font-size:.75rem;color:var(--txt3);padding:.5rem 0;text-align:center">
      Nenhum processo concluído ainda.
    </div>`;
  }

  return historico.map(p => {
    const cor = { procedente:'var(--verde2)', parcial:'var(--amber)', improcedente:'var(--verm2)' }[p.resultado] || 'var(--txt4)';
    const icone = { procedente:'✅', parcial:'🟡', improcedente:'❌' }[p.resultado] || '—';
    return `
    <div class="proc-hist-row">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1;min-width:0;margin-right:.4rem">
          <div style="font-size:.72rem;font-weight:600;color:var(--txt1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.titulo}</div>
          <div style="font-size:.6rem;color:var(--txt4)">${p.cliente_nome||'—'} · ${p.func_nome||'você'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.6rem;color:${cor}">${icone}</div>
          <div style="font-size:.65rem;font-weight:700;color:var(--verde2)">${_fmtP(p.valor_recebido)}</div>
        </div>
      </div>
      <div style="margin-top:.2rem">${_tierBadge(p.tier||'D')}</div>
    </div>`;
  }).join('');
}

// ─── Assumir caso pessoalmente (sem custo de energia) ────────────────────────

window._assumirCasoPool = async function(escId, procId) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;

  try {
    await updateDoc(doc(db, 'escritorios', escId, 'processos_pool', procId), {
      status:        'em_andamento',
      assumido_uid:  uid,
      assumido_nome: j.nome_personagem || 'Dono',
      func_id:       null,
      func_nome:     null,
      func_cargo:    null,
      progresso:     0,
      assumido_em:   new Date().toISOString(),
    });

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(j, escId, elPool);

    // Abrir página do processo imediatamente
    window._abrirModalProcessoPool(escId, procId);
  } catch (e) {
    console.error('[ASSUMIR CASO]', e);
    toast('Erro ao assumir caso.', 'ko');
  }
};

// ─── Modal / página do processo pool ────────────────────────────────────────

const _PROC_ACOES = [
  { id:'pesquisa',  label:'📖 Pesquisa Jurídica',  custo:10, ganho:25, desc:'Levantamento de jurisprudência e doutrina.' },
  { id:'peticao',   label:'📝 Protocolar Petição',  custo:15, ganho:35, desc:'Elaboração e protocolo de peça processual.' },
  { id:'audiencia', label:'🎤 Sustentação Oral',    custo:20, ganho:50, desc:'Audiência de instrução ou sustentação perante o tribunal.' },
];

window._abrirModalProcessoPool = async function(escId, procId) {
  let proc;
  try {
    const snap = await getDoc(doc(db, 'escritorios', escId, 'processos_pool', procId));
    if (!snap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
    proc = { id: procId, ...snap.data() };
  } catch(e) {
    toast('Erro ao carregar processo.', 'ko');
    return;
  }

  const j           = window.JOGADOR;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const energiaDisp  = Math.max(0, energiaTotal - (j.energia_usada_mes || 0));
  const prog         = proc.progresso || 0;
  const pronto       = prog >= 100 || proc.status === 'aguardando_sentenca';
  const corProg      = prog >= 80 ? 'var(--verde2)' : prog >= 50 ? 'var(--amber)' : 'var(--navy3)';

  const acoesHtml = pronto ? '' : _PROC_ACOES.map(a => {
    const temEnergia = energiaDisp >= a.custo;
    return `
    <button class="btn btn-ghost btn-block proc-acao-btn"
      style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;text-align:left;margin-bottom:.3rem;${!temEnergia ? 'opacity:.4;cursor:not-allowed' : ''}"
      onclick="${temEnergia
        ? `window._acaoProcessoPool('${escId}','${procId}','${a.id}')`
        : `toast('⚡ Energia insuficiente (${energiaDisp}/${a.custo}).','ko')`}">
      <div>
        <div style="font-weight:600;font-size:.82rem">${a.label}</div>
        <div style="font-size:.63rem;color:var(--txt3)">${a.desc}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:.8rem">
        <div style="font-size:.7rem;font-weight:700;color:var(--navy)">+${a.ganho}%</div>
        <div style="font-size:.6rem;color:var(--txt3)">-${a.custo}⚡</div>
      </div>
    </button>`;
  }).join('');

  const corpo = `
    <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.75rem .9rem;margin-bottom:1rem">
      <div style="font-size:.6rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.3rem">
        ${proc.cliente_nome||'—'} · ${proc.area||'Civil'} · ${_tierBadge(proc.tier||'D')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:.78rem;font-weight:700;color:var(--verde2)">${_fmtP(proc.honorarios)}</div>
        <div style="font-size:.65rem;color:var(--txt3)">⚡ disponível: ${energiaDisp}/${energiaTotal}</div>
      </div>
    </div>

    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--txt3);margin-bottom:.35rem">
        <span>Instrução processual</span>
        <span style="font-weight:700;color:${corProg}">${prog}%</span>
      </div>
      <div style="height:10px;background:var(--bg2);border-radius:5px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100, prog)}%;background:${corProg};border-radius:5px;transition:width .4s"></div>
      </div>
    </div>

    ${pronto
      ? `<div style="background:var(--verde-bg);border:1px solid var(--verde3);border-radius:var(--r);padding:.75rem;text-align:center;margin-bottom:1rem">
           <div style="font-size:.75rem;font-weight:700;color:var(--verde)">✅ Instrução concluída</div>
           <div style="font-size:.65rem;color:var(--txt3);margin-top:.2rem">O processo está pronto para julgamento.</div>
         </div>
         <button class="btn btn-prim btn-block" style="margin-bottom:.4rem"
           onclick="fecharModal();window._processarSentencaModal('${escId}','${procId}')">
           ⚖️ Solicitar Sentença ${energiaDisp >= 10 ? '' : '<span style=\\"font-size:.65rem\\">(⚡ insuf.)</span>'}
         </button>`
      : `<div style="font-size:.65rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem">Ações disponíveis</div>
         ${acoesHtml}`}
  `;

  abrirModal(`⚖️ ${proc.titulo}`, corpo);
};

// ─── Executar ação no processo (pesquisa / petição / audiência) ───────────────

window._acaoProcessoPool = async function(escId, procId, tipo) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const acao = _PROC_ACOES.find(a => a.id === tipo);
  if (!acao) return;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < acao.custo) {
    toast(`⚡ Energia insuficiente (requer ${acao.custo}).`, 'ko');
    return;
  }

  try {
    const snap    = await getDoc(doc(db, 'escritorios', escId, 'processos_pool', procId));
    const progAtual = snap.data()?.progresso || 0;
    const novoProg  = Math.min(100, progAtual + acao.ganho);
    const novoStatus = novoProg >= 100 ? 'aguardando_sentenca' : 'em_andamento';

    await Promise.all([
      updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: energiaUsada + acao.custo }),
      updateDoc(doc(db, 'escritorios', escId, 'processos_pool', procId), {
        progresso: novoProg,
        status:    novoStatus,
      }),
    ]);

    j.energia_usada_mes = energiaUsada + acao.custo;
    window.JOGADOR = j;
    toast(`${acao.label} concluída! +${acao.ganho}% · -${acao.custo}⚡`, 'ok');

    // Reabrir modal atualizado
    fecharModal();
    await window._abrirModalProcessoPool(escId, procId);

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(j, escId, elPool);
  } catch(e) {
    console.error('[ACAO PROCESSO POOL]', e);
    toast('Erro ao realizar ação.', 'ko');
  }
};

// ─── Solicitar sentença a partir do modal ────────────────────────────────────

window._processarSentencaModal = async function(escId, procId) {
  const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
  await window._processarSentenca(escId, procId, uid);
};

// ─── Picker de processos para NPC específico ──────────────────────────────────

window._abrirDesignarParaFunc = async function(escId, funcId, cargoId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existente = container.querySelector('.proc-func-picker');
  if (existente) { existente.remove(); return; }

  const j = window.JOGADOR;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  // Verificar energia NPC
  let func = null;
  try {
    const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
    if (fSnap.exists()) func = { id: fSnap.id, ...fSnap.data() };
  } catch (e) { /* usa defaults */ }

  const CUSTO_DONO = 5;

  let processos = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), where('status', '==', 'disponivel'))
    );
    processos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('[PROC FUNC PICKER]', e); }

  const picker = document.createElement('div');
  picker.className = 'proc-func-picker';
  picker.style.cssText = 'margin-top:.5rem;padding:.6rem .7rem;background:var(--bg2);border-radius:var(--r);border:1px solid var(--bg3);grid-column:1/-1';

  if (!processos.length) {
    picker.innerHTML = `<div style="font-size:.75rem;color:var(--txt3)">Nenhum processo disponível. Use "Gerar do mês".</div>`;
  } else {
    const npcEnergiaUsada = func?.energia_npc_usada_mes || 0;
    const npcEnergiaDisp  = NPC_ENERGIA_MES - npcEnergiaUsada;
    const npcSobrecarregado = npcEnergiaDisp < NPC_OVERLOAD_TH;

    const temEnergiaDono = energiaDisp >= CUSTO_DONO;

    const linhas = processos.map(p => {
      const podeMane = _podeManejar(cargoId, p.tier || 'D');
      const aviso    = !podeMane ? `<span style="font-size:.6rem;color:var(--amber)">⚠️ acima do cargo</span>` : '';
      return `
      <div style="display:flex;align-items:center;gap:.45rem;padding:.3rem 0;border-bottom:1px solid var(--bg3)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:600;color:var(--txt1)">${p.titulo} ${aviso}</div>
          <div style="font-size:.63rem;color:var(--txt4)">${p.cliente_nome||'—'} · ${_fmtP(p.honorarios)}</div>
        </div>
        <button class="btn btn-sm btn-prim" style="font-size:.62rem;padding:.2rem .4rem"
          onclick="window._confirmarDesignar('${escId}','${p.id}','${funcId}','${cargoId}','${(func?.nome||'Funcionário').replace(/'/g,"\\'")}')">
          ⚡${CUSTO_DONO} Designar
        </button>
      </div>`;
    }).join('');

    const avisoSobrecarga = npcSobrecarregado
      ? `<div style="font-size:.68rem;color:var(--amber);background:rgba(184,146,42,.1);border-radius:4px;padding:.3rem .5rem;margin-bottom:.4rem">
           ⚠️ Funcionário sobrecarregado (${npcEnergiaDisp} NPC⚡ restantes). Designar pode causar burnout.
         </div>`
      : `<div style="font-size:.63rem;color:var(--txt4);margin-bottom:.3rem">Capacidade NPC: ${npcEnergiaDisp}/${NPC_ENERGIA_MES}⚡</div>`;

    picker.innerHTML = `
      ${avisoSobrecarga}
      <div style="font-size:.68rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem">Escolher processo:</div>
      ${linhas}`;
  }

  container.appendChild(picker);
};

// ─── Picker de NPC para um processo ──────────────────────────────────────────

window._designarProcessoPicker = async function(escId, procId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existente = container.querySelector('.designar-picker');
  if (existente) { existente.remove(); return; }

  const j = window.JOGADOR;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  let funcs = [];
  try {
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    funcs = fSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.ativo !== false && !f.burnout_npc && !f.processo_id)
      .sort((a, b) => {
        const ord = { soc:6, asc:5, snr:4, pln:3, jnr:2, ass:1, est:0 };
        return (ord[b.cargo_id]||0) - (ord[a.cargo_id]||0);
      });
  } catch (e) { console.error('[DESIGNAR PICKER]', e); }

  let procTier = 'D';
  try {
    const pSnap = await getDoc(doc(db, 'escritorios', escId, 'processos_pool', procId));
    if (pSnap.exists()) procTier = pSnap.data().tier || 'D';
  } catch (e) { /* usa D */ }

  const picker = document.createElement('div');
  picker.className = 'designar-picker';

  const CUSTO_DONO = 5;
  const temEnergia = energiaDisp >= CUSTO_DONO;

  if (!funcs.length) {
    picker.innerHTML = `<div style="font-size:.75rem;color:var(--txt3)">Nenhum funcionário disponível (todos ocupados ou em burnout).</div>`;
  } else {
    const linhas = funcs.map(f => {
      const cargo     = CARGO_L_P[f.cargo_id] || f.cargo_id;
      const nome      = f.nome || f.name || cargo;
      const podeMane  = _podeManejar(f.cargo_id, procTier);
      const aviso     = !podeMane ? `<span style="font-size:.6rem;color:var(--amber)">⚠️ acima do cargo</span>` : '';
      const npcUsado  = f.energia_npc_usada_mes || 0;
      const npcDisp   = NPC_ENERGIA_MES - npcUsado;
      const sobrecarg = npcDisp < NPC_OVERLOAD_TH;
      const sobLabel  = sobrecarg ? `<span style="font-size:.58rem;color:var(--amber)"> ⚠️ sobrecarregado</span>` : '';
      const efic      = _calcEficiencia(f);

      return `
      <div style="display:flex;align-items:center;gap:.45rem;padding:.3rem 0;border-bottom:1px solid var(--bg3)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:600;color:var(--txt1)">${nome}${aviso}${sobLabel}</div>
          <div style="font-size:.63rem;color:var(--txt4)">${cargo} · efic. ${Math.round(efic*100)}% · NPC⚡ ${npcDisp}</div>
        </div>
        <button class="btn btn-sm btn-sec" style="font-size:.62rem;padding:.2rem .4rem;${!temEnergia?'opacity:.4;cursor:not-allowed':''}"
          onclick="${temEnergia
            ? `window._confirmarDesignar('${escId}','${procId}','${f.id}','${f.cargo_id}','${nome.replace(/'/g,"\\'")}',${sobrecarg})`
            : `toast('⚡ Energia insuficiente.','ko')`}">
          Designar
        </button>
      </div>`;
    }).join('');

    picker.innerHTML = `
      <div style="font-size:.68rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem">
        Designar advogado${!temEnergia ? ` <span style="color:var(--verm2)">(⚡ insuf.)</span>` : ''}:
      </div>
      ${linhas}`;
  }

  container.appendChild(picker);
};

// ─── Confirmar designação ─────────────────────────────────────────────────────

window._confirmarDesignar = async function(escId, procId, funcId, cargoId, nomeFunc, sobrecarregado = false) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const CUSTO_DONO = 5;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < CUSTO_DONO) {
    toast('⚡ Energia insuficiente para designar.', 'ko');
    return;
  }

  // Aviso de sobrecarga — mas permite continuar
  if (sobrecarregado) {
    const continuar = confirm(`⚠️ ${nomeFunc} está sobrecarregado este mês. Designar assim mesmo pode causar burnout. Continuar?`);
    if (!continuar) return;
  }

  try {
    // Carregar dados do funcionário para atualizar energia NPC
    const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
    const funcData = fSnap.exists() ? fSnap.data() : {};
    const npcEnergiaNova = (funcData.energia_npc_usada_mes || 0) + NPC_CUSTO_PROC;
    const novosMesesSobrecarg = npcEnergiaNova >= NPC_ENERGIA_MES - NPC_OVERLOAD_TH
      ? (funcData.meses_sobrecarregado || 0) + 1
      : 0;

    await Promise.all([
      updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO_DONO }),
      updateDoc(doc(db, 'escritorios', escId, 'processos_pool', procId), {
        status: 'em_andamento',
        func_id: funcId, func_cargo: cargoId, func_nome: nomeFunc,
        designado_em: new Date().toISOString(),
        progresso: 0,
      }),
      updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
        processo_id: procId,
        energia_npc_usada_mes: npcEnergiaNova,
        meses_sobrecarregado: novosMesesSobrecarg,
      }),
    ]);

    j.energia_usada_mes = energiaUsada + CUSTO_DONO;
    window.JOGADOR = j;
    toast(`📋 ${nomeFunc} designado para o processo. ⚡-${CUSTO_DONO}`, 'ok');

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(j, escId, elPool);
  } catch (e) {
    console.error('[CONFIRMAR DESIGNAR]', e);
    toast('Erro ao designar processo.', 'ko');
  }
};

// ─── Processar sentença ───────────────────────────────────────────────────────

window._processarSentenca = async function(escId, procId, uid) {
  const j = window.JOGADOR;

  let proc;
  try {
    const snap = await getDoc(doc(db, 'escritorios', escId, 'processos_pool', procId));
    if (!snap.exists()) return;
    proc = { id: procId, ...snap.data() };
  } catch (e) {
    toast('Erro ao carregar processo.', 'ko');
    return;
  }

  const CUSTO_SENT = 10;
  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < CUSTO_SENT) {
    toast(`⚡ Energia insuficiente (requer ${CUSTO_SENT}).`, 'ko');
    return;
  }

  const skills = j.skills || {};
  const vals   = SKILLS_REL.map(s => skills[s] || 0);
  const media  = vals.reduce((a, b) => a + b, 0) / vals.length;
  const capDono = window.REP_CAP?.[j.cargo_id] || 55;
  const efic   = Math.min(1, media / capDono);
  const resultado = _sentencaOutcome(efic);

  const hon = proc.honorarios || 0;
  const valorRecebido = resultado === 'procedente' ? hon
    : resultado === 'parcial' ? Math.round(hon * 0.55)
    : Math.round(hon * 0.1);

  const resultadoLabel = {
    procedente: '✅ Procedente!',
    parcial:    '🟡 Parcialmente procedente',
    improcedente: '❌ Improcedente',
  }[resultado];

  try {
    await Promise.all([
      updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO_SENT }),
      updateDoc(doc(db, 'escritorios', escId), {
        caixa: increment(valorRecebido),
        faturamento_mes_atual: increment(valorRecebido),
      }),
      updateDoc(doc(db, 'escritorios', escId, 'processos_pool', procId), {
        status: 'concluido',
        resultado,
        valor_recebido: valorRecebido,
        concluido_em: new Date().toISOString(),
      }),
      proc.func_id
        ? updateDoc(doc(db, 'escritorios', escId, 'funcionarios', proc.func_id), { processo_id: null })
        : Promise.resolve(),
    ]);

    j.energia_usada_mes = energiaUsada + CUSTO_SENT;
    window.JOGADOR = j;
    toast(`${resultadoLabel} +${_fmtP(valorRecebido)} no caixa.`, resultado === 'improcedente' ? 'ko' : 'ok');

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(j, escId, elPool);
  } catch (e) {
    console.error('[SENTENÇA]', e);
    toast('Erro ao processar sentença.', 'ko');
  }
};

// ─── Geração mensal de processos ──────────────────────────────────────────────

window.gerarProcessosMensais = async function(escId, tierEscritorio) {
  const s   = window.SERVER || {};
  const mes = s.mes_global || 1;

  try {
    // Ler tier e especialidade direto do documento do escritório (evita dado desatualizado do jogador)
    let realTier = tierEscritorio || 1;
    let escEsp   = null;
    try {
      const escSnap = await getDoc(doc(db, 'escritorios', escId));
      if (escSnap.exists()) {
        realTier = escSnap.data().tier || tierEscritorio || 1;
        escEsp   = escSnap.data().especialidade_principal || escSnap.data().especialidade || null;
      }
    } catch(_) {}

    const cap = TIER_CAP_ESC[realTier] || 2;

    const [clSnap, existSnap] = await Promise.all([
      getDocs(collection(db, 'escritorios', escId, 'clientes')),
      getDocs(query(collection(db, 'escritorios', escId, 'processos_pool'), where('criado_mes', '==', mes))),
    ]);
    const clientes     = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const jaGeradosMes = existSnap.size;

    if (jaGeradosMes >= cap) {
      toast(`Pool do mês cheio (${cap} processos para Tier ${realTier}).`, 'ko');
      return;
    }

    const vagasRestantes = cap - jaGeradosMes;
    const promessas = [];

    // ── 1. Processos oriundos de clientes cadastrados ─────────────────────────
    for (const cl of clientes) {
      if (promessas.length >= vagasRestantes) break;
      const tier   = _clienteTier(cl.valor_mensal || 0);
      const chance = TIER_CHANCE[tier] || .10;
      if (Math.random() > chance) continue;
      const area       = cl.area || cl.especialidade || AREA_DEFAULT[Math.floor(Math.random() * AREA_DEFAULT.length)];
      const honorarios = _tierHonorarios(tier);
      promessas.push(addDoc(collection(db, 'escritorios', escId, 'processos_pool'), {
        titulo: _randTitulo(area), cliente_id: cl.id, cliente_nome: cl.nome || 'Cliente',
        area, tier, honorarios, icone: '⚖️', status: 'disponivel', progresso: 0,
        func_id: null, func_nome: null, func_cargo: null, resultado: null,
        criado_mes: mes, criado_em: new Date().toISOString(),
      }));
    }

    // ── 2. Demanda de mercado — preenche vagas restantes até o cap do tier ────
    // (Um escritório de alto tier atrai casos mesmo sem clientes cadastrados)
    const TIER_MARKET_TIER = { 1:'D', 2:'D', 3:'C', 4:'B', 5:'A' };
    const marketTier = TIER_MARKET_TIER[realTier] || 'D';
    const areasBase  = escEsp ? [escEsp, ...AREA_DEFAULT] : AREA_DEFAULT;

    while (promessas.length < vagasRestantes) {
      const area       = areasBase[Math.floor(Math.random() * areasBase.length)];
      const honorarios = _tierHonorarios(marketTier);
      promessas.push(addDoc(collection(db, 'escritorios', escId, 'processos_pool'), {
        titulo: _randTitulo(area), cliente_id: null, cliente_nome: 'Cliente Avulso',
        area, tier: marketTier, honorarios, icone: '⚖️', status: 'disponivel', progresso: 0,
        func_id: null, func_nome: null, func_cargo: null, resultado: null,
        criado_mes: mes, criado_em: new Date().toISOString(),
      }));
    }

    await Promise.all(promessas);
    toast(`✅ ${promessas.length} processo(s) gerado(s) — pool do Tier ${realTier} atualizado!`, 'ok');

    const el = document.getElementById('esc-processos-bloco');
    if (el && window.JOGADOR) window.renderProcessosPool(window.JOGADOR, escId, el);
  } catch (e) {
    console.error('[GERAR PROCESSOS]', e);
    toast('Erro ao gerar processos.', 'ko');
  }
};

// ─── Delegar Gestão ───────────────────────────────────────────────────────────

window.abrirDelegacaoGestao = async function(escId) {
  const fSnap = await getDocs(query(
    collection(db, 'escritorios', escId, 'funcionarios'),
    where('tipo', '==', 'npc')
  ));
  const npcs = fSnap.docs.map(d => ({id: d.id, ...d.data()}))
    .filter(f => f.ativo !== false && !f.burnout_npc);

  if (npcs.length === 0) {
    toast('Nenhum NPC disponivel para assumir a gestao.', 'ko');
    return;
  }

  const CARGO_L = { est:'Estagiario', ass:'Assistente', jnr:'Junior', pln:'Pleno', snr:'Senior', asc:'Associado', soc:'Socio' };

  abrirModal('👤 Delegar Gestao do Escritorio',
    `<div style="font-size:.78rem;color:var(--txt2);margin-bottom:1rem">
      O gestor designado atribuira automaticamente processos disponiveis a equipe no inicio de cada mes.
      O dono ainda controla recursos e execucao de sentencas.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      <button class="btn btn-ghost btn-block" style="text-align:left;padding:.6rem .8rem;color:var(--verm2)"
        onclick="window.removerGestor('${escId}')">
        ❌ Remover gestor atual
      </button>
      ${npcs.map(f => `
        <button class="btn btn-ghost btn-block" style="text-align:left;padding:.6rem .8rem"
          onclick="window.salvarGestor('${escId}','${f.id}','${(f.nome||'').replace(/'/g,"\\'")}')">
          <div style="font-weight:600;font-size:.82rem">${f.nome}</div>
          <div style="font-size:.65rem;color:var(--txt3)">${CARGO_L[f.cargo_id]||f.cargo_id}</div>
        </button>`).join('')}
    </div>`
  );
};

window.salvarGestor = async function(escId, funcId, nome) {
  try {
    await updateDoc(doc(db, 'escritorios', escId), {
      gestor_id: funcId,
      gestor_nome: nome,
    });
    fecharModal();
    toast(`✅ ${nome} e o novo gestor do escritorio.`, 'ok', 4000);
    const elProc = document.getElementById('esc-processos-bloco');
    if (elProc && window.JOGADOR) window.renderProcessosPool(window.JOGADOR, escId, elProc);
  } catch(e) {
    toast('Erro ao salvar gestor: ' + e.message, 'ko');
  }
};

window.removerGestor = async function(escId) {
  try {
    await updateDoc(doc(db, 'escritorios', escId), { gestor_id: null, gestor_nome: null });
    fecharModal();
    toast('Gestor removido.', 'ok');
    const elProc = document.getElementById('esc-processos-bloco');
    if (elProc && window.JOGADOR) window.renderProcessosPool(window.JOGADOR, escId, elProc);
  } catch(e) {
    toast('Erro: ' + e.message, 'ko');
  }
};

// ─── Avanço de progresso mensal ───────────────────────────────────────────────

window.avancarProgressoMensal = async function(escId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), where('status', '==', 'em_andamento'))
    );

    const proms = [];
    for (const d of snap.docs) {
      const p = { id: d.id, ...d.data() };
      if (!p.func_cargo) continue;

      const baseGanho = PROG_MES[p.func_cargo] || 18;
      const variacao  = Math.round((Math.random() * 12) - 4);
      const ganho     = Math.max(5, baseGanho + variacao);
      const novoProg  = Math.min(100, (p.progresso || 0) + ganho);
      const novoStatus = novoProg >= 100 ? 'aguardando_sentenca' : 'em_andamento';

      proms.push(updateDoc(doc(db, 'escritorios', escId, 'processos_pool', p.id), {
        progresso: novoProg, status: novoStatus,
      }));
    }

    if (proms.length) await Promise.all(proms);

    // Reset energia NPC mensal e verificar burnout
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    const fProms = [];
    for (const fd of fSnap.docs) {
      const f = fd.data();
      const npcUsado = f.energia_npc_usada_mes || 0;
      const sobrecarg = npcUsado > NPC_ENERGIA_MES - NPC_OVERLOAD_TH;
      let novosMeses = f.meses_sobrecarregado || 0;
      let burnoutNPC = f.burnout_npc || false;
      let burnoutRest = f.burnout_npc_restante || 0;

      if (burnoutNPC) {
        burnoutRest = Math.max(0, burnoutRest - 1);
        if (burnoutRest === 0) burnoutNPC = false;
      } else if (sobrecarg) {
        novosMeses++;
        if (novosMeses >= 3) {
          burnoutNPC = true;
          burnoutRest = 3;
          novosMeses = 0;
        }
      } else {
        novosMeses = 0;
      }

      fProms.push(updateDoc(doc(db, 'escritorios', escId, 'funcionarios', fd.id), {
        energia_npc_usada_mes: 0,
        meses_sobrecarregado: novosMeses,
        burnout_npc: burnoutNPC,
        burnout_npc_restante: burnoutRest,
      }));
    }

    if (fProms.length) await Promise.all(fProms);
    console.log(`[PROGRESSO MENSAL] ${proms.length} processo(s), ${fProms.length} NPC(s) atualizados em ${escId}`);
  } catch (e) {
    console.error('[AVANCAR PROGRESSO]', e);
  }
};
