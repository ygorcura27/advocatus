'use strict';

/**
 * OPORTUNIDADES DO ESCRITÓRIO — portado de js/escritorio_painel.js
 * (_aceitarOpPessoalmente / _confirmarDelegacao) e js/servicos.js
 * (aceitarOportunidade / delegarServico → _processarServicoConcluido).
 *
 * O valor pago vinha do navegador (argumento do onclick) e era somado no
 * caixa do escritório ou no saldo do jogador pelo próprio cliente. Agora o
 * valor sai do documento da oportunidade (gerado pelo servidor no avanço de
 * mês), a fração depende do cargo real do funcionário, e a oportunidade só
 * pode ser usada uma vez (status 'disponivel' checado na mesma transaction).
 *
 * Modos (mesmo comportamento de antes, só que no servidor):
 *   painel_pessoal  → 100% do valor no CAIXA do escritório
 *   painel_delegar  → DELEGAR_PCT[cargo] no caixa + energia NPC do funcionário
 *   servico_pessoal → 100% do valor no SALDO do jogador
 *   servico_delegar → PRODUTIVIDADE_CARGO[cargo] no saldo do jogador
 * Energia do jogador continua sendo debitada pelo cliente (não é campo protegido).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Espelhos de js/escritorio_painel.js e js/servicos_dados.js.
const DELEGAR_PCT = { est: 0.20, ass: 0.20, jnr: 0.30, pln: 0.40, snr: 0.50, asc: 0.70, soc: 1.00 };
const PRODUTIVIDADE_CARGO = { est: 0.10, ass: 0.20, jnr: 0.30, pln: 0.40, snr: 0.50, asc: 0.70, soc: 1.00, socn: 1.00 };
const NPC_CUSTO_OP    = 25;
const NPC_ENERGIA_MES = 100;
const NPC_OVERLOAD_TH = 20;

const MODOS = ['painel_pessoal', 'painel_delegar', 'servico_pessoal', 'servico_delegar'];

/** Quanto entra e pra onde, dado o modo, o valor da oportunidade e o cargo do funcionário. Pura. */
function calcularRecebimento(modo, valor, cargoFunc) {
  switch (modo) {
    case 'painel_pessoal':  return { destino: 'caixa',    recebe: Math.round(valor) };
    case 'painel_delegar':  return { destino: 'caixa',    recebe: Math.round(valor * (DELEGAR_PCT[cargoFunc] || 0.20)) };
    case 'servico_pessoal': return { destino: 'jogador',  recebe: Math.floor(valor) };
    case 'servico_delegar': return { destino: 'jogador',  recebe: Math.floor(valor * (PRODUTIVIDADE_CARGO[cargoFunc] || 0.5)) };
    default: throw new HttpsError('invalid-argument', 'Modo inválido.');
  }
}

function _podeGerir(esc, uid) {
  return esc.dono_uid === uid || esc.fundador_uid === uid || esc.gestor_id === uid
    || (Array.isArray(esc.socios_uids) && esc.socios_uids.includes(uid));
}

exports.concluirOportunidade = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const uid = request.auth.uid;
  const { escId, opId, modo, funcId } = request.data || {};
  if (typeof escId !== 'string' || typeof opId !== 'string' || !MODOS.includes(modo)) {
    throw new HttpsError('invalid-argument', 'Parâmetros inválidos.');
  }
  const delegando = modo.endsWith('_delegar');
  if (delegando && typeof funcId !== 'string') throw new HttpsError('invalid-argument', 'Funcionário obrigatório.');

  const db     = getFirestore();
  const escRef = db.collection('escritorios').doc(escId);
  const opRef  = escRef.collection('oportunidades').doc(opId);
  const fRef   = delegando ? escRef.collection('funcionarios').doc(funcId) : null;
  const jRef   = db.collection('jogadores').doc(uid);

  return db.runTransaction(async (tx) => {
    const [escSnap, opSnap, fSnap] = await Promise.all([
      tx.get(escRef), tx.get(opRef), fRef ? tx.get(fRef) : Promise.resolve(null),
    ]);
    if (!escSnap.exists || !opSnap.exists) throw new HttpsError('not-found', 'Oportunidade não encontrada.');
    if (!_podeGerir(escSnap.data(), uid)) throw new HttpsError('permission-denied', 'Só quem gere o escritório pode fechar oportunidades.');

    const op = opSnap.data();
    if (op.status !== 'disponivel') throw new HttpsError('failed-precondition', 'Essa oportunidade já foi usada.');

    let f = null;
    if (delegando) {
      if (!fSnap || !fSnap.exists) throw new HttpsError('not-found', 'Funcionário não encontrado.');
      f = fSnap.data();
      if (f.ativo === false || f.burnout_npc) throw new HttpsError('failed-precondition', 'Funcionário indisponível.');
    }

    const valor = Number(op.valor) || 0;
    const { destino, recebe } = calcularRecebimento(modo, valor, f?.cargo_id);
    const agora = new Date().toISOString();

    if (destino === 'caixa') {
      tx.update(escRef, {
        caixa: FieldValue.increment(recebe),
        faturamento_mes_atual: FieldValue.increment(recebe),
        faturamento_honorarios_mes: FieldValue.increment(recebe),
      });
    } else {
      tx.update(jRef, {
        dinheiro: FieldValue.increment(recebe),
        honorarios_mes: FieldValue.increment(recebe),
      });
    }

    if (modo === 'painel_pessoal') {
      tx.update(opRef, { status: 'aceita', aceito_por: 'dono', valor_recebido: recebe, aceito_em: agora });
    } else if (modo === 'painel_delegar') {
      tx.update(opRef, {
        status: 'delegada', delegado_func_id: funcId, delegado_cargo: f.cargo_id,
        valor_recebido: recebe, valor_total: valor, aceito_em: agora,
      });
      const npcNova = (f.energia_npc_usada_mes || 0) + NPC_CUSTO_OP;
      tx.update(fRef, {
        energia_npc_usada_mes: npcNova,
        meses_sobrecarregado: npcNova >= NPC_ENERGIA_MES - NPC_OVERLOAD_TH ? (f.meses_sobrecarregado || 0) + 1 : 0,
      });
    } else {
      tx.update(opRef, { status: 'concluido', valor_recebido: recebe, executor: modo === 'servico_delegar' ? (f.nome || 'Equipe') : 'Você' });
    }

    return { ok: true, recebe, valor, oportunidade: op, executor: f ? (f.nome || 'Equipe') : null };
  });
});

exports.calcularRecebimento = calcularRecebimento;
