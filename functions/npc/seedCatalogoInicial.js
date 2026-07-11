'use strict';

/**
 * GDD v5.10 §11 — correção P1.1 da auditoria v5.9.
 *
 * O claim em /peticoes_claims/{idPeca} é uma state machine com dois estados:
 *
 *   creating  — claim ativo, peça ainda não confirmada no Firestore.
 *   completed — peça confirmada existente; pode pular com segurança.
 *
 * Regra de transição no retry:
 *   peça existe no Firestore           → pular (concluído; marca claim se necessário)
 *   claim.status === 'completed'       → pular
 *   claim.status === 'creating'        → RETOMAR (re-executar confecção com idPeca)
 *   claim ausente                      → tentar reivindicar atomicamente
 *
 * validarCoberturaCatalogo() é usada por materializarNPC() como barreira
 * final antes de gravar `sistema.inicializacao = 'ready'`. Garante a
 * invariante: toda área × tipo essencial deve ter peça no Firestore.
 *
 * ADAPTER OBRIGATÓRIO: este módulo assume uma função
 * `confeccionarPecaSincrona()` que recebe `id_determinista` e usa exatamente
 * esse ID como doc ID em /peticoes.
 *
 * TIPOS_PETICAO_ESSENCIAIS usa o vocabulário real do jogo (functions/peticoes.js
 * document_type e functions/skills.js area_* — 'corporate', não 'empresarial').
 * O sistema real não distingue document_type por área — todo ramo usa o mesmo
 * enum genérico (initial_filing, responsive_pleading, motion, ...). Por isso
 * cada área essencial usa o mesmo par [initial_filing, responsive_pleading].
 */

const TIPOS_PETICAO_ESSENCIAIS = Object.freeze({
  civil: ['initial_filing', 'responsive_pleading'],
  employment: ['initial_filing', 'responsive_pleading'],
  corporate: ['initial_filing', 'responsive_pleading'],
  tax: ['initial_filing', 'responsive_pleading'],
  criminal: ['initial_filing', 'responsive_pleading'],
});

/**
 * Determina o estado atual de uma peça essencial a partir das leituras de
 * claim e peça no Firestore.
 *
 * Retorna um dos seguintes:
 *   'done'    — peça existe ou claim está completed; não confeccionar.
 *   'retomar' — claim existe no estado creating; retomar confecção com mesmo idPeca.
 *   'claim'   — nem claim nem peça existem; tentar reivindicar.
 */
function _estadoAtual(claimDoc, pecaDoc) {
  if (pecaDoc && pecaDoc.exists) return 'done';

  if (claimDoc && claimDoc.exists) {
    const status = claimDoc.data().status;
    if (!status || status === 'creating') return 'retomar';
    if (status === 'completed') return 'done';
  }

  return 'claim';
}

async function seedCatalogoInicial({
  db,
  profileId,
  areas,
  skills,
  confeccionarPecaSincrona,
  poolTeses,
  escolherEstiloNPCInicial,
  pecaJaExiste = null, // opcional: override da checagem (usado em testes).
}) {
  const criadas = [];

  for (const area of areas) {
    const tipos = TIPOS_PETICAO_ESSENCIAIS[area] || [];
    for (const tipo of tipos) {
      const idPeca = idPecaEssencial(profileId, area, tipo);
      const claimRef = db.collection('peticoes_claims').doc(idPeca);
      const pecaRef  = db.collection('peticoes').doc(idPeca);

      const [claimSnap, pecaSnap] = await Promise.all([
        claimRef.get(),
        pecaRef.get(),
      ]);

      const pecaExisteExternamente = pecaJaExiste
        ? await pecaJaExiste(profileId, area, tipo)
        : pecaSnap.exists;

      const estadoRapido = _estadoAtual(
        claimSnap,
        pecaExisteExternamente ? { exists: true } : pecaSnap,
      );

      if (estadoRapido === 'done') {
        if (claimSnap && claimSnap.exists && claimSnap.data().status !== 'completed') {
          await db.runTransaction(async (tx) => {
            const claim = await tx.get(claimRef);
            if (claim.exists && claim.data().status !== 'completed') {
              tx.update(claimRef, { status: 'completed', concluido_em: Date.now() });
            }
          });
        }
        continue;
      }

      const teses = poolTeses[area] || [];
      if (teses.length === 0) {
        throw new Error(
          `seedCatalogoInicial: sem teses em poolTeses["${area}"] para a peça ` +
          `"${tipo}" do NPC ${profileId}. Cobertura mínima não pode ser cumprida — ` +
          `NPC permanece 'creating'. Confirme poolTeses antes de reprocessar.`,
        );
      }

      const acao = await db.runTransaction(async (tx) => {
        const claim = await tx.get(claimRef);
        const peca  = await tx.get(pecaRef);

        if (peca.exists) {
          if (claim.exists && claim.data().status !== 'completed') {
            tx.update(claimRef, { status: 'completed', concluido_em: Date.now() });
          }
          return 'done';
        }

        if (claim.exists) {
          const status = claim.data().status;
          if (!status || status === 'creating') return 'retomar';
          if (status === 'completed') return 'done';
        }

        tx.set(claimRef, {
          id_peca: idPeca,
          profile_id: profileId,
          status: 'creating',
          em: Date.now(),
        });
        return 'confeccionar';
      });

      if (acao === 'done') continue;

      const tese = teses[Math.floor(Math.random() * teses.length)];
      const peca = await confeccionarPecaSincrona({
        db,
        id_determinista: idPeca,
        autor_uid: profileId,
        tipo_peticao: tipo,
        ramo_direito: area,
        estilo_escrita: escolherEstiloNPCInicial(skills),
        tese_central: tese,
        autores: [{ uid: profileId, proporcao: 1.0, papel: 'lider' }],
      });
      criadas.push(peca);

      await db.runTransaction(async (tx) => {
        const pecaConfirmada = await tx.get(pecaRef);
        if (!pecaConfirmada.exists) {
          throw new Error(
            `seedCatalogoInicial: adapter não persistiu a peça com id_determinista="${idPeca}". ` +
            `Verifique se confeccionarPecaSincrona usa obrigatoriamente id_determinista como doc ID em /peticoes.`,
          );
        }
        tx.set(claimRef, {
          id_peca: idPeca,
          profile_id: profileId,
          status: 'completed',
          concluido_em: Date.now(),
        }, { merge: true });
      });
    }
  }

  return criadas;
}

/**
 * Valida que todas as peças essenciais de um NPC existem no Firestore.
 * Deve ser chamada por materializarNPC() ANTES de gravar `sistema.inicializacao = 'ready'`.
 */
async function validarCoberturaCatalogo(db, profileId, areas) {
  const faltando = [];

  for (const area of areas) {
    const tipos = TIPOS_PETICAO_ESSENCIAIS[area] || [];
    for (const tipo of tipos) {
      const idPeca = idPecaEssencial(profileId, area, tipo);
      const snap = await db.collection('peticoes').doc(idPeca).get();
      if (!snap.exists) {
        faltando.push({ area, tipo, idPeca });
      }
    }
  }

  if (faltando.length > 0) {
    const lista = faltando.map((f) => `${f.area}/${f.tipo} (${f.idPeca})`).join(', ');
    throw new Error(
      `validarCoberturaCatalogo: NPC ${profileId} não pode ser marcado ready — ` +
      `peças essenciais ausentes no Firestore: ${lista}. ` +
      `Reprocesse via materializarNPC() para completar o catálogo.`,
    );
  }
}

function idPecaEssencial(profileId, area, tipo) {
  return `npc_${profileId}_${area}_${tipo}`;
}

module.exports = {
  seedCatalogoInicial,
  validarCoberturaCatalogo,
  TIPOS_PETICAO_ESSENCIAIS,
  idPecaEssencial,
};
