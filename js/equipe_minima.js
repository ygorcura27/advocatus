/**
 * EQUIPE MÍNIMA POR TIER — a partir do Tier 3, o ESCRITÓRIO (não o
 * cargo do dono) exige advogados contratados mínimos para captar
 * causas daquele porte. Compatível por escritório: dois sócios
 * diferentes no mesmo escritório enfrentam a mesma trava.
 */

export const EQUIPE_MINIMA_POR_TIER = { 1:0, 2:0, 3:1, 4:2, 5:3 };

export function contarAdvogadosContratados(funcionariosSnap) {
  const CARGO_RANK_ADV = { jnr:1, pln:1, snr:1, asc:1, soc:1, snm:1 };
  return funcionariosSnap.docs.filter(d => {
    const f = d.data();
    return f.ativo !== false && CARGO_RANK_ADV[f.cargo_id];
  }).length;
}

export function verificarEquipeMinima(tierEscritorio, nAdvogadosContratados) {
  const exigido = EQUIPE_MINIMA_POR_TIER[tierEscritorio] || 0;
  return {
    liberado: nAdvogadosContratados >= exigido,
    exigido,
    atual: nAdvogadosContratados,
    faltam: Math.max(0, exigido - nAdvogadosContratados),
  };
}

window.EQUIPE_MINIMA_POR_TIER = EQUIPE_MINIMA_POR_TIER;
