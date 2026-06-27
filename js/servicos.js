/**
 * SERVIÇOS JURÍDICOS E CARTEIRA DE CLIENTES — Advocatus Online
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import {
  TIPOS_SERVICO, OPORTUNIDADES_POR_TIER, modificadorNetworking, multiplicadorPrestigio,
  CONFIANCA_INICIAL, CONFIANCA_EVENTOS, CONFIANCA_RECORRENTE_MIN, PRODUTIVIDADE_CARGO,
  LIMITE_EMPRESAS_TIER, CHANCE_DEMANDA_AUTOMATICA, TIPOS_DEMANDA_AUTOMATICA,
  gerarOportunidade, valorContratoRecorrente,
} from './servicos_dados.js';


const CARTEIRA_PAGINA_TAMANHO = 10;
let _carteiraEstado = { filtroTipo: 'todos', filtroPorte: 'todos', ordenarPor: 'confianca', paginaAtual: 1 };
 
function _renderCarteiraClientes(clientesOriginal, escId) {
  window._carteiraClientesCache = clientesOriginal;
  window._carteiraEscId = escId;
  _carteiraEstado.paginaAtual = 1;
  _aplicarFiltroEDesenharCarteira();
}
 
const _ESTILO_SELECT = 'font-size:.7rem;padding:.3rem .5rem;border-radius:6px;border:1px solid var(--borda-cor,#ccc);background:var(--surface,#fff);color:var(--txt2,#333);max-width:100%;';
 
function _aplicarFiltroEDesenharCarteira() {
  const container = document.getElementById('carteira-clientes-container');
  if (!container) {
    console.warn('[CARTEIRA] container #carteira-clientes-container não encontrado no DOM.');
    return;
  }
  const escId = window._carteiraEscId;
  let lista = [...(window._carteiraClientesCache || [])];
 
  if (_carteiraEstado.filtroTipo !== 'todos') {
    lista = lista.filter(c => c.tipo === _carteiraEstado.filtroTipo);
  }
  if (_carteiraEstado.filtroTipo === 'PJ' && _carteiraEstado.filtroPorte !== 'todos') {
    lista = lista.filter(c => c.porte === _carteiraEstado.filtroPorte);
  }
 
  if (_carteiraEstado.ordenarPor === 'confianca') {
    lista.sort((a,b) => (b.confianca||0) - (a.confianca||0));
  } else {
    lista.sort((a,b) => (b.valor_mensal||0) - (a.valor_mensal||0));
  }
 
  const totalFiltrado = lista.length;
  const qtdExibir = Math.min(totalFiltrado, CARTEIRA_PAGINA_TAMANHO * _carteiraEstado.paginaAtual);
  const listaExibida = lista.slice(0, qtdExibir);
  const temMais = qtdExibir < totalFiltrado;
  const portesDisponiveis = ['micro','pequena','media','grande'];
 
  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem;align-items:center;width:100%">
      <select id="carteira-filtro-tipo" style="${_ESTILO_SELECT}" onchange="window._carteiraMudarFiltroTipo(this.value)">
        <option value="todos" ${_carteiraEstado.filtroTipo==='todos'?'selected':''}>Todos</option>
        <option value="PF" ${_carteiraEstado.filtroTipo==='PF'?'selected':''}>PF</option>
        <option value="PJ" ${_carteiraEstado.filtroTipo==='PJ'?'selected':''}>PJ</option>
      </select>
 
      ${_carteiraEstado.filtroTipo === 'PJ' ? `
        <select id="carteira-filtro-porte" style="${_ESTILO_SELECT}" onchange="window._carteiraMudarFiltroPorte(this.value)">
          <option value="todos" ${_carteiraEstado.filtroPorte==='todos'?'selected':''}>Todos portes</option>
          ${portesDisponiveis.map(p => `<option value="${p}" ${_carteiraEstado.filtroPorte===p?'selected':''}>${p[0].toUpperCase()+p.slice(1)}</option>`).join('')}
        </select>
      ` : ''}
 
      <select id="carteira-ordenar" style="${_ESTILO_SELECT}" onchange="window._carteiraMudarOrdenacao(this.value)">
        <option value="confianca" ${_carteiraEstado.ordenarPor==='confianca'?'selected':''}>Confiança ↓</option>
        <option value="valor_mensal" ${_carteiraEstado.ordenarPor==='valor_mensal'?'selected':''}>Pagamento ↓</option>
      </select>
 
      <span style="font-size:.65rem;color:var(--txt4,#888);margin-left:auto;white-space:nowrap">${totalFiltrado} cliente(s)</span>
    </div>
 
    ${listaExibida.length === 0
      ? `<div class="card" style="text-align:center;padding:1rem;color:var(--txt3);font-size:.75rem">
           Nenhum cliente encontrado com esse filtro.
         </div>`
      : listaExibida.map(c => _cardCliente(c, escId)).join('')}
 
    ${temMais ? `
      <button class="btn btn-sm btn-ghost btn-block" style="margin-top:.5rem;width:100%" onclick="window._carteiraMostrarMais()">
        Mostrar mais (${totalFiltrado - qtdExibir} restante(s)) ▾
      </button>` : ''}
  `;
}
 
window._carteiraMudarFiltroTipo = function(valor) {
  _carteiraEstado.filtroTipo = valor;
  _carteiraEstado.filtroPorte = 'todos';
  _carteiraEstado.paginaAtual = 1;
  _aplicarFiltroEDesenharCarteira();
};
window._carteiraMudarFiltroPorte = function(valor) {
  _carteiraEstado.filtroPorte = valor;
  _carteiraEstado.paginaAtual = 1;
  _aplicarFiltroEDesenharCarteira();
};
window._carteiraMudarOrdenacao = function(valor) {
  _carteiraEstado.ordenarPor = valor;
  _aplicarFiltroEDesenharCarteira();
};
window._carteiraMostrarMais = function() {
  _carteiraEstado.paginaAtual += 1;
  _aplicarFiltroEDesenharCarteira();
};

// ════════════════════════════════════════════════════════
// PAINEL PRINCIPAL — CLIENTES
// ════════════════════════════════════════════════════════
window.renderClientes = async function(j, el) {
  const escId = j.escritorio_proprio_id;
  if (!escId) {
    el.innerHTML = `
      <div class="secao-header"><div class="secao-titulo">📁 Clientes</div></div>
      <div class="card" style="text-align:center;padding:2rem;color:var(--txt3)">
        Oportunidades de serviços e carteira de clientes só estão disponíveis para
        quem possui <b>escritório próprio</b>.<br>
        <span style="font-size:.72rem">Abra seu escritório em Escritório → Criar Escritório.</span>
      </div>`;
    return;
  }
 
  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) { el.innerHTML = '<div class="card">Escritório não encontrado.</div>'; return; }
  const esc  = escSnap.data();
  const tier = esc.tier || 1;
 
  const opSnap = await getDocs(query(
    collection(db, 'escritorios', escId, 'oportunidades'),
    where('status', '==', 'disponivel')
  ));
  const oportunidades = opSnap.docs.map(d => ({ id: d.id, ...d.data() }));
 
  const clSnap = await getDocs(collection(db, 'escritorios', escId, 'clientes'));
  const clientes = clSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const recorrentes = clientes.filter(c => c.recorrente);
  const receitaRecorrenteMes = recorrentes.reduce((s,c) => s + (c.valor_mensal||0), 0);
 
  el.innerHTML = `
    <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button></div>
    <div class="secao-header">
      <div class="secao-titulo">📁 Clientes — ${esc.nome}</div>
      <span class="secao-badge">Tier ${tier}</span>
    </div>
 
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:1.2rem">
      <div class="stat-mini">
        <div class="v" style="color:var(--navy)">${clientes.length}</div>
        <div class="l">👥 Carteira total</div>
      </div>
      <div class="stat-mini">
        <div class="v" style="color:var(--verde2)">${recorrentes.length}</div>
        <div class="l">🔁 Recorrentes</div>
      </div>
      <div class="stat-mini">
        <div class="v" style="color:var(--verde2)">${_fmtK(receitaRecorrenteMes)}</div>
        <div class="l">💰 Receita fixa/mês</div>
      </div>
    </div>
 
    <!-- Oportunidades do mês -->
    <div class="secao-header" style="margin-top:1rem">
      <div class="secao-titulo">✨ Oportunidades do Mês</div>
      <span class="secao-badge">${oportunidades.length} disponível(is)</span>
    </div>
    ${oportunidades.length === 0
      ? `<div class="card" style="text-align:center;padding:1.2rem;color:var(--txt3);font-size:.78rem">
           Nenhuma oportunidade disponível agora. Novas surgem ao avançar o mês.
         </div>`
      : oportunidades.map(o => _cardOportunidade(o, j, tier)).join('')}
 
    <!-- Carteira de clientes -->
    <div class="secao-header" style="margin-top:1.2rem">
      <div class="secao-titulo">📒 Carteira de Clientes</div>
    </div>
    <div id="carteira-clientes-container"></div>
  `;
 
  _renderCarteiraClientes(clientes, escId);
};

function _cardOportunidade(o, j, tier) {
  const tipo = TIPOS_SERVICO[o.tipo] || TIPOS_SERVICO.consulta;
  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes||0));
  const podeAceitar = energiaDisp >= o.energia;

  return `
    <div class="card" style="margin-bottom:.5rem;border-left:3px solid var(--ouro2)">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:.8rem">
        <div style="flex:1">
          <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${tipo.icone} ${tipo.l}</div>
          <div style="font-size:.7rem;color:var(--ouro2);margin:.15rem 0">
            ${o.cliente_nome} · ${o.cliente_tipo}${o.cliente_porte?` (${o.cliente_porte})`:''}
          </div>
          <div style="font-size:.68rem;color:var(--txt3)">${tipo.desc}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.92rem;font-weight:700;color:var(--verde2)">${_fmtK(o.valor)}</div>
          <div style="font-size:.65rem;color:var(--txt4)">-${o.energia}⚡</div>
        </div>
      </div>
      <div style="display:flex;gap:.4rem;margin-top:.55rem">
        <button class="btn btn-sm btn-prim" ${!podeAceitar?'disabled':''} onclick="window.aceitarOportunidade('${o.id}')">
          Aceitar pessoalmente
        </button>
        <button class="btn btn-sm btn-sec" onclick="window.abrirModalDelegarServico('${o.id}')">
          Delegar à equipe
        </button>
        <button class="btn btn-sm btn-ghost" onclick="window.recusarOportunidade('${o.id}')">
          Recusar
        </button>
      </div>
    </div>`;
}

function _cardCliente(c, escId) {
  const cor = c.confianca >= 70 ? 'var(--verde2)' : c.confianca >= 40 ? 'var(--amber)' : 'var(--verm2)';
  return `
    <div class="card" style="margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${c.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${c.tipo}${c.porte?` · ${c.porte}`:''} · Confiança: <b style="color:${cor}">${c.confianca}/100</b></div>
        </div>
        <div style="text-align:right">
          ${c.recorrente
            ? `<div style="font-size:.78rem;font-weight:700;color:var(--verde2)">${_fmtK(c.valor_mensal)}/mês</div>
               <div style="font-size:.6rem;color:var(--verde2)">🔁 Recorrente</div>`
            : c.confianca >= CONFIANCA_RECORRENTE_MIN
              ? `<button class="btn btn-sm btn-prim" onclick="window.oferecerContratoRecorrente('${c.id}','${escId}')">Oferecer contrato fixo</button>`
              : `<div style="font-size:.62rem;color:var(--txt4)">Confiança insuficiente</div>`}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════
// ACEITAR OPORTUNIDADE PESSOALMENTE
// ════════════════════════════════════════════════════════
window.aceitarOportunidade = async function(opId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const escId = j.escritorio_proprio_id;

  const opSnap = await getDoc(doc(db, 'escritorios', escId, 'oportunidades', opId));
  if (!opSnap.exists()) return;
  const o = opSnap.data();

  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (window.getEnergiaTotal?window.getEnergiaTotal(j):100) - usado);
  if (disp < o.energia) { toast('⚡ Energia insuficiente.', 'ko'); return; }

  await updateDoc(doc(db,'jogadores',uid), { energia_usada_mes: usado + o.energia });

  // 100% da receita (jogador executou pessoalmente)
  await _processarServicoConcluido(uid, escId, o, opId, 1.0);
};

// ════════════════════════════════════════════════════════
// DELEGAR SERVIÇO À EQUIPE
// ════════════════════════════════════════════════════════
window.abrirModalDelegarServico = async function(opId) {
  const j   = window.JOGADOR;
  const escId = j.escritorio_proprio_id;

  const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
  const funcs = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (funcs.length === 0) {
    toast('Você não tem funcionários contratados. Vá em Equipe para contratar.', 'ko');
    return;
  }

  abrirModal('👥 Delegar Serviço',
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:.8rem">
      O escritório recebe uma fração da receita conforme a produtividade do funcionário.
      Você gasta apenas energia de coordenação.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${funcs.map(f => {
        const pct = Math.round((PRODUTIVIDADE_CARGO[f.cargo_id]||0.5)*100);
        const custoCoord = ['jnr','pln','snr'].includes(f.cargo_id) ? 10 : 5;
        return `<button class="btn btn-ghost btn-block" style="text-align:left;padding:.6rem .8rem"
          onclick="window.delegarServico('${opId}','${f.id}','${escId}')">
          <div style="display:flex;justify-content:space-between">
            <div>
              <div style="font-weight:600;color:var(--navy);font-size:.8rem">${f.nome}</div>
              <div style="font-size:.65rem;color:var(--txt3)">Produtividade: ${pct}% da receita</div>
            </div>
            <div style="font-size:.68rem;color:var(--amber)">-${custoCoord}⚡ coord.</div>
          </div>
        </button>`;
      }).join('')}
    </div>`
  );
};

window.delegarServico = async function(opId, funcId, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!fSnap.exists()) return;
  const f = fSnap.data();
  const custoCoord = ['jnr','pln','snr'].includes(f.cargo_id) ? 10 : 5;

  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (window.getEnergiaTotal?window.getEnergiaTotal(j):100) - usado);
  if (disp < custoCoord) { toast('⚡ Energia insuficiente para coordenar.', 'ko'); return; }

  const opSnap = await getDoc(doc(db, 'escritorios', escId, 'oportunidades', opId));
  if (!opSnap.exists()) return;
  const o = opSnap.data();

  await updateDoc(doc(db,'jogadores',uid), { energia_usada_mes: usado + custoCoord });

  const produtividade = PRODUTIVIDADE_CARGO[f.cargo_id] || 0.5;
  fecharModal();
  await _processarServicoConcluido(uid, escId, o, opId, produtividade, f.nome);
};

// ════════════════════════════════════════════════════════
// PROCESSAR SERVIÇO CONCLUÍDO (núcleo comum)
// ════════════════════════════════════════════════════════
async function _processarServicoConcluido(uid, escId, oportunidade, opId, fracaoReceita, executorNome) {
  const valorRecebido = Math.floor(oportunidade.valor * fracaoReceita);

  const jSnap = await getDoc(doc(db,'jogadores',uid));
  const j = jSnap.data();

  // Creditar ao jogador (vai para honorarios_mes como renda do escritório)
  await updateDoc(doc(db,'jogadores',uid), {
    dinheiro:       (j.dinheiro||0) + valorRecebido,
    honorarios_mes: (j.honorarios_mes||0) + valorRecebido,
  });

  // Marcar oportunidade como concluída
  await updateDoc(doc(db,'escritorios',escId,'oportunidades',opId), {
    status: 'concluido', valor_recebido: valorRecebido, executor: executorNome || 'Você',
  });

  // Adicionar/atualizar cliente na carteira
  await _registrarCliente(escId, oportunidade);

  // Eventos pós-serviço: cliente recorrente, gerar processo
  let msgExtra = '';
  if (Math.random() < (oportunidade.chance_gerar_processo||0)) {
    await _gerarProcessoAutomatico(j, oportunidade);
    msgExtra += ' 📋 Isso gerou um novo processo na sua lista!';
  }

  toast(`✅ Serviço concluído! +${_fmtK(valorRecebido)}${executorNome?` (via ${executorNome})`:''}.${msgExtra}`, 'ok', 6000);
  setTimeout(()=>window.navTo&&window.navTo('clientes',null), 700);
}

async function _registrarCliente(escId, oportunidade) {
  const clSnap = await getDocs(query(
    collection(db,'escritorios',escId,'clientes'),
    where('nome','==',oportunidade.cliente_nome)
  ));

  if (clSnap.empty) {
    await addDoc(collection(db,'escritorios',escId,'clientes'), {
      nome: oportunidade.cliente_nome, tipo: oportunidade.cliente_tipo,
      porte: oportunidade.cliente_porte || null,
      confianca: CONFIANCA_INICIAL + (oportunidade.confianca_gerada||0),
      recorrente: false, valor_mensal: 0,
      criado_em: new Date().toISOString(),
    });
  } else {
    const cDoc = clSnap.docs[0];
    const c    = cDoc.data();
    await updateDoc(doc(db,'escritorios',escId,'clientes',cDoc.id), {
      confianca: Math.min(100, (c.confianca||50) + (oportunidade.confianca_gerada||0)),
    });
  }
}

// ════════════════════════════════════════════════════════
// TRECHO PARA SUBSTITUIR em servicos.js — troca _gerarProcessoAutomatico
// para reaproveitar _gerarProcessoCompleto (processos.js), que já monta
// provas/teses/juiz/args_audiencia. Antes este processo "esqueleto" não
// tinha esses campos e quebrava ao abrir a audiência (Cannot read
// properties of undefined (reading 'map') em _renderSelecaoProvas).
//
// IMPORTANTE: _gerarProcessoCompleto precisa estar acessível aqui — se
// estiver em processos.js como função não-exportada (sem `export`),
// adicione `export` na declaração dela em processos.js e importe:
//   import { _gerarProcessoCompleto } from './processos.js';
// no topo de servicos.js.
// ════════════════════════════════════════════════════════
 
async function _gerarProcessoAutomatico(j, oportunidade) {
  const AREAS_SERVICO = {
    consulta:'civil', parecer:'tributario', contrato:'empresarial',
    notificacao:'civil', cobranca:'civil',
  };
  // Empresta a especialidade do tipo de serviço só para escolher a área
  // do banco jurídico — não sobrescreve a especialidade do personagem.
  const jComEspecialidadeServico = { ...j, especialidade: AREAS_SERVICO[oportunidade.tipo] || j.especialidade || 'civil' };
 
  const distribuidoPeloEscritorio = !!j.escritorio_proprio_id;
  const proc = _gerarProcessoCompleto(jComEspecialidadeServico, distribuidoPeloEscritorio);
 
  // Ajusta só os campos que devem refletir a ORIGEM (Oportunidade), sem
  // tocar nos campos do motor (provas/teses/juiz/args já vieram certos).
  proc.tipo = 'Ação decorrente de ' + oportunidade.tipo;
  proc.reu = oportunidade.cliente_nome;
  proc.valor = Math.floor(oportunidade.valor * (3 + Math.random()*5));
  proc.origem_oportunidade = true;
 
  await addDoc(collection(db,'processos'), proc);
}

// ════════════════════════════════════════════════════════
// RECUSAR OPORTUNIDADE
// ════════════════════════════════════════════════════════
window.recusarOportunidade = async function(opId) {
  const j   = window.JOGADOR;
  const escId = j.escritorio_proprio_id;
  await updateDoc(doc(db,'escritorios',escId,'oportunidades',opId), { status:'recusado' });
  toast('Oportunidade recusada.', 'neutro', 2500);
  setTimeout(()=>window.navTo&&window.navTo('clientes',null), 400);
};

// ════════════════════════════════════════════════════════
// OFERECER CONTRATO RECORRENTE
// ════════════════════════════════════════════════════════
window.oferecerContratoRecorrente = async function(clienteId, escId) {
  const escSnap = await getDoc(doc(db,'escritorios',escId));
  const tier = escSnap.exists() ? (escSnap.data().tier||1) : 1;
  const limiteEmpresas = LIMITE_EMPRESAS_TIER[tier] || 1;

  const clSnap = await getDoc(doc(db,'escritorios',escId,'clientes',clienteId));
  if (!clSnap.exists()) return;
  const c = clSnap.data();

  if (c.tipo === 'PJ') {
    const recSnap = await getDocs(query(collection(db,'escritorios',escId,'clientes'), where('recorrente','==',true), where('tipo','==','PJ')));
    if (recSnap.size >= limiteEmpresas) {
      toast(`Limite de ${limiteEmpresas} empresas recorrentes no Tier ${tier} atingido.`, 'ko', 5000);
      return;
    }
  }

  const valorMensal = valorContratoRecorrente(c.tipo, c.porte);

  await updateDoc(doc(db,'escritorios',escId,'clientes',clienteId), {
    recorrente: true, valor_mensal: valorMensal,
  });

  toast(`🔁 ${c.nome} agora é cliente recorrente! +${_fmtK(valorMensal)}/mês.`, 'ok', 5000);
  setTimeout(()=>window.navTo&&window.navTo('clientes',null), 600);
};

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL — gerar oportunidades, cobrar recorrentes,
// gerar demandas automáticas de empresas (chamado pelo avancar_mes.js)
// ════════════════════════════════════════════════════════
export async function processarServicosMensal(j) {
  const escId = j.escritorio_proprio_id;
  if (!escId) return {};

  const escSnap = await getDoc(doc(db,'escritorios',escId));
  if (!escSnap.exists()) return {};
  const esc  = escSnap.data();
  const tier = esc.tier || 1;

  // ── 1. Limpar oportunidades antigas não respondidas ──
  const oldOpSnap = await getDocs(query(
    collection(db,'escritorios',escId,'oportunidades'),
    where('status','==','disponivel')
  ));
  await Promise.all(oldOpSnap.docs.map(d => deleteDoc(doc(db,'escritorios',escId,'oportunidades',d.id))));

  // ── 2. Gerar novas oportunidades ──
  const faixa = OPORTUNIDADES_POR_TIER[tier] || OPORTUNIDADES_POR_TIER[1];
  const networking = j.networking || 10;
  const cap = (window.REP_CAP||{})[j.cargo_id] || 45;
  const prestigioPct = Math.min(100, Math.round((j.reputacao||0)/cap*100));

  const modNet = modificadorNetworking(networking);
  const qtdBase = faixa.min + Math.floor(Math.random()*(faixa.max-faixa.min+1));
  const qtd = Math.round(qtdBase * (1+modNet));

  for (let i=0; i<qtd; i++) {
    const op = gerarOportunidade(tier, prestigioPct, j.cargo_id);
    await addDoc(collection(db,'escritorios',escId,'oportunidades'), { ...op, status:'disponivel' });
  }

  // ── 2.1 AUTOGESTÃO: se não há jogador-dono ativo gerenciando, os próprios
  // funcionários (advogados/sêniores) resolvem as oportunidades automaticamente,
  // gerando receita contínua para o caixa mesmo sem o dono presente. ──
  await _processarAutogestaoOportunidades(escId, esc);

  // ── 3. Cobrar clientes recorrentes ──
  let receitaRecorrente = 0;
  const clRecSnap = await getDocs(query(collection(db,'escritorios',escId,'clientes'), where('recorrente','==',true)));
  for (const cDoc of clRecSnap.docs) {
    receitaRecorrente += cDoc.data().valor_mensal || 0;
  }

  if (receitaRecorrente > 0) {
    await updateDoc(doc(db,'jogadores',j.uid||window.JOGADOR_UID), {
      dinheiro: (j.dinheiro||0) + receitaRecorrente,
      honorarios_mes: (j.honorarios_mes||0) + receitaRecorrente,
    });
  }

  // ── 4. Demandas automáticas de empresas contratadas ──
  let novosProcessos = 0;
  for (const cDoc of clRecSnap.docs) {
    const c = cDoc.data();
    if (c.tipo !== 'PJ' || !c.porte) continue;
    const chance = CHANCE_DEMANDA_AUTOMATICA[c.porte] || 0.05;
    if (Math.random() < chance) {
      const tipoArea = TIPOS_DEMANDA_AUTOMATICA[Math.floor(Math.random()*TIPOS_DEMANDA_AUTOMATICA.length)];
      await _gerarProcessoAutomatico(j, { tipo:'parecer', cliente_nome:c.nome, valor: c.valor_mensal*10 });
      novosProcessos++;
    }
  }

  return { oportunidades_geradas: qtd, receita_recorrente: receitaRecorrente, processos_automaticos: novosProcessos };
}

window._processarServicosMensal = processarServicosMensal;

// ════════════════════════════════════════════════════════
// AUTOGESTÃO — funcionários resolvem oportunidades sozinhos
// quando não há sócio/dono ativo gerenciando manualmente.
// Garante que o escritório nunca fica sem renda mesmo abandonado.
// ════════════════════════════════════════════════════════
async function _processarAutogestaoOportunidades(escId, esc) {
  // Verificar se existe pelo menos um sócio/dono "ativo" (jogador real presente)
  // Simplificação: se o escritório não tem nenhum funcionário advogado (jnr+),
  // não há quem resolva sozinho — fica só pro dono mesmo.
  const fSnap = await getDocs(collection(db,'escritorios',escId,'funcionarios'));
  const advogadosAtivos = fSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(f => ['jnr','pln','snr'].includes(f.cargo_id) && f.ativo!==false);

  if (advogadosAtivos.length === 0) return; // ninguém pra autogerenciar

  // Pegar oportunidades disponíveis e resolver uma fração automaticamente
  // (representa o escritório funcionando "no piloto automático")
  const opSnap = await getDocs(query(
    collection(db,'escritorios',escId,'oportunidades'),
    where('status','==','disponivel')
  ));

  const PRODUTIVIDADE_CARGO_AUTO = { jnr:1.0, pln:1.0, snr:1.0 };
  let caixaGanho = 0;
  let resolvidas = 0;

  for (const opDoc of opSnap.docs) {
    const op = opDoc.data();
    // Cada advogado resolve no máximo ~2 oportunidades/mês sozinho, distribuído entre eles
    const capacidadeTotal = advogadosAtivos.length * 2;
    if (resolvidas >= capacidadeTotal) break;

    const advogadorResolvedor = advogadosAtivos[resolvidas % advogadosAtivos.length];
    const fracao = PRODUTIVIDADE_CARGO_AUTO[advogadorResolvedor.cargo_id] || 0.8;
    const valorRecebido = Math.floor(op.valor * fracao);

    caixaGanho += valorRecebido;
    resolvidas++;

    await updateDoc(doc(db,'escritorios',escId,'oportunidades',opDoc.id), {
      status:'concluido', valor_recebido:valorRecebido, executor:advogadorResolvedor.nome+' (autogestão)',
    });

    // Registrar/atualizar cliente na carteira (mesma lógica do fluxo manual)
    const clSnap = await getDocs(query(collection(db,'escritorios',escId,'clientes'), where('nome','==',op.cliente_nome)));
    if (clSnap.empty) {
      await addDoc(collection(db,'escritorios',escId,'clientes'), {
        nome: op.cliente_nome, tipo: op.cliente_tipo, porte: op.cliente_porte||null,
        confianca: CONFIANCA_INICIAL + (op.confianca_gerada||0),
        recorrente:false, valor_mensal:0, criado_em:new Date().toISOString(),
      });
    } else {
      const cDoc=clSnap.docs[0]; const c=cDoc.data();
      await updateDoc(doc(db,'escritorios',escId,'clientes',cDoc.id), {
        confianca: Math.min(100,(c.confianca||50)+(op.confianca_gerada||0)),
      });
    }
  }

  if (caixaGanho > 0) {
    await updateDoc(doc(db,'escritorios',escId), { caixa: (esc.caixa||0) + caixaGanho });
  }
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
