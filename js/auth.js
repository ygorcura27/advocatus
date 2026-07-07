/**
 * AUTH — Advocatus Online
 * Gerencia estado de autenticação no jogo.html.
 * Redireciona para index.html se não autenticado.
 */

import { onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, updateDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db } from './firebase-init.js';
import { renderAvatarJogador } from './avatar_svg.js';

// ── Estado global do jogador ──
window.JOGADOR     = null;   // snapshot atual do jogador
window.JOGADOR_UID = null;   // uid do usuário logado
window.SERVER      = null;   // snapshot do /config/server

let _unsubJogador = null;    // listener Firestore do jogador
let _unsubServer  = null;    // listener Firestore do servidor

// ════════════════════════════════════════════════════════
// AUTH STATE LISTENER
// ════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Não autenticado → voltar para login
    window.location.href = '/index.html';
    return;
  }

  window.JOGADOR_UID = user.uid;

  // Verificar se jogador existe
  const snap = await getDoc(doc(db, 'jogadores', user.uid));
  if (!snap.exists()) {
    // Perfil não criado → volta para criação
    window.location.href = '/index.html';
    return;
  }

  // Atualizar último login
  try {
    await updateDoc(doc(db, 'jogadores', user.uid), {
      ultimo_login: new Date().toISOString(),
    });
  } catch (_) { /* silencioso */ }

  // Iniciar listeners em tempo real
  _iniciarListeners(user.uid);

  // Atualizar topbar com dados do usuário
  _atualizarTopbarUsuario(user, snap.data());
});

// ════════════════════════════════════════════════════════
// LISTENERS EM TEMPO REAL (Firestore onSnapshot)
// ════════════════════════════════════════════════════════
function _iniciarListeners(uid) {
  // Listener do jogador
  if (_unsubJogador) _unsubJogador();
  _unsubJogador = onSnapshot(
    doc(db, 'jogadores', uid),
    (snap) => {
      if (!snap.exists()) return;
      window.JOGADOR = snap.data();
      // Notificar gamestate.js que o jogador foi atualizado
      window.dispatchEvent(new CustomEvent('jogador:update', { detail: snap.data() }));
    },
    (err) => { console.error('[AUTH] Erro listener jogador:', err); }
  );

  // Listener do servidor (calendário global)
  if (_unsubServer) _unsubServer();
  _unsubServer = onSnapshot(
    doc(db, 'config', 'server'),
    (snap) => {
      if (!snap.exists()) return;
      window.SERVER = snap.data();
      window.dispatchEvent(new CustomEvent('server:update', { detail: snap.data() }));
      _atualizarRelogio(snap.data());
    },
    (err) => { console.error('[AUTH] Erro listener servidor:', err); }
  );
}

// ════════════════════════════════════════════════════════
// TOPBAR — USUÁRIO
// ════════════════════════════════════════════════════════
function _atualizarTopbarUsuario(user, jogador) {
  const avatar    = document.getElementById('tb-avatar');
  const avatarSvg = document.getElementById('tb-avatar-svg');
  const nome      = document.getElementById('tb-nome');

  if (user.photoURL) {
    window.USER_PHOTO_URL = user.photoURL;
    if (avatar) { avatar.src = user.photoURL; avatar.style.display = 'block'; }
  } else if (avatarSvg && jogador) {
    avatarSvg.innerHTML = renderAvatarJogador(jogador, { size: 28 });
    avatarSvg.style.display = 'block';
  }
  if (nome) nome.textContent = jogador.nome_personagem || user.displayName || '—';
}

// ════════════════════════════════════════════════════════
// RELÓGIO GLOBAL
// ════════════════════════════════════════════════════════
const _MESES_AUTH = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function _atualizarRelogio(server) {
  const el = document.getElementById('server-data');
  if (!el) return;
  // Prioridade: calendário pessoal do jogador
  const j = window.JOGADOR;
  if (j && j.mes_pessoal !== undefined && j.ano_pessoal !== undefined) {
    el.textContent = `${_MESES_AUTH[j.mes_pessoal]}, Ano ${j.ano_pessoal}`;
  } else {
    el.textContent = `${server.mes_nome || 'Janeiro'}, Ano ${server.ano_jogo || 1}`;
  }
  _atualizarTickLabel();
}

function _atualizarTickLabel() {
  // Sem exibição de energia na topbar — nada a atualizar no tick
}

// Atualizar relógio e label quando jogador mudar
window.addEventListener('jogador:update', (e) => {
  const j = e.detail;
  if (!j) return;
  const el = document.getElementById('server-data');
  if (el && j.mes_pessoal !== undefined && j.ano_pessoal !== undefined) {
    el.textContent = `${_MESES_AUTH[j.mes_pessoal]}, Ano ${j.ano_pessoal}`;
  }
  _atualizarTickLabel();
});

// ════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════════
window.fazerLogout = async () => {
  if (!confirm('Sair do jogo? Seu progresso está salvo automaticamente.')) return;
  if (_unsubJogador) _unsubJogador();
  if (_unsubServer)  _unsubServer();
  await signOut(auth);
  window.location.href = '/index.html';
};

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function _fmt(n) {
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${(n/1000).toFixed(0)}k`;
  return `R$ ${n.toLocaleString('pt-BR')}`;
}
