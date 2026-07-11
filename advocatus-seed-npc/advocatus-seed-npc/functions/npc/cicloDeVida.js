'use strict';

/**
 * GDD v5.10 §12 — correções P1.2, P1.3 e P1.4 da auditoria v5.9.
 *
 * P1.2 — LEDGER DE APOSENTADORIA/REPOSIÇÃO
 *   Problema (v5.9): aposentadoria e reposição eram etapas sequenciais sem
 *   identidade persistida. Crash entre as duas deixava NPC aposentado sem
 *   reposição.
 *   Correção: documento /ciclo_vida_eventos/{npcId}_{tick} com etapas
 *   explícitas (pending → retirement_applied → replacement_applied → completed).
 *   Cada etapa é verificada e marcada atomicamente junto com o efeito.
 *
 * P1.3 — RNG DETERMINÍSTICO NA APOSENTADORIA
 *   Problema (v5.9): Math.random() no roll de aposentadoria é não determinístico.
 *   O mesmo NPC no mesmo tick poderia receber decisões diferentes em retry.
 *   Correção: derivar o roll de HMAC-SHA256(serverSecret, "retirement:{npcId}:{tick}").
 *   O serverSecret é lido de /config/server_secret (sem regra de leitura de cliente).
 *   Resultado: mesma decisão para qualquer retry de {npcId, tick}.
 *
 * P1.4 — DISTRIBUIÇÃO MÍNIMA COM SLOTS DETERMINISTICOS
 *   Problema (v5.9): garantirDistribuicaoMinima() calculava déficit sem identidade
 *   por reposição; duas execuções concorrentes podiam criar o dobro de iniciantes.
 *   Correção: slots em /distribuicao_minima_slots/{jurisdicao}_{tick}_{i} com
 *   o mesmo padrão de criarAdvogadoNPCComSlot(). Cada slot faltante recebe um ID
 *   determinístico; o claim transacional garante uma única criação por slot.
 *
 * Chamado 1x por tick (mês de jogo) por jurisdição.
 */

const crypto = require('crypto');
const { criarAdvogadoNPCComSlot, criarAdvogadoNPC } = require('./seedAdvogadosNPC');
const { mediaSkillsPrincipais } = require('./geradores');

const IDADE_APOSENTADORIA_MESES = 180; // ~15 anos de carreira NPC
const PROB_APOSENTADORIA_BASE = 0.01; // 1%/mês após a idade mínima

// ── Faixas e distribuição-alvo ────────────────────────────────────────────────

/**
 * [Correção #7 — 2ª revisão crítica] Classificação SEMPRE por skill atual,
 * recalculada a cada tick.
 */
const FAIXAS_SKILL_ATUAL = Object.freeze([
  { nome: 'iniciante',    min: 0,  max: 16 },
  { nome: 'estabelecido', min: 17, max: 27 },
  { nome: 'veterano',     min: 28, max: 38 },
  { nome: 'elite',        min: 39, max: 50 },
]);

const DISTRIBUICAO_ALVO = Object.freeze({ iniciante: 20, estabelecido: 15, veterano: 8, elite: 4 });
const LIMIAR_REPOSICAO  = 0.70; // repõe quando a faixa cai abaixo de 70% do valor-seed

function faixaAtualDoNPC(npc) {
  const media = mediaSkillsPrincipais(npc.skills);
  const faixa = FAIXAS_SKILL_ATUAL.find((f) => media >= f.min && media <= f.max);
  return faixa ? faixa.nome : 'elite';
}

async function contarPorFaixaAtual(db, jurisdicao) {
  const snap = await db
    .collection('perfis')
    .where('tipo', '==', 'npc')
    .where('subtipo_npc', '==', 'advogado')
    .where('banca.jurisdicao', '==', jurisdicao)
    .where('ciclo_vida.status', '==', 'ativo')
    .where('sistema.inicializacao', '==', 'ready')
    .get();

  const contagem = { iniciante: 0, estabelecido: 0, veterano: 0, elite: 0 };
  for (const doc of snap.docs) {
    contagem[faixaAtualDoNPC(doc.data())] += 1;
  }
  return contagem;
}

// ── P1.3 — RNG determinístico ─────────────────────────────────────────────────

/**
 * Lê o serverSecret de /config/server_secret.
 * Esse documento deve estar inacessível por regras de cliente.
 * Lança erro explícito se não encontrar — nunca faz fallback para Math.random().
 */
async function lerServerSecret(db) {
  const doc = await db.collection('config').doc('server_secret').get();
  if (!doc.exists || !doc.data().secret) {
    throw new Error(
      'lerServerSecret: /config/server_secret não encontrado ou sem campo "secret". ' +
      'Inicialize com { secret: <string de alta entropia> } antes do primeiro uso.',
    );
  }
  return doc.data().secret;
}

/**
 * Roll determinístico de aposentadoria para um par {npcId, tick}.
 * Retorna um float em [0, 1) derivado de HMAC-SHA256(serverSecret, input).
 * Propriedade principal: mesma entrada → mesmo resultado em qualquer retry.
 */
function rollAposentadoriaDeterministico(serverSecret, npcId, tick) {
  const hmac = crypto.createHmac('sha256', serverSecret);
  hmac.update(`retirement:${npcId}:${tick}`);
  const digest = hmac.digest();
  // Primeiros 4 bytes → uint32 → [0, 1)
  return digest.readUInt32BE(0) / 0x100000000;
}

// ── P1.2 — ledger de eventos do ciclo de vida ─────────────────────────────────

/**
 * Referência determinística do documento de evento para um par {npcId, tick}.
 * Usado como ledger persistido das etapas de aposentadoria + reposição.
 */
function eventoRef(db, npcId, tick) {
  return db.collection('ciclo_vida_eventos').doc(`${npcId}_${tick}`);
}

/**
 * Aplica a etapa 'retirement_applied' do ledger:
 *   - Marca o NPC como aposentado no Firestore.
 *   - Persiste o marcador da etapa atomicamente.
 * Idempotente: se o marcador já existir, retorna sem re-executar.
 */
async function aplicarEtapaAposentadoria(db, evRef, npc, tick) {
  await db.runTransaction(async (tx) => {
    const ev = await tx.get(evRef);
    if (ev.exists && (ev.data().etapa === 'retirement_applied' ||
                      ev.data().etapa === 'replacement_applied' ||
                      ev.data().etapa === 'completed')) {
      return; // já aplicado
    }
    const npcRef = db.collection('perfis').doc(npc.id);
    tx.update(npcRef, {
      'ciclo_vida.status': 'aposentado',
      'ciclo_vida.tick_aposentadoria': tick,
    });
    tx.set(evRef, {
      npc_id: npc.id,
      tick,
      etapa: 'retirement_applied',
      em: Date.now(),
    }, { merge: true });
  });
}

/**
 * Aplica a etapa 'replacement_applied' do ledger:
 *   - Cria o NPC de reposição via criarAdvogadoNPC().
 *   - Persiste o marcador e o ID do novo NPC atomicamente.
 * Idempotente: se o marcador já existir, devolve o novoId salvo sem criar outro.
 */
async function aplicarEtapaReposicao(db, evRef, params, tick) {
  // Verificar se já há um novo NPC registrado para este evento.
  const evSnap = await evRef.get();
  if (evSnap.exists && evSnap.data().novo_npc_id &&
      (evSnap.data().etapa === 'replacement_applied' ||
       evSnap.data().etapa === 'completed')) {
    return evSnap.data().novo_npc_id; // já criado — devolver ID salvo
  }

  const novoId = await criarAdvogadoNPC({
    db: params.db,
    jurisdicao: params.jurisdicao,
    sub: 'advogado',
    skillMin: 6,
    skillMax: 12,
    tiers: [1],
    confeccionarPecaSincrona: params.confeccionarPecaSincrona,
    poolTeses: params.poolTeses,
    tickAtualFn: params.tickAtualFn,
  });

  // Marcar etapa atomicamente com o ID do novo NPC.
  await evRef.set({
    etapa: 'replacement_applied',
    novo_npc_id: novoId,
    em: Date.now(),
  }, { merge: true });

  return novoId;
}

/**
 * Marcar o evento como completamente concluído.
 */
async function concluirEvento(db, evRef) {
  await evRef.set({ etapa: 'completed', concluido_em: Date.now() }, { merge: true });
}

// ── P1.4 — Distribuição mínima com slots ─────────────────────────────────────

/**
 * Garante que a faixa de iniciantes esteja acima de 70% do valor-seed.
 * [v5.10 — P1.4] Usa slots deterministicos em /distribuicao_minima_slots/
 * para que cada NPC faltante seja criado exatamente uma vez, mesmo sob
 * execuções concorrentes ou retry após crash.
 */
async function garantirDistribuicaoMinima({
  db, jurisdicao, tickAtualFn, confeccionarPecaSincrona, poolTeses,
}) {
  const tick = await tickAtualFn(db);
  const contagem = await contarPorFaixaAtual(db, jurisdicao);
  const repostos = [];

  const alvoMinimo = Math.ceil(DISTRIBUICAO_ALVO.iniciante * LIMIAR_REPOSICAO);
  const faltam = Math.max(0, alvoMinimo - contagem.iniciante);

  for (let i = 0; i < faltam; i++) {
    // Slot com ID determinístico: jurisdição + tick + índice.
    // Dois processos concorrentes que enxergam o mesmo déficit tentarão criar
    // os mesmos slots — o claim transacional dentro de criarAdvogadoNPCComSlot
    // garante que apenas um vence cada slot.
    const slotId = `distrib_min_${jurisdicao}_${tick}_${String(i).padStart(4, '0')}`;

    const { profileId, emAndamento } = await criarAdvogadoNPCComSlot(
      {
        db,
        jurisdicao,
        sub: 'advogado',
        skillMin: 6,
        skillMax: 12,
        tiers: [1],
        confeccionarPecaSincrona,
        poolTeses,
        tickAtualFn,
      },
      slotId,
    );

    if (!emAndamento && profileId) repostos.push(profileId);
  }

  return { contagem, repostos };
}

// ── Consulta auxiliar ─────────────────────────────────────────────────────────

async function npcsAtivosAcimaDaIdade(db, jurisdicao, idadeMinima, tickAtualNum) {
  const snap = await db
    .collection('perfis')
    .where('tipo', '==', 'npc')
    .where('subtipo_npc', '==', 'advogado')
    .where('banca.jurisdicao', '==', jurisdicao)
    .where('ciclo_vida.status', '==', 'ativo')
    .where('sistema.inicializacao', '==', 'ready')
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((npc) => (tickAtualNum - npc.ciclo_vida.tick_criacao) >= idadeMinima);
}

// ── Ciclo principal ───────────────────────────────────────────────────────────

/**
 * Processa aposentadoria + reposição de NPCs com ledger idempotente (P1.2)
 * e RNG determinístico por {npcId, tick} (P1.3).
 *
 * Seguro para retry: cada NPC elegível tem um documento de evento em
 * /ciclo_vida_eventos/{npcId}_{tick}. Etapas já concluídas são detectadas
 * e puladas; etapas pendentes são retomadas.
 */
async function processarCicloDeVida({
  db, jurisdicao, tickAtualFn, confeccionarPecaSincrona, poolTeses,
}) {
  const tick   = await tickAtualFn(db);
  const secret = await lerServerSecret(db);
  const elegiveis = await npcsAtivosAcimaDaIdade(db, jurisdicao, IDADE_APOSENTADORIA_MESES, tick);

  const eventos = [];
  for (const npc of elegiveis) {
    // P1.3: roll determinístico — mesmo resultado em qualquer retry.
    const fatorSkill = 1 - clamp(mediaSkillsPrincipais(npc.skills) / 50, 0, 0.7);
    const prob = PROB_APOSENTADORIA_BASE * (1 + fatorSkill);
    const roll = rollAposentadoriaDeterministico(secret, npc.id, tick);

    if (roll >= prob) continue; // NPC não aposenta neste tick

    const evRef = eventoRef(db, npc.id, tick);

    // Verificar estado atual do evento antes de qualquer escrita.
    const evSnap = await evRef.get();
    const etapaAtual = evSnap.exists ? evSnap.data().etapa : 'pending';

    if (etapaAtual === 'completed') {
      // Evento já totalmente concluído — registrar no resumo sem re-executar.
      eventos.push({
        aposentado: npc.id,
        nome_aposentado: npc.nome,
        reposto_por: evSnap.data().novo_npc_id,
        retomado: true,
      });
      continue;
    }

    // P1.2: etapas com ledger persistido.
    if (etapaAtual === 'pending' || !evSnap.exists) {
      // Inicializar o documento de evento antes de qualquer efeito.
      await evRef.set({ npc_id: npc.id, tick, etapa: 'pending', em: Date.now() });
    }

    if (etapaAtual !== 'replacement_applied' && etapaAtual !== 'completed') {
      await aplicarEtapaAposentadoria(db, evRef, npc, tick);
    }

    const novoId = await aplicarEtapaReposicao(db, evRef, {
      db, jurisdicao, confeccionarPecaSincrona, poolTeses, tickAtualFn,
    }, tick);

    await concluirEvento(db, evRef);

    eventos.push({
      aposentado: npc.id,
      nome_aposentado: npc.nome,
      reposto_por: novoId,
    });
  }

  return { tick, jurisdicao, eventos };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Mantida por compatibilidade com código que chamava reporIniciante() diretamente.
async function reporIniciante({ db, jurisdicao, tickAtualFn, confeccionarPecaSincrona, poolTeses }) {
  return criarAdvogadoNPC({
    db, jurisdicao, sub: 'advogado', skillMin: 6, skillMax: 12, tiers: [1],
    confeccionarPecaSincrona, poolTeses, tickAtualFn,
  });
}

module.exports = {
  processarCicloDeVida,
  reporIniciante,
  npcsAtivosAcimaDaIdade,
  garantirDistribuicaoMinima,
  contarPorFaixaAtual,
  faixaAtualDoNPC,
  rollAposentadoriaDeterministico,
  lerServerSecret,
  IDADE_APOSENTADORIA_MESES,
  PROB_APOSENTADORIA_BASE,
  DISTRIBUICAO_ALVO,
  LIMIAR_REPOSICAO,
};
