/**
 * CARREIRA — Advocatus Online
 * Progressão, OAB, concurso público, cursos, contratação de equipe.
 */

import { doc, updateDoc, collection, addDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// CARGOS
// ════════════════════════════════════════════════════════
const CARGOS = [
  {id:'est', l:'Estagiário',         xp:0,    sal_min:1700,  sal_max:1700,  anos:0, oab:false, desc:'Início da jornada.', rep_min:0,  rep_max:20},
  {id:'ass', l:'Assistente Jurídico',xp:120,  sal_min:2500,  sal_max:3500,  anos:0, oab:false, desc:'Minutas e pesquisa.', rep_min:5,  rep_max:35},
  {id:'_oab',l:'→ Prova da OAB',    xp:260,  sal_min:2500,  sal_max:3500,  anos:0, oab:true,  desc:'Aprovação obrigatória.', rep_min:15, rep_max:35},
  {id:'jnr', l:'Advogado Júnior',   xp:260,  sal_min:3500,  sal_max:6650,  anos:0, oab:true,  desc:'Casos simples (nível 1-10).', rep_min:25, rep_max:45},
  {id:'pln', l:'Advogado Pleno',    xp:580,  sal_min:5750,  sal_max:11100, anos:2, oab:true,  desc:'Casos complexos (nível 11-20).', rep_min:35, rep_max:55},
  {id:'snr', l:'Advogado Sênior',   xp:1100, sal_min:10600, sal_max:20000, anos:4, oab:true,  desc:'Autonomia total (nível 21-50).', rep_min:45, rep_max:65},
  {id:'asc', l:'Associado',         xp:1800, sal_min:20000, sal_max:35000, anos:6, oab:true,  desc:'Decisões estratégicas.', rep_min:60, rep_max:80},
  {id:'soc', l:'Sócio',            xp:2800, sal_min:35000, sal_max:65000, anos:8, oab:true,  desc:'Cotista. Participa dos lucros.', rep_min:72, rep_max:100},
  {id:'snm', l:'Sócio Nominal',    xp:4500, sal_min:65000, sal_max:120000,anos:12,oab:true,  desc:'O escritório leva seu nome.', rep_min:85, rep_max:100},
];

const CARGO_IDX = Object.fromEntries(CARGOS.map((c,i)=>[c.id,i]));

// ════════════════════════════════════════════════════════
// CURSOS
// ════════════════════════════════════════════════════════
const CURSOS = [
  {id:'arb',  n:'Curso de Arbitragem',         i:'⚖️', sem:6,  c:15000, sk:'negociacao',  b:25, sk2:'persuasao',    b2:15, req:'jnr'},
  {id:'mba',  n:'MBA Compliance Corporativo',  i:'🏛️', sem:16, c:55000, sk:'gestao',      b:30, sk2:'networking',   b2:10, req:'pln'},
  {id:'llm',  n:'LLM Direito Tributário',      i:'📜', sem:12, c:40000, sk:'pesquisa',    b:30, sk2:'argumentacao', b2:15, req:'jnr'},
  {id:'int',  n:'Tributação Internacional',    i:'🌍', sem:8,  c:22000, sk:'pesquisa',    b:20, sk2:'negociacao',   b2:10, req:'pln'},
  {id:'lit',  n:'Litigância Estratégica',      i:'⚔️', sem:4,  c:10000, sk:'oratoria',   b:22, sk2:'persuasao',    b2:18, req:'ass'},
  {id:'crf',  n:'Especialização CARF/TRF',     i:'🔬', sem:10, c:30000, sk:'argumentacao',b:25, sk2:'pesquisa',    b2:15, req:'snr'},
  {id:'ges',  n:'MBA Gestão de Escritório',    i:'📊', sem:12, c:35000, sk:'gestao',      b:30, sk2:'networking',   b2:12, req:'pln'},
  {id:'esc',  n:'Escrita Jurídica Avançada',   i:'✍️', sem:5,  c:8000,  sk:'escrita',     b:25, sk2:'argumentacao', b2:10, req:'ass'},
  {id:'juri', n:'Tribunal do Júri — Plenário', i:'🎭', sem:3,  c:6000,  sk:'oratoria',   b:20, sk2:'persuasao',    b2:20, req:'jnr'},
];

const SK_LABEL = {
  oratoria:'Oratória', argumentacao:'Argumentação', escrita:'Escrita Jurídica',
  pesquisa:'Pesquisa/Leg.', negociacao:'Negociação', persuasao:'Persuasão',
  gestao:'Gestão', networking:'Networking',
};

// ════════════════════════════════════════════════════════
// CANDIDATOS POR ESPECIALIDADE
// ════════════════════════════════════════════════════════
const CANDIDATOS = {
  tributario: [
    {n:'Ana Paula Drummond', fac:'PUC-Rio',      sk_dest:'pesquisa',    nota:8.2, av:'👩‍💼', desc:'Ex-monitora de Tributário. Excelente em pesquisa legislativa.'},
    {n:'Bruno Cavalcante',   fac:'UERJ',          sk_dest:'argumentacao',nota:7.5, av:'👨‍💼', desc:'Participou de grupo de pesquisa no CARF.'},
    {n:'Camila Rocha',       fac:'FGV Direito',   sk_dest:'escrita',     nota:8.8, av:'👩‍💼', desc:'Prêmio de melhor artigo tributário da FGV.'},
    {n:'Diego Fontes',       fac:'UFF',            sk_dest:'negociacao',  nota:7.0, av:'👨‍💼', desc:'Trabalhou em consultoria tributária.'},
    {n:'Elena Souza',        fac:'IBMEC',          sk_dest:'pesquisa',    nota:7.8, av:'👩‍💼', desc:'Especialista em LC 214/2025 (reforma tributária).'},
  ],
  trabalhista: [
    {n:'Felipe Neri',        fac:'UERJ',           sk_dest:'oratoria',    nota:8.0, av:'👨‍💼', desc:'Simula audiências trabalhistas há 2 anos.'},
    {n:'Gabriela Lima',      fac:'PUC-Rio',        sk_dest:'escrita',     nota:8.5, av:'👩‍💼', desc:'Estagiou na OAB/RJ. Peças trabalhistas excelentes.'},
    {n:'Henrique Costa',     fac:'UFRJ',           sk_dest:'pesquisa',    nota:7.3, av:'👨‍💼', desc:'Pesquisador em flexibilização trabalhista.'},
    {n:'Isadora Mendes',     fac:'FGV Direito',    sk_dest:'argumentacao',nota:8.1, av:'👩‍💼', desc:'Participou de audiências de custódia na DPE.'},
    {n:'João Victor Pinto',  fac:'UCB',            sk_dest:'negociacao',  nota:6.9, av:'👨‍💼', desc:'Bom em sessões de mediação trabalhista.'},
  ],
  civil: [
    {n:'Karla Duarte',       fac:'UERJ',           sk_dest:'escrita',     nota:8.4, av:'👩‍💼', desc:'Destaque em prática forense cível.'},
    {n:'Lucas Amaral',       fac:'PUC-Rio',        sk_dest:'pesquisa',    nota:7.6, av:'👨‍💼', desc:'Monitoria em Direito Civil. Bom domínio do CC/CPC.'},
    {n:'Mariana Borges',     fac:'IBMEC',          sk_dest:'negociacao',  nota:7.9, av:'👩‍💼', desc:'Participou de mediação no CEJUSC.'},
    {n:'Natan Freire',       fac:'UFF',            sk_dest:'oratoria',    nota:7.2, av:'👨‍💼', desc:'Membro do Núcleo de Prática Jurídica.'},
    {n:'Olivia Castro',      fac:'UFRJ',           sk_dest:'argumentacao',nota:8.0, av:'👩‍💼', desc:'Pesquisa em responsabilidade civil.'},
  ],
  criminal: [
    {n:'Paulo Mendes',       fac:'UERJ',           sk_dest:'oratoria',    nota:8.3, av:'👨‍💼', desc:'Ganhou 3 edições do Júri Simulado.'},
    {n:'Queila Santos',      fac:'PUC-Rio',        sk_dest:'argumentacao',nota:7.7, av:'👩‍💼', desc:'Extensão na DPE em casos criminais.'},
    {n:'Rafael Torres',      fac:'UFRJ',           sk_dest:'pesquisa',    nota:7.5, av:'👨‍💼', desc:'Focado em direito penal econômico.'},
    {n:'Sabrina Viana',      fac:'UCB',            sk_dest:'persuasao',   nota:8.1, av:'👩‍💼', desc:'Grupo de direitos fundamentais. Muito persuasiva.'},
    {n:'Thiago Barros',      fac:'IBMEC',          sk_dest:'negociacao',  nota:7.0, av:'👨‍💼', desc:'Estágio em delegacia especializada.'},
  ],
  empresarial: [
    {n:'Ursula Faria',       fac:'FGV Direito',    sk_dest:'negociacao',  nota:8.6, av:'👩‍💼', desc:'Destaque em M&A no escritório escola da FGV.'},
    {n:'Vitor Lemos',        fac:'PUC-Rio',        sk_dest:'escrita',     nota:8.2, av:'👨‍💼', desc:'Especializado em contratos empresariais.'},
    {n:'Wesley Cunha',       fac:'IBMEC',          sk_dest:'pesquisa',    nota:7.4, av:'👨‍💼', desc:'Pesquisa em recuperação judicial.'},
    {n:'Ximena Prado',       fac:'UERJ',           sk_dest:'argumentacao',nota:7.8, av:'👩‍💼', desc:'Participou de arbitragem simulada da CCI.'},
    {n:'Yara Moura',         fac:'UFF',            sk_dest:'gestao',      nota:7.1, av:'👩‍💼', desc:'Administração e Direito. Ótima gestão de prazos.'},
  ],
  previdenciario: [
    {n:'Zeno Albuquerque',   fac:'UFRJ',           sk_dest:'pesquisa',    nota:7.9, av:'👨‍💼', desc:'Pesquisa em benefícios previdenciários rurais.'},
    {n:'Alice Pereira',      fac:'UCB',            sk_dest:'escrita',     nota:7.5, av:'👩‍💼', desc:'Peças bem fundamentadas em causas do JEF.'},
    {n:'Bento Ferraz',       fac:'UFF',            sk_dest:'oratoria',    nota:7.2, av:'👨‍💼', desc:'Participou de audiências no JEF.'},
    {n:'Célia Nunes',        fac:'IBMEC',          sk_dest:'negociacao',  nota:7.6, av:'👩‍💼', desc:'Experiência em acordos com INSS.'},
    {n:'Daniel Luz',         fac:'UERJ',           sk_dest:'argumentacao',nota:8.0, av:'👨‍💼', desc:'Pesquisa em Revisão da Vida Toda (Tema 1.102 STF).'},
  ],
};

// ════════════════════════════════════════════════════════
// PAINEL DE PROGRESSÃO
// ════════════════════════════════════════════════════════
window.renderCarreiraProgressao = function(j, el) {
  const idx     = CARGO_IDX[j.cargo_id] ?? 0;
  const cargo   = CARGOS[idx];
  const proximo = CARGOS[idx+1];
  const xp      = j.xp || 0;
  const cap     = window.REP_CAP[j.cargo_id] || 55;
  const repPct  = Math.min(100, Math.round((j.reputacao||0)/cap*100));

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">📈 Progressão de Carreira</div></div>

    <div class="card" style="text-align:center;padding:1.2rem;margin-bottom:1.2rem">
      <div style="font-size:.65rem;color:var(--ardosia);text-transform:uppercase;letter-spacing:.1em">Cargo atual</div>
      <div style="font-family:var(--font-serif);font-size:1.4rem;font-weight:700;color:var(--perg);margin:.3rem 0">${cargo.l}</div>
      <div style="font-size:.78rem;color:var(--ardosia2)">${cargo.desc}</div>
      <div style="display:flex;justify-content:center;gap:1.5rem;margin-top:.8rem">
        <div><div style="font-weight:700;color:var(--ouro2)">${xp} XP</div><div style="font-size:.62rem;color:var(--ardosia)">Exp. total</div></div>
        <div><div style="font-weight:700;color:var(--perg)">${j.anos_carreira||0} anos</div><div style="font-size:.62rem;color:var(--ardosia)">Carreira</div></div>
        <div><div style="font-weight:700;color:var(--ouro2)">${j.reputacao||0}/${cap}</div><div style="font-size:.62rem;color:var(--ardosia)">Reputação</div></div>
      </div>
    </div>

    <!-- OAB -->
    ${!j.oab && j.cargo_id !== 'est' && j.cargo_id !== 'ass' ? '' :
      j.cargo_id === 'ass' && !j.oab ? `
    <div class="card" style="border-color:rgba(184,146,42,.4)">
      <div class="card-titulo">📋 Prova da OAB</div>
      <div class="card-sub" style="margin-bottom:.75rem">
        Requer: Argumentação ≥ 45 (${(j.skills||{}).argumentacao||0}) e Pesquisa ≥ 40 (${(j.skills||{}).pesquisa||0})
      </div>
      <button class="btn btn-sec" onclick="window.iniciarOAB()"
        ${((j.skills||{}).argumentacao||0)<45||((j.skills||{}).pesquisa||0)<40?'disabled':''}>
        Realizar Prova da OAB
      </button>
    </div>` : ''}

    <!-- Próxima promoção -->
    ${proximo ? `
    <div class="secao-header" style="margin-top:.5rem"><div class="secao-titulo">🎯 Próxima promoção: ${proximo.l}</div></div>
    <div class="card">
      <div style="font-size:.78rem;color:var(--ardosia2);margin-bottom:.7rem">${proximo.desc}</div>
      <div style="display:flex;flex-direction:column;gap:.4rem;font-size:.75rem">
        ${proximo.xp ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--ardosia2)">XP necessária</span>
          <span style="color:${xp>=proximo.xp?'var(--verde3)':'var(--perg)'}">${xp}/${proximo.xp} ${xp>=proximo.xp?'✅':''}</span>
        </div>` : ''}
        ${proximo.anos ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--ardosia2)">Anos de carreira</span>
          <span style="color:${(j.anos_carreira||0)>=proximo.anos?'var(--verde3)':'var(--perg)'}">${j.anos_carreira||0}/${proximo.anos} ${(j.anos_carreira||0)>=proximo.anos?'✅':''}</span>
        </div>` : ''}
        ${proximo.rep_min ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--ardosia2)">Reputação mínima</span>
          <span style="color:${(j.reputacao||0)>=proximo.rep_min?'var(--verde3)':'var(--perg)'}">${j.reputacao||0}/${proximo.rep_min} ${(j.reputacao||0)>=proximo.rep_min?'✅':''}</span>
        </div>` : ''}
        ${proximo.oab ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--ardosia2)">OAB aprovada</span>
          <span style="color:${j.oab?'var(--verde3)':'var(--perg)'}">${j.oab?'Sim ✅':'Não'}</span>
        </div>` : ''}
      </div>
      ${_podePromover(j, proximo) ? `
      <button class="btn btn-prim btn-block" style="margin-top:.8rem" onclick="window.promover()">
        🎉 Solicitar promoção →
      </button>` : ''}
    </div>` : `<div class="card" style="text-align:center;padding:1.5rem;color:var(--ouro2)">
      <div style="font-size:1.5rem">👑</div>
      <div style="font-family:var(--font-serif);font-size:1rem;margin-top:.4rem">Você chegou ao topo da carreira privada.</div>
    </div>`}

    <!-- Carreira pública -->
    ${j.oab && (j.anos_carreira||0) >= 3 && ['jnr','pln','snr','asc'].includes(j.cargo_id) ? `
    <div class="secao-header" style="margin-top:.5rem"><div class="secao-titulo">🔨 Carreira Pública</div></div>
    <div class="card">
      <div class="card-sub" style="margin-bottom:.7rem">Você tem OAB e 3+ anos de carreira. Pode prestar concurso público.</div>
      <button class="btn btn-sec" onclick="navTo('concurso',null)">Ver concursos disponíveis →</button>
    </div>` : ''}`;
};

function _podePromover(j, prox) {
  if (!prox) return false;
  if (prox.xp   && (j.xp||0)          < prox.xp)    return false;
  if (prox.anos && (j.anos_carreira||0)< prox.anos)  return false;
  if (prox.rep_min && (j.reputacao||0) < prox.rep_min) return false;
  if (prox.oab  && !j.oab)                            return false;
  return true;
}

// ════════════════════════════════════════════════════════
// PROMOÇÃO
// ════════════════════════════════════════════════════════
window.promover = async function() {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const idx = CARGO_IDX[j.cargo_id] ?? 0;
  const prox = CARGOS[idx+1];
  if (!prox || !_podePromover(j, prox)) { toast('Requisitos não atingidos.','ko'); return; }

  await updateDoc(doc(db, 'jogadores', uid), {
    cargo_id:      prox.id,
    reputacao:     Math.max(j.reputacao||30, prox.rep_min||0),
  });
  toast(`🎉 Promovido(a) para ${prox.l}!`, 'ok');

  // Enviar mensagem de conquista
  await addDoc(collection(db,'jogadores',uid,'inbox'), {
    de:'sistema', para_uid:uid,
    assunto:`🎉 Promoção: ${prox.l}`,
    corpo:`Parabéns! Você foi promovido(a) para ${prox.l}. Novas oportunidades se abrem.`,
    tipo:'sistema', tipo_noticia:'positivo', lida:false,
    criado_em:new Date().toISOString(),
  });
};

// ════════════════════════════════════════════════════════
// OAB
// ════════════════════════════════════════════════════════
const OAB_BANCO = {
  tributario: [
    {q:'Qual é o prazo para oposição de Embargos à Execução Fiscal (LEF art. 16)?',opts:['30 dias após a garantia do juízo','15 dias da citação','5 dias da penhora','60 dias do ajuizamento'],c:0,e:'LEF art. 16 §1º: 30 dias contados da intimação da penhora.'},
    {q:'A compensação tributária, segundo o STJ (Tema 259):',opts:['Não suspende a exigibilidade do crédito','Suspende automaticamente','Extingue definitivamente o crédito','Gera juros imediatos'],c:0,e:'STJ Tema 259: pedido de compensação não suspende a exigibilidade.'},
    {q:'O prazo para homologação tácita (CTN art. 150) é:',opts:['5 anos do fato gerador','10 anos do pagamento','3 anos da declaração','2 anos do vencimento'],c:0,e:'CTN art. 150 §4º: 5 anos contados da ocorrência do fato gerador.'},
    {q:'A Exceção de Pré-Executividade dispensa:',opts:['Garantia do juízo','Advogado constituído','Citação','Tempestividade'],c:0,e:'STJ Súmula 393: EPE não exige garantia do juízo.'},
    {q:'O CARF é competente para:',opts:['Recursos contra decisões das DRJs sobre tributos federais','Execuções fiscais','Infrações estaduais','Pedidos de restituição de FGTS'],c:0,e:'Decreto 70.235/72 art. 25: CARF julga recursos contra decisões de DRJs.'},
  ],
  civil: [
    {q:'O prazo para contestação no CPC (art. 335) é:',opts:['15 dias úteis','10 dias corridos','30 dias úteis','5 dias úteis'],c:0,e:'CPC art. 335: 15 dias úteis para contestação.'},
    {q:'A prescrição da pretensão de reparação civil (CC art. 206 §3º V) é de:',opts:['3 anos','10 anos','5 anos','1 ano'],c:0,e:'CC art. 206 §3º V: prescreve em 3 anos.'},
    {q:'A tutela de urgência (CPC art. 300) exige:',opts:['Probabilidade do direito e perigo de dano','Certeza do direito','Prova inequívoca','Caução obrigatória'],c:0,e:'CPC art. 300: probabilidade (não certeza) + perigo de dano.'},
    {q:'A reserva de plenário (CF art. 97) exige para inconstitucionalidade:',opts:['Maioria absoluta do pleno','Maioria simples','Unanimidade','Apenas o relator'],c:0,e:'CF art. 97 + SV 10 STF: maioria absoluta do tribunal pleno.'},
    {q:'O prazo geral de prescrição no CC/2002 (art. 205) é:',opts:['10 anos','5 anos','3 anos','15 anos'],c:0,e:'CC art. 205: prescreve em 10 anos quando não houver prazo especial.'},
  ],
};

let _oabState = null;

window.iniciarOAB = function() {
  const j   = window.JOGADOR;
  const esp = j.especialidade || 'civil';
  const banco = OAB_BANCO[esp] || OAB_BANCO.civil;
  const pergs = [...banco].sort(()=>Math.random()-.5).slice(0,5);
  _oabState = { pergs, qi:0, acertos:0 };
  _renderOABQ();
};

function _renderOABQ() {
  const {pergs, qi} = _oabState;
  const q = pergs[qi];
  abrirModal(`📋 Prova da OAB — Questão ${qi+1}/5`,
    `<div class="quiz-wrap">
      <div class="quiz-header">OAB · ${qi+1}/5 · Aprovação: 60% (3 corretas)</div>
      <div class="quiz-prog-bar"><div class="quiz-prog-fill" style="width:${qi/5*100}%"></div></div>
      <div class="quiz-questao">${q.q}</div>
      <div class="quiz-opts">
        ${q.opts.map((o,i)=>`<button class="quiz-opt" onclick="window.responderOAB(${i})">${o}</button>`).join('')}
      </div>
    </div>`
  );
}

window.responderOAB = async function(idx) {
  const {pergs, qi} = _oabState;
  const q = pergs[qi];
  const certo = idx === q.c;
  if (certo) _oabState.acertos++;

  const opts = document.querySelectorAll('.quiz-opt');
  opts.forEach((b,i)=>{
    b.disabled=true;
    if(i===q.c)b.classList.add('certo');
    if(i===idx&&!certo)b.classList.add('errado');
  });
  const dica=document.createElement('div');
  dica.className='quiz-dica';
  dica.innerHTML=`${certo?'✅ Correto!':'❌ Incorreto.'} <b>📖 ${q.e}</b>`;
  document.querySelector('.quiz-wrap').appendChild(dica);

  const btn=document.createElement('button');
  btn.className='btn btn-sec btn-block';
  btn.style.marginTop='.6rem';
  const last=qi===pergs.length-1;
  btn.textContent=last?'Ver resultado →':'Próxima →';
  btn.onclick=last?()=>_finalizarOAB():()=>{_oabState.qi++;_renderOABQ();};
  document.querySelector('.quiz-wrap').appendChild(btn);
};

async function _finalizarOAB() {
  const {acertos} = _oabState;
  const aprovado  = acertos >= 3;
  const j  = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;

  if (aprovado) {
    await updateDoc(doc(db,'jogadores',uid),{
      oab:true, cargo_id:'jnr',
      reputacao:Math.min(100,(j.reputacao||30)+10),
    });
    abrirModal('🎉 OAB Aprovada!',
      `<div style="text-align:center;padding:1rem">
        <div style="font-size:2rem">🏛️</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--verde3);margin:.4rem 0">${acertos}/5 corretas — Aprovado(a)!</div>
        <div style="font-size:.8rem;color:var(--ardosia2)">Você agora é Advogado(a) Júnior. +10 rep.</div>
      </div>`
    );
  } else {
    abrirModal('❌ OAB Reprovado(a)',
      `<div style="text-align:center;padding:1rem">
        <div style="font-size:2rem">📋</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--verm3);margin:.4rem 0">${acertos}/5 corretas — Reprovado(a)</div>
        <div style="font-size:.8rem;color:var(--ardosia2)">Mínimo: 3 corretas. Estude mais e tente novamente.</div>
        <button class="btn btn-sec btn-block" style="margin-top:.8rem" onclick="window.iniciarOAB()">Tentar novamente</button>
      </div>`
    );
  }
}

// ════════════════════════════════════════════════════════
// CONCURSO PÚBLICO
// ════════════════════════════════════════════════════════
const CONCURSO_BANCO = [
  {q:'Sobre a reserva de plenário (CF art. 97) para declaração de inconstitucionalidade:',opts:['Exige maioria absoluta do pleno ou órgão especial','Maioria simples de qualquer câmara','Unanimidade','Apenas o relator pode declarar'],c:0,e:'CF art. 97 + SV 10 STF: maioria absoluta é obrigatória.'},
  {q:'Após a Lei 14.230/2021, a improbidade administrativa exige:',opts:['Dolo específico — culpa não é suficiente','Culpa grave','Qualquer irregularidade','Aprovação do CGU'],c:0,e:'Lei 14.230/2021 art. 1º §1º: exige dolo específico.'},
  {q:'O controle judicial do ato administrativo discricionário:',opts:['Abrange legalidade, proporcionalidade e razoabilidade, sem substituir o mérito','O Judiciário pode substituir o mérito','Só controla legalidade formal','Discricionariedade é imune a controle'],c:0,e:'STF RE 632.853: controle abrange proporcionalidade, mas não substitui o mérito.'},
  {q:'A prescrição intercorrente na execução civil (CPC art. 921 §4º) configura-se:',opts:['Após 1 ano de suspensão + 5 anos de inércia','Nunca no processo civil','Apenas no processo penal','Exige intimação pessoal prévia'],c:0,e:'CPC art. 921 §4º + STJ Tema 566: 1 ano suspenso + 5 anos = prescrição intercorrente.'},
  {q:'Diferença entre prescrição e decadência no CC/2002:',opts:['Decadência extingue o direito; prescrição extingue a pretensão (art. 189)','Prescrição extingue o direito','Ambas extinguem o direito','São institutos idênticos'],c:0,e:'CC art. 189: prescrição extingue a pretensão. CC art. 207: decadência extingue o direito.'},
  {q:'O mandado de injunção (CF art. 5º LXXI) é cabível quando:',opts:['Falta norma regulamentadora que torna inviável o exercício de direito constitucional','Há omissão administrativa','Existe lei inconstitucional','O direito já é autoaplicável'],c:0,e:'CF art. 5º LXXI: MI cabe quando a falta de norma torna inviável o exercício de direitos constitucionais.'},
];

let _concursoState = null;

window.renderConcursoPanel = function(j, el) {
  const temReq = j.oab && (j.anos_carreira||0) >= 3;
  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">🔨 Concurso Público</div></div>
    ${!temReq ? `<div class="card" style="color:var(--ardosia2)">
      Requisitos: OAB aprovada + 3 anos de carreira. Você tem: ${j.anos_carreira||0} anos.
    </div>` : `
    <div class="card" style="margin-bottom:.8rem">
      <div class="card-titulo">Requisitos atingidos</div>
      <div class="card-sub">OAB ✅ · ${j.anos_carreira||0} anos de carreira ✅</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.6rem">
      <div class="card" onclick="window.iniciarConcurso('juiz')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:.7rem">
          <span style="font-size:1.4rem">🔨</span>
          <div>
            <div class="card-titulo">Magistratura</div>
            <div class="card-sub">Juiz Substituto → Juiz Titular → Desembargador → Ministro</div>
          </div>
        </div>
      </div>
      <div class="card" onclick="window.iniciarConcurso('promotor')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:.7rem">
          <span style="font-size:1.4rem">🛡️</span>
          <div>
            <div class="card-titulo">Ministério Público</div>
            <div class="card-sub">Promotor Adjunto → Promotor → Procurador → PGJ</div>
          </div>
        </div>
      </div>
      <div class="card" onclick="window.iniciarConcurso('defensor')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:.7rem">
          <span style="font-size:1.4rem">🤝</span>
          <div>
            <div class="card-titulo">Defensoria Pública</div>
            <div class="card-sub">Defensor Adjunto → Defensor → Defensor-Chefe → Defensor-Geral</div>
          </div>
        </div>
      </div>
    </div>`}`;
};

window.iniciarConcurso = function(tipo) {
  const labels = {juiz:'Magistratura',promotor:'Ministério Público',defensor:'Defensoria Pública'};
  const pergs  = [...CONCURSO_BANCO].sort(()=>Math.random()-.5).slice(0,6);
  _concursoState = {tipo, pergs, qi:0, acertos:0};
  _renderConcursoQ(labels[tipo]);
};

function _renderConcursoQ(label) {
  const {pergs, qi} = _concursoState;
  const q = pergs[qi];
  abrirModal(`🔨 Concurso — ${label} — Questão ${qi+1}/6`,
    `<div class="quiz-wrap">
      <div class="quiz-header">${label} · ${qi+1}/6 · Nível: Muito difícil · Aprovação: 60%</div>
      <div class="quiz-prog-bar"><div class="quiz-prog-fill" style="width:${qi/6*100}%"></div></div>
      <div class="quiz-questao">${q.q}</div>
      <div class="quiz-opts">
        ${q.opts.map((o,i)=>`<button class="quiz-opt" onclick="window.responderConcurso(${i})">${o}</button>`).join('')}
      </div>
    </div>`
  );
}

window.responderConcurso = async function(idx) {
  const {pergs, qi} = _concursoState;
  const q=pergs[qi];const certo=idx===q.c;
  if(certo)_concursoState.acertos++;
  const opts=document.querySelectorAll('.quiz-opt');
  opts.forEach((b,i)=>{b.disabled=true;if(i===q.c)b.classList.add('certo');if(i===idx&&!certo)b.classList.add('errado');});
  const dica=document.createElement('div');dica.className='quiz-dica';
  dica.innerHTML=`${certo?'✅ Correto!':'❌ Incorreto.'} <b>📖 ${q.e}</b>`;
  document.querySelector('.quiz-wrap').appendChild(dica);
  const btn=document.createElement('button');btn.className='btn btn-sec btn-block';btn.style.marginTop='.6rem';
  const last=qi===pergs.length-1;btn.textContent=last?'Ver resultado →':'Próxima →';
  btn.onclick=last?()=>_finalizarConcurso():()=>{_concursoState.qi++;_renderConcursoQ({juiz:'Magistratura',promotor:'MP',defensor:'Defensoria'}[_concursoState.tipo]);};
  document.querySelector('.quiz-wrap').appendChild(btn);
};

async function _finalizarConcurso() {
  const {acertos, tipo} = _concursoState;
  const aprovado = acertos >= 4; // 60% de 6
  const j  = window.JOGADOR;
  const uid = j.uid||window.JOGADOR_UID;
  const CARGO_PUBLICO = {juiz:'jsub',promotor:'padj',defensor:'dadj'};
  const LABEL = {juiz:'Juiz Substituto',promotor:'Promotor Adjunto',defensor:'Defensor Adjunto'};

  if(aprovado){
    await updateDoc(doc(db,'jogadores',uid),{
      cargo_id:CARGO_PUBLICO[tipo],
      concurso_aprovado:true,
      carreira:tipo,
      reputacao:Math.min(100,(j.reputacao||30)+15),
    });
    abrirModal('🎉 Aprovado no concurso!',
      `<div style="text-align:center;padding:1rem">
        <div style="font-size:2rem">🏛️</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--verde3);margin:.4rem 0">${acertos}/6 corretas — Aprovado(a)!</div>
        <div>Você agora é <b>${LABEL[tipo]}</b>. +15 rep.</div>
      </div>`);
  } else {
    abrirModal('❌ Reprovado(a) no concurso',
      `<div style="text-align:center;padding:1rem">
        <div style="font-size:2rem">📋</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--verm3);margin:.4rem 0">${acertos}/6 corretas — Reprovado(a)</div>
        <div style="font-size:.8rem;color:var(--ardosia2)">Mínimo: 4 corretas. Estude mais e tente novamente.</div>
        <button class="btn btn-sec btn-block" style="margin-top:.8rem" onclick="window.iniciarConcurso('${tipo}')">Tentar novamente</button>
      </div>`);
  }
}

// ════════════════════════════════════════════════════════
// CURSOS
// ════════════════════════════════════════════════════════
window.renderCursosPanel = function(j, el) {
  const feitos = j.cursos_feitos || [];
  const cap    = window.REP_CAP[j.cargo_id] || 55;
  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">🎓 Cursos & Pós-Graduação</div></div>
    <div style="font-size:.75rem;color:var(--ardosia2);margin-bottom:1rem">
      Cursos aumentam 2 skills simultaneamente. O custo é deduzido do saldo.
    </div>
    <div style="display:flex;flex-direction:column;gap:.5rem">
      ${CURSOS.map(c=>{
        const feito   = feitos.includes(c.id);
        const reqIdx  = CARGO_IDX[c.req]??0;
        const meuIdx  = CARGO_IDX[j.cargo_id]??0;
        const podeReq = meuIdx >= reqIdx;
        return `<div class="card" style="opacity:${feito||!podeReq?.65:1}">
          <div style="display:flex;align-items:center;gap:.75rem">
            <div style="font-size:1.6rem;flex-shrink:0">${c.i}</div>
            <div style="flex:1">
              <div class="card-titulo">${c.n}</div>
              <div class="card-sub">${c.sem} meses · ${fmt(c.c)}</div>
              <div style="font-size:.7rem;color:var(--ouro2);margin-top:.2rem">
                +${c.b} ${SK_LABEL[c.sk]||c.sk} · +${c.b2} ${SK_LABEL[c.sk2]||c.sk2}
              </div>
              ${!podeReq?`<div style="font-size:.65rem;color:var(--verm3)">Requer: ${CARGOS.find(x=>x.id===c.req)?.l||c.req}</div>`:''}
            </div>
            ${feito ? `<span style="font-size:.72rem;color:var(--verde3);flex-shrink:0">✅ Concluído</span>` :
            !podeReq ? `<span style="font-size:.72rem;color:var(--ardosia);flex-shrink:0">🔒</span>` :
            (j.dinheiro||0)>=c.c ? `<button class="btn btn-sm btn-sec" onclick="window.fazerCurso('${c.id}')">Fazer</button>` :
            `<span style="font-size:.68rem;color:var(--ardosia);flex-shrink:0">Sem saldo</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;
};

window.fazerCurso = async function(id) {
  const c  = CURSOS.find(x=>x.id===id);
  const j  = window.JOGADOR;
  const uid = j.uid||window.JOGADOR_UID;
  if (!c||!j) return;
  if ((j.dinheiro||0)<c.c){toast('Saldo insuficiente.','ko');return;}
  if ((j.cursos_feitos||[]).includes(c.id)){toast('Curso já realizado.','');return;}

  const cap  = window.REP_CAP[j.cargo_id]||55;
  const sk1  = Math.min(cap, ((j.skills||{})[c.sk]||0)+c.b);
  const sk2  = Math.min(cap, ((j.skills||{})[c.sk2]||0)+c.b2);

  await updateDoc(doc(db,'jogadores',uid),{
    dinheiro:         (j.dinheiro||0)-c.c,
    cursos_feitos:    [...(j.cursos_feitos||[]),c.id],
    [`skills.${c.sk}`]:sk1,
    [`skills.${c.sk2}`]:sk2,
    reputacao:        Math.min(100,(j.reputacao||30)+4),
  });
  toast(`${c.i} ${c.n} concluído! +${c.b} ${SK_LABEL[c.sk]} · +${c.b2} ${SK_LABEL[c.sk2]}`,'ok');
};

// ════════════════════════════════════════════════════════
// CONTRATAÇÃO DE EQUIPE
// ════════════════════════════════════════════════════════
let _candidatosAtivos = null;

window.abrirContratacao = function() {
  const j   = window.JOGADOR;
  if ((j.estagiarios||[]).length>=6){toast('Máximo 6 membros.','');return;}
  const esp  = j.especialidade||'civil';
  const base = CANDIDATOS[esp]||CANDIDATOS.civil;
  _candidatosAtivos = base.map(b=>({...b,desemp:Math.max(50,Math.min(95,Math.round(b.nota*9+Math.floor(Math.random()*10)-5)))}));

  abrirModal('📋 Contratar Membro de Equipe',
    `<div style="font-size:.75rem;color:var(--ardosia2);margin-bottom:.8rem">
      Candidatos disponíveis na área de <b>${esp}</b>. Salário fixo: R$ 1.700/mês.
    </div>
    ${_candidatosAtivos.map((cand,i)=>`
    <div style="display:flex;align-items:center;gap:.75rem;background:rgba(255,255,255,.04);border:var(--borda);border-radius:2px;padding:.7rem;margin-bottom:.4rem">
      <div style="font-size:1.6rem;flex-shrink:0">${cand.av}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:.88rem">${cand.n}</div>
        <div style="font-size:.72rem;color:var(--ardosia2)">${cand.fac} · Nota: <b style="color:var(--ouro2)">${cand.nota}</b></div>
        <div style="font-size:.72rem;color:var(--perg2)">${cand.desc}</div>
        <div style="font-size:.68rem;color:var(--ouro2)">⭐ Destaque: ${SK_LABEL[cand.sk_dest]||cand.sk_dest}</div>
      </div>
      <button class="btn btn-sm btn-sec" onclick="window.contratarMembro(${i})">Contratar</button>
    </div>`).join('')}`
  );
};

window.contratarMembro = async function(idx) {
  const j   = window.JOGADOR;
  const uid = j.uid||window.JOGADOR_UID;
  if (!_candidatosAtivos||!_candidatosAtivos[idx]) return;
  if ((j.estagiarios||[]).length>=6){toast('Máximo 6 membros.','');return;}
  const cand = _candidatosAtivos[idx];
  const novoMembro = {nome:cand.n,fac:cand.fac,sk_dest:cand.sk_dest,av:cand.av,desemp:cand.desemp,sal:1700,s:0};
  await updateDoc(doc(db,'jogadores',uid),{
    estagiarios:[...(j.estagiarios||[]),novoMembro],
  });
  fecharModal();
  toast(`✅ ${cand.n} contratado(a)! -R$1.700/mês`,'ok');
};

window.delegarEstagiario = async function(idx) {
  const j  = window.JOGADOR;
  const e  = (j.estagiarios||[])[idx];
  if(!e)return;
  const uid = j.uid||window.JOGADOR_UID;
  const rnd = Math.random();
  if(rnd<e.desemp/100){
    await updateDoc(doc(db,'jogadores',uid),{reputacao:Math.min(100,(j.reputacao||30)+1)});
    toast(`✅ ${e.nome} entregou ótima pesquisa! +1 rep`,'ok');
  } else {
    toast(`${e.nome} entregou um trabalho mediano.`,'neutro');
  }
};

window.dispensarEstagiario = async function(idx) {
  const j  = window.JOGADOR;
  const uid = j.uid||window.JOGADOR_UID;
  const novos = [...(j.estagiarios||[])];
  if(!novos[idx])return;
  const nome = novos[idx].nome;
  novos.splice(idx,1);
  await updateDoc(doc(db,'jogadores',uid),{estagiarios:novos});
  toast(`${nome} dispensado(a).`,'neutro');
};

function fmt(n){if(!n&&n!==0)return'—';if(n>=1000000)return`R$ ${(n/1000000).toFixed(1)}M`;if(n>=1000)return`R$ ${Math.round(n/1000)}k`;return`R$ ${Number(n).toLocaleString('pt-BR')}`;}
