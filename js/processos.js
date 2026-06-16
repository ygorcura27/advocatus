/**
 * PROCESSOS — Advocatus Online
 * Fluxo: Abrir processo → Peça processual → Ação → Quiz técnico → Resultado
 */

import { collection, addDoc, doc, updateDoc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';
import { getPecasParaCaso } from './banco_pecas.js';
import { getQuestoes } from './banco_questoes.js';

// ════════════════════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════════════════════
const ACOES = {
  pesquisa:       { l:'🔬 Pesquisa Jurídica',    energia:5,  progresso:8,  skills:['pesquisa','argumentacao'],   desc:'Análise de legislação e jurisprudência.' },
  peticionamento: { l:'📝 Peticionamento',        energia:10, progresso:15, skills:['escrita','argumentacao'],    desc:'Elaboração de peça processual.' },
  diligencia:     { l:'🔍 Diligência',            energia:15, progresso:22, skills:['pesquisa','negociacao'],     desc:'Coleta de provas e informações.' },
  audiencia:      { l:'🏛️ Audiência',            energia:20, progresso:30, skills:['oratoria','persuasao'],      desc:'Sustentação oral e audiência.' },
};

const CARGO_IDX = {
  est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7,
  jsub:2, jtit:4, dsb:5, mstj:7, padj:2, prom:4, pjus:5, pgj:7,
  dadj:2, def:4, dch:5, dge:7,
};

// ════════════════════════════════════════════════════════
// ESTADO DO FLUXO ATUAL
// ════════════════════════════════════════════════════════
let _estado = null; // { procId, proc, fase, acaoId, questoes, qi, acertos }

// ════════════════════════════════════════════════════════
// ABRIR PROCESSO (modal principal)
// ════════════════════════════════════════════════════════
window.abrirProcesso = async function(processoId) {
  try {
    const snap = await getDoc(doc(db, 'processos', processoId));
    if (!snap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
    const p = snap.data();
    _estado = { procId: processoId, proc: p, fase: 'modal' };
    _renderModalProcesso(processoId, p);
  } catch (err) { toast('Erro ao abrir processo.', 'ko'); console.error(err); }
};

function _renderModalProcesso(id, p) {
  const j        = window.JOGADOR;
  const cs       = p.chance_sucesso || 50;
  const prog     = p.progresso || 0;
  const csColor  = cs >= 70 ? 'var(--verde2)' : cs >= 40 ? 'var(--amber)' : 'var(--verm2)';
  const inst     = ['','1ª Instância','2ª Instância','STJ','STF'][p.instancia||1] || '1ª Inst.';
  const isSolo   = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const energiaDisp = Math.max(0, 100 - (j.energia_usada_mes || 0));
  const honInfo  = isSolo
    ? `Solo: 30% causa + ${[,'10%','10%','5%','5%'][p.instancia||1]} sucumbência`
    : `Escritório: 10% da sucumbência`;

  const avisoEnergia = energiaDisp === 0
    ? `<div style="background:var(--verm-bg);border:1px solid var(--verm3);border-radius:var(--r);padding:.55rem .75rem;margin-bottom:.7rem;font-size:.75rem;color:var(--verm2);text-align:center">
        ⚡ Energia esgotada — avance o mês para continuar
       </div>`
    : energiaDisp <= 20
    ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r);padding:.45rem .75rem;margin-bottom:.6rem;font-size:.72rem;color:var(--amber);text-align:center">
        ⚡ ${energiaDisp} energia restante
       </div>`
    : '';

  abrirModal(`⚖️ ${p.tipo || '—'}`,
    `<div style="background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.75rem;margin-bottom:.85rem">
      <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4);margin-bottom:.25rem">${p.numero || '—'}</div>
      <div style="font-weight:700;font-size:.9rem;color:var(--navy);margin-bottom:.15rem">${p.autor || '—'} <span style="opacity:.4">vs</span> ${p.reu || '—'}</div>
      <div style="font-size:.7rem;color:var(--ouro2)">${p.tribunal || '—'} · ${inst}</div>
      <div style="font-size:.7rem;color:var(--verde2);margin-top:.25rem">${fmt(p.valor)} · ${honInfo}</div>
    </div>
    <div style="margin-bottom:.85rem">
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3);margin-bottom:.2rem">
        <span>Progresso</span><span style="color:var(--navy);font-weight:700">${prog}%</span>
      </div>
      <div style="height:7px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-bottom:.4rem">
        <div style="height:100%;width:${prog}%;background:linear-gradient(90deg,var(--navy3),var(--ouro2));transition:width .4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3)">
        <span>Chance de vitória</span>
        <span style="font-weight:700;color:${csColor}">${cs}%</span>
      </div>
      <div style="height:5px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:.18rem">
        <div style="height:100%;width:${cs}%;background:${csColor};transition:width .4s"></div>
      </div>
    </div>
    ${avisoEnergia}
    ${prog >= 100
      ? `<button class="btn btn-prim btn-block" onclick="window.processarSentenca('${id}')">⚖️ Processar sentença →</button>`
      : p.recurso_pendente
      ? `<div style="display:flex;flex-direction:column;gap:.4rem">
           <button class="btn btn-prim btn-block" onclick="window.decidirRecurso('${id}',true)">⚠️ Interpor recurso (${cs}% chance)</button>
           <button class="btn btn-ghost btn-block" onclick="window.decidirRecurso('${id}',false)">✋ Não recorrer</button>
         </div>`
      : `<button class="btn btn-prim btn-block" ${energiaDisp === 0 ? 'disabled' : ''} onclick="window.iniciarFluxo('${id}')">
           ▶ Iniciar ação processual →
         </button>`}
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:.4rem" onclick="window.tentarAcordo('${id}')">
      🤝 Propor acordo (-5 ⚡)
    </button>`
  );
}

// ════════════════════════════════════════════════════════
// ETAPA 1 — ESCOLHA DA PEÇA PROCESSUAL
// ════════════════════════════════════════════════════════
window.iniciarFluxo = async function(procId) {
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) return;
  const p = snap.data();
  _estado = { procId, proc: p, fase: 'peca' };

  // Peça só é escolhida UMA VEZ por processo — nas ações seguintes vai direto
  if (p.peca_escolhida) {
    _iniciarEscolhaAcao(procId, p);
    return;
  }

  const pecas = getPecasParaCaso(p.tipo, p.area || 'civil', p.instancia || 1);
  if (!pecas) { _iniciarEscolhaAcao(procId, p); return; }

  _estado.pecas = pecas;

  abrirModal('📋 Qual é a peça processual correta?',
    `<div style="background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.7rem;margin-bottom:.85rem">
      <div style="font-size:.68rem;color:var(--txt4);margin-bottom:.15rem">${p.tipo} · ${p.area} · ${['','1ª','2ª','3ª','4ª'][p.instancia||1]} instância</div>
      <div style="font-size:.8rem;color:var(--navy);font-weight:600">${pecas.pergunta.split('\n\n')[1] || pecas.caso}</div>
    </div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.75rem">
      ✅ Peça correta → +10% chance vitória → escolhe a ação<br>
      ⚠️ Parcialmente correta → -5% chance vitória → escolhe a ação<br>
      ❌ Errada → perde a ação + -rep + contabiliza para demissão
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${pecas.opcoes.map((op, i) =>
        `<button class="btn btn-ghost btn-block" style="text-align:left;font-size:.8rem;padding:.65rem .85rem"
          onclick="window.responderPeca(${i})">
          ${String.fromCharCode(65+i)}) ${op.texto}
        </button>`
      ).join('')}
    </div>`
  );
};

window.responderPeca = async function(idx) {
  const { procId, proc, pecas } = _estado;
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const op  = pecas.opcoes[idx];
  const cs  = proc.chance_sucesso || 50;

  // Desabilitar botões
  document.querySelectorAll('.modal-body .btn-ghost').forEach((b,i) => {
    b.disabled = true;
    if (i === idx) b.style.background = 'var(--navy-light)';
  });

  if (op.tipo === 'correta') {
    // ✅ Acertou — +10% chance, prossegue. Marca peça como escolhida.
    await updateDoc(doc(db, 'processos', procId), { chance_sucesso: Math.min(95, cs + 10), peca_escolhida: true });
    _estado.proc = { ...proc, chance_sucesso: Math.min(95, cs + 10) };

    const feedback = document.createElement('div');
    feedback.innerHTML = `
      <div style="background:var(--verde-bg);border:1px solid var(--verde3);border-radius:var(--r);padding:.6rem;margin-top:.7rem">
        <div style="color:var(--verde);font-weight:700;font-size:.8rem">✅ Correto! +10% chance de vitória</div>
        <div style="font-size:.7rem;color:var(--txt3);margin-top:.25rem">${op.justificativa}</div>
      </div>`;
    document.querySelector('.modal-body').appendChild(feedback);

    const btn = document.createElement('button');
    btn.className = 'btn btn-prim btn-block';
    btn.style.marginTop = '.75rem';
    btn.textContent = 'Escolher ação →';
    btn.onclick = () => _iniciarEscolhaAcao(procId, _estado.proc);
    document.querySelector('.modal-body').appendChild(btn);

  } else if (op.tipo === 'parcial') {
    // ⚠️ Parcial — -5% chance, prossegue. Marca peça como escolhida.
    await updateDoc(doc(db, 'processos', procId), { chance_sucesso: Math.max(5, cs - 5), peca_escolhida: true });
    _estado.proc = { ...proc, chance_sucesso: Math.max(5, cs - 5) };

    const feedback = document.createElement('div');
    feedback.innerHTML = `
      <div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r);padding:.6rem;margin-top:.7rem">
        <div style="color:var(--amber);font-weight:700;font-size:.8rem">⚠️ Parcialmente correto — -5% chance de vitória</div>
        <div style="font-size:.7rem;color:var(--txt3);margin-top:.25rem">${op.justificativa}</div>
      </div>`;
    document.querySelector('.modal-body').appendChild(feedback);

    const btn = document.createElement('button');
    btn.className = 'btn btn-sec btn-block';
    btn.style.marginTop = '.75rem';
    btn.textContent = 'Continuar com a ação →';
    btn.onclick = () => _iniciarEscolhaAcao(procId, _estado.proc);
    document.querySelector('.modal-body').appendChild(btn);

  } else {
    // ❌ Errada — perde a ação, -rep, conta para demissão
    const cap    = (window.REP_CAP || {})[j.cargo_id] || 55;
    const rep    = j.reputacao || 30;
    const perda  = Math.max(1, Math.floor(rep * 0.04));
    const dc     = (j.derrotas_consecutivas || 0) + 1;
    const demitido = dc >= 5 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo';

    const updates = {
      reputacao: Math.max(0, rep - perda),
      derrotas_consecutivas: dc,
    };
    if (demitido) {
      updates.escritorio_id           = 'solo';
      updates.escritorio_empregado_id = null;
      updates.escritorio_nome         = null;
      updates.derrotas_consecutivas   = 0;
    }
    await updateDoc(doc(db, 'jogadores', uid), updates);

    const feedback = document.createElement('div');
    feedback.innerHTML = `
      <div style="background:var(--verm-bg);border:1px solid var(--verm3);border-radius:var(--r);padding:.6rem;margin-top:.7rem">
        <div style="color:var(--verm2);font-weight:700;font-size:.8rem">❌ Peça incorreta — ação perdida</div>
        <div style="font-size:.7rem;color:var(--txt3);margin-top:.2rem">${op.justificativa}</div>
        <div style="font-size:.72rem;color:var(--verm2);margin-top:.3rem">-${perda} reputação · Derrotas consecutivas: ${dc}/5</div>
        ${demitido ? `<div style="font-size:.75rem;font-weight:700;color:var(--verm2);margin-top:.3rem">⚠️ Demitido(a) por 5 derrotas consecutivas!</div>` : ''}
      </div>`;
    document.querySelector('.modal-body').appendChild(feedback);

    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-block';
    btn.style.marginTop = '.75rem';
    btn.textContent = 'Fechar';
    btn.onclick = () => fecharModal();
    document.querySelector('.modal-body').appendChild(btn);
  }
};

// ════════════════════════════════════════════════════════
// ETAPA 2 — ESCOLHA DA AÇÃO
// ════════════════════════════════════════════════════════
function _iniciarEscolhaAcao(procId, p) {
  const j           = window.JOGADOR;
  const energiaDisp = Math.max(0, 100 - (j.energia_usada_mes || 0));
  const cargoIdx    = CARGO_IDX[j.cargo_id] || 0;
  const podeAudiencia = cargoIdx >= 2; // Júnior+

  abrirModal('⚡ Escolha sua ação',
    `<div style="font-size:.72rem;color:var(--txt3);margin-bottom:.75rem;padding:.5rem;background:var(--surface2);border-radius:var(--r)">
      Maior gasto de energia = maior progresso no caso.<br>
      Você tem <b style="color:var(--navy)">⚡ ${energiaDisp}</b> de energia disponível.
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${Object.entries(ACOES).map(([id, a]) => {
        const podeUsar = energiaDisp >= a.energia && (id !== 'audiencia' || podeAudiencia);
        const motivo   = !podeAudiencia && id === 'audiencia' ? '🔒 Requer Júnior+' :
                         energiaDisp < a.energia ? `🔒 Requer ${a.energia} ⚡` : '';
        return `
          <button class="btn btn-block" ${!podeUsar ? 'disabled' : ''}
            style="text-align:left;padding:.7rem .9rem;border:var(--borda);border-radius:var(--r);background:${podeUsar?'var(--surface)':'var(--bg2)'};cursor:${podeUsar?'pointer':'not-allowed'};opacity:${podeUsar?1:.5}"
            onclick="window.iniciarQuiz('${procId}','${id}')">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${a.l}</div>
                <div style="font-size:.68rem;color:var(--txt3);margin-top:.1rem">${a.desc} · Skills: ${a.skills.join(' + ')}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:.8rem">
                <div style="font-size:.75rem;font-weight:700;color:var(--navy3)">+${a.progresso}%</div>
                <div style="font-size:.65rem;color:var(--txt4)">-${a.energia} ⚡</div>
                ${motivo ? `<div style="font-size:.62rem;color:var(--verm2)">${motivo}</div>` : ''}
              </div>
            </div>
          </button>`;
      }).join('')}
    </div>`
  );
}

// ════════════════════════════════════════════════════════
// ETAPA 3 — QUIZ TÉCNICO
// ════════════════════════════════════════════════════════
window.iniciarQuiz = async function(procId, acaoId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const a   = ACOES[acaoId];
  if (!a) return;

  // Verificar e gastar energia
  const usado = j.energia_usada_mes || 0;
  const disp  = Math.max(0, 100 - usado);
  if (disp < a.energia) { toast(`⚡ Energia insuficiente (requer ${a.energia}).`, 'ko'); return; }

  // Debitar energia imediatamente
  await updateDoc(doc(db, 'jogadores', uid), {
    energia_usada_mes: usado + a.energia,
  });

  // Buscar processo atualizado
  const snap = await getDoc(doc(db, 'processos', procId));
  const p    = snap.exists() ? snap.data() : _estado?.proc || {};

  const area    = p.area || j?.especialidade || 'civil';
  const questoes = getQuestoes(area, 3);

  _estado = { procId, proc: p, acaoId, fase: 'quiz', questoes, qi: 0, acertos: 0 };
  _renderQuizQ();
};

function _renderQuizQ() {
  const { questoes, qi, acaoId } = _estado;
  const q  = questoes[qi];
  const a  = ACOES[acaoId];

  abrirModal(
    `${a.l} — Questão ${qi + 1}/3`,
    `<div class="quiz-wrap">
      <div class="quiz-header">${a.l} · ${qi + 1}/3 · ${a.skills.join(' + ')}</div>
      <div class="quiz-prog-bar">
        <div class="quiz-prog-fill" style="width:${qi / 3 * 100}%"></div>
      </div>
      <div class="quiz-questao">${q.q}</div>
      <div class="quiz-opts">
        ${q.opts.map((op, i) =>
          `<button class="quiz-opt" onclick="window.responderQuiz(${i})">${op}</button>`
        ).join('')}
      </div>
    </div>`
  );
}

window.responderQuiz = function(idx) {
  const { questoes, qi } = _estado;
  const q     = questoes[qi];
  const certo = idx === q.c;
  if (certo) _estado.acertos++;

  // Feedback visual
  document.querySelectorAll('.quiz-opt').forEach((b, i) => {
    b.disabled = true;
    if (i === q.c)           b.classList.add('certo');
    if (i === idx && !certo) b.classList.add('errado');
  });

  const dica = document.createElement('div');
  dica.className = 'quiz-dica';
  dica.innerHTML = `${certo ? '✅ Correto!' : '❌ Incorreto.'} <b>📖 ${q.e}</b>`;
  document.querySelector('.quiz-wrap').appendChild(dica);

  const btn = document.createElement('button');
  btn.className = 'btn btn-prim btn-block';
  btn.style.marginTop = '.65rem';
  const last = qi === 2;
  btn.textContent = last ? 'Ver resultado →' : 'Próxima →';
  btn.onclick = last ? () => _finalizarQuiz() : () => { _estado.qi++; _renderQuizQ(); };
  document.querySelector('.quiz-wrap').appendChild(btn);
};

// ════════════════════════════════════════════════════════
// ETAPA 4 — RESULTADO DO QUIZ E PROGRESSO
// ════════════════════════════════════════════════════════
async function _finalizarQuiz() {
  const { procId, proc, acaoId, acertos } = _estado;
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const a   = ACOES[acaoId];

  // Progresso proporcional aos acertos
  const fator = [0, 1/3, 2/3, 1][acertos];
  const prog  = Math.round(a.progresso * fator);
  const novoP = Math.min(100, (proc.progresso || 0) + prog);

  // Bônus de chance baseado nas skills
  const skills   = j.skills || {};
  const skMedia  = a.skills.reduce((s, k) => s + (skills[k] || 10), 0) / a.skills.length;
  const bonusCs  = acertos >= 2 ? Math.floor(skMedia * 0.05) : 0;
  const novoCs   = Math.min(95, (proc.chance_sucesso || 50) + bonusCs);

  await updateDoc(doc(db, 'processos', procId), {
    progresso:      novoP,
    chance_sucesso: novoCs,
  });

  const corAcertos = acertos === 3 ? 'var(--verde2)' : acertos === 2 ? 'var(--amber)' : acertos === 1 ? 'var(--navy3)' : 'var(--verm2)';
  const emoji      = acertos === 3 ? '🏆' : acertos === 2 ? '👍' : acertos === 1 ? '😐' : '😔';
  const msg        = acertos === 3 ? 'Excelente domínio jurídico!' : acertos === 2 ? 'Bom desempenho.' : acertos === 1 ? 'Desempenho mediano.' : 'Estude mais esta matéria.';

  abrirModal('Resultado da Ação',
    `<div style="text-align:center;padding:.75rem 0">
      <div style="font-size:2rem;margin-bottom:.3rem">${emoji}</div>
      <div style="font-size:1.4rem;font-weight:700;color:${corAcertos};margin-bottom:.2rem">${acertos}/3 corretas</div>
      <div style="font-size:.78rem;color:var(--txt3);margin-bottom:.9rem">${msg}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:1rem">
        <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.55rem;text-align:center">
          <div style="font-size:.6rem;color:var(--txt4);text-transform:uppercase">Progresso</div>
          <div style="font-size:1rem;font-weight:700;color:var(--ouro2)">+${prog}%</div>
          <div style="font-size:.65rem;color:var(--txt3)">Total: ${novoP}%</div>
        </div>
        <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.55rem;text-align:center">
          <div style="font-size:.6rem;color:var(--txt4);text-transform:uppercase">Chance vitória</div>
          <div style="font-size:1rem;font-weight:700;color:${corAcertos}">${novoCs}%</div>
          ${bonusCs > 0 ? `<div style="font-size:.65rem;color:var(--verde2)">+${bonusCs}% bônus skill</div>` : '<div style="font-size:.65rem;color:var(--txt4)">Sem bônus de skill</div>'}
        </div>
      </div>
      ${novoP >= 100
        ? `<div style="background:var(--verde-bg);border:1px solid var(--verde3);border-radius:var(--r);padding:.6rem;margin-bottom:.75rem;font-size:.78rem;color:var(--verde)">
            ⚖️ Progresso completo! Pronto para sentença.
           </div>
           <button class="btn btn-prim btn-block" onclick="window.processarSentenca('${procId}')">
             Processar sentença →
           </button>`
        : `<button class="btn btn-prim btn-block" onclick="window.abrirProcesso('${procId}')">
             Continuar caso (${novoP}% concluído)
           </button>`}
    </div>`
  );
}

// ════════════════════════════════════════════════════════
// SENTENÇA — tenta Cloud Function, fallback no frontend
// ════════════════════════════════════════════════════════
window.processarSentenca = async function(procId) {
  toast('⏳ Processando sentença...', 'neutro', 2000);
  fecharModal();

  if (window.FB_FUNCTIONS) {
    try {
      const fn     = httpsCallable(window.FB_FUNCTIONS, 'processarSentenca');
      const result = await fn({ processo_id: procId });
      _mostrarResultadoSentenca(result.data, procId);
      return;
    } catch (err) {
      console.warn('[SENTENÇA] CF falhou, usando frontend:', err.code, err.message);
    }
  }
  await _processarSentencaFrontend(procId);
};

async function _processarSentencaFrontend(procId) {
  const j    = window.JOGADOR;
  const uid  = j?.uid || window.JOGADOR_UID;
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
  const p    = snap.data();

  const cs        = p.chance_sucesso || 50;
  const instancia = p.instancia || 1;
  const isSolo    = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const cap       = (window.REP_CAP || {})[j.cargo_id] || 55;
  const rep       = j.reputacao || 30;
  const mesAtual  = j.mes_global_pessoal || 1;

  const ganhou     = Math.random() * 100 < cs;
  const pct        = {1:0.10,2:0.10,3:0.05,4:0.05}[instancia] || 0.10;
  const suc        = Math.floor(p.valor * pct);
  const hon        = ganhou ? (isSolo ? Math.floor((instancia===1?p.valor*0.30:0)+suc) : Math.floor(suc*0.10)) : 0;
  const _pctRep  = rep / (cap || 35);
  const _fGanho  = _pctRep > 0.8 ? 0.04 : _pctRep > 0.6 ? 0.06 : 0.08;
  const _fPerda  = _pctRep > 0.8 ? 0.07 : _pctRep > 0.5 ? 0.05 : 0.03;
  const ganhoRep = Math.max(1, Math.floor((cap - rep) * _fGanho));
  const perdaRep = Math.max(1, Math.floor(rep * _fPerda));
  const xpGanho    = ganhou ? 25 : 10;

  if (ganhou) {
    const parteRecorre = cs < 70 && Math.random() < 0.55 && instancia < 4;
    await updateDoc(doc(db, 'jogadores', uid), {
      dinheiro:              (j.dinheiro||0) + hon,
      wins:                  (j.wins||0) + 1,
      wins_ano:              (j.wins_ano||0) + 1,
      reputacao:             Math.min(cap, rep + ganhoRep),
      xp:                    (j.xp||0) + xpGanho,
      derrotas_consecutivas: 0,
    });
    if (parteRecorre) {
      await updateDoc(doc(db, 'processos', procId), {
        instancia: instancia + 1, progresso: 0, status: 'andamento',
        hon_total_acumulado: (p.hon_total_acumulado||0) + hon,
      });
      _mostrarResultadoSentenca({ resultado:'ganho_continua', hon, msg:`✅ Vitória! +${fmt(hon)} honorários. +${ganhoRep} rep. +${xpGanho} XP.\nParte contrária recorreu — caso sobe de instância.` }, procId);
    } else {
      await updateDoc(doc(db, 'processos', procId), {
        status:'ganho', encerrado_mes:mesAtual, hon_total_acumulado:(p.hon_total_acumulado||0)+hon,
      });
      _mostrarResultadoSentenca({ resultado:'ganho_definitivo', hon, msg:`🏆 Vitória definitiva! +${fmt(hon)} honorários. +${ganhoRep} rep. +${xpGanho} XP.` }, procId);
    }
  } else {
    const dc = (j.derrotas_consecutivas||0) + 1;
    const demitido = dc >= 5 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo';
    const upds = {
      losses:    (j.losses||0)+1, losses_ano:(j.losses_ano||0)+1,
      reputacao: Math.max(0, rep-perdaRep),
      xp:        (j.xp||0)+xpGanho, derrotas_consecutivas:dc,
    };
    if (demitido) { upds.escritorio_id='solo'; upds.escritorio_empregado_id=null; upds.escritorio_nome=null; upds.derrotas_consecutivas=0; }
    await updateDoc(doc(db,'jogadores',uid), upds);
    if (p.tipo_processo==='administrativo' && instancia===1) {
      await updateDoc(doc(db,'processos',procId),{instancia:2,progresso:0,tipo_processo:'judicial',status:'andamento'});
      _mostrarResultadoSentenca({resultado:'derrota_admin_recurso_judicial',hon:0,demitido,msg:`❌ Decisão administrativa desfavorável. -${perdaRep} rep. Pode recorrer judicialmente.`},procId);
    } else if (cs>=70 && instancia<4) {
      await updateDoc(doc(db,'processos',procId),{recurso_pendente:true,progresso:0,status:'andamento'});
      _mostrarResultadoSentenca({resultado:'derrota_pode_recorrer',hon:0,cs,demitido,msg:`❌ Derrota. -${perdaRep} rep. +${xpGanho} XP. Chance ${cs}% → pode recorrer.`},procId);
    } else {
      await updateDoc(doc(db,'processos',procId),{status:'perdido',encerrado_mes:mesAtual});
      _mostrarResultadoSentenca({resultado:'derrota_definitiva',hon:0,demitido,msg:`❌ Derrota definitiva. -${perdaRep} rep. +${xpGanho} XP.`},procId);
    }
  }
}

function _mostrarResultadoSentenca(r, procId) {
  const icons = { ganho_definitivo:'🏆', ganho_continua:'✅', ganho_encerrado_cargo:'⚠️',
    derrota_admin_recurso_judicial:'📋', derrota_pode_recorrer:'❌', derrota_definitiva:'❌' };
  abrirModal(`${icons[r.resultado]||'⚖️'} Sentença`,
    `<div style="font-size:.85rem;line-height:1.75;margin-bottom:.9rem;color:var(--txt2);white-space:pre-line">${r.msg}</div>
    ${r.hon > 0 ? `<div style="font-size:.95rem;color:var(--verde2);font-weight:700;margin-bottom:.65rem">💰 +${fmt(r.hon)} honorários</div>` : ''}
    ${r.demitido ? `<div style="font-size:.8rem;color:var(--verm2);margin-bottom:.65rem;font-weight:600">⚠️ Demitido(a) — 5 derrotas consecutivas.</div>` : ''}
    ${r.resultado==='ganho_continua' ? `<button class="btn btn-prim btn-block" onclick="window.abrirProcesso('${procId}');fecharModal()">Ver processo →</button>` : ''}
    ${r.resultado==='derrota_pode_recorrer' ? `
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-prim" style="flex:1" onclick="window.decidirRecurso('${procId}',true)">Interpor recurso</button>
        <button class="btn btn-ghost" style="flex:1" onclick="window.decidirRecurso('${procId}',false)">Não recorrer</button>
      </div>` : ''}
    ${r.resultado==='derrota_admin_recurso_judicial' ? `<button class="btn btn-prim btn-block" onclick="window.abrirProcesso('${procId}');fecharModal()">Iniciar recurso judicial →</button>` : ''}`
  );
}

// ════════════════════════════════════════════════════════
// RECURSO
// ════════════════════════════════════════════════════════
window.decidirRecurso = async function(procId, interpor) {
  if (!interpor) {
    if (!confirm('Confirma: encerrar o caso sem recorrer?')) return;
    await updateDoc(doc(db,'processos',procId),{ status:'perdido', encerrado_mes:window.JOGADOR?.mes_global_pessoal||1 });
    fecharModal(); toast('Caso encerrado sem recurso.','neutro'); return;
  }
  const snap = await getDoc(doc(db,'processos',procId));
  if (!snap.exists()) return;
  const p = snap.data();
  const novaInst = (p.instancia||1)+1;
  await updateDoc(doc(db,'processos',procId),{
    instancia:novaInst, progresso:0, recurso_pendente:false, status:'andamento',
  });
  fecharModal();
  toast(`📋 Recurso interposto — ${['','1ª','2ª','3ª','4ª'][novaInst]} instância`, 'ok');
};

// ════════════════════════════════════════════════════════
// ACORDO
// ════════════════════════════════════════════════════════
window.tentarAcordo = async function(procId) {
  const ok = await _gastarEnergia(5, 'Tentativa de acordo');
  if (!ok) return;
  const j    = window.JOGADOR;
  const uid  = j?.uid || window.JOGADOR_UID;
  const snap = await getDoc(doc(db,'processos',procId));
  if (!snap.exists()) return;
  const p = snap.data();
  const cs = p.chance_sucesso||50;
  const aceito = Math.random() < (cs/120+0.25);
  const isSolo = !j.escritorio_empregado_id||j.escritorio_id==='solo';
  if (aceito) {
    const pct = {1:0.10,2:0.10,3:0.05,4:0.05}[p.instancia||1]||0.10;
    const suc = Math.floor(p.valor*pct);
    const hon = isSolo ? Math.floor(((p.instancia===1?p.valor*0.30:0)+suc)/2) : Math.floor(suc*0.10/2);
    await updateDoc(doc(db,'processos',procId),{status:'ganho',encerrado_mes:j.mes_global_pessoal||1,hon_total_acumulado:hon});
    await updateDoc(doc(db,'jogadores',uid),{dinheiro:(j.dinheiro||0)+hon,wins:(j.wins||0)+1,wins_ano:(j.wins_ano||0)+1,derrotas_consecutivas:0});
    fecharModal(); toast(`🤝 Acordo! +${fmt(hon)} honorários`,'ok');
  } else {
    toast('❌ Proposta de acordo rejeitada.','ko');
  }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO
// ════════════════════════════════════════════════════════
window.novoProcesso = async function() {
  const j   = window.JOGADOR;
  if (!j)   return;
  const uid = j.uid||window.JOGADOR_UID;
  const energiaDisp = Math.max(0,100-(j.energia_usada_mes||0));
  if (energiaDisp < 5) { toast('⚡ Energia insuficiente para novos casos.','ko'); return; }
  if (j.em_burnout)    { toast('🔴 Em burnout. Descanse antes de novos casos.','ko'); return; }
  const proc = _gerarProcesso(j);
  try {
    await addDoc(collection(db,'processos'),proc);
    toast(`📁 Novo caso: ${proc.tipo}`,'ok');
  } catch(err) { toast('Erro ao criar processo.','ko'); }
};

function _gerarProcesso(j) {
  const esp    = j.especialidade||'civil';
  const mesG   = j.mes_global_pessoal||1;
  const RANGES = {
    est:{min:500,max:5000,dniv:0}, ass:{min:1000,max:10000,dniv:0},
    jnr:{min:1000,max:20000,dniv:1}, pln:{min:20000,max:200000,dniv:11},
    snr:{min:150000,max:500000,dniv:21}, asc:{min:200000,max:10000000,dniv:21},
    soc:{min:250000,max:10000000,dniv:21}, snm:{min:500000,max:100000000,dniv:21},
  };
  const range  = RANGES[j.cargo_id]||RANGES.jnr;
  const valor  = range.min+Math.floor(Math.random()*(range.max-range.min));
  const nivel  = range.dniv+Math.floor(Math.random()*10);
  const sk     = j.skills||{};
  const skMed  = ((sk.argumentacao||15)+(sk.oratoria||15)+(sk.pesquisa||18))/3;
  const bonusEsc = window.getBonusEsc ? window.getBonusEsc(j,esp) : 0;
  const cs     = Math.max(10,Math.min(90,Math.round(50+(skMed-40)*0.4-nivel*0.5+bonusEsc)));
  const TIPOS  = {
    tributario:['Execução Fiscal','Repetição de Indébito','Mandado de Segurança Tributário','Impugnação de Auto de Infração','Recurso ao CARF','Compensação Tributária'],
    trabalhista:['Reclamação Trabalhista','Ação de Indenização por Acidente de Trabalho','Ação de Equiparação Salarial','Rescisão Indireta'],
    civil:['Ação de Indenização','Ação Revisional de Contrato','Ação de Despejo','Ação de Cobrança','Ação de Usucapião'],
    criminal:['Defesa Criminal','Habeas Corpus','Recurso em Sentido Estrito','Apelação Criminal'],
    empresarial:['Recuperação Judicial','Ação de Dissolução de Sociedade','Due Diligence Judicial','Arbitragem Empresarial'],
    constitucional:['Mandado de Segurança','Ação Popular','Impugnação de Licitação'],
    ambiental:['Defesa Autuação IBAMA','Ação Civil Pública Ambiental'],
    previdenciario:['Concessão de Benefício Previdenciário','Revisão de Aposentadoria','Recurso ao CRPS'],
  };
  const AUTORES = ['João Silva ME','Empresa Beta Ltda','Maria Oliveira','Carlos Santos','Família Andrade'];
  const REUS    = ['Receita Federal','INSS','Estado do RJ','Município do Rio','Empresa Alfa S/A'];
  const TRIBS   = {tributario:['TRF-2','CARF','TJRJ'],trabalhista:['TRT-1','Vara do Trabalho'],civil:['TJRJ','JEF','Vara Cível'],criminal:['Vara Criminal','TJRJ'],empresarial:['TJRJ','Câmara Empresarial'],constitucional:['TJRJ','STJ'],ambiental:['TRF-2','TJRJ'],previdenciario:['JEF','TRF-2']};
  const tipos   = TIPOS[esp]||TIPOS.civil;
  const tribs   = TRIBS[esp]||['TJRJ'];
  const num     = `${String(Math.floor(Math.random()*9999999)).padStart(7,'0')}-${String(Math.floor(Math.random()*99)).padStart(2,'0')}.${Math.max(1,j.ano_pessoal||1)}.8.19.0001`;
  return {
    numero:num, tipo:tipos[Math.floor(Math.random()*tipos.length)],
    area:esp, tipo_processo:Math.random()<0.25?'administrativo':'judicial',
    reu_eh_estado:Math.random()<0.5,
    autor:AUTORES[Math.floor(Math.random()*AUTORES.length)],
    reu:REUS[Math.floor(Math.random()*REUS.length)],
    tribunal:tribs[Math.floor(Math.random()*tribs.length)],
    advogado_uid:j.uid, escritorio_id:j.escritorio_id||null,
    status:'andamento', instancia:1, progresso:0, chance_sucesso:cs,
    valor, nivel, hon_total_acumulado:0,
    urgente:Math.random()<0.2, recurso_pendente:false,
    criado_mes:mesG, encerrado_mes:null,
  };
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
async function _gastarEnergia(custo, desc) {
  const j   = window.JOGADOR;
  const uid = j?.uid||window.JOGADOR_UID;
  const usado = j?.energia_usada_mes||0;
  const disp  = Math.max(0,100-usado);
  if (disp < custo) { toast(`⚡ Energia insuficiente (${disp} restantes, requer ${custo}).`,'ko'); return false; }
  try {
    await updateDoc(doc(db,'jogadores',uid),{energia_usada_mes:usado+custo});
    return true;
  } catch(err) { toast('Erro ao gastar energia.','ko'); return false; }
}

function fmt(n) {
  if (!n&&n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
