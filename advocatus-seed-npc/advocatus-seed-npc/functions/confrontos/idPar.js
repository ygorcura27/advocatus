'use strict';

/**
 * GDD v5.4 — correções #10 e #11 da 2ª revisão crítica.
 *
 * #10: idPar() com Number(id) silenciosamente vira NaN se o ID não for
 * numérico — a comparação `NaN < NaN` é sempre false, então a ordenação
 * "funcionava" por acidente mas produzia pares inconsistentes. Agora falha
 * alto (throw) em vez de falhar silencioso.
 *
 * #11: ladoNoConfronto() comparava com === estrito. Se profile_id circular
 * pela função como number em algum ponto do código (e o documento salvo
 * como string, ou vice-versa), a comparação falha mesmo sendo a mesma
 * pessoa. Normalizado para String() dos dois lados.
 */

function idPar(id1, id2) {
  const n1 = Number(id1);
  const n2 = Number(id2);

  if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
    throw new Error(`idPar: profile_id inválido (esperado numérico): "${id1}", "${id2}"`);
  }
  if (n1 === n2) {
    throw new Error(`idPar: confronto contra o próprio perfil é inválido (profile_id ${id1})`);
  }

  const [a, b] = n1 < n2 ? [String(id1), String(id2)] : [String(id2), String(id1)];
  return `${a}_${b}`;
}

function ladoNoConfronto(confronto, profileId) {
  const alvo = String(profileId);
  if (String(confronto.a) === alvo) return 'a';
  if (String(confronto.b) === alvo) return 'b';
  throw new Error(
    `ladoNoConfronto: perfil ${profileId} não pertence ao confronto ${confronto.a}_${confronto.b}`
  );
}

module.exports = { idPar, ladoNoConfronto };
