'use strict';

/**
 * ENERGIA — resumo do mês (pote único). Toda ação gasta da mesma energia
 * mensal (js/energia_categorias.js); aqui só mostramos quanto sobra e em que
 * ela foi gasta. A energia que sobra no fim do mês vira descanso.
 */

const LABEL = {
  processos:  { icone: '⚖️', l: 'Processos Estratégicos', desc: 'Assumir casos, sentenças, recursos, serviços avulsos.' },
  supervisao: { icone: '👥', l: 'Supervisão da Carteira',  desc: 'Coordenar e designar funcionários, mediar conflitos.' },
  estudo:     { icone: '📚', l: 'Estudo',                  desc: 'Cursos, aulas de pós-graduação, defesa de TCC.' },
  captacao:   { icone: '📣', l: 'Gestão / Captação',       desc: 'Captar casos novos, Moot Court, mídia, networking.' },
  pessoal:    { icone: '❤️', l: 'Vida Pessoal',            desc: 'Relacionamentos, amigos, sair com alguém.' },
  descanso:   { icone: '🛌', l: 'Descanso',                desc: 'Academia e outras atividades de recuperação.' },
};
const ORDEM = ['processos', 'supervisao', 'estudo', 'captacao', 'pessoal', 'descanso'];

window.renderEnergia = async function(j, el) {
  const total = window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100;
  const disp = window.energiaDisponivelCategoria ? window.energiaDisponivelCategoria(j, 'processos') : total;
  const gasto = total - disp;
  const pct = total > 0 ? Math.round(disp / total * 100) : 0;
  const uso = j.energia_usada || {};

  const linhas = ORDEM.filter(c => (uso[c] || 0) > 0).map(cat => {
    const info = LABEL[cat];
    const v = uso[cat] || 0;
    return `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:.45rem 0;border-bottom:1px solid var(--borda-cor, rgba(255,255,255,.06))">
        <div style="font-size:.8rem;color:var(--txt)">${info.icone} ${info.l}</div>
        <div style="font-family:var(--font-mono,monospace);font-size:.78rem;color:var(--amber)">${v}⚡</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:640px">
      <div style="margin-bottom:.8rem"><button class="btn btn-ghost btn-sm" onclick="window.navTo('perfil',null)">← Perfil</button></div>
      <h2 style="font-family:var(--font-serif);font-size:1.3rem;margin-bottom:.3rem">Energia</h2>
      <div style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem">
        Toda ação do mês — casos, estudo, equipe, vida pessoal — gasta da mesma energia.
        O que sobrar quando você avançar o mês vira descanso e reduz o estresse.
      </div>

      <div class="card" style="margin-bottom:.8rem;padding:.9rem 1rem">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.4rem">
          <div style="font-size:.8rem;color:var(--txt3)">Disponível este mês</div>
          <div style="font-weight:700;font-family:var(--font-mono,monospace);font-size:1.1rem;color:var(--verde2)">${disp} / ${total}⚡</div>
        </div>
        <div class="stat-bar" style="height:8px"><div class="stat-bar-fill" style="width:${pct}%;background:var(--verde2)"></div></div>
      </div>

      <div class="card" style="padding:.8rem 1rem">
        <div style="font-weight:600;font-size:.82rem;color:var(--txt);margin-bottom:.3rem">Gasto este mês: ${gasto}⚡</div>
        ${linhas || '<div style="font-size:.74rem;color:var(--txt4)">Nada gasto ainda.</div>'}
      </div>
    </div>`;
};
