'use strict';

/**
 * TICK MENSAL — Advocatus Online
 *
 * Executa 1x por dia via Cloud Scheduler (00:00 UTC).
 * 1 dia real = 1 mês de jogo.
 *
 * Calendário: "Ano 1, Janeiro" — sem datas reais.
 * Ano 1 começa no primeiro tick.
 *
 * Ordem de execução:
 * 1. Avança /config/server
 * 2. Processa cada jogador (em batches de 400)
 * 3. Atualiza rankings globais
 * 4. Gera eventos globais do mês
 */

const { onSchedule }    = require('firebase-functions/v2/scheduler');
const { getFirestore }  = require('firebase-admin/firestore');
const { logger }        = require('firebase-functions');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Cap de reputação por cargo
const REP_CAP = {
  est:  20, ass:  35, jnr:  45, pln:  55,
  snr:  65, asc:  80, soc: 100, snm: 100,
  // Carreiras públicas
  jsub: 55, jtit: 70, dsb: 85, mstj: 100,
  padj: 55, prom: 70, pjus: 85, pgj: 100,
  dadj: 55, def:  70, dch:  85, dge: 100,
};

// Custo de vida: R$800 + R$25 por rep acima de 20
// (mantido aqui para cálculo server-side)
function calcCustoVida(rep) {
  if (!rep || rep < 0) return 800;
  return 800 + Math.max(0, rep - 20) * 25;
}

// Aluguel escalonado
function calcAluguel(valorImovel) {
  if (!valorImovel || valorImovel <= 0) return 0;
  if (valorImovel < 500000)  return Math.floor(valorImovel * 0.0055);
  if (valorImovel < 1000000) return Math.floor(valorImovel * 0.0040);
  return Math.floor(valorImovel * 0.0030);
}

// Valores de imóveis por id (espelho do frontend)
const IMOVEL_VALOR = {
  pais:        0,      kit:      180000, apm:     450000,
  apt_top:     850000, cas:     1200000, cob:    3500000,
  ipanema:    2500000, leblon:  3000000, lagoa:  2200000,
  copacabana: 1500000, botafogo:1200000, flamengo:1000000,
  catete:      700000, santa_teresa:900000, laranjeiras:1100000,
  barra_lux:  3500000, barra_med:1800000, recreio: 1000000,
  jacarepagua: 600000, pechincha: 400000,
  centro_apto: 500000, lapa:     400000, cinelandia:450000, tijuca:700000,
  meier:       450000, iraja:    350000, madureira: 300000,
  sao_cristov: 380000, penha:    250000,
  campo_grande:280000, santa_cruz:200000, bangu:  220000, realengo:180000,
  icarai:     1400000, sao_fco_nit:1000000, centro_nit:600000,
  caxias_apto: 200000, nova_iguacu:220000, belford:150000,
  sao_joao:    160000, nilop:    170000,
};

// Custo mensal de carro por id
const CARRO_CM = {
  onibus:0, kwid:900, mobi:850, hb20:1000, gol:950, onix:1050,
  polo:1200, cronos:1100, tracker:1700, t_cross:1800,
  compass:2500, corolla:2200, civic:2100, tiguan:3200, hr_v:2300,
  hilux:3500, bmw3:4500, class_c:5000, audi_a4:4400, range_v:7000,
};

// Custo de escritório por id
const ESCRITORIO_CM = { cw:600, sal:3000, esm:7500, esp:18000 };

// ════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════
exports.tickMensal = onSchedule({
  schedule: 'every 24 hours',
  timeZone: 'America/Sao_Paulo',
  memory:   '1GiB',
  timeoutSeconds: 540,
}, async (event) => {
  const db = getFirestore();
  logger.info('[TICK] Iniciando tick mensal');

  // ── 1. Avançar calendário do servidor ──
  const serverRef = db.collection('config').doc('server');
  const serverSnap = await serverRef.get();

  let serverData;
  if (!serverSnap.exists) {
    // Primeiro tick — inicializar o servidor
    serverData = {
      mes_global:  1,
      ano_jogo:    1,
      mes_jogo:    0,          // 0=Janeiro ... 11=Dezembro
      mes_nome:    'Janeiro',
      data_inicio: new Date().toISOString(),
      total_jogadores: 0,
      versao: '1.0.0',
    };
    await serverRef.set(serverData);
    logger.info('[TICK] Servidor inicializado — Ano 1, Janeiro');
  } else {
    serverData = serverSnap.data();
    const novoMesGlobal = (serverData.mes_global || 0) + 1;
    const novoMesJogo   = (serverData.mes_jogo + 1) % 12;
    const novoAnoJogo   = novoMesJogo === 0
      ? (serverData.ano_jogo || 1) + 1
      : (serverData.ano_jogo || 1);

    serverData = {
      ...serverData,
      mes_global: novoMesGlobal,
      mes_jogo:   novoMesJogo,
      ano_jogo:   novoAnoJogo,
      mes_nome:   MESES[novoMesJogo],
      ultima_atualizacao: new Date().toISOString(),
    };
    await serverRef.update(serverData);
    logger.info(`[TICK] ${serverData.mes_nome}, Ano ${serverData.ano_jogo} (mês global ${serverData.mes_global})`);
  }

  const mesAtual  = serverData.mes_jogo;    // 0-11
  const anoAtual  = serverData.ano_jogo;    // 1, 2, 3...
  const mesGlobal = serverData.mes_global;  // 1, 2, 3... (absoluto)
  const isJaneiro = mesAtual === 0;

  // ── 2. Processar jogadores em batches ──
  let processados = 0;
  let cursor = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db.collection('jogadores')
      .orderBy('uid')
      .limit(400);

    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    // Batch de escritas
    const batch = db.batch();

    for (const doc of snap.docs) {
      const j = doc.data();

      // Evitar processar dois vezes no mesmo tick
      if (j.ultimo_mes_processado === mesGlobal) continue;

      try {
        const updates = await processarJogador(j, mesAtual, anoAtual, mesGlobal, isJaneiro, db);
        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
        }
        processados++;
      } catch (err) {
        logger.error(`[TICK] Erro ao processar jogador ${j.uid}:`, err);
      }
    }

    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 400) break;
  }

  logger.info(`[TICK] ${processados} jogadores processados`);

  // ── 3. Atualizar rankings ──
  await atualizarRankings(db);

  // ── 4. Gerar eventos globais ──
  await gerarEventoGlobal(db, mesAtual, anoAtual, mesGlobal);

  logger.info('[TICK] Tick mensal concluído');
});

// ════════════════════════════════════════════════════════
// PROCESSAMENTO INDIVIDUAL DO JOGADOR
// ════════════════════════════════════════════════════════
async function processarJogador(j, mesAtual, anoAtual, mesGlobal, isJaneiro, db) {
  const updates = { ultimo_mes_processado: mesGlobal };

  // ── Idade ──
  const mesesDecorridos = mesGlobal - (j.mes_global_inicio || 1);
  updates.idade = 22 + Math.floor(mesesDecorridos / 12);

  // ── Aposentadoria obrigatória aos 75 ──
  if (updates.idade >= 75 && !j.aposentado) {
    updates.aposentado = true;
    await enviarMensagem(db, j.uid, 'sistema', {
      assunto: '🎓 Aposentadoria — 75 anos',
      corpo: `Parabéns por uma carreira extraordinária, ${j.nome_personagem}! Você atingiu 75 anos e deve escolher um herdeiro para dar continuidade à sua dinastia jurídica.`,
      tipo: 'sistema',
    });
    return updates; // Jogador aposentado não processa mais
  }

  // ── Regenerar energia ──
  updates.energia = 100;
  updates.energia_usada_mes = 0;

  // ── Estudos concluídos (study_queue) ──
  const studyQueue = j.study_queue || [];
  const prontos    = studyQueue.filter(s => s.mes_conclusao <= mesGlobal);
  const pendentes  = studyQueue.filter(s => s.mes_conclusao > mesGlobal);
  const newSkills  = { ...(j.skills || {}) };

  for (const estudo of prontos) {
    const skAtual = newSkills[estudo.skill] || 0;
    const cap     = REP_CAP[j.cargo_id] || 55;
    newSkills[estudo.skill] = Math.min(cap, skAtual + estudo.ganho);

    await enviarMensagem(db, j.uid, 'sistema', {
      assunto: `📚 Estudo concluído: ${estudo.skill}`,
      corpo:   `Seu estudo em ${estudo.skill_label || estudo.skill} foi concluído. +${estudo.ganho} pontos.`,
      tipo:    'sistema',
    });
  }
  if (prontos.length > 0) {
    updates.skills      = newSkills;
    updates.study_queue = pendentes;
  }

  // ── Processar financiamentos de carro ──
  const fins = { ...(j.financiamentos || {}) };
  let finsAlterados = false;
  for (const [id, fin] of Object.entries(fins)) {
    if (fin.parcelas_restantes > 0) {
      fins[id] = { ...fin, parcelas_restantes: fin.parcelas_restantes - 1 };
      finsAlterados = true;
      if (fins[id].parcelas_restantes === 0) {
        await enviarMensagem(db, j.uid, 'sistema', {
          assunto: `🚗 Financiamento quitado!`,
          corpo:   `Seu ${fin.nome} foi completamente pago. O veículo agora é 100% seu.`,
          tipo:    'sistema',
        });
      }
    }
  }
  if (finsAlterados) updates.financiamentos = fins;

  // ── Calcular renda ──
  let renda = 0;
  if (j.escritorio_empregado_id === null || j.escritorio_id === 'solo') {
    renda = 0; // Solo — só honorários de processo
  } else {
    // Salário baseado no cargo + rep
    const salMin = CARGO_SAL_MIN[j.cargo_id] || 1700;
    const salMax = CARGO_SAL_MAX[j.cargo_id] || 1700;
    const repF   = Math.min(1, (j.reputacao || 30) / 100);
    const salBase = Math.floor(salMin + (salMax - salMin) * repF);
    const mult    = j.sal_mult || 1.0;
    renda = Math.floor(salBase * mult);
  }

  // ── Calcular despesas ──
  let despesas = 0;

  // Escritório/coworking
  despesas += ESCRITORIO_CM[j.pat?.escritorio || 'cw'] || 600;

  // Moradia
  const morId = j.pat?.moradia || 'pais';
  if (morId === 'pais') {
    // Mora com os pais — sem aluguel
  } else if (j.moradias_compradas?.[morId]) {
    // Casa própria — sem aluguel
  } else {
    const valorMor = IMOVEL_VALOR[morId] || 0;
    despesas += calcAluguel(valorMor);
  }

  // Transporte
  const carId = j.pat?.transporte || 'onibus';
  if (carId === 'onibus') {
    despesas += 176;
  } else {
    despesas += CARRO_CM[carId] || 0;
  }

  // Parcelas de financiamento
  for (const fin of Object.values(fins)) {
    if (fin.parcelas_restantes > 0) despesas += fin.parcela_mensal || 0;
  }

  // Estagiários
  const numEstagiarios = (j.estagiarios || []).length;
  despesas += numEstagiarios * 1700;

  // Custo de vida
  const custoVida = calcCustoVida(j.reputacao || 30);

  // Saldo do mês
  const saldoMes = renda - despesas - custoVida;
  const novoDinheiro = (j.dinheiro || 0) + saldoMes;

  updates.dinheiro = novoDinheiro;
  updates.renda_calculada = renda;
  updates.despesas_calculadas = despesas;
  updates.custo_vida_calculado = custoVida;
  updates.saldo_mes_calculado = saldoMes;

  // ── Sistema financeiro: serasa ──
  const resultadoFinanceiro = processarFinanceiro(j, novoDinheiro, saldoMes);
  Object.assign(updates, resultadoFinanceiro.updates);
  if (resultadoFinanceiro.mensagem) {
    await enviarMensagem(db, j.uid, 'sistema', resultadoFinanceiro.mensagem);
  }

  // ── Prazo para sair da casa dos pais ──
  if (morId === 'pais' && j.oab && ['jnr','pln','snr','asc','soc','snm'].includes(j.cargo_id)) {
    const prazo = (j.prazo_sair_pais || 0) + 1;
    updates.prazo_sair_pais = prazo;
    if (prazo === 1) {
      await enviarMensagem(db, j.uid, 'sistema', {
        assunto: '⚠️ Moradia — prazo de 3 meses',
        corpo:   'Você é Advogado(a) Júnior ou superior. Precisa sair da casa dos pais em até 3 meses. Acesse Patrimônio para escolher uma moradia.',
        tipo:    'sistema',
      });
    } else if (prazo >= 3) {
      const novaRep = Math.max(0, (updates.reputacao || j.reputacao || 30) - 5);
      updates.reputacao = novaRep;
      await enviarMensagem(db, j.uid, 'sistema', {
        assunto: '❌ Prazo de moradia esgotado',
        corpo:   `Prazo esgotado! Você ainda mora com os pais sendo ${j.cargo_id === 'jnr' ? 'Advogado Júnior' : 'Advogado'}. -5 rep. Escolha uma moradia urgentemente.`,
        tipo:    'sistema',
      });
    }
  } else if (morId !== 'pais') {
    updates.prazo_sair_pais = 0;
  }

  // ── Decaimento natural de atributos ──
  const energiaGasta = j.energia_usada_mes || 0;
  let saudeMental    = j.saude_mental ?? 80;
  let disposicao     = j.disposicao   ?? 80;

  // Alta carga de trabalho desgasta a saúde mental
  if (energiaGasta > 70) {
    saudeMental = Math.max(0, saudeMental - 5);
  } else if (energiaGasta < 30) {
    // Mês de descanso recupera
    saudeMental = Math.min(100, saudeMental + 3);
    disposicao  = Math.min(100, disposicao + 3);
  }

  // Decaimento natural de disposição
  disposicao = Math.max(0, disposicao - 2);

  // Bônus de saúde por bairro seguro
  const morPerigo = IMOVEL_PERIGO[morId] || 0;
  if (morPerigo === 2) {
    saudeMental = Math.max(0, saudeMental - 3);
    // 1% de chance de assalto
    if (Math.random() < 0.01) {
      const perda = Math.floor((updates.dinheiro || j.dinheiro || 0) * 0.10);
      updates.dinheiro = Math.max(0, (updates.dinheiro || j.dinheiro || 0) - perda);
      await enviarMensagem(db, j.uid, 'sistema', {
        assunto: '🚨 Assalto!',
        corpo:   `Você foi assaltado em ${morId}. Perdeu R$ ${perda.toLocaleString('pt-BR')} (10% do seu saldo). Considere mudar de bairro.`,
        tipo:    'urgente',
      });
    }
  }

  // Burnout: saúde mental 0-19 bloqueia novos casos por 3 meses
  if (saudeMental < 20 && !j.em_burnout) {
    updates.em_burnout      = true;
    updates.burnout_ate_mes = mesGlobal + 3;
    await enviarMensagem(db, j.uid, 'sistema', {
      assunto: '🔴 Burnout',
      corpo:   'Sua saúde mental atingiu nível crítico. Você não pode assumir novos casos por 3 meses. Descanse e cuide-se.',
      tipo:    'urgente',
    });
  }
  if (j.em_burnout && mesGlobal >= (j.burnout_ate_mes || 0)) {
    updates.em_burnout = false;
    saudeMental = Math.max(30, saudeMental);
    await enviarMensagem(db, j.uid, 'sistema', {
      assunto: '✅ Recuperado do burnout',
      corpo:   'Você se recuperou do burnout. Pode voltar a assumir novos casos.',
      tipo:    'sistema',
    });
  }

  updates.saude_mental = saudeMental;
  updates.disposicao   = disposicao;

  // ── Rep negativa por bairro perigoso ──
  if (morPerigo === 2) {
    const repAtual = updates.reputacao ?? j.reputacao ?? 30;
    updates.reputacao = Math.max(0, repAtual - 1);
  }

  // ── Cap de reputação por cargo ──
  const cap = REP_CAP[j.cargo_id] || 55;
  if ((updates.reputacao ?? j.reputacao) > cap) {
    updates.reputacao = cap;
  }

  // ── Janeiro: bônus anual + resetar contadores + recesso ──
  if (isJaneiro) {
    const winsAno   = j.wins_ano   || 0;
    const lossesAno = j.losses_ano || 0;
    const totalAno  = winsAno + lossesAno;

    if (totalAno > 0 && j.escritorio_id !== 'solo') {
      const pct   = Math.round(winsAno / totalAno * 100);
      const salM  = updates.renda_calculada || renda || 5000;
      let bonus   = 0;
      let descBonus = '';

      if (pct === 100)      { bonus = salM * 6; descBonus = '100% de aproveitamento → 6 salários!'; }
      else if (pct >= 90)   { bonus = salM * 3; descBonus = '90%+ de aproveitamento → 3 salários!'; }
      else if (pct >= 80)   { bonus = salM * 2; descBonus = '80%+ de aproveitamento → 2 salários!'; }
      else if (pct >= 70)   { bonus = salM * 1; descBonus = '70%+ de aproveitamento → 1 salário!'; }

      if (bonus > 0) {
        updates.dinheiro = (updates.dinheiro || j.dinheiro || 0) + bonus;
        await enviarMensagem(db, j.uid, 'sistema', {
          assunto: `🎉 Bônus Anual — Ano ${anoAtual - 1}`,
          corpo:   `${descBonus} +R$ ${bonus.toLocaleString('pt-BR')} creditados no seu saldo.`,
          tipo:    'positivo',
        });
      } else {
        await enviarMensagem(db, j.uid, 'sistema', {
          assunto: `📊 Performance Anual — Ano ${anoAtual - 1}`,
          corpo:   `Seu aproveitamento foi ${pct}% (${winsAno}V/${lossesAno}D). Mínimo para bônus: 70%.`,
          tipo:    'sistema',
        });
      }
    }

    // Recesso judiciário — sinalizar para o cliente exibir o modal
    updates.recesso_pendente = true;
    updates.wins_ano   = 0;
    updates.losses_ano = 0;

    await enviarMensagem(db, j.uid, 'sistema', {
      assunto: `🏖️ Recesso Judiciário — Janeiro, Ano ${anoAtual}`,
      corpo:   'Os tribunais estão de recesso. Você tem o mês para descansar, viajar ou fazer um curso intensivo. Acesse o jogo para escolher sua atividade.',
      tipo:    'sistema',
    });
  }

  // ── Gerar evento aleatório para o jogador ──
  if (Math.random() < 0.55) {
    const evento = gerarEventoJogador(j, mesAtual, anoAtual);
    if (evento) {
      // Aplicar efeito do evento
      if (evento.efeito_dinheiro) {
        updates.dinheiro = (updates.dinheiro || j.dinheiro || 0) + evento.efeito_dinheiro;
      }
      if (evento.efeito_rep) {
        const repApos = Math.max(0, Math.min(cap, (updates.reputacao ?? j.reputacao ?? 30) + evento.efeito_rep));
        updates.reputacao = repApos;
      }
      await enviarMensagem(db, j.uid, 'evento', {
        assunto: evento.titulo,
        corpo:   evento.descricao,
        tipo:    evento.tipo_noticia || 'neutro',
        efeito_resumo: evento.efeito_resumo,
      });
    }
  }

  return updates;
}

// ════════════════════════════════════════════════════════
// SISTEMA FINANCEIRO — SERASA
// ════════════════════════════════════════════════════════
function processarFinanceiro(j, novoDinheiro, saldoMes) {
  const updates  = {};
  let mensagem   = null;
  const rep      = j.reputacao || 30;

  if (novoDinheiro < 0 || saldoMes < 0) {
    const mesesNeg = (j.meses_negativo || 0) + 1;
    updates.meses_negativo         = mesesNeg;
    updates.meses_positivo_streak  = 0;

    const repPerda = j.no_serasa
      ? Math.max(3, Math.floor(rep * 0.06))   // Serasa: dobro
      : Math.max(2, Math.floor(rep * 0.03));   // Normal

    updates.reputacao = Math.max(0, rep - repPerda);

    if (mesesNeg === 1) {
      mensagem = { assunto: '⚠️ Saldo negativo', corpo: `Seu saldo ficou negativo. -${repPerda} rep. Regularize suas finanças.`, tipo: 'urgente' };
    } else if (mesesNeg === 2) {
      mensagem = { assunto: '⚠️ 2º mês negativo', corpo: `Segundo mês consecutivo no negativo. -${repPerda} rep. Atenção: mais 1 mês e seu nome vai ao Serasa.`, tipo: 'urgente' };
    } else if (mesesNeg === 3 && !j.no_serasa) {
      updates.no_serasa = true;
      const extra = Math.max(4, Math.floor(rep * 0.06));
      updates.reputacao = Math.max(0, (updates.reputacao ?? rep) - extra);
      mensagem = { assunto: '🚨 Serasa', corpo: `3 meses negativos — seu nome foi ao Serasa. -${extra} rep extra. Financiamentos bloqueados.`, tipo: 'urgente' };
    } else if (mesesNeg > 3) {
      mensagem = { assunto: '🚨 Ainda no Serasa', corpo: `${mesesNeg}º mês negativo. -${repPerda} rep.`, tipo: 'urgente' };
    }
  } else {
    updates.meses_negativo = 0;
    const streak = (j.meses_positivo_streak || 0) + 1;
    updates.meses_positivo_streak = streak;

    if (j.no_serasa) {
      if (streak >= 3) {
        updates.no_serasa             = false;
        updates.meses_positivo_streak = 0;
        updates.reputacao             = Math.min(REP_CAP[j.cargo_id] || 55, rep + 5);
        mensagem = { assunto: '✅ Nome limpo', corpo: '3 meses consecutivos positivos — seu nome saiu do Serasa. +5 rep recuperados.', tipo: 'positivo' };
      } else {
        mensagem = { assunto: '📈 Mês positivo', corpo: `${streak}/3 meses para sair do Serasa. Continue!`, tipo: 'neutro' };
      }
    }
  }

  return { updates, mensagem };
}

// ════════════════════════════════════════════════════════
// EVENTOS ALEATÓRIOS PARA O JOGADOR
// ════════════════════════════════════════════════════════
const EVENTOS_POOL = {
  tributario: [
    { titulo:'STJ afeta nova tese tributária', descricao:'O STJ afetou ao rito dos repetitivos tese sobre exclusão do ICMS da base do PIS/COFINS. Seus clientes estão animados.', efeito_rep:2, tipo_noticia:'positivo', efeito_resumo:'+2 rep' },
    { titulo:'CARF retoma sessões', descricao:'O CARF retoma sessões presenciais, acelerando julgamentos de auto de infração de grande valor.', efeito_rep:1, tipo_noticia:'neutro', efeito_resumo:'+1 rep' },
    { titulo:'Novo cliente — autuação milionária', descricao:'Empresa de médio porte busca seu escritório após receber auto de infração de R$ 4,2 milhões.', efeito_dinheiro:8000, tipo_noticia:'positivo', efeito_resumo:'+R$8.000' },
    { titulo:'Reforma tributária — CBS e IBS', descricao:'A LC 214/2025 entra em vigor. Demanda por consultivo tributário aumentou 40% este mês.', efeito_rep:3, tipo_noticia:'positivo', efeito_resumo:'+3 rep' },
  ],
  trabalhista: [
    { titulo:'TST edita nova OJ sobre teletrabalho', descricao:'O TST editou nova Orientação Jurisprudencial sobre responsabilidade em home office, impactando casos em andamento.', efeito_rep:1, tipo_noticia:'neutro', efeito_resumo:'+1 rep' },
    { titulo:'Audiência de conciliação exitosa', descricao:'Dois processos foram conciliados em audiência prévia, gerando honorários antecipados.', efeito_dinheiro:12000, tipo_noticia:'positivo', efeito_resumo:'+R$12.000' },
    { titulo:'Reforma CLT — nova portaria MTE', descricao:'Nova portaria do MTE regulamenta jornada híbrida. Seus clientes precisam de orientação.', efeito_dinheiro:4000, tipo_noticia:'positivo', efeito_resumo:'+R$4.000' },
  ],
  civil: [
    { titulo:'STJ — prazo prescricional reanalisado', descricao:'O STJ afetou tese sobre prazo prescricional em responsabilidade civil contratual.', efeito_rep:1, tipo_noticia:'neutro', efeito_resumo:'+1 rep' },
    { titulo:'Novo cliente — inventário complexo', descricao:'Família de alta renda procura seu escritório para inventário extrajudicial com bens em múltiplos estados.', efeito_dinheiro:15000, tipo_noticia:'positivo', efeito_resumo:'+R$15.000' },
  ],
  criminal: [
    { titulo:'STF — HC coletivo sobre preventivas', descricao:'O STF julgou HC coletivo sobre prisões preventivas prolongadas, criando precedente favorável.', efeito_rep:2, tipo_noticia:'positivo', efeito_resumo:'+2 rep' },
    { titulo:'Absolvição em júri popular', descricao:'Seu cliente foi absolvido por unanimidade. Repercussão positiva na comarca.', efeito_rep:5, tipo_noticia:'positivo', efeito_resumo:'+5 rep' },
  ],
  empresarial: [
    { titulo:'Recuperação judicial — plano aprovado', descricao:'A AGC de um cliente em RJ aprovou o plano por 67% dos votos.', efeito_rep:4, tipo_noticia:'positivo', efeito_resumo:'+4 rep' },
    { titulo:'M&A — due diligence urgente', descricao:'Grupo empresarial contrata para due diligence de aquisição de R$ 120 milhões.', efeito_dinheiro:25000, tipo_noticia:'positivo', efeito_resumo:'+R$25.000' },
  ],
  geral: [
    { titulo:'Artigo publicado em revista jurídica', descricao:'Seu artigo sobre a especialidade foi aceito para publicação. Visibilidade no mercado aumenta.', efeito_rep:2, tipo_noticia:'positivo', efeito_resumo:'+2 rep' },
    { titulo:'Palestra na OAB seccional', descricao:'Você foi convidado para palestrar em evento seccional. Networking valioso.', efeito_rep:2, tipo_noticia:'positivo', efeito_resumo:'+2 rep' },
    { titulo:'Prazo processual crítico', descricao:'Verificação da agenda revelou prazo importante vencendo. Organização interna é fundamental.', efeito_rep:-1, tipo_noticia:'urgente', efeito_resumo:'-1 rep' },
  ],
};

function gerarEventoJogador(j, mesAtual, anoAtual) {
  const esp   = j.especialidade || 'geral';
  const pool  = [
    ...(EVENTOS_POOL[esp]  || []),
    ...(EVENTOS_POOL.geral || []),
  ];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ════════════════════════════════════════════════════════
// RANKINGS GLOBAIS
// ════════════════════════════════════════════════════════
async function atualizarRankings(db) {
  const categorias = [
    { id: 'reputacao',  campo: 'reputacao',           label: 'Reputação' },
    { id: 'dinheiro',   campo: 'dinheiro',             label: 'Patrimônio' },
    { id: 'networking', campo: 'networking',           label: 'Networking' },
    { id: 'academico',  campo: 'prestigio_academico',  label: 'Prestígio Acadêmico' },
  ];

  for (const cat of categorias) {
    try {
      const snap = await db.collection('jogadores')
        .orderBy(cat.campo, 'desc')
        .limit(100)
        .get();

      const top = snap.docs.map((doc, i) => {
        const d = doc.data();
        return {
          pos:           i + 1,
          uid:           d.uid,
          nome:          d.nome_personagem || d.nome || '—',
          valor:         d[cat.campo] || 0,
          cargo_id:      d.cargo_id || 'est',
          escritorio_id: d.escritorio_id || null,
          especialidade: d.especialidade || '—',
        };
      });

      await db.collection('rankings').doc(cat.id).set({
        tipo:           cat.id,
        label:          cat.label,
        top100:         top,
        atualizado_mes: (await db.collection('config').doc('server').get()).data()?.mes_global || 0,
        atualizado_em:  new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`[RANKING] Erro ao atualizar ranking ${cat.id}:`, err);
    }
  }

  // Ranking de escritórios (por prestígio)
  try {
    const snap = await db.collection('escritorios')
      .orderBy('prestigio', 'desc')
      .limit(50)
      .get();

    const top = snap.docs.map((doc, i) => {
      const d = doc.data();
      return {
        pos:       i + 1,
        id:        doc.id,
        nome:      d.nome || '—',
        nivel:     d.nivel || 1,
        prestigio: d.prestigio || 0,
        socios:    (d.socios_uids || []).length,
      };
    });

    await db.collection('rankings').doc('escritorios').set({
      tipo:    'escritorios',
      label:   'Maiores Escritórios',
      top50:   top,
      atualizado_em: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[RANKING] Erro ao atualizar ranking de escritórios:', err);
  }
}

// ════════════════════════════════════════════════════════
// EVENTOS GLOBAIS DO MÊS
// ════════════════════════════════════════════════════════
async function gerarEventoGlobal(db, mesAtual, anoAtual, mesGlobal) {
  // Eventos recorrentes por mês do ano
  const eventosFixos = {
    0:  { titulo: '🏖️ Recesso Judiciário',    descricao: 'Janeiro: tribunais em recesso. Advogados aproveitam para estudar e viajar.', area: null },
    6:  { titulo: '📋 Semana do Advogado',      descricao: 'Julho: Semana Nacional do Advogado. Eventos de networking em todo o país.', area: null },
    10: { titulo: '⚖️ Congresso Jurídico Nacional', descricao: 'Novembro: maior evento jurídico do ano. Novas teses e networking estratégico.', area: null },
  };

  const eventoFixo = eventosFixos[mesAtual];

  // Evento aleatório adicional
  const eventosAleatorios = [
    { titulo: '📈 Mercado em alta', descricao: 'Demanda por serviços jurídicos corporativos aumentou 25% este mês.', area: 'empresarial' },
    { titulo: '🔨 Nova súmula vinculante STF', descricao: 'O STF editou nova súmula vinculante com impacto em processos tributários.', area: 'tributario' },
    { titulo: '📜 Mudança legislativa', descricao: 'Nova lei altera regras processuais em causas cíveis acima de R$ 100.000.', area: 'civil' },
    { titulo: '⚡ Operação da Receita Federal', descricao: 'Operação de fiscalização autuou 200 empresas. Alta demanda por defesa tributária.', area: 'tributario' },
    { titulo: '🌐 Evento OAB Nacional', descricao: 'OAB promove congresso nacional. Advogados participantes ganham +2 rep e networking.', area: null },
  ];

  const aleatorio = eventosAleatorios[Math.floor(Math.random() * eventosAleatorios.length)];

  const eventos = [];
  if (eventoFixo) eventos.push({ ...eventoFixo, fixo: true, mes_global: mesGlobal });
  if (aleatorio)  eventos.push({ ...aleatorio, fixo: false, mes_global: mesGlobal });

  for (const ev of eventos) {
    await db.collection('eventos').add({
      ...ev,
      ano_jogo:   anoAtual,
      mes_jogo:   mesAtual,
      mes_global: mesGlobal,
      ativo:      true,
      criado_em:  new Date().toISOString(),
    });
  }
}

// ════════════════════════════════════════════════════════
// HELPER: ENVIAR MENSAGEM PARA O JOGADOR
// ════════════════════════════════════════════════════════
async function enviarMensagem(db, uid, tipo, dados) {
  try {
    await db.collection('jogadores').doc(uid)
      .collection('inbox').add({
        de:        'sistema',
        para_uid:  uid,
        assunto:   dados.assunto || 'Notificação',
        corpo:     dados.corpo   || '',
        tipo:      tipo || 'sistema',
        tipo_noticia: dados.tipo || 'neutro',
        efeito_resumo: dados.efeito_resumo || null,
        lida:      false,
        criado_em: new Date().toISOString(),
      });
  } catch (err) {
    logger.warn(`[MENSAGEM] Falha ao enviar msg para ${uid}:`, err.message);
  }
}

// ════════════════════════════════════════════════════════
// TABELAS DE SALÁRIO (espelho do frontend)
// ════════════════════════════════════════════════════════
const CARGO_SAL_MIN = {
  est:  1700, ass:  2500, jnr:  3500, pln:  5750,
  snr: 10600, asc: 20000, soc: 35000, snm: 65000,
  jsub:35000, jtit:40000, dsb: 52000, mstj:70000,
  padj:32000, prom:36000, pjus:46000, pgj: 60000,
  dadj:28000, def: 32000, dch: 42000, dge: 56000,
};
const CARGO_SAL_MAX = {
  est:  1700, ass:  3500, jnr:  6650, pln: 11100,
  snr: 20000, asc: 35000, soc: 65000, snm:120000,
  jsub:38000, jtit:44000, dsb: 57000, mstj:77000,
  padj:35000, prom:40000, pjus:52000, pgj: 68000,
  dadj:30000, def: 35000, dch: 48000, dge: 63000,
};

// Perigo do bairro (espelho do frontend)
const IMOVEL_PERIGO = {
  pais:0, kit:0, apm:0, apt_top:0, cas:0, cob:0,
  ipanema:0, leblon:0, lagoa:0, copacabana:0, botafogo:0,
  flamengo:0, catete:0, laranjeiras:0,
  santa_teresa:1, barra_lux:0, barra_med:0, recreio:0,
  jacarepagua:0, pechincha:0,
  centro_apto:1, lapa:1, cinelandia:1, tijuca:0,
  meier:1, iraja:1, madureira:2, sao_cristov:1, penha:2,
  campo_grande:1, santa_cruz:1, bangu:2, realengo:2,
  icarai:0, sao_fco_nit:0, centro_nit:1,
  caxias_apto:2, nova_iguacu:2, belford:2, sao_joao:2, nilop:2,
};
