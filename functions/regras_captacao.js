'use strict';

/**
 * REGRAS DE CAPTAÇÃO — GDD v6.0 §1.2 (item 4 das "standing orders" da
 * filosofia anti-login-diário): "auto-aceitar clientes por filtro (matéria,
 * valor mínimo da causa, comarca)".
 *
 * Duas substituições documentadas em relação ao texto literal do GDD:
 *  - "matéria" → filtra por `tipo` da oportunidade (consulta/parecer/
 *    contrato/notificacao/cobranca — categoria de SERVIÇO). Não existe
 *    "matéria jurídica" como campo real em `oportunidades` hoje; `tipo` é
 *    a dimensão real mais próxima.
 *  - "comarca" → NÃO implementado. O jogo hoje só opera numa comarca só
 *    por escritório (Território/Correspondentes ainda são só mockup, GDD
 *    §7.5/§8) — não existe comarca real pra filtrar.
 *
 * Não cria auto-aceite do zero: `functions/avancar_mes.js::
 * _processarAutogestaoOportunidadesCF` já resolve oportunidades sozinho
 * todo mês (round-robin cego, até 2 por advogado ativo, sem checar nada do
 * cliente). Regras de Captação vira um FILTRO em cima disso — sem regra
 * configurada (`ativo` false/ausente), o comportamento cego de hoje
 * continua idêntico (nenhuma conta existente muda de comportamento).
 */

function regraPadrao() {
  return { ativo: false, tipos: [], valor_minimo: 0 };
}

/**
 * Filtra a lista de oportunidades elegíveis pro auto-aceite mensal.
 * Se a regra não estiver ativa, retorna a lista inteira (comportamento
 * legado, cego). Se ativa: `tipos` vazio = aceita qualquer tipo; senão só
 * os tipos marcados. `valor_minimo` sempre se aplica quando ativo.
 */
function filtrarOportunidadesElegiveis(oportunidades, regras) {
  if (!regras || !regras.ativo) return oportunidades;
  const tipos = regras.tipos || [];
  const valorMinimo = regras.valor_minimo || 0;
  return oportunidades.filter(op => {
    if (tipos.length > 0 && !tipos.includes(op.tipo)) return false;
    if ((op.valor || 0) < valorMinimo) return false;
    return true;
  });
}

module.exports = {
  regraPadrao,
  filtrarOportunidadesElegiveis,
};
