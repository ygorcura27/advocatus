/**
 * EQUIPE — Advocatus Online
 * Sistema de contratação, designação e gestão de funcionários
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import { SKILL_CAP } from './escritorios_npc.js';


// ════════════════════════════════════════════════════════
// ESTADO LOCAL (tab ativa na tela de Equipe)
// ════════════════════════════════════════════════════════
let _activeEquipeTab = 'equipe';

// ════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════
const CARGO_IDX = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6 };

const CARGO_INFO = {
  est: { l:'Estagiário',         sal:1700,  hon_pct:0,    acoes_mes:1, custo_coord:5,  bonus_chance:2  },
  ass: { l:'Assistente Jurídico',sal:2500,  hon_pct:0,    acoes_mes:1, custo_coord:5,  bonus_chance:4  },
  jnr: { l:'Advogado Júnior',    sal:3500,  hon_pct:0.10, acoes_mes:2, custo_coord:10, bonus_chance:6  },
  pln: { l:'Advogado Pleno',     sal:5500,  hon_pct:0.10, acoes_mes:2, custo_coord:10, bonus_chance:9  },
  snr: { l:'Advogado Sênior',    sal:9000,  hon_pct:0.10, acoes_mes:2, custo_coord:10, bonus_chance:12 },
};

// Avatares cartoon dos NPCs — arquivos em img/npcs cartoon/, gerados por
// avatar_generator.html com os mesmos 40 specs (H001-H020, M001-M020).
// Nome do arquivo: {ID}_{ETNIA}_{IDADE}_{ESTILO}.png (tudo maiúsculo).
const NPC_CARTOON_SPECS = {
  m: [
    { id:'H001', ethnicity:'branco', age:'jovem',  style:'casual' },
    { id:'H002', ethnicity:'branco', age:'adulto', style:'blazer' },
    { id:'H003', ethnicity:'branco', age:'senior', style:'oculos' },
    { id:'H004', ethnicity:'loiro',  age:'jovem',  style:'casual' },
    { id:'H005', ethnicity:'loiro',  age:'adulto', style:'blazer' },
    { id:'H006', ethnicity:'loiro',  age:'senior', style:'formal' },
    { id:'H007', ethnicity:'ruivo',  age:'jovem',  style:'casual' },
    { id:'H008', ethnicity:'ruivo',  age:'adulto', style:'formal' },
    { id:'H009', ethnicity:'negro',  age:'jovem',  style:'casual' },
    { id:'H010', ethnicity:'negro',  age:'adulto', style:'blazer' },
    { id:'H011', ethnicity:'negro',  age:'senior', style:'oculos' },
    { id:'H012', ethnicity:'asiatico', age:'jovem',  style:'casual' },
    { id:'H013', ethnicity:'asiatico', age:'adulto', style:'blazer' },
    { id:'H014', ethnicity:'arabe',  age:'jovem',  style:'formal' },
    { id:'H015', ethnicity:'arabe',  age:'adulto', style:'formal' },
    { id:'H016', ethnicity:'branco', age:'jovem',  style:'oculos' },
    { id:'H017', ethnicity:'negro',  age:'jovem',  style:'blazer' },
    { id:'H018', ethnicity:'asiatico', age:'senior', style:'formal' },
    { id:'H019', ethnicity:'loiro',  age:'adulto', style:'casual' },
    { id:'H020', ethnicity:'branco', age:'adulto', style:'casual' },
  ],
  f: [
    { id:'M001', ethnicity:'branca', age:'jovem',  style:'casual' },
    { id:'M002', ethnicity:'branca', age:'adulto', style:'blazer' },
    { id:'M003', ethnicity:'branca', age:'senior', style:'oculos' },
    { id:'M004', ethnicity:'loira',  age:'jovem',  style:'casual' },
    { id:'M005', ethnicity:'loira',  age:'adulto', style:'blazer' },
    { id:'M006', ethnicity:'loira',  age:'senior', style:'formal' },
    { id:'M007', ethnicity:'ruiva',  age:'jovem',  style:'casual' },
    { id:'M008', ethnicity:'ruiva',  age:'adulto', style:'formal' },
    { id:'M009', ethnicity:'negra',  age:'jovem',  style:'casual' },
    { id:'M010', ethnicity:'negra',  age:'adulto', style:'blazer' },
    { id:'M011', ethnicity:'negra',  age:'senior', style:'oculos' },
    { id:'M012', ethnicity:'asiatica', age:'jovem',  style:'casual' },
    { id:'M013', ethnicity:'asiatica', age:'adulto', style:'blazer' },
    { id:'M014', ethnicity:'arabe',  age:'jovem',  style:'formal' },
    { id:'M015', ethnicity:'arabe',  age:'adulto', style:'formal' },
    { id:'M016', ethnicity:'branca', age:'jovem',  style:'oculos' },
    { id:'M017', ethnicity:'negra',  age:'jovem',  style:'blazer' },
    { id:'M018', ethnicity:'asiatica', age:'senior', style:'formal' },
    { id:'M019', ethnicity:'loira',  age:'adulto', style:'casual' },
    { id:'M020', ethnicity:'branca', age:'adulto', style:'casual' },
  ],
};
function _nomeArquivoCartoon(spec) {
  return `${spec.id}_${spec.ethnicity.toUpperCase()}_${spec.age.toUpperCase()}_${spec.style.toUpperCase()}.png`;
}

// Capacidade por tier do escritório
const TIER_CAPACIDADE = {
  1: { estagiarios:1, assistentes:1, advogados:0, custo_fixo:3500  },
  2: { estagiarios:2, assistentes:2, advogados:1, custo_fixo:8000  },
  3: { estagiarios:3, assistentes:2, advogados:2, custo_fixo:18000 },
  4: { estagiarios:4, assistentes:3, advogados:3, custo_fixo:35000 },
  5: { estagiarios:5, assistentes:4, advogados:4, custo_fixo:70000 },
};

// Nomes NPC brasileiros para geração aleatória
const NOMES_NPC = {
  m: ['Gabriel','Lucas','Mateus','Felipe','Bruno','Thiago','Rafael','Gustavo','Daniel','André',
      'Pedro','Carlos','Ricardo','Eduardo','Henrique','Leonardo','Diego','Victor','Rodrigo','Marcos'],
  f: ['Ana','Julia','Larissa','Fernanda','Camila','Beatriz','Mariana','Patricia','Amanda','Leticia',
      'Carolina','Isabela','Natalia','Priscila','Vanessa','Renata','Aline','Gabriela','Debora','Livia'],
  sobrenomes: ['Silva','Santos','Oliveira','Souza','Lima','Costa','Ferreira','Carvalho','Almeida',
               'Nascimento','Rodrigues','Gomes','Martins','Araújo','Barbosa','Pereira','Moreira','Cardoso'],
};

// ════════════════════════════════════════════════════════
// RENDERIZAR PAINEL DE EQUIPE
// ════════════════════════════════════════════════════════
window.renderEquipe = async function(j, el) {
  const uid = j.uid || window.JOGADOR_UID;

  // ── Caso 1: empregado de escritório NPC ou de outro jogador, sem ser sócio ──
  // (escritorio_empregado_id existe, mas escritorio_proprio_id não)
  if (!j.escritorio_proprio_id && j.escritorio_empregado_id) {
    el.innerHTML = `
      <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>
      <div class="secao-header"><div class="secao-titulo">👥 Equipe — ${j.escritorio_nome||'Escritório'}</div></div>
      <div class="card" style="text-align:center;padding:1.6rem;color:var(--txt3)">
        🏢 Este escritório é <b>autogerenciado</b> pela própria estrutura (NPC).<br><br>
        Você atua como advogado contratado e não participa da gestão de contratações,
        finanças ou demandas administrativas.<br><br>
        <span style="font-size:.7rem">Para gerenciar uma equipe, torne-se sócio de um escritório ou abra o seu próprio.</span>
      </div>`;
    return;
  }

  // ── Caso 2: nenhum vínculo com nenhum escritório (solo) ──
  const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
  if (!escId) {
    el.innerHTML = `
      <div class="secao-header"><div class="secao-titulo">👥 Equipe</div></div>
      <div class="card" style="text-align:center;padding:2rem;color:var(--txt3)">
        Você precisa ter um escritório próprio para gerenciar contratações.<br>
        <span style="font-size:.72rem">Abra seu escritório em <b>Escritório → Criar Escritório</b>.</span>
      </div>`;
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) { el.innerHTML = '<div class="card">Escritório não encontrado.</div>'; return; }
  const esc = escSnap.data();

  // ── Verificar se o jogador é DONO, SÓCIO ou ASSOCIADO (pode gerenciar) ──
  // Empregados regulares (Advogado Sênior pra baixo, sem participação societária)
  // NÃO gerenciam contratações — o escritório se autogerencia.
  const socios = esc.socios || [];
  const ehDono = esc.dono_uid === uid || esc.fundador_uid === uid;
  const ehSocioOuAssociado = socios.some(s => s.uid === uid) || ehDono;

  if (!ehSocioOuAssociado) {
    // Visão de autogestão para empregado comum (sênior pra baixo, sem sociedade)
    const fSnap2 = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    const totalFuncs = fSnap2.size;
    el.innerHTML = `
      <div class="secao-header"><div class="secao-titulo">👥 Equipe — ${esc.nome}</div></div>
      <div class="card" style="text-align:center;padding:1.6rem;color:var(--txt3)">
        🏢 Este escritório é <b>autogerenciado</b>.<br><br>
        Você atua como advogado contratado e não participa da gestão de contratações,
        finanças ou demandas administrativas. Essas decisões cabem aos sócios.<br><br>
        <span style="font-size:.78rem;color:var(--ouro2)">Equipe atual: ${totalFuncs} funcionário(s) cuidando das demandas do escritório.</span><br>
        <span style="font-size:.7rem">Para gerenciar um escritório, torne-se sócio ou abra o seu próprio.</span>
      </div>`;
    return;
  }

  const tier = esc.tier || 1;
  const cap  = TIER_CAPACIDADE[tier] || TIER_CAPACIDADE[1];

  // Buscar funcionários ativos
  const fSnap = await getDocs(query(
    collection(db, 'escritorios', escId, 'funcionarios'),
    orderBy('criado_em', 'asc')
  ));
  const funcs = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Contar processos ativos por NPC (para exibir capacidade usada/total)
  const procCountEquipe = {};
  try {
    const ativos = await getDocs(query(
      collection(db, 'escritorios', escId, 'processos_pool'),
      where('status', '==', 'em_andamento')
    ));
    for (const d of ativos.docs) {
      const fid = d.data().func_id;
      if (fid) procCountEquipe[fid] = (procCountEquipe[fid] || 0) + 1;
    }
  } catch(e) { /* mantém vazio */ }

  const estagiarios = funcs.filter(f => f.cargo_id === 'est');
  const assistentes = funcs.filter(f => f.cargo_id === 'ass');
  const advogados   = funcs.filter(f => ['jnr','pln','snr'].includes(f.cargo_id));

  const totalSalarios = funcs.reduce((s,f) => s + (CARGO_INFO[f.cargo_id]?.sal || 0), 0);
  const energiaDisp   = Math.max(0, 100 - (j.energia_usada_mes || 0));

  const totalVagas = cap.estagiarios + cap.assistentes + cap.advogados;
  el.innerHTML = `
        <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>

        <!-- Hero da Equipe -->
        <div class="equipe-hero">
          <div class="equipe-hero-conteudo">
            <div class="equipe-hero-titulo">${esc.nome}<span class="equipe-hero-tier">Tier ${tier}</span></div>
            <div class="equipe-hero-stats">
              <div class="equipe-hero-badge">
                <span class="l">Equipe</span><span class="v">${funcs.length}<small>/${totalVagas}</small></span>
              </div>
              <div class="equipe-hero-badge">
                <span class="l">Folha de pagamento</span><span class="v verm">-${_fmtK(totalSalarios + cap.custo_fixo)}<small>/mês</small></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Abas: Equipe | Diário -->
        <div style="display:flex;gap:0;margin-bottom:1rem;border-bottom:1px solid var(--navy-light)">
          <button class="equipe-tab-btn" data-tab="equipe" onclick="window.switchEquipeTab('equipe')"
            style="background:none;border:none;border-bottom:${_activeEquipeTab==='equipe'?'2px solid var(--ouro)':'2px solid transparent'};padding:.45rem 1rem;cursor:pointer;font-weight:700;font-size:.78rem;color:${_activeEquipeTab==='equipe'?'var(--ouro)':'var(--txt3)'}">
            👥 Equipe
          </button>
          <button class="equipe-tab-btn" data-tab="diario" onclick="window.switchEquipeTab('diario')"
            style="background:none;border:none;border-bottom:${_activeEquipeTab==='diario'?'2px solid var(--ouro)':'2px solid transparent'};padding:.45rem 1rem;cursor:pointer;font-weight:700;font-size:.78rem;color:${_activeEquipeTab==='diario'?'var(--ouro)':'var(--txt3)'}">
            📓 Diário
          </button>
        </div>
        <!-- Pane: Equipe -->
        <div class="equipe-tab-pane" data-tab="equipe" ${_activeEquipeTab==='diario'?'style="display:none"':''}>
          ${_renderEquipePane(estagiarios, assistentes, advogados, escId, energiaDisp, procCountEquipe, esc.mes_global || 0, cap)}
          ${await _renderProcessosPendentesRevisao(j, escId)}
        </div>

        <!-- Pane: Diário da Equipe -->
        <div class="equipe-tab-pane" data-tab="diario" ${_activeEquipeTab!=='diario'?'style="display:none"':''}>
          ${await _renderDiarioEquipe(escId)}
        </div>`;

  // Âncora solicitada pelo menu lateral do Escritório (Estagiários/
  // Assistentes/Advogados) ou por outras telas (ex.: Patrimônio) — desce
  // a página até o container do cargo correspondente.
  if (window._pendingScrollId) {
    const alvo = window._pendingScrollId;
    window._pendingScrollId = null;
    setTimeout(() => document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth' }), 50);
  }
};

// ── Classificação de status para os chips de filtro e o indicador (dot) ──
function _statusFuncionario(f) {
  if (f.burnout_npc) return { key:'atencao', label:'Em burnout', cor:'verm' };
  if ((f.conflitos_ativos||[]).length > 0) return { key:'atencao', label:'Em conflito', cor:'verm' };
  if (f.aviso_saida) return { key:'atencao', label:'Risco de saída', cor:'verm' };
  if (f.em_ferias) return { key:'disponivel', label:'Em férias', cor:'txt' };
  if (f.acao_atual) return { key:'trabalhando', label:'Trabalhando', cor:'ambar' };
  if (f.tipo === 'npc' && (f.energia_npc_usada_mes||0) > 80) return { key:'trabalhando', label:'Sobrecarregado', cor:'ambar' };
  return { key:'disponivel', label:'Disponível', cor:'verde' };
}

// Container retangular por cargo — nome do setor no topo, vagas/contratar
// no cabeçalho, e a grade de cards do próprio cargo dentro. Tem um id de
// âncora fixo para os botões "Estagiários/Assistentes/Advogados" (menu do
// Escritório e os chips desta página) descerem direto até ele.
function _renderContainerCargo(titulo, anchorId, membros, vagas, cargo_min, escId, energiaDisp, procCount, mesGlobal) {
  const cheio = membros.length >= vagas;
  const cardsHtml = membros.length === 0
    ? `<div class="equipe-vazio">Nenhum membro contratado neste cargo ainda.</div>`
    : `<div class="equipe-grid">${membros.map(f => _cardFuncionario(f, escId, energiaDisp, procCount, mesGlobal)).join('')}</div>`;
  return `
    <div class="equipe-cargo-container" id="${anchorId}">
      <div class="equipe-cargo-header">
        <div class="equipe-cargo-titulo">${titulo}</div>
        <div class="equipe-cargo-vagas">
          <span class="equipe-vaga-count">${membros.length}/${vagas} vagas</span>
          ${cheio
            ? `<span class="equipe-vaga-cheia">Cheias</span>`
            : `<button class="btn btn-sm btn-prim" onclick="window.abrirModalContratar('${cargo_min}','${escId}')">+ Contratar</button>`}
        </div>
      </div>
      ${cardsHtml}
    </div>`;
}

function _renderEquipePane(estagiarios, assistentes, advogados, escId, energiaDisp, procCount, mesGlobal, cap) {
  const todos = [...estagiarios, ...assistentes, ...advogados];

  const contStatus = { todos: todos.length, disponivel: 0, trabalhando: 0, atencao: 0 };
  todos.forEach(f => { contStatus[_statusFuncionario(f).key]++; });

  const CHIPS_CARGO = [
    ['equipe-grupo-estagiarios', 'Estagiários', estagiarios.length],
    ['equipe-grupo-assistentes', 'Assistentes', assistentes.length],
    ['equipe-grupo-advogados', 'Advogados', advogados.length],
  ];
  const CHIPS_STATUS = [
    ['todos', 'Todos', contStatus.todos], ['disponivel', 'Disponível', contStatus.disponivel],
    ['trabalhando', 'Trabalhando', contStatus.trabalhando], ['atencao', 'Atenção', contStatus.atencao],
  ];

  const chipsCargoHtml = `
    <div class="equipe-chip-grupo">
      ${CHIPS_CARGO.map(([anchorId, lbl, n]) => `
        <button class="equipe-chip" onclick="document.getElementById('${anchorId}')?.scrollIntoView({behavior:'smooth',block:'start'})">
          ${lbl} <span class="equipe-chip-n">${n}</span>
        </button>`).join('')}
    </div>`;
  const chipsStatusHtml = `
    <div class="equipe-chip-grupo">
      ${CHIPS_STATUS.map(([val, lbl, n], i) => `
        <button class="equipe-chip${i===0?' ativo':''}" data-filtro-status="${val}" onclick="window._filtrarEquipeStatus('${val}',this)">
          ${lbl} <span class="equipe-chip-n">${n}</span>
        </button>`).join('')}
    </div>`;

  return `
    <div class="equipe-filtros">
      ${chipsCargoHtml}
      ${chipsStatusHtml}
    </div>
    ${_renderContainerCargo('🎓 Estagiários', 'equipe-grupo-estagiarios', estagiarios, cap.estagiarios, 'est', escId, energiaDisp, procCount, mesGlobal)}
    ${_renderContainerCargo('📋 Assistentes', 'equipe-grupo-assistentes', assistentes, cap.assistentes, 'ass', escId, energiaDisp, procCount, mesGlobal)}
    ${_renderContainerCargo('⚖️ Advogados', 'equipe-grupo-advogados', advogados, cap.advogados, 'jnr', escId, energiaDisp, procCount, mesGlobal)}`;
}

// ── Filtro por status (toggle de display, sem re-render) — cargo agora é
// estrutural (um container por cargo), então só o status precisa filtrar. ──
let _filtroStatusAtivo = 'todos';
function _aplicarFiltrosEquipe() {
  document.querySelectorAll('.func-card').forEach(card => {
    card.style.display = (_filtroStatusAtivo === 'todos' || card.dataset.status === _filtroStatusAtivo) ? '' : 'none';
  });
}
window._filtrarEquipeStatus = function(valor, el) {
  _filtroStatusAtivo = valor;
  el.parentElement.querySelectorAll('.equipe-chip').forEach(c => c.classList.remove('ativo'));
  el.classList.add('ativo');
  _aplicarFiltrosEquipe();
};

const _SKILL_CAP_EQ = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
const _CARGO_BON_EQ = { est:0,  ass:5,  jnr:10, pln:15, snr:20, asc:25, soc:30  };

const _CARGO_MENTOR_EQ   = new Set(['pln','snr','asc','soc']);
const _CARGO_APRENDIZ_EQ = new Set(['est','ass','jnr']);
const _CARGO_PROX_EQ     = { est:'ass', ass:'jnr', jnr:'pln', pln:'snr', snr:'asc', asc:'soc' };
const _CARGO_SAL_MIN_EQ  = { est:1700, ass:2500, jnr:3500, pln:5750, snr:9000, asc:18000, soc:35000 };
const _CARGO_SAL_MAX_EQ  = { est:1700, ass:3500, jnr:6500, pln:11000, snr:20000, asc:35000, soc:65000 };
const _SKILL_FULL_LBL    = {
  pesquisa:'Pesquisa', escrita:'Escrita', escrita_juridica:'Escrita Jur.',
  argumentacao:'Argumentação', oratoria:'Oratória', persuasao:'Persuasão',
  negociacao:'Negociação', gestao:'Gestão',
};

// Skills jurídicas / tipos de documento / áreas do direito — mesma
// nomenclatura usada no Perfil do jogador (js/ui-main.js renderHabilidades)
// e no Perfil do funcionário (js/escritorio_painel.js). Agora também
// existem DE VERDADE no funcionário (f.skills_jur), seedadas em
// _contratarNPC e treináveis pelo Estudo Autônomo — antes só existiam
// como uma aproximação calculada na hora só pra exibição no Perfil.
const _SKILL_JUR_BASE_LBL = {
  legal_drafting:'Redação Jurídica', legal_research:'Pesquisa Jurídica',
  argumentation:'Argumentação (Jur.)', oral_advocacy:'Sustentação Oral',
  negotiation:'Negociação (Jur.)', procedure:'Litigância', gestao:'Gestão (Jur.)',
};
const _DOC_JUR_LBL = {
  doc_initial_filing:'Petição Inicial', doc_responsive_pleading:'Contestação',
  doc_motion:'Requerimento', doc_appellate_brief:'Razões de Apelação',
  doc_supreme_brief:'Razões de Rec. Especial', doc_trial_brief:'Memoriais',
  doc_evidence:'Prova Documental', doc_deposition:'Depoimento',
};
const _AREA_JUR_LBL = {
  area_employment:'Trabalhista', area_tax:'Tributário', area_civil:'Cível',
  area_criminal:'Criminal', area_corporate:'Empresarial',
  area_immigration:'Imigração', area_bankruptcy:'Rec. Judicial',
};
const _SKILL_JUR_TODAS_LBL = { ..._SKILL_JUR_BASE_LBL, ..._DOC_JUR_LBL, ..._AREA_JUR_LBL };
const CAP_JUR_NPC = 50;
const _CARGO_JUR_BASE_EQ = { est:4, ass:8, jnr:14, pln:20, snr:26 };

function _calcProd(func) {
  const skills = func.skills || {};
  const vals   = Object.values(skills).filter(v => typeof v === 'number');
  const media  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 15;
  const cap    = _SKILL_CAP_EQ[func.cargo_id] || 35;
  const bon    = _CARGO_BON_EQ[func.cargo_id] || 0;
  const pen    = (func.acao_atual && (func.acao_atual.progresso_delegado || 0) < 20) ? -5 : 0;
  const stressMod = _calcStressMod(func);
  return Math.min(98, Math.max(20, Math.round((media / cap) * 70 + bon + pen + stressMod + 10)));
}

const _NPC_MAX_PROC_EQ   = { est:1, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:5 };
const _CUSTO_NPC_TAREFA  = { est:15, ass:15, jnr:20, pln:20, snr:25, asc:25, soc:30 };
const _SKILLS_REL_EQ     = ['escrita_juridica','pesquisa','oratoria','persuasao','argumentacao'];
const _CARGO_CAP_EQ_EFIC = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };

// Modificador de produtividade por faixa de estresse
function _calcStressMod(func) {
  const s = func.estresse || 0;
  if (s > 60) return -25;
  if (s > 30) return -10;
  return 0;
}

function _calcEfic(func) {
  const vals = _SKILLS_REL_EQ.map(s => (func.skills||{})[s] || 0);
  const media = vals.reduce((a,b)=>a+b,0) / vals.length;
  return Math.round(Math.min(100, (media / (_CARGO_CAP_EQ_EFIC[func.cargo_id]||35)) * 100));
};

function _elegibilidadePromocao(f) {
  const prox = _CARGO_PROX_EQ[f.cargo_id];
  if (!prox) return null;
  const cap_prox   = _SKILL_CAP_EQ[prox] || 0;
  const skillVals  = Object.values(f.skills || {}).filter(v => typeof v === 'number');
  const mediaSkill = skillVals.length ? skillVals.reduce((a,b)=>a+b,0)/skillVals.length : 0;
  const ok_meses   = (f.meses_no_cargo || 0) >= 6;
  const ok_casos   = (f.casos_resolvidos_total || 0) >= 10;
  const ok_feedback= (f.feedback_media_estrelas || 3) >= 3.5;
  const ok_skills  = mediaSkill >= cap_prox * 0.5;
  return { elegivel: ok_meses && ok_casos && ok_feedback && ok_skills,
    prox, ok_meses, ok_casos, ok_feedback, ok_skills };
}

function _cardFuncionario(f, escId, energiaDisp, procCount = {}, mesGlobal = 0) {
  const ci    = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;
  const skills = f.skills || {};
  const prod   = _calcProd(f);
  const prodColor = prod >= 80 ? '#2E8B57' : prod >= 60 ? '#B7791F' : '#C0392B';
  const podeCoordenar = energiaDisp >= ci.custo_coord;
  const efic      = f.tipo === 'npc' ? _calcEfic(f) : null;
  const eficColor = efic >= 80 ? '#2E8B57' : efic >= 55 ? '#B7791F' : '#C0392B';
  const status    = _statusFuncionario(f);

  const ini = (f.nome||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase().slice(0,2);
  const svgSrc = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='153' height='153'%3E%3Ccircle cx='76' cy='76' r='76' fill='%231E293C'/%3E%3Ctext x='76' y='96' font-size='36' font-weight='700' fill='%23D9B573' text-anchor='middle' font-family='IBM Plex Sans,Arial'%3E${ini}%3C/text%3E%3C/svg%3E`;
  const nomeEsc = f.nome.replace(/'/g, "\\'");
  const fotoHtml = (f.tipo === 'npc' && f.foto_npc)
    ? `<img class="func-avatar" src="img/npcs%20cartoon/${f.foto_npc}" alt="${f.nome}" onerror="window._svgNpcFallback(this,'${nomeEsc}')">`
    : `<img class="func-avatar" src="${svgSrc}" alt="${ini}">`;

  // Duas skills de maior valor viram barra — o resto fica no Perfil, sem perder o dado.
  const capSkill  = _SKILL_CAP_EQ[f.cargo_id] || 35;
  const skillsOrd = Object.entries(skills).sort((a,b) => b[1]-a[1]);
  const topSkills = skillsOrd.slice(0, 2);
  const restantes = skillsOrd.length - topSkills.length;
  const skillsHtml = topSkills.length === 0 ? '' : `
    <div class="func-skills">
      ${topSkills.map(([k,v]) => `
        <div class="func-skill-row">
          <span class="func-skill-label">${_skillLabel(k)}</span>
          <div class="func-skill-bar"><div class="func-skill-fill" style="width:${Math.min(100, Math.round(v/capSkill*100))}%"></div></div>
          <span class="func-skill-val">${v}</span>
        </div>`).join('')}
      ${restantes > 0 ? `<div class="func-skill-mais" onclick="window._abrirPerfilFuncionario('${escId}','${f.id}')">+${restantes} habilidade(s) — ver Perfil</div>` : ''}
    </div>`;

  const statusStack = `<div class="func-status-stack">
    ${f.acao_atual ? `
      <div style="font-size:.7rem;color:var(--amber)">
        📋 Trabalhando em processo · ${f.acao_atual.progresso_delegado||0}% concluído
      </div>` : ''}
    ${f.tipo === 'npc' ? (() => {
      const npcUsado  = f.energia_npc_usada_mes || 0;
      const npcDisp   = Math.max(0, 100 - npcUsado);
      const emBurnout = !!f.burnout_npc;
      const sobrecarr = !emBurnout && npcUsado > 80;
      const pct       = Math.round((npcDisp / 100) * 100);
      const corBarra  = emBurnout ? 'var(--verm2)' : sobrecarr ? 'var(--amber)' : 'var(--verde2)';
      const maxProc   = _NPC_MAX_PROC_EQ[f.cargo_id] || 1;
      const procAtivos = procCount[f.id] || 0;
      const statusTxt = emBurnout
        ? `🔴 Burnout — ${f.burnout_npc_restante||0} mês(es) afastado`
        : sobrecarr
          ? `⚠️ Sobrecarregado este mês`
          : `⚡ ${npcDisp}/100 disponível`;
      return `<div style="margin:.3rem 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem">
          <span style="font-size:.6rem;color:${corBarra}">${statusTxt}</span>
          <span style="font-size:.6rem;color:var(--txt4)">📋 ${procAtivos}/${maxProc} casos</span>
        </div>
        <div style="height:5px;background:var(--bg2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${corBarra};border-radius:3px;transition:width .4s"></div>
        </div>
      </div>`;
    })() : ''}
    ${f.tipo === 'npc' && (f.estresse || 0) > 0 ? (() => {
      const s  = f.estresse || 0;
      const sc = s > 60 ? 'var(--verm2)' : s > 30 ? 'var(--amber)' : 'var(--verde2)';
      const st = s > 60 ? '😤 Muito estressado' : s > 30 ? '😐 Tenso' : '😊 Tranquilo';
      return `<div style="margin:.2rem 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.15rem">
          <span style="font-size:.6rem;color:${sc}">${st}</span>
          <span style="font-size:.6rem;color:var(--txt4)">🌡️ ${s}/100</span>
        </div>
        <div style="height:4px;background:var(--bg2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${s}%;background:${sc};border-radius:3px"></div>
        </div>
      </div>`;
    })() : ''}
    ${f.tipo === 'npc' && f.mentor_id ? (() => {
      const skLbl = _SKILL_FULL_LBL[f.skill_sendo_treinada] || f.skill_sendo_treinada || '—';
      return `<div style="font-size:.65rem;color:var(--verde2);background:var(--verde-bg);padding:.2rem .4rem;border-radius:4px">
        📚 Aprendiz de ${f.mentor_nome||'mentor'} · ${skLbl} · ${f.meses_mentoria_restantes||0} mês(es)
      </div>`;
    })() : ''}
    ${f.tipo === 'npc' && !f.mentor_id && !f.burnout_npc && !f.em_ferias ? (() => {
      const skFoco = f.skill_em_estudo;
      const lbl = skFoco ? (_SKILL_FULL_LBL[skFoco]||skFoco) : 'Auto (skill mais fraca)';
      return `<div style="font-size:.63rem;color:var(--txt4)">
        📖 Estudo autônomo: <span style="color:var(--navy3)">${lbl}</span>
        <button onclick="window.designarEstudo('${f.id}','${escId}')"
          style="font-size:.55rem;padding:.05rem .25rem;margin-left:.3rem;background:transparent;border:1px solid var(--txt4);border-radius:3px;cursor:pointer;color:var(--txt4)">mudar</button>
      </div>`;
    })() : ''}
    ${f.tipo === 'npc' && (f.aprendizes_ids||[]).length > 0 ? `
      <div style="font-size:.65rem;color:var(--navy3)">
        🎓 Mentor ativo: ${(f.aprendizes_ids||[]).length} aprendiz(es)
      </div>` : ''}
    ${f.tipo === 'npc' && f.em_ferias ? `
      <div style="font-size:.65rem;color:var(--txt3);background:var(--bg2);padding:.2rem .4rem;border-radius:4px">
        🏖️ Em férias este mês
      </div>` : ''}
    ${f.tipo === 'npc' && !f.em_ferias && mesGlobal - (f.ultimas_ferias_mes_total ?? 0) >= 12 && (f.meses_no_cargo||0) >= 12 ? `
      <div style="font-size:.65rem;color:var(--amber)">
        ✅ Férias disponíveis (${mesGlobal - (f.ultimas_ferias_mes_total ?? 0)} meses sem descanso)
      </div>` : ''}
    ${f.tipo === 'npc' && (f.conflitos_ativos||[]).length > 0 ? (f.conflitos_ativos||[]).map((c, idx) => {
      const cor = c.tipo === 'estrutural' ? 'var(--verm2)' : 'var(--amber)';
      const lbl = c.tipo === 'estrutural' ? '⚠️ Conflito estrutural' : '😤 Desentendimento';
      return `<div style="font-size:.65rem;color:${cor};display:flex;justify-content:space-between;align-items:center">
        <span>${lbl} com ${c.com_nome}</span>
        ${!c.em_mediacao
          ? `<button style="font-size:.55rem;padding:.1rem .3rem;background:${cor};color:#fff;border:none;border-radius:3px;cursor:pointer"
              onclick="window.mediarConflito('${f.id}',${idx},'${escId}')">Mediar</button>`
          : `<span style="font-size:.55rem;color:var(--verde2)">Em mediação</span>`}
      </div>`;
    }).join('') : ''}
    ${f.tipo === 'npc' ? (() => {
      const promo = _elegibilidadePromocao(f);
      if (!promo?.elegivel) return '';
      const proxCi = CARGO_INFO[promo.prox];
      return `<div style="font-size:.65rem;color:var(--verde2);background:var(--verde-bg);padding:.2rem .4rem;border-radius:4px">
        ✨ Elegível para promoção → ${proxCi?.l || promo.prox}
      </div>`;
    })() : ''}
    ${f.tipo === 'npc' && f.aviso_saida ? `
      <div style="font-size:.65rem;color:var(--verm2);font-weight:700">
        🚨 Risco de saída — estresse crítico!
      </div>` : ''}
  </div>`;

  // Ações secundárias vivem no menu "⋯" — só "Designar" fica sempre visível no rodapé.
  const menuItens = [];
  if (f.tipo === 'npc' && _CARGO_MENTOR_EQ.has(f.cargo_id) && !f.burnout_npc && !f.em_ferias && (f.aprendizes_ids||[]).length < 2) {
    menuItens.push(`<button onclick="window.abrirModalMentoria('${f.id}','${escId}')">🎓 Mentoria</button>`);
  }
  if (f.tipo === 'npc' && (_elegibilidadePromocao(f)||{}).elegivel) {
    menuItens.push(`<button onclick="window.abrirModalPromover('${f.id}','${escId}')">✨ Promover</button>`);
  }
  if (f.tipo === 'npc' && !f.em_ferias && mesGlobal - (f.ultimas_ferias_mes_total ?? 0) >= 12 && (f.meses_no_cargo||0) >= 12) {
    menuItens.push(`<button onclick="window.concederFerias('${f.id}','${escId}','${nomeEsc}')">🏖️ Férias</button>`);
  }
  menuItens.push(`<button onclick="window._abrirPerfilFuncionario('${escId}','${f.id}')">👤 Perfil</button>`);
  menuItens.push(`<button class="func-menu-danger" onclick="window.demitirFuncionario('${f.id}','${escId}','${f.nome}')">Demitir</button>`);

  return `
    <div class="func-card" data-status="${status.key}">
      <div class="func-card-topo">
        ${fotoHtml}
        <div class="func-card-info">
          <div class="func-nome-row">
            <span class="func-dot func-dot-${status.cor}" title="${status.label}"></span>
            <span class="func-nome">${f.nome}</span>
          </div>
          <div class="func-cargo">${ci.l}${f.tipo === 'npc' && f.meses_no_cargo ? ` · ${f.meses_no_cargo}m no cargo` : ''}</div>
          <div class="func-badges">
            <span class="func-badge" style="color:${prodColor}">Produtividade ${prod}%</span>
            ${efic !== null ? `<span class="func-badge" style="color:${eficColor}">Eficiência ${efic}%</span>` : ''}
          </div>
        </div>
        <div class="func-menu-wrap">
          <button class="func-menu-btn" onclick="window._toggleFuncMenu(event,'${f.id}')" aria-label="Mais ações">⋯</button>
          <div class="func-menu" id="func-menu-${f.id}">${menuItens.join('')}</div>
        </div>
      </div>
      ${skillsHtml}
      ${statusStack}
      <div class="func-card-footer">
        <span class="func-salario">R$ ${ci.sal.toLocaleString('pt-BR')}/mês${ci.hon_pct > 0 ? ` · ${ci.hon_pct*100}% hon.` : ''}</span>
        <button class="btn btn-sm btn-prim" ${!podeCoordenar?'disabled':''}
          onclick="window.abrirModalDesignar('${f.id}','${escId}')"
          title="${!podeCoordenar?'Energia insuficiente':'Designar processo'}">
          📋 Designar (-${ci.custo_coord}⚡)
        </button>
      </div>
    </div>`;
}

// ── Menu "⋯" (ações secundárias) — abre um por vez, fecha ao clicar fora ──
window._toggleFuncMenu = function(ev, fid) {
  ev.stopPropagation();
  const alvo = document.getElementById(`func-menu-${fid}`);
  const jaAberto = alvo?.classList.contains('aberto');
  document.querySelectorAll('.func-menu.aberto').forEach(m => m.classList.remove('aberto'));
  if (alvo && !jaAberto) alvo.classList.add('aberto');
};
document.addEventListener('click', () => {
  document.querySelectorAll('.func-menu.aberto').forEach(m => m.classList.remove('aberto'));
});

async function _renderProcessosPendentesRevisao(j, escId) {
  try {
    const qSnap1 = await getDocs(query(
  collection(db, 'processos'),
  where('escritorio_id', '==', escId),
  where('delegado_revisao_pendente', '==', true)
));
const qSnap2 = await getDocs(query(
  collection(db, 'processos'),
  where('pool_escritorio_id', '==', escId),
  where('delegado_revisao_pendente', '==', true)
));
const qSnap = { docs: [...qSnap1.docs, ...qSnap2.docs], empty: qSnap1.empty && qSnap2.empty };
    if (qSnap.empty) return '';
    const procs = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return `
      <div style="margin-top:1.2rem">
        <div style="font-size:.8rem;font-weight:700;color:var(--verde);margin-bottom:.5rem;padding-bottom:.3rem;border-bottom:2px solid var(--verde-bg)">
          ✅ Processos para Revisão (${procs.length})
        </div>
        ${procs.map(p => `
          <div class="card" style="margin-bottom:.4rem;border-left:3px solid var(--verde2)">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:.82rem;font-weight:600;color:var(--txt)">${p.autor||'—'} vs ${p.reu||'—'}</div>
                <div style="font-size:.68rem;color:var(--ouro2)">${p.tipo||'—'} · ${p.progresso||0}% concluído pelo funcionário</div>
                <div style="font-size:.65rem;color:var(--verde2)">Pronto para revisão e sentença</div>
              </div>
              <button class="btn btn-sm btn-prim" onclick="window.abrirProcesso('${p.id}')">
                Revisar →
              </button>
            </div>
          </div>`).join('')}
      </div>`;
  } catch(e) { return ''; }
}

// ════════════════════════════════════════════════════════
// DIÁRIO DE EQUIPE
// ════════════════════════════════════════════════════════
const _DIARIO_ICONE = {
  conflito_leve:'⚡', conflito_estrutural:'🔥', mediacao:'🤝', mentoria:'📚',
  promocao:'⭐', ferias:'🏖️', competicao:'🏆', saida:'👋',
  feedback_cliente:'💬', bonus:'💰', caso_importante:'⚖️',
};

async function _renderDiarioEquipe(escId) {
  try {
    const snap = await getDocs(query(
      collection(db, 'escritorios', escId, 'log_equipe'),
      orderBy('criado_em', 'desc'),
      limit(80)
    ));
    if (snap.empty) {
      return `<div style="text-align:center;padding:2rem;color:var(--txt4);font-size:.78rem">
        📓 Nenhum evento registrado ainda.<br>
        <span style="font-size:.7rem">Ações da equipe (conflitos, promoções, mentoria…) aparecerão aqui.</span>
      </div>`;
    }
    return snap.docs.map(d => {
      const e    = d.data();
      const msg  = e.msg || e.texto || '';
      const data = e.criado_em
        ? new Date(e.criado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
        : '';
      return `<div class="card" style="margin-bottom:.4rem;border-left:3px solid var(--navy-light)">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:.5rem">
          <div style="font-size:.78rem;color:var(--txt)">${msg}</div>
          <span style="font-size:.6rem;color:var(--txt4);white-space:nowrap">${data}</span>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    console.error('[Diário]', err);
    return `<div style="color:var(--txt4);font-size:.78rem;padding:1rem">Erro ao carregar diário: ${err.message}</div>`;
  }
}

// Troca de aba sem re-render completo
window.switchEquipeTab = function(tab) {
  _activeEquipeTab = tab;
  document.querySelectorAll('.equipe-tab-btn').forEach(b => {
    const ativo = b.dataset.tab === tab;
    b.style.color        = ativo ? 'var(--ouro)' : 'var(--txt3)';
    b.style.borderBottom = ativo ? '2px solid var(--ouro)' : '2px solid transparent';
  });
  document.querySelectorAll('.equipe-tab-pane').forEach(p => {
    p.style.display = p.dataset.tab === tab ? '' : 'none';
  });
};

// Helper global para outros módulos gravarem no diário de equipe
window.addLogEquipe = async function(escId, tipo, texto, envolvidos = []) {
  if (!escId) return;
  try {
    await addDoc(collection(db, 'escritorios', escId, 'log_equipe'), {
      texto, tipo, envolvidos,
      criado_em: new Date().toISOString(),
    });
  } catch(e) { console.warn('addLogEquipe:', e); }
};

// ════════════════════════════════════════════════════════
// CONTRATAR FUNCIONÁRIO
// ════════════════════════════════════════════════════════
window.abrirModalContratar = function(cargo_min, escId) {
  const j = window.JOGADOR;

  abrirModal('👤 Contratar Funcionário',
    `<div style="font-size:.78rem;color:var(--txt2);margin-bottom:1rem">
      Você pode contratar um <b>NPC gerado pelo jogo</b> ou convidar um <b>jogador real</b> pelo e-mail.
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem">
      <button class="btn btn-prim btn-block" onclick="window._contratarNPC('${cargo_min}','${escId}')">
        🤖 Contratar NPC (imediato)
      </button>
      <button class="btn btn-sec btn-block" onclick="window._abrirConviteJogador('${cargo_min}','${escId}')">
        👤 Convidar jogador real
      </button>
    </div>
    <div style="font-size:.7rem;color:var(--txt4);text-align:center">
      NPCs têm skills aleatórias. Jogadores reais trazem suas próprias habilidades.
    </div>`
  );
};

const _EQ_BASE_SKILLS_CARGO = {
  est: { pesquisa:12, escrita:10, argumentacao:10, oratoria:8  },
  ass: { pesquisa:22, escrita:20, argumentacao:18, oratoria:15 },
  jnr: { pesquisa:30, escrita:28, argumentacao:28, oratoria:25 },
  pln: { pesquisa:40, escrita:38, argumentacao:38, oratoria:35 },
  snr: { pesquisa:50, escrita:48, argumentacao:48, oratoria:45 },
};

function _gerarCandidatoNPC(cargo_id, fotosUsadas) {
  const sexo         = Math.random() < 0.5 ? 'm' : 'f';
  const primeiroNome = NOMES_NPC[sexo][Math.floor(Math.random() * NOMES_NPC[sexo].length)];
  const sobrenome    = NOMES_NPC.sobrenomes[Math.floor(Math.random() * NOMES_NPC.sobrenomes.length)];
  const nome         = primeiroNome + ' ' + sobrenome;

  const pool = NPC_CARTOON_SPECS[sexo].map(_nomeArquivoCartoon).filter(f => !fotosUsadas.has(f));
  const foto_npc = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  if (foto_npc) fotosUsadas.add(foto_npc);

  const base   = _EQ_BASE_SKILLS_CARGO[cargo_id] || _EQ_BASE_SKILLS_CARGO.est;
  const skills = {};
  Object.entries(base).forEach(([k,v]) => {
    skills[k] = Math.max(1, Math.round(v * (0.7 + Math.random() * 0.6)));
  });

  const baseJur   = _CARGO_JUR_BASE_EQ[cargo_id] || _CARGO_JUR_BASE_EQ.est;
  const skills_jur = {};
  Object.keys(_SKILL_JUR_TODAS_LBL).forEach(k => {
    skills_jur[k] = Math.max(0, Math.min(CAP_JUR_NPC, Math.round(baseJur * (0.6 + Math.random() * 0.6))));
  });

  const mediaGeral = Math.round(Object.values(skills).reduce((a,b)=>a+b,0) / Object.values(skills).length);

  return { nome, cargo_id, skills, skills_jur, sexo, foto_npc, mediaGeral };
}

// ════════════════════════════════════════════════════════
// CONTRATAÇÃO — tela dedicada (mockup: RH · Contratação). Real:
// TIER_CAPACIDADE por cargo, contagem de funcionários atuais, triagem
// de 3 candidatos já implementada em _contratarNPC/_gerarCandidatoNPC.
// ════════════════════════════════════════════════════════
window.renderContratacao = async function(j, el) {
  const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
  if (!escId) { el.innerHTML = `<div class="card" style="color:var(--txt3)">Você precisa de um escritório.</div>`; return; }

  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">Contratação</div></div><div class="card">Carregando...</div>`;

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const esc = escSnap.exists() ? escSnap.data() : {};
  const tier = esc.tier || 1;
  const cap = TIER_CAPACIDADE[tier] || TIER_CAPACIDADE[1];

  const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
  const funcs = fSnap.docs.map(d => d.data()).filter(f => f.ativo !== false);
  const nEst = funcs.filter(f => f.cargo_id === 'est').length;
  const nAss = funcs.filter(f => f.cargo_id === 'ass').length;
  const nAdv = funcs.filter(f => ['jnr','pln','snr'].includes(f.cargo_id)).length;

  const vagasEst = Math.max(0, cap.estagiarios - nEst);
  const vagasAss = Math.max(0, cap.assistentes - nAss);
  const vagasAdv = Math.max(0, cap.advogados - nAdv);
  const totalVagas = vagasEst + vagasAss + vagasAdv;
  const totalEquipe = funcs.length;

  const linha = (icone, label, atual, capMax, vagas, cargoKey, salLabel) => `
    <div class="oport-row" style="${vagas===0?'opacity:.55':''}">
      <div>
        <div class="oport-kicker">${icone} ${label.toUpperCase()}</div>
        <div class="oport-titulo">${vagas>0?`${vagas} vaga${vagas===1?'':'s'} disponível${vagas===1?'':'eis'}`:`Sem vagas — capacidade cheia (${atual}/${capMax})`}</div>
        <div class="oport-desc">Salário fixo por cargo · sem custo de contratação — só +2 Gestão pra você.</div>
      </div>
      <div class="oport-valor"><div class="oport-preco" style="font-size:.8rem">${salLabel}</div></div>
      <div class="oport-acoes">
        ${vagas>0
          ? `<button class="btn btn-sm btn-prim" onclick="window._contratarNPC('${cargoKey}','${escId}')">Ver candidatos</button>`
          : `<button class="btn btn-sm btn-ghost" disabled>Indisponível</button>`}
      </div>
    </div>`;

  el.innerHTML = `
    <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>
    ${window._capaHeader(`RECURSOS HUMANOS · ${(esc.nome||'—').toUpperCase()}`, 'Contratação', '')}
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Equipe atual</div><div class="stat-value">${totalEquipe}</div></div>
      <div class="stat"><div class="stat-label">Vagas abertas</div><div class="stat-value up">${totalVagas}</div></div>
      <div class="stat"><div class="stat-label">Capacidade do escritório</div><div class="stat-value">${cap.estagiarios+cap.assistentes+cap.advogados} <small>tier ${tier}</small></div></div>
    </div>
    <div class="esc-card-bloco">
      <div class="secao-header" style="margin-bottom:.6rem"><div class="secao-titulo">Vagas Abertas</div></div>
      ${linha('🎓','Estagiário', nEst, cap.estagiarios, vagasEst, 'est', `R$ ${CARGO_INFO.est.sal.toLocaleString('pt-BR')}/mês`)}
      ${linha('📋','Assistente Jurídico', nAss, cap.assistentes, vagasAss, 'ass', `R$ ${CARGO_INFO.ass.sal.toLocaleString('pt-BR')}/mês`)}
      ${linha('⚖️','Advogado', nAdv, cap.advogados, vagasAdv, 'jnr', `R$ ${CARGO_INFO.jnr.sal.toLocaleString('pt-BR')}–${CARGO_INFO.snr.sal.toLocaleString('pt-BR')}/mês`)}
    </div>`;
};

// ════════════════════════════════════════════════════════
// MENTORIA & TREINAMENTO — tela dedicada (mockup: RH · Mentoria &
// Treinamento). Real: mentoria 1-a-1 (mentor Pleno+, aprendiz até
// Júnior, 3-6 meses, 30⚡/mês do mentor). Não existe catálogo de
// cursos/instrutor pra NPC — isso é proposta, marcado à parte.
// ════════════════════════════════════════════════════════
window.renderTreinamento = async function(j, el) {
  const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
  if (!escId) { el.innerHTML = `<div class="card" style="color:var(--txt3)">Você precisa de um escritório.</div>`; return; }

  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">Mentoria & Treinamento</div></div><div class="card">Carregando...</div>`;

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const esc = escSnap.exists() ? escSnap.data() : {};

  const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
  const funcs = fSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.ativo !== false);

  const ativas = funcs.filter(f => f.mentor_id);
  const mentores = funcs.filter(f => f.tipo === 'npc' && _CARGO_MENTOR_EQ.has(f.cargo_id) && !f.burnout_npc && !f.em_ferias && (f.aprendizes_ids||[]).length < 2);
  const aprendizesElegiveis = funcs.filter(f => f.tipo === 'npc' && _CARGO_APRENDIZ_EQ.has(f.cargo_id) && !f.mentor_id && !f.burnout_npc && !f.em_ferias);

  const ativasHtml = ativas.length ? ativas.map(f => {
    const dur = f.meses_mentoria_restantes || 0;
    const skillLabel = _SKILL_FULL_LBL[f.skill_sendo_treinada] || f.skill_sendo_treinada || '—';
    const pct = dur > 0 ? Math.round((1 - dur / 6) * 100) : 0;
    return `<div class="esc-card-bloco" style="margin-bottom:.6rem">
      <div style="font-size:.85rem;color:var(--txt)">${f.mentor_nome || '—'} <span style="color:var(--txt4)">ensinando</span> ${f.nome}</div>
      <div style="font-size:.72rem;color:var(--ouro);margin-top:.15rem">Skill: ${skillLabel} · 30⚡/mês do mentor</div>
      <div style="font-size:.68rem;color:var(--txt3);margin-top:.4rem;display:flex;justify-content:space-between"><span>Progresso</span><span>${dur} mês(es) restante(s)</span></div>
      <div class="skill-bar" style="margin-top:.2rem"><div class="skill-fill" style="width:${Math.max(5,pct)}%"></div></div>
    </div>`;
  }).join('') : `<div class="card" style="color:var(--txt4)">Nenhuma mentoria ativa.</div>`;

  const mentoresHtml = mentores.length ? mentores.map(f => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--bg2)">
      <span style="font-size:.78rem;color:var(--txt)">${f.nome} <span style="color:var(--txt4)">(${(CARGO_INFO[f.cargo_id]||{}).l||f.cargo_id})</span></span>
      <button class="btn btn-sm btn-prim" onclick="window.abrirModalMentoria('${f.id}','${escId}')">Iniciar mentoria</button>
    </div>`).join('') : `<div style="font-size:.75rem;color:var(--txt4)">Nenhum mentor disponível agora (precisa ser Pleno+, sem burnout/férias, com menos de 2 aprendizes).</div>`;

  el.innerHTML = `
    <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>
    ${window._capaHeader(`RECURSOS HUMANOS · ${(esc.nome||'—').toUpperCase()}`, 'Mentoria & Treinamento', '')}
    <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:1rem">
      📌 Não existe catálogo de cursos, instrutor ou certificação pra NPC — só mentoria 1-a-1 é real.
    </div>
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Mentorias ativas</div><div class="stat-value">${ativas.length}</div></div>
      <div class="stat"><div class="stat-label">Energia investida/mês</div><div class="stat-value">${ativas.length*30}⚡</div></div>
      <div class="stat"><div class="stat-label">Mentores disponíveis</div><div class="stat-value up">${mentores.length}</div></div>
      <div class="stat"><div class="stat-label">Aprendizes elegíveis</div><div class="stat-value up">${aprendizesElegiveis.length}</div></div>
    </div>
    <div class="esc-card-bloco" style="margin-bottom:1rem">
      <div class="secao-header" style="margin-bottom:.6rem"><div class="secao-titulo">Mentorias Ativas</div></div>
      ${ativasHtml}
    </div>
    <div class="esc-card-bloco" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.6rem"><div class="secao-titulo">Iniciar Nova Mentoria</div></div>
      ${mentoresHtml}
    </div>
    <div class="esc-card-bloco" style="border-color:var(--bronze-bg,var(--borda2))">
      <div class="secao-header" style="margin-bottom:.4rem">
        <div class="secao-titulo">📌 Cursos Corporativos</div>
      </div>
      <div style="font-size:.68rem;color:var(--txt4);line-height:1.6;margin-bottom:.6rem">
        Proposta — não existe no jogo ainda, alternativa em grupo à mentoria 1-a-1. Cobre os mesmos blocos de skill real
        (skills_jur do funcionário + habilidades gerais).
      </div>
      <div class="equipe-tabs" id="curso-tabs">
        <div class="equipe-tab ativo" data-cursotab="todos" onclick="window._cursoTab(this,'todos')">Todos</div>
        <div class="equipe-tab" data-cursotab="base" onclick="window._cursoTab(this,'base')">Skills Jurídicas</div>
        <div class="equipe-tab" data-cursotab="doc" onclick="window._cursoTab(this,'doc')">Peças &amp; Documentos</div>
        <div class="equipe-tab" data-cursotab="area" onclick="window._cursoTab(this,'area')">Áreas do Direito</div>
        <div class="equipe-tab" data-cursotab="geral" onclick="window._cursoTab(this,'geral')">Habilidades Gerais</div>
      </div>
      <div id="curso-grid" class="peca-grid"></div>
    </div>`;

  window._cursoTab(document.querySelector('#curso-tabs [data-cursotab="todos"]'), 'todos');
};

const _CURSO_CATS = {
  base:  { l: 'Skills Jurídicas',       map: _SKILL_JUR_BASE_LBL },
  doc:   { l: 'Peças & Documentos',     map: _DOC_JUR_LBL },
  area:  { l: 'Áreas do Direito',       map: _AREA_JUR_LBL },
  geral: { l: 'Habilidades Gerais',     map: _SKILL_FULL_LBL },
};

window._cursoTab = function(btn, tab) {
  if (btn) btn.parentElement.querySelectorAll('.equipe-tab').forEach(t => t.classList.toggle('ativo', t === btn));
  const grid = document.getElementById('curso-grid');
  if (!grid) return;
  const cats = tab === 'todos' ? Object.keys(_CURSO_CATS) : [tab];
  const cards = [];
  for (const catKey of cats) {
    const cat = _CURSO_CATS[catKey];
    for (const [k, l] of Object.entries(cat.map)) {
      cards.push(`
        <div class="peca-card">
          <div class="peca-topo"><div class="peca-kicker">${cat.l}</div></div>
          <div class="peca-titulo">${l}</div>
          <div style="font-size:.68rem;color:var(--txt4);margin:.4rem 0">1-18 meses · +1 skill/mês</div>
          <button class="btn btn-sm btn-ghost" style="width:100%" onclick="window.toast&&window.toast('📌 Proposta — não afeta o jogo real ainda.','neutro')">Contratar</button>
        </div>`);
    }
  }
  grid.innerHTML = cards.join('');
};

// ════════════════════════════════════════════════════════
// BENEFÍCIOS DOS FUNCIONÁRIOS
// Espelha functions/avancar_mes.js::BENEFICIOS_CATALOGO — precisa ficar em
// sincronia manual (efeito real é aplicado lá; aqui só é catálogo pra UI).
// ════════════════════════════════════════════════════════
const BENEFICIOS_CATALOGO = {
  plano_saude:    { label: 'Plano de Saúde',        icone: '❤️', custo_por_func: 300, efeito_estresse: -8, efeito_rep_interna: 3 },
  vale_refeicao:  { label: 'Vale-Refeição',         icone: '🍽️', custo_por_func: 150, efeito_estresse: -3, efeito_rep_interna: 2 },
  plano_odonto:   { label: 'Plano Odontológico',    icone: '🦷', custo_por_func: 80,  efeito_estresse: -2, efeito_rep_interna: 1 },
  gympass:        { label: 'Gympass',               icone: '💪', custo_por_func: 120, efeito_estresse: -5, efeito_rep_interna: 2 },
  bonus_perform:  { label: 'Bônus por Performance',  icone: '⭐', custo_por_func: 400, efeito_estresse: -5, efeito_rep_interna: 5 },
};

// Usado pela prévia de Benefícios no dashboard do Escritório (js/ui-main.js).
window._beneficiosCatalogoResumo = function(esc, nFuncs) {
  const ativosIds = esc.beneficios_ativos || [];
  const custoMensal = ativosIds.reduce((s, bid) => s + ((BENEFICIOS_CATALOGO[bid]||{}).custo_por_func||0), 0) * nFuncs;
  return { custoMensal, ativos: ativosIds };
};

window.renderBeneficios = async function(j, el) {
  const escId = j.escritorio_proprio_id;
  if (!escId) { el.innerHTML = `<div class="card" style="color:var(--txt3)">Só o dono/sócio do escritório gerencia benefícios.</div>`; return; }

  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">Benefícios dos Funcionários</div></div><div class="card">Carregando...</div>`;

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const esc = escSnap.exists() ? escSnap.data() : {};
  const ativos = esc.beneficios_ativos || [];

  const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
  const npcsAtivos = fSnap.docs.map(d => d.data()).filter(f => f.tipo === 'npc' && f.ativo !== false);
  const nFuncs = npcsAtivos.length;

  const custoMensal = ativos.reduce((s, bid) => s + ((BENEFICIOS_CATALOGO[bid]||{}).custo_por_func||0), 0) * nFuncs;

  const cardsHtml = Object.entries(BENEFICIOS_CATALOGO).map(([bid, cfg]) => {
    const ligado = ativos.includes(bid);
    return `
    <div class="peca-card">
      <div class="peca-topo">
        <div class="peca-kicker">${cfg.icone} ${ligado ? '<span class="tag tag-ganho">ATIVO</span>' : ''}</div>
      </div>
      <div class="peca-titulo">${cfg.label}</div>
      <div style="font-size:.72rem;color:var(--txt3);margin:.3rem 0">
        ${window.fmtFull(cfg.custo_por_func)}/func · mês
      </div>
      <div style="font-size:.68rem;color:var(--txt4);line-height:1.6">
        Estresse ${cfg.efeito_estresse}/mês · Reputação interna +${cfg.efeito_rep_interna}/mês
      </div>
      <button class="btn btn-sm ${ligado ? 'btn-ghost' : 'btn-prim'}" style="margin-top:.6rem;width:100%"
        onclick="window._toggleBeneficio('${escId}','${bid}',${ligado})">
        ${ligado ? 'Desativar' : 'Ativar'}
      </button>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>
    ${window._capaHeader(`RECURSOS HUMANOS · ${(esc.nome||'—').toUpperCase()}`, 'Benefícios dos Funcionários', '')}
    <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:1rem">
      Cada benefício ativo custa por funcionário/mês (cobrado do caixa no avanço de mês) e reduz estresse
      + aumenta reputação interna de todos os NPCs ativos do escritório.
    </div>
    <div class="stat-row">
      <div class="stat"><div class="stat-label">Custo mensal total</div><div class="stat-value">${window.fmtFull(custoMensal)}</div></div>
      <div class="stat"><div class="stat-label">Benefícios ativos</div><div class="stat-value up">${ativos.length} <small>/ ${Object.keys(BENEFICIOS_CATALOGO).length}</small></div></div>
      <div class="stat"><div class="stat-label">Funcionários cobertos</div><div class="stat-value">${nFuncs}</div></div>
    </div>
    <div class="peca-grid">${cardsHtml}</div>`;
};

window._toggleBeneficio = async function(escId, bid, estavaLigado) {
  const escRef = doc(db, 'escritorios', escId);
  const escSnap = await getDoc(escRef);
  if (!escSnap.exists()) return;
  const ativos = escSnap.data().beneficios_ativos || [];
  const novos = estavaLigado ? ativos.filter(x => x !== bid) : [...ativos, bid];
  await updateDoc(escRef, { beneficios_ativos: novos });
  window.toast && window.toast(estavaLigado ? 'Benefício desativado.' : 'Benefício ativado.', 'ok');
  window.navTo && window.navTo('beneficios', null);
};

window._contratarNPC = async function(cargo_min, escId) {
  const CARGOS_DISPONIVEIS = { est: ['est'], ass: ['ass'], jnr: ['jnr','pln','snr'] };
  const cargos = CARGOS_DISPONIVEIS[cargo_min] || ['est'];

  let fotosUsadas = new Set();
  try {
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    fotosUsadas = new Set(fSnap.docs.map(d => d.data().foto_npc).filter(Boolean));
  } catch(e) { /* segue sem checar fotos */ }

  const candidatos = [0,1,2].map(() => {
    const cargo_id = cargos[Math.floor(Math.random() * Math.min(2, cargos.length))];
    return _gerarCandidatoNPC(cargo_id, fotosUsadas);
  });
  window._eqCandidatos = candidatos;
  window._eqCandidatosEscId = escId;

  const cardHtml = candidatos.map((c, i) => {
    const ci = CARGO_INFO[c.cargo_id];
    return `<div class="card" style="margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:.82rem;color:var(--txt)">${c.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${ci.l} · skill média ${c.mediaGeral} · R$ ${ci.sal.toLocaleString('pt-BR')}/mês</div>
        </div>
        <button class="btn btn-prim btn-sm" onclick="window._finalizarContratacaoNPC(${i})">Contratar</button>
      </div>
    </div>`;
  }).join('');

  abrirModal('👤 Escolher Candidato',
    `<div style="font-size:.72rem;color:var(--txt3);margin-bottom:.8rem">Salário é o mesmo fixo do cargo — só a skill varia entre candidatos.</div>
     ${cardHtml}`);
};

window._finalizarContratacaoNPC = async function(idx) {
  const j     = window.JOGADOR;
  const uid   = j?.uid || window.JOGADOR_UID;
  const escId = window._eqCandidatosEscId;
  const c     = (window._eqCandidatos || [])[idx];
  if (!c) return;
  const ci = CARGO_INFO[c.cargo_id];

  const funcionario = {
    nome: c.nome, cargo_id: c.cargo_id, skills: c.skills, skills_jur: c.skills_jur, sexo: c.sexo,
    tipo:       'npc',
    foto_npc:   c.foto_npc,
    escritorio_id: escId,
    dono_uid:   uid,
    ativo:      true,
    acoes_mes_usadas: 0,
    acao_atual: null,
    criado_em:  new Date().toISOString(),
    // Dinâmica de equipe (etapas 1-4)
    estresse:              0,
    afinidade_com_npcs:    {},
    mentor_id:             null,
    aprendizes_ids:        [],
    skill_sendo_treinada:  null,
    skill_em_estudo:       null,
    meses_no_cargo:        0,
    casos_resolvidos_mes:  0,
    casos_resolvidos_total:0,
    feedback_media_estrelas:   3,
    feedback_media_acumulada:  0,
    feedback_ruim_acumulado:   0,
    reputacao_interna:     50,
    conflitos_ativos:      [],
    ultimas_ferias_mes_total: null,
    clientes_vetados:      [],
  };

  try {
    await addDoc(collection(db, 'escritorios', escId, 'funcionarios'), funcionario);
    const gestaoAtual = (j?.skills_jur?.gestao || 0);
    await updateDoc(doc(db, 'jogadores', uid), {
      'skills_jur.gestao': Math.min(50, gestaoAtual + 2),
    });
    if (window.JOGADOR?.skills_jur) window.JOGADOR.skills_jur.gestao = Math.min(50, gestaoAtual + 2);
    fecharModal();
    toast(`✅ ${c.nome} (${ci.l}) contratado! Salário: R$ ${ci.sal.toLocaleString('pt-BR')}/mês · +2 Gestão`, 'ok', 5000);
    setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
  } catch(err) {
    toast('Erro ao contratar: ' + err.message, 'ko');
    console.error(err);
  } finally {
    window._eqCandidatos = null;
    window._eqCandidatosEscId = null;
  }
};




// ════════════════════════════════════════════════════════
// DESIGNAR PROCESSO PARA FUNCIONÁRIO
// ════════════════════════════════════════════════════════
window.abrirModalDesignar = async function(funcId, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const qSnap = await getDocs(query(
    collection(db, 'processos'),
    where('status', '==', 'andamento')
  ));

  // Apenas processos válidos do jogador
  const processos = qSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p =>
      !p.delegado_revisao_pendente &&
      p.advogado_uid === uid &&
      Array.isArray(p.provas) &&
      p.provas.length > 0 &&
      Array.isArray(p.teses) &&
      p.teses.length > 0 &&
      Array.isArray(p.args_audiencia) &&
      p.args_audiencia.length > 0
    );

  if (processos.length === 0) {
    toast('Nenhum processo válido disponível para delegar.', 'ko');
    return;
  }

  const fSnap = await getDoc(
    doc(db, 'escritorios', escId, 'funcionarios', funcId)
  );

  if (!fSnap.exists()) return;

  const f  = fSnap.data();
  const ci = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;

  if ((f.acoes_mes_usadas || 0) >= ci.acoes_mes) {
    toast(
      `${f.nome} já usou todas as ${ci.acoes_mes} ação(ões) deste mês.`,
      'ko'
    );
    return;
  }

  abrirModal(
    `📋 Designar Processo — ${f.nome}`,
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:.8rem">
      ${f.nome} pode realizar
      <b>${ci.acoes_mes - (f.acoes_mes_usadas || 0)}</b>
      ação(ões) ainda neste mês.
      O funcionário avançará o processo até <b>100%</b>.
    </div>

    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${processos.map(p => `
        <button
          class="btn btn-ghost btn-block"
          style="text-align:left;padding:.65rem .85rem"
          onclick="window._confirmarDesignar('${funcId}','${p.id}','${escId}')">

          <div style="font-weight:600;font-size:.82rem;color:var(--txt)">
            ${p.autor || '—'} vs ${p.reu || '—'}
          </div>

          <div style="font-size:.67rem;color:var(--txt3)">
            ${p.tipo || '—'} ·
            ${p.progresso || 0}% concluído ·
            ${_fmtK(p.valor || 0)}
          </div>
        </button>
      `).join('')}
    </div>`
  );
};

// ════════════════════════════════════════════════════════
// AUTO-SELEÇÃO DE PROVAS E TESES — usada quando um FUNCIONÁRIO é o
// primeiro a tocar um processo (nunca foi tocado pelo jogador antes).
// Escolhe item por item: cada prova/tese candidata tem uma chance
// independente de ser "bem escolhida" (ranking real) ou "mal escolhida"
// (sorteio entre as restantes), proporcional à skill jurídica do
// funcionário em relação ao cap do cargo dele.
// ════════════════════════════════════════════════════════
function _chanceAcertoSelecao(funcionario) {
  const skills = funcionario.skills || {};
  const relevantes = ['pesquisa', 'argumentacao', 'escrita'];
  const soma = relevantes.reduce((s, k) => s + (skills[k] || 0), 0);
  const media = soma / relevantes.length;
  const cap = SKILL_CAP[funcionario.cargo_id] || 20;
  return Math.min(1, media / cap);
}

function _autoSelecionarProvasTeses(p, funcionario) {
  const chance = _chanceAcertoSelecao(funcionario);

  // ── PROVAS (até 3, ranqueadas por força) ──
  const provasOrdenadas = (p.provas || [])
    .map((prova, i) => ({ i, forca: prova.forca || 0 }))
    .sort((a, b) => b.forca - a.forca);

  const provasSelecionadas = [];
  const provasUsadas = new Set();
  for (let slot = 0; slot < Math.min(3, provasOrdenadas.length); slot++) {
    const acertou = Math.random() < chance;
    let escolhida;
    if (acertou) {
      // pega a melhor disponível ainda não usada
      escolhida = provasOrdenadas.find(pr => !provasUsadas.has(pr.i));
    } else {
      // erra: sorteia qualquer uma ainda não usada (pode ser fraca)
      const disponiveis = provasOrdenadas.filter(pr => !provasUsadas.has(pr.i));
      escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    }
    if (!escolhida) break;
    provasUsadas.add(escolhida.i);
    provasSelecionadas.push(escolhida.i);
  }

  // ── TESES (até 2, ranqueadas por nº de fatos do caso que confirmam) ──
  const fatosAtivos = new Set(p.fatos_ativos || []);
  const tesesOrdenadas = (p.teses || [])
    .map((tese, i) => {
      const reqs = tese.requer_fatos || [];
      const bateram = reqs.filter(f => fatosAtivos.has(f)).length;
      return { i, forca: bateram };
    })
    .sort((a, b) => b.forca - a.forca);

  const tesesSelecionadas = [];
  const tesesUsadas = new Set();
  for (let slot = 0; slot < Math.min(2, tesesOrdenadas.length); slot++) {
    const acertou = Math.random() < chance;
    let escolhida;
    if (acertou) {
      escolhida = tesesOrdenadas.find(t => !tesesUsadas.has(t.i));
    } else {
      const disponiveis = tesesOrdenadas.filter(t => !tesesUsadas.has(t.i));
      escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)];
    }
    if (!escolhida) break;
    tesesUsadas.add(escolhida.i);
    tesesSelecionadas.push(escolhida.i);
  }

  return { provasSelecionadas, tesesSelecionadas };
}


window._confirmarDesignar = async function(funcId, procId, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  const pSnap = await getDoc(doc(db, 'processos', procId));
  if (!fSnap.exists() || !pSnap.exists()) return;

  const f    = fSnap.data();
  const p    = pSnap.data();
  const ci   = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;

 // ── AUTO-SELEÇÃO DE PROVAS/TESES — só na primeira vez que alguém
 // toca este processo (nem jogador nem outro funcionário escolheu antes)
  if (!p.provas_selecionadas && !p.teses_selecionadas) {
    const { provasSelecionadas, tesesSelecionadas } = _autoSelecionarProvasTeses(p, f);
    await updateDoc(doc(db, 'processos', procId), {
      provas_selecionadas: provasSelecionadas,
      teses_selecionadas: tesesSelecionadas,
    });
    p.provas_selecionadas = provasSelecionadas;
    p.teses_selecionadas = tesesSelecionadas;
  }


  // Gastar energia do dono
  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - usado);
  if (disp < ci.custo_coord) {
    toast(`⚡ Energia insuficiente (requer ${ci.custo_coord}).`, 'ko');
    return;
  }

  await updateDoc(doc(db, 'jogadores', uid), {
    energia_usada_mes: usado + ci.custo_coord,
  });

  // Simular ação do funcionário
  const skills  = f.skills || {};
  const skMed   = Object.values(skills).reduce((a,b)=>a+b,0) / Math.max(1,Object.values(skills).length);
  const bonus   = ci.bonus_chance + Math.floor(skMed * 0.3);
  const chance  = Math.min(85, 35 + bonus);
  const sucesso = Math.random() * 100 < chance;
 
  const PROG_SUCESSO = { est:35, ass:45, jnr:55, pln:65, snr:75 };
  const PROG_FALHA   = { est:15, ass:20, jnr:25, pln:30, snr:35 };
  const ganhoP = sucesso
    ? (PROG_SUCESSO[f.cargo_id] || 35)
    : (PROG_FALHA[f.cargo_id]   || 15);
 
  const progressoAtual = p.progresso || 0;
  // Antes: capado em 90 (nunca destravava sentença). Agora: capado em
  // 100 -- equivalente a concluir a 3ª rodada de audiência.
  const progressoAlvo  = Math.min(100, progressoAtual + ganhoP);
  const chegou100       = progressoAlvo >= 100;
 
  const updatesProcesso = {
    progresso:                  progressoAlvo,
    delegado_func_id:           funcId,
    delegado_revisao_pendente:  chegou100,
    chance_sucesso: Math.min(90, (p.chance_sucesso||50) + (sucesso ? bonus * 0.3 : -3)),
  };
  // Quando atinge 100%, marca as 3 rodadas como concluídas para o
  // modal de processo liberar "Processar sentença" corretamente.
  if (chegou100) {
    updatesProcesso.rodada_audiencia = 3;
  }
  await updateDoc(doc(db, 'processos', procId), updatesProcesso);
 
  const mesAtual      = j.mes_pessoal || 0;
  const custoNpcTar   = _CUSTO_NPC_TAREFA[f.cargo_id] || 20;
  // Rastreia mês da energia para não somar com mês anterior no avancarMes
  const mesEnergiaNPC = f.mes_energia;
  const energiaBase   = (mesEnergiaNPC === mesAtual) ? (f.energia_npc_usada_mes || 0) : 0;
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
    acoes_mes_usadas:      (f.acoes_mes_usadas || 0) + 1,
    acao_atual:            chegou100 ? null : { procId, progresso_delegado: progressoAlvo },
    energia_npc_usada_mes: energiaBase + custoNpcTar,
    mes_energia:           mesAtual,
  });

  // +1 gestao por delegar processo
  const gestaoAtual = (j?.skills_jur?.gestao || 0);
  if (gestaoAtual < 50) {
    await updateDoc(doc(db, 'jogadores', uid), {
      'skills_jur.gestao': Math.min(50, gestaoAtual + 1),
    });
    if (window.JOGADOR?.skills_jur) window.JOGADOR.skills_jur.gestao = Math.min(50, gestaoAtual + 1);
  }

  fecharModal();
  if (chegou100) {
    toast(`✅ ${f.nome} concluiu a instrução! Processo pronto para sua sentença. +1 Gestão`, 'ok', 6000);
  } else if (sucesso) {
    toast(`📈 ${f.nome} avançou o processo para ${progressoAlvo}%. +1 Gestão`, 'ok', 4000);
  } else {
    toast(`⚠️ ${f.nome} teve dificuldades — processo avançou apenas para ${progressoAlvo}%.`, 'neutro', 4000);
  }
  setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
};

// ════════════════════════════════════════════════════════
// DEMITIR FUNCIONÁRIO
// ════════════════════════════════════════════════════════
window.demitirFuncionario = async function(funcId, escId, nome) {
  if (!confirm(`Confirma demissão de ${nome}?\nVocê pagará 1 mês de salário como rescisão.`)) return;

  const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!fSnap.exists()) return;
  const f  = fSnap.data();
  const ci = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;
  const j  = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  // Cobrar rescisão (1 salário)
  await updateDoc(doc(db, 'jogadores', uid), {
    dinheiro: Math.max(0, (j.dinheiro||0) - ci.sal),
  });

  await deleteDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  toast(`${nome} foi demitido(a). Rescisão: R$ ${ci.sal.toLocaleString('pt-BR')}`, 'neutro', 4000);
  setTimeout(() => window.navTo && window.navTo('equipe', null), 500);
};

// ════════════════════════════════════════════════════════
// RESETAR AÇÕES DOS FUNCIONÁRIOS (chamado ao avançar mês)
// ════════════════════════════════════════════════════════
export async function resetarAcoesFuncionarios(escId) {
  try {
    const snap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    const batch_updates = snap.docs.map(d =>
      updateDoc(doc(db, 'escritorios', escId, 'funcionarios', d.id), {
        acoes_mes_usadas: 0,
      })
    );
    await Promise.all(batch_updates);
  } catch(e) { console.warn('resetarAcoesFuncionarios:', e); }
}

// ════════════════════════════════════════════════════════
// CALCULAR CUSTO MENSAL DA EQUIPE (para patrimônio.js)
// ════════════════════════════════════════════════════════
export async function calcularCustoEquipe(escId, tier) {
  if (!escId) return 0;
  const cap = TIER_CAPACIDADE[tier||1] || TIER_CAPACIDADE[1];
  let total = cap.custo_fixo;
  try {
    const snap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    snap.docs.forEach(d => {
      const ci = CARGO_INFO[d.data().cargo_id];
      if (ci) total += ci.sal;
    });
  } catch(e) { /* sem funcionários ainda */ }
  return total;
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function _fmtK(n) {
  if (!n) return 'R$0';
  if (n >= 1000000) return 'R$' + (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return 'R$' + Math.round(n/1000) + 'k';
  return 'R$' + n;
}

function _skillLabel(k) {
  const m = { pesquisa:'Pesq', escrita:'Escr', argumentacao:'Arg', oratoria:'Orat', persuasao:'Pers', negociacao:'Neg', gestao:'Gest' };
  return m[k] || k;
}

// ════════════════════════════════════════════════════════
// GESTÃO DO ESCRITÓRIO — real: functions/avancar_mes.js
// _verificarElegibilidadeGestorCF promove automaticamente o próprio
// jogador a gestor (não um NPC) quando gestão/networking batem o cap
// do cargo e ele é o cargo mais alto do escritório. Espelha os mesmos
// números aqui só pra mostrar progresso — a promoção real acontece
// no avançar mês, não por um botão nesta tela.
// ════════════════════════════════════════════════════════
const _CARGO_ORDEM_GESTAO = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6 };
const _GESTAO_CAP  = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
const _NETWORK_CAP = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
const _CARGO_LABEL_JOGADOR = { est:'Estagiário', ass:'Assistente Jurídico', jnr:'Advogado Júnior', pln:'Advogado Pleno', snr:'Advogado Sênior', asc:'Associado', soc:'Sócio' };

// Link pro fluxo real de delegação (window.abrirDelegacaoGestao, já
// existe em processos_escritorio.js desde antes desta sessão — só
// NPCs, porque é o que _processarConflitosNPCsCF de fato consulta
// via npcMap[gestorId]). Não duplicar aqui.
function _renderPickerGestor(escId) {
  return `
    <div style="margin-top:.6rem;padding-top:.5rem;border-top:1px solid var(--bg2)">
      <button class="btn btn-ghost btn-sm btn-block" onclick="window.abrirDelegacaoGestao('${escId}')">👤 Delegar Gestão</button>
    </div>`;
}

window._renderCardGestao = _renderCardGestao;
function _renderCardGestao(j, esc, funcs, escId) {
  if (esc.gestor_id) {
    const meuUid = window.JOGADOR?.uid || window.JOGADOR_UID;
    const souEu = esc.gestor_id === meuUid;
    return `
    <div class="card" style="margin-bottom:1rem;padding:.7rem 1rem">
      <div style="font-size:.78rem;font-weight:700;color:var(--txt);margin-bottom:.3rem">⚙️ Gestão do Escritório</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.6rem">
        Gestor: <b style="color:var(--txt)">${esc.gestor_nome || '—'}</b> (${_CARGO_LABEL_JOGADOR[esc.gestor_cargo] || CARGO_INFO[esc.gestor_cargo]?.l || esc.gestor_cargo || '—'})${souEu ? ' <span style="color:var(--verde2)">— é você</span>' : ''}
      </div>
      ${_renderToggleGestor('📋 Delegar processos ao gestor', 'processos', esc.gestor_delega_processos !== false, escId)}
      ${_renderToggleGestor('🎓 Delegar mentoria ao gestor', 'mentoria', !!esc.gestor_delega_mentoria, escId)}
      ${_renderToggleGestor('⚖️ Delegar conflitos leves ao gestor', 'conflitos', !!esc.gestor_delega_conflitos, escId)}
      <div style="font-size:.6rem;color:var(--txt4);margin-top:.4rem">⚠️ Conflitos estruturais sempre escalam ao dono, independente das delegações.</div>
      ${_renderPickerGestor(escId)}
    </div>`;
  }

  if (!j.escritorio_empregado_id && !j.escritorio_proprio_id) return '';

  const cargoId = j.cargo_id;
  const gestaoCap  = _GESTAO_CAP[cargoId] || 55;
  const networkCap = _NETWORK_CAP[cargoId] || 55;
  const gestaoAtual = (j.skills || {}).gestao || 0;
  const netAtual = j.networking || 0;
  const pctGestao = Math.min(100, Math.round(gestaoAtual / gestaoCap * 100));
  const pctNet = Math.min(100, Math.round(netAtual / (networkCap * 0.7) * 100));

  const funcsAtivos = funcs.filter(f => f.ativo !== false);
  const maiorOrdem = Math.max(...funcsAtivos.map(f => _CARGO_ORDEM_GESTAO[f.cargo_id] ?? 0), 0);
  const meuOrdem = _CARGO_ORDEM_GESTAO[cargoId] ?? 0;
  const souCargoMaisAlto = meuOrdem >= maiorOrdem;

  return `
    <div class="card" style="margin-bottom:1rem;padding:.7rem 1rem">
      <div style="font-size:.78rem;font-weight:700;color:var(--txt);margin-bottom:.3rem">⚙️ Gestão do Escritório</div>
      <div style="font-size:.7rem;color:var(--txt3);margin-bottom:.6rem">Ninguém é gestor ainda. Você é promovido automaticamente ao virar o mês, se bater os critérios:</div>
      <div style="margin-bottom:.4rem">
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3)"><span>Gestão (skill)</span><span>${gestaoAtual}/${gestaoCap}</span></div>
        <div class="skill-bar"><div class="skill-fill" style="width:${pctGestao}%"></div></div>
      </div>
      <div style="margin-bottom:.4rem">
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3)"><span>Networking (mín. 70% do cap)</span><span>${netAtual}/${Math.round(networkCap*0.7)}</span></div>
        <div class="skill-bar"><div class="skill-fill" style="width:${pctNet}%"></div></div>
      </div>
      <div style="font-size:.68rem;color:${souCargoMaisAlto?'var(--verde2)':'var(--txt4)'}">${souCargoMaisAlto ? '✅' : '○'} Ser o cargo mais alto do escritório</div>
      ${_renderPickerGestor(escId)}
    </div>`;
}

function _renderToggleGestor(label, tipo, ativo, escId) {
  const cor = ativo ? 'var(--verde2)' : 'var(--txt4)';
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.25rem 0;border-bottom:1px solid var(--bg2)">
    <span style="font-size:.72rem;color:var(--txt2)">${label}</span>
    <button onclick="window.toggleGestorDelegacao('${escId}','${tipo}')"
      style="padding:.2rem .6rem;border-radius:2px;border:1px solid ${cor};background:${ativo?'var(--verde-bg)':'transparent'};color:${cor};font-size:.65rem;cursor:pointer">
      ${ativo ? '✅ Ativo' : '○ Inativo'}
    </button>
  </div>`;
}

// ════════════════════════════════════════════════════════
// ESTUDO AUTÔNOMO
// ════════════════════════════════════════════════════════
window.designarEstudo = async function(funcId, escId) {
  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) return;
  const f = { id: snap.id, ...snap.data() };
  const skills = f.skills || {};
  let skillsJur = f.skills_jur || {};

  // Funcionários contratados antes do skills_jur existir não têm esse
  // campo salvo — cura aqui na primeira vez que o estudo é aberto pra
  // eles, em vez de exigir uma migração em lote.
  if (!Object.keys(skillsJur).length) {
    const baseJur = _CARGO_JUR_BASE_EQ[f.cargo_id] || _CARGO_JUR_BASE_EQ.est;
    skillsJur = {};
    Object.keys(_SKILL_JUR_TODAS_LBL).forEach(k => {
      skillsJur[k] = Math.max(0, Math.min(CAP_JUR_NPC, Math.round(baseJur * (0.6 + Math.random() * 0.6))));
    });
    try {
      await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), { skills_jur: skillsJur });
      f.skills_jur = skillsJur;
    } catch (e) { console.warn('Falha ao criar skills_jur retroativo:', e); }
  }

  if (!Object.keys(skills).length && !Object.keys(skillsJur).length) {
    toast('Nenhuma skill disponível.', 'ko'); return;
  }

  const cap = _SKILL_CAP_EQ[f.cargo_id] || 20;
  const optGroup = (titulo, keys, src, capV) => {
    const disponiveis = keys.filter(k => k in src);
    if (!disponiveis.length) return '';
    const opts = disponiveis.map(k => {
      const v = src[k] || 0;
      const pct = Math.round(v / capV * 100);
      return `<option value="${k}" ${f.skill_em_estudo === k ? 'selected' : ''}>${_SKILL_JUR_TODAS_LBL[k]||_SKILL_FULL_LBL[k]||k} — ${v}/${capV} (${pct}%)</option>`;
    }).join('');
    return `<optgroup label="${titulo}">${opts}</optgroup>`;
  };

  const gruposHtml = [
    optGroup('Habilidades Gerais', Object.keys(skills), skills, cap),
    optGroup('Skills Jurídicas', Object.keys(_SKILL_JUR_BASE_LBL), skillsJur, CAP_JUR_NPC),
    optGroup('Tipos de Documento', Object.keys(_DOC_JUR_LBL), skillsJur, CAP_JUR_NPC),
    optGroup('Áreas do Direito', Object.keys(_AREA_JUR_LBL), skillsJur, CAP_JUR_NPC),
  ].join('');

  abrirModal('📖 Foco de Estudo Autônomo',
    `<div style="font-size:.78rem;color:var(--txt3);margin-bottom:.8rem">
      <b>${f.nome}</b> estuda 1 skill por mês automaticamente (-20⚡ NPC).<br>
      Escolha qualquer skill para priorizar — geral, jurídica, tipo de documento ou área do direito —
      ou deixe em "Auto" para a mais fraca entre todas.
    </div>
    <div class="campo"><label>Skill prioritária</label>
      <select id="estudo-skill">
        <option value="" ${!f.skill_em_estudo ? 'selected' : ''}>🤖 Auto — skill mais fraca</option>
        ${gruposHtml}
      </select>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._confirmarEstudo('${funcId}','${escId}')">Salvar →</button>
    </div>`
  );
};

window._confirmarEstudo = async function(funcId, escId) {
  const skill = document.getElementById('estudo-skill')?.value || null;
  const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
    skill_em_estudo: skill || null,
  });
  fecharModal();
  const lbl = skill ? (_SKILL_JUR_TODAS_LBL[skill]||_SKILL_FULL_LBL[skill]||skill) : 'automático';
  toast(`📖 Foco de estudo definido: ${lbl}.`, 'ok');
  setTimeout(() => window.navTo && window.navTo('equipe', null), 400);
};

// ════════════════════════════════════════════════════════
// TOGGLES DO GESTOR
// ════════════════════════════════════════════════════════
window.toggleGestorDelegacao = async function(escId, tipo) {
  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) return;
  const campo = `gestor_delega_${tipo}`;
  const novoVal = !escSnap.data()[campo];
  const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  await updateDoc(doc(db, 'escritorios', escId), { [campo]: novoVal });
  const labels = { processos:'processos', mentoria:'mentoria', conflitos:'conflitos leves' };
  toast(`${novoVal ? '✅' : '❌'} Delegação de ${labels[tipo]||tipo} ${novoVal ? 'ativada' : 'desativada'}.`, 'ok');
  setTimeout(() => window.navTo && window.navTo('equipe', null), 400);
};

window._abrirConviteJogador = function(cargo_min, escId) {
  abrirModal('👤 Convidar Jogador',
    `<div class="campo">
      <label>E-mail do jogador</label>
      <input type="email" id="convite-email" placeholder="email@exemplo.com">
    </div>
    <div class="campo">
      <label>Cargo oferecido</label>
      <select id="convite-cargo">
        ${Object.entries(CARGO_INFO).map(([k,v])=>`<option value="${k}">${v.l} — R$ ${v.sal.toLocaleString('pt-BR')}/mês</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._enviarConviteJogador('${escId}')">Enviar convite →</button>
    </div>`
  );
  setTimeout(()=>{ const s = document.getElementById('convite-cargo'); if(s) s.value = cargo_min; }, 100);
};

window._enviarConviteJogador = async function(escId) {
  const email   = document.getElementById('convite-email')?.value?.trim();
  const cargoId = document.getElementById('convite-cargo')?.value;
  if (!email) { toast('Digite o e-mail do jogador.','ko'); return; }

  const j   = window.JOGADOR;
  const uid = j?.uid||window.JOGADOR_UID;
  const ci  = CARGO_INFO[cargoId]||CARGO_INFO.jnr;
  const escSnap = await getDoc(doc(db,'escritorios',escId));
  const escNome = escSnap.exists() ? escSnap.data().nome : 'Escritório';

  // Buscar jogador pelo e-mail
  const { query: fq, where: fw, getDocs: fgd } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const snap = await getDocs(query(collection(db,'jogadores'), where('email','==',email)));
  if (snap.empty) { toast('Jogador não encontrado com este e-mail.','ko'); return; }

  const alvo    = snap.docs[0];
  const alvoUid = alvo.id;

  await addDoc(collection(db,'jogadores',alvoUid,'inbox'), {
    de: uid, para_uid: alvoUid,
    assunto: `🏛️ Convite — ${escNome}`,
    corpo: `${j.nome_personagem||'Um advogado'} convidou você para trabalhar em ${escNome} como ${ci.l}.\n\nSalário: R$ ${ci.sal.toLocaleString('pt-BR')}/mês\n\nAcesse Vagas → Convites para aceitar.`,
    tipo:'convite_escritorio', esc_id:escId, cargo_id:cargoId,
    lida:false, criado_em:new Date().toISOString(),
  });

  fecharModal();
  toast(`✉️ Convite enviado para ${email}!`, 'ok', 4000);
};

// ════════════════════════════════════════════════════════
// MENTORIA
// ════════════════════════════════════════════════════════
window.abrirModalMentoria = async function(mentorId, escId) {
  const mentorSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', mentorId));
  if (!mentorSnap.exists()) return;
  const mentor = { id: mentorSnap.id, ...mentorSnap.data() };

  const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
  const aprendizElegiveis = fSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(f => f.tipo === 'npc' && _CARGO_APRENDIZ_EQ.has(f.cargo_id) && !f.mentor_id && !f.burnout_npc && !f.em_ferias && f.id !== mentorId);

  if (!aprendizElegiveis.length) {
    toast('Não há aprendizes disponíveis (est/ass/jnr sem mentor ativo).', 'ko', 4000);
    return;
  }

  const skills = Object.keys(mentor.skills || {});
  const skillOpts = skills.map(sk => `<option value="${sk}">${_SKILL_FULL_LBL[sk] || sk} (nível ${mentor.skills[sk]})</option>`).join('');
  const aprendizOpts = aprendizElegiveis.map(f => `<option value="${f.id}">${f.nome} (${(CARGO_INFO[f.cargo_id]||{}).l||f.cargo_id})</option>`).join('');

  abrirModal('🎓 Iniciar Mentoria',
    `<div style="font-size:.78rem;color:var(--txt3);margin-bottom:.8rem">
      Mentor: <b>${mentor.nome}</b><br>
      Até 2 aprendizes · Gasta 30 energia NPC/mês do mentor.
    </div>
    <div class="campo"><label>Aprendiz</label>
      <select id="ment-aprendiz">${aprendizOpts}</select>
    </div>
    <div class="campo"><label>Skill a treinar</label>
      <select id="ment-skill">${skillOpts}</select>
    </div>
    <div class="campo"><label>Duração (meses)</label>
      <select id="ment-dur">
        ${[3,4,5,6].map(n=>`<option value="${n}">${n} meses</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._confirmarMentoria('${mentorId}','${escId}')">Iniciar →</button>
    </div>`
  );
};

window._confirmarMentoria = async function(mentorId, escId) {
  const aprendizId = document.getElementById('ment-aprendiz')?.value;
  const skill      = document.getElementById('ment-skill')?.value;
  const dur        = parseInt(document.getElementById('ment-dur')?.value || '3');
  if (!aprendizId || !skill) { toast('Selecione aprendiz e skill.', 'ko'); return; }

  const { updateDoc, doc: fdoc, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const mentorRef   = doc(db, 'escritorios', escId, 'funcionarios', mentorId);
  const aprendizRef = doc(db, 'escritorios', escId, 'funcionarios', aprendizId);
  const aprendizSnap = await getDoc(aprendizRef);
  const mentorSnap   = await getDoc(mentorRef);
  if (!aprendizSnap.exists() || !mentorSnap.exists()) return;
  const aprendizData = aprendizSnap.data();
  const mentorData   = mentorSnap.data();

  const skillLabel = _SKILL_FULL_LBL[skill] || skill;
  await Promise.all([
    updateDoc(mentorRef,   { aprendizes_ids: [...(mentorData.aprendizes_ids||[]), aprendizId] }),
    updateDoc(aprendizRef, {
      mentor_id:               mentorId,
      mentor_nome:             mentorData.nome,
      skill_sendo_treinada:    skill,
      meses_mentoria_restantes: dur,
    }),
    addDoc(collection(db, 'escritorios', escId, 'log_equipe'), {
      texto: `🎓 Mentoria iniciada: ${mentorData.nome} → ${aprendizData.nome} (${skillLabel}, ${dur} meses).`,
      criado_em: new Date().toISOString(),
    }),
  ]);

  fecharModal();
  toast(`🎓 Mentoria iniciada: ${mentorData.nome} → ${aprendizData.nome} (${skillLabel}, ${dur} meses)`, 'ok', 5000);
  setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
};

// ════════════════════════════════════════════════════════
// PROMOÇÃO MANUAL
// ════════════════════════════════════════════════════════
window.abrirModalPromover = async function(funcId, escId) {
  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) return;
  const f = { id: snap.id, ...snap.data() };
  const promo = _elegibilidadePromocao(f);
  if (!promo) return;

  const proxCi   = CARGO_INFO[promo.prox] || {};
  const salMin   = _CARGO_SAL_MIN_EQ[promo.prox] || 1700;
  const salMax   = _CARGO_SAL_MAX_EQ[promo.prox] || 5000;
  const tick = c => c ? '✅' : '❌';

  abrirModal('✨ Promover Funcionário',
    `<div style="font-size:.78rem;margin-bottom:.8rem">
      Promover <b>${f.nome}</b> para <b>${proxCi.l || promo.prox}</b>
    </div>
    <div style="font-size:.7rem;color:var(--txt3);margin-bottom:.8rem">
      ${tick(promo.ok_meses)} 6+ meses no cargo (${f.meses_no_cargo||0} meses)<br>
      ${tick(promo.ok_casos)} 10+ casos resolvidos (${f.casos_resolvidos_total||0} casos)<br>
      ${tick(promo.ok_feedback)} Feedback ≥ 3.5★ (${(f.feedback_media_estrelas||3).toFixed(1)}★)<br>
      ${tick(promo.ok_skills)} Skills ≥ 50% do novo cap
    </div>
    <div class="campo">
      <label>Salário proposto: <b id="prom-sal-label">R$ ${salMin.toLocaleString('pt-BR')}</b></label>
      <input type="range" id="prom-sal" min="${salMin}" max="${salMax}" step="100" value="${salMin}"
        oninput="document.getElementById('prom-sal-label').textContent='R$ '+parseInt(this.value).toLocaleString('pt-BR')">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--txt4)">
        <span>R$ ${salMin.toLocaleString('pt-BR')}</span><span>R$ ${salMax.toLocaleString('pt-BR')}</span>
      </div>
    </div>
    <div style="font-size:.65rem;color:var(--txt3);margin-bottom:.5rem">
      NPC aceita se: oferta ≥ R$ ${Math.round(salMax*0.7).toLocaleString('pt-BR')} OU reputação interna ≥ 60
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._confirmarPromocao('${funcId}','${escId}','${promo.prox}')">Oferecer →</button>
    </div>`
  );
};

window._confirmarPromocao = async function(funcId, escId, proxCargo) {
  const salario = parseInt(document.getElementById('prom-sal')?.value || '0');
  const { updateDoc, doc: fdoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) return;
  const f = snap.data();

  const salMax     = _CARGO_SAL_MAX_EQ[proxCargo] || salario;
  const repInterna = f.reputacao_interna || 50;
  const aceita     = salario >= salMax * 0.7 || repInterna >= 60;

  if (!aceita) {
    await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
      estresse:         Math.min(100, (f.estresse || 0) + 5),
      reputacao_interna: Math.max(0, repInterna - 10),
    });
    fecharModal();
    toast(`${f.nome} recusou a oferta — salário abaixo do esperado.`, 'ko', 4000);
    return;
  }

  const novoStress = Math.max(0, (f.estresse || 0) - 20);
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
    cargo_id:      proxCargo,
    meses_no_cargo: 0,
    estresse:      novoStress,
    aviso_saida:   false,
    meses_stress_alto: 0,
  });

  await addDoc(collection(db, 'escritorios', escId, 'log_equipe'), {
    texto: `✨ ${f.nome} foi promovido(a) para ${(CARGO_INFO[proxCargo]||{}).l||proxCargo} com salário de R$ ${salario.toLocaleString('pt-BR')}.`,
    criado_em: new Date().toISOString(),
  });

  fecharModal();
  toast(`🎉 ${f.nome} aceita! Promovido(a) para ${(CARGO_INFO[proxCargo]||{}).l||proxCargo}.`, 'ok', 5000);
  setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
};

// ════════════════════════════════════════════════════════
// FÉRIAS
// ════════════════════════════════════════════════════════
window.concederFerias = async function(funcId, escId, nome) {
  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) return;
  const mesGlob = escSnap.data().mes_global || 0;

  const { updateDoc, doc: fdoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
    em_ferias:              true,
    ultimas_ferias_mes_total: mesGlob,
    estresse:               0,
  });

  await addDoc(collection(db, 'escritorios', escId, 'log_equipe'), {
    texto: `🏖️ ${nome} saiu de férias (mês ${mesGlob}).`,
    criado_em: new Date().toISOString(),
  });

  toast(`🏖️ ${nome} está de férias este mês — estresse zerado!`, 'ok', 4000);
  setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
};

// ════════════════════════════════════════════════════════
// MEDIAÇÃO DE CONFLITOS
// ════════════════════════════════════════════════════════
window.mediarConflito = async function(funcId, conflitoIdx, escId) {
  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) return;
  const f = snap.data();
  const conflito = (f.conflitos_ativos || [])[conflitoIdx];
  if (!conflito) return;

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const tier = (escSnap.data() || {}).tier || 1;

  const tipo = conflito.tipo;
  const custoEnergia = tipo === 'estrutural' ? 10 : 5;
  const custoFinanceiro = tipo === 'estrutural' ? (tier >= 3 ? 3000 : tier >= 2 ? 2000 : 1000) : 0;
  const taxaSucesso = tipo === 'estrutural' ? '20-40%' : '100%';

  abrirModal('⚖️ Mediar Conflito',
    `<div style="font-size:.8rem;margin-bottom:.8rem">
      <b>${tipo === 'estrutural' ? '⚠️ Conflito Estrutural' : '😤 Desentendimento'}</b><br>
      ${f.nome} × ${conflito.com_nome}
    </div>
    <div style="font-size:.7rem;color:var(--txt3);margin-bottom:.8rem">
      Custo: <b>${custoEnergia} energia</b> sua${custoFinanceiro > 0 ? ` + <b>R$ ${custoFinanceiro.toLocaleString('pt-BR')}</b>` : ''}<br>
      Taxa de sucesso: <b>${taxaSucesso}</b><br>
      ${tipo === 'estrutural' ? 'Se bem-sucedida, resolve no próximo mês.' : 'Resolve automaticamente no próximo mês.'}
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.8rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._executarMediacao('${funcId}',${conflitoIdx},'${escId}')">Mediar →</button>
    </div>`
  );
};

window._executarMediacao = async function(funcId, conflitoIdx, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const snap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!snap.exists()) return;
  const f = snap.data();
  const conflito = (f.conflitos_ativos || [])[conflitoIdx];
  if (!conflito) { fecharModal(); return; }

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const escData = escSnap.data() || {};
  const tier = escData.tier || 1;
  const tipo = conflito.tipo;
  const custoEnergia   = tipo === 'estrutural' ? 10 : 5;
  const custoFinanceiro = tipo === 'estrutural' ? (tier >= 3 ? 3000 : tier >= 2 ? 2000 : 1000) : 0;

  const jSnap = await getDoc(doc(db, 'jogadores', uid));
  const jData = jSnap.data() || {};
  const energiaAtual = Math.max(0, 100 - (jData.energia_usada_mes || 0));
  if (energiaAtual < custoEnergia) {
    fecharModal();
    toast(`Energia insuficiente (precisa de ${custoEnergia}, tem ${energiaAtual}).`, 'ko', 4000);
    return;
  }

  const sucesso = tipo === 'estrutural' ? Math.random() < 0.3 : true;

  const updConflitos = (f.conflitos_ativos || []).map((c, idx) =>
    idx === conflitoIdx ? { ...c, em_mediacao: sucesso } : c
  );

  const { updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), { conflitos_ativos: updConflitos });

  // Espelhar no outro NPC
  const outroSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', conflito.com_id));
  if (outroSnap.exists()) {
    const outroData = outroSnap.data();
    const outroConflitos = (outroData.conflitos_ativos || []).map(c =>
      c.com_id === funcId ? { ...c, em_mediacao: sucesso } : c
    );
    await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', conflito.com_id), { conflitos_ativos: outroConflitos });
  }

  // Debitar energia e caixa
  await updateDoc(doc(db, 'jogadores', uid), {
    energia_usada_mes: (jData.energia_usada_mes || 0) + custoEnergia,
  });
  if (custoFinanceiro > 0) {
    await updateDoc(doc(db, 'escritorios', escId), {
      caixa: Math.max(0, (escData.caixa || 0) - custoFinanceiro),
    });
  }

  await addDoc(collection(db, 'escritorios', escId, 'log_equipe'), {
    texto: `⚖️ Mediação entre ${f.nome} e ${conflito.com_nome}: ${sucesso ? 'em processo de resolução' : 'fracassou — conflito continua'}.`,
    criado_em: new Date().toISOString(),
  });

  fecharModal();
  if (sucesso) {
    toast(`✅ Mediação iniciada — conflito será resolvido no próximo mês!`, 'ok', 4000);
  } else {
    toast(`❌ Mediação fracassou — conflito estrutural persiste.`, 'ko', 4000);
  }
  setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
};
