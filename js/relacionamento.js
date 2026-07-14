/**
 * RELACIONAMENTO — Advocatus Online
 * Sistema de namoro, traços de personalidade, gravidez, filhos e herdeiros.
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
         runTransaction }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import {
  TRACOS, LOCAIS_CONHECER, ESTAGIOS, IMPACTO_SM, INTERACOES, GANHO_MAX_MENSAL,
  PROGRESSAO, CHANCE_GRAVIDEZ, DURACAO_GESTACAO, ACADEMIA, SEXO_CONFIG, FLAGRA, EFEITO_TRACO,
  PRESENTES, MATERIALISTA_TOLERANCIA,
  calcCompatibilidade, fichasElegiveis, candidatoDeFicha, labelEstagio, efeitoFelicidadeChance,
  efeitoFelicidadeCompatibilidade, custoFilhoPorIdade, custoAcademia,
} from './relacionamento_dados.js';
import { relColecaoAtual, filhosColecaoAtual, relDocAtual, filhoDocAtual }
  from './personagens.js';

// ════════════════════════════════════════════════════════
// NPCs GLOBAIS — LOCK DE EXCLUSIVIDADE
// Cada NPC é uma entidade ÚNICA no mundo, compartilhada entre todos os
// jogadores. O documento npcs_locks/{npcId} guarda quem está namorando
// ou "em tempo" com ela agora — enquanto travada, ela não aparece para
// mais ninguém em "Conhecer Pessoas". Término libera o lock; "dar um
// tempo" mantém a trava apenas para o MESMO jogador (só ele pode reatar
// ou terminar de vez — outros continuam sem vê-la).
// ════════════════════════════════════════════════════════
function _npcLockRef(npcId) {
  return doc(db, 'npcs_locks', npcId);
}

/**
 * Tenta travar um NPC para este jogador (transação — evita corrida entre
 * dois jogadores clicando "trocar contato" no mesmo NPC ao mesmo tempo).
 * Retorna true se conseguiu travar, false se já estava indisponível.
 */
async function _travarNpcParaJogador(npcId, uid, relacionamentoId, nome) {
  try {
    return await runTransaction(db, async (tx) => {
      const ref  = _npcLockRef(npcId);
      const snap = await tx.get(ref);
      const atual = snap.exists() ? snap.data() : null;

      if (atual && atual.status !== 'disponivel' && atual.jogador_uid !== uid) {
        return false; // outro jogador já está com ela
      }

      tx.set(ref, {
        nome, status: 'namorando',
        jogador_uid: uid, relacionamento_id: relacionamentoId,
        atualizado_em: new Date().toISOString(),
      });
      return true;
    });
  } catch (e) {
    console.warn('[NPC LOCK] Erro ao travar:', e);
    return false;
  }
}

// "Dar um tempo" é um evento ALEATÓRIO MENSAL sorteado dentro da Cloud
// Function avancarMes (functions/avancar_mes.js,
// _processarRelacionamentosMensalCF) — nunca por ação manual do jogador
// aqui no frontend. O lock do NPC (status 'tempo'/'namorando') e o campo
// em_tempo/tempo_termina_mes_total do relacionamento são geridos lá
// (_marcarNpcEmTempoCF/_reconciliarNpcCF), não neste arquivo.

/** Libera o NPC de volta para o mundo (término definitivo). */
async function _liberarNpc(npcId) {
  try {
    await updateDoc(_npcLockRef(npcId), {
      status: 'disponivel', jogador_uid: null, relacionamento_id: null,
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) { console.warn('[NPC LOCK] Erro ao liberar:', e); }
}

/**
 * Busca o status de lock de várias fichas de uma vez. Firestore não tem
 * "IN" arbitrariamente grande de forma simples aqui, então busca-se
 * individualmente — o conjunto é pequeno (até ~22 fichas no banco
 * inteiro), barato para o padrão de uso deste jogo.
 */
async function _statusLocksDeFichas(fichas) {
  const resultados = await Promise.all(fichas.map(async f => {
    try {
      const snap = await getDoc(_npcLockRef(f.id));
      return { id: f.id, lock: snap.exists() ? snap.data() : null };
    } catch (e) {
      return { id: f.id, lock: null };
    }
  }));
  const mapa = {};
  for (const r of resultados) mapa[r.id] = r.lock;
  return mapa;
}

// ════════════════════════════════════════════════════════
// PAINEL PRINCIPAL — VIDA PESSOAL
// ════════════════════════════════════════════════════════
window.renderVidaPessoal = async function(j, el) {
  const uid = j.uid || window.JOGADOR_UID;

  // Buscar relacionamentos ativos do jogador
  const relSnap = await getDocs(query(
    relColecaoAtual(uid, j),
    where('ativo', '==', true)
  ));
  const relacionamentos = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Buscar ex-cônjuges (esposo/a separado/a)
  let exConjuges = [];
  try {
    const exSnap = await getDocs(query(
      relColecaoAtual(uid, j),
      where('ativo', '==', false),
      where('estagio', '==', 'esposo')
    ));
    exConjuges = exSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { /* índice composto pode não existir ainda */ }

  // Buscar filhos
  const filhosSnap = await getDocs(filhosColecaoAtual(uid, j));
  const filhos = filhosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Amigos de trabalho/amizades (js/amigos.js) — sistema independente do
  // namoro, sem exclusividade/lock global, sem estágios.
  const amigosHtml = window.renderAmigosSecao ? await window.renderAmigosSecao(uid) : '';

  const felicidade = j.felicidade !== undefined ? j.felicidade : 50;
  const corFel = felicidade >= 80 ? 'var(--verde2)' : felicidade >= 60 ? 'var(--navy3)' :
                 felicidade >= 40 ? 'var(--amber)' : 'var(--verm2)';

  el.innerHTML = `
    ${window._capaHeader('VIDA PESSOAL · ADVOCATUS ONLINE', 'Vida Fora do Escritório',
      `<span class="pill pill-cargo" style="background:${corFel}20;color:${corFel};border-color:${corFel}55">😊 Felicidade ${felicidade}/100</span>`)}

    <!-- Academia -->
    ${_renderAcademia(j)}

    <!-- Relacionamentos ativos -->
    <div class="secao-header" style="margin-top:1.2rem">
      <div class="secao-titulo">💑 Relacionamentos</div>
      <button class="btn btn-sm btn-prim" onclick="window.abrirConhecerPessoas()">+ Conhecer pessoas</button>
    </div>
    ${relacionamentos.length === 0
      ? `<div class="card" style="text-align:center;padding:1.5rem;color:var(--txt3)">
           Você não tem nenhum relacionamento ativo.<br>
           <span style="font-size:.72rem">Vá a algum lugar para conhecer pessoas novas.</span>
         </div>`
      : relacionamentos.map(r => _cardRelacionamento(r, j)).join('')}

    <!-- Ex-cônjuge separado/a -->
    ${exConjuges.length > 0 ? `
      <div class="secao-header" style="margin-top:1.2rem">
        <div class="secao-titulo">💔 Ex-cônjuge</div>
        <span class="secao-badge" style="background:var(--verm3)20;color:var(--verm2)">Separado/a</span>
      </div>
      ${exConjuges.map(r => _cardExConjuge(r, j)).join('')}
    ` : ''}

    <!-- Filhos -->
    ${filhos.length > 0 ? `
      <div class="secao-header" style="margin-top:1.2rem">
        <div class="secao-titulo">👶 Filhos</div>
        <span class="secao-badge">${filhos.length}</span>
      </div>
      ${filhos.map(f => _cardFilho(f)).join('')}` : ''}

    <!-- Amigos -->
    ${amigosHtml}
  `;
};

function _renderAcademia(j) {
  const temAcademia = j.academia_ativa;
  const bonusAtual  = j.academia_bonus_energia || 0;
  const custoAdesao = custoAcademia(j.reputacao || 30);

  if (!temAcademia) {
    return `
      <div class="card" style="background:var(--surface2)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700;color:var(--txt);font-size:.85rem">🏋️ Academia</div>
            <div style="font-size:.7rem;color:var(--txt3);margin-top:.2rem">
              Ganhe até +25 de energia bônus mensal frequentando regularmente.
            </div>
          </div>
          <button class="btn btn-sm btn-prim" onclick="window.aderirAcademia()">
            Aderir (R$ ${custoAdesao.toLocaleString('pt-BR')})
          </button>
        </div>
      </div>`;
  }

  return `
    <div class="card" style="background:var(--verde-bg);border-color:var(--verde3)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;color:var(--verde);font-size:.85rem">🏋️ Academia — Ativa</div>
          <div style="font-size:.7rem;color:var(--txt3);margin-top:.2rem">
            Bônus de energia: <b style="color:var(--verde2)">+${bonusAtual}/100</b> (máx +25)
          </div>
          ${j.academia_usada_mes ? `<div style="font-size:.65rem;color:var(--verde2);margin-top:.15rem">✓ Compareceu este mês</div>` :
            `<div style="font-size:.65rem;color:var(--amber);margin-top:.15rem">⚠️ Ainda não compareceu este mês</div>`}
        </div>
        <button class="btn btn-sm btn-ghost" ${j.academia_usada_mes?'disabled':''} onclick="window.frequentarAcademia()">
          Frequentar (-5⚡)
        </button>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════
// AVATAR DO NPC — usa a foto da ficha (img/npcs/{foto}); se o
// relacionamento foi criado ANTES desta feature (sem campo `foto`
// salvo), cai num placeholder genérico em vez de quebrar a tela.
// ════════════════════════════════════════════════════════
function _avatarUrlNpc(r) {
  return r.foto ? `img/npcs/${r.foto}` : 'img/npcs/_placeholder.png';
}

function _cardRelacionamento(r, j) {
  const estagio  = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const label    = labelEstagio(r.estagio, r.sexo);
  const pct      = Math.min(100, Math.round((r.afinidade / estagio.cap) * 100));
  const cor      = pct >= 80 ? 'var(--verde2)' : pct >= 50 ? 'var(--ouro2)' : pct >= 25 ? 'var(--navy3)' : 'var(--txt4)';
  const tracosLabel = (r.tracos||[]).map(t => TRACOS[t]?.icone + ' ' + TRACOS[t]?.l).join(' · ');
  const meses = _mesesNoRelacionamento(r, j);

  // "Dando um tempo": relacionamento pausado (sorteado mensalmente pela
  // Cloud Function) — sem interação possível até ela decidir reatar ou
  // terminar de vez. A afinidade continua caindo mês a mês nesse período.
  const emTempo = !!r.em_tempo;
  const mesAtualTotal = (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);
  const mesesRestantesTempo = emTempo ? Math.max(1, (r.tempo_termina_mes_total||0) - mesAtualTotal) : 0;

  return `
    <div class="card" style="margin-bottom:.6rem;border-left:3px solid ${emTempo ? 'var(--amber)' : r.estagio==='affair'?'var(--verm3)':'var(--navy3)'}">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:.8rem">
        <div style="display:flex;gap:.6rem;flex:1;cursor:pointer" onclick="window.abrirPerfilNpc('${r.id}')">
          <img src="${_avatarUrlNpc(r)}" alt="${r.nome}" class="rel-avatar-mini"
               onerror="this.onerror=null;this.src='img/npcs/_placeholder.png'">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.92rem;color:var(--txt)">${r.nome}</div>
            <div style="font-size:.68rem;color:var(--ouro2);margin-bottom:.3rem">${label} · ${_formatarIdade(meses)} · ${tracosLabel}</div>
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
              <div style="flex:1;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px"></div>
              </div>
              <span style="font-size:.68rem;font-weight:700;color:${cor}">${r.afinidade}/${estagio.cap}</span>
            </div>
            ${r.gravida ? `<div style="font-size:.7rem;color:var(--verde2);font-weight:600">🤰 Gestação: mês ${r.mes_gravidez}/9</div>` : ''}
          </div>
        </div>
      </div>
      ${emTempo ? `
      <div style="margin-top:.6rem;padding:.55rem .7rem;background:var(--surface2);border-radius:6px;border:1px solid var(--amber)">
        <div style="font-size:.75rem;font-weight:700;color:var(--amber)">😔 Dando um tempo</div>
        <div style="font-size:.68rem;color:var(--txt3);margin-top:.15rem">
          Sem contato possível agora. ${r.nome} decide em até ${mesesRestantesTempo} mês${mesesRestantesTempo===1?'':'es'} se volta ou termina de vez.
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem">
        <button class="btn btn-sm btn-danger" onclick="window.terminarRelacionamento('${r.id}','${r.nome}')">
          Terminar de vez
        </button>
      </div>` : `
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem">
        ${Object.entries(INTERACOES).map(([k,v]) =>
          `<button class="btn btn-sm btn-ghost" onclick="window.interagirRelacionamento('${r.id}','${k}')" title="${v.l}">
            ${v.icone} -${v.energia}⚡
          </button>`).join('')}
        <button class="btn btn-sm btn-ghost" onclick="window.abrirLojaPresentes('${r.id}','${r.nome}')" title="Dar presente">
          🎁 Presente
        </button>
        ${_botaoProgresso(r)}
        <button class="btn btn-sm btn-danger" onclick="window.terminarRelacionamento('${r.id}','${r.nome}')">
          Terminar
        </button>
      </div>`}
    </div>`;
}

function _botaoProgresso(r) {
  const PROX = { affair:'affair_namorado', namorado:'namorado_noivo', noivo:'noivo_esposo' };
  const key  = PROX[r.estagio];
  if (!key) return '';
  const p = PROGRESSAO[key];
  const meses = r._meses || 0;
  const pronto = r.afinidade >= p.afinidade_min && meses >= p.tempo_min_meses;
  return `<button class="btn btn-sm ${pronto?'btn-prim':'btn-ghost'}" ${!pronto?'disabled':''}
    onclick="window.progredirRelacionamento('${r.id}','${key}')"
    title="Requer ${p.afinidade_min} afinidade e ${p.tempo_min_meses} meses">
    ${p.acao} (R$ ${p.custo.toLocaleString('pt-BR')})
  </button>`;
}

function _formatarIdade(idadeMeses) {
  const anos  = Math.floor((idadeMeses||0) / 12);
  const meses = (idadeMeses||0) % 12;
  if (anos === 0) return meses===1 ? '1 mês' : `${meses} meses`;
  if (meses === 0) return anos===1 ? '1 ano' : `${anos} anos`;
  return `${anos} ${anos===1?'ano':'anos'} e ${meses} ${meses===1?'mês':'meses'}`;
}

function _cardFilho(f) {
  const idadeMeses = f.idade_meses!==undefined ? f.idade_meses : Math.round((f.idade||0)*12);
  const idadeAnosCompletos = Math.floor(idadeMeses/12);
  const custo = custoFilhoPorIdade(idadeAnosCompletos);
  return `
    <div class="card" style="margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700;color:var(--txt);font-size:.85rem">${f.sexo==='m'?'👦':'👧'} ${f.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${_formatarIdade(idadeMeses)} ${f.faculdade?`· Cursando ${f.faculdade}`:''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.7rem;color:var(--verm2)">-R$ ${custo}/mês</div>
          ${f.jogavel ? `<button class="btn btn-sm btn-prim" style="margin-top:.3rem" onclick="window._abrirModalConcederHeranca('${f.id}','${(f.nome||'').replace(/'/g,"\\'")}')">Assumir controle</button>` : ''}
        </div>
      </div>
    </div>`;
}

function _mesesNoRelacionamento(r, j) {
  if (!r.iniciado_mes_total) return 0;
  const mesAtualTotal = (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);
  return Math.max(0, mesAtualTotal - r.iniciado_mes_total);
}

function _cardExConjuge(r, j) {
  const avatarUrl = _avatarUrlNpc(r);
  const meses = _mesesNoRelacionamento(r, j);
  const motivoMap = {
    natural: 'O desgaste do dia a dia foi mais forte que o amor.',
    flagra:  'A traição foi descoberta.',
    ciumes:  'Uma crise de ciúmes destruiu o casamento.',
  };
  const motivoTexto = motivoMap[r.motivo_separacao] || 'O relacionamento chegou ao fim.';
  const jaUsouMes = r.tentou_reatar_mes === true;
  const afinidade = r.afinidade || 0;

  return `
    <div class="card" style="margin-bottom:.6rem;border-left:3px solid var(--verm3);opacity:.92">
      <div style="display:flex;align-items:start;gap:.6rem">
        <img src="${avatarUrl}" alt="${r.nome}" class="rel-avatar-mini"
             onerror="this.onerror=null;this.src='img/npcs/_placeholder.png'">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.92rem;color:var(--txt)">${r.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3);margin-bottom:.25rem">
            ${_formatarIdade(meses)} de casamento · Afinidade restante: ${afinidade}
          </div>
          <div style="font-size:.72rem;color:var(--verm2);margin-bottom:.5rem">💔 ${motivoTexto}</div>
          <div style="display:flex;flex-wrap:wrap;gap:.35rem">
            <button class="btn btn-sm btn-ghost" onclick="window.abrirLojaPresentes('${r.id}','${r.nome}')">
              🎁 Dar presente
            </button>
            <button class="btn btn-sm ${jaUsouMes ? 'btn-ghost' : 'btn-prim'}" ${jaUsouMes ? 'disabled' : ''}
              onclick="window.tentarReatar('${r.id}','${r.nome}')"
              title="${jaUsouMes ? 'Já tentou este mês' : '10% de chance de reatar (−10⚡)'}">
              💌 Tentar reatar ${jaUsouMes ? '(aguarde próximo mês)' : '(−10⚡)'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

window.tentarReatar = async function(relId, nome) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const relRef  = relDocAtual(uid, j, relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) { toast('Relacionamento não encontrado.', 'ko'); return; }
  const r = relSnap.data();

  if (r.tentou_reatar_mes) { toast('Você já tentou reatar este mês. Aguarde o próximo.', 'ko'); return; }

  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (j.energia_total || 100) - usado);
  if (disp < 10) { toast('⚡ Energia insuficiente para tentar reatar.', 'ko'); return; }

  await updateDoc(doc(db,'jogadores',uid), { energia_usada_mes: usado + 10 });

  const sucesso = Math.random() < 0.10;

  if (sucesso) {
    await updateDoc(relRef, {
      ativo: true,
      tentou_reatar_mes: false,
      motivo_separacao: null,
      separado_em: null,
    });
    // Retravar o NPC para este jogador
    if (r.npc_id) {
      try { await _travarNpcParaJogador(r.npc_id, uid, relId, r.nome); } catch(e) {}
    }
    await _registrarEvento(uid, j, relId, {
      tipo: 'reatar', label: `Você e ${nome} reataram o casamento`,
      mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
    });
    toast(`💞 ${nome} aceitou recomeçar! O histórico do casamento foi preservado.`, 'ok', 5000);
    setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
  } else {
    await updateDoc(relRef, { tentou_reatar_mes: true });
    await _registrarEvento(uid, j, relId, {
      tipo: 'tentativa_reatar', label: `Você tentou reatar com ${nome}, mas ela não estava pronta`,
      mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
    });
    toast(`💔 ${nome} não estava pronta desta vez. Tente novamente no próximo mês.`, 'neutro', 5000);
    setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
  }
};

// ════════════════════════════════════════════════════════
// CONHECER PESSOAS
// ════════════════════════════════════════════════════════
window.abrirConhecerPessoas = function() {
  abrirModal('💞 Conhecer Pessoas',
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:1rem">
      Escolha um local. Cada local favorece certos perfis de personalidade.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${Object.entries(LOCAIS_CONHECER).map(([k,v]) => `
        <button class="btn btn-ghost btn-block" style="text-align:left;padding:.65rem .85rem" onclick="window.irParaLocal('${k}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600;font-size:.82rem;color:var(--txt)">${v.icone} ${v.l}</div>
              <div style="font-size:.65rem;color:var(--txt3)">${v.desc}</div>
            </div>
            <div style="font-size:.7rem;color:var(--amber);flex-shrink:0;margin-left:.5rem">-${v.energia}⚡</div>
          </div>
        </button>`).join('')}
    </div>`
  );
};

window.irParaLocal = async function(localKey) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const local = LOCAIS_CONHECER[localKey];
  if (!local) return;

  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (j.energia_total||100) - usado);
  if (disp < local.energia) { toast(`⚡ Energia insuficiente (requer ${local.energia}).`, 'ko'); return; }

  await updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: usado + local.energia });

  // Verificar relacionamentos ativos (máx 1 namorada+ mas pode ter affairs)
  const relSnap = await getDocs(query(relColecaoAtual(uid, j), where('ativo','==',true)));
  const rels    = relSnap.docs.map(d=>d.data());
  const temNamoradaOuMais = rels.some(r => r.estagio !== 'affair');

  // Sexo oposto ao do jogador (assumindo jogador heterossexual por padrão — pode ser configurável)
  const sexoParceiro = (j.sexo === 'f') ? 'm' : 'f';

  // Regra de idade: só aparecem NPCs com 18 <= idade <= idade do jogador.
  // As fichas já vêm com idade calculada dinamicamente (idade_base + anos
  // que o jogador envelheceu desde o início).
  const elegiveisPorIdade = fichasElegiveis(sexoParceiro, j.idade || 22);

  // Excluir NPCs já travadas por OUTRO jogador (namorando ou em tempo).
  // Quem está travada pelo PRÓPRIO uid (ex.: já é affair dele mesmo) também
  // é excluída aqui — "Conhecer Pessoas" é para gente NOVA, não para quem
  // ele já está vendo (essa pessoa já aparece na lista de relacionamentos).
  const locks = await _statusLocksDeFichas(elegiveisPorIdade);
  const livres = elegiveisPorIdade.filter(f => {
    const lock = locks[f.id];
    return !lock || lock.status === 'disponivel';
  });

  if (livres.length === 0) {
    fecharModal();
    toast('😕 Não há ninguém novo disponível para conhecer agora. Tente outro local ou volte mais tarde.', 'neutro', 5000);
    return;
  }

  // Sorteia até 3 das elegíveis-e-livres (pode dar menos que 3 se não houver
  // candidatas suficientes — comportamento esperado, não é bug).
  const pool = [...livres];
  const candidatos = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random()*pool.length);
    const ficha = pool.splice(idx, 1)[0];
    const c = candidatoDeFicha(ficha, sexoParceiro);
    const compat = calcCompatibilidade(j.tracos_pessoais || [], c.tracos);
    candidatos.push({ ...c, compatibilidade: compat });
  }

  fecharModal();
  abrirModal(`${local.icone} ${local.l}`,
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:1rem">
      Você conheceu algumas pessoas interessantes:
      ${temNamoradaOuMais ? '<br><span style="color:var(--amber)">⚠️ Você já está namorando — isso seria um affair.</span>' : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${candidatos.map((c,i) => `
        <div class="card" style="margin-bottom:0;display:flex;gap:.6rem;align-items:flex-start">
          <img src="img/npcs/${c.foto}" alt="${c.nome}" class="rel-avatar-mini"
               onerror="this.onerror=null;this.src='img/npcs/_placeholder.png'">
          <div style="flex:1">
            <div style="font-weight:700;color:var(--txt);font-size:.85rem">${c.nome}, ${c.idade} anos</div>
            <div style="font-size:.65rem;color:var(--txt4);margin-bottom:.15rem">📍 ${c.regiao}</div>
            <div style="font-size:.68rem;color:var(--ouro2);margin:.2rem 0">
              ${c.tracos.map(t=>TRACOS[t]?.icone+' '+TRACOS[t]?.l).join(' · ')}
            </div>
            <button class="btn btn-sm btn-prim btn-block" onclick='window.iniciarAffair(${JSON.stringify(c).replace(/'/g,"&apos;")})'>
              Trocar contato (iniciar Affair)
            </button>
          </div>
        </div>`).join('')}
    </div>`
  );
};

window.iniciarAffair = async function(candidato) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const compat = candidato.compatibilidade;

  const relSnap = await getDocs(query(relColecaoAtual(uid, j), where('ativo','==',true)));
  const numAffairs = relSnap.docs.filter(d => d.data().estagio === 'affair').length;

  try {
    // Cria primeiro o documento de relacionamento (precisamos do ID dele
    // para gravar no lock), depois tenta travar o NPC globalmente. Se a
    // trava falhar (alguém pegou no meio tempo), desfaz o relacionamento
    // criado — evita duas entidades "namorando a mesma pessoa".
    const relRef = await addDoc(relColecaoAtual(uid, j), {
      npc_id: candidato.id || null,
      nome: candidato.nome, sexo: candidato.sexo, tracos: candidato.tracos,
      foto: candidato.foto || null, regiao: candidato.regiao || null,
      idade: candidato.idade || null,
      compatibilidade: compat, estagio: 'affair', afinidade: 5,
      ativo: true, gravida: false, mes_gravidez: 0,
      meses_sem_sexo: 0, meses_sem_presente: 0, _meses: 0,
      viajou_no_ano: false,
      iniciado_mes_total: (j.ano_pessoal||1)*12 + (j.mes_pessoal||0),
      criado_em: new Date().toISOString(),
    });

    if (candidato.id) {
      const travou = await _travarNpcParaJogador(candidato.id, uid, relRef.id, candidato.nome);
      if (!travou) {
        // Outro jogador conseguiu travar primeiro entre a listagem e o
        // clique — desfazer o relacionamento criado e avisar.
        await deleteDoc(relRef);
        fecharModal();
        toast(`😕 ${candidato.nome} já está sendo conhecida por outro jogador. Tente outra pessoa.`, 'ko', 5000);
        return;
      }
    }

    await _registrarEvento(uid, relRef.id, {
      tipo: 'inicio', label: `Vocês se conheceram e trocaram contato`,
      mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
    });

    fecharModal();
    toast(`💌 Você iniciou um affair com ${candidato.nome}!`, 'ok', 4000);
    setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
  } catch(err) {
    toast('Erro: ' + err.message, 'ko');
  }
};

// ════════════════════════════════════════════════════════
// REGISTRO DE EVENTOS (timeline do relacionamento) — cada interação
// significativa grava um documento em
// jogadores/{uid}/relacionamentos/{relId}/eventos/{eventoId}, exibido
// depois na tela de perfil do NPC (estilo Facebook 2010).
// ════════════════════════════════════════════════════════
async function _registrarEvento(uid, j, relId, evento) {
  try {
    await addDoc(collection(relDocAtual(uid, j, relId), 'eventos'), {
      ...evento,
      criado_em: new Date().toISOString(),
    });
  } catch (e) { console.warn('[RELACIONAMENTO] Erro ao registrar evento:', e); }
}

// ════════════════════════════════════════════════════════
// INTERAGIR COM RELACIONAMENTO
// ════════════════════════════════════════════════════════
window.interagirRelacionamento = async function(relId, interacaoKey) {
  const j    = window.JOGADOR;
  const uid  = j?.uid || window.JOGADOR_UID;
  const inter = INTERACOES[interacaoKey];
  if (!inter) return;

  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, (j.energia_total||100) - usado);
  if (disp < inter.energia) { toast(`⚡ Energia insuficiente.`, 'ko'); return; }

  const relRef  = relDocAtual(uid, j, relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  if (r.em_tempo) { toast(`😔 ${r.nome} pediu um tempo — sem contato possível agora.`, 'ko'); return; }

  // Limite mensal de ganho
  const ganhoMesAtual = r._ganho_mes_atual || 0;
  if (ganhoMesAtual >= GANHO_MAX_MENSAL) {
    toast('Limite mensal de afinidade já atingido com essa pessoa.', 'ko');
    return;
  }

  // Multiplicadores por traço (afetam o ganho de QUALQUER interação)
  let multGanho = 1.0;
  if ((r.tracos||[]).includes('romantica')) multGanho *= EFEITO_TRACO.romantica.multiplicador_ganho;
  if ((r.tracos||[]).includes('carente'))   multGanho *= EFEITO_TRACO.carente.multiplicador_ganho;

  let ganho = Math.min(GANHO_MAX_MENSAL - ganhoMesAtual, Math.round(inter.afinidade * multGanho));

  // Aventureira: bônus EXTRA de afinidade específico para viagens (além do
  // multiplicador geral acima, que não se aplica aqui — são bônus fixos
  // somados ao ganho da interação). Marca viajou_no_ano=true, que destrava
  // a checagem anual em avancar_mes.js (sem este hook, a penalidade por
  // "não viajou no ano" ficava desativada por segurança).
  const ehAventureira = (r.tracos||[]).includes('aventureira');
  if (ehAventureira && interacaoKey === 'viagem_nac') {
    ganho = Math.min(GANHO_MAX_MENSAL - ganhoMesAtual, ganho + EFEITO_TRACO.aventureira.afinidade_viagem_nacional_extra);
  } else if (ehAventureira && interacaoKey === 'viagem_int') {
    ganho = Math.min(GANHO_MAX_MENSAL - ganhoMesAtual, ganho + EFEITO_TRACO.aventureira.afinidade_viagem_internacional_extra);
  }

  const estagio = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const novaAfinidade = Math.min(estagio.cap, (r.afinidade||0) + ganho);

  const updates = {
    afinidade: novaAfinidade,
    _ganho_mes_atual: ganhoMesAtual + ganho,
  };

  // Qualquer viagem (nacional ou internacional) com QUALQUER NPC conta como
  // "viajou no ano" — destrava o reset anual da penalidade de Aventureira
  // (ver _processarRelacionamentosMensalCF em avancar_mes.js). Gravado
  // mesmo para NPCs sem o traço, sem custo — é só um contador inofensivo.
  if (interacaoKey === 'viagem_nac' || interacaoKey === 'viagem_int') {
    updates.viajou_no_ano = true;
  }

  // Sexo: ganho de saúde mental + reset do contador
  let smGanho = 0;
  if (interacaoKey === 'intimidade') {
    updates.meses_sem_sexo = 0;
    updates.sexo_mes_atual = true;
    smGanho = SEXO_CONFIG.ganho_saude_mental;
  }

  await updateDoc(relRef, updates);
  await updateDoc(doc(db,'jogadores',uid), { energia_usada_mes: usado + inter.energia,
    ...(smGanho ? { saude_mental: Math.min(100, (j.saude_mental||80) + smGanho) } : {}) });

  // Registrar na timeline do relacionamento — usado pela tela de perfil
  // estilo Facebook 2010 para montar o "histórico de interações".
  await _registrarEvento(uid, j, relId, {
    tipo: interacaoKey, label: `Você e ${r.nome} ${_fraseInteracao(interacaoKey)}`,
    mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
  });

  toast(`${inter.icone} +${ganho} afinidade${smGanho?` · +${smGanho} saúde mental`:''}`, 'ok', 3000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 500);
};

// Frase narrativa curta por tipo de interação, usada no evento da timeline.
function _fraseInteracao(interacaoKey) {
  const FRASES = {
    mensagem:    'trocaram mensagens',
    jantar:      'foram jantar',
    passeio:     'fizeram um passeio',
    viagem_nac:  'viajaram pelo Brasil',
    viagem_int:  'viajaram para o exterior',
    intimidade:  'tiveram um momento de intimidade',
  };
  return FRASES[interacaoKey] || 'passaram um tempo juntos';
}

// ════════════════════════════════════════════════════════
// LOJA DE PRESENTES — qualquer NPC recebe o ganho base de afinidade do
// presente; NPCs com o traço 'materialista' recebem um bônus extra fixo
// por cima (EFEITO_TRACO.materialista.afinidade_presente) e têm o
// contador de "meses sem presente" resetado (usado pela penalidade de
// tolerância em avancar_mes.js — ver MATERIALISTA_TOLERANCIA).
// ════════════════════════════════════════════════════════
window.abrirLojaPresentes = function(relId, nome) {
  abrirModal(`🎁 Presente para ${nome}`,
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:1rem">
      Escolha um presente. NPCs materialistas valorizam presentes mais caros.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${Object.entries(PRESENTES).map(([k,v]) => `
        <button class="btn btn-ghost btn-block" style="text-align:left;padding:.65rem .85rem" onclick="window.darPresente('${relId}','${k}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600;font-size:.82rem;color:var(--txt)">${v.icone} ${v.l}</div>
              <div style="font-size:.65rem;color:var(--txt3)">+${v.afinidade} afinidade base</div>
            </div>
            <div style="font-size:.72rem;color:var(--ouro2);flex-shrink:0;margin-left:.5rem">R$ ${v.custo.toLocaleString('pt-BR')}</div>
          </div>
        </button>`).join('')}
    </div>`
  );
};

window.darPresente = async function(relId, presenteKey) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const presente = PRESENTES[presenteKey];
  if (!presente) return;

  if ((j.dinheiro||0) < presente.custo) {
    toast(`Saldo insuficiente. Este presente custa R$ ${presente.custo.toLocaleString('pt-BR')}.`, 'ko');
    return;
  }

  const relRef  = relDocAtual(uid, j, relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  if (r.em_tempo) { toast(`😔 ${r.nome} pediu um tempo — sem contato possível agora.`, 'ko'); return; }

  const ehMaterialista = (r.tracos||[]).includes('materialista');
  let ganho = presente.afinidade;
  if (ehMaterialista) ganho += EFEITO_TRACO.materialista.afinidade_presente;

  const estagio = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const novaAfinidade = Math.min(estagio.cap, (r.afinidade||0) + ganho);

  await updateDoc(relRef, {
    afinidade: novaAfinidade,
    meses_sem_presente: 0, // reseta o contador de tolerância de Materialista
  });
  await updateDoc(doc(db,'jogadores',uid), { dinheiro: (j.dinheiro||0) - presente.custo });

  await _registrarEvento(uid, j, relId, {
    tipo: 'presente', label: `Você deu de presente: ${presente.l} para ${r.nome}`,
    mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
  });

  fecharModal();
  toast(`${presente.icone} +${ganho} afinidade${ehMaterialista?' (ela amou o presente!)':''}`, 'ok', 4000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 500);
};

// ════════════════════════════════════════════════════════
// PROGREDIR ESTÁGIO
// ════════════════════════════════════════════════════════
window.progredirRelacionamento = async function(relId, progKey) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const p   = PROGRESSAO[progKey];
  if (!p) return;

  if ((j.dinheiro||0) < p.custo) { toast(`Saldo insuficiente. Requer R$ ${p.custo.toLocaleString('pt-BR')}.`,'ko'); return; }

  const relRef  = relDocAtual(uid, j, relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  if (r.em_tempo) { toast(`😔 ${r.nome} pediu um tempo — sem contato possível agora.`, 'ko'); return; }

  // Chance de aceitação
  const chanceBase  = 50 + (r.afinidade / 2);
  const aceita      = Math.random()*100 < Math.min(98, chanceBase);

  if (!aceita) {
    await updateDoc(doc(db,'jogadores',uid), { dinheiro: (j.dinheiro||0) - Math.floor(p.custo*0.1) });
    toast(`💔 ${r.nome} não aceitou agora. Tente fortalecer mais o relacionamento.`, 'ko', 5000);
    return;
  }

  const PROX_ESTAGIO = { affair_namorado:'namorado', namorado_noivo:'noivo', noivo_esposo:'esposo' };
  const novoEstagio  = PROX_ESTAGIO[progKey];

  await updateDoc(relRef, {
    estagio: novoEstagio, afinidade: 0,
    iniciado_mes_total: (j.ano_pessoal||1)*12 + (j.mes_pessoal||0),
  });
  await updateDoc(doc(db,'jogadores',uid), { dinheiro: (j.dinheiro||0) - p.custo });

  await _registrarEvento(uid, j, relId, {
    tipo: 'progressao', label: `${p.acao.replace('Pedir em','Você pediu')} para ${r.nome} — ${r.nome} aceitou!`,
    mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
  });

  fecharModal();
  toast(`🎉 ${r.nome} aceitou! Agora vocês são ${labelEstagio(novoEstagio, r.sexo)}.`, 'ok', 6000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 800);
};

// ════════════════════════════════════════════════════════
// TERMINAR RELACIONAMENTO
// ════════════════════════════════════════════════════════
window.terminarRelacionamento = async function(relId, nome) {
  if (!confirm(`Confirma o término com ${nome}?`)) return;
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const relSnap = await getDoc(relDocAtual(uid, j, relId));
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  const impacto = IMPACTO_SM.termino[r.estagio] || 10;
  await updateDoc(relDocAtual(uid, j, relId), { ativo:false, terminado_em:new Date().toISOString() });
  await updateDoc(doc(db,'jogadores',uid), { saude_mental: Math.max(0, (j.saude_mental||80) - impacto) });

  // Término definitivo (manual, pelo jogador) sempre LIBERA o NPC de volta
  // para o mundo — diferente de "dar um tempo" (sorteado mensalmente pela
  // Cloud Function), que mantém a trava só para este jogador.
  if (r.npc_id) await _liberarNpc(r.npc_id);

  await _registrarEvento(uid, j, relId, {
    tipo: 'termino', label: `Você e ${nome} terminaram o relacionamento`,
    mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
  });

  toast(`💔 Você terminou com ${nome}. -${impacto} saúde mental.`, 'neutro', 5000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
};

// ════════════════════════════════════════════════════════
// PERFIL DO NPC — ESTILO FACEBOOK 2010
// Tela com foto/capa, "informações" (traços, região, estágio), e
// timeline cronológica de eventos registrados via _registrarEvento.
// ════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════
// FOTO EXPANDIDA (lightbox) — clique no avatar do perfil abre a foto em
// tamanho grande (até o tamanho original, respeitando a viewport).
// Implementado de forma independente de abrirModal/fecharModal (que já
// estaria aberto por baixo, mostrando o perfil) — cria seu próprio
// overlay por cima de tudo, fechável por clique fora, no X, ou Esc.
// ════════════════════════════════════════════════════════
let _fotoExpandidaKeyHandler = null;

window.abrirFotoExpandida = function(url, nome) {
  if (document.getElementById('foto-expandida-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'foto-expandida-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    background:rgba(10,14,24,.88);
    display:flex; align-items:center; justify-content:center;
    padding:2rem; cursor:zoom-out;
  `;
  overlay.innerHTML = `
    <img src="${url}" alt="${nome}"
         style="max-width:min(92vw,720px); max-height:90vh; object-fit:contain;
                border-radius:4px; box-shadow:var(--sombra2); cursor:default;"
         onerror="this.onerror=null;this.src='img/npcs/_placeholder.png'">
    <button aria-label="Fechar"
            style="position:absolute; top:1rem; right:1.2rem; width:38px; height:38px;
                   border-radius:50%; border:none; background:rgba(255,255,255,.12);
                   color:#fff; font-size:1.3rem; line-height:1; cursor:pointer;">×</button>
  `;

  const fechar = () => {
    overlay.remove();
    if (_fotoExpandidaKeyHandler) {
      document.removeEventListener('keydown', _fotoExpandidaKeyHandler);
      _fotoExpandidaKeyHandler = null;
    }
  };

  // Clique fora da imagem (no fundo escuro) fecha; clique na própria
  // imagem não propaga, então não fecha por engano.
  overlay.addEventListener('click', fechar);
  overlay.querySelector('img').addEventListener('click', (e) => e.stopPropagation());
  overlay.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); fechar(); });

  _fotoExpandidaKeyHandler = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', _fotoExpandidaKeyHandler);

  document.body.appendChild(overlay);
};

window.abrirPerfilNpc = async function(relId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const relSnap = await getDoc(relDocAtual(uid, j, relId));
  if (!relSnap.exists()) { toast('Relacionamento não encontrado.', 'ko'); return; }
  const r = relSnap.data();

  const eventosSnap = await getDocs(query(
    collection(relDocAtual(uid, j, relId), 'eventos'),
    orderBy('criado_em','desc'),
    limit(30)
  ));
  const eventos = eventosSnap.docs.map(d => d.data());

  const estagio = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const label = labelEstagio(r.estagio, r.sexo);
  const meses = _mesesNoRelacionamento(r, j);
  const avatarUrl = _avatarUrlNpc(r);
  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const html = `
    <div class="fb-profile">
      <div class="fb-header">
        <img src="${avatarUrl}" alt="${r.nome}" class="fb-avatar" style="cursor:zoom-in"
             onerror="this.onerror=null;this.src='img/npcs/_placeholder.png'"
             onclick="window.abrirFotoExpandida('${avatarUrl}', '${r.nome.replace(/'/g, "\\'")}')">
        <div class="fb-header-info">
          <div class="fb-nome">${r.nome}</div>
          <div class="fb-status">${label} de ${j.nome_personagem || 'você'} · há ${_formatarIdade(meses)}</div>
        </div>
      </div>
      <div class="fb-body">
        <div class="fb-col-esq">
          <div class="fb-box">
            <div class="fb-box-titulo">Informações</div>
            <div class="fb-info-linha">📍 <b>Região:</b> ${r.regiao || 'Não informado'}</div>
            <div class="fb-info-linha">💑 <b>Relacionamento:</b> ${label}</div>
            <div class="fb-info-linha">📊 <b>Compatibilidade:</b> ${r.compatibilidade||50}%</div>
            <div class="fb-info-linha">💗 <b>Afinidade:</b> ${r.afinidade}/${estagio.cap}</div>
            ${r.em_tempo ? `<div class="fb-info-linha">😔 <b>Status:</b> Dando um tempo — sem contato possível</div>` : ''}
          </div>
          <div class="fb-box">
            <div class="fb-box-titulo">Características</div>
            ${(r.tracos||[]).map(t => `<div class="fb-traco">${TRACOS[t]?.icone||''} ${TRACOS[t]?.l||t}</div>`).join('') || '<div style="font-size:.7rem;color:var(--txt4)">Nenhuma característica registrada.</div>'}
          </div>
        </div>
        <div class="fb-col-dir">
          <div class="fb-box">
            <div class="fb-box-titulo">Linha do tempo</div>
            ${eventos.length === 0
              ? '<div style="font-size:.72rem;color:var(--txt4);padding:.5rem 0">Nenhuma interação registrada ainda.</div>'
              : eventos.map(ev => `
                <div class="fb-evento">
                  <div class="fb-evento-data">${MESES_PT[ev.mes_pessoal]||''}, Ano ${ev.ano_pessoal}</div>
                  <div class="fb-evento-texto">${ev.label}</div>
                </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  abrirModal(`👤 Perfil`, html);
};

// ════════════════════════════════════════════════════════
// ACADEMIA
// ════════════════════════════════════════════════════════
window.aderirAcademia = async function() {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const custo = custoAcademia(j.reputacao||30);

  if ((j.dinheiro||0) < custo) { toast(`Saldo insuficiente. Adesão custa R$ ${custo.toLocaleString('pt-BR')}.`,'ko'); return; }
  if (!confirm(`Aderir à academia por R$ ${custo.toLocaleString('pt-BR')}?`)) return;

  await updateDoc(doc(db,'jogadores',uid), {
    academia_ativa: true, academia_bonus_energia: 0, academia_usada_mes:false,
    dinheiro: (j.dinheiro||0) - custo,
  });
  toast('🏋️ Adesão realizada! Compareça mensalmente para ganhar energia bônus.', 'ok', 5000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
};

window.frequentarAcademia = async function() {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const usado = j.energia_usada_mes||0;
  const disp  = Math.max(0,(j.energia_total||100)-usado);

  if (disp < ACADEMIA.energia_uso) { toast('⚡ Energia insuficiente.','ko'); return; }
  if (j.academia_usada_mes) { toast('Você já compareceu este mês.','ko'); return; }

  await updateDoc(doc(db,'jogadores',uid), {
    energia_usada_mes: usado + ACADEMIA.energia_uso,
    academia_usada_mes: true,
  });
  toast('💪 Comparecimento registrado! Bônus de energia será aplicado no próximo mês.', 'ok', 4000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 500);
};

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL (chamado ao avançar mês — fallback frontend)
// ════════════════════════════════════════════════════════
export async function processarRelacionamentosMensal(j) {
  const uid = j.uid || window.JOGADOR_UID;
  let updatesJogador = {};

  // ── Academia: bônus ou perda ──
  if (j.academia_ativa) {
    const bonusAtual = j.academia_bonus_energia || 0;
    if (j.academia_usada_mes) {
      updatesJogador.academia_bonus_energia = Math.min(ACADEMIA.bonus_max, bonusAtual + ACADEMIA.bonus_por_mes);
    } else {
      updatesJogador.academia_bonus_energia = Math.max(0, bonusAtual - ACADEMIA.perda_sem_uso);
    }
    updatesJogador.academia_usada_mes = false;
    updatesJogador.energia_total = 100 + (updatesJogador.academia_bonus_energia ?? bonusAtual);
  }

  // ── Relacionamentos: decaimento, eventos, gravidez ──
  const relSnap = await getDocs(query(relColecaoAtual(uid, j), where('ativo','==',true)));
  const rels    = relSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  const numAffairs = rels.filter(r => r.estagio === 'affair').length;
  const temNamoradaOuMais = rels.some(r => r.estagio !== 'affair');
  let smDelta = 0;
  let felicidadeSomaCompat = 0, felicidadeCount = 0;
  const mesTotalAtual = (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);

  for (const r of rels) {
    // Guarda de idempotência: se este relacionamento já foi processado neste
    // mês do jogo, pula — evita duplo processamento de gravidez/decaimento
    // quando a função é chamada mais de uma vez no mesmo avanço de mês.
    if (r._mes_processado === mesTotalAtual) continue;

    const estagio = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
    const upd = { _mes_processado: mesTotalAtual };

    // Decaimento se não interagiu
    if (!r._ganho_mes_atual) {
      upd.afinidade = Math.max(0, (r.afinidade||0) - estagio.decai);
    }
    upd._ganho_mes_atual = 0;
    upd._meses = (r._meses||0) + 1;

    // Sexo: tolerância e penalidades
    let mesesSemSexo = r.sexo_mes_atual ? 0 : (r.meses_sem_sexo||0) + 1;
    upd.meses_sem_sexo = mesesSemSexo;
    upd.sexo_mes_atual = false;
    if (mesesSemSexo >= SEXO_CONFIG.meses_tolerancia) {
      smDelta -= SEXO_CONFIG.perda_saude_mental_mes;
      upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) - SEXO_CONFIG.perda_afinidade_mes);
    }

    // Gravidez: só calcula se teve sexo neste mês
    if (r.sexo_mes_atual && !r.gravida && CHANCE_GRAVIDEZ[r.estagio]) {
      if (Math.random() < CHANCE_GRAVIDEZ[r.estagio]) {
        upd.gravida = true;
        upd.mes_gravidez = 1;
      }
    } else if (r.gravida) {
      const novoMes = (r.mes_gravidez||0) + 1;
      if (novoMes >= DURACAO_GESTACAO) {
        // Nascimento!
        await _gerarFilho(uid, j, r);
        upd.gravida = false;
        upd.mes_gravidez = 0;
        smDelta += 10; // saúde mental do nascimento
        await _registrarEvento(uid, j, r.id, {
          tipo: 'nascimento', label: `O filho de você e ${r.nome} nasceu`,
          mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
        });
      } else {
        upd.mes_gravidez = novoMes;
      }
    }

    // Flagra: se jogador tem affair ativo E está namorando+
    if (temNamoradaOuMais && r.estagio !== 'affair' && numAffairs > 0) {
      if (Math.random() < FLAGRA.chance_namorada_com_affair) {
        upd.ativo = false;
        upd.afinidade = 0;
        smDelta -= FLAGRA.penalidade_sm;
        // Notificar
        await addDoc(collection(db,'jogadores',uid,'inbox'), {
          de:'sistema', para_uid:uid,
          assunto:`💔 Flagrado(a) traindo!`,
          corpo:`${r.nome} descobriu seu affair e terminou o relacionamento. -${FLAGRA.penalidade_sm} saúde mental.`,
          tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
        });
        await _registrarEvento(uid, j, r.id, {
          tipo: 'flagra', label: `${r.nome} descobriu um affair e terminou com você`,
          mes_pessoal: j.mes_pessoal||0, ano_pessoal: j.ano_pessoal||1,
        });
      }
    }
    // Affair descoberto por outro affair
    else if (r.estagio === 'affair' && numAffairs > 1) {
      if (Math.random() < FLAGRA.chance_por_affair_extra * (numAffairs-1)) {
        upd.ativo = false;
        upd.afinidade = 0;
      }
    }
    // Término/tempo aleatório natural
    else if (Math.random() < estagio.termino_chance) {
      upd.ativo = false;
      smDelta -= IMPACTO_SM.termino[r.estagio] || 10;
    } else if (Math.random() < estagio.tempo_chance) {
      upd.afinidade = Math.max(0, Math.floor((upd.afinidade ?? r.afinidade) * 0.7));
      smDelta -= IMPACTO_SM.tempo[r.estagio] || 5;
    }

    await updateDoc(relDocAtual(uid, j, r.id), upd);

    if (upd.ativo !== false) {
      felicidadeSomaCompat += efeitoFelicidadeCompatibilidade(r.compatibilidade||50);
      felicidadeCount++;
    }
  }

  // ── Calcular felicidade ──
  const felicidadeBase   = j.felicidade !== undefined ? j.felicidade : 50;
  const smAtual           = Math.max(0, Math.min(100, (j.saude_mental||80) + smDelta));
  const felicidadeCompat  = felicidadeCount > 0 ? Math.round(felicidadeSomaCompat / felicidadeCount) : 0;
  const novaFelicidade    = Math.max(0, Math.min(100, Math.round(
    felicidadeBase*0.5 + smAtual*0.3 + felicidadeCompat + 25*0.2
  )));

  updatesJogador.saude_mental = smAtual;
  updatesJogador.felicidade   = novaFelicidade;

  // ── Filhos: envelhecer e cobrar custos ──
  // Idade armazenada em MESES inteiros (evita acúmulo de erro de float).
  // idade_anos (campo legado/derivado) é calculado só para exibição.
  const filhosSnap = await getDocs(filhosColecaoAtual(uid, j));
  let custoFilhos = 0;
  for (const fDoc of filhosSnap.docs) {
    const f = fDoc.data();
    const idadeMesesAtual = f.idade_meses!==undefined ? f.idade_meses : Math.round((f.idade||0)*12); // migração de dados antigos
    const novaIdadeMeses  = idadeMesesAtual + 1;
    const idadeAnosCompletos = Math.floor(novaIdadeMeses/12);

    custoFilhos += custoFilhoPorIdade(idadeAnosCompletos);
    const upd = { idade_meses: novaIdadeMeses, idade: idadeAnosCompletos }; // idade = anos completos, inteiro, sem float

    if (idadeAnosCompletos >= 18 && !f.faculdade) {
      upd.faculdade = Math.random() < 0.3 ? 'Direito' : ['Medicina','Engenharia','Administração'][Math.floor(Math.random()*3)];
    }
    if (idadeAnosCompletos >= 22 && f.faculdade === 'Direito' && !f.jogavel) {
      upd.jogavel = true;
    }
    await updateDoc(filhoDocAtual(uid, j, fDoc.id), upd);
  }
  updatesJogador.custo_filhos_mes = custoFilhos;

  if (Object.keys(updatesJogador).length > 0) {
    await updateDoc(doc(db,'jogadores',uid), updatesJogador);
  }

  return updatesJogador;
}

// Expor globalmente para ser chamado pelo avancar_mes.js
window._processarRelacionamentosMensal = processarRelacionamentosMensal;

async function _gerarFilho(uid, j, relacionamento) {
  const NOMES_BEBE = {
    m: ['Lucas','Gabriel','Pedro','Davi','Miguel','Arthur','Heitor','Théo'],
    f: ['Helena','Alice','Laura','Maria','Sofia','Valentina','Júlia','Lívia'],
  };
  const sexo = Math.random() < 0.5 ? 'm' : 'f';
  const nome = NOMES_BEBE[sexo][Math.floor(Math.random()*NOMES_BEBE[sexo].length)];

  await addDoc(filhosColecaoAtual(uid, j), {
    nome, sexo, idade:0, idade_meses:0,
    mae_ou_pai: relacionamento.nome,
    faculdade: null, jogavel:false,
    criado_em: new Date().toISOString(),
  });

  await addDoc(collection(db,'jogadores',uid,'inbox'), {
    de:'sistema', para_uid:uid,
    assunto:`👶 ${nome} nasceu!`,
    corpo:`Parabéns! ${nome} nasceu. +10 saúde mental, +20 felicidade nos próximos meses.`,
    tipo:'sistema', tipo_noticia:'positivo', lida:false, criado_em:new Date().toISOString(),
  });
}

// ════════════════════════════════════════════════════════
// ASSUMIR HERDEIRO — multi-personagem de verdade
// Cada filho promovido vira um personagem PRÓPRIO e permanente em
// jogadores/{uid}/personagens/{id} — vida isolada (relacionamentos/filhos
// dele ficam em personagens/{id}/relacionamentos|filhos, ver
// js/personagens.js:relColecaoAtual/filhosColecaoAtual), com um pedaço
// escolhido do patrimônio do personagem que está concedendo (dinheiro até
// REPUTACAO_HERANCA_PCT... ver custoTransferencia abaixo, um imóvel, um
// carro) e reputação parcial herdada. Depois de criado, ele fica
// disponível no trocador do topbar (js/personagens.js:window.
// trocarPersonagem) — nada troca automaticamente aqui.
// ════════════════════════════════════════════════════════
const REPUTACAO_HERANCA_PCT = 0.4;   // quanto da reputação do doador o herdeiro herda
const DINHEIRO_HERANCA_PCT_MAX = 0.3; // teto de quanto dinheiro dá pra transferir de uma vez
const BONUS_SKILLS_HERDEIRO = 10;     // pontos livres de Habilidades Gerais na criação

window.assumirHerdeiro = async function(filhoId, opts) {
  const { dinheiroTransferido = 0, moradiaId = null, carroId = null, bonusSkills = {} } = opts || {};

  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  if (!uid) return;

  const filhoRef  = filhoDocAtual(uid, j, filhoId);
  const filhoSnap = await getDoc(filhoRef);
  if (!filhoSnap.exists()) { toast('Herdeiro não encontrado.', 'ko'); return; }
  const f = filhoSnap.data();
  if (!f.jogavel) { toast('Este herdeiro ainda não está pronto para assumir o controle.', 'ko'); return; }

  const dinheiroDoador = j.dinheiro || 0;
  const tetoDinheiro   = Math.floor(dinheiroDoador * DINHEIRO_HERANCA_PCT_MAX);
  const dinheiro       = Math.max(0, Math.min(tetoDinheiro, Math.round(dinheiroTransferido || 0)));

  const somaBonus = Object.values(bonusSkills || {}).reduce((s, v) => s + (v || 0), 0);
  if (somaBonus > BONUS_SKILLS_HERDEIRO) { toast(`Só dá pra distribuir até ${BONUS_SKILLS_HERDEIRO} pontos de bônus.`, 'ko'); return; }

  const moradiasDoador = { ...(j.moradias_compradas || {}) };
  const carrosDoador    = { ...(j.carros_comprados || {}) };
  if (moradiaId && (!moradiasDoador[moradiaId] || Object.keys(moradiasDoador).length < 2)) {
    toast('Você precisa ter esse imóvel e mais um pra poder transferir.', 'ko'); return;
  }
  if (carroId) {
    const financEmAberto = j.financiamentos?.[carroId]?.parcelas_restantes > 0;
    if (!carrosDoador[carroId] || Object.keys(carrosDoador).length < 2) {
      toast('Você precisa ter esse carro e mais um pra poder transferir.', 'ko'); return;
    }
    if (financEmAberto) { toast('Esse carro ainda tem financiamento em aberto — quite antes de transferir.', 'ko'); return; }
  }

  if (!confirm(`Dar controle de ${f.nome} agora? Ele vira um personagem separado, selecionável no trocador do topbar a qualquer momento.`)) return;

  const novoId       = doc(collection(db, 'jogadores', uid, 'personagens')).id;
  const jogadorRef   = doc(db, 'jogadores', uid);
  const novoPersRef  = doc(db, 'jogadores', uid, 'personagens', novoId);
  const mesGlobalAtual = j.mes_global_pessoal ?? j.mes_global_inicio ?? 0;

  // Skills novato + bônus escolhido — mesmo shape de criação de personagem
  // (index.html), 8 Habilidades Gerais, tudo mais em zero.
  const skills = {};
  for (const [sk, v] of Object.entries(bonusSkills || {})) {
    if (v > 0) skills[sk] = v;
  }

  if (moradiaId) delete moradiasDoador[moradiaId];
  if (carroId)   delete carrosDoador[carroId];

  const patDoador = { ...(j.pat || {}) };
  if (moradiaId && j.pat?.moradia === moradiaId) {
    patDoador.moradia = Object.keys(moradiasDoador)[0] || 'pais';
  }
  if (carroId && j.pat?.transporte === carroId) {
    patDoador.transporte = Object.keys(carrosDoador).find(k => k !== 'onibus') || 'onibus';
  }

  try {
    await runTransaction(db, async (tx) => {
      const jogadorSnap = await tx.get(jogadorRef);
      if (!jogadorSnap.exists()) throw new Error('Personagem não encontrado.');
      const jd = jogadorSnap.data();

      // Ficha nova — mesma base de um personagem recém-criado, só com os
      // recursos escolhidos pelo doador por cima.
      tx.set(novoPersRef, {
        nome_personagem: f.nome, sexo: f.sexo || null,
        especialidade: jd.especialidade || 'civil', faculdade: 'Direito',
        cargo_id: 'est', cargo_publico_id: null, oab: false, concurso_aprovado: false,
        anos_carreira: 0, mes_global_inicio: mesGlobalAtual, idade: f.idade, idade_inicial: f.idade, idade_meses: f.idade_meses ?? (f.idade||0)*12,
        reputacao: Math.round((jd.reputacao||0) * REPUTACAO_HERANCA_PCT),
        networking: 5, saude_mental: 80, disposicao: 80,
        prestigio_academico: 0, energia: 100, energia_usada_mes: 0,
        skills,
        dinheiro, meses_negativo: 0, meses_positivo_streak: 0, no_serasa: false,
        renda_calculada: 0, despesas_calculadas: 0,
        pat: {
          moradia: moradiaId || 'pais',
          transporte: carroId || 'onibus',
          escritorio: 'home',
        },
        moradias_compradas: moradiaId ? { [moradiaId]: true } : {},
        carros_comprados: carroId ? { [carroId]: true } : {},
        prazo_sair_pais: 0, mora_com_pais: !moradiaId,
        financiamentos: {},
        escritorio_id: 'solo', escritorio_empregado_id: null, escritorio_proprio_id: null,
        escritorio_nome: null, vaga_tipo: 'contencioso', sal_mult: 1.0,
        xp: 0, xp_next: 120, wins: 0, losses: 0, wins_ano: 0, losses_ano: 0, derrotas_consecutivas: 0,
        estado_civil: 'solteiro', conjuge_uid: null, filhos: 0, geracao: (jd.geracao||1) + 1,
        study_queue: [], cursos_feitos: [], compras: [], estagiarios: [],
        em_burnout: false, burnout_ate_mes: 0, recesso_pendente: false,
        aposentado: false, aposentado_forcado_pendente: false,
        ultimo_mes_processado: 0, bonus_pendente: 0,
        criado_em: new Date().toISOString(),
      });

      // Doador perde só o que foi explicitamente transferido.
      tx.update(jogadorRef, {
        dinheiro: dinheiroDoador - dinheiro,
        moradias_compradas: moradiasDoador,
        carros_comprados: carrosDoador,
        pat: patDoador,
      });

      tx.delete(filhoRef);
    });

    await addDoc(collection(db,'jogadores',uid,'inbox'), {
      de:'sistema', para_uid:uid,
      assunto: '🎓 Novo herdeiro jogável',
      corpo: `${f.nome} assumiu o controle e agora tem sua própria carreira — acesse pelo trocador de personagem no topo da tela.${dinheiro>0?` Recebeu ${dinheiro.toLocaleString('pt-BR')} em dinheiro.`:''}`,
      tipo:'sistema', tipo_noticia:'positivo', lida:false, criado_em:new Date().toISOString(),
    });

    toast(`🎓 ${f.nome} agora é jogável! Troque pra ele no topo da tela quando quiser.`, 'ok', 6000);
    setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 800);
  } catch (e) {
    console.error('[ASSUMIR HERDEIRO]', e);
    toast('Erro ao assumir herdeiro: ' + (e.message||''), 'ko');
  }
};

// ════════════════════════════════════════════════════════
// EFEITO DA FELICIDADE NA CHANCE DE VITÓRIA (exportado p/ processos.js)
// ════════════════════════════════════════════════════════
window.getBonusFelicidade = function(jogador) {
  return efeitoFelicidadeChance(jogador.felicidade !== undefined ? jogador.felicidade : 50);
};
