/**
 * FIREBASE INIT — Advocatus Online
 * Inicializa o Firebase e expõe as instâncias globalmente.
 * Importado como módulo ES6 em jogo.html.
 */

import { initializeApp }    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth }          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore }     from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions }     from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const FB_CONFIG = {
  apiKey:            "AIzaSyAjKvYGvb8kFasxaYzze4A5mnsdSjEFOXQ",
  authDomain:        "advocatus-57f24.firebaseapp.com",
  projectId:         "advocatus-57f24",
  storageBucket:     "advocatus-57f24.firebasestorage.app",
  messagingSenderId: "799917424990",
  appId:             "1:799917424990:web:064c2d7ce678b901ff8fcf",
  measurementId:     "G-4N9220630M",
};

const app       = initializeApp(FB_CONFIG);
const auth      = getAuth(app);
const db        = getFirestore(app);
const functions = getFunctions(app, 'southamerica-east1');

// ── Expor globalmente para os outros módulos ──
// (usamos window.* pois os módulos têm escopo isolado)
window.FB_APP       = app;
window.FB_AUTH      = auth;
window.FB_DB        = db;
window.FB_FUNCTIONS = functions;

export { app, auth, db, functions };
