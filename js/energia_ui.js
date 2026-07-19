'use strict';

/**
 * ENERGIA — tela real de alocação por categoria (GDD v6.0 §3.1, decisão B).
 * Primeira vez que o jogador salva aqui, a conta sai do modo legado (pool
 * único) e passa a valer a checagem por categoria em
 * js/energia_categorias.js::checarEnergiaCategoria — ver comentário lá.
 */

import { doc, updateDoc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// Supervisão da Carteira só tem efeito pra quem gerencia o escritório (dono/
// sócio/associado) — coordenar/designar/mediar (as ações que gastam dessa
// categoria) já são bloqueadas pra empregado comum em js/equipe.js:154
// ("autogestão"). Sem essa checagem, um estagiário via Harvey podia alocar
// energia numa categoria que não tem NENHUM botão disponível pra ele gastar.
async function _podeGerenciarEscritorio(j) {
  const escId = j.escritorio_proprio_id || (j.escritorio_empregado_id !== 'solo' ? j.escritorio_empregado_id : null);
  if (!escId) return false;
  if (j.escritorio_proprio_id) return true; // dono
  try {
    const escSnap = await getDoc(doc(db, 'escritorios', escId));
    if (!escSnap.exists()) return false;
    const esc = escSnap.data();
    const uid = j.uid || window.JOGADOR_UID;
    const ehDono = esc.dono_uid === uid || esc.fundador_uid === uid;
    const ehSocio = (esc.socios || []).some(s => s.uid === uid);
    return ehDono || ehSocio;
  } catch (e) { return false; }
}

const LABEL = {
  processos:  { icone: '⚖️', l: 'Processos Estratégicos', desc: 'Assumir casos, sentenças, recursos, serviços avulsos.' },
  supervisao: { icone: '👥', l: 'Supervisão da Carteira',  desc: 'Coordenar e designar funcionários, mediar conflitos.' },
  estudo:     { icone: '📚', l: 'Estudo',                  desc: 'Cursos, aulas de pós-graduação, defesa de TCC.' },
  captacao:   { icone: '📣', l: 'Gestão / Captação',       desc: 'Captar casos novos, Moot Court, mídia, networking.' },
  pessoal:    { icone: '❤️', l: 'Vida Pessoal',            desc: 'Relacionamentos, amigos, sair com alguém.' },
  descanso:   { icone: '🛌', l: 'Descanso',                desc: 'Academia e outras atividades de recuperação.' },
};
const ORDEM = ['processos', 'supervisao', 'estudo', 'captacao', 'pessoal', 'descanso'];

// Distribuição sugerida pra quem ainda não configurou nada — mais peso em
// Processos (é o que mais aparece hoje no jogo), resto dividido de forma
// razoável. Só um ponto de partida: o jogador pode redistribuir livremente
// antes de salvar.
const SUGESTAO_PCT = { processos: 0.35, supervisao: 0.15, estudo: 0.15, captacao: 0.15, pessoal: 0.15, descanso: 0.05 };

function _distribuicaoSugerida(total) {
  const out = {};
  let usado = 0;
  const chaves = ORDEM;
  chaves.forEach((c, i) => {
    if (i === chaves.length - 1) { out[c] = Math.max(0, total - usado); return; }
    const v = Math.round(total * SUGESTAO_PCT[c]);
    out[c] = v;
    usado += v;
  });
  return out;
}

window.renderEnergia = async function(j, el) {
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const podeGerenciar = await _podeGerenciarEscritorio(j);
  const configurado = !!j.energia_alocada;
  const alocacao = configurado ? { ...j.energia_alocada } : _distribuicaoSugerida(total);
  if (!podeGerenciar) {
    // Sem escritório pra gerenciar, a alocação em Supervisão não tem
    // nenhuma ação real pra gastar — libera pra Processos em vez de
    // sugerir um balde morto.
    alocacao.processos = (alocacao.processos || 0) + (alocacao.supervisao || 0);
    alocacao.supervisao = 0;
  }
  const uso = j.energia_usada || (window.categoriaEnergiaVazia ? window.categoriaEnergiaVazia() : {});

  const linhas = ORDEM.map(cat => {
    const info = LABEL[cat];
    const bloqueado = cat === 'supervisao' && !podeGerenciar;
    const val = bloqueado ? 0 : (alocacao[cat] || 0);
    const usado = uso[cat] || 0;
    const pctUso = val > 0 ? Math.min(100, Math.round(usado / val * 100)) : 0;
    return `
    <div class="card" style="margin-bottom:.6rem;padding:.8rem .9rem${bloqueado ? ';opacity:.55' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.3rem">
        <div style="font-weight:600;font-size:.82rem;color:var(--txt)">${info.icone} ${info.l}${bloqueado ? ' 🔒' : ''}</div>
        <div style="font-family:var(--font-mono,monospace);font-size:.78rem;color:var(--amber)"><span id="energia-val-${cat}">${val}</span>⚡</div>
      </div>
      <div style="font-size:.66rem;color:var(--txt4);margin-bottom:.5rem">${info.desc}</div>
      <input type="range" min="0" max="${total}" value="${val}" step="1"
        id="energia-slider-${cat}" style="width:100%" ${bloqueado ? 'disabled' : ''}
        oninput="window._energiaSliderMudou('${cat}')">
      ${bloqueado ? `
      <div style="margin-top:.4rem;font-size:.66rem;color:var(--txt3)">
        🔒 Você não gerencia processos neste escritório (não é dono, sócio ou associado) — coordenar/designar/mediar
        conflito não estão disponíveis pra você, então esta categoria não tem nenhuma ação pra gastar. Energia
        liberada pras outras 5.
      </div>` : ''}
      ${configurado && !bloqueado ? `
      <div style="margin-top:.4rem;font-size:.64rem;color:var(--txt4)">Usado este mês: ${usado}/${val}</div>
      <div class="stat-bar" style="height:5px;margin-top:.15rem"><div class="stat-bar-fill" style="width:${pctUso}%;background:${pctUso>=100?'var(--verm2)':'var(--amber)'}"></div></div>
      ` : ''}
      ${cat === 'supervisao' && !bloqueado ? `
      <div style="margin-top:.5rem;font-size:.66rem;color:var(--txt3);border-top:1px dashed var(--txt5,rgba(255,255,255,.1));padding-top:.4rem">
        🎯 <b>Supervisão do Sócio</b> (GDD §7.4): horas alocadas aqui multiplicam a produção de toda a carteira automática (NPCs).
        Modificador atual: <b id="energia-mod-supervisao" style="color:var(--verde2)">${window.calcularModSupervisaoSocio({ energia_alocada: alocacao, disposicao: j.disposicao }).toFixed(2)}x</b>
      </div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:640px">
      <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('perfil',null)">← Perfil</button></div>
      <h2 style="font-family:var(--font-serif);font-size:1.3rem;margin-bottom:.3rem">⚡ Energia por Categoria</h2>
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem">
        ${configurado
          ? 'Ajuste como sua energia mensal se divide entre as 6 frentes. O total não pode passar do seu teto.'
          : 'Você ainda não configurou baldes por categoria — hoje sua energia é um pool único. Distribua abaixo e salve para ativar o controle por categoria (não afeta o que já foi gasto este mês).'}
      </div>

      <div class="card" style="margin-bottom:.8rem;padding:.7rem .9rem;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2">
        <div style="font-size:.78rem;color:var(--txt3)">Total alocado</div>
        <div style="font-weight:700;font-family:var(--font-mono,monospace)" id="energia-total-alocado">— / ${total}</div>
      </div>

      ${linhas}

      <button class="btn btn-prim btn-block" id="energia-btn-salvar" onclick="window._salvarEnergiaAlocada()" style="margin-top:.6rem">
        💾 Salvar alocação
      </button>
    </div>`;

  window._ENERGIA_TOTAL_TETO = total;
  window._atualizarTotalEnergiaAlocada();
};

window._atualizarTotalEnergiaAlocada = function() {
  const total = window._ENERGIA_TOTAL_TETO || 100;
  let soma = 0;
  ORDEM.forEach(cat => {
    const inp = document.getElementById(`energia-slider-${cat}`);
    if (inp) soma += parseInt(inp.value, 10) || 0;
  });
  const elTotal = document.getElementById('energia-total-alocado');
  const elBtn = document.getElementById('energia-btn-salvar');
  if (elTotal) {
    elTotal.textContent = `${soma} / ${total}`;
    elTotal.style.color = soma > total ? 'var(--verm2)' : 'var(--verde2)';
  }
  if (elBtn) elBtn.disabled = soma > total;
};

window._energiaSliderMudou = function(cat) {
  const inp = document.getElementById(`energia-slider-${cat}`);
  const lbl = document.getElementById(`energia-val-${cat}`);
  if (inp && lbl) lbl.textContent = inp.value;
  window._atualizarTotalEnergiaAlocada();

  if (cat === 'supervisao') {
    const modEl = document.getElementById('energia-mod-supervisao');
    const supervisaoInp = document.getElementById('energia-slider-supervisao');
    if (modEl && supervisaoInp) {
      const j = window.JOGADOR || {};
      const alocSimulada = { supervisao: parseInt(supervisaoInp.value, 10) || 0 };
      const mod = window.calcularModSupervisaoSocio({ energia_alocada: alocSimulada, disposicao: j.disposicao });
      modEl.textContent = `${mod.toFixed(2)}x`;
    }
  }
};

window._salvarEnergiaAlocada = async function() {
  const j = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const total = window._ENERGIA_TOTAL_TETO || 100;

  const novaAlocacao = {};
  let soma = 0;
  ORDEM.forEach(cat => {
    const inp = document.getElementById(`energia-slider-${cat}`);
    const v = inp ? (parseInt(inp.value, 10) || 0) : 0;
    novaAlocacao[cat] = v;
    soma += v;
  });
  if (soma > total) { toast(`⚡ Total alocado (${soma}) passa do teto (${total}).`, 'ko'); return; }

  const jaConfigurado = !!j.energia_alocada;
  const patch = { energia_alocada: novaAlocacao };
  // Primeira configuração: começa os 6 baldes de uso zerados (o pool único
  // legado não mapeia 1:1 pra categoria — não daria pra saber retroativamente
  // em qual balde o que já foi gasto este mês se encaixaria).
  if (!jaConfigurado) patch.energia_usada = window.categoriaEnergiaVazia();

  try {
    await updateDoc(doc(db, 'jogadores', uid), patch);
    Object.assign(j, patch);
    window.JOGADOR = j;
    toast(jaConfigurado ? '⚡ Alocação atualizada.' : '⚡ Baldes por categoria ativados!', 'ok');
    window.renderEnergia(j, document.getElementById('main-content'));
  } catch (err) {
    console.error('[ENERGIA] Erro ao salvar alocação:', err);
    toast('Erro ao salvar alocação.', 'ko');
  }
};
