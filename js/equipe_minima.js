/**
 * EQUIPE MÍNIMA POR FAIXA DE CAUSA — a partir de Sênior, causas de
 * maior valor exigem advogados contratados mínimos no escritório,
 * não só o dono sozinho. Usado para travar o pool antes de gerar/
 * aceitar um caso de determinado valor.
 */

export const EQUIPE_MINIMA_POR_CARGO = { jnr:0, pln:0, snr:1, asc:2, soc:3, snm:4 };

/**
 * Conta quantos advogados (cargo jnr+) ativos e contratados existem
 * no escritório, via snapshot já carregado da subcoleção funcionarios.
 */
export function contarAdvogadosContratados(funcionariosSnap) {
  const CARGO_RANK_ADV = { jnr:1, pln:1, snr:1, asc:1, soc:1, snm:1 };
  return funcionariosSnap.docs.filter(d => {
    const f = d.data();
    return f.ativo !== false && CARGO_RANK_ADV[f.cargo_id];
  }).length;
}

/**
 * Verifica se o escritório tem equipe suficiente para o cargo do dono
 * acessar o pool de causas correspondente. Retorna { liberado, faltam }.
 */
export function verificarEquipeMinima(cargoDono, nAdvogadosContratados) {
  const exigido = EQUIPE_MINIMA_POR_CARGO[cargoDono] || 0;
  return {
    liberado: nAdvogadosContratados >= exigido,
    exigido,
    atual: nAdvogadosContratados,
    faltam: Math.max(0, exigido - nAdvogadosContratados),
  };
}

window.EQUIPE_MINIMA_POR_CARGO = EQUIPE_MINIMA_POR_CARGO;
