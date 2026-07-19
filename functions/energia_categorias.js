'use strict';

/**
 * ENERGIA POR CATEGORIA — GDD v6.0 §3.1, decisão "B" (reforma completa).
 *
 * Substitui o pool único `energia_usada_mes` por 6 baldes reais que o
 * jogador aloca via slider (tela real ainda a construir em js/ui-main.js):
 * Processos Estratégicos, Supervisão da Carteira, Estudo, Gestão/Captação,
 * Vida Pessoal, Descanso.
 *
 * Escala continua em pontos (0-100+bônus, mesma de sempre) e NÃO migra pro
 * literal 200-260h do GDD — essa conversão de unidade depende de
 * Constituição (§4.4), atributo RPG que ainda não existe no jogo real (só
 * mockup), e forçaria retunar ~35 custos de energia já calibrados em todo
 * o jogo. Decisão registrada, não é gap esquecido.
 *
 * MIGRAÇÃO SEM QUEBRAR CONTAS ANTIGAS: enquanto o jogador não tiver
 * `energia_alocada` definido (ele só existe depois que a tela nova salva
 * pelo menos uma vez), `debitarEnergiaCategoria` cai pro comportamento
 * legado — debita direto de `energia_usada_mes`, sem checar categoria. Só
 * depois que o jogador mexe nos sliders (grava `energia_alocada`) é que a
 * checagem por categoria passa a valer pra ele.
 */

const CATEGORIAS = ['processos', 'supervisao', 'estudo', 'captacao', 'pessoal', 'descanso'];

const ENERGIA_TOTAL = 100;

function categoriasVazias() {
  return { processos: 0, supervisao: 0, estudo: 0, captacao: 0, pessoal: 0, descanso: 0 };
}

/** Porta de js/relacionamento_dados.js::bonusEnergiaDisposicao — Cloud Functions não tinham acesso a essa fórmula (window.*), cada uma usava um teto fixo diferente. */
function bonusEnergiaDisposicao(disposicao) {
  const d = disposicao ?? 80;
  if (d >= 80) return 10;
  if (d >= 50) return 0;
  if (d >= 20) return -10;
  return -20;
}

/** Porta de js/relacionamento_dados.js::getEnergiaTotal — mesma fórmula, agora disponível no backend. */
function calcularEnergiaTotal(j) {
  if (!j) return ENERGIA_TOTAL;
  const bonus = j.academia_ativa ? (j.academia_bonus_energia || 0) : 0;
  const dispBonus = bonusEnergiaDisposicao(j.disposicao);
  const pen = j.penalidade_energia_val || 0;
  return Math.max(10, ENERGIA_TOTAL + bonus + dispBonus - pen);
}

/**
 * Checa e retorna o patch de update pra debitar `valor` de energia da
 * categoria `categoria` do jogador `j` (doc já lido, não faz leitura aqui).
 * Lança HttpsError('resource-exhausted', ...) se não couber.
 *
 * Uso: const patch = debitarEnergiaCategoria(j, 'estudo', ENERGIA_AULA, 'Frequentar aula');
 *      Object.assign(updates, patch); // depois um único jRef.update(updates)
 */
function debitarEnergiaCategoria(j, categoria, valor, rotuloAcao) {
  const { HttpsError } = require('firebase-functions/v2/https');

  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }

  // Conta antiga (ou jogador que nunca abriu a tela de alocação): legado.
  // Mantém os DOIS espelhos que o código legado já usava em paralelo —
  // `energia_usada_mes` (o que a UI real mostra, js/ui-main.js:264) e
  // `energia` (o que defesa_tcc.js/sistemas_sociais.js/posgraduacao.js/
  // podcasts_social.js checam antes de agir) — senão os dois saem de
  // sincronia e a checagem de cada arquivo passa a mentir pro outro.
  if (!j.energia_alocada) {
    const usoAtual = j.energia_usada_mes || 0;
    const total = calcularEnergiaTotal(j);
    if (usoAtual + valor > total) {
      throw new HttpsError('resource-exhausted', `Energia insuficiente para ${rotuloAcao || 'esta ação'}.`);
    }
    return {
      energia_usada_mes: usoAtual + valor,
      energia: Math.max(0, total - (usoAtual + valor)),
    };
  }

  // Jogador já configurou os 6 baldes: checa só o balde da categoria.
  const alocado = j.energia_alocada[categoria] || 0;
  const usado = (j.energia_usada || categoriasVazias())[categoria] || 0;
  if (usado + valor > alocado) {
    throw new HttpsError('resource-exhausted', `Energia de ${categoria} insuficiente para ${rotuloAcao || 'esta ação'} (${usado}/${alocado}).`);
  }
  const novoUsado = { ...(j.energia_usada || categoriasVazias()) };
  novoUsado[categoria] = usado + valor;
  return { energia_usada: novoUsado };
}

/**
 * Devolve `valor` de energia gasta na categoria (ex: darAula devolvendo o
 * custo de comparecer_aula — "docência energiza", GDD). Sempre floor em 0
 * de uso — nunca deixa a categoria com uso negativo mesmo se o crédito for
 * maior que o que tinha sido gasto nela. Antes do refactor, o código legado
 * (functions/posgraduacao.js::darAula) só devolvia no campo espelho
 * `energia`, sem tocar `energia_usada_mes` — os dois já saíam de sincronia
 * antes dessa mudança; aqui os dois voltam a andar junto.
 */
function creditarEnergiaCategoria(j, categoria, valor) {
  if (!CATEGORIAS.includes(categoria)) {
    throw new Error(`categoria de energia inválida: ${categoria}`);
  }

  if (!j.energia_alocada) {
    const usoAtual = j.energia_usada_mes || 0;
    const novoUso = Math.max(0, usoAtual - valor);
    const total = calcularEnergiaTotal(j);
    return { energia_usada_mes: novoUso, energia: Math.max(0, total - novoUso) };
  }

  const usado = (j.energia_usada || categoriasVazias())[categoria] || 0;
  const novoUsado = { ...(j.energia_usada || categoriasVazias()) };
  novoUsado[categoria] = Math.max(0, usado - valor);
  return { energia_usada: novoUsado };
}

/**
 * GDD v6.0 §7.4 — "Supervisão do Sócio": horas do dono alocadas na
 * categoria Supervisão multiplicam a produção de TODA a carteira automática
 * (NPCs do pool), 0,85x a 1,15x. Lê a ALOCAÇÃO (o compromisso de horas),
 * não o uso/restante — gastar ações pontuais de coordenar/designar/mediar
 * dentro desse mesmo balde não devia punir o multiplicador; a tensão do
 * GDD é "advogar vs. administrar" (alocar em supervisão vs. outras
 * categorias), não "usar vs. não usar" dentro da categoria já escolhida.
 *
 * Conta legado (sem `energia_alocada`) não sofre efeito nenhum (1.0,
 * neutro) até configurar os baldes — mesmo princípio de migração sem
 * quebra do resto deste módulo.
 *
 * Teto de referência: mockup usava 40h de um total de ~200h no GDD literal
 * (20%) — aqui é proporcional ao teto real em pontos (calcularEnergiaTotal),
 * não o número "40" copiado, já que a escala de energia deste jogo ficou em
 * pontos 0-100+bônus (decisão de não migrar unidade pro literal do GDD).
 */
function calcularModSupervisaoSocio(j) {
  if (!j || !j.energia_alocada) return 1.0;
  const alocado = j.energia_alocada.supervisao || 0;
  const total = calcularEnergiaTotal(j);
  const tetoReferencia = total * 0.2;
  const pct = tetoReferencia > 0 ? Math.min(1, alocado / tetoReferencia) : 0;
  return Math.min(1.15, 0.85 + pct * 0.30);
}

/** Reset mensal — chamado por avancar_mes.js e tick_mensal.js. Zera uso, mantém a alocação (sliders) que o jogador já tinha configurado. */
function resetEnergiaMensal(j) {
  const patch = { energia: calcularEnergiaTotal(j), energia_usada_mes: 0 };
  if (j.energia_alocada) {
    patch.energia_usada = categoriasVazias();
  }
  return patch;
}

module.exports = {
  CATEGORIAS,
  ENERGIA_TOTAL,
  categoriasVazias,
  calcularEnergiaTotal,
  debitarEnergiaCategoria,
  creditarEnergiaCategoria,
  resetEnergiaMensal,
  calcularModSupervisaoSocio,
};
