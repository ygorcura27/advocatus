'use strict';

/**
 * IMPÉRIO — modo Tycoon (idle), estilo "Police Chief", do Advocatus.
 *
 * O escritório é um prédio: cada andar é uma divisão (Cível, Família,
 * Trabalhista... M&A, Tribunais Superiores). Em cada divisão o jogador
 * contrata advogados (até a capacidade da sala), investe em treinamento e
 * tecnologia e amplia a sala. Os honorários entram sozinhos, por segundo,
 * inclusive offline (até 12h). Missões dão estrelas ⭐, e as estrelas
 * liberam as divisões seguintes (e somam +2% de receita cada).
 *
 * Tudo é calculado aqui pelo relógio do servidor; o estado mora em
 * tycoon/{uid}, que o cliente não lê nem escreve (só estes callables).
 * O motor puro é exportado para test/tycoon.test.js.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// ─── Catálogo ───────────────────────────────────────────────────────────────
// base: R$/s de um advogado sem melhorias; abrir: preço da divisão;
// estrelas: ⭐ necessárias para abrir.
const DIVISOES = [
  { id: 'civel',          nome: 'Cível',                 base: 2,          abrir: 0,                  estrelas: 0 },
  { id: 'familia',        nome: 'Família e Sucessões',   base: 10,         abrir: 150,                estrelas: 0 },
  { id: 'trabalhista',    nome: 'Trabalhista',           base: 50,         abrir: 3000,               estrelas: 3 },
  { id: 'consumidor',     nome: 'Consumidor',            base: 250,        abrir: 60000,              estrelas: 6 },
  { id: 'criminal',       nome: 'Criminal',              base: 1250,       abrir: 1200000,            estrelas: 9 },
  { id: 'previdenciario', nome: 'Previdenciário',        base: 6250,       abrir: 24000000,           estrelas: 12 },
  { id: 'tributario',     nome: 'Tributário',            base: 31250,      abrir: 480000000,          estrelas: 15 },
  { id: 'empresarial',    nome: 'Empresarial',           base: 156250,     abrir: 9600000000,         estrelas: 18 },
  { id: 'ma',             nome: 'M&A',                   base: 781250,     abrir: 192000000000,       estrelas: 21 },
  { id: 'digital',        nome: 'Digital e LGPD',        base: 3906250,    abrir: 3840000000000,      estrelas: 24 },
  { id: 'ambiental',      nome: 'Ambiental',             base: 19531250,   abrir: 76800000000000,     estrelas: 27 },
  { id: 'superiores',     nome: 'Tribunais Superiores',  base: 97656250,   abrir: 1536000000000000,   estrelas: 30 },
];
const DIV = Object.fromEntries(DIVISOES.map((d) => [d.id, d]));

// Melhorias de cada divisão. preco(d, nivel) = d.base * fator * cresc^nivel.
const ITENS = {
  equipe:     { fator: 15,  cresc: 1.5,  max: null }, // contratar advogado (limitado pela sala)
  treino:     { fator: 40,  cresc: 1.25, max: 50 },   // +10% por nível
  tecnologia: { fator: 150, cresc: 1.45, max: 25 },   // ×1,05 por nível
  sala:       { fator: 300, cresc: 4,    max: 6 },    // +2 vagas por nível
};
const VAGAS_BASE = 3;
const BONUS_ESTRELA = 0.02;
const BONUS_TREINO = 0.10;
const MULT_TECNOLOGIA = 1.05;
const OFFLINE_MAX_S = 12 * 3600;
const SEGUNDOS_POR_MES = 600;

// Missões: sequência fixa; as 3 primeiras não resgatadas ficam ativas.
function _gerarMissoes() {
  const m = [];
  DIVISOES.forEach((d, i) => {
    if (i > 0) m.push({ id: `abrir_${d.id}`, tipo: 'abrir', div: d.id, valor: 1, texto: `Abra a divisão ${d.nome}` });
    m.push({ id: `equipe3_${d.id}`, tipo: 'equipe', div: d.id, valor: 3, texto: `Tenha 3 advogados em ${d.nome}` });
    m.push({ id: `treino5_${d.id}`, tipo: 'treino', div: d.id, valor: 5, texto: `Treinamento nível 5 em ${d.nome}` });
    m.push({ id: `sala1_${d.id}`, tipo: 'sala', div: d.id, valor: 1, texto: `Amplie a sala de ${d.nome}` });
    m.push({ id: `tec3_${d.id}`, tipo: 'tecnologia', div: d.id, valor: 3, texto: `Tecnologia nível 3 em ${d.nome}` });
    m.push({ id: `equipe7_${d.id}`, tipo: 'equipe', div: d.id, valor: 7, texto: `Tenha 7 advogados em ${d.nome}` });
  });
  return m;
}
const MISSOES = _gerarMissoes();
const MISSAO = Object.fromEntries(MISSOES.map((x) => [x.id, x]));
const MISSOES_ATIVAS = 3;

// ─── Motor puro ─────────────────────────────────────────────────────────────

function _divVazia() { return { aberta: false, equipe: 0, treino: 0, tecnologia: 0, sala: 0 }; }

function estadoInicial(agora, caixa = 0) {
  const divisoes = {};
  for (const d of DIVISOES) divisoes[d.id] = _divVazia();
  divisoes.civel = { aberta: true, equipe: 1, treino: 0, tecnologia: 0, sala: 0 };
  return { versao: 2, caixa, total_ganho: 0, estrelas: 0, missoes_feitas: [], divisoes, criado_em: agora, ultimo_calc: agora };
}

/** Garante o formato atual (contas da 1ª versão do Império mantêm só o caixa). */
function normalizar(estado, agora) {
  if (!estado || estado.versao !== 2) return estadoInicial(agora, Math.max(0, (estado && estado.caixa) || 0));
  for (const d of DIVISOES) if (!estado.divisoes[d.id]) estado.divisoes[d.id] = _divVazia();
  return estado;
}

function vagas(dv) { return VAGAS_BASE + 2 * (dv.sala || 0); }

function _multDivisao(estado, dv) {
  return (1 + BONUS_TREINO * dv.treino) * Math.pow(MULT_TECNOLOGIA, dv.tecnologia) * (1 + BONUS_ESTRELA * (estado.estrelas || 0));
}

function rendaDivisao(estado, id) {
  const dv = estado.divisoes[id];
  if (!dv || !dv.aberta || !dv.equipe) return 0;
  return DIV[id].base * dv.equipe * _multDivisao(estado, dv);
}

function rendaTotal(estado) {
  return DIVISOES.reduce((s, d) => s + rendaDivisao(estado, d.id), 0);
}

function preco(id, item, nivel) {
  const it = ITENS[item];
  return DIV[id].base * it.fator * Math.pow(it.cresc, nivel);
}
function limiteItem(dv, item) {
  if (item === 'equipe') return vagas(dv);
  return ITENS[item].max;
}

/** Credita a renda acumulada desde o último cálculo (teto offline de 12h). */
function calcular(estado, agora) {
  const dt = Math.max(0, Math.min(agora - (estado.ultimo_calc || agora), OFFLINE_MAX_S * 1000)) / 1000;
  const ganho = rendaTotal(estado) * dt;
  estado.caixa += ganho;
  estado.total_ganho += ganho;
  estado.ultimo_calc = agora;
  return estado;
}

function _erro(msg) { const e = new Error(msg); e.tycoon = true; return e; }

function abrir(estado, id) {
  const d = DIV[id], dv = estado.divisoes[id];
  if (!d) throw _erro('Divisão inválida.');
  if (dv.aberta) throw _erro('Essa divisão já está aberta.');
  if ((estado.estrelas || 0) < d.estrelas) throw _erro(`Faltam estrelas: precisa de ${d.estrelas} ⭐.`);
  if (estado.caixa < d.abrir) throw _erro('Dinheiro insuficiente.');
  estado.caixa -= d.abrir;
  Object.assign(dv, { aberta: true, equipe: 1 });
  return estado;
}

/** Compra `qtd` níveis (ou 'max') de um item de uma divisão. */
function melhorar(estado, id, item, qtd) {
  const dv = estado.divisoes[id];
  if (!DIV[id] || !dv) throw _erro('Divisão inválida.');
  if (!ITENS[item]) throw _erro('Melhoria inválida.');
  if (!dv.aberta) throw _erro('Abra a divisão primeiro.');
  let n = qtd === 'max' ? Infinity : Math.max(1, Math.min(100, Math.floor(Number(qtd) || 1)));
  let comprados = 0, gasto = 0;
  while (n > 0) {
    const nivel = dv[item] || 0, lim = limiteItem(dv, item);
    if (lim != null && nivel >= lim) {
      if (!comprados) throw _erro(item === 'equipe' ? 'A sala está cheia: amplie a sala para contratar mais.' : 'Nível máximo.');
      break;
    }
    const p = preco(id, item, nivel);
    if (p > estado.caixa + 1e-6) { if (!comprados) throw _erro('Dinheiro insuficiente.'); break; }
    estado.caixa -= p; gasto += p; dv[item] = nivel + 1; comprados++; n--;
  }
  return { estado, comprados, gasto };
}

function progressoMissao(estado, m) {
  if (m.tipo === 'abrir') return estado.divisoes[m.div].aberta ? 1 : 0;
  return Math.min(1, (estado.divisoes[m.div][m.tipo] || 0) / m.valor);
}

function missoesAtivas(estado) {
  const feitas = new Set(estado.missoes_feitas || []);
  return MISSOES.filter((m) => !feitas.has(m.id)).slice(0, MISSOES_ATIVAS);
}

function recompensaDinheiro(estado, m) {
  // 30 segundos da renda atual, com piso pelo porte da divisão.
  return Math.max(DIV[m.div].base * 30, rendaTotal(estado) * 30);
}

function resgatar(estado, mid) {
  const m = MISSAO[mid];
  if (!m) throw _erro('Missão inválida.');
  if (!missoesAtivas(estado).some((x) => x.id === mid)) throw _erro('Essa missão não está ativa.');
  if (progressoMissao(estado, m) < 1) throw _erro('Missão ainda não concluída.');
  const dinheiro = recompensaDinheiro(estado, m);
  estado.caixa += dinheiro;
  estado.estrelas = (estado.estrelas || 0) + 1;
  estado.missoes_feitas = [...(estado.missoes_feitas || []), mid];
  return { estado, dinheiro };
}

/** Visão para o cliente, com preços e números já calculados. */
function publico(estado, agora) {
  const divisoes = DIVISOES.map((d) => {
    const dv = estado.divisoes[d.id];
    const itens = {};
    for (const item of Object.keys(ITENS)) {
      const nivel = dv[item] || 0, lim = limiteItem(dv, item);
      itens[item] = { nivel, max: lim, preco: lim != null && nivel >= lim ? null : preco(d.id, item, nivel) };
    }
    return {
      id: d.id, nome: d.nome, aberta: dv.aberta, preco_abrir: d.abrir, estrelas_req: d.estrelas,
      equipe: dv.equipe, vagas: vagas(dv), renda: rendaDivisao(estado, d.id),
      renda_por_adv: d.base * _multDivisao(estado, dv),
      nivel: dv.equipe + dv.treino + dv.tecnologia + dv.sala, itens,
    };
  });
  const missoes = missoesAtivas(estado).map((m) => ({
    id: m.id, texto: m.texto, progresso: progressoMissao(estado, m), recompensa: recompensaDinheiro(estado, m),
  }));
  const meses = Math.floor((agora - (estado.criado_em || agora)) / 1000 / SEGUNDOS_POR_MES);
  return {
    caixa: estado.caixa, total_ganho: estado.total_ganho, estrelas: estado.estrelas || 0,
    bonus_estrelas: BONUS_ESTRELA * (estado.estrelas || 0),
    por_segundo: rendaTotal(estado), divisoes, missoes,
    missoes_total: MISSOES.length, missoes_feitas: (estado.missoes_feitas || []).length,
    agora, mes: (meses % 12) + 1, ano: Math.floor(meses / 12) + 1,
  };
}

// ─── Callables ──────────────────────────────────────────────────────────────

async function _transacao(request, mutar) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const db = getFirestore();
  const ref = db.collection('tycoon').doc(request.auth.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const agora = Date.now();
    const estado = normalizar(snap.exists ? snap.data() : null, agora);
    calcular(estado, agora);
    let extra = {};
    try { extra = mutar(estado, agora) || {}; }
    catch (e) { if (e.tycoon) throw new HttpsError('failed-precondition', e.message); throw e; }
    tx.set(ref, estado);
    return { ...extra, imperio: publico(estado, agora) };
  });
}

const OPTS = { region: 'southamerica-east1' };
const _str = (v) => String(v || '');

exports.tycoonSincronizar = onCall(OPTS, (req) => _transacao(req, () => ({})));

exports.tycoonAbrir = onCall(OPTS, (req) =>
  _transacao(req, (estado) => { abrir(estado, _str(req.data?.divisao)); }));

exports.tycoonMelhorar = onCall(OPTS, (req) =>
  _transacao(req, (estado) => {
    const qtd = req.data?.qtd === 'max' ? 'max' : Number(req.data?.qtd) || 1;
    const r = melhorar(estado, _str(req.data?.divisao), _str(req.data?.item), qtd);
    return { comprados: r.comprados };
  }));

exports.tycoonResgatar = onCall(OPTS, (req) =>
  _transacao(req, (estado) => ({ dinheiro: resgatar(estado, _str(req.data?.missao)).dinheiro })));

// Callables da 1ª versão do Império: continuam exportados (assim o deploy
// não precisa apagar functions), só avisam que a tela mudou.
const _antigo = () => { throw new HttpsError('failed-precondition', 'O Império foi atualizado — recarregue a página.'); };
exports.tycoonAtender = onCall(OPTS, _antigo);
exports.tycoonComprar = onCall(OPTS, _antigo);
exports.tycoonGerente = onCall(OPTS, _antigo);
exports.tycoonMelhoria = onCall(OPTS, _antigo);

exports.catalogoTycoon = { DIVISOES, ITENS, MISSOES, OFFLINE_MAX_S };
exports._motor = {
  estadoInicial, normalizar, calcular, abrir, melhorar, resgatar, publico,
  rendaDivisao, rendaTotal, preco, vagas, missoesAtivas, progressoMissao,
};
