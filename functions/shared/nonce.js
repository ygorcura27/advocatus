'use strict';

/**
 * GDD — correção P1.7 (nonce end-to-end).
 *
 * PROBLEMA: callables sensíveis (financeiro, composição de peças, etc.) não
 * tinham proteção contra reenvio do mesmo clique/ação — um duplo-clique ou
 * um retry de rede podia executar o efeito (crédito de dinheiro, contratação
 * de linha de crédito, etc.) mais de uma vez para a mesma intenção do jogador.
 *
 * CORREÇÃO: o cliente gera um nonce (UUID) por tentativa de ação e o envia
 * junto do payload. O servidor reivindica /nonces_usados/{uid}_{nonce}
 * atomicamente ANTES de rodar o efeito — mesmo princípio já estabelecido
 * para os efeitos externos de NPC (identidade do efeito verificada na mesma
 * transaction que o produz). Um segundo envio do mesmo nonce não roda o
 * efeito de novo; devolve o resultado já persistido da primeira execução.
 *
 * Claim órfão (crash do processo que reivindicou mas não concluiu) é
 * reivindicado de novo após NONCE_STALE_MS — mesma correção aplicada em
 * functions/npc/vincularEscritorioNPC.js após o incidente em produção.
 */

const NONCE_STALE_MS = 30000;

function nonceRef(db, uid, nonce) {
  return db.collection('nonces_usados').doc(`${uid}_${nonce}`);
}

/**
 * Executa `efeito` no máximo uma vez por (uid, nonce). Retries com o mesmo
 * nonce devolvem o resultado já persistido em vez de rodar o efeito de novo.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ uid: string, nonce: string, acao: string }} params
 * @param {() => Promise<any>} efeito - só roda se vencer o claim do nonce
 * @returns {Promise<any>} resultado de `efeito()` (novo ou de uma execução anterior)
 */
async function comIdempotencia(db, { uid, nonce, acao }, efeito) {
  if (!uid)   throw new Error(`comIdempotencia: uid obrigatório (ação "${acao}")`);
  if (!nonce) throw new Error(`comIdempotencia: nonce obrigatório (ação "${acao}") — reenvios sem nonce não são protegidos contra duplicação`);

  const ref = nonceRef(db, uid, nonce);

  const snapRapido = await ref.get();
  if (snapRapido.exists && snapRapido.data().status === 'completed') {
    return snapRapido.data().resultado;
  }

  const venceu = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      tx.set(ref, { uid, acao, nonce, status: 'processando', em: Date.now() });
      return true;
    }
    const dados = doc.data();
    if (dados.status === 'completed') return 'completed';
    if (dados.status === 'processando' && (Date.now() - dados.em) > NONCE_STALE_MS) {
      tx.update(ref, { em: Date.now() }); // claim órfão — renova a posse
      return true;
    }
    return false; // outra execução tem o claim e ainda está dentro do prazo
  });

  if (venceu === 'completed') {
    const final = await ref.get();
    return final.data().resultado;
  }

  if (venceu === false) {
    throw new Error(
      `comIdempotencia: a ação "${acao}" (nonce=${nonce}) já está em processamento. Aguarde a resposta original em vez de reenviar.`,
    );
  }

  const resultado = await efeito();

  await ref.set({
    status: 'completed',
    resultado,
    concluido_em: Date.now(),
  }, { merge: true });

  return resultado;
}

module.exports = { comIdempotencia, NONCE_STALE_MS };
