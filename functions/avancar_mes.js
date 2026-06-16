'use strict';

/**
 * AVANÇAR MÊS — Advocatus Online
 *
 * Callable: chamada pelo botão "Avançar Mês" do jogador.
 * Substitui o Cloud Scheduler — o tempo é controlado pelo jogador.
 *
 * Regras:
 * - Energia deve estar abaixo de ENERGIA_MIN (20) OU jogador força manualmente
 * - COOLDOWN_HORAS = 0 durante beta (mude depois dos testes)
 * - Processa apenas o jogador que chamou (não batch)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

// ── Configuração ──
const COOLDOWN_JANEIRO_MIN = 60;  // minutos de espera obrigatória após virar janeiro (modo férias)
const ENERGIA_MIN          = 20;  // abaixo disso o botão fica em destaque
const ENERGIA_TOTAL        = 100;

// ── Tabelas (espelho do frontend) ──
const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Rep mensal por moradia
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

// Rep mensal por transporte
const CARRO_REP = {
  onibus:0, kwid:0, mobi:0, hb20:0, gol:0, onix:1,
  polo:1, cronos:1, tracker:2, t_cross:2,
  compass:3, corolla:3, civic:3, hr_v:2,
  tiguan:5, hilux:4, bmw3:7, class_c:8, audi_a4:7, range_v:10,
};

// Penalidade por ausência de moradia/carro adequados por cargo
const CARGO_IDX = {est:0,ass:1,jnr:2,pln:3,snr:4,asc:5,soc:6,snm:7,
                   jsub:2,jtit:4,dsb:5,mstj:7,padj:2,prom:4,pjus:5,pgj:7,
                   dadj:2,def:4,dch:5,dge:7};

// Valor de imóveis (para calcular aluguel)
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

const ESCRITORIO_CM = { cw:600, sal:3000, esm:7500, esp:18000 };

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

  // ── Verificar energia ──
  const energiaRestante = Math.max(0, (j.energia || ENERGIA_TOTAL) - (j.energia_usada_mes || 0));
  if (energiaRestante > ENERGIA_MIN) {
    throw new HttpsError('failed-precondition',
      'Voce ainda tem ' + energiaRestante + ' de energia. Use mais acoes antes de avancar o mes.');
  }

  // ── Cooldown de janeiro: 1 hora de ferias obrigatorias ──
  // So aplica quando o jogador esta EM janeiro (mes_pessoal === 0)
  // e tentou avancar antes do fim do cooldown.
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

  // ════════════════════════════════════════════════════
  // PROCESSAR O MÊS
  // ════════════════════════════════════════════════════
  const updates = {};
  const mensagens = [];

  // ── 1. Avançar calendário pessoal ──
  const mesAtualJog = j.mes_pessoal ?? 0;       // 0-11
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

  // ── 2. Idade ──
  updates.idade = 22 + Math.floor(mesGlobal / 12);

  // ── 3. Aposentadoria ──
  if (updates.idade >= 75 && !j.aposentado) {
    updates.aposentado = true;
    mensagens.push({ assunto:'🎓 Aposentadoria', corpo:'Você atingiu 75 anos. Escolha um herdeiro para continuar sua dinastia.', tipo:'sistema' });
    await _commit(db, uid, updates, mensagens);
    return { ok:true, mes:`${MESES[novoMes]}, Ano ${novoAno}`, aposentado:true };
  }

  // ── 4. Study queue ──
  const studyQueue = j.study_queue || [];
  const prontos    = studyQueue.filter(s => s.mes_conclusao <= mesGlobal);
  const pendentes  = studyQueue.filter(s => s.mes_conclusao > mesGlobal);
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

  // ── 5. Financiamentos ──
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

  // ── 6. Calcular renda ──
  let renda = 0;
  if (j.escritorio_id !== 'solo' && j.escritorio_empregado_id) {
    if (j.sal_base_escritorio && j.sal_base_escritorio > 0) {
      // Salario negociado ao entrar no escritorio NPC
      renda = j.sal_base_escritorio;
    } else {
      const salMin = CARGO_SAL_MIN[j.cargo_id] || 1700;
      const salMax = CARGO_SAL_MAX[j.cargo_id] || 1700;
      const repF   = Math.min(1, (j.reputacao || 30) / 100);
      renda = Math.floor(salMin + (salMax - salMin) * repF * (j.sal_mult || 1.0));
    }
  }

  // ── 7. Calcular despesas ──
  const morId    = j.pat?.moradia   || 'pais';
  const carId    = j.pat?.transporte|| 'onibus';
  const escId    = j.pat?.escritorio|| 'cw';
  const comprada = j.moradias_compradas?.[morId];

  let despesas = 0;
  // Espaço de trabalho: home=gratuito, NPC=gratuito, solo=cobra coworking/sala
  const ESCRITORIO_CM_LOCAL = { home:0, cw:600, sal:3000, esm:7500, esp:18000 };
  const isSoloWork = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  if (isSoloWork) {
    despesas += ESCRITORIO_CM_LOCAL[escId] || 0;
  }
  // Debuff de rep do home office (aplicado no bloco de patrimônio mais abaixo)
  if (morId !== 'pais' && !comprada) {
    const v = IMOVEL_VALOR[morId] || 0;
    despesas += v < 500000 ? Math.floor(v*0.0055) : v < 1000000 ? Math.floor(v*0.004) : Math.floor(v*0.003);
  }
  despesas += CARRO_CM[carId] || 176;
  for (const fin of Object.values(fins)) {
    if (fin.parcelas_restantes > 0) despesas += fin.parcela_mensal || 0;
  }
  despesas += (j.estagiarios || []).length * 1700;
  // Custo de vida por cargo — escalonado de forma justa
  const CUSTO_BASE = {
    est:600, ass:700, jnr:900, pln:1400, snr:2200,
    asc:3000, soc:4500, snm:6000,
    jsub:2200, jtit:3000, dsb:4000, mstj:5500,
    padj:2000, prom:2800, pjus:3800, pgj:5000,
    dadj:1800, def:2400, dch:3200, dge:4500,
  };
  const custoVida = CUSTO_BASE[j.cargo_id] || 700;

  // ── 8. Saldo ──
  const saldoMes   = renda - despesas - custoVida;
  updates.dinheiro = (j.dinheiro || 0) + saldoMes;
  updates.renda_calculada     = renda;
  updates.despesas_calculadas = despesas;
  updates.saldo_mes_calculado = saldoMes;

  // ── 9. Serasa ──
  const finResult = _processarFinanceiro(j, updates.dinheiro, saldoMes);
  Object.assign(updates, finResult.updates);
  if (finResult.msg) mensagens.push(finResult.msg);

  // ── 10. REPUTAÇÃO POR PATRIMÔNIO ──
  const repAtual  = updates.reputacao ?? j.reputacao ?? 30;
  const cargoIdx  = CARGO_IDX[j.cargo_id] || 0;
  const cap       = REP_CAP[j.cargo_id] || 55;
  let deltaRepPat = 0;

  // Home office: -2 rep/mês se for solo
  if (isSoloWork && escId === 'home') {
    const novaRep = Math.max(0, (updates.reputacao ?? j.reputacao ?? 30) - 2);
    updates.reputacao = novaRep;
  }

  // Moradia
  const morRepBase = MORADIA_REP[morId] ?? 0;
  if (morRepBase < 0) {
    deltaRepPat += morRepBase; // penalidade
  } else if (morRepBase > 0) {
    // Bônus proporcional ao espaço até o cap (decrescente)
    const espaco = Math.max(0, cap - repAtual);
    deltaRepPat += Math.min(morRepBase, Math.max(1, Math.floor(espaco * 0.15)));
  }
  // Mora com os pais sendo Júnior+ → penalidade extra
  if (morId === 'pais' && cargoIdx >= 2) deltaRepPat -= 2;

  // Transporte
  const carRepBase = CARRO_REP[carId] ?? 0;
  if (carRepBase > 0) {
    const espaco = Math.max(0, cap - (repAtual + deltaRepPat));
    deltaRepPat += Math.min(carRepBase, Math.max(1, Math.floor(espaco * 0.10)));
  }
  // Ônibus sendo Pleno+ → penalidade
  if (carId === 'onibus' && cargoIdx >= 3) deltaRepPat -= 1;
  // Carro fraco sendo Sênior+ (kwid/mobi/hb20/gol) → penalidade
  const carrosFracos = ['kwid','mobi','hb20','gol'];
  if (carrosFracos.includes(carId) && cargoIdx >= 4) deltaRepPat -= 1;

  // Escritório sendo Sócio+ sem escritório médio+ → penalidade
  if (['esm','esp'].includes(escId) && cargoIdx >= 6) {
    // tem escritório adequado — sem penalidade
  } else if (['cw','sal'].includes(escId) && cargoIdx >= 6) {
    deltaRepPat -= 2;
  }

  // Bairro perigoso → penalidade adicional
  if ((IMOVEL_PERIGO[morId] || 0) === 2) deltaRepPat -= 1;

  // Aplicar delta de patrimônio
  const repDepoisPat = Math.max(0, Math.min(cap, repAtual + deltaRepPat));
  updates.reputacao = repDepoisPat;

  // ── 11. Prazo moradia ──
  if (morId === 'pais' && j.oab && cargoIdx >= 2) {
    const prazo = (j.prazo_sair_pais || 0) + 1;
    updates.prazo_sair_pais = prazo;
    if (prazo === 1) mensagens.push({ assunto:'⚠️ Saia da casa dos pais', corpo:'Você tem 3 meses para escolher uma moradia.', tipo:'urgente' });
    if (prazo >= 3)  mensagens.push({ assunto:'❌ Prazo de moradia', corpo:'Prazo esgotado. -5 rep.', tipo:'urgente' });
    if (prazo >= 3)  updates.reputacao = Math.max(0, (updates.reputacao ?? repAtual) - 5);
  } else if (morId !== 'pais') {
    updates.prazo_sair_pais = 0;
  }

  // ── 12. Atributos ──
  const energiaGasta = j.energia_usada_mes || 0;
  let saudeMental    = j.saude_mental ?? 80;
  let disposicao     = j.disposicao   ?? 80;

  if (energiaGasta > 70)       { saudeMental = Math.max(0, saudeMental - 5); }
  else if (energiaGasta < 30)  { saudeMental = Math.min(100, saudeMental + 3); disposicao = Math.min(100, disposicao + 3); }
  disposicao = Math.max(0, disposicao - 2);

  // Assalto em bairro perigoso
  if ((IMOVEL_PERIGO[morId] || 0) === 2 && Math.random() < 0.01) {
    const perda = Math.floor((updates.dinheiro || 0) * 0.10);
    updates.dinheiro = Math.max(0, (updates.dinheiro || 0) - perda);
    mensagens.push({ assunto:'🚨 Assalto!', corpo:`Você foi assaltado. -R$ ${perda.toLocaleString('pt-BR')} (10% do saldo).`, tipo:'urgente' });
  }

  // Burnout
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

  // ── 13. Janeiro: bônus anual + recesso + bloqueio 1h ──
  if (isJaneiro) {
    // Gravar timestamp de desbloqueio: agora + 60 minutos
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

  // ── 14. Anos de carreira ──
  if (mesGlobal % 12 === 0) {
    updates.anos_carreira = (j.anos_carreira || 0) + 1;
  }

  // ── 15. Salvar ──
  await _commit(db, uid, updates, mensagens);

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
async function _commit(db, uid, updates, mensagens) {
  const batch = db.batch();
  batch.update(db.collection('jogadores').doc(uid), {
    ...updates,
    ultimo_mes_processado: updates.mes_global_pessoal || 0,
  });
  for (const m of mensagens) {
    const ref = db.collection('jogadores').doc(uid).collection('inbox').doc();
    batch.set(ref, {
      de: 'sistema', para_uid: uid,
      assunto: m.assunto || '—',
      corpo:   m.corpo   || '',
      tipo:    'sistema',
      tipo_noticia: m.tipo || 'neutro',
      lida:    false,
      criado_em: new Date().toISOString(),
    });
  }
  await batch.commit();
}
