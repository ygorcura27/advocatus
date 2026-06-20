/**
 * VAGAS — Advocatus Online
 * Sistema de vagas: listagem, candidatura, convites NPC por prestígio,
 * impacto do escritório no gameplay.
 */

import { doc, updateDoc, collection, addDoc, getDoc, getDocs, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';
import {
  ESCRITORIOS_NPC, TIPOS_VAGA, TIER_BONUS, VAGA_FREQ,
  escritoriosCompativeis, calcSalarioVaga, temVagaAberta, prestigioNoTier, SKILL_CAP
} from './escritorios_npc.js';

// ════════════════════════════════════════════════════════
// PAINEL DE VAGAS (renderizado em ui-main.js via navTo)
// ════════════════════════════════════════════════════════
window.renderVagas = async function(j, el) {
  const uid = j.uid || window.JOGADOR_UID;
  const compativeis = escritoriosCompativeis(j);
  const esp         = j.especialidade || 'civil';
  const presPerc    = prestigioNoTier(j);

  // ── Buscar convites pendentes na inbox (convite_npc / promocao_npc) ──
  const convitesSnap = await getDocs(query(
    collection(db, 'jogadores', uid, 'inbox'),
    where('tipo', 'in', ['convite_npc', 'promocao_npc'])
  ));
  const convites = convitesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.status !== 'recusado' && c.status !== 'aceito');

  // Escritórios com vaga aberta este mês
  const comVaga = compativeis.filter(esc => temVagaAberta(esc));

  // Separar por tier
  const porTier = {};
  comVaga.forEach(esc => {
    if (!porTier[esc.tier]) porTier[esc.tier] = [];
    porTier[esc.tier].push(esc);
  });

  const TIER_LABEL = {
    1: 'Tier 1 — Escritórios Regionais',
    2: 'Tier 2 — Escritórios de Médio Porte',
    3: 'Tier 3 — Escritórios Consolidados',
    4: 'Tier 4 — Escritórios de Elite',
    5: 'Tier 5 — Big Law Nacional',
  };

  el.innerHTML = `
    ${convites.length > 0 ? `
    <div class="secao-header">
      <div class="secao-titulo">📬 Convites Recebidos</div>
      <span class="secao-badge" style="background:var(--ouro-bg);color:var(--ouro2)">${convites.length} pendente(s)</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.4rem">
      ${convites.map(c => _cardConvite(c)).join('')}
    </div>` : ''}

    <div class="secao-header">
      <div class="secao-titulo">🏢 Vagas Disponíveis</div>
      <span class="secao-badge">${comVaga.length} vaga(s) abertas</span>
    </div>
    <div style="font-size:.75rem;color:var(--txt3);margin-bottom:1rem;padding:.6rem;background:var(--surface2);border:var(--borda);border-radius:var(--r)">
      📊 Prestígio no seu nível atual: <b style="color:var(--navy)">${presPerc}%</b> —
      ${presPerc >= 90 ? '⭐ Você pode receber convites de promoção do próprio escritório!' :
        presPerc >= 80 ? '✨ Escritórios Tier superior podem te convidar via inbox!' :
        'Continue crescendo para desbloquear oportunidades exclusivas.'}
    </div>

    ${Object.keys(porTier).length === 0
      ? `<div class="card" style="text-align:center;padding:2rem;color:var(--txt3)">
           Nenhuma vaga compatível aberta agora.<br>
           <span style="font-size:.72rem">As vagas mudam a cada mês. Melhore suas skills para acessar mais oportunidades.</span>
         </div>`
      : Object.entries(porTier).sort(([a],[b])=>a-b).map(([tier, escs]) => `
        <div style="margin-bottom:1.2rem">
          <div style="font-size:.65rem;font-weight:700;color:var(--navy3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;padding-bottom:.3rem;border-bottom:2px solid var(--navy-light)">
            ${TIER_LABEL[tier] || `Tier ${tier}`}
          </div>
          ${escs.map(esc => _cardEscritorio(esc, j)).join('')}
        </div>`).join('')}

    <!-- Escritório atual do jogador -->
    ${j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo'
      ? _cardEscritorioAtual(j) : ''}`;
};

function _cardEscritorio(esc, j) {
  const bonus   = TIER_BONUS[esc.tier] || {};
  const vagasAcessiveis = esc.vagas.filter(vagaId => _vagaAcessivel(vagaId, j));

  return `
    <div class="card" style="margin-bottom:.5rem;border-left:3px solid ${_corTier(esc.tier)}">
      <div style="display:flex;align-items:start;gap:.8rem">
        <div style="flex-shrink:0;width:36px;height:36px;background:var(--navy-light);border-radius:var(--r);display:flex;align-items:center;justify-content:center;font-size:1.1rem">🏛️</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:.9rem;color:var(--navy);margin-bottom:.15rem">${esc.nome}</div>
          <div style="font-size:.7rem;color:var(--txt3);margin-bottom:.4rem">
            📍 ${esc.bairro} · Tier ${esc.tier} · ${_espLabel(esc.esp)}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.5rem">
            ${bonus.rep_passivo > 0 ? `<span style="font-size:.62rem;padding:.1rem .4rem;background:var(--verde-bg);color:var(--verde);border-radius:20px;font-weight:600">+${bonus.rep_passivo} rep/mês</span>` : ''}
            ${bonus.networking_passivo > 0 ? `<span style="font-size:.62rem;padding:.1rem .4rem;background:var(--navy-light);color:var(--navy3);border-radius:20px;font-weight:600">+${bonus.networking_passivo} networking/mês</span>` : ''}
            ${bonus.bonus_chance_esp > 0 ? `<span style="font-size:.62rem;padding:.1rem .4rem;background:var(--amber-bg);color:var(--amber);border-radius:20px;font-weight:600">+${bonus.bonus_chance_esp}% chance vitória (${_espLabel(esc.esp)})</span>` : ''}
          </div>
          <div style="font-size:.68rem;color:var(--txt3);margin-bottom:.5rem">
            Causas: ${_fmtFaixa(bonus.caso_min, bonus.caso_max)}
          </div>
          ${vagasAcessiveis.length === 0
            ? `<div style="font-size:.68rem;color:var(--verm2)">🔒 Suas skills atuais não atendem aos requisitos desta vaga.</div>`
            : vagasAcessiveis.map(vagaId => {
                const vaga = TIPOS_VAGA[vagaId];
                const sal  = calcSalarioVaga(esc, vagaId, j);
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:.45rem .6rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);margin-bottom:.3rem">
                    <div>
                      <div style="font-size:.78rem;font-weight:600;color:var(--navy)">${vaga.l}</div>
                      <div style="font-size:.65rem;color:var(--txt3)">${vaga.desc}</div>
                      <div style="font-size:.65rem;color:var(--verde2);font-weight:600;margin-top:.1rem">R$ ${sal.toLocaleString('pt-BR')}/mês</div>
                    </div>
                    <button class="btn btn-sm btn-prim" onclick="window.candidatarVaga('${esc.id}','${vagaId}')">
                      Candidatar
                    </button>
                  </div>`;
              }).join('')}
        </div>
      </div>
    </div>`;
}

function _cardEscritorioAtual(j) {
  const escNPC = ESCRITORIOS_NPC.find(e => e.id === j.escritorio_id);
  if (!escNPC) return '';
  const bonus     = TIER_BONUS[escNPC.tier] || {};
  const presPerc  = prestigioNoTier(j);

  return `
    <div class="secao-header" style="margin-top:1.2rem">
      <div class="secao-titulo">🏢 Seu Escritório Atual</div>
    </div>
    <div class="card" style="border-left:3px solid ${_corTier(escNPC.tier)};background:var(--navy-light)">
      <div style="font-weight:700;color:var(--navy);margin-bottom:.3rem">${escNPC.nome}</div>
      <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.5rem">
        📍 ${escNPC.bairro} · Tier ${escNPC.tier} · Vaga: ${TIPOS_VAGA[j.vaga_tipo]?.l || j.vaga_tipo}
      </div>
      <div style="font-size:.72rem;color:var(--txt2);line-height:1.8">
        <div>Bônus de chance de vitória: <b style="color:var(--verde2)">+${bonus.bonus_chance_esp}% em ${_espLabel(escNPC.esp)}</b></div>
        <div>Bônus passivo: <b style="color:var(--verde2)">+${bonus.rep_passivo} rep/mês · +${bonus.networking_passivo} networking/mês</b></div>
        <div>Prestígio no nível: <b style="color:${presPerc>=80?'var(--verde2)':presPerc>=50?'var(--amber)':'var(--verm2)'}">${presPerc}%</b>
          ${presPerc >= 90 ? ' — ⭐ Convite de promoção pode chegar!' :
            presPerc >= 80 ? ' — ✨ Escritórios Tier superior podem te chamar!' : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-ghost btn-block" style="margin-top:.8rem" onclick="window.sairEscritorio()">
        Sair do escritório
      </button>
    </div>`;
}

// ════════════════════════════════════════════════════════
// CANDIDATAR A UMA VAGA
// ════════════════════════════════════════════════════════
window.candidatarVaga = async function(escId, vagaId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  if (!j) return;

  const esc  = ESCRITORIOS_NPC.find(e => e.id === escId);
  const vaga = TIPOS_VAGA[vagaId];
  if (!esc || !vaga) return;

  // Verificar se já está num escritório
  if (j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo') {
    if (!confirm(`Você já trabalha em ${j.escritorio_nome}. Deseja sair e se candidatar a ${esc.nome}?`)) return;
  }

  // Verificar acessibilidade da vaga
  if (!_vagaAcessivel(vagaId, j)) {
    toast('Suas skills atuais não atendem aos requisitos desta vaga.', 'ko');
    return;
  }

  const sal = calcSalarioVaga(esc, vagaId, j);
  const bonus = TIER_BONUS[esc.tier] || {};

  abrirModal(
    `📋 Candidatura — ${esc.nome}`,
    `<div style="margin-bottom:1rem">
      <div style="font-weight:700;font-size:1rem;color:var(--navy);margin-bottom:.3rem">${vaga.l}</div>
      <div style="font-size:.75rem;color:var(--txt3);margin-bottom:.6rem">${vaga.desc}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.78rem">
        <div style="padding:.5rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
          <div style="color:var(--txt4);font-size:.62rem;text-transform:uppercase;margin-bottom:.15rem">Salário</div>
          <div style="font-weight:700;color:var(--verde2)">R$ ${sal.toLocaleString('pt-BR')}/mês</div>
        </div>
        <div style="padding:.5rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
          <div style="color:var(--txt4);font-size:.62rem;text-transform:uppercase;margin-bottom:.15rem">Bônus de chance</div>
          <div style="font-weight:700;color:var(--amber)">+${bonus.bonus_chance_esp}% vitória</div>
        </div>
        <div style="padding:.5rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
          <div style="color:var(--txt4);font-size:.62rem;text-transform:uppercase;margin-bottom:.15rem">Bônus passivo</div>
          <div style="font-weight:700;color:var(--navy3)">+${bonus.rep_passivo} rep · +${bonus.networking_passivo} net/mês</div>
        </div>
        <div style="padding:.5rem;background:var(--surface2);border:var(--borda-sub);border-radius:var(--r)">
          <div style="color:var(--txt4);font-size:.62rem;text-transform:uppercase;margin-bottom:.15rem">Causas</div>
          <div style="font-weight:700;color:var(--txt2)">${_fmtFaixa(bonus.caso_min, bonus.caso_max)}</div>
        </div>
      </div>
      <div style="margin-top:.8rem;font-size:.72rem;color:var(--txt3)">
        📍 ${esc.bairro} — ${_espLabel(esc.esp)} — Tier ${esc.tier}
      </div>
    </div>`,
    `<button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
     <button class="btn btn-prim" onclick="window._confirmarCandidatura('${escId}','${vagaId}',${sal})">Confirmar candidatura →</button>`
  );
};

// ════════════════════════════════════════════════════════
// CONVITES RECEBIDOS (inbox: convite_npc / promocao_npc)
// ════════════════════════════════════════════════════════
function _cardConvite(c) {
  const isPromo = c.tipo === 'promocao_npc';
  const esc     = ESCRITORIOS_NPC.find(e => e.id === c.esc_id);
  const vaga    = TIPOS_VAGA[c.vaga_id];
  if (!esc || !vaga) return '';

  return `
    <div class="card" style="border-left:3px solid ${isPromo?'var(--ouro2)':'var(--navy3)'}">
      <div style="display:flex;align-items:start;justify-content:space-between;gap:.8rem">
        <div style="flex:1">
          <div style="font-weight:700;font-size:.85rem;color:var(--navy)">
            ${isPromo?'⭐':'📬'} ${isPromo?'Promoção':'Convite'} — ${esc.nome}
          </div>
          <div style="font-size:.7rem;color:var(--ouro2);margin:.2rem 0">${vaga.l} · Tier ${esc.tier} · ${esc.bairro}</div>
          <div style="font-size:.72rem;color:var(--txt3)">Salário: <b style="color:var(--verde2)">R$ ${(c.sal_oferecido||0).toLocaleString('pt-BR')}/mês</b></div>
        </div>
      </div>
      <div style="display:flex;gap:.4rem;margin-top:.6rem">
        <button class="btn btn-sm btn-prim" onclick="window.aceitarConvite('${c.id}')">Aceitar</button>
        <button class="btn btn-sm btn-ghost" onclick="window.recusarConvite('${c.id}')">Recusar</button>
      </div>
    </div>`;
}

window.aceitarConvite = async function(msgId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  const msgSnap = await getDoc(doc(db, 'jogadores', uid, 'inbox', msgId));
  if (!msgSnap.exists()) { toast('Convite não encontrado.', 'ko'); return; }
  const c = msgSnap.data();

  // Marca o convite como aceito/lido antes de aplicar a candidatura
  await updateDoc(doc(db, 'jogadores', uid, 'inbox', msgId), { status: 'aceito', lida: true });

  // Reaproveita a lógica já existente de candidatura
  await window._confirmarCandidatura(c.esc_id, c.vaga_id, c.sal_oferecido);

  setTimeout(() => window.navTo && window.navTo('vagas', null), 600);
};

window.recusarConvite = async function(msgId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  try {
    await updateDoc(doc(db, 'jogadores', uid, 'inbox', msgId), { status: 'recusado', lida: true });
    toast('Convite recusado.', 'neutro', 2500);
    setTimeout(() => window.navTo && window.navTo('vagas', null), 400);
  } catch (err) {
    toast('Erro ao recusar convite.', 'ko');
  }
};

window._confirmarCandidatura = async function(escId, vagaId, sal) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const esc  = ESCRITORIOS_NPC.find(e => e.id === escId);
  const vaga = TIPOS_VAGA[vagaId];
  if (!esc || !vaga || !j) return;

  try {
    await updateDoc(doc(db, 'jogadores', uid), {
      escritorio_id:          escId,
      escritorio_empregado_id:escId,
      escritorio_nome:        esc.nome,
      escritorio_tier:        esc.tier,
      escritorio_esp:         esc.esp,
      escritorio_bairro:      esc.bairro,
      vaga_tipo:              vagaId,
      sal_base_escritorio:    sal,
      derrotas_consecutivas:  0,
    });

    fecharModal();
    toast(`✅ Bem-vindo(a) a ${esc.nome}! Salário: R$ ${sal.toLocaleString('pt-BR')}/mês`, 'ok', 5000);

    // Notificação no inbox
    await addDoc(collection(db, 'jogadores', uid, 'inbox'), {
      de: 'sistema', para_uid: uid,
      assunto: `🏢 Contratado(a) — ${esc.nome}`,
      corpo: `Você foi contratado(a) como ${vaga.l} em ${esc.nome} (Tier ${esc.tier}, ${esc.bairro}).\n\nSalário: R$ ${sal.toLocaleString('pt-BR')}/mês\nBônus de chance em ${_espLabel(esc.esp)}: +${(TIER_BONUS[esc.tier]||{}).bonus_chance_esp}%\n\nBoa sorte na nova carreira!`,
      tipo: 'sistema', tipo_noticia: 'positivo', lida: false,
      criado_em: new Date().toISOString(),
    });
  } catch (err) {
    toast('Erro ao confirmar candidatura.', 'ko');
    console.error(err);
  }
};

// ════════════════════════════════════════════════════════
// SAIR DO ESCRITÓRIO
// ════════════════════════════════════════════════════════
window.sairEscritorio = async function() {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;

  // Caso 1: é o DONO do próprio escritório — "sair" significa abandonar a gestão
  if (j.escritorio_proprio_id) {
    if (!confirm('Você é o(a) dono(a) deste escritório. Sair significa abandonar a gestão e voltar à advocacia solo. O escritório próprio deixará de existir para você. Confirma?')) return;
    try {
      await updateDoc(doc(db, 'jogadores', uid), {
        escritorio_proprio_id:   null,
        escritorio_id:           'solo',
        escritorio_empregado_id: null,
        escritorio_nome:         null,
        escritorio_tier:         null,
        escritorio_esp:          null,
        escritorio_bairro:       null,
        vaga_tipo:               'contencioso',
        sal_base_escritorio:     0,
      });
      toast('Você abandonou a gestão do escritório e voltou à advocacia solo.', 'neutro', 5000);
      setTimeout(()=>window.navTo&&window.navTo('escritorio',null), 600);
    } catch (err) {
      toast('Erro ao sair do escritório.', 'ko');
    }
    return;
  }

  // Caso 2: é EMPREGADO de um escritório (NPC ou de outro jogador)
  if (!confirm('Confirma: sair do escritório e voltar à advocacia solo?')) return;
  try {
    await updateDoc(doc(db, 'jogadores', uid), {
      escritorio_id:           'solo',
      escritorio_empregado_id: null,
      escritorio_nome:         null,
      escritorio_tier:         null,
      escritorio_esp:          null,
      escritorio_bairro:       null,
      vaga_tipo:               'contencioso',
      sal_base_escritorio:     0,
    });
    toast('Você voltou à advocacia solo.', 'neutro');
    setTimeout(()=>window.navTo&&window.navTo('escritorio',null), 600);
  } catch (err) {
    toast('Erro.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// CONVITES NPC AUTOMÁTICOS (chamado pelo avancar_mes.js frontend)
// Verifica prestígio e envia convites via inbox
// ════════════════════════════════════════════════════════
export async function processarConvitesNPC(j, mesGlobal) {
  const uid      = j.uid || window.JOGADOR_UID;
  const presPerc = prestigioNoTier(j);
  const esp      = j.especialidade || 'civil';
  const tier     = _tierAtual(j);

  // --- Convite de escritório SUPERIOR (presPerc >= 80) ---
  if (presPerc >= 80 && Math.random() < 0.35) {
    const tierSup = Math.min(5, tier + 1);
    const escsSup = ESCRITORIOS_NPC.filter(e => e.esp === esp && e.tier === tierSup);
    if (escsSup.length > 0) {
      // Escolher o mais renomado (maior prestigio_base)
      const melhor = escsSup.sort((a,b) => b.prestigio_base - a.prestigio_base)[0];
      const vagasAces = melhor.vagas.filter(v => _vagaAcessivel(v, j));
      if (vagasAces.length > 0) {
        const vagaId = vagasAces[0];
        const vaga   = TIPOS_VAGA[vagaId];
        const sal    = calcSalarioVaga(melhor, vagaId, j);
        await addDoc(collection(db, 'jogadores', uid, 'inbox'), {
          de: 'npc_escritorio', para_uid: uid,
          assunto: `📬 Convite — ${melhor.nome}`,
          corpo: `${melhor.nome} ficou impressionado com sua reputação e gostaria de convidá-lo(a) para uma vaga de ${vaga.l}.\n\nSalário oferecido: R$ ${sal.toLocaleString('pt-BR')}/mês\nLocalização: ${melhor.bairro} — Tier ${melhor.tier}\n\nAcesse Vagas para ver e aceitar.`,
          tipo: 'convite_npc',
          tipo_noticia: 'positivo',
          esc_id: melhor.id,
          vaga_id: vagaId,
          sal_oferecido: sal,
          lida: false,
          criado_em: new Date().toISOString(),
        });
      }
    }
  }

  // --- Convite de PROMOÇÃO do próprio escritório (presPerc >= 90) ---
  if (presPerc >= 90 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo') {
    const escAtual = ESCRITORIOS_NPC.find(e => e.id === j.escritorio_id);
    if (escAtual && Math.random() < 0.4) {
      // Verificar se há vaga de nível superior disponível
      const vagaAtual = TIPOS_VAGA[j.vaga_tipo];
      const VAGA_PROX = {
        estagiario_pesquisa:   'advogado_peticionante',
        advogado_peticionante: 'advogado_contencioso',
        advogado_audiencista:  'advogado_contencioso',
        advogado_contencioso:  'advogado_consultor',
        advogado_consultor:    'advogado_parecerista',
        advogado_parecerista:  'advogado_palestrante',
        advogado_palestrante:  'socio_associado',
      };
      const vagaProxId = VAGA_PROX[j.vaga_tipo];
      if (vagaProxId && escAtual.vagas.includes(vagaProxId) && _vagaAcessivel(vagaProxId, j)) {
        const vagaProx = TIPOS_VAGA[vagaProxId];
        const salProx  = calcSalarioVaga(escAtual, vagaProxId, j);
        await addDoc(collection(db, 'jogadores', uid, 'inbox'), {
          de: 'npc_escritorio', para_uid: uid,
          assunto: `⭐ Proposta de promoção — ${escAtual.nome}`,
          corpo: `Seu desempenho excepcional em ${escAtual.nome} foi reconhecido. Temos uma proposta de promoção para a vaga de ${vagaProx.l}.\n\nNovo salário: R$ ${salProx.toLocaleString('pt-BR')}/mês\n\nAcesse Vagas para aceitar a promoção.`,
          tipo: 'promocao_npc',
          tipo_noticia: 'positivo',
          esc_id: escAtual.id,
          vaga_id: vagaProxId,
          sal_oferecido: salProx,
          lida: false,
          criado_em: new Date().toISOString(),
        });
      }
    }
  }
}

// ════════════════════════════════════════════════════════
// IMPACTO DO ESCRITÓRIO NO GAMEPLAY
// Chamado ao calcular chance de sucesso em processos
// ════════════════════════════════════════════════════════
export function getBonusEscritorioParaCaso(jogador, espCaso) {
  if (!jogador.escritorio_id || jogador.escritorio_id === 'solo') return 0;
  const esc = ESCRITORIOS_NPC.find(e => e.id === jogador.escritorio_id);
  if (!esc) return 0;
  const bonus = TIER_BONUS[esc.tier] || {};
  // Bônus de chance só se especialidade do escritório = especialidade do caso
  return esc.esp === espCaso ? (bonus.bonus_chance_esp || 0) : 0;
}

export function getBonusPassivoMensal(jogador) {
  if (!jogador.escritorio_id || jogador.escritorio_id === 'solo') return { rep: 0, networking: 0 };
  const esc = ESCRITORIOS_NPC.find(e => e.id === jogador.escritorio_id);
  if (!esc) return { rep: 0, networking: 0 };
  const bonus = TIER_BONUS[esc.tier] || {};
  // Prestígio baixo do escritório (<30) penaliza
  const prestigioEsc = esc.prestigio_base;
  if (prestigioEsc < 30) return { rep: -1, networking: 0 };
  return {
    rep:        bonus.rep_passivo || 0,
    networking: bonus.networking_passivo || 0,
  };
}

export function getFaixaCausasEscritorio(jogador) {
  if (!jogador.escritorio_id || jogador.escritorio_id === 'solo') return null;
  const esc = ESCRITORIOS_NPC.find(e => e.id === jogador.escritorio_id);
  if (!esc) return null;
  return TIER_BONUS[esc.tier] || null;
}

// Expor funções globalmente
window.getBonusEsc = function(jogador, espCaso) {
  return getBonusEscritorioParaCaso(jogador, espCaso);
};

// ════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ════════════════════════════════════════════════════════
function _vagaAcessivel(vagaId, j) {
  const vaga = TIPOS_VAGA[vagaId];
  if (!vaga) return false;
  const CARGO_IDX = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7 };
  const meuIdx  = CARGO_IDX[j.cargo_id] || 0;
  const vagaIdx = CARGO_IDX[vaga.cargo] || 0;
  if (meuIdx < vagaIdx) return false;
  const skills  = j.skills || {};
  const cap     = SKILL_CAP[j.cargo_id] || 20;
  return Object.entries(vaga.skills).every(([sk, min]) => {
    const minAdj = Math.min(min, cap);
    return (skills[sk] || 0) >= minAdj;
  });
}

function _tierAtual(j) {
  const CARGO_TIER = { est:1, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:5, snm:5 };
  return CARGO_TIER[j.cargo_id] || 1;
}

function _corTier(tier) {
  return { 1:'#9BAAC4', 2:'#4AAB77', 3:'#B7791F', 4:'#3A5080', 5:'#8B1A1A' }[tier] || '#9BAAC4';
}

function _espLabel(esp) {
  const MAP = {
    tributario:'Tributário', trabalhista:'Trabalhista', civil:'Civil',
    criminal:'Criminal', empresarial:'Empresarial',
    constitucional:'Constitucional', ambiental:'Ambiental', previdenciario:'Previdenciário',
  };
  return MAP[esp] || esp || '—';
}

function _fmtFaixa(min, max) {
  const f = n => n >= 1000000 ? `R$${(n/1000000).toFixed(0)}M` : n >= 1000 ? `R$${(n/1000).toFixed(0)}k` : `R$${n}`;
  return `${f(min)} – ${f(max)}`;
}
