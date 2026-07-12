/**
 * IMPRENSA JURÍDICA — Advocatus Online (GDD v5.1 §15)
 * Real e 100% automática (gerada pelo tick mensal quando um jogador
 * vence em instância superior, uma petição bate fama 80, ou reputação
 * bate 80) — obterNoticiasImprensa nunca tinha tela nenhuma.
 */

import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const _IMP_VEICULOS = {
  supreme_wire:     { l: 'Supreme Wire', cor: 'var(--navy3)' },
  the_daily_docket: { l: 'The Daily Docket', cor: 'var(--ouro)' },
  the_brief:        { l: 'The Brief', cor: 'var(--verde2)' },
};

function _impTempo(iso) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoje';
  if (dias === 1) return 'ontem';
  return `${dias}d atrás`;
}

window.renderImprensa = async function(j, el) {
  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">📰 Imprensa Jurídica</div></div><div class="card">Carregando...</div>`;

  let noticias = [];
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'obterNoticiasImprensa');
    const r = await fn({ limite: 30 });
    noticias = r.data.noticias || [];
  } catch (e) {
    el.innerHTML = `<div class="secao-header"><div class="secao-titulo">📰 Imprensa Jurídica</div></div><div class="card" style="color:var(--txt4)">Erro ao carregar notícias.</div>`;
    return;
  }

  const listaHtml = noticias.length ? noticias.map(n => {
    const veic = _IMP_VEICULOS[n.veiculo] || { l: n.veiculo, cor: 'var(--txt3)' };
    return `<div class="card" style="margin-bottom:.6rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem">
        <span class="badge" style="background:transparent;border:1px solid ${veic.cor};color:${veic.cor}">${veic.l}</span>
        <span style="font-size:.62rem;color:var(--txt4)">${_impTempo(n.publicado_em)}</span>
      </div>
      <div style="font-weight:600;font-size:.85rem;color:var(--txt);font-family:var(--font-serif)">${n.manchete}</div>
      ${n.subtitulo ? `<div style="font-size:.74rem;color:var(--txt3);margin-top:.3rem">${n.subtitulo}</div>` : ''}
      ${n.nome_citado === j.nome_personagem ? `<div style="font-size:.65rem;color:var(--verde2);margin-top:.4rem">⭐ Você foi destaque nesta matéria</div>` : ''}
    </div>`;
  }).join('') : `<div class="card" style="color:var(--txt4);text-align:center">Nenhuma notícia publicada ainda. A imprensa cobre vitórias em instância superior, petições muito famosas e reputação alta.</div>`;

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">📰 Imprensa Jurídica</div></div>
    <div class="card" style="font-size:.7rem;color:var(--txt3);margin-bottom:1rem">
      Gerada automaticamente: vitórias em 2ª instância+, petições com fama ≥ 80, ou reputação ≥ 80. Sem ação do jogador.
    </div>
    ${listaHtml}`;
};
