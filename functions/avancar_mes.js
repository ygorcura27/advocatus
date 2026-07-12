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
const _skillsJur             = require('./skills');
const _peticoes              = require('./peticoes');
const _genericas             = require('./peticoes_genericas');
const _perfis                = require('./perfis');
const { processarRoyaltiesLivros } = require('./artigos_livros');

const ENERGIA_TOTAL        = 100;

const REP_CAP = {
  est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
  jsub:55, jtit:70, dsb:85, mstj:100,
  padj:55, prom:70, pjus:85, pgj:100,
  dadj:55, def:70, dch:85, dge:100,
};

// Progresso mensal de casos do pool delegados a NPCs + reset de energia NPC.
// Essa lógica existia antes apenas no frontend (js/processos_escritorio.js,
// window.avancarProgressoMensal), mas nada no app a chamava — o avanço de
// mês real sempre rodou só por esta Cloud Function, que não sabia da
// existência dela. Resultado prático: processos delegados a NPCs ficavam
// travados em 0% de progresso para sempre (nunca chegavam a
// "aguardando_sentença", então nunca apareciam no Histórico) e a energia
// dos NPCs (`energia_npc_usada_mes`) nunca era zerada, deixando-os
// permanentemente indisponíveis após acumularem uso.
// ── Constantes de NPC ────────────────────────────────────────────────────────
// Progresso máximo que um NPC deste cargo entrega por mês se tiver UM processo.
// Quando tem múltiplos, o total é dividido proporcionalmente.
const NPC_PROG_TOTAL  = { est:20, ass:28, jnr:40, pln:55, snr:70, asc:82, soc:95 };

// Custo de energia por processo ativo por mês (debita de energia_npc_usada_mes)
const NPC_ENERGIA_POR_PROC = 20;
const NPC_ENERGIA_MES = 100;
const NPC_OVERLOAD_TH = 20; // sobrecarga se usado > 80

// Skills relevantes e cap de skills por cargo (espelha processos_escritorio.js)
const SKILLS_REL_NPC  = ['escrita_juridica','pesquisa','oratoria','persuasao','argumentacao'];
const CARGO_CAP_NPC   = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };

// ── Calcula efeito de feedback de um processo concluído (-2..+2) ──
function _calcFeedbackEfeito(resultado, stressNPC, provasSel, provas) {
  let score = 0;
  const forcaAlta = (provasSel || []).filter(i => ((provas || [])[i]?.forca || 0) >= 7).length;
  if (forcaAlta >= 2) score++;
  if (resultado === 'procedente' || resultado === 'parcial') score++;
  if (stressNPC > 70) score--;
  return Math.max(-2, Math.min(2, score));
}

// ── Mapeamento efeito → estrelas: -2→1★, -1→2★, 0→3★, +1→4★, +2→5★ ──
function _efeitoParaEstrelas(efeito) { return Math.round(efeito) + 3; }

// ── Chance de recorrência por estrelas ──
const RECORRENCIA_CHANCE = { 5: 0.90, 4: 0.60, 3: 0.25, 2: 0.10, 1: 0 };

// ── Skill com maior gap para o cap (candidata ao bônus de ranking) ──
function _escolherSkillBonus(npc) {
  const CARGO_CAP_SKL = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
  const cap    = CARGO_CAP_SKL[npc.cargo_id] || 35;
  const skills = npc.skills || {};
  const KEYS   = ['pesquisa','escrita_juridica','argumentacao','oratoria','persuasao'];
  let gap = -1, sk = 'pesquisa';
  for (const k of KEYS) { const g = cap - (skills[k] || 0); if (g > gap) { gap = g; sk = k; } }
  return sk;
}

const _SKL_LABEL = {
  pesquisa:'Pesquisa', escrita_juridica:'Escrita Jurídica',
  argumentacao:'Argumentação', oratoria:'Oratória', persuasao:'Persuasão',
};

// Skills jurídicas / tipos de documento / áreas do direito — mesmas
// chaves de f.skills_jur (ver js/equipe.js _contratarNPC). Usado só pra
// rotular o log/inbox do estudo autônomo quando a skill treinada vem
// deste balde em vez do f.skills tradicional.
const _SKL_JUR_LABEL_CF = {
  legal_drafting:'Redação Jurídica', legal_research:'Pesquisa Jurídica',
  argumentation:'Argumentação (Jur.)', oral_advocacy:'Sustentação Oral',
  negotiation:'Negociação (Jur.)', procedure:'Litigância', gestao:'Gestão (Jur.)',
  doc_initial_filing:'Petição Inicial', doc_responsive_pleading:'Contestação',
  doc_motion:'Requerimento', doc_appellate_brief:'Razões de Apelação',
  doc_supreme_brief:'Razões de Rec. Especial', doc_trial_brief:'Memoriais',
  doc_evidence:'Prova Documental', doc_deposition:'Depoimento',
  area_employment:'Trabalhista', area_tax:'Tributário', area_civil:'Cível',
  area_criminal:'Criminal', area_corporate:'Empresarial',
  area_immigration:'Imigração', area_bankruptcy:'Rec. Judicial',
};
const CAP_JUR_NPC_CF = 50;

// ── Calc eficiência de skills (0.4 a 1.0) ──
// 0.4 mínimo garante que NPCs sem skills ainda evoluem (lentamente)
function _eficienciaNPC(f) {
  const skills = f.skills || {};
  const vals = SKILLS_REL_NPC.map(s => skills[s] || 0);
  const media = vals.reduce((a,b)=>a+b,0) / vals.length;
  const cap   = CARGO_CAP_NPC[f.cargo_id] || 35;
  return Math.max(0.4, Math.min(1.0, media / cap));
}

// ── Sentença automática pelo NPC (mirrors _sentencaOutcome do frontend) ──
// Cargos jnr+ processam sentença com base nas próprias skills.
// Est e ass não processam sentença — o processo fica em aguardando_sentenca
// para o dono ou sócio do escritório resolver manualmente.
const CARGOS_PROC_SENTENCA = new Set(['jnr','pln','snr','asc','soc']);

function _rollSentenca([a, b]) {
  const r = Math.random();
  if (r < a) return 'procedente';
  if (r < a + b) return 'parcial';
  return 'improcedente';
}

function _sentencaOutcomeNPC(efic) {
  if (efic >= .85) return _rollSentenca([.38,.45,.17]);
  if (efic >= .70) return _rollSentenca([.25,.50,.25]);
  if (efic >= .55) return _rollSentenca([.14,.48,.38]);
  if (efic >= .40) return _rollSentenca([.07,.38,.55]);
  if (efic >= .25) return _rollSentenca([.03,.25,.72]);
  return                   _rollSentenca([.01,.12,.87]);
}

async function _processarProgressoNPCsCF(db, escRef, mesGlobal, uid) {
  // Buscar todos os processos em andamento por NPCs (exclui processos assumidos pelo jogador)
  const poolSnap = await escRef.collection('processos_pool')
    .where('status', '==', 'em_andamento').get();

  // Agrupar por func_id (cada NPC tem sua pilha de processos)
  const procsByNpc = {};
  for (const d of poolSnap.docs) {
    const p = d.data();
    if (!p.func_id || p.assumido_uid) continue; // ignorar processos assumidos pelo jogador
    if (!procsByNpc[p.func_id]) procsByNpc[p.func_id] = [];
    procsByNpc[p.func_id].push(d);
  }

  // Buscar dados dos funcionários para calcular eficiência por skills
  const fSnap = await escRef.collection('funcionarios').get();
  const npcMap = {};
  for (const fd of fSnap.docs) {
    npcMap[fd.id] = { id: fd.id, ref: fd.ref, ...fd.data() };
  }

  const proms         = [];
  const logsProgress  = [];
  const energiaAcum   = {}; // funcId → energia gasta neste processamento
  const feedbackDelta = {}; // funcId → delta de feedback_ruim_acumulado (estresse)
  const completedByNpc = {}; // funcId → processos concluídos este mês
  const winsByNpc      = {}; // funcId → vitórias (procedente/parcial)
  const feedbackByNpc  = {}; // funcId → soma dos efeitos de feedback (-2..+2)

  for (const [funcId, procDocs] of Object.entries(procsByNpc)) {
    const npc = npcMap[funcId];
    if (!npc) continue;

    const numAtivos  = procDocs.length;
    const progTotal  = NPC_PROG_TOTAL[npc.cargo_id] || 20;
    const eff        = _eficienciaNPC(npc);
    // Progresso por processo = total disponível ÷ número de casos ativos × eficiência de skills
    const progPorProc = (progTotal / numAtivos) * eff;

    const podeProcessarSentenca = CARGOS_PROC_SENTENCA.has(npc.cargo_id);

    for (const procDoc of procDocs) {
      const p       = procDoc.data();
      const variacao = Math.round((Math.random() * 8) - 3); // −3 a +5
      const ganho   = Math.max(4, Math.round(progPorProc + variacao));
      const novoProg = Math.min(100, (p.progresso || 0) + ganho);

      if (novoProg >= 100 && podeProcessarSentenca) {
        // Jnr+ processa sentença automaticamente com suas próprias skills
        const resultado  = _sentencaOutcomeNPC(eff);
        const hon        = p.honorarios || 0;
        const valorRecebido = resultado === 'procedente' ? hon
          : resultado === 'parcial' ? Math.round(hon * 0.55)
          : Math.round(hon * 0.10);

        // Rastrear feedback para estresse e ranking
        if (resultado === 'procedente') {
          feedbackDelta[funcId] = (feedbackDelta[funcId] || 0) - 1;
          winsByNpc[funcId]     = (winsByNpc[funcId]     || 0) + 1;
        } else if (resultado === 'improcedente') {
          feedbackDelta[funcId] = (feedbackDelta[funcId] || 0) + 1;
        } else if (resultado === 'parcial') {
          winsByNpc[funcId] = (winsByNpc[funcId] || 0) + 1;
        }
        completedByNpc[funcId] = (completedByNpc[funcId] || 0) + 1;
        const fEfeito = _calcFeedbackEfeito(resultado, npc.estresse || 0, p.provas_selecionadas, p.provas);
        feedbackByNpc[funcId]  = (feedbackByNpc[funcId]  || 0) + fEfeito;

        proms.push(procDoc.ref.update({
          progresso: 100, status: 'concluido',
          resultado, valor_recebido: valorRecebido,
          concluido_em: new Date().toISOString(),
        }));
        if (valorRecebido > 0) {
          proms.push(escRef.update({
            caixa: require('firebase-admin/firestore').FieldValue.increment(valorRecebido),
            faturamento_mes_atual: require('firebase-admin/firestore').FieldValue.increment(valorRecebido),
            faturamento_honorarios_mes: require('firebase-admin/firestore').FieldValue.increment(valorRecebido),
          }));
        }
        const iconRes = { procedente:'✅', parcial:'🟡', improcedente:'❌' }[resultado];
        logsProgress.push(_logGestaoCF(escRef,
          `${iconRes} ${npc.nome} processou sentença em "${p.titulo}" — ${resultado}. ${valorRecebido>0?'+R$ '+valorRecebido.toLocaleString('pt-BR'):''}`.trim()));
        if (resultado === 'improcedente' && uid && ['pln','snr','asc','soc'].includes(npc.cargo_id)) {
          logsProgress.push(db.collection('jogadores').doc(uid).collection('inbox').add({
            de: 'sistema',
            assunto: `❌ Derrota inesperada — ${npc.nome}`,
            corpo: `${npc.nome} (${npc.cargo_id?.toUpperCase()}) teve resultado improcedente em "${p.titulo}". Verifique skills e carga de trabalho.`,
            tipo: 'feedback_extremo', lida: false, criado_em: new Date().toISOString(),
          }));
        }
      } else if (novoProg >= 100) {
        // Est/ass atingiram 100% mas não podem processar sentença — aguarda dono
        proms.push(procDoc.ref.update({ progresso: 100, status: 'aguardando_sentenca' }));
        logsProgress.push(_logGestaoCF(escRef,
          `⏳ ${p.func_nome||'Estagiário/Assistente'} concluiu o trabalho em "${p.titulo}" — aguarda sentença do responsável.`));
      } else {
        proms.push(procDoc.ref.update({ progresso: novoProg, status: 'em_andamento' }));
      }
    }

    // Custos de processo para este mês (calculados frescos — designações estão em energia_npc_usada_mes)
    energiaAcum[funcId] = NPC_ENERGIA_POR_PROC * numAtivos;
  }

  if (proms.length) await Promise.all(proms);
  if (logsProgress.length) await Promise.all(logsProgress);

  // Resetar energia + verificar sobrecarga/burnout + atualizar feedback (NPCs ativos)
  const fProms     = [];
  const logsBurn   = [];
  const rankingData = []; // coleta para ordenar depois
  for (const fd of fSnap.docs) {
    const f = fd.data();
    if (f.tipo !== 'npc') continue;

    // Somar: custos de designação acumulados no mês + custos de processos calculados agora
    // mes_energia rastreia em qual mês as designações foram contabilizadas (evita double-count)
    const designCosts = (f.mes_energia === mesGlobal) ? (f.energia_npc_usada_mes || 0) : 0;
    const procCosts   = energiaAcum[fd.id] || 0;
    const npcUsado    = designCosts + procCosts;
    const sobrecarg   = npcUsado > NPC_ENERGIA_MES - NPC_OVERLOAD_TH;
    let novosMeses  = f.meses_sobrecarregado || 0;
    let burnoutNPC  = f.burnout_npc || false;
    let burnoutRest = f.burnout_npc_restante || 0;

    if (burnoutNPC) {
      burnoutRest = Math.max(0, burnoutRest - 1);
      if (burnoutRest === 0) {
        burnoutNPC = false;
        logsBurn.push(_logEquipeCF(escRef,
          `✅ ${f.nome||'Membro'} se recuperou do burnout e voltou a trabalhar.`));
      }
    } else if (sobrecarg) {
      novosMeses++;
      if (novosMeses >= 3) {
        burnoutNPC  = true;
        burnoutRest = 3;
        novosMeses  = 0;
        logsBurn.push(_logEquipeCF(escRef,
          `🔴 ${f.nome||'Membro'} entrou em burnout (3 meses sobrecarregado) — afastado por 3 meses.`));
      }
    } else {
      novosMeses = 0;
    }

    const proximoMes = (mesGlobal || 0) + 1;

    // Feedback: atualiza média acumulada e estrelas
    const nProcsMes      = completedByNpc[fd.id] || 0;
    const feedEfeitoMes  = feedbackByNpc[fd.id]  || 0;
    let novaMediaAcum   = f.feedback_media_acumulada || 0;
    let novaMediaEst    = f.feedback_media_estrelas  || 3;
    let novaRepInterna  = f.reputacao_interna || 50;
    if (nProcsMes > 0) {
      const efMed = feedEfeitoMes / nProcsMes;
      novaMediaAcum   = Math.max(-2, Math.min(2, novaMediaAcum * 0.7 + efMed * 0.3));
      novaMediaEst    = _efeitoParaEstrelas(novaMediaAcum);
      novaRepInterna  = Math.max(0, Math.min(100, novaRepInterna + (efMed >= 1 ? 10 : efMed <= -1 ? -5 : 0)));
    }

    // Estresse: conflitos + feedback ruim acumulado + sobrecarga
    const feedbackBase     = f.feedback_ruim_acumulado || 0;
    const novoFeedbackRuim = Math.max(0, feedbackBase + (feedbackDelta[fd.id] || 0));
    const conflitosAtivos  = (f.conflitos_ativos || []).length;
    const novoEstresse = Math.min(100,
      (conflitosAtivos * 20) +
      (novoFeedbackRuim * 10) +
      (sobrecarg ? 10 : 0)
    );

    // Coletar para ranking mensal
    const casosRanking = nProcsMes + (f.casos_resolvidos_mes || 0);
    const vitorias     = winsByNpc[fd.id] || 0;
    const taxaS        = casosRanking > 0 ? vitorias / casosRanking : 0;
    const rankScore    = (casosRanking * 10) + (novaMediaAcum * 15) + (taxaS * 5);
    rankingData.push({ id: fd.id, ref: fd.ref, f, rankScore, casosRanking });

    fProms.push(fd.ref.update({
      energia_npc_usada_mes:    npcUsado,
      mes_energia:              proximoMes,
      meses_sobrecarregado:     novosMeses,
      burnout_npc:              burnoutNPC,
      burnout_npc_restante:     burnoutRest,
      meses_no_cargo:           (f.meses_no_cargo || 0) + 1,
      casos_resolvidos_mes:     0,
      casos_resolvidos_total:   (f.casos_resolvidos_total || 0) + nProcsMes,
      feedback_ruim_acumulado:  novoFeedbackRuim,
      feedback_media_acumulada: novaMediaAcum,
      feedback_media_estrelas:  novaMediaEst,
      reputacao_interna:        novaRepInterna,
      estresse:                 novoEstresse,
    }));
  }
  if (fProms.length) await Promise.all(fProms);
  if (logsBurn.length) await Promise.all(logsBurn);

  // ── Competição Mensal — Ranking entre NPCs ──────────────────────────────────
  if (rankingData.length >= 2) {
    const FV = require('firebase-admin/firestore').FieldValue;
    rankingData.sort((a, b) => b.rankScore - a.rankScore);

    const CARGO_CAP_SKL = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
    const rankProms = [];
    const rankLogs  = [];

    const _bumpSkill = (npc, pts) => {
      const sk  = _escolherSkillBonus(npc);
      const cap = CARGO_CAP_SKL[npc.cargo_id] || 35;
      const val = Math.min(cap, ((npc.skills || {})[sk] || 0) + pts);
      return { field: `skills.${sk}`, val, skLabel: _SKL_LABEL[sk] || sk };
    };

    // 1º lugar: +5k caixa + skill +3
    const r1 = rankingData[0];
    if (r1.casosRanking > 0) {
      const { field, val, skLabel } = _bumpSkill(r1.f, 3);
      rankProms.push(r1.ref.update({ [field]: val,
        ultimos_positions_ranking: [1, ...((r1.f.ultimos_positions_ranking || []).slice(0, 5))],
        questiona_permanencia: false,
      }));
      rankProms.push(escRef.update({ caixa: FV.increment(5000) }));
      rankLogs.push(_logEquipeCF(escRef,
        `🏆 ${r1.f.nome} ficou em 1º lugar este mês! +R$5.000 ao caixa · ${skLabel} +3.`));
      if (uid) rankProms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema',
        assunto: `🏆 ${r1.f.nome} foi o destaque do mês!`,
        corpo: `${r1.f.nome} ficou em 1º lugar na competição mensal. Bônus: +R$5.000 ao caixa e ${skLabel} +3.`,
        tipo: 'ranking_destaque', lida: false, criado_em: new Date().toISOString(),
      }));
    }

    // 2º lugar: +2k caixa + skill +2
    if (rankingData[1]) {
      const r2 = rankingData[1];
      if (r2.casosRanking > 0) {
        const { field, val, skLabel } = _bumpSkill(r2.f, 2);
        rankProms.push(r2.ref.update({ [field]: val,
          ultimos_positions_ranking: [2, ...((r2.f.ultimos_positions_ranking || []).slice(0, 5))],
          questiona_permanencia: false,
        }));
        rankProms.push(escRef.update({ caixa: FV.increment(2000) }));
        rankLogs.push(_logEquipeCF(escRef,
          `🥈 ${r2.f.nome} ficou em 2º lugar! +R$2.000 ao caixa · ${skLabel} +2.`));
      }
    }

    // 3º lugar: +500 caixa
    if (rankingData[2]) {
      const r3 = rankingData[2];
      if (r3.casosRanking > 0) {
        rankProms.push(r3.ref.update({
          ultimos_positions_ranking: [3, ...((r3.f.ultimos_positions_ranking || []).slice(0, 5))],
          questiona_permanencia: false,
        }));
        rankProms.push(escRef.update({ caixa: FV.increment(500) }));
        rankLogs.push(_logEquipeCF(escRef, `🥉 ${r3.f.nome} ficou em 3º lugar! +R$500 ao caixa.`));
      }
    }

    // Último lugar: streak de penalidade
    const rUlt = rankingData[rankingData.length - 1];
    if (rUlt && rUlt.id !== rankingData[0].id) {
      const posAtual = rankingData.length;
      const histPos  = rUlt.f.ultimos_positions_ranking || [];
      const novoHist = [posAtual, ...histPos.slice(0, 5)];
      const streak   = novoHist.filter(p => p === posAtual).length;
      const updUlt   = { ultimos_positions_ranking: novoHist };

      if (streak >= 6) {
        updUlt.questiona_permanencia = true;
        rankLogs.push(_logEquipeCF(escRef,
          `⚠️ ${rUlt.f.nome} está há ${streak} meses em último — questionando permanência no escritório.`));
        if (uid) rankProms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
          de: 'sistema',
          assunto: `⚠️ ${rUlt.f.nome} pode sair do escritório`,
          corpo: `${rUlt.f.nome} está há ${streak} meses consecutivos em último lugar no ranking. Está questionando a permanência — considere promover ou realocar.`,
          tipo: 'ranking_risco_saida', lida: false, criado_em: new Date().toISOString(),
        }));
      } else if (streak >= 3) {
        updUlt.estresse = Math.min(100, (rUlt.f.estresse || 0) + 15);
        rankLogs.push(_logEquipeCF(escRef,
          `⚠️ ${rUlt.f.nome} está há ${streak} meses em último lugar — aviso: +15 estresse.`));
      }
      rankProms.push(rUlt.ref.update(updUlt));
    }

    if (rankProms.length) await Promise.all(rankProms);
    if (rankLogs.length)  await Promise.all(rankLogs);
  }
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL: MENTORIA
// ════════════════════════════════════════════════════════
async function _processarMentoriaNPCsCF(db, escRef, fSnap, uid) {
  const allNpcs = {};
  for (const fd of fSnap.docs) allNpcs[fd.id] = { id: fd.id, ref: fd.ref, ...fd.data() };

  const proms = [], logs = [];
  const CARGO_CAP_SKL = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };

  for (const fd of fSnap.docs) {
    const aprendiz = fd.data();
    if (aprendiz.tipo !== 'npc' || !aprendiz.mentor_id) continue;
    if ((aprendiz.meses_mentoria_restantes || 0) <= 0) continue;
    if (aprendiz.burnout_npc || aprendiz.em_ferias) continue;

    const mentor = allNpcs[aprendiz.mentor_id];
    if (!mentor || mentor.burnout_npc || mentor.em_ferias) continue;

    const skill = aprendiz.skill_sendo_treinada;
    if (!skill) continue;

    const mentorSkillVal  = (mentor.skills || {})[skill] || 10;
    const ganhoBase       = Math.max(1, Math.round(mentorSkillVal * 0.1));
    const numAprendizes   = (mentor.aprendizes_ids || []).length;
    const afinA           = (aprendiz.afinidade_com_npcs || {})[mentor.id] ?? 50;
    const afinB           = (mentor.afinidade_com_npcs || {})[fd.id] ?? 50;
    const afinMedia       = (afinA + afinB) / 2;
    const bonusAfinidade  = afinMedia >= 80 ? 3 : 0;
    const penaltyIncompat = afinMedia <= 20 ? 0.5 : 1.0;
    const malusMulti      = numAprendizes > 1 ? 2 : 0;
    const ganhoTotal      = Math.max(1, Math.round((ganhoBase + bonusAfinidade - malusMulti) * penaltyIncompat));

    const capAprendiz    = CARGO_CAP_SKL[aprendiz.cargo_id] || 20;
    const novoValAprendiz = Math.min(capAprendiz, ((aprendiz.skills || {})[skill] || 0) + ganhoTotal);
    const capMentor      = CARGO_CAP_SKL[mentor.cargo_id] || 55;
    const novoValMentor  = Math.min(capMentor, mentorSkillVal + 2);
    const novosRestantes = (aprendiz.meses_mentoria_restantes || 1) - 1;

    const updAprendiz = { [`skills.${skill}`]: novoValAprendiz, meses_mentoria_restantes: novosRestantes };
    const updMentor   = { [`skills.${skill}`]: novoValMentor, energia_npc_usada_mes: (mentor.energia_npc_usada_mes || 0) + 30 };

    if (novosRestantes <= 0) {
      updAprendiz.mentor_id = null;
      updAprendiz.skill_sendo_treinada = null;
      updAprendiz.meses_mentoria_restantes = 0;
      updMentor.aprendizes_ids = (mentor.aprendizes_ids || []).filter(id => id !== fd.id);
      logs.push(_logEquipeCF(escRef, `🎓 Mentoria concluída: ${mentor.nome} → ${aprendiz.nome}. ${_SKL_LABEL[skill]||skill} atingiu ${novoValAprendiz}.`));
      proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema',
        assunto: `🎓 Mentoria concluída — ${aprendiz.nome}`,
        corpo: `${mentor.nome} terminou de treinar ${aprendiz.nome} em ${_SKL_LABEL[skill]||skill}. Nível final: ${novoValAprendiz}.`,
        tipo: 'mentoria_concluida', lida: false, criado_em: new Date().toISOString(),
      }));
    } else {
      logs.push(_logEquipeCF(escRef, `📚 ${aprendiz.nome} avançou em ${_SKL_LABEL[skill]||skill} com ${mentor.nome}: +${ganhoTotal} (${novosRestantes} mês(es) restantes).`));
    }
    proms.push(fd.ref.update(updAprendiz));
    proms.push(mentor.ref.update(updMentor));
  }
  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL: CONFLITOS
// ════════════════════════════════════════════════════════
async function _processarConflitosNPCsCF(db, escRef, fSnap, mesGlobal, uid, gestorId) {
  const npcs = fSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(f => f.tipo === 'npc' && !f.burnout_npc && !f.em_ferias);
  if (npcs.length < 2) return;

  const npcMap = {};
  for (const n of npcs) npcMap[n.id] = n;

  // Amortecimento pela habilidade de Gestão do gestor — quanto melhor a
  // gestão, menos desentendimentos novos surgem por mês. Sem gestor ou
  // gestor com skill 0: sem amortecimento (fator 1). Skill 100 (cap
  // máximo, cargo Sócio): corta a chance de novo conflito pela metade.
  const gestor       = gestorId ? npcMap[gestorId] : null;
  const gestaoSkill  = gestor ? ((gestor.skills || {}).gestao || 0) : 0;
  const fatorGestor  = 1 - Math.min(100, gestaoSkill) / 200; // 1.0 → 0.5

  const proms = [], logs = [];
  const processados = new Set(); // evita double-process por par

  for (const npc of npcs) {
    const conflitos = npc.conflitos_ativos || [];
    const novosConflitos = [];

    for (const c of conflitos) {
      if (processados.has(`${npc.id}_${c.com_id}`)) { novosConflitos.push(c); continue; }

      const idadeConflito = mesGlobal - (c.desde_mes_total || mesGlobal);

      if (c.em_mediacao) {
        logs.push(_logEquipeCF(escRef, `✅ Conflito entre ${npc.nome} e ${c.com_nome} foi resolvido após mediação.`));
        const outro = npcMap[c.com_id];
        if (outro) {
          proms.push(outro.ref.update({
            conflitos_ativos: (outro.conflitos_ativos || []).filter(cc => cc.com_id !== npc.id),
          }));
        }
        processados.add(`${c.com_id}_${npc.id}`);
        continue;
      }

      if (c.tipo === 'estrutural' && idadeConflito >= 6) {
        logs.push(_logEquipeCF(escRef, `🚪 ${npc.nome} saiu do escritório após conflito estrutural não resolvido por ${idadeConflito} meses.`));
        proms.push(npc.ref.update({ ativo: false, saiu_em: new Date().toISOString(), motivo_saida: 'conflito_estrutural' }));
        proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
          de: 'sistema',
          assunto: `🚪 ${npc.nome} saiu do escritório`,
          corpo: `${npc.nome} deixou o escritório após ${idadeConflito} meses em conflito estrutural não resolvido com ${c.com_nome}.`,
          tipo: 'npc_saida', lida: false, criado_em: new Date().toISOString(),
        }));
        const outro = npcMap[c.com_id];
        if (outro) {
          proms.push(outro.ref.update({
            conflitos_ativos: (outro.conflitos_ativos || []).filter(cc => cc.com_id !== npc.id),
          }));
        }
        processados.add(`${c.com_id}_${npc.id}`);
        continue;
      }

      if (c.tipo === 'leve' && idadeConflito >= 2) {
        novosConflitos.push({ ...c, tipo: 'estrutural' });
        logs.push(_logEquipeCF(escRef, `⚠️ Conflito entre ${npc.nome} e ${c.com_nome} escalou para estrutural após ${idadeConflito} meses.`));
        proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
          de: 'sistema',
          assunto: `⚠️ Conflito estrutural — ${npc.nome} × ${c.com_nome}`,
          corpo: `O desentendimento entre ${npc.nome} e ${c.com_nome} escalou para conflito estrutural (${idadeConflito} meses sem resolução). Mediar agora custa 10 energia + R$1–3k com 20-40% de sucesso.`,
          tipo: 'conflito_escalado', lida: false, criado_em: new Date().toISOString(),
        }));
        // espelhar no outro
        const outro = npcMap[c.com_id];
        if (outro) {
          const outroConflitos = (outro.conflitos_ativos || []).map(cc =>
            cc.com_id === npc.id ? { ...cc, tipo: 'estrutural' } : cc
          );
          proms.push(outro.ref.update({ conflitos_ativos: outroConflitos }));
        }
      } else {
        novosConflitos.push(c);
      }
      processados.add(`${c.com_id}_${npc.id}`);
    }

    if (novosConflitos.length !== conflitos.length ||
        JSON.stringify(novosConflitos) !== JSON.stringify(conflitos)) {
      proms.push(npc.ref.update({ conflitos_ativos: novosConflitos }));
    }
  }

  // Gerar novos conflitos leves
  const pairsProcessed = new Set();
  for (let i = 0; i < npcs.length; i++) {
    for (let j2 = i + 1; j2 < npcs.length; j2++) {
      const a = npcs[i], b = npcs[j2];
      const pairKey = [a.id, b.id].sort().join('_');
      if (pairsProcessed.has(pairKey)) continue;
      pairsProcessed.add(pairKey);

      const jaTemConflito = (a.conflitos_ativos || []).some(c => c.com_id === b.id)
        || (b.conflitos_ativos || []).some(c => c.com_id === a.id);
      if (jaTemConflito) continue;

      const afinA    = (a.afinidade_com_npcs || {})[b.id] ?? 50;
      const afinB    = (b.afinidade_com_npcs || {})[a.id] ?? 50;
      const afinMedia = (afinA + afinB) / 2;
      // Taxas base reduzidas (eram 0.15/0.07/0.03 — gerava conflito demais
      // em equipes grandes, já que o loop é por PAR: uma equipe de 20 tem
      // 190 pares rolando por mês). fatorGestor amortece ainda mais com
      // boa gestão (metade da chance no cap de skill).
      const chanceBase = afinMedia < 25 ? 0.06 : afinMedia > 60 ? 0.012 : 0.03;
      const chance     = chanceBase * fatorGestor;
      if (Math.random() > chance) continue;

      const c    = { com_id: b.id, com_nome: b.nome, tipo: 'leve', desde_mes_total: mesGlobal, em_mediacao: false };
      const cInv = { com_id: a.id, com_nome: a.nome, tipo: 'leve', desde_mes_total: mesGlobal, em_mediacao: false };
      proms.push(a.ref.update({ conflitos_ativos: [...(a.conflitos_ativos || []), c] }));
      proms.push(b.ref.update({ conflitos_ativos: [...(b.conflitos_ativos || []), cInv] }));
      logs.push(_logEquipeCF(escRef, `😤 Desentendimento surgiu entre ${a.nome} e ${b.nome} — mediação disponível.`));
      proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema',
        assunto: `😤 Desentendimento — ${a.nome} × ${b.nome}`,
        corpo: `Um desentendimento surgiu entre ${a.nome} e ${b.nome}. Mediar agora custa 5 energia. Se ignorado por 2 meses, escala para conflito estrutural.`,
        tipo: 'conflito_novo', lida: false, criado_em: new Date().toISOString(),
      }));
    }
  }

  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL: FÉRIAS
// ════════════════════════════════════════════════════════
async function _processarFeriasNPCsCF(db, escRef, fSnap, mesGlobal, uid) {
  const proms = [], logs = [];
  for (const fd of fSnap.docs) {
    const f = fd.data();
    if (f.tipo !== 'npc') continue;

    if (f.em_ferias) {
      proms.push(fd.ref.update({ em_ferias: false, ultimas_ferias_mes_total: mesGlobal }));
      logs.push(_logEquipeCF(escRef, `🏖️ ${f.nome} voltou das férias.`));
      continue;
    }

    const ultimaFerias   = f.ultimas_ferias_mes_total ?? 0;
    const mesesSemFerias = mesGlobal - ultimaFerias;
    if (mesesSemFerias >= 12 && (f.meses_no_cargo || 0) >= 12) {
      const novoStress = Math.min(100, (f.estresse || 0) + 20);
      proms.push(fd.ref.update({ estresse: novoStress }));
      logs.push(_logEquipeCF(escRef, `⚠️ ${f.nome} está há ${mesesSemFerias} meses sem férias — estresse +20.`));
      if (mesesSemFerias === 12) {
        proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
          de: 'sistema',
          assunto: `⚠️ ${f.nome} precisa de férias`,
          corpo: `${f.nome} está há 12 meses sem tirar férias. Conceda férias no painel de equipe para evitar penalidade de +20 estresse por mês.`,
          tipo: 'ferias_pendente', lida: false, criado_em: new Date().toISOString(),
        }));
      }
    }
  }
  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL: ESTUDO AUTÔNOMO
// ════════════════════════════════════════════════════════
async function _processarEstudoNPCsCF(db, escRef, fSnap, uid) {
  const CARGO_CAP_SKL = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
  const CUSTO_ESTUDO  = 20;

  const proms = [], logs = [];

  for (const fd of fSnap.docs) {
    const f = fd.data();
    if (f.tipo !== 'npc' || f.ativo === false) continue;
    if (f.burnout_npc || f.em_ferias) continue;
    if (f.mentor_id) continue; // aprendiz em mentoria já está sendo treinado

    const energiaUsada = f.energia_npc_usada_mes || 0;
    if (energiaUsada + CUSTO_ESTUDO > 100) continue;

    const cap       = CARGO_CAP_SKL[f.cargo_id] || 20;
    const skills    = f.skills || {};
    const skillsJur = f.skills_jur || {};
    const skillKeys    = Object.keys(skills).filter(k => typeof skills[k] === 'number');
    const skillJurKeys = Object.keys(skillsJur).filter(k => typeof skillsJur[k] === 'number');
    if (!skillKeys.length && !skillJurKeys.length) continue;

    // Pool único {chave, balde, valor, cap} juntando as duas categorias —
    // "Auto" e a busca por alternativa quando a designada já bateu o cap
    // agora enxergam skills_jur/doc/área também, não só o balde tradicional.
    const pool = [
      ...skillKeys.map(k => ({ k, balde: 'skills', v: skills[k] || 0, cap })),
      ...skillJurKeys.map(k => ({ k, balde: 'skills_jur', v: skillsJur[k] || 0, cap: CAP_JUR_NPC_CF })),
    ];

    let alvo = (f.skill_em_estudo && pool.find(p => p.k === f.skill_em_estudo))
      || pool.reduce((best, p) => (p.v / p.cap) < (best.v / best.cap) ? p : best, pool[0]);

    if (alvo.v >= alvo.cap) {
      const alternativa = pool.find(p => p.v < p.cap);
      if (!alternativa) continue;
      alvo = alternativa;
    }

    const ganho   = Math.random() < 0.4 ? 2 : 1; // 60% chance de +1, 40% de +2
    const novoVal = Math.min(alvo.cap, alvo.v + ganho);
    const pctAntes = Math.floor((alvo.v / alvo.cap) * 10) * 10;
    const pctDepois = Math.floor((novoVal / alvo.cap) * 10) * 10;
    const label = _SKL_LABEL[alvo.k] || _SKL_JUR_LABEL_CF[alvo.k] || alvo.k;

    proms.push(fd.ref.update({
      [`${alvo.balde}.${alvo.k}`]: novoVal,
      energia_npc_usada_mes: energiaUsada + CUSTO_ESTUDO,
    }));

    // Log apenas em marcos de 10% (80% e 100% do cap)
    if (pctDepois > pctAntes && (pctDepois === 80 || pctDepois === 100)) {
      const marco = pctDepois === 100 ? 'atingiu o limite' : `atingiu ${pctDepois}% do cap`;
      logs.push(_logEquipeCF(escRef,
        `📖 ${f.nome} ${marco} em ${label} pelo estudo autônomo.`));
      if (pctDepois >= 80 && uid) {
        proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
          de: 'sistema',
          assunto: `📖 ${f.nome} evoluiu em ${label}`,
          corpo: `Pelo esforço próprio, ${f.nome} ${marco} em ${label} (${novoVal}/${alvo.cap}).`,
          tipo: 'estudo_marco', lida: false, criado_em: new Date().toISOString(),
        }));
      }
    }
  }

  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

// ════════════════════════════════════════════════════════
// PROCESSAMENTO MENSAL: TURNOVER
// ════════════════════════════════════════════════════════
async function _verificarTurnoverNPCsCF(db, escRef, uid, fSnap) {
  const proms = [], logs = [];
  for (const fd of fSnap.docs) {
    const f = fd.data();
    if (f.tipo !== 'npc' || f.ativo === false) continue;

    const stressAlto      = (f.estresse || 0) >= 85;
    const novosMesesStress = stressAlto ? (f.meses_stress_alto || 0) + 1 : 0;
    const upd = { meses_stress_alto: novosMesesStress };

    if (novosMesesStress >= 3 && !f.aviso_saida) {
      upd.aviso_saida = true;
      logs.push(_logEquipeCF(escRef, `🚨 ${f.nome} está há 3 meses com estresse muito alto — risco de saída!`));
      proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema',
        assunto: `⚠️ ${f.nome} está pensando em sair`,
        corpo: `${f.nome} (${(f.cargo_id || '').toUpperCase()}) está há 3 meses com estresse extremo.\nTome uma ação antes que seja tarde — promova, conceda férias ou resolva conflitos.`,
        tipo: 'aviso_turnover', lida: false, criado_em: new Date().toISOString(),
      }));
    } else if (novosMesesStress >= 4 && f.aviso_saida) {
      upd.ativo       = false;
      upd.saiu_em     = new Date().toISOString();
      upd.motivo_saida = 'estresse_extremo';
      logs.push(_logEquipeCF(escRef, `🚪 ${f.nome} saiu do escritório devido a estresse extremo prolongado.`));
    }
    proms.push(fd.ref.update(upd));
  }
  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

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

// ── Prazo recursal pool: -2 reputação do jogador se o recurso expirar sem ser jogado ──
async function _verificarPrazosRecursaisPoolCF(db, escId, uid, updates, novoMes, novoAno) {
  const novoMesTotal = (novoAno || 1) * 12 + (novoMes || 0);
  const snap = await db.collection('processos')
    .where('pool_escritorio_id', '==', escId)
    .where('status', '==', 'recurso_pendente')
    .get();

  if (snap.empty) return;

  const proms = [];
  for (const procDoc of snap.docs) {
    const p = procDoc.data();
    if (!p.prazo_final_recurso) continue;
    const prazoTotal = (p.prazo_final_recurso.ano || 1) * 12 + (p.prazo_final_recurso.mes || 0);
    if (novoMesTotal <= prazoTotal) continue;

    // Prazo expirado — finalizar como perdido
    proms.push(procDoc.ref.update({
      status: 'perdido',
      encerrado_mes: novoMesTotal,
      prazo_expirado: true,
    }));
    proms.push(db.collection('escritorios').doc(escId).update({
      total_casos: require('firebase-admin/firestore').FieldValue.increment(1),
      casos_perdidos: require('firebase-admin/firestore').FieldValue.increment(1),
    }));

    // Atualizar pool subcol se vinculado
    if (p.pool_proc_subcol_id && p.pool_proc_esc_id) {
      proms.push(
        db.collection('escritorios').doc(p.pool_proc_esc_id)
          .collection('processos_pool').doc(p.pool_proc_subcol_id)
          .update({ status: 'concluido', resultado: 'improcedente', prazo_expirado: true })
      );
    }

    // Log no diário da gestão
    proms.push(
      db.collection('escritorios').doc(escId)
        .collection('log_gestao')
        .add({
          texto: `⏰ Prazo recursal expirado em "${p.titulo || p.autor || 'processo'}". Encerrado sem sustentação. −2 reputação.`,
          criado_em: new Date().toISOString(),
        })
    );

    // -2 reputação do jogador (acumulado em updates para o _commit)
    const repAtual = updates.reputacao ?? 30;
    updates.reputacao = Math.max(0, repAtual - 2);
  }

  if (proms.length) await Promise.all(proms);
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

  // ── PROFILE_ID (GDD v5.1 §39-40) — atribuição lazy na primeira execução ──
  if (!j.profile_id) {
    try {
      await _perfis.atribuirProfileIdJogador(db, uid);
    } catch (e) {
      logger.warn('[PROFILE_ID] Erro ao atribuir profile_id:', e.message);
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
  const newSkills    = { ...(j.skills || {}) };
  const newSkillsJur = _skillsJur.normalizarSkillsJur(j.skills_jur);
  for (const est of prontos) {
    if (est.tipo === 'skills_jur') {
      // Teto de skill 0-50, estendido por bonus de pós-graduação (GDD v5.1 §20)
      const bonusPosGrad = j.posgrad_bonus_skill || 0;
      const capSkillJur  = Math.round(50 * (1 + bonusPosGrad));
      newSkillsJur[est.skill] = Math.max(0, Math.min(capSkillJur, (newSkillsJur[est.skill] || 0) + est.ganho));
    } else {
      const cap = REP_CAP[j.cargo_id] || 55;
      newSkills[est.skill] = Math.min(cap, (newSkills[est.skill] || 0) + est.ganho);
    }
    mensagens.push({ assunto:`📚 Estudo concluído: ${est.skill_label}`, corpo:`+${est.ganho} em ${est.skill_label}.`, tipo:'positivo' });
  }
  if (prontos.length > 0) {
    updates.skills      = newSkills;
    updates.skills_jur  = newSkillsJur;
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
      // Lê escritório antes do reset para processar sócio investidor (GDD §33)
      const escSnapPre  = await escRefProprio.get();
      const escUpdReset = { faturamento_mes_atual: 0, faturamento_recorrente_mes: 0, faturamento_honorarios_mes: 0 };
      if (escSnapPre.exists) {
        const escPre = escSnapPre.data();
        const inv    = escPre.investidor;
        if (inv?.ativo && (escPre.faturamento_mes_atual || 0) > 0) {
          const pagamento   = Math.floor(escPre.faturamento_mes_atual * (inv.pct || 0.20));
          const novosMeses  = (inv.meses_restantes || 1) - 1;
          escUpdReset.caixa = Math.max(0, (escPre.caixa || 0) - pagamento);
          escUpdReset.investidor = novosMeses <= 0 ? null : {
            ...inv, meses_restantes: novosMeses, total_pago: (inv.total_pago || 0) + pagamento,
          };
          mensagens.push({
            assunto: novosMeses <= 0 ? '🤝 Contrato Investidor Encerrado' : '🤝 Sócio Investidor',
            corpo: novosMeses <= 0
              ? `Contrato com ${inv.nome} cumprido! Total pago: R$${((inv.total_pago||0)+pagamento).toLocaleString('pt-BR')}.`
              : `${Math.round((inv.pct||0.20)*100)}% do faturamento (R$${pagamento.toLocaleString('pt-BR')}) → ${inv.nome} · ${novosMeses} meses restantes.`,
            tipo: novosMeses <= 0 ? 'positivo' : 'neutro',
          });
        }
      }
      await escRefProprio.update(escUpdReset);
      const funcSnap = await escRefProprio.collection('funcionarios').get();
      const resets   = funcSnap.docs.map(d => d.ref.update({ acoes_mes_usadas: 0, acao_atual: null }));
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

  // ── Juros da linha de crédito (GDD Seção 32) ──
  const lc = j.linha_credito;
  if (lc && lc.saldo > 0) {
    const juros = Math.ceil(lc.saldo * (lc.juros_pct || 0.025));
    const novoSaldoLC = lc.saldo + juros;
    updates.linha_credito = { ...lc, saldo: novoSaldoLC };
    updates.dinheiro = (updates.dinheiro || j.dinheiro || 0) - juros;
    if (juros > 0) mensagens.push({
      assunto: '💳 Juros Linha de Crédito',
      corpo: `Saldo devedor: R$${lc.saldo.toLocaleString('pt-BR')} · Juros 2,5%: -R$${juros.toLocaleString('pt-BR')}.`,
      tipo: 'urgente',
    });
  }

  // ── Rendimentos de investimentos (GDD Seção 32) ──
  const invData = j.investimentos;
  if (invData) {
    // Renda fixa: 0,8%/mês exato
    if (invData.renda_fixa?.length) {
      const rend = invData.renda_fixa.reduce((s, i) => s + Math.floor(i.valor_aplicado * (i.taxa_mensal || 0.008)), 0);
      if (rend > 0) {
        updates.dinheiro = (updates.dinheiro ?? j.dinheiro ?? 0) + rend;
        mensagens.push({ assunto: '📈 Renda Fixa', corpo: `+R$${rend.toLocaleString('pt-BR')} de rendimentos este mês.`, tipo: 'positivo' });
      }
    }
    // Fundos: taxa variável dentro do intervalo min/max
    if (invData.fundos?.length) {
      let fundoTotal = 0;
      for (const fund of invData.fundos) {
        const taxa = (fund.min || 0) + Math.random() * ((fund.max || 0.008) - (fund.min || 0));
        fundoTotal += Math.floor(fund.valor_aplicado * taxa);
      }
      if (fundoTotal !== 0) {
        updates.dinheiro = (updates.dinheiro ?? j.dinheiro ?? 0) + fundoTotal;
        mensagens.push({ assunto: fundoTotal >= 0 ? '📈 Fundos' : '📉 Fundos', corpo: `${fundoTotal >= 0 ? '+' : ''}R$${Math.abs(fundoTotal).toLocaleString('pt-BR')} nos seus fundos este mês.`, tipo: fundoTotal >= 0 ? 'positivo' : 'negativo' });
      }
    }
    // Imóvel renda: aluguel fixo mensal
    if (invData.imovel_renda) {
      const aluguel = invData.imovel_renda.aluguel_mensal || 0;
      if (aluguel > 0) {
        updates.dinheiro = (updates.dinheiro ?? j.dinheiro ?? 0) + aluguel;
        mensagens.push({ assunto: '🏠 Aluguel Imóvel', corpo: `Seu imóvel gerou R$${aluguel.toLocaleString('pt-BR')} de aluguel este mês.`, tipo: 'positivo' });
      }
    }
    // Firmas NPC: dividendos variáveis por volatilidade
    if (invData.firma_npc?.length) {
      let firmTotal = 0;
      for (const part of invData.firma_npc) {
        const fator = 1 + (Math.random() * 2 - 1) * (part.volatilidade || 0.20);
        firmTotal += Math.floor(part.valor_investido * (part.pct_base || 0.009) * fator);
      }
      if (firmTotal !== 0) {
        updates.dinheiro = (updates.dinheiro ?? j.dinheiro ?? 0) + firmTotal;
        mensagens.push({ assunto: firmTotal >= 0 ? '🏢 Dividendos' : '🏢 Prejuízo Firma', corpo: `${firmTotal >= 0 ? '+' : ''}R$${Math.abs(firmTotal).toLocaleString('pt-BR')} das participações em firmas este mês.`, tipo: firmTotal >= 0 ? 'positivo' : 'negativo' });
      }
    }
  }

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
  // Disposição virou mecânica real em 2026-07-11 (antes só decaía/regenerava
  // sem efeito nenhum). Frequentar a academia é o jeito ativo de recuperar —
  // some com o -2 passivo e ainda soma. Efeito prático: modifica o
  // orçamento de energia do próximo mês via window.bonusEnergiaDisposicao
  // (js/relacionamento_dados.js:getEnergiaTotal) — ≥80 dá +10⚡, 50-79
  // neutro, 20-49 -10⚡, <20 -20⚡ (e emite aviso abaixo).
  if (j.academia_ativa && j.academia_usada_mes) disposicao = Math.min(100, disposicao + 2);
  if (disposicao < 20 && (j.disposicao ?? 80) >= 20) {
    mensagens.push({
      assunto: '😩 Esgotamento físico',
      corpo: 'Sua Disposição caiu abaixo de 20 — você vai sentir isso no orçamento de energia do próximo mês (-20⚡). Frequente a academia ou vá com calma.',
      tipo: 'urgente',
    });
  }

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
    // Trava de 1h real removida — o mês só avança por ação do jogador
    // (em breve isso vai virar 1 mês/dia automático, então não faz
    // sentido também travar janeiro atrás de um cooldown de relógio).
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

  // ── PRAZOS RECURSAIS DO POOL (processos do escritório via _processarSentenca) ──
  if (j.escritorio_proprio_id) {
    try {
      await _verificarPrazosRecursaisPoolCF(db, j.escritorio_proprio_id, uid, updates, novoMes, novoAno);
    } catch (e) {
      logger.warn('Erro ao verificar prazos recursais do pool:', e.message);
    }
  }

  // ── EVOLUÇÃO DE SKILLS DE COMPOSIÇÃO JURÍDICA (GDD v4.1 — Etapa 3) ──
  try {
    await _skillsJur.processarEvolucaoSkillsJurMensalCF(db, uid, j);
  } catch (e) {
    logger.warn('Erro ao evoluir skills de composição:', e.message);
  }
  // Resetar contador de petições compostas no mês
  updates.peticoes_compostas_mes = 0;

  // ── CONCLUIR PETIÇÕES EM CONFECÇÃO (GDD v5.1 §6 — finaliza com nota_teto) ──
  try {
    const finalizadas = await _peticoes.finalizarPeticoesPendentes(db, uid, j, mesGlobal);
    if (finalizadas.length > 0) {
      const nomes = finalizadas.map(p => `"${p.nome}" (teto ${p.nota_teto || '?'}/26)`).join(', ');
      mensagens.push({
        assunto: `📜 ${finalizadas.length} petição${finalizadas.length > 1 ? 'ões finalizadas' : ' finalizada'}!`,
        corpo:   `${nomes} — pronta${finalizadas.length > 1 ? 's' : ''} para uso no setlist.`,
        tipo: 'positivo',
      });
    }
  } catch (e) {
    logger.warn('Erro ao finalizar petições em confecção:', e.message);
  }

  // ── DECAIMENTO DE POPULARIDADE DAS PETIÇÕES (GDD v4.1 — Etapa 13) ──
  try {
    await _peticoes.processarDecaimentoPopularidade(db, uid);
  } catch (e) {
    logger.warn('Erro ao processar decaimento de popularidade:', e.message);
  }

  // ── DECAIMENTO DAS GENÉRICAS GLOBAIS (GDD v5.1 §9) ──
  // Só roda uma vez por "avanço de mês real" — evita processar N vezes
  // por causa de múltiplos jogadores. O tick_mensal.js é o lugar ideal
  // quando migrar para relógio global; por ora chama aqui mas é idempotente.
  try {
    // Inicializa as genéricas se não existirem (lazy, idempotente)
    await _genericas.inicializarGenericas(db);
    await _genericas.processarDecaimentoGenericas(db);
  } catch (e) {
    logger.warn('Erro ao processar genéricas globais:', e.message);
  }

  // ── SEGURO MALPRACTICE — cobrança mensal (GDD v5.1 §28) ──
  if (j.malpractice_tier && j.malpractice_custo_mensal > 0) {
    updates.dinheiro = (updates.dinheiro || (j.dinheiro || 0)) - j.malpractice_custo_mensal;
  }

  // ── INTERCÂMBIO — verificar conclusão (GDD v5.1 §26) ──
  if (j.intercambio_ativo && j.intercambio_mes_conclusao <= mesGlobal) {
    const destinos = {
      eua: { bonus_rep: 5, bonus_area: 'corporate' },
      uk:  { bonus_rep: 5, bonus_area: 'civil' },
      europa: { bonus_rep: 4, bonus_area: 'employment' },
      asia:   { bonus_rep: 8, bonus_area: 'tax' },
    };
    const dOpt = destinos[j.intercambio_destino] || { bonus_rep: 4, bonus_area: null };
    updates.intercambio_ativo      = false;
    updates.intercambio_concluido  = j.intercambio_destino;
    updates.reputacao              = Math.min(100, (j.reputacao || 30) + dOpt.bonus_rep);
    if (dOpt.bonus_area) {
      const skJurAtual = _skillsJur.normalizarSkillsJur(j.skills_jur);
      updates.skills_jur = { ...skJurAtual, [dOpt.bonus_area]: Math.min(55, (skJurAtual[dOpt.bonus_area] || 0) + 3) };
    }
    mensagens.push({
      assunto: `${j.intercambio_badge || '🌍'} Intercâmbio concluído!`,
      corpo:   `Seu período no ${j.intercambio_destino?.toUpperCase()} terminou. +${dOpt.bonus_rep} Rep e +3 em ${dOpt.bonus_area || 'skills'}.`,
      tipo:    'positivo',
    });
  }

  // ── ROYALTIES DE LIVROS (GDD v5.1 §31-34) ──
  try {
    const royalties = await processarRoyaltiesLivros(db, uid, mesGlobal);
    if (royalties > 0) {
      mensagens.push({
        assunto: '📗 Royalties recebidos',
        corpo:   `Você recebeu R$${royalties.toLocaleString('pt-BR')} em royalties de livros este mês.`,
        tipo:    'positivo',
      });
    }
  } catch (e) {
    logger.warn('[ROYALTIES] Erro ao processar royalties:', e.message);
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
    try { await _verificarElegibilidadeGestorCF(db, uid, j); } catch(e) { logger.warn('Gestor check:', e.message); }
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

  // O advogado (jogador) representa uma parte, nunca É a parte — antes
  // `autor: j.nome_personagem` colocava o próprio jogador como autor do
  // processo. O cliente que gerou a oportunidade é quem tem o caso (autor);
  // a contraparte precisa de um nome próprio, sorteado do mesmo pool de
  // nomes de cliente (excluindo o próprio cliente) já que não existe um
  // gerador de contraparte dedicado nesse fluxo.
  const poolContraparte = [
    ...NOMES_CLIENTE_PF_REL,
    ...Object.values(NOMES_CLIENTE_PJ_REL).flat(),
  ].filter(n => n !== oportunidade.cliente_nome);
  const contraparte = poolContraparte.length
    ? poolContraparte[Math.floor(Math.random() * poolContraparte.length)]
    : 'Parte contrária';

  await db.collection('processos').add({
    numero: `${String(Math.floor(Math.random()*9999999)).padStart(7,'0')}-${String(Math.floor(Math.random()*99)).padStart(2,'0')}.${j.ano_pessoal||1}.8.19.0001`,
    tipo: 'Ação decorrente de ' + oportunidade.tipo,
    area, tipo_processo: 'judicial',
    autor: oportunidade.cliente_nome, reu: contraparte,
    tribunal: 'TJRJ', advogado_uid: j.uid, escritorio_id: j.escritorio_proprio_id||null,
    status:'andamento', instancia:1, progresso:0, chance_sucesso:55,
    valor: Math.floor(valorCausa), nivel:5, hon_total_acumulado:0,
    urgente:false, recurso_pendente:false,
    criado_mes: j.mes_pessoal||0, encerrado_mes:null,
  });
}

// ════════════════════════════════════════════════════════
// GESTOR: AUTO-MENTORIA
// ════════════════════════════════════════════════════════
async function _gestorAutoMentoriaCF(db, escRef, fSnap, uid) {
  const CARGO_CAP_SKL = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
  const MENTOR_CARGOS = new Set(['pln','snr','asc','soc']);
  const APRENDIZ_CARGOS = new Set(['est','ass','jnr']);

  const npcs = fSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(f => f.tipo === 'npc' && f.ativo !== false && !f.burnout_npc && !f.em_ferias);

  const mentores    = npcs.filter(f => MENTOR_CARGOS.has(f.cargo_id) && (f.aprendizes_ids||[]).length < 2);
  const semMentor   = npcs.filter(f => APRENDIZ_CARGOS.has(f.cargo_id) && !f.mentor_id);
  if (!mentores.length || !semMentor.length) return;

  const proms = [], logs = [];
  for (const aprendiz of semMentor) {
    const mentor = mentores.find(m => (m.aprendizes_ids||[]).length < 2);
    if (!mentor) break;

    const skills    = Object.keys(mentor.skills || {}).filter(sk => (mentor.skills[sk]||0) > 0);
    const skill     = skills[Math.floor(Math.random() * skills.length)] || 'pesquisa';
    const duracao   = 3;

    proms.push(mentor.ref.update({ aprendizes_ids: [...(mentor.aprendizes_ids||[]), aprendiz.id] }));
    proms.push(aprendiz.ref.update({
      mentor_id: mentor.id, mentor_nome: mentor.nome,
      skill_sendo_treinada: skill, meses_mentoria_restantes: duracao,
    }));
    mentor.aprendizes_ids = [...(mentor.aprendizes_ids||[]), aprendiz.id];
    logs.push(_logEquipeCF(escRef, `🤖 Gestor iniciou mentoria: ${mentor.nome} → ${aprendiz.nome} (${_SKL_LABEL[skill]||skill}, ${duracao} meses).`));
    proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
      de: 'sistema',
      assunto: `🎓 Gestor iniciou mentoria — ${aprendiz.nome}`,
      corpo: `O gestor pareou ${mentor.nome} com ${aprendiz.nome} para treinar ${_SKL_LABEL[skill]||skill} por ${duracao} meses.`,
      tipo: 'gestor_mentoria', lida: false, criado_em: new Date().toISOString(),
    }));
  }
  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

// ════════════════════════════════════════════════════════
// GESTOR: AUTO-MEDIAÇÃO DE CONFLITOS LEVES
// ════════════════════════════════════════════════════════
async function _gestorAutoMediacaoLeveCF(db, escRef, fSnap, uid) {
  const npcs = fSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(f => f.tipo === 'npc' && f.ativo !== false);

  const npcMap = {};
  for (const n of npcs) npcMap[n.id] = n;

  const proms = [], logs = [];
  const processados = new Set();

  for (const npc of npcs) {
    for (const c of (npc.conflitos_ativos || [])) {
      if (c.tipo !== 'leve' || c.em_mediacao) continue;
      const pairKey = [npc.id, c.com_id].sort().join('_');
      if (processados.has(pairKey)) continue;
      processados.add(pairKey);

      const updConflitos = (npc.conflitos_ativos||[]).map(cc =>
        cc.com_id === c.com_id ? { ...cc, em_mediacao: true } : cc
      );
      proms.push(npc.ref.update({ conflitos_ativos: updConflitos }));

      const outro = npcMap[c.com_id];
      if (outro) {
        const updOutro = (outro.conflitos_ativos||[]).map(cc =>
          cc.com_id === npc.id ? { ...cc, em_mediacao: true } : cc
        );
        proms.push(outro.ref.update({ conflitos_ativos: updOutro }));
      }
      logs.push(_logEquipeCF(escRef, `🤖 Gestor mediou conflito leve entre ${npc.nome} e ${c.com_nome}.`));
      proms.push(db.collection('jogadores').doc(uid).collection('inbox').add({
        de: 'sistema',
        assunto: `⚖️ Gestor mediou conflito — ${npc.nome} × ${c.com_nome}`,
        corpo: `O gestor interveio e iniciou mediação do desentendimento entre ${npc.nome} e ${c.com_nome}. Resultado será processado no próximo mês.`,
        tipo: 'gestor_mediacao', lida: false, criado_em: new Date().toISOString(),
      }));
    }
  }
  if (proms.length) await Promise.all(proms);
  if (logs.length)  await Promise.all(logs);
}

async function _processarServicosMensalCF(db, uid, j) {
  const escId = j.escritorio_proprio_id;
  if (!escId) return;

  const escRef  = db.collection('escritorios').doc(escId);
  const escSnap = await escRef.get();
  if (!escSnap.exists) return;
  const esc  = escSnap.data();
  const tier = esc.tier || 1;

  await _processarProgressoNPCsCF(db, escRef, esc.mes_global || 0, uid);

  try {
    const fSnapFresh = await escRef.collection('funcionarios').get();
    await _processarMentoriaNPCsCF(db, escRef, fSnapFresh, uid);
    await _processarEstudoNPCsCF(db, escRef, fSnapFresh, uid);
    await _processarConflitosNPCsCF(db, escRef, fSnapFresh, esc.mes_global || 0, uid, esc.gestor_id);
    await _processarFeriasNPCsCF(db, escRef, fSnapFresh, esc.mes_global || 0, uid);
    await _verificarTurnoverNPCsCF(db, escRef, uid, fSnapFresh);

    // Gestor auto-delegações
    if (esc.gestor_id) {
      if (esc.gestor_delega_mentoria) {
        await _gestorAutoMentoriaCF(db, escRef, fSnapFresh, uid);
      }
      if (esc.gestor_delega_conflitos) {
        await _gestorAutoMediacaoLeveCF(db, escRef, fSnapFresh, uid);
      }
    }
  } catch (e) {
    const logger = require('firebase-functions/logger');
    logger.warn('Erro no processamento de dinâmica da equipe:', e.message);
  }

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

  // Indicações automáticas por clientes com alta satisfação (GDD Seção 29)
  try { await _processarIndicacoesClientesCF(escRef, tier, prestigioPct); } catch(e) { /* silencioso */ }

  await _processarAutogestaoOportunidadesCF(db, escRef, esc);

  if (esc.gestor_id && (esc.gestor_delega_processos !== false)) {
    await _autoAtribuirProcessosMensalCF(db, escRef, esc);
  }

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
        faturamento_recorrente_mes: (esc.faturamento_recorrente_mes||0) + receitaRecorrente,
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
        recorrente:false, valor_mensal:0,
        perfil: _sortearPerfilCF(),
        rede_tamanho: _redeTamanhoCF(op.cliente_tipo, op.cliente_porte),
        criado_em:new Date().toISOString(),
      });
    } else {
      const cDoc=clSnap.docs[0]; const c=cDoc.data();
      const upd = { confianca: Math.min(100,(c.confianca||50)+(op.confianca_gerada||0)) };
      if (!c.perfil) upd.perfil = _sortearPerfilCF();
      if (!c.rede_tamanho) upd.rede_tamanho = _redeTamanhoCF(c.tipo||op.cliente_tipo, c.porte||op.cliente_porte);
      await cDoc.ref.update(upd);
    }
  }

  if (caixaGanho > 0) {
    await escRef.update({ caixa: (esc.caixa||0) + caixaGanho });
  }
}

// ── GDD Seção 28-30: perfis de cliente e indicações automáticas ──────────────
const _PERFIS_CF   = ['conservador','ansioso','pragmatico','exigente','leal'];
const _PESOS_CF    = [0.20, 0.15, 0.35, 0.20, 0.10];

function _sortearPerfilCF() {
  const r = Math.random(); let acc = 0;
  for (let i = 0; i < _PESOS_CF.length; i++) { acc += _PESOS_CF[i]; if (r < acc) return _PERFIS_CF[i]; }
  return 'pragmatico';
}

function _redeTamanhoCF(tipo, porte) {
  if (tipo === 'PF') return 'pequena';
  if (porte === 'grande' || porte === 'mega') return 'grande';
  if (porte === 'media') return 'media';
  return 'pequena';
}

// Clientes com alta satisfação (confiança ≥ 80) geram indicações espontâneas
// a cada mês conforme o tamanho da rede.
async function _processarIndicacoesClientesCF(escRef, tier, prestigioPct) {
  const altaSnap = await escRef.collection('clientes').where('confianca', '>=', 80).get();
  if (altaSnap.empty) return;

  const CHANCE = { pequena:0.15, media:0.25, grande:0.40 };
  const proms  = [];

  for (const cDoc of altaSnap.docs) {
    const c = cDoc.data();
    const chance = CHANCE[c.rede_tamanho || 'pequena'] || 0.15;
    if (Math.random() > chance) continue;

    const op = _gerarOportunidadeCF(tier, prestigioPct);
    op.indicado_por   = c.nome;
    op.cliente_nome   = _nomeIndicadoCF(c.nome);
    proms.push(escRef.collection('oportunidades').add({ ...op, status:'disponivel' }));
    proms.push(_logGestaoCF(escRef,
      `🤝 ${c.nome} indicou um novo cliente: "${op.cliente_nome}" (${op.tipo}).`));
    await cDoc.ref.update({ ultima_indicacao_mes: new Date().toISOString() });
  }
  if (proms.length) await Promise.all(proms);
}

function _nomeIndicadoCF(nomeIndicador) {
  const PF = ['Dr. Luís Mendes','Ana Beatriz Costa','Rodrigo Faria','Isabela Pinto',
              'Marcos Oliveira','Fernanda Lima','Paulo Sérgio Corrêa','Cláudia Ramos'];
  const PJ = ['VR Engenharia','GrupoMax','Fortis Logística','InfoBrasil Ltda',
              'Construtora Ágil','SulImport Com.','Pharma Plus','Delta Serviços'];
  const pool = (Math.random() < 0.5 ? PF : PJ).filter(n => n !== nomeIndicador);
  return pool[Math.floor(Math.random() * pool.length)] || 'Indicação de Cliente';
}

// Diário da gestão — processos: sentenças, designações, recursos.
async function _logGestaoCF(escRef, texto) {
  await escRef.collection('log_gestao').add({ texto, criado_em: new Date().toISOString() });
}

// Diário da equipe — pessoas: mentoria, conflitos, férias, estudo, turnover, ranking.
async function _logEquipeCF(escRef, texto) {
  await escRef.collection('log_equipe').add({ texto, criado_em: new Date().toISOString() });
}

const _TIER_ORDER_CF     = { D:0, C:1, B:2, A:3, S:4 };
const _CARGO_TIER_MAX_CF = { est:'D', ass:'C', jnr:'B', pln:'A', snr:'S', asc:'S', soc:'S' };
// Máximo de processos simultâneos por cargo
const NPC_MAX_PROC = { est:1, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:5 };

function _npcPodeManejar(cargo_id, tier) {
  const maxTier = _CARGO_TIER_MAX_CF[cargo_id] || 'D';
  return (_TIER_ORDER_CF[tier] || 0) <= (_TIER_ORDER_CF[maxTier] || 0);
}

async function _autoAtribuirProcessosMensalCF(db, escRef, esc) {
  const poolSnap = await escRef.collection('processos_pool')
    .where('status', '==', 'disponivel').get();
  if (poolSnap.empty) return;

  const fSnap = await escRef.collection('funcionarios').get();
  const npcsDisponiveis = fSnap.docs
    .map(d => ({id:d.id, ...d.data()}))
    .filter(f => f.tipo === 'npc' && f.ativo !== false && !f.burnout_npc);

  if (npcsDisponiveis.length === 0) return;

  // Contar processos ativos por NPC para respeitar NPC_MAX_PROC
  const ativosSnap = await escRef.collection('processos_pool')
    .where('status', '==', 'em_andamento').get();
  const procCount = {}; // funcId → quantidade de processos ativos
  for (const d of ativosSnap.docs) {
    const fid = d.data().func_id;
    if (fid) procCount[fid] = (procCount[fid] || 0) + 1;
  }

  const gestorNome = esc.gestor_nome || 'O gestor';

  // Pré-calcular eficiência de cada NPC (usada para priorização)
  const eficMap = {};
  for (const f of npcsDisponiveis) eficMap[f.id] = _eficienciaNPC(f);

  // Limite de energia: (procCount+1)*20 <= 80 → máx 4 processos ativos por NPC
  const ENERGIA_LIMITE_PROC = Math.floor((NPC_ENERGIA_MES - NPC_OVERLOAD_TH) / NPC_ENERGIA_POR_PROC); // = 4

  for (const procDoc of poolSnap.docs) {
    const proc = procDoc.data();
    const npc = npcsDisponiveis
      .filter(f => {
        const atual = procCount[f.id] || 0;
        const cabeNoMax  = atual < (NPC_MAX_PROC[f.cargo_id] || 1);
        const naoPerdeEnergia = (atual + 1) <= ENERGIA_LIMITE_PROC; // não cai abaixo de 20%
        return cabeNoMax && naoPerdeEnergia && _npcPodeManejar(f.cargo_id, proc.tier || 'D');
      })
      // Mais eficiente primeiro; em empate, menos processos ativos
      .sort((a, b) => {
        const de = (eficMap[b.id] || 0) - (eficMap[a.id] || 0);
        if (Math.abs(de) > 0.01) return de;
        return (procCount[a.id]||0) - (procCount[b.id]||0);
      })[0];
    if (!npc) continue; // nenhum NPC elegível — processo fica para dono/sócio

    // Incrementar contador local antes de continuar o loop
    procCount[npc.id] = (procCount[npc.id] || 0) + 1;

    await procDoc.ref.update({
      status: 'em_andamento',
      func_id: npc.id,
      func_nome: npc.nome,
      func_cargo: npc.cargo_id,
      designado_por_gestor: true,
      designado_em: new Date().toISOString(),
      progresso: 0,
    });

    await _logGestaoCF(escRef,
      `👤 ${gestorNome} designou "${proc.titulo}" (${proc.cliente_nome||'cliente'}) para ${npc.nome}.`);
  }
}

async function _verificarElegibilidadeGestorCF(db, uid, j) {
  const escId = j.escritorio_empregado_id;
  if (!escId) return;

  const escRef = db.collection('escritorios').doc(escId);
  const escSnap = await escRef.get();
  if (!escSnap.exists) return;
  const esc = escSnap.data();

  if (esc.gestor_id) return;

  const CARGO_ORDER = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6 };
  const GESTAO_CAP  = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };
  const NETWORK_CAP = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100 };

  const cargo_id   = j.cargo_id;
  const gestaoCap  = GESTAO_CAP[cargo_id] || 55;
  const networkCap = NETWORK_CAP[cargo_id] || 55;
  const gestaoAtual = (j.skills||{}).gestao || 0;
  const netAtual    = j.networking || 0;

  if (gestaoAtual < gestaoCap) return;
  if (netAtual < networkCap * 0.7) return;

  const fSnap = await escRef.collection('funcionarios').get();
  const funcs = fSnap.docs.map(d=>({id:d.id,...d.data()})).filter(f=>f.ativo!==false);

  const maiorOrdem = Math.max(...funcs.map(f => CARGO_ORDER[f.cargo_id]||0), 0);
  const meuOrdem   = CARGO_ORDER[cargo_id] || 0;
  if (meuOrdem < maiorOrdem) return;

  await escRef.update({
    gestor_id: uid,
    gestor_nome: j.nome_personagem || 'Gestor',
    gestor_cargo: cargo_id,
  });

  await db.collection('jogadores').doc(uid).collection('inbox').add({
    de:'sistema', para_uid: uid,
    assunto: 'Voce e o novo Gestor do Escritorio',
    corpo: `Sua dedicacao e lideranca foram reconhecidas. Voce foi promovido(a) a Gestor(a) de ${esc.nome||'escritorio'}. A partir de agora coordena a alocacao de processos da equipe a cada mes.`,
    tipo:'sistema', tipo_noticia:'positivo', lida:false, criado_em: new Date().toISOString(),
  });
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
  // Disposição por frequência de academia NÃO entra aqui — este bloco roda
  // dentro de _processarRelacionamentosMensalCF, que faz seu próprio
  // .update() e é chamado (linha ~1360) ANTES do _commit() da função
  // principal (linha ~1459). Como o _commit() final grava updates.disposicao
  // calculado a partir do MESMO snapshot pré-tick de `j`, qualquer alteração
  // de disposição feita aqui seria sobrescrita silenciosamente. Fica no
  // bloco de energia/saúde mental/disposição da função principal (ver
  // updates.disposicao logo abaixo de ENERGIA_TOTAL) pra entrar no mesmo
  // objeto `updates` que de fato survives até o commit.
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

  // Reset mensal da flag de tentativa de reatar para ex-cônjuges separados
  try {
    const exEspSnap = await db.collection('jogadores').doc(uid).collection('relacionamentos')
      .where('ativo', '==', false).where('estagio', '==', 'esposo').get();
    for (const eDoc of exEspSnap.docs) {
      if (eDoc.data().tentou_reatar_mes) await eDoc.ref.update({ tentou_reatar_mes: false });
    }
  } catch(e) { /* índice pode não existir ainda */ }

  // Busca de filhos UMA VEZ (fora do loop) para a checagem de Familiar
  // ("sem filhos COM ELA após os 30") — evita N queries redundantes para
  // N relacionamentos ativos. Monta um Set de relacionamento_id que já
  // geraram filho, para lookup O(1) dentro do loop abaixo.
  const filhosSnapParaChecagem = await db.collection('jogadores').doc(uid).collection('filhos').get();
  // IDs dos filhos que já existiam ANTES do loop de relacionamentos abaixo
  // (que pode gerar filhos novos via _gerarFilhoCF). Usado no loop de
  // envelhecimento (mais abaixo) para não aplicar +1 mês num filho recém
  // -nascido NESTE MESMO avancar_mes — sem essa checagem, um filho nascido
  // agora já sairia com idade_meses=1 em vez de 0, ficando permanentemente
  // "1 mês mais velho" que um irmão nascido no mesmo mês por outro
  // relacionamento processado numa iteração posterior deste mesmo loop
  // (bug relatado em produção: filhos "da mesma data" com idades diferentes).
  const filhosIdsAntesDoTick = new Set(filhosSnapParaChecagem.docs.map(d => d.id));
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
        await _gerarFilhoCF(db, uid, r, j.nome_personagem);
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
        if (r.estagio === 'esposo') { upd.separado_em = new Date().toISOString(); upd.motivo_separacao = 'flagra'; }
        smDelta -= FLAGRA_REL.penalidade_sm;
        await db.collection('jogadores').doc(uid).collection('inbox').add({
          de:'sistema', para_uid:uid,
          assunto: r.estagio === 'esposo' ? '💔 Separação — traição descoberta' : '💔 Flagrado(a) traindo!',
          corpo:`${r.nome} descobriu seu affair e ${r.estagio === 'esposo' ? 'pediu a separação' : 'terminou o relacionamento'}. -${FLAGRA_REL.penalidade_sm} saúde mental.`,
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
      if (r.estagio === 'esposo') { upd.separado_em = new Date().toISOString(); upd.motivo_separacao = 'natural'; }
      let danoTermino = IMPACTO_SM_REL.termino[r.estagio] || 10;
      // Romântica: término dói 50% mais na saúde mental do jogador.
      for (const e of efeitos) if (e.multiplicador_dano_sm_termino !== undefined) danoTermino *= e.multiplicador_dano_sm_termino;
      smDelta -= Math.round(danoTermino);
      const assuntoTerm = r.estagio === 'esposo' ? '💔 Separação' : `💔 Término com ${r.nome}`;
      const corpoTerm = r.estagio === 'esposo'
        ? `${r.nome} pediu a separação. O desgaste do dia a dia pesou mais que o amor. -${Math.round(danoTermino)} saúde mental. Você pode tentar reatar em Vida Pessoal.`
        : `${r.nome} decidiu encerrar o relacionamento. -${Math.round(danoTermino)} saúde mental.`;
      await db.collection('jogadores').doc(uid).collection('inbox').add({
        de:'sistema', para_uid:uid, assunto:assuntoTerm, corpo:corpoTerm,
        tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
      });
    } else if (Math.random() < estagio.tempo_chance) {
      upd.afinidade = Math.max(0, Math.floor((upd.afinidade ?? r.afinidade) * 0.7));
      const smTempoDano = IMPACTO_SM_REL.tempo[r.estagio] || 5;
      smDelta -= smTempoDano;
      const assuntoTempo = r.estagio === 'esposo' ? '😔 Dando um tempo no casamento' : `😔 ${r.nome} quer dar um tempo`;
      const corpoTempo = r.estagio === 'esposo'
        ? `${r.nome} pediu um tempo no casamento. A afinidade caiu 30%. -${smTempoDano} saúde mental. Cuide do relacionamento para que não evolua para separação.`
        : `${r.nome} pediu um tempo. A afinidade caiu 30%. -${smTempoDano} saúde mental.`;
      await db.collection('jogadores').doc(uid).collection('inbox').add({
        de:'sistema', para_uid:uid, assunto:assuntoTempo, corpo:corpoTempo,
        tipo:'sistema', tipo_noticia:'negativo', lida:false, criado_em:new Date().toISOString(),
      });
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
    // Filho nascido NESTE mesmo avancar_mes (via _gerarFilhoCF acima) não
    // envelhece agora — ele já nasce com idade_meses:0 correto para este
    // mês; envelhecer de novo aqui o deixaria 1 mês na frente de um irmão
    // nascido no mesmo mês por outro relacionamento processado depois.
    if (!filhosIdsAntesDoTick.has(fDoc.id)) continue;
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

// Último termo de um nome composto ("Beatriz Souza" → "Souza"). Nome de
// um só termo devolve string vazia — sem sobrenome pra herdar.
function _sobrenomeCF(nomeCompleto) {
  const partes = (nomeCompleto || '').trim().split(/\s+/);
  return partes.length > 1 ? partes[partes.length - 1] : '';
}

async function _gerarFilhoCF(db, uid, relacionamento, nomeJogador) {
  const sexo = Math.random() < 0.5 ? 'm' : 'f';
  const primeiroNome = NOMES_BEBE_CF[sexo][Math.floor(Math.random()*NOMES_BEBE_CF[sexo].length)];
  // Sobrenome da mãe (relacionamento) primeiro, do pai (jogador) por último.
  const sobrenomeMae = _sobrenomeCF(relacionamento.nome);
  const sobrenomePai = _sobrenomeCF(nomeJogador);
  const nome = [primeiroNome, sobrenomeMae, sobrenomePai].filter(Boolean).join(' ');

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

