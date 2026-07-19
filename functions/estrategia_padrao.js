'use strict';

/**
 * ESTRATÉGIA PADRÃO — GDD v6.0 §1.2 item 3 das "standing orders" (filosofia
 * anti-login-diário): "postura agressiva/conservadora/conciliatória, teto
 * de acordo autorizado". Auto-resolve "sem o jogador presente".
 *
 * ESCOPO DELIBERADAMENTE MENOR que o mockup (.impeccable/preview/dossie-v1.html
 * "🎭 Estratégia Padrão — modelo show"): o mockup pressupõe o "modelo show"
 * inteiro (Tese salva + data de resolução + todo processo resolvendo
 * sozinho na virada do mês) — isso NÃO existe no código real (zero
 * `tese_salva`/`data_resolucao`/auto-resolve em `functions/`), seria
 * reforma própria, maior que este recurso. Aqui só o texto literal do GDD
 * (postura + teto), plugado no único lugar que já é auto-resolve real e
 * vivo hoje: a decisão de acordo do gestor delegado
 * (functions/gestor_decisoes.js::processarAcordosGestorCF).
 *
 * O caminho MANUAL (window.tentarAcordo, jogador clicando) fica de fora de
 * propósito — o jogador já presente É a decisão dele; a standing order só
 * importa "sem o jogador presente" (GDD), que é exatamente o caso do
 * gestor delegado.
 *
 * INTERPRETAÇÃO DO "TETO DE ACORDO" — decisão de design documentada (o GDD
 * não formaliza a fórmula, só dá o exemplo "aceitar acordo ≥60%"): não dá
 * pra gatear pelo VALOR do acordo porque a fórmula atual de honorários do
 * acordo automático é uma fração fixa de `p.valor` (não escala com
 * convencimento) — qualquer teto em cima disso seria sempre
 * verdadeiro/falso pro mesmo processo, nunca variando por caso. Em vez
 * disso, o teto age sobre CONVENCIMENTO (cv, força real do caso, isso sim
 * varia por processo): abaixo do teto, o caso não está favorável o
 * suficiente pra arriscar julgamento — a standing order autoriza aceitar
 * o acordo automaticamente. Acima do teto, o caso está forte — a ordem
 * NÃO autoriza o gestor a acordar sozinho (deixa o jogador decidir
 * manualmente se quer mesmo assim, ou seguir pro julgamento).
 */

const POSTURAS = ['agressiva', 'conservadora', 'conciliatoria'];

// Modificador na chance de aceite (mesma fórmula-base de
// window.tentarAcordo/processarAcordosGestorCF: cv/120 + 0.25).
// Agressiva seca a chance (só aceita ofertas muito boas mesmo dentro do
// teto); conciliatória infla (aceita de bom grado); conservadora é o
// comportamento de sempre, sem modificador.
const MOD_POSTURA = { agressiva: -0.15, conservadora: 0, conciliatoria: 0.15 };

function estrategiaPadrao() {
  return { postura: 'conservadora', teto_acordo_pct: 50 };
}

function normalizarEstrategia(e) {
  const base = estrategiaPadrao();
  if (!e) return base;
  return {
    postura: POSTURAS.includes(e.postura) ? e.postura : base.postura,
    teto_acordo_pct: Number.isFinite(e.teto_acordo_pct) ? Math.max(0, Math.min(100, e.teto_acordo_pct)) : base.teto_acordo_pct,
  };
}

/** Convencimento (cv, 0-100) está dentro do teto autorizado pro gestor decidir acordo sozinho? */
function dentroDoTetoAcordo(cv, estrategia) {
  const e = normalizarEstrategia(estrategia);
  return (cv || 0) <= e.teto_acordo_pct;
}

/** Chance final de aceite, já com o modificador de postura aplicado (mesma fórmula-base cv/120+0.25, clampada 0-1). */
function chanceAceiteComPostura(cv, estrategia) {
  const e = normalizarEstrategia(estrategia);
  const base = (cv || 0) / 120 + 0.25;
  return Math.max(0, Math.min(1, base + (MOD_POSTURA[e.postura] || 0)));
}

module.exports = {
  POSTURAS,
  estrategiaPadrao,
  normalizarEstrategia,
  dentroDoTetoAcordo,
  chanceAceiteComPostura,
};
