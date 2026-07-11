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
const TIER_CAP_ESC   = { 1:4, 2:8, 3:12, 4:18, 5:24 };

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

function _poolSomarMeses(m, a, delta) {
  const total = (a * 12 + m) + delta;
  return { mes: total % 12, ano: Math.floor(total / 12) };
}
function _poolMesTotal(m, a) { return (a || 1) * 12 + (m || 0); }

// Contexto preservado entre _processarSentenca e os handlers do modal
let _sentencaPoolCtx = null;

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
    // Busca sem orderBy para incluir docs sem criado_mes (processos auto-atribuídos
    // pela gestora via Cloud Function não têm esse campo). Ordena em JS depois.
    const poolSnap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), limit(80))
    );
    const todos = poolSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.criado_mes || 0) - (a.criado_mes || 0));

    const STATUSES_RECURSAL = ['recurso_pendente', 'aguardando_decisao_sentenca', 'aguardando_decisao_recurso', 'aguardando_evento', 'pronto_para_sentenca'];

    const disponiveis  = todos.filter(p => p.status === 'disponivel');
    const emAndamento  = todos.filter(p => p.status === 'em_andamento');
    const aguardSent   = todos.filter(p => p.status === 'aguardando_sentenca');
    // Pool docs assumidos pelo jogador que estão em fase recursal
    const poolRecursal = todos.filter(p => p.assumido_uid && STATUSES_RECURSAL.includes(p.status));

    // Col 2: Fase recursal — dois casos:
    // a) processos antigos do pool colaborativo (campo pool_escritorio_id)
    // b) processos assumidos via _assumirCasoPool (campo pool_proc_esc_id)
    let recursais = [];
    try {
      const recSnap = await getDocs(query(
        collection(db, 'processos'),
        where('pool_escritorio_id', '==', escId),
        where('status', 'in', ['recurso_pendente', 'aguardando_decisao_recurso', 'aguardando_decisao_sentenca', 'aguardando_evento', 'pronto_para_sentenca'])
      ));
      recursais = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* sem índice ainda — deixa vazio */ }

    // Buscar os processos ligados ao pool subcol (via processo_ref) para o Col 2
    if (poolRecursal.length > 0) {
      const refs = poolRecursal.filter(p => p.processo_ref);
      if (refs.length > 0) {
        const snaps = await Promise.all(refs.map(p => getDoc(doc(db, 'processos', p.processo_ref))));
        for (const snap of snaps) {
          if (snap.exists() && STATUSES_RECURSAL.includes(snap.data().status)) {
            recursais.push({ id: snap.id, ...snap.data() });
          }
        }
      }
    }

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

    // Gestor atual e tier real do escritório
    let gestorNome = null;
    let tierEsc    = j.escritorio_tier || 1;
    try {
      const escSnap = await getDoc(doc(db, 'escritorios', escId));
      if (escSnap.exists()) {
        const escData = escSnap.data();
        gestorNome = escData.gestor_nome || null;
        // Usar tier do documento (j.escritorio_tier pode estar desatualizado após upgrades)
        tierEsc = escData.tier || tierEsc;
      }
    } catch(e) {}

    // Diário da gestão — designações, sentenças e burnout do mês
    let diario = [];
    try {
      const diarioSnap = await getDocs(query(
        collection(db, 'escritorios', escId, 'log_gestao'), orderBy('criado_em', 'desc'), limit(12)
      ));
      diario = diarioSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { /* sem índice ainda — deixa vazio */ }

    const uid = j.uid || window.JOGADOR_UID;

    // Buscar o estado real de investigação (fase/turnos) dos casos que o
    // jogador já assumiu — sem isso a coluna "Seus casos em andamento" só
    // tinha o campo legado `progresso` (nunca atualizado pelo novo fluxo de
    // Investigação/Julgamento), então toda linha ficava presa em "0%" para
    // sempre e sem nenhuma ação para continuar o caso.
    const investigMap = {};
    const casosDoJogador = emAndamento.filter(p => p.assumido_uid === uid && p.processo_ref);
    if (casosDoJogador.length > 0) {
      const snaps = await Promise.all(casosDoJogador.map(p => getDoc(doc(db, 'processos', p.processo_ref))));
      snaps.forEach((snap, i) => {
        if (snap.exists()) investigMap[casosDoJogador[i].id] = snap.data().investigacao || null;
      });
    }

    // Coluna 1 — pool + em andamento + aguardando sentença
    const col1Html = _renderColPool(disponiveis, emAndamento, aguardSent, j, escId, investigMap);

    // Coluna 2 — fase recursal
    const mesAtualTotal = _poolMesTotal(j.mes_pessoal, j.ano_pessoal);
    const col2Html = _renderColRecursal(recursais, mesAtualTotal);

    // Coluna 3 — histórico
    const col3Html = _renderColHistorico(historico);

    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
            <div class="secao-titulo">⚖️ Gestão de Processos</div>
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
        <div style="margin-top:.9rem;border-top:1px solid #E8ECF5;padding-top:.7rem">
          <div class="proc-col-header" style="margin-bottom:.4rem">📋 Diário da Gestão</div>
          ${_renderDiarioGestao(diario)}
        </div>
      </div>`;

  } catch (e) {
    console.error('[PROCESSOS POOL]', e);
    el.innerHTML = `<div class="card" style="color:var(--verm2);font-size:.8rem;padding:1rem">⚠️ Erro ao carregar processos. Recarregue a página.</div>`;
  }
};

// ─── Coluna 1: Pool de novos processos ────────────────────────────────────────

function _faseInvestigacaoLabel(inv, podeContinuar) {
  if (!inv) return podeContinuar
    ? { label: 'Aguardando início — clique para investigar', pct: 0 }
    : { label: 'Sem investigação vinculada', pct: 0 };
  if (inv.fase === 'investigacao') return { label: `🔎 Investigação · ${inv.turnos_usados}/${inv.turnos_totais} turnos`, pct: Math.round((inv.turnos_usados / inv.turnos_totais) * 45) };
  if (inv.fase === 'montagem')     return { label: '🗂️ Montagem de estratégia', pct: 60 };
  if (inv.fase === 'julgamento')   return { label: '⚖️ Julgamento em curso', pct: 80 };
  if (inv.fase === 'encerrado')    return { label: '📋 Aguardando sua decisão', pct: 95 };
  return { label: 'Em andamento', pct: 10 };
}

function _renderColPool(disponiveis, emAndamento, aguardSent, j, escId, investigMap) {
  const uid = j.uid || window.JOGADOR_UID;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  const CUSTO_ASSUMIR = 25;
  const CUSTO_DESIGN  = 5;

  // Cargos que processam sentença automaticamente via CF (jnr+)
  const CARGOS_AUTO_SENT = new Set(['jnr','pln','snr','asc','soc']);

  // Aguardando sentença
  const rowsSent = aguardSent.map(p => {
    const isAutoNpc = !p.assumido_uid && CARGOS_AUTO_SENT.has(p.func_cargo);
    const acaoHtml = isAutoNpc
      ? `<span style="font-size:.6rem;color:var(--txt4);text-align:center;line-height:1.2">⏳ Sentença<br>automática</span>`
      : energiaDisp >= 10
        ? `<button class="btn btn-sm btn-prim" style="font-size:.62rem;padding:.2rem .45rem;white-space:nowrap"
               onclick="window._processarSentenca('${escId}','${p.id}','${uid}')">
               ⚖️ Sentença
             </button>`
        : `<span style="font-size:.6rem;color:var(--txt4)">⚡ insuf.</span>`;
    return `
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
      ${acaoHtml}
    </div>`;
  }).join('');

  // Em andamento — separar processos do jogador e processos da gestão automática
  // (docs em status recursal têm status diferente de 'em_andamento', nunca estão aqui)
  const andJogador = emAndamento.filter(p => p.assumido_uid);
  const andGestao  = emAndamento.filter(p => !p.assumido_uid);

  const rowsAndJog = andJogador.map(p => {
    const podeContinuar = !!p.processo_ref;
    const fase = _faseInvestigacaoLabel(investigMap && investigMap[p.id], podeContinuar);
    return `
    <div class="proc-pool-row${podeContinuar ? ' proc-pool-row-clicavel' : ''}"
      ${podeContinuar ? `onclick="window.abrirInvestigacao('${p.processo_ref}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.abrirInvestigacao('${p.processo_ref}')}" role="button" tabindex="0"` : ''}>
      <div class="proc-pool-area">⚙️</div>
      <div style="flex:1;min-width:0">
        <div class="proc-pool-titulo">${p.titulo}</div>
        <div class="proc-pool-meta">Você · ${p.cliente_nome||'—'}</div>
        <div style="font-size:.62rem;color:var(--navy3);margin-top:.1rem">${fase.label}</div>
        ${_barraProgresso(fase.pct)}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.6rem;color:var(--txt4)">${_fmtP(p.honorarios)}</div>
        ${podeContinuar ? `<div style="font-size:.6rem;color:var(--ouro2);font-weight:600;margin-top:.2rem">Continuar →</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const rowsAndGes = andGestao.map(p => `
    <div class="proc-pool-row" style="border-left:2px solid var(--verde2)">
      <div class="proc-pool-area">👤</div>
      <div style="flex:1;min-width:0">
        <div class="proc-pool-titulo">${p.titulo}</div>
        <div class="proc-pool-meta" style="color:var(--verde2)">${p.func_nome||'Equipe'} · ${p.cliente_nome||'—'}</div>
        ${_barraProgresso(p.progresso||0)}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.68rem;font-weight:700;color:var(--navy)">${p.progresso||0}%</div>
        <div style="font-size:.6rem;color:var(--txt4)">${_fmtP(p.honorarios)}</div>
        <div style="font-size:.55rem;color:var(--verde2);margin-top:.1rem">gestão auto</div>
      </div>
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
          onclick="${energiaDisp >= CUSTO_ASSUMIR
            ? `window._assumirCasoPool('${escId}','${p.id}','proc-${p.id}')`
            : `toast('⚡ Energia insuficiente (${energiaDisp}/${CUSTO_ASSUMIR}).','ko')`}"
          ${energiaDisp < CUSTO_ASSUMIR ? 'style="opacity:.45;cursor:not-allowed;font-size:.6rem;padding:.18rem .38rem"' : ''}>
          ⚡${CUSTO_ASSUMIR} Assumir
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
    ${andJogador.length ? `
      <div class="proc-pool-grupo">
        <div class="proc-pool-grupo-titulo" style="color:var(--navy3)">⚙️ Seus casos em andamento (${andJogador.length})</div>
        ${rowsAndJog}
      </div>` : ''}
    ${andGestao.length ? `
      <div class="proc-pool-grupo">
        <div class="proc-pool-grupo-titulo" style="color:var(--verde2)">👥 Gerenciados pela equipe (${andGestao.length})</div>
        ${rowsAndGes}
      </div>` : ''}`;
}

// ─── Coluna 2: Fase recursal ──────────────────────────────────────────────────

function _renderColRecursal(recursais, mesAtualTotal) {
  if (!recursais.length) {
    return `<div style="font-size:.75rem;color:var(--txt3);padding:.5rem 0;text-align:center">
      Nenhum processo em fase recursal.
    </div>`;
  }

  return recursais.map(p => {
    if (p.status === 'aguardando_decisao_recurso' || p.status === 'aguardando_decisao_sentenca') {
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
    const labelBtn = p.quem_recorre === 'jogador' ? '⚖️ Sustentar Recurso' : '🛡️ Defender Sentença';

    const dispMes = p.data_disponivel_recurso?.mes;
    const dispAno = p.data_disponivel_recurso?.ano;
    const disponivel = (dispMes !== undefined && dispAno !== undefined)
      ? _poolMesTotal(dispMes, dispAno) <= mesAtualTotal
      : true;

    const prazoMes = p.prazo_final_recurso?.mes;
    const prazoAno = p.prazo_final_recurso?.ano;
    const restante = (prazoMes !== undefined && prazoAno !== undefined)
      ? _poolMesTotal(prazoMes, prazoAno) - mesAtualTotal
      : null;
    const prazoExpirado = restante !== null && restante < 0;

    return `
    <div class="proc-recursal-row">
      <div style="font-size:.6rem;color:var(--txt4);font-family:monospace">${p.numero||'—'}</div>
      <div style="font-size:.75rem;font-weight:600;color:var(--navy);margin:.1rem 0">${p.autor||'—'} vs ${p.reu||'—'}</div>
      <div style="font-size:.63rem;color:var(--txt4)">${label} · ${p.instancia_seguinte||'—'}</div>
      ${disponivel
        ? `<div style="font-size:.6rem;color:${prazoExpirado?'var(--verm2)':'var(--txt4)'};margin-top:.2rem">
             Prazo: ${prazoExpirado ? '⚠️ EXPIRADO' : restante !== null ? restante + ' mês(es) restante(s)' : '—'}
           </div>
           <button class="btn btn-sm btn-prim btn-block" style="margin-top:.4rem;font-size:.62rem"
             onclick="window.jogarRecursoProducao && window.jogarRecursoProducao('${p.id}')">
             ${labelBtn} — ${p.instancia_seguinte||'TJ'}
           </button>`
        : `<div style="font-size:.6rem;color:var(--txt4);margin-top:.3rem">⏳ Aguardando movimentação judicial...</div>`}
    </div>`;
  }).join('');
}

// ─── Diário da gestão: designações, sentenças e burnout narrados em ordem ─────

function _renderDiarioGestao(diario) {
  if (!diario.length) {
    return `<div style="font-size:.75rem;color:var(--txt3);padding:.5rem 0;text-align:center">
      Nada registrado ainda. Designações, sentenças e burnout de NPCs aparecem aqui a cada mês.
    </div>`;
  }
  return `<div style="display:flex;flex-direction:column;gap:.35rem">
    ${diario.map(e => `
      <div style="font-size:.7rem;color:var(--txt2);padding:.3rem .5rem;background:var(--surface2);border-radius:6px">
        ${e.texto}
      </div>`).join('')}
  </div>`;
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

// ─── Assumir caso pessoalmente ────────────────────────────────────────────────

window._assumirCasoPool = async function(escId, procId, containerId) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const CUSTO = 25;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < CUSTO) {
    toast(`⚡ Energia insuficiente (requer ${CUSTO}).`, 'ko');
    return;
  }

  try {
    const poolRef  = doc(db, 'escritorios', escId, 'processos_pool', procId);
    const poolSnap = await getDoc(poolRef);
    if (!poolSnap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
    const poolProc = poolSnap.data();

    // Descontar energia imediatamente
    await updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO });
    j.energia_usada_mes = energiaUsada + CUSTO;
    window.JOGADOR = j;

    // Marcar o pool como em andamento pelo jogador (sem progresso = 100)
    await updateDoc(poolRef, {
      status: 'em_andamento',
      assumido_uid:  uid,
      assumido_nome: j.nome_personagem || 'Dono',
      func_id:   null,
      func_nome: null,
      func_cargo: null,
      progresso: 0,
      assumido_em: new Date().toISOString(),
    });

    // Criar processo completo (provas → teses → audiência) e abrir
    if (window.criarProcessoDoPool) {
      const novoProcId = await window.criarProcessoDoPool(escId, procId, poolProc);
      await updateDoc(poolRef, { processo_ref: novoProcId });
      toast(`⚖️ Caso assumido! Siga o fluxo: provas → teses → audiência. -${CUSTO}⚡`, 'ok', 4000);
      window.abrirProcesso(novoProcId);
    } else {
      toast('Módulo de processos não carregado ainda. Tente novamente.', 'ko');
    }

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(j, escId, elPool);
  } catch (e) {
    console.error('[ASSUMIR CASO]', e);
    toast('Erro ao assumir caso.', 'ko');
  }
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
      ? `<div style="font-size:.68rem;color:var(--amber);background:rgba(176,138,78,.1);border-radius:4px;padding:.3rem .5rem;margin-bottom:.4rem">
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

  if (resultado === 'procedente') {
    const quemAtuou = proc.func_nome || 'A equipe';
    try {
      await Promise.all([
        updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO_SENT }),
        updateDoc(doc(db, 'escritorios', escId), {
          caixa: increment(valorRecebido),
          faturamento_mes_atual: increment(valorRecebido),
        }),
        updateDoc(doc(db, 'escritorios', escId, 'processos_pool', procId), {
          status: 'concluido', resultado, valor_recebido: valorRecebido,
          concluido_em: new Date().toISOString(),
        }),
        proc.func_id
          ? updateDoc(doc(db, 'escritorios', escId, 'funcionarios', proc.func_id), { processo_id: null })
          : Promise.resolve(),
        addDoc(collection(db, 'escritorios', escId, 'log_gestao'), {
          texto: `✅ ${quemAtuou} obteve sentença favorável em "${proc.titulo}". +${_fmtP(valorRecebido)}.`,
          criado_em: new Date().toISOString(),
        }),
      ]);
      j.energia_usada_mes = energiaUsada + CUSTO_SENT;
      window.JOGADOR = j;
      toast(`✅ Procedente! +${_fmtP(valorRecebido)} no caixa.`, 'ok');
      const elPool = document.getElementById('esc-processos-bloco');
      if (elPool) window.renderProcessosPool(j, escId, elPool);
    } catch (e) {
      console.error('[SENTENÇA PROCEDENTE]', e);
      toast('Erro ao processar sentença.', 'ko');
    }
    return;
  }

  // Resultado desfavorável (parcial ou improcedente) — mostrar convencimento final
  const isParcial = resultado === 'parcial';

  // Para parcial: chance do adversário recorrer (~65% — equivalente ao manual para score ~65)
  const opponentAppealed = isParcial && (Math.random() < 0.65);

  _sentencaPoolCtx = { escId, procId, uid, proc, resultado, valorRecebido, energiaUsada, custo: CUSTO_SENT, j };

  const resultadoLabel = isParcial ? '🟡 Parcialmente Procedente' : '❌ Improcedente';
  const resultadoCor   = isParcial ? 'var(--amber)' : 'var(--verm2)';

  let botoesHtml;
  if (isParcial && opponentAppealed) {
    _sentencaPoolCtx.opponentAppealed = true;
    botoesHtml = `
      <div style="background:rgba(239,159,39,.1);border:1px solid rgba(239,159,39,.3);border-radius:6px;padding:.6rem;margin-bottom:.8rem;font-size:.75rem;color:var(--amber)">
        ⚠️ A parte contrária decidiu recorrer desta sentença. O processo vai ao Tribunal de Justiça.
      </div>
      <button class="btn btn-prim btn-block" onclick="window._poolModalRecorrerContrario()">OK — Ver na Fase Recursal</button>`;
  } else if (isParcial) {
    _sentencaPoolCtx.opponentAppealed = false;
    botoesHtml = `
      <div style="font-size:.73rem;color:var(--txt4);margin-bottom:.9rem">
        A parte contrária aceitou o resultado. Deseja recorrer buscando decisão mais favorável?
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-prim" style="flex:1" onclick="window._poolModalRecorrer()">⚖️ Recorrer</button>
        <button class="btn btn-ghost" style="flex:1" onclick="window._poolModalAceitar()">Aceitar resultado</button>
      </div>`;
  } else {
    botoesHtml = `
      <div style="font-size:.73rem;color:var(--txt4);margin-bottom:.9rem">
        Deseja recorrer desta sentença?
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-prim" style="flex:1" onclick="window._poolModalRecorrer()">⚖️ Recorrer da decisão</button>
        <button class="btn btn-ghost" style="flex:1" onclick="window._poolModalAceitar()">Aceitar e encerrar</button>
      </div>`;
  }

  abrirModal('⚖️ Convencimento Final',
    `<div style="text-align:center;margin-bottom:1rem">
       <div style="font-size:1.6rem">${isParcial ? '🟡' : '❌'}</div>
       <div style="font-weight:700;font-size:.88rem;color:${resultadoCor};margin:.25rem 0">${resultadoLabel}</div>
       <div style="font-size:.72rem;color:var(--txt3)">"${proc.titulo}"</div>
     </div>
     <div style="font-size:.75rem;color:var(--txt3);margin-bottom:.7rem">
       Honorários recebidos (provisório): <strong style="color:var(--verde2)">+${_fmtP(valorRecebido)}</strong>
     </div>
     ${botoesHtml}`
  );
};

window._poolModalAceitar = async function() {
  const ctx = _sentencaPoolCtx;
  if (!ctx) return;
  _sentencaPoolCtx = null;
  const quemAtuou = ctx.proc.func_nome || 'A equipe';
  const ico = ctx.resultado === 'parcial' ? '🟡' : '❌';
  try {
    await Promise.all([
      updateDoc(doc(db, 'jogadores', ctx.uid), { energia_usada_mes: ctx.energiaUsada + ctx.custo }),
      updateDoc(doc(db, 'escritorios', ctx.escId), {
        caixa: increment(ctx.valorRecebido),
        faturamento_mes_atual: increment(ctx.valorRecebido),
      }),
      updateDoc(doc(db, 'escritorios', ctx.escId, 'processos_pool', ctx.procId), {
        status: 'concluido', resultado: ctx.resultado,
        valor_recebido: ctx.valorRecebido, concluido_em: new Date().toISOString(),
      }),
      ctx.proc.func_id
        ? updateDoc(doc(db, 'escritorios', ctx.escId, 'funcionarios', ctx.proc.func_id), { processo_id: null })
        : Promise.resolve(),
      addDoc(collection(db, 'escritorios', ctx.escId, 'log_gestao'), {
        texto: `${ico} ${quemAtuou} — sentença ${ctx.resultado} em "${ctx.proc.titulo}". +${_fmtP(ctx.valorRecebido)}. Encerrado sem recurso.`,
        criado_em: new Date().toISOString(),
      }),
    ]);
    ctx.j.energia_usada_mes = ctx.energiaUsada + ctx.custo;
    window.JOGADOR = ctx.j;
    fecharModal();
    toast(`${ico} Sentença aceita. +${_fmtP(ctx.valorRecebido)} no caixa.`, ctx.resultado === 'parcial' ? 'neutro' : 'ko');
    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(ctx.j, ctx.escId, elPool);
  } catch (e) {
    console.error('[ACEITAR POOL]', e);
    toast('Erro ao encerrar processo.', 'ko');
  }
};

async function _criarProcessoRecursalPool(ctx, quemRecorre) {
  const j = ctx.j;
  const bloq = 2 + Math.floor(Math.random() * 2);
  const dataDisponivel = _poolSomarMeses(j.mes_pessoal || 0, j.ano_pessoal || 1, bloq);
  const jan  = 2 + Math.floor(Math.random() * 2);
  const prazoFinal = _poolSomarMeses(dataDisponivel.mes, dataDisponivel.ano, jan);
  const scoreAnterior = ctx.resultado === 'parcial' ? 65 : 38;

  const newProcRef = await addDoc(collection(db, 'processos'), {
    titulo: ctx.proc.titulo || 'Processo',
    autor:  ctx.proc.cliente_nome || 'Cliente',
    reu:    'Parte contrária',
    tipo:   ctx.proc.area || 'Cível',
    numero: ctx.procId,
    tribunal: 'TJRJ',
    valor: ctx.proc.honorarios || 0,
    fatos_narrativa: [], teses_selecionadas: [],
    status: 'recurso_pendente',
    pool_escritorio_id:  ctx.escId,
    pool_proc_subcol_id: ctx.procId,
    pool_proc_esc_id:    ctx.escId,
    advogado_uid: ctx.uid,
    instancia_atual:    '1grau',
    instancia_seguinte: 'TJ',
    quem_recorre: quemRecorre,
    score_anterior: scoreAnterior,
    hon_pendente: ctx.valorRecebido,
    data_disponivel_recurso: dataDisponivel,
    prazo_final_recurso:     prazoFinal,
    criado_em: new Date().toISOString(),
  });
  return newProcRef.id;
}

window._poolModalRecorrer = async function() {
  const ctx = _sentencaPoolCtx;
  if (!ctx) return;
  _sentencaPoolCtx = null;
  try {
    const newProcId = await _criarProcessoRecursalPool(ctx, 'jogador');
    await Promise.all([
      updateDoc(doc(db, 'jogadores', ctx.uid), { energia_usada_mes: ctx.energiaUsada + ctx.custo }),
      updateDoc(doc(db, 'escritorios', ctx.escId), {
        caixa: increment(ctx.valorRecebido),
        faturamento_mes_atual: increment(ctx.valorRecebido),
      }),
      updateDoc(doc(db, 'escritorios', ctx.escId, 'processos_pool', ctx.procId), {
        status: 'recurso_pendente', resultado: ctx.resultado,
        valor_recebido: ctx.valorRecebido, processo_ref: newProcId,
      }),
      ctx.proc.func_id
        ? updateDoc(doc(db, 'escritorios', ctx.escId, 'funcionarios', ctx.proc.func_id), { processo_id: null })
        : Promise.resolve(),
      addDoc(collection(db, 'escritorios', ctx.escId, 'log_gestao'), {
        texto: `⚖️ Recurso protocolado em "${ctx.proc.titulo}" (sentença ${ctx.resultado}). Aguardando julgamento no TJ.`,
        criado_em: new Date().toISOString(),
      }),
    ]);
    ctx.j.energia_usada_mes = ctx.energiaUsada + ctx.custo;
    window.JOGADOR = ctx.j;
    fecharModal();
    toast('⚖️ Recurso protocolado. Acompanhe na aba Fase Recursal.', 'ok', 4000);
    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(ctx.j, ctx.escId, elPool);
  } catch (e) {
    console.error('[RECORRER POOL]', e);
    toast('Erro ao protocolar recurso.', 'ko');
  }
};

window._poolModalRecorrerContrario = async function() {
  const ctx = _sentencaPoolCtx;
  if (!ctx) return;
  _sentencaPoolCtx = null;
  try {
    const newProcId = await _criarProcessoRecursalPool(ctx, 'parte_contraria');
    await Promise.all([
      updateDoc(doc(db, 'jogadores', ctx.uid), { energia_usada_mes: ctx.energiaUsada + ctx.custo }),
      updateDoc(doc(db, 'escritorios', ctx.escId), {
        caixa: increment(ctx.valorRecebido),
        faturamento_mes_atual: increment(ctx.valorRecebido),
      }),
      updateDoc(doc(db, 'escritorios', ctx.escId, 'processos_pool', ctx.procId), {
        status: 'recurso_pendente', resultado: ctx.resultado,
        valor_recebido: ctx.valorRecebido, processo_ref: newProcId,
      }),
      ctx.proc.func_id
        ? updateDoc(doc(db, 'escritorios', ctx.escId, 'funcionarios', ctx.proc.func_id), { processo_id: null })
        : Promise.resolve(),
      addDoc(collection(db, 'escritorios', ctx.escId, 'log_gestao'), {
        texto: `⚠️ Parte contrária recorreu da sentença parcial em "${ctx.proc.titulo}". Você deverá defender no TJ.`,
        criado_em: new Date().toISOString(),
      }),
    ]);
    ctx.j.energia_usada_mes = ctx.energiaUsada + ctx.custo;
    window.JOGADOR = ctx.j;
    fecharModal();
    toast('⚠️ Parte contrária recorreu. Processo na Fase Recursal.', 'neutro', 4000);
    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool) window.renderProcessosPool(ctx.j, ctx.escId, elPool);
  } catch (e) {
    console.error('[RECURSO CONTRÁRIO POOL]', e);
    toast('Erro ao registrar recurso adversarial.', 'ko');
  }
};

// ─── Geração mensal de processos ──────────────────────────────────────────────

window.gerarProcessosMensais = async function(escId, tierEscritorio) {
  // Tier real: ler do Firestore para evitar valor desatualizado em j.escritorio_tier
  let tierReal = tierEscritorio || 1;
  try {
    const escSnap2 = await getDoc(doc(db, 'escritorios', escId));
    if (escSnap2.exists()) tierReal = escSnap2.data().tier || tierReal;
  } catch(e) {}
  const cap = TIER_CAP_ESC[tierReal] || 4;

  try {
    const clSnap = await getDocs(collection(db, 'escritorios', escId, 'clientes'));
    const clientes = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Contar apenas processos ATIVOS (não finalizados) — concluídos liberam vaga
    const existSnap = await getDocs(query(
      collection(db, 'escritorios', escId, 'processos_pool'),
      where('status', 'in', ['disponivel', 'em_andamento', 'aguardando_sentenca'])
    ));
    const ativosAtuais = existSnap.size;

    if (ativosAtuais >= cap) {
      toast(`Pool cheio (${ativosAtuais}/${cap} processos ativos). Conclua casos para liberar vagas.`, 'ko');
      return;
    }

    const vagasRestantes = cap - ativosAtuais;
    let gerados = 0;
    const promessas = [];

    for (const cl of clientes) {
      if (gerados >= vagasRestantes) break;
      const tier   = _clienteTier(cl.valor_mensal || 0);
      const chance = TIER_CHANCE[tier] || .10;
      if (Math.random() > chance) continue;

      const area       = cl.area || cl.especialidade || AREA_DEFAULT[Math.floor(Math.random() * AREA_DEFAULT.length)];
      const honorarios = _tierHonorarios(tier);
      const titulo     = _randTitulo(area);

      promessas.push(addDoc(collection(db, 'escritorios', escId, 'processos_pool'), {
        titulo, cliente_id: cl.id, cliente_nome: cl.nome || 'Cliente',
        area, tier, honorarios, icone: '⚖️',
        status: 'disponivel', progresso: 0,
        func_id: null, func_nome: null, func_cargo: null, resultado: null,
        criado_em: new Date().toISOString(),
      }));
      gerados++;
    }

    if (!promessas.length) {
      toast('Nenhum processo gerado (verifique os clientes ativos).', 'ko');
      return;
    }

    await Promise.all(promessas);
    toast(`✅ ${gerados} processo(s) gerado(s) no pool!`, 'ok');

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

// (A função avancarProgressoMensal foi REMOVIDA deste arquivo — ela nunca
// era chamada por nada no frontend (o avanço de mês real sempre rodou só
// pela Cloud Function functions/avancar_mes.js, que não a conhecia).
// Migrada para dentro de functions/avancar_mes.js (_processarProgressoNPCsCF),
// que é onde o avanço de mês de fato acontece. Manter aqui seria deixar
// uma segunda fonte de verdade morta e divergente da implementação real.)
