'use strict';

/**
 * TESE CENTRAL — Advocatus Online (GDD v5.1 §16)
 *
 * 5º atributo das petições — travado na confecção, não muda após o 1º uso.
 *
 * Pool de 12-20 teses canônicas por Practice Area (em PT-BR).
 * Detecção de originalidade: se outro jogador usou a mesma tese
 * nos últimos 2 meses de jogo → penalidade de −15% no nota_teto.
 *
 * Uma tese marcada "original" ganha +10% no nota_teto.
 *
 * Uso: passado como campo `tese_central` em componerPeticao.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { logger }       = require('firebase-functions');

// ─── Pool de teses por área ───────────────────────────────────────────────────

const TESES_POOL = {
  civil: [
    'Responsabilidade civil objetiva por risco criado',
    'Lesão ao direito de personalidade como dano in re ipsa',
    'Abuso de direito como ato ilícito por desvio de função',
    'Teoria do inadimplemento antecipado do contrato',
    'Boa-fé objetiva como limitadora do exercício de direitos potestativos',
    'Desconsideração da personalidade jurídica inversa',
    'Dano moral coletivo em relações de consumo',
    'Teoria do diálogo das fontes no CDC × CC',
    'Perda de chance como modalidade autônoma de dano',
    'Tutela inibitória como meio mais eficiente de reparação',
    'Enriquecimento sem causa como cláusula geral reparatória',
    'Proteção do adquirente de boa-fé contra evicção parcial',
    'Função social do contrato como limite à autonomia privada',
    'Solidariedade passiva nas cadeias de fornecedores',
    'Teoria da imprevisão e revisão contratual por onerosidade',
  ],
  criminal: [
    'Princípio da insignificância como excludente de tipicidade material',
    'Co-autoria versus participação — critério do domínio do fato',
    'Flagrante preparado como causa de nulidade da prisão',
    'Bis in idem na dosimetria com fundamentos idênticos',
    'Teoria limitada da culpabilidade no erro de proibição',
    'Atipicidade do porte de entorpecente para uso próprio',
    'Nulidade da prova obtida por violação de privacidade digital',
    'Presunção de inocência como regra de tratamento processual',
    'Ausência de dolo específico como excludente de tipo',
    'Aplicação do princípio da consunção em concurso aparente',
    'Nulidade absoluta por cerceamento de defesa na instrução',
    'Detração penal e retroatividade benéfica da lei',
  ],
  employment: [
    'Vínculo empregatício mascarado em relação de prestação de serviços',
    'Responsabilidade subsidiária do tomador de serviços terceirizados',
    'Assédio moral organizacional como dano existencial',
    'Dispensa discriminatória como ato nulo pleno direito',
    'Ultratividade das normas coletivas após vigência',
    'Dano moral pela violação do direito à desconexão digital',
    'Trabalhador hipossuficiente e inversão do ônus da prova',
    'Rescisão indireta por descumprimento contratual patronal',
    'Equiparação salarial por trabalho de igual valor',
    'Natureza salarial das parcelas habituais para fins de integração',
    'Acidente de trabalho e nexo causal por concausa',
    'Grupo econômico e responsabilidade solidária trabalhista',
  ],
  corporate: [
    'Desconsideração da personalidade jurídica e responsabilidade dos sócios',
    'Teoria ultra vires e vinculação da sociedade por ato do administrador',
    'Abuso de poder do controlador em detrimento de minoritários',
    'Dissolução parcial e apuração de haveres pelo valor real',
    'Quebra de affectio societatis como causa dissolutória',
    'Invalidade de deliberação que viola direito essencial do sócio',
    'Responsabilidade do administrador por atos de gestão irregular',
    'Due diligence e responsabilidade pré-contratual nas M&A',
    'Acordo de acionistas e eficácia perante a companhia',
    'Desconsideração inversa para atingir patrimônio pessoal do controlador',
    'Competência exclusiva da assembleia versus poderes do conselho',
    'Tutela cautelar para suspensão de deliberação abusiva',
  ],
  tax: [
    'Interpretação econômica do fato gerador tributário',
    'Anterioridade especial nonagesimal como garantia fundamental',
    'Isenção heterônoma e seus limites constitucionais',
    'Planejamento tributário lícito versus elusão fiscal',
    'Restituição de indébito por substituição tributária progressiva',
    'Crédito de ICMS em operações com insumos intermediários',
    'PIS/COFINS não cumulativo — conceito de insumo na atividade',
    'Decadência e prescrição do crédito tributário — distinção',
    'Responsabilidade tributária do sucessor e adquirente de fundo de comércio',
    'Imunidade tributária recíproca das empresas públicas prestadoras',
    'Nulidade do lançamento por vício na constituição do crédito',
    'Taxa × contribuição de melhoria — elementos diferenciadores',
  ],
  immigration: [
    'Direito ao reagrupamento familiar como direito humano fundamental',
    'Condição especial do refugiado e non-refoulement',
    'Naturalização e dupla cidadania — condicionamentos constitucionais',
    'Deportação versus expulsão — regimes jurídicos distintos',
    'Visto humanitário e recepção do migrante forçado',
    'Apatridia e proteção internacional do indivíduo sem Estado',
    'Regularização migratória e acesso a direitos fundamentais',
    'Discriminação por origem nacional como ato antijurídico',
    'Extradição e limites pelo princípio da especialidade',
    'Proteção complementar para migrantes não enquadráveis como refugiados',
  ],
  bankruptcy: [
    'Recuperação judicial como preservação da função social da empresa',
    'Classificação dos créditos e ordenação do concurso de credores',
    'Impugnação do crédito por irregularidade formal',
    'Atos praticados no período suspeito como ineficácia objetiva',
    'Plano de recuperação e limites ao direito de voto dos credores',
    'Convolação da recuperação em falência por descumprimento do plano',
    'Arrecadação de bens do falido e o incidente de restituição',
    'Responsabilidade dos administradores na falência fraudulenta',
    'Desconsideração da personalidade jurídica em sede concursal',
    'Crédito trabalhista superprivilegiado — teto e rateio',
  ],
  constitutional: [
    'Eficácia horizontal dos direitos fundamentais nas relações privadas',
    'Proporcionalidade como parâmetro de controle da razoabilidade legislativa',
    'Estado de coisas inconstitucional e tutela estrutural',
    'Controle de convencionalidade e hierarquia dos tratados de DH',
    'Mandado de injunção e seus efeitos — posição atual do STF',
    'Inconstitucionalidade por omissão e prazo para suprimento',
    'Separação de poderes e controle judicial de políticas públicas',
    'Liberdade de expressão versus proteção de grupos vulneráveis',
    'Sigilo bancário × FISCO — relativização por LC 105/2001',
    'Vedação ao retrocesso social como limitação ao legislador',
  ],
};

// ─── Utilitário: listar teses por área ───────────────────────────────────────

function listarTesesPorArea(practiceArea) {
  return TESES_POOL[practiceArea] || TESES_POOL['civil'];
}

/**
 * Verifica se uma tese é original nos últimos 2 meses de jogo.
 * Retorna { original: bool, penalidade: bool, mod_tese: number }
 *   original  → tese não foi usada por ninguém nos últimos 2 meses → +10% teto
 *   penalidade → tese foi usada por outro jogador nos últimos 2 meses → −15% teto
 *   mod_tese → multiplicador final (0.85 / 1.0 / 1.10)
 */
async function verificarOriginalidadeTese(db, tese, practiceArea, uid, mesGlobalAtual) {
  if (!tese) return { original: false, penalidade: false, mod_tese: 1.0 };

  const limiarMes = Math.max(0, mesGlobalAtual - 2);

  try {
    const snap = await db.collection('peticoes')
      .where('tese_central', '==', tese)
      .where('practice_area', '==', practiceArea)
      .where('mes_global_inicio', '>=', limiarMes)
      .limit(5)
      .get();

    // Filtra peticoes de outros jogadores (não a própria)
    const outrasPeticoes = snap.docs.filter(d => d.data().jogador_uid !== uid);

    if (outrasPeticoes.length > 0) {
      return { original: false, penalidade: true, mod_tese: 0.85 };
    }

    // Nenhuma outra peticao com esta tese nos últimos 2 meses → original
    return { original: true, penalidade: false, mod_tese: 1.10 };
  } catch (e) {
    logger.warn('[TESE] Erro ao verificar originalidade:', e.message);
    return { original: false, penalidade: false, mod_tese: 1.0 };
  }
}

// ─── Callable: listarTeses ────────────────────────────────────────────────────

exports.listarTeses = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.');
  const { practice_area } = request.data || {};
  const teses = listarTesesPorArea(practice_area || 'civil');
  return { ok: true, teses, practice_area: practice_area || 'civil' };
});

module.exports = Object.assign(module.exports, {
  listarTesesPorArea,
  verificarOriginalidadeTese,
  TESES_POOL,
});
