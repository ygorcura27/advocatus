'use strict';

/**
 * GDD v5.4 Parte VII — pipeline de aplicação de resultado, redesenhado
 * para idempotência real (2ª revisão crítica, fixes #1, #2, #5, #6).
 *
 * O QUE MUDOU EM RELAÇÃO À v5.3:
 *
 * A v5.3 marcava `resultado.efeitos_aplicados = true` numa transaction, e
 * SÓ DEPOIS aplicava os efeitos em estágios separados. Se o processo
 * caísse entre a transaction e o batch.commit(), o retry via
 * `efeitos_aplicados === true` e nunca aplicava nada — resultado
 * incompleto permanente.
 *
 * Agora cada etapa tem seu PRÓPRIO marcador, numa subcoleção
 * `/processos/{id}/efeitos_aplicados/{etapa}`, e o marcador só é escrito
 * DENTRO DA MESMA TRANSACTION que aplica os efeitos daquela etapa
 * especificamente. Isso significa: ou a etapa aplicou os efeitos E marcou
 * (transaction bem-sucedida), ou não aplicou nada E não marcou (transaction
 * falhou/não rodou) — nunca o meio-termo que causava o bug.
 *
 * FieldValue.increment() continua sendo usado (é atômico contra
 * concorrência), mas note a correção conceitual: increment() NÃO torna a
 * chamada idempotente contra retry — quem torna é o marcador da etapa
 * sendo checado ANTES de qualquer increment ser emitido, na mesma
 * transaction. Increment resolve "dois processos escrevendo ao mesmo
 * tempo"; o marcador resolve "o mesmo processo sendo re-executado".
 */

/**
 * [Correção P0.4 — 3ª revisão crítica] A versão anterior comparava
 * resolucao_id e, se fosse DIFERENTE do que já estava marcado, reaplicava
 * os efeitos e SOBRESCREVIA o marcador — ou seja, um processo com duas
 * resoluções (por bug de tick, retry indevido, etc.) tinha sua etapa
 * "economia" aplicada duas vezes, e a segunda apagava o rastro da
 * primeira. Isso é pior que não ter proteção nenhuma, porque parecia
 * seguro.
 *
 * Um processo não pode legitimamente ter duas resoluções finais sem um
 * mecanismo explícito de anulação/novo julgamento — que este sistema
 * ainda não tem. Então: resolucao_id diferente do marcado não reaplica,
 * LANÇA ERRO. Se/quando existir um mecanismo real de anulação, ele deve
 * limpar o marcador explicitamente antes de permitir nova resolução —
 * nunca deixar aplicarEtapa() inferir isso sozinho.
 */
async function aplicarEtapa(db, processoId, resolucaoId, etapa, executarEfeitos) {
  const marcadorRef = db.collection('processos').doc(processoId)
    .collection('efeitos_aplicados').doc(etapa);

  return db.runTransaction(async (tx) => {
    const marcador = await tx.get(marcadorRef);
    if (marcador.exists) {
      if (marcador.data().resolucao_id === resolucaoId) {
        return { etapa, jaAplicado: true };
      }
      throw new Error(
        `Conflito de resolução: etapa "${etapa}" do processo ${processoId} já foi ` +
        `aplicada para resolucao_id=${marcador.data().resolucao_id}, mas recebi ` +
        `resolucao_id=${resolucaoId}. Isso indica um processo tentando resolver duas ` +
        `vezes sem mecanismo de anulação — investigue a origem antes de prosseguir.`
      );
    }

    await executarEfeitos(tx);

    tx.set(marcadorRef, { resolucao_id: resolucaoId, aplicado_em: Date.now() });
    return { etapa, jaAplicado: false };
  });
}

async function aplicarEtapaEconomia(db, FieldValue, processoId, resultado, ctx) {
  return aplicarEtapa(db, processoId, resultado.resolucao_id, 'economia', async (tx) => {
    tx.update(ctx.perfilAutorRef, {
      fama: FieldValue.increment(ctx.deltaFamaAutor),
      xp: FieldValue.increment(ctx.deltaXpAutor),
      reputacao: FieldValue.increment(ctx.deltaReputacaoAutor),
    });
    tx.update(ctx.perfilReuRef, {
      fama: FieldValue.increment(ctx.deltaFamaReu),
      xp: FieldValue.increment(ctx.deltaXpReu),
      reputacao: FieldValue.increment(ctx.deltaReputacaoReu),
    });
    if (ctx.escritorioAutorRef) {
      tx.update(ctx.escritorioAutorRef, { caixa: FieldValue.increment(ctx.honorariosAutor || 0) });
    }
    if (ctx.escritorioReuRef) {
      tx.update(ctx.escritorioReuRef, { caixa: FieldValue.increment(ctx.honorariosReu || 0) });
    }
  });
}

/**
 * GDD v5.4 — correção #6: /confrontos ganha sua PRÓPRIA verificação de
 * idempotência, numa subcoleção de marcadores por par, checada e escrita
 * na mesma transaction que atualiza o placar. Sem isso, um retry duplicava
 * vitória no head-to-head mesmo com o restante do pipeline protegido.
 */
async function aplicarEtapaConfronto(db, { idPar, ladoNoConfronto }, processoId, resultado, ctx) {
  const parId = idPar(ctx.idAutor, ctx.idReu);
  const confrontoRef = db.collection('confrontos').doc(parId);
  const marcadorRef = confrontoRef.collection('resultados_aplicados').doc(resultado.resolucao_id);

  return db.runTransaction(async (tx) => {
    const marcador = await tx.get(marcadorRef);
    if (marcador.exists) {
      return { etapa: 'confronto', jaAplicado: true };
    }

    const doc = await tx.get(confrontoRef);
    const dados = doc.exists
      ? doc.data()
      : {
          a: menorId(ctx.idAutor, ctx.idReu),
          b: maiorId(ctx.idAutor, ctx.idReu),
          placar: { a: 0, b: 0, acordos: 0 },
          ultimos: [],
          rivalidade_declarada: false,
          bonus_psicologico: { lado: null },
        };

    const ladoVencedor =
      resultado.vencedor_confronto === 'empate'
        ? 'x'
        : ladoNoConfronto(dados, resultado.vencedor_confronto === 'autor' ? ctx.idAutor : ctx.idReu);

    const novosUltimos = [...dados.ultimos, ladoVencedor].slice(-5);
    const bonus = calcularBonusPsicologico(novosUltimos);

    const atualizacao = { ...dados, ultimos: novosUltimos, bonus_psicologico: bonus };
    if (ladoVencedor === 'x') atualizacao.placar = { ...dados.placar, acordos: dados.placar.acordos + 1 };
    else atualizacao.placar = { ...dados.placar, [ladoVencedor]: dados.placar[ladoVencedor] + 1 };

    tx.set(confrontoRef, atualizacao, { merge: true });
    tx.set(marcadorRef, { aplicado_em: Date.now() });

    return { etapa: 'confronto', jaAplicado: false };
  });
}

function menorId(id1, id2) { return Number(id1) < Number(id2) ? String(id1) : String(id2); }
function maiorId(id1, id2) { return Number(id1) < Number(id2) ? String(id2) : String(id1); }

function calcularBonusPsicologico(ultimos) {
  const ultimosTres = ultimos.slice(-3);
  if (ultimosTres.length === 3 && ultimosTres.every((x) => x === ultimosTres[0]) && ultimosTres[0] !== 'x') {
    return { lado: ultimosTres[0] };
  }
  return { lado: null };
}

/**
 * Orquestrador — chama as etapas em sequência. Etapas de memória
 * relacional, imprensa e verificação de malpractice seguem exatamente o
 * mesmo padrão de aplicarEtapa() (marcador por etapa, mesma transaction);
 * omitidas aqui por repetirem a estrutura já demonstrada em economia e
 * confronto, não por serem tratadas de forma diferente.
 *
 * Seguro para retry: se cair no meio, a próxima chamada re-executa só as
 * etapas cujo marcador não bate com resolucao_id — as já concluídas são
 * detectadas e puladas.
 */
async function aplicarResultadoCompleto(db, FieldValue, deps, processoId, resultado, ctx) {
  const resultados = [];
  resultados.push(await aplicarEtapaEconomia(db, FieldValue, processoId, resultado, ctx));
  resultados.push(await aplicarEtapaConfronto(db, deps, processoId, resultado, ctx));
  return resultados;
}

module.exports = {
  aplicarEtapa,
  aplicarEtapaEconomia,
  aplicarEtapaConfronto,
  aplicarResultadoCompleto,
};
