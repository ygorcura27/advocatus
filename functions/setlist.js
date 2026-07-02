'use strict';

/**
 * SETLIST — Advocatus Online (GDD v4.1 — Etapas 10, 11, 12)
 *
 * Callables:
 *   montarSetlist         — salva a setlist do processo no Firestore
 *   resolverEventoJulgamento — jogador faz sua escolha no evento de julgamento
 *
 * Internos exportados:
 *   calcularNotaProcesso, gerarEventoJulgamento
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const { calcularNotaPeticao, modEstadoJogador } = require('./peticoes');
const { normalizarSkillsJur } = require('./skills');

// ─── Slots por tier ──────────────────────────────────────────────────────────

const SLOTS_POR_TIER = { D: 4, C: 5, B: 6, A: 7, S: 8 };

// ─── Peso por posição e tipo ─────────────────────────────────────────────────

function pesoSlot(slotIdx, totalSlots, tipo) {
  if (slotIdx === 0)              return 1.5; // Initial Filing
  if (slotIdx === totalSlots - 1) return 1.3; // Último slot
  if (tipo === 'acao_processual') return 0.8;
  return 1.0;
}

// ─── Score de ação processual por skill ──────────────────────────────────────

const SKILL_ACAO = {
  preliminary_hearing:    'negotiation',
  expert_witness:         'legal_research',
  examination_witnesses:  'argumentation',
  oral_argument:          'oral_advocacy',
  preliminary_injunction: 'procedure',
  document_production:    'legal_research',
  personal_testimony:     'oral_advocacy',
  motion_exclude:         'procedure',
};

function calcularScoreAcao(acaoTipo, skJur) {
  const s    = normalizarSkillsJur(skJur);
  const campo = SKILL_ACAO[acaoTipo] || 'argumentation';
  const val   = s[campo] || 0;
  // Score: 1–26, proporcional ao nível 0–50
  return Math.max(1, Math.min(26, Math.round(1 + (val / 50) * 25)));
}

// ─── Bônus de sequência ──────────────────────────────────────────────────────

function calcularBonusSequencia(slots) {
  let bonus = 0;
  for (let i = 0; i < slots.length - 1; i++) {
    const cur  = slots[i];
    const next = slots[i + 1];
    // Alternância P/A
    if (cur.tipo !== next.tipo) bonus += 3;
    // Instrução (evidence) antes de petição argumentativa
    if (cur.acao_tipo === 'document_production' && next.tipo === 'peticao') bonus += 2;
    if (cur.acao_tipo === 'expert_witness'       && next.tipo === 'peticao') bonus += 2;
    // Duas fracas consecutivas — momentum quebrado
    if ((cur.nota_slot || 0) < 10 && (next.nota_slot || 0) < 10) bonus -= 5;
  }
  // Initial Filing com nota < 8 — penalidade extra
  if (slots.length > 0 && (slots[0].nota_slot || 0) < 8) bonus -= 8;
  return bonus;
}

// ─── Nota final do processo ──────────────────────────────────────────────────

/**
 * @param {Array}  slots          Array de slots já com nota_slot preenchida
 * @param {number} modEstado      Modificador do estado do jogador (0.75–1.10)
 * @returns {number}              Nota do processo 1–26
 */
function calcularNotaProcesso(slots, modEstado) {
  if (!slots || slots.length === 0) return 1;

  const total = slots.length;
  let somaPonderada = 0, somaPesos = 0;

  for (let i = 0; i < slots.length; i++) {
    const s    = slots[i];
    const peso = pesoSlot(i, total, s.tipo);
    somaPonderada += (s.nota_slot || 1) * peso;
    somaPesos     += peso;
  }

  const media       = somaPonderada / somaPesos;
  const bonusSeq    = calcularBonusSequencia(slots);
  const resultado   = (media + bonusSeq) * (modEstado ?? 1.0);

  return Math.max(1, Math.min(26, Math.round(resultado)));
}

// ─── Gerador de evento de julgamento ─────────────────────────────────────────

const EVENTOS_OPORTUNIDADE = [
  'O juiz pede esclarecimento sobre seu argumento mais forte.',
  'A parte adversa cometeu um erro processual — como você responde?',
  'O juiz sinaliza interesse em acordo — você aproveita?',
  'Sua testemunha especialista é particularmente convincente hoje.',
  'O relator elogia a qualidade técnica das peças.',
];

const EVENTOS_COMPLICACAO = [
  'Uma testemunha-chave muda seu depoimento inesperadamente.',
  'A parte adversa apresenta precedente que você não antecipou.',
  'O juiz questiona a admissibilidade de sua principal prova.',
  'O cliente liga no intervalo querendo aceitar proposta menor.',
  'O relator sinaliza dúvida sobre a adequação da via processual.',
];

const EVENTOS_CRISE = [
  'O juiz considera arquivar o processo com prejudicialidade.',
  'O cliente quer aceitar 20% do valor pleiteado.',
  'A parte adversa pede julgamento antecipado da lide.',
  'Sua peça principal tem vício processual detectado pelo adversário.',
  'Julgador indica que a tese não tem precedente favorável neste tribunal.',
];

const IMPACTO_POR_INSTANCIA = {
  trial:   8,
  appeals: 12,
  circuit: 18,
  supreme: 25,
};

// Converte os nomes de instância do jogo para os do sistema de setlist
function normalizarInstancia(inst) {
  const MAP = { '1grau': 'trial', 'TJ': 'appeals', 'TJRJ': 'appeals', 'TJSP': 'appeals',
    'STJ': 'circuit', 'TST': 'circuit', 'STF': 'supreme' };
  return MAP[inst] || (inst && inst !== '1grau' ? 'appeals' : 'trial');
}

function sortearEvento(categoria) {
  const lista = categoria === 'oportunidade' ? EVENTOS_OPORTUNIDADE
    : categoria === 'complicacao' ? EVENTOS_COMPLICACAO
    : EVENTOS_CRISE;
  return lista[Math.floor(Math.random() * lista.length)];
}

function gerarOpcoes(categoria, instancia) {
  const base = [
    { id: 'capitalizar',    label: 'Capitalizar (usar skill principal)', skill: 'argumentation', risco: 'medio' },
    { id: 'suporte',        label: 'Ação de suporte (mais seguro)',      skill: 'procedure',     risco: 'baixo' },
    { id: 'manter_curso',   label: 'Manter o curso (sem ação)',          skill: null,            risco: 'nulo'  },
  ];
  if (categoria !== 'crise') {
    base.splice(2, 0, {
      id: 'propor_acordo', label: 'Propor acordo', skill: 'negotiation', risco: 'baixo',
    });
  }
  return base;
}

/**
 * Gera o evento de julgamento baseado na nota provisória.
 * Gravado no Firestore ANTES da escolha do jogador.
 */
function gerarEventoJulgamento(nota_provisoria, instancia) {
  const categoria = nota_provisoria >= 17 ? 'oportunidade'
    : nota_provisoria >= 10 ? 'complicacao'
    : 'crise';

  const impacto_max = IMPACTO_POR_INSTANCIA[instancia] || 8;
  const is_supreme  = instancia === 'supreme';

  return {
    categoria,
    descricao: sortearEvento(categoria),
    impacto_max,
    opcoes:    gerarOpcoes(categoria, instancia),
    escolha_feita: null,
    impacto:       null,
    // Supreme: segundo evento em sequência
    segundo_evento: is_supreme ? {
      categoria:     null, // definido após resolução do primeiro
      descricao:     null,
      opcoes:        null,
      escolha_feita: null,
      impacto:       null,
    } : null,
  };
}

// ─── Calcular impacto da escolha no evento ───────────────────────────────────

function calcularImpactoEscolha(escolha, categoria, impacto_max, skJur) {
  const s    = normalizarSkillsJur(skJur);

  if (escolha === 'manter_curso') return 0;

  if (escolha === 'propor_acordo') return 0; // resolve o processo, não afeta nota

  if (escolha === 'capitalizar') {
    const skill = s.argumentation || 0;
    if (skill >= 31) return impacto_max;
    if (skill >= 11) return Math.round(impacto_max * 0.5);
    return Math.round(impacto_max * 0.1);
  }

  if (escolha === 'suporte') {
    const skill = s.procedure || 0;
    const base  = Math.round(impacto_max * 0.4);
    return skill >= 21 ? base : Math.round(base * 0.5);
  }

  if (escolha === 'combater') {
    const skill = s.argumentation || 0;
    return skill >= 35
      ? Math.round(impacto_max * 0.7)
      : -Math.round(impacto_max * 0.4); // piora se skill baixa
  }

  return 0;
}

// ─── Callable: montarSetlist ─────────────────────────────────────────────────

exports.montarSetlist = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { processo_id, slots } = request.data || {};

  if (!processo_id || !Array.isArray(slots) || slots.length === 0) {
    throw new HttpsError('invalid-argument', 'processo_id e slots[] são obrigatórios.');
  }

  const [procSnap, jogSnap] = await Promise.all([
    db.collection('processos').doc(processo_id).get(),
    db.collection('jogadores').doc(uid).get(),
  ]);

  if (!procSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogSnap.exists)  throw new HttpsError('not-found', 'Jogador não encontrado.');

  const proc  = procSnap.data();
  const j     = jogSnap.data();

  // Verificar autorização: advogado do processo ou membro do escritório
  const isAdv = proc.advogado_uid === uid;
  const isEsc = proc.pool_escritorio_id && proc.pool_escritorio_id === j.escritorio_proprio_id;
  if (!isAdv && !isEsc) {
    throw new HttpsError('permission-denied', 'Você não tem permissão para montar setlist neste processo.');
  }
  if (!j.oab) {
    throw new HttpsError('failed-precondition', 'OAB necessária para usar o sistema de setlist.');
  }

  const skJur = normalizarSkillsJur(j.skills_jur);
  const escId = j.pat?.escritorio || 'cw';

  // Validar tier e número máximo de slots
  const tier     = proc.tier || 'D';
  const maxSlots = SLOTS_POR_TIER[tier] || 4;
  if (slots.length > maxSlots) {
    throw new HttpsError('invalid-argument', `Tier ${tier} permite no máximo ${maxSlots} slots.`);
  }

  // Validar slot 1 deve ser petição (não ação processual)
  if (slots[0]?.tipo !== 'peticao') {
    throw new HttpsError('invalid-argument', 'Slot 1 deve ser uma Petição Inicial.');
  }

  // Calcular nota de cada slot
  const slotsCalculados = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    let nota_slot = 1;

    if (slot.tipo === 'peticao' && slot.peticao_id) {
      const petSnap = await db.collection('peticoes').doc(slot.peticao_id).get();
      if (!petSnap.exists) throw new HttpsError('not-found', `Petição ${slot.peticao_id} não encontrada.`);
      const pet = { ...petSnap.data(), area_caso: proc.area || proc.tipo };
      nota_slot = calcularNotaPeticao(pet, skJur, j, escId);

      // Teto hard para genéricas
      if (pet.generica) nota_slot = Math.min(12, nota_slot);

    } else if (slot.tipo === 'acao_processual' && slot.acao_tipo) {
      nota_slot = calcularScoreAcao(slot.acao_tipo, skJur);
    }

    slotsCalculados.push({
      slot:      i + 1,
      tipo:      slot.tipo,
      peticao_id: slot.peticao_id || null,
      acao_tipo:  slot.acao_tipo  || null,
      nota_slot,
      executado:  false,
    });
  }

  // ── Supervisão NPC: +2 à nota quando NPC Sênior+ da mesma área supervisiona
  // GDD Seção 37.2 — custo: 5⚡/mês do supervisor (debitado no avancar_mes)
  let supervisaoAtiva = false;
  if (proc.func_id && j.escritorio_proprio_id) {
    const areaProcesso = proc.area || proc.tipo || '';
    const funcSnap = await db.collection('escritorios')
      .doc(j.escritorio_proprio_id)
      .collection('funcionarios').get();
    const CARGOS_SENIOR = new Set(['snr','asc','soc','snm']);
    for (const fd of funcSnap.docs) {
      if (fd.id === proc.func_id) continue;
      const f = fd.data();
      if (!CARGOS_SENIOR.has(f.cargo_id)) continue;
      if (f.burnout_npc || f.em_ferias) continue;
      const skJurNPC = (f.skills_jur || {});
      const areaField = `area_${areaProcesso}`;
      if ((skJurNPC[areaField] || 0) >= 20) { // tem ao menos algum domínio na área
        supervisaoAtiva = true;
        // Débito de 5⚡ do supervisor marcado para o avancar_mes processar
        await fd.ref.update({ energia_npc_usada_mes: (f.energia_npc_usada_mes || 0) + 5 });
        break;
      }
    }
  }

  const modEst       = modEstadoJogador(j);
  let nota_provisoria = calcularNotaProcesso(slotsCalculados, modEst);
  if (supervisaoAtiva) nota_provisoria = Math.min(26, nota_provisoria + 2);
  const instancia    = normalizarInstancia(proc.instancia_atual || proc.instancia);
  const evento       = gerarEventoJulgamento(nota_provisoria, instancia);

  await procSnap.ref.update({
    setlist:        slotsCalculados,
    supervisao_ativa: supervisaoAtiva,
    nota_provisoria,
    evento_julgamento: evento,
    status:         'aguardando_evento',
  });

  logger.info(`[SETLIST] ${uid} → ${processo_id}, nota_provisória=${nota_provisoria}, evento=${evento.categoria}`);
  return { ok: true, nota_provisoria, evento_categoria: evento.categoria, slots: slotsCalculados.length };
});

// ─── Callable: resolverEventoJulgamento ──────────────────────────────────────

exports.resolverEventoJulgamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { processo_id, escolha, segundo_evento_escolha } = request.data || {};

  if (!processo_id || !escolha) {
    throw new HttpsError('invalid-argument', 'processo_id e escolha são obrigatórios.');
  }

  const [procSnap, jogSnap] = await Promise.all([
    db.collection('processos').doc(processo_id).get(),
    db.collection('jogadores').doc(uid).get(),
  ]);

  if (!procSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogSnap.exists)  throw new HttpsError('not-found', 'Jogador não encontrado.');

  const proc  = procSnap.data();
  const j     = jogSnap.data();
  const skJur = normalizarSkillsJur(j.skills_jur);
  const ev    = proc.evento_julgamento;

  if (!ev) throw new HttpsError('failed-precondition', 'Nenhum evento de julgamento pendente.');
  if (ev.escolha_feita !== null) throw new HttpsError('failed-precondition', 'Evento já resolvido.');

  const impacto = calcularImpactoEscolha(escolha, ev.categoria, ev.impacto_max, skJur);

  const eventoAtualizado = {
    ...ev,
    escolha_feita: escolha,
    impacto,
  };

  // Supreme Court: segundo evento
  if (ev.segundo_evento !== null) {
    const cat2       = impacto > 0 ? 'oportunidade' : 'crise';
    const desc2      = sortearEvento(cat2);
    const impMax2    = Math.round(ev.impacto_max * 0.5);
    let impacto2     = 0;

    if (segundo_evento_escolha) {
      impacto2 = calcularImpactoEscolha(segundo_evento_escolha, cat2, impMax2, skJur);
    }

    eventoAtualizado.segundo_evento = {
      categoria:     cat2,
      descricao:     desc2,
      impacto_max:   impMax2,
      opcoes:        gerarOpcoes(cat2, 'supreme'),
      escolha_feita: segundo_evento_escolha || null,
      impacto:       segundo_evento_escolha ? impacto2 : null,
    };
  }

  await procSnap.ref.update({
    evento_julgamento: eventoAtualizado,
    status: 'pronto_para_sentenca',
  });

  logger.info(`[EVENTO] ${uid} → ${processo_id}, escolha=${escolha}, impacto=${impacto}`);
  return { ok: true, impacto, impacto_total: impacto + (eventoAtualizado.segundo_evento?.impacto || 0) };
});

// ─── Internos exportados ─────────────────────────────────────────────────────

module.exports = Object.assign(module.exports, {
  calcularNotaProcesso,
  gerarEventoJulgamento,
  calcularImpactoEscolha,
  calcularScoreAcao,
});
