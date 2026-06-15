'use strict';

/**
 * PROCESSAR SENTENÇA — Advocatus Online
 *
 * Callable function: chamada pelo cliente quando o progresso do caso atinge 100%.
 * Executa no servidor para garantir integridade dos honorários e resultados.
 *
 * Regras:
 * - Solo: 30% valor causa (contingência, só 1ª inst.) + % sucumbência por instância
 * - Escritório: 10% da sucumbência do escritório por instância
 * - Estado perde processo admin. → trânsito em julgado imediato (não recorre)
 * - Cargo mínimo por instância: Pleno+ para 2ª, Sênior+ para STJ/STF
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

// % de sucumbência por instância
const SUCES_PCT = { 1: 0.10, 2: 0.10, 3: 0.05, 4: 0.05 };

// Cargo mínimo por instância (2ª = TJ/CARF, 3ª = STJ, 4ª = STF)
const CARGO_INSTANCIA = {
  2: ['pln','snr','asc','soc','snm','jtit','dsb','mstj','prom','pjus','pgj','def','dch','dge'],
  3: ['snr','asc','soc','snm','dsb','mstj','pjus','pgj','dch','dge'],
  4: ['snr','asc','soc','snm','dsb','mstj','pjus','pgj','dch','dge'],
};

function podeFazerInstancia(cargoId, instancia) {
  if (instancia <= 1) return true;
  const permitidos = CARGO_INSTANCIA[instancia] || [];
  return permitidos.includes(cargoId);
}

function calcHonorarios(processo, instancia, isSolo) {
  const pct         = SUCES_PCT[instancia] || 0.10;
  const sucumbencia = Math.floor(processo.valor * pct);
  if (isSolo) {
    // Solo: 30% do valor (só na 1ª instância) + sucumbência
    const contingencia = instancia === 1 ? Math.floor(processo.valor * 0.30) : 0;
    return contingencia + sucumbencia;
  }
  // Escritório: advogado recebe 10% da sucumbência do escritório
  return Math.floor(sucumbencia * 0.10);
}

exports.processarSentenca = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Autenticação necessária.');
  }

  const uid         = request.auth.uid;
  const { processo_id } = request.data;

  if (!processo_id) {
    throw new HttpsError('invalid-argument', 'processo_id é obrigatório.');
  }

  const db           = getFirestore();
  const processoRef  = db.collection('processos').doc(processo_id);
  const jogadorRef   = db.collection('jogadores').doc(uid);

  // ── Carregar dados em paralelo ──
  const [processoSnap, jogadorSnap, serverSnap] = await Promise.all([
    processoRef.get(),
    jogadorRef.get(),
    db.collection('config').doc('server').get(),
  ]);

  if (!processoSnap.exists) throw new HttpsError('not-found', 'Processo não encontrado.');
  if (!jogadorSnap.exists)  throw new HttpsError('not-found', 'Jogador não encontrado.');

  const p = processoSnap.data();
  const j = jogadorSnap.data();
  const s = serverSnap.data() || {};

  // ── Validações de segurança ──
  if (p.advogado_uid !== uid) {
    throw new HttpsError('permission-denied', 'Este processo não é seu.');
  }
  if (p.status !== 'andamento') {
    throw new HttpsError('failed-precondition', 'Processo já encerrado.');
  }
  if ((p.progresso || 0) < 100) {
    throw new HttpsError('failed-precondition', 'Progresso insuficiente para sentença.');
  }

  const instancia   = p.instancia || 1;
  const cs          = p.chance_sucesso || 50;
  const isSolo      = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const isAdmin     = p.tipo_processo === 'administrativo';
  const reuEhEstado = p.reu_eh_estado === true;
  const mesAtual    = s.mes_global || 1;

  // ── Determinar resultado ──
  const roll   = Math.random() * 100;
  const ganhou = roll < cs;

  logger.info(`[SENTENÇA] ${processo_id} | cs:${cs}% | roll:${roll.toFixed(1)} | ganhou:${ganhou}`);

  // ── Calcular honorários ──
  const hon     = calcHonorarios(p, instancia, isSolo);
  const honTotal = (p.hon_total_acumulado || 0) + hon;

  // ── Preparar updates ──
  const processoUpdates = {
    hon_total_acumulado: honTotal,
    resultado_instancia: ganhou ? 'ganho' : 'perdido',
    chance_aplicada:     cs,
    roll_aplicado:       roll,
    processado_mes:      mesAtual,
  };

  const jogadorUpdates = {};

  let resposta = {};

  if (ganhou) {
    // ═══════════════ VITÓRIA ═══════════════
    jogadorUpdates.dinheiro    = (j.dinheiro || 0) + hon;
    jogadorUpdates.wins        = (j.wins    || 0) + 1;
    jogadorUpdates.wins_ano    = (j.wins_ano || 0) + 1;
    jogadorUpdates.reputacao   = Math.min(100, (j.reputacao || 30) + 5);
    jogadorUpdates.derrotas_consecutivas = 0;

    // Estado perde processo administrativo → trânsito imediato (não pode recorrer)
    const estadoNaoPodeRecorrer = isAdmin && reuEhEstado;

    // Probabilidade de a parte contrária recorrer
    const partePodeRecorrer = !estadoNaoPodeRecorrer && instancia < 4;
    const parteRecorre      = partePodeRecorrer && cs < 70 && Math.random() < 0.55;

    if (parteRecorre) {
      const novaInst = instancia + 1;

      // Verificar se o jogador pode atuar na próxima instância
      if (!podeFazerInstancia(j.cargo_id, novaInst)) {
        // Encerra: jogador não pode atuar nessa instância
        processoUpdates.status        = 'encerrado_cargo';
        processoUpdates.encerrado_mes = mesAtual;
        await processoRef.update(processoUpdates);
        await jogadorRef.update(jogadorUpdates);

        resposta = {
          resultado:  'ganho_encerrado_cargo',
          hon,
          honTotal,
          msg: `Vitória! Mas ${p.reu} recorreu via instância superior e seu cargo atual (${j.cargo_id}) não permite atuar lá. Caso encerrado com honorários parciais.`,
          detalhes: { instancia, hon, honTotal, cs, roll },
        };
      } else {
        // Continua na próxima instância
        const novaHonRef = calcHonorarios(p, novaInst, isSolo);
        processoUpdates.instancia          = novaInst;
        processoUpdates.progresso          = 0;
        processoUpdates.recurso_pendente   = false;
        processoUpdates.hon_prox_instancia = novaHonRef;
        processoUpdates.status             = 'andamento';

        await processoRef.update(processoUpdates);
        await jogadorRef.update(jogadorUpdates);

        const RECURSO_LABEL = {
          tributario:    { 2:'Apelação/Remessa Necessária', 3:'Recurso Especial (STJ)', 4:'Recurso Extraordinário (STF)' },
          trabalhista:   { 2:'Recurso Ordinário (TRT)',     3:'Recurso de Revista (TST)', 4:'Recurso Extraordinário (STF)' },
          civil:         { 2:'Apelação (TJRJ)',             3:'Recurso Especial (STJ)',   4:'Recurso Extraordinário (STF)' },
          criminal:      { 2:'Apelação Criminal',           3:'Recurso Especial (STJ)',   4:'Recurso Extraordinário (STF)' },
          empresarial:   { 2:'Apelação (TJRJ)',             3:'Recurso Especial (STJ)',   4:'Recurso Extraordinário (STF)' },
          constitucional:{ 2:'ROC',                         3:'Embargos de Divergência', 4:'Recurso Extraordinário (STF)' },
          ambiental:     { 2:'Apelação/Remessa Necessária', 3:'Recurso Especial (STJ)',   4:'Recurso Extraordinário (STF)' },
          previdenciario:{ 2:'Recurso Inominado (TNU)',     3:'Recurso Especial (STJ)',   4:'Recurso Extraordinário (STF)' },
        };
        const area    = p.area || 'civil';
        const recLabel = RECURSO_LABEL[area]?.[novaInst] || `${novaInst}ª Instância`;

        resposta = {
          resultado:     'ganho_continua',
          hon,
          honTotal,
          novaInstancia: novaInst,
          recLabel,
          msg: `Vitória! Honorários recebidos: R$ ${hon.toLocaleString('pt-BR')}. ${p.reu} recorreu via ${recLabel}.`,
          detalhes: { instancia, novaInst, hon, honTotal, cs, roll },
        };
      }
    } else {
      // Trânsito em julgado
      processoUpdates.status        = 'ganho';
      processoUpdates.encerrado_mes = mesAtual;

      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);

      resposta = {
        resultado: 'ganho_definitivo',
        hon,
        honTotal,
        transitoJulgado: true,
        estadoNaoPodeRecorrer,
        msg: `🏆 Vitória definitiva! Trânsito em julgado. Honorários totais: R$ ${honTotal.toLocaleString('pt-BR')}.`,
        detalhes: { instancia, hon, honTotal, cs, roll },
      };
    }

  } else {
    // ═══════════════ DERROTA ═══════════════
    jogadorUpdates.losses    = (j.losses    || 0) + 1;
    jogadorUpdates.losses_ano = (j.losses_ano || 0) + 1;
    jogadorUpdates.reputacao = Math.max(0, (j.reputacao || 30) - 5);
    const dc = (j.derrotas_consecutivas || 0) + 1;
    jogadorUpdates.derrotas_consecutivas = dc;

    // Verificar demissão (5 derrotas consecutivas ou rep abaixo do threshold)
    const escritorio       = j.escritorio_id || 'solo';
    const repMin           = 5; // threshold mínimo — escritórios verificam no cliente
    let demitido           = false;
    if (dc >= 5 && escritorio !== 'solo') {
      demitido = true;
      jogadorUpdates.escritorio_empregado_id = null;
      jogadorUpdates.derrotas_consecutivas   = 0;
    }

    // Processo administrativo perdido → pode recorrer judicialmente
    if (isAdmin && instancia === 1) {
      processoUpdates.instancia        = 2;
      processoUpdates.progresso        = 0;
      processoUpdates.tipo_processo    = 'judicial';
      processoUpdates.recurso_pendente = false;
      processoUpdates.status           = 'andamento';

      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);

      resposta = {
        resultado: 'derrota_admin_recurso_judicial',
        hon:       0,
        msg:       'Decisão administrativa desfavorável. Você pode recorrer judicialmente — o caso avança para a esfera judicial.',
        demitido,
        detalhes: { instancia, cs, roll },
      };

    } else if (cs >= 70 && podeFazerInstancia(j.cargo_id, instancia + 1) && instancia < 4) {
      // Pode recorrer
      processoUpdates.recurso_pendente = true;
      processoUpdates.progresso        = 0;
      processoUpdates.status           = 'andamento';

      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);

      resposta = {
        resultado: 'derrota_pode_recorrer',
        hon:       0,
        cs,
        msg: `Sentença desfavorável. Sua chance de sucesso era ${cs}% (acima de 70%). Você pode interpor recurso.`,
        demitido,
        detalhes: { instancia, cs, roll },
      };

    } else {
      // Caso encerrado definitivamente
      processoUpdates.status        = 'perdido';
      processoUpdates.encerrado_mes = mesAtual;

      await processoRef.update(processoUpdates);
      await jogadorRef.update(jogadorUpdates);

      const motivo = instancia >= 4
        ? 'Instância máxima atingida — trânsito em julgado.'
        : cs < 70
          ? `Chance de sucesso ${cs}% — abaixo de 70%, recurso não recomendado.`
          : 'Cargo insuficiente para instância superior.';

      resposta = {
        resultado: 'derrota_definitiva',
        hon:       0,
        msg: `❌ Sentença desfavorável. ${motivo}`,
        demitido,
        detalhes: { instancia, cs, roll },
      };
    }
  }

  return resposta;
});
