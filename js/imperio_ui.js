/**
 * IMPÉRIO — modo Tycoon (idle), estilo "Police Chief" — Advocatus Online
 * O escritório em corte: cada andar é uma divisão, com as mesas dos
 * advogados. Contrate, treine, invista em tecnologia, amplie a sala, cumpra
 * missões para ganhar ⭐ e abrir as divisões seguintes.
 * Todo valor vem do servidor (functions/tycoon.js); aqui o caixa só é
 * animado entre uma resposta e outra.
 */
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { functions } from './firebase-init.js';

const VISUAL = {
  civel:          { icone: '⚖️', cor: '#2f4a7a', txt: 'Contratos, cobranças, indenizações.' },
  familia:        { icone: '👪', cor: '#6b3f5f', txt: 'Divórcios, inventários, guarda.' },
  trabalhista:    { icone: '👷', cor: '#7a5a2a', txt: 'Reclamações e defesa de empresas.' },
  consumidor:     { icone: '🛒', cor: '#2f6b5a', txt: 'Bancos, planos de saúde, companhias aéreas.' },
  criminal:       { icone: '🚔', cor: '#5a2f2f', txt: 'Defesa em inquéritos e no júri.' },
  previdenciario: { icone: '👵', cor: '#3f5f6b', txt: 'Aposentadorias e benefícios do INSS.' },
  tributario:     { icone: '🧾', cor: '#4a4a7a', txt: 'Planejamento e contencioso fiscal.' },
  empresarial:    { icone: '🏢', cor: '#2a5a7a', txt: 'Societário, contratos e recuperação judicial.' },
  ma:             { icone: '🤝', cor: '#6b5a2a', txt: 'Fusões, aquisições e due diligence.' },
  digital:        { icone: '💻', cor: '#2a6b6b', txt: 'LGPD, startups e crimes digitais.' },
  ambiental:      { icone: '🌳', cor: '#3a6b3a', txt: 'Licenciamento e grandes passivos ambientais.' },
  superiores:     { icone: '🏛️', cor: '#7a6a3a', txt: 'Sustentações no STJ e no STF.' },
};
const ITENS = [
  { id: 'equipe',     icone: '👔', nome: 'Advogados',    efeito: d => `${d.equipe}/${d.vagas} na sala · cada um rende ${rs(d.renda_por_adv)}/s` },
  { id: 'treino',     icone: '🎓', nome: 'Treinamento',  efeito: d => `Nível ${d.itens.treino.nivel}/${d.itens.treino.max} · +10% por nível` },
  { id: 'tecnologia', icone: '🖥️', nome: 'Tecnologia',   efeito: d => `Nível ${d.itens.tecnologia.nivel}/${d.itens.tecnologia.max} · ×1,05 por nível` },
  { id: 'sala',       icone: '🚪', nome: 'Ampliar sala', efeito: d => `Nível ${d.itens.sala.nivel}/${d.itens.sala.max} · +2 mesas` },
];
const PELE = ['#f1c7a3', '#d9a27a', '#b07a52', '#8a5a3c', '#5e3d2a'];
const CABELO = ['#2a1d14', '#5a3a1f', '#111', '#8a6a3a', '#3b2a20', '#777'];

const fn = (nome) => httpsCallable(functions, nome);
let _imp = null, _offset = 0, _aberta = null, _timer = null, _sync = null, _ocupado = false;

// ─── formatação ─────────────────────────────────────────────────────────────
const ESCALAS = [[1e18, 'quint.'], [1e15, 'quatri.'], [1e12, 'tri'], [1e9, 'bi'], [1e6, 'mi'], [1e3, 'mil']];
function rs(v) {
  v = Math.max(0, v || 0);
  for (const [n, s] of ESCALAS) if (v >= n) return `R$ ${(v / n).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s}`;
  const dec = v < 100 ? 2 : 0;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: dec })}`;
}
const caixaAgora = () => !_imp ? 0 : _imp.caixa + _imp.por_segundo * Math.max(0, Date.now() + _offset - _imp.agora) / 1000;

// ─── chamadas ───────────────────────────────────────────────────────────────
async function chamar(nome, dados, el) {
  if (_ocupado) return null;
  _ocupado = true;
  try {
    const r = await fn(nome)(dados || {});
    _imp = r.data.imperio;
    _offset = _imp.agora - Date.now();
    desenhar(el);
    return r.data;
  } catch (e) {
    window.toast?.((e.message || 'Erro').replace('Firebase: ', ''), 'ko', 3000);
    return null;
  } finally { _ocupado = false; }
}

// ─── desenho ────────────────────────────────────────────────────────────────
function mesa(i, ocupada) {
  if (!ocupada) return `<div class="imp-mesa vazia" title="Mesa livre"><span>+</span></div>`;
  const pele = PELE[(i * 7 + 3) % PELE.length], cab = CABELO[(i * 5 + 1) % CABELO.length];
  return `<div class="imp-mesa" style="--d:${(i % 5) * 0.37}s">
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <g class="imp-adv"><circle cx="22" cy="12" r="6" fill="${pele}"/><path d="M16 11a6 6 0 0 1 12 0c0-4-2.5-6-6-6s-6 2-6 6z" fill="${cab}"/>
      <path d="M13 30c0-7 4-11 9-11s9 4 9 11z" fill="#1c2a4a"/><path d="M21 19h2l1 7-2 2-2-2z" fill="#d9b573"/></g>
      <rect x="6" y="27" width="32" height="4" rx="1" fill="#6b4a2f"/><rect x="9" y="31" width="3" height="10" fill="#4e3522"/><rect x="32" y="31" width="3" height="10" fill="#4e3522"/>
      <rect x="25" y="20" width="10" height="7" rx="1" fill="#0d1424" stroke="#5fc79a" stroke-width=".8"/><rect x="9" y="25" width="8" height="2" fill="#efe6d2"/>
    </svg></div>`;
}

function andar(d) {
  const v = VISUAL[d.id] || {};
  const caixa = caixaAgora();
  if (!d.aberta) {
    const podeEstrelas = _imp.estrelas >= d.estrelas_req;
    return `
    <section class="imp-andar fechado" data-div="${d.id}">
      <div class="imp-sala" style="--cor:${v.cor}"><div class="imp-obra">${v.icone}<b>${d.nome}</b><small>${v.txt}</small></div></div>
      <div class="imp-info">
        <div class="imp-titulo">Próxima divisão</div>
        <div class="imp-req ${podeEstrelas ? 'ok' : ''}">⭐ ${_imp.estrelas}/${d.estrelas_req} estrelas</div>
        <button type="button" class="imp-btn" data-abrir="${d.id}" data-preco="${d.preco_abrir}" data-estrelas="${d.estrelas_req}" ${podeEstrelas && caixa >= d.preco_abrir ? '' : 'disabled'}>Abrir · ${rs(d.preco_abrir)}</button>
      </div>
    </section>`;
  }
  const mesas = Array.from({ length: d.vagas }, (_, i) => mesa(i, i < d.equipe)).join('');
  const ctr = d.itens.equipe;
  const aberto = _aberta === d.id;
  return `
  <section class="imp-andar ${aberto ? 'aberto' : ''}" data-div="${d.id}">
    <div class="imp-sala" style="--cor:${v.cor}">
      <div class="imp-placa">${v.icone} ${d.nome}</div>
      <div class="imp-mesas">${mesas}</div>
      <div class="imp-ganho" id="imp-ganho-${d.id}"></div>
    </div>
    <div class="imp-info">
      <div class="imp-titulo">${d.nome} <span class="imp-nivel">Nv ${d.nivel}</span></div>
      <div class="imp-renda">${rs(d.renda)}/s</div>
      <div class="imp-botoes">
        <button type="button" class="imp-btn" data-item="equipe" data-div="${d.id}" data-preco="${ctr.preco ?? ''}" ${ctr.preco != null && caixa >= ctr.preco ? '' : 'disabled'}>
          ${ctr.preco == null ? 'Sala cheia' : `👔 Contratar · ${rs(ctr.preco)}`}</button>
        <button type="button" class="imp-btn sec" data-toggle="${d.id}" aria-expanded="${aberto}">Aprimorar ${aberto ? '▴' : '▾'}</button>
      </div>
    </div>
    ${aberto ? `<div class="imp-gaveta">${ITENS.map(it => {
      const x = d.itens[it.id];
      return `<div class="imp-up">
        <span class="imp-up-ic">${it.icone}</span>
        <div class="imp-up-txt"><b>${it.nome}</b><small>${it.efeito(d)}</small></div>
        <button type="button" class="imp-btn" data-item="${it.id}" data-div="${d.id}" data-preco="${x.preco ?? ''}" ${x.preco != null && caixa >= x.preco ? '' : 'disabled'}>
          ${x.preco == null ? (it.id === 'equipe' ? 'Sala cheia' : 'Máximo') : rs(x.preco)}</button>
      </div>`;
    }).join('')}</div>` : ''}
  </section>`;
}

function missoes() {
  return `
  <div class="imp-missoes">
    <div class="imp-missoes-tit">🎯 Missões <small>${_imp.missoes_feitas}/${_imp.missoes_total}</small></div>
    <div class="imp-missoes-lista">
    ${_imp.missoes.map(m => `
      <div class="imp-missao ${m.progresso >= 1 ? 'pronta' : ''}">
        <div class="imp-missao-txt">${m.texto}<small>⭐ +1 · ${rs(m.recompensa)}</small></div>
        ${m.progresso >= 1
          ? `<button type="button" class="imp-btn" data-missao="${m.id}">Resgatar</button>`
          : `<div class="imp-missao-barra"><i style="width:${Math.round(m.progresso * 100)}%"></i></div>`}
      </div>`).join('') || '<div class="imp-missao">Todas as missões concluídas. 🏆</div>'}
    </div>
  </div>`;
}

function desenhar(el) {
  if (!_imp || !el.isConnected) return;
  const abertas = _imp.divisoes.filter(d => d.aberta);
  const proxima = _imp.divisoes.find(d => !d.aberta);
  const restantes = _imp.divisoes.filter(d => !d.aberta).length - (proxima ? 1 : 0);
  const est = el.querySelector('.imp-estrelas');
  est.textContent = `⭐ ${_imp.estrelas}`;
  est.title = `+${Math.round(_imp.bonus_estrelas * 100)}% de receita`;
  el.querySelector('.imp-corpo').innerHTML = `
    ${missoes()}
    <div class="imp-predio">
      <div class="imp-telhado">${restantes > 0 ? `🏗️ Mais ${restantes} divisões a descobrir` : '🏆 Prédio completo'}</div>
      ${proxima ? andar(proxima) : ''}
      ${abertas.slice().reverse().map(andar).join('')}
      <div class="imp-terreo">Térreo · Recepção</div>
    </div>`;
  tique(el);
}

// Números e botões sem refazer o HTML (4x por segundo).
let _ultGanho = 0;
function tique(el) {
  if (!_imp || !el.isConnected) { parar(); return; }
  const caixa = caixaAgora();
  const cx = el.querySelector('#imp-caixa'); if (cx) cx.textContent = rs(caixa);
  const ps = el.querySelector('#imp-ps'); if (ps) ps.textContent = `${rs(_imp.por_segundo)}/s`;
  el.querySelectorAll('button[data-preco]').forEach(b => {
    if (b.dataset.preco === '') return;
    const okEst = !b.dataset.estrelas || _imp.estrelas >= Number(b.dataset.estrelas);
    b.disabled = !(okEst && caixa >= Number(b.dataset.preco));
  });
  // "+R$" subindo de cada sala a cada 2s
  if (Date.now() - _ultGanho > 2000) {
    _ultGanho = Date.now();
    for (const d of _imp.divisoes) {
      const g = d.aberta && d.renda && el.querySelector(`#imp-ganho-${d.id}`);
      if (!g) continue;
      const s = document.createElement('span'); s.textContent = `+${rs(d.renda * 2)}`;
      g.appendChild(s); setTimeout(() => s.remove(), 1600);
    }
  }
}
function parar() { clearInterval(_timer); clearInterval(_sync); _timer = _sync = null; }

function carregarCss() {
  if (document.getElementById('css-imperio')) return;
  const l = document.createElement('link'); l.id = 'css-imperio'; l.rel = 'stylesheet'; l.href = 'css/imperio.css'; document.head.appendChild(l);
}

// ─── entrada ────────────────────────────────────────────────────────────────
window.renderImperio = async function(j, main) {
  carregarCss();
  parar();
  const nome = j.escritorio_nome || (j.nome_personagem ? j.nome_personagem.split(' ')[0] + ' Advocacia' : 'Seu escritório');
  main.innerHTML = `
  <div class="imp-wrap">
    <header class="imp-hud">
      <div><div class="imp-hud-nome">${nome}</div><div class="imp-hud-caixa" id="imp-caixa">—</div><div class="imp-hud-sub" id="imp-ps">—</div></div>
      <div class="imp-hud-dir">
        <span class="imp-estrelas">⭐ 0</span>
        <button type="button" class="imp-btn sec" data-mapa="1" title="O Rio de Janeiro em 3D">🗺️ Cidade</button>
      </div>
    </header>
    <div class="imp-corpo"><div class="imp-carregando">Abrindo o escritório…</div></div>
  </div>`;

  main.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.mapa) { window.navTo?.('mapa', null); return; }
    if (b.dataset.toggle) { _aberta = _aberta === b.dataset.toggle ? null : b.dataset.toggle; desenhar(main); return; }
    if (b.dataset.item) { await chamar('tycoonMelhorar', { divisao: b.dataset.div, item: b.dataset.item, qtd: 1 }, main); return; }
    if (b.dataset.abrir) {
      const r = await chamar('tycoonAbrir', { divisao: b.dataset.abrir }, main);
      if (r) { _aberta = b.dataset.abrir; desenhar(main); window.toast?.('🎉 Nova divisão aberta!', 'ok', 2500); }
      return;
    }
    if (b.dataset.missao) {
      const r = await chamar('tycoonResgatar', { missao: b.dataset.missao }, main);
      if (r) window.toast?.(`⭐ Missão cumprida! +${rs(r.dinheiro)}`, 'ok', 2500);
    }
  };

  const r = await chamar('tycoonSincronizar', {}, main);
  if (!r) { main.querySelector('.imp-corpo').innerHTML = '<div class="card">Não foi possível abrir o escritório agora. Tente de novo em instantes.</div>'; return; }
  _timer = setInterval(() => tique(main), 250);
  _sync = setInterval(() => { if (main.isConnected && !_ocupado) chamar('tycoonSincronizar', {}, main); }, 60000);
};
