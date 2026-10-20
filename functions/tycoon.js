'use strict';

/**
 * IMPÉRIO — modo Tycoon (idle) do Advocatus.
 *
 * O jogador compra e melhora frentes de atuação espalhadas pelo mapa da
 * cidade. Cada frente fecha um "ciclo" de casos e paga honorários; com um
 * gerente contratado, os ciclos se repetem sozinhos, inclusive offline.
 *
 * Tudo é calculado aqui a partir de timestamps do servidor (nada de valor
 * vem do cliente). O estado mora em tycoon/{uid}, que as regras do
 * Firestore não deixam o cliente ler nem escrever — só estes callables.
 *
 * O motor (funções puras) é exportado para os testes em test/tycoon.test.js.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// ─── Catálogo ───────────────────────────────────────────────────────────────
// custo: preço do 1º nível; coef: quanto cada nível encarece; tempo: segundos
// por ciclo; receita: honorários por ciclo por nível; gerente: preço do gerente.
const FRENTES = [
  { id: 'forum',     nome: 'Juizado Cível',          custo: 40,          coef: 1.07, tempo: 3,     receita: 10,         gerente: 1000 },
  { id: 'delegacia', nome: 'Defesa Criminal',        custo: 600,         coef: 1.15, tempo: 15,    receita: 600,        gerente: 15000 },
  { id: 'trt',       nome: 'Trabalhista',            custo: 7200,        coef: 1.14, tempo: 30,    receita: 5400,       gerente: 100000 },
  { id: 'tj',        nome: 'Recursos no TJ',         custo: 86400,       coef: 1.13, tempo: 60,    receita: 43200,      gerente: 500000 },
  { id: 'trf',       nome: 'Tributário Federal',     custo: 1036800,     coef: 1.12, tempo: 120,   receita: 518400,     gerente: 1200000 },
  { id: 'empresas',  nome: 'Corporativo',            custo: 12441600,    coef: 1.11, tempo: 480,   receita: 6220800,    gerente: 10000000 },
  { id: 'banco',     nome: 'Bancário e M&A',         custo: 149299200,   coef: 1.10, tempo: 1920,  receita: 74649600,   gerente: 111111111 },
  { id: 'aeroporto', nome: 'Tribunais Superiores',   custo: 1791590400,  coef: 1.09, tempo: 7680,  receita: 895795200,  gerente: 555555555 },
];
const FRENTE = Object.fromEntries(FRENTES.map((f) => [f.id, f]));

// A cada marco de nível, a frente fica 2x mais rápida.
const MARCOS = [25, 50, 100, 200, 300, 400];

// Melhorias (Universidade e Emissora): multiplicam a receita de uma frente ou de todas.
const MELHORIAS = [
  { id: 'esp_forum',     alvo: 'forum',     mult: 3, custo: 250000,        nome: 'Especialização em Juizados' },
  { id: 'esp_delegacia', alvo: 'delegacia', mult: 3, custo: 500000,        nome: 'Pós em Direito Penal' },
  { id: 'esp_trt',       alvo: 'trt',       mult: 3, custo: 1000000,       nome: 'Pós em Direito do Trabalho' },
  { id: 'esp_tj',        alvo: 'tj',        mult: 3, custo: 5000000,       nome: 'Curso de Recursos' },
  { id: 'esp_trf',       alvo: 'trf',       mult: 3, custo: 10000000,      nome: 'MBA Tributário' },
  { id: 'esp_empresas',  alvo: 'empresas',  mult: 3, custo: 25000000,      nome: 'LL.M. Corporativo' },
  { id: 'esp_banco',     alvo: 'banco',     mult: 3, custo: 500000000,     nome: 'Mestrado em Mercado de Capitais' },
  { id: 'esp_aeroporto', alvo: 'aeroporto', mult: 3, custo: 10000000000,   nome: 'Doutorado em Direito Constitucional' },
  { id: 'tv_1',          alvo: 'todas',     mult: 3, custo: 50000000000,   nome: 'Campanha na TV' },
  { id: 'tv_2',          alvo: 'todas',     mult: 3, custo: 2000000000000, nome: 'Colunista fixo no jornal' },
];
const MELHORIA = Object.fromEntries(MELHORIAS.map((m) => [m.id, m]));

const OFFLINE_MAX_S = 24 * 3600;   // gerentes rendem no máximo 24h sem o jogador aparecer
const SEGUNDOS_POR_MES = 600;      // calendário do império: 1 mês a cada 10 minutos reais

// ─── Motor puro ─────────────────────────────────────────────────────────────

function estadoInicial(agora) {
  const frentes = {};
  for (const f of FRENTES) frentes[f.id] = { nivel: 0, gerente: false, ciclo_inicio: null };
  frentes.forum.nivel = 1;
  return { caixa: 0, total_ganho: 0, frentes, melhorias: [], criado_em: agora, ultimo_calc: agora };
}

function multiplicador(estado, id) {
  let m = 1;
  for (const mid of estado.melhorias || []) {
    const mel = MELHORIA[mid];
    if (mel && (mel.alvo === id || mel.alvo === 'todas')) m *= mel.mult;
  }
  return m;
}

function tempoCiclo(id, nivel) {
  const marcos = MARCOS.filter((n) => nivel >= n).length;
  return FRENTE[id].tempo / Math.pow(2, marcos);
}

function receitaCiclo(estado, id) {
  const nivel = estado.frentes[id].nivel;
  return FRENTE[id].receita * nivel * multiplicador(estado, id);
}

function custoNiveis(id, nivelAtual, qtd) {
  const f = FRENTE[id];
  return f.custo * Math.pow(f.coef, nivelAtual) * (Math.pow(f.coef, qtd) - 1) / (f.coef - 1);
}

function maxComprável(id, nivelAtual, caixa) {
  const f = FRENTE[id];
  const base = f.custo * Math.pow(f.coef, nivelAtual);
  if (caixa < base) return 0;
  return Math.floor(Math.log(caixa * (f.coef - 1) / base + 1) / Math.log(f.coef));
}

/** Credita tudo o que rendeu até `agora`. Muta e devolve o estado. */
function calcular(estado, agora) {
  for (const f of FRENTES) {
    const fr = estado.frentes[f.id];
    if (!fr || fr.nivel <= 0 || fr.ciclo_inicio == null) continue;
    const t = tempoCiclo(f.id, fr.nivel) * 1000;
    const rec = receitaCiclo(estado, f.id);
    if (fr.gerente) {
      // Ciclos contínuos, com teto de rendimento offline.
      const inicio = Math.max(fr.ciclo_inicio, agora - OFFLINE_MAX_S * 1000);
      const ciclos = Math.floor((agora - inicio) / t);
      if (ciclos > 0) {
        estado.caixa += ciclos * rec;
        estado.total_ganho += ciclos * rec;
        fr.ciclo_inicio = inicio + ciclos * t;
      }
    } else if (agora - fr.ciclo_inicio >= t) {
      // Sem gerente: o ciclo terminou e espera o próximo "Atender" — paga uma vez.
      estado.caixa += rec;
      estado.total_ganho += rec;
      fr.ciclo_inicio = null;
    }
  }
  estado.ultimo_calc = agora;
  return estado;
}

function _erro(msg) { const e = new Error(msg); e.tycoon = true; return e; }

function atender(estado, id, agora) {
  const fr = estado.frentes[id];
  if (!FRENTE[id] || !fr || fr.nivel <= 0) throw _erro('Você ainda não atua nessa frente.');
  if (fr.gerente) throw _erro('O gerente já cuida dessa frente.');
  if (fr.ciclo_inicio != null) throw _erro('Os casos ainda estão em andamento.');
  fr.ciclo_inicio = agora;
  return estado;
}

function comprar(estado, id, qtd) {
  const fr = estado.frentes[id];
  if (!FRENTE[id] || !fr) throw _erro('Frente inválida.');
  const n = qtd === 'max' ? maxComprável(id, fr.nivel, estado.caixa) : Math.max(1, Math.min(1000, Math.floor(Number(qtd) || 1)));
  if (n <= 0) throw _erro('Dinheiro insuficiente.');
  const custo = custoNiveis(id, fr.nivel, n);
  if (custo > estado.caixa + 1e-6) throw _erro('Dinheiro insuficiente.');
  estado.caixa -= custo;
  fr.nivel += n;
  return { estado, comprados: n, custo };
}

function contratarGerente(estado, id, agora) {
  const fr = estado.frentes[id];
  if (!FRENTE[id] || !fr || fr.nivel <= 0) throw _erro('Abra essa frente antes de contratar um gerente.');
  if (fr.gerente) throw _erro('Essa frente já tem gerente.');
  const preco = FRENTE[id].gerente;
  if (estado.caixa < preco) throw _erro('Dinheiro insuficiente.');
  estado.caixa -= preco;
  fr.gerente = true;
  if (fr.ciclo_inicio == null) fr.ciclo_inicio = agora;
  return estado;
}

function comprarMelhoria(estado, mid) {
  const mel = MELHORIA[mid];
  if (!mel) throw _erro('Melhoria inválida.');
  if ((estado.melhorias || []).includes(mid)) throw _erro('Você já tem essa melhoria.');
  if (estado.caixa < mel.custo) throw _erro('Dinheiro insuficiente.');
  estado.caixa -= mel.custo;
  estado.melhorias = [...(estado.melhorias || []), mid];
  return estado;
}

/** Visão para o cliente: estado + números derivados para animar a tela. */
function publico(estado, agora) {
  const frentes = {};
  let porSegundo = 0;
  for (const f of FRENTES) {
    const fr = estado.frentes[f.id];
    const t = fr.nivel > 0 ? tempoCiclo(f.id, fr.nivel) : f.tempo;
    const rec = fr.nivel > 0 ? receitaCiclo(estado, f.id) : 0;
    if (fr.gerente && fr.nivel > 0) porSegundo += rec / t;
    const proxMarco = MARCOS.find((n) => n > fr.nivel) || null;
    frentes[f.id] = {
      ...fr, tempo: t, receita: rec,
      custo_1: custoNiveis(f.id, fr.nivel, 1),
      custo_10: custoNiveis(f.id, fr.nivel, 10),
      custo_100: custoNiveis(f.id, fr.nivel, 100),
      max: maxComprável(f.id, fr.nivel, estado.caixa),
      prox_marco: proxMarco,
    };
  }
  const meses = Math.floor((agora - (estado.criado_em || agora)) / 1000 / SEGUNDOS_POR_MES);
  return {
    caixa: estado.caixa, total_ganho: estado.total_ganho, melhorias: estado.melhorias || [],
    frentes, por_segundo: porSegundo, agora, mes: (meses % 12) + 1, ano: Math.floor(meses / 12) + 1,
    catalogo: { gerentes: Object.fromEntries(FRENTES.map((f) => [f.id, f.gerente])), melhorias: MELHORIAS },
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
    const estado = snap.exists ? snap.data() : estadoInicial(agora);
    calcular(estado, agora);
    let extra = {};
    try { extra = mutar(estado, agora) || {}; }
    catch (e) { if (e.tycoon) throw new HttpsError('failed-precondition', e.message); throw e; }
    tx.set(ref, estado);
    return { ...extra, imperio: publico(estado, agora) };
  });
}

const OPTS = { region: 'southamerica-east1' };

exports.tycoonSincronizar = onCall(OPTS, (req) => _transacao(req, () => ({})));

exports.tycoonAtender = onCall(OPTS, (req) =>
  _transacao(req, (estado, agora) => { atender(estado, String(req.data?.frente || ''), agora); }));

exports.tycoonComprar = onCall(OPTS, (req) =>
  _transacao(req, (estado) => {
    const qtd = req.data?.qtd === 'max' ? 'max' : Number(req.data?.qtd) || 1;
    const r = comprar(estado, String(req.data?.frente || ''), qtd);
    return { comprados: r.comprados };
  }));

exports.tycoonGerente = onCall(OPTS, (req) =>
  _transacao(req, (estado, agora) => { contratarGerente(estado, String(req.data?.frente || ''), agora); }));

exports.tycoonMelhoria = onCall(OPTS, (req) =>
  _transacao(req, (estado) => { comprarMelhoria(estado, String(req.data?.melhoria || '')); }));

exports.catalogoTycoon = { FRENTES, MELHORIAS, MARCOS, OFFLINE_MAX_S };
exports._motor = {
  estadoInicial, calcular, atender, comprar, contratarGerente, comprarMelhoria,
  publico, custoNiveis, maxComprável, tempoCiclo, receitaCiclo,
};
