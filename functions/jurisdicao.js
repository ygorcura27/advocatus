'use strict';
const path = require('path');

const JURISDICTIONS_DIR = path.join(__dirname, 'jurisdictions');

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function mergeInstancias(baseList, overrideList) {
  if (!overrideList || overrideList.length === 0) return baseList;
  return baseList.map(baseInst => {
    const over = overrideList.find(o => o.id === baseInst.id);
    return over ? { ...baseInst, ...over } : baseInst;
  });
}

function carregarJurisdicao(jurisdicaoId) {
  const filePath = path.join(JURISDICTIONS_DIR, `${jurisdicaoId}.json`);
  const config = require(filePath);

  if (!config.base_jurisdiction) return config;

  const base = carregarJurisdicao(config.base_jurisdiction);
  const merged = deepMerge(base, config);
  merged.instancias = mergeInstancias(base.instancias, config.instancias);
  delete merged.base_jurisdiction;
  return merged;
}

// Retorna o nome localizado de uma instância (usa nome_local se existir, senão nome)
function nomeInstancia(config, instanciaId) {
  const inst = (config.instancias || []).find(i => i.id === instanciaId);
  if (!inst) return instanciaId;
  return inst.nome_local || inst.nome || instanciaId;
}

// Retorna o modelo de honorários para uma área do direito
function modeloHonorarios(config, area) {
  return (config.honorarios || {})[area] || null;
}

module.exports = { carregarJurisdicao, nomeInstancia, modeloHonorarios };
