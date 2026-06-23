/**
 * PATCH para servicos_dados.js — adicionar estas constantes/edições ao
 * arquivo existente (não substitui o arquivo inteiro, pois não temos
 * a versão completa atual).
 */

// ── ADICIONAR: tipos de serviço acessíveis por cargo ──
export const TIPOS_SERVICO_POR_CARGO = {
  jnr: ['consulta', 'notificacao'],
  pln: ['consulta', 'notificacao', 'contrato'],
  snr: ['consulta', 'notificacao', 'contrato', 'parecer'],
  asc: ['consulta', 'notificacao', 'contrato', 'parecer', 'cobranca'],
  soc: ['consulta', 'notificacao', 'contrato', 'parecer', 'cobranca'],
  snm: ['consulta', 'notificacao', 'contrato', 'parecer', 'cobranca'],
};

// ── SUBSTITUIR multiplicadorPrestigio por esta versão por-cargo ──
// (mantém a mesma faixa de prestigioPct 0-100+, mas o multiplicador
// final também é escalonado por cargo, calibrado para a curva de renda
// autônomo/contratado da especificação)
const MULT_PRESTIGIO_BASE_CARGO = { jnr:0.23, pln:0.55, snr:0.55, asc:0.83, soc:1.15, snm:1.25 };

export function multiplicadorPrestigioCargo(prestigioPct, cargoId) {
  const base = MULT_PRESTIGIO_BASE_CARGO[cargoId] || 0.5;
  // prestigioPct ainda modula dentro da faixa do cargo: prestígio baixo
  // reduz até 60% do base, prestígio alto (90+) dá o base cheio.
  if (prestigioPct >= 90) return base;
  if (prestigioPct >= 70) return base * 0.85;
  if (prestigioPct >= 40) return base * 0.7;
  return base * 0.6;
}

// ── EDITAR gerarOportunidade: restringir tipoKey ao cargo do jogador ──
// Trocar a linha:
//   const tiposKeys = Object.keys(TIPOS_SERVICO);
// por:
//   const tiposKeys = TIPOS_SERVICO_POR_CARGO[cargoId] || ['consulta'];
// (a função gerarOportunidade(tier, prestigioPct) precisa ganhar um
// terceiro parâmetro cargoId: gerarOportunidade(tier, prestigioPct, cargoId))
//
// E trocar:
//   const mult = multiplicadorPrestigio(prestigioPct);
// por:
//   const mult = multiplicadorPrestigioCargo(prestigioPct, cargoId);
