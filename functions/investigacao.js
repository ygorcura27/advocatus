'use strict';

/**
 * SISTEMA DE INVESTIGAÇÃO, FAVORES E JULGAMENTO — Advocatus Online
 * GDD addendum v1.0. Substitui o fluxo de audiência (legado 3-rounds e
 * setlist) como origem do veredito de um processo individual.
 *
 * SEGURANÇA: como em processar_sentenca.js, o cliente nunca decide
 * resultado — cada ação (revelar nó, pedir favor, rodada de julgamento)
 * é uma callable que recalcula tudo a partir do estado salvo em
 * `processo.investigacao`, nunca de valores enviados pelo cliente.
 * Dados de puzzle "corretos" (campo suspeito, declaração evasiva, opção de
 * perícia certa) são gerados uma vez no servidor e nunca expostos ao
 * cliente antes da escolha.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const banco                  = require('./shared/banco_juridico.js');
const { aplicarXpPracticeArea, normalizarSkillsJur } = require('./skills');
const sk = require('./investigacao_skills');

// ─── Config (Parte II/III/VI do GDD — "pendências de calibração" Parte VIII) ──

const TURNOS_TOTAIS_PADRAO = 9;         // calibrar
const PERIODOS = ['manha', 'tarde', 'noite'];
const CUSTO_TURNO = {                    // calibrar
  consulta: 1,
  analise_documental: 1,
  entrevista: 2,
  pericia: 3,
  relacionamento: 2,
  favor: 1,
};
const ACOES_DIRETAS = new Set(['consulta', 'analise_documental', 'entrevista', 'pericia']);
const LIMIAR_VITORIA_BASE = 20;          // calibrar — Parte VIII
const VELOCIDADE_ADVERSARIA_BASE = 5;    // calibrar — +5/turno, +3 se prova suja revelada

// ─── Helpers reaproveitados do padrão de processar_sentenca.js ─────────────

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};
function repCapDoCargo(cargoId) { return REP_CAP[cargoId] || 55; }
function mesTotalPessoal(j) { return (j.ano_pessoal || 1) * 12 + (j.mes_pessoal || 0); }

const CARGO_IDX = {
  est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7,
  jsub:2, jtit:4, dsb:5, mstj:7, padj:2, prom:4, pjus:5, pgj:7,
  dadj:2, def:4, dch:5, dge:7,
};
const CARGO_IDX_CONCLUSAO_MIN = 2;

async function autorizadoParaProcessar(db, p, uid, j) {
  if (p.advogado_uid === uid) return true;
  if (p.pool_escritorio_id) {
    const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
    if (escId !== p.pool_escritorio_id) return false;
    const cargoIdx = CARGO_IDX[j.cargo_id] ?? -1;
    return cargoIdx >= CARGO_IDX_CONCLUSAO_MIN;
  }
  return false;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Geração do grafo de nós (Parte III) ───────────────────────────────────

// Distratores para os campos "corrompidos" — nunca aparecem como resposta
// certa (a certa sempre vem de um dado real do próprio processo: p.autor,
// p.tribunal, p.valor). Só precisam ser plausíveis e diferentes do real.
const NOMES_FAKE_PARTE = [
  'Marcos Villela', 'Studio Fênix Comércio', 'Andréa Cavalcante', 'Grupo Mármore Ltda',
  'Paulo Sertão', 'Distribuidora Ipê S/A', 'Cláudia Reis', 'Construtora Delta',
];
const TRIBUNAIS_FAKE = ['Justiça Federal', 'Justiça Estadual', 'TRT', 'Juizado Especial Cível', 'CARF'];
const FILLERS_EVASIVOS = [
  'Não me lembro dos detalhes, foi tudo muito corrido naquela época.',
  'Prefiro não entrar em detalhes — não tenho certeza do que aconteceu.',
  'Isso não é da minha alçada, não sei dizer com precisão.',
];

function _valorFmt(v) { return `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`; }
function _embaralhar(n) { return Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5); }

// ─── Puzzles ancorados nos dados reais do caso (Parte III) ─────────────────
// Antes os 3 tipos de nó usavam templates genéricos fixos com a resposta
// certa sorteada (Math.random()) — nenhum dado do caso entrava na conta, e
// não havia como deduzir a resposta certa de jeito nenhum. Agora cada
// puzzle deriva a resposta certa de um dado REAL do processo (p.autor,
// p.tribunal, p.valor, p.fatos_narrativa) e os distratores de pools
// genéricos — a cena (js/investigacao.js) mostra a ficha do caso para o
// jogador conferir contra as opções.

function _campoCorrompido(p) {
  const real = {
    autor:    p.autor || 'Parte desconhecida',
    tribunal: p.tribunal || 'Tribunal não informado',
    valor:    _valorFmt(p.valor),
  };
  const dims = ['autor', 'tribunal', 'valor'];
  const alvo = pick(dims);
  const fake = {
    autor:    pick(NOMES_FAKE_PARTE.filter(n => n !== real.autor)) || NOMES_FAKE_PARTE[0],
    tribunal: pick(TRIBUNAIS_FAKE.filter(t => t !== real.tribunal)) || TRIBUNAIS_FAKE[0],
    valor:    _valorFmt(Math.max(500, (p.valor || 10000) * (0.35 + Math.random() * 0.5))),
  };
  const LABEL = { autor: 'Parte autora', tribunal: 'Tribunal de origem', valor: 'Valor da causa' };
  const campos = dims.map(d => `${LABEL[d]}: ${d === alvo ? fake[d] : real[d]}`);
  return { campos, campo_suspeito: dims.indexOf(alvo) };
}

function _periciaValor(p) {
  const valores = [
    _valorFmt(p.valor), // 0 = certa
    _valorFmt(Math.max(500, (p.valor || 10000) * (0.3 + Math.random() * 0.4))),
    _valorFmt((p.valor || 10000) * (1.4 + Math.random() * 0.6)),
  ];
  const ordem = _embaralhar(3);
  const opcoes = ordem.map(i => `Confirmar se o laudo cita ${valores[i]} como valor da causa`);
  return { opcoes, certa: ordem.indexOf(0) };
}

function _entrevistaDeclaracoes(p) {
  const fatos = (p.fatos_narrativa || []).filter(Boolean);
  const base = fatos.length >= 2 ? fatos.slice(0, 2) : [...fatos, 'O restante do procedimento seguiu dentro do esperado.'].slice(0, 2);
  const declaracoesReais = base.map(f => `Posso confirmar: ${f.charAt(0).toLowerCase()}${f.slice(1)}`);
  const todas = [...declaracoesReais, pick(FILLERS_EVASIVOS)];
  const ordem = _embaralhar(3);
  const declaracoes = ordem.map(i => todas[i]);
  return { declaracoes, evasiva: ordem.indexOf(2) };
}

function gerarNo(id, tipoForcado, p) {
  const tipo = tipoForcado || pick(['consulta', 'analise_documental', 'entrevista', 'pericia']);
  const base = { id, tipo, status: 'oculto', bloqueio: null, peca: null, dados_puzzle: null };

  if (tipo === 'analise_documental') {
    base.dados_puzzle = _campoCorrompido(p);
  } else if (tipo === 'entrevista') {
    base.dados_puzzle = _entrevistaDeclaracoes(p);
  } else if (tipo === 'pericia') {
    base.dados_puzzle = _periciaValor(p);
  }
  return base;
}

function gerarGrafoDeNos(p) {
  const nos = [];
  nos.push(gerarNo('n0', 'consulta', p));
  nos[0].status = 'visivel'; // nó semente — sempre visível no intake

  const NUM_NOS = 7;
  for (let i = 1; i < NUM_NOS; i++) {
    const no = gerarNo(`n${i}`, null, p);
    // ~30% dos nós (exceto o semente) exigem favor ou confiança
    if (Math.random() < 0.30) {
      no.tipo = 'favor_relacionamento';
      no.dados_puzzle = null;
      no.bloqueio = Math.random() < 0.5
        ? { tipo: 'favor', origem_tag: `caso_no_${i}` }
        : { tipo: 'confianca', npc_id: `npc_caso_${i}`, minimo: 55 };
      no.status = 'bloqueado';
    }
    nos.push(no);
  }
  return nos;
}

// ─── Força de peça gerada por nó ───────────────────────────────────────────

function forcaBaseAleatoria() { return Math.round(rand(30, 70)); }

// ─── 1. Iniciar caso investigativo (Intake) ────────────────────────────────

exports.iniciarCasoInvestigativo = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id } = request.data || {};
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) {
    throw new HttpsError('permission-denied', 'Este processo não é seu.');
  }
  if (p.investigacao) {
    return { investigacao: p.investigacao }; // idempotente — já iniciado
  }

  const skJur = normalizarSkillsJur(j.skills_jur);
  const investigacao = {
    fase: 'investigacao',
    turnos_totais: TURNOS_TOTAIS_PADRAO,
    turnos_usados: 0,
    dia: 1,
    periodo: PERIODOS[0],
    nos: gerarGrafoDeNos(),
    intuicao_usos_restantes: sk.usosIntuicaoPorCaso(skJur.perfil_comportamental),
    favores_reservados: [],
    mao_evidencias: [],
    tese_vademecum: null,
    julgamento: null,
    investigacao_adversaria: 0,
  };

  await processoRef.update({ investigacao, status: 'investigacao' });
  return { investigacao: publicoDoNos(investigacao) };
});

// Remove dados_puzzle sensíveis (resposta certa) antes de devolver ao cliente.
function publicoDoNos(investigacao) {
  const nos = investigacao.nos.map(no => {
    if (!no.dados_puzzle) return no;
    const dp = { ...no.dados_puzzle };
    delete dp.campo_suspeito;
    delete dp.evasiva;
    delete dp.certa;
    return { ...no, dados_puzzle: dp };
  });
  return { ...investigacao, nos };
}

function avancarTurno(investigacao, custo) {
  investigacao.turnos_usados = Math.min(investigacao.turnos_totais, investigacao.turnos_usados + custo);
  const idx = investigacao.turnos_usados % PERIODOS.length;
  investigacao.periodo = PERIODOS[idx];
  investigacao.dia = Math.floor(investigacao.turnos_usados / PERIODOS.length) + 1;
  if (investigacao.turnos_usados >= investigacao.turnos_totais && investigacao.fase === 'investigacao') {
    investigacao.fase = 'montagem';
  }
}

// ─── 2. Executar ação de investigação (revelar nó) ─────────────────────────

exports.executarAcaoInvestigacao = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, no_id, escolha } = request.data || {};
  if (!processo_id || !no_id) throw new HttpsError('invalid-argument', 'processo_id e no_id obrigatórios.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao) throw new HttpsError('failed-precondition', 'Investigação ainda não iniciada.');
  if (investigacao.fase !== 'investigacao') throw new HttpsError('failed-precondition', 'Fase de investigação já encerrada.');

  const no = investigacao.nos.find(n => n.id === no_id);
  if (!no) throw new HttpsError('not-found', 'Nó não encontrado.');
  if (no.status === 'revelado') throw new HttpsError('failed-precondition', 'Nó já revelado.');
  if (no.status === 'bloqueado') throw new HttpsError('failed-precondition', 'Nó bloqueado — use pedirFavor ou consumirFavorNode.');
  if (investigacao.turnos_usados >= investigacao.turnos_totais) throw new HttpsError('resource-exhausted', 'Turnos esgotados.');

  const skJur = normalizarSkillsJur(j.skills_jur);
  let custo = CUSTO_TURNO[no.tipo] || 1;
  if (ACOES_DIRETAS.has(no.tipo)) custo = sk.descontoGestaoTempo(custo, skJur.gestao);

  let resultado = {};
  if (no.tipo === 'consulta') {
    no.peca = { forca: forcaBaseAleatoria(), suja: Math.random() < 0.15, pilar: false, origem_no: no.id };
    resultado = { peca: no.peca };
  } else if (no.tipo === 'analise_documental') {
    const dp = no.dados_puzzle;
    const forcaCerta = forcaBaseAleatoria() + 20;
    const acertou = Number(escolha) === dp.campo_suspeito;
    const forca = acertou ? forcaCerta * 2 : sk.forcaAoErrar(4, forcaCerta, skJur.analise_forense);
    no.peca = { forca: Math.round(forca), suja: Math.random() < 0.2, pilar: false, origem_no: no.id };
    resultado = { acertou, peca: no.peca };
  } else if (no.tipo === 'entrevista') {
    const dp = no.dados_puzzle;
    const { declaracao_escolhida, tom } = escolha || {};
    const acertouDeclaracao = Number(declaracao_escolhida) === dp.evasiva;
    let forca = acertouDeclaracao ? 55 : 35;
    if (tom === 'pressionar') forca += 15 + sk.bonusOratoria(skJur.oral_advocacy);
    else if (tom === 'empatia') forca += 8 + sk.bonusPersuasao(skJur.negotiation) * 0.3;
    else forca += 3; // silêncio
    const arriscado = tom === 'pressionar' && !acertouDeclaracao;
    no.peca = { forca: Math.round(forca), suja: arriscado && Math.random() < 0.4, pilar: false, origem_no: no.id };
    resultado = { acertouDeclaracao, arriscado, peca: no.peca };
  } else if (no.tipo === 'pericia') {
    const dp = no.dados_puzzle;
    const forcaCerta = forcaBaseAleatoria() + 25;
    const acertou = Number(escolha) === dp.certa;
    const forca = acertou ? forcaCerta * 1.8 : sk.forcaAoErrar(6, forcaCerta, skJur.analise_forense);
    no.peca = { forca: Math.round(forca), suja: Math.random() < 0.25, pilar: true, origem_no: no.id };
    resultado = { acertou, peca: no.peca };
  } else {
    throw new HttpsError('failed-precondition', 'Este tipo de nó não usa turno direto.');
  }

  no.status = 'revelado';
  avancarTurno(investigacao, custo);

  // Revela mais 1 nó oculto (não bloqueado) a cada ação, simulando o mapa se expandindo.
  const proximoOculto = investigacao.nos.find(n => n.status === 'oculto');
  if (proximoOculto) proximoOculto.status = 'visivel';

  // Investigação adversária avança (Discrição reduz a velocidade)
  const reducaoVel = sk.reducaoVelocidadeAdversaria(skJur.discricao);
  let incAdv = VELOCIDADE_ADVERSARIA_BASE * custo;
  if (no.peca && no.peca.suja) incAdv += 3;
  investigacao.investigacao_adversaria = Math.round((investigacao.investigacao_adversaria || 0) + incAdv * (1 - reducaoVel));

  await processoRef.update({ investigacao });
  return { ...resultado, investigacao: publicoDoNos(investigacao) };
});

// ─── 3. Pedir favor a um NPC ────────────────────────────────────────────────

exports.pedirFavor = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { npc_id, tipo, origem, peso, processo_id, no_id } = request.data || {};
  if (!npc_id) throw new HttpsError('invalid-argument', 'npc_id obrigatório.');

  const db = getFirestore();
  const jogadorRef = db.collection('jogadores').doc(uid);
  const jSnap = await jogadorRef.get();
  if (!jSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
  const j = jSnap.data();
  const skJur = normalizarSkillsJur(j.skills_jur);

  const confRef  = jogadorRef.collection('confiancas_npc').doc(npc_id);
  const confSnap = await confRef.get();
  const confBase = confSnap.exists ? (confSnap.data().confianca ?? 50) : 50;
  const confEfetiva = Math.min(100, confBase + sk.bonusPersuasao(skJur.negotiation));

  const faixa = confEfetiva >= 80 ? 'muito_provavel'
    : confEfetiva >= 60 ? 'provavel'
    : confEfetiva >= 35 ? 'arriscado'
    : 'improvavel';

  const chanceAceite = { muito_provavel: 0.90, provavel: 0.70, arriscado: 0.40, improvavel: 0.15 }[faixa];
  const roll = Math.random();

  let desfecho, novaConfianca = confBase, favorId = null;
  if (roll > chanceAceite) {
    desfecho = 'recusa';
    novaConfianca = Math.max(0, confBase - 3);
  } else if (roll > chanceAceite * 0.5) {
    desfecho = 'aceite_com_contrapartida';
    novaConfianca = confBase;
    const pesoFavor = peso || Math.round(rand(2, 6));
    const favorRef = db.collection('favores').doc();
    await favorRef.set({
      devedor_uid: uid, credor_npc_id: npc_id,
      origem: origem || 'pedido_investigacao',
      peso: pesoFavor, tipo: tipo || 'profissional',
      dias_para_apodrecer: 20, criado_em: new Date().toISOString(),
      status: 'ativo',
    });
    favorId = favorRef.id;
  } else {
    desfecho = 'aceite_direto';
    novaConfianca = Math.min(100, confBase + 2);
    // Favor gerado a favor do jogador (o NPC agora deve um favor a ele)
    const pesoFavor = peso || Math.round(rand(2, 6));
    const favorRef = db.collection('favores').doc();
    await favorRef.set({
      devedor_npc_id: npc_id, credor_uid: uid,
      origem: origem || 'pedido_investigacao',
      peso: pesoFavor, tipo: tipo || 'profissional',
      dias_para_apodrecer: 20, criado_em: new Date().toISOString(),
      status: 'ativo',
    });
    favorId = favorRef.id;
  }

  await confRef.set({ confianca: novaConfianca, ultimo_evento: desfecho, atualizado_em: new Date().toISOString() }, { merge: true });

  // Se o pedido foi feito para destravar um nó bloqueado por CONFIANÇA
  // (bloqueio.tipo === 'confianca'), desbloqueia aqui mesmo quando a
  // confiança resultante já bate o mínimo exigido. Sem isso o cliente
  // mostrava "favor concedido" e o nó continuava bloqueado do mesmo
  // jeito — nada persistia, nada reabria o mapa, e dava pra pedir de novo
  // pro mesmo nó pra sempre.
  let desbloqueado = false;
  let investigacaoAtualizada = null;
  if (processo_id && no_id) {
    const processoRef = db.collection('processos').doc(processo_id);
    const pSnap = await processoRef.get();
    if (pSnap.exists) {
      const p = pSnap.data();
      const investigacao = p.investigacao;
      const no = investigacao?.nos?.find(n => n.id === no_id);
      if (no && no.bloqueio?.tipo === 'confianca' && novaConfianca >= no.bloqueio.minimo) {
        no.status = 'visivel';
        no.bloqueio = null;
        desbloqueado = true;
        await processoRef.update({ investigacao });
        investigacaoAtualizada = investigacao;
      }
    }
  }

  return { faixa, desfecho, confianca: novaConfianca, favor_id: favorId, desbloqueado, investigacao: investigacaoAtualizada };
});

// ─── 4. Consumir favor para desbloquear nó ─────────────────────────────────

exports.consumirFavorNode = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, no_id, favor_id } = request.data || {};
  if (!processo_id || !no_id || !favor_id) throw new HttpsError('invalid-argument', 'processo_id, no_id e favor_id obrigatórios.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const favorRef     = db.collection('favores').doc(favor_id);
  const jogadorRef    = db.collection('jogadores').doc(uid);
  const [pSnap, fSnap, jSnap] = await Promise.all([processoRef.get(), favorRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !fSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Registro não encontrado.');

  const p = pSnap.data(), f = fSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');
  if (f.devedor_npc_id ? f.credor_uid !== uid : f.devedor_uid !== uid) throw new HttpsError('permission-denied', 'Este favor não é seu.');
  if (f.status !== 'ativo') throw new HttpsError('failed-precondition', 'Favor não está mais ativo.');

  const investigacao = p.investigacao;
  if (!investigacao) throw new HttpsError('failed-precondition', 'Investigação ainda não iniciada.');
  const no = investigacao.nos.find(n => n.id === no_id);
  if (!no || no.status !== 'bloqueado' || no.bloqueio?.tipo !== 'favor') {
    throw new HttpsError('failed-precondition', 'Nó não está bloqueado por favor.');
  }

  no.status = 'visivel';
  no.bloqueio = null;
  investigacao.favores_reservados = [...(investigacao.favores_reservados || []), favor_id];
  if (investigacao.turnos_usados < investigacao.turnos_totais) avancarTurno(investigacao, 1); // Parte II — "1 turno + consumo do favor"

  await Promise.all([
    processoRef.update({ investigacao }),
    favorRef.update({ status: 'consumido' }),
  ]);

  return { investigacao: publicoDoNos(investigacao) };
});

// ─── 5. Confirmar montagem de estratégia ───────────────────────────────────

exports.confirmarMontagem = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, mao_escolhida } = request.data || {};
  if (!processo_id || !Array.isArray(mao_escolhida)) throw new HttpsError('invalid-argument', 'processo_id e mao_escolhida obrigatórios.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao) throw new HttpsError('failed-precondition', 'Investigação ainda não iniciada.');
  if (!['investigacao', 'montagem'].includes(investigacao.fase)) {
    throw new HttpsError('failed-precondition', 'Fase incompatível com montagem.');
  }

  const idsValidos = new Set(investigacao.nos.filter(n => n.status === 'revelado' && n.peca).map(n => n.id));
  const maoValida = mao_escolhida.filter(id => idsValidos.has(id));
  if (maoValida.length === 0) throw new HttpsError('invalid-argument', 'Nenhuma evidência válida selecionada.');

  investigacao.mao_evidencias = maoValida;
  investigacao.fase = 'julgamento';
  investigacao.julgamento = {
    rodada_atual: 0,
    pecas_restantes: maoValida.map(id => {
      const no = investigacao.nos.find(n => n.id === id);
      return { no_id: id, forca: no.peca.forca, suja: no.peca.suja, pilar: no.peca.pilar, exposta: false };
    }),
    forca_total: 0,
    log: [],
    veredito: null,
  };

  await processoRef.update({ investigacao });
  return { investigacao: publicoDoNos(investigacao) };
});

// ─── 6. Vade Mecum ──────────────────────────────────────────────────────────

exports.abrirVadeMecum = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id } = request.data || {};
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao) throw new HttpsError('failed-precondition', 'Investigação ainda não iniciada.');
  if (investigacao.tese_vademecum) throw new HttpsError('failed-precondition', 'Vade Mecum já foi usado neste caso.');
  if (investigacao.fase === 'investigacao' && investigacao.turnos_usados >= investigacao.turnos_totais) {
    throw new HttpsError('resource-exhausted', 'Turnos esgotados.');
  }

  if (investigacao.fase === 'investigacao') avancarTurno(investigacao, 1);
  investigacao.tese_vademecum = { precedente_id: null, aplicada: false, bonus_limiar: 0, aberto: true };
  await processoRef.update({ investigacao });
  return { investigacao: publicoDoNos(investigacao) };
});

exports.aplicarTeseVademecum = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, precedente_id, tags_precedente } = request.data || {};
  if (!processo_id || !precedente_id) throw new HttpsError('invalid-argument', 'processo_id e precedente_id obrigatórios.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao?.tese_vademecum) throw new HttpsError('failed-precondition', 'Vade Mecum não foi aberto.');
  if (investigacao.tese_vademecum.aplicada) throw new HttpsError('failed-precondition', 'Uma tese já foi aplicada neste caso.');

  // Validação de encaixe é feita aqui, server-side: as tags do precedente
  // (enviadas junto por já serem públicas no banco estático) precisam bater
  // com a área/tipo do processo — nunca confiamos em um bool do cliente.
  const tagsCaso = [p.area, p.tipo].filter(Boolean);
  const encaixa = Array.isArray(tags_precedente) && tags_precedente.some(t => tagsCaso.includes(t));

  const skJur = normalizarSkillsJur(j.skills_jur);
  if (encaixa) {
    const bonus = sk.bonusPesquisaJuridica(skJur.legal_research) + 1; // base +1 do addendum
    investigacao.tese_vademecum = { precedente_id, aplicada: true, bonus_limiar: bonus, desacreditada: false };
  } else {
    const perdoado = sk.perdoaTurnoTeseErrada(skJur.legal_research);
    if (!perdoado && investigacao.fase === 'investigacao') avancarTurno(investigacao, 1);
    investigacao.tese_vademecum = { precedente_id, aplicada: false, bonus_limiar: 0, desacreditada: true };
  }

  await processoRef.update({ investigacao });
  return { encaixa, investigacao: publicoDoNos(investigacao) };
});

// ─── 7. Rodada de julgamento (Parte VI) ────────────────────────────────────

function prioridadeAtaque(peca) {
  return (10 - peca.forca / 10) + (peca.suja ? 3 : 0) + (peca.pilar ? 2 : 0) + (peca.exposta ? 50 : 0);
}

exports.executarRodadaJulgamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, reacao, favor_id } = request.data || {}; // reacao: 'defender'|'favor'|'deixar_cair'
  if (!processo_id || !reacao) throw new HttpsError('invalid-argument', 'processo_id e reacao obrigatórios.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao?.julgamento) throw new HttpsError('failed-precondition', 'Julgamento não foi iniciado.');
  const julg = investigacao.julgamento;
  if (julg.veredito) throw new HttpsError('failed-precondition', 'Julgamento já foi concluído.');
  if (julg.pecas_restantes.length === 0) throw new HttpsError('failed-precondition', 'Não há mais peças — chame finalizarJulgamento.');

  const skJur = normalizarSkillsJur(j.skills_jur);
  julg.pecas_restantes.sort((a, b) => prioridadeAtaque(b) - prioridadeAtaque(a));
  const alvo = julg.pecas_restantes[0];

  let forcaFinal = 0, exposta = false, favorConsumido = null;
  if (reacao === 'defender') {
    const chanceBase = 30 + alvo.forca * 0.7;
    const chance = Math.min(90, chanceBase + sk.bonusOratoria(skJur.oral_advocacy));
    const sucesso = Math.random() * 100 < chance;
    forcaFinal = sucesso ? alvo.forca : Math.round(alvo.forca * 0.4);
    if (!sucesso && alvo.suja) {
      const riscoExposicao = Math.max(5, 45 - sk.reducaoRiscoExposicao(skJur.discricao));
      exposta = Math.random() * 100 < riscoExposicao;
    }
  } else if (reacao === 'favor') {
    if (!favor_id || !(investigacao.favores_reservados || []).includes(favor_id)) {
      throw new HttpsError('invalid-argument', 'Favor inválido ou não reservado para este caso.');
    }
    forcaFinal = alvo.forca; // sucesso garantido
    investigacao.favores_reservados = investigacao.favores_reservados.filter(id => id !== favor_id);
    favorConsumido = favor_id;
    await db.collection('favores').doc(favor_id).update({ status: 'consumido' });
  } else if (reacao === 'deixar_cair') {
    forcaFinal = 0;
    if (alvo.pilar) {
      // efeito cascata: peças que dependiam desta perdem metade da força
      julg.pecas_restantes.forEach(pc => { if (pc !== alvo) pc.forca = Math.round(pc.forca * 0.5); });
    }
  } else {
    throw new HttpsError('invalid-argument', 'reacao inválida.');
  }

  julg.forca_total += forcaFinal;
  julg.pecas_restantes = julg.pecas_restantes.filter(pc => pc !== alvo);
  julg.rodada_atual += 1;
  julg.log.push({ no_id: alvo.no_id, reacao, forca_obtida: forcaFinal, exposta, favor_id: favorConsumido });

  await processoRef.update({ investigacao });
  return {
    rodada: julg.rodada_atual, alvo_no_id: alvo.no_id, forca_obtida: forcaFinal, exposta,
    pecas_restantes: julg.pecas_restantes.length, forca_total: julg.forca_total,
  };
});

// ─── 8. Finalizar julgamento — veredito, honorários, XP, reputação ─────────

exports.finalizarJulgamento = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id } = request.data || {};
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);
  const [pSnap, jSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!pSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo ou jogador não encontrado.');
  const p = pSnap.data(), j = jSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) throw new HttpsError('permission-denied', 'Este processo não é seu.');

  const investigacao = p.investigacao;
  if (!investigacao?.julgamento) throw new HttpsError('failed-precondition', 'Julgamento não foi iniciado.');
  const julg = investigacao.julgamento;
  if (julg.veredito) return { veredito: julg.veredito }; // idempotente
  if (julg.pecas_restantes.length > 0) throw new HttpsError('failed-precondition', 'Ainda há peças a resolver.');

  const skJur = normalizarSkillsJur(j.skills_jur);
  const bonusTese = investigacao.tese_vademecum?.bonus_limiar || 0;
  const bonusProcessual = sk.reducaoLimiarDireitoProcessual(skJur.procedure);
  const limiar = LIMIAR_VITORIA_BASE - bonusTese - bonusProcessual;

  let resultado;
  if (julg.forca_total >= limiar) resultado = 'procedente';
  else if (julg.forca_total >= limiar - 6) resultado = 'parcial';
  else resultado = 'improcedente';

  const favoravelAoJogador = resultado !== 'improcedente';
  const pecasExpostas = julg.log.filter(l => l.exposta).length;

  const cap = repCapDoCargo(j.cargo_id);
  const rep = j.reputacao || 30;
  let repDelta = resultado === 'procedente' ? Math.max(1, Math.floor((cap - rep) * 0.08))
    : resultado === 'parcial' ? Math.max(1, Math.floor((cap - rep) * 0.05))
    : -Math.max(1, Math.floor(rep * 0.05));
  repDelta -= pecasExpostas * 4; // Parte VI.3 — exposição soma penalidade de reputação sempre

  const valorBase = p.valor || p.valor_causa || 0;
  let honPotencial = 0;
  if (favoravelAoJogador) {
    const pct = resultado === 'procedente' ? 1 : 0.5;
    honPotencial = Math.round(valorBase * 0.30 * pct);
  }

  const scoreEquiv = resultado === 'procedente' ? 85 : resultado === 'parcial' ? 65 : 35;
  const xpGanho = banco.xpPorDecisao('1grau', scoreEquiv);

  await jogadorRef.update({
    reputacao: Math.max(0, Math.min(cap, rep + repDelta)),
    xp: (j.xp || 0) + xpGanho,
    processos_concluidos: (j.processos_concluidos || 0) + 1,
    derrotas_consecutivas: favoravelAoJogador ? 0 : (j.derrotas_consecutivas || 0) + 1,
    ...(favoravelAoJogador ? { wins: (j.wins||0)+1, wins_ano: (j.wins_ano||0)+1 }
                           : { losses: (j.losses||0)+1, losses_ano: (j.losses_ano||0)+1 }),
  });

  try { await aplicarXpPracticeArea(db, uid, p.area || p.tipo || 'civil', resultado); }
  catch (e) { logger.warn('[INVESTIGACAO] XP area falhou:', e.message); }

  julg.veredito = resultado;
  investigacao.fase = 'encerrado';

  // Campos compatíveis com o fluxo de decisão de recurso já existente
  // (decidirRecursoSentenca em processar_sentenca.js), reaproveitado sem
  // duplicar a lógica de honorários/recurso: `setlist: []` sinaliza o
  // caminho "isSetlistFlow" daquele arquivo.
  await processoRef.update({
    investigacao,
    status: 'aguardando_decisao_sentenca',
    setlist: [],
    resultado_setlist: resultado,
    hon_pendente: honPotencial,
    nota_final: scoreEquiv,
    repDelta,
    encerrado_mes: null,
  });

  return { veredito: resultado, forca_total: julg.forca_total, limiar, hon_pendente: honPotencial, repDelta, xpGanho };
});

// ─── Apodrecimento de favores (Parte IV.2) — chamado por tick_mensal.js ────

async function processarApodrecimentoFavores(db) {
  const snap = await db.collection('favores').where('status', '==', 'ativo').get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) {
    const f = doc.data();
    const diasRestantes = (f.dias_para_apodrecer ?? 20) - 1;
    if (diasRestantes <= 0) {
      batch.update(doc.ref, { status: 'apodrecido', dias_para_apodrecer: 0 });
    } else {
      batch.update(doc.ref, { dias_para_apodrecer: diasRestantes });
    }
  }
  await batch.commit();
  logger.info(`[FAVORES] Apodrecimento processado — ${snap.size} favores ativos.`);
}

module.exports = {
  iniciarCasoInvestigativo: exports.iniciarCasoInvestigativo,
  executarAcaoInvestigacao: exports.executarAcaoInvestigacao,
  pedirFavor: exports.pedirFavor,
  consumirFavorNode: exports.consumirFavorNode,
  confirmarMontagem: exports.confirmarMontagem,
  abrirVadeMecum: exports.abrirVadeMecum,
  aplicarTeseVademecum: exports.aplicarTeseVademecum,
  executarRodadaJulgamento: exports.executarRodadaJulgamento,
  finalizarJulgamento: exports.finalizarJulgamento,
  processarApodrecimentoFavores,
};
