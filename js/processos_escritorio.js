/**
 * PROCESSOS DO ESCRITÓRIO — pool gerado por clientes, designação para NPCs, sentença
 */

import { collection, query, where, orderBy, limit, getDocs, addDoc, doc, updateDoc, increment, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SKILLS_REL     = ['escrita_juridica', 'pesquisa', 'oratoria', 'persuasao', 'argumentacao'];
const CARGO_MULT     = { est:.30, ass:.42, jnr:.58, pln:.70, snr:.85, asc:.94, soc:1.00 };
const CARGO_CAP_P    = { est:20,  ass:35,  jnr:45,  pln:55,  snr:65,  asc:80,  soc:100  };
const CARGO_L_P      = { est:'Estagiário', ass:'Assistente', jnr:'Jur. Júnior', pln:'Jur. Pleno', snr:'Jur. Sênior', asc:'Associado', soc:'Sócio' };

const TIER_ORDER     = { D:0, C:1, B:2, A:3, S:4 };
const CARGO_TIER_MAX = { est:'D', ass:'C', jnr:'B', pln:'A', snr:'S', asc:'S', soc:'S' };
const TIER_CHANCE    = { S:.10, A:.15, B:.25, C:.35, D:.50 };
const TIER_CAP_ESC   = { 1:2, 2:5, 3:7, 4:10, 5:13 };
const SENT_LIMITE    = { jnr:1, pln:2, snr:3, asc:5 }; // soc = ilimitado

// Progresso base mensal por cargo (%)
const PROG_MES       = { est:18, ass:22, jnr:30, pln:38, snr:48, asc:55, soc:65 };

const TIER_COR = { S:'var(--verm2)', A:'var(--amber)', B:'var(--navy3)', C:'var(--verde2)', D:'var(--txt4)' };
const TIER_TAG = { S:'S', A:'A', B:'B', C:'C', D:'D' };

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

// ─── RENDER pool de processos no painel do escritório ─────────────────────────

window.renderProcessosPool = async function(j, escId, el) {
  try {
    const snap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), orderBy('criado_em', 'desc'), limit(40))
    );
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const disponiveis  = todos.filter(p => p.status === 'disponivel');
    const emAndamento  = todos.filter(p => p.status === 'em_andamento');
    const aguardSent   = todos.filter(p => p.status === 'aguardando_sentenca');

    const _tierBadge = (tier) =>
      `<span style="font-size:.58rem;font-weight:700;padding:.1rem .35rem;border-radius:8px;background:${TIER_COR[tier]}20;color:${TIER_COR[tier]};border:1px solid ${TIER_COR[tier]}">Tier ${TIER_TAG[tier]}</span>`;

    const _barraProgresso = (pct) => {
      const cor = pct >= 80 ? 'var(--verde2)' : pct >= 50 ? 'var(--amber)' : 'var(--navy3)';
      return `<div style="height:5px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:.25rem">
        <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;transition:width .4s"></div>
      </div>`;
    };

    const rowDisp = disponiveis.map(p => `
      <div class="proc-pool-row" id="proc-${p.id}">
        <div class="proc-pool-area">${p.icone || '⚖️'}</div>
        <div style="flex:1;min-width:0">
          <div class="proc-pool-titulo">${p.titulo}</div>
          <div class="proc-pool-meta">${p.cliente_nome || '—'} · ${p.area || 'Civil'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-right:.5rem">
          <div style="font-size:.72rem;font-weight:700;color:var(--verde2);font-variant-numeric:tabular-nums">${_fmtP(p.honorarios)}</div>
          <div style="margin-top:.15rem">${_tierBadge(p.tier || 'D')}</div>
        </div>
        <button class="btn btn-sm btn-sec" style="font-size:.62rem;padding:.2rem .45rem;white-space:nowrap"
          onclick="window._designarProcessoPicker('${escId}','${p.id}','proc-${p.id}')">
          Designar ↓
        </button>
      </div>`).join('');

    const rowAnd = emAndamento.map(p => `
      <div class="proc-pool-row">
        <div class="proc-pool-area">${p.icone || '⚖️'}</div>
        <div style="flex:1;min-width:0">
          <div class="proc-pool-titulo">${p.titulo}</div>
          <div class="proc-pool-meta">${p.func_nome || '—'} · ${p.cliente_nome || '—'}</div>
          ${_barraProgresso(p.progresso || 0)}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.68rem;font-weight:700;color:var(--navy)">${p.progresso || 0}%</div>
          <div style="font-size:.6rem;color:var(--txt4)">${_fmtP(p.honorarios)}</div>
        </div>
      </div>`).join('');

    const rowSent = aguardSent.map(p => `
      <div class="proc-pool-row" id="sent-${p.id}">
        <div class="proc-pool-area">⏳</div>
        <div style="flex:1;min-width:0">
          <div class="proc-pool-titulo">${p.titulo}</div>
          <div class="proc-pool-meta">${p.cliente_nome || '—'} · concluído por ${p.func_nome || '—'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-right:.5rem">
          <div style="font-size:.72rem;font-weight:700;color:var(--amber);font-variant-numeric:tabular-nums">${_fmtP(p.honorarios)}</div>
          <div style="margin-top:.15rem">${_tierBadge(p.tier || 'D')}</div>
        </div>
        <button class="btn btn-sm btn-prim" style="font-size:.62rem;padding:.2rem .45rem;white-space:nowrap"
          onclick="window._processarSentenca('${escId}','${p.id}','${j.uid || window.JOGADOR_UID}')">
          ⚖️ Sentença
        </button>
      </div>`).join('');

    const s = window.SERVER || {};
    const tierEsc = j.escritorio_tier || 1;
    const capMes  = TIER_CAP_ESC[tierEsc] || 2;

    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.6rem;border-bottom:1px solid var(--borda-sub);padding-bottom:.5rem">
          <div class="secao-titulo" style="font-size:.88rem;font-weight:700">⚖️ Pool de Processos</div>
          <button class="btn btn-sm btn-ghost" style="font-size:.62rem;padding:.18rem .5rem"
            onclick="window.gerarProcessosMensais('${escId}',${tierEsc})">
            🔄 Gerar do mês
          </button>
        </div>

        ${aguardSent.length ? `
          <div class="proc-pool-grupo">
            <div class="proc-pool-grupo-titulo" style="color:var(--amber)">⏳ Aguardando sentença (${aguardSent.length})</div>
            ${rowSent}
          </div>` : ''}

        ${disponiveis.length ? `
          <div class="proc-pool-grupo">
            <div class="proc-pool-grupo-titulo">📂 Disponíveis (${disponiveis.length})</div>
            ${rowDisp}
          </div>` : ''}

        ${emAndamento.length ? `
          <div class="proc-pool-grupo">
            <div class="proc-pool-grupo-titulo" style="color:var(--navy3)">⚙️ Em andamento (${emAndamento.length})</div>
            ${rowAnd}
          </div>` : ''}

        ${todos.length === 0 ? `
          <div style="font-size:.78rem;color:var(--txt3);padding:.6rem 0;text-align:center">
            Nenhum processo no pool. Use "Gerar do mês" ou aguarde o próximo mês.
          </div>` : ''}
      </div>`;

  } catch (e) {
    console.error('[PROCESSOS POOL]', e);
    el.innerHTML = '';
  }
};

// ─── Abrir picker de PROCESSOS para um NPC específico (a partir do card do NPC) ──

window._abrirDesignarParaFunc = async function(escId, funcId, cargoId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existente = container.querySelector('.proc-func-picker');
  if (existente) { existente.remove(); return; }

  const j = window.JOGADOR;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  const CUSTO = 5;

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
    picker.innerHTML = `<div style="font-size:.75rem;color:var(--txt3)">Nenhum processo disponível no pool. Clique em "Gerar do mês" no Pool de Processos.</div>`;
  } else {
    const temEnergia = energiaDisp >= CUSTO;
    const linhas = processos.map(p => {
      const podeMane = _podeManejar(cargoId, p.tier || 'D');
      const aviso    = !podeMane ? `<span style="font-size:.6rem;color:var(--amber)">⚠️ acima do cargo</span>` : '';
      return `
      <div style="display:flex;align-items:center;gap:.45rem;padding:.3rem 0;border-bottom:1px solid var(--bg3)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:600;color:var(--txt1)">${p.titulo} ${aviso}</div>
          <div style="font-size:.63rem;color:var(--txt4)">${p.cliente_nome || '—'} · ${p.area || 'Civil'} · ${_fmtP(p.honorarios)}</div>
        </div>
        <span style="font-size:.58rem;font-weight:700;padding:.1rem .35rem;border-radius:8px;background:${TIER_COR[p.tier||'D']}20;color:${TIER_COR[p.tier||'D']};border:1px solid ${TIER_COR[p.tier||'D']}">Tier ${p.tier||'D'}</span>
        <button class="btn btn-sm btn-prim" style="font-size:.62rem;padding:.2rem .4rem;${!temEnergia?'opacity:.4;cursor:not-allowed':''}"
          onclick="${temEnergia ? `window._confirmarDesignar('${escId}','${p.id}','${funcId}','${cargoId}','${window.JOGADOR?.nome_personagem||'Dono'}')` : `toast('⚡ Energia insuficiente.','ko')`}">
          ⚡${CUSTO} Designar
        </button>
      </div>`;
    }).join('');

    picker.innerHTML = `
      <div style="font-size:.68rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem">Escolher processo para designar:</div>
      ${linhas}`;
  }

  container.appendChild(picker);
};

// ─── Picker para designar um processo a um NPC ────────────────────────────────

window._designarProcessoPicker = async function(escId, procId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const existente = container.querySelector('.designar-picker');
  if (existente) { existente.remove(); return; }

  const j = window.JOGADOR;
  const energiaDisp = Math.max(0,
    (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));

  // Carregar funcionários disponíveis
  let funcs = [];
  try {
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    funcs = fSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.ativo !== false && !f.processo_id) // sem processo atual
      .sort((a, b) => {
        const ord = { soc:6, asc:5, snr:4, pln:3, jnr:2, ass:1, est:0 };
        return (ord[b.cargo_id] || 0) - (ord[a.cargo_id] || 0);
      });
  } catch (e) { console.error('[DESIGNAR PICKER]', e); }

  // Pegar tier do processo
  let procTier = 'D';
  try {
    const { doc: fDoc, getDoc: fGet } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db: fDb } = await import('./firebase-init.js');
    const pSnap = await fGet(fDoc(fDb, 'escritorios', escId, 'processos_pool', procId));
    if (pSnap.exists()) procTier = pSnap.data().tier || 'D';
  } catch (e) { /* usa D como fallback */ }

  const picker = document.createElement('div');
  picker.className = 'designar-picker';

  const CUSTO_ENERGIA = 5;
  const temEnergia = energiaDisp >= CUSTO_ENERGIA;

  if (!funcs.length) {
    picker.innerHTML = `<div style="font-size:.75rem;color:var(--txt3)">Nenhum funcionário disponível (todos já estão em processos).</div>`;
  } else {
    const linhas = funcs.map(f => {
      const cargo     = CARGO_L_P[f.cargo_id] || f.cargo_id;
      const nome      = f.nome || f.name || cargo;
      const podeMane  = _podeManejar(f.cargo_id, procTier);
      const aviso     = !podeMane ? `<span style="font-size:.6rem;color:var(--amber)">⚠️ acima do cargo</span>` : '';
      const ok        = temEnergia;
      const efic      = _calcEficiencia(f);
      const eficLabel = Math.round(efic * 100);

      return `
      <div style="display:flex;align-items:center;gap:.45rem;padding:.3rem 0;border-bottom:1px solid var(--bg3)">
        <div style="flex:1;min-width:0">
          <div style="font-size:.75rem;font-weight:600;color:var(--txt1)">${nome} ${aviso}</div>
          <div style="font-size:.63rem;color:var(--txt4)">${cargo} · efic. ${eficLabel}%</div>
        </div>
        <div style="font-size:.65rem;color:${ok?'var(--amber)':'var(--verm2)'};margin-right:.4rem">⚡${CUSTO_ENERGIA}</div>
        <button class="btn btn-sm btn-sec" style="font-size:.62rem;padding:.2rem .4rem;${!ok?'opacity:.4;cursor:not-allowed':''}"
          onclick="${ok ? `window._confirmarDesignar('${escId}','${procId}','${f.id}','${f.cargo_id}','${nome.replace(/'/g,"\\'")}')` : `toast('⚡ Energia insuficiente.','ko')`}">
          Designar
        </button>
      </div>`;
    }).join('');

    picker.innerHTML = `
      <div style="font-size:.68rem;font-weight:600;color:var(--txt2);margin-bottom:.4rem">
        Escolher advogado${!temEnergia ? ` <span style="color:var(--verm2)">(⚡ insuficiente)</span>` : ''}:
      </div>
      ${linhas}`;
  }

  container.appendChild(picker);
};

// ─── Confirmar designação ─────────────────────────────────────────────────────

window._confirmarDesignar = async function(escId, procId, funcId, cargoId, nomeFunc) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const CUSTO = 5;

  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < CUSTO) {
    toast('⚡ Energia insuficiente para designar.', 'ko');
    return;
  }

  try {
    const { doc: fDoc, updateDoc: fUpd } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db: fDb } = await import('./firebase-init.js');

    await Promise.all([
      fUpd(fDoc(fDb, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'processos_pool', procId), {
        status: 'em_andamento',
        func_id: funcId, func_cargo: cargoId, func_nome: nomeFunc,
        designado_em: new Date().toISOString(),
        progresso: 0,
      }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'funcionarios', funcId), {
        processo_id: procId,
      }),
    ]);

    j.energia_usada_mes = energiaUsada + CUSTO;
    window.JOGADOR = j;
    toast(`📋 ${nomeFunc} designado para o processo. ⚡-${CUSTO}`, 'ok');

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool && window.renderProcessosPool) window.renderProcessosPool(j, escId, elPool);
  } catch (e) {
    console.error('[CONFIRMAR DESIGNAR]', e);
    toast('Erro ao designar processo.', 'ko');
  }
};

// ─── Processar sentença (dono ou advogado com cargo adequado) ─────────────────

window._processarSentenca = async function(escId, procId, uid) {
  const j = window.JOGADOR;

  // Pegar dados do processo
  let proc;
  try {
    const { doc: fDoc, getDoc: fGet } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db: fDb } = await import('./firebase-init.js');
    const snap = await fGet(fDoc(fDb, 'escritorios', escId, 'processos_pool', procId));
    if (!snap.exists()) return;
    proc = { id: procId, ...snap.data() };
  } catch (e) {
    toast('Erro ao carregar processo.', 'ko');
    return;
  }

  // Custo de energia para processar sentença: 10 para o dono
  const CUSTO_SENT = 10;
  const energiaUsada = j.energia_usada_mes || 0;
  const energiaTotal = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  if (Math.max(0, energiaTotal - energiaUsada) < CUSTO_SENT) {
    toast(`⚡ Energia insuficiente (requer ${CUSTO_SENT}).`, 'ko');
    return;
  }

  // Calcular resultado baseado em habilidades do dono
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
    const { doc: fDoc, updateDoc: fUpd } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db: fDb } = await import('./firebase-init.js');

    const { increment: fInc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    await Promise.all([
      fUpd(fDoc(fDb, 'jogadores', uid), { energia_usada_mes: energiaUsada + CUSTO_SENT }),
      fUpd(fDoc(fDb, 'escritorios', escId), {
        caixa: fInc(valorRecebido),
        faturamento_mes_atual: fInc(valorRecebido),
      }),
      fUpd(fDoc(fDb, 'escritorios', escId, 'processos_pool', procId), {
        status: 'concluido',
        resultado, valor_recebido: valorRecebido,
        concluido_em: new Date().toISOString(),
      }),
      // Liberar funcionário
      proc.func_id
        ? fUpd(fDoc(fDb, 'escritorios', escId, 'funcionarios', proc.func_id), { processo_id: null })
        : Promise.resolve(),
    ]);

    j.energia_usada_mes = energiaUsada + CUSTO_SENT;
    window.JOGADOR = j;
    toast(`${resultadoLabel} +${_fmtP(valorRecebido)} no caixa.`, resultado === 'improcedente' ? 'ko' : 'ok');

    const elPool = document.getElementById('esc-processos-bloco');
    if (elPool && window.renderProcessosPool) window.renderProcessosPool(j, escId, elPool);
  } catch (e) {
    console.error('[SENTENÇA]', e);
    toast('Erro ao processar sentença.', 'ko');
  }
};

// ─── Geração mensal de processos a partir dos clientes ────────────────────────

window.gerarProcessosMensais = async function(escId, tierEscritorio) {
  const cap  = TIER_CAP_ESC[tierEscritorio || 1] || 2;
  const s    = window.SERVER || {};
  const mes  = s.mes_global || 1;

  try {
    const clSnap = await getDocs(collection(db, 'escritorios', escId, 'clientes'));
    const clientes = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Verificar quantos processos já gerados este mês
    const { getDocs: fGDocs, collection: fCol, query: fQ, where: fW } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fDb } = await import('./firebase-init.js');

    const existSnap = await fGDocs(fQ(fCol(fDb, 'escritorios', escId, 'processos_pool'),
      fW('criado_mes', '==', mes)));
    const jaGeradosMes = existSnap.size;

    if (jaGeradosMes >= cap) {
      toast(`Pool do mês cheio (${cap} processos gerados).`, 'ko');
      return;
    }

    const vagasRestantes = cap - jaGeradosMes;
    let gerados = 0;
    const promessas = [];

    for (const cl of clientes) {
      if (gerados >= vagasRestantes) break;
      const tier   = _clienteTier(cl.valor_mensal || 0);
      const chance = TIER_CHANCE[tier] || .10;
      if (Math.random() > chance) continue;

      const area     = cl.area || cl.especialidade || AREA_DEFAULT[Math.floor(Math.random() * AREA_DEFAULT.length)];
      const honorarios = _tierHonorarios(tier);
      const titulo   = _randTitulo(area);

      promessas.push(addDoc(collection(fDb, 'escritorios', escId, 'processos_pool'), {
        titulo,
        cliente_id:   cl.id,
        cliente_nome: cl.nome || 'Cliente',
        area,
        tier,
        honorarios,
        icone: '⚖️',
        status:       'disponivel',
        progresso:    0,
        func_id:      null,
        func_nome:    null,
        func_cargo:   null,
        resultado:    null,
        criado_mes:   mes,
        criado_em:    new Date().toISOString(),
      }));
      gerados++;
    }

    if (promessas.length === 0) {
      toast('Nenhum processo gerado este mês (verifique os clientes ativos).', 'ko');
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

// ─── Avanço de progresso mensal para processos em andamento ──────────────────

window.avancarProgressoMensal = async function(escId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'escritorios', escId, 'processos_pool'), where('status', '==', 'em_andamento'))
    );

    const { doc: fDoc, updateDoc: fUpd } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fDb } = await import('./firebase-init.js');

    const proms = [];
    for (const d of snap.docs) {
      const p = { id: d.id, ...d.data() };
      if (!p.func_cargo) continue;

      const baseGanho = PROG_MES[p.func_cargo] || 18;
      const variacao  = Math.round((Math.random() * 12) - 4);
      const ganho     = Math.max(5, baseGanho + variacao);
      const novoProg  = Math.min(100, (p.progresso || 0) + ganho);

      const podeSentenca = ['jnr','pln','snr','asc','soc'].includes(p.func_cargo);
      const novoStatus   = novoProg >= 100
        ? (podeSentenca ? 'aguardando_sentenca' : 'aguardando_sentenca')
        : 'em_andamento';

      proms.push(fUpd(fDoc(fDb, 'escritorios', escId, 'processos_pool', p.id), {
        progresso: novoProg,
        status: novoStatus,
      }));
    }

    if (proms.length) await Promise.all(proms);
    console.log(`[PROGRESSO MENSAL] ${proms.length} processo(s) avançados em ${escId}`);
  } catch (e) {
    console.error('[AVANCAR PROGRESSO]', e);
  }
};
