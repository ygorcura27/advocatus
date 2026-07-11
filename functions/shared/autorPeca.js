'use strict';

/**
 * GDD — canonicalização de profile_id (P2.x).
 *
 * peticoes.jogador_uid guarda dois espaços de identidade diferentes com o
 * mesmo nome de campo: UID real do Firebase Auth para petições de jogador,
 * profile_id de NPC (functions/npc/confeccionarPecaNPC.js) para petições de
 * NPC — diferenciados só pelo campo `autor_npc`. Ler esse campo assumindo
 * sempre /jogadores/{uid} falha silenciosamente pra petição de NPC (doc não
 * existe) e produz nome genérico/errado em vez do nome real do NPC.
 */
async function nomeAutorPeca(db, peticao) {
  if (!peticao || !peticao.jogador_uid) return 'Advogado';
  try {
    if (peticao.autor_npc) {
      const snap = await db.collection('perfis').doc(peticao.jogador_uid).get();
      return snap.exists ? (snap.data().nome || 'Advogado') : 'Advogado';
    }
    const snap = await db.collection('jogadores').doc(peticao.jogador_uid).get();
    return snap.exists ? (snap.data().nome_personagem || snap.data().nome || 'Advogado') : 'Advogado';
  } catch {
    return 'Advogado';
  }
}

module.exports = { nomeAutorPeca };
