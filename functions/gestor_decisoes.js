'use strict';

/**
 * DECISÕES DO GESTOR NPC — Advocatus Online
 * Permissões reais "Tomar decisões estratégicas" e "Firmar acordos"
 * (js/processos_escritorio.js:_dgSalvarGeral → gestor_decide_recursos /
 * gestor_decide_acordos). Chamado 1x/mês, dentro do bloco escritório de
 * avancar_mes.js, só quando o escritório tem gestor ativo com a
 * permissão correspondente.
 */

const { logger } = require('firebase-functions');
const { _aceitarDecisaoSentenca } = require('./processar_sentenca');
const { dentroDoTetoAcordo, chanceAceiteComPostura } = require('./estrategia_padrao');

// "Tomar decisões estratégicas" — auto-ACEITA sentenças pendentes (nunca
// auto-recorre: recorrer abre uma fase de sustentação recursal interativa
// que não dá pra automatizar sem um "auto-play" de rodadas, fora de escopo
// por ora). Mesma lógica exata que o jogador usaria clicando "Aceitar".
async function processarDecisoesGestorCF(db, escId, jogadorRef, j) {
  const snap = await db.collection('processos')
    .where('pool_escritorio_id', '==', escId)
    .where('status', '==', 'aguardando_decisao_sentenca')
    .get();
  if (snap.empty) return 0;

  let processados = 0;
  for (const procDoc of snap.docs) {
    try {
      const p = procDoc.data();
      const isSetlistFlow = !!(p.setlist && p.resultado_setlist);
      await _aceitarDecisaoSentenca(db, procDoc.ref, jogadorRef, p, j, isSetlistFlow);
      processados++;
    } catch (e) {
      logger.warn('[GESTOR_DECISOES] Erro ao auto-aceitar sentença:', e.message);
    }
  }
  return processados;
}

// "Firmar acordos" — mesma fórmula de window.tentarAcordo (js/processos.js),
// portada pro servidor: chance de aceite escala com o convencimento real do
// processo, honorários creditados no caixa do escritório na hora.
async function processarAcordosGestorCF(db, escId, j) {
  const mesAtual = (j.ano_pessoal || 1) * 12 + (j.mes_pessoal || 0);
  const snap = await db.collection('processos')
    .where('pool_escritorio_id', '==', escId)
    .where('status', '==', 'em_andamento')
    .get();
  if (snap.empty) return 0;

  let fechados = 0;
  for (const procDoc of snap.docs) {
    try {
      const p  = procDoc.data();
      const cv = p.convencimento || 38;
      // GDD v6.0 §1.2 item 3 — Estratégia Padrão: só autoriza o gestor a
      // decidir acordo sozinho se o caso estiver dentro do teto configurado
      // pelo jogador (cv <= teto — caso não favorável o bastante pra valer
      // o risco de julgamento). Acima do teto, pula — fica pro jogador.
      if (!dentroDoTetoAcordo(cv, j.estrategia_padrao)) continue;
      const aceito = Math.random() < chanceAceiteComPostura(cv, j.estrategia_padrao);
      if (!aceito) continue;

      const suc = Math.floor((p.valor || 0) * 0.10);
      const hon = Math.floor(suc * 0.10 / 2);

      const escRef  = db.collection('escritorios').doc(escId);
      const escSnap = await escRef.get();
      if (escSnap.exists) {
        const esc = escSnap.data();
        await escRef.update({
          caixa: (esc.caixa || 0) + hon,
          faturamento_mes_atual: (esc.faturamento_mes_atual || 0) + hon,
          faturamento_honorarios_mes: (esc.faturamento_honorarios_mes || 0) + hon,
          total_casos: (esc.total_casos || 0) + 1,
          casos_ganhos: (esc.casos_ganhos || 0) + 1,
        });
      }
      await procDoc.ref.update({
        status: 'ganho',
        hon_total_acumulado: hon,
        encerrado_mes: mesAtual,
      });
      fechados++;
    } catch (e) {
      logger.warn('[GESTOR_DECISOES] Erro ao auto-tentar acordo:', e.message);
    }
  }
  return fechados;
}

module.exports = { processarDecisoesGestorCF, processarAcordosGestorCF };
