/**
 * EQUIPE — Advocatus Online
 * Sistema de contratação, designação e gestão de funcionários
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

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

  // ── Caso 1: nenhum escritório próprio nem vínculo com escritório próprio de outrem ──
  const escId = j.escritorio_proprio_id;
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

  const estagiarios = funcs.filter(f => f.cargo_id === 'est');
  const assistentes = funcs.filter(f => f.cargo_id === 'ass');
  const advogados   = funcs.filter(f => ['jnr','pln','snr'].includes(f.cargo_id));

  const totalSalarios = funcs.reduce((s,f) => s + (CARGO_INFO[f.cargo_id]?.sal || 0), 0);
  const energiaDisp   = Math.max(0, 100 - (j.energia_usada_mes || 0));

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">👥 Equipe — ${esc.nome}</div>
      <span class="secao-badge">Tier ${tier} · ${funcs.length} membro(s)</span>
    </div>

    <!-- Resumo financeiro -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:1rem">
      <div class="stat-mini">
        <div class="v" style="color:var(--navy)">${funcs.length}/${cap.estagiarios+cap.assistentes+cap.advogados}</div>
        <div class="l">👥 Vagas ocupadas</div>
      </div>
      <div class="stat-mini">
        <div class="v" style="color:var(--verm2)">-${_fmtK(totalSalarios)}</div>
        <div class="l">💸 Salários/mês</div>
      </div>
      <div class="stat-mini">
        <div class="v" style="color:var(--verm2)">-${_fmtK(cap.custo_fixo)}</div>
        <div class="l">🏢 Custo fixo/mês</div>
      </div>
    </div>

    <!-- Grupos de cargo -->
    ${_renderGrupo('🎓 Estagiários', estagiarios, cap.estagiarios, 'est', escId, energiaDisp)}
    ${_renderGrupo('📋 Assistentes', assistentes, cap.assistentes, 'ass', escId, energiaDisp)}
    ${_renderGrupo('⚖️ Advogados', advogados, cap.advogados, 'jnr', escId, energiaDisp)}

    <!-- Processos para revisão (90% concluídos por funcionários) -->
    ${await _renderProcessosPendentesRevisao(j, escId)}`;
};

function _renderGrupo(titulo, membros, vagas, cargo_min, escId, energiaDisp) {
  const ci = CARGO_INFO[cargo_min] || CARGO_INFO.est;
  return `
    <div style="margin-bottom:1.2rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;padding-bottom:.35rem;border-bottom:2px solid var(--navy-light)">
        <div style="font-size:.8rem;font-weight:700;color:var(--navy)">${titulo}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span style="font-size:.65rem;color:var(--txt4)">${membros.length}/${vagas} vagas</span>
          ${membros.length < vagas
            ? `<button class="btn btn-sm btn-prim" onclick="window.abrirModalContratar('${cargo_min}','${escId}')">+ Contratar</button>`
            : `<span style="font-size:.65rem;color:var(--amber)">Vagas cheias</span>`}
        </div>
      </div>
      ${membros.length === 0
        ? `<div style="font-size:.75rem;color:var(--txt4);padding:.5rem 0">Nenhum ${titulo.split(' ')[1].toLowerCase()} contratado ainda.</div>`
        : membros.map(f => _cardFuncionario(f, escId, energiaDisp)).join('')}
    </div>`;
}

function _cardFuncionario(f, escId, energiaDisp) {
  const ci    = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;
  const skills = f.skills || {};
  const skMed  = Math.round(Object.values(skills).reduce((a,b)=>a+b,0) / Math.max(1,Object.values(skills).length));
  const podeCoordenar = energiaDisp >= ci.custo_coord;

  return `
    <div class="card" style="margin-bottom:.5rem;border-left:3px solid var(--navy3)">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:.8rem">
        <div style="flex:1">
          <div style="font-weight:700;font-size:.88rem;color:var(--navy)">${f.nome}</div>
          <div style="font-size:.68rem;color:var(--ouro2);margin-bottom:.3rem">${ci.l} · Skills média: ${skMed}</div>
          <div style="display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:.4rem">
            ${Object.entries(skills).map(([k,v])=>
              `<span style="font-size:.6rem;padding:.1rem .35rem;background:var(--navy-light);border-radius:20px;color:var(--navy3)">${_skillLabel(k)}: ${v}</span>`
            ).join('')}
          </div>
          ${f.acao_atual ? `
            <div style="font-size:.7rem;color:var(--amber);margin-bottom:.3rem">
              📋 Trabalhando em processo · ${f.acao_atual.progresso_delegado||0}% concluído
            </div>` : ''}
          <div style="font-size:.68rem;color:var(--txt4)">
            Salário: <b style="color:var(--verm2)">R$ ${ci.sal.toLocaleString('pt-BR')}/mês</b>
            ${ci.hon_pct > 0 ? ` · Comissão: ${ci.hon_pct*100}% honorários` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.3rem;flex-shrink:0">
          <button class="btn btn-sm btn-prim" ${!podeCoordenar?'disabled':''} 
            onclick="window.abrirModalDesignar('${f.id}','${escId}')"
            title="${!podeCoordenar?'Energia insuficiente':'Designar processo'}">
            📋 Designar (-${ci.custo_coord}⚡)
          </button>
          <button class="btn btn-sm btn-ghost btn-danger" 
            onclick="window.demitirFuncionario('${f.id}','${escId}','${f.nome}')">
            Demitir
          </button>
        </div>
      </div>
    </div>`;
}

async function _renderProcessosPendentesRevisao(j, escId) {
  try {
    const qSnap = await getDocs(query(
      collection(db, 'processos'),
      where('escritorio_id', '==', escId),
      where('delegado_revisao_pendente', '==', true)
    ));
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
                <div style="font-size:.82rem;font-weight:600;color:var(--navy)">${p.autor||'—'} vs ${p.reu||'—'}</div>
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

window._contratarNPC = async function(cargo_min, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  // Escolher cargo disponível (pode ser o mínimo ou acima)
  const CARGOS_DISPONIVEIS = {
    est: ['est'],
    ass: ['ass'],
    jnr: ['jnr','pln','snr'],
  };
  const cargos   = CARGOS_DISPONIVEIS[cargo_min] || ['est'];
  const cargo_id = cargos[Math.floor(Math.random() * Math.min(2, cargos.length))];
  const ci       = CARGO_INFO[cargo_id];

  // Gerar NPC
  const sexo      = Math.random() < 0.5 ? 'm' : 'f';
  const primeiroNome = NOMES_NPC[sexo][Math.floor(Math.random() * NOMES_NPC[sexo].length)];
  const sobrenome    = NOMES_NPC.sobrenomes[Math.floor(Math.random() * NOMES_NPC.sobrenomes.length)];
  const nome         = primeiroNome + ' ' + sobrenome;

  // Skills baseadas no cargo (com variação ±30%)
  const BASE_SKILLS = {
    est: { pesquisa:12, escrita:10, argumentacao:10, oratoria:8  },
    ass: { pesquisa:22, escrita:20, argumentacao:18, oratoria:15 },
    jnr: { pesquisa:30, escrita:28, argumentacao:28, oratoria:25 },
    pln: { pesquisa:40, escrita:38, argumentacao:38, oratoria:35 },
    snr: { pesquisa:50, escrita:48, argumentacao:48, oratoria:45 },
  };
  const base   = BASE_SKILLS[cargo_id] || BASE_SKILLS.est;
  const skills = {};
  Object.entries(base).forEach(([k,v]) => {
    skills[k] = Math.max(1, Math.round(v * (0.7 + Math.random() * 0.6)));
  });

  const funcionario = {
    nome, cargo_id, skills, sexo,
    tipo:       'npc',
    escritorio_id: escId,
    dono_uid:   uid,
    ativo:      true,
    acoes_mes_usadas: 0,
    acao_atual: null,
    criado_em:  new Date().toISOString(),
  };

  try {
    const ref = await addDoc(collection(db, 'escritorios', escId, 'funcionarios'), funcionario);
    fecharModal();
    toast(`✅ ${nome} (${ci.l}) contratado! Salário: R$ ${ci.sal.toLocaleString('pt-BR')}/mês`, 'ok', 5000);
    // Recarregar equipe
    setTimeout(() => window.navTo && window.navTo('equipe', null), 600);
  } catch(err) {
    toast('Erro ao contratar: ' + err.message, 'ko');
    console.error(err);
  }
};

// ════════════════════════════════════════════════════════
// DESIGNAR PROCESSO PARA FUNCIONÁRIO
// ════════════════════════════════════════════════════════
window.abrirModalDesignar = async function(funcId, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  // Buscar processos ativos do escritório que podem ser delegados
  const qSnap = await getDocs(query(
    collection(db, 'processos'),
    where('advogado_uid', '==', uid),
    where('status', '==', 'andamento')
  ));
  const processos = qSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => !p.delegado_revisao_pendente && (p.progresso||0) < 90);

  if (processos.length === 0) {
    toast('Nenhum processo disponível para delegar (sem processos ativos abaixo de 90%).', 'ko');
    return;
  }

  const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  if (!fSnap.exists()) return;
  const f  = fSnap.data();
  const ci = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;

  if ((f.acoes_mes_usadas || 0) >= ci.acoes_mes) {
    toast(`${f.nome} já usou todas as ${ci.acoes_mes} ação(ões) deste mês.`, 'ko');
    return;
  }

  abrirModal(`📋 Designar Processo — ${f.nome}`,
    `<div style="font-size:.75rem;color:var(--txt3);margin-bottom:.8rem">
      ${f.nome} pode realizar <b>${ci.acoes_mes - (f.acoes_mes_usadas||0)}</b> ação(ões) ainda neste mês.
      O funcionário avançará o processo até <b>90%</b> — os últimos 10% e a sentença ficam com você.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${processos.map(p => `
        <button class="btn btn-ghost btn-block" style="text-align:left;padding:.65rem .85rem"
          onclick="window._confirmarDesignar('${funcId}','${p.id}','${escId}')">
          <div style="font-weight:600;font-size:.82rem;color:var(--navy)">${p.autor||'—'} vs ${p.reu||'—'}</div>
          <div style="font-size:.67rem;color:var(--txt3)">${p.tipo||'—'} · ${p.progresso||0}% concluído · ${_fmtK(p.valor||0)}</div>
        </button>`).join('')}
    </div>`
  );
};

window._confirmarDesignar = async function(funcId, procId, escId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const fSnap = await getDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId));
  const pSnap = await getDoc(doc(db, 'processos', procId));
  if (!fSnap.exists() || !pSnap.exists()) return;

  const f    = fSnap.data();
  const p    = pSnap.data();
  const ci   = CARGO_INFO[f.cargo_id] || CARGO_INFO.est;

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
  const chance  = Math.min(85, 35 + bonus); // nunca > 85% de acerto total
  const sucesso = Math.random() * 100 < chance;

  // Progresso por cargo — escalonado para ser relevante
  const PROG_SUCESSO = { est:35, ass:45, jnr:55, pln:65, snr:75 };
  const PROG_FALHA   = { est:15, ass:20, jnr:25, pln:30, snr:35 };
  const ganhoP = sucesso
    ? (PROG_SUCESSO[f.cargo_id] || 35)
    : (PROG_FALHA[f.cargo_id]   || 15);

  const progressoAtual = p.progresso || 0;
  const progressoAlvo  = Math.min(90, progressoAtual + ganhoP);
  const chegou90       = progressoAlvo >= 90;

  // Atualizar processo
  await updateDoc(doc(db, 'processos', procId), {
    progresso:                  progressoAlvo,
    delegado_func_id:           funcId,
    delegado_revisao_pendente:  chegou90,
    chance_sucesso: Math.min(90, (p.chance_sucesso||50) + (sucesso ? bonus * 0.3 : -3)),
  });

  // Atualizar funcionário
  await updateDoc(doc(db, 'escritorios', escId, 'funcionarios', funcId), {
    acoes_mes_usadas: (f.acoes_mes_usadas || 0) + 1,
    acao_atual: chegou90 ? null : { procId, progresso_delegado: progressoAlvo },
  });

  fecharModal();

  if (chegou90) {
    toast(`✅ ${f.nome} chegou a 90%! Processo pronto para sua revisão e sentença.`, 'ok', 6000);
  } else if (sucesso) {
    toast(`📈 ${f.nome} avançou o processo para ${progressoAlvo}%.`, 'ok', 4000);
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
