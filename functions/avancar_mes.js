'use strict';

/**
 * AVANÇAR MÊS — Advocatus Online
 *
 * Callable: chamada pelo botão "Avançar Mês" do jogador.
 * Substitui o Cloud Scheduler — o tempo é controlado pelo jogador.
 *
 * v2 — Adicionado o bloco de DISTRIBUIÇÃO MENSAL DE PROCESSOS (reset de
 * `pool_casos_criados_mes` e `processos_novos_mes`, deserção de processos
 * individuais e do pool colaborativo, sinalização de distribuição
 * automática de novos casos). Essa lógica existia antes apenas no
 * frontend (js/processos.js::processarDistribuicaoProcessosMensal),
 * exposta como window._processarDistribuicaoProcessosMensal, mas NUNCA
 * era chamada por nada — o avanço de mês real sempre rodou só por esta
 * Cloud Function, que não sabia da existência dela. Resultado prático do
 * bug: os contadores mensais de captação de caso nunca zeravam,
 * acumulando indefinidamente mês após mês (ex.: limite "3/3 atingido"
 * aparecendo mesmo sem ter captado nenhum caso naquele mês).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

const COOLDOWN_JANEIRO_MIN = 60;
const ENERGIA_TOTAL        = 100;

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const MORADIA_REP = {
  pais:0, belford:-1, sao_joao:-1, nilop:-1, nova_iguacu:-1, caxias_apto:-1,
  bangu:-1, realengo:-1, santa_cruz:0, campo_grande:1, madureira:0,
  penha:0, iraja:1, sao_cristov:1, meier:2, pechincha:1,
  jacarepagua:2, recreio:3, lapa:1, cinelandia:1, centro_apto:1,
  tijuca:3, catete:3, santa_teresa:3, flamengo:4, centro_nit:2,
  laranjeiras:4, botafogo:5, sao_fco_nit:4, icarai:5,
  copacabana:6, barra_med:5, hr_v:0,
  botafogo2:5, lagoa:7, barra_lux:8, ipanema:9, leblon:10,
};

const CARRO_REP = {
  onibus:0, kwid:0, mobi:0, hb20:0, gol:0, onix:1,
  polo:1, cronos:1, tracker:2, t_cross:2,
  compass:3, corolla:3, civic:3, hr_v:2,
  tiguan:5, hilux:4, bmw3:7, class_c:8, audi_a4:7, range_v:10,
};

const CARGO_IDX = {est:0,ass:1,jnr:2,pln:3,snr:4,asc:5,soc:6,snm:7,
                   jsub:2,jtit:4,dsb:5,mstj:7,padj:2,prom:4,pjus:5,pgj:7,
                   dadj:2,def:4,dch:5,dge:7};

const IMOVEL_VALOR = {
  pais:0, belford:150000, sao_joao:160000, nilop:170000,
  nova_iguacu:220000, caxias_apto:200000, bangu:220000, realengo:180000,
  santa_cruz:200000, campo_grande:280000, madureira:300000,
  penha:250000, iraja:350000, sao_cristov:380000, meier:450000,
  pechincha:400000, jacarepagua:600000, recreio:1000000,
  lapa:400000, cinelandia:450000, centro_apto:500000, tijuca:700000,
  catete:700000, santa_teresa:900000, flamengo:1000000,
  laranjeiras:1100000, botafogo:1200000, icarai:1400000,
  copacabana:1500000, sao_fco_nit:1000000, centro_nit:600000,
  barra_med:1800000, lagoa:2200000, ipanema:2500000,
  leblon:3000000, barra_lux:3500000,
};

const CARRO_CM = {
  onibus:176, kwid:900, mobi:850, hb20:1000, gol:950, onix:1050,
  polo:1200, cronos:1100, tracker:1700, t_cross:1800,
  compass:2500, corolla:2200, civic:2100, tiguan:3200, hr_v:2300,
  hilux:3500, bmw3:4500, class_c:5000, audi_a4:4400, range_v:7000,
};

const CARGO_SAL_MIN = {
  est:1700, ass:2500, jnr:3500, pln:5750, snr:10600, asc:20000, soc:35000, snm:65000,
  jsub:35000, jtit:40000, dsb:52000, mstj:70000,
  padj:32000, prom:36000, pjus:46000, pgj:60000,
  dadj:28000, def:32000, dch:42000, dge:56000,
};
const CARGO_SAL_MAX = {
  est:1700, ass:3500, jnr:6650, pln:11100, snr:20000, asc:35000, soc:65000, snm:120000,
  jsub:38000, jtit:44000, dsb:57000, mstj:77000,
  padj:35000, prom:40000, pjus:52000, pgj:68000,
  dadj:30000, def:35000, dch:48000, dge:63000,
};

const IMOVEL_PERIGO = {
  pais:0, belford:2, sao_joao:2, nilop:2, nova_iguacu:2, caxias_apto:2,
  bangu:2, realengo:2, santa_cruz:1, campo_grande:1, madureira:2,
  penha:2, iraja:1, sao_cristov:1, meier:1, pechincha:0,
  jacarepagua:0, recreio:0, lapa:1, cinelandia:1, centro_apto:1,
  tijuca:0, catete:0, santa_teresa:1, flamengo:0,
  laranjeiras:0, botafogo:0, icarai:0, copacabana:0,
  sao_fco_nit:0, centro_nit:1, barra_med:0, lagoa:0,
  ipanema:0, leblon:0, barra_lux:0,
};

// ── Tabelas do pool colaborativo (espelho de js/processos.js) ──
const PRAZO_POOL_MESES = 3;

function mesTotalPessoal(mesPessoal, anoPessoal) {
  return (anoPessoal||1)*12 + (mesPessoal||0);
}

// ════════════════════════════════════════════════════════
// CALLABLE PRINCIPAL
// ════════════════════════════════════════════════════════
exports.avancarMes = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');

  const uid = request.auth.uid;
  const db  = getFirestore();

  const [jogadorSnap, serverSnap] = await Promise.all([
    db.collection('jogadores').doc(uid).get(),
    db.collection('config').doc('server').get(),
  ]);

  if (!jogadorSnap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');

  const j = jogadorSnap.data();
  const s = serverSnap.exists ? serverSnap.data() : {};

  const mesAtualJogador = j.mes_pessoal !== undefined ? j.mes_pessoal : 0;
  if (mesAtualJogador === 0 && j.janeiro_bloqueado_ate) {
    const bloqueadoAte = new Date(j.janeiro_bloqueado_ate).getTime();
    const agora        = Date.now();
    if (agora < bloqueadoAte) {
      const restanteMs  = bloqueadoAte - agora;
      const restanteMin = Math.ceil(restanteMs / 60000);
      const restanteH   = Math.floor(restanteMin / 60);
      const restanteM   = restanteMin % 60;
      const textoEspera = restanteH > 0 ? restanteH + 'h ' + restanteM + 'min' : restanteMin + ' minutos';
      throw new HttpsError('resource-exhausted',
        'Ferias de janeiro! Descanse e volte em ' + textoEspera + '.');
    }
  }

  const updates = {};
  const mensagens = [];

  const mesAtualJog = j.mes_pessoal ?? 0;
  const anoAtualJog = j.ano_pessoal ?? 1;
  const novoMes     = (mesAtualJog + 1) % 12;
  const novoAno     = novoMes === 0 ? anoAtualJog + 1 : anoAtualJog;
  const mesGlobal   = (j.mes_global_pessoal || 0) + 1;
  const isJaneiro   = novoMes === 0;

  updates.mes_pessoal        = novoMes;
  updates.ano_pessoal        = novoAno;
  updates.mes_global_pessoal = mesGlobal;
  updates.ultimo_avanco      = new Date().toISOString();
  updates.energia            = ENERGIA_TOTAL;
  updates.energia_usada_mes  = 0;

  updates.idade = 22 + Math.floor(mesGlobal / 12);

  if (updates.idade >= 75 && !j.aposentado) {
    updates.aposentado = true;
    mensagens.push({ assunto:'🎓 Aposentadoria', corpo:'Você atingiu 75 anos. Escolha um herdeiro para continuar sua dinastia.', tipo:'sistema' });
    await _commit(db, uid, updates, mensagens, novoMes, novoAno);
    return { ok:true, mes:`${MESES[novoMes]}, Ano ${novoAno}`, aposentado:true };
  }

  const studyQueue = j.study_queue || [];
  const prontos    = studyQueue.filter(s2 => s2.mes_conclusao <= mesGlobal);
  const pendentes  = studyQueue.filter(s2 => s2.mes_conclusao > mesGlobal);
  const newSkills  = { ...(j.skills || {}) };
  for (const est of prontos) {
    const cap = REP_CAP[j.cargo_id] || 55;
    newSkills[est.skill] = Math.min(cap, (newSkills[est.skill] || 0) + est.ganho);
    mensagens.push({ assunto:`📚 Estudo concluído: ${est.skill_label}`, corpo:`+${est.ganho} em ${est.skill_label}.`, tipo:'positivo' });
  }
  if (prontos.length > 0) {
    updates.skills      = newSkills;
    updates.study_queue = pendentes;
  }

  const fins = { ...(j.financiamentos || {}) };
  let finsAlterados = false;
  for (const [id, fin] of Object.entries(fins)) {
    if (fin.parcelas_restantes > 0) {
      fins[id] = { ...fin, parcelas_restantes: fin.parcelas_restantes - 1 };
      finsAlterados = true;
      if (fins[id].parcelas_restantes === 0) {
        mensagens.push({ assunto:`🚗 Financiamento quitado`, corpo:`Seu ${fin.nome} está 100% pago.`, tipo:'positivo' });
      }
    }
  }
  if (finsAlterados) updates.financiamentos = fins;

  let renda = 0;
  const isSoloRenda = !j.escritorio_empregado_id || j.escritorio_id === 'solo' || j.escritorio_proprio_id;

  if (!isSoloRenda) {
    if (j.sal_base_escritorio && j.sal_base_escritorio > 0) {
      renda = j.sal_base_escritorio;
    } else {
      const salMin = CARGO_SAL_MIN[j.cargo_id] || 1700;
      const salMax = CARGO_SAL_MAX[j.cargo_id] || 1700;
      const repF   = Math.min(1, (j.reputacao || 30) / 100);
      renda = Math.floor(salMin + (salMax - salMin) * repF * (j.sal_mult || 1.0));
    }
  } else {
    renda = j.honorarios_mes || 0;
  }

  const morId    = j.pat?.moradia   || 'pais';
  const carId    = j.pat?.transporte|| 'onibus';
  const escId    = j.pat?.escritorio|| 'cw';
  const comprada = j.moradias_compradas?.[morId];

  let despesas = 0;
  const ESCRITORIO_CM_LOCAL = { home:0, cw:600, sal:3000, esm:7500, esp:18000 };
  const isSoloWork = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  if (isSoloWork) {
    despesas += ESCRITORIO_CM_LOCAL[escId] || 0;
  }
  if (morId !== 'pais' && !comprada) {
    const v = IMOVEL_VALOR[morId] || 0;
    despesas += v < 500000 ? Math.floor(v*0.0055) : v < 1000000 ? Math.floor(v*0.004) : Math.floor(v*0.003);
  }
  despesas += CARRO_CM[carId] || 176;
  for (const fin of Object.values(fins)) {
    if (fin.parcelas_restantes > 0) despesas += fin.parcela_mensal || 0;
  }
  despesas += (j.estagiarios || []).length * 1700;
  const CUSTO_BASE = {
    est:600, ass:700, jnr:900, pln:1400, snr:2200,
    asc:3000, soc:4500, snm:6000,
    jsub:2200, jtit:3000, dsb:4000, mstj:5500,
    padj:2000, prom:2800, pjus:3800, pgj:5000,
    dadj:1800, def:2400, dch:3200, dge:4500,
  };
  const custoVida = CUSTO_BASE[j.cargo_id] || 700;

  const saldoMes   = renda - despesas - custoVida;
  updates.dinheiro = (j.dinheiro || 0) + saldoMes;
  updates.renda_calculada     = renda;
  updates.honorarios_mes      = 0;

  if (j.escritorio_proprio_id) {
    try {
      const funcSnap = await db
        .collection('escritorios')
        .doc(j.escritorio_proprio_id)
        .collection('funcionarios')
        .get();
      const resets = funcSnap.docs.map(d =>
        d.ref.update({ acoes_mes_usadas: 0, acao_atual: null })
      );
      await Promise.all(resets);
    } catch(e) {
      logger.warn('Erro ao resetar ações dos funcionários:', e.message);
    }
  }
  updates.despesas_calculadas = despesas;
  updates.saldo_mes_calculado = saldoMes;

  const finResult = _processarFinanceiro(j, updates.dinheiro, saldoMes);
  Object.assign(updates, finResult.updates);
  if (finResult.msg) mensagens.push(finResult.msg);

  const repAtual  = updates.reputacao ?? j.reputacao ?? 30;
  const cargoIdx  = CARGO_IDX[j.cargo_id] || 0;
  const cap       = REP_CAP[j.cargo_id] || 55;
  let deltaRepPat = 0;

  if (isSoloWork && escId === 'home') {
    const novaRep = Math.max(0, (updates.reputacao ?? j.reputacao ?? 30) - 2);
    updates.reputacao = novaRep;
  }

  const morRepBase = MORADIA_REP[morId] ?? 0;
  if (morRepBase < 0) {
    deltaRepPat += morRepBase;
  } else if (morRepBase > 0) {
    const espaco = Math.max(0, cap - repAtual);
    deltaRepPat += Math.min(morRepBase, Math.max(1, Math.floor(espaco * 0.15)));
  }
  if (morId === 'pais' && cargoIdx >= 2) deltaRepPat -= 2;

  const carRepBase = CARRO_REP[carId] ?? 0;
  if (carRepBase > 0) {
    const espaco = Math.max(0, cap - (repAtual + deltaRepPat));
    deltaRepPat += Math.min(carRepBase, Math.max(1, Math.floor(espaco * 0.10)));
  }
  if (carId === 'onibus' && cargoIdx >= 3) deltaRepPat -= 1;
  const carrosFracos = ['kwid','mobi','hb20','gol'];
  if (carrosFracos.includes(carId) && cargoIdx >= 4) deltaRepPat -= 1;

  if (['esm','esp'].includes(escId) && cargoIdx >= 6) {
    // tem escritório adequado — sem penalidade
  } else if (['cw','sal'].includes(escId) && cargoIdx >= 6) {
    deltaRepPat -= 2;
  }

  if ((IMOVEL_PERIGO[morId] || 0) === 2) deltaRepPat -= 1;

  const repDepoisPat = Math.max(0, Math.min(cap, repAtual + deltaRepPat));
  updates.reputacao = repDepoisPat;

  if (morId === 'pais' && j.oab && cargoIdx >= 2) {
    const prazo = (j.prazo_sair_pais || 0) + 1;
    updates.prazo_sair_pais = prazo;
    if (prazo === 1) mensagens.push({ assunto:'⚠️ Saia da casa dos pais', corpo:'Você tem 3 meses para escolher uma moradia.', tipo:'urgente' });
    if (prazo >= 3)  mensagens.push({ assunto:'❌ Prazo de moradia', corpo:'Prazo esgotado. -5 rep.', tipo:'urgente' });
    if (prazo >= 3)  updates.reputacao = Math.max(0, (updates.reputacao ?? repAtual) - 5);
  } else if (morId !== 'pais') {
    updates.prazo_sair_pais = 0;
  }

  const energiaGasta = j.energia_usada_mes || 0;
  let saudeMental    = j.saude_mental ?? 80;
  let disposicao     = j.disposicao   ?? 80;

  if (energiaGasta > 70)       { saudeMental = Math.max(0, saudeMental - 5); }
  else if (energiaGasta < 30)  { saudeMental = Math.min(100, saudeMental + 3); disposicao = Math.min(100, disposicao + 3); }
  disposicao = Math.max(0, disposicao - 2);

  if ((IMOVEL_PERIGO[morId] || 0) === 2 && Math.random() < 0.01) {
    const perda = Math.floor((updates.dinheiro || 0) * 0.10);
    updates.dinheiro = Math.max(0, (updates.dinheiro || 0) - perda);
    mensagens.push({ assunto:'🚨 Assalto!', corpo:`Você foi assaltado. -R$ ${perda.toLocaleString('pt-BR')} (10% do saldo).`, tipo:'urgente' });
  }

  if (saudeMental < 20 && !j.em_burnout) {
    updates.em_burnout      = true;
    updates.burnout_ate_mes = mesGlobal + 3;
    mensagens.push({ assunto:'🔴 Burnout', corpo:'Saúde mental crítica. Sem novos casos por 3 meses.', tipo:'urgente' });
  }
  if (j.em_burnout && mesGlobal >= (j.burnout_ate_mes || 0)) {
    updates.em_burnout = false;
    saudeMental = Math.max(30, saudeMental);
    mensagens.push({ assunto:'✅ Recuperado', corpo:'Você se recuperou do burnout.', tipo:'positivo' });
  }

  updates.saude_mental = saudeMental;
  updates.disposicao   = disposicao;

  if (isJaneiro) {
    const desbloqueioTs = new Date(Date.now() + COOLDOWN_JANEIRO_MIN * 60 * 1000).toISOString();
    updates.janeiro_bloqueado_ate = desbloqueioTs;
    const wA = j.wins_ano || 0, lA = j.losses_ano || 0, tot = wA + lA;
    if (tot > 0 && j.escritorio_id !== 'solo') {
      const pct  = Math.round(wA / tot * 100);
      const salM = renda || 5000;
      let bonus  = 0, descB = '';
      if (pct === 100)    { bonus = salM*6; descB = '100% → 6 salários!'; }
      else if (pct >= 90) { bonus = salM*3; descB = '90%+ → 3 salários!'; }
      else if (pct >= 80) { bonus = salM*2; descB = '80%+ → 2 salários!'; }
      else if (pct >= 70) { bonus = salM;   descB = '70%+ → 1 salário!'; }
      if (bonus > 0) {
        updates.dinheiro = (updates.dinheiro || 0) + bonus;
        mensagens.push({ assunto:'🎉 Bônus Anual', corpo:`${descB} +R$ ${bonus.toLocaleString('pt-BR')}`, tipo:'positivo' });
      }
    }
    updates.wins_ano       = 0;
    updates.losses_ano     = 0;
    updates.recesso_pendente = true;
    mensagens.push({ assunto:'🏖️ Recesso Judiciário', corpo:'Janeiro: tribunais em recesso. Escolha sua atividade no jogo.', tipo:'sistema' });
  }

  if (mesGlobal % 12 === 0) {
    updates.anos_carreira = (j.anos_carreira || 0) + 1;
  }

  // ── DISTRIBUIÇÃO MENSAL DE PROCESSOS (bloco novo) ──
  // Reset dos contadores mensais de captação/criação de casos, deserção
  // de processos individuais e do pool colaborativo. Usa o NOVO mês
  // (novoMes/novoAno, já calculado acima), não o antigo.
  try {
    const processosMsgs = await _processarDistribuicaoProcessosMensal(db, uid, j, {
      mes_pessoal: novoMes,
      ano_pessoal: novoAno,
    }, updates);
    mensagens.push(...processosMsgs);
  } catch (e) {
    logger.warn('Erro na distribuição mensal de processos:', e.message);
  }

  // ── PROCESSAMENTO MENSAL DE RELACIONAMENTOS (bloco novo) ──
  // Reset do contador _ganho_mes_atual (afinidade), decaimento, gravidez,
  // flagras, envelhecimento de filhos. Esta lógica existia em
  // relacionamento.js::processarRelacionamentosMensal, exposta como
  // window._processarRelacionamentosMensal "para ser chamada pelo
  // avancar_mes.js" — mas isso nunca foi de fato implementado aqui, e
  // window.* não existe no ambiente da Cloud Function (Admin SDK, sem
  // DOM/window) mesmo que existisse a chamada. Resultado prático do bug:
  // _ganho_mes_atual nunca era resetado, travando o limite mensal de
  // afinidade (GANHO_MAX_MENSAL) permanentemente após o primeiro mês em
  // que fosse atingido com qualquer pessoa.
  try {
    await _processarRelacionamentosMensalCF(db, uid, j, { mes_pessoal: novoMes, ano_pessoal: novoAno });
  } catch (e) {
    logger.warn('Erro no processamento mensal de relacionamentos:', e.message);
  }

  await _commit(db, uid, updates, mensagens, novoMes, novoAno);

  logger.info(`[AVANÇAR] ${uid} → ${MESES[novoMes]}, Ano ${novoAno}`);

  return {
    ok:        true,
    mes:       `${MESES[novoMes]}, Ano ${novoAno}`,
    mes_jogo:  novoMes,
    ano_jogo:  novoAno,
    saldo_mes: saldoMes,
    delta_rep_pat: deltaRepPat,
    resumo: {
      renda, despesas, custo_vida: custoVida,
      saldo_mes: saldoMes,
      rep_patrimonio: deltaRepPat,
    }
  };
});

// ════════════════════════════════════════════════════════
// DISTRIBUIÇÃO MENSAL DE PROCESSOS — portado de
// js/processos.js::processarDistribuicaoProcessosMensal (que existia só
// no frontend, sem nunca ser chamado por nada). Adaptado para Admin SDK.
// Retorna um array de mensagens de inbox para o _commit() principal
// gravar — não grava diretamente, para que tudo entre num único batch.
// ════════════════════════════════════════════════════════
async function _processarDistribuicaoProcessosMensal(db, uid, j, novoCalendario, updates) {
  const mensagens = [];
  const mesAtualTotal = mesTotalPessoal(novoCalendario.mes_pessoal, novoCalendario.ano_pessoal);

  if (j.escritorio_empregado_id && !j.escritorio_proprio_id) {
    updates.processos_novos_mes = 0;
  }

  // Este é o reset que faltava e causava o bug "limite 3/3 atingido sem
  // ter captado nada esse mês".
  if (j.escritorio_proprio_id) {
    try {
      await db.collection('escritorios').doc(j.escritorio_proprio_id).update({ pool_casos_criados_mes: 0 });
    } catch (e) { logger.warn('Erro ao resetar pool_casos_criados_mes:', e.message); }
  }

  const meusProcsSnap = await db.collection('processos')
    .where('advogado_uid', '==', uid)
    .where('status', '==', 'andamento')
    .where('distribuido_pelo_escritorio', '==', true)
    .get();

  for (const pDoc of meusProcsSnap.docs) {
    const p = pDoc.data();
    if (p.pool_escritorio_id) continue;
    if (p.prazo_limite_mes && mesAtualTotal > p.prazo_limite_mes) {
      const repAtual = updates.reputacao ?? j.reputacao ?? 30;
      const perda = Math.max(1, Math.floor(repAtual * 0.06));
      await pDoc.ref.update({ status: 'perdido_desercao', encerrado_mes: mesAtualTotal });
      updates.reputacao = Math.max(0, repAtual - perda);
      mensagens.push({
        assunto: '⚠️ Processo perdido por deserção',
        corpo: `O processo ${p.numero} (${p.tipo}) ultrapassou o prazo de 3 meses sem conclusão e foi perdido. -${perda} reputação.`,
        tipo: 'negativo',
      });
    }
  }

  if (j.escritorio_proprio_id) {
    const poolSnap = await db.collection('processos')
      .where('pool_escritorio_id', '==', j.escritorio_proprio_id)
      .where('status', '==', 'andamento')
      .get();

    for (const pDoc of poolSnap.docs) {
      const p = pDoc.data();
      if (!(p.prazo_limite_mes && mesAtualTotal > p.prazo_limite_mes)) continue;

      const progresso = p.progresso || 0;
      const contribuintes = p.contribuintes || [];

      if (progresso === 0 || contribuintes.length === 0) {
        try {
          const escSnap = await db.collection('escritorios').doc(j.escritorio_proprio_id).get();
          const prestigioAtual = escSnap.exists ? (escSnap.data().prestigio || 10) : 10;
          await db.collection('escritorios').doc(j.escritorio_proprio_id).update({ prestigio: Math.max(0, prestigioAtual - 3) });
        } catch (e) { logger.warn('Erro ao penalizar prestígio do escritório:', e.message); }
        await pDoc.ref.update({ status: 'perdido_desercao', encerrado_mes: mesAtualTotal });
        mensagens.push({
          assunto: '⚠️ Caso do escritório perdido por inatividade',
          corpo: `O caso ${p.numero} (${p.tipo}) ficou ${PRAZO_POOL_MESES} meses no pool sem nenhum funcionário atuar. -3 prestígio do escritório.`,
          tipo: 'negativo',
        });
      } else {
        const FATOR_RATEIO_POOL = 0.6;
        const batchRateio = db.batch();
        for (const c of contribuintes) {
          try {
            const cRef = db.collection('jogadores').doc(c.uid);
            const cSnap = await cRef.get();
            if (!cSnap.exists) continue;
            const cData = cSnap.data();
            const repC = cData.reputacao || 30;
            const perdaBase = Math.max(1, Math.floor(repC * 0.06));
            const perdaRateada = Math.max(1, Math.round((perdaBase * FATOR_RATEIO_POOL) / contribuintes.length));
            batchRateio.update(cRef, { reputacao: Math.max(0, repC - perdaRateada) });
            const inboxRef = cRef.collection('inbox').doc();
            batchRateio.set(inboxRef, {
              de: 'sistema', para_uid: c.uid,
              assunto: '⚠️ Caso do escritório perdido por deserção',
              corpo: `O caso colaborativo ${p.numero} (${p.tipo}) ultrapassou o prazo de ${PRAZO_POOL_MESES} meses e foi perdido. -${perdaRateada} reputação (responsabilidade compartilhada entre ${contribuintes.length} contribuinte(s)).`,
              tipo: 'sistema', tipo_noticia: 'negativo', lida: false, criado_em: new Date().toISOString(),
            });
          } catch (e) { logger.warn('[POOL] Erro ao ratear deserção:', e.message); }
        }
        try { await batchRateio.commit(); } catch (e) { logger.warn('Erro ao commitar rateio de deserção:', e.message); }
        await pDoc.ref.update({ status: 'perdido_desercao', encerrado_mes: mesAtualTotal });
      }
    }
  }

  // Geração de novo caso automático: a geração jurídica completa
  // (tributo/lado/teses/provas/colegiado) usa o motor compartilhado de
  // functions/shared/banco_juridico.js. Em vez de duplicar essa lógica
  // aqui, sinaliza via flag + inbox; a geração efetiva acontece no
  // frontend (js/processos.js) na próxima vez que o jogador abrir a aba
  // de Processos.
  if (j.escritorio_empregado_id && !j.escritorio_proprio_id) {
    try {
      const escSnap = await db.collection('escritorios').doc(j.escritorio_empregado_id).get();
      const tier = escSnap.exists ? (escSnap.data().tier || 1) : 1;
      const chanceDistribuicao = Math.min(0.9, 0.4 + tier * 0.1);
      if (Math.random() < chanceDistribuicao) {
        updates.caso_pendente_distribuicao = true;
        mensagens.push({
          assunto: '📁 Novo caso a caminho',
          corpo: 'Seu escritório vai te distribuir um novo caso. Acesse a aba Processos para recebê-lo.',
          tipo: 'neutro',
        });
      }
    } catch (e) { logger.warn('Erro ao sortear distribuição automática:', e.message); }
  }

  return mensagens;
}

// ════════════════════════════════════════════════════════
// SISTEMA FINANCEIRO
// ════════════════════════════════════════════════════════
function _processarFinanceiro(j, novoDinheiro, saldoMes) {
  const updates = {};
  let msg       = null;
  const rep     = j.reputacao || 30;

  if (novoDinheiro < 0 || saldoMes < 0) {
    const mesesNeg = (j.meses_negativo || 0) + 1;
    updates.meses_negativo        = mesesNeg;
    updates.meses_positivo_streak = 0;
    const repPerda = j.no_serasa
      ? Math.max(3, Math.floor(rep * 0.06))
      : Math.max(2, Math.floor(rep * 0.03));
    updates.reputacao = Math.max(0, rep - repPerda);

    if (mesesNeg === 1) msg = { assunto:'⚠️ Saldo negativo', corpo:`-${repPerda} rep. Regularize suas finanças.`, tipo:'urgente' };
    else if (mesesNeg === 2) msg = { assunto:'⚠️ 2º mês negativo', corpo:`-${repPerda} rep. Mais 1 mês → Serasa.`, tipo:'urgente' };
    else if (mesesNeg === 3 && !j.no_serasa) {
      updates.no_serasa = true;
      const extra = Math.max(4, Math.floor(rep * 0.06));
      updates.reputacao = Math.max(0, (updates.reputacao ?? rep) - extra);
      msg = { assunto:'🚨 Serasa', corpo:`Seu nome foi ao Serasa. -${extra} rep extra.`, tipo:'urgente' };
    } else if (mesesNeg > 3) {
      msg = { assunto:'🚨 Ainda no Serasa', corpo:`${mesesNeg}º mês negativo. -${repPerda} rep.`, tipo:'urgente' };
    }
  } else {
    updates.meses_negativo = 0;
    const streak = (j.meses_positivo_streak || 0) + 1;
    updates.meses_positivo_streak = streak;
    if (j.no_serasa && streak >= 3) {
      updates.no_serasa             = false;
      updates.meses_positivo_streak = 0;
      updates.reputacao             = Math.min(REP_CAP[j.cargo_id] || 55, rep + 5);
      msg = { assunto:'✅ Nome limpo', corpo:'3 meses positivos — seu nome saiu do Serasa. +5 rep.', tipo:'positivo' };
    }
  }
  return { updates, msg };
}

// ════════════════════════════════════════════════════════
// HELPER: salvar + inbox
// ════════════════════════════════════════════════════════
async function _commit(db, uid, updates, mensagens, novoMes, novoAno) {
  const batch = db.batch();
  batch.update(db.collection('jogadores').doc(uid), {
    ...updates,
    ultimo_mes_processado: updates.mes_global_pessoal || 0,
  });
  for (const m of mensagens) {
    const ref = db.collection('jogadores').doc(uid).collection('inbox').doc();
    const MESES_CF = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    batch.set(ref, {
      de: 'sistema', para_uid: uid,
      assunto: m.assunto || '—',
      corpo:   m.corpo   || '',
      tipo:    'sistema',
      tipo_noticia: m.tipo || 'neutro',
      lida:    false,
      criado_em: new Date().toISOString(),
      mes_jogo_label: MESES_CF[novoMes] + ', Ano ' + novoAno,
    });
  }
  await batch.commit();
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL DE RELACIONAMENTOS — portado de
// relacionamento.js::processarRelacionamentosMensal (frontend, ES Module)
// para Admin SDK. Mesma lógica de decaimento, gravidez, flagra,
// envelhecimento de filhos, e — o ponto crítico do bug original — reset
// de _ganho_mes_atual (limite mensal de afinidade por pessoa).
//
// IMPORTANTE: mantém o mesmo conteúdo das tabelas em
// js/relacionamento_dados.js. Qualquer ajuste de balanceamento feito lá
// (ESTAGIOS, INTERACOES, GANHO_MAX_MENSAL, etc.) precisa ser replicado
// manualmente aqui — não há um módulo compartilhado físico entre
// frontend (ES Module) e Cloud Function (CommonJS) por padrão deste
// projeto (mesma decisão já tomada para o banco jurídico).
// ════════════════════════════════════════════════════════
const ESTAGIOS_REL = {
  affair:   { cap:50,  decai:10, termino_chance:0.03, tempo_chance:0.05 },
  namorado: { cap:100, decai:8,  termino_chance:0.02, tempo_chance:0.03 },
  noivo:    { cap:150, decai:5,  termino_chance:0.01, tempo_chance:0.02 },
  esposo:   { cap:200, decai:3,  termino_chance:0.005,tempo_chance:0.01 },
};
const IMPACTO_SM_REL = {
  tempo:   { affair:5,  namorado:10, noivo:15, esposo:20 },
  termino: { affair:10, namorado:20, noivo:35, esposo:50 },
};
const CHANCE_GRAVIDEZ_REL = { namorado: 0.02, noivo: 0.04, esposo: 0.08 };
const DURACAO_GESTACAO_REL = 9;
const SEXO_CONFIG_REL = {
  ganho_saude_mental: 1,
  meses_tolerancia: 3,
  perda_saude_mental_mes: 1,
  perda_afinidade_mes: 3,
};
const FLAGRA_REL = {
  chance_por_affair_extra: 0.08,
  chance_namorada_com_affair: 0.12,
  penalidade_sm: 25,
};
const ACADEMIA_REL = {
  bonus_por_mes: 1,
  bonus_max: 25,
  perda_sem_uso: 1,
};
const CUSTO_FILHO_REL = { bebe:800, crianca:1200, jovem:2000 };

function custoFilhoPorIdadeCF(idade) {
  if (idade <= 5)  return CUSTO_FILHO_REL.bebe;
  if (idade <= 17) return CUSTO_FILHO_REL.crianca;
  if (idade <= 22) return CUSTO_FILHO_REL.jovem;
  return 0;
}
function efeitoFelicidadeCompatibilidadeCF(compat) {
  if (compat >= 90) return 10;
  if (compat >= 70) return 5;
  if (compat >= 50) return 0;
  if (compat >= 30) return -5;
  return -10;
}

const NOMES_BEBE_CF = {
  m: ['Lucas','Gabriel','Pedro','Davi','Miguel','Arthur','Heitor','Théo'],
  f: ['Helena','Alice','Laura','Maria','Sofia','Valentina','Júlia','Lívia'],
};

async function _processarRelacionamentosMensalCF(db, uid, j, novoCalendario) {
  const updatesJogador = {};

  // ── Academia: bônus ou perda de energia ──
  if (j.academia_ativa) {
    const bonusAtual = j.academia_bonus_energia || 0;
    if (j.academia_usada_mes) {
      updatesJogador.academia_bonus_energia = Math.min(ACADEMIA_REL.bonus_max, bonusAtual + ACADEMIA_REL.bonus_por_mes);
    } else {
      updatesJogador.academia_bonus_energia = Math.max(0, bonusAtual - ACADEMIA_REL.perda_sem_uso);
    }
    updatesJogador.academia_usada_mes = false;
  }

  // ── Relacionamentos: decaimento, eventos, gravidez ──
  const relSnap = await db.collection('jogadores').doc(uid).collection('relacionamentos')
    .where('ativo', '==', true).get();
  const rels = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const numAffairs = rels.filter(r => r.estagio === 'affair').length;
  const temNamoradaOuMais = rels.some(r => r.estagio !== 'affair');
  let smDelta = 0;
  let felicidadeSomaCompat = 0, felicidadeCount = 0;
  const mesTotalAtual = (novoCalendario.ano_pessoal||1)*12 + (novoCalendario.mes_pessoal||0);

  for (const r of rels) {
    // Guarda de idempotência: evita processar duas vezes o mesmo mês de
    // jogo se a function rodar mais de uma vez (ex.: retry de rede).
    if (r._mes_processado === mesTotalAtual) continue;

    const estagio = ESTAGIOS_REL[r.estagio] || ESTAGIOS_REL.affair;
    const upd = { _mes_processado: mesTotalAtual };

    // Decaimento se não interagiu o suficiente este mês
    if (!r._ganho_mes_atual) {
      upd.afinidade = Math.max(0, (r.afinidade||0) - estagio.decai);
    }
    // ESTE é o reset que faltava — sem ele, GANHO_MAX_MENSAL (25) era
    // atingido uma vez e nunca mais liberava novas interações com aquela
    // pessoa, em nenhum mês futuro.
    upd._ganho_mes_atual = 0;
    upd._meses = (r._meses||0) + 1;

    // Sexo: tolerância e penalidades
    let mesesSemSexo = r.sexo_mes_atual ? 0 : (r.meses_sem_sexo||0) + 1;
    upd.meses_sem_sexo = mesesSemSexo;
    upd.sexo_mes_atual = false;
    if (mesesSemSexo >= SEXO_CONFIG_REL.meses_tolerancia) {
      smDelta -= SEXO_CONFIG_REL.perda_saude_mental_mes;
      upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) - SEXO_CONFIG_REL.perda_afinidade_mes);
    }

    // Gravidez
    if (r.sexo_mes_atual && !r.gravida && CHANCE_GRAVIDEZ_REL[r.estagio]) {
      if (Math.random() < CHANCE_GRAVIDEZ_REL[r.estagio]) {
        upd.gravida = true;
        upd.mes_gravidez = 1;
      }
    } else if (r.gravida) {
      const novoMesGrav = (r.mes_gravidez||0) + 1;
      if (novoMesGrav >= DURACAO_GESTACAO_REL) {
        await _gerarFilhoCF(db, uid, r);
        upd.gravida = false;
        upd.mes_gravidez = 0;
        smDelta += 10;
      } else {
        upd.mes_gravidez = novoMesGrav;
      }
    }

    // Flagra de affair
    if (temNamoradaOuMais && r.estagio !== 'affair' && numAffairs > 0) {
      if (Math.random() < FLAGRA_REL.chance_namorada_com_affair) {
        upd.ativo = false;
        upd.afinidade = 0;
        smDelta -= FLAGRA_REL.penalidade_sm;
        await db.collection('jogadores').doc(uid).collection('inbox').add({
          de:'sistema', para_uid:uid,
          assunto:'💔 Flagrado(a) traindo!',
          corpo:`${r.nome} descobriu seu affair e terminou o relacionamento. -${FLAGRA_REL.penalidade_sm} saúde mental.`,
          tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
        });
      }
    } else if (r.estagio === 'affair' && numAffairs > 1) {
      if (Math.random() < FLAGRA_REL.chance_por_affair_extra * (numAffairs-1)) {
        upd.ativo = false;
        upd.afinidade = 0;
      }
    } else if (Math.random() < estagio.termino_chance) {
      upd.ativo = false;
      smDelta -= IMPACTO_SM_REL.termino[r.estagio] || 10;
    } else if (Math.random() < estagio.tempo_chance) {
      upd.afinidade = Math.max(0, Math.floor((upd.afinidade ?? r.afinidade) * 0.7));
      smDelta -= IMPACTO_SM_REL.tempo[r.estagio] || 5;
    }

    await db.collection('jogadores').doc(uid).collection('relacionamentos').doc(r.id).update(upd);

    if (upd.ativo !== false) {
      felicidadeSomaCompat += efeitoFelicidadeCompatibilidadeCF(r.compatibilidade||50);
      felicidadeCount++;
    }
  }

  // ── Felicidade ──
  const felicidadeBase = j.felicidade !== undefined ? j.felicidade : 50;
  const smAtual = Math.max(0, Math.min(100, (j.saude_mental||80) + smDelta));
  const felicidadeCompat = felicidadeCount > 0 ? Math.round(felicidadeSomaCompat / felicidadeCount) : 0;
  const novaFelicidade = Math.max(0, Math.min(100, Math.round(
    felicidadeBase*0.5 + smAtual*0.3 + felicidadeCompat + 25*0.2
  )));

  updatesJogador.saude_mental = smAtual;
  updatesJogador.felicidade = novaFelicidade;

  // ── Filhos: envelhecer e cobrar custo ──
  const filhosSnap = await db.collection('jogadores').doc(uid).collection('filhos').get();
  let custoFilhos = 0;
  for (const fDoc of filhosSnap.docs) {
    const f = fDoc.data();
    const idadeMesesAtual = f.idade_meses!==undefined ? f.idade_meses : Math.round((f.idade||0)*12);
    const novaIdadeMeses = idadeMesesAtual + 1;
    const idadeAnosCompletos = Math.floor(novaIdadeMeses/12);

    custoFilhos += custoFilhoPorIdadeCF(Math.floor(idadeMesesAtual/12));
    const upd = { idade_meses: novaIdadeMeses, idade: idadeAnosCompletos };

    if (idadeAnosCompletos >= 18 && !f.faculdade) {
      upd.faculdade = Math.random() < 0.3 ? 'Direito' : ['Medicina','Engenharia','Administração'][Math.floor(Math.random()*3)];
    }
    if (idadeAnosCompletos >= 22 && f.faculdade === 'Direito' && !f.jogavel) {
      upd.jogavel = true;
    }
    await db.collection('jogadores').doc(uid).collection('filhos').doc(fDoc.id).update(upd);
  }
  updatesJogador.custo_filhos_mes = custoFilhos;

  if (Object.keys(updatesJogador).length > 0) {
    await db.collection('jogadores').doc(uid).update(updatesJogador);
  }
}

async function _gerarFilhoCF(db, uid, relacionamento) {
  const sexo = Math.random() < 0.5 ? 'm' : 'f';
  const nome = NOMES_BEBE_CF[sexo][Math.floor(Math.random()*NOMES_BEBE_CF[sexo].length)];

  await db.collection('jogadores').doc(uid).collection('filhos').add({
    nome, sexo, idade:0, idade_meses:0,
    mae_ou_pai: relacionamento.nome,
    faculdade: null, jogavel:false,
    criado_em: new Date().toISOString(),
  });

  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de:'sistema', para_uid:uid,
    assunto:`👶 ${nome} nasceu!`,
    corpo:`Parabéns! ${nome} nasceu. +10 saúde mental, +20 felicidade nos próximos meses.`,
    tipo:'sistema', tipo_noticia:'positivo', lida:false, criado_em:new Date().toISOString(),
  });
}
