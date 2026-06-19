/**
 * RELACIONAMENTO — Advocatus Online
 * Sistema de namoro, traços de personalidade, gravidez, filhos e herdeiros.
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import {
  TRACOS, LOCAIS_CONHECER, ESTAGIOS, IMPACTO_SM, INTERACOES, GANHO_MAX_MENSAL,
  PROGRESSAO, CHANCE_GRAVIDEZ, DURACAO_GESTACAO, ACADEMIA, SEXO_CONFIG, FLAGRA,
  calcCompatibilidade, gerarParceiroNPC, labelEstagio, efeitoFelicidadeChance,
  efeitoFelicidadeCompatibilidade, custoFilhoPorIdade, custoAcademia,
} from './relacionamento_dados.js';

// ════════════════════════════════════════════════════════
// PAINEL PRINCIPAL — VIDA PESSOAL
// ════════════════════════════════════════════════════════
window.renderVidaPessoal = async function(j, el) {
  const uid = j.uid || window.JOGADOR_UID;

  // Buscar relacionamentos ativos do jogador
  const relSnap = await getDocs(query(
    collection(db, 'jogadores', uid, 'relacionamentos'),
    where('ativo', '==', true)
  ));
  const relacionamentos = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Buscar filhos
  const filhosSnap = await getDocs(collection(db, 'jogadores', uid, 'filhos'));
  const filhos = filhosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const felicidade = j.felicidade !== undefined ? j.felicidade : 50;
  const corFel = felicidade >= 80 ? 'var(--verde2)' : felicidade >= 60 ? 'var(--navy3)' :
                 felicidade >= 40 ? 'var(--amber)' : 'var(--verm2)';

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">💞 Vida Pessoal</div>
      <span class="secao-badge" style="background:${corFel}20;color:${corFel}">😊 Felicidade: ${felicidade}/100</span>
    </div>

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

    <!-- Filhos -->
    ${filhos.length > 0 ? `
      <div class="secao-header" style="margin-top:1.2rem">
        <div class="secao-titulo">👶 Filhos</div>
        <span class="secao-badge">${filhos.length}</span>
      </div>
      ${filhos.map(f => _cardFilho(f)).join('')}` : ''}
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
            <div style="font-weight:700;color:var(--navy);font-size:.85rem">🏋️ Academia</div>
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

function _cardRelacionamento(r, j) {
  const estagio  = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const label    = labelEstagio(r.estagio, r.sexo);
  const pct      = Math.min(100, Math.round((r.afinidade / estagio.cap) * 100));
  const cor      = pct >= 80 ? 'var(--verde2)' : pct >= 50 ? 'var(--ouro2)' : pct >= 25 ? 'var(--navy3)' : 'var(--txt4)';
  const tracosLabel = (r.tracos||[]).map(t => TRACOS[t]?.icone + ' ' + TRACOS[t]?.l).join(' · ');
  const meses = _mesesNoRelacionamento(r, j);

  return `
    <div class="card" style="margin-bottom:.6rem;border-left:3px solid ${r.estagio==='affair'?'var(--verm3)':'var(--navy3)'}">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:.8rem">
        <div style="flex:1">
          <div style="font-weight:700;font-size:.92rem;color:var(--navy)">${r.nome}</div>
          <div style="font-size:.68rem;color:var(--ouro2);margin-bottom:.3rem">${label} · ${meses} meses · ${tracosLabel}</div>
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
            <div style="flex:1;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px"></div>
            </div>
            <span style="font-size:.68rem;font-weight:700;color:${cor}">${r.afinidade}/${estagio.cap}</span>
          </div>
          ${r.gravida ? `<div style="font-size:.7rem;color:var(--verde2);font-weight:600">🤰 Gestação: mês ${r.mes_gravidez}/9</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem">
        ${Object.entries(INTERACOES).map(([k,v]) =>
          `<button class="btn btn-sm btn-ghost" onclick="window.interagirRelacionamento('${r.id}','${k}')" title="${v.l}">
            ${v.icone} -${v.energia}⚡
          </button>`).join('')}
        ${_botaoProgresso(r)}
        <button class="btn btn-sm btn-danger" onclick="window.terminarRelacionamento('${r.id}','${r.nome}')">
          Terminar
        </button>
      </div>
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
          <div style="font-weight:700;color:var(--navy);font-size:.85rem">${f.sexo==='m'?'👦':'👧'} ${f.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${_formatarIdade(idadeMeses)} ${f.faculdade?`· Cursando ${f.faculdade}`:''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.7rem;color:var(--verm2)">-R$ ${custo}/mês</div>
          ${f.jogavel ? `<button class="btn btn-sm btn-prim" style="margin-top:.3rem" onclick="window.assumirHerdeiro('${f.id}')">Assumir controle</button>` : ''}
        </div>
      </div>
    </div>`;
}

function _mesesNoRelacionamento(r, j) {
  if (!r.iniciado_mes_total) return 0;
  const mesAtualTotal = (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);
  return Math.max(0, mesAtualTotal - r.iniciado_mes_total);
}

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
              <div style="font-weight:600;font-size:.82rem;color:var(--navy)">${v.icone} ${v.l}</div>
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
  const relSnap = await getDocs(query(collection(db,'jogadores',uid,'relacionamentos'), where('ativo','==',true)));
  const rels    = relSnap.docs.map(d=>d.data());
  const temNamoradaOuMais = rels.some(r => r.estagio !== 'affair');

  // Sexo oposto ao do jogador (assumindo jogador heterossexual por padrão — pode ser configurável)
  const sexoParceiro = (j.sexo === 'f') ? 'm' : 'f';
  const candidatos = [];
  for (let i=0; i<3; i++) {
    const p = gerarParceiroNPC(sexoParceiro);
    const compat = calcCompatibilidade(j.tracos_pessoais || [], p.tracos);
    candidatos.push({ ...p, compatibilidade: compat });
  }

  fecharModal();
  abrirModal(`${local.icone} ${local.l}`,
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:1rem">
      Você conheceu algumas pessoas interessantes:
      ${temNamoradaOuMais ? '<br><span style="color:var(--amber)">⚠️ Você já está namorando — isso seria um affair.</span>' : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${candidatos.map((c,i) => `
        <div class="card" style="margin-bottom:0">
          <div style="font-weight:700;color:var(--navy);font-size:.85rem">${c.nome}, ${c.idade} anos</div>
          <div style="font-size:.68rem;color:var(--ouro2);margin:.2rem 0">
            ${c.tracos.map(t=>TRACOS[t]?.icone+' '+TRACOS[t]?.l).join(' · ')}
          </div>
          <button class="btn btn-sm btn-prim btn-block" onclick='window.iniciarAffair(${JSON.stringify(c).replace(/'/g,"&apos;")})'>
            Trocar contato (iniciar Affair)
          </button>
        </div>`).join('')}
    </div>`
  );
};

window.iniciarAffair = async function(candidato) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const compat = candidato.compatibilidade;

  const relSnap = await getDocs(query(collection(db,'jogadores',uid,'relacionamentos'), where('ativo','==',true)));
  const numAffairs = relSnap.docs.filter(d => d.data().estagio === 'affair').length;

  try {
    await addDoc(collection(db, 'jogadores', uid, 'relacionamentos'), {
      nome: candidato.nome, sexo: candidato.sexo, tracos: candidato.tracos,
      compatibilidade: compat, estagio: 'affair', afinidade: 5,
      ativo: true, gravida: false, mes_gravidez: 0,
      meses_sem_sexo: 0, _meses: 0,
      iniciado_mes_total: (j.ano_pessoal||1)*12 + (j.mes_pessoal||0),
      criado_em: new Date().toISOString(),
    });
    fecharModal();
    toast(`💌 Você iniciou um affair com ${candidato.nome}!`, 'ok', 4000);
    setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
  } catch(err) {
    toast('Erro: ' + err.message, 'ko');
  }
};

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

  const relRef  = doc(db, 'jogadores', uid, 'relacionamentos', relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  // Limite mensal de ganho
  const ganhoMesAtual = r._ganho_mes_atual || 0;
  if (ganhoMesAtual >= GANHO_MAX_MENSAL) {
    toast('Limite mensal de afinidade já atingido com essa pessoa.', 'ko');
    return;
  }

  // Multiplicadores por traço
  let multGanho = 1.0;
  if ((r.tracos||[]).includes('romantica')) multGanho *= 1.20;
  if ((r.tracos||[]).includes('carente'))   multGanho *= 1.25;

  const ganho = Math.min(GANHO_MAX_MENSAL - ganhoMesAtual, Math.round(inter.afinidade * multGanho));
  const estagio = ESTAGIOS[r.estagio] || ESTAGIOS.affair;
  const novaAfinidade = Math.min(estagio.cap, (r.afinidade||0) + ganho);

  const updates = {
    afinidade: novaAfinidade,
    _ganho_mes_atual: ganhoMesAtual + ganho,
  };

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

  toast(`${inter.icone} +${ganho} afinidade${smGanho?` · +${smGanho} saúde mental`:''}`, 'ok', 3000);
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

  const relRef  = doc(db,'jogadores',uid,'relacionamentos',relId);
  const relSnap = await getDoc(relRef);
  if (!relSnap.exists()) return;
  const r = relSnap.data();

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

  const relSnap = await getDoc(doc(db,'jogadores',uid,'relacionamentos',relId));
  if (!relSnap.exists()) return;
  const r = relSnap.data();

  const impacto = IMPACTO_SM.termino[r.estagio] || 10;
  await updateDoc(doc(db,'jogadores',uid,'relacionamentos',relId), { ativo:false, terminado_em:new Date().toISOString() });
  await updateDoc(doc(db,'jogadores',uid), { saude_mental: Math.max(0, (j.saude_mental||80) - impacto) });

  toast(`💔 Você terminou com ${nome}. -${impacto} saúde mental.`, 'neutro', 5000);
  setTimeout(()=>window.navTo&&window.navTo('vida_pessoal',null), 600);
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
  const relSnap = await getDocs(query(collection(db,'jogadores',uid,'relacionamentos'), where('ativo','==',true)));
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
        await _gerarFilho(uid, r);
        upd.gravida = false;
        upd.mes_gravidez = 0;
        smDelta += 10; // saúde mental do nascimento
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

    await updateDoc(doc(db,'jogadores',uid,'relacionamentos',r.id), upd);

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
  const filhosSnap = await getDocs(collection(db,'jogadores',uid,'filhos'));
  let custoFilhos = 0;
  for (const fDoc of filhosSnap.docs) {
    const f = fDoc.data();
    const idadeMesesAtual = f.idade_meses!==undefined ? f.idade_meses : Math.round((f.idade||0)*12); // migração de dados antigos
    const novaIdadeMeses  = idadeMesesAtual + 1;
    const idadeAnosCompletos = Math.floor(novaIdadeMeses/12);

    custoFilhos += custoFilhoPorIdade(Math.floor(idadeMesesAtual/12));
    const upd = { idade_meses: novaIdadeMeses, idade: idadeAnosCompletos }; // idade = anos completos, inteiro, sem float

    if (idadeAnosCompletos >= 18 && !f.faculdade) {
      upd.faculdade = Math.random() < 0.3 ? 'Direito' : ['Medicina','Engenharia','Administração'][Math.floor(Math.random()*3)];
    }
    if (idadeAnosCompletos >= 22 && f.faculdade === 'Direito' && !f.jogavel) {
      upd.jogavel = true;
    }
    await updateDoc(doc(db,'jogadores',uid,'filhos',fDoc.id), upd);
  }
  updatesJogador.custo_filhos_mes = custoFilhos;

  if (Object.keys(updatesJogador).length > 0) {
    await updateDoc(doc(db,'jogadores',uid), updatesJogador);
  }

  return updatesJogador;
}

// Expor globalmente para ser chamado pelo avancar_mes.js
window._processarRelacionamentosMensal = processarRelacionamentosMensal;

async function _gerarFilho(uid, relacionamento) {
  const NOMES_BEBE = {
    m: ['Lucas','Gabriel','Pedro','Davi','Miguel','Arthur','Heitor','Théo'],
    f: ['Helena','Alice','Laura','Maria','Sofia','Valentina','Júlia','Lívia'],
  };
  const sexo = Math.random() < 0.5 ? 'm' : 'f';
  const nome = NOMES_BEBE[sexo][Math.floor(Math.random()*NOMES_BEBE[sexo].length)];

  await addDoc(collection(db,'jogadores',uid,'filhos'), {
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
// ASSUMIR HERDEIRO
// ════════════════════════════════════════════════════════
window.assumirHerdeiro = async function(filhoId) {
  if (!confirm('Assumir o controle deste herdeiro? Você poderá alternar entre personagens.')) return;
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  toast('🎓 Sistema de herança ainda em desenvolvimento — em breve!', 'neutro', 4000);
  // TODO: lógica completa de transferência de personagem
};

// ════════════════════════════════════════════════════════
// EFEITO DA FELICIDADE NA CHANCE DE VITÓRIA (exportado p/ processos.js)
// ════════════════════════════════════════════════════════
window.getBonusFelicidade = function(jogador) {
  return efeitoFelicidadeChance(jogador.felicidade !== undefined ? jogador.felicidade : 50);
};
