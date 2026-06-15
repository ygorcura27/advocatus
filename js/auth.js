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
  const avatar = document.getElementById('tb-avatar');
  const nome   = document.getElementById('tb-nome');
  const rep    = document.getElementById('tb-rep');
  const saldo  = document.getElementById('tb-saldo');

  if (avatar && user.photoURL) {
    avatar.src = user.photoURL;
    avatar.style.display = 'block';
  }
  if (nome)  nome.textContent  = jogador.nome_personagem || user.displayName || '—';
  if (rep)   rep.textContent   = jogador.reputacao || 0;
  if (saldo) saldo.textContent = _fmt(jogador.dinheiro || 0);
}

// ════════════════════════════════════════════════════════
// RELÓGIO GLOBAL
// ════════════════════════════════════════════════════════
function _atualizarRelogio(server) {
  const el = document.getElementById('server-data');
  if (el) {
    el.textContent = `${server.mes_nome || 'Janeiro'}, Ano ${server.ano_jogo || 1}`;
  }
  // O tick é manual (por clique) — mostrar energia restante
  _atualizarTickLabel();
}

function _atualizarTickLabel() {
  const el = document.getElementById('server-tick');
  if (!el) return;
  const j = window.JOGADOR;
  if (!j) { el.textContent = ''; return; }

  const usado      = j.energia_usada_mes || 0;
  const disponivel = Math.max(0, 100 - usado);

  if (disponivel <= 20) {
    el.innerHTML = `<span style="cursor:pointer;text-decoration:underline;color:var(--ouro2)" onclick="window.avancarMes()">▶ Avançar mês</span>`;
  } else {
    el.innerHTML = `<span>⚡ ${disponivel} energia</span>`;
    el.style.color = '';
  }
}

// Atualizar label quando jogador mudar
window.addEventListener('jogador:update', () => _atualizarTickLabel());

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
