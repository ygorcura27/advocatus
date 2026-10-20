/**
 * IMPÉRIO — modo Tycoon (idle) — Advocatus Online
 * Tela principal: o mapa 3D do Rio (js/cidade3d.js) com as frentes de
 * atuação do escritório. Comprar níveis aumenta os honorários de cada ciclo;
 * um gerente faz os ciclos rodarem sozinhos, mesmo offline.
 * Todo valor vem do servidor (functions/tycoon.js); aqui o caixa só é
 * animado entre uma resposta e outra.
 */
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { functions } from './firebase-init.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// Frentes no mapa (ids = lugares do cidade3d.js) e prédios de apoio.
const FRENTES = [
  { id: 'forum',     g: 'JC',  nome: 'Juizado Cível',        lugar: 'Fórum Central',      icone: '⚖️' },
  { id: 'delegacia', g: 'CR',  nome: 'Defesa Criminal',      lugar: 'Delegacia',          icone: '🚔' },
  { id: 'trt',       g: 'TRT', nome: 'Trabalhista',          lugar: 'TRT da 1ª Região',   icone: '👷' },
  { id: 'tj',        g: 'TJ',  nome: 'Recursos no TJ',       lugar: 'Tribunal de Justiça', icone: '🏛️' },
  { id: 'trf',       g: 'TRF', nome: 'Tributário Federal',   lugar: 'TRF da 2ª Região',   icone: '🧾' },
  { id: 'empresas',  g: 'EM',  nome: 'Corporativo',          lugar: 'Torre empresarial',  icone: '🏢' },
  { id: 'banco',     g: '$',   nome: 'Bancário e M&A',       lugar: 'Banco',              icone: '🏦' },
  { id: 'aeroporto', g: 'BSB', nome: 'Tribunais Superiores', lugar: 'Voo a Brasília',     icone: '✈️' },
];
const APOIO = {
  escritorio:   { g: 'E',  name: 'Sede do escritório' },
  universidade: { g: 'U',  name: 'Universidade — especializações' },
  imprensa:     { g: 'TV', name: 'Emissora de TV — campanhas' },
};
const NOME_GERENTE = {
  forum: 'Dra. Bia Ramos', delegacia: 'Dr. Caio Leme', trt: 'Dra. Neusa Prado', tj: 'Dr. Otávio Reis',
  trf: 'Dra. Lívia Moura', empresas: 'Dr. Henrique Sá', banco: 'Dra. Marta Fontes', aeroporto: 'Min. aposentado Rui Teles',
};

const fn = (nome) => httpsCallable(functions, nome);

let _imp = null;          // último estado do servidor
let _offset = 0;          // relógio do servidor - relógio local
let _modo = 1;            // compra: 1, 10, 100 ou 'max'
let _aba = 'negocios';
let _sel = 'forum';
let _timer = null, _sync = null, _ocupado = false, _ultimoHalo = '';

// ─── formatação ─────────────────────────────────────────────────────────────
const ESCALAS = [[1e18, 'quint.'], [1e15, 'quatri.'], [1e12, 'tri'], [1e9, 'bi'], [1e6, 'mi'], [1e3, 'mil']];
function rs(v) {
  v = Math.max(0, v || 0);
  for (const [n, s] of ESCALAS) if (v >= n) return `R$ ${(v / n).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s}`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
function tempo(s) {
  if (s < 1) return `${s.toFixed(2)}s`;
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min${s % 60 ? ' ' + Math.round(s % 60) + 's' : ''}`;
  return `${Math.floor(s / 3600)}h${Math.round((s % 3600) / 60) ? ' ' + Math.round((s % 3600) / 60) + 'min' : ''}`;
}
const agoraServ = () => Date.now() + _offset;

// ─── estado local animado ───────────────────────────────────────────────────
function aplicar(imp) {
  _imp = imp;
  _offset = imp.agora - Date.now();
}
// Caixa e progresso estimados agora, a partir do último estado do servidor
// (mesma regra de functions/tycoon.js:calcular, sem mutar nada).
function estimar() {
  if (!_imp) return { caixa: 0, prog: {} };
  const t = agoraServ();
  let caixa = _imp.caixa;
  const prog = {};
  for (const f of FRENTES) {
    const fr = _imp.frentes[f.id];
    if (!fr || fr.nivel <= 0 || fr.ciclo_inicio == null) { prog[f.id] = 0; continue; }
    const dur = fr.tempo * 1000, dec = Math.max(0, t - fr.ciclo_inicio);
    if (fr.gerente) {
      caixa += Math.floor(dec / dur) * fr.receita;
      prog[f.id] = dur < 400 ? 1 : (dec % dur) / dur;
    } else if (dec >= dur) {
      caixa += fr.receita;
      prog[f.id] = 1;
    } else prog[f.id] = dec / dur;
  }
  return { caixa, prog };
}
function parado(id) {
  const fr = _imp?.frentes[id];
  if (!fr || fr.nivel <= 0 || fr.gerente) return false;
  return fr.ciclo_inicio == null || agoraServ() - fr.ciclo_inicio >= fr.tempo * 1000;
}

// ─── chamadas ───────────────────────────────────────────────────────────────
async function chamar(nome, dados, el) {
  if (_ocupado) return;
  _ocupado = true;
  try {
    const r = await fn(nome)(dados || {});
    aplicar(r.data.imperio);
    desenhar(el);
    return r.data;
  } catch (e) {
    window.toast?.((e.message || 'Erro').replace('Firebase: ', ''), 'ko', 3000);
  } finally { _ocupado = false; }
}

// ─── desenho ────────────────────────────────────────────────────────────────
function cardFrente(f, est) {
  const fr = _imp.frentes[f.id];
  const aberta = fr.nivel > 0;
  const max = _modo === 'max';
  const label = max ? `+${Math.max(1, fr.max)}` : `+${_modo}`;
  const preco = max ? (fr.max > 0 ? null : fr.custo_1) : fr[`custo_${_modo}`];
  const podeComprar = max ? fr.max > 0 : est.caixa >= preco;
  const pronto = parado(f.id);
  const marco = fr.prox_marco ? `<span class="imp-marco" title="No nível ${fr.prox_marco} a frente fica 2x mais rápida">⏩ ${fr.nivel}/${fr.prox_marco}</span>` : '';
  return `
  <div class="imp-frente ${aberta ? '' : 'fechada'} ${_sel === f.id ? 'sel' : ''}" data-frente="${f.id}">
    <button type="button" class="imp-icone ${pronto ? 'pronto' : ''}" data-atender="${f.id}" ${aberta && !fr.gerente ? '' : 'tabindex="-1"'} title="${fr.gerente ? 'Gerente cuidando' : aberta ? 'Atender clientes' : 'Abrir esta frente'}">
      <span>${f.icone}</span><b>${aberta ? fr.nivel : '🔒'}</b>
    </button>
    <div class="imp-corpo">
      <div class="imp-linha1"><span class="imp-nome">${f.nome}</span>${marco}</div>
      <div class="imp-barra"><i id="imp-prog-${f.id}" style="width:0%"></i><span>${aberta ? rs(fr.receita) : f.lugar}</span><em>${aberta ? tempo(fr.tempo) : ''}</em></div>
      <div class="imp-acoes">
        <button type="button" class="imp-comprar" data-comprar="${f.id}" ${podeComprar ? '' : 'disabled'}>
          ${aberta ? 'Contratar' : 'Abrir'} <small>${label}</small> <span>${preco == null ? 'máx.' : rs(preco)}</span>
        </button>
        ${aberta && !fr.gerente ? (pronto ? `<span class="imp-dica">Toque no ícone para atender</span>` : `<span class="imp-dica">Atendendo…</span>`) : ''}
        ${fr.gerente ? `<span class="imp-gerente-ok">👔 ${NOME_GERENTE[f.id]}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function abaGerentes(est) {
  return FRENTES.map(f => {
    const fr = _imp.frentes[f.id];
    const preco = _imp.catalogo?.gerentes?.[f.id];
    return `
    <div class="imp-item">
      <div><b>👔 ${NOME_GERENTE[f.id]}</b><small>Cuida de ${f.nome}: os ciclos rodam sozinhos, mesmo com você offline (até 24h).</small></div>
      ${fr.gerente ? '<span class="imp-ok">Contratado</span>'
        : `<button type="button" class="imp-btn" data-gerente="${f.id}" ${fr.nivel > 0 && est.caixa >= (preco || Infinity) ? '' : 'disabled'}>${fr.nivel > 0 ? rs(preco) : 'Abra a frente'}</button>`}
    </div>`;
  }).join('');
}

function abaMelhorias(est) {
  const lista = _imp.catalogo?.melhorias || [];
  return lista.map(m => {
    const tem = _imp.melhorias.includes(m.id);
    const alvo = m.alvo === 'todas' ? 'todas as frentes' : (FRENTES.find(f => f.id === m.alvo)?.nome || m.alvo);
    return `
    <div class="imp-item">
      <div><b>${m.alvo === 'todas' ? '📺' : '🎓'} ${m.nome}</b><small>Honorários de ${alvo} ×${m.mult}</small></div>
      ${tem ? '<span class="imp-ok">Comprada</span>' : `<button type="button" class="imp-btn" data-melhoria="${m.id}" ${est.caixa >= m.custo ? '' : 'disabled'}>${rs(m.custo)}</button>`}
    </div>`;
  }).join('');
}

function desenhar(el) {
  if (!_imp || !el.isConnected) return;
  const est = estimar();
  const painel = el.querySelector('.imp-painel');
  painel.innerHTML = `
    <div class="imp-abas" role="tablist">
      ${[['negocios', 'Negócios'], ['gerentes', 'Gerentes'], ['melhorias', 'Melhorias']].map(([id, l]) =>
        `<button type="button" class="imp-aba" role="tab" data-aba="${id}" aria-selected="${_aba === id}">${l}</button>`).join('')}
      ${_aba === 'negocios' ? `<div class="imp-modo">${[1, 10, 100, 'max'].map(m => `<button type="button" class="imp-modo-b" data-modo="${m}" aria-pressed="${_modo === m}">${m === 'max' ? 'Máx' : '×' + m}</button>`).join('')}</div>` : ''}
    </div>
    <div class="imp-lista">
      ${_aba === 'negocios' ? FRENTES.map(f => cardFrente(f, est)).join('') : _aba === 'gerentes' ? abaGerentes(est) : abaMelhorias(est)}
    </div>`;
  atualizarMapa();
}

// Chamado ~4x por segundo: só números e barras, sem refazer o HTML.
function tique(el) {
  if (!_imp || !el.isConnected) { pararTimers(); return; }
  const est = estimar();
  const cx = el.querySelector('#imp-caixa'); if (cx) cx.textContent = rs(est.caixa);
  const ps = el.querySelector('#imp-ps'); if (ps) ps.textContent = `${rs(_imp.por_segundo)}/s`;
  const me = el.querySelector('#imp-mes'); if (me) me.textContent = `Mês ${_imp.mes} · Ano ${_imp.ano}`;
  for (const f of FRENTES) {
    const b = el.querySelector(`#imp-prog-${f.id}`);
    if (b) b.style.width = `${Math.round((est.prog[f.id] || 0) * 100)}%`;
  }
  // habilita/desabilita compras conforme o caixa sobe, sem redesenhar tudo
  el.querySelectorAll('[data-comprar]').forEach(b => {
    const fr = _imp.frentes[b.dataset.comprar];
    const ok = _modo === 'max' ? fr.max > 0 : est.caixa >= fr[`custo_${_modo}`];
    b.disabled = !ok;
  });
  el.querySelectorAll('[data-atender]').forEach(b => b.classList.toggle('pronto', parado(b.dataset.atender)));
  atualizarMapa();
}

function atualizarMapa() {
  if (!window.cidade3d?.atualizar || !_imp) return;
  const halos = FRENTES.filter(f => parado(f.id)).map(f => f.id);
  const rotulos = {};
  for (const f of FRENTES) { const n = _imp.frentes[f.id].nivel; rotulos[f.id] = { g: n > 0 ? String(n) : '+' }; }
  const chave = halos.join(',') + '|' + FRENTES.map(f => rotulos[f.id].g).join(',');
  if (chave === _ultimoHalo) return;
  _ultimoHalo = chave;
  window.cidade3d.atualizar(halos, rotulos);
}

function pararTimers() { clearInterval(_timer); clearInterval(_sync); _timer = _sync = null; }

// ─── motor 3D ───────────────────────────────────────────────────────────────
let _carregando = null;
function carregarScript(src) { return new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = erro; document.head.appendChild(s); }); }
function carregarMotor() {
  if (window.cidade3d) return Promise.resolve();
  if (!_carregando) _carregando = (window.THREE ? Promise.resolve() : carregarScript(THREE_URL)).then(() => carregarScript('js/cidade3d.js'));
  return _carregando;
}
function carregarCss() {
  for (const [id, href] of [['css-cidade', 'css/cidade.css'], ['css-imperio', 'css/imperio.css']]) {
    if (document.getElementById(id)) continue;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
}

// ─── entrada ────────────────────────────────────────────────────────────────
window.renderImperio = async function(j, main) {
  carregarCss();
  pararTimers();
  main.innerHTML = `
  <div class="imp-wrap">
    <div class="imp-palco">
      <div class="cid-mapa imp-mapa" id="imp-mapa"><div class="cid-carregando">Carregando o Rio de Janeiro…</div></div>
      <div class="imp-hud">
        <div class="imp-hud-nome">${j.escritorio_nome || (j.nome_personagem ? j.nome_personagem.split(' ')[0] + ' Advocacia' : 'Seu escritório')}</div>
        <div class="imp-hud-caixa" id="imp-caixa">—</div>
        <div class="imp-hud-sub"><span id="imp-ps">—</span> · <span id="imp-mes">—</span></div>
      </div>
    </div>
    <div class="imp-painel"><div class="cid-carregando" style="position:static;padding:1rem">Abrindo o escritório…</div></div>
  </div>`;

  // Clique/teclado no painel (delegação).
  main.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.aba) { _aba = b.dataset.aba; desenhar(main); return; }
    if (b.dataset.modo) { _modo = b.dataset.modo === 'max' ? 'max' : Number(b.dataset.modo); desenhar(main); return; }
    if (b.dataset.atender) {
      const id = b.dataset.atender, fr = _imp?.frentes[id];
      _sel = id;
      if (fr && fr.nivel > 0 && !fr.gerente && parado(id)) { await chamar('tycoonAtender', { frente: id }, main); }
      window.cidade3d?.ir(id);
      return;
    }
    if (b.dataset.comprar) { await chamar('tycoonComprar', { frente: b.dataset.comprar, qtd: _modo }, main); return; }
    if (b.dataset.gerente) { const r = await chamar('tycoonGerente', { frente: b.dataset.gerente }, main); if (r) window.toast?.('👔 Gerente contratado — essa frente agora roda sozinha.', 'ok', 3000); return; }
    if (b.dataset.melhoria) { const r = await chamar('tycoonMelhoria', { melhoria: b.dataset.melhoria }, main); if (r) window.toast?.('✨ Melhoria comprada.', 'ok', 2500); return; }
  };

  const r = await chamar('tycoonSincronizar', {}, main);
  if (!r) { main.querySelector('.imp-painel').innerHTML = '<div class="card">Não foi possível abrir o Império agora. Tente de novo em instantes.</div>'; return; }
  desenhar(main);
  _timer = setInterval(() => tique(main), 250);
  _sync = setInterval(() => { if (main.isConnected && !_ocupado) chamar('tycoonSincronizar', {}, main); }, 60000);

  // Mapa 3D (opcional: sem WebGL o painel funciona sozinho).
  carregarMotor().then(() => {
    const slot = document.getElementById('imp-mapa'); if (!slot) return;
    if (!window.cidade3d.disponivel()) { slot.innerHTML = '<p class="cid-semgl">Seu navegador não tem 3D (WebGL). O império funciona pela lista abaixo.</p>'; return; }
    slot.innerHTML = '';
    const lugares = {};
    for (const f of FRENTES) lugares[f.id] = { name: f.nome, g: '+', zone: 'centro' };
    for (const id in APOIO) lugares[id] = { ...APOIO[id], zone: 'centro' };
    window.cidade3d.montar(slot, {
      lugares, destaques: [],
      aoChegar: id => {
        if (id === 'universidade' || id === 'imprensa') { _aba = 'melhorias'; desenhar(main); return; }
        if (FRENTES.some(f => f.id === id)) { _sel = id; _aba = 'negocios'; desenhar(main); main.querySelector(`[data-frente="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      },
    });
    _ultimoHalo = '';
    atualizarMapa();
  }).catch(() => {
    const slot = document.getElementById('imp-mapa');
    if (slot) slot.innerHTML = '<p class="cid-semgl">Não foi possível carregar o mapa. O império funciona pela lista abaixo.</p>';
  });
};
