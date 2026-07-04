/**
 * PETIÇÕES UI — Advocatus Online (GDD v4.1)
 * Gerencia: listagem, composição, variação, setlist builder, evento de julgamento.
 * Exposto como window.renderPeticoes e window.renderSetlistBuilder.
 */

import { collection, query, where, orderBy, getDocs, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db, functions } from './firebase-init.js';

// ─── Labels ──────────────────────────────────────────────────────────────────

const DOC_LABELS = {
  initial_filing:      'Petição Inicial',
  responsive_pleading: 'Contestação / Réplica',
  motion:              'Requerimento / Tutela',
  appellate_brief:     'Razões de Apelação',
  supreme_brief:       'Memorial / Certiorari',
  trial_brief:         'Alegações Finais',
  evidence:            'Instrução Probatória',
  deposition:          'Depoimento',
};

const AREA_LABELS = {
  employment:  'Trabalhista',
  tax:         'Tributário',
  civil:       'Cível',
  criminal:    'Criminal',
  corporate:   'Empresarial',
  immigration: 'Imigração',
  bankruptcy:  'Recuperação Judicial',
};

const ESTILO_LABELS = {
  inovadora:       'Inovadora',
  jurisprudencial: 'Jurisprudencial',
  legalista:       'Legalista',
  agressiva:       'Agressiva',
};

const ESTILO_DESC = {
  inovadora:       'Bônus vs julgadores doutrinários, penalidade vs fiscais/pragmáticos',
  jurisprudencial: 'Bônus vs julgadores que valorizam precedentes',
  legalista:       'Bônus vs julgadores faturais, padrão conservador',
  agressiva:       'Bônus vs julgadores constitucionalistas, risco alto',
};

const ACAO_LABELS = {
  preliminary_hearing:   'Audiência Preliminar',
  expert_witness:        'Prova Pericial',
  examination_witnesses: 'Instrução Testemunhal',
  oral_argument:         'Sustentação Oral',
  preliminary_injunction:'Tutela de Urgência',
  document_production:   'Juntada de Documentos',
  personal_testimony:    'Depoimento Pessoal',
  motion_exclude:        'Impugnação / Exclusão',
};

// ─── Estrelas (0–50 → 0–5★) ──────────────────────────────────────────────────

function renderStars(val) {
  const full  = Math.floor(val / 10);
  const half  = val % 10 >= 5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ─── Barra de fama/popularidade ──────────────────────────────────────────────

function barHTML(val, max, cor) {
  const pct = Math.round((val / max) * 100);
  return `<div style="background:var(--borda2);border-radius:4px;height:6px;overflow:hidden">
    <div style="width:${pct}%;height:100%;background:${cor};border-radius:4px;transition:.3s"></div>
  </div>`;
}

// ─── Painel principal de Petições ─────────────────────────────────────────────

window.renderPeticoes = async function(j, el) {
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--ardosia)">Carregando petições…</div>`;

  try {
    const snap = await getDocs(
      query(collection(db, 'peticoes'),
        where('jogador_uid', '==', j.uid),
        orderBy('criada_em', 'desc'))
    );

    const peticoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    el.innerHTML = `
      <div class="secao-header">
        <div class="secao-titulo">📜 Petições</div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="window.renderMercadoPeticoes(window.JOGADOR, document.getElementById('main-content'))">🏪 Mercado</button>
          <button class="btn btn-prim btn-sm" onclick="window.abrirModalCompor()">+ Confeccionar</button>
        </div>
      </div>

      ${!j.oab ? _bannerBarExam(j) : ''}
      ${!j.oab ? _bannerPeticaoGenerica() : ''}

      ${peticoes.length === 0
        ? `<div class="card" style="text-align:center;color:var(--ardosia2);padding:2rem">
            Nenhuma petição composta ainda.<br>
            <button class="btn btn-ghost btn-sm" style="margin-top:1rem" onclick="window.abrirModalCompor()">
              Compor primeira petição
            </button>
          </div>`
        : `<div class="pet-grid">${peticoes.map(_cardPeticao).join('')}</div>`
      }

      ${_modalComporHTML()}
      ${_modalDetalheHTML()}`;

  } catch(e) {
    el.innerHTML = `<div class="card" style="color:var(--erro)">Erro ao carregar petições: ${e.message}</div>`;
  }
};

// ─── Banner Bar Exam ──────────────────────────────────────────────────────────

function _bannerBarExam(j) {
  const tentativas = j.bar_exam_tentativas || 0;
  const score      = j.bar_exam_ultimo_score ?? null;
  const skJur      = j.skills_jur || {};
  const previewScore = (
    (skJur.legal_drafting || 0) * 0.30 +
    (skJur.legal_research  || 0) * 0.30 +
    (skJur.argumentation   || 0) * 0.25 +
    (skJur.procedure       || 0) * 0.15
  ).toFixed(1);

  return `
    <div class="card" style="border-left:3px solid var(--ouro);margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <b>Exame OAB</b>
          <div style="font-size:.75rem;color:var(--ardosia2);margin-top:.2rem">
            Score atual estimado: <b>${previewScore}/50</b> · Aprovação: 32,5
            ${score !== null ? ` · Última tentativa: ${score}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:.5rem">
          ${tentativas === 0
            ? `<button class="btn btn-prim btn-sm" onclick="window.tentarBarExam()">Fazer Exame OAB</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="window.tentarBarExam()">Nova Tentativa</button>`}
          <button class="btn btn-sm" style="background:var(--fundo2)" onclick="window.matricularPrep()">Bar Prep Course</button>
        </div>
      </div>
    </div>`;
}

// ─── Banner Petição Genérica (para quem não tem OAB) ─────────────────────────

function _bannerPeticaoGenerica() {
  return `
    <div class="card" style="border-left:3px solid var(--ardosia2);margin-bottom:1rem;font-size:.82rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <b>Petição Genérica</b>
          <div style="font-size:.75rem;color:var(--ardosia2);margin-top:.2rem">
            Sem OAB você pode usar petições genéricas em processos — nota base 10, teto 12.
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="window.usarPeticaoGenerica()">Usar Genérica</button>
      </div>
    </div>`;
}

window.usarPeticaoGenerica = async function() {
  const area = prompt('Área do Direito:\n' + Object.entries(AREA_LABELS).map(([k,v],i)=>`${i+1}. ${v}`).join('\n') + '\n\nDigite o número:');
  const idx = parseInt(area, 10) - 1;
  const areas = Object.keys(AREA_LABELS);
  if (idx < 0 || idx >= areas.length) return;
  try {
    const fn  = httpsCallable(functions, 'peticaoGenerica');
    const res = await fn({ practice_area: areas[idx] });
    toast(`✅ Petição genérica criada! Nota base: ${res.data.nota_base}/26 · Teto: 12`, 'ok', 4000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + (e.message || e), 'erro'); }
};

// ─── Mercado de Petições ──────────────────────────────────────────────────────

window.renderMercadoPeticoes = async function(j, el) {
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--ardosia)">Carregando mercado…</div>`;

  try {
    const snap = await getDocs(
      query(collection(db, 'peticoes'),
        where('no_mercado', '==', true),
        orderBy('criada_em', 'desc'))
    );

    const peticoes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.jogador_uid !== j.uid); // não comprar as próprias

    el.innerHTML = `
      <div class="secao-header">
        <div class="secao-titulo">🏪 Mercado de Petições</div>
        <button class="btn btn-ghost btn-sm" onclick="window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'))">← Minhas Petições</button>
      </div>

      <div style="font-size:.75rem;color:var(--ardosia2);margin-bottom:1rem">
        Compre petições compostas por outros advogados. A popularidade reseta ao comprar; fama e nota base são do criador.
      </div>

      ${peticoes.length === 0
        ? `<div class="card" style="text-align:center;padding:2rem;color:var(--ardosia2)">Nenhuma petição no mercado agora.</div>`
        : `<div class="pet-grid">${peticoes.map(p => _cardMercado(p, j)).join('')}</div>`}`;

  } catch(e) {
    el.innerHTML = `<div class="card" style="color:var(--erro)">Erro ao carregar mercado: ${e.message}</div>`;
  }
};

function _cardMercado(p, j) {
  const podeComprar = (j.dinheiro || 0) >= (p.preco_mercado || 0);
  return `
    <div class="card pet-card">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:.2rem">${p.nome}</div>
      <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:.5rem">
        ${DOC_LABELS[p.document_type]||p.document_type} · ${AREA_LABELS[p.practice_area]||p.practice_area}
        · Geração ${p.geracao || 1}
      </div>
      <div style="font-size:.72rem;margin-bottom:.4rem">
        Nota base: <b>${p.nota_base}/26</b> · Teto: ${p.teto_nota}/26
        · Fama: ${p.fama||0}/100
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.6rem">
        <span style="font-size:.85rem;font-weight:700;color:var(--ouro)">R$${(p.preco_mercado||0).toLocaleString('pt-BR')}</span>
        <button class="btn btn-prim btn-sm" ${podeComprar?'':'disabled style="opacity:.5"'}
          onclick="window.comprarPeticaoDeMercado('${p.id}','${p.nome}',${p.preco_mercado||0})">
          Comprar
        </button>
      </div>
      ${!podeComprar ? `<div style="font-size:.67rem;color:var(--ardosia2);margin-top:.3rem">Saldo insuficiente</div>` : ''}
    </div>`;
}

window.comprarPeticaoDeMercado = async function(peticaoId, nome, preco) {
  if (!confirm(`Comprar "${nome}" por R$${preco.toLocaleString('pt-BR')}?`)) return;
  try {
    await httpsCallable(functions, 'comprarPeticao')({ peticao_id: peticaoId });
    toast(`✅ Petição "${nome}" adquirida! A popularidade foi resetada.`, 'ok', 4000);
    if (window.JOGADOR) window.renderMercadoPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + (e.message || e), 'erro'); }
};

// ─── Card de petição ──────────────────────────────────────────────────────────

function _calcNotaEfetiva(p) {
  const notaTeto = p.nota_teto ?? p.teto_nota ?? 12;
  const pop = p.popularidade ?? 0;
  const fama = p.fama ?? 0;
  let modPop = pop >= 86 ? 1.20 : pop >= 71 ? 1.10 : pop >= 51 ? 1.05
    : pop >= 31 ? 1.00 : pop >= 16 ? 0.90 : pop >= 6 ? 0.78 : pop >= 1 ? 0.65 : 0.50;
  let bFama = fama >= 100 ? 6 : fama >= 95 ? 5 : fama >= 85 ? 4
    : fama >= 75 ? 3 : fama >= 60 ? 2 : fama >= 40 ? 1 : 0;
  const raw = Math.round(notaTeto * modPop) + bFama;
  return Math.max(1, Math.min(notaTeto, raw));
}

function _cardPeticao(p) {
  const gerLabel = p.geracao > 1 ? ` <span style="color:var(--ardosia2);font-size:.7rem">v${p.geracao}</span>` : '';
  const statusBadge = p.status === 'em_composicao'
    ? `<span class="badge" style="background:var(--laranja1);color:#fff">⏳ Confeccionando</span>`
    : p.generica
    ? `<span class="badge" style="background:var(--ardosia2);color:#fff">Genérica</span>`
    : `<span class="badge" style="background:var(--verde1);color:#fff">Pronta</span>`;

  const temNotaTeto  = p.nota_teto != null;
  const notaEfetiva  = temNotaTeto ? _calcNotaEfetiva(p) : (p.nota_base || 1);
  const notaTeto     = p.nota_teto ?? p.teto_nota ?? 12;
  const estiloLabel  = p.estilo_escrita ? (ESTILO_LABELS[p.estilo_escrita] || p.estilo_escrita) : null;

  return `
    <div class="card pet-card" onclick="window.abrirDetalhePeticao('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
        <div>
          <div style="font-weight:600;font-size:.85rem">${p.titulo || p.nome}${gerLabel}</div>
          <div style="font-size:.72rem;color:var(--ardosia2)">${DOC_LABELS[p.document_type]||p.document_type} · ${AREA_LABELS[p.practice_area]||p.practice_area}${estiloLabel ? ` · ${estiloLabel}` : ''}</div>
        </div>
        ${statusBadge}
      </div>

      <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:.4rem">
        ${p.status === 'em_composicao' && p.mes_conclusao
          ? `<span style="color:var(--ouro2)">⏳ Finaliza no mês ${p.mes_conclusao}</span>`
          : temNotaTeto
          ? `Efetiva: <b>${notaEfetiva}/26</b> · Teto: ${notaTeto}/26`
          : `Nota base: <b>${p.nota_base}/26</b> · Teto: ${p.teto_nota}/26`}
        ${p.tier_argumentacao
          ? ` · <span style="color:var(--ardosia2)">Arg. ${p.tier_argumentacao} · Red. ${p.tier_redacao}</span>`
          : ''}
      </div>

      <div style="margin-bottom:.3rem">
        <div style="font-size:.7rem;color:var(--ardosia2);display:flex;justify-content:space-between">
          <span>Fama ${p.fama||0}/100</span><span>teto ${p.fama_teto_desbloqueado||39}</span>
        </div>
        ${barHTML(p.fama||0, 100, 'var(--ouro)')}
      </div>
      <div>
        <div style="font-size:.7rem;color:var(--ardosia2);display:flex;justify-content:space-between">
          <span>Popularidade ${p.popularidade||0}/100</span>
          <span style="color:${(p.popularidade||0) < 16 ? 'var(--erro)' : 'inherit'}">${_popLabel(p.popularidade||0)}</span>
        </div>
        ${barHTML(p.popularidade||0, 100, _popCor(p.popularidade||0))}
      </div>

      <div style="margin-top:.6rem;display:flex;gap:.4rem;flex-wrap:wrap">
        ${p.status === 'pronta' && !p.generica
          ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.abrirModalVariar('${p.id}')">Variar</button>`
          : ''}
        ${p.status === 'pronta'
          ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.abrirModalEmprestar('${p.id}')">Emprestar</button>`
          : ''}
        ${p.status === 'pronta' && !p.no_mercado
          ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.abrirModalVender('${p.id}')">Vender</button>`
          : ''}
        ${p.status === 'emprestada'
          ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.liberarEmprestimoPeticao('${p.id}')">Liberar Empréstimo</button>`
          : ''}
        ${p.no_mercado
          ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();window.retirarMercado('${p.id}')">Retirar do Mercado</button>`
          : ''}
      </div>
    </div>`;
}

function _popLabel(pop) {
  if (pop >= 86) return 'FENÔMENO';
  if (pop >= 71) return 'REFERÊNCIA';
  if (pop >= 51) return 'ESTABELECIDA';
  if (pop >= 31) return 'CONHECIDA';
  if (pop >= 16) return 'FAMILIAR DEMAIS';
  if (pop >= 6)  return 'BATIDA';
  if (pop >= 1)  return 'DATADA';
  return 'OBSOLETA';
}

function _popCor(pop) {
  if (pop >= 71) return 'var(--verde1)';
  if (pop >= 31) return 'var(--azul1)';
  if (pop >= 16) return 'var(--laranja1)';
  return 'var(--erro)';
}

// ─── Modal Compor ─────────────────────────────────────────────────────────────

function _modalComporHTML() {
  return `
    <div id="modal-compor" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;display:none;align-items:center;justify-content:center">
      <div class="card" style="width:420px;max-width:95vw;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <b>Confeccionar Petição</b>
          <button class="btn btn-sm btn-ghost" onclick="document.getElementById('modal-compor').style.display='none'">✕</button>
        </div>

        <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:1rem;background:var(--fundo2);padding:.5rem .75rem;border-radius:4px">
          Os 3 primeiros seletores travam ao iniciar a confecção e não podem ser alterados.<br>
          O título pode ser editado até o primeiro uso em processo.
        </div>

        <label style="font-size:.78rem;color:var(--ardosia2)">Tipo de Petição <span style="color:var(--ardosia3)">— trava</span></label>
        <select id="compor-tipo" class="input-select" style="margin-bottom:.8rem;width:100%">
          ${Object.entries(DOC_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>

        <label style="font-size:.78rem;color:var(--ardosia2)">Ramo do Direito <span style="color:var(--ardosia3)">— trava</span></label>
        <select id="compor-area" class="input-select" style="margin-bottom:.8rem;width:100%">
          ${Object.entries(AREA_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>

        <label style="font-size:.78rem;color:var(--ardosia2)">Estilo de Escrita <span style="color:var(--ardosia3)">— trava</span></label>
        <select id="compor-estilo" class="input-select" style="margin-bottom:.3rem;width:100%" onchange="window._atualizarDescEstilo()">
          ${Object.entries(ESTILO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <div id="compor-estilo-desc" style="font-size:.7rem;color:var(--ardosia2);margin-bottom:.8rem">${ESTILO_DESC['inovadora']}</div>

        <label style="font-size:.78rem;color:var(--ardosia2)">Título (editável até o 1º uso)</label>
        <input id="compor-nome" class="input-text" style="margin-bottom:.3rem;width:100%" placeholder="Deixe em branco para nome automático">
        <div style="font-size:.68rem;color:var(--ardosia3);margin-bottom:1rem" id="compor-nome-auto"></div>

        <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:1rem">
          ⏱ A confecção leva <b>1 mês</b>. A nota teto é calculada com suas skills no momento da finalização.
        </div>

        <button class="btn btn-prim btn-block" onclick="window.confirmarCompor()">Iniciar Confecção</button>
      </div>
    </div>`;
}

window.abrirModalCompor = function() {
  const m = document.getElementById('modal-compor');
  if (m) {
    m.style.display = 'flex';
    window._atualizarDescEstilo();
    window._atualizarNomeAuto();
  }
};

window._atualizarDescEstilo = function() {
  const estilo = document.getElementById('compor-estilo')?.value;
  const el     = document.getElementById('compor-estilo-desc');
  if (el && estilo) el.textContent = ESTILO_DESC[estilo] || '';
  window._atualizarNomeAuto();
};

window._atualizarNomeAuto = function() {
  const tipo   = document.getElementById('compor-tipo')?.value;
  const area   = document.getElementById('compor-area')?.value;
  const estilo = document.getElementById('compor-estilo')?.value;
  const titulo = document.getElementById('compor-nome')?.value?.trim();
  const el     = document.getElementById('compor-nome-auto');
  if (!el) return;
  if (titulo) { el.textContent = ''; return; }
  const tipoLabel   = { initial_filing:'Inicial', responsive_pleading:'Contestação', motion:'Requerimento', appellate_brief:'Apelação', supreme_brief:'Memorial', trial_brief:'Alegações Finais', evidence:'Instrução', deposition:'Depoimento' };
  const areaLabel   = { employment:'Trabalhista', tax:'Tributário', civil:'Cível', criminal:'Criminal', corporate:'Empresarial', immigration:'Imigração', bankruptcy:'Recuperação Jud.' };
  const estiloLabel = { inovadora:'Inovadora', jurisprudencial:'Jurisprudencial', legalista:'Legalista', agressiva:'Agressiva' };
  if (tipo && area && estilo) {
    el.textContent = `Nome automático: ${tipoLabel[tipo]||tipo} - ${areaLabel[area]||area} - ${estiloLabel[estilo]} - "Nome temporário"`;
  }
};

window.confirmarCompor = async function() {
  const tipo   = document.getElementById('compor-tipo')?.value;
  const area   = document.getElementById('compor-area')?.value;
  const estilo = document.getElementById('compor-estilo')?.value;
  const titulo = document.getElementById('compor-nome')?.value?.trim() || '';
  if (!tipo || !area) return;

  try {
    const fn  = httpsCallable(functions, 'componerPeticao');
    const res = await fn({ document_type: tipo, practice_area: area, estilo_escrita: estilo, titulo });
    const d   = res.data;
    document.getElementById('modal-compor').style.display = 'none';
    toast(`📝 Confecção iniciada — petição pronta no mês ${d.mes_conclusao}. A nota teto será calculada com suas skills daquele momento.`, 'ok', 6000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) {
    toast('Erro ao iniciar confecção: ' + (e.message || e), 'erro');
  }
};

// ─── Modal Variar ──────────────────────────────────────────────────────────────

window.abrirModalVariar = async function(peticaoId) {
  const petSnap = await getDoc(doc(db, 'peticoes', peticaoId));
  if (!petSnap.exists()) return;
  const pet = petSnap.data();
  const novaGer = (pet.geracao || 1) + 1;
  const fatores = { 2: '80%', 3: '65%', 4: '50%' };
  const fator = fatores[novaGer] || '50%';

  if (!confirm(`Criar variação v${novaGer} de "${pet.nome}"?\nTeto reduzido para ${fator} do original. A variação começa com fama e popularidade zero.`)) return;

  try {
    const fn  = httpsCallable(functions, 'variarPeticao');
    const res = await fn({ peticao_base_id: peticaoId });
    toast(`✅ Variação v${res.data.geracao} criada! Teto: ${res.data.teto_nota}/26`, 'ok', 4000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) {
    toast('Erro ao variar: ' + (e.message || e), 'erro');
  }
};

// ─── Detalhe petição ──────────────────────────────────────────────────────────

function _modalDetalheHTML() {
  return `<div id="modal-detalhe-pet" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;align-items:center;justify-content:center">
    <div class="card" style="width:440px;max-width:95vw;max-height:90vh;overflow-y:auto" id="modal-detalhe-pet-body"></div>
  </div>`;
}

window.abrirDetalhePeticao = async function(peticaoId) {
  const m    = document.getElementById('modal-detalhe-pet');
  const body = document.getElementById('modal-detalhe-pet-body');
  if (!m || !body) return;

  body.innerHTML = '<div style="padding:2rem;text-align:center">Carregando…</div>';
  m.style.display = 'flex';

  try {
    const petSnap = await getDoc(doc(db, 'peticoes', peticaoId));
    if (!petSnap.exists()) { body.innerHTML = '<div>Petição não encontrada.</div>'; return; }
    const p = petSnap.data();

    const estrelas = '★'.repeat(Math.round(p.nota_base / 5.2)) + '☆'.repeat(5 - Math.round(p.nota_base / 5.2));

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <b>⚖ ${p.nome}</b>
        <button class="btn btn-sm btn-ghost" onclick="document.getElementById('modal-detalhe-pet').style.display='none'">✕</button>
      </div>

      <div style="font-size:.78rem;color:var(--ardosia2);margin-bottom:1rem">
        ${DOC_LABELS[p.document_type]||p.document_type} · ${AREA_LABELS[p.practice_area]||p.practice_area}
        ${p.geracao > 1 ? ` · Geração ${p.geracao} (variação)` : ' · Original'}
      </div>

      ${p.nota_teto != null ? `
        <div style="background:var(--fundo2);border-radius:6px;padding:.6rem .75rem;margin-bottom:.8rem;font-size:.78rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:.2rem">
            <span>Argumentação: <b>${p.tier_argumentacao||'—'}</b></span>
            <span>Redação: <b>${p.tier_redacao||'—'}</b></span>
          </div>
          <div style="font-size:.7rem;color:var(--ardosia2);font-style:italic">
            "A argumentação é ${p.tier_argumentacao||'—'} e a redação é ${p.tier_redacao||'—'}."
          </div>
        </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem">
        <div class="stat-mini">
          <div class="sm-label">${p.nota_teto != null ? 'Nota Efetiva' : 'Nota Base'}</div>
          <div class="sm-val">${p.nota_teto != null ? _calcNotaEfetiva(p) : (p.nota_base||1)}/26</div>
        </div>
        <div class="stat-mini">
          <div class="sm-label">Teto</div>
          <div class="sm-val">${p.nota_teto ?? p.teto_nota ?? 12}/26</div>
        </div>
        <div class="stat-mini">
          <div class="sm-label">Potencial</div>
          <div class="sm-val" style="font-size:.9rem">${estrelas}</div>
        </div>
        <div class="stat-mini">
          <div class="sm-label">Usos / Vitórias</div>
          <div class="sm-val">${p.usos_total||0} / ${p.vitorias||0}</div>
        </div>
      </div>

      <div style="margin-bottom:.6rem">
        <div style="font-size:.72rem;display:flex;justify-content:space-between;margin-bottom:.2rem">
          <span>Fama ${p.fama||0}/100</span><span>Teto: ${p.fama_teto_desbloqueado||39}</span>
        </div>
        ${barHTML(p.fama||0, 100, 'var(--ouro)')}
      </div>
      <div style="margin-bottom:1rem">
        <div style="font-size:.72rem;display:flex;justify-content:space-between;margin-bottom:.2rem">
          <span>Popularidade ${p.popularidade||0}/100</span>
          <span style="color:${(p.popularidade||0)<16?'var(--erro)':'inherit'}">${_popLabel(p.popularidade||0)}</span>
        </div>
        ${barHTML(p.popularidade||0, 100, _popCor(p.popularidade||0))}
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${!p.generica && p.status === 'pronta'
          ? `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('modal-detalhe-pet').style.display='none';window.abrirModalVariar('${peticaoId}')">Variar</button>`
          : ''}
        ${p.status === 'pronta'
          ? `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('modal-detalhe-pet').style.display='none';window.abrirModalEmprestar('${peticaoId}')">Emprestar a NPC</button>
             <button class="btn btn-ghost btn-sm" onclick="document.getElementById('modal-detalhe-pet').style.display='none';window.abrirModalVender('${peticaoId}')">Vender</button>`
          : ''}
      </div>`;
  } catch(e) {
    body.innerHTML = `<div style="color:var(--erro)">Erro: ${e.message}</div>`;
  }
};

// ─── Empréstimo / Venda ───────────────────────────────────────────────────────

window.abrirModalEmprestar = async function(peticaoId) {
  const j = window.JOGADOR;
  const escId = j?.escritorio_proprio_id;

  if (!escId) {
    toast('Você precisa ter um escritório para emprestar petições.', 'erro');
    return;
  }

  // Carregar NPCs do escritório
  const { collection: col2, getDocs: gds2, query: q2 } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const funcSnap = await gds2(q2(col2(db, 'escritorios', escId, 'funcionarios')));
  const npcs = funcSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => !f.burnout_npc && !f.em_ferias);

  if (npcs.length === 0) {
    toast('Nenhum NPC disponível no escritório.', 'erro');
    return;
  }

  const lista = npcs.map((f, i) => `${i + 1}. ${f.nome} (${f.cargo_id})`).join('\n');
  const idx   = parseInt(prompt(`Emprestar para qual NPC?\n${lista}`), 10) - 1;
  if (idx < 0 || idx >= npcs.length) return;

  try {
    await httpsCallable(functions, 'emprestarPeticao')({ peticao_id: peticaoId, npc_id: npcs[idx].id });
    toast(`Petição emprestada a ${npcs[idx].nome}!`, 'ok', 3000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
};

window.liberarEmprestimoPeticao = async function(peticaoId) {
  if (!confirm('Devolver esta petição do NPC emprestado?')) return;
  try {
    await httpsCallable(functions, 'liberarEmprestimo')({ peticao_id: peticaoId });
    toast('Petição devolvida!', 'ok', 3000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
};

window.retirarMercado = async function(peticaoId) {
  if (!confirm('Retirar esta petição do mercado?')) return;
  try {
    await httpsCallable(functions, 'retirarPeticaoMercado')({ peticao_id: peticaoId });
    toast('Petição retirada do mercado.', 'ok', 3000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
};

window.abrirModalVender = async function(peticaoId) {
  const precoStr = prompt('Preço de venda (R$):');
  const preco = parseInt(precoStr, 10);
  if (isNaN(preco) || preco < 0) return;
  try {
    await httpsCallable(functions, 'venderPeticao')({ peticao_id: peticaoId, preco });
    toast(`Petição publicada no mercado por R$${preco.toLocaleString('pt-BR')}!`, 'ok', 3000);
    if (window.JOGADOR) window.renderPeticoes(window.JOGADOR, document.getElementById('main-content'));
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
};

// ─── Bar Exam ─────────────────────────────────────────────────────────────────

window.tentarBarExam = async function() {
  const j = window.JOGADOR;
  if (!j) return;
  const tentativas = j.bar_exam_tentativas || 0;
  const taxa = tentativas === 0 ? 'gratuita' : `R$${Math.pow(2, tentativas - 1) * 2000} de taxa`;
  if (!confirm(`Fazer Exame OAB agora? (${taxa})`)) return;

  try {
    const res = await httpsCallable(functions, 'fazerBarExam')({});
    const d   = res.data;
    if (d.aprovado) {
      toast(`✅ OAB APROVADO! Score: ${d.score}/50. Você está habilitado para atuar!`, 'ok', 6000);
    } else {
      toast(`❌ Reprovado. Score: ${d.score}/50. Mínimo: 32,5. Próxima tentativa: mês ${d.proxima_tentativa_mes}.`, 'erro', 5000);
    }
    window.dispatchEvent(new CustomEvent('gamestate:reload'));
  } catch(e) {
    toast('Erro: ' + (e.message || e), 'erro');
  }
};

window.matricularPrep = async function() {
  const j = window.JOGADOR;
  if (!j) return;
  if (!confirm('Matricular no Bar Prep Course? (R$3.000 · 2 meses · +10 XP nas 4 skills principais)')) return;
  try {
    const res = await httpsCallable(functions, 'matricularBarPrep')({});
    toast(`✅ Matriculado! +10 XP nas skills chegam no mês ${res.data.mes_conclusao}.`, 'ok', 4000);
  } catch(e) { toast('Erro: ' + (e.message || e), 'erro'); }
};

// ─── Setlist Builder ──────────────────────────────────────────────────────────

/**
 * Renderiza o builder de setlist para um processo específico.
 * Chamado pelo processos.js quando processo está em status que requer setlist.
 */
window.renderSetlistBuilder = async function(processoId, j, containerEl) {
  containerEl.innerHTML = '<div style="padding:1rem;color:var(--ardosia2)">Carregando setlist…</div>';

  const [procSnap, petSnap] = await Promise.all([
    getDoc(doc(db, 'processos', processoId)),
    getDocs(query(collection(db, 'peticoes'),
      where('jogador_uid', '==', j.uid),
      where('status', '==', 'pronta'))),
  ]);

  if (!procSnap.exists()) { containerEl.innerHTML = '<div>Processo não encontrado.</div>'; return; }

  const proc    = procSnap.data();
  const tier    = proc.tier || 'D';
  const maxSlots = { D:4, C:5, B:6, A:7, S:8 }[tier] || 4;
  const peticoes = petSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Estado local do setlist
  const slots = Array.from({ length: maxSlots }, (_, i) => ({
    slot: i + 1, tipo: null, peticao_id: null, acao_tipo: null
  }));

  function _renderBuilder() {
    containerEl.innerHTML = `
      <div style="margin-bottom:1rem">
        <b>Setlist do Processo</b>
        <span style="font-size:.75rem;color:var(--ardosia2);margin-left:.5rem">Tier ${tier} · ${maxSlots} slots · ${proc.titulo || 'Processo'}</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem">
        ${slots.map((s, i) => `
          <div class="setlist-slot" style="display:flex;gap:.5rem;align-items:center;background:var(--fundo2);border-radius:6px;padding:.5rem">
            <div style="font-size:.72rem;color:var(--ardosia2);min-width:1.2rem">${i+1}</div>
            ${s.tipo === 'peticao' && s.peticao_id
              ? `<div style="flex:1;font-size:.78rem"><b>${peticoes.find(p=>p.id===s.peticao_id)?.nome || 'Petição'}</b></div>
                 <button class="btn btn-sm btn-ghost" onclick="window._slotRemover(${i})">✕</button>`
              : s.tipo === 'acao_processual' && s.acao_tipo
              ? `<div style="flex:1;font-size:.78rem"><b>${ACAO_LABELS[s.acao_tipo] || s.acao_tipo}</b></div>
                 <button class="btn btn-sm btn-ghost" onclick="window._slotRemover(${i})">✕</button>`
              : `<div style="flex:1;display:flex;gap:.4rem;flex-wrap:wrap">
                  <button class="btn btn-sm btn-ghost" onclick="window._slotAddPet(${i})">+ Petição</button>
                  <button class="btn btn-sm btn-ghost" onclick="window._slotAddAcao(${i})">+ Ação</button>
                </div>`}
          </div>`).join('')}
      </div>

      <button class="btn btn-prim btn-block" onclick="window._confirmarSetlist('${processoId}')">
        Montar Setlist e Avançar
      </button>`;

    // Expor helpers de slot no escopo global
    window._slotRemover = (i) => {
      slots[i] = { slot: i + 1, tipo: null, peticao_id: null, acao_tipo: null };
      _renderBuilder();
    };

    window._slotAddPet = (i) => {
      const lista = peticoes.map(p =>
        `${p.nome} [${DOC_LABELS[p.document_type]||p.document_type}] base:${p.nota_base}`
      );
      const idx = lista.length === 0
        ? -1
        : parseInt(prompt('Escolha a petição (número):\n' + lista.map((l,n)=>`${n+1}. ${l}`).join('\n')), 10) - 1;
      if (idx < 0 || idx >= peticoes.length) return;
      slots[i] = { slot: i + 1, tipo: 'peticao', peticao_id: peticoes[idx].id, acao_tipo: null };
      _renderBuilder();
    };

    window._confirmarSetlist = async (pid) => {
      const validos = slots.filter(s => s.tipo !== null);
      if (validos.length === 0) { toast('Adicione ao menos uma peça à setlist.', 'erro'); return; }
      if (validos[0].tipo !== 'peticao') { toast('Slot 1 deve ser uma Petição Inicial.', 'erro'); return; }
      try {
        const fn  = httpsCallable(functions, 'montarSetlist');
        const res = await fn({ processo_id: pid, slots: validos });
        toast(`Setlist montada! Nota provisória: ${res.data.nota_provisoria}/26. Evento: ${res.data.evento_categoria}`, 'ok', 5000);
        window.dispatchEvent(new CustomEvent('nav:painel', { detail: 'processos' }));
      } catch(e) { toast('Erro ao montar setlist: ' + (e.message || e), 'erro'); }
    };

    window._slotAddAcao = (i) => {
      const acoes = Object.entries(ACAO_LABELS);
      const idx   = parseInt(prompt('Ação processual:\n' + acoes.map(([,v],n)=>`${n+1}. ${v}`).join('\n')), 10) - 1;
      if (idx < 0 || idx >= acoes.length) return;
      slots[i] = { slot: i + 1, tipo: 'acao_processual', acao_tipo: acoes[idx][0], peticao_id: null };
      _renderBuilder();
    };
  }

  _renderBuilder();
};

// ─── Evento de Julgamento ────────────────────────────────────────────────────

window.renderEventoJulgamento = async function(processoId, containerEl) {
  const procSnap = await getDoc(doc(db, 'processos', processoId));
  if (!procSnap.exists()) return;
  const proc = procSnap.data();
  const ev   = proc.evento_julgamento;
  if (!ev || ev.escolha_feita !== null) return;

  const CAT_COR  = { oportunidade: 'var(--verde1)', complicacao: 'var(--laranja1)', crise: 'var(--erro)' };
  const CAT_ICON = { oportunidade: '✨', complicacao: '⚠️', crise: '🔴' };
  const isSupreme = ev.segundo_evento !== null;

  containerEl.innerHTML = `
    <div style="font-size:.78rem;color:var(--ardosia2);margin-bottom:.5rem">
      Nota provisória: <b>${proc.nota_provisoria || '—'}/26</b>
    </div>

    <div class="card" style="border-left:3px solid ${CAT_COR[ev.categoria]};margin-bottom:1rem">
      <div style="font-size:.72rem;color:${CAT_COR[ev.categoria]};font-weight:600;margin-bottom:.3rem">
        ${CAT_ICON[ev.categoria]} ${ev.categoria.toUpperCase()}${isSupreme ? ' — SUPREMO (1/2)' : ''}
      </div>
      <div style="font-size:.88rem;margin-bottom:1rem">${ev.descricao}</div>
      <div style="display:flex;flex-direction:column;gap:.5rem" id="ev-opcoes-1">
        ${(ev.opcoes || []).map(op => `
          <button class="btn btn-ghost" style="text-align:left;font-size:.82rem"
            data-escolha="${op.id}"
            onclick="window._selecionarOpcao1('${processoId}', '${op.id}', ${isSupreme})">
            ${op.label}
          </button>`).join('')}
      </div>
    </div>

    ${isSupreme
      ? `<div id="segundo-evento-container" style="display:none">
          <div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:.3rem">Segundo evento (gerado após sua primeira escolha):</div>
          <div class="card" style="border-left:3px solid var(--ardosia2)">
            <div style="color:var(--ardosia2);font-size:.8rem">
              Faça sua primeira escolha para ver o segundo evento.
            </div>
          </div>
        </div>`
      : ''}`;
};

window._selecionarOpcao1 = function(processoId, escolha, isSupreme) {
  document.querySelectorAll('#ev-opcoes-1 button').forEach(b => {
    b.style.background = b.dataset.escolha === escolha ? 'var(--fundo3, var(--borda2))' : '';
  });
  if (!isSupreme) {
    window.resolverEvento(processoId, escolha, null);
  } else {
    const seg = document.getElementById('segundo-evento-container');
    if (seg) {
      seg.style.display = 'block';
      seg.innerHTML = `<div style="font-size:.72rem;color:var(--ardosia2);margin-bottom:.5rem">Segundo evento — Supremo:</div>
        <div class="card" style="border-left:3px solid var(--laranja1)">
          <div style="font-size:.8rem;margin-bottom:.8rem">
            Com base na sua escolha, o Supremo apresenta nova situação. Escolha como agir:
          </div>
          <div style="display:flex;flex-direction:column;gap:.4rem">
            ${[
              { id: 'capitalizar',  label: 'Capitalizar — força máxima' },
              { id: 'suporte',      label: 'Suporte — ação defensiva' },
              { id: 'manter_curso', label: 'Manter o curso' },
            ].map(op => `
              <button class="btn btn-ghost" style="text-align:left;font-size:.82rem"
                onclick="window.resolverEvento('${processoId}', '${escolha}', '${op.id}')">
                ${op.label}
              </button>`).join('')}
          </div>
        </div>`;
    }
  }
};

window.resolverEvento = async function(processoId, escolha, segundaEscolha = null) {
  try {
    const payload = { processo_id: processoId, escolha };
    if (segundaEscolha) payload.segundo_evento_escolha = segundaEscolha;
    const fn  = httpsCallable(functions, 'resolverEventoJulgamento');
    const res = await fn(payload);
    const d   = res.data;
    const sinal = d.impacto_total >= 0 ? '+' : '';
    toast(`Evento resolvido! Impacto total: ${sinal}${d.impacto_total}. Abra o processo para processar a sentença.`, 'ok', 5000);
    window.fecharModal && window.fecharModal();
    window.dispatchEvent(new CustomEvent('gamestate:reload'));
  } catch(e) {
    toast('Erro: ' + (e.message || e), 'erro');
  }
};

export {};
