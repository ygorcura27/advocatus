'use strict';

/**
 * ADMIN — Advocatus Online
 *
 * Cloud Function protegida por UID do administrador.
 * Permite editar qualquer estado do jogo durante o beta.
 *
 * SEGURANÇA: apenas o UID listado em ADMIN_UIDS pode chamar.
 * Adicione seu UID do Firebase Auth aqui.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore }       = require('firebase-admin/firestore');
const { logger }             = require('firebase-functions');

// ── UIDs autorizados como administradores ──
// Adicione o seu UID do Firebase Auth (encontre em Authentication > Users)
const ADMIN_UIDS = [
  'pdt67JLLnxdzFu86jIZ3oqbzpA82',   // Ygor — admin principal
];

function assertAdmin(auth) {
  if (!auth || !ADMIN_UIDS.includes(auth.uid)) {
    throw new HttpsError('permission-denied', 'Acesso negado. Apenas administradores.');
  }
}

exports.adminAction = onCall({ region: 'southamerica-east1' }, async (request) => {
  assertAdmin(request.auth);

  const db     = getFirestore();
  const { acao, payload } = request.data;

  logger.info(`[ADMIN] Ação: ${acao} | Admin: ${request.auth.uid}`, payload);

  switch (acao) {

    // ════════════════════════════════════════════════════
    // SERVIDOR / CALENDÁRIO
    // ════════════════════════════════════════════════════

    case 'server_get': {
      const snap = await db.collection('config').doc('server').get();
      return { ok: true, data: snap.exists ? snap.data() : null };
    }

    case 'server_reset_calendario': {
      // Volta o servidor para Ano 1, Janeiro
      await db.collection('config').doc('server').set({
        mes_global:  1,
        ano_jogo:    1,
        mes_jogo:    0,
        mes_nome:    'Janeiro',
        data_inicio: new Date().toISOString(),
        total_jogadores: 0,
        versao: '1.0.0',
        resetado_em: new Date().toISOString(),
        resetado_por: request.auth.uid,
      });
      return { ok: true, msg: 'Calendário resetado para Ano 1, Janeiro.' };
    }

    case 'server_set_mes': {
      // Define mês e ano manualmente
      const { mes_global, mes_jogo, ano_jogo } = payload;
      const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      await db.collection('config').doc('server').update({
        mes_global: mes_global,
        mes_jogo:   mes_jogo,
        ano_jogo:   ano_jogo,
        mes_nome:   MESES[mes_jogo] || 'Janeiro',
        editado_em: new Date().toISOString(),
        editado_por: request.auth.uid,
      });
      return { ok: true, msg: `Servidor definido para ${MESES[mes_jogo]}, Ano ${ano_jogo}.` };
    }

    case 'server_forcar_tick': {
      // Força o tick manualmente (para testar sem esperar o scheduler)
      const { tickMensal } = require('./tick_mensal');
      // Chama diretamente a lógica interna (sem o wrapper de scheduler)
      // Isso avança o calendário e processa todos os jogadores
      await db.collection('config').doc('server').update({
        forcar_tick: true,
        forcar_tick_por: request.auth.uid,
        forcar_tick_em: new Date().toISOString(),
      });
      return { ok: true, msg: 'Tick forçado agendado. Será processado no próximo ciclo.' };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — CONSULTA
    // ════════════════════════════════════════════════════

    case 'jogador_get': {
      const { uid } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', `Jogador ${uid} não encontrado.`);
      return { ok: true, data: snap.data() };
    }

    case 'jogador_listar': {
      // Lista todos os jogadores (resumo)
      const snap = await db.collection('jogadores')
        .orderBy('reputacao', 'desc')
        .limit(payload?.limit || 100)
        .get();
      const lista = snap.docs.map(d => {
        const j = d.data();
        return {
          uid:       j.uid,
          nome:      j.nome_personagem || j.nome,
          cargo_id:  j.cargo_id,
          reputacao: j.reputacao,
          dinheiro:  j.dinheiro,
          oab:       j.oab,
          no_serasa: j.no_serasa,
        };
      });
      return { ok: true, data: lista };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — EDIÇÃO FINANCEIRA
    // ════════════════════════════════════════════════════

    case 'jogador_set_dinheiro': {
      const { uid, valor } = payload;
      await db.collection('jogadores').doc(uid).update({
        dinheiro: valor,
        admin_editado_em: new Date().toISOString(),
        admin_editado_por: request.auth.uid,
      });
      return { ok: true, msg: `Dinheiro de ${uid} definido para R$ ${valor.toLocaleString('pt-BR')}.` };
    }

    case 'jogador_add_dinheiro': {
      const { uid, valor } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const atual = snap.data().dinheiro || 0;
      await db.collection('jogadores').doc(uid).update({
        dinheiro: atual + valor,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `+R$ ${valor.toLocaleString('pt-BR')} adicionado para ${uid}. Novo saldo: R$ ${(atual+valor).toLocaleString('pt-BR')}.` };
    }

    case 'jogador_reset_financeiro': {
      // Zera serasa, meses negativos, etc.
      const { uid } = payload;
      await db.collection('jogadores').doc(uid).update({
        meses_negativo:        0,
        meses_positivo_streak: 0,
        no_serasa:             false,
        bonus_pendente:        0,
        admin_editado_em:      new Date().toISOString(),
      });
      return { ok: true, msg: `Status financeiro de ${uid} resetado.` };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — REPUTAÇÃO E ATRIBUTOS
    // ════════════════════════════════════════════════════

    case 'jogador_set_reputacao': {
      const { uid, valor } = payload;
      await db.collection('jogadores').doc(uid).update({
        reputacao: Math.max(0, Math.min(100, valor)),
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Reputação de ${uid} definida para ${valor}.` };
    }

    case 'jogador_set_atributo': {
      // atributo: reputacao | networking | saude_mental | disposicao | prestigio_academico | energia
      const { uid, atributo, valor } = payload;
      const ATRIBUTOS_VALIDOS = [
        'reputacao','networking','saude_mental',
        'disposicao','prestigio_academico','energia',
      ];
      if (!ATRIBUTOS_VALIDOS.includes(atributo)) {
        throw new HttpsError('invalid-argument', `Atributo inválido: ${atributo}`);
      }
      await db.collection('jogadores').doc(uid).update({
        [atributo]: Math.max(0, Math.min(100, valor)),
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `${atributo} de ${uid} = ${valor}.` };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — SKILLS
    // ════════════════════════════════════════════════════

    case 'jogador_set_skill': {
      const { uid, skill, valor } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const skills = snap.data().skills || {};
      skills[skill] = Math.max(0, Math.min(100, valor));
      await db.collection('jogadores').doc(uid).update({
        skills,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Skill ${skill} de ${uid} = ${valor}.` };
    }

    case 'jogador_reset_skills': {
      const { uid } = payload;
      const skills = {
        oratoria:     15, argumentacao: 15, escrita:      15,
        pesquisa:     18, negociacao:   12, persuasao:    12,
        gestao:        8, networking:   10,
      };
      await db.collection('jogadores').doc(uid).update({
        skills,
        study_queue: [],
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Skills de ${uid} resetadas para valores iniciais.` };
    }

    case 'jogador_max_skills': {
      // Define todas as skills no cap do cargo atual
      const { uid } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const j = snap.data();
      const REP_CAP = {
        est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100,
      };
      const cap = REP_CAP[j.cargo_id] || 55;
      const skills = {
        oratoria:cap, argumentacao:cap, escrita:cap,
        pesquisa:cap, negociacao:cap,  persuasao:cap,
        gestao:cap,   networking:cap,
      };
      await db.collection('jogadores').doc(uid).update({
        skills,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Skills de ${uid} maxadas no cap ${cap} do cargo ${j.cargo_id}.` };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — CARGO E PROGRESSÃO
    // ════════════════════════════════════════════════════

    case 'jogador_set_cargo': {
      const { uid, cargo_id } = payload;
      const CARGOS_VALIDOS = [
        'est','ass','jnr','pln','snr','asc','soc','snm',
        'jsub','jtit','dsb','mstj',
        'padj','prom','pjus','pgj',
        'dadj','def','dch','dge',
      ];
      if (!CARGOS_VALIDOS.includes(cargo_id)) {
        throw new HttpsError('invalid-argument', `Cargo inválido: ${cargo_id}`);
      }
      const updates = {
        cargo_id,
        admin_editado_em: new Date().toISOString(),
      };
      // Concede OAB automaticamente se cargo >= jnr
      if (['jnr','pln','snr','asc','soc','snm','jsub','jtit','dsb','mstj',
           'padj','prom','pjus','pgj','dadj','def','dch','dge'].includes(cargo_id)) {
        updates.oab = true;
      }
      await db.collection('jogadores').doc(uid).update(updates);
      return { ok: true, msg: `Cargo de ${uid} definido para ${cargo_id}.` };
    }

    case 'jogador_set_oab': {
      const { uid, aprovado } = payload;
      await db.collection('jogadores').doc(uid).update({
        oab: aprovado,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `OAB de ${uid} = ${aprovado}.` };
    }

    case 'jogador_set_concurso': {
      const { uid, aprovado } = payload;
      await db.collection('jogadores').doc(uid).update({
        concurso_aprovado: aprovado,
        admin_editado_em:  new Date().toISOString(),
      });
      return { ok: true, msg: `Concurso público de ${uid} = ${aprovado}.` };
    }

    case 'jogador_set_xp': {
      const { uid, xp } = payload;
      await db.collection('jogadores').doc(uid).update({
        xp,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `XP de ${uid} = ${xp}.` };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — SAÚDE E BURNOUT
    // ════════════════════════════════════════════════════

    case 'jogador_curar_burnout': {
      const { uid } = payload;
      await db.collection('jogadores').doc(uid).update({
        em_burnout:    false,
        burnout_ate_mes: 0,
        saude_mental:  80,
        disposicao:    80,
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Burnout de ${uid} curado.` };
    }

    // ════════════════════════════════════════════════════
    // JOGADOR — RESET COMPLETO
    // ════════════════════════════════════════════════════

    case 'jogador_reset_completo': {
      // Mantém apenas uid, nome e career — zera tudo mais
      const { uid } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const j = snap.data();

      const resetado = {
        uid:           j.uid,
        nome:          j.nome,
        email:         j.email || '',
        criado_em:     j.criado_em,
        nome_personagem: j.nome_personagem,
        especialidade: j.especialidade,
        carreira:      j.carreira,

        // Cargo inicial
        cargo_id:      'est',
        oab:           false,
        concurso_aprovado: false,
        anos_carreira: 0,
        mes_global_inicio: (await db.collection('config').doc('server').get()).data()?.mes_global || 1,

        // Atributos zerados
        reputacao:              30,
        networking:             10,
        saude_mental:           80,
        disposicao:             80,
        prestigio_academico:    0,
        energia:               100,
        energia_usada_mes:       0,

        skills: {
          oratoria:15, argumentacao:15, escrita:15,
          pesquisa:18, negociacao:12, persuasao:12,
          gestao:8, networking_sk:10,
        },

        // Financeiro
        dinheiro:              15000,
        meses_negativo:        0,
        meses_positivo_streak: 0,
        no_serasa:             false,

        // Moradia
        moradia_id:      'pais',
        moradias_compradas: {},
        prazo_sair_pais: 0,
        pat: { moradia:'pais', transporte:'onibus', escritorio:'cw' },

        // Transporte
        transporte_id: 'onibus',
        financiamentos: {},

        // Escritório
        escritorio_id:          'solo',
        escritorio_empregado_id: null,
        vaga_tipo:              'contencioso',

        // Gamificação
        xp:          0,
        xp_next:     120,
        wins:        0,
        losses:      0,
        wins_ano:    0,
        losses_ano:  0,

        // Vida pessoal
        estado_civil: 'solteiro',
        conjuge_uid:  null,
        filhos:       0,
        geracao:      j.geracao || 1,
        idade:        22,

        // Filas
        study_queue:  [],
        cursos_feitos:[],
        compras:      [],
        estagiarios:  [],

        // Flags
        em_burnout:          false,
        burnout_ate_mes:     0,
        recesso_pendente:    false,
        mora_com_pais:       true,
        aposentado:          false,
        ultimo_mes_processado: 0,
        bonus_pendente:        0,

        admin_resetado_em:   new Date().toISOString(),
        admin_resetado_por:  request.auth.uid,
      };

      await db.collection('jogadores').doc(uid).set(resetado);
      return { ok: true, msg: `Jogador ${uid} (${j.nome_personagem}) resetado completamente.` };
    }

    // ════════════════════════════════════════════════════
    // PROCESSOS
    // ════════════════════════════════════════════════════

    case 'processos_listar_jogador': {
      const { uid } = payload;
      const snap = await db.collection('processos')
        .where('advogado_uid', '==', uid)
        .orderBy('criado_mes', 'desc')
        .limit(50)
        .get();
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { ok: true, data: lista };
    }

    case 'processo_encerrar': {
      const { processo_id, resultado } = payload; // resultado: 'ganho' | 'perdido'
      await db.collection('processos').doc(processo_id).update({
        status:        resultado,
        encerrado_mes: (await db.collection('config').doc('server').get()).data()?.mes_global || 0,
        admin_encerrado_por: request.auth.uid,
      });
      return { ok: true, msg: `Processo ${processo_id} encerrado como ${resultado}.` };
    }

    case 'processo_deletar': {
      const { processo_id } = payload;
      await db.collection('processos').doc(processo_id).delete();
      return { ok: true, msg: `Processo ${processo_id} deletado.` };
    }

    // ════════════════════════════════════════════════════
    // ESCRITÓRIOS
    // ════════════════════════════════════════════════════

    case 'escritorio_get': {
      const { escritorio_id } = payload;
      const snap = await db.collection('escritorios').doc(escritorio_id).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Escritório não encontrado.');
      return { ok: true, data: snap.data() };
    }

    case 'escritorio_set_prestigio': {
      const { escritorio_id, prestigio } = payload;
      await db.collection('escritorios').doc(escritorio_id).update({
        prestigio: Math.max(0, Math.min(100, prestigio)),
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Prestígio do escritório ${escritorio_id} = ${prestigio}.` };
    }

    case 'escritorio_set_nivel': {
      const { escritorio_id, nivel } = payload;
      await db.collection('escritorios').doc(escritorio_id).update({
        nivel: Math.max(1, Math.min(7, nivel)),
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Nível do escritório ${escritorio_id} = ${nivel}.` };
    }

    // ════════════════════════════════════════════════════
    // INBOX / MENSAGENS
    // ════════════════════════════════════════════════════

    case 'enviar_mensagem_sistema': {
      const { uid, assunto, corpo, tipo } = payload;
      await db.collection('jogadores').doc(uid)
        .collection('inbox').add({
          de:        'admin',
          para_uid:  uid,
          assunto:   assunto || 'Mensagem do Administrador',
          corpo:     corpo   || '',
          tipo:      tipo    || 'sistema',
          tipo_noticia: 'neutro',
          lida:      false,
          criado_em: new Date().toISOString(),
        });
      return { ok: true, msg: `Mensagem enviada para ${uid}.` };
    }

    case 'enviar_mensagem_todos': {
      // Envia mensagem para todos os jogadores
      const { assunto, corpo } = payload;
      const jogadores = await db.collection('jogadores').limit(500).get();
      const batch = db.batch();
      for (const doc of jogadores.docs) {
        const msgRef = db.collection('jogadores').doc(doc.id)
          .collection('inbox').doc();
        batch.set(msgRef, {
          de:        'admin',
          para_uid:  doc.id,
          assunto:   assunto || 'Aviso do Administrador',
          corpo:     corpo   || '',
          tipo:      'sistema',
          tipo_noticia: 'neutro',
          lida:      false,
          criado_em: new Date().toISOString(),
        });
      }
      await batch.commit();
      return { ok: true, msg: `Mensagem enviada para ${jogadores.docs.length} jogadores.` };
    }

    case 'limpar_inbox': {
      const { uid } = payload;
      const msgs = await db.collection('jogadores').doc(uid)
        .collection('inbox').limit(200).get();
      const batch = db.batch();
      msgs.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return { ok: true, msg: `${msgs.docs.length} mensagens deletadas do inbox de ${uid}.` };
    }

    // ════════════════════════════════════════════════════
    // RANKINGS — FORÇAR ATUALIZAÇÃO
    // ════════════════════════════════════════════════════

    case 'rankings_atualizar': {
      // Força atualização imediata dos rankings
      await db.collection('config').doc('server').update({
        forcar_ranking: true,
        forcar_ranking_em: new Date().toISOString(),
      });
      return { ok: true, msg: 'Rankings serão atualizados no próximo ciclo.' };
    }

    // ════════════════════════════════════════════════════
    // BETA — AÇÕES ESPECIAIS
    // ════════════════════════════════════════════════════

    case 'beta_dar_starter_pack': {
      // Dá um pacote inicial generoso para testar o jogo
      const { uid } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const j = snap.data();
      const skills = j.skills || {};
      Object.keys(skills).forEach(k => { skills[k] = 45; });

      await db.collection('jogadores').doc(uid).update({
        dinheiro:   100000,
        reputacao:  40,
        networking: 40,
        saude_mental: 90,
        disposicao: 90,
        skills,
        oab:        true,
        cargo_id:   'jnr',
        admin_editado_em: new Date().toISOString(),
      });
      return { ok: true, msg: `Starter pack beta concedido para ${uid}.` };
    }

    case 'beta_testar_tick': {
      // Simula o que aconteceria no próximo tick para um jogador específico
      // sem realmente salvar no banco
      const { uid } = payload;
      const snap = await db.collection('jogadores').doc(uid).get();
      if (!snap.exists) throw new HttpsError('not-found', 'Jogador não encontrado.');
      const server = await db.collection('config').doc('server').get();
      const s = server.data() || {};

      const j = snap.data();
      // Simulação simplificada
      const SAL_MIN = { est:1700,ass:2500,jnr:3500,pln:5750,snr:10600,asc:20000,soc:35000,snm:65000 };
      const renda = j.escritorio_id === 'solo' ? 0 : (SAL_MIN[j.cargo_id] || 1700);
      const custo = 800 + Math.max(0, (j.reputacao || 30) - 20) * 25;
      const saldo = renda - custo;

      return {
        ok: true,
        simulacao: {
          jogador:   j.nome_personagem,
          cargo:     j.cargo_id,
          renda,
          custo_vida: custo,
          saldo_estimado: saldo,
          mes_atual: `${s.mes_nome}, Ano ${s.ano_jogo}`,
          idade_proxima: 22 + Math.floor(((s.mes_global || 1) - (j.mes_global_inicio || 1)) / 12),
        },
      };
    }

    default:
      throw new HttpsError('invalid-argument', `Ação desconhecida: ${acao}`);
  }
});
