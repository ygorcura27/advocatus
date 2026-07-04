'use strict';

/**
 * IDENTIFICAÇÃO ÚNICA DE PERSONAGENS — Advocatus Online (GDD v5.1 §39-40)
 *
 * profile_id: 7 dígitos numéricos puros, sequencial a partir de 1000000.
 * Compartilhado entre jogadores e NPCs — IDs baixos identificam quem entrou
 * primeiro no servidor (efeito de status social, como no Popmundo).
 *
 * NUNCA usar FieldValue.increment() puro aqui — o valor precisa ser lido
 * e retornado atomicamente. Usa Firestore transaction.
 *
 * URL pública: advocatusonline.com/profile/{profile_id}
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger }       = require('firebase-functions');

const CONTADOR_DOC = 'personagens';
const ID_BASE      = 1000000;

/**
 * Gera o próximo profile_id único para um personagem (jogador ou NPC).
 * Retorna string de dígitos puros (ex: "1000042").
 */
async function gerarProximoProfileId(db) {
  const contadorRef = db.collection('contadores').doc(CONTADOR_DOC);

  const novoId = await db.runTransaction(async (t) => {
    const snap = await t.get(contadorRef);
    let atual;
    if (!snap.exists) {
      // Primeira execução — inicializa
      atual = ID_BASE;
      t.set(contadorRef, { proximo_id: atual + 1, criado_em: new Date().toISOString() });
    } else {
      atual = snap.data().proximo_id ?? ID_BASE;
      t.update(contadorRef, { proximo_id: atual + 1 });
    }
    return atual;
  });

  return String(novoId);
}

/**
 * Atribui profile_id a um jogador que ainda não possui um.
 * Idempotente — se já tiver, retorna o existente sem criar novo.
 */
async function atribuirProfileIdJogador(db, uid) {
  const jogRef  = db.collection('jogadores').doc(uid);
  const jogSnap = await jogRef.get();
  if (!jogSnap.exists) return null;

  const j = jogSnap.data();
  if (j.profile_id) return j.profile_id;

  const profileId = await gerarProximoProfileId(db);
  await jogRef.update({ profile_id: profileId });
  logger.info(`[PROFILE_ID] Jogador ${uid} recebeu profile_id ${profileId}`);
  return profileId;
}

/**
 * Atribui profile_id a um NPC que ainda não possui um.
 * @param {FirestoreDocumentReference} npcRef — referência ao documento do NPC
 * @param {object} npcData — dados atuais do NPC
 */
async function atribuirProfileIdNPC(db, npcRef, npcData) {
  if (npcData.profile_id) return npcData.profile_id;

  const profileId = await gerarProximoProfileId(db);
  await npcRef.update({ profile_id: profileId });
  return profileId;
}

/**
 * Busca um personagem (jogador ou NPC) pelo profile_id.
 * Retorna { tipo: 'jogador'|'npc', data, ref } ou null se não encontrado.
 */
async function buscarPorProfileId(db, profileId) {
  const str = String(profileId);

  // Tenta jogadores primeiro
  const jogSnap = await db.collection('jogadores')
    .where('profile_id', '==', str).limit(1).get();
  if (!jogSnap.empty) {
    return { tipo: 'jogador', data: jogSnap.docs[0].data(), ref: jogSnap.docs[0].ref };
  }

  // Tenta NPCs (tabela única de perfis)
  const npcSnap = await db.collection('perfis')
    .where('profile_id', '==', str).limit(1).get();
  if (!npcSnap.empty) {
    return { tipo: 'npc', data: npcSnap.docs[0].data(), ref: npcSnap.docs[0].ref };
  }

  return null;
}

// ─── Callable: buscarPerfil ───────────────────────────────────────────────────

/**
 * Busca dados públicos de um personagem pelo profile_id.
 * Rota: advocatusonline.com/profile/{profile_id}
 */
exports.buscarPerfil = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const { profile_id } = request.data || {};
  if (!profile_id) throw new HttpsError('invalid-argument', 'profile_id obrigatório.');

  const db     = getFirestore();
  const result = await buscarPorProfileId(db, String(profile_id));

  if (!result) throw new HttpsError('not-found', `Personagem ${profile_id} não encontrado.`);

  const d = result.data;
  // Retorna apenas campos públicos
  return {
    ok:             true,
    profile_id:     d.profile_id,
    tipo:           result.tipo,
    nome:           d.nome_personagem || d.nome || '—',
    cargo_id:       d.cargo_id || 'est',
    especialidade:  d.especialidade || null,
    escritorio_nome: d.escritorio_nome || null,
    reputacao:      d.reputacao || 0,
    fama_total:     d.fama || 0,
  };
});

module.exports = Object.assign(module.exports, {
  gerarProximoProfileId,
  atribuirProfileIdJogador,
  atribuirProfileIdNPC,
  buscarPorProfileId,
});
