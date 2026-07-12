'use strict';

/**
 * PETIÇÕES — Advocatus Online (GDD v4.1 — Etapas 7, 8, 9)
 *
 * Callables:
 *   componerPeticao    — inicia composição de uma petição original
 *   peticaoGenerica    — retorna petição genérica (teto 12, sem tempo de espera)
 *   calcularNotaSlot   — calcula nota final de uma petição para uso num slot
 *
 * Internos exportados (usados por setlist.js e processarSentenca):
 *   calcularNotaPeticao, atualizarFama, processarDecaimentoPopularidade
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const {
  calcTetoLegalDrafting,
  calcModLegalResearch,
  calcModDocumentType,
  calcModPracticeArea,
  calcCompatAreasCross,
  normalizarSkillsJur,
  aplicarXpDocType,
} = require('./skills');
const { verificarOriginalidadeTese, listarTesesPorArea } = require('./teses');
const { registrarCopiaVendida } = require('./artigos_livros');

// ─── Estilos de escrita (GDD v5.1 — 3º seletor) ─────────────────────────────

const ESTILOS_ESCRITA = ['inovadora', 'jurisprudencial', 'legalista', 'agressiva'];

const ESTILO_LABELS = {
  inovadora:       'Inovadora',
  jurisprudencial: 'Jurisprudencial',
  legalista:       'Legalista',
  agressiva:       'Agressiva',
};

// Mapeamento estilo → campo reacoes do julgador (GDD v5.1 §2.1)
const ESTILO_REACAO = {
  inovadora:       'doutrinário',
  jurisprudencial: 'jurisprudencial',
  legalista:       'fatual',
  agressiva:       'constitucional',
};

// ─── Labels de tipo e ramo (para gerar nome automático server-side) ──────────

const DOC_LABELS_CURTO = {
  initial_filing:      'Inicial',
  responsive_pleading: 'Contestação',
  motion:              'Requerimento',
  appellate_brief:     'Apelação',
  supreme_brief:       'Memorial',
  trial_brief:         'Alegações Finais',
  evidence:            'Instrução',
  deposition:          'Depoimento',
};

const AREA_LABELS_CURTO = {
  employment:  'Trabalhista',
  tax:         'Tributário',
  civil:       'Cível',
  criminal:    'Criminal',
  corporate:   'Empresarial',
  immigration: 'Imigração',
  bankruptcy:  'Recuperação Jud.',
};

// ─── Escala qualitativa de tiers (GDD v5.1 §5) ───────────────────────────────

function getTierLabel(skill) {
  if (skill >= 42) return 'LENDÁRIA';
  if (skill >= 34) return 'Renomada';
  if (skill >= 27) return 'Contundente';
  if (skill >= 18) return 'Convincente';
  if (skill >= 9)  return 'Aceitável';
  return 'Iniciante';
}

// ─── Bônus de fama (aditivo, pós-multiplicadores) ───────────────────────────

function bonusFama(fama) {
  if (fama >= 100) return 6;
  if (fama >= 95)  return 5;
  if (fama >= 85)  return 4;
  if (fama >= 75)  return 3;
  if (fama >= 60)  return 2;
  if (fama >= 40)  return 1;
  return 0;
}

// ─── Modificador de popularidade ─────────────────────────────────────────────

function modPopularidade(pop) {
  if (pop >= 86) return 1.20;
  if (pop >= 71) return 1.10;
  if (pop >= 51) return 1.05;
  if (pop >= 31) return 1.00;
  if (pop >= 16) return 0.90;
  if (pop >= 6)  return 0.78;
  if (pop >= 1)  return 0.65;
  return 0.50;
}

// ─── Nota Teto: calculada na finalização (GDD v5.1 §6) ──────────────────────

/**
 * Calcula nota_teto, nota_argumentacao e nota_redacao usando as skills do
 * jogador NO MOMENTO DA FINALIZAÇÃO. Estes valores travam permanentemente.
 */
function calcularNotaTeto(skJur, docType, practiceArea, jogador) {
  const s = normalizarSkillsJur(skJur);

  // Argumentação: Legal Drafting como dimensão dominante
  const tetoDrafting = calcTetoLegalDrafting(s.legal_drafting);
  const fatorLD = 0.50 + (s.legal_drafting / 50) * 0.45;
  const nota_argumentacao = Math.max(1, Math.min(tetoDrafting, Math.round(tetoDrafting * fatorLD)));

  // Redação: Legal Research como dimensão moduladora
  const tetoLR   = calcTetoLegalDrafting(s.legal_research);
  const fatorLR  = 0.50 + (s.legal_research / 50) * 0.45;
  const nota_redacao = Math.max(1, Math.min(tetoLR, Math.round(tetoLR * fatorLR)));

  // Combinação com Document Type, Practice Area e estado mental na finalização
  const modDT  = calcModDocumentType(s[`doc_${docType}`] || 0);
  const modPA  = calcModPracticeArea(s[`area_${practiceArea}`] || 0);
  const modEst = modEstadoJogador(jogador || {});

  const raw = (nota_argumentacao * 0.65 + nota_redacao * 0.35) * modDT * modPA * modEst;
  const nota_teto = Math.max(1, Math.min(26, Math.round(raw)));

  return { nota_argumentacao, nota_redacao, nota_teto };
}

// ─── Nota Efetiva: dinâmica, capped pela nota_teto (GDD v5.1 §7) ─────────────

/**
 * Calcula a nota efetiva de uma petição v5.1 (com nota_teto definida).
 * nota_efetiva = min(nota_teto, round(nota_teto × modPop) + bonusFama)
 */
function calcularNotaEfetiva(peticao) {
  const notaTeto = peticao.nota_teto ?? peticao.teto_nota ?? 12;
  const modPop   = modPopularidade(peticao.popularidade ?? 0);
  const bFama    = bonusFama(peticao.fama ?? 0);
  const raw      = Math.round(notaTeto * modPop) + bFama;
  return Math.max(1, Math.min(notaTeto, raw));
}

// ─── Modificador de estado do jogador ───────────────────────────────────────

function modEstadoJogador(jogador) {
  const sm = jogador.saude_mental ?? 80;
  const burnout = jogador.em_burnout || false;
  if (burnout)  return 0.75;
  if (sm > 70)  return 1.10;
  if (sm >= 40) return 1.00;
  return 0.90;
}

// ─── Modificador de local de trabalho ───────────────────────────────────────

function modLocal(escritorioId) {
  const MODS = {
    esp: 1.10,  // escritório próprio tier 3+
    esm: 1.08,  // escritório próprio tier 2
    sal: 1.05,  // sala compartilhada
    cw:  1.00,  // coworking genérico
    home:1.03,  // home office
  };
  return MODS[escritorioId] ?? 1.00;
}

// ─── Fórmula principal: nota final de uma petição num slot ──────────────────

/**
 * Calcula a nota final de uma petição para uso num processo.
 * Usa as skills do jogador/NPC que CRIOU a petição e as do julgador ativo.
 *
 * @param {object} peticao  Documento da coleção /peticoes/{id}
 * @param {object} skJur    skills_jur do usuário que vai USAR a petição (pode ser NPC)
 * @param {object} jogador  Dados do jogador (saude_mental, em_burnout)
 * @param {string} escId    ID do tipo de escritório (para mod_local)
 * @returns {number}        Nota final 1–26
 */
function calcularNotaPeticao(peticao, skJur, jogador, escId) {
  const skills = normalizarSkillsJur(skJur);

  // Teto pelo Legal Drafting
  const teto = calcTetoLegalDrafting(skills.legal_drafting);

  // Nota base (gerada na composição) + modificador de Legal Research
  const modLR    = calcModLegalResearch(skills.legal_research);
  const notaBase = Math.min(teto, (peticao.nota_base || 1) + modLR);

  // Multiplicadores
  const modDT   = calcModDocumentType(skills[`doc_${peticao.document_type}`] || 0);
  const rawArea  = skills[`area_${peticao.practice_area}`] || 0;
  const modPA   = peticao.area_caso
    ? calcCompatAreasCross(peticao.practice_area, peticao.area_caso) * calcModPracticeArea(rawArea)
    : calcModPracticeArea(rawArea);
  const modPop  = modPopularidade(peticao.popularidade ?? 0);
  const modEst  = modEstadoJogador(jogador || {});
  const modLoc  = modLocal(escId || 'cw');

  // Bônus de fama (aditivo)
  const bFama   = bonusFama(peticao.fama ?? 0);

  const resultado = notaBase * modDT * modPA * modPop * modEst * modLoc + bFama;
  return Math.max(1, Math.min(26, Math.round(resultado)));
}

// ─── Cap de reputação por cargo (mesma tabela de processar_sentenca) ─────────

const REP_CAP_PET = {
  est:30, jnr:40, pln:50, snr:60, asc:70, soc:80, snm:90,
  jsub:40, jtit:55, dsb:35, mstj:45,
  padj:35, prom:45, pjus:55, pgj:65,
  dadj:55, def:70, dch:85, dge:100,
};
function repCapDoCargo(cargoId) { return REP_CAP_PET[cargoId] || 55; }

// ─── Fama: crescimento com teto por instância ────────────────────────────────

const MULT_INSTANCIA = { trial: 1.0, appeals: 1.5, circuit: 2.5, supreme: 4.0 };

// Teto de fama desbloqueado por instância e vitórias — verificado antes de incrementar
// Simplificado: armazena `fama_teto_desbloqueado` no documento da petição.
// A lógica de desbloqueio progressivo fica em atualizarFama.
const TETOS_FAMA = [
  { teto: 39,  instancia: null,    vitorias: 0  },
  { teto: 59,  instancia: 'appeals', vitorias: 1 },
  { teto: 74,  instancia: 'appeals', vitorias: 3 },
  { teto: 84,  instancia: 'circuit', vitorias: 1 },
  { teto: 94,  instancia: 'circuit', vitorias: 3 },
  { teto: 99,  instancia: 'supreme', vitorias: 8 },
  { teto: 100, instancia: 'supreme', vitorias: 12 },
];

function calcularTetoFama(peticao) {
  // Usa o teto já armazenado no documento (atualizado progressivamente)
  return peticao.fama_teto_desbloqueado ?? 39;
}

/**
 * Calcula o próximo teto de fama desbloqueado com base nas vitórias por instância.
 * GDD Seção 14.2.
 */
function calcularNovoTetoFama(p, instancia, resultado) {
  if (resultado !== 'procedente') return p.fama_teto_desbloqueado ?? 39;

  const vit = p.vitorias_por_instancia || {};
  const novaVit = {
    trial:   (vit.trial   || 0) + (instancia === 'trial'   ? 1 : 0),
    appeals: (vit.appeals || 0) + (instancia === 'appeals' ? 1 : 0),
    circuit: (vit.circuit || 0) + (instancia === 'circuit' ? 1 : 0),
    supreme: (vit.supreme || 0) + (instancia === 'supreme' ? 1 : 0),
  };

  // Tetos em ordem crescente — retorna o maior desbloqueado
  if (novaVit.supreme >= 12) return 100;
  if (novaVit.supreme >= 8)  return 99;
  if (novaVit.supreme >= 3 || novaVit.circuit >= 5) return 94;
  if (novaVit.supreme >= 1 || novaVit.circuit >= 3) return 84;
  if (novaVit.circuit >= 1 || novaVit.appeals >= 3) return 74;
  if (novaVit.appeals >= 1) return 59;
  return 39;
}

/**
 * Aplica ganho/decaimento de popularidade após um uso.
 * GDD Seção 15.1 — tanto o ganho por uso quanto o decaimento por uso.
 */
function calcularDeltaPopularidade(pop, resultado) {
  const vitoria = resultado === 'procedente';
  let delta = 0;

  // Ganho por uso (fase de ascensão)
  if (pop < 70)       delta += vitoria ? 17 : 12;
  else if (pop < 85)  delta += vitoria ? 9  :  6;
  else                delta += vitoria ? 3  :  2;

  // Decaimento por uso (ativa quando pop ≥ 60)
  if (pop >= 60) delta -= 4;

  return delta;
}

/**
 * Atualiza fama e popularidade da petição após uso num processo.
 * Fama só sobe; popularidade tem ganho E decaimento por uso.
 */
async function atualizarFama(db, peticaoId, resultado, instancia, opts = {}) {
  const ref  = db.collection('peticoes').doc(peticaoId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const p         = snap.data();
  const mult      = MULT_INSTANCIA[instancia] || 1.0;
  const baseGanho = resultado === 'procedente' ? 8 : resultado === 'acordo' ? 4 : 2;
  const ganhoFama = Math.round(baseGanho * mult);

  const tetoAtual  = p.fama_teto_desbloqueado ?? 39;
  const novaFama   = Math.min(tetoAtual, (p.fama || 0) + ganhoFama);
  const novoTeto   = calcularNovoTetoFama(p, instancia, resultado);

  // Popularidade — ganho + decaimento por uso
  const pop     = p.popularidade || 0;
  const deltaPop = calcularDeltaPopularidade(pop, resultado);
  const novaPop  = Math.max(0, Math.min(100, pop + deltaPop));

  // Ativa flag de decaimento mensal quando pop ≥ 60 E fama ≥ 50
  const decaimentoAtivo = novaPop >= 60 && novaFama >= 50;

  // Vitórias por instância (para desbloqueio progressivo do teto)
  const vitAtual = p.vitorias_por_instancia || {};
  const vitUpd   = resultado === 'procedente'
    ? { ...vitAtual, [instancia]: (vitAtual[instancia] || 0) + 1 }
    : vitAtual;

  await ref.update({
    fama:                    novaFama,
    fama_teto_desbloqueado:  novoTeto,
    popularidade:            novaPop,
    decaimento_ativo:        decaimentoAtivo,
    vitorias_por_instancia:  vitUpd,
    vitorias:                resultado === 'procedente' ? FieldValue.increment(1) : FieldValue.increment(0),
    derrotas:                resultado === 'improcedente' ? FieldValue.increment(1) : FieldValue.increment(0),
    usos_total:              FieldValue.increment(1),
    ultimo_uso:              new Date().toISOString(),
  });

  // ── Co-autoria: distribui repDelta proporcional aos co-autores (GDD v5.1 §11) ──
  const { repDelta, primaryUid } = opts;
  if (repDelta && primaryUid && Array.isArray(p.autores) && p.autores.length > 1) {
    const coautores = p.autores.filter(a => a.uid !== primaryUid);
    await Promise.all(coautores.map(async (a) => {
      if (!a.uid || !a.contribuicao_pct) return;
      const coRep = Math.floor(Math.abs(repDelta) * (a.contribuicao_pct / 100));
      if (coRep <= 0) return;
      try {
        const coSnap = await db.collection('jogadores').doc(a.uid).get();
        if (!coSnap.exists) return;
        const coDados = coSnap.data();
        const coCap   = repCapDoCargo(coDados.cargo_id);
        const coRepAtual = coDados.reputacao || 30;
        const coRepNova  = repDelta > 0
          ? Math.min(coCap, coRepAtual + coRep)
          : Math.max(0, coRepAtual - coRep);
        await db.collection('jogadores').doc(a.uid).update({ reputacao: coRepNova });
      } catch (e) {
        logger.warn(`[CO-AUTORIA] Erro ao distribuir rep para ${a.uid}:`, e.message);
      }
    }));
  }
}

// ─── Popularidade: decaimento mensal ─────────────────────────────────────────

/**
 * Processa decaimento mensal de popularidade de todas as petições do jogador.
 * Chamado por avancar_mes.js.
 */
async function processarDecaimentoPopularidade(db, jogadorUid) {
  const snap = await db.collection('peticoes')
    .where('jogador_uid', '==', jogadorUid)
    .where('decaimento_ativo', '==', true)
    .get();

  if (snap.empty) return;

  const proms = [];
  for (const doc of snap.docs) {
    const p       = doc.data();
    const decaim  = (p.fama || 0) >= 80 ? 6 : 3;
    const novaPop = Math.max(0, (p.popularidade || 0) - decaim);
    proms.push(doc.ref.update({ popularidade: novaPop }));
  }
  await Promise.all(proms);
}

// ─── Callable: componerPeticao (GDD v5.1 — Confecção de Peças) ───────────────

exports.componerPeticao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const {
    document_type,
    practice_area,
    estilo_escrita,
    tese_central,
    titulo,       // nome customizado (editável até 1º uso)
  } = request.data || {};

  if (!document_type || !practice_area) {
    throw new HttpsError('invalid-argument', 'document_type e practice_area são obrigatórios.');
  }

  const estiloValido = estilo_escrita && ESTILOS_ESCRITA.includes(estilo_escrita)
    ? estilo_escrita
    : 'legalista';

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j     = snap.data();
  const skJur = normalizarSkillsJur(j.skills_jur);

  if (!j.oab) {
    throw new HttpsError('failed-precondition', 'OAB/Bar Exam necessário para confeccionar petições.');
  }

  // Confecção leva sempre 1 mês (GDD v5.1 §6)
  const mesGlobal    = j.mes_global_pessoal || 0;
  const mesConclusao = mesGlobal + 1;

  // Nome automático: {Tipo} - {Ramo} - {Estilo} - "Nome temporário" (GDD v5.1 §3)
  const nomeAuto = [
    DOC_LABELS_CURTO[document_type]  || document_type,
    AREA_LABELS_CURTO[practice_area] || practice_area,
    ESTILO_LABELS[estiloValido],
    '"Nome temporário"',
  ].join(' - ');

  const novaPeticao = {
    jogador_uid:      uid,
    autores:          [{ uid, contribuicao_pct: 100 }],  // co-autoria GDD v5.1
    titulo:           titulo || nomeAuto,
    nome:             titulo || nomeAuto,   // alias para compat com UI existente
    titulo_travado:   false,
    document_type,
    practice_area,
    estilo_escrita:   estiloValido,
    tese_central:     tese_central || null,
    geracao:          1,
    peticao_base_id:  null,
    // nota_teto e dimensões são calculados na finalização (mês N+1) com as skills daquele momento
    nota_teto:        null,
    nota_argumentacao: null,
    nota_redacao:     null,
    tier_argumentacao: null,
    tier_redacao:     null,
    // Campos de fama/pop herdados do sistema v4.1 (inalterados)
    fama:             0,
    fama_teto_desbloqueado: 39,
    popularidade:     0,
    decaimento_ativo: false,
    usos_total:       0,
    vitorias:         0,
    derrotas:         0,
    vitorias_por_instancia: {},
    ultimo_uso:       null,
    processos_usada:  [],
    status:           'em_composicao',
    mes_conclusao:    mesConclusao,
    criada_em:        new Date().toISOString(),
    generica:         false,
  };

  const ref = await db.collection('peticoes').add(novaPeticao);

  // XP de início de confecção (+1 Doc Type como antes)
  await db.collection('jogadores').doc(uid).update({
    peticoes_compostas_mes: FieldValue.increment(1),
  });
  await aplicarXpDocType(db, uid, document_type, false);

  logger.info(`[CONFECCIONAR] ${uid} → ${document_type}/${practice_area}/${estiloValido}, finaliza mês ${mesConclusao}`);
  return { ok: true, peticao_id: ref.id, mes_conclusao: mesConclusao, dias: 30 };
});

// ─── Callable: adicionarCoAutor (GDD v5.1 §11) ───────────────────────────────

exports.adicionarCoAutor = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id, coautor_uid, contribuicao_pct } = request.data || {};

  if (!peticao_id || !coautor_uid || !contribuicao_pct) {
    throw new HttpsError('invalid-argument', 'peticao_id, coautor_uid e contribuicao_pct são obrigatórios.');
  }
  if (coautor_uid === uid) {
    throw new HttpsError('invalid-argument', 'Você já é o autor principal.');
  }
  const pct = Number(contribuicao_pct);
  if (!Number.isInteger(pct) || pct < 5 || pct > 49) {
    throw new HttpsError('invalid-argument', 'contribuicao_pct deve ser um inteiro entre 5 e 49.');
  }

  const petRef  = db.collection('peticoes').doc(peticao_id);
  const petSnap = await petRef.get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');

  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) {
    throw new HttpsError('permission-denied', 'Apenas o autor principal pode adicionar co-autores.');
  }
  if (pet.status !== 'em_composicao') {
    throw new HttpsError('failed-precondition', 'Só é possível adicionar co-autores enquanto a petição está em confecção.');
  }

  // Verifica que o co-autor existe e pertence ao mesmo escritório
  const coSnap = await db.collection('jogadores').doc(coautor_uid).get();
  if (!coSnap.exists) throw new HttpsError('not-found', 'Co-autor não encontrado.');

  const coJogador = coSnap.data();
  const escPrimario = (await db.collection('jogadores').doc(uid).get()).data();
  const mesmoEscritorioEmpregado = escPrimario.escritorio_empregado_id &&
    escPrimario.escritorio_empregado_id === coJogador.escritorio_empregado_id;
  const mesmoEscritorioProprio   = escPrimario.escritorio_proprio_id &&
    (escPrimario.escritorio_proprio_id === coJogador.escritorio_empregado_id ||
     escPrimario.escritorio_proprio_id === coJogador.escritorio_proprio_id);
  if (!mesmoEscritorioEmpregado && !mesmoEscritorioProprio) {
    throw new HttpsError('failed-precondition', 'Co-autor deve pertencer ao mesmo escritório.');
  }

  // Recalcula percentuais — não pode ultrapassar 100%
  const autoresAtuais = Array.isArray(pet.autores) ? pet.autores : [{ uid, contribuicao_pct: 100 }];
  const jaExiste = autoresAtuais.find(a => a.uid === coautor_uid);
  if (jaExiste) throw new HttpsError('already-exists', 'Co-autor já adicionado a esta petição.');

  const totalJaCedido = autoresAtuais.filter(a => a.uid !== uid)
    .reduce((s, a) => s + (a.contribuicao_pct || 0), 0);
  if (totalJaCedido + pct > 70) {
    throw new HttpsError('failed-precondition', `Máximo de 70% pode ser cedido a co-autores (já cedidos: ${totalJaCedido}%).`);
  }

  const novoAutores = autoresAtuais.map(a =>
    a.uid === uid ? { ...a, contribuicao_pct: a.contribuicao_pct - pct } : a
  );
  novoAutores.push({ uid: coautor_uid, contribuicao_pct: pct });

  await petRef.update({ autores: novoAutores });

  logger.info(`[CO-AUTORIA] ${uid} adicionou ${coautor_uid} (${pct}%) em petição ${peticao_id}`);
  return { ok: true, autores: novoAutores };
});

// ─── Callable: peticaoGenerica (Etapa 8) ─────────────────────────────────────

exports.peticaoGenerica = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { practice_area, area_caso } = request.data || {};
  const document_type = request.data?.document_type || 'initial_filing';

  if (!practice_area) {
    throw new HttpsError('invalid-argument', 'practice_area é obrigatório.');
  }

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();

  // Genérica: disponível imediatamente, teto hard 12/26
  const NOTA_BASE_GENERICA = 10; // base; teto aplicado na nota final pelo calcularNotaPeticao

  const petGenerica = {
    jogador_uid:      uid,
    nome:             `[Genérica] ${document_type.replace(/_/g,' ')} — ${practice_area}`,
    document_type,
    practice_area,
    area_caso:        area_caso || practice_area,
    geracao:          1,
    peticao_base_id:  null,
    nota_base:        NOTA_BASE_GENERICA,
    teto_nota:        12,           // teto hard da genérica
    fama:             0,
    popularidade:     0,
    decaimento_ativo: false,
    usos_total:       0,
    vitorias:         0,
    derrotas:         0,
    ultimo_uso:       null,
    processos_usada:  [],
    status:           'pronta',
    criada_em:        new Date().toISOString(),
    generica:         true,
  };

  const ref = await db.collection('peticoes').add(petGenerica);
  return { ok: true, peticao_id: ref.id, nota_base: NOTA_BASE_GENERICA, teto: 12, generica: true };
});

// ─── Callable: variarPeticao (Etapa 16) ──────────────────────────────────────

// Fator de teto por geração: GDD Seção 11
const FATOR_GERACAO = { 1: 1.00, 2: 0.80, 3: 0.65 };
function fatorTetoPorGeracao(geracao) {
  return geracao <= 1 ? 1.00 : geracao === 2 ? 0.80 : geracao === 3 ? 0.65 : 0.50;
}

// Fator de tempo por geração (relativo ao tempo base do tipo/cargo)
function fatorTempoPorGeracao(geracao) {
  return geracao <= 1 ? 1.0 : geracao === 2 ? 0.50 : geracao === 3 ? 0.40 : 0.30;
}

// ─── Callable: contratarParecerista (GDD v5.1 §12) ───────────────────────────

const TIERS_PARECERISTA = {
  1: { label: 'Iniciante',   custo: 2000,  nota_teto: 8  },
  2: { label: 'Especialista', custo: 5000, nota_teto: 14 },
  3: { label: 'Renomado',    custo: 12000, nota_teto: 20 },
  4: { label: 'Luminária',   custo: 30000, nota_teto: 26 },
};

exports.contratarParecerista = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();
  const { tier, practice_area } = request.data || {};

  const tierNum = parseInt(tier, 10);
  const config  = TIERS_PARECERISTA[tierNum];
  if (!config) throw new HttpsError('invalid-argument', 'Tier inválido. Use 1, 2, 3 ou 4.');
  if (!practice_area) throw new HttpsError('invalid-argument', 'practice_area obrigatório.');

  const snap = await db.collection('jogadores').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = snap.data();
  if ((j.dinheiro || 0) < config.custo) {
    throw new HttpsError('failed-precondition',
      `Saldo insuficiente. Custo: R$${config.custo.toLocaleString('pt-BR')}. Saldo: R$${(j.dinheiro||0).toLocaleString('pt-BR')}.`);
  }

  const notaBase = Math.round(config.nota_teto * 0.75);
  const novaPeticao = {
    jogador_uid:      uid,
    autores:          [{ uid, contribuicao_pct: 100 }],
    titulo:           `Parecer ${config.label} — ${practice_area}`,
    nome:             `Parecer ${config.label} — ${practice_area}`,
    titulo_travado:   true,
    document_type:    'legal_opinion',
    practice_area,
    estilo_escrita:   'legalista',
    tese_central:     null,
    geracao:          1,
    peticao_base_id:  null,
    nota_teto:        config.nota_teto,
    nota_argumentacao: Math.round(config.nota_teto * 0.8),
    nota_redacao:     Math.round(config.nota_teto * 0.7),
    tier_argumentacao: getTierLabel(Math.round(config.nota_teto * 0.8)),
    tier_redacao:     getTierLabel(Math.round(config.nota_teto * 0.7)),
    fama:             0,
    fama_teto_desbloqueado: 39,
    popularidade:     0,
    decaimento_ativo: false,
    usos_total:       0,
    vitorias:         0,
    derrotas:         0,
    vitorias_por_instancia: {},
    ultimo_uso:       null,
    processos_usada:  [],
    status:           'pronta',
    transferivel:     false,   // Parecerista não pode ser vendido nem emprestado
    parecerista_tier: tierNum,
    custo_contratacao: config.custo,
    generica:         false,
    criada_em:        new Date().toISOString(),
  };

  const ref = await db.collection('peticoes').add(novaPeticao);
  await db.collection('jogadores').doc(uid).update({
    dinheiro: FieldValue.increment(-config.custo),
  });

  logger.info(`[PARECERISTA] ${uid} contratou tier ${tierNum} (${practice_area}) por R$${config.custo}`);
  return { ok: true, peticao_id: ref.id, nota_teto: config.nota_teto, custo: config.custo };
});

exports.variarPeticao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { peticao_base_id, nome } = request.data || {};

  if (!peticao_base_id) throw new HttpsError('invalid-argument', 'peticao_base_id é obrigatório.');

  const [baseSnap, jogSnap] = await Promise.all([
    db.collection('peticoes').doc(peticao_base_id).get(),
    db.collection('jogadores').doc(uid).get(),
  ]);

  if (!baseSnap.exists) throw new HttpsError('not-found', 'Petição base não encontrada.');
  if (!jogSnap.exists)  throw new HttpsError('not-found', 'Jogador não encontrado.');

  const base  = baseSnap.data();
  const j     = jogSnap.data();
  const skJur = normalizarSkillsJur(j.skills_jur);

  if (!j.oab) throw new HttpsError('failed-precondition', 'OAB necessária para variar petições.');

  if (base.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor desta petição.');

  const novaGeracao = (base.geracao || 1) + 1;
  const fatorTeto   = fatorTetoPorGeracao(novaGeracao);
  const novoTeto    = Math.max(1, Math.round((base.teto_nota || 26) * fatorTeto));

  // Nota base da variação proporcional ao teto reduzido
  const fatorBase = 0.50 + (skJur.legal_drafting / 50) * 0.45;
  const nota_base = Math.max(1, Math.min(novoTeto, Math.round(novoTeto * fatorBase)));

  // Tempo de composição reduzido por geração
  const diasBase = calcularTempoComposicao(base.document_type, j.cargo_id, skJur, false);
  const diasVariacao = diasBase === null ? null
    : Math.max(0, Math.round(diasBase * fatorTempoPorGeracao(novaGeracao)));

  const mesGlobal    = j.mes_global_pessoal || 0;
  const mesConclusao = diasVariacao > 0 ? mesGlobal + Math.ceil(diasVariacao / 30) + 1 : mesGlobal;

  const variacao = {
    jogador_uid:      uid,
    nome:             nome || `${base.nome} v${novaGeracao}`,
    document_type:    base.document_type,
    practice_area:    base.practice_area,
    geracao:          novaGeracao,
    peticao_base_id,
    nota_base,
    teto_nota:        novoTeto,
    // Variação começa zerada — é nova para todos os julgadores
    fama:             0,
    fama_teto_desbloqueado: 39,
    popularidade:     0,
    decaimento_ativo: false,
    vitorias_por_instancia: {},
    usos_total:       0,
    vitorias:         0,
    derrotas:         0,
    ultimo_uso:       null,
    processos_usada:  [],
    status:           diasVariacao === 0 ? 'pronta' : 'em_composicao',
    mes_conclusao:    mesConclusao,
    criada_em:        new Date().toISOString(),
    generica:         false,
  };

  const ref = await db.collection('peticoes').add(variacao);

  await db.collection('jogadores').doc(uid).update({
    peticoes_compostas_mes: FieldValue.increment(1),
  });
  await aplicarXpDocType(db, uid, base.document_type, false);

  logger.info(`[VARIAR] ${uid} → ${peticao_base_id} geração ${novaGeracao}, nota_base=${nota_base}, teto=${novoTeto}`);
  return { ok: true, peticao_id: ref.id, geracao: novaGeracao, teto_nota: novoTeto, nota_base, dias: diasVariacao };
});

// ─── Callable: emprestarPeticao ───────────────────────────────────────────────

exports.emprestarPeticao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { peticao_id, npc_id } = request.data || {};

  if (!peticao_id || !npc_id) throw new HttpsError('invalid-argument', 'peticao_id e npc_id são obrigatórios.');

  const petSnap = await db.collection('peticoes').doc(peticao_id).get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');

  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor desta petição.');
  if (pet.transferivel === false) throw new HttpsError('failed-precondition', 'Parecer contratado não pode ser emprestado.');
  if (pet.emprestada_para) throw new HttpsError('failed-precondition', 'Petição já emprestada.');

  await petSnap.ref.update({
    emprestada_para: npc_id,
    emprestada_em:   new Date().toISOString(),
    status:          'emprestada',
  });
  return { ok: true };
});

exports.liberarEmprestimo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { peticao_id } = request.data || {};

  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id é obrigatório.');

  const petSnap = await db.collection('peticoes').doc(peticao_id).get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');

  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor desta petição.');

  await petSnap.ref.update({ emprestada_para: null, emprestada_em: null, status: 'pronta' });
  return { ok: true };
});

// ─── Callable: venderPeticao ──────────────────────────────────────────────────

exports.venderPeticao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { peticao_id, preco } = request.data || {};

  if (!peticao_id || typeof preco !== 'number' || preco < 0) {
    throw new HttpsError('invalid-argument', 'peticao_id e preco (número ≥ 0) são obrigatórios.');
  }

  const petSnap = await db.collection('peticoes').doc(peticao_id).get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');

  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor desta petição.');
  if (pet.transferivel === false) throw new HttpsError('failed-precondition', 'Parecer contratado não pode ser vendido.');
  if (pet.no_mercado) throw new HttpsError('failed-precondition', 'Petição já está no mercado.');

  await petSnap.ref.update({ no_mercado: true, preco_mercado: preco, publicada_em: new Date().toISOString() });
  return { ok: true, preco };
});

exports.comprarPeticao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid  = request.auth.uid;
  const db   = getFirestore();
  const { peticao_id } = request.data || {};

  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id é obrigatório.');

  const petRef  = db.collection('peticoes').doc(peticao_id);
  const jogRef  = db.collection('jogadores').doc(uid);

  // Transferência atômica via transaction — GDD checklist
  await db.runTransaction(async (tx) => {
    const [petSnap, jogSnap] = await Promise.all([tx.get(petRef), tx.get(jogRef)]);
    if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');
    if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

    const pet = petSnap.data();
    const j   = jogSnap.data();

    if (!pet.no_mercado) throw new HttpsError('failed-precondition', 'Petição não está no mercado.');
    if (pet.jogador_uid === uid) throw new HttpsError('failed-precondition', 'Você não pode comprar sua própria petição.');

    const preco = pet.preco_mercado || 0;
    if ((j.dinheiro || 0) < preco) throw new HttpsError('failed-precondition', 'Saldo insuficiente.');

    // Pagar ao vendedor
    const vendedorRef = db.collection('jogadores').doc(pet.jogador_uid);
    const vendedorSnap = await tx.get(vendedorRef);
    if (vendedorSnap.exists) {
      tx.update(vendedorRef, { dinheiro: (vendedorSnap.data().dinheiro || 0) + preco });
    }

    // Debitar comprador
    tx.update(jogRef, { dinheiro: (j.dinheiro || 0) - preco });

    // Livro: venda de cópia — mantém o dono e permanece no mercado (royalties via avancar_mes)
    if (pet.categoria === 'livro') {
      tx.update(jogRef, { dinheiro: (j.dinheiro || 0) - preco });
      if (vendedorSnap.exists) {
        tx.update(vendedorRef, { dinheiro: (vendedorSnap.data().dinheiro || 0) + preco });
      }
      // registrarCopiaVendida é chamado fora da transaction (sem impacto em atomicidade)
    } else {
      // Transferir propriedade (popularidade resetada para 60 ao trocar de dono)
      tx.update(petRef, {
        jogador_uid:   uid,
        no_mercado:    false,
        preco_mercado: 0,
        popularidade:  60,
        comprada_em:   new Date().toISOString(),
        comprada_de:   pet.jogador_uid,
      });
    }
  });

  // Registra cópia vendida para livros — categoria capturada dentro da transaction via closure
  // A transaction já leu petSnap, mas o valor é local; usamos uma segunda leitura leve
  const _petCheck = await petRef.get();
  if (_petCheck.data()?.categoria === 'livro') {
    await registrarCopiaVendida(db, peticao_id);
  }

  return { ok: true };
});

exports.retirarPeticaoMercado = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id } = request.data || {};
  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');
  const petSnap = await db.collection('peticoes').doc(peticao_id).get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');
  const pet = petSnap.data();
  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor.');
  if (!pet.no_mercado) throw new HttpsError('failed-precondition', 'Petição não está no mercado.');
  await petSnap.ref.update({ no_mercado: false, preco_mercado: 0 });
  return { ok: true };
});

// ─── Repertório do Escritório (GDD v5.1 — pool compartilhado de petições) ────

exports.adicionarPeticaoRepertorio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id } = request.data || {};
  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');

  const [petSnap, jogSnap] = await Promise.all([
    db.collection('peticoes').doc(peticao_id).get(),
    db.collection('jogadores').doc(uid).get(),
  ]);
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');
  if (!jogSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const pet = petSnap.data();
  const jog = jogSnap.data();
  const escId = jog.escritorio_proprio_id || jog.escritorio_empregado_id;

  if (pet.jogador_uid !== uid) throw new HttpsError('permission-denied', 'Você não é o autor desta petição.');
  if (pet.status !== 'pronta') throw new HttpsError('failed-precondition', 'Só petições prontas podem ser adicionadas ao repertório.');
  if (!escId) throw new HttpsError('failed-precondition', 'Você precisa fazer parte de um escritório.');
  if (pet.no_repertorio) throw new HttpsError('failed-precondition', 'Petição já está no repertório do escritório.');

  await petSnap.ref.update({
    no_repertorio: true,
    escritorio_id: escId,
    adicionado_repertorio_em: new Date().toISOString(),
  });
  return { ok: true, escritorio_id: escId };
});

exports.removerPeticaoRepertorio = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const db  = getFirestore();
  const { peticao_id } = request.data || {};
  if (!peticao_id) throw new HttpsError('invalid-argument', 'peticao_id obrigatório.');

  const petSnap = await db.collection('peticoes').doc(peticao_id).get();
  if (!petSnap.exists) throw new HttpsError('not-found', 'Petição não encontrada.');
  const pet = petSnap.data();

  const jogSnap = await db.collection('jogadores').doc(uid).get();
  const jog = jogSnap.exists ? jogSnap.data() : {};
  const meuEscId = jog.escritorio_proprio_id || jog.escritorio_empregado_id;
  const ehDono = jog.escritorio_proprio_id && jog.escritorio_proprio_id === pet.escritorio_id;

  if (pet.jogador_uid !== uid && !ehDono) {
    throw new HttpsError('permission-denied', 'Só o autor ou o dono do escritório podem remover do repertório.');
  }
  if (!pet.no_repertorio || pet.escritorio_id !== meuEscId) {
    throw new HttpsError('failed-precondition', 'Petição não está no repertório do seu escritório.');
  }

  await petSnap.ref.update({ no_repertorio: false });
  return { ok: true };
});

// ─── Finalização de petições em composição (GDD v5.1 §6) ─────────────────────

/**
 * Finaliza petições em em_composicao cujo mes_conclusao <= mesAtual.
 * Calcula nota_teto usando as skills do jogador NESTE MOMENTO.
 * Chamado por avancar_mes.js.
 *
 * @returns {Array} lista de { id, nome, nota_teto } finalizadas
 */
async function finalizarPeticoesPendentes(db, uid, jogador, mesAtual) {
  const snap = await db.collection('peticoes')
    .where('jogador_uid', '==', uid)
    .where('status', '==', 'em_composicao')
    .get();

  if (snap.empty) return [];

  const skJur   = normalizarSkillsJur(jogador.skills_jur);
  const finalizadas = [];
  const proms   = [];

  for (const d of snap.docs) {
    const p = d.data();
    if ((p.mes_conclusao || 9999) > mesAtual) continue;

    // Petições do novo sistema têm nota_teto null — calcular agora
    if (p.nota_teto === null || p.nota_teto === undefined) {
      const { nota_argumentacao, nota_redacao, nota_teto: tetoBase } = calcularNotaTeto(
        skJur, p.document_type, p.practice_area, jogador
      );

      // Modificador de Tese Central (GDD v5.1 §16) — aplicado na finalização
      const db2 = d.ref.firestore;
      const { original, penalidade, mod_tese } = await verificarOriginalidadeTese(
        db2, p.tese_central || null, p.practice_area, uid, mesAtual
      );
      const nota_teto = Math.max(1, Math.round(tetoBase * mod_tese));

      proms.push(d.ref.update({
        status:            'pronta',
        nota_teto,
        nota_argumentacao,
        nota_redacao,
        tier_argumentacao: getTierLabel(skJur.legal_drafting),
        tier_redacao:      getTierLabel(skJur.legal_research),
        finalizada_em:     new Date().toISOString(),
        tese_original:     original,
        tese_penalidade:   penalidade,
        mod_tese,
        // nota_base e teto_nota mantidos para compatibilidade com setlist de NPC
        nota_base:         nota_teto,
        teto_nota:         nota_teto,
        // salva mes_global de início (necessário para detecção futura)
        mes_global_inicio: p.mes_conclusao ? p.mes_conclusao - 1 : mesAtual - 1,
      }));
      finalizadas.push({ id: d.id, nome: p.titulo || p.nome, nota_teto, tese_original: original });
    } else {
      // Petição v4.1 (nota_teto já definido ou não é sistema novo) — só muda status
      proms.push(d.ref.update({ status: 'pronta' }));
      finalizadas.push({ id: d.id, nome: p.titulo || p.nome, nota_teto: p.teto_nota || 0 });
    }
  }

  await Promise.all(proms);
  return finalizadas;
}

// ─── Internos exportados ─────────────────────────────────────────────────────

module.exports = Object.assign(module.exports, {
  calcularNotaPeticao,
  calcularNotaEfetiva,
  finalizarPeticoesPendentes,
  atualizarFama,
  processarDecaimentoPopularidade,
  modEstadoJogador,
  bonusFama,
  modPopularidade,
  ESTILO_REACAO,
});
