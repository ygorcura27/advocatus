import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const TIER_CAPITAL_UPGRADE   = { 1:16000, 2:36000, 3:70000, 4:140000 };
const TIER_REPUTACAO_MINIMA  = { 1:2,     2:11,    3:34,    4:81 };
const TIER_CARGO_MINIMO      = { 2:'pln', 3:'snr', 4:'asc', 5:'soc' };
const CARGO_RANK             = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7 };
const TIER_ANOS_MINIMOS_DESDE_JNR = { 2:2, 3:4, 4:7, 5:10 };
const TIER_CUSTO_FIXO = { 1:3500, 2:8000, 3:18000, 4:35000, 5:70000 };

export function verificarUpgradeEscritorio(esc, jogador) {
  const tierAtual = esc.tier || 1;
  const tierDestino = tierAtual + 1;
  if (tierDestino > 5) return { liberado: false, motivo: 'Tier máximo já atingido.' };

  const capitalNecessario = TIER_CAPITAL_UPGRADE[tierAtual];
  const reputacaoMinima   = TIER_REPUTACAO_MINIMA[tierAtual];
  const cargoMinimo       = TIER_CARGO_MINIMO[tierDestino];
  const anosMinimos       = TIER_ANOS_MINIMOS_DESDE_JNR[tierDestino];

  const motivos = [];
  if ((esc.caixa||0) < capitalNecessario) motivos.push(`Capital insuficiente: ${esc.caixa||0}/${capitalNecessario}`);
  if ((esc.reputacao||0) < reputacaoMinima) motivos.push(`Reputação do escritório insuficiente: ${esc.reputacao||0}/${reputacaoMinima}`);
  if ((CARGO_RANK[jogador.cargo_id]??0) < (CARGO_RANK[cargoMinimo]??0)) motivos.push(`Cargo insuficiente: requer ${cargoMinimo.toUpperCase()}+`);
  if ((jogador.anos_carreira||0) < anosMinimos) motivos.push(`Carreira insuficiente: ${jogador.anos_carreira||0}/${anosMinimos} anos`);

  return { liberado: motivos.length===0, motivo: motivos.join(' · '), tierDestino, capitalNecessario, reputacaoMinima, cargoMinimo, anosMinimos };
}

export async function fazerUpgradeEscritorio(escritorioId, jogador) {
  const escRef = doc(db, 'escritorios', escritorioId);
  const escSnap = await getDoc(escRef);
  if (!escSnap.exists()) throw new Error('Escritório não encontrado.');
  const esc = escSnap.data();

  const check = verificarUpgradeEscritorio(esc, jogador);
  if (!check.liberado) throw new Error(`Requisitos não atendidos: ${check.motivo}`);

  const mesAtual = (jogador.ano_pessoal||1)*12 + (jogador.mes_pessoal||0);
  await updateDoc(escRef, {
    tier: check.tierDestino,
    custo_fixo_mensal: TIER_CUSTO_FIXO[check.tierDestino],
    caixa: (esc.caixa||0) - check.capitalNecessario,
    tier_desde_mes: mesAtual,
  });

  return { novoTier: check.tierDestino, capitalDebitado: check.capitalNecessario };
}

window.verificarUpgradeEscritorio = verificarUpgradeEscritorio;
window.fazerUpgradeEscritorio = fazerUpgradeEscritorio;
