/**
 * ARTIGOS & LIVROS — Advocatus Online (GDD v5.1 §31-34)
 * Sistema real (functions/artigos_livros.js) sem UI nenhuma até aqui —
 * mesmo achado do sistema de Pós-Graduação. confeccionarObra/
 * publicarLivro/citarObra/obterObrasPublicas todos reais, zero chamada
 * do frontend antes desta tela.
 */

import { collection, query, where, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

function _formatarMesGlobal(mesTotal) {
  const ano = Math.floor((mesTotal || 0) / 12);
  const mes = (mesTotal || 0) % 12 + 1;
  return `mês ${mes} do ano ${ano}`;
}

const _AL_AREAS = [
  { k: 'area_employment', l: 'Trabalhista' }, { k: 'area_tax', l: 'Tributário' },
  { k: 'area_civil', l: 'Cível' }, { k: 'area_criminal', l: 'Criminal' },
  { k: 'area_corporate', l: 'Empresarial' }, { k: 'area_immigration', l: 'Imigração' },
  { k: 'area_bankruptcy', l: 'Rec. Judicial' },
];

window.renderArtigosLivros = async function(j, el) {
  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">📚 Artigos & Livros</div></div><div class="card">Carregando...</div>`;

  const grau = j.posgrad_concluido;
  const podeArtigo = !!grau;
  const podeLivro  = ['doutorado', 'catedral'].includes(grau);

  let obras = [];
  try {
    const snap = await getDocs(query(collection(db, 'peticoes'),
      where('jogador_uid', '==', j.uid), where('categoria', 'in', ['artigo', 'livro'])));
    obras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { /* segue vazio */ }

  const obrasHtml = obras.length ? obras.map(o => {
    const emComposicao = o.status === 'em_composicao';
    return `<div class="card" style="margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:600;font-size:.8rem;color:var(--txt)">${o.categoria === 'livro' ? '📗' : '📄'} ${o.titulo}</div>
          <div style="font-size:.68rem;color:var(--txt3)">${_AL_AREAS.find(a=>a.k===o.practice_area)?.l || o.practice_area}</div>
        </div>
        <span class="badge" style="background:${emComposicao?'var(--amber-bg)':'var(--verde-bg)'};color:${emComposicao?'var(--amber)':'var(--verde2)'}">${emComposicao ? '⏳ em composição' : `nota ${o.nota_teto}/26`}</span>
      </div>
      ${!emComposicao ? `<div style="font-size:.68rem;color:var(--txt3);margin-top:.4rem">📈 ${o.citacoes||0} citações${o.categoria==='livro'?` · 💰 R$ ${(o.royalties_pagos_total||0).toLocaleString('pt-BR')} em royalties`:''}</div>` : ''}
      ${(!emComposicao && o.categoria === 'livro' && !o.no_mercado) ? `<button class="btn btn-prim btn-sm" style="margin-top:.5rem" onclick="window._alPublicarLivro('${o.id}')">Publicar no Mercado</button>` : ''}
      ${o.no_mercado ? `<div style="font-size:.65rem;color:var(--verde2);margin-top:.4rem">✅ no mercado — R$ ${o.preco_mercado}/cópia</div>` : ''}
    </div>`;
  }).join('') : `<div class="card" style="color:var(--txt4);text-align:center">Nenhuma obra ainda.</div>`;

  el.innerHTML = `
    ${window._capaHeader('PRODUÇÃO ACADÊMICA · ADVOCATUS ONLINE', '📚 Artigos & Livros', `<span class="pill pill-oab">${obras.length} obra${obras.length===1?'':'s'}</span>`)}
    <div class="card" style="font-size:.72rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      Artigos exigem Mestrado+; livros exigem Doutorado/Cátedra. Citações de outros jogadores rendem
      Prestígio Acadêmico e Didática; livros publicados no mercado rendem royalties mensais por cópia vendida.
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;gap:.5rem">
        <button class="btn ${podeArtigo?'btn-prim':'btn-ghost'} btn-block" ${podeArtigo?'':'disabled title="Requer Mestrado"'} onclick="window._alEscrever('artigo')">📄 Escrever Artigo</button>
        <button class="btn ${podeLivro?'btn-prim':'btn-ghost'} btn-block" ${podeLivro?'':'disabled title="Requer Doutorado/Cátedra"'} onclick="window._alEscrever('livro')">📗 Escrever Livro</button>
      </div>
    </div>
    <div style="font-size:.78rem;font-weight:600;margin-bottom:.5rem;color:var(--txt)">Minhas Obras</div>
    ${obrasHtml}`;
};

window._alEscrever = function(categoria) {
  window.abrirModal(`✍️ Escrever ${categoria === 'livro' ? 'Livro' : 'Artigo'}`,
    `<div class="campo"><label>Área</label>
      <select id="al-area">${_AL_AREAS.map(a=>`<option value="${a.k}">${a.l}</option>`).join('')}</select>
    </div>
    <div class="campo"><label>Título (opcional)</label><input type="text" id="al-titulo" maxlength="120" placeholder="Deixe em branco pra gerar automático"></div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._alConfirmarEscrever('${categoria}')">Iniciar →</button>
    </div>`);
};

window._alConfirmarEscrever = async function(categoria) {
  const practice_area = document.getElementById('al-area')?.value;
  const titulo = document.getElementById('al-titulo')?.value || null;
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'confeccionarObra');
    const r = await fn({ categoria, practice_area, titulo });
    window.toast(`✅ ${categoria === 'livro' ? 'Livro' : 'Artigo'} iniciado — pronto ${_formatarMesGlobal(r.data.mes_conclusao)}.`, 'ok', 3500);
    window.fecharModal();
    setTimeout(() => window.navTo?.('artigos_livros', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._alPublicarLivro = function(peticao_id) {
  window.abrirModal('📗 Publicar no Mercado',
    `<div class="campo"><label>Preço por cópia (mín. R$100)</label><input type="number" id="al-preco" min="100" step="10" placeholder="Ex: 150"></div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._alConfirmarPublicar('${peticao_id}')">Publicar →</button>
    </div>`);
};

window._alConfirmarPublicar = async function(peticao_id) {
  const preco_base = parseFloat(document.getElementById('al-preco')?.value || 0);
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'publicarLivro');
    await fn({ peticao_id, preco_base });
    window.toast('✅ Livro publicado no mercado.', 'ok', 2500);
    window.fecharModal();
    setTimeout(() => window.navTo?.('artigos_livros', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};
