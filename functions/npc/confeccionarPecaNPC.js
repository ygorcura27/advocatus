'use strict';

/**
 * Adapter de confecção de petição para NPCs — ponte entre o módulo de seed
 * (functions/npc/seedCatalogoInicial.js, contrato síncrono: 1 chamada, doc
 * já existe em /peticoes ao retornar) e o fluxo REAL de 2 fases do jogo
 * (functions/peticoes.js: compõe agora em 'em_composicao', finaliza
 * (nota_teto) só no tick seguinte).
 *
 * A "sincronicidade" exigida pelo seed é apenas "o doc existe em
 * /peticoes/{id_determinista} ao retornar" — não exige nota_teto calculado
 * na hora. Isso é compatível com o fluxo real: escrevemos o doc já em
 * 'em_composicao' (satisfaz validarCoberturaCatalogo) e a finalização
 * (cálculo de nota_teto via calcularNotaTeto) roda no tick seguinte,
 * reaproveitando peticoes.js:finalizarPeticoesPendentes() sem duplicar a
 * fórmula de pontuação.
 */

const { getFirestore } = require('firebase-admin/firestore');
const { finalizarPeticoesPendentes } = require('../peticoes');
const { tickAtualFn } = require('./tickAdapter');

/**
 * ADAPTER exigido por seedCatalogoInicial.js. Grava a petição no schema
 * real (jogador_uid/document_type/practice_area — não tipo_peticao/ramo_direito,
 * que são só o vocabulário interno do módulo de seed).
 */
async function confeccionarPecaSincronaNPC({
  db, id_determinista, autor_uid, tipo_peticao, ramo_direito, estilo_escrita, tese_central,
}) {
  const tick = await tickAtualFn(db);
  const nome = `NPC ${tipo_peticao} — ${ramo_direito} — ${estilo_escrita}`;

  const novaPeticao = {
    jogador_uid:       autor_uid, // profile_id do NPC — perfis, não jogadores
    autor_npc:         true,      // sinaliza que jogador_uid aponta para /perfis, não /jogadores
    autores:           [{ uid: autor_uid, contribuicao_pct: 100 }],
    titulo:            nome,
    nome,
    titulo_travado:    false,
    document_type:     tipo_peticao,
    practice_area:     ramo_direito,
    estilo_escrita,
    tese_central:      tese_central || null,
    geracao:           1,
    peticao_base_id:   null,
    nota_teto:         null,
    nota_argumentacao: null,
    nota_redacao:      null,
    tier_argumentacao: null,
    tier_redacao:      null,
    fama:              0,
    fama_teto_desbloqueado: 39,
    popularidade:      0,
    decaimento_ativo:  false,
    usos_total:        0,
    vitorias:          0,
    derrotas:          0,
    vitorias_por_instancia: {},
    ultimo_uso:        null,
    processos_usada:   [],
    status:            'em_composicao',
    mes_conclusao:     tick + 1,
    criada_em:         new Date().toISOString(),
    generica:          false,
  };

  const ref = db.collection('peticoes').doc(id_determinista);
  await ref.set(novaPeticao);
  return { id: id_determinista, ...novaPeticao };
}

/**
 * Finaliza petições de NPC pendentes de nota_teto (mes_conclusao <= tick
 * atual). Reaproveita peticoes.js:finalizarPeticoesPendentes() — mesma
 * fórmula de pontuação usada para jogadores (calcularNotaTeto), só troca o
 * "jogador" por um objeto derivado do perfil do NPC (skills, saude_mental).
 * Chamada 1x por tick a partir de functions/tick_mensal.js.
 */
async function finalizarPeticoesNPCPendentes(db, mesGlobal) {
  const snap = await db
    .collection('perfis')
    .where('tipo', '==', 'npc')
    .where('sistema.inicializacao', '==', 'ready')
    .get();

  const resultado = [];
  for (const doc of snap.docs) {
    const npc = doc.data();
    const npcComoJogador = {
      skills_jur: npc.skills, // chaves alinhadas com defaultSkillsJur (ver npc/geradores.js)
      saude_mental: npc.saude_mental,
      em_burnout: false,
    };
    const finalizadas = await finalizarPeticoesPendentes(db, npc.profile_id, npcComoJogador, mesGlobal);
    if (finalizadas.length > 0) resultado.push({ profile_id: npc.profile_id, finalizadas });
  }
  return resultado;
}

module.exports = { confeccionarPecaSincronaNPC, finalizarPeticoesNPCPendentes };
