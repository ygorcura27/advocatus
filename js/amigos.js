/**
 * AMIGOS DE TRABALHO / AMIZADES — Advocatus Online
 * Sistema independente do namoro (js/relacionamento.js) — sem estágios,
 * sem exclusividade/lock global, sem gravidez. Só afinidade 0-100 que sobe
 * por interação, gastando energia, com pequeno bônus real em saude_mental
 * (bater papo/happy hour) e networking (trocar contatos, exige afinidade
 * mínima) — ambos campos reais já usados em outros sistemas do jogo,
 * evita inventar uma stat nova desconectada do resto.
 */

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const _AMIGOS_MAX_ATIVOS = 6;

const _AMIGOS_TRACOS = {
  engracado:   { l:'Engraçado',    icone:'😂' },
  confiavel:   { l:'Confiável',    icone:'🤝' },
  workaholic:  { l:'Workaholic',   icone:'💼' },
  descontraido:{ l:'Descontraído', icone:'🎉' },
  intelectual: { l:'Intelectual',  icone:'📚' },
  competitivo: { l:'Competitivo',  icone:'🏆' },
};

const _AMIGOS_NOMES = [
  'Bruno Salviano', 'Camila Torraca', 'Diego Marimon', 'Fernanda Quintal',
  'Gabriel Piovezan', 'Isabela Roncato', 'Leonardo Bacelar', 'Mariana Frugis',
  'Rodrigo Sabatino', 'Tatiana Guerse', 'Vinícius Damato', 'Yasmin Cortelazzo',
];

const _AMIGOS_INTERACOES = {
  bater_papo: { l:'Bater papo', icone:'🗣️', energia:4, afinidade:[4,8] },
  happy_hour: { l:'Happy hour', icone:'🍻', energia:8, afinidade:[8,14], bonus_sm:1 },
  networking: { l:'Trocar contatos', icone:'🤝', energia:6, afinidade:[6,10], bonus_networking:1, min_afinidade:40 },
};

function _amigosMarco(afinidade) {
  if (afinidade >= 75) return 'Melhor Amigo';
  if (afinidade >= 50) return 'Amigo Próximo';
  if (afinidade >= 25) return 'Amigo';
  return 'Conhecido';
}

function _amigosRef(uid) {
  return collection(db, 'jogadores', uid, 'amigos');
}

// ════════════════════════════════════════════════════════
// RENDER — chamado de dentro de renderVidaPessoal (js/relacionamento.js)
// ════════════════════════════════════════════════════════
window.renderAmigosSecao = async function(uid) {
  const snap   = await getDocs(_amigosRef(uid));
  const amigos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  window._AMIGOS_CACHE = amigos;

  const cardsHtml = amigos.map(a => {
    const cor = a.afinidade >= 75 ? 'var(--verde2)' : a.afinidade >= 50 ? 'var(--ouro2)' : a.afinidade >= 25 ? 'var(--navy3)' : 'var(--txt4)';
    const traco = _AMIGOS_TRACOS[a.traco] || {};
    return `
    <div class="card" style="margin-bottom:.6rem">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:.8rem">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.88rem;color:var(--txt)">${a.nome}</div>
          <div style="font-size:.68rem;color:var(--ouro2);margin-bottom:.3rem">${_amigosMarco(a.afinidade)} · ${traco.icone||''} ${traco.l||''}</div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <div style="flex:1;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;max-width:160px">
              <div style="height:100%;width:${a.afinidade}%;background:${cor};border-radius:3px"></div>
            </div>
            <span style="font-size:.68rem;font-weight:700;color:${cor}">${a.afinidade}/100</span>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem">
        ${Object.entries(_AMIGOS_INTERACOES).map(([k,v]) => {
          const bloqueado = v.min_afinidade && a.afinidade < v.min_afinidade;
          return `<button class="btn btn-sm btn-ghost" ${bloqueado?'disabled':''} title="${bloqueado?`Requer afinidade ${v.min_afinidade}`:v.l}"
            onclick="window._amigoInteragir('${a.id}','${k}')">${v.icone} -${v.energia}⚡</button>`;
        }).join('')}
        <button class="btn btn-sm btn-danger" onclick="window._amigoPerderContato('${a.id}','${a.nome}')">Perder contato</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="secao-header" style="margin-top:1.2rem">
      <div class="secao-titulo">🧑‍🤝‍🧑 Amigos</div>
      <button class="btn btn-sm btn-prim" ${amigos.length>=_AMIGOS_MAX_ATIVOS?'disabled':''} onclick="window._amigoAbrirConhecer()">+ Conhecer alguém</button>
    </div>
    ${amigos.length === 0
      ? `<div class="card" style="text-align:center;padding:1.5rem;color:var(--txt3)">
           Você ainda não tem amigos.<br>
           <span style="font-size:.72rem">Clique em "Conhecer alguém" pra fazer sua primeira amizade.</span>
         </div>`
      : cardsHtml}`;
};

window._amigoAbrirConhecer = function() {
  const jaTem = new Set((window._AMIGOS_CACHE||[]).map(a => a.nome));
  const candidatos = [];
  const nomesDisponiveis = _AMIGOS_NOMES.filter(n => !jaTem.has(n));
  const tracoKeys = Object.keys(_AMIGOS_TRACOS);
  for (let i = 0; i < 3 && i < nomesDisponiveis.length; i++) {
    const idx = Math.floor(Math.random() * nomesDisponiveis.length);
    const nome = nomesDisponiveis.splice(idx, 1)[0];
    const traco = tracoKeys[Math.floor(Math.random() * tracoKeys.length)];
    candidatos.push({ nome, traco });
  }
  if (candidatos.length === 0) {
    window.toast('Sem candidatos novos disponíveis agora.', 'ko');
    return;
  }
  window.abrirModal('🧑‍🤝‍🧑 Conhecer Alguém', `
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${candidatos.map((c,i) => `
        <button class="btn btn-ghost btn-block" style="text-align:left;padding:.6rem .8rem"
          onclick="window._amigoAdicionar('${c.nome}','${c.traco}')">
          <div style="font-weight:600;font-size:.85rem">${c.nome}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${_AMIGOS_TRACOS[c.traco].icone} ${_AMIGOS_TRACOS[c.traco].l}</div>
        </button>`).join('')}
    </div>`);
};

window._amigoAdicionar = async function(nome, traco) {
  const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
  try {
    await addDoc(_amigosRef(uid), { nome, traco, afinidade: 10, criado_em: new Date().toISOString() });
    window.fecharModal();
    window.toast(`✅ ${nome} agora é seu(sua) amigo(a).`, 'ok', 3000);
    setTimeout(() => window.navTo && window.navTo('vida_pessoal', null), 400);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._amigoInteragir = async function(amigoId, tipoKey) {
  const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
  const j = window.JOGADOR || {};
  const cfg = _AMIGOS_INTERACOES[tipoKey];
  const energiaTotal = (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100);
  const energiaUsada = j.energia_usada_mes || 0;
  if (energiaUsada + cfg.energia > energiaTotal) {
    window.toast('Energia insuficiente este mês.', 'ko');
    return;
  }
  try {
    const ref  = doc(db, 'jogadores', uid, 'amigos', amigoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const a = snap.data();
    if (cfg.min_afinidade && a.afinidade < cfg.min_afinidade) {
      window.toast(`Requer afinidade ${cfg.min_afinidade}.`, 'ko');
      return;
    }
    const ganho = cfg.afinidade[0] + Math.floor(Math.random() * (cfg.afinidade[1]-cfg.afinidade[0]+1));
    const novaAfinidade = Math.min(100, a.afinidade + ganho);
    await updateDoc(ref, { afinidade: novaAfinidade, ultima_interacao: new Date().toISOString() });

    const updJogador = { energia_usada_mes: energiaUsada + cfg.energia };
    if (cfg.bonus_sm) updJogador.saude_mental = Math.min(100, (j.saude_mental ?? 80) + cfg.bonus_sm);
    if (cfg.bonus_networking) updJogador.networking = (j.networking || 0) + cfg.bonus_networking;
    await updateDoc(doc(db, 'jogadores', uid), updJogador);
    Object.assign(window.JOGADOR, updJogador);

    window.toast(`${cfg.icone} +${ganho} afinidade com ${a.nome}.`, 'ok', 2500);
    setTimeout(() => window.navTo && window.navTo('vida_pessoal', null), 400);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._amigoPerderContato = function(amigoId, nome) {
  window.abrirModal(`Perder contato com ${nome}?`, `
    <div style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem">Essa amizade será removida — não dá pra desfazer.</div>
    <div style="display:flex;gap:.5rem">
      <button class="btn btn-ghost btn-block" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-danger btn-block" onclick="window._amigoConfirmarPerder('${amigoId}')">Perder contato</button>
    </div>`);
};

window._amigoConfirmarPerder = async function(amigoId) {
  const uid = window.JOGADOR?.uid || window.JOGADOR_UID;
  try {
    await deleteDoc(doc(db, 'jogadores', uid, 'amigos', amigoId));
    window.fecharModal();
    window.toast('Contato removido.', 'ok');
    setTimeout(() => window.navTo && window.navTo('vida_pessoal', null), 400);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};
