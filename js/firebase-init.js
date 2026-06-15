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
  apiKey:            "AIzaSyCiGvGA2OUYSGp2BHM-K05tM39hPk40trY",
  authDomain:        "advocatus-simultor.firebaseapp.com",
  projectId:         "advocatus-simultor",
  storageBucket:     "advocatus-simultor.firebasestorage.app",
  messagingSenderId: "527755299061",
  appId:             "1:527755299061:web:cc75b6f9912d13a44a5dbc",
  measurementId:     "G-MTKD441F1V",
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
