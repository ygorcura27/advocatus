'use strict';

/**
 * PROCESSAR SENTENÇA — Advocatus Online (v2, motor jurídico v8)
 * Callable: chamado pelo frontend ao final da audiência de 1ª instância
 * (3 rodadas de sustentação oral concluídas).
 *
 * SEGURANÇA: esta função RECALCULA o convencimento do ZERO a partir de
 * `historico_respostas_audiencia` (registro bruto de qual tipo de resposta
 * o jogador escolheu em cada rodada), nunca confiando no campo
 * `convencimento` salvo no Firestore pelo cliente — esse campo é só
 * exibição otimista da UI e pode ter sido adulterado.
 *
 * Usa o banco jurídico compartilhado em functions/shared/banco_juridico.js
 * (mesmo conteúdo de js/shared/banco_juridico.js no frontend — ver aviso
 * de sincronização manual nesse módulo).
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

// ── RECÁLCULO DO CONVENCIMENTO — reproduz EXATAMENTE a mesma fórmula do
// frontend (ver responderAudiencia em processos.js), mas a partir do
// histórico bruto, nunca do valor já calculado e salvo pelo cliente.
function recalcularConvencimento(p) {
  const historico = p.historico_respostas_audiencia || [];
  let cv = p.dificuldade_extra ? 28 : 38;

  for (const { rodada, tipo } of historico) {
    const arg = p.args_audiencia[rodada];
    if (!arg) continue; // rodada inválida — ignora silenciosamente

    let d = tipo === arg.ideal ? 11 : tipo === arg.neutro ? 2 : -14;
    const perfilJuiz = p.juiz.perfil_oculto;
    if (perfilJuiz === 'formalista' && tipo === 'tecnica') d += 5;
    if (perfilJuiz === 'garantista' && tipo === 'agressiva') d += 5;
    if (perfilJuiz === 'conservador' && tipo === 'passiva') d -= 9;
    if (perfilJuiz === 'formalista' && tipo === 'agressiva') d -= 4;

    const provasSel = (p.provas_selecionadas || []).map(i => p.provas[i]).filter(Boolean);
    const fm = provasSel.length ? provasSel.reduce((s,pr) => s + (pr.forca || 60), 0) / provasSel.length : 60;
    if (fm >= 85 && tipo !== 'passiva') d += 5;
    else if (fm >= 65 && tipo !== 'passiva') d += 2;
    else if (fm < 50) d -= 4;
    else if (fm < 35) d -= 8;

    const tesesSel = p.teses_selecionadas || [];
    d += tesesSel.length * 2;
    if (tesesSel.length === 0) d -= 4;

    cv = Math.max(5, Math.min(95, cv + d));
  }
  return cv;
}

exports.processarSentenca = onCall({ region: 'southamerica-east1' }, async (request) => {
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

  if (p.advogado_uid !== uid) throw new HttpsError('permission-denied', 'Processo não é seu.');
  if (p.status !== 'andamento') throw new HttpsError('failed-precondition', 'Processo já encerrado ou em outra fase.');
  if ((p.rodada_audiencia || 0) < 3) throw new HttpsError('failed-precondition', 'Audiência ainda não foi concluída (3 rodadas).');

  // ── RECALCULA o score — esta é a única fonte de verdade do resultado.
  const score = recalcularConvencimento(p);
  const souReu = p.meu_lado === 'reu';
  const favoravelAoJogador = score >= 58;
  const mesAtual = j.mes_global_pessoal || mesTotalPessoal(j);
  const cap = repCapDoCargo(j.cargo_id);
  const rep = j.reputacao || 30;

  let categoria, repDelta, txt;
  if (score >= 80) {
    categoria = 'procedente';
    txt = souReu ? 'Pedido julgado totalmente IMPROCEDENTE — sua defesa prevaleceu integralmente.' : 'Pedido julgado totalmente PROCEDENTE.';
    repDelta = Math.max(1, Math.floor((cap - rep) * 0.08));
  } else if (score >= 58) {
    categoria = 'parcial';
    txt = 'Pedido julgado PARCIALMENTE PROCEDENTE.';
    repDelta = Math.max(1, Math.floor((cap - rep) * 0.05));
  } else if (score >= 38) {
    categoria = 'improcedente';
    txt = souReu ? 'Pedido julgado PROCEDENTE contra a defesa.' : 'Pedido julgado IMPROCEDENTE.';
    repDelta = -Math.max(1, Math.floor(rep * 0.05));
  } else {
    categoria = 'improcedente_agravada';
    txt = souReu ? 'Pedido julgado totalmente PROCEDENTE contra a defesa, com condenação agravada.' : 'Pedido julgado IMPROCEDENTE, com condenação em honorários.';
    repDelta = -Math.max(1, Math.floor(rep * 0.08));
  }

  const xpGanho = banco.xpPorDecisao('1grau', score);

  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const suc = Math.floor(p.valor * 0.10);
  const honPotencial = favoravelAoJogador ? (isSolo ? Math.floor(p.valor * 0.30 + suc) : Math.floor(suc * 0.10)) : 0;

  const dc = (j.derrotas_consecutivas || 0) + 1;
  const demitido = !favoravelAoJogador && dc >= 5 && j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo' && !j.escritorio_proprio_id;

  const updatesJogador = {
    reputacao: Math.max(0, Math.min(cap, rep + repDelta)),
    xp: (j.xp || 0) + xpGanho,
    derrotas_consecutivas: favoravelAoJogador ? 0 : dc,
  };
  if (favoravelAoJogador) { updatesJogador.wins = (j.wins||0)+1; updatesJogador.wins_ano = (j.wins_ano||0)+1; }
  else { updatesJogador.losses = (j.losses||0)+1; updatesJogador.losses_ano = (j.losses_ano||0)+1; }
  if (demitido) {
    updatesJogador.escritorio_id = 'solo';
    updatesJogador.escritorio_empregado_id = null;
    updatesJogador.escritorio_nome = null;
    updatesJogador.derrotas_consecutivas = 0;
  }
  await jogadorRef.update(updatesJogador);

  const recorre = banco.decidirRecurso(favoravelAoJogador ? score : 100 - score);

  if (recorre) {
    const { dataDisponivel, prazoFinal } = banco.calcularPrazosRecurso(j.mes_pessoal||0, j.ano_pessoal||1);
    const quemRecorre = favoravelAoJogador ? 'parte_contraria' : 'jogador';
    await processoRef.update({
      status: 'recurso_pendente',
      instancia_atual: '1grau',
      quem_recorre: quemRecorre,
      score_anterior: score,
      hon_pendente: honPotencial,
      data_disponivel_recurso: dataDisponivel,
      prazo_final_recurso: prazoFinal,
      encerrado_mes: null,
      convencimento: score, // sincroniza o valor real recalculado de volta
    });
    return { categoria, txt, repDelta, xpGanho, recorre: true, instanciaSeguinte: p.instancia_seguinte, demitido };
  } else {
    if (favoravelAoJogador && honPotencial > 0) {
      if (j.escritorio_proprio_id) {
        const escRef = db.collection('escritorios').doc(j.escritorio_proprio_id);
        const escSnap = await escRef.get();
        if (escSnap.exists) await escRef.update({ caixa: (escSnap.data().caixa||0) + honPotencial });
      } else {
        await jogadorRef.update({
          dinheiro: (updatesJogador.dinheiro ?? j.dinheiro ?? 0) + honPotencial,
          honorarios_mes: (j.honorarios_mes||0) + honPotencial,
        });
      }
    }
    await processoRef.update({
      status: favoravelAoJogador ? 'ganho' : 'perdido',
      encerrado_mes: mesAtual,
      hon_total_acumulado: favoravelAoJogador ? honPotencial : 0,
      convencimento: score,
    });
    if (j.escritorio_proprio_id && !favoravelAoJogador) {
      try {
        const escRef = db.collection('escritorios').doc(j.escritorio_proprio_id);
        const escSnap = await escRef.get();
        if (escSnap.exists) {
          const escRep = escSnap.data().prestigio || 10;
          await escRef.update({ prestigio: Math.max(0, escRep - Math.ceil(Math.abs(repDelta) * 0.5)) });
        }
      } catch (e) { logger.warn('Penalidade rep escritório falhou:', e); }
    }
    return { categoria, txt, repDelta, xpGanho, recorre: false, hon: honPotencial, demitido };
  }
});
