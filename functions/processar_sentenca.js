'use strict';

/**
 * PROCESSAR SENTENÇA — Advocatus Online (v2, motor jurídico v8)
 * Callable: chamado pelo frontend ao final da audiência de 1ª instância
 * (3 rodadas de sustentação oral concluídas).
 *
 * SEGURANÇA: esta função RECALCULA o convencimento do ZERO a partir de
 * `historico_respostas_audiencia` (registro bruto de qual tipo de resposta
 * o jogador escolheu em cada rodada), nunca confiando no campo
 * `convencimento` salvo no Firestore pelo cliente — esse campo é só
 * exibição otimista da UI e pode ter sido adulterado.
 *
 * Usa o banco jurídico compartilhado em functions/shared/banco_juridico.js
 * (mesmo conteúdo de js/shared/banco_juridico.js no frontend — ver aviso
 * de sincronização manual nesse módulo).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const banco = require('./shared/banco_juridico.js');
const { aplicarXpPracticeArea } = require('./skills');
const { atualizarFama }         = require('./peticoes');

// ── Perfis de cliente e deltas de satisfação — GDD Seção 28-30 ──
const DELTA_SATISFACAO_PERFIL = {
  conservador: { procedente:8,  parcial:4,  improcedente:-15 },
  ansioso:     { procedente:12, parcial:3,  improcedente:-20 },
  pragmatico:  { procedente:10, parcial:8,  improcedente:-10 },
  exigente:    { procedente:18, parcial:-5, improcedente:-25 },
  leal:        { procedente:6,  parcial:4,  improcedente:-6  },
};

// Atualiza satisfação (confiança) do cliente associado ao processo.
// Silencioso — falha não quebra o fluxo principal.
async function _atualizarSatisfacaoCliente(db, p, resultado) {
  const clienteNome = p.cliente_nome;
  const escId = p.pool_escritorio_id || p.pool_proc_esc_id;
  if (!clienteNome || !escId) return;
  try {
    const clSnap = await db.collection('escritorios').doc(escId)
      .collection('clientes').where('nome', '==', clienteNome).limit(1).get();
    if (clSnap.empty) return;
    const cDoc = clSnap.docs[0];
    const c = cDoc.data();
    const perfil = c.perfil || 'pragmatico';
    const deltas = DELTA_SATISFACAO_PERFIL[perfil] || DELTA_SATISFACAO_PERFIL.pragmatico;
    const delta  = deltas[resultado] || 0;
    const novaConfianca = Math.max(0, Math.min(100, (c.confianca || 50) + delta));
    await cDoc.ref.update({ confianca: novaConfianca });
  } catch (e) { /* silencioso — clientes não são críticos */ }
}

// ════════════════════════════════════════════════════════
// SISTEMA NOVO (GDD v4.1 — Etapa 14) — Sentença Probabilística
// Usado somente em processos com campo `setlist` (status pronto_para_sentenca).
// O sistema antigo (recalcularConvencimento) permanece para processos legados.
// ════════════════════════════════════════════════════════

// Tabela GDD Seção 35 — nota 1–26 → { total, parcial, improc }
const TABELA_SENTENCA = {
   1: { total:0.02, parcial:0.16, improc:0.82 },
   2: { total:0.03, parcial:0.17, improc:0.80 },
   3: { total:0.03, parcial:0.19, improc:0.78 },
   4: { total:0.04, parcial:0.20, improc:0.76 },
   5: { total:0.04, parcial:0.22, improc:0.74 },
   6: { total:0.05, parcial:0.23, improc:0.72 },
   7: { total:0.05, parcial:0.25, improc:0.70 },
   8: { total:0.06, parcial:0.26, improc:0.68 },
   9: { total:0.06, parcial:0.28, improc:0.66 },
  10: { total:0.07, parcial:0.29, improc:0.64 },
  11: { total:0.08, parcial:0.30, improc:0.62 },
  12: { total:0.09, parcial:0.32, improc:0.59 },
  13: { total:0.10, parcial:0.33, improc:0.57 },
  14: { total:0.11, parcial:0.34, improc:0.55 },
  15: { total:0.12, parcial:0.36, improc:0.52 },
  16: { total:0.13, parcial:0.37, improc:0.50 },
  17: { total:0.14, parcial:0.38, improc:0.48 },
  18: { total:0.15, parcial:0.39, improc:0.46 },
  19: { total:0.16, parcial:0.40, improc:0.44 },
  20: { total:0.18, parcial:0.42, improc:0.40 },
  21: { total:0.20, parcial:0.42, improc:0.38 },
  22: { total:0.22, parcial:0.42, improc:0.36 },
  23: { total:0.24, parcial:0.43, improc:0.33 },
  24: { total:0.26, parcial:0.43, improc:0.31 },
  25: { total:0.28, parcial:0.43, improc:0.29 },
  26: { total:0.30, parcial:0.45, improc:0.25 },
};

// Mapeamento estilo_escrita → campo reacoes do julgador (GDD v5.1 §2.1)
const ESTILO_REACAO_MAP = {
  inovadora:       'doutrinário',
  jurisprudencial: 'jurisprudencial',
  legalista:       'fatual',
  agressiva:       'constitucional',
};

/**
 * Aplica bônus/penalidade do estilo de escrita da peça com base nas reações do julgador.
 * +3 se o estilo bate com a reação dominante; -2 se é o oposto; 0 se sem info.
 */
function modificadorEstilo(estiloEscrita, julgador) {
  if (!estiloEscrita || !julgador?.reacoes) return 0;
  const reacaoAlvo = ESTILO_REACAO_MAP[estiloEscrita];
  if (!reacaoAlvo) return 0;
  const reacoes = julgador.reacoes;
  const valorAlvo = reacoes[reacaoAlvo] ?? 0;
  const maxValor  = Math.max(...Object.values(reacoes), 0);
  if (maxValor <= 0) return 0;
  if (valorAlvo === maxValor) return 3;  // estilo bate com a reação mais forte
  if (valorAlvo <= maxValor * 0.35) return -2;  // estilo é oposto ao que o julgador valoriza
  return 0;
}

// Rookie bonus — GDD Seção 37.1
function rookieBonus(processosConcluidos) {
  if (processosConcluidos <= 10)  return 3;
  if (processosConcluidos <= 20)  return 2;
  if (processosConcluidos <= 30)  return 1;
  return 0;
}

// Valor pct na procedência parcial — GDD Seção 36.4
function sortearValorParcial(tipoCaso) {
  const ranges = {
    employment: [0.50, 0.70],
    civil:      [0.40, 0.60],
    tax:        [0.30, 0.50],
    corporate:  [0.50, 0.80],
  };
  const [lo, hi] = ranges[tipoCaso] || [0.40, 0.65];
  return lo + Math.random() * (hi - lo);
}

/**
 * Determina a sentença via tabela probabilística — GDD Seção 37.3
 * Roda SEMPRE no backend; Math.random() nunca no cliente.
 */
function determinarSentencaSetlist(nota, posicao, julgador, impactoEvento, ctx) {
  let notaAjustada = Math.round(nota + (impactoEvento || 0));
  notaAjustada += rookieBonus(ctx.processos_concluidos || 0);
  if (ctx.supervisao_ativa) notaAjustada += 2;
  notaAjustada = Math.max(1, Math.min(26, notaAjustada));

  const base = { ...TABELA_SENTENCA[notaAjustada] };

  // Modificador de posição — réu: -8% total / +8% improcedente
  if (posicao === 'reu') {
    base.total  = Math.max(0.01, base.total  - 0.08);
    base.improc = Math.min(0.98, base.improc + 0.08);
    // Normalizar
    const soma = base.total + base.parcial + base.improc;
    base.total  /= soma;
    base.parcial /= soma;
    base.improc  /= soma;
  }

  // Modificador de perfil do julgador — GDD Seção 36.2
  if (julgador) {
    let modJ = 0;
    if (julgador.perfil === 'formalista' && ctx.alta_originalidade)   modJ += 0.05;
    if (julgador.perfil === 'fiscal'     && ctx.tipo_caso === 'tax')   modJ -= 0.08;
    if (julgador.perfil === 'garantista' && ctx.tipo_caso === 'criminal') modJ += 0.06;
    base.total  = Math.max(0.01, base.total  + modJ);
    base.improc = Math.max(0.01, base.improc - modJ);
    const soma = base.total + base.parcial + base.improc;
    base.total  /= soma;
    base.parcial /= soma;
    base.improc  /= soma;
  }

  const roll = Math.random();
  if (roll < base.total) {
    return { resultado: 'procedente', valor_pct: 1.00 };
  } else if (roll < base.total + base.parcial) {
    return { resultado: 'parcial', valor_pct: sortearValorParcial(ctx.tipo_caso || 'civil') };
  }
  return { resultado: 'improcedente', valor_pct: 0 };
}

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};
function repCapDoCargo(cargoId) { return REP_CAP[cargoId] || 55; }

function fmt(n) {
  if (!n && n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000) return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

function mesTotalPessoal(j) { return (j.ano_pessoal||1)*12 + (j.mes_pessoal||0); }

const CARGO_IDX = {
  est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7,
  jsub:2, jtit:4, dsb:5, mstj:7, padj:2, prom:4, pjus:5, pgj:7,
  dadj:2, def:4, dch:5, dge:7,
};
const CARGO_IDX_CONCLUSAO_MIN = 2; // jnr — estagiário/assistente não processam sentença

// ── AUTORIZAÇÃO PARA PROCESSAR SENTENÇA/ACÓRDÃO ──
// Casos INDIVIDUAIS (advogado_uid === uid): só o próprio dono.
// Casos do POOL (pool_escritorio_id existe, advogado_uid é null por
// design — ver novoProcessoPool/novoProcessoPoolEmpregado em
// js/processos.js): qualquer jogador que pertença ao MESMO escritório
// (dono ou empregado) e tenha cargo Júnior+ pode processar — é
// colaborativo por natureza, não pertence a quem "tocou primeiro".
// Antes desta correção, a checagem rígida (advogado_uid !== uid)
// rejeitava TODO caso do pool com 403 "Processo não é seu", porque
// advogado_uid nunca é preenchido nesses casos (fica null mesmo depois
// de alguém trabalhar nele).
async function autorizadoParaProcessar(db, p, uid, j) {
  if (p.advogado_uid === uid) return true; // caso individual, dono de fato

  if (p.pool_escritorio_id) {
    const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
    if (escId !== p.pool_escritorio_id) return false; // não é do mesmo escritório
    const cargoIdx = CARGO_IDX[j.cargo_id] ?? -1;
    return cargoIdx >= CARGO_IDX_CONCLUSAO_MIN; // Júnior+ apenas
  }

  return false;
}

// ── RECÁLCULO DO CONVENCIMENTO — reproduz EXATAMENTE a mesma fórmula do
// frontend (ver responderAudiencia em processos.js), mas a partir do
// histórico bruto, nunca do valor já calculado e salvo pelo cliente.
function recalcularConvencimento(p) {
  const historico = p.historico_respostas_audiencia || [];
  let cv = p.dificuldade_extra ? 28 : 38;

  for (const { rodada, tipo } of historico) {
    const arg = p.args_audiencia[rodada];
    if (!arg) continue; // rodada inválida — ignora silenciosamente

    let d = tipo === arg.ideal ? 11 : tipo === arg.neutro ? 2 : -14;
    const perfilJuiz = p.juiz.perfil_oculto;
    if (perfilJuiz === 'formalista' && tipo === 'tecnica') d += 5;
    if (perfilJuiz === 'garantista' && tipo === 'agressiva') d += 5;
    if (perfilJuiz === 'conservador' && tipo === 'passiva') d -= 9;
    if (perfilJuiz === 'formalista' && tipo === 'agressiva') d -= 4;

    const provasSel = (p.provas_selecionadas || []).map(i => p.provas[i]).filter(Boolean);
    const fm = provasSel.length ? provasSel.reduce((s,pr) => s + (pr.forca || 60), 0) / provasSel.length : 60;
    if (fm >= 85 && tipo !== 'passiva') d += 5;
    else if (fm >= 65 && tipo !== 'passiva') d += 2;
    else if (fm < 50) d -= 4;
    else if (fm < 35) d -= 8;

    const tesesSel = p.teses_selecionadas || [];
    d += tesesSel.length * 2;
    if (tesesSel.length === 0) d -= 4;

    cv = Math.max(5, Math.min(95, cv + d));
  }
  return cv;
}

async function _finalizarProcessoDefinitivo(db, processoRef, jogadorRef, p, j, score, favoravelAoJogador, honPotencial, mesAtual, repDelta, logger) {
  const escritorioDoCaso = p.pool_escritorio_id || j.escritorio_proprio_id;
  if (favoravelAoJogador && honPotencial > 0) {
    if (escritorioDoCaso) {
      const escRef = db.collection('escritorios').doc(escritorioDoCaso);
      const escSnap = await escRef.get();
      if (escSnap.exists) await escRef.update({ caixa: (escSnap.data().caixa||0) + honPotencial });
    } else {
      await jogadorRef.update({
        dinheiro: (j.dinheiro || 0) + honPotencial,
        honorarios_mes: (j.honorarios_mes||0) + honPotencial,
      });
    }
  }
  await processoRef.update({
    status: favoravelAoJogador ? 'ganho' : 'perdido',
    encerrado_mes: mesAtual,
    hon_total_acumulado: favoravelAoJogador ? honPotencial : 0,
    convencimento: score,
  });
  if (escritorioDoCaso && !favoravelAoJogador) {
    try {
      const escRef = db.collection('escritorios').doc(escritorioDoCaso);
      const escSnap = await escRef.get();
      if (escSnap.exists) {
        const escRep = escSnap.data().prestigio || 10;
        await escRef.update({ prestigio: Math.max(0, escRep - Math.ceil(Math.abs(repDelta) * 0.5)) });
      }
    } catch (e) { logger.warn('Penalidade rep escritório falhou:', e); }
  }
  // Marcar o processo_pool de origem como concluído (quando o jogador assumiu manualmente)
  if (p.pool_proc_subcol_id && p.pool_proc_esc_id) {
    try {
      const resultado = favoravelAoJogador ? (score >= 80 ? 'procedente' : 'parcial') : 'improcedente';
      await db.collection('escritorios').doc(p.pool_proc_esc_id)
        .collection('processos_pool').doc(p.pool_proc_subcol_id)
        .update({
          status: 'concluido',
          resultado,
          valor_recebido: honPotencial,
          concluido_em: new Date().toISOString(),
        });
    } catch (e) { logger.warn('Atualização processos_pool falhou:', e); }
  }
}

// ─── Handler do novo sistema de setlist ─────────────────────────────────────

async function _processarSentencaSetlist(db, processoRef, jogadorRef, p, j, uid, log, processoId) {
  // Nota vem do Firestore — nunca do payload do cliente
  const nota         = p.nota_provisoria || 1;
  const ev           = p.evento_julgamento || {};
  const impactoEv    = (ev.impacto || 0) + (ev.segundo_evento?.impacto || 0);
  const posicao      = p.posicao || p.meu_lado || 'autor';
  const tipoCaso     = p.area || p.tipo || 'civil';
  const _INST_MAP = { '1grau':'trial', TJ:'appeals', TJRJ:'appeals', TJSP:'appeals', STJ:'circuit', TST:'circuit', STF:'supreme' };
  // Usa setlist_instancia gravado pelo montarSetlist; fallback para instancia/instancia_atual
  const instRaw   = p.setlist_instancia || p.instancia_atual || p.instancia;
  const instancia = _INST_MAP[instRaw] || (instRaw && instRaw !== '1grau' ? 'appeals' : 'trial');

  const ctx = {
    processos_concluidos: j.processos_concluidos || 0,
    supervisao_ativa:     p.supervisao_ativa || false,
    tipo_caso:            tipoCaso,
    alta_originalidade:   false,
  };

  // Modificador de estilo de escrita × reações do julgador (GDD v5.1 §2.1)
  const modEstilo = modificadorEstilo(p.estilo_principal || null, p.juiz || null);
  const notaComEstilo = Math.max(1, Math.min(26, nota + modEstilo));

  const { resultado, valor_pct } = determinarSentencaSetlist(notaComEstilo, posicao, p.juiz || null, impactoEv, ctx);

  const cap = repCapDoCargo(j.cargo_id);
  const rep = j.reputacao || 30;
  const mesAtual = j.mes_global_pessoal || mesTotalPessoal(j);
  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';

  // Honorários — GDD Seção 4 (contingency 33% + 10% attorneys fees)
  const valorBase = p.valor || 0;
  const valorRecebido = Math.round(valorBase * valor_pct);
  let honPotencial = 0;
  if (resultado !== 'improcedente') {
    const honPct = 0.33;
    const attyFee = ['employment','civil'].includes(tipoCaso) ? 0.10 : 0;
    honPotencial = Math.round(valorRecebido * (honPct + attyFee));
  }

  // Reputação
  const favoravelAoJogador = resultado !== 'improcedente';
  let repDelta = 0;
  if (resultado === 'procedente') repDelta = Math.max(1, Math.floor((cap - rep) * 0.08));
  else if (resultado === 'parcial') repDelta = Math.max(1, Math.floor((cap - rep) * 0.05));
  else repDelta = -Math.max(1, Math.floor(rep * 0.05));

  // XP — mantém a tabela do banco jurídico como referência
  const scoreEquiv = resultado === 'procedente' ? 85 : resultado === 'parcial' ? 65 : 35;
  const xpGanho    = banco.xpPorDecisao(instancia === 'trial' ? '1grau' : '2grau', scoreEquiv);

  // Atualizar jogador
  const updJog = {
    reputacao:            Math.max(0, Math.min(cap, rep + repDelta)),
    xp:                   (j.xp || 0) + xpGanho,
    processos_concluidos: (j.processos_concluidos || 0) + 1,
    derrotas_consecutivas: favoravelAoJogador ? 0 : (j.derrotas_consecutivas || 0) + 1,
  };
  if (favoravelAoJogador) { updJog.wins = (j.wins||0)+1; updJog.wins_ano = (j.wins_ano||0)+1; }
  else { updJog.losses = (j.losses||0)+1; updJog.losses_ano = (j.losses_ano||0)+1; }

  await jogadorRef.update(updJog);

  // Honorários — ficam hon_pendente até trânsito em julgado
  await processoRef.update({
    status:          'aguardando_decisao_sentenca',
    resultado_setlist: resultado,
    valor_recebido:  valorRecebido,
    hon_pendente:    honPotencial,
    nota_final:      notaComEstilo,
    mod_estilo:      modEstilo,
    impacto_evento:  impactoEv,
    repDelta,
    encerrado_mes:   null,
  });

  // Atualizar fama das petições usadas
  const peticoesUsadas = (p.setlist || [])
    .filter(s2 => s2.tipo === 'peticao' && s2.peticao_id)
    .map(s2 => s2.peticao_id);
  await Promise.all(peticoesUsadas.map(pid => atualizarFama(db, pid, resultado, instancia)));

  // XP de Practice Area
  try { await aplicarXpPracticeArea(db, uid, tipoCaso, resultado); } catch(e) { log.warn('XP area:', e.message); }

  log.info(`[SENTENCA SETLIST] ${uid} → ${p.titulo||processoId}, resultado=${resultado}, nota=${nota}, hon=${honPotencial}`);
  return {
    resultado,
    valor_pct: Math.round(valor_pct * 100),
    hon_pendente: honPotencial,
    nota_final:   nota,
    repDelta,
    xpGanho,
    aguardandoDecisaoDoJogador: true,
  };
}

exports.processarSentenca = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const { processo_id } = request.data;
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef = db.collection('jogadores').doc(uid);

  const [processoSnap, jogadorSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!processoSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const p = processoSnap.data();
  const j = jogadorSnap.data();

  if (!(await autorizadoParaProcessar(db, p, uid, j))) {
    throw new HttpsError('permission-denied', 'Você não tem permissão para processar este processo (cargo insuficiente ou não pertence ao escritório do caso).');
  }

  // ── NOVO CAMINHO: processo com setlist (GDD v4.1) ───────────────────────
  if (p.setlist && p.status === 'pronto_para_sentenca') {
    return _processarSentencaSetlist(db, processoRef, jogadorRef, p, j, uid, logger, processo_id);
  }

  // ── CAMINHO LEGADO: sistema de rodadas ───────────────────────────────────
  if (p.status !== 'andamento') throw new HttpsError('failed-precondition', 'Processo já encerrado ou em outra fase.');
  if ((p.rodada_audiencia || 0) < 3) throw new HttpsError('failed-precondition', 'Audiência ainda não foi concluída (3 rodadas).');

  // ── RECALCULA o score — esta é a única fonte de verdade do resultado.
  const score = recalcularConvencimento(p);
  const souReu = p.meu_lado === 'reu';
  const favoravelAoJogador = score >= 58;
  const mesAtual = j.mes_global_pessoal || mesTotalPessoal(j);
  const cap = repCapDoCargo(j.cargo_id);
  const rep = j.reputacao || 30;

  let categoria, repDelta, txt;
  if (score >= 80) {
    categoria = 'procedente';
    txt = souReu ? 'Pedido julgado totalmente IMPROCEDENTE — sua defesa prevaleceu integralmente.' : 'Pedido julgado totalmente PROCEDENTE.';
    repDelta = Math.max(1, Math.floor((cap - rep) * 0.08));
  } else if (score >= 58) {
    categoria = 'parcial';
    txt = 'Pedido julgado PARCIALMENTE PROCEDENTE.';
    repDelta = Math.max(1, Math.floor((cap - rep) * 0.05));
  } else if (score >= 38) {
    categoria = 'improcedente';
    txt = souReu ? 'Pedido julgado PROCEDENTE contra a defesa.' : 'Pedido julgado IMPROCEDENTE.';
    repDelta = -Math.max(1, Math.floor(rep * 0.05));
  } else {
    categoria = 'improcedente_agravada';
    txt = souReu ? 'Pedido julgado totalmente PROCEDENTE contra a defesa, com condenação agravada.' : 'Pedido julgado IMPROCEDENTE, com condenação em honorários.';
    repDelta = -Math.max(1, Math.floor(rep * 0.08));
  }

  const xpGanho = banco.xpPorDecisao('1grau', score);

  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const suc = Math.floor(p.valor * 0.10);
  const honPotencial = favoravelAoJogador ? (isSolo ? Math.floor(p.valor * 0.30 + suc) : Math.floor(suc * 0.10)) : 0;

  const dc = (j.derrotas_consecutivas || 0) + 1;
  const demitido = !favoravelAoJogador && dc >= 5 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo' && !j.escritorio_proprio_id;

  const updatesJogador = {
    reputacao: Math.max(0, Math.min(cap, rep + repDelta)),
    xp: (j.xp || 0) + xpGanho,
    derrotas_consecutivas: favoravelAoJogador ? 0 : dc,
  };
  if (favoravelAoJogador) { updatesJogador.wins = (j.wins||0)+1; updatesJogador.wins_ano = (j.wins_ano||0)+1; }
  else { updatesJogador.losses = (j.losses||0)+1; updatesJogador.losses_ano = (j.losses_ano||0)+1; }
  if (demitido) {
    updatesJogador.escritorio_id = 'solo';
    updatesJogador.escritorio_empregado_id = null;
    updatesJogador.escritorio_nome = null;
    updatesJogador.derrotas_consecutivas = 0;
  }
  await jogadorRef.update(updatesJogador);

  // Quando o JOGADOR perde, recorrer é sempre opção dele, não sorteio —
  // a parte contrária (NPC) é quem tem chance probabilística de recorrer.
  const recorre = favoravelAoJogador
    ? banco.decidirRecurso(100 - score)
    : true;

  // Helper: atualizar o doc do pool subcol quando o processo muda de estado
  async function _atualizarPoolSubcol(novoStatus) {
    if (!p.pool_proc_subcol_id || !p.pool_proc_esc_id) return;
    try {
      await db.collection('escritorios').doc(p.pool_proc_esc_id)
        .collection('processos_pool').doc(p.pool_proc_subcol_id)
        .update({ status: novoStatus });
    } catch (e) { logger.warn('Atualização pool subcol status falhou:', e); }
  }

  if (recorre && favoravelAoJogador) {
    // Parte contrária (NPC) recorreu pelo sorteio — fluxo automático, igual antes.
    const { dataDisponivel, prazoFinal } = banco.calcularPrazosRecurso(j.mes_pessoal||0, j.ano_pessoal||1);
    await processoRef.update({
      status: 'recurso_pendente',
      instancia_atual: '1grau',
      quem_recorre: 'parte_contraria',
      score_anterior: score,
      hon_pendente: honPotencial,
      data_disponivel_recurso: dataDisponivel,
      prazo_final_recurso: prazoFinal,
      encerrado_mes: null,
      convencimento: score,
    });
    await _atualizarPoolSubcol('recurso_pendente');
    return { categoria, txt, repDelta, xpGanho, recorre: true, quemRecorre: 'parte_contraria', instanciaSeguinte: p.instancia_seguinte, demitido };
  } else if (recorre && !favoravelAoJogador) {
    // Jogador perdeu — recurso é DECISÃO dele, não sorteio. Fica aguardando
    // ele decidir (window.decidirRecorrerPropria, callable separada),
    // sem entrar em recurso_pendente automaticamente.
    await processoRef.update({
      status: 'aguardando_decisao_sentenca',
      score_anterior: score,
      hon_pendente: honPotencial,
      convencimento: score,
    });
    await _atualizarPoolSubcol('aguardando_decisao_sentenca');
    return { categoria, txt, repDelta, xpGanho, recorre: false, aguardandoDecisaoDoJogador: true, score, instanciaSeguinte: p.instancia_seguinte, demitido };
  } else {
    await _finalizarProcessoDefinitivo(db, processoRef, jogadorRef, p, j, score, favoravelAoJogador, honPotencial, mesAtual, repDelta, logger);
    return { categoria, txt, repDelta, xpGanho, recorre: false, hon: honPotencial, demitido };
  }
});

// ════════════════════════════════════════════════════════
// DECIDIR RECURSO DA SENTENÇA — callable chamada pelo client
// (window.decidirRecursoSentencaProducao) quando o JOGADOR decide se
// recorre de uma sentença desfavorável (processo em
// 'aguardando_decisao_sentenca'). Esta função estava referenciada no
// client desde a correção que tornou o recurso uma decisão do jogador
// em vez de sorteio automático, mas nunca tinha sido implementada aqui
// — toda tentativa de chamar 'decidirRecursoSentenca' falhava com erro
// de função inexistente (404/CORS), porque o nome nunca correspondia a
// nenhum exports.* real neste arquivo. Espelha a mesma estrutura de
// exports.decidirProximaInstancia em processar_acordao.js, adaptada
// para o ponto de entrada do recurso (1ª instância → instanciaSeguinte),
// não para uma instância recursal já em andamento.
// ════════════════════════════════════════════════════════
exports.decidirRecursoSentenca = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { processo_id, recorrer } = request.data;
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef = db.collection('jogadores').doc(uid);
  const [processoSnap, jogadorSnap] = await Promise.all([processoRef.get(), jogadorRef.get()]);
  if (!processoSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const p = processoSnap.data();
  const j = jogadorSnap.data();
  if (!(await autorizadoParaProcessar(db, p, uid, j))) {
    throw new HttpsError('permission-denied', 'Você não tem permissão para decidir sobre este processo (cargo insuficiente ou não pertence ao escritório do caso).');
  }
  if (p.status !== 'aguardando_decisao_sentenca') {
    throw new HttpsError('failed-precondition', 'Este processo não está aguardando decisão de recurso.');
  }

  // ── Fluxo setlist (GDD v4.1): resultado já determinado, hon em espera ───────
  const isSetlistFlow = !!(p.setlist && p.resultado_setlist);
  if (!recorrer) {
    if (isSetlistFlow) {
      // Aceitar: encerrar com base no resultado já calculado
      const ganhou = p.resultado_setlist !== 'improcedente';
      // Descontar valor já antecipado (GDD Seção 31 — fatoração de recebíveis)
      const honBruto      = ganhou ? (p.hon_pendente || 0) : 0;
      const honAntecipado = p.hon_antecipado || 0;
      const hon           = Math.max(0, honBruto - honAntecipado);
      const repDt  = p.repDelta || 0;
      const escritorioDoCaso = p.pool_escritorio_id || j.escritorio_proprio_id;
      if (ganhou && hon > 0) {
        if (escritorioDoCaso) {
          const escRef  = db.collection('escritorios').doc(escritorioDoCaso);
          const escSnap = await escRef.get();
          if (escSnap.exists) await escRef.update({ caixa: (escSnap.data().caixa||0) + hon });
        } else {
          await jogadorRef.update({
            dinheiro:       (j.dinheiro||0) + hon,
            honorarios_mes: (j.honorarios_mes||0) + hon,
          });
        }
      }
      if (!ganhou && repDt < 0 && escritorioDoCaso) {
        try {
          const escRef  = db.collection('escritorios').doc(escritorioDoCaso);
          const escSnap = await escRef.get();
          if (escSnap.exists)
            await escRef.update({ prestigio: Math.max(0, (escSnap.data().prestigio||10) - Math.ceil(Math.abs(repDt)*0.5)) });
        } catch(e) { logger.warn('Rep escritório setlist:', e); }
      }
      await processoRef.update({
        status:               ganhou ? 'ganho' : 'perdido',
        encerrado_mes:        mesTotalPessoal(j),
        hon_total_acumulado:  hon,
        hon_pendente:         0,
      });
      if (p.pool_proc_subcol_id && p.pool_proc_esc_id) {
        try {
          await db.collection('escritorios').doc(p.pool_proc_esc_id)
            .collection('processos_pool').doc(p.pool_proc_subcol_id)
            .update({ status:'concluido', resultado: p.resultado_setlist, valor_recebido: hon, concluido_em: new Date().toISOString() });
        } catch(e) { logger.warn('Pool subcol encerrar setlist:', e); }
      }
      await _atualizarSatisfacaoCliente(db, p, ganhou ? p.resultado_setlist : 'improcedente');
      return { msg: ganhou ? `Vitória confirmada — R$${hon.toLocaleString('pt-BR')} em honorários recebidos.` : 'Derrota aceita. Processo encerrado.' };
    }

    // Fluxo legado: aceita a derrota
    const score = p.score_anterior;
    await _finalizarProcessoDefinitivo(db, processoRef, jogadorRef, p, j, score, false, 0, mesTotalPessoal(j), 0, logger);
    await _atualizarSatisfacaoCliente(db, p, 'improcedente');
    return { msg: 'Decisão aceita. Processo encerrado — trânsito em julgado.' };
  }

  if (isSetlistFlow && p.resultado_setlist !== 'improcedente') {
    throw new HttpsError('failed-precondition', 'Você ganhou — não há derrota para recorrer.');
  }

  // Recorrer: abre a fase de recurso, com o JOGADOR como quem recorre.
  // Avança instancia_seguinte para a próxima instância na cadeia recursal,
  // para que chamadas subsequentes a montarSetlist usem o tribunal correto.
  const instAtualRecurso = p.setlist_instancia || p.instancia_atual || p.instancia;
  const proxTribunal     = banco.tribunalRecursal(p, p.instancia_seguinte);
  const { dataDisponivel, prazoFinal } = banco.calcularPrazosRecurso(j.mes_pessoal || 0, j.ano_pessoal || 1);
  await processoRef.update({
    status: 'recurso_pendente',
    instancia_atual: instAtualRecurso,
    instancia_seguinte: proxTribunal,
    quem_recorre: 'jogador',
    data_disponivel_recurso: dataDisponivel,
    prazo_final_recurso: prazoFinal,
    encerrado_mes: null,
  });
  // Propagar estado para o pool subcol (se veio de _assumirCasoPool)
  if (p.pool_proc_subcol_id && p.pool_proc_esc_id) {
    try {
      await db.collection('escritorios').doc(p.pool_proc_esc_id)
        .collection('processos_pool').doc(p.pool_proc_subcol_id)
        .update({ status: 'recurso_pendente' });
    } catch (e) { logger.warn('Pool subcol recurso update (decidir):', e); }
  }
  return { msg: `Recurso protocolado. Acesse a carteira processual para sustentar no ${proxTribunal}.` };
});
