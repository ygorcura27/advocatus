'use strict';

/**
 * PROCESSAR SENTENÇA — Advocatus Online
 * Callable: chama quando progresso atinge 100%.
 * Deduz energia do jogador + aplica ganho/perda de rep com fórmula equilibrada.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

const SUCES_PCT = { 1:0.10, 2:0.10, 3:0.05, 4:0.05 };

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

const CARGO_INSTANCIA = {
  2: ['pln','snr','asc','soc','snm','jtit','dsb','mstj','prom','pjus','pgj','def','dch','dge'],
  3: ['snr','asc','soc','snm','dsb','mstj','pjus','pgj','dch','dge'],
  4: ['snr','asc','soc','snm','dsb','mstj','pjus','pgj','dch','dge'],
};

function podeFazerInstancia(cargoId, instancia) {
  if (instancia <= 1) return true;
  return (CARGO_INSTANCIA[instancia] || []).includes(cargoId);
}

function calcHonorarios(p, instancia, isSolo) {
  const pct         = SUCES_PCT[instancia] || 0.10;
  const sucumbencia = Math.floor(p.valor * pct);
  if (isSolo) {
    const contingencia = instancia === 1 ? Math.floor(p.valor * 0.30) : 0;
    return contingencia + sucumbencia;
  }
  return Math.floor(sucumbencia * 0.10);
}

// Rep por vitória: decrescente conforme se aproxima do cap
function calcGanhoRep(repAtual, cap) {
  return Math.max(1, Math.floor((cap - repAtual) * 0.08));
}
// Rep por derrota: proporcional ao que tem
function calcPerdaRep(repAtual) {
  return Math.max(1, Math.floor(repAtual * 0.04));
}

exports.processarSentenca = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid        = request.auth.uid;
  const { processo_id } = request.data;
  if (!processo_id) throw new HttpsError('invalid-argument', 'processo_id obrigatório.');

  const db          = getFirestore();
  const processoRef = db.collection('processos').doc(processo_id);
  const jogadorRef  = db.collection('jogadores').doc(uid);

  const [processoSnap, jogadorSnap, serverSnap] = await Promise.all([
    processoRef.get(), jogadorRef.get(),
    db.collection('config').doc('server').get(),
  ]);

  if (!processoSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogadorSnap.exists)  throw new HttpsError('not-found', 'Jogador não encontrado.');

  const p  = processoSnap.data();
  const j  = jogadorSnap.data();
  const s  = serverSnap.exists ? serverSnap.data() : {};

  if (p.advogado_uid !== uid) throw new HttpsError('permission-denied', 'Processo não é seu.');
  if (p.status !== 'andamento') throw new HttpsError('failed-precondition', 'Processo já encerrado.');
  if ((p.progresso || 0) < 100) throw new HttpsError('failed-precondition', 'Progresso insuficiente.');

  const instancia   = p.instancia || 1;
  const cs          = p.chance_sucesso || 50;
  const isSolo      = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const isAdmin     = p.tipo_processo === 'administrativo';
  const reuEhEstado = p.reu_eh_estado === true;
  const mesAtual    = j.mes_global_pessoal || s.mes_global || 1;
  const cap         = REP_CAP[j.cargo_id] || 55;
  const rep         = j.reputacao || 30;

  const roll   = Math.random() * 100;
  const ganhou = roll < cs;
  const hon    = calcHonorarios(p, instancia, isSolo);
  const honTotal = (p.hon_total_acumulado || 0) + (ganhou ? hon : 0);

  const processoUpdates = {
    hon_total_acumulado: honTotal,
    resultado_instancia: ganhou ? 'ganho' : 'perdido',
    processado_mes:      mesAtual,
  };
  const jogadorUpdates = {};
  let resposta = {};

  if (ganhou) {
    const ganhoRep = calcGanhoRep(rep, cap);
    jogadorUpdates.dinheiro    = (j.dinheiro || 0) + hon;
    jogadorUpdates.wins        = (j.wins    || 0) + 1;
    jogadorUpdates.wins_ano    = (j.wins_ano || 0) + 1;
    jogadorUpdates.reputacao   = Math.min(cap, rep + ganhoRep);
    jogadorUpdates.derrotas_consecutivas = 0;

    const estadoNaoPodeRecorrer = isAdmin && reuEhEstado;
    const partePodeRecorrer     = !estadoNaoPodeRecorrer && instancia < 4;
    const parteRecorre          = partePodeRecorrer && cs < 70 && Math.random() < 0.55;

    if (parteRecorre) {
      const novaInst = instancia + 1;
      if (!podeFazerInstancia(j.cargo_id, novaInst)) {
        processoUpdates.status        = 'encerrado_cargo';
        processoUpdates.encerrado_mes = mesAtual;
        await processoRef.update(processoUpdates);
        await jogadorRef.update(jogadorUpdates);
        resposta = { resultado:'ganho_encerrado_cargo', hon, honTotal,
          msg:`Vitória! Mas ${p.reu} recorreu e seu cargo não permite atuar nessa instância.` };
      } else {
        processoUpdates.instancia        = novaInst;
        processoUpdates.progresso        = 0;
        processoUpdates.recurso_pendente = false;
        processoUpdates.status           = 'andamento';
        await processoRef.update(processoUpdates);
        await jogadorRef.update(jogadorUpdates);
        resposta = { resultado:'ganho_continua', hon, honTotal, novaInstancia:novaInst,
          msg:`✅ Vitória! +${fmt(hon)} honorários. ${p.reu} recorreu.` };
      }
    } else {
      processoUpdates.status        = 'ganho';
      processoUpdates.encerrado_mes = mesAtual;
      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);
      resposta = { resultado:'ganho_definitivo', hon, honTotal, transitoJulgado:true, estadoNaoPodeRecorrer,
        msg:`🏆 Vitória definitiva! Total: ${fmt(honTotal)}. +${ganhoRep} rep.` };
    }
  } else {
    const perdaRep = calcPerdaRep(rep);
    jogadorUpdates.losses    = (j.losses    || 0) + 1;
    jogadorUpdates.losses_ano = (j.losses_ano || 0) + 1;
    jogadorUpdates.reputacao = Math.max(0, rep - perdaRep);
    const dc = (j.derrotas_consecutivas || 0) + 1;
    jogadorUpdates.derrotas_consecutivas = dc;

    let demitido = false;
    if (dc >= 5 && j.escritorio_id !== 'solo') {
      demitido = true;
      jogadorUpdates.escritorio_empregado_id = null;
      jogadorUpdates.derrotas_consecutivas   = 0;
    }

    if (isAdmin && instancia === 1) {
      processoUpdates.instancia        = 2;
      processoUpdates.progresso        = 0;
      processoUpdates.tipo_processo    = 'judicial';
      processoUpdates.recurso_pendente = false;
      processoUpdates.status           = 'andamento';
      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);
      resposta = { resultado:'derrota_admin_recurso_judicial', hon:0, demitido,
        msg:`❌ Decisão administrativa desfavorável. -${perdaRep} rep. Você pode recorrer judicialmente.` };
    } else if (cs >= 70 && podeFazerInstancia(j.cargo_id, instancia+1) && instancia < 4) {
      processoUpdates.recurso_pendente = true;
      processoUpdates.progresso        = 0;
      processoUpdates.status           = 'andamento';
      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);
      resposta = { resultado:'derrota_pode_recorrer', hon:0, cs, demitido,
        msg:`❌ Sentença desfavorável. -${perdaRep} rep. Chance ${cs}% → pode recorrer.` };
    } else {
      processoUpdates.status        = 'perdido';
      processoUpdates.encerrado_mes = mesAtual;
      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);
      const motivo = instancia >= 4 ? 'Instância máxima.' : cs < 70 ? `Chance ${cs}% — recurso não recomendado.` : 'Cargo insuficiente.';
      resposta = { resultado:'derrota_definitiva', hon:0, demitido,
        msg:`❌ Sentença desfavorável. -${perdaRep} rep. ${motivo}` };
    }
  }

  return resposta;
});

function fmt(n) {
  if (!n && n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
