/**
 * EVENTOS EXTRAS DO ESCRITÓRIO — multa, inadimplência, indenização,
 * fiscalização. Exclusivos de dono de escritório, escalam com o Tier.
 * Chamado por processarFinancasEscritorioMensal (escritorio_financas.js).
 */

export const EVENTOS_POR_TIER = {
  1: [{ prob:0.08, min:500,   max:2000,   nome:'Multa CAARJ/OAB por atraso' }],
  2: [{ prob:0.08, min:1000,  max:4000,   nome:'Multa CAARJ/OAB por atraso' },
      { prob:0.05, min:2000,  max:8000,   nome:'Inadimplência de cliente' }],
  3: [{ prob:0.06, min:2000,  max:8000,   nome:'Fiscalização leve' },
      { prob:0.04, min:5000,  max:20000,  nome:'Inadimplência de cliente' }],
  4: [{ prob:0.05, min:5000,  max:20000,  nome:'Fiscalização trabalhista/tributária' },
      { prob:0.03, min:15000, max:60000,  nome:'Indenização por erro processual' }],
  5: [{ prob:0.04, min:15000, max:60000,  nome:'Fiscalização trabalhista/tributária' },
      { prob:0.025,min:40000, max:150000, nome:'Indenização por erro processual' }],
};

export function rolarEventosDoMes(tier) {
  const lista = EVENTOS_POR_TIER[tier] || EVENTOS_POR_TIER[1];
  let custoTotal = 0;
  const eventosOcorridos = [];
  for (const ev of lista) {
    if (Math.random() < ev.prob) {
      const custo = Math.floor(ev.min + Math.random() * (ev.max - ev.min));
      custoTotal += custo;
      eventosOcorridos.push({ nome: ev.nome, custo });
    }
  }
  return { custoTotal, eventos: eventosOcorridos };
}
