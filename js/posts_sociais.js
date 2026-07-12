/**
 * POSTS (Redes Sociais) — Advocatus Online
 * Feed real e persistido (coleção top-level `posts`). Composer, curtir,
 * apagar — via Cloud Functions (functions/posts_sociais.js). Feed global
 * por data, não personalizado por seguidores (não existe grafo social).
 */

import { collection, query, orderBy, limit, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

function _tempoRelativo(iso) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

window.renderFeedPosts = async function(el) {
  if (!el) return;
  el.innerHTML = `<div class="card" style="font-size:.75rem;color:var(--txt3)">Carregando feed...</div>`;

  const meuUid = window.JOGADOR?.uid || window.JOGADOR_UID;
  const j = window.JOGADOR || {};
  const podePostar = !j.ultimo_post_em || (Date.now() - new Date(j.ultimo_post_em).getTime()) / 3600000 >= 20;

  let posts = [];
  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('criado_em', 'desc'), limit(30)));
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    el.innerHTML = `<div class="card" style="font-size:.75rem;color:var(--txt3)">Erro ao carregar feed.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="card" style="margin-bottom:.8rem">
      <div style="font-size:.78rem;font-weight:600;color:var(--txt);margin-bottom:.4rem">✍️ Publicar</div>
      <textarea id="post-texto" maxlength="280" rows="3" placeholder="O que você quer compartilhar sobre sua carreira?"
        style="width:100%;background:var(--bg2);border:var(--borda);border-radius:var(--r);color:var(--txt);padding:.5rem;font-family:var(--font-sans);font-size:.78rem;resize:vertical"
        ${podePostar ? '' : 'disabled'}></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.4rem">
        <span style="font-size:.62rem;color:var(--txt4)">${podePostar ? 'máx. 280 caracteres · 1 post por ~20h' : '⏳ você já postou recentemente, volte mais tarde'}</span>
        <button class="btn btn-prim btn-sm" ${podePostar ? '' : 'disabled'} onclick="window._postsPublicar()">Publicar</button>
      </div>
    </div>
    <div id="posts-lista">${_postsListaHtml(posts, meuUid)}</div>`;
};

function _postsListaHtml(posts, meuUid) {
  if (!posts.length) return `<div class="card" style="color:var(--txt4);font-size:.75rem;text-align:center">Nenhum post ainda. Seja o primeiro.</div>`;
  return posts.map(p => {
    const curtiu = (p.curtido_por || []).includes(meuUid);
    const souAutor = p.autor_uid === meuUid;
    return `
    <div class="card" style="margin-bottom:.6rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-weight:600;font-size:.78rem;color:var(--txt)">${p.autor_nome || 'Advogado(a)'}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span style="font-size:.62rem;color:var(--txt4)">${_tempoRelativo(p.criado_em)}</span>
          ${souAutor ? `<button style="background:none;border:none;color:var(--txt4);cursor:pointer;font-size:.7rem" onclick="window._postsDeletar('${p.id}')" title="Apagar">🗑️</button>` : ''}
        </div>
      </div>
      <div style="font-size:.8rem;color:var(--txt2);margin:.4rem 0;line-height:1.4;white-space:pre-wrap">${_escapeHtml(p.texto || '')}</div>
      <button class="btn btn-ghost btn-sm" style="${curtiu?'color:var(--verm3);border-color:var(--verm3)':''}" onclick="window._postsCurtir('${p.id}')">
        ${curtiu ? '❤️' : '🤍'} ${p.curtidas || 0}
      </button>
    </div>`;
  }).join('');
}

function _escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window._postsPublicar = async function() {
  const texto = document.getElementById('post-texto')?.value || '';
  if (!texto.trim()) return;
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'publicarPost');
    const r = await fn({ texto });
    window.toast(`✅ ${r.data.msg}`, 'ok', 2000);
    if (window.JOGADOR) window.JOGADOR.ultimo_post_em = new Date().toISOString();
    window.renderFeedPosts(document.getElementById('redes-feed-area'));
  } catch (e) {
    window.toast(e.message || 'Erro ao publicar.', 'ko');
  }
};

window._postsCurtir = async function(postId) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'curtirPost');
    await fn({ post_id: postId });
    window.renderFeedPosts(document.getElementById('redes-feed-area'));
  } catch (e) {
    window.toast(e.message || 'Erro ao curtir.', 'ko');
  }
};

window._postsDeletar = async function(postId) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'deletarPost');
    const r = await fn({ post_id: postId });
    window.toast(`✅ ${r.data.msg}`, 'ok', 1800);
    window.renderFeedPosts(document.getElementById('redes-feed-area'));
  } catch (e) {
    window.toast(e.message || 'Erro ao apagar.', 'ko');
  }
};
