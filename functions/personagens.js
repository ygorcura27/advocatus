'use strict';

/**
 * PERSONAGENS (multi-personagem por conta) — portado de js/personagens.js
 * (trocarPersonagem), js/carreira.js (_confirmarTransferirDinheiro) e
 * js/relacionamento.js (assumirHerdeiro).
 *
 * As três ações escrevem fichas inteiras de personagem (dinheiro, cargo,
 * XP...) em jogadores/{uid}/personagens/{id} e trocam o doc ativo por uma
 * delas. Feitas pelo navegador, bastava criar uma ficha falsa com R$ 1
 * bilhão e trocar pra ela. Agora a subcoleção só é criada/trocada por aqui,
 * e as regras não deixam mais o cliente criar ficha nem aumentar saldo.
 *
 * Constantes de herança/ITCMD espelham js/relacionamento.js.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { MORADIAS, CARROS } = require('./shared/catalogo_patrimonio');

// Campos de identidade da CONTA — nunca trocam junto com o personagem.
const EXCLUIR_TROCA = new Set(['uid', 'email', 'nome', 'criado_em', 'ultimo_login', 'personagem_ativo_id', 'avanco_lock']);

function somenteFichaPersonagem(jd) {
  const out = {};
  for (const [k, v] of Object.entries(jd || {})) if (!EXCLUIR_TROCA.has(k)) out[k] = v;
  return out;
}

const REPUTACAO_HERANCA_PCT    = 0.4;
const DINHEIRO_HERANCA_PCT_MAX = 0.3;
const BONUS_SKILLS_HERDEIRO    = 10;
const ITCMD_ALIQUOTA_BASE      = 0.06;
const ITCMD_REDUCAO_HOLDING    = 0.55;
const ITCMD_REDUCAO_USUFRUTO   = 0.20;
const ITCMD_REDUCAO_TESTAMENTO = 0.10;
const ITCMD_REDUCAO_CAP        = 0.85;
const SKILLS_GERAIS = ['oratoria', 'argumentacao', 'escrita', 'pesquisa', 'negociacao', 'persuasao', 'gestao', 'networking'];

function calcularITCMD(valorBase, { holding = false, usufruto = false, testamento = false } = {}) {
  const reducao = Math.min(
    ITCMD_REDUCAO_CAP,
    (holding ? ITCMD_REDUCAO_HOLDING : 0) + (usufruto ? ITCMD_REDUCAO_USUFRUTO : 0) + (testamento ? ITCMD_REDUCAO_TESTAMENTO : 0),
  );
  const aliquotaEfetiva = ITCMD_ALIQUOTA_BASE * (1 - reducao);
  return { valorBase, aliquotaEfetiva, reducao, imposto: Math.round(valorBase * aliquotaEfetiva) };
}

const _idValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

// ════════════════════════════════════════════════════════
// TROCAR DE PERSONAGEM
// ════════════════════════════════════════════════════════
exports.trocarPersonagem = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { targetId } = request.data || {};
  if (!_idValido(targetId)) throw new HttpsError('invalid-argument', 'Personagem inválido.');

  const db   = getFirestore();
  const jRef = db.collection('jogadores').doc(uid);

  return db.runTransaction(async (tx) => {
    const jSnap = await tx.get(jRef);
    if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const jd = jSnap.data();
    const idAtual = jd.personagem_ativo_id || 'principal';
    if (targetId === idAtual) return { ok: true, nome: jd.nome_personagem };
    if (jd.avanco_lock && Date.now() - (jd.avanco_lock.em || 0) < 5 * 60 * 1000) {
      throw new HttpsError('failed-precondition', 'Aguarde o avanço de mês terminar para trocar de personagem.');
    }

    const alvoRef  = jRef.collection('personagens').doc(targetId);
    const alvoSnap = await tx.get(alvoRef);
    if (!alvoSnap.exists) throw new HttpsError('not-found', 'Personagem não encontrado.');
    const fichaAlvo = alvoSnap.data();
    if ((fichaAlvo.idade || 0) >= 75) {
      throw new HttpsError('failed-precondition', `${fichaAlvo.nome_personagem} já se aposentou — só pode ser usado para passar herança.`);
    }

    // 1. Arquiva quem sai; 2. o doc ativo vira a ficha de quem entra
    // (set sem merge — campos que só existiam no personagem que saiu não
    // vazam pro novo), mantendo a identidade da conta.
    tx.set(jRef.collection('personagens').doc(idAtual), somenteFichaPersonagem(jd));
    const identidade = {};
    for (const k of EXCLUIR_TROCA) {
      if (k === 'personagem_ativo_id' || k === 'avanco_lock') continue;
      if (jd[k] !== undefined) identidade[k] = jd[k];
    }
    tx.set(jRef, {
      ...identidade,
      ...somenteFichaPersonagem(fichaAlvo),
      reputacao: Math.max(0, Math.min(100, fichaAlvo.reputacao ?? 30)),
      personagem_ativo_id: targetId === 'principal' ? null : targetId,
    });
    return { ok: true, nome: fichaAlvo.nome_personagem };
  });
});

// ════════════════════════════════════════════════════════
// TRANSFERIR DINHEIRO PARA OUTRO PERSONAGEM DA CONTA
// ════════════════════════════════════════════════════════
exports.transferirParaPersonagem = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { personagemId } = request.data || {};
  const valor = Math.round(Number(request.data?.valor));
  if (!_idValido(personagemId)) throw new HttpsError('invalid-argument', 'Personagem inválido.');
  if (!Number.isFinite(valor) || valor <= 0) throw new HttpsError('invalid-argument', 'Digite um valor válido.');

  const db      = getFirestore();
  const jRef    = db.collection('jogadores').doc(uid);
  const destRef = jRef.collection('personagens').doc(personagemId);

  return db.runTransaction(async (tx) => {
    const [jSnap, destSnap] = await Promise.all([tx.get(jRef), tx.get(destRef)]);
    if (!jSnap.exists || !destSnap.exists) throw new HttpsError('not-found', 'Personagem não encontrado.');
    const jd = jSnap.data();
    if ((jd.personagem_ativo_id || 'principal') === personagemId) throw new HttpsError('failed-precondition', 'Esse já é o personagem ativo.');
    if (valor > (jd.dinheiro || 0)) throw new HttpsError('failed-precondition', 'Saldo insuficiente.');
    tx.update(jRef, { dinheiro: (jd.dinheiro || 0) - valor });
    tx.update(destRef, { dinheiro: (destSnap.data().dinheiro || 0) + valor });
    return { ok: true, valor };
  });
});

// ════════════════════════════════════════════════════════
// ASSUMIR HERDEIRO — filho jogável vira personagem novo da conta
// ════════════════════════════════════════════════════════
exports.assumirHerdeiro = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const {
    filhoId, dinheiroTransferido = 0, moradiaId = null, carroId = null,
    bonusSkills = {}, usarUsufruto = false,
  } = request.data || {};
  if (!_idValido(filhoId)) throw new HttpsError('invalid-argument', 'Herdeiro inválido.');
  if (moradiaId !== null && !MORADIAS[moradiaId]) throw new HttpsError('invalid-argument', 'Imóvel inválido.');
  if (carroId !== null && !CARROS[carroId]) throw new HttpsError('invalid-argument', 'Veículo inválido.');

  // Bônus só em skills gerais conhecidas, valores inteiros >= 0, soma <= teto.
  const bonus = {};
  let somaBonus = 0;
  for (const [sk, v] of Object.entries(bonusSkills || {})) {
    const n = Math.floor(Number(v) || 0);
    if (!SKILLS_GERAIS.includes(sk) || n < 0) throw new HttpsError('invalid-argument', 'Bônus de skill inválido.');
    if (n > 0) { bonus[sk] = n; somaBonus += n; }
  }
  if (somaBonus > BONUS_SKILLS_HERDEIRO) throw new HttpsError('invalid-argument', `Só dá pra distribuir até ${BONUS_SKILLS_HERDEIRO} pontos de bônus.`);

  const db   = getFirestore();
  const jRef = db.collection('jogadores').doc(uid);

  return db.runTransaction(async (tx) => {
    const jSnap = await tx.get(jRef);
    if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
    const jd = jSnap.data();
    const ativoId  = jd.personagem_ativo_id;
    const filhoRef = ativoId
      ? jRef.collection('personagens').doc(ativoId).collection('filhos').doc(filhoId)
      : jRef.collection('filhos').doc(filhoId);
    const filhoSnap = await tx.get(filhoRef);
    if (!filhoSnap.exists) throw new HttpsError('not-found', 'Herdeiro não encontrado.');
    const f = filhoSnap.data();
    if (!f.jogavel) throw new HttpsError('failed-precondition', 'Este herdeiro ainda não está pronto para assumir o controle.');

    const dinheiroDoador = jd.dinheiro || 0;
    const tetoDinheiro   = Math.floor(Math.max(0, dinheiroDoador) * DINHEIRO_HERANCA_PCT_MAX);
    const dinheiro       = Math.max(0, Math.min(tetoDinheiro, Math.round(Number(dinheiroTransferido) || 0)));

    const moradiasDoador = { ...(jd.moradias_compradas || {}) };
    const carrosDoador   = { ...(jd.carros_comprados || {}) };
    if (moradiaId && (!moradiasDoador[moradiaId] || Object.keys(moradiasDoador).length < 2)) {
      throw new HttpsError('failed-precondition', 'Você precisa ter esse imóvel e mais um pra poder transferir.');
    }
    if (carroId) {
      if (!carrosDoador[carroId] || Object.keys(carrosDoador).length < 2) {
        throw new HttpsError('failed-precondition', 'Você precisa ter esse carro e mais um pra poder transferir.');
      }
      if (jd.financiamentos?.[carroId]?.parcelas_restantes > 0) {
        throw new HttpsError('failed-precondition', 'Esse carro ainda tem financiamento em aberto — quite antes de transferir.');
      }
    }

    const valorImovel = moradiaId ? MORADIAS[moradiaId].v : 0;
    const valorCarro  = carroId ? CARROS[carroId].v : 0;
    const { imposto: itcmd } = calcularITCMD(dinheiro + valorImovel + valorCarro, {
      holding: !!jd.holding_familiar, usufruto: !!usarUsufruto, testamento: !!jd.testamento_pronto,
    });
    const dinheiroLiquido = Math.max(0, dinheiro - itcmd);
    const itcmdDoBolso    = Math.max(0, itcmd - dinheiro);
    if (dinheiroDoador < dinheiro + itcmdDoBolso) {
      throw new HttpsError('failed-precondition', `ITCMD de R$ ${itcmd.toLocaleString('pt-BR')} é maior que seu saldo disponível.`);
    }

    const skills = { oratoria: 10, argumentacao: 10, escrita: 10, pesquisa: 10, negociacao: 10, persuasao: 10, gestao: 5, networking: 5 };
    for (const [sk, v] of Object.entries(bonus)) skills[sk] = (skills[sk] || 0) + v;

    if (moradiaId) delete moradiasDoador[moradiaId];
    if (carroId)   delete carrosDoador[carroId];
    const patDoador = { ...(jd.pat || {}) };
    if (moradiaId && jd.pat?.moradia === moradiaId) patDoador.moradia = Object.keys(moradiasDoador)[0] || 'pais';
    if (carroId && jd.pat?.transporte === carroId) {
      patDoador.transporte = Object.keys(carrosDoador).find((k) => k !== 'onibus') || 'onibus';
    }

    const agora   = new Date().toISOString();
    const novoRef = jRef.collection('personagens').doc();
    tx.set(novoRef, {
      nome_personagem: f.nome, sexo: f.sexo || null,
      especialidade: jd.especialidade || 'civil', faculdade: 'Direito',
      cargo_id: 'est', cargo_publico_id: null, oab: false, concurso_aprovado: false,
      anos_carreira: 0, mes_global_inicio: jd.mes_global_pessoal ?? jd.mes_global_inicio ?? 0,
      idade: f.idade, idade_inicial: f.idade, idade_meses: f.idade_meses ?? (f.idade || 0) * 12,
      reputacao: Math.round((jd.reputacao || 0) * REPUTACAO_HERANCA_PCT),
      networking: 5, saude_mental: 80, disposicao: 80,
      prestigio_academico: 0, energia: 100, energia_usada_mes: 0,
      skills,
      dinheiro: dinheiroLiquido, itcmd_pago: itcmd, recebido_com_usufruto: !!usarUsufruto,
      meses_negativo: 0, meses_positivo_streak: 0, no_serasa: false,
      renda_calculada: 0, despesas_calculadas: 0,
      pat: { moradia: moradiaId || 'pais', transporte: carroId || 'onibus', escritorio: 'home' },
      moradias_compradas: moradiaId ? { [moradiaId]: true } : {},
      carros_comprados: carroId ? { [carroId]: true } : {},
      prazo_sair_pais: 0, mora_com_pais: !moradiaId,
      financiamentos: {},
      escritorio_id: 'solo', escritorio_empregado_id: null, escritorio_proprio_id: null,
      escritorio_nome: null, vaga_tipo: 'contencioso', sal_mult: 1.0,
      xp: 0, xp_next: 120, wins: 0, losses: 0, wins_ano: 0, losses_ano: 0, derrotas_consecutivas: 0,
      estado_civil: 'solteiro', conjuge_uid: null, filhos: 0, geracao: (jd.geracao || 1) + 1,
      study_queue: [], cursos_feitos: [], compras: [], estagiarios: [],
      em_burnout: false, burnout_ate_mes: 0, recesso_pendente: false,
      aposentado: false, aposentado_forcado_pendente: false,
      ultimo_mes_processado: 0, bonus_pendente: 0,
      criado_em: agora,
    });
    tx.update(jRef, {
      dinheiro: dinheiroDoador - dinheiro - itcmdDoBolso,
      moradias_compradas: moradiasDoador,
      carros_comprados: carrosDoador,
      pat: patDoador,
    });
    tx.delete(filhoRef);
    tx.set(jRef.collection('inbox').doc(), {
      de: 'sistema', para_uid: uid,
      assunto: '🎓 Novo herdeiro jogável',
      corpo: `${f.nome} assumiu o controle e agora tem sua própria carreira — acesse pelo trocador de personagem no topo da tela.`
        + (dinheiroLiquido > 0 ? ` Recebeu R$ ${dinheiroLiquido.toLocaleString('pt-BR')} em dinheiro líquido.` : '')
        + (itcmd > 0 ? ` ITCMD pago: R$ ${itcmd.toLocaleString('pt-BR')}.` : ''),
      tipo: 'sistema', tipo_noticia: 'positivo', lida: false, criado_em: agora,
    });
    return { ok: true, nome: f.nome, novoId: novoRef.id, dinheiroLiquido, itcmd };
  });
});

exports.calcularITCMD = calcularITCMD;
exports.somenteFichaPersonagem = somenteFichaPersonagem;
