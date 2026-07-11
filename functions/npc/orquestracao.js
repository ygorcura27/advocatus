'use strict';

/**
 * Ponto único de orquestração do sistema de NPCs adversários (GDD v5.3+).
 * Junta os adapters reais do projeto (tick, confecção de petição, pool de
 * teses, gerador de profile_id) com os módulos puros de seed/ciclo de vida.
 *
 * Jurisdições reais do jogo: 'brasil' e 'usa' (functions/jurisdictions/*.json)
 * — não os "circuit_N" usados nos testes locais do módulo de seed.
 */

const { logger } = require('firebase-functions');
const { seedAdvogadosNPC } = require('./seedAdvogadosNPC');
const { processarCicloDeVida, garantirDistribuicaoMinima, lerServerSecret } = require('./cicloDeVida');
const { garantirCapacidadeInstitucional } = require('./capacidadeInstitucional');
const { confeccionarPecaSincronaNPC, finalizarPeticoesNPCPendentes } = require('./confeccionarPecaNPC');
const { tickAtualFn } = require('./tickAdapter');
const { TESES_POOL } = require('../teses');

const JURISDICOES = Object.freeze(['brasil', 'usa']);

/**
 * Jurisdição onde jogadores reais existem hoje. jogador.jurisdicao_id nunca
 * chegou a ser setado em nenhum fluxo do jogo (criação de personagem, etc.)
 * — todo jogador real está, na prática, em 'brasil'. Multi-jurisdição de
 * jogador é scaffold (functions/jurisdictions/*.json), não feature em uso.
 * Por isso a demanda de capacidade institucional (P1.5) só é calculada e
 * aplicada aqui — 'usa' não tem jogadores gerando processos reais.
 */
const JURISDICAO_COM_JOGADORES = 'brasil';

/**
 * Garante que /config/server_secret existe (P1.3 — RNG determinístico da
 * aposentadoria). Auto-inicializa com um segredo aleatório na primeira
 * chamada, no mesmo espírito do self-init de /config/server em
 * tick_mensal.js. Nunca sobrescreve um segredo já existente.
 */
async function garantirServerSecret(db) {
  const ref = db.collection('config').doc('server_secret');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (doc.exists && doc.data().secret) return;
    const crypto = require('crypto');
    tx.set(ref, { secret: crypto.randomBytes(32).toString('hex'), criado_em: Date.now() });
  });
}

/**
 * Roda o seed inicial de advogados/procuradores/promotores NPC para as duas
 * jurisdições. Idempotente (slots) — seguro chamar de novo (no-op se já
 * completo). Não é agendado — chamado sob demanda via admin.js.
 */
async function rodarSeedNPCs(db) {
  const resumos = {};
  for (const jurisdicao of JURISDICOES) {
    logger.info(`[NPC_SEED] Iniciando seed de NPCs — jurisdição ${jurisdicao}`);
    resumos[jurisdicao] = await seedAdvogadosNPC({
      db,
      jurisdicao,
      confeccionarPecaSincrona: confeccionarPecaSincronaNPC,
      poolTeses: TESES_POOL,
      tickAtualFn,
    });
    logger.info(`[NPC_SEED] ${jurisdicao}: ${JSON.stringify(resumos[jurisdicao])}`);
  }
  return resumos;
}

/**
 * Passo mensal do sistema de NPCs — chamado 1x por tick a partir de
 * functions/tick_mensal.js, depois que /config/server.mes_global já avançou:
 *   1. finaliza petições de NPC pendentes (nota_teto)
 *   2. aposentadoria + reposição (ledger idempotente)
 *   3. distribuição mínima de iniciantes
 *   4. expansão institucional (procurador/promotor), só em JURISDICAO_COM_JOGADORES
 *
 * A demanda (P1.5) usa uma contagem GLOBAL de processos 'andamento' como
 * proxy de "casos ativos" — não uma contagem por jurisdição de verdade,
 * porque processos não têm jurisdição própria e todo jogador real está em
 * 'brasil' de qualquer forma (ver JURISDICAO_COM_JOGADORES acima). Se
 * multi-jurisdição de jogador virar feature real, isso precisa ser revisto.
 */
async function processarTickMensalNPC(db) {
  await garantirServerSecret(db);
  const mesGlobal = await tickAtualFn(db);

  const resultado = { finalizadas: [], ciclosDeVida: [], distribuicoes: [], expansoes: [] };

  try {
    resultado.finalizadas = await finalizarPeticoesNPCPendentes(db, mesGlobal);
  } catch (e) {
    logger.error('[NPC_TICK] Erro ao finalizar petições de NPC:', e);
  }

  for (const jurisdicao of JURISDICOES) {
    try {
      const ciclo = await processarCicloDeVida({
        db, jurisdicao, tickAtualFn,
        confeccionarPecaSincrona: confeccionarPecaSincronaNPC,
        poolTeses: TESES_POOL,
      });
      if (ciclo.eventos.length > 0) resultado.ciclosDeVida.push(ciclo);
    } catch (e) {
      logger.error(`[NPC_TICK] Erro no ciclo de vida (${jurisdicao}):`, e);
    }

    try {
      const distrib = await garantirDistribuicaoMinima({
        db, jurisdicao, tickAtualFn,
        confeccionarPecaSincrona: confeccionarPecaSincronaNPC,
        poolTeses: TESES_POOL,
      });
      if (distrib.repostos.length > 0) resultado.distribuicoes.push({ jurisdicao, ...distrib });
    } catch (e) {
      logger.error(`[NPC_TICK] Erro na distribuição mínima (${jurisdicao}):`, e);
    }
  }

  // ── 4. Expansão institucional (P1.5) — só onde há jogadores reais ──
  try {
    const casosAtivosSnap = await db.collection('processos').where('status', '==', 'andamento').get();
    const casosAtivos = casosAtivosSnap.size;

    for (const subtipo of ['procurador', 'promotor']) {
      const expansao = await garantirCapacidadeInstitucional({
        db, jurisdicao: JURISDICAO_COM_JOGADORES, subtipo,
        casosAtivosNaJurisdicao: casosAtivos,
        confeccionarPecaSincrona: confeccionarPecaSincronaNPC,
        poolTeses: TESES_POOL,
        tickAtualFn,
      });
      if (expansao.expandido) {
        resultado.expansoes.push({ jurisdicao: JURISDICAO_COM_JOGADORES, subtipo, ...expansao });
      }
    }
  } catch (e) {
    logger.error('[NPC_TICK] Erro na expansão institucional:', e);
  }

  return resultado;
}

module.exports = { rodarSeedNPCs, processarTickMensalNPC, garantirServerSecret, JURISDICOES };
