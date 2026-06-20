/**
 * PROCESSOS — Advocatus Online
 * Fluxo: Abrir processo → Peça processual → Ação → Quiz técnico → Resultado
 */

import { collection, addDoc, doc, updateDoc, getDoc, getDocs, query, where }
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

// ── Cargos que podem CONCLUIR (processar sentença) um caso do pool sozinhos.
// Estagiário e Assistente podem trabalhar normalmente até 90% de progresso,
// mas a sentença final exige Júnior+ — alguém com OAB no caso, narrativamente.
const CARGO_IDX_CONCLUSAO_MIN = 2; // jnr

// Progresso máximo que est/ass podem levar um caso do POOL sem supervisão de
// um advogado (Júnior+) no time. Acima disso, o botão de sentença fica travado
// até alguém Júnior+ "assinar" a peça.
const PROGRESSO_MAX_SEM_ADVOGADO = 90;

// ── Limite de NOVOS CASOS QUE O ESCRITÓRIO PODE GERAR PARA O POOL por mês,
// conforme o Tier. Pensado em ~1,4 caso por funcionário potencial (vide
// TIER_CAPACIDADE em vagas.js: T1=2, T2=5, T3=7, T4=10, T5=13 vagas), para
// dar fôlego ao time sem permitir estoque de casos parados.
const LIMITE_POOL_CASOS_MES_TIER = { 1:3, 2:6, 3:9, 4:13, 5:18 };

// Teto de casos do pool ABERTOS SIMULTANEAMENTE (2x o limite mensal). Sem
// isso, mesmo limitando a criação mensal, o pool acumularia casos não
// resolvidos indefinidamente. Trava criação de novos até a fila esvaziar.
const LIMITE_POOL_CASOS_ABERTOS_TIER = { 1:6, 2:12, 3:18, 4:26, 5:36 };

// Custo de energia do DONO para "captar" um caso e colocá-lo no pool do
// escritório. Maior que o mínimo de ação (5⚡) porque é prospecção de
// cliente — uma ação de gestão, não de trabalho técnico no caso em si.
const ENERGIA_CAPTAR_CASO_POOL = 8;

// Prazo do pool: igual ao individual (3 meses), por consistência.
const PRAZO_POOL_MESES = 3;

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

  const cargoIdx       = CARGO_IDX[j.cargo_id] || 0;
  const ehCasoPool     = !!p.pool_escritorio_id;
  const travadoPorCargo = ehCasoPool && prog >= PROGRESSO_MAX_SEM_ADVOGADO && cargoIdx < CARGO_IDX_CONCLUSAO_MIN;
  const avisoCargo = travadoPorCargo
    ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r);padding:.55rem .75rem;margin-bottom:.7rem;font-size:.72rem;color:var(--amber);text-align:center">
        🔒 Caso pronto para sentença, mas requer um Advogado Júnior+ do escritório para assinar e concluir.
       </div>`
    : '';

  abrirModal(`⚖️ ${p.tipo || '—'}`,
    `<div style="background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.75rem;margin-bottom:.85rem">
      <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4);margin-bottom:.25rem">${p.numero || '—'}</div>
      <div style="font-weight:700;font-size:.9rem;color:var(--navy);margin-bottom:.15rem">${p.autor || '—'} <span style="opacity:.4">vs</span> ${p.reu || '—'}</div>
      <div style="font-size:.7rem;color:var(--ouro2)">${p.tribunal || '—'} · ${inst}</div>
      <div style="font-size:.7rem;color:var(--verde2);margin-top:.25rem">${fmt(p.valor)} · ${honInfo}</div>
      ${ehCasoPool ? `<div style="font-size:.65rem;color:var(--navy3);margin-top:.3rem">🏢 Caso colaborativo do escritório${p.escritorio_nome_etiqueta?' — '+p.escritorio_nome_etiqueta:''}</div>` : ''}
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
    ${avisoCargo}
    ${prog >= 100 && !travadoPorCargo
      ? `<button class="btn btn-prim btn-block" onclick="window.processarSentenca('${id}')">⚖️ Processar sentença →</button>`
      : prog >= 100 && travadoPorCargo
      ? `<button class="btn btn-prim btn-block" disabled style="opacity:.5;cursor:not-allowed">⚖️ Aguardando Advogado Júnior+ →</button>`
      : p.recurso_pendente
      ? `<div style="display:flex;flex-direction:column;gap:.4rem">
           <button class="btn btn-prim btn-block" onclick="window.decidirRecurso('${id}',true)">⚠️ Interpor recurso (${cs}% chance)</button>
           <button class="btn btn-ghost btn-block" onclick="window.decidirRecurso('${id}',false)">✋ Não recorrer</button>
         </div>`
      : `<button class="btn btn-prim btn-block" ${energiaDisp === 0 || (travadoPorCargo) ? 'disabled' : ''} onclick="window.iniciarFluxo('${id}')">
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
  const j = window.JOGADOR;

  // Bloqueio adicional: est/ass não podem AVANÇAR caso do pool acima de 90%
  // sem um Júnior+ no time (a ação em si até pode ocorrer, mas a sentença trava).
  // Aqui só registramos a contribuição — o travamento real é na sentença.
  if (p.pool_escritorio_id && j) {
    await _registrarContribuinte(procId, p, j);
  }

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
  const disp  = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - usado);
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
// ════════════════════════════════════════════════════════
// ROTEAMENTO DE HONORÁRIOS — escritório próprio vs pessoal/empregado
// ════════════════════════════════════════════════════════
async function _creditarHonorarios(j, uid, hon) {
  if (j.escritorio_proprio_id) {
    // Tem escritório próprio: honorários entram no CAIXA DO ESCRITÓRIO, não no bolso
    const escSnap = await getDoc(doc(db,'escritorios', j.escritorio_proprio_id));
    if (escSnap.exists()) {
      const esc = escSnap.data();
      await updateDoc(doc(db,'escritorios', j.escritorio_proprio_id), {
        caixa: (esc.caixa||0) + hon,
      });
      return { foiParaCaixa: true };
    }
  }
  // Solo sem escritório formal ou empregado: vai direto pro bolso pessoal
  await updateDoc(doc(db,'jogadores',uid), {
    dinheiro:       (j.dinheiro||0) + hon,
    honorarios_mes: (j.honorarios_mes||0) + hon,
  });
  return { foiParaCaixa: false };
}

window.processarSentenca = async function(procId) {
  const j = window.JOGADOR;
  const cargoIdx = CARGO_IDX[j?.cargo_id] || 0;
  const snapCheck = await getDoc(doc(db, 'processos', procId));
  if (snapCheck.exists()) {
    const pCheck = snapCheck.data();
    const ehPool = !!pCheck.pool_escritorio_id;
    if (ehPool && (pCheck.progresso||0) >= PROGRESSO_MAX_SEM_ADVOGADO && cargoIdx < CARGO_IDX_CONCLUSAO_MIN) {
      toast('🔒 Este caso precisa de um Advogado Júnior+ do escritório para assinar a sentença.', 'ko', 5000);
      return;
    }
  }

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
      wins:                  (j.wins||0) + 1,
      wins_ano:              (j.wins_ano||0) + 1,
      reputacao:             Math.min(cap, rep + ganhoRep),
      xp:                    (j.xp||0) + xpGanho,
      derrotas_consecutivas: 0,
    });
    const { foiParaCaixa } = await _creditarHonorarios(j, uid, hon);
    if (parteRecorre) {
      await updateDoc(doc(db, 'processos', procId), {
        instancia: instancia + 1, progresso: 0, status: 'andamento',
        hon_total_acumulado: (p.hon_total_acumulado||0) + hon,
      });
      const destinoTxt = foiParaCaixa ? ' (no caixa do escritório)' : '';
      _mostrarResultadoSentenca({ resultado:'ganho_continua', hon, msg:`✅ Vitória! +${fmt(hon)} honorários${destinoTxt}. +${ganhoRep} rep. +${xpGanho} XP.\nParte contrária recorreu — caso sobe de instância.` }, procId);
    } else {
      await updateDoc(doc(db, 'processos', procId), {
        status:'ganho', encerrado_mes:mesAtual, hon_total_acumulado:(p.hon_total_acumulado||0)+hon,
      });
      const destinoTxt2 = foiParaCaixa ? ' (no caixa do escritório)' : '';
      _mostrarResultadoSentenca({ resultado:'ganho_definitivo', hon, msg:`🏆 Vitória definitiva! +${fmt(hon)} honorários${destinoTxt2}. +${ganhoRep} rep. +${xpGanho} XP.` }, procId);
    }
  } else {
    const dc = (j.derrotas_consecutivas||0) + 1;
    const demitido = dc >= 5 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo';
    const upds = {
      losses:    (j.losses||0)+1, losses_ano:(j.losses_ano||0)+1,
      reputacao: Math.max(0, rep-perdaRep),
      xp:        (j.xp||0)+xpGanho, derrotas_consecutivas:dc,
    };
    // Demissão por 5 derrotas NÃO se aplica ao dono do próprio escritório
    const isDono = !!j.escritorio_proprio_id;
    if (demitido && !isDono) { upds.escritorio_id='solo'; upds.escritorio_empregado_id=null; upds.escritorio_nome=null; upds.derrotas_consecutivas=0; }
    else if (demitido && isDono) { upds.derrotas_consecutivas=0; } // reseta contagem mas não demite o dono
    await updateDoc(doc(db,'jogadores',uid), upds);

    // Penalizar reputação do escritório próprio também
    if (j.escritorio_proprio_id) {
      try {
        const escSnap = await getDoc(doc(db,'escritorios',j.escritorio_proprio_id));
        if (escSnap.exists()) {
          const escRep = escSnap.data().prestigio || 10;
          await updateDoc(doc(db,'escritorios',j.escritorio_proprio_id), {
            prestigio: Math.max(0, escRep - Math.ceil(perdaRep * 0.5)),
          });
        }
      } catch(e) { console.warn('Penalidade rep escritório:', e); }
    }

    if (p.tipo_processo==='administrativo' && instancia===1) {
      await updateDoc(doc(db,'processos',procId),{instancia:2,progresso:0,tipo_processo:'judicial',status:'andamento'});
      _mostrarResultadoSentenca({resultado:'derrota_admin_recurso_judicial',hon:0,demitido:demitido&&!isDono,msg:`❌ Decisão administrativa desfavorável. -${perdaRep} rep. Pode recorrer judicialmente.`},procId);
    } else if (instancia<4) {
      // Recurso SEMPRE disponível, independente da chance — decisão é do jogador
      await updateDoc(doc(db,'processos',procId),{recurso_pendente:true,progresso:0,status:'andamento'});
      const avisoChance = cs < 70 ? ` ⚠️ Chance de sucesso ${cs}% — abaixo de 70%, recurso arriscado.` : ` Chance de sucesso ${cs}%.`;
      _mostrarResultadoSentenca({resultado:'derrota_pode_recorrer',hon:0,cs,demitido:demitido&&!isDono,msg:`❌ Sentença desfavorável.${avisoChance}\n-${perdaRep} rep. +${xpGanho} XP.`},procId);
    } else {
      await updateDoc(doc(db,'processos',procId),{status:'perdido',encerrado_mes:mesAtual});
      _mostrarResultadoSentenca({resultado:'derrota_definitiva',hon:0,demitido:demitido&&!isDono,msg:`❌ Derrota definitiva — última instância. -${perdaRep} rep. +${xpGanho} XP.`},procId);
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
    await updateDoc(doc(db,'jogadores',uid),{wins:(j.wins||0)+1,wins_ano:(j.wins_ano||0)+1,derrotas_consecutivas:0});
    const { foiParaCaixa } = await _creditarHonorarios(j, uid, hon);
    fecharModal(); toast(`🤝 Acordo! +${fmt(hon)} honorários${foiParaCaixa?' (no caixa do escritório)':''}`,'ok');
  } else {
    toast('❌ Proposta de acordo rejeitada.','ko');
  }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO
// ════════════════════════════════════════════════════════
// Limite de novos processos por mês conforme cargo (quando empregado de escritório).
// Estagiário não gera processo novo — só recebe os distribuídos pelo escritório.
const LIMITE_NOVOS_PROCESSOS_CARGO = {
  est: 0, ass: 1, jnr: 2, pln: 3, snr: 5, asc: 7, soc: 10, snm: 15,
};

window.novoProcesso = async function() {
  const j   = window.JOGADOR;
  if (!j)   return;
  const uid = j.uid||window.JOGADOR_UID;
  const energiaDisp = Math.max(0,(window.getEnergiaTotal?window.getEnergiaTotal(j):100)-(j.energia_usada_mes||0));
  if (j.em_burnout)    { toast('🔴 Em burnout. Descanse antes de novos casos.','ko'); return; }

  // ── DONO de escritório próprio: gera caso para o POOL COLABORATIVO ──
  // Limite independente do limite individual de litigância do dono.
  if (j.escritorio_proprio_id) {
    await window.novoProcessoPool();
    return;
  }

  if (energiaDisp < 5) { toast('⚡ Energia insuficiente para novos casos.','ko'); return; }

  // Se está empregado (não é dono/solo), aplica limite mensal por cargo
  const isEmpregado = j.escritorio_empregado_id && !j.escritorio_proprio_id;
  if (isEmpregado) {
    if (j.cargo_id === 'est') {
      toast('🔒 Estagiários não geram processos novos — você recebe casos distribuídos pelo escritório.', 'ko', 5000);
      return;
    }
    const limite = LIMITE_NOVOS_PROCESSOS_CARGO[j.cargo_id] ?? 1;
    const usados = j.processos_novos_mes || 0;
    if (usados >= limite) {
      toast(`🔒 Limite mensal de novos casos atingido (${usados}/${limite} no seu cargo).`, 'ko', 5000);
      return;
    }
  }

  const proc = _gerarProcesso(j);
  try {
    await addDoc(collection(db,'processos'),proc);
    if (isEmpregado) {
      await updateDoc(doc(db,'jogadores',uid), { processos_novos_mes: (j.processos_novos_mes||0)+1 });
    }
    toast(`📁 Novo caso: ${proc.tipo}`,'ok');
    setTimeout(()=>window.navTo&&window.navTo('processos',null), 400);
  } catch(err) { toast('Erro ao criar processo.','ko'); }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO DO POOL — gerado pelo DONO para o escritório.
// Fica visível e disponível para QUALQUER funcionário real trabalhar,
// de forma colaborativa (vários podem contribuir progresso no mesmo caso).
// Limite mensal por Tier, independente do limite individual do dono como
// advogado. Energia debitada do dono representa o esforço de "captação".
// ════════════════════════════════════════════════════════
window.novoProcessoPool = async function() {
  const j   = window.JOGADOR;
  if (!j || !j.escritorio_proprio_id) return;
  const uid = j.uid || window.JOGADOR_UID;

  if (j.em_burnout) { toast('🔴 Em burnout. Descanse antes de captar novos casos.', 'ko'); return; }

  const energiaDisp = Math.max(0,(window.getEnergiaTotal?window.getEnergiaTotal(j):100)-(j.energia_usada_mes||0));
  if (energiaDisp < ENERGIA_CAPTAR_CASO_POOL) {
    toast(`⚡ Energia insuficiente para captar caso (requer ${ENERGIA_CAPTAR_CASO_POOL}⚡).`, 'ko');
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', j.escritorio_proprio_id));
  if (!escSnap.exists()) { toast('Escritório não encontrado.', 'ko'); return; }
  const esc  = escSnap.data();
  const tier = esc.tier || 1;
  const limiteMes     = LIMITE_POOL_CASOS_MES_TIER[tier]     || LIMITE_POOL_CASOS_MES_TIER[1];
  const limiteAbertos = LIMITE_POOL_CASOS_ABERTOS_TIER[tier] || LIMITE_POOL_CASOS_ABERTOS_TIER[1];

  const usadosMes = esc.pool_casos_criados_mes || 0;
  if (usadosMes >= limiteMes) {
    toast(`🔒 Limite mensal de captação atingido (${usadosMes}/${limiteMes} para Tier ${tier}).`, 'ko', 5000);
    return;
  }

  // Checar teto de casos abertos simultâneos no pool
  const abertosSnap = await getDocs(query(
    collection(db, 'processos'),
    where('pool_escritorio_id', '==', j.escritorio_proprio_id),
    where('status', '==', 'andamento')
  ));
  if (abertosSnap.size >= limiteAbertos) {
    toast(`🔒 Fila do escritório cheia (${abertosSnap.size}/${limiteAbertos} casos abertos). Conclua casos antes de captar novos.`, 'ko', 6000);
    return;
  }

  const proc = _gerarProcesso(j);
  proc.pool_escritorio_id        = j.escritorio_proprio_id;
  proc.escritorio_nome_etiqueta  = esc.nome || j.escritorio_nome || null;
  proc.distribuido_pelo_escritorio = true;
  proc.prazo_limite_mes          = mesTotalPessoalProc(j) + PRAZO_POOL_MESES;
  proc.contribuintes             = []; // [{ uid, nome, progresso_creditado }]
  proc.advogado_uid              = null; // pool: não pertence a ninguém até alguém atuar

  try {
    await addDoc(collection(db, 'processos'), proc);
    await updateDoc(doc(db, 'escritorios', j.escritorio_proprio_id), {
      pool_casos_criados_mes: usadosMes + 1,
    });
    await updateDoc(doc(db, 'jogadores', uid), {
      energia_usada_mes: (j.energia_usada_mes||0) + ENERGIA_CAPTAR_CASO_POOL,
    });
    toast(`📁 Caso captado para o escritório: ${proc.tipo} (${usadosMes+1}/${limiteMes} este mês)`, 'ok', 4000);
    setTimeout(() => window.navTo && window.navTo('processos', null), 400);
  } catch (err) {
    toast('Erro ao captar caso para o escritório.', 'ko');
    console.error(err);
  }
};

function _gerarProcesso(j, distribuidoPeloEscritorio=false) {
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
  const bonusFel = window.getBonusFelicidade ? window.getBonusFelicidade(j) : 0;
  const cs     = Math.max(10,Math.min(90,Math.round(50+(skMed-40)*0.4-nivel*0.5+bonusEsc+bonusFel)));
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
    distribuido_pelo_escritorio: distribuidoPeloEscritorio,
    escritorio_nome_etiqueta: distribuidoPeloEscritorio ? (j.escritorio_nome||null) : null,
    prazo_limite_mes: distribuidoPeloEscritorio ? (mesTotalPessoalProc(j)+3) : null, // 3 meses pra concluir
    status:'andamento', instancia:1, progresso:0, chance_sucesso:cs,
    valor, nivel, hon_total_acumulado:0,
    urgente:Math.random()<0.2, recurso_pendente:false,
    criado_mes:mesG, encerrado_mes:null,
  };
}

// ════════════════════════════════════════════════════════
// LISTAGEM DO POOL — casos colaborativos do escritório, visíveis a
// QUALQUER funcionário real (incluindo o dono) para que decidam trabalhar.
// Chamado pela tela "Meus Processos" (ui-main.js / render de processos).
// ════════════════════════════════════════════════════════
export async function buscarCasosPoolEscritorio(j) {
  const escId = j.escritorio_proprio_id || (j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo' ? j.escritorio_empregado_id : null);
  if (!escId) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'processos'),
      where('pool_escritorio_id', '==', escId),
      where('status', '==', 'andamento')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[POOL] Erro ao buscar casos do pool:', err);
    return [];
  }
}
window.buscarCasosPoolEscritorio = buscarCasosPoolEscritorio;

// Registra que este jogador está atuando no caso do pool (primeira vez que
// ele toca o caso). Usado para ratear a penalidade de deserção depois.
async function _registrarContribuinte(procId, p, j) {
  const uid = j.uid || window.JOGADOR_UID;
  const ja  = (p.contribuintes || []).some(c => c.uid === uid);
  if (ja) return;
  const novos = [...(p.contribuintes || []), { uid, nome: j.nome_personagem || 'Advogado' }];
  await updateDoc(doc(db, 'processos', procId), { contribuintes: novos });
}


async function _gastarEnergia(custo, desc) {
  const j   = window.JOGADOR;
  const uid = j?.uid||window.JOGADOR_UID;
  const usado = j?.energia_usada_mes||0;
  const disp  = Math.max(0,(window.getEnergiaTotal?window.getEnergiaTotal(j):100)-usado);
  if (disp < custo) { toast(`⚡ Energia insuficiente (${disp} restantes, requer ${custo}).`,'ko'); return false; }
  try {
    await updateDoc(doc(db,'jogadores',uid),{energia_usada_mes:usado+custo});
    return true;
  } catch(err) { toast('Erro ao gastar energia.','ko'); return false; }
}

function mesTotalPessoalProc(j) {
  return (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);
}

// ════════════════════════════════════════════════════════
// DISTRIBUIÇÃO MENSAL DE PROCESSOS PELO ESCRITÓRIO
// Gera casos automaticamente para funcionários (estagiário+) conforme
// o porte/tier do escritório, e verifica deserção de prazo (3 meses).
// ════════════════════════════════════════════════════════
export async function processarDistribuicaoProcessosMensal(j) {
  const uid = j.uid || window.JOGADOR_UID;

  // Reset do contador de novos processos do mês (empregados)
  if (j.escritorio_empregado_id && !j.escritorio_proprio_id) {
    await updateDoc(doc(db,'jogadores',uid), { processos_novos_mes: 0 });
  }

  // Reset do contador de captação mensal do pool (dono)
  if (j.escritorio_proprio_id) {
    await updateDoc(doc(db,'escritorios',j.escritorio_proprio_id), { pool_casos_criados_mes: 0 });
  }

  const mesAtualTotal = mesTotalPessoalProc(j);

  // ── Verificar deserção: processos INDIVIDUAIS distribuídos pelo escritório
  // com prazo vencido (mantém comportamento original — penalidade pessoal). ──
  const meusProcsSnap = await getDocs(query(
    collection(db,'processos'),
    where('advogado_uid','==',uid),
    where('status','==','andamento'),
    where('distribuido_pelo_escritorio','==',true)
  ));
  for (const pDoc of meusProcsSnap.docs) {
    const p = pDoc.data();
    if (p.pool_escritorio_id) continue; // casos do pool são tratados abaixo
    if (p.prazo_limite_mes && mesAtualTotal > p.prazo_limite_mes) {
      const perda = Math.max(1, Math.floor((j.reputacao||0)*0.06));
      await updateDoc(doc(db,'processos',pDoc.id), { status:'perdido_desercao', encerrado_mes:mesAtualTotal });
      await updateDoc(doc(db,'jogadores',uid), { reputacao: Math.max(0,(j.reputacao||0)-perda) });
      await addDoc(collection(db,'jogadores',uid,'inbox'), {
        de:'sistema', para_uid:uid,
        assunto:'⚠️ Processo perdido por deserção',
        corpo:`O processo ${p.numero} (${p.tipo}) ultrapassou o prazo de 3 meses sem conclusão e foi perdido. -${perda} reputação.`,
        tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
      });
    }
  }

  // ── Verificar deserção de casos do POOL COLABORATIVO (apenas o DONO roda
  // essa checagem uma vez por mês, para não duplicar entre vários funcionários
  // do mesmo escritório acessando avançar-mês simultaneamente). ──
  if (j.escritorio_proprio_id) {
    const poolSnap = await getDocs(query(
      collection(db,'processos'),
      where('pool_escritorio_id','==',j.escritorio_proprio_id),
      where('status','==','andamento')
    ));
    for (const pDoc of poolSnap.docs) {
      const p = pDoc.data();
      if (!(p.prazo_limite_mes && mesAtualTotal > p.prazo_limite_mes)) continue;

      const progresso     = p.progresso || 0;
      const contribuintes  = p.contribuintes || [];

      if (progresso === 0 || contribuintes.length === 0) {
        // Ninguém tocou o caso — pune o ESCRITÓRIO (prestígio), não pessoas.
        const escSnap = await getDoc(doc(db,'escritorios',j.escritorio_proprio_id));
        const prestigioAtual = escSnap.exists() ? (escSnap.data().prestigio || 10) : 10;
        await updateDoc(doc(db,'escritorios',j.escritorio_proprio_id), {
          prestigio: Math.max(0, prestigioAtual - 3),
        });
        await updateDoc(doc(db,'processos',pDoc.id), { status:'perdido_desercao', encerrado_mes:mesAtualTotal });
        await addDoc(collection(db,'jogadores',uid,'inbox'), {
          de:'sistema', para_uid:uid,
          assunto:'⚠️ Caso do escritório perdido por inatividade',
          corpo:`O caso ${p.numero} (${p.tipo}) ficou ${PRAZO_POOL_MESES} meses no pool sem nenhum funcionário atuar. -3 prestígio do escritório.`,
          tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
        });
      } else {
        // Houve progresso parcial — reputação penalizada e RATEADA entre
        // contribuintes, com fator reduzido (0.6x) por ser responsabilidade
        // compartilhada, não de uma única pessoa.
        const FATOR_RATEIO_POOL = 0.6;
        for (const c of contribuintes) {
          try {
            const cSnap = await getDoc(doc(db,'jogadores',c.uid));
            if (!cSnap.exists()) continue;
            const cData = cSnap.data();
            const repC  = cData.reputacao || 30;
            const perdaBase  = Math.max(1, Math.floor(repC * 0.06));
            const perdaRateada = Math.max(1, Math.round((perdaBase * FATOR_RATEIO_POOL) / contribuintes.length));
            await updateDoc(doc(db,'jogadores',c.uid), { reputacao: Math.max(0, repC - perdaRateada) });
            await addDoc(collection(db,'jogadores',c.uid,'inbox'), {
              de:'sistema', para_uid:c.uid,
              assunto:'⚠️ Caso do escritório perdido por deserção',
              corpo:`O caso colaborativo ${p.numero} (${p.tipo}) ultrapassou o prazo de ${PRAZO_POOL_MESES} meses e foi perdido. -${perdaRateada} reputação (responsabilidade compartilhada entre ${contribuintes.length} contribuinte(s)).`,
              tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
            });
          } catch (e) { console.warn('[POOL] Erro ao ratear deserção:', e); }
        }
        await updateDoc(doc(db,'processos',pDoc.id), { status:'perdido_desercao', encerrado_mes:mesAtualTotal });
      }
    }
  }

  // ── Distribuir novo caso automaticamente se está empregado em escritório próprio de alguém ──
  // (estagiários e demais empregados recebem trabalho mesmo sem poder criar sozinhos)
  if (j.escritorio_empregado_id && !j.escritorio_proprio_id) {
    const escSnap = await getDoc(doc(db,'escritorios',j.escritorio_empregado_id));
    const tier = escSnap.exists() ? (escSnap.data().tier||1) : 1;
    // Chance de receber caso distribuído este mês, escalando com o tier do escritório
    const chanceDistribuicao = Math.min(0.9, 0.4 + tier*0.1);
    if (Math.random() < chanceDistribuicao) {
      const proc = _gerarProcesso(j, true); // true = distribuído pelo escritório
      await addDoc(collection(db,'processos'), proc);
      await addDoc(collection(db,'jogadores',uid,'inbox'), {
        de:'sistema', para_uid:uid,
        assunto:'📁 Novo caso distribuído pelo escritório',
        corpo:`Você recebeu um novo caso: ${proc.tipo}. Prazo para conclusão: 3 meses.`,
        tipo:'sistema', tipo_noticia:'neutro', lida:false, criado_em:new Date().toISOString(),
      });
    }
  }
}
window._processarDistribuicaoProcessosMensal = processarDistribuicaoProcessosMensal;

function fmt(n) {
  if (!n&&n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
