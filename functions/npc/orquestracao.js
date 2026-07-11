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
const { confeccionarPecaSincronaNPC, finalizarPeticoesNPCPendentes } = require('./confeccionarPecaNPC');
const { tickAtualFn } = require('./tickAdapter');
const { TESES_POOL } = require('../teses');

const JURISDICOES = Object.freeze(['brasil', 'usa']);

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
 *
 * Expansão institucional (P1.5, capacidadeInstitucional.js) fica de fora
 * deste passo automático — o jogo ainda não tem uma métrica real de "casos
 * ativos por jurisdição" para alimentar `casosAtivosNaJurisdicao`.
 */
async function processarTickMensalNPC(db) {
  await garantirServerSecret(db);
  const mesGlobal = await tickAtualFn(db);

  const resultado = { finalizadas: [], ciclosDeVida: [], distribuicoes: [] };

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

  return resultado;
}

module.exports = { rodarSeedNPCs, processarTickMensalNPC, garantirServerSecret, JURISDICOES };
