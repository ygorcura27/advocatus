/**
 * INVESTIGAÇÃO, FAVORES E JULGAMENTO — Advocatus Online
 * GDD addendum v1.0. Painel do loop Intake → Investigação → Montagem →
 * Julgamento. Substitui a tela de audiência legada.
 *
 * Convenções seguidas do resto do app (ver js/processos.js, jogo.html):
 *  - Toda mutação de estado passa por Cloud Function callable
 *    (`httpsCallable(window.FB_FUNCTIONS, 'nome')(payload)`), nunca grava
 *    direto no Firestore — o servidor recalcula tudo (turnos, favores,
 *    veredito) a partir do estado salvo.
 *  - Rendering direto em `#main-content` (registrado via `window.renderInvestigacao`,
 *    chamado por js/ui-main.js quando o painel ativo é 'investigacao').
 *  - `abrirModal`/`fecharModal`/`toast` (globais, definidos em jogo.html) são
 *    reaproveitados para os popups de nó (entrevista, perícia, etc.).
 */

import { collection, query, where, getDocs, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import { sortearCandidatosVademecum } from './banco_vademecum.js';

let _procId = null;
let _procCache = null;

// ─── Helper de chamada de Cloud Function (mesmo padrão de jogo.html) ───────

async function callFn(nome, payload) {
  let tentativas = 0;
  while (!window.FB_FUNCTIONS && tentativas < 30) {
    await new Promise(r => setTimeout(r, 300));
    tentativas++;
  }
  if (!window.FB_FUNCTIONS) throw new Error('Firebase Functions não inicializado. Recarregue a página.');
  const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
  const fn = httpsCallable(window.FB_FUNCTIONS, nome);
  const result = await fn(payload || {});
  return result.data;
}

function erroAmigavel(err) {
  const msg = (err.message || err.details || '').replace('Firebase: ', '').replace(/\s*\(.*\)\s*$/, '');
  return msg || 'Erro desconhecido.';
}

// ─── Entrada do painel (chamada por js/ui-main.js) ─────────────────────────

window.abrirInvestigacao = function(processoId) {
  _procId = processoId;
  _procCache = null;
  window.navTo ? window.navTo('investigacao') : null;
};

window.renderInvestigacao = async function(j, main) {
  if (!_procId) {
    await _renderListaCasos(j, main);
    return;
  }
  main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando caso...</div>';
  try {
    const snap = await getDoc(doc(db, 'processos', _procId));
    if (!snap.exists()) { _procId = null; return _renderListaCasos(j, main); }
    let p = snap.data();

    if (!p.investigacao) {
      const r = await callFn('iniciarCasoInvestigativo', { processo_id: _procId });
      p = { ...p, investigacao: r.investigacao };
    }
    _procCache = p;
    _renderFase(j, main, p);
  } catch (err) {
    main.innerHTML = `<div class="card" style="color:var(--verm2)">Erro ao carregar investigação: ${erroAmigavel(err)}</div>`;
  }
};

async function _renderListaCasos(j, main) {
  main.innerHTML = '<div class="card" style="color:var(--txt3)">Carregando seus casos...</div>';
  const uid = j.uid;
  const qy = query(collection(db, 'processos'), where('advogado_uid', '==', uid));
  const snap = await getDocs(qy);
  // 'andamento' é o status inicial de todo caso novo (mantido assim de
  // propósito — ver nota em js/processos.js — a transição para
  // 'investigacao' só ocorre dentro de iniciarCasoInvestigativo, via Admin
  // SDK, na primeira vez que o caso é aberto).
  const casos = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => ['andamento', 'investigacao', 'montagem', 'julgamento', 'aguardando_decisao_sentenca'].includes(p.status));

  if (casos.length === 0) {
    main.innerHTML = `
      <div class="card">
        <div class="card-titulo">Investigação</div>
        <div class="card-sub">Nenhum caso em investigação no momento. Assuma um novo processo para começar.</div>
      </div>`;
    return;
  }

  main.innerHTML = `
    <div class="card">
      <div class="card-titulo">Casos em andamento</div>
      <div class="card-sub">Selecione um caso para continuar a investigação.</div>
      <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.75rem">
        ${casos.map(p => `
          <div class="card" style="cursor:pointer" onclick="window.abrirInvestigacao('${p.id}')">
            <div class="card-titulo">${p.titulo || p.area || 'Processo'}</div>
            <div class="card-sub">Fase: ${_labelFase(p.status)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function _labelFase(status) {
  return {
    investigacao: 'Investigação', montagem: 'Montagem de Estratégia',
    julgamento: 'Julgamento', aguardando_decisao_sentenca: 'Aguardando decisão',
  }[status] || status;
}

// ─── Dispatcher por fase ────────────────────────────────────────────────────

function _renderFase(j, main, p) {
  const inv = p.investigacao;
  if (p.status === 'aguardando_decisao_sentenca' || inv.fase === 'encerrado') return _renderVeredito(j, main, p);
  if (inv.fase === 'julgamento') return _renderJulgamento(j, main, p);
  if (inv.fase === 'montagem') return _renderMontagem(j, main, p);
  return _renderMapaInvestigacao(j, main, p);
}

function _barraTurnos(inv) {
  const restantes = inv.turnos_totais - inv.turnos_usados;
  return `
    <div class="inv-hud">
      <span class="inv-hud-item">Dia ${inv.dia}</span>
      <span class="inv-hud-item">${inv.periodo === 'manha' ? 'Manhã' : inv.periodo === 'tarde' ? 'Tarde' : 'Noite'}</span>
      <span class="inv-hud-item ouro">${restantes}/${inv.turnos_totais} turnos restantes</span>
    </div>`;
}

// ─── Tela: Mapa de Investigação ─────────────────────────────────────────────

const ICONE_NO = {
  consulta: '📞', analise_documental: '📄', entrevista: '🗣️',
  pericia: '🔬', favor_relacionamento: '🤝',
};

// Material físico por tipo de nó (Art Direction v1.0, §9.3) — usado no
// atributo data-mat do card para o detalhe visual (clipe/tachinha/envelope).
const MATERIAL_NO = {
  consulta: 'clip', analise_documental: 'clip', pericia: 'clip',
  entrevista: 'pin', favor_relacionamento: 'pin',
};

function _renderMapaInvestigacao(j, main, p) {
  const inv = p.investigacao;
  const nosVisiveis = inv.nos.filter(n => n.status !== 'oculto');
  const revelados = inv.nos.filter(n => n.status === 'revelado').length;

  main.innerHTML = `
    <div class="inv-scenario">
      <div class="inv-titulo-caso">${p.titulo || 'Investigação'}</div>
      <div class="inv-sub-caso">${p.relato_cliente || 'O cliente relatou o caso — investigue os nós disponíveis antes que os turnos se esgotem.'}</div>
      ${_barraTurnos(inv)}
      <div class="inv-nos-grid">
        ${nosVisiveis.map(no => `
          <div class="inv-no inv-no-${no.status}" data-mat="${no.status === 'oculto' ? 'envelope' : (MATERIAL_NO[no.tipo] || 'clip')}" ${no.status !== 'revelado' ? `onclick="window._invAbrirNo('${no.id}')"` : ''}>
            <div class="inv-no-icone">${ICONE_NO[no.tipo] || '❓'}</div>
            <div class="inv-no-tipo">${_labelTipoNo(no.tipo)}</div>
            ${no.status === 'revelado'
              ? `<div class="inv-no-peca ${no.peca?.suja ? 'suja' : ''}">Força ${no.peca?.forca ?? '—'}${no.peca?.suja ? ' · suja' : ''}</div>`
              : no.status === 'bloqueado'
                ? `<div class="inv-no-bloqueio">🔒 ${no.bloqueio?.tipo === 'favor' ? 'Requer favor' : 'Requer confiança'}</div>`
                : `<div class="inv-no-acao">Investigar</div>`}
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
        <button class="btn btn-sec" onclick="window._invAbrirVademecum()">📖 Vade Mecum</button>
        <button class="btn btn-prim" ${revelados === 0 ? 'disabled' : ''} onclick="window._invIrParaMontagem()">Ir para Montagem de Estratégia</button>
      </div>
    </div>`;
}

function _labelTipoNo(tipo) {
  return {
    consulta: 'Consulta rápida', analise_documental: 'Análise documental',
    entrevista: 'Entrevista', pericia: 'Perícia técnica',
    favor_relacionamento: 'Favor / Relacionamento',
  }[tipo] || tipo;
}

window._invIrParaMontagem = function() {
  // Força fase de montagem no cliente apenas para navegar; o servidor
  // valida/atualiza a fase de fato em confirmarMontagem. Antes também
  // chamava window.renderInvestigacao() aqui, que refaz um getDoc() no
  // processo — como o servidor ainda não sabia da mudança de fase (só
  // confirmarMontagem grava isso), aquele fetch voltava com fase
  // 'investigacao' e, ao resolver um instante depois, sobrescrevia
  // _procCache e re-renderizava o mapa por cima da Montagem, revertendo
  // a tela sem nenhum aviso — exatamente o "não avançou" reportado.
  if (_procCache) { _procCache.investigacao.fase = 'montagem'; _renderMontagem(window.JOGADOR, document.getElementById('main-content'), _procCache); }
};

window._invAbrirNo = async function(noId) {
  const inv = _procCache.investigacao;
  const no = inv.nos.find(n => n.id === noId);
  if (!no) return;

  if (no.status === 'bloqueado') return _renderPopupBloqueio(no);
  if (no.tipo === 'consulta') return _executarNo(noId, null);
  if (no.tipo === 'analise_documental') return _renderPopupAnaliseDocumental(no);
  if (no.tipo === 'entrevista') { window._invDeclEscolhida = null; return _renderPopupEntrevista(no); }
  if (no.tipo === 'pericia') return _renderPopupPericia(no);
};

async function _executarNo(noId, escolha) {
  window.fecharModal && window.fecharModal();
  window.toast && window.toast('⏳ Investigando...', 'neutro', 1500);
  try {
    const r = await callFn('executarAcaoInvestigacao', { processo_id: _procId, no_id: noId, escolha });
    _procCache.investigacao = r.investigacao;
    const acertou = r.acertou ?? r.acertouDeclaracao;
    window.toast && window.toast(
      acertou === false ? '🔎 Peça revelada — mas mais fraca (não era o detalhe certo).' : `✅ Peça revelada — força ${r.peca?.forca ?? ''}.`,
      acertou === false ? 'neutro' : 'ok', 3500,
    );
    _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
}

function _renderPopupAnaliseDocumental(no) {
  const campos = no.dados_puzzle.campos;
  window.abrirModal('Análise documental', `
    <p style="color:var(--txt3);margin-bottom:.75rem">Um dos campos abaixo não bate com o resto do caso. Aponte qual parece suspeito.</p>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${campos.map((c, i) => `<button class="rbtn" onclick="window._invEscolherCampo(${i})"><span class="rl">${String.fromCharCode(65+i)}</span><span>${c}</span></button>`).join('')}
    </div>`);
  window._invEscolherCampo = (i) => _executarNo(no.id, i);
}

function _renderPopupPericia(no) {
  const opcoes = no.dados_puzzle.opcoes;
  window.abrirModal('Perícia técnica', `
    <p style="color:var(--txt3);margin-bottom:.75rem">Escolha o que pedir ao perito para examinar — apenas uma opção revela a divergência real.</p>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${opcoes.map((o, i) => `<button class="rbtn" onclick="window._invEscolherPericia(${i})"><span class="rl">${String.fromCharCode(65+i)}</span><span>${o}</span></button>`).join('')}
    </div>`);
  window._invEscolherPericia = (i) => _executarNo(no.id, i);
}

function _renderPopupEntrevista(no) {
  const declaracoes = no.dados_puzzle.declaracoes;
  window.abrirModal('Entrevista', `
    <p style="color:var(--txt3);margin-bottom:.5rem">Uma dessas declarações parece evasiva ou inconsistente. Aponte qual.</p>
    <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem">
      ${declaracoes.map((d, i) => `<button class="rbtn ${window._invDeclEscolhida===i?'sel':''}" onclick="window._invEscolherDeclaracao(${i})"><span class="rl">${String.fromCharCode(65+i)}</span><span>${d}</span></button>`).join('')}
    </div>
    <p style="color:var(--txt3);margin-bottom:.5rem">Escolha o tom de condução:</p>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn btn-sec" onclick="window._invEscolherTom('pressionar')">Pressionar</button>
      <button class="btn btn-sec" onclick="window._invEscolherTom('empatia')">Empatia</button>
      <button class="btn btn-sec" onclick="window._invEscolherTom('silencio')">Silêncio</button>
    </div>`);
  // Não reseta window._invDeclEscolhida aqui — esta função também roda de
  // novo a cada seleção (para repintar o botão marcado), e resetar aqui
  // apagava a escolha um instante depois de marcá-la, então "Pressionar/
  // Empatia/Silêncio" sempre via null e recusava com "Aponte uma
  // declaração primeiro" mesmo com a opção visivelmente selecionada. Quem
  // zera o valor agora é window._invAbrirNo, ao abrir um nó novo.
  window._invEscolherDeclaracao = (i) => { window._invDeclEscolhida = i; _renderPopupEntrevista(no); };
  window._invEscolherTom = (tom) => {
    if (window._invDeclEscolhida == null) { window.toast && window.toast('Aponte uma declaração primeiro.', 'ko'); return; }
    _executarNo(no.id, { declaracao_escolhida: window._invDeclEscolhida, tom });
  };
}

// Nós de favor/confiança só guardam um npc_id sintético (ex.: "npc_caso_3"),
// sem nome — gera um nome estável (o mesmo id sempre vira o mesmo nome) só
// para exibição, sem depender de nenhum cadastro de personagem.
const _NPC_NOME_POOL = [
  'Dr. Renato Aguiar', 'Dra. Camila Duarte', 'Dr. Otávio Ramalho', 'Dra. Beatriz Nunes',
  'Dr. Fábio Serpa', 'Dra. Helena Bittencourt', 'Dr. Marcelo Trindade', 'Dra. Iara Peçanha',
  'Dr. Caio Montenegro', 'Dra. Sofia Andrade',
];
function _nomeNpcDeterministico(npcId) {
  let h = 0;
  for (let i = 0; i < npcId.length; i++) h = (h * 31 + npcId.charCodeAt(i)) >>> 0;
  return _NPC_NOME_POOL[h % _NPC_NOME_POOL.length];
}

// Mesmos limiares de functions/investigacao.js:pedirFavor — aqui só para
// mostrar uma estimativa ao jogador antes de gastar o pedido; o servidor
// ainda recalcula (com bônus de Negociação) e decide o desfecho de fato.
function _faixaConfianca(conf) {
  if (conf >= 80) return { label: 'Muito provável', pct: '~90%', cor: 'var(--verde2)' };
  if (conf >= 60) return { label: 'Provável', pct: '~70%', cor: 'var(--verde2)' };
  if (conf >= 35) return { label: 'Arriscado', pct: '~40%', cor: 'var(--amber)' };
  return { label: 'Improvável', pct: '~15%', cor: 'var(--verm2)' };
}

async function _renderPopupBloqueio(no) {
  const npcId   = no.bloqueio.npc_id || `npc_${no.id}`;
  const nomeNpc = _nomeNpcDeterministico(npcId);

  let confianca = 50;
  try {
    const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
    const confSnap = await getDoc(doc(db, 'jogadores', uid, 'confiancas_npc', npcId));
    if (confSnap.exists()) confianca = confSnap.data().confianca ?? 50;
  } catch (e) { /* mantém padrão 50 */ }
  const faixa = _faixaConfianca(confianca);
  const sobrenome = nomeNpc.split(' ').slice(-1)[0];

  window.abrirModal('Nó bloqueado', `
    <p style="color:var(--txt3);margin-bottom:.5rem">
      ${no.bloqueio.tipo === 'favor'
        ? 'Este nó só se abre consumindo um favor específico já em sua posse.'
        : 'Este nó exige um nível de confiança alto com o NPC responsável.'}
    </p>
    <div style="background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.6rem .75rem;margin-bottom:.85rem">
      <div style="font-size:.8rem;font-weight:700;color:var(--navy)">🤝 ${nomeNpc}</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-top:.2rem">
        Confiança atual: <b>${confianca}/100</b>${no.bloqueio.minimo ? ` · mínimo exigido: <b>${no.bloqueio.minimo}</b>` : ''}
      </div>
      <div style="font-size:.72rem;margin-top:.2rem;color:${faixa.cor}">
        Chance de conseguir o favor: <b>${faixa.label}</b> (${faixa.pct})
      </div>
      <div style="font-size:.65rem;color:var(--txt4);margin-top:.25rem">Sua habilidade de Negociação pode aumentar essa chance.</div>
    </div>
    <button class="btn btn-prim" onclick="window._invPedirFavorNo('${no.id}')">Pedir favor a ${sobrenome}</button>`);
  window._invPedirFavorNo = async (noId) => {
    window.fecharModal();
    window.toast && window.toast('⏳ Pedindo favor...', 'neutro', 1500);
    try {
      const npcId = no.bloqueio.npc_id || `npc_${noId}`;
      const r = await callFn('pedirFavor', { npc_id: npcId, tipo: 'profissional', origem: `no_${noId}` });
      if (r.desfecho === 'recusa') {
        window.toast && window.toast(`❌ ${nomeNpc} recusou o pedido.`, 'ko', 3500);
        return;
      }
      window.toast && window.toast(`🤝 ${nomeNpc} concedeu o favor (${r.desfecho.replace(/_/g,' ')}).`, 'ok', 3500);
      if (no.bloqueio.tipo === 'favor' && r.favor_id) {
        const r2 = await callFn('consumirFavorNode', { processo_id: _procId, no_id: noId, favor_id: r.favor_id });
        _procCache.investigacao = r2.investigacao;
        _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
      }
    } catch (err) {
      window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
    }
  };
}

// ─── Vade Mecum ─────────────────────────────────────────────────────────────

window._invAbrirVademecum = async function() {
  window.toast && window.toast('⏳ Abrindo Vade Mecum...', 'neutro', 1500);
  try {
    const r = await callFn('abrirVadeMecum', { processo_id: _procId });
    _procCache.investigacao = r.investigacao;
    const candidatos = sortearCandidatosVademecum(_procCache.area || _procCache.tipo || 'civil', 6);
    _renderListaVademecum(candidatos);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};

function _renderListaVademecum(candidatos) {
  window.abrirModal('Vade Mecum — Precedentes', `
    <p style="color:var(--txt3);margin-bottom:.5rem">Escolha um precedente para tentar aplicá-lo como tese no seu caso.</p>
    <p style="font-size:.72rem;color:var(--txt4);background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.55rem .7rem;margin-bottom:.85rem;line-height:1.55">
      ⚖️ Se a tese encaixar nos fatos do seu caso, ela reduz permanentemente o limiar de vitória no julgamento.
      Se não encaixar, o adversário a desacredita em audiência e você não ganha bônus algum — mas a tentativa já consome
      sua <strong>única aplicação de tese</strong> neste caso, então escolha com cuidado.
    </p>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${candidatos.map(p => `<button class="rbtn" onclick='window._invVerPrecedente(${JSON.stringify(p.id)})'>${p.nome} — <em>${p.tema}</em></button>`).join('')}
    </div>`);
  window._invCandidatosVademecum = candidatos;
  window._invVerPrecedente = (id) => {
    const prec = window._invCandidatosVademecum.find(p => p.id === id);
    window.abrirModal(prec.nome, `
      <p style="color:var(--txt3);margin-bottom:.5rem"><strong>Tema:</strong> ${prec.tema}</p>
      <p style="margin-bottom:.85rem">${prec.holding}</p>
      <p style="font-size:.7rem;color:var(--txt4);background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.55rem .7rem;margin-bottom:.9rem;line-height:1.55">
        Aplicar esta tese só compensa se a holding acima realmente conversar com os fatos do seu caso — o
        julgamento verifica o encaixe antes de conceder o bônus.
      </p>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-prim" onclick='window._invAplicarTese(${JSON.stringify(prec.id)}, ${JSON.stringify(prec.tags)})'>Aplicar esta tese</button>
        <button class="btn btn-sec" onclick='window._invVoltarVademecum()'>Não é este — ver outro</button>
      </div>`);
  };
  window._invVoltarVademecum = () => _renderListaVademecum(candidatos);
}

window._invAplicarTese = async function(precedenteId, tags) {
  window.fecharModal();
  window.toast && window.toast('⏳ Aplicando tese...', 'neutro', 1500);
  try {
    const r = await callFn('aplicarTeseVademecum', { processo_id: _procId, precedente_id: precedenteId, tags_precedente: tags });
    _procCache.investigacao = r.investigacao;
    window.toast && window.toast(
      r.encaixa ? `✅ Tese aceita — bônus de limiar +${r.investigacao.tese_vademecum.bonus_limiar.toFixed(1)}.` : '❌ Tese desacreditada em audiência — sem bônus.',
      r.encaixa ? 'ok' : 'ko', 4000,
    );
    _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};

// ─── Tela: Montagem de Estratégia ──────────────────────────────────────────

let _maoSelecionada = new Set();

function _renderMontagem(j, main, p) {
  const inv = p.investigacao;
  const revelados = inv.nos.filter(n => n.status === 'revelado' && n.peca);

  main.innerHTML = `
    <div class="inv-scenario">
      <div class="inv-titulo-caso">Montagem de Estratégia</div>
      <div class="inv-sub-caso">Selecione as evidências que vão compor sua mão para o julgamento.</div>
      <div class="inv-nos-grid" style="margin-top:.75rem">
        ${revelados.map(no => `
          <div class="inv-no inv-no-revelado ${_maoSelecionada.has(no.id) ? 'sel' : ''}" data-mat="${no.peca.pilar ? '' : (MATERIAL_NO[no.tipo] || 'clip')}" onclick="window._invToggleMao('${no.id}')">
            <div class="inv-no-icone">${ICONE_NO[no.tipo] || '❓'}</div>
            <div class="inv-no-tipo">${_labelTipoNo(no.tipo)}</div>
            <div class="inv-no-peca ${no.peca.suja ? 'suja' : ''}">Força ${no.peca.forca}${no.peca.suja ? ' · suja' : ''}${no.peca.pilar ? ' · pilar' : ''}</div>
          </div>`).join('')}
      </div>
      <button class="btn btn-prim" style="margin-top:1rem" ${_maoSelecionada.size === 0 ? 'disabled' : ''} onclick="window._invConfirmarMontagem()">Confirmar Mão (${_maoSelecionada.size})</button>
    </div>`;
}

window._invToggleMao = function(noId) {
  if (_maoSelecionada.has(noId)) _maoSelecionada.delete(noId); else _maoSelecionada.add(noId);
  _renderMontagem(window.JOGADOR, document.getElementById('main-content'), _procCache);
};

window._invConfirmarMontagem = async function() {
  window.toast && window.toast('⏳ Montando estratégia...', 'neutro', 1500);
  try {
    const r = await callFn('confirmarMontagem', { processo_id: _procId, mao_escolhida: Array.from(_maoSelecionada) });
    _procCache.investigacao = r.investigacao;
    _maoSelecionada = new Set();
    _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};

// ─── Tela: Julgamento ───────────────────────────────────────────────────────

function _renderJulgamento(j, main, p) {
  const julg = p.investigacao.julgamento;
  const restantes = julg.pecas_restantes.length;

  main.innerHTML = `
    <div class="inv-scenario">
      <div class="inv-titulo-caso">Julgamento — Rodada ${julg.rodada_atual + 1}</div>
      <div class="inv-sub-caso">Força total acumulada: <strong style="color:var(--ouro)">${julg.forca_total}</strong> · Peças restantes: ${restantes}</div>
      ${restantes > 0 ? `
        <p style="color:#C9BFA6;margin:.75rem 0">O adversário está atacando sua peça mais vulnerável. Como reage?</p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-prim" onclick="window._invReagir('defender')">🛡️ Defender</button>
          <button class="btn btn-sec" onclick="window._invReagirFavor()">🃏 Usar Favor (joker)</button>
          <button class="btn btn-ghost" onclick="window._invReagir('deixar_cair')">🗑️ Deixar cair</button>
        </div>
      ` : `
        <button class="btn btn-prim" onclick="window._invFinalizarJulgamento()">Ver Veredito</button>
      `}
    </div>`;
}

window._invReagir = async function(reacao, favorId) {
  window.toast && window.toast('⏳ Julgamento em andamento...', 'neutro', 1200);
  try {
    const r = await callFn('executarRodadaJulgamento', { processo_id: _procId, reacao, favor_id: favorId });
    const snap = await getDoc(doc(db, 'processos', _procId));
    _procCache = snap.data();
    window.toast && window.toast(
      `${r.exposta ? '⚠️ Peça exposta! ' : ''}Força obtida: ${r.forca_obtida}`, r.exposta ? 'ko' : 'neutro', 3000,
    );
    _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};

window._invReagirFavor = function() {
  const favores = _procCache.investigacao.favores_reservados || [];
  if (favores.length === 0) { window.toast && window.toast('Nenhum favor reservado para este caso.', 'ko'); return; }
  window.abrirModal('Usar favor', `
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${favores.map(fid => `<button class="rbtn" onclick="window._invUsarFavorId('${fid}')">Favor ${fid.slice(0,6)}...</button>`).join('')}
    </div>`);
  window._invUsarFavorId = (fid) => { window.fecharModal(); window._invReagir('favor', fid); };
};

window._invFinalizarJulgamento = async function() {
  window.toast && window.toast('⏳ Apurando veredito...', 'neutro', 1500);
  try {
    await callFn('finalizarJulgamento', { processo_id: _procId });
    const snap = await getDoc(doc(db, 'processos', _procId));
    _procCache = snap.data();
    _renderFase(window.JOGADOR, document.getElementById('main-content'), _procCache);
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};

// ─── Tela: Veredito / decisão de recurso ───────────────────────────────────
// Reaproveita a callable já existente `decidirRecursoSentenca` (functions/
// processar_sentenca.js) — o backend de julgamento grava os mesmos campos
// que o caminho "setlist" já usa (resultado_setlist/hon_pendente/repDelta),
// então a decisão de aceitar/recorrer funciona sem duplicar lógica.

function _renderVeredito(j, main, p) {
  const veredito = p.resultado_setlist || p.investigacao?.julgamento?.veredito;
  const cor = veredito === 'procedente' ? 'var(--verde)' : veredito === 'parcial' ? 'var(--amber)' : 'var(--verm2)';
  main.innerHTML = `
    <div class="card">
      <div class="card-titulo">Veredito</div>
      <div class="card-sub" style="color:${cor};font-weight:600;font-size:1.1rem">${_labelVeredito(veredito)}</div>
      <p style="color:var(--txt3);margin:.75rem 0">Honorários pendentes: R$ ${(p.hon_pendente || 0).toLocaleString('pt-BR')}</p>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-prim" onclick="window._invDecidirRecurso(false)">Aceitar</button>
        ${veredito !== 'procedente' ? `<button class="btn btn-sec" onclick="window._invDecidirRecurso(true)">Recorrer</button>` : ''}
      </div>
    </div>`;
}

function _labelVeredito(v) {
  return { procedente: '✅ Vitória', parcial: '🤝 Acordo parcial', improcedente: '❌ Derrota' }[v] || v || '—';
}

window._invDecidirRecurso = async function(recorrer) {
  window.toast && window.toast('⏳ Processando decisão...', 'neutro', 1500);
  try {
    const r = await callFn('decidirRecursoSentenca', { processo_id: _procId, recorrer });
    window.toast && window.toast(r.msg || 'Decisão processada.', 'ok', 4000);
    _procId = null;
    window.dispatchEvent(new CustomEvent('gamestate:reload'));
    window.renderInvestigacao(window.JOGADOR, document.getElementById('main-content'));
  } catch (err) {
    window.toast && window.toast('Erro: ' + erroAmigavel(err), 'ko');
  }
};
