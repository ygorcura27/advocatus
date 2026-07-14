/**
 * UI-MAIN — Advocatus Online
 * Renderiza todos os painéis da área central.
 * Ouve eventos de navegação e de atualização do gamestate.
 */

import { collection, query, where, orderBy, limit,
         getDocs, getDoc, doc, updateDoc, addDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';
import { icon } from './icons.js';
import { renderAvatarJogador } from './avatar_svg.js';
import { ehDoPersonagemAtivo } from './personagens.js';

// ── Painel ativo ──
let _painelAtivo = 'perfil';

// ════════════════════════════════════════════════════════
// ÍCONES ESTÁTICOS DO CHROME (bottom nav + barra de energia mobile)
// Rodam uma vez no load — substituem os emojis crus por SVG (icons.js)
// ════════════════════════════════════════════════════════
(function _renderIconesBottomNav() {
  const injetarNav = (id, nome) => {
    const el = document.querySelector(`#${id} .bnav-icon`);
    if (el) el.innerHTML = icon(nome);
  };
  injetarNav('bn-perfil',       'perfil');
  injetarNav('bn-escritorio',   'escritorio');
  injetarNav('bn-vagas',        'vagas');
  injetarNav('bn-habilidades',  'habilidades');
  injetarNav('bn-mais',         'menu');

  const bemLabel = document.getElementById('bem-mobile-label');
  if (bemLabel) bemLabel.innerHTML = `<span class="ni-icon">${icon('habilidades')}</span>Energia`;
})();

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

// Menu lateral fixo (fallback) — cobre toda navegação que ainda não tem
// menu contextual próprio (Petições, Habilidades, Cursos, Concurso,
// Financeiro, Loja, Vida Pessoal, Vagas, Rankings, Mensagens).
// Sub-páginas do Escritório sem view própria no mockup (navegadas por
// dentro da tela de Escritório, não têm item de sidebar próprio) — o
// item "Escritório" continua marcado ativo enquanto o jogador está nelas.
const ESC_SUBPAINEIS = new Set(['processos','balancete','equipe','clientes','repertorio','midia_convites','marketing','assembleia','contratacao','treinamento','beneficios']);

function _navLateralPadrao(painel) {
  const ativo = (id) => (id === painel || (id === 'escritorio' && ESC_SUBPAINEIS.has(painel))) ? ' ativo' : '';
  // "Meu Perfil" ganha um grupo extra de atalhos para a própria página —
  // mas usa o MESMO menu de navegação de todo o resto do app abaixo dele,
  // em vez de um menu duplicado e divergente (era a causa do bug de
  // ícones coloridos/inconsistentes e do link de Investigação sumindo
  // só na tela de Perfil).
  const grupoNestaPagina = painel === 'perfil' ? `
    <div class="nav-grupo">
      <div class="nav-grupo-titulo">Nesta página</div>
      <div class="nav-item" onclick="window.scrollTo({top:0,behavior:'smooth'})"><span class="ni-icon">${icon('perfil')}</span> Visão Geral</div>
      <div class="nav-item" onclick="document.getElementById('perfil-atributos-secao')?.scrollIntoView({behavior:'smooth'})"><span class="ni-icon">${icon('progressao')}</span> Atributos</div>
      <div class="nav-item" onclick="document.getElementById('perfil-atividade-secao')?.scrollIntoView({behavior:'smooth'})"><span class="ni-icon">${icon('inbox')}</span> Atividade Recente</div>
    </div>` : '';
  return `
    ${grupoNestaPagina}
    <div class="nav-grupo">
      <div class="nav-grupo-titulo">Carreira</div>
      <div class="nav-item${ativo('perfil')}" onclick="navTo('perfil',this)"><span class="ni-icon">${icon('perfil')}</span> Meu Perfil</div>
      <div class="nav-item${ativo('foco')}" onclick="navTo('foco',this)"><span class="ni-icon">${icon('oportunidades')}</span> Foco</div>
      <div class="nav-item${ativo('escritorio')}" onclick="navTo('escritorio',this)"><span class="ni-icon">${icon('escritorio')}</span> Escritório</div>
      <div class="nav-item${ativo('investigacao')}" onclick="navTo('investigacao',this)"><span class="ni-icon">${icon('investigacao')}</span> Investigação</div>
      <div class="nav-item${ativo('progressao')}" onclick="navTo('progressao',this)"><span class="ni-icon">${icon('progressao')}</span> Progressão</div>
    </div>
    <div class="nav-grupo">
      <div class="nav-grupo-titulo">Desenvolvimento</div>
      <div class="nav-item${ativo('peticoes')}" onclick="navTo('peticoes',this)"><span class="ni-icon">${icon('peticoes')}</span> Petições</div>
      <div class="nav-item${ativo('habilidades')}" onclick="navTo('habilidades',this)"><span class="ni-icon">${icon('habilidades')}</span> Habilidades</div>
      <div class="nav-item${ativo('cursos')}" onclick="navTo('cursos',this)"><span class="ni-icon">${icon('cursos')}</span> Cursos</div>
      <div class="nav-item${ativo('posgraduacao')}" onclick="navTo('posgraduacao',this)"><span class="ni-icon">${icon('posgraduacao')||'🎓'}</span> Pós-Graduação</div>
      <div class="nav-item${ativo('artigos_livros')}" onclick="navTo('artigos_livros',this)"><span class="ni-icon">${icon('artigos_livros')||'📚'}</span> Artigos & Livros</div>
      <div class="nav-item${ativo('sistemas_sociais')}" onclick="navTo('sistemas_sociais',this)"><span class="ni-icon">${icon('sistemas_sociais')||'🌐'}</span> Sistemas Sociais</div>
      <div class="nav-item${ativo('imprensa')}" onclick="navTo('imprensa',this)"><span class="ni-icon">${icon('imprensa')||'📰'}</span> Imprensa</div>
      <div class="nav-item${ativo('concurso')}" onclick="navTo('concurso',this)"><span class="ni-icon">${icon('concurso')}</span> Concurso Público</div>
    </div>
    <div class="nav-grupo">
      <div class="nav-grupo-titulo">Vida</div>
      <div class="nav-item${ativo('patrimonio')}" onclick="navTo('patrimonio',this)"><span class="ni-icon">${icon('patrimonio')}</span> Patrimônio</div>
      <div class="nav-item${ativo('financeiro')}" onclick="navTo('financeiro',this)"><span class="ni-icon">${icon('financeiro')}</span> Investimentos & Financeiro</div>
      <div class="nav-item${ativo('loja')}" onclick="navTo('loja',this)"><span class="ni-icon">${icon('loja')}</span> Loja</div>
      <div class="nav-item${ativo('vida_pessoal')}" onclick="navTo('vida_pessoal',this)"><span class="ni-icon">${icon('vida_pessoal')}</span> Vida Pessoal</div>
    </div>
    <div class="nav-grupo">
      <div class="nav-grupo-titulo">Social</div>
      <div class="nav-item${ativo('redes')}" onclick="navTo('redes',this)"><span class="ni-icon">${icon('redes')||'📱'}</span> Redes Sociais</div>
      <div class="nav-item${ativo('vagas')}" onclick="navTo('vagas',this)"><span class="ni-icon">${icon('vagas')}</span> Vagas</div>
      <div class="nav-item${ativo('ranking')}" onclick="navTo('ranking',this)"><span class="ni-icon">${icon('ranking')}</span> Rankings</div>
      <div class="nav-item${ativo('inbox')}" onclick="navTo('inbox',this)">
        <span class="ni-icon">${icon('inbox')}</span> Mensagens
        <span class="ni-badge" id="badge-inbox-nav" style="display:none">0</span>
      </div>
    </div>`;
}

function _renderSidebarLateral(painel) {
  const nav = document.getElementById('nav-lateral-dynamic');
  if (!nav) return;

  // Sidebar único e estático pra tudo, igual mockup (.impeccable/preview/
  // dossie-v1.html: .nav-rail nunca troca de conteúdo por página — Escritório,
  // Patrimônio etc. são navegados por dentro da própria tela, via âncora/
  // botão, não por um sub-menu lateral próprio).
  {
    nav.innerHTML = _navLateralPadrao(painel);
  }
}

function _renderizar() {
  const j = window.JOGADOR;
  if (!j) return;

  const main = document.getElementById('main-content');
  if (!main) return;

  _renderSidebarLateral(_painelAtivo);

  switch (_painelAtivo) {
    case 'perfil':       renderPerfil(j, main);       break;
    case 'processos':    window.renderGestaoProcessos(j, main); break;
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
    case 'peticoes':
      if (window.renderPeticoes) window.renderPeticoes(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--ardosia2)">Carregando petições...</div>';
      break;
    case 'repertorio':
      if (window.renderRepertorioEscritorio) window.renderRepertorioEscritorio(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--ardosia2)">Carregando repertório...</div>';
      break;
    case 'midia_convites':
      if (window.renderConvitesMidia) window.renderConvitesMidia(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--ardosia2)">Carregando convites de mídia...</div>';
      break;
    case 'investigacao':
      if (window.renderInvestigacao) window.renderInvestigacao(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando investigação...</div>';
      break;
    case 'foco':          renderFoco(j, main);          break;
    case 'redes':         renderRedes(j, main);         break;
    case 'assembleia':    window.renderAssembleiaSocios(j, main); break;
    case 'marketing':     renderMarketing(j, main);     break;
    case 'posgraduacao':  window.renderPosGraduacao(j, main); break;
    case 'artigos_livros': window.renderArtigosLivros(j, main); break;
    case 'sistemas_sociais': window.renderSistemasSociais(j, main); break;
    case 'imprensa':      window.renderImprensa(j, main); break;
    case 'contratacao':   window.renderContratacao(j, main); break;
    case 'treinamento':   window.renderTreinamento(j, main); break;
    case 'beneficios':    window.renderBeneficios(j, main);  break;
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
    case 'financeiro':
      if (window.renderFinanceiroAvancado) window.renderFinanceiroAvancado(j, main);
      else main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando finanças...</div>';
      break;
    default:             renderPerfil(j, main);
  }

  // Verificar recesso pendente
  if (j.recesso_pendente) _mostrarModalRecesso(j);
}

// ════════════════════════════════════════════════════════
// PERFIL
// ════════════════════════════════════════════════════════
// Painel "Nível de Carreira" — igual mockup (.impeccable/preview/dossie-v1.html
// data-view-content="perfil"): cargo atual + barra até a próxima promoção,
// embutido direto no Perfil (não só na tela separada de Progressão).
// Usa a trilha exposta por carreira.js (window.CARREIRA_CARGOS) — só cobre a
// trilha de advocacia, mesma limitação que renderCarreiraProgressao já tinha.
function _painelNivelCarreira(j, cap, repPct) {
  const CARGOS   = window.CARREIRA_CARGOS;
  const CARGO_IDX = window.CARREIRA_CARGO_IDX;
  if (!CARGOS || !CARGO_IDX) return '';
  const idx     = CARGO_IDX[j.cargo_id] ?? 0;
  const cargo   = CARGOS[idx];
  const proximo = CARGOS[idx+1];
  if (!cargo) return '';
  return `
    <section class="painel" style="padding:1.2rem 1.3rem;margin-bottom:1.2rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.9rem">
        <div class="carreira-icone">⚖️</div>
        <div style="flex:1;min-width:180px">
          <div class="capa-kicker" style="margin-bottom:.2rem">NÍVEL DE CARREIRA</div>
          <div style="font-family:var(--font-serif);font-size:1.15rem;font-weight:600;color:var(--txt)">${cargo.l}</div>
        </div>
        ${proximo ? `
        <div style="text-align:right">
          <div style="font-size:.7rem;color:var(--txt4)">Próxima promoção</div>
          <div style="font-size:.82rem;color:var(--ouro2);font-weight:600">${proximo.l}</div>
        </div>` : ''}
      </div>
      <div class="membro-prod-bar" style="height:6px"><div class="membro-prod-fill" style="width:${repPct}%;background:var(--ouro)"></div></div>
      <div style="font-family:var(--font-mono);font-size:.68rem;color:var(--txt4);margin-top:.4rem">${j.reputacao||0} / ${cap} reputação no cargo atual</div>
    </section>`;
}

function renderPerfil(j, el) {
  const cap    = window.REP_CAP[j.cargo_id] || 55;
  const label  = window.CARGO_LABEL[j.cargo_id] || j.cargo_id;
  const total  = (j.wins||0) + (j.losses||0);
  const aprov  = total > 0 ? Math.round((j.wins||0)/total*100) : 0;
  const esp    = _espLabel(j.especialidade);
  const escNome = j.escritorio_nome || 'Advocacia Solo';
  const s = window.SERVER || {};

  const fotoUrl = window.USER_PHOTO_URL || '';
  const fotoHtml = fotoUrl
    ? `<img src="${fotoUrl}" class="profile-photo" alt="${j.nome_personagem||'Perfil'}" style="object-fit:cover;border-radius:50%;width:80px;height:80px;border:2px solid var(--ouro)">`
    : `<div class="profile-photo" style="width:80px;height:80px;border-radius:50%;overflow:hidden;border:2px solid var(--ouro)">${renderAvatarJogador(j, { size: 80 })}</div>`;

  const energiaUsada = j.energia_usada_mes||0;
  const energiaDisp  = Math.max(0, 100 - energiaUsada);
  const repPct = Math.min(100, Math.round((j.reputacao||0)/cap*100));

  el.innerHTML = `
      <div class="perfil-container">
        <section class="capa">
          <div class="capa-kicker">CAPA DO PROCESSO · ADVOCATUS ONLINE</div>
          <div class="capa-body">
            <div>
              <h1 class="capa-nome">${j.nome_personagem || '—'}</h1>
              <div class="capa-meta">
                <span class="pill pill-cargo">${label}</span>
                ${j.oab ? `<span class="pill pill-oab">OAB ✓</span>` : ''}
                <span class="pill" style="background:var(--bg2);color:var(--txt3);border:var(--borda-sub)">${esp} · ${j.escritorio_bairro || 'Rio de Janeiro'}</span>
                ${j.no_serasa ? '<span class="pill" style="background:rgba(122,32,32,.25);color:var(--verm3);border:1px solid rgba(200,80,80,.35)">🚨 Serasa</span>' : ''}
              </div>
            </div>
          </div>
          ${j.oab ? `<div class="selo-stamp"><div class="selo-stamp-text">Registro<br>Ativo<br>OAB</div></div>` : ''}
        </section>

        <div class="profile-hero">
          ${fotoHtml}
          <div>
            <div class="profile-hero-desc">${j.descricao_personagem || `${label} atuando em ${esp}, ${escNome}.`}
              <span style="cursor:pointer;color:var(--navy3);font-size:.68rem;margin-left:.4rem" onclick="window._perfilEditarDescricao()">✏️ editar</span>
            </div>
            <div class="profile-hero-meta">
              <span class="meta-tag">📅 ${j.anos_carreira || 0} anos de carreira</span>
              <span class="meta-tag">✅ ${aprov}% de aproveitamento</span>
              <span class="meta-tag">🏢 ${escNome}</span>
              <span class="meta-tag">👤 ${j.idade || 22} anos · Geração ${j.geracao || 1}</span>
            </div>
          </div>
        </div>

        ${_painelNivelCarreira(j, cap, repPct)}

        <div class="stat-row">
          <div class="stat">
            <div class="stat-label">Reputação</div>
            <div class="stat-value">${j.reputacao||0} <small>/ ${cap} cap.</small></div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${repPct}%;background:var(--ouro)"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">Meu saldo</div>
            <div class="stat-value up">${_fmtExt(j.dinheiro||0)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Energia do mês</div>
            <div class="stat-value">${energiaDisp} <small>/ 100</small></div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${energiaDisp}%;background:var(--amber)"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">😌 Saúde Mental</div>
            <div class="stat-value" style="color:var(--verde2)">${j.saude_mental||80} <small>/ 100</small></div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${j.saude_mental||80}%;background:var(--verde2)"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">🔋 Disposição</div>
            <div class="stat-value" style="color:var(--amber)">${j.disposicao||80} <small>/ 100</small></div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${j.disposicao||80}%;background:var(--amber)"></div></div>
          </div>
          <div class="stat">
            <div class="stat-label">Casos no total</div>
            <div class="stat-value">${total} <small>${aprov}% aprov.</small></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem;margin-bottom:1.2rem">
          ${_miniStatCard('📈','Renda/mês', _fmtExt(j.renda_calculada||0),'money')}
          ${_miniStatCard('💸','Despesas', _fmtExt(j.despesas_calculadas||0),'danger')}
          ${_miniStatCard('🌐','Networking', j.networking||10, '')}
          ${_miniStatCard('🎓','Prestígio Acad.', j.prestigio_academico||0, '')}
        </div>

        <!-- Energia do mês — detalhamento de custos -->
        <div style="margin-bottom:1rem;padding:.75rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
          <div style="font-size:.68rem;color:var(--txt3);margin-bottom:.3rem">⚡ Energia do mês — custos por ação</div>
          <div style="font-size:.62rem;color:var(--txt4)">
            Pesquisa -5⚡ · Petição -10⚡ · Diligência -15⚡ · Audiência -20⚡
          </div>
        </div>

        <!-- Feed de atividade recente -->
        <div class="secao-header" id="perfil-atividade-secao">
          <div class="secao-titulo">📋 Atividade Recente</div>
          <span class="secao-badge">${_calJogador(j)}</span>
        </div>
        <div id="feed-atividade">
          <div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Carregando feed...</div>
        </div>
      </div>`;

  // Carregar feed do inbox assincronamente
  _carregarFeedAtividade(j.uid);
}


window._perfilEditarDescricao = function() {
  const j = window.JOGADOR;
  window.abrirModal('✏️ Editar Descrição',
    `<div class="campo">
      <label>Bio do personagem</label>
      <textarea id="perfil-desc-input" maxlength="200" rows="4" placeholder="Conte um pouco sobre sua trajetória...">${j.descricao_personagem || ''}</textarea>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._perfilSalvarDescricao()">Salvar</button>
    </div>`);
};

window._perfilSalvarDescricao = async function() {
  const texto = (document.getElementById('perfil-desc-input')?.value || '').trim().slice(0, 200);
  const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
  try {
    await updateDoc(doc(db, 'jogadores', uid), { descricao_personagem: texto });
    if (window.JOGADOR) window.JOGADOR.descricao_personagem = texto;
    window.fecharModal();
    window.toast('✅ Descrição atualizada.', 'ok', 2000);
    setTimeout(() => window.navTo?.('perfil', null), 300);
  } catch (e) {
    window.toast(e.message || 'Erro ao salvar.', 'ko');
  }
};

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
// PROCESSOS — redirecionado para o Escritório (menu removido do nav)
function renderProcessos(j, el) {
  renderEscritorio(j, el);
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

// Verifica se o jogador tem poder de contratar (dono, ou pleno+ com skills altas)
function _podeContratar(j) {
  if (j.escritorio_proprio_id) return true;
  if (j.poder_contratar) return true;
  if (!['pln','snr','asc','soc'].includes(j.cargo_id)) return false;
  const gestao   = j.skills?.gestao   || 0;
  const lideranca = j.skills?.lideranca || 0;
  return gestao >= 80 && lideranca >= 80;
}

function renderEscritorio(j, el) {
  const isSolo  = !j.escritorio_proprio_id && (!j.escritorio_id || j.escritorio_id === 'solo' || !j.escritorio_id);

  // Contratado em escritório (NPC ou próprio de outro) → vista expandida de funcionário
  if (!isSolo && !j.escritorio_proprio_id && j.escritorio_id && j.escritorio_id !== 'solo') {
    _renderEscritorioFuncionario(j, el, j.escritorio_id);
    return;
  }

  // Dono de escritório próprio → dashboard executivo completo
  if (j.escritorio_proprio_id) {
    el.innerHTML = `
      ${_escHero(j, null)}
      ${_escKpisPlaceholder()}
      ${_escStatRow(null, j)}
      ${_escMarketingPreviewCard(j.escritorio_proprio_id)}
      ${_escProcessosPreviewCard(j.escritorio_proprio_id)}
      ${_escEquipeCard(j.escritorio_proprio_id)}
      ${_escBeneficiosPreviewCard(j.escritorio_proprio_id)}
      ${_escClientesCard()}
      <div id="esc-oportunidades-bloco"></div>
      ${_escSocietarioCard(null, j)}
      <div id="esc-financas-upgrade"></div>
      <div id="esc-workspace-bloco"></div>
      ${_escAtividadeCard()}
      ${_escAcoesRapidas(j, null)}
    `;
    _carregarEscritorioProprio(j.escritorio_proprio_id, j);
    _carregarProcessosPreview(j.escritorio_proprio_id);
    return;
  }

  // Advocacia solo — sem escritório formal ainda
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🏢 Advocacia Solo</div>
      <button class="btn btn-sm btn-prim" onclick="window.novoProcesso && window.novoProcesso()">+ Novo caso</button>
    </div>
    <div class="card" style="text-align:center;padding:1.2rem 2rem;margin-bottom:1rem">
      <div style="font-size:.85rem;color:var(--ardosia2);margin-bottom:.5rem">
        Advogado autônomo · Honorários: 33% + sucumbência por instância
      </div>
      ${j.oab && ['jnr','pln','snr','asc','soc','snm'].includes(j.cargo_id) ? `
      <button class="btn btn-sec btn-sm" onclick="window.criarEscritorio && window.criarEscritorio()">
        Criar Escritório Formal
      </button>` : `
      <div style="font-size:.73rem;color:var(--ardosia)">
        ${!j.oab ? 'Crie um escritório após aprovar a OAB' : 'Requer Advogado Júnior ou superior para criar escritório'}
      </div>`}
    </div>

    <!-- Carteira Processual para OAB (recursos, sentença pendente) -->
    ${j.oab ? `<div id="carteira-processual-solo"><div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Carregando carteira...</div></div>` : ''}

    <!-- Processos ativos -->
    <div class="secao-header"><div class="secao-titulo">📁 Meus Processos</div></div>
    <div id="solo-processos-lista">
      <div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Carregando casos...</div>
    </div>`;

  if (j.oab) {
    const elCarteira = el.querySelector('#carteira-processual-solo');
    if (elCarteira && window.renderCarteiraProcessual) window.renderCarteiraProcessual(elCarteira);
  }
  _carregarProcessosSolo(j);
}

async function _carregarProcessosSolo(j) {
  try {
    // OAB players: recurso/sentença cases handled by renderCarteiraProcessual above
    const ATIVOS_STATUS = j.oab
      ? ['andamento','aguardando_evento','pronto_para_sentenca']
      : ['andamento','aguardando_evento','pronto_para_sentenca','aguardando_decisao_sentenca','recurso_pendente','aguardando_decisao_recurso'];
    const snapA = await getDocs(query(
      collection(db, 'processos'),
      where('advogado_uid', '==', j.uid),
      where('status', 'in', ATIVOS_STATUS),
      orderBy('criado_mes', 'desc'),
      limit(20)
    ));
    const snapE = await getDocs(query(
      collection(db, 'processos'),
      where('advogado_uid', '==', j.uid),
      where('status', 'in', ['ganho','perdido']),
      orderBy('encerrado_mes', 'desc'),
      limit(5)
    ));

    const el = document.getElementById('solo-processos-lista');
    if (!el) return;

    const STATUS_LABEL = {
      andamento: { l: 'Em andamento', c: 'var(--azul1)' },
      aguardando_evento: { l: '⚡ Evento pendente', c: 'var(--ouro2)' },
      pronto_para_sentenca: { l: '⚖️ Aguardando sentença', c: 'var(--amber)' },
      aguardando_decisao_sentenca: { l: '📋 Decisão pendente', c: 'var(--amber)' },
      recurso_pendente: { l: '📬 Recurso pendente', c: 'var(--roxo)' },
      aguardando_decisao_recurso: { l: '📋 Decisão recursal', c: 'var(--roxo)' },
      ganho: { l: '✅ Ganho', c: 'var(--verde2)' },
      perdido: { l: '❌ Perdido', c: 'var(--verm2)' },
    };

    const fmt = (v) => `R$${(v||0).toLocaleString('pt-BR')}`;
    const renderCard = (id, p) => {
      const st = STATUS_LABEL[p.status] || { l: p.status, c: 'inherit' };
      return `<div class="proc-card" onclick="window.abrirProcesso && window.abrirProcesso('${id}')" style="margin-bottom:.4rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:.72rem;color:var(--ardosia2)">${p.numero || '—'}</div>
            <div style="font-size:.83rem;font-weight:600;margin:.15rem 0">${p.tipo || p.area || '—'}</div>
            <div style="font-size:.72rem;color:var(--ardosia2)">${p.autor||'—'} vs ${p.reu||'—'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.75rem;font-weight:600">${fmt(p.valor)}</div>
            <div style="font-size:.7rem;color:${st.c};margin-top:.2rem">${st.l}</div>
          </div>
        </div>
      </div>`;
    };

    // Filtro em memória por personagem — Firestore não sabe filtrar "campo
    // ausente OU null" numa query (processos antigos sem personagem_id são
    // implicitamente do personagem principal).
    const ativos = snapA.docs.filter(d => ehDoPersonagemAtivo(d.data(), j)).map(d => renderCard(d.id, d.data()));
    const encerrados = snapE.docs.filter(d => ehDoPersonagemAtivo(d.data(), j)).map(d => renderCard(d.id, d.data()));

    if (ativos.length === 0 && encerrados.length === 0) {
      el.innerHTML = `<div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">
        Nenhum processo ativo. Clique em "+ Novo caso" para começar.
      </div>`;
      return;
    }

    el.innerHTML = ativos.join('') +
      (encerrados.length ? `
        <div class="secao-header" style="margin-top:1rem"><div class="secao-titulo" style="font-size:.78rem">Últimos encerrados</div></div>
        ${encerrados.join('')}` : '');
  } catch(e) {
    console.error('[SOLO PROCESSOS]', e);
    const el = document.getElementById('solo-processos-lista');
    if (el) el.innerHTML = `<div style="font-size:.78rem;color:var(--erro)">Erro ao carregar: ${e.message}</div>`;
  }
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
        <div id="esc-kpis-placeholder">${_escKpisPlaceholder()}</div>
        ${_escStatRow(esc, j)}
        ${_escMarketingPreviewCard(esc.id)}
        ${_escProcessosPreviewCard(esc.id)}
        ${_escEquipeCard(esc.id)}
        ${_escBeneficiosPreviewCard(esc.id)}
        ${_escClientesCard()}
        <div id="esc-oportunidades-bloco"></div>
        ${_escSocietarioCard(esc, j)}
        <div id="esc-financas-upgrade">
          ${window.renderBlocoFinancas ? window.renderBlocoFinancas(esc, j) : ''}
        </div>
        <div id="esc-workspace-bloco"></div>
        ${_escAtividadeCard()}
        ${_escAcoesRapidas(j, esc)}
      `;

      // Carregar KPIs de forma assíncrona
      const kpisHtml = await _escKpis(esc, j);
      const kpisEl = document.getElementById('esc-kpis-placeholder');
      if (kpisEl) kpisEl.innerHTML = kpisHtml;

      _escCarregarRankPos(escId);
      _carregarProcessosPreview(esc.id);
      _carregarMarketingPreview(esc.id);
      _carregarBeneficiosPreview(esc.id);

      const elAtividade = document.getElementById('esc-atividade-embed');
      if (elAtividade && window.renderAtividadeEscritorioPainel) window.renderAtividadeEscritorioPainel(escId, elAtividade);
      const elEquipe = document.getElementById('esc-equipe-embed');
      if (elEquipe && window.renderEquipePainel) window.renderEquipePainel(j, escId, elEquipe);
      const elClientes = document.getElementById('esc-clientes-embed');
      if (elClientes && window.renderClientesPainel) window.renderClientesPainel(j, escId, elClientes);
      const elOportunidades = document.getElementById('esc-oportunidades-bloco');
      if (elOportunidades && window.renderOportunidadesPainel) window.renderOportunidadesPainel(j, escId, elOportunidades);
      const elWorkspace = document.getElementById('esc-workspace-bloco');
      if (elWorkspace) _renderWorkspacePainel(j, elWorkspace);
      const elEspec = document.getElementById('esc-especializacoes-bloco');
      if (elEspec && window.renderEspecializacoesEsc) window.renderEspecializacoesEsc(escId, elEspec);
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

  const honorarios = data.honorariosMes;

  el.innerHTML = `
    <div style="margin-bottom:.8rem">
      <button class="btn btn-ghost btn-sm" onclick="window.navTo('escritorio',null)">← Escritório</button>
    </div>
    ${_capaHeader(`BALANCETE MENSAL · ${(data.escNome||'—').toUpperCase()}`, `📊 ${mNome}, Ano ${ano}`, '')}

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
        <span class="blcte-val receita">${fmt(honorarios + data.receitaRecorrente)}</span>
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

      ${data.beneficiosDetalhe && data.beneficiosDetalhe.length > 0 ? `
      <div class="blcte-grupo">Benefícios</div>
      ${data.beneficiosDetalhe.map(b => `
        <div class="blcte-linha sub">
          <span>${b.icone} ${b.label}</span>
          <span class="blcte-val despesa">−${fmt(b.custo)}</span>
        </div>`).join('')}
      <div class="blcte-linha blcte-subtotal">
        <span>Subtotal Benefícios</span>
        <span class="blcte-val despesa">−${fmt(data.beneficiosCustoTotal)}</span>
      </div>` : ''}

      ${data.despesaMarketing > 0 ? `
      <div class="blcte-grupo">Marketing</div>
      <div class="blcte-linha sub">
        <span>Campanhas lançadas este mês</span>
        <span class="blcte-val despesa">−${fmt(data.despesaMarketing)}</span>
      </div>` : ''}

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
    </div>

    ${data.escId && data.caixa > 0 ? `
    <button class="btn btn-prim btn-block" style="margin-top:.7rem" onclick="window.abrirModalDistribuirLucros('${data.escId}')">
      💰 Distribuir Lucros (caixa: ${fmt(data.caixa)})
    </button>` : ''}`;
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
      <div class="secao-header">
        <div class="secao-titulo">💼 Espaço de Trabalho</div>
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
// ESCRITÓRIO — VISTA DE FUNCIONÁRIO CONTRATADO
// Acesso completo ao pool de processos e oportunidades,
// sem KPIs financeiros. Contratar restrito por cargo/skills.
// ════════════════════════════════════════════════════════
async function _renderEscritorioFuncionario(j, el, escId) {
  const podeCtrt = _podeContratar(j);
  const tier     = j.escritorio_tier || 1;

  el.innerHTML = `
    ${_escHero(j, null)}
    ${_escAtividadeCard()}
    <div class="esc-card-bloco" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.8rem">
        <div class="secao-titulo">Equipe do Escritório</div>
        ${podeCtrt
          ? `<button class="btn btn-sm btn-prim" onclick="window.navTo('equipe',null)" style="font-size:.7rem">+ Contratar</button>`
          : `<span style="font-size:.65rem;color:var(--txt3)">Só o dono ou Pleno+ alto</span>`}
      </div>
      <div id="esc-equipe-embed"><div style="font-size:.78rem;color:var(--txt3)">Carregando...</div></div>
    </div>
    <div class="esc-card-bloco" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.8rem">
        <div class="secao-titulo">Clientes</div>
      </div>
      <div id="esc-clientes-embed"><div style="font-size:.78rem;color:var(--txt3)">Carregando...</div></div>
    </div>
    <div class="esc-card-bloco" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.8rem">
        <div class="secao-titulo">Sua Posição</div>
      </div>
      <div style="font-size:.8rem;color:var(--txt);font-weight:600">${j.nome_personagem||'—'}</div>
      <div style="font-size:.7rem;color:var(--txt3)">${j.cargo_id?.toUpperCase()||'—'} · Tier ${tier}</div>
      <div style="font-size:.7rem;color:var(--txt3);margin-top:.3rem">${j.escritorio_nome||'—'}</div>
      ${podeCtrt ? `<div style="font-size:.65rem;color:var(--verde2);margin-top:.5rem">✅ Poder de contratar ativo</div>` : ''}
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:.8rem" onclick="window.sairEscritorio&&window.sairEscritorio()">
        Sair do escritório
      </button>
    </div>
    <div id="esc-processos-bloco"></div>
    <div id="esc-oportunidades-bloco"></div>`;

  const elAtividade = document.getElementById('esc-atividade-embed');
  if (elAtividade && window.renderAtividadeEscritorioPainel) window.renderAtividadeEscritorioPainel(escId, elAtividade);
  const elEquipe = document.getElementById('esc-equipe-embed');
  if (elEquipe && window.renderEquipePainel) window.renderEquipePainel(j, escId, elEquipe);
  const elClientes = document.getElementById('esc-clientes-embed');
  if (elClientes && window.renderClientesPainel) window.renderClientesPainel(j, escId, elClientes);
  const elOp = document.getElementById('esc-oportunidades-bloco');
  if (elOp && window.renderOportunidadesPainel) window.renderOportunidadesPainel(j, escId, elOp);
  const elProc = document.getElementById('esc-processos-bloco');
  if (elProc && window.renderProcessosPool) window.renderProcessosPool(j, escId, elProc);
}

// ════════════════════════════════════════════════════════
// ESCRITÓRIO NPC DETALHADO (legado — mantido para referência)
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
          <div style="font-family:var(--font-serif);font-size:1.1rem;font-weight:700;color:var(--txt)">${j.escritorio_nome || '—'}</div>
          <div style="font-size:.72rem;color:var(--txt3)">📍 ${j.escritorio_bairro||'—'} · ${_espLabel2(j.escritorio_esp)} · Tier ${tier}</div>
        </div>
      </div>
      <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.7rem;margin-bottom:.7rem">
        <div style="font-size:.62rem;color:var(--txt4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem">Sua vaga</div>
        <div style="font-weight:700;color:var(--txt);font-size:.9rem">${VAGA_LABEL[vagaTipo]||vagaTipo}</div>
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
    societario:'Societário',consumidor:'Consumidor',familia:'Família',
    imobiliario:'Imobiliário',contencioso:'Contencioso',administrativo:'Administrativo',
  };
  return MAP[esp]||esp||'—';
}

// Espelho de js/escritorio_painel.js::TODAS_AREAS (só as chaves) — usado pra
// saber se o escritório cobre TODAS as especializações do jogo (Full Service
// de verdade), em vez de inferir isso só pelo tier.
const _TODAS_AREAS_KEYS = ['civil','tributario','trabalhista','criminal','empresarial','societario','consumidor','familia','imobiliario','contencioso','ambiental','administrativo'];

// ════════════════════════════════════════════════════════
// ESCRITÓRIO — COMPONENTES DO REDESIGN (Hero / KPIs / Equipe /
// Clientes / Societário / Ações Rápidas)
// ════════════════════════════════════════════════════════


// "Investido no mês" = custo cheio de TODA campanha ainda ativa (meses_
// restantes>0), somado — não só o gasto do mês em que a campanha foi
// lançada. Antes usava esc.despesa_marketing_mes_atual, que só soma o
// custo à vista de campanhas lançadas NESTE mês (financeiro.js:
// lancarCampanha) e zera no tick seguinte — então uma Campanha Nacional
// (R$40.000, 4 meses) aparecia como "investido" só no mês do lançamento,
// sumindo do indicador nos meses 2-4 mesmo ainda ativa rendendo prestígio.
// Isso é só pro indicador de intensidade de marketing; o Balancete
// (despesaMarketing em _escKpis) continua usando o gasto de caixa real do
// mês, sem repetir — dinheiro não sai de novo depois do lançamento.
function _investidoMarketingAtivo(esc) {
  const campanhas = (esc && esc.campanhas_ativas) || [];
  return campanhas
    .filter(c => (c.meses_restantes || 0) > 0)
    .reduce((s, c) => s + (c.custo || 0), 0);
}

// Prévia de Marketing no dashboard — igual mockup, mas com dados reais
// (reputação/prestígio do escritório, convites de mídia pendentes).
function _escMarketingPreviewCard(escId) {
  return `
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.4rem">
      <div class="secao-titulo">📣 Marketing</div>
      <button class="painel-btn" onclick="window.navTo('marketing',null)">ver tudo →</button>
    </div>
    <div class="stat-row stat-row-4" id="esc-marketing-preview" style="margin-bottom:0">
      <div class="stat"><div class="stat-label">Investido no mês</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Reputação</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Prestígio</div><div class="stat-value">—</div></div>
      <div class="stat"><div class="stat-label">Convites pendentes</div><div class="stat-value">—</div></div>
    </div>
  </div>`;
}

async function _carregarMarketingPreview(escId) {
  const el = document.getElementById('esc-marketing-preview');
  if (!el || !escId) return;
  try {
    const escSnap = await getDoc(doc(db, 'escritorios', escId));
    const esc = escSnap.exists() ? escSnap.data() : {};
    const conviteSnap = await getDocs(query(
      collection(db, 'escritorios', escId, 'convites_midia'),
      where('status', '==', 'pendente')
    ));
    el.innerHTML = `
      <div class="stat"><div class="stat-label">Investido no mês</div><div class="stat-value" style="font-size:1.1rem">${_fmtExt(_investidoMarketingAtivo(esc))}</div></div>
      <div class="stat"><div class="stat-label">Reputação</div><div class="stat-value up" style="font-size:1.1rem">${esc.reputacao||0}</div></div>
      <div class="stat"><div class="stat-label">Prestígio</div><div class="stat-value" style="font-size:1.1rem">${esc.prestigio||0}</div></div>
      <div class="stat"><div class="stat-label">Convites pendentes</div><div class="stat-value" style="font-size:1.1rem;color:${conviteSnap.size?'var(--amber)':'var(--txt)'}">${conviteSnap.size}</div></div>`;
  } catch (e) { /* silencioso, mantém placeholder */ }
}

// Prévia de Benefícios no dashboard — igual mockup, 1 linha compacta com
// custo mensal real + quantos ativos (mesmo catálogo de js/equipe.js).
function _escBeneficiosPreviewCard(escId) {
  return `
  <div class="esc-card-bloco" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.1rem" id="esc-beneficios-preview">
    <div>
      <div style="font-size:.85rem;font-weight:600;color:var(--txt)">💙 Benefícios dos Funcionários</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-top:.2rem" id="esc-beneficios-preview-texto">Carregando...</div>
    </div>
    <button class="painel-btn" onclick="window.navTo('beneficios',null)">gerenciar →</button>
  </div>`;
}

async function _carregarBeneficiosPreview(escId) {
  const el = document.getElementById('esc-beneficios-preview-texto');
  if (!el || !escId || !window._beneficiosCatalogoResumo) return;
  try {
    const escSnap = await getDoc(doc(db, 'escritorios', escId));
    const esc = escSnap.exists() ? escSnap.data() : {};
    const fSnap = await getDocs(collection(db, 'escritorios', escId, 'funcionarios'));
    const nFuncs = fSnap.docs.filter(d => d.data().tipo === 'npc' && d.data().ativo !== false).length;
    const { custoMensal, ativos } = window._beneficiosCatalogoResumo(esc, nFuncs);
    el.textContent = ativos.length
      ? `${_fmtExt(custoMensal)}/mês · ${ativos.length} ativo${ativos.length===1?'':'s'}`
      : 'Nenhum benefício ativo ainda.';
  } catch (e) { el.textContent = ''; }
}

// Card de prévia — resumo rápido + link "Ver", igual ao mockup
// (painel "Prévia de Ações Disponíveis" antes de Gestão de Pessoas).
// Números reais: consulta leve na mesma processos_pool que
// js/processos_escritorio.js:renderProcessosPool usa de verdade.
function _escProcessosPreviewCard(escId) {
  return `
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.4rem">
      <div class="secao-titulo">⚖️ Gestão de Processos</div>
      <button class="painel-btn" onclick="window.navTo('processos',null)">gerenciar processos →</button>
    </div>
    <div id="esc-processos-preview" style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Carregando...</div>
  </div>`;
}

const _PROC_STATUSES_RECURSAL = ['recurso_pendente','aguardando_decisao_sentenca','aguardando_decisao_recurso','aguardando_evento','pronto_para_sentenca'];

async function _carregarProcessosPreview(escId) {
  const el = document.getElementById('esc-processos-preview');
  if (!el || !escId) return;
  try {
    const poolSnap = await getDocs(collection(db, 'escritorios', escId, 'processos_pool'));
    const todos = poolSnap.docs.map(d => d.data());
    const disponiveis = todos.filter(p => p.status === 'disponivel');
    const emAndamento = todos.filter(p => p.status === 'em_andamento');
    // "Ativos" tinha só disponivel+em_andamento, sem contar
    // aguardando_sentenca — mesmo critério do cap-check em
    // js/processos_escritorio.js:gerarProcessosMensais ("Pool cheio
    // X/Y"), senão esse número nunca batia com o real.
    const aguardSent = todos.filter(p => p.status === 'aguardando_sentenca');
    const ativos   = disponiveis.length + emAndamento.length + aguardSent.length;
    const recursal = todos.filter(p => _PROC_STATUSES_RECURSAL.includes(p.status));
    const irVerTodos = `window.navTo('processos',null)`;

    const novo = disponiveis[0];
    const rec  = recursal[0];
    const rows = [
      novo ? `
      <div class="oport-row" style="padding:.9rem 0">
        <div>
          <div class="oport-kicker">📁 NOVO PROCESSO</div>
          <div class="oport-titulo">${novo.titulo||'—'} <span class="oport-area">· ${novo.cliente_nome||'—'}</span></div>
          <div class="oport-desc">Aguardando início · clique pra investigar</div>
        </div>
        <div class="oport-valor"><div class="oport-preco" style="font-size:.8rem">${_fmtExt(novo.honorarios||0)}</div></div>
        <div class="oport-acoes"><button class="btn-avancar oport-btn" onclick="${irVerTodos}">Continuar</button></div>
      </div>` : '',
      rec ? `
      <div class="oport-row" style="padding:.9rem 0">
        <div>
          <div class="oport-kicker">⏰ FASE RECURSAL</div>
          <div class="oport-titulo">${rec.titulo||'—'} <span class="oport-area">· ${rec.cliente_nome||'—'}</span></div>
        </div>
        <div class="oport-acoes"><button class="btn-sair oport-btn" onclick="${irVerTodos}">Ver</button></div>
      </div>` : '',
    ].filter(Boolean).join('');

    el.innerHTML = (rows || '<div style="font-size:.78rem;color:var(--txt4)">Nenhum processo no pool ainda.</div>') +
      `<div style="font-size:.68rem;color:var(--txt4);padding-top:.5rem">${ativos} processo${ativos===1?'':'s'} ativo${ativos===1?'':'s'} · ${recursal.length} em fase recursal</div>`;
  } catch (e) { el.textContent = ''; }
}

// Card de "Atividade Recente" do escritório (diário compacto, topo da visão geral)
function _escAtividadeCard() {
  return `
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.6rem">
      <div class="secao-titulo">Atividade Recente</div>
      <a href="#" class="esc-ver-todos" onclick="window.navTo('equipe',null);return false">Ver diário completo</a>
    </div>
    <div id="esc-atividade-embed">
      <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Carregando atividade...</div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
// CAPA — cabeçalho "capa do processo" reutilizável, igual ao mockup
// (.impeccable/preview/dossie-v1.html) em quase toda tela. kicker é a
// linha mono no topo (ex: "BALANCETE MENSAL · NOME DO ESCRITÓRIO"),
// pillsHtml são os <span class="pill ...">, seloHtml é opcional
// (círculo rotacionado — só quando faz sentido, ex: prestígio/OAB).
// ════════════════════════════════════════════════════════
function _capaHeader(kicker, nome, pillsHtml, seloHtml) {
  return `
  <section class="capa">
    <div class="capa-kicker">${kicker}</div>
    <div class="capa-body">
      <div>
        <h1 class="capa-nome">${nome}</h1>
        <div class="capa-meta">${pillsHtml || ''}</div>
      </div>
    </div>
    ${seloHtml || ''}
  </section>`;
}
window._capaHeader = _capaHeader;

// Conta processos ativos de verdade (disponivel+em_andamento no pool),
// igual à Gestão de Processos — antes o pill do hero usava esc.total_casos
// (contador VITALÍCIO de casos concluídos, incrementado em processar_
// sentenca.js/processar_acordao.js) ou j._processos_count (campo que nunca
// é escrito em lugar nenhum, sempre 0/undefined), então nunca batia com o
// número real de casos ativos mostrado na tela de Gestão de Processos.
async function _atualizarHeroAtivos(escId) {
  const el = document.getElementById('esc-hero-ativos');
  if (!el || !escId) return;
  try {
    const poolSnap = await getDocs(collection(db, 'escritorios', escId, 'processos_pool'));
    const ativos = poolSnap.docs.filter(d => {
      const st = d.data().status;
      return st === 'disponivel' || st === 'em_andamento';
    }).length;
    el.textContent = `⚖️ ${ativos} processo${ativos===1?'':'s'} ativo${ativos===1?'':'s'}`;
  } catch (e) { /* mantém placeholder */ }
}

function _escHero(j, esc) {
  const escNome = (esc && esc.nome) || j.escritorio_nome || 'Advocacia Solo';
  const tier    = (esc && esc.tier) || j.escritorio_tier || 1;
  const TIER_TAG = {1:'Boutique',2:'Boutique',3:'Regional',4:'Full Service',5:'Big Law'};
  const areasAtuacao = (esc && esc.areas_atuacao) || [];
  const fullService = areasAtuacao.length > 0 && _TODAS_AREAS_KEYS.every(k => areasAtuacao.includes(k));
  const tagEspecializacao = fullService
    ? 'Full Service'
    : areasAtuacao.length
      ? `${TIER_TAG[tier]||'Boutique'} · ${areasAtuacao.map(_espLabel2).join(', ')}`
      : `${TIER_TAG[tier]||'Boutique'} · ${_espLabel2((esc && (esc.especialidade_principal||esc.especialidade)) || j.escritorio_esp || j.especialidade)}`;
  const numSocios = esc ? _normalizarSociosUI(esc).length : 1;
  const rep = j.reputacao || 0;
  const cap = (window.REP_CAP||{})[j.cargo_id] || 35;
  const prestigio = esc ? (esc.prestigio||0) : Math.min(100, Math.round(rep/cap*100));
  const local = (esc && esc.bairro_sede) || j.escritorio_bairro || 'Rio de Janeiro';
  const escIdHero = (esc && esc.id) || j.escritorio_proprio_id || j.escritorio_empregado_id || null;
  if (escIdHero) setTimeout(() => _atualizarHeroAtivos(escIdHero), 0);

  return `
  <section class="capa">
    <div class="capa-kicker">REGISTRO DO ESCRITÓRIO · ADVOCATUS ONLINE</div>
    <div class="capa-body">
      <div>
        <h1 class="capa-nome">${escNome}</h1>
        <div class="capa-meta">
          <span class="pill pill-cargo">${tagEspecializacao}</span>
          <span class="pill pill-oab">📍 ${local}</span>
          <span class="pill pill-oab">👥 ${numSocios} sócio${numSocios>1?'s':''}</span>
          <span class="pill pill-oab" id="esc-hero-ativos">⚖️ …</span>
          ${esc && esc.gestor_id ? `<span class="pill pill-oab" style="background:var(--ouro,#D9B573);color:#1E293C;border-color:transparent">👑 Gestor: ${esc.gestor_nome||'—'}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="selo-stamp"><div class="selo-stamp-text">Prestígio<br>${prestigio}<span style="display:block;font-size:.42rem;margin-top:.1rem">/ 100</span></div></div>
  </section>`;
}

// Linha de estatísticas do Escritório (estilo Popmundo: gênero+ranking / dinheiro / imóvel)
const ESC_PAT_NOME = { home:'Home Office', cw:'Coworking Jurídico', sal:'Sala Própria', esm:'Escritório Médio', esp:'Escritório Premium' };

function _escStatRow(esc, j) {
  const esp = _espLabel2((esc && (esc.especialidade_principal||esc.especialidade)) || j.escritorio_esp || j.especialidade);
  const workspaceLabel = ESC_PAT_NOME[j.pat?.escritorio || 'home'] || 'Home Office';
  return `
  <div class="esc-card-bloco esc-statrow" style="margin-bottom:1.1rem">
    <div class="esc-statrow-linha">
      <span class="esc-statrow-icone">⭐</span>
      <span class="esc-statrow-texto">${esp} <span id="esc-statrow-rank" style="color:var(--txt3)">#—</span></span>
    </div>
    <div class="esc-statrow-linha">
      <span class="esc-statrow-icone">💲</span>
      <span class="esc-statrow-texto" style="color:var(--verde2);font-weight:700">${_fmtExt((esc&&esc.caixa)||0)}</span>
    </div>
    <div class="esc-statrow-linha">
      <span class="esc-statrow-icone">🏢</span>
      <span class="esc-statrow-texto">${workspaceLabel}</span>
      <a href="#" class="esc-statrow-ver" onclick="document.getElementById('esc-workspace-bloco')?.scrollIntoView({behavior:'smooth'});return false">Ver »</a>
    </div>
  </div>`;
}

// Busca a posição do escritório no ranking do servidor (rankings/escritorios, top50)
async function _escCarregarRankPos(escId) {
  if (!escId) return;
  try {
    const { doc: fbDoc, getDoc: fbGetDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const { db: fbDb } = await import('./firebase-init.js');
    const snap = await fbGetDoc(fbDoc(fbDb, 'rankings', 'escritorios'));
    const el = document.getElementById('esc-statrow-rank');
    if (!el) return;
    if (!snap.exists()) { el.textContent = ''; return; }
    const top50 = snap.data().top50 || [];
    const entry = top50.find(e => e.id === escId);
    el.textContent = entry ? `#${entry.pos}` : 'Fora do Top 50';
  } catch (e) {
    console.warn('[ESC RANK]', e);
  }
}

function _escKpisPlaceholder() {
  return `
  <div class="stat-row stat-row-4" style="margin-bottom:1.1rem">
    <div class="stat"><div class="stat-label">Receita do mês</div><div class="stat-value">—</div></div>
    <div class="stat"><div class="stat-label">Despesas do mês</div><div class="stat-value">—</div></div>
    <div class="stat"><div class="stat-label">Lucro líquido</div><div class="stat-value">—</div></div>
    <div class="stat"><div class="stat-label">Caixa disponível</div><div class="stat-value">—</div></div>
  </div>`;
}

async function _escKpis(esc, j) {
  const caixa    = (esc && esc.caixa) || 0;
  // honorariosMes + receitaRecorrente somados aqui (não lendo
  // faturamento_mes_atual direto) garante que "Receita do mês" e o
  // balancete NUNCA mostrem números inconsistentes entre si — antes,
  // faturamento_mes_atual era incrementado em paralelo por vários pontos
  // (sentença, acordão, recorrente) e podia divergir da soma real dos dois
  // componentes, e o balancete derivava honorários por subtração
  // (rendaMes - recorrente), que virava negativo-escondido-em-abs() nesse caso.
  const honorariosMes    = esc ? (esc.faturamento_honorarios_mes || 0) : (j.honorarios_mes || 0);
  const receitaRecorrenteKpi = esc ? (esc.faturamento_recorrente_mes || 0) : 0;
  const rendaMes = honorariosMes + receitaRecorrenteKpi;

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
  const receitaRecorrente = receitaRecorrenteKpi;

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
    } catch (e) {
      console.warn('[KPI DESPESAS]', e);
    }
  }

  // Benefícios ativos, itemizados (js/equipe.js:BENEFICIOS_CATALOGO, exposto
  // como window._BENEFICIOS_CATALOGO) — cada um custa por funcionário ativo/mês.
  const catalogoBenef = window._BENEFICIOS_CATALOGO || {};
  const beneficiosIds = (esc && esc.beneficios_ativos) || [];
  const beneficiosDetalhe = beneficiosIds.map(bid => {
    const cfg = catalogoBenef[bid] || {};
    // Bônus por Performance é % do salário real de cada funcionário (não
    // um custo_por_func fixo) — usa o ponto médio da faixa 5-15% aqui
    // (Balancete é resumo mensal, sem recalcular eficiência por NPC de novo;
    // o valor exato que sai do caixa é o aplicado no tick, functions/avancar_mes.js).
    const custo = cfg.custo_pct_salario
      ? listaFuncionarios.reduce((s,f) => s + Math.round((f.sal||0) * ((cfg.pct_min+cfg.pct_max)/2)), 0)
      : (cfg.custo_por_func || 0) * listaFuncionarios.length;
    return { id: bid, label: cfg.label || bid, icone: cfg.icone || '💙', custo };
  });
  const beneficiosCustoTotal = beneficiosDetalhe.reduce((s, b) => s + b.custo, 0);

  // Despesa de marketing do mês — campanhas lançadas (functions/financeiro.js:
  // lancarCampanha incrementa esc.despesa_marketing_mes_atual, resetado a
  // cada tick igual faturamento_mes_atual).
  const despesaMarketing = (esc && esc.despesa_marketing_mes_atual) || 0;

  const despMes   = custoFixo + salariosTotais + workspaceCm + beneficiosCustoTotal + despesaMarketing;
  const lucroMes  = rendaMes - despMes;
  const socios    = esc ? _normalizarSociosUI(esc) : [{ participacao_pct: 100 }];
  const minhaUid  = j.uid || window.JOGADOR_UID;
  const minhaCota = esc ? (socios.find(s => s.uid === minhaUid)?.participacao_pct ?? 100) : 100;

  window._escBalanceteData = {
    escNome: (esc && esc.nome) || j.escritorio_nome || 'Escritório',
    rendaMes, honorariosMes, receitaRecorrente, custoFixo, salariosTotais, workspaceCm,
    workspaceLabel: wLabel, despMes, lucroMes, minhaCota,
    beneficiosDetalhe, beneficiosCustoTotal, despesaMarketing,
    tier, funcionarios: listaFuncionarios, escId: esc?.id, caixa,
  };

  return `
  <div class="stat-row stat-row-4" style="margin-bottom:1.1rem">
    <div class="stat">
      <div class="stat-label">Receita do mês</div>
      <div class="stat-value up">${_fmtExt(rendaMes)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Despesas do mês</div>
      <div class="stat-value" style="color:var(--verm2)">${_fmtExt(despMes)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Lucro líquido</div>
      <div class="stat-value ${lucroMes>=0?'up':''}" style="color:${lucroMes>=0?'var(--verde2)':'var(--verm2)'}">${_fmtExt(lucroMes)}</div>
      <button class="btn btn-sm btn-ghost" style="margin-top:.4rem" onclick="window.navTo('balancete',null)">Ver balancete →</button>
    </div>
    <div class="stat">
      <div class="stat-label">Caixa disponível</div>
      <div class="stat-value" style="color:${caixa>=0?'var(--txt)':'var(--verm2)'}">${_fmtExt(caixa)} <small>cota ${minhaCota}%</small></div>
    </div>
  </div>`;
}

function _escEquipeCard(escId) {
  return `
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.6rem">
      <div class="secao-titulo">Gestão de Pessoas</div>
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem">
      <button class="btn btn-sm btn-prim" onclick="window.navTo('contratacao',null)">+ contratar</button>
      <button class="btn btn-sm btn-ghost" onclick="window.navTo('treinamento',null)">mentoria</button>
      <button class="btn btn-sm btn-ghost" onclick="window.navTo('equipe',null)">gerenciar pessoas →</button>
    </div>
    <div id="esc-equipe-embed">
      <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Carregando equipe...</div>
    </div>
  </div>`;
}

function _escClientesCard() {
  return `
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.8rem">
      <div class="secao-titulo">Carteira de Clientes</div>
      <button class="painel-btn" onclick="window.navTo('clientes',null)">ver todos →</button>
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

const _DONUT_CORES = ['#D9B573','#16D6A8','#6B9760','#5CE0B8','#8A6A38','#93C488'];

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
  <div class="esc-card-bloco" style="margin-bottom:1.1rem">
    <div class="secao-header" style="margin-bottom:.6rem">
      <div class="secao-titulo">Estrutura Societária</div>
    </div>
    <div class="esc-donut-wrap">
      <div style="position:relative;width:130px;height:130px">
        <div style="width:130px;height:130px;border-radius:50%;background:conic-gradient(${stops || 'var(--navy) 0% 100%'})"></div>
        <div style="position:absolute;inset:18px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:1.2rem;font-weight:700;color:var(--txt);font-family:var(--font-serif)">${principal}%</div>
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
    <div style="display:flex;gap:.4rem;margin-top:.6rem">
      <button class="btn btn-sec btn-sm" style="flex:1" onclick="window.navTo('equipe',null)">
        Ver detalhes
      </button>
      ${socios.length >= 2 ? `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window.navTo('assembleia',null)">🏛️ Assembleia</button>` : ''}
    </div>
    <div id="esc-especializacoes-bloco"></div>
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
    { icone:'📣', label:'Marketing',                fn:"window.navTo('marketing',null)",  habilitado: temEscritorio },
    { icone:'📖', label:'Repertório do Escritório', fn:"window.navTo('repertorio',null)", habilitado: temEscritorio },
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
          <div style="font-size:.68rem;color:var(--amber);margin-top:.2rem">Salário: ${fmt(e.sal||1700)}/mês</div>
          <div class="skill-bar" style="margin-top:.35rem;width:120px">
            <div class="skill-fill" style="width:${e.desemp||60}%"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.3rem">
          <button class="btn btn-sm btn-ghost" onclick="window.delegarEstagiario && window.delegarEstagiario(${i})">Delegar</button>
          <button class="btn btn-sm btn-danger" onclick="window.dispensarEstagiario && window.dispensarEstagiario(${i})">Dispensar</button>
        </div>
      </div>`).join('')}`;
}

// ════════════════════════════════════════════════════════
// FOCO DO PERSONAGEM — reúne ações reais espalhadas (study_queue,
// Petições, Cursos, Concurso, recesso mensal) num só painel. Não é um
// mecanismo novo — é uma vitrine pras 30 skills reais + os atalhos que
// já existem em telas separadas. Cards marcados 📌 são propostos, sem
// mecânica real por trás (ver notas em cada um).
// ════════════════════════════════════════════════════════
const _FOCO_BASE_SKILLS = [
  { k:'legal_drafting', l:'Redação Jurídica' }, { k:'legal_research', l:'Pesquisa Jurídica' },
  { k:'argumentation', l:'Argumentação' }, { k:'oral_advocacy', l:'Sustentação Oral' },
  { k:'negotiation', l:'Negociação' }, { k:'procedure', l:'Litigância' }, { k:'gestao', l:'Gestão' },
];
const _FOCO_DOC_SKILLS = [
  { k:'doc_initial_filing', l:'Petição Inicial' }, { k:'doc_responsive_pleading', l:'Contestação' },
  { k:'doc_motion', l:'Requerimento' }, { k:'doc_appellate_brief', l:'Razões de Apelação' },
  { k:'doc_supreme_brief', l:'Razões de Rec. Especial' }, { k:'doc_trial_brief', l:'Memoriais' },
  { k:'doc_evidence', l:'Prova Documental' }, { k:'doc_deposition', l:'Depoimento' },
];
const _FOCO_AREA_SKILLS = [
  { k:'area_employment', l:'Trabalhista' }, { k:'area_tax', l:'Tributário' }, { k:'area_civil', l:'Cível' },
  { k:'area_criminal', l:'Criminal' }, { k:'area_corporate', l:'Empresarial' },
  { k:'area_immigration', l:'Imigração' }, { k:'area_bankruptcy', l:'Rec. Judicial' },
];
function renderFoco(j, el) {
  const queue = j.study_queue || [];
  const skJur = j.skills_jur || {};
  const skGer = j.skills || {};
  const geraisDef = _getSkills();

  const gruposHtml = [
    ['⚖️ Skills Jurídicas', _FOCO_BASE_SKILLS, skJur, 'skJur'],
    ['📄 Peças & Documentos', _FOCO_DOC_SKILLS, skJur, 'skJur'],
    ['🏛️ Áreas do Direito', _FOCO_AREA_SKILLS, skJur, 'skJur'],
    ['🎯 Habilidades Gerais', geraisDef.map(g=>({k:g.k,l:g.l})), skGer, 'skGer'],
  ].map(([titulo, lista, valores, fonte]) => `
    <details style="margin-bottom:.5rem">
      <summary style="font-size:.76rem;font-weight:600;color:var(--txt);cursor:pointer;padding:.3rem 0">${titulo}</summary>
      ${lista.map(sk => {
        const emEst = queue.some(q => q.skill === sk.k);
        const val = valores[sk.k] || 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.25rem 0;font-size:.75rem">
          <span style="color:var(--txt3)">${sk.l} <span style="color:var(--txt4)">(${val})</span></span>
          ${emEst
            ? `<span style="color:var(--amber);font-size:.68rem">⏳ em estudo</span>`
            : `<button class="sk-btn" onclick="window.${fonte==='skJur'?'estudarSkillJur':'estudarSkill'}('${sk.k}','${sk.l}')">📖 +3 (R$500)</button>`}
        </div>`;
      }).join('')}
    </details>`).join('');

  const focoAtual = j.foco_atual || null;
  const FOCO_OPCOES = [
    { k:'estudar',   icone:'📖', label:'Estudar Habilidade', tag:'real', tela:null },
    { k:'peticoes',  icone:'📄', label:'Escrever Petição',   tag:'real', tela:'peticoes' },
    { k:'cursos',    icone:'🎓', label:'Curso / Pós',         tag:'real', tela:'cursos' },
    { k:'concurso',  icone:'🏛️', label:'Concurso Público',    tag:'real, travado', tela:'concurso' },
    { k:'redes',     icone:'📣', label:'Postar em Redes Sociais', tag:'real', tela:'redes' },
    { k:'audiencia', icone:'🔨', label:'Preparar Audiência',  tag:'real (via Investigação)', tela:'investigacao' },
    { k:'trabalhar_intensamente', icone:'💼', label:'Trabalhar Intensamente', tag:'real', tela:null },
  ];
  const focoLockedHtml = focoAtual
    ? `<div class="card" style="margin-bottom:1rem;border-color:var(--navy3);background:var(--verde-bg)">
        <div style="font-size:.72rem;color:var(--navy4)">🔒 Foco travado neste mês</div>
        <div style="font-size:.9rem;font-weight:700;color:var(--txt);margin-top:.2rem">${FOCO_OPCOES.find(o=>o.k===focoAtual)?.label || focoAtual}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="window._focoSelecionar(null)">Destravar</button>
      </div>`
    : `<div class="card" style="margin-bottom:1rem;color:var(--txt4);font-size:.72rem">Nenhum foco travado ainda — clique num card abaixo pra travar (fica valendo até você trocar).</div>`;

  const cardsHtml = FOCO_OPCOES.map(o => {
    const selecionado = focoAtual === o.k;
    return `<div class="esc-acao-btn" style="cursor:pointer;position:relative;${selecionado?'border-color:var(--navy3);background:var(--verde-bg)':''}" onclick="window._focoSelecionar('${o.k}')">
      ${selecionado ? `<span style="position:absolute;top:.3rem;right:.4rem;font-size:.7rem">🔒</span>` : ''}
      <span class="esc-acao-icone">${o.icone}</span>
      <span>${o.label}<br><small style="opacity:.7">${o.tag}</small></span>
      ${o.tela ? `<a href="#" style="display:block;margin-top:.3rem;font-size:.62rem;color:var(--navy4)" onclick="event.stopPropagation();window.navTo('${o.tela}',null)">abrir tela →</a>` : ''}
    </div>`;
  }).join('');

  const propostaHtml = `
    <div class="esc-acao-btn" style="opacity:.5;cursor:not-allowed" title="Só aparece no recesso mensal, não é ação avulsa"><span class="esc-acao-icone">🍷</span><span>Networking<br><small style="opacity:.7">real (recesso)</small></span></div>
    <div class="esc-acao-btn" style="opacity:.5;cursor:not-allowed" title="Só aparece no recesso mensal, não é ação avulsa"><span class="esc-acao-icone">🛋️</span><span>Descansar<br><small style="opacity:.7">real (recesso)</small></span></div>`;

  el.innerHTML = `
    ${_capaHeader(`CARREIRA · ${(j.escritorio_nome||'ADVOCACIA SOLO').toUpperCase()}`, '🎯 Foco do Personagem', '')}
    <div class="card" style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      Clique num card pra travar como seu foco do mês — fica marcado até você trocar, não navega pra outra tela.
      Pra executar a ação de verdade (escrever a petição, etc), use "abrir tela →" dentro do card. "Estudar habilidade" é o
      <code>study_queue</code> real (R$500, +3 fixo, resultado em 1 mês). "Trabalhar Intensamente" dá +50% de XP de
      skill (Document Type/Practice Area) em toda petição/caso que você concluir enquanto travado, custando disposição
      extra no mês. "Postar em Redes Sociais" gera 1 post automático no feed real todo mês, com 15% de chance de
      viralizar (+1 Comunicação Midiática). O resto marcado 📌 é proposta, sem efeito real.
    </div>

    ${focoLockedHtml}

    <div class="esc-acoes-grid" style="margin-bottom:1rem">
      ${cardsHtml}
      ${propostaHtml}
    </div>

    <div class="card">
      <div style="font-size:.78rem;font-weight:600;margin-bottom:.4rem;color:var(--txt)">📖 Estudar Habilidade <span style="font-size:.65rem;color:var(--verde2);font-weight:400">real, independe do foco travado acima</span></div>
      ${queue.length ? `<div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">Fila atual: ${queue.map(q=>q.skill_label||q.skill).join(', ')}</div>` : ''}
      ${gruposHtml}
    </div>`;
}

window._focoSelecionar = async function(key) {
  const j = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  try {
    await updateDoc(doc(db, 'jogadores', uid), { foco_atual: key });
    if (window.JOGADOR) window.JOGADOR.foco_atual = key;
    window.toast(key ? '🔒 Foco travado.' : 'Foco destravado.', 'ok', 1800);
    renderFoco(window.JOGADOR, document.getElementById('main-content'));
  } catch (e) {
    window.toast(e.message || 'Erro ao travar foco.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// REDES SOCIAIS — perfil de mídia do jogador. Real: skill
// comunicacao_midiatica e views de podcast/mídia (functions/podcasts_social.js).
// Não existe feed, seguidores por plataforma, posts — isso é proposta
// visual do mockup dossiê, não implementado aqui de propósito (não dá
// pra fingir um feed que não existe).
// ════════════════════════════════════════════════════════
// Seguidores por plataforma: NÃO é um contador armazenado (evita virar um
// segundo "sistema de seguidores" fake e desalinhado) — é derivado ao vivo
// de 4 campos reais que já existem: Comunicação Midiática (skills_jur),
// views acumuladas de mídia, Popularidade Pessoal (fama acumulada por
// aparições/conteúdo) e Oral Advocacy (carisma de fala) — com split fixo
// por plataforma. Determinístico: dois jogadores com os mesmos 4 campos
// reais sempre veem o mesmo número, nada sorteado.
const _REDES_PLATAFORMAS = [
  { k:'instagram', l:'Instagram', icone:'📸', peso:0.35 },
  { k:'youtube',   l:'YouTube',   icone:'▶️', peso:0.30 },
  { k:'linkedin',  l:'LinkedIn',  icone:'💼', peso:0.20 },
  { k:'x',         l:'X',         icone:'✖️', peso:0.15 },
];
function _redesSeguidoresTotal(com, viewsAcumul, popularidade, oralAdvocacy) {
  return Math.round(viewsAcumul / 8) + com * 15 + Math.round((popularidade || 0) * 3) + Math.round((oralAdvocacy || 0) * 5);
}

const DIDATICA_CAP_CONTEUDO = 20;

function renderRedes(j, el) {
  const com = (j.skills_jur || {}).comunicacao_midiatica || 0;
  const viewsMes = j.podcast_views_mes || 0;
  const viewsAcumul = j.podcast_views_acumul || 0;
  const autoridade = Math.min(100, Math.round(com * 2));
  const seguidoresTotal = _redesSeguidoresTotal(com, viewsAcumul, j.popularidade_pessoal, j.oral_advocacy);

  // Conteúdo Educativo (ex-Podcast/Talk Show) — movido de Sistemas Sociais
  // pra cá (mesma ação real, window._ssConteudoEducativo em
  // js/sistemas_sociais_ui.js, chamada de fora do arquivo onde foi definida
  // — window.* é global entre módulos). Faz mais sentido junto do resto da
  // marca pessoal do que solto em Sistemas Sociais. Didática Acadêmica só
  // sobe por aqui até DIDATICA_CAP_CONTEUDO — depois, só dar aula
  // (posgraduacao.js::darAula) continua rendendo.
  const mesGlobalPodcast = j.mes_global_pessoal || 0;
  const jaGravouMes = j.podcast_ultimo_mes === mesGlobalPodcast;
  const didaticaAtual = j.didatica_academica || 0;
  const didaticaNoCap = didaticaAtual >= DIDATICA_CAP_CONTEUDO;
  const podcastHtml = `<div class="card" style="margin-bottom:1rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt)">🎓 Gravar Conteúdo Educativo</div>
    <div style="font-size:.68rem;color:var(--txt3);margin:.3rem 0">Chance de viralizar cresce com Oral Advocacy (atual: ${j.oral_advocacy||0}/50). ${didaticaNoCap
      ? `Didática Acadêmica já no limite de conteúdo (${DIDATICA_CAP_CONTEUDO}/50) — dê aulas pra continuar subindo.`
      : `Cada episódio dá +1 Didática Acadêmica (até ${DIDATICA_CAP_CONTEUDO}/50, atual: ${didaticaAtual}).`} Total gravado: ${j.podcast_total||0}.</div>
    <label style="font-size:.62rem;color:var(--txt4);display:block;margin:.5rem 0 .2rem">Área do conteúdo</label>
    <select id="conteudo-edu-area" ${jaGravouMes?'disabled':''} style="width:100%;background:var(--bg2);border:var(--borda);border-radius:var(--r);color:var(--txt);padding:.4rem;font-size:.78rem;margin-bottom:.5rem">
      ${_TODAS_AREAS_KEYS.map(k => `<option value="${k}">${_espLabel2(k)}</option>`).join('')}
    </select>
    <button class="btn btn-prim btn-block" ${jaGravouMes?'disabled':''} onclick="window._ssConteudoEducativo && window._ssConteudoEducativo()">${jaGravouMes ? '✅ Já gravou este mês' : '🎓 Gravar Conteúdo (6⚡)'}</button>
  </div>`;

  el.innerHTML = `
    ${_capaHeader(`MARCA PESSOAL · ${(j.nome_personagem||'—').toUpperCase()}`, '📱 Redes Sociais', '')}
    <div class="card" style="font-size:.72rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      Seguidores por plataforma são derivados ao vivo de Comunicação Midiática + views acumulados + Popularidade Pessoal
      + Oral Advocacy (não é um contador fake separado). DMs usam a Caixa de Entrada real do jogo. O feed abaixo é real
      e persistido (Firestore).
    </div>
    <div class="card" style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;text-align:center;justify-content:center">
      <div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--txt)">${com}<span style="font-size:.8rem;color:var(--txt4)">/50</span></div>
        <div style="font-size:.62rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em">Comunicação Midiática</div>
      </div>
      <div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--navy3)">${autoridade}<span style="font-size:.8rem;color:var(--txt4)">/100</span></div>
        <div style="font-size:.62rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em">Autoridade (com. × 2)</div>
      </div>
      <div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--txt)">${viewsMes.toLocaleString('pt-BR')}</div>
        <div style="font-size:.62rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em">Views este mês</div>
      </div>
      <div>
        <div style="font-size:1.6rem;font-weight:700;color:var(--txt)">${viewsAcumul.toLocaleString('pt-BR')}</div>
        <div style="font-size:.62rem;color:var(--txt3);text-transform:uppercase;letter-spacing:.08em">Views acumulados</div>
      </div>
    </div>
    ${podcastHtml}
    <div class="card">
      <div class="secao-header" style="margin-bottom:.4rem">
        <div class="secao-titulo">Seguidores — ${seguidoresTotal.toLocaleString('pt-BR')} total</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.8rem">
        ${_REDES_PLATAFORMAS.map(p => `
          <div style="text-align:center">
            <div style="font-size:1.1rem">${p.icone}</div>
            <div style="font-size:1rem;font-weight:700;color:var(--txt)">${Math.round(seguidoresTotal*p.peso).toLocaleString('pt-BR')}</div>
            <div style="font-size:.62rem;color:var(--txt4)">${p.l}</div>
          </div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:.6rem;margin-top:.7rem;flex-wrap:wrap">
      <button class="btn btn-ghost" style="flex:1;min-width:180px" onclick="window.navTo('midia_convites',null)">
        🎙️ Ver Convites de Mídia e Podcasts →
      </button>
      <button class="btn btn-ghost" style="flex:1;min-width:180px" onclick="window.navTo('inbox',null)">
        💬 Ver DMs (Caixa de Entrada) →
      </button>
    </div>
    <div id="redes-feed-area" style="margin-top:1rem"></div>`;

  if (window.renderFeedPosts) window.renderFeedPosts(document.getElementById('redes-feed-area'));
}

// ════════════════════════════════════════════════════════
// MARKETING & REPUTAÇÃO — hub real do escritório. Reputação/prestígio
// já existiam no backend (processar_sentenca.js/processar_acordao.js)
// mas esc.reputacao nunca aparecia em nenhuma tela (só esc.prestigio,
// no hero do Escritório) — corrigido aqui. Campanhas virou real (custo do
// caixa, ganho de prestígio via functions/financeiro.js:lancarCampanha,
// espelho abaixo). Redes Sociais/Mídia linkam pras telas reais.
// ════════════════════════════════════════════════════════
const _CAMPANHAS_TIERS = {
  local:    { nome: 'Campanha Local',    custo: 5000,  meses: 2, ganho_prestigio: 3  },
  regional: { nome: 'Campanha Regional', custo: 15000, meses: 3, ganho_prestigio: 8  },
  nacional: { nome: 'Campanha Nacional', custo: 40000, meses: 4, ganho_prestigio: 18 },
};
window._lancarCampanha = async function(tier) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'lancarCampanha');
    const r  = await fn({ tier, nonce: crypto.randomUUID() });
    window.toast(`✅ ${r.data.msg}`, 'ok', 5000);
    setTimeout(() => window._mktRenderTab('campanhas'), 500);
  } catch (e) {
    window.toast(e.message || 'Erro ao lançar campanha.', 'ko');
  }
};

async function renderMarketing(j, el) {
  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">📣 Marketing & Reputação</div></div><div class="card">Carregando...</div>`;

  const escId = j.escritorio_id;
  if (!escId || escId === 'solo') {
    el.innerHTML = `<div class="secao-header"><div class="secao-titulo">📣 Marketing & Reputação</div></div>
      <div class="card" style="color:var(--txt3)">Você precisa estar em um escritório pra ter reputação/prestígio de escritório.</div>`;
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  const esc = escSnap.exists() ? escSnap.data() : {};
  const rep = esc.reputacao || 0;
  const repCap = 55; // functions/processar_sentenca.js:repCapDoCargo('escritorio') — 'escritorio' não tem chave própria, cai no fallback
  const prestigio = esc.prestigio || 0;

  let convitesPendentes = 0;
  try {
    const cSnap = await getDocs(query(collection(db, 'escritorios', escId, 'convites_midia'), where('status', '==', 'pendente')));
    convitesPendentes = cSnap.size;
  } catch (e) { /* silencioso */ }

  window._mktEscId = escId;

  el.innerHTML = `
    ${_capaHeader(`GESTÃO DE MARKETING · ${(esc.nome||'—').toUpperCase()}`, '📣 Marketing & Reputação', '')}
    <div class="stat-row stat-row-4">
      <div class="stat"><div class="stat-label">Investido no mês</div><div class="stat-value">${_fmtExt(_investidoMarketingAtivo(esc))}</div></div>
      <div class="stat"><div class="stat-label">Reputação</div><div class="stat-value up">${rep}<small>/${repCap}</small></div></div>
      <div class="stat"><div class="stat-label">Prestígio</div><div class="stat-value">${prestigio}<small>/100</small></div></div>
      <div class="stat"><div class="stat-label">Convites pendentes</div><div class="stat-value" style="color:${convitesPendentes?'var(--amber)':'var(--txt)'}">${convitesPendentes}</div></div>
    </div>
    <div class="equipe-tabs" id="mkt-tabs" style="margin-top:.4rem">
      <div class="equipe-tab ativo" data-mktab="geral" onclick="window._mktTab(this,'geral')">Visão Geral</div>
      <div class="equipe-tab" data-mktab="campanhas" onclick="window._mktTab(this,'campanhas')">Campanhas</div>
      <div class="equipe-tab" data-mktab="redes" onclick="window._mktTab(this,'redes')">Redes Sociais</div>
      <div class="equipe-tab" data-mktab="midia" onclick="window._mktTab(this,'midia')">Mídia &amp; Podcasts</div>
      <div class="equipe-tab" data-mktab="reputacao" onclick="window._mktTab(this,'reputacao')">Reputação</div>
    </div>
    <div id="mkt-conteudo"></div>`;

  window._mktRenderTab('geral', esc, rep, repCap, prestigio, convitesPendentes);
}

window._mktTab = function(btn, tab) {
  btn.parentElement.querySelectorAll('.equipe-tab').forEach(t => t.classList.toggle('ativo', t === btn));
  window._mktRenderTab(tab, window._mktEscCache);
};

window._mktRenderTab = async function(tab, escCached) {
  const el = document.getElementById('mkt-conteudo');
  if (!el) return;
  const escId = window._mktEscId;
  let esc = escCached;
  if (!esc) {
    const s = await getDoc(doc(db, 'escritorios', escId));
    esc = s.exists() ? s.data() : {};
    window._mktEscCache = esc;
  }
  const rep = esc.reputacao || 0;
  const repCap = 55;
  const prestigio = esc.prestigio || 0;

  if (tab === 'geral') {
    let pendentesSnap;
    try {
      pendentesSnap = await getDocs(query(collection(db, 'escritorios', escId, 'convites_midia'), where('status', '==', 'pendente')));
    } catch (e) { pendentesSnap = { size: 0 }; }
    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.4rem">
          <div class="secao-titulo">Convites de Mídia</div>
          <span style="font-size:.72rem;color:var(--txt3)">${pendentesSnap.size||0} pendente(s)</span>
        </div>
        <div style="font-size:.78rem;color:var(--txt3);margin-bottom:.6rem">Reais — chegam pro escritório ou direto a um advogado quando uma petição viraliza.</div>
        <button class="btn btn-prim btn-block" onclick="window.navTo('midia_convites',null)">🎙️ Ver Convites de Mídia e Podcasts →</button>
      </div>
      <div class="esc-card-bloco">
        <div class="secao-header" style="margin-bottom:.4rem">
          <div class="secao-titulo">Próximas Ações Sugeridas</div>
          <span style="font-size:.62rem;color:var(--txt4)">proposta</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:.6rem">
          <div style="display:flex;gap:.6rem;align-items:flex-start"><span>🎙️</span><div><div style="font-size:.8rem;color:var(--txt)">Aumentar frequência de podcasts</div><div style="font-size:.7rem;color:var(--txt4)">Convites de mídia têm o melhor ROI em reputação por real investido.</div></div></div>
          <div style="display:flex;gap:.6rem;align-items:flex-start"><span>🤝</span><div><div style="font-size:.8rem;color:var(--txt)">Investir em parcerias</div><div style="font-size:.7rem;color:var(--txt4)">Proposta — parcerias institucionais não existem como mecânica ainda.</div></div></div>
        </div>
      </div>`;
    return;
  }

  if (tab === 'campanhas') {
    const caixa = esc.caixa || 0;
    const ativas = esc.campanhas_ativas || [];
    el.innerHTML = `
      <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:.7rem">
        Real: custo sai do caixa do escritório (${_fmtExt(caixa)} disponível), ganho de prestígio distribuído ao longo da
        duração — prestígio multiplica geração de oportunidades (functions/avancar_mes.js:_multiplicadorPrestigioCF).
      </div>
      ${ativas.length > 0 ? `
      <div class="esc-card-bloco" style="margin-bottom:1rem">
        <div class="secao-header" style="margin-bottom:.4rem"><div class="secao-titulo">Campanhas Ativas</div></div>
        ${ativas.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;font-size:.78rem;border-bottom:1px solid var(--borda-cor,#2a2a2e)">
            <span>${c.nome}</span>
            <span style="color:var(--txt3)">${c.meses_restantes}/${c.meses_total} meses · +${c.ganho_prestigio_total} prestígio total</span>
          </div>`).join('')}
      </div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.8rem">
        ${Object.entries(_CAMPANHAS_TIERS).map(([tier, c]) => `
          <div class="peca-card">
            <div class="peca-topo"><div><div class="peca-kicker">📣 ${c.nome.toUpperCase()}</div></div></div>
            <div class="perf-row"><span>Custo</span><b>${_fmtExt(c.custo)}</b></div>
            <div class="perf-row"><span>Duração</span><b>${c.meses} meses</b></div>
            <div class="perf-row"><span>Ganho de prestígio</span><b>+${c.ganho_prestigio}</b></div>
            <button class="btn-avancar oport-btn" style="width:100%;margin-top:.5rem" ${caixa < c.custo ? 'disabled title="Caixa insuficiente"' : ''} onclick="window._lancarCampanha('${tier}')">Lançar</button>
          </div>`).join('')}
      </div>`;
    return;
  }

  if (tab === 'redes') {
    el.innerHTML = `
      <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:.7rem">
        Perfil de marca pessoal do jogador — Comunicação Midiática, Autoridade, seguidores por plataforma (derivados,
        não é sistema separado) e DMs reais via Caixa de Entrada.
      </div>
      <button class="btn btn-prim btn-block" onclick="window.navTo('redes',null)">📱 Ver Redes Sociais →</button>`;
    return;
  }

  if (tab === 'midia') {
    let historico = [];
    try {
      const logSnap = await getDocs(query(collection(db, 'escritorios', escId, 'log_gestao'), orderBy('criado_em', 'desc'), limit(40)));
      historico = logSnap.docs.map(d => d.data())
        .filter(l => /podcast|mídia|viralizou|entrevista/i.test(l.texto||'')).slice(0, 8);
    } catch (e) { /* silencioso */ }
    el.innerHTML = `
      <div class="esc-card-bloco" style="margin-bottom:1.1rem">
        <div class="secao-header" style="margin-bottom:.4rem"><div class="secao-titulo">Convites Disponíveis</div></div>
        <button class="btn btn-prim btn-block" onclick="window.navTo('midia_convites',null)">🎙️ Ver Convites de Mídia e Podcasts →</button>
      </div>
      <div class="esc-card-bloco">
        <div class="secao-header" style="margin-bottom:.4rem"><div class="secao-titulo">Histórico de Aparições</div></div>
        ${historico.length ? historico.map(l => `
          <div class="equipe-hist-item">
            <span class="equipe-hist-icone">🎙️</span>
            <span class="equipe-hist-texto">${l.texto}</span>
            <span class="equipe-hist-data">${l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : ''}</span>
          </div>`).join('') : `<div style="font-size:.76rem;color:var(--txt4);padding:.5rem 0">Nenhuma aparição registrada ainda.</div>`}
      </div>`;
    return;
  }

  if (tab === 'reputacao') {
    el.innerHTML = `
      <div class="equipe-layout" style="grid-template-columns:220px 1fr">
        <div class="equipe-detalhe" style="position:static;text-align:center">
          <div class="donut" style="width:104px;height:104px;margin:0 auto;background:conic-gradient(var(--ouro2) 0% ${Math.round(rep/repCap*100)}%, var(--bg2) ${Math.round(rep/repCap*100)}% 100%)">
            <div class="donut-hole"><div class="donut-pct">${rep}</div><div class="donut-lbl">/ ${repCap}</div></div>
          </div>
          <div style="margin-top:.7rem;font-size:.82rem;color:var(--txt)">Reputação do Escritório</div>
          <div style="font-size:.78rem;color:var(--txt3);margin-top:.6rem">Prestígio: <b style="color:var(--txt)">${prestigio}/100</b></div>
        </div>
        <div class="card" style="font-size:.74rem;color:var(--txt3);line-height:1.6">
          Reputação e Prestígio são reais — sobem com vitórias em processos, prestígio cai com derrotas
          (functions/processar_sentenca.js). Sem histórico mensal salvo ainda, então não dá pra mostrar
          evolução mês a mês nem distribuição por canal — isso seria proposta.
        </div>
      </div>`;
    return;
  }
};

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
  const cap    = window.REP_CAP[j.cargo_id] || 55;
  const skills = j.skills || {};
  const skJur  = j.skills_jur || {};
  const queue  = j.study_queue || [];
  const SKDEF  = _getSkills();
  const vaga   = j.vaga_tipo || 'contencioso';
  const TIPO_SK = {
    contencioso:  ['oratoria','argumentacao','persuasao','pesquisa'],
    peticionante: ['escrita','argumentacao','pesquisa','negociacao'],
    consultivo:   ['escrita','negociacao','pesquisa','gestao'],
    societario:   ['negociacao','networking','gestao','argumentacao'],
  };
  const prioridades = TIPO_SK[vaga] || TIPO_SK.contencioso;
  const oab         = j.oab || false;
  const tentativas  = j.bar_exam_tentativas || 0;
  const score       = j.bar_exam_ultimo_score ?? null;

  const BASE_SKILLS = [
    { k: 'legal_drafting',   l: 'Redação Jurídica',   w: 0.30 },
    { k: 'legal_research',   l: 'Pesquisa Jurídica',  w: 0.30 },
    { k: 'argumentation',    l: 'Argumentação',        w: 0.25 },
    { k: 'oral_advocacy',    l: 'Sustentação Oral',    w: 0    },
    { k: 'negotiation',      l: 'Negociação',          w: 0    },
    { k: 'procedure',        l: 'Litigância',          w: 0.15 },
    { k: 'gestao',           l: 'Gestão',              w: 0    },
  ];
  const DOC_SKILLS = [
    { k: 'doc_initial_filing',      l: 'Petição Inicial'          },
    { k: 'doc_responsive_pleading', l: 'Contestação'              },
    { k: 'doc_motion',              l: 'Requerimento'             },
    { k: 'doc_appellate_brief',     l: 'Razões de Apelação'       },
    { k: 'doc_supreme_brief',       l: 'Razões de Rec. Especial'  },
    { k: 'doc_trial_brief',         l: 'Memoriais'                },
    { k: 'doc_evidence',            l: 'Prova Documental'         },
    { k: 'doc_deposition',          l: 'Depoimento'               },
  ];
  const AREA_SKILLS = [
    { k: 'area_employment',  l: 'Trabalhista'    },
    { k: 'area_tax',         l: 'Tributário'     },
    { k: 'area_civil',       l: 'Cível'          },
    { k: 'area_criminal',    l: 'Criminal'       },
    { k: 'area_corporate',   l: 'Empresarial'    },
    { k: 'area_immigration', l: 'Imigração'      },
    { k: 'area_bankruptcy',  l: 'Rec. Judicial'  },
  ];

  const capJur = Math.round(50 * (1 + (j.posgrad_bonus_skill || 0)));
  const previewScore = BASE_SKILLS.reduce((a, s) => a + (skJur[s.k]||0) * s.w, 0).toFixed(1);

  function skBar(val, capV) {
    const pct = Math.min(100, Math.round(val / capV * 100));
    return `<div class="sk-bar"><div class="sk-bar-fill" style="width:${pct}%"></div></div>`;
  }

  // Regra de estrelas das skills jurídicas (Base/Documento/Área — escala /50):
  // 1★ 10-19, 2★ 20-29, 3★ 30-39, 4★ 40-49, 5★ 50+.
  function skEstrelas(val) {
    const n = val >= 50 ? 5 : val >= 40 ? 4 : val >= 30 ? 3 : val >= 20 ? 2 : val >= 10 ? 1 : 0;
    return n > 0 ? `<span class="sk-estrelas" title="${n}/5 estrelas">${'⭐'.repeat(n)}</span>` : '';
  }

  function skRowGeral(sk) {
    const val     = skills[sk.k] || 0;
    const isPrior = prioridades.includes(sk.k);
    const emEst   = queue.some(q => q.skill === sk.k);
    const isCap   = val >= cap;
    return `<tr class="sk-row">
      <td class="sk-nome">${isPrior ? '<span class="sk-prior">⭐</span>' : ''} ${sk.l}</td>
      <td class="sk-nivel">
        <span class="sk-num">${val}<span class="sk-cap">/${cap}</span></span>
        ${skBar(val, cap)}
      </td>
      <td class="sk-acao">
        ${isCap
          ? `<span class="sk-max">MAX</span>`
          : emEst
            ? `<span class="sk-pendente">⏳</span>`
            : `<button class="sk-btn" onclick="window.estudarSkill && window.estudarSkill('${sk.k}','${sk.l}')">📖 +3</button>`}
      </td>
    </tr>`;
  }

  function skRowJur(sk, src) {
    const val   = src[sk.k] || 0;
    const emEst = queue.some(q => q.skill === sk.k);
    const isCap = val >= capJur;
    const label = sk.l + (sk.w > 0 ? ` <span class="sk-peso">(${sk.w*100}%)</span>` : '');
    return `<tr class="sk-row">
      <td class="sk-nome">${label}</td>
      <td class="sk-nivel">
        <span class="sk-num">${val}<span class="sk-cap">/${capJur}</span></span> ${skEstrelas(val)}
        ${skBar(val, capJur)}
      </td>
      <td class="sk-acao">
        ${isCap
          ? `<span class="sk-max">MAX</span>`
          : emEst
            ? `<span class="sk-pendente">⏳</span>`
            : `<button class="sk-btn" onclick="window.estudarSkillJur && window.estudarSkillJur('${sk.k}','${sk.l}')">📖 +3</button>`}
      </td>
    </tr>`;
  }

  const didatica = j.didatica_academica || 0;
  const emEstDid = queue.some(q => q.skill === 'didatica_academica');

  el.innerHTML = `
    ${_capaHeader('FICHA DE QUALIFICAÇÃO · ADVOCATUS ONLINE', '⚡ Habilidades',
      `<span class="pill pill-cargo">Cap geral ${cap}</span><span class="pill pill-oab">Vaga: ${_vagaLabel(vaga)}</span>`
      + (capJur > 50 ? `<span class="pill pill-oab" title="Bônus de teto de skill do pós-graduação (Mestrado +10% / Doutorado +25%)">Teto Skills Jur. ${capJur} (bônus pós-grad)</span>` : ''))}

    <table class="skills-table">
      <thead>
        <tr><th class="sk-th-nome">Habilidade</th><th class="sk-th-nivel">Nível</th><th></th></tr>
      </thead>
      <tbody>

        <tr class="sk-categoria"><td colspan="3">Habilidades Gerais</td></tr>
        ${SKDEF.map(skRowGeral).join('')}

        <tr class="sk-categoria">
          <td colspan="3">Skills Jurídicas — Base
            <span class="sk-oab-badge ${oab ? 'ok' : ''}">${oab ? 'OAB ✓' : 'OAB pendente'}</span>
            <span class="sk-score">Score: ${previewScore}/50 · Aprovação: 32,5${score !== null ? ` · Última: ${score}` : ''}</span>
          </td>
        </tr>
        ${BASE_SKILLS.map(sk => skRowJur(sk, skJur)).join('')}
        ${!oab ? `<tr class="sk-row"><td colspan="2" class="sk-nome" style="color:var(--ardosia2)">Exame OAB</td>
          <td class="sk-acao" style="white-space:nowrap">
            <button class="sk-btn" onclick="window.matricularPrep && window.matricularPrep()">Bar Prep</button>
            <button class="sk-btn sk-btn-prim" onclick="window.tentarBarExam && window.tentarBarExam()">Fazer Exame${tentativas>0?` (${tentativas}ª)`:''}</button>
          </td></tr>` : ''}

        <tr class="sk-categoria"><td colspan="3">Tipos de Documento</td></tr>
        ${DOC_SKILLS.map(sk => skRowJur(sk, skJur)).join('')}

        <tr class="sk-categoria"><td colspan="3">Áreas do Direito</td></tr>
        ${AREA_SKILLS.map(sk => skRowJur(sk, skJur)).join('')}

        <tr class="sk-categoria"><td colspan="3">Acadêmico</td></tr>
        <tr class="sk-row">
          <td class="sk-nome">Didática Acadêmica</td>
          <td class="sk-nivel">
            <span class="sk-num">${didatica}<span class="sk-cap">/50</span></span> ${skEstrelas(didatica)}
            ${skBar(didatica, 50)}
          </td>
          <td class="sk-acao">
            ${didatica >= 50 ? `<span class="sk-max">MAX</span>` : emEstDid ? `<span class="sk-pendente">⏳</span>` : '—'}
          </td>
        </tr>

      </tbody>
    </table>

    ${_mentoriaComposicaoBloco(j)}`;
}


function _mentoriaComposicaoBloco(j) {
  const ativa = j.mentoria_composicao_ativa || false;
  return `
    <div style="margin-top:.8rem;padding:.6rem;background:var(--fundo2);border-radius:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:.78rem;font-weight:600">Mentoria de Composição</div>
        <div style="font-size:.7rem;color:var(--ardosia2)">
          ${ativa
            ? '+4 XP/mês em Legal Drafting e Legal Research · Sênior+ supervisionando'
            : 'Ative para receber +4 XP/mês (requer NPC Sênior+ na equipe)'}
        </div>
      </div>
      <button class="btn btn-sm ${ativa ? 'btn-prim' : 'btn-ghost'}"
        onclick="window._toggleMentoriaComp(${ativa})">
        ${ativa ? 'Ativo ✓' : 'Ativar'}
      </button>
    </div>`;
}

window._toggleMentoriaComp = async function(atualAtiva) {
  const j = window.JOGADOR;
  if (!j) return;
  const novoValor = !atualAtiva;
  try {
    await updateDoc(doc(db, 'jogadores', j.uid), { mentoria_composicao_ativa: novoValor });
    toast(novoValor
      ? '✅ Mentoria de composição ativada! +4 XP/mês em Drafting e Research.'
      : 'Mentoria de composição desativada.', 'ok', 3000);
    window.dispatchEvent(new CustomEvent('gamestate:reload'));
  } catch(e) {
    toast('Erro: ' + e.message, 'erro');
  }
};

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
    ${_capaHeader('CAIXA DE ENTRADA · ADVOCATUS ONLINE', '📬 Mensagens', '')}
    <div style="display:flex;justify-content:flex-end;margin-bottom:.6rem">
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
      <div onclick="window.recessoEscolha('networking')" style="background:rgba(176,138,78,.06);border:var(--borda);border-radius:2px;padding:.9rem;text-align:center;cursor:pointer">
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

// Cor centralizada de barra de status (estilo Popmundo): amarelo=100%, verde=75-99%,
// azul=25-74%, vermelho=0-24% (Reputação nunca fica vermelha — usa semVermelho).
function getBarColor(valor, { semVermelho = false } = {}) {
  if (valor === 100) return 'amarela';
  if (valor >= 75) return 'verde';
  if (valor >= 25) return 'azul';
  return semVermelho ? 'azul' : 'vermelha';
}

function _barraStatus(icon, valor, opts = {}, ehEmoji = false) {
  const cor = getBarColor(valor, opts);
  const label = opts.label || '';
  const iconeHtml = ehEmoji
    ? `<span class="barra-status-icone barra-status-icone-emoji" title="${label}">${icon}</span>`
    : `<img class="barra-status-icone" src="${icon}" alt="${label}" title="${label}">`;
  return `
  <div class="barra-status-linha">
    ${iconeHtml}
    <div class="barra-status-wrap"><div class="barra-status-fill barra-${cor}" style="width:${Math.max(0,Math.min(100,valor))}%"></div></div>
    <span class="barra-status-pct">${Math.round(valor)}%</span>
  </div>`;
}

function _miniStatCard(icon, label, val, tipo) {
  const cor = tipo==='money'?'var(--verde2)':tipo==='gold'?'var(--ouro2)':tipo==='danger'?'var(--verm2)':'var(--txt)';
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
