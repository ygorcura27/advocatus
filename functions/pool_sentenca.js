'use strict';

/**
 * SENTENÇA DO POOL DO ESCRITÓRIO — portado de js/processos_escritorio.js
 * (_processarSentenca + _poolModalAceitar/_poolModalRecorrer/
 * _poolModalRecorrerContrario + _criarProcessoRecursalPool).
 *
 * Antes o sorteio da sentença, o crédito no caixa do escritório e a
 * criação do processo recursal (com hon_pendente) eram feitos pelo
 * navegador — dava pra escolher o resultado ou inventar honorários pelo
 * console. Agora:
 *   etapa 'sortear'  → o servidor sorteia; procedente já fecha na hora;
 *                      parcial/improcedente fica guardado em
 *                      sentenca_pendente no doc do pool.
 *   etapa 'aceitar' | 'recorrer' | 'recorrer_contrario' → aplica o que foi
 *                      sorteado (nunca aceita resultado vindo do cliente).
 * A energia (categoria Processos) continua sendo debitada pelo cliente,
 * igual antes — energia não é campo protegido.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const SKILLS_REL = ['escrita_juridica', 'pesquisa', 'oratoria', 'persuasao', 'argumentacao'];
const HABILIDADE_CAP = 50;

function _roll(pesos, rnd = Math.random()) {
  const [p, pa] = pesos;
  return rnd < p ? 'procedente' : rnd < p + pa ? 'parcial' : 'improcedente';
}

/** Mesma tabela de js/processos_escritorio.js:_sentencaOutcome. */
function sortearSentencaPool(skills, rnd = Math.random()) {
  const vals  = SKILLS_REL.map((s) => (skills || {})[s] || 0);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const efic  = Math.min(1, media / HABILIDADE_CAP);
  if (efic >= 0.85) return _roll([0.38, 0.45, 0.17], rnd);
  if (efic >= 0.70) return _roll([0.25, 0.50, 0.25], rnd);
  if (efic >= 0.55) return _roll([0.14, 0.48, 0.38], rnd);
  if (efic >= 0.40) return _roll([0.07, 0.38, 0.55], rnd);
  if (efic >= 0.25) return _roll([0.03, 0.25, 0.72], rnd);
  return _roll([0.01, 0.12, 0.87], rnd);
}

function valorRecebidoPool(honorarios, resultado) {
  const hon = honorarios || 0;
  if (resultado === 'procedente') return hon;
  if (resultado === 'parcial') return Math.round(hon * 0.55);
  return Math.round(hon * 0.1);
}

function _somarMeses(m, a, delta) {
  const total = (a * 12 + m) + delta;
  return { mes: total % 12, ano: Math.floor(total / 12) };
}

function _podeGerir(esc, uid) {
  return esc.dono_uid === uid || esc.fundador_uid === uid || esc.gestor_id === uid
    || (Array.isArray(esc.socios_uids) && esc.socios_uids.includes(uid));
}

const _fmt = (n) => `R$ ${Math.round(n || 0).toLocaleString('pt-BR')}`;

exports.sentencaPool = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escId, procId, etapa } = request.data || {};
  if (typeof escId !== 'string' || typeof procId !== 'string') throw new HttpsError('invalid-argument', 'Parâmetros inválidos.');
  if (!['sortear', 'aceitar', 'recorrer', 'recorrer_contrario'].includes(etapa)) throw new HttpsError('invalid-argument', 'Etapa inválida.');

  const db      = getFirestore();
  const escRef  = db.collection('escritorios').doc(escId);
  const procRef = escRef.collection('processos_pool').doc(procId);
  const jRef    = db.collection('jogadores').doc(uid);

  return db.runTransaction(async (tx) => {
    const [escSnap, procSnap, jSnap] = await Promise.all([tx.get(escRef), tx.get(procRef), tx.get(jRef)]);
    if (!escSnap.exists || !procSnap.exists || !jSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
    if (!_podeGerir(escSnap.data(), uid)) throw new HttpsError('permission-denied', 'Só quem gere o escritório processa sentenças do pool.');

    const proc = procSnap.data();
    const j    = jSnap.data();
    const agora = new Date().toISOString();
    const quemAtuou = proc.func_nome || 'A equipe';

    const creditarCaixa = (valor) => tx.update(escRef, {
      caixa: FieldValue.increment(valor),
      faturamento_mes_atual: FieldValue.increment(valor),
      faturamento_honorarios_mes: FieldValue.increment(valor),
    });
    const liberarFunc = () => {
      if (proc.func_id) tx.update(escRef.collection('funcionarios').doc(proc.func_id), { processo_id: null });
    };
    const log = (texto) => tx.set(escRef.collection('log_gestao').doc(), { texto, criado_em: agora });

    if (etapa === 'sortear') {
      if (proc.status !== 'aguardando_sentenca') throw new HttpsError('failed-precondition', 'Este processo não está aguardando sentença.');
      if (proc.sentenca_pendente) {
        // Já sorteado (ex.: modal fechado sem decidir) — devolve o mesmo resultado, nunca re-sorteia.
        return { ok: true, jaSorteado: true, ...proc.sentenca_pendente };
      }
      const resultado     = sortearSentencaPool(j.skills);
      const valorRecebido = valorRecebidoPool(proc.honorarios, resultado);

      if (resultado === 'procedente') {
        creditarCaixa(valorRecebido);
        tx.update(procRef, { status: 'concluido', resultado, valor_recebido: valorRecebido, concluido_em: agora });
        liberarFunc();
        log(`✅ ${quemAtuou} obteve sentença favorável em "${proc.titulo}". +${_fmt(valorRecebido)}.`);
        return { ok: true, resultado, valorRecebido };
      }

      // Parcial: ~65% de chance da parte contrária recorrer (mesma regra de antes).
      const opponentAppealed = resultado === 'parcial' && Math.random() < 0.65;
      const pendente = { resultado, valorRecebido, opponentAppealed };
      tx.update(procRef, { sentenca_pendente: pendente });
      return { ok: true, ...pendente };
    }

    // ── Decisão sobre sentença desfavorável já sorteada ──
    const pend = proc.sentenca_pendente;
    if (!pend || proc.status !== 'aguardando_sentenca') throw new HttpsError('failed-precondition', 'Não há sentença pendente de decisão.');
    if (pend.opponentAppealed && etapa !== 'recorrer_contrario') throw new HttpsError('failed-precondition', 'A parte contrária já recorreu.');
    if (!pend.opponentAppealed && etapa === 'recorrer_contrario') throw new HttpsError('failed-precondition', 'A parte contrária não recorreu.');

    const { resultado, valorRecebido } = pend;
    creditarCaixa(valorRecebido);
    liberarFunc();

    if (etapa === 'aceitar') {
      tx.update(procRef, {
        status: 'concluido', resultado, valor_recebido: valorRecebido,
        concluido_em: agora, sentenca_pendente: FieldValue.delete(),
      });
      const ico = resultado === 'parcial' ? '🟡' : '❌';
      log(`${ico} ${quemAtuou} — sentença ${resultado} em "${proc.titulo}". +${_fmt(valorRecebido)}. Encerrado sem recurso.`);
      return { ok: true, resultado, valorRecebido };
    }

    // Recurso (do jogador ou da parte contrária) → processo recursal no TJ.
    const quemRecorre    = etapa === 'recorrer' ? 'jogador' : 'parte_contraria';
    const bloq           = 2 + Math.floor(Math.random() * 2);
    const dataDisponivel = _somarMeses(j.mes_pessoal || 0, j.ano_pessoal || 1, bloq);
    const jan            = 2 + Math.floor(Math.random() * 2);
    const prazoFinal     = _somarMeses(dataDisponivel.mes, dataDisponivel.ano, jan);
    const recursalRef    = db.collection('processos').doc();
    tx.set(recursalRef, {
      titulo: proc.titulo || 'Processo',
      autor:  proc.cliente_nome || 'Cliente',
      reu:    'Parte contrária',
      tipo:   proc.area || 'Cível',
      numero: procId,
      tribunal: 'TJRJ',
      valor: proc.honorarios || 0,
      fatos_narrativa: [], teses_selecionadas: [],
      status: 'recurso_pendente',
      pool_escritorio_id:  escId,
      pool_proc_subcol_id: procId,
      pool_proc_esc_id:    escId,
      advogado_uid: uid,
      personagem_id: j.personagem_ativo_id || null,
      instancia_atual:    '1grau',
      instancia_seguinte: 'TJ',
      quem_recorre: quemRecorre,
      score_anterior: resultado === 'parcial' ? 65 : 38,
      hon_pendente: valorRecebido,
      data_disponivel_recurso: dataDisponivel,
      prazo_final_recurso:     prazoFinal,
      criado_em: agora,
    });
    tx.update(procRef, {
      status: 'recurso_pendente', resultado, valor_recebido: valorRecebido,
      processo_ref: recursalRef.id, sentenca_pendente: FieldValue.delete(),
    });
    log(quemRecorre === 'jogador'
      ? `⚖️ Recurso protocolado em "${proc.titulo}" (sentença ${resultado}). Aguardando julgamento no TJ.`
      : `⚠️ Parte contrária recorreu da sentença parcial em "${proc.titulo}". Você deverá defender no TJ.`);
    return { ok: true, resultado, valorRecebido, processoRef: recursalRef.id };
  });
});

exports.sortearSentencaPool = sortearSentencaPool;
exports.valorRecebidoPool = valorRecebidoPool;
