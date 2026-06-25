'use strict';

/**
 * PROCESSAR ACÓRDÃO — Advocatus Online (motor jurídico v8, colegiado)
 * Callable: chamado pelo frontend ao final da sustentação recursal
 * (2 rodadas concluídas).
 *
 * SEGURANÇA: esta função RECALCULA o resultado do julgamento colegiado
 * do ZERO, a partir de:
 *   - `colegiado_recurso` (composição sorteada: nomes/classes/sensibilidade
 *     individual, persistida no Firestore assim que decidida na preparação)
 *   - `estrategias_recurso` (até 2 estratégias escolhidas na preparação)
 *   - `historico_respostas_recurso` (qual tipo de resposta foi escolhido
 *     em cada uma das 2 rodadas de sustentação)
 *
 * Nunca confia em SCORES_JULGADOR ou em qualquer score calculado no
 * navegador — esses só existem para exibição otimista da UI.
 */



const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');
const banco = require('./shared/banco_juridico.js');

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
const CARGO_IDX_CONCLUSAO_MIN = 2; // jnr

// ── AUTORIZAÇÃO — mesma lógica de functions/processar_sentenca.js
// (ver comentário lá para o histórico do bug que isto corrige: casos do
// pool têm advogado_uid null por design, então a checagem antiga
// rejeitava com 403 todo recurso/acórdão de caso colaborativo).
async function autorizadoParaProcessar(db, p, uid, j) {
  if (p.advogado_uid === uid) return true;

  if (p.pool_escritorio_id) {
    const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
    if (escId !== p.pool_escritorio_id) return false;
    const cargoIdx = CARGO_IDX[j.cargo_id] ?? -1;
    return cargoIdx >= CARGO_IDX_CONCLUSAO_MIN;
  }

  return false;
}

// ── TABELA DE CATEGORIA POR PLACAR — idêntica à do motor v8.
function categoriaPorPlacar(votosReformar, votosManter, totalVotos) {
  if (votosManter > votosReformar) return 'mantem';
  const goleada = totalVotos === 3 ? votosReformar === 3 : votosReformar >= 4;
  return goleada ? 'reforma_total' : 'reforma_parcial';
}
function acessoProximaInstanciaTravado(votosFavorRecorrente, totalVotos) {
  if (totalVotos === 3) return votosFavorRecorrente === 0;
  return votosFavorRecorrente <= 1;
}

// ── RECÁLCULO DOS VOTOS — reproduz exatamente a mesma fórmula do
// frontend (responderRecursoProducao), mas a partir do colegiado e do
// histórico persistidos no Firestore, nunca de estado de memória do cliente.
function recalcularVotos(p) {
  const quemRecorre = p.quem_recorre;
  const colegiado = p.colegiado_recurso || [];
  const estrategiasEscolhidas = p.estrategias_recurso || [];
  const historico = p.historico_respostas_recurso || [];
  const ARGS_COMPLETO = banco.argsRecursoPara(quemRecorre);
  const idx = p.args_recurso_indices || [0, 1];
  const ARGS = idx.map(i => ARGS_COMPLETO[i]);
  const ESTRATEGIAS = banco.estrategiasRecursoPara(quemRecorre);

  const scores = colegiado.map(jz => ({ ...jz, score: jz.score_inicial }));

  for (const { rodada, tipo } of historico) {
    const a = ARGS[rodada];
    if (!a) continue;
    const euSouDefesa = quemRecorre === 'parte_contraria';
    const sinal = euSouDefesa ? -1 : 1;
    const baseD = (tipo === a.ideal ? 7 : tipo === a.neutro ? 1 : -10) * sinal;
    // ── TEMA DO ARGUMENTO — antes hardcoded por posição de rodada
    // (rodada 0 = sempre 'prova_documental', rodada 1 = sempre 'prazo'),
    // descolado do conteúdo real do argumento sorteado. Agora usa o
    // campo `a.tema`, presente em cada item de ARGS_RECURSO_DEFESA/
    // RECORRENTE (ver banco_juridico.js) — cobre os 7 temas reais já
    // existentes em PESO_TEMA_POR_CLASSE (prova_documental,
    // prova_pericial, jurisprudencia, precedente, materia_constitucional,
    // aspecto_processual, prazo). Fallback defensivo para argumentos
    // antigos/não migrados que ainda não tenham esse campo.
    const temaDaRodada = a.tema || (rodada === 0 ? 'prova_documental' : 'prazo');
    const temaDoTipo = tipo === 'agressiva' ? 'agressivo' : tipo === 'passiva' ? 'passivo' : null;

    scores.forEach(jz => {
      let d = baseD;
      if (tipo === 'tecnica') d += banco.pesoTemaPorClasse(temaDaRodada, jz.classe) * 0.5 * sinal;
      if (temaDoTipo) d += banco.pesoTemaPorClasse(temaDoTipo, jz.classe) * sinal;
      estrategiasEscolhidas.forEach(idx => {
        const est = ESTRATEGIAS[idx];
        if (est) d += banco.pesoTemaPorClasse(est.afeta, jz.classe) * 0.6 * sinal;
      });
      d *= (jz.sensibilidade || 1);
      jz.score = Math.max(5, Math.min(95, jz.score + d));
    });
  }
  return scores;
}

exports.processarAcordao = onCall(
  { region: 'southamerica-east1' },
  async (request) => {

    console.log("### VERSAO NOVA 24/06/2026 ###");
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
  if (p.status !== 'recurso_pendente') throw new HttpsError('failed-precondition', 'Processo não está em fase de recurso.');
  if (!p.colegiado_recurso || !p.colegiado_recurso.length) throw new HttpsError('failed-precondition', 'Colegiado ainda não foi sorteado.');

  const idx = p.args_recurso_indices || [0, 1];
  if ((p.historico_respostas_recurso || []).length < idx.length) {
    throw new HttpsError('failed-precondition', 'Sustentação recursal ainda não foi concluída.');
  }

  // ── Usa os scores já calculados na sustentação (visual === resultado).
  // Fallback para recalcularVotos() só se o documento for antigo e não
  // tiver esse campo (nunca deveria acontecer em processos novos).
  let scores;
  if (p.scores_apos_sustentacao && p.scores_apos_sustentacao.length) {
    scores = p.scores_apos_sustentacao;
  } else {
  scores = recalcularVotos(p);  }
  console.log("SCORES", scores);
  const totalVotos = scores.length;
  const votosReformar = scores.filter(s => s.score >= 50).length;
  const votosManter = totalVotos - votosReformar;
  console.log({  votosReformar,  votosManter,  totalVotos});
  const placar = votosManter > votosReformar ? `${votosManter} x ${votosReformar}` : `${votosReformar} x ${votosManter}`;
  const categoria = categoriaPorPlacar(votosReformar, votosManter, totalVotos);
  const vencedoresSaoReforma = votosReformar >= votosManter;
  const scoresVencedores = scores.filter(s => (s.score>=50)===vencedoresSaoReforma).map(s=>s.score);
  const novoScore = scoresVencedores.reduce((s,v)=>s+v,0) / scoresVencedores.length;

  const recorrenteEhJogador = p.quem_recorre === 'jogador';
  const cap = repCapDoCargo(j.cargo_id);
  const rep = j.reputacao || 30;

  let repDelta, txt, ico, cor;
  if (categoria === 'mantem') {
    ico = recorrenteEhJogador ? '📋' : '✅'; cor = recorrenteEhJogador ? '#e57373' : '#3aaa6a';
    txt = recorrenteEhJogador
      ? 'O tribunal negou provimento ao recurso — a sentença que te era desfavorável permanece de pé.'
      : 'O tribunal manteve a decisão recorrida — sua vitória na origem foi confirmada.';
    repDelta = recorrenteEhJogador ? -Math.round((100-novoScore)*0.15) : 2;
  } else if (categoria === 'reforma_parcial') {
    ico = '⚖️'; cor = '#ef9f27';
    txt = recorrenteEhJogador
      ? 'O tribunal deu parcial provimento ao seu recurso — parte da sentença desfavorável foi revertida a seu favor.'
      : 'O tribunal reformou parcialmente a decisão — parte da sua vitória na origem foi reduzida.';
    repDelta = recorrenteEhJogador ? 1 : -1;
  } else {
    ico = recorrenteEhJogador ? '🏆' : '❌'; cor = recorrenteEhJogador ? '#3aaa6a' : '#e57373';
    txt = recorrenteEhJogador
      ? 'O tribunal acolheu integralmente seu recurso — a sentença de origem foi revertida a seu favor.'
      : 'O tribunal reverteu integralmente a decisão de origem — sua vitória foi cassada.';
    repDelta = recorrenteEhJogador ? 2 : -2;
  }

  const xpGanho = banco.xpPorDecisao(p.instancia_seguinte, novoScore);
await jogadorRef.update({
  reputacao: Math.max(0, Math.min(cap, rep + repDelta)),
  xp: (j.xp||0) + xpGanho,
});

// ── ATUALIZA REPUTAÇÃO DO ESCRITÓRIO
const escritorioDoCaso = p.pool_escritorio_id || j.escritorio_proprio_id;
if (escritorioDoCaso) {
  const escRef = db.collection('escritorios').doc(escritorioDoCaso);
  const escSnap = await escRef.get();
  if (escSnap.exists) {
    const escCap = repCapDoCargo('escritorio'); // qual cap?
    const escRep = escSnap.data().reputacao || 0;
    await escRef.update({
      reputacao: Math.max(0, Math.min(escCap, escRep + repDelta)),
    });
  }
}

  const votosFavorQuemTentaSubir = categoria === 'mantem' ? votosReformar : votosManter;
  const travado = acessoProximaInstanciaTravado(votosFavorQuemTentaSubir, totalVotos);
  const ehTopo = p.instancia_seguinte === 'STF';
  const quemPerdeuAgora = categoria === 'mantem' ? p.quem_recorre : (p.quem_recorre === 'jogador' ? 'parte_contraria' : 'jogador');

  const jogadorGanhouEsteJulgamento = (categoria === 'mantem' && p.quem_recorre === 'parte_contraria')
    || (categoria !== 'mantem' && p.quem_recorre === 'jogador');

  const resposta = {
    placar, categoria, ico, cor, txt, repDelta, xpGanho,
    ehTopo, travado, parteContrariaRecorreu: false, transitouSemRecurso: false,
    podeRecorrer: false, proxTribunalNome: null, honCreditado: 0, honNoCaixa: false,
  };

  let transitouAgora = false;
  if (ehTopo || travado) {
    transitouAgora = true;
  } else {
    const proxTribunal = banco.tribunalRecursal(p, p.instancia_seguinte);
    resposta.proxTribunalNome = banco.PERFIL_TRIBUNAL[proxTribunal].nome;
    if (quemPerdeuAgora === 'parte_contraria') {
      const recorreContraria = banco.decidirRecurso(novoScore);
      if (recorreContraria) {
        const { dataDisponivel, prazoFinal } = banco.calcularPrazosRecurso(j.mes_pessoal||0, j.ano_pessoal||1);
        await processoRef.update({
          instancia_seguinte: proxTribunal,
          quem_recorre: 'parte_contraria',
          score_anterior: novoScore,
          data_disponivel_recurso: dataDisponivel,
          prazo_final_recurso: prazoFinal,
          colegiado_recurso: null,
          estrategias_recurso: null,
          historico_respostas_recurso: null,
        });
        resposta.parteContrariaRecorreu = true;
      } else {
        transitouAgora = true;
        resposta.transitouSemRecurso = true;
      }
    } else {
      resposta.podeRecorrer = true;
      // Persiste o score deste julgamento — necessário para
      // decidirProximaInstancia() calcular a base inicial do próximo
      // colegiado corretamente quando o jogador decidir recorrer.
      await processoRef.update({ score_anterior: novoScore });
    }
  }

  if (transitouAgora) {
    await processoRef.update({
      status: jogadorGanhouEsteJulgamento ? 'ganho' : 'perdido',
      encerrado_mes: mesTotalPessoal(j),
    });
    if (jogadorGanhouEsteJulgamento) {
      // hon_pendente só existe quando o jogador tinha GANHO a sentença
      // original e a parte contrária recorreu (a sentença já calculou o
      // honorário potencial naquele momento). Quando é o jogador quem
      // recorreu de uma DERROTA e venceu agora no tribunal, hon_pendente
      // nunca foi definido — esta é a primeira vitória real do processo,
      // então o honorário precisa ser calculado aqui, sobre o valor da
      // causa, usando a mesma taxa de sucumbência recursal (10%) usada
      // na sentença de 1ª instância (sem o componente de 30% de
      // contingência, que é específico de honorário contratual da
      // sentença original, não de recurso).
      const honAcordao = (p.hon_pendente > 0) ? p.hon_pendente : Math.floor((p.valor || 0) * 0.10);

      const escritorioDoCaso = p.pool_escritorio_id || j.escritorio_proprio_id;
      if (escritorioDoCaso) {
        const escRef = db.collection('escritorios').doc(escritorioDoCaso);
        const escSnap = await escRef.get();
        if (escSnap.exists) {
          await escRef.update({
            caixa: (escSnap.data().caixa||0) + honAcordao,
            faturamento_mes_atual: (escSnap.data().faturamento_mes_atual||0) + honAcordao,
          });
          resposta.honNoCaixa = true;
        }
      } else {
        await jogadorRef.update({
          dinheiro: (j.dinheiro||0) + honAcordao,
          honorarios_mes: (j.honorarios_mes||0) + honAcordao,
        });
      }
	resposta.honCreditado = honAcordao;
    }
    
    // ── INCREMENTA CONTADOR DE RECURSOS VENCIDOS
    if (jogadorGanhouEsteJulgamento && p.quem_recorre === 'jogador') {
      await jogadorRef.update({
        recursos_vencidos: (j.recursos_vencidos || 0) + 1,
      });
    }
  }
  return resposta;
});
// ════════════════════════════════════════════════════════
// DECIDIR PRÓXIMA INSTÂNCIA — callable leve, chamada quando é O JOGADOR
// quem decide se recorre (categoria='reforma' e ele perdeu este
// julgamento). Mantida no servidor (não no cliente) para que o roteamento
// de instância (qual tribunal vem a seguir) nunca seja escrito
// diretamente pelo navegador.
// ════════════════════════════════════════════════════════
exports.decidirProximaInstancia = onCall({ region: 'southamerica-east1' }, async (request) => {
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

  if (!recorrer) {
    await processoRef.update({ status: 'perdido', encerrado_mes: mesTotalPessoal(j) });
    return { msg: 'Decisão aceita. Processo encerrado — trânsito em julgado.' };
  }

  const proxTribunal = banco.tribunalRecursal(p, p.instancia_seguinte);
  const { dataDisponivel, prazoFinal } = banco.calcularPrazosRecurso(j.mes_pessoal||0, j.ano_pessoal||1);
  await processoRef.update({
    instancia_seguinte: proxTribunal,
    quem_recorre: 'jogador',
    data_disponivel_recurso: dataDisponivel,
    prazo_final_recurso: prazoFinal,
    colegiado_recurso: null,
    estrategias_recurso: null,
    historico_respostas_recurso: null,
  });
  return { msg: `Recurso protocolado. Acesse a carteira para sustentar no ${proxTribunal}.` };
});
