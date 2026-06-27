/**
 * UI-MAIN — Advocatus Online
 * Renderiza todos os painéis da área central.
 * Ouve eventos de navegação e de atualização do gamestate.
 */

import { collection, query, where, orderBy, limit,
         getDocs, doc, updateDoc, addDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ── Painel ativo ──
let _painelAtivo = 'perfil';

// ════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ════════════════════════════════════════════════════════
window.addEventListener('nav:painel', (e) => {
  _painelAtivo = e.detail;
  _renderizar();
});

window.addEventListener('gamestate:ready', () => {
  _renderizar();
});

function _renderizar() {
  const j = window.JOGADOR;
  if (!j) return;

  const main = document.getElementById('main-content');
  if (!main) return;

  switch (_painelAtivo) {
    case 'perfil':       renderPerfil(j, main);       break;
    case 'processos':    renderProcessos(j, main);     break;
    case 'escritorio':   renderEscritorio(j, main);    break;
    case 'equipe':
      if (window.renderEquipe) {
        window.renderEquipe(j, main);
      } else {
        main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando equipe...</div>';
      }
      break;
    case 'clientes':
      if (window.renderClientes) {
        window.renderClientes(j, main);
      } else {
        main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando clientes...</div>';
      }
      break;
    case 'equipe_dummy':       renderEquipe(j, main);        break;
    case 'progressao':   renderProgressao(j, main);    break;
    case 'habilidades':  renderHabilidades(j, main);   break;
    case 'cursos':       renderCursos(j, main);        break;
    case 'concurso':     renderConcurso(j, main);      break;
    case 'patrimonio':
      if (window.renderPatrimonio) window.renderPatrimonio(j, main);
      break;
    case 'loja':
      if (window.renderLoja) window.renderLoja(j, main);
      break;
    case 'vida_pessoal':
      if (window.renderVidaPessoal) window.renderVidaPessoal(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando vida pessoal...</div>';
      break;
    case 'ranking':
      if (window.renderRanking) window.renderRanking(j, main);
      break;
    case 'vagas':
      if (window.renderVagas) window.renderVagas(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando vagas...</div>';
      break;
    case 'balancete':    renderBalancete(j, main);      break;
    case 'inbox':        renderInbox(j, main);         break;
    default:             renderPerfil(j, main);
  }

  // Verificar recesso pendente
  if (j.recesso_pendente) _mostrarModalRecesso(j);
}

// ════════════════════════════════════════════════════════
// PERFIL
// ════════════════════════════════════════════════════════
function renderPerfil(j, el) {
  const cap    = window.REP_CAP[j.cargo_id] || 55;
  const label  = window.CARGO_LABEL[j.cargo_id] || j.cargo_id;
  const total  = (j.wins||0) + (j.losses||0);
  const aprov  = total > 0 ? Math.round((j.wins||0)/total*100) : 0;
  const esp    = _espLabel(j.especialidade);
  const escNome = j.escritorio_nome || 'Advocacia Solo';
  const s = window.SERVER || {};

  el.innerHTML = `
    <div class="profile-hero">
      <div class="profile-photo">⚖️</div>
      <div>
        <div class="profile-hero-nome">${j.nome_personagem || '—'}</div>
        <div class="profile-hero-titulo">${label} · ${esp} · Rio de Janeiro</div>
        <div class="profile-hero-meta">
          <span class="meta-tag">📅 ${j.anos_carreira || 0} anos de carreira</span>
          <span class="meta-tag">⚖️ ${total} casos no total</span>
          <span class="meta-tag">✅ ${aprov}% de aproveitamento</span>
          <span class="meta-tag">🏢 ${escNome}</span>
          <span class="meta-tag">👤 ${j.idade || 22} anos · Geração ${j.geracao || 1}</span>
        </div>
      </div>
      <div class="hero-badges">
        <span class="badge-pill badge-cargo">${label}</span>
        <span class="badge-pill badge-esp">${esp}</span>
        ${j.oab ? '<span class="badge-pill badge-oab">OAB ✓</span>' : ''}
        ${j.no_serasa ? '<span class="badge-pill" style="background:rgba(122,32,32,.25);color:var(--verm3);border:1px solid rgba(200,80,80,.35)">🚨 Serasa</span>' : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem;margin-bottom:1.2rem">
      ${_miniStatCard('💰','Saldo', _fmtExt(j.dinheiro||0),'money')}
      ${_miniStatCard('📈','Renda/mês', _fmtExt(j.renda_calculada||0),'money')}
      ${_miniStatCard('💸','Despesas', _fmtExt(j.despesas_calculadas||0),'danger')}
      ${_miniStatCardRep('🏅','Reputação', j.reputacao||0, cap)}
    </div>

    <!-- Energia do mês -->
    ${(() => {
      const energiaUsada = j.energia_usada_mes||0;
      const energiaDisp  = Math.max(0, 100 - energiaUsada);
      const corE = energiaDisp > 50 ? 'var(--verde2)' : energiaDisp > 20 ? 'var(--amber)' : 'var(--verm2)';
      return `<div style="margin-bottom:1rem;padding:.75rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3);margin-bottom:.3rem">
          <span>⚡ Energia do mês</span>
          <span style="font-weight:700;color:${corE}">${energiaDisp}/100</span>
        </div>
        <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${energiaDisp}%;background:${corE};border-radius:4px;transition:width .4s"></div>
        </div>
        <div style="font-size:.62rem;color:var(--txt4);margin-top:.25rem">
          Pesquisa -5⚡ · Petição -10⚡ · Diligência -15⚡ · Audiência -20⚡
        </div>
      </div>`;
    })()}

    <!-- Atributos -->
    <div class="secao-header">
      <div class="secao-titulo">📊 Atributos</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:1.2rem">
      ${_attrRow('🧠','Saúde Mental', j.saude_mental||80, 'azul')}
      ${_attrRow('⚡','Disposição', j.disposicao||80, 'ouro')}
      ${_attrRow('🌐','Networking', j.networking||10, 'verde')}
      ${_attrRow('🎓','Prestígio Acadêmico', j.prestigio_academico||0, 'roxo')}
    </div>

    <!-- Feed de atividade recente -->
    <div class="secao-header">
      <div class="secao-titulo">📋 Atividade Recente</div>
      <span class="secao-badge">${_calJogador(j)}</span>
    </div>
    <div id="feed-atividade">
      <div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Carregando feed...</div>
    </div>`;

  // Carregar feed do inbox assincronamente
  _carregarFeedAtividade(j.uid);
}

async function _carregarFeedAtividade(uid) {
  try {
    const q    = query(
      collection(db, 'jogadores', uid, 'inbox'),
      orderBy('criado_em', 'desc'),
      limit(8)
    );
    const snap = await getDocs(q);
    const feed = document.getElementById('feed-atividade');
    if (!feed) return;

    if (snap.empty) {
      feed.innerHTML = '<div style="font-size:.78rem;color:var(--ardosia)">Nenhuma atividade registrada ainda.</div>';
      return;
    }

    const iconMap = {
      positivo: '🏆', urgente: '⚠️', neutro: '📋',
      convite: '📬', sistema: '⚙️',
    };

    feed.innerHTML = '<div class="activity-feed">' +
      snap.docs.map(d => {
        const m    = d.data();
        const icon = iconMap[m.tipo_noticia] || iconMap[m.tipo] || '📋';
        return `<div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-text">
            <b>${m.assunto || '—'}</b><br>
            ${(m.corpo||'').slice(0,120)}${m.corpo?.length>120?'…':''}
            <span class="activity-date">${m.mes_jogo_label || _formatarData(m.criado_em)}</span>
          </div>
        </div>`;
      }).join('') + '</div>';
  } catch (err) {
    console.error('[UI] Feed:', err);
  }
}

// ════════════════════════════════════════════════════════
// PROCESSOS — lista e ações
// ════════════════════════════════════════════════════════
function renderProcessos(j, el) {
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">⚖️ Meus Processos</div>
      <button class="btn btn-sm btn-sec" onclick="window.novoProcesso && window.novoProcesso()">+ Novo caso</button>
    </div>
    <div id="lista-processos">
      <div style="font-size:.78rem;color:var(--ardosia)">Carregando processos...</div>
    </div>
    <div class="ornamento">— ✦ —</div>
    <div id="secao-pool-escritorio"></div>
    <div class="ornamento">— ✦ —</div>
    <div id="secao-carteira-processual"></div>
    <div class="ornamento">— ✦ —</div>
    <div class="secao-header" style="margin-top:.5rem">
      <div class="secao-titulo">📁 Processos Encerrados</div>
    </div>
    <div id="lista-processos-enc">
      <div style="font-size:.78rem;color:var(--ardosia)">Carregando...</div>
    </div>`;

  _carregarProcessos(j.uid);

  // Pool do escritório (dono ou empregado) — antes ficava completamente
  // invisível: os casos eram criados certo no Firestore via
  // novoProcessoPool/novoProcessoPoolEmpregado, mas nenhuma tela os
  // listava. renderPoolEscritorio() já existe em processos.js e cuida de
  // checar se o jogador trabalha em escritório, buscar os casos e
  // renderizar — ou deixar o container vazio se for solo.
  const poolEl = document.getElementById('secao-pool-escritorio');
  if (poolEl && window.renderPoolEscritorio) {
    window.renderPoolEscritorio(poolEl);
  }

  // Carteira processual (recursos pendentes e decisões de recurso
  // aguardando o jogador) — antes existia em processos.js mas nenhuma
  // tela chamava, então processos recorridos ficavam invisíveis mesmo
  // já estando de fato em fase de recurso no Firestore.
  const carteiraEl = document.getElementById('secao-carteira-processual');
  if (carteiraEl && window.renderCarteiraProcessual) {
    window.renderCarteiraProcessual(carteiraEl);
  }
}

async function _carregarProcessos(uid) {
  try {
    const qA = query(
      collection(db, 'processos'),
      where('advogado_uid', '==', uid),
      where('status', '==', 'andamento'),
      orderBy('criado_mes', 'desc'),
      limit(20)
    );

    const qE = query(
      collection(db, 'processos'),
      where('advogado_uid', '==', uid),
      where('status', 'in', ['ganho','perdido','encerrado_cargo']),
      orderBy('encerrado_mes', 'desc'),
      limit(10)
    );

    let snapA, snapE;

    try {
      snapA = await getDocs(qA);
      console.log('ATIVOS OK');
    } catch (e) {
      console.error('ERRO ATIVOS', e);
    }

    try {
      snapE = await getDocs(qE);
      console.log('ENCERRADOS OK');
    } catch (e) {
      console.error('ERRO ENCERRADOS', e);
    }

    console.log('snapA', snapA?.size);
    console.log('snapE', snapE?.size);

  } catch (err) {
    console.error('[UI] Processos:', err);
  }
}

function _cardProcesso(id, p) {
  const cs     = p.chance_sucesso || 50;
  const prog   = p.progresso || 0;
  const csColor = cs >= 70 ? 'var(--verde3)' : cs >= 40 ? '#ffa726' : 'var(--verm3)';
  const instLabel = ['','1ª Instância','2ª Instância','STJ','STF'][p.instancia||1] || '1ª Inst.';

  return `<div class="proc-card ${p.urgente?'urgente':''} ${p.tipo_processo==='administrativo'?'admin-proc':''}"
    onclick="window.abrirProcesso && window.abrirProcesso('${id}')">
    <div>
      <div class="proc-numero">${p.numero || '—'}</div>
      <div class="proc-partes">${p.autor||'—'} <span style="opacity:.45">vs</span> ${p.reu||'—'}</div>
      <div class="proc-tipo">${p.tipo||'—'} · ${p.tribunal||'—'}</div>
    </div>
    <div class="proc-direita">
      <div class="proc-valor">${fmt(p.valor)}</div>
      <div class="proc-inst">Nv${p.nivel||1} · ${instLabel}</div>
    </div>
    <div class="proc-prog-bloco">
      <div class="proc-prog-wrap">
        <div class="proc-prog-bar"><div class="proc-prog-fill" style="width:${prog}%"></div></div>
        <div class="proc-prog-cs" style="color:${csColor}">⚖️ ${cs}%</div>
      </div>
    </div>
    <div class="proc-tags">
      <span class="ptag ptag-inst">${instLabel}</span>
      ${p.urgente ? '<span class="ptag ptag-urg">Urgente</span>' : ''}
      ${p.tipo_processo==='administrativo' ? '<span class="ptag ptag-adm">Admin.</span>' : ''}
      ${p.recurso_pendente ? '<span class="ptag ptag-pend">Recurso pendente</span>' : ''}
      ${cs>=70 ? '<span class="ptag ptag-ok">Alta chance</span>' : ''}
    </div>
  </div>`;
}

function _cardProcessoEnc(id, p) {
  const cor = p.status==='ganho' ? 'var(--verde3)' : 'var(--verm3)';
  const icone = p.status==='ganho' ? '✅' : '❌';
  return `<div class="proc-card" style="opacity:.65">
    <div>
      <div class="proc-numero">${p.numero||'—'}</div>
      <div class="proc-partes">${p.autor||'—'} vs ${p.reu||'—'}</div>
      <div class="proc-tipo">${p.tipo||'—'}</div>
    </div>
    <div class="proc-direita">
      <div style="font-size:.78rem;font-weight:700;color:${cor}">${icone} ${p.status==='ganho'?'Ganho':'Perdido'}</div>
      <div class="proc-inst">${fmt(p.hon_total_acumulado||0)}</div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
// ESCRITÓRIO
// ════════════════════════════════════════════════════════
function renderEscritorio(j, el) {
  const isSolo  = !j.escritorio_proprio_id && (!j.escritorio_empregado_id || j.escritorio_id === 'solo' || !j.escritorio_id);

  // Empregado num escritório NPC (não é o dono) → vista de empregado
  if (!isSolo && !j.escritorio_proprio_id && j.escritorio_id && j.escritorio_id !== 'solo') {
    _renderEscritorioNPC(j, el);
    return;
  }

  // Dono de escritório próprio → dashboard executivo completo
  if (j.escritorio_proprio_id) {
    el.innerHTML = `
      ${_escHero(j, null)}
      ${_escKpis(null, j)}
      <div class="esc-grid-3">
        ${_escEquipeCard()}
        ${_escClientesCard()}
        ${_escSocietarioCard(null, j)}
      </div>
      <div id="esc-oportunidades-bloco"></div>
      <div id="esc-financas-upgrade"></div>
      ${_escAcoesRapidas(j, null)}
    `;
    _carregarEscritorioProprio(j.escritorio_proprio_id, j);
    return;
  }

  // Advocacia solo — sem escritório formal ainda
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🏢 Escritório</div>
    </div>
    <div class="card" style="text-align:center;padding:2rem">
      <div style="font-size:2rem;margin-bottom:.6rem">⚖️</div>
      <div class="card-titulo">Advocacia Solo</div>
      <div class="card-sub" style="margin-top:.4rem;max-width:360px;margin-inline:auto">
        Você atua como advogado autônomo. Seus honorários são 30% do valor da causa + sucumbência por instância.
        Para criar um escritório formal, você precisa ter OAB aprovada e ser Advogado Júnior ou superior.
      </div>
      ${j.oab && ['jnr','pln','snr','asc','soc','snm'].includes(j.cargo_id) ? `
      <button class="btn btn-sec" style="margin-top:1.2rem" onclick="window.criarEscritorio && window.criarEscritorio()">
        Criar Escritório Formal
      </button>` : `
      <div style="font-size:.75rem;color:var(--ardosia);margin-top:1rem">
        ${!j.oab ? 'Requer OAB aprovada' : 'Requer Advogado Júnior ou superior'}
      </div>`}
    </div>`;
}

async function _carregarEscritorioProprio(escId, j) {
  try {
    const { doc: fbDoc, getDoc: fbGetDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fbDb } = await import('./firebase-init.js');
    const snap = await fbGetDoc(fbDoc(fbDb, 'escritorios', escId));
    if (!snap.exists()) return;
    const esc = { id: escId, ...snap.data() };

    // Re-renderizar hero/KPIs/societário/ações agora com dados reais do escritório
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = `
        ${_escHero(j, esc)}
        <div id="esc-kpis-placeholder">
          <div class="esc-kpis">
            <div class="esc-kpi-card">
              <div class="esc-kpi-label">Receita do mês</div>
              <div class="esc-kpi-valor">—</div>
              <div class="esc-kpi-delta flat">carregando...</div>
            </div>
            <div class="esc-kpi-card">
              <div class="esc-kpi-label">Despesas do mês</div>
              <div class="esc-kpi-valor">—</div>
              <div class="esc-kpi-delta flat">carregando...</div>
            </div>
            <div class="esc-kpi-card">
              <div class="esc-kpi-label">Lucro líquido</div>
              <div class="esc-kpi-valor">—</div>
              <div class="esc-kpi-delta flat">carregando...</div>
            </div>
            <div class="esc-kpi-card">
              <div class="esc-kpi-label">Caixa disponível</div>
              <div class="esc-kpi-valor">—</div>
              <div class="esc-kpi-delta flat">carregando...</div>
            </div>
          </div>
        </div>
        <div class="esc-grid-3">
          ${_escEquipeCard()}
          ${_escClientesCard()}
          ${_escSocietarioCard(esc, j)}
        </div>
        <div id="esc-oportunidades-bloco"></div>
        <div id="esc-workspace-bloco"></div>
        <div id="esc-processos-bloco"></div>
        <div id="esc-financas-upgrade">
          ${window.renderBlocoFinancas ? window.renderBlocoFinancas(esc, j) : ''}
        </div>
        ${_escAcoesRapidas(j, esc)}
      `;
      
      // Carregar KPIs de forma assíncrona
      const kpisHtml = await _escKpis(esc, j);
      const kpisEl = document.getElementById('esc-kpis-placeholder');
      if (kpisEl) kpisEl.innerHTML = kpisHtml;
      
      const elEquipe = document.getElementById('esc-equipe-embed');
      if (elEquipe && window.renderEquipePainel) window.renderEquipePainel(j, escId, elEquipe);
      const elClientes = document.getElementById('esc-clientes-embed');
      if (elClientes && window.renderClientesPainel) window.renderClientesPainel(j, escId, elClientes);
      const elOportunidades = document.getElementById('esc-oportunidades-bloco');
      if (elOportunidades && window.renderOportunidadesPainel) window.renderOportunidadesPainel(j, escId, elOportunidades);
      const elWorkspace = document.getElementById('esc-workspace-bloco');
      if (elWorkspace) _renderWorkspacePainel(j, elWorkspace);
      const elProcessos = document.getElementById('esc-processos-bloco');
      if (elProcessos && window.renderProcessosPool) window.renderProcessosPool(j, escId, elProcessos);
    }
  } catch (e) {
    console.error('Erro ao carregar escritório próprio:', e);
  }
}

// ════════════════════════════════════════════════════════
// BALANCETE
// ════════════════════════════════════════════════════════
async function renderBalancete(j, el) {
  const data = window._escBalanceteData;

  const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const s     = window.SERVER || {};
  const mes   = s.mes_global || 1;
  const mNome = MESES_NOME[(mes - 1) % 12];
  const ano   = Math.ceil(mes / 12);

  if (!data) {
    el.innerHTML = `
      <div style="margin-bottom:.8rem">
        <button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button>
      </div>
      <div class="card" style="color:var(--txt3);font-size:.82rem;padding:1.2rem">
        Acesse o painel do escritório primeiro para carregar os dados financeiros.
      </div>`;
    return;
  }

  const fmt = n => `R$ ${Math.abs(Math.round(n)).toLocaleString('pt-BR')}`;
  const CARGO_L = { est:'Estagiário', ass:'Assistente Jurídico', jnr:'Adv. Júnior', pln:'Adv. Pleno', snr:'Adv. Sênior', asc:'Associado', soc:'Sócio' };
  const TIER_L  = { 1:'Boutique', 2:'Boutique', 3:'Regional', 4:'Full Service', 5:'Big Law' };

  const honorarios = data.rendaMes - data.receitaRecorrente;

  el.innerHTML = `
    <div style="margin-bottom:.8rem">
      <button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button>
    </div>
    <div class="secao-header" style="margin-bottom:1rem">
      <div class="secao-titulo" style="font-size:1rem">📊 Balancete — ${mNome}, Ano ${ano}</div>
      <span style="font-size:.72rem;color:var(--txt3);font-style:italic">${data.escNome}</span>
    </div>

    <div class="card blcte-card" style="margin-bottom:.7rem">
      <div class="blcte-secao-titulo receita">RECEITAS</div>
      <div class="blcte-linha">
        <span>Honorários e processos</span>
        <span class="blcte-val receita">${fmt(honorarios)}</span>
      </div>
      ${data.receitaRecorrente > 0 ? `
      <div class="blcte-linha">
        <span>Contratos recorrentes</span>
        <span class="blcte-val receita">${fmt(data.receitaRecorrente)}</span>
      </div>` : ''}
      <div class="blcte-linha blcte-total">
        <span>TOTAL RECEITAS</span>
        <span class="blcte-val receita">${fmt(data.rendaMes)}</span>
      </div>
    </div>

    <div class="card blcte-card" style="margin-bottom:.7rem">
      <div class="blcte-secao-titulo despesa">DESPESAS</div>

      <div class="blcte-grupo">Salários</div>
      ${data.funcionarios.length
        ? data.funcionarios.map(f => `
          <div class="blcte-linha sub">
            <span>${f.nome || f.name || 'Funcionário'} <span style="color:var(--txt4);font-size:.85em">(${CARGO_L[f.cargo_id]||f.cargo_id})</span></span>
            <span class="blcte-val despesa">−${fmt(f.sal)}</span>
          </div>`).join('')
        : `<div class="blcte-linha sub"><span style="color:var(--txt3)">Sem funcionários ativos</span><span style="color:var(--txt3)">—</span></div>`}
      <div class="blcte-linha blcte-subtotal">
        <span>Subtotal Salários</span>
        <span class="blcte-val despesa">−${fmt(data.salariosTotais)}</span>
      </div>

      <div class="blcte-grupo">Infraestrutura</div>
      <div class="blcte-linha sub">
        <span>Custo fixo ${TIER_L[data.tier]||''}</span>
        <span class="blcte-val despesa">−${fmt(data.custoFixo)}</span>
      </div>
      ${data.workspaceCm > 0
        ? `<div class="blcte-linha sub">
            <span>${data.workspaceLabel}</span>
            <span class="blcte-val despesa">−${fmt(data.workspaceCm)}</span>
           </div>`
        : `<div class="blcte-linha sub">
            <span>${data.workspaceLabel} <span style="color:var(--txt4);font-size:.85em">(gratuito)</span></span>
            <span style="color:var(--txt4)">—</span>
           </div>`}

      <div class="blcte-linha blcte-total">
        <span>TOTAL DESPESAS</span>
        <span class="blcte-val despesa">−${fmt(data.despMes)}</span>
      </div>
    </div>

    <div class="card blcte-card">
      <div class="blcte-secao-titulo resultado">RESULTADO DO MÊS</div>
      <div class="blcte-linha" style="padding:.5rem 0">
        <span style="font-weight:700">Lucro Líquido</span>
        <span style="color:${data.lucroMes>=0?'var(--verde2)':'var(--verm2)'};font-size:1.15rem;font-weight:700;font-variant-numeric:tabular-nums">
          ${data.lucroMes < 0 ? '−' : ''}${fmt(data.lucroMes)}
        </span>
      </div>
      <div class="blcte-linha" style="border-top:1px solid var(--borda-sub);padding-top:.45rem;margin-top:.25rem">
        <span style="color:var(--txt3)">Sua cota (${data.minhaCota}%)</span>
        <span style="color:${data.lucroMes>=0?'var(--verde2)':'var(--verm2)'};font-weight:600;font-variant-numeric:tabular-nums">
          ${data.lucroMes < 0 ? '−' : ''}${fmt(Math.round(data.lucroMes * data.minhaCota / 100))}
        </span>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════
// ESPAÇO DE TRABALHO — seção no painel do escritório
// ════════════════════════════════════════════════════════
function _renderWorkspacePainel(j, el) {
  const ESC_PAT = [
    { id:'home', l:'Home Office',         img:'img/escritorios/home-office.png',        cm:0,     rep:-2 },
    { id:'cw',   l:'Coworking Jurídico',  img:'img/escritorios/cowork.png',             cm:600,   rep:0  },
    { id:'sal',  l:'Sala Própria',        img:'img/escritorios/sala-propria.png',       cm:3000,  rep:3  },
    { id:'esm',  l:'Escritório Médio',    img:'img/escritorios/escritorio-medio.png',   cm:7500,  rep:6  },
    { id:'esp',  l:'Escritório Premium',  img:'img/escritorios/escritorio-premium.png', cm:18000, rep:12 },
  ];

  const escId  = j.pat?.escritorio || 'home';
  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';

  el.innerHTML = `
    <div class="esc-card-bloco" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.8rem;border-bottom:1px solid var(--borda-sub);padding-bottom:.5rem">
        <div class="secao-titulo" style="font-size:.88rem;font-weight:700">💼 Espaço de Trabalho</div>
      </div>
      ${!isSolo
        ? `<div style="font-size:.8rem;color:var(--verde);font-weight:600;padding:.5rem 0">
             ✅ Você trabalha em ${j.escritorio_nome||'escritório'} — sem custo de espaço pessoal.
           </div>`
        : `<div class="grid-cards">
             ${ESC_PAT.map(e => {
               const isAt = e.id === escId;
               const btn  = isAt
                 ? `<div class="pc-ativo">✓ Atual</div>`
                 : `<button class="btn btn-sm btn-ghost" onclick="window.escolherEscritorioPat('${e.id}')">Escolher</button>`;
               return `<div class="pat-card${isAt?' ativo':''}">
                 <img class="pc-img" src="${e.img}" alt="${e.l}" loading="lazy">
                 <div class="pat-card-body">
                   <div class="pc-nome">${e.l}</div>
                   ${e.cm > 0
                     ? `<div style="font-size:.65rem;color:var(--txt3)">R$ ${e.cm.toLocaleString('pt-BR')}/mês</div>`
                     : '<div style="font-size:.65rem;color:var(--verde2)">Gratuito</div>'}
                   ${btn}
                 </div>
               </div>`;
             }).join('')}
           </div>`}
    </div>`;
}

async function _carregarEscritorio(escId) {
  try {
    const { doc: fbDoc, getDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const snap = await getDoc(fbDoc(db, 'escritorios', escId));
    const det  = document.getElementById('escritorio-detalhes');
    if (!det || !snap.exists()) return;
    const e = snap.data();
    const NIVEL_LABEL = ['','Autônomo','Individual','Boutique','Regional','Nacional','Full Service','Big Law'];
    det.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-top:.6rem">
        ${_miniStatCard('🏆','Nível',NIVEL_LABEL[e.nivel]||'—','')}
        ${_miniStatCard('⭐','Prestígio',String(e.prestigio||0),'gold')}
        ${_miniStatCard('👥','Sócios',String((e.socios_uids||[]).length),'')}
        ${_miniStatCard('📁','Total casos',String(e.total_casos||0),'')}
        ${_miniStatCard('✅','Ganhos',String(e.casos_ganhos||0),'money')}
        ${_miniStatCard('💰','Faturamento',fmt(e.faturamento_total||0),'money')}
      </div>`;
  } catch (err) { console.error('[UI] Escritório:', err); }
}

// ════════════════════════════════════════════════════════
// ESCRITÓRIO NPC DETALHADO
// ════════════════════════════════════════════════════════
function _renderEscritorioNPC(j, el) {
  // Tentar carregar dados do escritório NPC
  const escId  = j.escritorio_id;
  const escNPC = window.ESCRITORIOS_NPC_DATA ? window.ESCRITORIOS_NPC_DATA.find(e => e.id === escId) : null;
  const TIER_BONUS_DATA = window.TIER_BONUS_DATA || {
    1:{rep_passivo:0,networking_passivo:0,bonus_chance_esp:3,caso_min:1000,caso_max:50000},
    2:{rep_passivo:1,networking_passivo:1,bonus_chance_esp:5,caso_min:20000,caso_max:200000},
    3:{rep_passivo:1,networking_passivo:1,bonus_chance_esp:7,caso_min:80000,caso_max:800000},
    4:{rep_passivo:2,networking_passivo:2,bonus_chance_esp:10,caso_min:300000,caso_max:5000000},
    5:{rep_passivo:3,networking_passivo:3,bonus_chance_esp:12,caso_min:1000000,caso_max:100000000},
  };

  const tier   = j.escritorio_tier || 1;
  const bonus  = TIER_BONUS_DATA[tier] || {};
  const vagaTipo = j.vaga_tipo || 'contencioso';
  const VAGA_LABEL = {
    estagiario_pesquisa:'Estagiário de Pesquisa',
    advogado_peticionante:'Advogado Peticionante',
    advogado_audiencista:'Advogado Audiencista',
    advogado_contencioso:'Advogado Contencioso',
    advogado_consultor:'Advogado Consultor',
    advogado_parecerista:'Advogado Parecerista',
    advogado_palestrante:'Advogado Palestrante',
    socio_associado:'Sócio-Associado',
  };
  const TIER_COR = {1:'#9BAAC4',2:'#4AAB77',3:'#B7791F',4:'#3A5080',5:'#8B1A1A'};
  const fmtV = n => n>=1000000?`R$${(n/1000000).toFixed(0)}M`:n>=1000?`R$${(n/1000).toFixed(0)}k`:`R$${n}`;

  el.innerHTML = `
    ${_escHero(j, null)}

    <div class="secao-header">
      <div class="secao-titulo">🏢 Meu Escritório</div>
      <span class="secao-badge" style="background:${TIER_COR[tier]}20;color:${TIER_COR[tier]}">Tier ${tier}</span>
    </div>

    <div class="card" style="border-left:4px solid ${TIER_COR[tier]};margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
        <div style="font-size:2rem">🏛️</div>
        <div>
          <div style="font-family:var(--font-serif);font-size:1.1rem;font-weight:700;color:var(--navy)">${j.escritorio_nome || '—'}</div>
          <div style="font-size:.72rem;color:var(--txt3)">📍 ${j.escritorio_bairro||'—'} · ${_espLabel2(j.escritorio_esp)} · Tier ${tier}</div>
        </div>
      </div>
      <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.7rem;margin-bottom:.7rem">
        <div style="font-size:.62rem;color:var(--txt4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem">Sua vaga</div>
        <div style="font-weight:700;color:var(--navy);font-size:.9rem">${VAGA_LABEL[vagaTipo]||vagaTipo}</div>
        <div style="font-size:.75rem;color:var(--verde2);font-weight:600;margin-top:.15rem">R$ ${(j.sal_base_escritorio||0).toLocaleString('pt-BR')}/mês</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;margin-bottom:.7rem">
        <div style="text-align:center;padding:.5rem;background:var(--verde-bg);border-radius:var(--r)">
          <div style="font-size:.6rem;color:var(--txt4);text-transform:uppercase">Bônus chance</div>
          <div style="font-weight:700;color:var(--verde2);font-size:.9rem">+${bonus.bonus_chance_esp||0}%</div>
          <div style="font-size:.58rem;color:var(--txt4)">vitória ${_espLabel2(j.escritorio_esp)}</div>
        </div>
        <div style="text-align:center;padding:.5rem;background:var(--navy-light);border-radius:var(--r)">
          <div style="font-size:.6rem;color:var(--txt4);text-transform:uppercase">Bônus passivo</div>
          <div style="font-weight:700;color:var(--navy3);font-size:.9rem">+${bonus.rep_passivo||0} rep</div>
          <div style="font-size:.58rem;color:var(--txt4)">+${bonus.networking_passivo||0} net/mês</div>
        </div>
        <div style="text-align:center;padding:.5rem;background:var(--amber-bg);border-radius:var(--r)">
          <div style="font-size:.6rem;color:var(--txt4);text-transform:uppercase">Faixa de causas</div>
          <div style="font-weight:700;color:var(--amber);font-size:.82rem">${fmtV(bonus.caso_min||0)}</div>
          <div style="font-size:.58rem;color:var(--txt4)">até ${fmtV(bonus.caso_max||0)}</div>
        </div>
      </div>

      <button class="btn btn-ghost btn-sm btn-block" onclick="window.sairEscritorio && window.sairEscritorio()">
        Sair do escritório
      </button>
    </div>

    <div class="secao-header">
      <div class="secao-titulo">📋 Ver outras oportunidades</div>
    </div>
    <div class="card" style="text-align:center;padding:1.2rem;color:var(--txt3)">
      <div style="font-size:.85rem;margin-bottom:.5rem">Quer explorar outras vagas?</div>
      <button class="btn btn-prim" onclick="window.navTo('vagas',null)">Ver Vagas Disponíveis →</button>
    </div>`;
}

function _espLabel2(esp) {
  const MAP = {
    tributario:'Tributário',trabalhista:'Trabalhista',civil:'Civil',
    criminal:'Criminal',empresarial:'Empresarial',constitucional:'Constitucional',
    ambiental:'Ambiental',previdenciario:'Previdenciário',
  };
  return MAP[esp]||esp||'—';
}

// ════════════════════════════════════════════════════════
// ESCRITÓRIO — COMPONENTES DO REDESIGN (Hero / KPIs / Equipe /
// Clientes / Societário / Ações Rápidas)
// ════════════════════════════════════════════════════════

function _escHero(j, esc) {
  const escNome = (esc && esc.nome) || j.escritorio_nome || 'Advocacia Solo';
  const esp     = _espLabel2((esc && (esc.especialidade_principal||esc.especialidade)) || j.escritorio_esp || j.especialidade);
  const tier    = (esc && esc.tier) || j.escritorio_tier || 1;
  const TIER_TAG = {1:'Boutique',2:'Boutique',3:'Regional',4:'Full Service',5:'Big Law'};
  const numSocios = esc ? _normalizarSociosUI(esc).length : 1;
  const totalCasos = (esc && (esc.total_casos || j._processos_count)) || j._processos_count || 0;
  const rep = j.reputacao || 0;
  const cap = (window.REP_CAP||{})[j.cargo_id] || 35;
  const prestigio = esc ? (esc.prestigio||0) : Math.min(100, Math.round(rep/cap*100));
  const local = (esc && esc.bairro_sede) || j.escritorio_bairro || 'Rio de Janeiro';

  return `
  <div class="esc-hero">
    <div class="esc-hero-conteudo">
      <div class="esc-hero-topo">
        <div class="esc-hero-icone">🏛️</div>
        <div>
          <div class="esc-hero-nome">${escNome}</div>
          <div class="esc-hero-sub">${TIER_TAG[tier]||'Boutique'} · ${esp}</div>
        </div>
      </div>
      <div class="esc-hero-meta">
        <span>📍 ${local}</span>
        <span>👥 ${numSocios} sócio${numSocios>1?'s':''}</span>
        <span>⚖️ ${totalCasos} processo${totalCasos===1?'':'s'} ativo${totalCasos===1?'':'s'}</span>
      </div>
      <div class="esc-hero-prestigio">Prestígio ${prestigio}</div>
    </div>
  </div>`;
}

async function _escKpis(esc, j) {
  const caixa    = (esc && esc.caixa) || 0;
  const rendaMes = esc ? (esc.faturamento_mes_atual || 0) : (j.honorarios_mes || 0);

  const TIER_CUSTO_FIXO = { 1:3500, 2:8000, 3:18000, 4:35000, 5:70000 };
  const CARGO_SAL       = { est:1700, ass:2500, jnr:3500, pln:5500, snr:9000, asc:12000, soc:15000 };
  const ESC_PAT_CM      = { home:0, cw:600, sal:3000, esm:7500, esp:18000 };
  const ESC_PAT_L       = { home:'Home Office', cw:'Coworking Jurídico', sal:'Sala Própria', esm:'Escritório Médio', esp:'Escritório Premium' };

  const tier        = esc?.tier || 1;
  const custoFixo   = TIER_CUSTO_FIXO[tier] || 3500;
  const workspaceCm = ESC_PAT_CM[j.pat?.escritorio || 'home'] || 0;
  const wLabel      = ESC_PAT_L[j.pat?.escritorio || 'home'] || 'Home Office';

  let salariosTotais    = 0;
  let listaFuncionarios = [];
  let receitaRecorrente = 0;

  if (esc && esc.id) {
    try {
      const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const { db: fbDb } = await import('./firebase-init.js');

      const fSnap = await getDocs(collection(fbDb, 'escritorios', esc.id, 'funcionarios'));
      fSnap.docs.forEach(d => {
        const f = { id: d.id, ...d.data() };
        if (f.ativo !== false) {
          const sal = CARGO_SAL[f.cargo_id] || 0;
          salariosTotais += sal;
          listaFuncionarios.push({ ...f, sal });
        }
      });

      const clSnap = await getDocs(collection(fbDb, 'escritorios', esc.id, 'clientes'));
      clSnap.docs.forEach(d => {
        const c = d.data();
        if (c.recorrente) receitaRecorrente += c.valor_mensal || 0;
      });
    } catch (e) {
      console.warn('[KPI DESPESAS]', e);
    }
  }

  const despMes   = custoFixo + salariosTotais + workspaceCm;
  const lucroMes  = rendaMes - despMes;
  const socios    = esc ? _normalizarSociosUI(esc) : [{ participacao_pct: 100 }];
  const minhaUid  = j.uid || window.JOGADOR_UID;
  const minhaCota = esc ? (socios.find(s => s.uid === minhaUid)?.participacao_pct ?? 100) : 100;

  window._escBalanceteData = {
    escNome: (esc && esc.nome) || j.escritorio_nome || 'Escritório',
    rendaMes, receitaRecorrente, custoFixo, salariosTotais, workspaceCm,
    workspaceLabel: wLabel, despMes, lucroMes, minhaCota,
    tier, funcionarios: listaFuncionarios, escId: esc?.id,
  };

  const deltaIcon = v => v > 0 ? 'up' : v < 0 ? 'down' : 'flat';

  return `
  <div class="esc-kpis">
    <div class="esc-kpi-card">
      <div class="esc-kpi-label">Receita do mês</div>
      <div class="esc-kpi-valor">${_fmtExt(rendaMes)}</div>
      <div class="esc-kpi-delta flat">honorários recebidos até agora</div>
    </div>
    <div class="esc-kpi-card">
      <div class="esc-kpi-label">Despesas do mês</div>
      <div class="esc-kpi-valor" style="color:var(--verm2)">${_fmtExt(despMes)}</div>
      <div class="esc-kpi-delta flat">folha + custos fixos vigentes</div>
    </div>
    <div class="esc-kpi-card">
      <div class="esc-kpi-label">Lucro líquido</div>
      <div class="esc-kpi-valor" style="color:${lucroMes>=0?'var(--verde2)':'var(--verm2)'}">${_fmtExt(lucroMes)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:.35rem">
        <div class="esc-kpi-delta ${deltaIcon(lucroMes)}">${lucroMes>=0?'Acima das despesas':'Abaixo das despesas'}</div>
        <button class="btn-balancete" onclick="window.navTo('balancete',null)">Ver balancete</button>
      </div>
    </div>
    <div class="esc-kpi-card">
      <div class="esc-kpi-label">Caixa disponível</div>
      <div class="esc-kpi-valor" style="color:${caixa>=0?'var(--navy)':'var(--verm2)'}">${_fmtExt(caixa)}</div>
      <div class="esc-kpi-delta flat">sua cota: ${minhaCota}%</div>
    </div>
  </div>`;
}

function _escEquipeCard() {
  return `
  <div class="esc-card-bloco">
    <div class="secao-header" style="margin-bottom:.8rem">
      <div class="secao-titulo">Equipe do Escritório</div>
      <a href="#" class="esc-ver-todos" onclick="window.navTo('equipe',null);return false">Ver todos</a>
    </div>
    <div id="esc-equipe-embed">
      <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Carregando equipe...</div>
    </div>
  </div>`;
}

function _escClientesCard() {
  return `
  <div class="esc-card-bloco">
    <div class="secao-header" style="margin-bottom:.8rem">
      <div class="secao-titulo">Clientes Corporativos</div>
      <a href="#" class="esc-ver-todos" onclick="window.navTo('clientes',null);return false">Ver todos</a>
    </div>
    <div id="esc-clientes-embed">
      <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Carregando clientes...</div>
    </div>
  </div>`;
}

// Normaliza sócios (mesma lógica de escritorio_financas.js, duplicada aqui
// para uso isolado no componente de hero/KPIs/donut)
function _normalizarSociosUI(esc) {
  const donoFallback = esc.dono_uid || esc.fundador_uid || window.JOGADOR?.uid || window.JOGADOR_UID;
  if (Array.isArray(esc.socios) && esc.socios.length > 0) {
    const primeiroValido = esc.socios[0] && typeof esc.socios[0] === 'object' && esc.socios[0].uid;
    if (primeiroValido) {
      return esc.socios.filter(s => s && typeof s === 'object' && s.uid)
        .map(s => ({ uid: s.uid, participacao_pct: s.participacao_pct || 0 }));
    }
    return esc.socios.map((u,i) => ({ uid: typeof u==='string'?u:donoFallback, participacao_pct: i===0?100:0 }));
  }
  return [{ uid: donoFallback, participacao_pct: 100 }];
}

const _DONUT_CORES = ['#C9A227','#2E4270','#4AAB77','#3A5080','#B7791F','#9A7820'];

function _escSocietarioCard(esc, j) {
  const socios   = esc ? _normalizarSociosUI(esc) : [{ uid: j.uid, participacao_pct: 100 }];
  const minhaUid = j.uid || window.JOGADOR_UID;

  // Construir donut via conic-gradient
  let acc = 0;
  const stops = socios.map((s, i) => {
    const cor = _DONUT_CORES[i % _DONUT_CORES.length];
    const start = acc;
    acc += s.participacao_pct;
    return `${cor} ${start}% ${acc}%`;
  }).join(', ');

  const principal = socios[0]?.participacao_pct || 100;

  return `
  <div class="esc-card-bloco">
    <div class="secao-header" style="margin-bottom:.6rem">
      <div class="secao-titulo">Estrutura Societária</div>
    </div>
    <div class="esc-donut-wrap">
      <div style="position:relative;width:130px;height:130px">
        <div style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${stops || 'var(--navy) 0% 100%'})"></div>
        <div style="position:absolute;inset:18px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:1.2rem;font-weight:700;color:var(--navy);font-family:var(--font-serif)">${principal}%</div>
          <div style="font-size:.58rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em">Participação</div>
        </div>
      </div>
      <div class="esc-donut-legenda">
        ${socios.map((s,i) => `
          <div class="esc-donut-leg-linha">
            <span style="display:flex;align-items:center">
              <span class="esc-donut-leg-cor" style="background:${_DONUT_CORES[i % _DONUT_CORES.length]}"></span>
              <span class="esc-donut-leg-nome">${s.uid===minhaUid ? (j.nome_personagem||'Você') : 'Sócio '+(i+1)}</span>
            </span>
            <span class="esc-donut-leg-pct">${s.participacao_pct}%</span>
          </div>`).join('')}
      </div>
    </div>
    <button class="btn btn-sec btn-sm btn-block" style="margin-top:.6rem" onclick="window.navTo('equipe',null)">
      Ver detalhes
    </button>
  </div>`;
}

function _escAcoesRapidas(j, esc) {
  const temEscritorio = !!(esc);
  const acoes = [
    { icone:'📈', label:'Investir no Escritório', fn:'', habilitado: temEscritorio },
    { icone:'🏛️', label:'Distribuir Pró-Labore',  fn:'', habilitado: temEscritorio },
    { icone:'📊', label:'Expandir Operação',       fn:'', habilitado: temEscritorio },
    { icone:'➕', label:'Contratar Advogado',      fn:"window.navTo('equipe',null)", habilitado: true },
    { icone:'🏢', label:'Abrir Filial',            fn:'', habilitado: false },
    { icone:'🎓', label:'Treinar Equipe',          fn:"window.navTo('habilidades',null)", habilitado: true },
  ];

  if (esc) {
    acoes[0].fn = `window.abrirModalAportarCapital('${esc.id}')`;
    acoes[1].fn = `window.abrirModalDistribuirLucros('${esc.id}')`;
    acoes[2].fn = `window.navTo('escritorio',null)`;
  } else {
    acoes[0].fn = "window.criarEscritorio && window.criarEscritorio()";
    acoes[0].label = 'Criar Escritório';
    acoes[0].habilitado = true;
  }

  return `
  <div class="esc-card-bloco">
    <div class="secao-header" style="margin-bottom:.8rem">
      <div class="secao-titulo">Ações Rápidas</div>
    </div>
    <div class="esc-acoes-grid">
      ${acoes.map(a => `
        <button class="esc-acao-btn" ${a.habilitado ? `onclick="${a.fn}"` : 'disabled title="Em breve"'}>
          <span class="esc-acao-icone">${a.icone}</span>
          <span>${a.label}</span>
        </button>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
// EQUIPE
// ════════════════════════════════════════════════════════
function renderEquipe(j, el) {
  const estagiarios = j.estagiarios || [];
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">👔 Equipe</div>
      <span class="secao-badge">${estagiarios.length} membro(s)</span>
      ${j.ci >= 3 ? `<button class="btn btn-sm btn-sec secao-acao" onclick="window.abrirContratacao && window.abrirContratacao()">+ Contratar</button>` : ''}
    </div>
    ${!j.oab ? `<div class="card" style="color:var(--ardosia2);font-size:.8rem">🔒 Disponível a partir de Advogado Júnior.</div>` :
    estagiarios.length === 0 ? `<div class="card" style="color:var(--ardosia2);font-size:.8rem;text-align:center;padding:1.5rem">Nenhum membro na equipe. Contrate estagiários ou assistentes.</div>` :
    estagiarios.map((e,i) => `
      <div class="card" style="display:flex;align-items:center;gap:.85rem">
        <div style="font-size:1.8rem;flex-shrink:0">${e.av||'👔'}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem;color:var(--perg)">${e.nome}</div>
          <div style="font-size:.72rem;color:var(--ardosia2)">${e.fac||'—'} · <span style="color:var(--ouro2)">${_skLabel(e.sk_dest)}</span></div>
          <div style="font-size:.68rem;color:#ffa726;margin-top:.2rem">Salário: ${fmt(e.sal||1700)}/mês</div>
          <div style="height:3px;background:rgba(255,255,255,.07);border-radius:1px;overflow:hidden;margin-top:.35rem;width:120px">
            <div style="height:100%;width:${e.desemp||60}%;background:var(--ouro2)"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.3rem">
          <button class="btn btn-sm btn-ghost" onclick="window.delegarEstagiario && window.delegarEstagiario(${i})">Delegar</button>
          <button class="btn btn-sm btn-danger" onclick="window.dispensarEstagiario && window.dispensarEstagiario(${i})">Dispensar</button>
        </div>
      </div>`).join('')}`;
}

// ════════════════════════════════════════════════════════
// PROGRESSÃO
// ════════════════════════════════════════════════════════
function renderProgressao(j, el) {
  if (window.renderCarreiraProgressao) {
    window.renderCarreiraProgressao(j, el);
  } else {
    el.innerHTML = `<div class="card" style="color:var(--ardosia2)">Carregando progressão...</div>`;
  }
}

// ════════════════════════════════════════════════════════
// HABILIDADES
// ════════════════════════════════════════════════════════
function renderHabilidades(j, el) {
  const cap     = window.REP_CAP[j.cargo_id] || 55;
  const skills  = j.skills || {};
  const queue   = j.study_queue || [];
  const SKDEF   = _getSkills();
  const vaga    = j.vaga_tipo || 'contencioso';
  const TIPO_SK = {
    contencioso:  ['oratoria','argumentacao','persuasao','pesquisa'],
    peticionante: ['escrita','argumentacao','pesquisa','negociacao'],
    consultivo:   ['escrita','negociacao','pesquisa','gestao'],
    societario:   ['negociacao','networking','gestao','argumentacao'],
  };
  const prioridades = TIPO_SK[vaga] || TIPO_SK.contencioso;

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">⚡ Habilidades</div>
      <span class="secao-badge">Cap: ${cap} · Vaga: ${_vagaLabel(vaga)}</span>
    </div>
    <div style="font-size:.73rem;color:var(--ardosia2);margin-bottom:1rem">
      Skills marcadas com ⭐ são prioritárias para sua vaga atual. Estudar custa R$400 e demora 1 mês.
    </div>
    <div class="skills-grid">
      ${SKDEF.map(sk => {
        const val     = skills[sk.k] || 0;
        const isPrior = prioridades.includes(sk.k);
        const emEst   = queue.some(q => q.skill === sk.k);
        const pct     = Math.round(val/cap*100);
        return `
        <div class="skill-banner-card" style="background-image:url('img/habilidades/${sk.k}.png');${isPrior?'box-shadow:0 0 0 2px var(--ouro2), var(--sombra2);':''}">
          ${isPrior ? `<span class="skill-banner-estrela">⭐</span>` : ''}
          <div class="skill-banner-rodape">
            <div style="display:flex;justify-content:flex-end;align-items:baseline;margin-bottom:.3rem">
              <span class="skill-banner-val">${val}<span class="skill-banner-val-cap">/${cap}</span></span>
            </div>
            <div class="skill-bar" style="margin-bottom:.5rem">
              <div class="skill-fill ${isPrior?'destaque':''}" style="width:${pct}%"></div>
            </div>
            ${emEst
              ? `<div class="skill-banner-pendente">⏳ Estudo em andamento — resultado no próximo mês</div>`
              : `<button class="skill-banner-btn" onclick="window.estudarSkill && window.estudarSkill('${sk.k}','${sk.l}')">
                  📖 Estudar +3 · R$400 · 1 mês
                </button>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ════════════════════════════════════════════════════════
// CURSOS
// ════════════════════════════════════════════════════════
function renderCursos(j, el) {
  if (window.renderCursosPanel) {
    window.renderCursosPanel(j, el);
  } else {
    el.innerHTML = `<div class="card" style="color:var(--ardosia2)">Carregando cursos...</div>`;
  }
}

// ════════════════════════════════════════════════════════
// CONCURSO PÚBLICO
// ════════════════════════════════════════════════════════
function renderConcurso(j, el) {
  if (window.renderConcursoPanel) {
    window.renderConcursoPanel(j, el);
  } else {
    el.innerHTML = `<div class="card" style="color:var(--ardosia2)">Carregando concurso...</div>`;
  }
}

// ════════════════════════════════════════════════════════
// VIDA PESSOAL
// ════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════
// INBOX
// ════════════════════════════════════════════════════════
function renderInbox(j, el) {
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">📬 Mensagens</div>
      <button class="btn btn-sm btn-ghost" onclick="marcarTodasLidas('${j.uid}')">Marcar todas como lidas</button>
    </div>
    <div id="inbox-lista"><div style="font-size:.78rem;color:var(--ardosia)">Carregando...</div></div>`;

  _carregarInbox(j.uid);
}

async function _carregarInbox(uid) {
  try {
    const q    = query(
      collection(db, 'jogadores', uid, 'inbox'),
      orderBy('criado_em', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    const lista = document.getElementById('inbox-lista');
    if (!lista) return;

    if (snap.empty) {
      lista.innerHTML = '<div style="font-size:.78rem;color:var(--ardosia)">Nenhuma mensagem.</div>';
      return;
    }

    lista.innerHTML = snap.docs.map(d => {
      const m    = d.data();
      const naoL = !m.lida;
      return `<div class="msg-item ${naoL?'nao-lida':''}" onclick="lerMsg('${uid}','${d.id}',this)">
        <div class="msg-assunto">${naoL?'🔵 ':''}${m.assunto||'—'}</div>
        <div class="msg-corpo">${(m.corpo||'').slice(0,150)}${(m.corpo||'').length>150?'…':''}</div>
        <div class="msg-data">${_formatarData(m.criado_em)}</div>
      </div>`;
    }).join('');
  } catch (err) { console.error('[UI] Inbox:', err); }
}

window.lerMsg = async function(uid, msgId, el) {
  try {
    await updateDoc(doc(db, 'jogadores', uid, 'inbox', msgId), { lida: true });
    el.classList.remove('nao-lida');
    const assunto = el.querySelector('.msg-assunto');
    if (assunto) assunto.textContent = assunto.textContent.replace('🔵 ','');
  } catch (_) {}
};

window.marcarTodasLidas = async function(uid) {
  try {
    const q    = query(collection(db, 'jogadores', uid, 'inbox'), where('lida','==',false));
    const snap = await getDocs(q);
    const { writeBatch } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { lida: true }));
    await batch.commit();
    renderInbox(window.JOGADOR, document.getElementById('main-content'));
    toast('✅ Todas as mensagens marcadas como lidas.', 'ok');
  } catch (err) { toast('Erro ao marcar mensagens.', 'ko'); }
};

// ════════════════════════════════════════════════════════
// MODAL DE RECESSO
// ════════════════════════════════════════════════════════
function _mostrarModalRecesso(j) {
  const s    = window.SERVER || {};
  const custo = 2000 + Math.max(0, (j.reputacao||30) - 20) * 80;

  abrirModal(
    `🏖️ Recesso Judiciário — Janeiro, Ano ${s.ano_jogo||1}`,
    `<p style="font-size:.8rem;color:var(--ardosia2);margin-bottom:1rem">
      Os tribunais estão de recesso. Nenhum processo tramita em janeiro.<br>
      Escolha como aproveitar o mês:
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
      <div onclick="window.recessoEscolha('viajar')" style="background:rgba(74,122,58,.1);border:1px solid rgba(74,122,58,.3);border-radius:2px;padding:.9rem;text-align:center;cursor:pointer">
        <div style="font-size:1.6rem">✈️</div>
        <div style="font-weight:600;font-size:.85rem;color:var(--perg);margin:.2rem 0">Viajar</div>
        <div style="font-size:.7rem;color:var(--ardosia2)">Custo: ${fmt(custo)}<br>+5 rep · +8 Networking</div>
      </div>
      <div onclick="window.recessoEscolha('estudar')" style="background:rgba(30,64,128,.12);border:1px solid rgba(30,64,128,.3);border-radius:2px;padding:.9rem;text-align:center;cursor:pointer">
        <div style="font-size:1.6rem">📚</div>
        <div style="font-weight:600;font-size:.85rem;color:var(--perg);margin:.2rem 0">Curso intensivo</div>
        <div style="font-size:.7rem;color:var(--ardosia2)">Custo: R$3.000<br>+5 em skill imediato</div>
      </div>
      <div onclick="window.recessoEscolha('descansar')" style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.9rem;text-align:center;cursor:pointer">
        <div style="font-size:1.6rem">🛋️</div>
        <div style="font-weight:600;font-size:.85rem;color:var(--perg);margin:.2rem 0">Descansar</div>
        <div style="font-size:.7rem;color:var(--ardosia2)">Gratuito<br>+5 Saúde Mental</div>
      </div>
      <div onclick="window.recessoEscolha('networking')" style="background:rgba(184,146,42,.06);border:var(--borda);border-radius:2px;padding:.9rem;text-align:center;cursor:pointer">
        <div style="font-size:1.6rem">🍷</div>
        <div style="font-weight:600;font-size:.85rem;color:var(--perg);margin:.2rem 0">Networking</div>
        <div style="font-size:.7rem;color:var(--ardosia2)">Custo: R$1.500<br>+3 rep · +10 Networking</div>
      </div>
    </div>`
  );
}

window.recessoEscolha = async function(opcao) {
  const j   = window.JOGADOR;
  if (!j)   return;
  const uid = j.uid || window.JOGADOR_UID;
  const s   = window.SERVER || {};
  const updates = { recesso_pendente: false };
  const custo = 2000 + Math.max(0, (j.reputacao||30) - 20) * 80;

  let msg = '';
  switch (opcao) {
    case 'viajar':
      if ((j.dinheiro||0) < custo) { toast('Saldo insuficiente para a viagem.','ko'); return; }
      updates.dinheiro   = (j.dinheiro||0) - custo;
      updates.reputacao  = Math.min(100, (j.reputacao||30) + 5);
      updates['skills.networking'] = Math.min(100, (j.skills?.networking||10) + 8);
      msg = `✈️ Férias aproveitadas! +5 rep · +8 Networking · -${fmt(custo)}`;
      break;
    case 'estudar':
      if ((j.dinheiro||0) < 3000) { toast('Saldo insuficiente.','ko'); return; }
      fecharModal();
      _mostrarEscolhaSkillRecesso(uid, j);
      return;
    case 'descansar':
      updates.saude_mental = Math.min(100, (j.saude_mental||80) + 5);
      updates.disposicao   = Math.min(100, (j.disposicao||80) + 5);
      msg = '🛋️ Descansado e renovado! +5 Saúde Mental';
      break;
    case 'networking':
      if ((j.dinheiro||0) < 1500) { toast('Saldo insuficiente.','ko'); return; }
      updates.dinheiro  = (j.dinheiro||0) - 1500;
      updates.reputacao = Math.min(100, (j.reputacao||30) + 3);
      updates['skills.networking'] = Math.min(100, (j.skills?.networking||10) + 10);
      msg = '🍷 Ótimo networking! +3 rep · +10 Networking';
      break;
  }

  try {
    await updateDoc(doc(db, 'jogadores', uid), updates);
    fecharModal();
    toast(msg, 'ok');
  } catch (err) {
    toast('Erro ao registrar atividade.', 'ko');
    console.error(err);
  }
};

function _mostrarEscolhaSkillRecesso(uid, j) {
  const skills = _getSkills();
  abrirModal(
    '📚 Curso Intensivo — Escolha a skill',
    `<div style="display:flex;flex-direction:column;gap:.4rem">
      ${skills.map(sk => {
        const val = (j.skills||{})[sk.k] || 0;
        return `<button class="btn btn-ghost btn-block" onclick="window.fazerCursoRecesso('${uid}','${sk.k}','${sk.l}')">
          ${sk.l} — atual: ${val}/100 → +5
        </button>`;
      }).join('')}
    </div>`
  );
}

window.fazerCursoRecesso = async function(uid, sk, skLabel) {
  const j = window.JOGADOR;
  if ((j?.dinheiro||0) < 3000) { toast('Saldo insuficiente.','ko'); return; }
  try {
    const cap = window.REP_CAP[j.cargo_id] || 55;
    const nova = Math.min(cap, ((j.skills||{})[sk]||0) + 5);
    await updateDoc(doc(db, 'jogadores', uid), {
      dinheiro:          (j.dinheiro||0) - 3000,
      [`skills.${sk}`]:  nova,
      recesso_pendente:  false,
    });
    fecharModal();
    toast(`📚 +5 em ${skLabel}!`, 'ok');
  } catch (err) { toast('Erro.','ko'); }
};

// ════════════════════════════════════════════════════════
// HELPERS UI
// ════════════════════════════════════════════════════════
function _fmtExt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return 'R$ ' + (n/1000000).toFixed(2).replace('.',',') + 'M';
  return 'R$ ' + Number(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function _miniStatCard(icon, label, val, tipo) {
  const cor = tipo==='money'?'var(--verde2)':tipo==='gold'?'var(--ouro2)':tipo==='danger'?'var(--verm2)':'var(--navy)';
  return `<div class="stat-mini">
    <div class="v" style="color:${cor}">${val}</div>
    <div class="l">${icon} ${label}</div>
  </div>`;
}

function _miniStatCardRep(icon, label, rep, cap) {
  const pct    = Math.min(100, Math.round(rep/cap*100));
  const cor    = pct>=80?'var(--verde2)':pct>=50?'var(--ouro2)':pct>=25?'var(--navy3)':'var(--txt4)';
  const tier   = pct>=90?'👑 Elite':pct>=70?'⭐ Destaque':pct>=40?'📈 Crescendo':'🌱 Iniciante';
  return `<div class="stat-mini" style="position:relative;overflow:hidden">
    <div class="v" style="color:${cor}">${rep}<span style="font-size:.6rem;color:var(--txt4)">/${cap}</span></div>
    <div class="l">${icon} ${label}</div>
    <div style="margin-top:.3rem;height:4px;background:var(--bg2);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${cor};border-radius:2px;transition:width .5s"></div>
    </div>
    <div style="font-size:.55rem;color:var(--txt4);margin-top:.15rem;text-align:center">${tier}</div>
  </div>`;
}

function _attrRow(icon, label, val, cor) {
  const corMap = { azul:'var(--azul2)',ouro:'var(--ouro2)',verde:'var(--verde2)',roxo:'#7A5A9A' };
  return `<div class="attr-row">
    <div class="attr-icon">${icon}</div>
    <div class="attr-info">
      <div class="attr-label">${label} <span>${val}/100</span></div>
      <div class="attr-bar">
        <div class="attr-fill ${cor}" style="width:${val}%;background:${corMap[cor]||'var(--ouro2)'}"></div>
      </div>
    </div>
  </div>`;
}

function _getSkills() {
  return [
    {k:'oratoria',    l:'Oratória',             desc:'Sustentação oral e tribunais.'},
    {k:'argumentacao',l:'Argumentação',          desc:'Construção de teses jurídicas.'},
    {k:'escrita',     l:'Escrita Jurídica',      desc:'Peças, pareceres e contratos.'},
    {k:'pesquisa',    l:'Legislação & Pesquisa', desc:'Domínio da lei e jurisprudência.'},
    {k:'negociacao',  l:'Negociação',            desc:'Acordos, mediação e clientes.'},
    {k:'persuasao',   l:'Persuasão',             desc:'Convencer juízes e árbitros.'},
    {k:'gestao',      l:'Gestão & Liderança',    desc:'Equipe, escritório e prazos.'},
    {k:'networking',  l:'Networking',            desc:'Relacionamento com o mercado.'},
  ];
}

function _skLabel(k) {
  return _getSkills().find(s=>s.k===k)?.l || k;
}

function _espLabel(esp) {
  const MAP = {
    tributario:'Tributário', trabalhista:'Trabalhista', civil:'Civil',
    criminal:'Criminal', empresarial:'Empresarial', constitucional:'Constitucional',
    ambiental:'Ambiental', previdenciario:'Previdenciário',
  };
  return MAP[esp] || esp || '—';
}

function _vagaLabel(v) {
  const MAP = {
    contencioso:'Contencioso', peticionante:'Peticionante',
    consultivo:'Consultivo', societario:'Societário',
  };
  return MAP[v] || v || '—';
}

// ════════════════════════════════════════════════════════
// CRIAR ESCRITÓRIO PRÓPRIO
// ════════════════════════════════════════════════════════
window.criarEscritorio = async function() {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  if (!j) return;

  // Verificar requisitos
  const CARGO_OK = ['jnr','pln','snr','asc','soc','snm'];
  if (!j.oab) {
    toast('❌ Você precisa ter a OAB aprovada.', 'ko');
    return;
  }
  if (!CARGO_OK.includes(j.cargo_id)) {
    toast('❌ Requer Advogado Júnior ou superior.', 'ko');
    return;
  }
  if ((j.dinheiro || 0) < 15000) {
    toast('❌ Capital mínimo: R$ 15.000 para abrir o escritório.', 'ko');
    return;
  }
  const cap = (window.REP_CAP || {})[j.cargo_id] || 45;
  if ((j.reputacao || 0) < Math.floor(cap * 0.55)) {
    toast(`❌ Reputação mínima: ${Math.floor(cap*0.55)}/${cap} (55% do cap do cargo).`, 'ko');
    return;
  }
  if ((j.anos_carreira || 0) < 1) {
    toast('❌ Requer pelo menos 1 ano de carreira.', 'ko');
    return;
  }

  abrirModal('🏛️ Criar Escritório Próprio',
    `<div style="margin-bottom:1rem;font-size:.82rem;color:var(--txt2);line-height:1.7">
      Você está prestes a abrir seu próprio escritório de advocacia.<br>
      Como advogado solo, você recebe <b>30% do valor da causa + sucumbência</b> por instância.
    </div>
    <div class="campo">
      <label>Nome do escritório</label>
      <input type="text" id="esc-nome-input" placeholder="Ex: Cavalcante Advogados" maxlength="60"
        value="${j.nome_personagem ? j.nome_personagem + ' Advogados' : ''}">
    </div>
    <div class="campo">
      <label>Especialização principal</label>
      <select id="esc-esp-input">
        <option value="tributario">Tributário</option>
        <option value="trabalhista">Trabalhista</option>
        <option value="civil">Civil</option>
        <option value="criminal">Criminal</option>
        <option value="empresarial">Empresarial</option>
        <option value="previdenciario">Previdenciário</option>
      </select>
    </div>
    <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.7rem;font-size:.75rem;color:var(--txt3);line-height:1.8;margin-bottom:.8rem">
      💰 Capital inicial: <b style="color:var(--verm2)">-R$ 15.000</b><br>
      🏢 Custo fixo Tier 1: <b style="color:var(--verm2)">-R$ 3.500/mês</b><br>
      📍 Bairro: Centro (pode mudar depois)<br>
      👥 Capacidade: 1 estagiário + 1 assistente<br>
      ⚖️ Honorários: 30% + sucumbência total
    </div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._confirmarCriarEscritorio()">Abrir escritório →</button>
    </div>`
  );

  // Pré-selecionar especialização do jogador
  setTimeout(() => {
    const sel = document.getElementById('esc-esp-input');
    if (sel && j.especialidade) sel.value = j.especialidade;
  }, 100);
};

window._confirmarCriarEscritorio = async function() {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const nome = document.getElementById('esc-nome-input')?.value?.trim();
  const esp  = document.getElementById('esc-esp-input')?.value;

  if (!nome || nome.length < 3) {
    toast('Digite um nome para o escritório (mínimo 3 caracteres).', 'ko');
    return;
  }

  const escId = 'esc_' + uid + '_' + Date.now();

  try {
    const { doc, setDoc, updateDoc, collection } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db } = await import('./firebase-init.js');

    // Criar documento do escritório
    await setDoc(doc(db, 'escritorios', escId), {
      id:            escId,
      nome,
      especialidade: esp,
      dono_uid:      uid,
      dono_nome:     j.nome_personagem || 'Advogado',
      tier:          1,
      bairro:        'Centro',
      zona:          'centro',
      prestigio:     10,
      socios:        [uid],
      socios_uids:   [uid],
      socios:        [{ uid, participacao_pct: 100, cargo: j.cargo_id }], // formato padrão usado pelas Cloud Functions
      caixa:         0,              // caixa do escritório, SEPARADO do dinheiro pessoal
      meses_sem_pagar_salario: 0,
      funcionarios:  [],
      criado_mes:    j.mes_pessoal || 0,
      criado_ano:    j.ano_pessoal || 1,
      status:        'ativo',
    });

    // Atualizar jogador
    await updateDoc(doc(db, 'jogadores', uid), {
      escritorio_proprio_id:   escId,
      escritorio_id:           escId,
      escritorio_nome:         nome,
      escritorio_empregado_id: null,
      escritorio_tier:         1,
      escritorio_esp:          esp,
      escritorio_bairro:       'Centro',
      dinheiro:                (j.dinheiro || 0) - 15000,
    });

    fecharModal();
    toast(`🏛️ ${nome} aberto! Capital inicial investido: R$ 15.000`, 'ok', 5000);

    // Recarregar painel
    setTimeout(() => window.navTo && window.navTo('escritorio', null), 800);

  } catch (err) {
    console.error('[CRIAR ESCRITÓRIO]', err);
    toast('Erro ao criar escritório: ' + (err.message || 'tente novamente'), 'ko');
  }
};

function _formatarData(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch (_) { return iso; }
}

// Retorna o mês do jogo do jogador no formato "Março, Ano 2"
function _calJogador(j) {
  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  if (j && j.mes_pessoal !== undefined && j.ano_pessoal !== undefined) {
    return MESES_PT[j.mes_pessoal] + ', Ano ' + j.ano_pessoal;
  }
  const s = window.SERVER || {};
  return (s.mes_nome || 'Janeiro') + ', Ano ' + (s.ano_jogo || 1);
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
