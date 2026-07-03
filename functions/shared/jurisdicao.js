'use strict';

/**
 * JURISDICAO — Advocatus Online
 * Fonte única de verdade para a hierarquia de instâncias judiciais brasileiras.
 * Importado por banco_juridico.js (backend) e espelhado em js/jurisdicao.js (frontend).
 *
 * Os valores string ('TJ', 'STJ', etc.) são gravados no Firestore em
 * instancia / instancia_seguinte — NÃO alterar sem migração de dados.
 */

// ─── Perfil de cada tribunal (tendências ocultas reveladas ao jogador) ──────
const PERFIL_TRIBUNAL = {
  'TJ':  { nome: 'Tribunal de Justiça',              tendencia: 'documental',    desc: 'mais sensível à prova documental',              votos: 3 },
  'TRF': { nome: 'Tribunal Regional Federal',         tendencia: 'tecnica',       desc: 'mais técnico e formalista',                     votos: 3 },
  'TRT': { nome: 'Tribunal Regional do Trabalho',     tendencia: 'trabalhador',   desc: 'mais favorável ao trabalhador',                 votos: 3 },
  'STJ': { nome: 'Superior Tribunal de Justiça',      tendencia: 'jurisprudencia',desc: 'foco em jurisprudência consolidada',             votos: 5 },
  'TST': { nome: 'Tribunal Superior do Trabalho',     tendencia: 'trabalhador',   desc: 'uniformiza jurisprudência trabalhista',          votos: 5 },
  'STF': { nome: 'Supremo Tribunal Federal',          tendencia: 'constitucional',desc: 'foco em matéria constitucional',                votos: 5 },
};

// ─── Cadeias recursais por origem do processo ───────────────────────────────
// tributário estadual (ISS, IPVA, ICMS…): Justiça Estadual → TJ → STJ → STF
// tributário federal (IRPF, IPI, PIS/COFINS…): Just. Federal → TRF → STJ → STF
// trabalhista: Vara do Trabalho → TRT → TST → STF  (nunca passa por STJ)
// cível/consumidor e demais: Justiça Comum → TJ → STJ → STF
const CADEIA_INSTANCIAS = {
  tj_padrao:   ['1grau', 'TJ',  'STJ', 'STF'],
  trf_padrao:  ['1grau', 'TRF', 'STJ', 'STF'],
  trabalhista: ['1grau', 'TRT', 'TST', 'STF'],
};

// Entes cuja competência originária é a Justiça Estadual (não federal)
const ENTES_TRIBUTARIOS_ESTADUAIS = ['Estado do RJ', 'Município do Rio de Janeiro'];

// ─── XP por instância ───────────────────────────────────────────────────────
const XP_BASE_INSTANCIA = { '1grau': 20, 'TJ': 32, 'TRF': 32, 'TRT': 32, 'STJ': 50, 'TST': 50, 'STF': 70 };

// ─── Listas de instâncias por nível (usadas em cargoPodeSustentar) ──────────
const RANK_INSTANCIA_2GRAU    = ['TJ', 'TRF', 'TRT'];
const RANK_INSTANCIA_SUPERIOR = ['STJ', 'TST'];

// ─── Funções puras ──────────────────────────────────────────────────────────
function _cadeiaDoProcesso(proc) {
  if (proc.area === 'trabalhista') return CADEIA_INSTANCIAS.trabalhista;
  if (proc.area === 'tributario') {
    const entePresente = ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.reu) ||
                         ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.autor);
    return entePresente ? CADEIA_INSTANCIAS.tj_padrao : CADEIA_INSTANCIAS.trf_padrao;
  }
  return CADEIA_INSTANCIAS.tj_padrao;
}

function tribunalRecursal(proc, instanciaAtual) {
  const cadeia = _cadeiaDoProcesso(proc);
  const idx = cadeia.indexOf(instanciaAtual);
  if (idx === -1 || idx >= cadeia.length - 1) return cadeia[cadeia.length - 1];
  return cadeia[idx + 1];
}

function ehTopoDaCadeia(proc, instanciaAtual) {
  return instanciaAtual === 'STF';
}

function xpPorDecisao(instancia, score) {
  return Math.round((XP_BASE_INSTANCIA[instancia] || 20) + score * 0.15);
}

module.exports = {
  PERFIL_TRIBUNAL,
  CADEIA_INSTANCIAS,
  ENTES_TRIBUTARIOS_ESTADUAIS,
  XP_BASE_INSTANCIA,
  RANK_INSTANCIA_2GRAU,
  RANK_INSTANCIA_SUPERIOR,
  tribunalRecursal,
  ehTopoDaCadeia,
  xpPorDecisao,
};
