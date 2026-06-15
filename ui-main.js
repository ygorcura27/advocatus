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
    case 'equipe':       renderEquipe(j, main);        break;
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
    case 'vida_pessoal': renderVidaPessoal(j, main);   break;
    case 'ranking':
      if (window.renderRanking) window.renderRanking(j, main);
      break;
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
      ${_miniStatCard('💰','Saldo',fmt(j.dinheiro||0),'money')}
      ${_miniStatCard('📈','Renda/mês',fmt(j.renda_calculada||0),'money')}
      ${_miniStatCard('💸','Despesas',fmt(j.despesas_calculadas||0),'danger')}
      ${_miniStatCard('🏅','Reputação',`${j.reputacao||0}/${cap}`,'gold')}
    </div>

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
      <span class="secao-badge">${s.mes_nome||'Janeiro'}, Ano ${s.ano_jogo||1}</span>
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
            <span class="activity-date">${_formatarData(m.criado_em)}</span>
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
    <div class="secao-header" style="margin-top:.5rem">
      <div class="secao-titulo">📁 Processos Encerrados</div>
    </div>
    <div id="lista-processos-enc">
      <div style="font-size:.78rem;color:var(--ardosia)">Carregando...</div>
    </div>`;

  _carregarProcessos(j.uid);
}

async function _carregarProcessos(uid) {
  try {
    // Ativos
    const qA = query(
      collection(db, 'processos'),
      where('advogado_uid', '==', uid),
      where('status', '==', 'andamento'),
      orderBy('criado_mes', 'desc'),
      limit(20)
    );
    // Encerrados
    const qE = query(
      collection(db, 'processos'),
      where('advogado_uid', '==', uid),
      where('status', 'in', ['ganho','perdido','encerrado_cargo']),
      orderBy('encerrado_mes', 'desc'),
      limit(10)
    );

    const [snapA, snapE] = await Promise.all([getDocs(qA), getDocs(qE)]);

    const listaA = document.getElementById('lista-processos');
    const listaE = document.getElementById('lista-processos-enc');

    if (listaA) listaA.innerHTML = snapA.empty
      ? '<div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Nenhum processo ativo. Aceite um novo caso.</div>'
      : snapA.docs.map(d => _cardProcesso(d.id, d.data())).join('');

    if (listaE) listaE.innerHTML = snapE.empty
      ? '<div style="font-size:.78rem;color:var(--ardosia);padding:.5rem 0">Nenhum processo encerrado.</div>'
      : snapE.docs.map(d => _cardProcessoEnc(d.id, d.data())).join('');

    // Atualizar badge
    const count = snapA.size;
    ['badge-proc'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = count>0?'':'none'; el.textContent=String(count); }
    });
  } catch (err) { console.error('[UI] Processos:', err); }
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
  const isSolo  = !j.escritorio_proprio_id && j.escritorio_id === 'solo';
  const escNome = j.escritorio_nome || 'Advocacia Solo';

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🏢 Escritório</div>
      ${isSolo ? `<button class="btn btn-sm btn-sec" onclick="window.criarEscritorio && window.criarEscritorio()">+ Criar escritório</button>` : ''}
    </div>
    ${isSolo ? `
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
    </div>` : `
    <div class="card">
      <div class="card-titulo">${escNome}</div>
      <div class="card-sub">Seu escritório atual. Detalhes carregando...</div>
    </div>
    <div id="escritorio-detalhes">Carregando...</div>`}`;

  if (!isSolo && j.escritorio_empregado_id) {
    _carregarEscritorio(j.escritorio_empregado_id);
  }
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
      Skills marcadas com ⭐ são prioritárias para sua vaga atual. Estudar custa R$500 e demora 1 mês.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem">
      ${SKDEF.map(sk => {
        const val     = skills[sk.k] || 0;
        const isPrior = prioridades.includes(sk.k);
        const emEst   = queue.some(q => q.skill === sk.k);
        return `
        <div class="card" style="border-color:rgba(184,146,42,${isPrior?.3:.15})">
          <div class="skill-header">
            <span>${isPrior?'⭐ ':''}<b style="color:${isPrior?'var(--ouro2)':'var(--perg)'}">${sk.l}</b></span>
            <span class="sk-val">${val}/${cap}</span>
          </div>
          <div style="font-size:.65rem;color:var(--ardosia);margin-bottom:.3rem">${sk.desc}</div>
          <div class="skill-bar">
            <div class="skill-fill ${isPrior?'destaque':''}" style="width:${Math.round(val/cap*100)}%"></div>
          </div>
          ${emEst
            ? `<div class="skill-pendente">⏳ Estudo em andamento — resultado no próximo mês</div>`
            : `<button class="btn btn-sm btn-ghost" style="margin-top:.4rem;width:100%;font-size:.65rem"
                onclick="window.estudarSkill && window.estudarSkill('${sk.k}','${sk.l}')">
                📖 Estudar +2 · R$500 · 1 mês
              </button>`}
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
function renderVidaPessoal(j, el) {
  const ESTADO_CIVIL = { solteiro:'Solteiro(a)', namorando:'Namorando', casado:'Casado(a)', divorciado:'Divorciado(a)' };
  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">👤 Vida Pessoal</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1rem">
      ${_miniStatCard('🎂','Idade',`${j.idade||22} anos`,'')}
      ${_miniStatCard('💑','Estado civil',ESTADO_CIVIL[j.estado_civil]||'Solteiro(a)','')}
      ${_miniStatCard('👶','Filhos',String(j.filhos||0),'')}
      ${_miniStatCard('🌿','Geração',`${j.geracao||1}ª geração`,'')}
    </div>
    <div class="card" style="color:var(--ardosia2);font-size:.8rem;text-align:center;padding:1.5rem">
      Sistema de vida pessoal em desenvolvimento. Em breve: relacionamentos, casamento, filhos e herança.
    </div>`;
}

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
function _miniStatCard(icon, label, val, tipo) {
  const cor = tipo==='money'?'var(--verde3)':tipo==='gold'?'var(--ouro2)':tipo==='danger'?'var(--verm3)':'var(--perg)';
  return `<div class="stat-mini">
    <div class="v" style="color:${cor}">${val}</div>
    <div class="l">${icon} ${label}</div>
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

function _formatarData(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch (_) { return iso; }
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
