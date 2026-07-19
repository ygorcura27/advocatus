'use strict';

/**
 * ENERGIA — tela real de alocação por categoria (GDD v6.0 §3.1, decisão B).
 * Primeira vez que o jogador salva aqui, a conta sai do modo legado (pool
 * único) e passa a valer a checagem por categoria em
 * js/energia_categorias.js::checarEnergiaCategoria — ver comentário lá.
 */

import { doc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

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

window.renderEnergia = function(j, el) {
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const configurado = !!j.energia_alocada;
  const alocacao = configurado ? { ...j.energia_alocada } : _distribuicaoSugerida(total);
  const uso = j.energia_usada || (window.categoriaEnergiaVazia ? window.categoriaEnergiaVazia() : {});

  const linhas = ORDEM.map(cat => {
    const info = LABEL[cat];
    const val = alocacao[cat] || 0;
    const usado = uso[cat] || 0;
    const pctUso = val > 0 ? Math.min(100, Math.round(usado / val * 100)) : 0;
    return `
    <div class="card" style="margin-bottom:.6rem;padding:.8rem .9rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.3rem">
        <div style="font-weight:600;font-size:.82rem;color:var(--txt)">${info.icone} ${info.l}</div>
        <div style="font-family:var(--font-mono,monospace);font-size:.78rem;color:var(--amber)"><span id="energia-val-${cat}">${val}</span>⚡</div>
      </div>
      <div style="font-size:.66rem;color:var(--txt4);margin-bottom:.5rem">${info.desc}</div>
      <input type="range" min="0" max="${total}" value="${val}" step="1"
        id="energia-slider-${cat}" style="width:100%"
        oninput="window._energiaSliderMudou('${cat}')">
      ${configurado ? `
      <div style="margin-top:.4rem;font-size:.64rem;color:var(--txt4)">Usado este mês: ${usado}/${val}</div>
      <div class="stat-bar" style="height:5px;margin-top:.15rem"><div class="stat-bar-fill" style="width:${pctUso}%;background:${pctUso>=100?'var(--verm2)':'var(--amber)'}"></div></div>
      ` : ''}
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
