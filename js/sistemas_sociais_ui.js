/**
 * SISTEMAS SOCIAIS — Advocatus Online (GDD v5.1 §25-30)
 * functions/sistemas_sociais.js tinha 6 callables reais, zero UI.
 * Construída aqui: Moot Court, Intercâmbio, Podcast, Seguro Malpractice,
 * Pro Bono, Alumni Network. Alumni precisou de 2 peças novas de backend
 * antes de dar pra construir a UI (functions/julgadores_seed.js — persiste
 * os mesmos 57 julgadores fictícios já usados no recursal colegiado,
 * js/processos.js:JULGADORES_TJ/STJ/STF — e listarJulgadores, que também
 * atribui faculdade ao jogador na primeira visita, já que não existe
 * passo de escolha de faculdade na criação de personagem).
 */

import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const _SS_INTERCAMBIO = {
  eua:    { label: 'EUA', badge: '🇺🇸', duracao: 6,  custo: 20000, bonus_rep: 5, bonus_area: 'Empresarial' },
  uk:     { label: 'Reino Unido', badge: '🇬🇧', duracao: 8, custo: 25000, bonus_rep: 5, bonus_area: 'Cível' },
  europa: { label: 'Europa', badge: '🇪🇺', duracao: 6, custo: 18000, bonus_rep: 4, bonus_area: 'Trabalhista' },
  asia:   { label: 'Ásia', badge: '🌏', duracao: 12, custo: 30000, bonus_rep: 8, bonus_area: 'Tributário' },
};

const _SS_MALPRACTICE = {
  basico:        { label: 'Básico', cobertura_pct: 30, custo_mensal: 500 },
  intermediario: { label: 'Intermediário', cobertura_pct: 50, custo_mensal: 1200 },
  amplo:         { label: 'Amplo', cobertura_pct: 70, custo_mensal: 2500 },
};

const _SS_AREAS = [
  { k: 'area_employment', l: 'Trabalhista' }, { k: 'area_tax', l: 'Tributário' },
  { k: 'area_civil', l: 'Cível' }, { k: 'area_criminal', l: 'Criminal' },
  { k: 'area_corporate', l: 'Empresarial' }, { k: 'area_immigration', l: 'Imigração' },
  { k: 'area_bankruptcy', l: 'Rec. Judicial' },
];

window.renderSistemasSociais = function(j, el) {
  const mesGlobal = j.mes_global_pessoal || 0;

  // ── Moot Court ──
  const mootHtml = `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt)">🏆 Moot Court</div>
    <div style="font-size:.68rem;color:var(--txt3);margin:.3rem 0">Competição universitária contra um NPC. Sem impacto negativo na reputação — só ganha.</div>
    <div style="font-size:.65rem;color:var(--txt4);margin-bottom:.5rem">Histórico: ${j.moot_vitorias||0}/${j.moot_partidas||0} vitórias</div>
    <button class="btn btn-prim btn-block" onclick="window._ssMoot()">⚖️ Participar (8⚡)</button>
  </div>`;

  // ── Intercâmbio ──
  let intercambioHtml;
  if (j.intercambio_ativo) {
    const cfg = _SS_INTERCAMBIO[j.intercambio_destino] || {};
    const restam = (j.intercambio_mes_conclusao || 0) - mesGlobal;
    intercambioHtml = `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt)">✈️ Intercâmbio — ${cfg.badge||''} ${cfg.label||j.intercambio_destino}</div>
      <div style="font-size:.68rem;color:var(--txt3);margin-top:.3rem">${restam > 0 ? `Conclui em ${restam} mês(es)` : 'Concluindo no próximo avanço de mês'}</div>
    </div>`;
  } else {
    intercambioHtml = `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.5rem">✈️ Intercâmbio / Secondment</div>
      ${Object.entries(_SS_INTERCAMBIO).map(([k,c]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--bg2)">
          <div>
            <div style="font-size:.75rem;color:var(--txt)">${c.badge} ${c.label}</div>
            <div style="font-size:.62rem;color:var(--txt4)">${c.duracao} meses · R$ ${c.custo.toLocaleString('pt-BR')} · +${c.bonus_rep} Rep + bônus ${c.bonus_area}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="window._ssIntercambio('${k}')">Iniciar</button>
        </div>`).join('')}
    </div>`;
  }

  // Podcast/Talk Show foi pra Redes Sociais (js/ui-main.js:renderRedes) —
  // faz mais sentido junto de Comunicação Midiática/Autoridade/views do que
  // aqui. window._ssPodcast continua definida embaixo neste arquivo, só a
  // renderização do card que mudou de tela.

  // ── Seguro Malpractice ──
  let malpracticeHtml;
  if (j.malpractice_tier) {
    const cfg = _SS_MALPRACTICE[j.malpractice_tier] || {};
    malpracticeHtml = `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt)">🛡️ Seguro Malpractice — ${cfg.label||j.malpractice_tier}</div>
      <div style="font-size:.68rem;color:var(--txt3);margin-top:.3rem">Cobertura ${j.malpractice_cobertura||0}% · R$ ${(j.malpractice_custo_mensal||0).toLocaleString('pt-BR')}/mês</div>
    </div>`;
  } else {
    malpracticeHtml = `<div class="card" style="margin-bottom:.7rem">
      <div style="font-weight:700;font-size:.82rem;color:var(--txt);margin-bottom:.5rem">🛡️ Seguro Malpractice</div>
      <div style="font-size:.65rem;color:var(--txt4);margin-bottom:.4rem">Indeniza parte do valor da causa se você perder um processo. Permanente uma vez contratado.</div>
      ${Object.entries(_SS_MALPRACTICE).map(([k,c]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--bg2)">
          <div>
            <div style="font-size:.75rem;color:var(--txt)">${c.label}</div>
            <div style="font-size:.62rem;color:var(--txt4)">${c.cobertura_pct}% cobertura · R$ ${c.custo_mensal.toLocaleString('pt-BR')}/mês</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="window._ssMalpractice('${k}')">Contratar</button>
        </div>`).join('')}
    </div>`;
  }

  // ── Pro Bono ──
  const probonoHtml = `<div class="card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt)">🤝 Caso Pro Bono</div>
    <div style="font-size:.68rem;color:var(--txt3);margin:.3rem 0">Sem honorários, mas reputação sobe 2,5× mais rápido. Total feito: ${j.pro_bono_total||0}.</div>
    ${j.oab
      ? `<button class="btn btn-prim btn-block" onclick="window._ssProBono()">Abrir Caso Pro Bono</button>`
      : `<div style="font-size:.65rem;color:var(--txt4)">Requer OAB.</div>`}
  </div>`;

  // ── Alumni Network — carregada à parte (async), preenche #ss-alumni-area ──
  const alumniHtml = `<div class="card" id="ss-alumni-card" style="margin-bottom:.7rem">
    <div style="font-weight:700;font-size:.82rem;color:var(--txt)">🎓 Alumni Network</div>
    <div id="ss-alumni-area" style="font-size:.7rem;color:var(--txt4);margin-top:.4rem">Carregando julgadores…</div>
  </div>`;

  el.innerHTML = `
    ${window._capaHeader('VIDA SOCIAL & CARREIRA · ADVOCATUS ONLINE', '🌐 Sistemas Sociais', '')}
    ${mootHtml}${intercambioHtml}${malpracticeHtml}${probonoHtml}${alumniHtml}`;

  window._ssCarregarAlumni();
};

let _ssAlumniSoMinha = false;
window._ssCarregarAlumni = async function() {
  const areaEl = document.getElementById('ss-alumni-area');
  if (!areaEl) return;
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'listarJulgadores');
    const r  = await fn({});
    const { faculdade, julgadores, seed_pendente } = r.data;
    if (seed_pendente) {
      areaEl.innerHTML = `
        <div style="margin-bottom:.4rem">Sua faculdade: <b style="color:var(--txt)">${faculdade}</b></div>
        <div style="color:var(--txt4)">Roster de julgadores ainda não foi gerado neste servidor (admin precisa rodar o seed em admin.html → Ferramentas Beta).</div>`;
      return;
    }
    const lista = _ssAlumniSoMinha ? julgadores.filter(jl => jl.mesma_faculdade) : julgadores;
    areaEl.innerHTML = `
      <div style="margin-bottom:.5rem">Sua faculdade: <b style="color:var(--txt)">${faculdade}</b> — registrar como colega de curso de um julgador dá <b>+2 Networking</b> (uma vez por julgador).</div>
      <label style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;cursor:pointer">
        <input type="checkbox" ${_ssAlumniSoMinha?'checked':''} onchange="window._ssAlumniToggleFiltro(this.checked)"> só da minha faculdade
      </label>
      <div style="max-height:280px;overflow-y:auto">
        ${lista.map(jl => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--bg2)">
            <div>
              <div style="font-size:.75rem;color:var(--txt)">${jl.nome} <span style="color:var(--txt4);font-size:.62rem">· ${jl.instancia}</span></div>
              <div style="font-size:.62rem;color:${jl.mesma_faculdade?'var(--verde2)':'var(--txt4)'}">${jl.faculdade}</div>
            </div>
            ${jl.ja_alumni
              ? `<span style="font-size:.65rem;color:var(--verde2)">✅ colega</span>`
              : jl.mesma_faculdade
                ? `<button class="btn btn-ghost btn-sm" onclick="window._ssRegistrarAlumni('${jl.id}')">Registrar</button>`
                : `<button class="btn btn-ghost btn-sm" disabled title="Faculdade diferente">Registrar</button>`}
          </div>`).join('')}
      </div>`;
  } catch (e) {
    areaEl.innerHTML = `<div style="color:var(--verm2)">Erro ao carregar: ${e.message||e}</div>`;
  }
};

window._ssAlumniToggleFiltro = function(checked) {
  _ssAlumniSoMinha = checked;
  window._ssCarregarAlumni();
};

window._ssRegistrarAlumni = async function(julgadorId) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'registrarAlumni');
    const r  = await fn({ julgador_id: julgadorId });
    window.toast(r.data.ja_registrado ? 'Já era colega.' : `✅ Colega de curso registrado! +${r.data.bonus_networking||2} Networking.`, 'ok', 3000);
    window._ssCarregarAlumni();
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._ssMoot = async function() {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'participarMootCourt');
    const r = await fn({});
    window.toast(r.data.vitoria ? `🏆 Vitória! +R$ ${r.data.premio.toLocaleString('pt-BR')}` : 'Derrota, mas +XP.', r.data.vitoria?'ok':'', 3000);
    setTimeout(() => window.navTo?.('sistemas_sociais', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._ssIntercambio = async function(destino) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'iniciarIntercambio');
    await fn({ destino });
    window.toast('✅ Intercâmbio iniciado.', 'ok', 2500);
    setTimeout(() => window.navTo?.('sistemas_sociais', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._ssConteudoEducativo = async function() {
  try {
    const area = document.getElementById('conteudo-edu-area')?.value || 'civil';
    const fn = httpsCallable(window.FB_FUNCTIONS, 'gravarConteudoEducativo');
    const r = await fn({ area });
    window.toast(r.data.msg || (r.data.viral ? '🔥 Viralizou!' : 'Conteúdo publicado.'), 'ok', 3800);
    setTimeout(() => window.navTo?.('redes', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._ssMalpractice = async function(tier) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'contratarSeguroMalpractice');
    await fn({ tier });
    window.toast('✅ Seguro contratado.', 'ok', 2500);
    setTimeout(() => window.navTo?.('sistemas_sociais', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};

window._ssProBono = function() {
  window.abrirModal('🤝 Abrir Caso Pro Bono',
    `<div class="campo"><label>Área</label>
      <select id="ss-pb-area">${_SS_AREAS.map(a=>`<option value="${a.k}">${a.l}</option>`).join('')}</select>
    </div>
    <div class="campo"><label>Descrição (opcional)</label><input type="text" id="ss-pb-desc" maxlength="120" placeholder="Ex: Defesa de família de baixa renda"></div>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-prim" style="flex:1" onclick="window._ssConfirmarProBono()">Abrir →</button>
    </div>`);
};

window._ssConfirmarProBono = async function() {
  const practice_area = document.getElementById('ss-pb-area')?.value;
  const descricao = document.getElementById('ss-pb-desc')?.value || null;
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'abrirCasoProBono');
    await fn({ practice_area, descricao });
    window.toast('✅ Caso Pro Bono aberto.', 'ok', 2500);
    window.fecharModal();
    setTimeout(() => window.navTo?.('sistemas_sociais', null), 500);
  } catch (e) { window.toast(e.message || 'Erro.', 'ko'); }
};
