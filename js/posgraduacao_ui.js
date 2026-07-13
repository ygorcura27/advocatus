/**
 * PÓS-GRADUAÇÃO — Advocatus Online
 * Sistema real e completo no backend (functions/posgraduacao.js —
 * matricularPosGraduacao/compararecerAula/darAula/submeterDissertacao)
 * que nunca teve tela nenhuma. Mestrado/LLM → Doutorado/JSD → Cátedra.
 */

import { collection, query, where, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

// mes_conclusao é um total contínuo (ano_pessoal*12+mes_pessoal, mesmo
// formato de mesTotalPessoal em functions/*.js) — exibir cru ("mês 330")
// não diz nada pro jogador. Converte pro par (mês 1-12, ano) que ele já
// reconhece do resto da UI.
function _formatarMesGlobal(mesTotal) {
  const ano = Math.floor((mesTotal || 0) / 12);
  const mes = (mesTotal || 0) % 12 + 1;
  return `mês ${mes} do ano ${ano}`;
}

const _PG_PROGRAMAS = {
  mestrado: {
    label: 'Mestrado / LLM', duracao_meses: 12,
    req_legal_research: 20, req_legal_drafting: 20, req_didatica: 10, req_area: 15,
    req_cargo: ['asc','soc','snm','snr'], categoria_peca: 'dissertacao', nota_min_peca: 18,
    bonus_pct: 10, custo_matricula: 15000, salario_dar_aula: 3000,
  },
  doutorado: {
    label: 'Doutorado / JSD', duracao_meses: 24,
    req_legal_research: 30, req_legal_drafting: 30, req_didatica: 20, req_area: 25,
    req_cargo: ['snr','asc','soc','snm'], req_grau_anterior: 'mestrado', categoria_peca: 'tese', nota_min_peca: 22,
    bonus_pct: 25, custo_matricula: 25000, salario_dar_aula: 6000,
  },
  catedral: {
    label: 'Cátedra', duracao_meses: 0, req_grau_anterior: 'doutorado',
    req_livros: 2, req_citacoes: 500, req_reputacao: 60, custo_matricula: 0, salario_dar_aula: 12000,
  },
};

const _PG_AREAS = [
  { k: 'area_employment', l: 'Trabalhista' }, { k: 'area_tax', l: 'Tributário' },
  { k: 'area_civil', l: 'Cível' }, { k: 'area_criminal', l: 'Criminal' },
  { k: 'area_corporate', l: 'Empresarial' }, { k: 'area_immigration', l: 'Imigração' },
  { k: 'area_bankruptcy', l: 'Rec. Judicial' },
];

function _reqLinha(label, atual, min) {
  const ok = atual >= min;
  return `<div style="font-size:.68rem;color:${ok?'var(--verde2)':'var(--txt4)'}">${ok?'✅':'○'} ${label}: ${atual}/${min}</div>`;
}

window.renderPosGraduacao = async function(j, el) {
  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">🎓 Pós-Graduação</div></div><div class="card">Carregando...</div>`;
  const skJur = j.skills_jur || {};
  const status = j.posgrad_status;

  // ── CURSANDO ──────────────────────────────────────────────────────
  if (status === 'cursando') {
    const cfg = _PG_PROGRAMAS[j.posgrad_programa];
    const freq = j.posgrad_frequencia || 0;
    const freqMaxima = freq >= 12;
    const pct = Math.min(100, Math.round(freq / 12 * 100));
    const jaCompareceuMes = j.posgrad_ultima_aula === (j.mes_global_pessoal || 0);

    let pecasHtml = '';
    try {
      const snap = await getDocs(query(collection(db, 'peticoes'),
        where('jogador_uid', '==', j.uid), where('categoria', '==', cfg.categoria_peca)));
      const pecas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Antes: só oferecia "Escrever" quando NÃO existia nenhuma peça — se a
      // nota saísse insuficiente, a peça ficava "pronta" com nota travada
      // pra sempre e não tinha como reescrever nem tentar de novo. Agora só
      // trava enquanto uma peça está em composição (evita duplicar em
      // paralelo); rejeitada ou com nota baixa sempre pode escrever outra.
      const emComposicao = pecas.some(p => p.status === 'em_composicao');
      const pecasCards = pecas.map(p => `
        <div class="card" style="margin-bottom:.4rem">
          <div style="font-weight:600;font-size:.78rem;color:var(--txt)">${p.titulo}</div>
          <div style="font-size:.68rem;color:var(--txt3)">
            ${p.status === 'em_composicao' ? `⏳ em composição (pronta ${_formatarMesGlobal(p.mes_conclusao)})` : `nota ${p.nota_teto}/26 (mín. ${cfg.nota_min_peca})${p.nota_teto < cfg.nota_min_peca ? ' · nota insuficiente' : ''}`}
          </div>
          ${p.status === 'pronta' ? `<button class="btn btn-prim btn-sm" style="margin-top:.4rem" onclick="window._pgSubmeter('${p.id}')">Submeter</button>` : ''}
        </div>`).join('');
      const escreverBtn = emComposicao ? '' : `<button class="btn btn-prim btn-block" style="margin-top:.4rem" onclick="window._pgEscrever('${cfg.categoria_peca}')">✍️ ${pecas.length ? 'Escrever nova versão' : `Escrever ${cfg.categoria_peca === 'tese' ? 'Tese' : 'Dissertação'}`}</button>`;
      pecasHtml = pecasCards + escreverBtn;
    } catch (e) { pecasHtml = `<div class="card" style="color:var(--txt4)">Erro ao carregar peças.</div>`; }

    el.innerHTML = `
      ${window._capaHeader('CURSOS & PÓS-GRADUAÇÃO · ADVOCATUS ONLINE', `🎓 ${cfg.label}`, `<span class="pill pill-oab">${freq}/12 meses</span>`)}
      <div class="card" style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--txt3);margin-bottom:.3rem">
          <span>Frequência</span><span>${freq}/12 meses</span>
        </div>
        <div class="skill-bar"><div class="skill-fill" style="width:${pct}%"></div></div>
        <div style="font-size:.65rem;color:var(--txt4);margin-top:.3rem">Faltas: ${j.posgrad_faltas || 0} · mínimo 75% de frequência pra não reprovar</div>
        <button class="btn btn-prim btn-block" style="margin-top:.7rem" ${(jaCompareceuMes||freqMaxima)?'disabled':''} onclick="window._pgComparecer()">
          ${freqMaxima ? '✅ Frequência máxima (12/12)' : jaCompareceuMes ? '✅ Já compareceu este mês' : '📖 Comparecer à Aula (5⚡)'}
        </button>
      </div>
      <div style="font-size:.78rem;font-weight:600;margin-bottom:.5rem;color:var(--txt)">${cfg.categoria_peca === 'tese' ? 'Tese' : 'Dissertação'}</div>
      ${pecasHtml}`;
    return;
  }

  // ── CONCLUÍDO (mestrado ou doutorado, sem cursar outro agora) ──────
  if (j.posgrad_concluido && j.posgrad_concluido !== 'catedral') {
    const grauCfg = _PG_PROGRAMAS[j.posgrad_concluido];
    const podeDarAula = (j.didatica_academica || 0) >= 10;
    const jaDeuAulaMes = j.posgrad_ultima_aula_dada === (j.mes_global_pessoal || 0);
    const proximoPrograma = j.posgrad_concluido === 'mestrado' ? 'doutorado' : (j.posgrad_concluido === 'doutorado' ? 'catedral' : null);

    el.innerHTML = `
      ${window._capaHeader('CURSOS & PÓS-GRADUAÇÃO · ADVOCATUS ONLINE', '🎓 Pós-Graduação', `<span class="pill pill-oab">${grauCfg.label} concluído</span>`)}
      <div class="card" style="margin-bottom:1rem;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--navy3)">${grauCfg.label} concluído</div>
        <div style="font-size:.72rem;color:var(--txt3);margin-top:.3rem">Nota final: ${j.posgrad_nota_final || '—'}/26 · Didática Acadêmica: ${j.didatica_academica || 0}</div>
      </div>
      <div class="card" style="margin-bottom:1rem">
        <div style="font-size:.78rem;font-weight:600;margin-bottom:.4rem;color:var(--txt)">Dar Aula <span style="font-size:.62rem;color:var(--txt4);font-weight:400">R$ ${grauCfg.salario_dar_aula.toLocaleString('pt-BR')} + Didática +1 + 5⚡</span></div>
        ${podeDarAula
          ? `<button class="btn btn-prim btn-block" ${jaDeuAulaMes?'disabled':''} onclick="window._pgDarAula()">${jaDeuAulaMes?'✅ Já deu aula este mês':'🎤 Dar Aula'}</button>`
          : `<div style="font-size:.68rem;color:var(--txt4)">Requer Didática Acadêmica ≥ 10 (atual: ${j.didatica_academica||0})</div>`}
      </div>
      ${proximoPrograma ? `<div style="font-size:.78rem;font-weight:600;margin-bottom:.5rem;color:var(--txt)">Próximo passo</div>${_pgCardsMatricula(j, [proximoPrograma])}` : ''}`;
    return;
  }

  // ── NÃO MATRICULADO ─────────────────────────────────────────────────
  el.innerHTML = `
    ${window._capaHeader('CURSOS & PÓS-GRADUAÇÃO · ADVOCATUS ONLINE', '🎓 Pós-Graduação', '')}
    <div class="card" style="font-size:.72rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      Árvore real: Mestrado/LLM → Doutorado/JSD → Cátedra. Cada etapa exige skills, cargo e (às vezes) o grau anterior.
    </div>
    ${_pgCardsMatricula(j, ['mestrado','doutorado','catedral'])}`;
};

function _pgCardsMatricula(j, programas) {
  const skJur = j.skills_jur || {};
  return programas.map(prog => {
    const cfg = _PG_PROGRAMAS[prog];
    const grauOk = !cfg.req_grau_anterior || j.posgrad_concluido === cfg.req_grau_anterior;
    const cargoOk = !cfg.req_cargo || cfg.req_cargo.includes(j.cargo_id);
    const reqsHtml = [
      cfg.req_legal_research ? _reqLinha('Legal Research', skJur.legal_research||0, cfg.req_legal_research) : '',
      cfg.req_legal_drafting ? _reqLinha('Legal Drafting', skJur.legal_drafting||0, cfg.req_legal_drafting) : '',
      cfg.req_didatica ? _reqLinha('Didática Acadêmica', j.didatica_academica||0, cfg.req_didatica) : '',
      cfg.req_livros ? _reqLinha('Livros publicados', j.livros_publicados||0, cfg.req_livros) : '',
      cfg.req_citacoes ? _reqLinha('Citações', j.citacoes_totais||0, cfg.req_citacoes) : '',
      cfg.req_reputacao ? _reqLinha('Reputação', j.reputacao||0, cfg.req_reputacao) : '',
    ].filter(Boolean).join('');

    const areaSelect = cfg.req_area ? `
      <select id="pg-area-${prog}" style="width:100%;background:var(--bg2);border:var(--borda);border-radius:var(--r);color:var(--txt);font-size:.72rem;padding:.35rem;margin-top:.4rem">
        ${_PG_AREAS.map(a => `<option value="${a.k}">${a.l} (${skJur[a.k]||0}/${cfg.req_area})</option>`).join('')}
      </select>` : '';

    return `<div class="card" style="margin-bottom:.7rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:.85rem;color:var(--txt)">${cfg.label}</div>
        <div style="font-size:.68rem;color:var(--txt3)">${cfg.custo_matricula > 0 ? `R$ ${cfg.custo_matricula.toLocaleString('pt-BR')}` : 'aprovação direta'}</div>
      </div>
      ${!grauOk ? `<div style="font-size:.68rem;color:var(--txt4);margin-top:.3rem">○ Requer ${_PG_PROGRAMAS[cfg.req_grau_anterior]?.label || cfg.req_grau_anterior} concluído</div>` : ''}
      ${!cargoOk ? `<div style="font-size:.68rem;color:var(--txt4);margin-top:.3rem">○ Cargo insuficiente</div>` : ''}
      <div style="margin-top:.4rem">${reqsHtml}</div>
      ${areaSelect}
      <button class="btn btn-prim btn-block" style="margin-top:.6rem" ${(!grauOk||!cargoOk)?'disabled':''} onclick="window._pgMatricular('${prog}')">Matricular</button>
    </div>`;
  }).join('');
}

window._pgMatricular = async function(programa) {
  const sel = document.getElementById(`pg-area-${programa}`);
  const practice_area = sel ? sel.value : null;
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'matricularPosGraduacao');
    const r = await fn({ programa, practice_area });
    window.toast(`✅ Matriculado em ${programa}.`, 'ok', 2500);
    setTimeout(() => window.navTo?.('posgraduacao', null), 500);
  } catch (e) { window.toast(e.message || 'Erro ao matricular.', 'ko'); }
};

window._pgComparecer = async function() {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'compararecerAula');
    await fn({});
    window.toast('✅ Presença registrada.', 'ok', 2000);
    setTimeout(() => window.navTo?.('posgraduacao', null), 400);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._pgDarAula = async function() {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'darAula');
    const r = await fn({});
    window.toast(`✅ Aula dada! +R$ ${r.data.salario.toLocaleString('pt-BR')}`, 'ok', 3000);
    setTimeout(() => window.navTo?.('posgraduacao', null), 400);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._pgEscrever = async function(categoria) {
  const j = window.JOGADOR;
  // j.posgrad_area vem no formato 'area_tax' (mesma chave usada pro check de
  // requisito em matricularPosGraduacao, skJur[practice_area]) — mas
  // calcularNotaTeto (functions/peticoes.js) espera a chave NUA ('tax') e
  // prefixa 'area_' sozinho. Sem o replace, a nota_teto da obra nunca batia
  // com nenhuma skill de Practice Area Mastery e caía sempre no piso (0.55x).
  const practice_area = (j.posgrad_area || 'area_civil').replace(/^area_/, '');
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'confeccionarObra');
    const r = await fn({ categoria, practice_area, titulo: null });
    window.toast(`✅ ${categoria === 'tese' ? 'Tese' : 'Dissertação'} iniciada — pronta ${_formatarMesGlobal(r.data.mes_conclusao)}.`, 'ok', 3500);
    setTimeout(() => window.navTo?.('posgraduacao', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._pgSubmeter = async function(peticao_id) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'submeterDissertacao');
    const r = await fn({ peticao_id });
    if (r.data.aprovado) {
      window.toast(`🎓 Aprovado! Nota ${r.data.nota}/26.`, 'ok', 4000);
    } else {
      window.toast(r.data.msg || 'Nota insuficiente.', 'ko', 4000);
    }
    setTimeout(() => window.navTo?.('posgraduacao', null), 600);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};
