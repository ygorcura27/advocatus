'use strict';

/**
 * Gerador de ID único sequencial para personagens (jogadores e NPCs).
 *
 * Este é o MESMO padrão que você já tem implementado (GDD v5.1 Parte XI,
 * contadores.js): transaction explícita, nunca FieldValue.increment() puro,
 * porque increment() não devolve o valor lido — a transação com leitura
 * explícita é necessária para saber exatamente qual número foi consumido.
 *
 * Incluído aqui só para este módulo de seed ser importável de forma
 * independente. Se preferir, APAGUE este arquivo e troque o import em
 * seedAdvogadosNPC.js (`require('../utils/ids')`) para apontar direto pro
 * seu contadores.js original — o comportamento é idêntico.
 */
async function gerarProximoId(db) {
  const contadorRef = db.collection('contadores').doc('personagens');

  const novoId = await db.runTransaction(async (t) => {
    const doc = await t.get(contadorRef);
    if (!doc.exists) {
      throw new Error(
        'gerarProximoId: /contadores/personagens não existe — inicialize com ' +
        '{ proximo_id: <base> } antes do primeiro uso.'
      );
    }
    const atual = doc.data().proximo_id;
    if (!Number.isSafeInteger(atual) || atual < 0) {
      throw new Error(`gerarProximoId: proximo_id corrompido ou inválido: ${atual}`);
    }
    t.update(contadorRef, { proximo_id: atual + 1 });
    return atual;
  });

  return novoId.toString();
}

module.exports = { gerarProximoId };
