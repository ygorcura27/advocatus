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
      const escRefProprio = db.collection('escritorios').doc(j.escritorio_proprio_id);
      await escRefProprio.update({ faturamento_mes_atual: 0 });
      const funcSnap = await escRefProprio
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

  // ── Burnout recalibrado por energia restante ─────────────────────
  // Energia restante = total - gasta (sem bônus de academia, conservativo)
  const energiaRestante = Math.max(0, ENERGIA_TOTAL - energiaGasta);

  if (!j.em_burnout) {
    // Verificar exaustão (10-15 restantes) — não acumula com burnout
    if (energiaRestante >= 10 && energiaRestante <= 15) {
      const novosExaustao = (j.meses_exaustao || 0) + 1;
      updates.meses_exaustao = novosExaustao;
      if (novosExaustao >= 3) {
        // Penalidade: -5 energia por 3 meses
        updates.penalidade_energia_ate = mesGlobal + 3;
        updates.penalidade_energia_val = (j.penalidade_energia_val || 0) + 5;
        updates.meses_exaustao = 0;
        mensagens.push({
          assunto: '😓 Exaustão',
          corpo: '3 meses seguidos com pouca energia. -5⚡ de energia disponível pelos próximos 3 meses.',
          tipo: 'urgente',
        });
      }
    } else if (energiaRestante > 15) {
      updates.meses_exaustao = 0;
    }

    // Verificar burnout (0-10 restantes por 3 meses consecutivos)
    if (energiaRestante <= 10) {
      const novosBaixa = (j.meses_baixa_energia || 0) + 1;
      updates.meses_baixa_energia = novosBaixa;
      if (novosBaixa >= 3) {
        updates.em_burnout          = true;
        updates.meses_baixa_energia = 0;
        updates.meses_recuperacao   = 0;
        updates.meses_exaustao      = 0;
        mensagens.push({
          assunto: '🔴 Burnout Total',
          corpo: '3 meses seguidos com energia crítica (0-10⚡). Você entrou em burnout. Precise de 3 meses com >10⚡ restantes para se recuperar.',
          tipo: 'urgente',
        });
      }
    } else {
      updates.meses_baixa_energia = 0;
    }
  } else {
    // Em burnout — verificar recuperação (3 meses consecutivos com >10 restantes)
    if (energiaRestante > 10) {
      const novosRec = (j.meses_recuperacao || 0) + 1;
      updates.meses_recuperacao = novosRec;
      if (novosRec >= 3) {
        updates.em_burnout        = false;
        updates.meses_recuperacao = 0;
        saudeMental = Math.max(30, saudeMental);
        mensagens.push({
          assunto: '✅ Recuperado do Burnout',
          corpo: '3 meses com energia saudável. Você se recuperou do burnout!',
          tipo: 'positivo',
        });
      }
    } else {
      updates.meses_recuperacao = 0;
    }
  }

  // Remover penalidade de energia quando vencer
  if (j.penalidade_energia_ate && mesGlobal > j.penalidade_energia_ate) {
    updates.penalidade_energia_ate = null;
    updates.penalidade_energia_val = 0;
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

  // ── PROCESSAMENTO MENSAL DE SERVIÇOS/CLIENTES (bloco novo) ──
  // Reset do bug "função existe mas nunca é chamada", idêntico aos casos
  // de cursos e relacionamentos: servicos.js::processarServicosMensal era
  // exposta como window._processarServicosMensal "chamada pelo
  // avancar_mes.js", mas nunca havia chamada real aqui. Resultado
  // prático: nenhuma oportunidade nova era gerada após o mês inicial do
  // escritório, clientes recorrentes nunca eram cobrados, e a tela
  // "Clientes" ficava sempre vazia (0 disponíveis) depois do primeiro mês.
  try {
    await _processarServicosMensalCF(db, uid, { ...j, mes_pessoal: novoMes, ano_pessoal: novoAno });
  } catch (e) {
    logger.warn('Erro no processamento mensal de serviços/clientes:', e.message);
  }

  // ── PROCESSAMENTO MENSAL DE CURSOS (bloco novo) ──
  // Reset do bug "função existe mas nunca é chamada", idêntico ao caso de
  // relacionamentos: carreira.js::processarCursosMensal era exposta como
  // window._processarCursosMensal "chamada pelo avancar_mes.js", mas
  // nunca havia chamada real aqui (Admin SDK não tem window.* mesmo que
  // houvesse). Resultado prático: matrículas nunca eram avaliadas, cursos
  // nunca aprovavam/reprovavam de fato. Precisa rodar ANTES do bloco de
  // relacionamentos abaixo, pois o bônus de afinidade do traço 'academica'
  // depende de saber se um curso foi aprovado NESTE mesmo mês.
  try {
    await _processarCursosMensalCF(db, uid, { ...j, mes_pessoal: novoMes, ano_pessoal: novoAno });
  } catch (e) {
    logger.warn('Erro no processamento mensal de cursos:', e.message);
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
    await _processarRelacionamentosMensalCF(db, uid, j, { mes_pessoal: novoMes, ano_pessoal: novoAno }, updates.idade);
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
// SISTEMA FINANCEIRO (CORRIGIDO: FOCO NO SALDO ACUMULADO)
// ════════════════════════════════════════════════════════
function _processarFinanceiro(j, novoDinheiro, saldoMes) {
  const updates = {};
  let msg       = null;
  const rep     = j.reputacao || 30;

  // IMPORTANTE: O Serasa e a contagem de meses negativos devem olhar para o 
  // Saldo Acumulado Real (o dinheiro atual do jogador após o processamento do mês)
  const saldoRealAcumulado = novoDinheiro; 

  if (saldoRealAcumulado < 0) {
    // Só entra aqui se o jogador REALMENTE estiver devendo (sem dinheiro em conta)
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
    // Se o saldo real acumulado for positivo (mesmo que o mês isolado tenha sido negativo),
    // o jogador está seguro, pois possui reservas financeiras para cobrir o custo.
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
const MATERIALISTA_TOLERANCIA_REL = { meses_tolerancia: 6, perda_afinidade_mes: 10 };

// Efeitos mecânicos de traço — espelho de js/relacionamento_dados.js::EFEITO_TRACO.
// Ver o comentário da seção acima sobre duplicação manual entre ES Module
// (frontend) e Cloud Function (CommonJS): qualquer ajuste de balanceamento
// feito lá precisa ser replicado aqui manualmente.
const EFEITO_TRACO_REL = {
  academica:    { afinidade_curso_concluido: 5 },
  ambiciosa:    { afinidade_promocao: 4, afinidade_sem_evolucao_12m: -5 },
  caseira:      { limite_energia_mes: 80, afinidade_excesso_energia: -4 },
  aventureira:  { exige_viagem_por_ano: true, afinidade_sem_viagem_ano: -5,
                   afinidade_viagem_nacional_extra: 5, afinidade_viagem_internacional_extra: 10 },
  romantica:    { multiplicador_ganho: 1.20, multiplicador_dano_sm_termino: 1.50 },
  independente: { multiplicador_decaimento: 0.50 },
  ciumenta:     { chance_evento_mensal: 0.02, chance_termino_evento: 0.15 },
  materialista: { afinidade_aniversario_sem_presente: -10, afinidade_presente: 10, multiplicador_custo_eventos: 1.20 },
  familiar:     { afinidade_nascimento: 15, idade_limite_sem_filhos: 30, afinidade_mes_sem_filhos_apos_limite: -10 },
  conservadora: { prazo_ideal_anos_namoro: 2, afinidade_mes_apos_prazo_sem_proposta: -5 },
  moderna:      { isenta_penalidade_tempo: true },
  carente:      { multiplicador_ganho: 1.25, multiplicador_perda: 1.50 },
  competitiva:  { afinidade_promocao: 8, afinidade_sem_evolucao_12m: -5 },
};

/** Soma os efeitos de todos os traços presentes na lista (ex.: ['ambiciosa','competitiva'] empilham afinidade_promocao). */
function _efeitosDosTracos(tracos) {
  const efeitos = (tracos||[]).map(t => EFEITO_TRACO_REL[t]).filter(Boolean);
  return efeitos;
}

/** Libera/trava o lock global do NPC (npcs_locks/{npcId}) — equivalente
 * Admin SDK das funções homônimas em js/relacionamento.js (frontend). */
async function _liberarNpcCF(db, npcId) {
  if (!npcId) return;
  try {
    await db.collection('npcs_locks').doc(npcId).update({
      status: 'disponivel', jogador_uid: null, relacionamento_id: null,
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    // Lock pode não existir ainda em dados antigos (relacionamentos criados
    // antes desta feature, sem npc_id salvo) — não é erro fatal.
  }
}
async function _marcarNpcEmTempoCF(db, npcId, uid, relId) {
  if (!npcId) return;
  try {
    await db.collection('npcs_locks').doc(npcId).update({
      status: 'tempo', jogador_uid: uid, relacionamento_id: relId,
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    // idem
  }
}

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

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL DE CURSOS — portado de
// carreira.js::processarCursosMensal (frontend, ES Module, com o mesmo
// comentário "Chamado pelo avancar_mes.js todo mês" que nunca foi de fato
// implementado — idêntico ao bug já corrigido para relacionamentos).
// Verifica matrículas que completaram a duração, decide aprovação
// (>=75% de frequência) e aplica os ganhos de skill.
//
// NOVO: ao aprovar um curso, aplica o bônus de afinidade do traço
// 'academica' nas NPCs ativas que o tenham (EFEITO_TRACO_REL.academica
// .afinidade_curso_concluido) — mesmo conceito de "evolução pessoal
// reconhecida pela parceira" já usado para Ambiciosa/Competitiva com
// promoções de carreira.
// ════════════════════════════════════════════════════════
const CURSOS_REL = [
  {id:'arb',  n:'Curso de Arbitragem',         sem:6,  sk:'negociacao',  b:25, sk2:'persuasao',    b2:15},
  {id:'mba',  n:'MBA Compliance Corporativo',  sem:16, sk:'gestao',      b:30, sk2:'networking',   b2:10},
  {id:'llm',  n:'LLM Direito Tributário',      sem:12, sk:'pesquisa',    b:30, sk2:'argumentacao', b2:15},
  {id:'int',  n:'Tributação Internacional',    sem:8,  sk:'pesquisa',    b:20, sk2:'negociacao',   b2:10},
  {id:'lit',  n:'Litigância Estratégica',      sem:4,  sk:'oratoria',    b:22, sk2:'persuasao',    b2:18},
  {id:'crf',  n:'Especialização CARF/TRF',     sem:10, sk:'argumentacao',b:25, sk2:'pesquisa',     b2:15},
  {id:'ges',  n:'MBA Gestão de Escritório',    sem:12, sk:'gestao',      b:30, sk2:'networking',   b2:12},
  {id:'esc',  n:'Escrita Jurídica Avançada',   sem:5,  sk:'escrita',     b:25, sk2:'argumentacao', b2:10},
  {id:'juri', n:'Tribunal do Júri — Plenário', sem:3,  sk:'oratoria',    b:20, sk2:'persuasao',    b2:20},
];
const SK_LABEL_REL = {
  oratoria:'Oratória', argumentacao:'Argumentação', escrita:'Escrita Jurídica',
  pesquisa:'Pesquisa/Leg.', negociacao:'Negociação', persuasao:'Persuasão',
  gestao:'Gestão', networking:'Networking',
};

function mesTotalPessoalCF(j) {
  return (j.ano_pessoal||1)*12 + (j.mes_pessoal||0);
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL DE SERVIÇOS/CLIENTES — portado de
// servicos.js::processarServicosMensal (frontend, ES Module, exposta
// como window._processarServicosMensal "chamada pelo avancar_mes.js" —
// mesmo padrão de bug já corrigido para relacionamentos e cursos:
// window.* não existe na Cloud Function (Admin SDK, sem DOM/window), e
// nunca havia chamada real aqui. Resultado prático do bug: nenhuma
// oportunidade de serviço era gerada após o primeiro mês do escritório,
// nenhum cliente recorrente era cobrado, e nenhuma demanda automática de
// empresa contratada disparava — a tela "Clientes" ficava sempre vazia
// depois do mês inicial.
// ════════════════════════════════════════════════════════
const TIPOS_SERVICO_REL = {
  consulta:    { energia:5,  valor_min:200,  valor_max:2000,  confianca:5,  chance_processo:0.10 },
  parecer:     { energia:10, valor_min:1000, valor_max:20000, confianca:10, chance_processo:0.20 },
  contrato:    { energia:5,  valor_min:500,  valor_max:15000, confianca:15, chance_processo:0 },
  notificacao: { energia:3,  valor_min:300,  valor_max:5000,  confianca:8,  chance_processo:0.20 },
  cobranca:    { energia:5,  valor_min:0,    valor_max:0,     confianca:10, chance_processo:0.15, pct_min:0.05, pct_max:0.20 },
};
const OPORTUNIDADES_POR_TIER_REL = {
  1: { min:1,  max:3  }, 2: { min:2,  max:5  }, 3: { min:4,  max:8  },
  4: { min:8,  max:15 }, 5: { min:15, max:30 },
};
const NOMES_CLIENTE_PF_REL = [
  'Roberto Almeida','Sandra Lopes','Marcelo Tavares','Cristina Souza','Eduardo Ramos',
  'Fernanda Castro','Paulo Henrique Dias','Juliana Mendes','Sérgio Nogueira','Patrícia Aguiar',
  'André Luiz Barros','Vanessa Pinheiro','Ricardo Monteiro','Beatriz Cunha','Marcos Vinícius Reis',
];
const NOMES_CLIENTE_PJ_REL = {
  micro: ['Padaria Pão Dourado ME','Salão Bela Vista','Oficina São Jorge','Mercadinho Bom Preço',
          'Estúdio Foto Arte','Clínica Odonto Sorriso ME'],
  pequena: ['Distribuidora Rio Verde Ltda','Construtora Alves & Filhos','Restaurante Sabor Carioca',
            'Transportadora Vitória Ltda','Confecções Moda Brasil'],
  media: ['Indústria Metalúrgica Atlântico','Rede de Farmácias VidaSaúde','Supermercados Boa Compra',
          'Construtora Horizonte S/A','Grupo Educacional Saber'],
  grande: ['Conglomerado Industrial Cariri S/A','Rede Varejista Nacional Maxx','Holding Financeira Atlas',
           'Grupo Logístico TransBrasil','Indústria Petroquímica Sul'],
};
const FAIXA_RECORRENTE_REL = {
  pf:      { min:100,   max:1000   },
  micro:   { min:1000,  max:3000   },
  pequena: { min:3000,  max:10000  },
  media:   { min:10000, max:30000  },
  grande:  { min:30000, max:100000 },
};
const LIMITE_EMPRESAS_TIER_REL = { 1:1, 2:3, 3:5, 4:10, 5:20 };
const CHANCE_DEMANDA_AUTOMATICA_REL = { micro:0.05, pequena:0.10, media:0.15, grande:0.20 };
const CONFIANCA_INICIAL_REL = 50;
const CONFIANCA_RECORRENTE_MIN_REL = 70;
const PRODUTIVIDADE_CARGO_REL = { est:0.10, ass:0.20, jnr:0.30, pln:0.40, snr:0.50, asc:0.70, soc:1.00, socn:1.00 };

function _modificadorNetworkingCF(networking) {
  if (networking >= 81) return 1.00;
  if (networking >= 61) return 0.50;
  if (networking >= 41) return 0.25;
  if (networking >= 21) return 0.10;
  return 0;
}
function _multiplicadorPrestigioCF(prestigioPct) {
  if (prestigioPct >= 90) return 3.0;
  if (prestigioPct >= 70) return 2.0;
  if (prestigioPct >= 40) return 1.5;
  return 1.0;
}
function _portePorTierCF(tier) {
  const pesos = {
    1: { micro:0.7, pequena:0.3 },
    2: { micro:0.4, pequena:0.4, media:0.2 },
    3: { micro:0.2, pequena:0.4, media:0.3, grande:0.1 },
    4: { micro:0.1, pequena:0.3, media:0.4, grande:0.2 },
    5: { micro:0.05,pequena:0.2, media:0.35,grande:0.4 },
  }[tier] || { micro:0.7, pequena:0.3 };
  const r = Math.random();
  let acc = 0;
  for (const [porte, peso] of Object.entries(pesos)) {
    acc += peso;
    if (r <= acc) return porte;
  }
  return 'micro';
}
function _gerarOportunidadeCF(tier, prestigioPct) {
  const tiposKeys = Object.keys(TIPOS_SERVICO_REL);
  const tipoKey   = tiposKeys[Math.floor(Math.random()*tiposKeys.length)];
  const tipo      = TIPOS_SERVICO_REL[tipoKey];
  const ehPJ = Math.random() < 0.5;
  const porte = ehPJ ? _portePorTierCF(tier) : null;
  const cliente_nome = ehPJ
    ? NOMES_CLIENTE_PJ_REL[porte][Math.floor(Math.random()*NOMES_CLIENTE_PJ_REL[porte].length)]
    : NOMES_CLIENTE_PF_REL[Math.floor(Math.random()*NOMES_CLIENTE_PF_REL.length)];
  const mult = _multiplicadorPrestigioCF(prestigioPct);
  let valor;
  if (tipoKey === 'cobranca') {
    const valorRecuperar = 5000 + Math.floor(Math.random()*95000);
    const pct = tipo.pct_min + Math.random()*(tipo.pct_max-tipo.pct_min);
    valor = Math.floor(valorRecuperar * pct * mult);
  } else {
    valor = Math.floor((tipo.valor_min + Math.random()*(tipo.valor_max-tipo.valor_min)) * mult);
  }
  return {
    tipo: tipoKey, cliente_nome, cliente_tipo: ehPJ?'PJ':'PF', cliente_porte: porte,
    valor, energia: tipo.energia, confianca_gerada: tipo.confianca,
    chance_gerar_processo: tipo.chance_processo || 0,
    criado_em: new Date().toISOString(),
  };
}
function _valorContratoRecorrenteCF(clienteTipo, porte) {
  const faixa = clienteTipo === 'PF' ? FAIXA_RECORRENTE_REL.pf : (FAIXA_RECORRENTE_REL[porte] || FAIXA_RECORRENTE_REL.micro);
  return Math.floor(faixa.min + Math.random()*(faixa.max-faixa.min));
}

async function _gerarProcessoAutomaticoCF(db, j, oportunidade) {
  const AREAS_SERVICO = {
    consulta:'civil', parecer:'tributario', contrato:'empresarial',
    notificacao:'civil', cobranca:'civil',
  };
  const area = AREAS_SERVICO[oportunidade.tipo] || 'civil';
  const valorCausa = oportunidade.valor * (3 + Math.random()*5);

  await db.collection('processos').add({
    numero: `${String(Math.floor(Math.random()*9999999)).padStart(7,'0')}-${String(Math.floor(Math.random()*99)).padStart(2,'0')}.${j.ano_pessoal||1}.8.19.0001`,
    tipo: 'Ação decorrente de ' + oportunidade.tipo,
    area, tipo_processo: 'judicial',
    autor: j.nome_personagem || 'Advogado', reu: oportunidade.cliente_nome,
    tribunal: 'TJRJ', advogado_uid: j.uid, escritorio_id: j.escritorio_proprio_id||null,
    status:'andamento', instancia:1, progresso:0, chance_sucesso:55,
    valor: Math.floor(valorCausa), nivel:5, hon_total_acumulado:0,
    urgente:false, recurso_pendente:false,
    criado_mes: j.mes_pessoal||0, encerrado_mes:null,
  });
}

async function _processarServicosMensalCF(db, uid, j) {
  const escId = j.escritorio_proprio_id;
  if (!escId) return;

  const escRef  = db.collection('escritorios').doc(escId);
  const escSnap = await escRef.get();
  if (!escSnap.exists) return;
  const esc  = escSnap.data();
  const tier = esc.tier || 1;

  const oldOpSnap = await escRef.collection('oportunidades').where('status','==','disponivel').get();
  await Promise.all(oldOpSnap.docs.map(d => d.ref.delete()));

  const faixa = OPORTUNIDADES_POR_TIER_REL[tier] || OPORTUNIDADES_POR_TIER_REL[1];
  const networking = j.networking || 10;
  const cap = REP_CAP[j.cargo_id] || 45;
  const prestigioPct = Math.min(100, Math.round((j.reputacao||0)/cap*100));

  const modNet = _modificadorNetworkingCF(networking);
  const qtdBase = faixa.min + Math.floor(Math.random()*(faixa.max-faixa.min+1));
  const qtd = Math.round(qtdBase * (1+modNet));

  for (let i=0; i<qtd; i++) {
    const op = _gerarOportunidadeCF(tier, prestigioPct);
    await escRef.collection('oportunidades').add({ ...op, status:'disponivel' });
  }

  await _processarAutogestaoOportunidadesCF(db, escRef, esc);

  let receitaRecorrente = 0;
  const clRecSnap = await escRef.collection('clientes').where('recorrente','==',true).get();
  for (const cDoc of clRecSnap.docs) {
    receitaRecorrente += cDoc.data().valor_mensal || 0;
  }

  if (receitaRecorrente > 0) {
    if (j.escritorio_proprio_id) {
      await escRef.update({
        caixa: (esc.caixa||0) + receitaRecorrente,
        faturamento_mes_atual: (esc.faturamento_mes_atual||0) + receitaRecorrente,
      });
    } else {
      await db.collection('jogadores').doc(uid).update({
        dinheiro: (j.dinheiro||0) + receitaRecorrente,
        honorarios_mes: (j.honorarios_mes||0) + receitaRecorrente,
      });
    }
  }

  for (const cDoc of clRecSnap.docs) {
    const c = cDoc.data();
    if (c.tipo !== 'PJ' || !c.porte) continue;
    const chance = CHANCE_DEMANDA_AUTOMATICA_REL[c.porte] || 0.05;
    if (Math.random() < chance) {
      await _gerarProcessoAutomaticoCF(db, { ...j, uid }, { tipo:'parecer', cliente_nome:c.nome, valor: c.valor_mensal*10 });
    }
  }
}

async function _processarAutogestaoOportunidadesCF(db, escRef, esc) {
  const fSnap = await escRef.collection('funcionarios').get();
  const advogadosAtivos = fSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(f => ['jnr','pln','snr'].includes(f.cargo_id) && f.ativo!==false);

  if (advogadosAtivos.length === 0) return;

  const opSnap = await escRef.collection('oportunidades').where('status','==','disponivel').get();

  let caixaGanho = 0;
  let resolvidas = 0;

  for (const opDoc of opSnap.docs) {
    const op = opDoc.data();
    const capacidadeTotal = advogadosAtivos.length * 2;
    if (resolvidas >= capacidadeTotal) break;

    const advogadorResolvedor = advogadosAtivos[resolvidas % advogadosAtivos.length];
    const valorRecebido = Math.floor(op.valor * 1.0);

    caixaGanho += valorRecebido;
    resolvidas++;

    await opDoc.ref.update({
      status:'concluido', valor_recebido:valorRecebido, executor:advogadorResolvedor.nome+' (autogestão)',
    });

    const clSnap = await escRef.collection('clientes').where('nome','==',op.cliente_nome).get();
    if (clSnap.empty) {
      await escRef.collection('clientes').add({
        nome: op.cliente_nome, tipo: op.cliente_tipo, porte: op.cliente_porte||null,
        confianca: CONFIANCA_INICIAL_REL + (op.confianca_gerada||0),
        recorrente:false, valor_mensal:0, criado_em:new Date().toISOString(),
      });
    } else {
      const cDoc=clSnap.docs[0]; const c=cDoc.data();
      await cDoc.ref.update({
        confianca: Math.min(100,(c.confianca||50)+(op.confianca_gerada||0)),
      });
    }
  }

  if (caixaGanho > 0) {
    await escRef.update({ caixa: (esc.caixa||0) + caixaGanho });
  }
}

async function _processarCursosMensalCF(db, uid, j) {
  const matriculas = j.cursos_matriculas || {};
  let cursosFeitos = [...(j.cursos_feitos||[])];
  let updatesSkills = {};
  let mudou = false;
  let notificacoes = [];
  let cursoAprovadoNesteMs = false;

  for (const [cursoId, m] of Object.entries(matriculas)) {
    if (m.status !== 'em_andamento') continue;
    const c = CURSOS_REL.find(x => x.id === cursoId);
    if (!c) continue;

    const mesesPassados = mesTotalPessoalCF(j) - m.mes_total_inicio;
    if (mesesPassados < c.sem) continue; // ainda não terminou a duração

    const frequencia = (m.presencas||0) / c.sem;
    if (frequencia >= 0.75) {
      const cap = REP_CAP[j.cargo_id] || 55;
      const sk1 = Math.min(cap, ((j.skills||{})[c.sk]||0) + c.b);
      const sk2 = Math.min(cap, ((j.skills||{})[c.sk2]||0) + c.b2);
      updatesSkills[`skills.${c.sk}`] = sk1;
      updatesSkills[`skills.${c.sk2}`] = sk2;
      cursosFeitos.push(cursoId);
      m.status = 'concluido';
      cursoAprovadoNesteMs = true;
      notificacoes.push({
        assunto: `🎓 Aprovado: ${c.n}`,
        corpo: `Você concluiu o curso com ${Math.round(frequencia*100)}% de frequência! +${c.b} ${SK_LABEL_REL[c.sk]} · +${c.b2} ${SK_LABEL_REL[c.sk2]}.`,
        tipo: 'positivo',
      });
    } else {
      m.status = 'reprovado';
      notificacoes.push({
        assunto: `❌ Reprovado: ${c.n}`,
        corpo: `Frequência de apenas ${Math.round(frequencia*100)}% — abaixo dos 75% exigidos. Você não foi aprovado e perdeu o investimento.`,
        tipo: 'negativo',
      });
    }
    mudou = true;
  }

  if (mudou) {
    await db.collection('jogadores').doc(uid).update({
      cursos_matriculas: matriculas,
      cursos_feitos: cursosFeitos,
      ...updatesSkills,
    });
    for (const n of notificacoes) {
      await db.collection('jogadores').doc(uid).collection('inbox').add({
        de:'sistema', para_uid:uid, assunto:n.assunto, corpo:n.corpo,
        tipo:'sistema', tipo_noticia:n.tipo, lida:false, criado_em:new Date().toISOString(),
      });
    }
  }

  // ── Acadêmica: bônus de afinidade nas NPCs ativas com esse traço, ao
  // concluir (aprovar) qualquer curso neste mês. ──
  if (cursoAprovadoNesteMs) {
    try {
      const relSnap = await db.collection('jogadores').doc(uid).collection('relacionamentos')
        .where('ativo', '==', true).get();
      for (const relDoc of relSnap.docs) {
        const r = relDoc.data();
        const tracos = r.tracos || [];
        if (!tracos.includes('academica')) continue;
        const estagio = ESTAGIOS_REL[r.estagio] || ESTAGIOS_REL.affair;
        const bonus = EFEITO_TRACO_REL.academica.afinidade_curso_concluido;
        const novaAfinidade = Math.min(estagio.cap, (r.afinidade||0) + bonus);
        await relDoc.ref.update({ afinidade: novaAfinidade });
      }
    } catch (e) {
      logger.warn('Erro ao aplicar bônus de Acadêmica por curso concluído:', e.message);
    }
  }
}


async function _processarRelacionamentosMensalCF(db, uid, j, novoCalendario, novaIdadeJogador) {
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

  // Busca de filhos UMA VEZ (fora do loop) para a checagem de Familiar
  // ("sem filhos COM ELA após os 30") — evita N queries redundantes para
  // N relacionamentos ativos. Monta um Set de relacionamento_id que já
  // geraram filho, para lookup O(1) dentro do loop abaixo.
  const filhosSnapParaChecagem = await db.collection('jogadores').doc(uid).collection('filhos').get();
  const relacionamentosComFilho = new Set(
    filhosSnapParaChecagem.docs.map(d => d.data().relacionamento_id).filter(Boolean)
  );

  const numAffairs = rels.filter(r => r.estagio === 'affair').length;
  const temNamoradaOuMais = rels.some(r => r.estagio !== 'affair');
  let smDelta = 0;
  let felicidadeSomaCompat = 0, felicidadeCount = 0;
  const mesTotalAtual = (novoCalendario.ano_pessoal||1)*12 + (novoCalendario.mes_pessoal||0);

  // Idade do jogador SUBIU este mês? (mesmo gatilho de updates.idade no
  // callable principal: 22 + Math.floor(mesGlobal/12), recalculada todo
  // mês mas só muda de VALOR nos meses-aniversário). Se sim, é o mesmo
  // "mês-aniversário" em que as NPCs namoradas também envelhecem +1.
  const idadeSubiuEsteMes = typeof novaIdadeJogador === 'number'
    && novaIdadeJogador > (j.idade || 22);

  for (const r of rels) {
    // Guarda de idempotência: evita processar duas vezes o mesmo mês de
    // jogo se a function rodar mais de uma vez (ex.: retry de rede).
    if (r._mes_processado === mesTotalAtual) continue;

    const estagio = ESTAGIOS_REL[r.estagio] || ESTAGIOS_REL.affair;
    const upd = { _mes_processado: mesTotalAtual };
    const tracos = r.tracos || [];
    const efeitos = _efeitosDosTracos(tracos);

    // ── Idade da NPC: sobe +1 no MESMO mês-aniversário do jogador ──
    // (só se ela já tiver um campo de idade salvo — relacionamentos
    // criados antes desta feature podem não ter; nesse caso não
    // inventamos uma idade do zero aqui, fica para uma migração futura).
    if (idadeSubiuEsteMes && typeof r.idade === 'number') {
      upd.idade = r.idade + 1;
    }

    // ── Decaimento, ajustado por Independente (-50%) ──
    let decaimento = estagio.decai;
    for (const e of efeitos) if (e.multiplicador_decaimento !== undefined) decaimento *= e.multiplicador_decaimento;
    if (!r._ganho_mes_atual) {
      upd.afinidade = Math.max(0, (r.afinidade||0) - Math.round(decaimento));
    }
    // ESTE é o reset que faltava — sem ele, GANHO_MAX_MENSAL (25) era
    // atingido uma vez e nunca mais liberava novas interações com aquela
    // pessoa, em nenhum mês futuro.
    upd._ganho_mes_atual = 0;
    upd._meses = (r._meses||0) + 1;

    // ── Sexo: tolerância e penalidades ──
    let mesesSemSexo = r.sexo_mes_atual ? 0 : (r.meses_sem_sexo||0) + 1;
    upd.meses_sem_sexo = mesesSemSexo;
    upd.sexo_mes_atual = false;
    if (mesesSemSexo >= SEXO_CONFIG_REL.meses_tolerancia) {
      smDelta -= SEXO_CONFIG_REL.perda_saude_mental_mes;
      upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) - SEXO_CONFIG_REL.perda_afinidade_mes);
    }

    // ── Materialista: tolerância de "tempo sem presente" — incrementa o
    // contador todo mês (resetado para 0 em relacionamento.js::darPresente
    // sempre que o jogador dá qualquer presente); a partir do limite de
    // tolerância, penaliza por mês até receber outro. Simplificação
    // deliberada (sem vínculo a aniversário específico — ver decisão de
    // design registrada na conversa que introduziu este sistema). ──
    if (tracos.includes('materialista')) {
      const mesesSemPresente = (r.meses_sem_presente||0) + 1;
      upd.meses_sem_presente = mesesSemPresente;
      if (mesesSemPresente >= MATERIALISTA_TOLERANCIA_REL.meses_tolerancia) {
        upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) - MATERIALISTA_TOLERANCIA_REL.perda_afinidade_mes);
      }
    }

    // ── Conservadora: penaliza se passou do prazo ideal de namoro sem proposta ──
    // (afeta apenas estágio 'namorado' — 'noivo'/'esposo' já progrediram).
    if (r.estagio === 'namorado') {
      for (const e of efeitos) {
        if (e.prazo_ideal_anos_namoro !== undefined) {
          const mesesNoEstagio = r._meses || 0;
          const prazoMeses = e.prazo_ideal_anos_namoro * 12;
          if (mesesNoEstagio > prazoMeses) {
            upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) + e.afinidade_mes_apos_prazo_sem_proposta);
          }
        }
      }
    }

    // ── Familiar: penaliza se o JOGADOR passou dos 30 sem filhos COM ELA ──
    // (checa especificamente este relacionamento via relacionamentosComFilho,
    // montado uma vez no início da função — não basta o jogador ter filho
    // com OUTRA pessoa, a NPC familiar quer um filho DELA).
    for (const e of efeitos) {
      if (e.idade_limite_sem_filhos !== undefined) {
        const idadeJogadorAtual = novaIdadeJogador ?? j.idade ?? 22;
        const temFilhoComEla = relacionamentosComFilho.has(r.id);
        if (idadeJogadorAtual > e.idade_limite_sem_filhos && !temFilhoComEla) {
          upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) + e.afinidade_mes_sem_filhos_apos_limite);
        }
      }
    }

    // ── Ambiciosa/Competitiva: penaliza se o jogador está há 12+ meses
    // sem promoção (ver carreira.js::promover, que grava
    // ultima_promocao_mes_total a cada vez que sobe de cargo). Os efeitos
    // EMPILHAM, simétrico ao bônus de promoção. ──
    {
      let penalidadeSemEvolucao = 0;
      for (const e of efeitos) {
        if (e.afinidade_sem_evolucao_12m !== undefined) penalidadeSemEvolucao += e.afinidade_sem_evolucao_12m;
      }
      if (penalidadeSemEvolucao !== 0) {
        const ultimaPromoMes = j.ultima_promocao_mes_total ?? 0; // 0 = nunca foi promovido (conta desde o início)
        const mesesSemEvoluir = mesTotalAtual - ultimaPromoMes;
        if (mesesSemEvoluir >= 12) {
          upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) + penalidadeSemEvolucao);
        }
      }
    }

    // ── Aventureira: checagem ANUAL (só no mês-aniversário) se viajou ──
    // Hook conectado: relacionamento.js::interagirRelacionamento grava
    // viajou_no_ano=true sempre que o jogador faz viagem_nac ou viagem_int
    // com QUALQUER NPC (não precisa ser ela mesma viajando — é o jogador
    // que viaja, com ela ou com outra pessoa, dado que o estado de "viajou
    // este ano" é por relacionamento individual). Se o relacionamento foi
    // criado ANTES desta feature (sem o campo gravado), `r.viajou_no_ano`
    // vem `undefined` e a checagem é pulada — evita penalizar dados
    // antigos por uma migração que não rodou.
    const ehAventureira = tracos.includes('aventureira');
    if (ehAventureira && idadeSubiuEsteMes && r.viajou_no_ano !== undefined) {
      if (!r.viajou_no_ano) {
        upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) + EFEITO_TRACO_REL.aventureira.afinidade_sem_viagem_ano);
      }
      upd.viajou_no_ano = false; // reseta o contador para o novo ano, em qualquer caso
    }

    // ── Gravidez ──
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
        // Familiar: bônus de afinidade no nascimento
        for (const e of efeitos) {
          if (e.afinidade_nascimento !== undefined) {
            upd.afinidade = Math.min(estagio.cap, (upd.afinidade ?? r.afinidade) + e.afinidade_nascimento);
          }
        }
      } else {
        upd.mes_gravidez = novoMesGrav;
      }
    }

    // ── Ciumenta: evento mensal de conflito, com chance de virar término ──
    // (independente do fluxo de tempo/término "natural" abaixo — checado
    // primeiro porque é mais específico ao traço).
    let ciumentaTerminou = false;
    for (const e of efeitos) {
      if (e.chance_evento_mensal !== undefined && Math.random() < e.chance_evento_mensal) {
        if (Math.random() < e.chance_termino_evento) {
          upd.ativo = false;
          smDelta -= IMPACTO_SM_REL.termino[r.estagio] || 10;
          ciumentaTerminou = true;
          await db.collection('jogadores').doc(uid).collection('inbox').add({
            de:'sistema', para_uid:uid,
            assunto:'😒 Ciúmes descontrolado',
            corpo:`${r.nome} terminou com você após uma crise de ciúmes.`,
            tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
          });
        } else {
          upd.afinidade = Math.max(0, (upd.afinidade ?? r.afinidade) - 5);
          await db.collection('jogadores').doc(uid).collection('inbox').add({
            de:'sistema', para_uid:uid,
            assunto:'😒 Crise de ciúmes',
            corpo:`${r.nome} teve uma crise de ciúmes este mês. -5 afinidade.`,
            tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
          });
        }
      }
    }

    // ── Flagra de affair / término ou tempo "natural" ──
    // (pulado se a Ciumenta já encerrou o relacionamento este mês).
    if (ciumentaTerminou) {
      // já tratado acima — não roda os outros ramos de término/tempo.
    } else if (temNamoradaOuMais && r.estagio !== 'affair' && numAffairs > 0) {
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
      let danoTermino = IMPACTO_SM_REL.termino[r.estagio] || 10;
      // Romântica: término dói 50% mais na saúde mental do jogador.
      for (const e of efeitos) if (e.multiplicador_dano_sm_termino !== undefined) danoTermino *= e.multiplicador_dano_sm_termino;
      smDelta -= Math.round(danoTermino);
    } else if (Math.random() < estagio.tempo_chance) {
      upd.afinidade = Math.max(0, Math.floor((upd.afinidade ?? r.afinidade) * 0.7));
      smDelta -= IMPACTO_SM_REL.tempo[r.estagio] || 5;
      // "Dar um tempo": trava o NPC globalmente para o MESMO jogador —
      // outros não podem conhecê-la enquanto isso, só ele pode reatar.
      if (r.npc_id) await _marcarNpcEmTempoCF(db, r.npc_id, uid, r.id);
    }

    // Se o relacionamento foi encerrado (qualquer um dos ramos acima:
    // ciumenta, flagra, ou término natural), libera o NPC de volta ao
    // mundo — qualquer outro jogador pode conhecê-la a partir de agora.
    if (upd.ativo === false && r.npc_id) {
      await _liberarNpcCF(db, r.npc_id);
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
    // Vínculo com o relacionamento que gerou este filho — necessário para
    // a checagem de Familiar ("sem filhos com ELA após os 30 anos"), que
    // precisa saber se o jogador já teve filho especificamente com esta
    // NPC, não com qualquer uma. relacionamento.id é o ID do documento em
    // jogadores/{uid}/relacionamentos/{id} (presente no objeto `r` usado
    // no loop de _processarRelacionamentosMensalCF); npc_id é a chave
    // global da ficha (ex.: 'natalia_borges'), salva como redundância
    // segura — sobrevive mesmo se o documento de relacionamento for
    // apagado, já que aponta para a ficha-fonte em vez do registro do
    // namoro em si.
    relacionamento_id: relacionamento.id || null,
    npc_id: relacionamento.npc_id || null,
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

// ════════════════════════════════════════════════════════
// EXPORTS DE TESTE — não usados pelo functions/index.js de produção
// (que só consome exports.avancarMes). Expostos aqui apenas para
// permitir testes funcionais locais (mock) de _processarRelacionamentosMensalCF
// e dos helpers de lock, sem precisar emular o onCall completo.
// ════════════════════════════════════════════════════════
exports._processarRelacionamentosMensalCF = _processarRelacionamentosMensalCF;
exports._processarCursosMensalCF = _processarCursosMensalCF;
exports._processarServicosMensalCF = _processarServicosMensalCF;
exports._liberarNpcCF = _liberarNpcCF;
exports._marcarNpcEmTempoCF = _marcarNpcEmTempoCF;
exports.EFEITO_TRACO_REL = EFEITO_TRACO_REL;

