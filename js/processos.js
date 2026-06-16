/**
 * PROCESSOS — Advocatus Online
 * Engine de processos: quiz, sentenças, recursos.
 * Chama Cloud Functions para resultados validados pelo servidor.
 */

import { collection, addDoc, doc, updateDoc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// BANCO DE QUESTÕES (espelho do GDD)
// ════════════════════════════════════════════════════════
const QUIZ = {
  tributario: {
    pesquisa: [
      {q:'Qual é o prazo para oposição de Embargos à Execução Fiscal (LEF art. 16)?',
       opts:['30 dias após a garantia do juízo','15 dias da citação','5 dias da penhora','60 dias'],c:0,
       dica:'LEF art. 16 §1º: 30 dias contados da intimação da penhora ou do depósito.'},
      {q:'A Exceção de Pré-Executividade dispensa qual requisito?',
       opts:['Garantia do juízo','Advogado constituído','Citação','Tempestividade'],c:0,
       dica:'STJ Súmula 393: EPE não exige garantia — cabível para vícios cognoscíveis de ofício.'},
      {q:'O prazo para homologação tácita no lançamento por homologação (CTN art. 150) é:',
       opts:['5 anos do fato gerador','10 anos do pagamento','3 anos da declaração','2 anos'],c:0,
       dica:'CTN art. 150 §4º: 5 anos contados da ocorrência do fato gerador.'},
    ],
    audiencia: [
      {q:'Em audiência de Execução Fiscal, o devedor pode apresentar defesa por meio de:',
       opts:['Embargos à EF com garantia do juízo','Contestação oral','Reconvenção','Exceção dilatória'],c:0,
       dica:'LEF art. 16: apenas por Embargos, que exigem garantia do juízo.'},
      {q:'A penhora online (BACEN-JUD) em EF pode ser determinada:',
       opts:['Sem esgotamento prévio de outras diligências (STJ Tema 1.026)','Só após 3 tentativas frustradas','Com autorização do CGJ','Apenas para débitos >500 SM'],c:0,
       dica:'STJ Tema 1.026: penhora eletrônica não exige tentativas anteriores.'},
    ],
  },
  trabalhista: {
    pesquisa: [
      {q:'O prazo prescricional para reclamação trabalhista após extinção do contrato é:',
       opts:['2 anos, créditos dos últimos 5 anos','5 anos sempre','1 ano do ato lesivo','30 dias'],c:0,
       dica:'CF art. 7º XXIX: 2 anos após a extinção, créditos dos últimos 5 anos.'},
      {q:'Para equiparação salarial (CLT art. 461), a diferença de tempo na função não pode superar:',
       opts:['4 anos','2 anos','1 ano','Sem limite'],c:0,
       dica:'CLT art. 461 §4º (Reforma 2017): diferença de tempo na função ≤ 4 anos.'},
      {q:'Os elementos do vínculo de emprego são:',
       opts:['Pessoalidade, não-eventualidade, onerosidade e subordinação','Exclusividade e jornada fixa','Contrato escrito e CTPS','Registro e subordinação'],c:0,
       dica:'CLT art. 3º: 4 elementos cumulativos — pessoalidade, não-eventualidade, onerosidade e subordinação jurídica.'},
    ],
    audiencia: [
      {q:'Na JT, a audiência trabalhista é:',
       opts:['Una — conciliação, instrução e julgamento em sessão única','Apenas conciliação','Instrução e sentença separadas','Somente depoimentos'],c:0,
       dica:'CLT art. 849: audiência trabalhista é una (ou com continuações).'},
    ],
  },
  civil: {
    pesquisa: [
      {q:'O prazo para contestação no rito ordinário (CPC art. 335) é:',
       opts:['15 dias úteis','10 dias corridos','30 dias úteis','5 dias úteis'],c:0,
       dica:'CPC art. 335: prazo de 15 dias úteis para contestação.'},
      {q:'A prescrição da pretensão de reparação civil extracontratual (CC art. 206 §3º V) é de:',
       opts:['3 anos','10 anos','5 anos','1 ano'],c:0,
       dica:'CC art. 206 §3º V: prescreve em 3 anos a pretensão de reparação civil.'},
      {q:'A tutela de urgência antecipada (CPC art. 300) exige:',
       opts:['Probabilidade do direito e perigo de dano','Certeza do direito','Prova inequívoca','Caução obrigatória'],c:0,
       dica:'CPC art. 300: basta probabilidade (não certeza) + perigo de dano ou risco ao resultado útil.'},
    ],
    audiencia: [
      {q:'A audiência de conciliação e mediação (CPC art. 334) deve ocorrer:',
       opts:['Antes da contestação, no prazo de 20-30 dias da citação','Após a contestação','No início da instrução','Só se as partes concordarem'],c:0,
       dica:'CPC art. 334: designada antes da contestação, 20-30 dias após a citação.'},
    ],
  },
  criminal: {
    pesquisa: [
      {q:'Os vetores do princípio da insignificância (STF HC 84.412) são:',
       opts:['Mínima ofensividade, ausência de periculosidade, reduzido grau de reprovabilidade e inexpressividade da lesão','Valor inferior a 1 SM','Primariedade','Qualquer desses isoladamente'],c:0,
       dica:'STF HC 84.412: 4 vetores cumulativos.'},
      {q:'O flagrante preparado (provocado) gera:',
       opts:['Crime impossível — atipicidade (Súmula 145 STF)','Atenuante da pena','Nulidade relativa','Causa de diminuição'],c:0,
       dica:'Súmula 145 STF: flagrante preparado → crime impossível (CP art. 17).'},
    ],
    audiencia: [
      {q:'A Resposta à Acusação (CPP art. 396-A) deve ser apresentada em:',
       opts:['10 dias após notificação do recebimento da denúncia','5 dias da citação','15 dias úteis','30 dias'],c:0,
       dica:'CPP art. 396-A: prazo de 10 dias da notificação do acusado.'},
    ],
  },
  empresarial: {
    pesquisa: [
      {q:'O prazo para apresentação do plano de recuperação judicial (Lei 11.101/05 art. 53) é:',
       opts:['60 dias do deferimento do processamento','30 dias','90 dias','180 dias'],c:0,
       dica:'Lei 11.101/05 art. 53: prazo improrrogável de 60 dias.'},
      {q:'Para desconsideração da personalidade jurídica (CC art. 50 — teoria maior) é necessário:',
       opts:['Desvio de finalidade OU confusão patrimonial','Apenas insolvência','Encerramento irregular','Qualquer ato ilícito'],c:0,
       dica:'CC art. 50: teoria maior exige desvio de finalidade OU confusão patrimonial.'},
    ],
    audiencia: [
      {q:'A Assembleia Geral de Credores (AGC) na RJ é presidida por:',
       opts:['Administrador judicial','Juiz da recuperação','Maior credor','Devedor'],c:0,
       dica:'Lei 11.101/05 art. 37: a AGC é presidida pelo administrador judicial.'},
    ],
  },
  constitucional: {
    pesquisa: [
      {q:'A reserva de plenário (CF art. 97) exige que a declaração de inconstitucionalidade ocorra por:',
       opts:['Maioria absoluta do pleno ou órgão especial','Maioria simples','Unanimidade','Apenas o relator'],c:0,
       dica:'CF art. 97 + SV 10 STF: maioria absoluta do tribunal pleno ou órgão especial.'},
    ],
    audiencia: [
      {q:'Na sustentação oral no STF, o advogado tem:',
       opts:['15 minutos por parte (prorrogável pelo Presidente)','30 minutos','1 hora','5 minutos'],c:0,
       dica:'RISTF art. 131: 15 minutos por parte.'},
    ],
  },
  ambiental: {
    pesquisa: [
      {q:'A responsabilidade civil por dano ambiental (Lei 6.938/81 art. 14 §1º) é:',
       opts:['Objetiva — basta o nexo causal','Subjetiva com culpa grave','Solidária apenas entre PJs','Limitada ao seguro'],c:0,
       dica:'Lei 6.938/81 art. 14 §1º: responsabilidade objetiva — independe de culpa.'},
    ],
    audiencia: [
      {q:'Na Ação Civil Pública ambiental, o MP pode atuar como:',
       opts:['Autor principal ou fiscal da lei (custos legis)','Apenas interveniente','Réu em omissão','Amicus curiae'],c:0,
       dica:'Lei 7.347/85 art. 5º: MP tem legitimidade ativa; quando não autor, é fiscal obrigatório.'},
    ],
  },
  previdenciario: {
    pesquisa: [
      {q:'A carência para auxílio por incapacidade temporária é de:',
       opts:['12 contribuições (salvo acidente e doenças especiais — carência zero)','24 contribuições','6 meses','Sem carência'],c:0,
       dica:'Lei 8.213/91 arts. 25 e 26: regra 12 meses; exceção carência zero para acidente.'},
      {q:'O JEF (Lei 10.259/01) tem competência para causas até:',
       opts:['60 salários mínimos','40 SM','100 SM','Qualquer valor'],c:0,
       dica:'Lei 10.259/01 art. 3º: competência até 60 SM contra entidades federais.'},
    ],
    audiencia: [
      {q:'O INSS tem prazo para analisar requerimento administrativo de:',
       opts:['45 dias (Lei 8.213/91 art. 41-A)','30 dias','90 dias','Indeterminado'],c:0,
       dica:'Lei 8.213/91 art. 41-A: prazo de 45 dias para análise dos benefícios.'},
    ],
  },
};

// ════════════════════════════════════════════════════════
// ESTADO DO QUIZ
// ════════════════════════════════════════════════════════
let _quizState = null;
let _procAtivo = null;

// ════════════════════════════════════════════════════════
// ABRIR PROCESSO (modal de ações)
// ════════════════════════════════════════════════════════
window.abrirProcesso = async function(processoId) {
  try {
    const snap = await getDoc(doc(db, 'processos', processoId));
    if (!snap.exists()) { toast('Processo não encontrado.','ko'); return; }
    const p = snap.data();
    _procAtivo = { id: processoId, ...p };
    _renderModalProcesso(processoId, p);
  } catch (err) { toast('Erro ao abrir processo.','ko'); }
};

function _renderModalProcesso(id, p) {
  const j          = window.JOGADOR;
  const cs         = p.chance_sucesso || 50;
  const prog       = p.progresso || 0;
  const csColor    = cs>=70?'var(--verde3)':cs>=40?'#ffa726':'var(--verm3)';
  const inst       = ['','1ª Instância','2ª Instância','STJ','STF'][p.instancia||1]||'1ª Inst.';
  const isSolo     = j.escritorio_id === 'solo';
  const cargoId    = j.cargo_id;

  // Verificar energia disponível
  const energiaUsada = j.energia_usada_mes || 0;
  const energiaDisp  = Math.max(0, 100 - energiaUsada);
  const semEnergia   = energiaDisp === 0;
  const podeAud20    = energiaDisp >= 20 && ['jnr','pln','snr','asc','soc','snm',
    'jsub','jtit','dsb','mstj','padj','prom','pjus','pgj','dadj','def','dch','dge'].includes(cargoId);
  const podePesq10   = energiaDisp >= 10;
  const podeAcordo   = energiaDisp >= 5;

  const honInfo = isSolo
    ? `Solo: 30% causa + ${[,'10%','10%','5%','5%'][p.instancia||1]} sucumbência`
    : `Escritório: 10% da sucumbência desta instância`;

  // Aviso de energia zero
  const avisoEnergia = semEnergia
    ? `<div style="background:rgba(122,32,32,.15);border:1px solid rgba(200,80,80,.35);border-radius:2px;padding:.6rem;margin-bottom:.7rem;font-size:.75rem;color:var(--verm3);text-align:center">
        ⚡ Energia esgotada — avance o mês para continuar
       </div>`
    : energiaDisp <= 20
    ? `<div style="background:rgba(184,146,42,.08);border:var(--borda);border-radius:2px;padding:.5rem;margin-bottom:.7rem;font-size:.72rem;color:var(--ouro2);text-align:center">
        ⚡ ${energiaDisp} energia restante — mês pronto para avançar
       </div>`
    : `<div style="font-size:.68rem;color:var(--ardosia2);text-align:right;margin-bottom:.5rem">⚡ ${energiaDisp} energia disponível</div>`;

  abrirModal(
    `⚖️ ${p.tipo||'—'}`,
    `<div style="background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.75rem;margin-bottom:.8rem">
      <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--ardosia);margin-bottom:.3rem">${p.numero||'—'}</div>
      <div style="font-weight:600;font-size:.88rem;margin-bottom:.15rem">${p.autor||'—'} vs ${p.reu||'—'}</div>
      <div style="font-size:.72rem;color:var(--ouro2)">${p.tribunal||'—'} · ${inst}</div>
      <div style="font-size:.7rem;color:var(--verde3);margin-top:.3rem">Valor: ${fmt(p.valor)} · ${honInfo}</div>
    </div>

    <div style="margin-bottom:.8rem">
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--ardosia2);margin-bottom:.25rem">
        <span>Progresso do caso</span><span style="color:var(--ouro2)">${prog}%</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin-bottom:.4rem">
        <div style="height:100%;width:${prog}%;background:linear-gradient(90deg,var(--ouro3),var(--ouro))"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--ardosia2)">
        <span>⚖️ Chance de vitória</span>
        <span style="font-weight:700;color:${csColor}">${cs}%</span>
      </div>
      <div style="height:5px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin-top:.2rem">
        <div style="height:100%;width:${cs}%;background:${csColor}"></div>
      </div>
    </div>

    ${avisoEnergia}

    <div style="display:flex;flex-direction:column;gap:.4rem">
      <button class="btn btn-sec btn-block" onclick="window.iniciarQuiz('${id}','audiencia')"
        ${!podeAud20?'disabled':''} style="${!podeAud20?'opacity:.35;cursor:not-allowed':''}">
        🏛️ Realizar audiência
        <span style="font-size:.68rem;opacity:.7;margin-left:.4rem">(-20 ⚡)</span>
        ${!['jnr','pln','snr','asc','soc','snm','jsub','jtit','dsb','mstj','padj','prom','pjus','pgj','dadj','def','dch','dge'].includes(cargoId)
          ? '<span style="font-size:.65rem;color:var(--verm3);margin-left:.5rem">🔒 Júnior+</span>'
          : !podeAud20 ? '<span style="font-size:.65rem;color:var(--verm3);margin-left:.5rem">🔒 Sem energia</span>' : ''}
      </button>
      <button class="btn btn-sec btn-block" onclick="window.iniciarQuiz('${id}','pesquisa')"
        ${!podePesq10?'disabled':''} style="${!podePesq10?'opacity:.35;cursor:not-allowed':''}">
        🔬 Pesquisa jurídica
        <span style="font-size:.68rem;opacity:.7;margin-left:.4rem">(-10 ⚡)</span>
        ${!podePesq10?'<span style="font-size:.65rem;color:var(--verm3);margin-left:.5rem">🔒 Sem energia</span>':''}
      </button>
      <button class="btn btn-ghost btn-block" onclick="window.tentarAcordo('${id}')"
        ${!podeAcordo?'disabled':''} style="${!podeAcordo?'opacity:.35;cursor:not-allowed':''}">
        🤝 Propor acordo
        <span style="font-size:.68rem;opacity:.7;margin-left:.4rem">(-5 ⚡)</span>
        ${!podeAcordo?'<span style="font-size:.65rem;color:var(--verm3);margin-left:.5rem">🔒 Sem energia</span>':''}
      </button>
      ${p.recurso_pendente ? `
      <button class="btn btn-sec btn-block" style="border-color:${cs>=70?'#ffa726':'rgba(255,255,255,.15)'}"
        onclick="window.decidirRecurso('${id}',true)">
        ⚠️ Interpor recurso <span style="font-size:.68rem;opacity:.7">${cs}% de chance</span>
      </button>
      <button class="btn btn-ghost btn-block" onclick="window.decidirRecurso('${id}',false)">
        ✋ Não recorrer — encerrar caso
      </button>` : ''}
    </div>`
  );
}

// ════════════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════════════
window.iniciarQuiz = async function(procId, acao) {
  const custo = acao === 'audiencia' ? 20 : 10;
  const ok = await window.gastarEnergia(custo, acao === 'audiencia' ? 'Audiência' : 'Pesquisa');
  if (!ok) return;
  const j   = window.JOGADOR;
  const esp = j?.especialidade || 'civil';
  const banco = QUIZ[esp]?.[acao] || QUIZ.civil?.[acao] || QUIZ.civil.pesquisa;
  const pergs = [...banco].sort(() => Math.random() - .5).slice(0, 3);

  _quizState = { procId, acao, pergs, qi: 0, acertos: 0 };
  _renderQuizQ();
};

function _renderQuizQ() {
  const { pergs, qi, acao } = _quizState;
  const q     = pergs[qi];
  const label = acao === 'audiencia' ? '🏛️ Audiência' : '🔬 Pesquisa';

  abrirModal(
    `${label} — Questão ${qi+1} de ${pergs.length}`,
    `<div class="quiz-wrap">
      <div class="quiz-header">${label} · ${qi+1}/${pergs.length}</div>
      <div class="quiz-prog-bar"><div class="quiz-prog-fill" style="width:${qi/pergs.length*100}%"></div></div>
      <div class="quiz-questao">${q.q}</div>
      <div class="quiz-opts">
        ${q.opts.map((o,i) =>
          `<button class="quiz-opt" onclick="window.responderQuiz(${i})">${o}</button>`
        ).join('')}
      </div>
    </div>`
  );
}

window.responderQuiz = function(idx) {
  const { pergs, qi, acao } = _quizState;
  const q     = pergs[qi];
  const certo = idx === q.c;
  if (certo) _quizState.acertos++;

  // Feedback visual
  const opts = document.querySelectorAll('.quiz-opt');
  opts.forEach((b, i) => {
    b.disabled = true;
    if (i === q.c)           b.classList.add('certo');
    if (i === idx && !certo) b.classList.add('errado');
  });

  const dica = document.createElement('div');
  dica.className = 'quiz-dica';
  dica.innerHTML = `${certo ? '✅ Correto!' : '❌ Incorreto.'} <b>📖 ${q.dica}</b>`;
  document.querySelector('.quiz-wrap').appendChild(dica);

  const btn = document.createElement('button');
  btn.className = 'btn btn-sec btn-block';
  btn.style.marginTop = '.6rem';
  const last = qi === pergs.length - 1;
  btn.textContent = last ? 'Ver resultado →' : 'Próxima →';
  btn.onclick = last
    ? () => _finalizarQuiz()
    : () => { _quizState.qi++; _renderQuizQ(); };
  document.querySelector('.quiz-wrap').appendChild(btn);
};

async function _finalizarQuiz() {
  const { procId, acao, acertos, pergs } = _quizState;
  const j = window.JOGADOR;
  if (!j) return;

  const total   = pergs.length;
  const impactoProgresso = acao==='audiencia'
    ? [5,12,22,28][acertos]
    : [3, 8,15,20][acertos];
  const impactoChance = acao==='audiencia'
    ? [-5,-1,4,8][acertos]
    : [-3, 0,3,6][acertos];
  const impactoSk = acao==='audiencia' ? 'oratoria' : 'pesquisa';
  const energiaCusto = acao==='audiencia' ? 20 : 10;

  // Buscar processo atual
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) { toast('Processo não encontrado.','ko'); fecharModal(); return; }
  const p = snap.data();

  const novoProgresso = Math.min(100, (p.progresso||0) + impactoProgresso);
  const novaChance    = Math.max(5, Math.min(95, (p.chance_sucesso||50) + impactoChance));
  const novaEnergia   = Math.max(0, (j.energia||100) - energiaCusto);

  // Skill boost
  const cap      = window.REP_CAP[j.cargo_id] || 55;
  const skAtual  = (j.skills||{})[impactoSk] || 0;
  const novaSk   = Math.min(cap, skAtual + (acertos >= 2 ? 2 : 1));

  // Atualizar processo
  await updateDoc(doc(db, 'processos', procId), {
    progresso:     novoProgresso,
    chance_sucesso:novaChance,
  });

  // Atualizar jogador
  await updateDoc(doc(db, 'jogadores', j.uid), {
    energia:              novaEnergia,
    energia_usada_mes:    (j.energia_usada_mes||0) + energiaCusto,
    [`skills.${impactoSk}`]: novaSk,
  });

  const cor  = acertos===3?'var(--verde3)':acertos===2?'var(--ouro2)':acertos===1?'#ffa726':'var(--verm3)';
  const msg  = acertos===3?'Desempenho excelente!':acertos===2?'Bom desempenho.':acertos===1?'Desempenho mediano.':'Desempenho fraco.';

  abrirModal('Resultado do Quiz', `
    <div style="text-align:center;padding:1rem">
      <div style="font-size:2rem">${acertos===3?'🏆':acertos===2?'👍':acertos===1?'😐':'😔'}</div>
      <div style="font-size:1.5rem;font-weight:700;color:${cor};margin:.3rem 0">${acertos}/${total} corretas</div>
      <div style="font-size:.8rem;color:var(--ardosia2);margin-bottom:.8rem">${msg}</div>
      <div style="font-size:.75rem;color:var(--perg2);line-height:2">
        Progresso: <b style="color:var(--ouro2)">${novoProgresso}%</b><br>
        Chance de vitória: <b style="color:${cor}">${novaChance}%</b><br>
        Energia gasta: <b>-${energiaCusto}</b> (restam ${novaEnergia})
      </div>
    </div>
    ${novoProgresso >= 100
      ? `<div style="background:rgba(184,146,42,.1);border:var(--borda);border-radius:2px;padding:.75rem;text-align:center;margin-top:.5rem">
          ⚖️ <b>Progresso completo!</b> Clique abaixo para processar a sentença.
        </div>
        <button class="btn btn-prim btn-block" style="margin-top:.8rem" onclick="window.processarSentenca('${procId}')">
          Processar sentença →
        </button>`
      : `<button class="btn btn-sec btn-block" style="margin-top:.8rem" onclick="window.abrirProcesso('${procId}')">
          Continuar caso
        </button>`}
  `);
}

// ════════════════════════════════════════════════════════
// SENTENÇA (Cloud Function)
// ════════════════════════════════════════════════════════
window.processarSentenca = async function(procId) {
  try {
    toast('⏳ Processando sentença...', 'neutro', 2000);
    fecharModal();

    const fn       = httpsCallable(window.FB_FUNCTIONS, 'processarSentenca');
    const result   = await fn({ processo_id: procId });
    const r        = result.data;

    const iconMap  = {
      ganho_definitivo:        '🏆',
      ganho_continua:          '✅',
      ganho_encerrado_cargo:   '⚠️',
      derrota_admin_recurso_judicial: '📋',
      derrota_pode_recorrer:   '❌',
      derrota_definitiva:      '❌',
    };

    abrirModal(
      `${iconMap[r.resultado]||'⚖️'} Sentença`,
      `<div style="font-size:.85rem;color:var(--perg2);line-height:1.7;margin-bottom:1rem">${r.msg}</div>
      ${r.hon > 0 ? `<div style="font-size:.9rem;color:var(--verde3);font-weight:600">💰 Honorários recebidos: ${fmt(r.hon)}</div>` : ''}
      ${r.demitido ? `<div style="font-size:.8rem;color:var(--verm3);margin-top:.5rem">⚠️ Você foi desligado do escritório por 5 derrotas consecutivas.</div>` : ''}
      ${r.resultado === 'ganho_continua' ? `<button class="btn btn-sec btn-block" style="margin-top:.8rem" onclick="window.abrirProcesso('${procId}')">Ver processo →</button>` : ''}
      ${r.resultado === 'derrota_pode_recorrer' ? `
        <div style="display:flex;gap:.5rem;margin-top:.8rem">
          <button class="btn btn-sec" style="flex:1" onclick="window.decidirRecurso('${procId}',true)">Interpor recurso</button>
          <button class="btn btn-ghost" style="flex:1" onclick="window.decidirRecurso('${procId}',false)">Não recorrer</button>
        </div>` : ''}`
    );
  } catch (err) {
    toast(`Erro na sentença: ${err.message}`, 'ko');
    console.error('[PROCESSOS] Sentença:', err);
  }
};

// ════════════════════════════════════════════════════════
// RECURSO
// ════════════════════════════════════════════════════════
window.decidirRecurso = async function(procId, interpor) {
  if (!interpor) {
    if (!confirm('Confirma: encerrar o caso sem interpor recurso?')) return;
    await updateDoc(doc(db, 'processos', procId), {
      status:       'perdido',
      encerrado_mes: window.SERVER?.mes_global || 0,
    });
    fecharModal();
    toast('Caso encerrado sem recurso.', 'neutro');
    return;
  }

  // Interpor recurso: avançar instância
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) return;
  const p = snap.data();

  const novaInst = (p.instancia||1) + 1;
  const RECURSO  = {
    tributario:    {2:'Apelação/Remessa',3:'REsp (STJ)',4:'RE (STF)'},
    trabalhista:   {2:'Recurso Ordinário',3:'Recurso de Revista',4:'RE (STF)'},
    civil:         {2:'Apelação (TJRJ)',3:'REsp (STJ)',4:'RE (STF)'},
    criminal:      {2:'Apelação Criminal',3:'REsp (STJ)',4:'RE (STF)'},
    empresarial:   {2:'Apelação (TJRJ)',3:'REsp (STJ)',4:'RE (STF)'},
    constitucional:{2:'ROC',3:'Emb. Divergência',4:'RE (STF)'},
    ambiental:     {2:'Apelação',3:'REsp (STJ)',4:'RE (STF)'},
    previdenciario:{2:'Rec. Inominado (TNU)',3:'REsp (STJ)',4:'RE (STF)'},
  };
  const esp      = window.JOGADOR?.especialidade || 'civil';
  const recLabel = RECURSO[esp]?.[novaInst] || `${novaInst}ª Instância`;

  await updateDoc(doc(db, 'processos', procId), {
    instancia:       novaInst,
    progresso:       0,
    recurso_pendente:false,
    status:          'andamento',
  });

  fecharModal();
  toast(`📋 ${recLabel} interposto!`, 'ok');
};

// ════════════════════════════════════════════════════════
// ACORDO
// ════════════════════════════════════════════════════════
window.tentarAcordo = async function(procId) {
  const ok = await window.gastarEnergia(5, 'Tentativa de acordo');
  if (!ok) return;
  const j    = window.JOGADOR;
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) return;
  const p = snap.data();

  const cs       = p.chance_sucesso || 50;
  const aceito   = Math.random() < (cs/120 + 0.25);
  const isSolo   = j.escritorio_id === 'solo';

  if (aceito) {
    // Honorários de acordo: 50% do que seria numa vitória
    const pct  = {1:0.10,2:0.10,3:0.05,4:0.05}[p.instancia||1]||0.10;
    const suc  = Math.floor(p.valor * pct);
    const hon  = isSolo
      ? Math.floor((p.instancia===1 ? p.valor*0.30 : 0) + suc) / 2
      : Math.floor(suc * 0.10 / 2);

    await updateDoc(doc(db, 'processos', procId), {
      status:       'ganho',
      encerrado_mes: window.SERVER?.mes_global || 0,
      hon_total_acumulado: hon,
    });
    await updateDoc(doc(db, 'jogadores', j.uid), {
      dinheiro:   (j.dinheiro||0) + hon,
      wins:       (j.wins||0) + 1,
      wins_ano:   (j.wins_ano||0) + 1,
      derrotas_consecutivas: 0,
    });
    fecharModal();
    toast(`🤝 Acordo fechado! +${fmt(hon)} honorários`, 'ok');
  } else {
    toast('❌ Proposta de acordo rejeitada. Continue litigando.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO
// ════════════════════════════════════════════════════════
window.novoProcesso = async function() {
  const j = window.JOGADOR;
  if (!j) return;

  // Verificar energia
  const energia = Math.max(0, (j.energia||100) - (j.energia_usada_mes||0));
  if (energia < 10) {
    toast('Energia insuficiente para novos casos este mês.', 'ko');
    return;
  }
  // Verificar burnout
  if (j.em_burnout) {
    toast('🔴 Você está em burnout. Descanse antes de assumir novos casos.', 'ko');
    return;
  }

  const proc = _gerarProcesso(j);
  try {
    await addDoc(collection(db, 'processos'), proc);
    toast(`📁 Novo caso: ${proc.tipo}`, 'ok');
  } catch (err) {
    toast('Erro ao criar processo.', 'ko');
    console.error(err);
  }
};

function _gerarProcesso(j) {
  const esp    = j.especialidade || 'civil';
  const s      = window.SERVER || {};
  const mesG   = s.mes_global || 1;
  const cargoId = j.cargo_id;

  // Valor por cargo
  const RANGES = {
    est:{min:1000,max:10000,dniv:1}, ass:{min:1000,max:10000,dniv:1},
    jnr:{min:2500,max:20000,dniv:1},
    pln:{min:20000,max:150000,dniv:11},
    snr:{min:150000,max:500000,dniv:21},
    asc:{min:200000,max:10000000,dniv:21},
    soc:{min:250000,max:10000000,dniv:21},
    snm:{min:500000,max:100000000,dniv:21},
  };
  const range = RANGES[cargoId] || RANGES.jnr;
  const valor = range.min + Math.floor(Math.random() * (range.max - range.min));
  const nivel = range.dniv + Math.floor(Math.random() * 10);

  // Chance de sucesso base
  const sk     = j.skills || {};
  const skMed  = ((sk.argumentacao||15)+(sk.oratoria||15)+(sk.pesquisa||18))/3;
  const cs     = Math.max(10, Math.min(90, Math.round(50 + (skMed-40)*0.4 - nivel*0.5)));

  // Tipos de caso por especialidade
  const TIPOS = {
    tributario:   ['Execução Fiscal','Repetição de Indébito','Mandado de Segurança Tributário','Embargos à Execução'],
    trabalhista:  ['Reclamação Trabalhista','Ação de Indenização por Acidente de Trabalho','Ação de Equiparação Salarial'],
    civil:        ['Ação de Indenização','Ação Revisional','Ação de Cobrança','Ação de Despejo'],
    criminal:     ['Defesa Criminal','Habeas Corpus','Recurso em Sentido Estrito','Apelação Criminal'],
    empresarial:  ['Recuperação Judicial','Ação de Dissolução','Due Diligence Judicial','Arbitragem'],
    constitucional:['Mandado de Segurança','Ação Popular','ADPF Estadual','Recurso Constitucional'],
    ambiental:    ['Defesa Autuação IBAMA','Ação Civil Pública Ambiental','Licenciamento Judicial','ACP'],
    previdenciario:['Concessão de Benefício','Revisão de Aposentadoria','Recurso ao CRPS','Ação contra INSS'],
  };
  const AUTORES = ['João Silva ME','Empresa Beta Ltda','Maria Oliveira','Carlos Santos','Família Andrade','Cooperativa Verde'];
  const REUS    = ['Receita Federal','INSS','Estado do RJ','Município do Rio','Empresa Alfa S/A','Construtora Delta'];
  const TRIBUNAIS = {
    tributario:['TRF-2','CARF','TJRJ','Câmara do 1º CCE'],
    trabalhista:['TRT-1','Vara do Trabalho','JT Rio'],
    civil:['TJRJ','JEF','Vara Cível','Câmara Cível'],
    criminal:['Vara Criminal','TJRJ','STJ'],
    empresarial:['TJRJ','Câmara Empresarial','Vara Empresarial'],
    constitucional:['TJRJ','STJ','STF'],
    ambiental:['TRF-2','TJRJ','JF'],
    previdenciario:['JEF','TRF-2','TNU','TJRJ'],
  };

  const tipos  = TIPOS[esp]    || TIPOS.civil;
  const tribs  = TRIBUNAIS[esp] || TRIBUNAIS.civil;
  const num    = `${String(Math.floor(Math.random()*9999999)).padStart(7,'0')}-${String(Math.floor(Math.random()*99)).padStart(2,'0')}.${s.ano_jogo||1}.8.19.0001`;

  return {
    numero:        num,
    tipo:          tipos[Math.floor(Math.random()*tipos.length)],
    area:          esp,
    tipo_processo: Math.random()<0.25 ? 'administrativo' : 'judicial',
    reu_eh_estado: Math.random()<0.5,
    autor:         AUTORES[Math.floor(Math.random()*AUTORES.length)],
    reu:           REUS[Math.floor(Math.random()*REUS.length)],
    tribunal:      tribs[Math.floor(Math.random()*tribs.length)],
    advogado_uid:  j.uid,
    escritorio_id: j.escritorio_id || null,
    status:        'andamento',
    instancia:     1,
    fase:          '1ª Instância',
    progresso:     0,
    chance_sucesso:cs,
    valor,
    nivel,
    hon_total_acumulado: 0,
    urgente:       Math.random() < 0.2,
    recurso_pendente: false,
    criado_mes:    mesG,
    encerrado_mes: null,
  };
}

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
