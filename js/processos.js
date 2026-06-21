/**
 * PROCESSOS — Advocatus Online
 * Fluxo: Abrir processo → Sustentação oral (audiência) → Sentença → Recurso (colegiado)
 *
 * v2 — Portado do motor procedural v8 (motor_v5.html). Substitui o sistema
 * antigo de "peça processual + quiz técnico genérico" por:
 *   - Tributo/PF-PJ/perfil de empresa real por área (tributário)
 *   - Lado processual (autor/réu) determinado pelo CONFLITO, não fixo
 *   - Roteamento de instâncias NOMEADAS por área/ente (TJ/TRF/TRT → STJ/TST → STF)
 *   - Banco de 25 teses tributárias com argumentos forte/médio/fraco (sorteio)
 *   - Provas restritas por RITO PROCESSUAL do conflito (ex: Mandado de
 *     Segurança nunca recebe prova pericial)
 *   - Sentença de 1º grau por convencimento progressivo (audiência)
 *   - Recurso colegiado com julgadores NOMEADOS (fictícios) e classes
 *     ocultas que reagem diferente a cada tema de argumento
 *   - Trava de acesso a instância superior por placar de goleada
 *   - Trava de capacidade postulatória por cargo (Júnior só até 2º grau,
 *     Pleno até Tribunal Superior, Sênior+ até STF), com repasse
 *     automático para colega do escritório quando o cargo não alcança
 *
 * getPecasParaCaso/getQuestoes (banco_pecas.js/banco_questoes.js) NÃO são
 * mais usados neste fluxo — mantidos no projeto por segurança, caso outro
 * módulo ainda dependa deles, mas o novo fluxo de processos não os chama.
 */

import { collection, addDoc, doc, updateDoc, getDoc, getDocs, query, where }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// CONSTANTES DE PRODUÇÃO (mantidas do processos.js original)
// ════════════════════════════════════════════════════════
const CARGO_IDX = {
  est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7,
  jsub:2, jtit:4, dsb:5, mstj:7, padj:2, prom:4, pjus:5, pgj:7,
  dadj:2, def:4, dch:5, dge:7,
};

// ── Cargos que podem CONCLUIR (processar sentença) um caso do pool sozinhos.
// Estagiário e Assistente podem trabalhar normalmente até 90% de progresso,
// mas a sentença final exige Júnior+ — alguém com OAB no caso, narrativamente.
const CARGO_IDX_CONCLUSAO_MIN = 2; // jnr
const PROGRESSO_MAX_SEM_ADVOGADO = 90;

// ── Instância MÁXIMA que cada faixa de cargo pode sustentar EM RECURSO.
// Est/Ass (idx 0-1): não recorrem. Júnior (idx 2): até 2º grau (TJ/TRF/TRT).
// Pleno (idx 3): até Tribunal Superior (STJ/TST). Sênior+ (idx 4+): até STF.
const RANK_INSTANCIA_2GRAU = ['TJ','TRF','TRT'];
const RANK_INSTANCIA_SUPERIOR = ['STJ','TST'];

function instanciaMaximaParaCargo(cargoId){
  const idx = CARGO_IDX[cargoId] ?? 0;
  if (idx <= 1) return null;       // não recorre
  if (idx === 2) return 'TJ_TRF_TRT';
  if (idx === 3) return 'STJ_TST';
  return 'STF';
}

function cargoPodeSustentar(cargoId, instancia){
  const max = instanciaMaximaParaCargo(cargoId);
  if (max === null) return false;
  if (RANK_INSTANCIA_2GRAU.includes(instancia)) return true;
  if (RANK_INSTANCIA_SUPERIOR.includes(instancia)) return max === 'STJ_TST' || max === 'STF';
  if (instancia === 'STF') return max === 'STF';
  return false;
}

// Busca no escritório (subcoleção funcionarios) alguém com cargo suficiente
// para sustentar a instância dada, para repasse automático quando o
// jogador não tem capacidade postulatória para a instância que o processo
// alcançou. Exclui o próprio jogador (já sabemos que ele não alcança).
async function buscarRepasseEscritorio(escritorioId, uidExcluir, instancia){
  if (!escritorioId) return null;
  try {
    const fSnap = await getDocs(query(
      collection(db, 'escritorios', escritorioId, 'funcionarios'),
      where('ativo', '!=', false)
    ));
    for (const fDoc of fSnap.docs) {
      const f = fDoc.data();
      if (f.jogador_uid === uidExcluir) continue;
      if (cargoPodeSustentar(f.cargo_id, instancia)) {
        return { uid: f.jogador_uid, nome: f.nome, cargo_id: f.cargo_id };
      }
    }
  } catch (e) { console.warn('[REPASSE] Erro ao buscar colega qualificado:', e); }
  return null;
}

// ── Limite de novos casos do POOL do escritório por mês (Tier), e teto de
// casos abertos simultâneos — mantidos do processos.js original.
const LIMITE_POOL_CASOS_MES_TIER = { 1:3, 2:6, 3:9, 4:13, 5:18 };
const LIMITE_POOL_CASOS_ABERTOS_TIER = { 1:6, 2:12, 3:18, 4:26, 5:36 };
const ENERGIA_CAPTAR_CASO_POOL = 8;
const PRAZO_POOL_MESES = 3;

// ── Custo de energia por ação na audiência (1ª instância) — mantido do
// sistema antigo de ACOES, agora reaproveitado para as RODADAS de
// sustentação oral do novo fluxo de audiência (3 rodadas fixas).
const ENERGIA_POR_RODADA_AUDIENCIA = 12;
const ENERGIA_PREPARACAO_RECURSO = 10;
const ENERGIA_POR_RODADA_RECURSO = 15;

// REP_CAP — teto de reputação por cargo (já usado em outros módulos via
// window.REP_CAP; mantido aqui como fallback local caso não esteja setado).
const REP_CAP_FALLBACK = { est:20, ass:35, jnr:45, pln:55, snr:65, asc:80, soc:100, snm:100 };
function repCapDoJogador(j){
  return (window.REP_CAP || REP_CAP_FALLBACK)[j.cargo_id] || 55;
}

// ════════════════════════════════════════════════════════
// BANCO JURÍDICO — portado integralmente do motor procedural v8.
// Mesma estrutura, mesma base legal pesquisada (Tema 69 STF, Súmula 436
// STJ, Tema 1125 STJ, Tema 118 STF, Súmula 430 STJ, art. 5º LIV/LV CF
// para devido processo administrativo, etc. — ver comentários originais
// preservados abaixo).
// ════════════════════════════════════════════════════════
const TESES_TRIBUTARIO_EXPANDIDO = {

  // ──────────────────────────────────────────────────────
  tema69_stf: {
    nome: 'Tema 69 STF — Exclusão do ICMS da base PIS/COFINS',
    fundamento: 'Tema 69 STF (RE 574.706)',
    fortes: [
      'O STF fixou no Tema 69 (RE 574.706) que o ICMS não compõe a base de cálculo do PIS e da COFINS.',
      'O valor do ICMS destacado na nota fiscal não se enquadra no conceito de faturamento para fins de incidência das contribuições.',
      'O ICMS apenas transita pelo patrimônio da empresa até seu repasse ao Estado, não constituindo receita própria do contribuinte.',
      'A base de cálculo do PIS/COFINS deve refletir exclusivamente riqueza própria do contribuinte, conforme fixado pelo STF.',
      'A modulação de efeitos do Tema 69 resguarda o direito à exclusão a partir de 15/03/2017, salvo ações ajuizadas anteriormente.',
      'O entendimento do Supremo aplica-se também ao ICMS-ST, conforme posteriormente reconhecido pelo STJ no Tema 1125.',
      'A inclusão do ICMS na base de cálculo das contribuições configura tributação sobre tributo, vedada pelo entendimento consolidado.',
      'O conceito constitucional de faturamento não comporta a inclusão de valor que apenas transita pelo caixa da empresa.',
    ],
    medios: [
      'A interpretação sistemática da legislação tributária recomenda a exclusão do imposto estadual da base federal.',
      'A tributação atual amplia indevidamente a carga sobre o contribuinte ao incluir valor de terceiro na base de cálculo.',
      'O princípio da capacidade contributiva é afetado quando se tributa valor que não integra o patrimônio da empresa.',
      'A coerência do sistema tributário exige que cada base de cálculo reflita apenas a riqueza do próprio contribuinte.',
      'A cobrança sobre o ICMS destacado gera distorção econômica relevante na apuração das contribuições.',
      'A exclusão promove maior equilíbrio na carga tributária total incidente sobre a operação.',
    ],
    fracos: [
      'Todo tributo destacado na nota fiscal deve ser automaticamente excluído de qualquer base de cálculo.',
      'A empresa pode definir livremente qual parcela de sua receita considera tributável.',
      'O ICMS nunca integra, em nenhuma hipótese, qualquer base de cálculo de tributo federal.',
      'O contribuinte sempre tem direito à restituição integral independentemente da data do pagamento.',
      'Qualquer valor que mencione "imposto" no documento fiscal deve ser excluído da apuração.',
      'A carga tributária elevada por si só torna a cobrança ilegal, independente de fundamento técnico.',
    ],
  },

  // ──────────────────────────────────────────────────────
  sumula436_stj: {
    nome: 'Súmula 436 STJ — Constituição do Crédito Tributário',
    fundamento: 'Súmula 436 STJ',
    fortes: [
      'A Súmula 436 do STJ estabelece que a entrega de declaração pelo contribuinte constitui o crédito tributário, dispensada outra providência do Fisco.',
      'Tratando-se de tributo sujeito a lançamento por homologação, a entrega da DCTF constitui definitivamente o crédito, dispensando lançamento expresso.',
      'A jurisprudência do STJ, em recurso repetitivo (REsp 1.101.728), pacificou que a DCTF ou documento equivalente constitui o crédito tributário.',
      'Não havendo prévia notificação obrigatória, o débito declarado e não pago torna-se exigível independentemente de procedimento administrativo.',
    ],
    medios: [
      'A autodeclaração do contribuinte tem o efeito de antecipar a exigibilidade do crédito tributário.',
      'O sistema de lançamento por homologação dispensa formalidades adicionais quando há confissão de débito.',
      'A entrega da declaração tributária equivale, para fins práticos, ao próprio lançamento.',
    ],
    fracos: [
      'Qualquer declaração entregue ao Fisco, mesmo informal, sempre constitui o crédito tributário.',
      'A simples menção a um débito em qualquer documento já basta para execução fiscal imediata.',
      'O contribuinte que declara está automaticamente impedido de questionar judicialmente o valor declarado.',
    ],
  },

  // ──────────────────────────────────────────────────────
  prescricao_intercorrente: {
    nome: 'Prescrição Intercorrente',
    fundamento: 'Tema 504 STJ',
    fortes: [
      'Nos termos do Tema 504 do STJ, a prescrição intercorrente deve ser reconhecida diante da inércia da Fazenda após o transcurso do prazo legal.',
      'O art. 40 da Lei nº 6.830/1980 impede a perpetuação indefinida da execução fiscal sem atos efetivos de cobrança.',
      'A ausência de atos de cobrança por período superior a cinco anos autoriza a extinção do crédito tributário por prescrição intercorrente.',
      'A segurança jurídica exige a estabilização das relações jurídicas após o decurso do prazo prescricional, conforme jurisprudência do STJ.',
      'O processo permaneceu paralisado sem qualquer ato efetivo de cobrança por prazo superior ao quinquenal previsto no art. 174 do CTN.',
      'A Fazenda Pública não promoveu a citação ou localização de bens dentro do prazo legal, consumando-se a prescrição intercorrente.',
    ],
    medios: [
      'A razoável duração do processo recomenda o encerramento da cobrança após longa inércia da exequente.',
      'A demora excessiva no andamento processual compromete a efetividade da execução fiscal.',
      'O contribuinte não pode permanecer indefinidamente sujeito a uma cobrança sem movimentação útil.',
      'A inércia continuada da Fazenda Pública sinaliza desinteresse na efetiva cobrança do crédito.',
    ],
    fracos: [
      'Toda execução fiscal com mais de cinco anos de ajuizamento está automaticamente prescrita.',
      'A Fazenda perde o direito de cobrar pelo simples decurso do tempo, independente de inércia comprovada.',
      'A ausência de penhora por si só já configura prescrição intercorrente, sem necessidade de analisar os atos do processo.',
      'A execução fiscal é incompatível com qualquer cobrança de débito antigo, ainda que recentemente ajuizada.',
    ],
  },

  // ──────────────────────────────────────────────────────
  nulidade_cda: {
    nome: 'Nulidade da CDA',
    fundamento: 'Art. 203 CTN e Art. 2º, §5º Lei 6.830/80',
    fortes: [
      'A Certidão de Dívida Ativa não contém todos os requisitos exigidos pelo art. 202 do CTN, comprometendo sua validade.',
      'A ausência de elementos exigidos pelo art. 2º, §5º, da Lei 6.830/1980 compromete a presunção de liquidez e certeza do título.',
      'A CDA apresenta vício que compromete a identificação precisa da origem e do montante do crédito tributário.',
      'A falta de demonstrativo de cálculo do débito, quando exigível, prejudica o exercício da ampla defesa do executado.',
      'O STJ reconhece, em recurso repetitivo, que vícios na CDA quanto à liquidez e certeza autorizam o reconhecimento de nulidade parcial.',
      'A inconsistência entre o valor lançado e o documento que lhe deu origem (DCTF) compromete a regularidade da inscrição.',
    ],
    medios: [
      'A Administração deve observar rigor formal na constituição do crédito tributário antes de sua cobrança judicial.',
      'A segurança jurídica exige precisão na descrição da origem e composição da dívida cobrada.',
      'O contribuinte teve dificuldade real de identificar a origem específica do débito apontado na CDA.',
      'O lançamento que originou a inscrição apresenta inconsistências documentais relevantes.',
    ],
    fracos: [
      'Qualquer erro formal, ainda que irrelevante, anula automaticamente toda a CDA.',
      'A inscrição em dívida ativa deve sempre ser interpretada em favor do contribuinte, independente de vício concreto.',
      'Toda CDA possui presunção de nulidade até prova em contrário pela Fazenda.',
      'A Fazenda deve refazer integralmente a inscrição sempre que houver qualquer questionamento do contribuinte.',
    ],
  },

  // ──────────────────────────────────────────────────────
  nulidade_auto: {
    nome: 'Nulidade do Auto de Infração',
    fundamento: 'Art. 5º, LIV e LV, CF — Devido Processo Legal Administrativo',
    fortes: [
      'O art. 5º, LV, da Constituição assegura aos litigantes em processo administrativo o contraditório e a ampla defesa.',
      'A ausência de oportunidade de manifestação sobre os elementos de prova utilizados pela fiscalização viola o devido processo legal.',
      'O contraditório efetivo no processo administrativo fiscal exige acesso integral aos autos antes da decisão.',
      'A nulidade do auto de infração se impõe quando há prejuízo concreto ao exercício do direito de defesa do autuado.',
      'O Decreto nº 70.235/1972, que disciplina o processo administrativo fiscal, exige fundamentação específica para a validade do lançamento.',
    ],
    medios: [
      'A Administração Tributária deve assegurar participação efetiva do contribuinte antes de consolidar a exigência fiscal.',
      'A motivação insuficiente do ato administrativo compromete sua regularidade formal.',
      'O direito de resposta deve ser assegurado de forma real, não meramente formal, no processo fiscal.',
    ],
    fracos: [
      'Qualquer auto de infração lavrado sem a presença de advogado é automaticamente nulo.',
      'A simples discordância do contribuinte com o valor cobrado já configura nulidade do auto.',
      'Todo processo administrativo fiscal deve ser anulado se a decisão for desfavorável ao contribuinte.',
    ],
  },

  // ──────────────────────────────────────────────────────
  decadencia: {
    nome: 'Decadência Tributária',
    fundamento: 'Art. 173 CTN',
    fortes: [
      'Nos termos do art. 173, I, do CTN, o direito de a Fazenda constituir o crédito tributário extingue-se em cinco anos.',
      'O termo inicial do prazo decadencial é o primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado.',
      'O STJ reafirma que é irrelevante a data em que o Fisco tomou conhecimento do fato gerador para fins de contagem decadencial.',
      'Quando o lançamento anterior foi anulado por vício formal, o art. 173, II, do CTN concede novo prazo de cinco anos a contar da decisão anulatória.',
      'A decadência tributária extingue o próprio crédito, e não apenas a pretensão de cobrança, atingindo o direito material da Fazenda.',
    ],
    medios: [
      'O decurso do prazo legal sem o devido lançamento compromete definitivamente a pretensão fiscal.',
      'A inércia da Administração em constituir o crédito dentro do prazo legal gera consequência jurídica desfavorável ao Fisco.',
      'A segurança jurídica do contribuinte exige limite temporal claro para a constituição de débitos tributários.',
    ],
    fracos: [
      'Qualquer cobrança realizada após cinco anos do fato gerador está automaticamente decaída, independente da data do lançamento.',
      'A decadência tributária se confunde com a prescrição e pode ser arguida em qualquer fase do processo sem distinção.',
      'Todo tributo não cobrado no mesmo ano do fato gerador está irremediavelmente extinto.',
    ],
  },

  // ──────────────────────────────────────────────────────
  prescricao: {
    nome: 'Prescrição Tributária',
    fundamento: 'Art. 174 CTN',
    fortes: [
      'O art. 174 do CTN estabelece que a ação de cobrança do crédito tributário prescreve em cinco anos, contados da constituição definitiva.',
      'A prescrição interrompe-se apenas pelo despacho do juiz que ordenar a citação em execução fiscal, conforme redação dada pela LC 118/2005.',
      'O STJ confirma que, para despachos posteriores à LC 118/2005, este é o marco interruptivo do prazo prescricional.',
      'A ausência de citação válida ou de qualquer causa interruptiva dentro do quinquênio legal consuma a prescrição da pretensão executória.',
    ],
    medios: [
      'A inércia da Fazenda em promover atos executórios dentro do prazo legal compromete a pretensão de cobrança.',
      'O decurso do tempo sem movimentação útil do processo executivo enfraquece a pretensão fiscal.',
      'A estabilização das relações jurídicas após o prazo legal é interesse protegido pelo ordenamento tributário.',
    ],
    fracos: [
      'Qualquer execução fiscal ajuizada após cinco anos do vencimento do tributo está automaticamente prescrita, sem analisar a constituição definitiva.',
      'A simples demora no andamento do processo, ainda que por ato do próprio executado, gera prescrição em favor do contribuinte.',
      'A prescrição tributária pode ser presumida pelo juízo independentemente de qualquer cálculo de prazo.',
    ],
  },

  // ──────────────────────────────────────────────────────
  '170a_ctn': {
    nome: 'Art. 170-A CTN — Vedação de Compensação Antes do Trânsito em Julgado',
    fundamento: 'Art. 170-A CTN',
    fortes: [
      'O art. 170-A do CTN veda a compensação mediante aproveitamento de tributo objeto de contestação judicial antes do trânsito em julgado.',
      'O STJ, em recurso repetitivo (REsp 1.164.452), confirma que a vedação se aplica mesmo em casos de reconhecida inconstitucionalidade do tributo.',
      'A exigência de trânsito em julgado para a compensação decorre da necessidade de certeza jurídica sobre o crédito a ser compensado.',
      'Decisões provisórias, como liminares ou tutelas antecipadas, não conferem direito material à compensação, nos termos do art. 170-A do CTN.',
    ],
    medios: [
      'A compensação antes da definitividade da decisão gera risco de reversão patrimonial indevida.',
      'A estabilidade do crédito tributário compensado depende da finalização da discussão judicial correspondente.',
      'A prudência na gestão fiscal recomenda aguardar a definitividade antes de qualquer compensação.',
    ],
    fracos: [
      'Qualquer decisão judicial, mesmo provisória, já autoriza compensação imediata do crédito discutido.',
      'A vedação do art. 170-A não se aplica quando o contribuinte considera sua tese juridicamente correta.',
      'A compensação pode ser realizada livremente enquanto o processo estiver em qualquer fase de tramitação.',
    ],
  },

  // ──────────────────────────────────────────────────────
  imunidade_tributaria: {
    nome: 'Imunidade Tributária',
    fundamento: 'Art. 150, VI, CF',
    fortes: [
      'O art. 150, VI, da Constituição veda a instituição de impostos sobre patrimônio, renda ou serviços das entidades ali enumeradas.',
      'O STF reconhece que a imunidade tributária prevista no art. 150, VI, "c", alcança até o Imposto sobre Operações Financeiras (IOF).',
      'Para o reconhecimento da imunidade, basta a ausência de prova de desvio de finalidade, ônus que incumbe ao Fisco.',
      'A imunidade deve restringir-se à propriedade, bens e serviços vinculados às finalidades essenciais da entidade, conforme critério fixado pelo STF.',
    ],
    medios: [
      'A atividade exercida pela entidade está vinculada aos seus objetivos institucionais protegidos pela norma constitucional.',
      'A finalidade não lucrativa da instituição reforça a aplicabilidade do regime imunizante.',
      'A interpretação teleológica da norma constitucional favorece o reconhecimento da imunidade no caso concreto.',
    ],
    fracos: [
      'Qualquer entidade sem fins lucrativos está automaticamente imune a todo e qualquer tributo, sem necessidade de comprovar vinculação institucional.',
      'A imunidade tributária se aplica a qualquer operação realizada pela entidade, mesmo as desvinculadas de sua finalidade essencial.',
      'Basta a entidade alegar finalidade social para ter reconhecida a imunidade, sem necessidade de prova.',
    ],
  },

  // ──────────────────────────────────────────────────────
  isencao_tributaria: {
    nome: 'Isenção Tributária',
    fundamento: 'Art. 150, §6º, CF c/c Art. 176 CTN',
    fortes: [
      'A isenção tributária depende de previsão em lei específica, conforme exige o art. 150, §6º, da Constituição Federal.',
      'O art. 176 do CTN exige que a lei isentiva especifique as condições e requisitos exigidos para sua concessão.',
      'A norma isentiva vigente à época do fato gerador deve ser aplicada quando preenchidos seus requisitos objetivos.',
      'A isenção, uma vez prevista em lei específica e atendidos seus requisitos, gera direito subjetivo à dispensa do pagamento.',
    ],
    medios: [
      'O contribuinte preenche os requisitos objetivos previstos na norma isentiva aplicável ao caso.',
      'A finalidade extrafiscal da isenção concedida favorece sua aplicação ao caso concreto analisado.',
      'A interpretação da lei isentiva deve considerar o contexto econômico que motivou sua edição.',
    ],
    fracos: [
      'Qualquer benefício fiscal mencionado em qualquer norma já garante isenção automática, independente de previsão legal específica.',
      'A isenção tributária pode ser presumida pelo contribuinte sempre que considerar a cobrança excessiva.',
      'Basta a alegação de dificuldade financeira para ter reconhecida a isenção do tributo.',
    ],
  },

  // ──────────────────────────────────────────────────────
  bis_in_idem: {
    nome: 'Bis In Idem Tributário',
    fundamento: 'Art. 150, I, CF — Princípio da Legalidade',
    fortes: [
      'O art. 150, I, da Constituição veda a exigência de tributo sem lei que o estabeleça, vedando cobrança sem expressa previsão legal.',
      'A dupla tributação pelo mesmo ente sobre o mesmo fato gerador, sem autorização constitucional expressa, configura bis in idem ilegal.',
      'O princípio da legalidade exige que cada exação tenha hipótese de incidência e base de cálculo claramente distintas das demais.',
      'Inexistindo previsão constitucional que autorize expressamente a dupla incidência, a cobrança simultânea sobre o mesmo fato é inválida.',
    ],
    medios: [
      'A sobreposição de exigências fiscais sobre idêntica base econômica compromete a coerência do sistema tributário.',
      'A ausência de finalidade distinta entre os tributos cobrados sugere indevida duplicidade de cobrança.',
      'O contribuinte não deve suportar exigência fiscal redundante sobre o mesmo fato gerador.',
    ],
    fracos: [
      'Qualquer coincidência entre tributos diferentes sobre fatos relacionados já configura bis in idem, mesmo havendo previsão constitucional distinta.',
      'A cobrança de IR e CSLL sobre o lucro já caracteriza bis in idem ilegal, ignorando a autorização constitucional para ambos.',
      'O contribuinte pode escolher livremente qual dos tributos sobrepostos deseja pagar.',
    ],
  },

  // ──────────────────────────────────────────────────────
  confisco_tributario: {
    nome: 'Efeito Confiscatório',
    fundamento: 'Art. 150, IV, CF',
    fortes: [
      'O art. 150, IV, da Constituição veda a utilização de tributo com efeito de confisco.',
      'O STF reconhece que a vedação ao efeito confiscatório se estende às multas tributárias, por interpretação extensiva do art. 150, IV.',
      'Caracteriza-se o efeito confiscatório quando a carga tributária ou a multa absorve parcela substancial do patrimônio ou renda do contribuinte.',
      'Jurisprudência do STF já reconheceu como confiscatória multa que, somada ao tributo principal, supera o valor da própria obrigação.',
    ],
    medios: [
      'A multa aplicada apresenta percentual desproporcional em relação à gravidade da infração cometida.',
      'A intensidade da cobrança compromete a capacidade econômica do contribuinte de exercer sua atividade.',
      'A razoabilidade e proporcionalidade devem orientar a fixação de qualquer penalidade tributária.',
    ],
    fracos: [
      'Qualquer multa tributária, independente do percentual, configura confisco apenas por ser onerosa ao contribuinte.',
      'O simples valor elevado da cobrança, sem análise proporcional, já caracteriza efeito confiscatório.',
      'A vedação ao confisco se aplica a qualquer tributo, dispensando análise do percentual da carga total.',
    ],
  },

  // ──────────────────────────────────────────────────────
  nao_cumulatividade_icms: {
    nome: 'Não Cumulatividade do ICMS',
    fundamento: 'Art. 155, §2º, I, CF',
    fortes: [
      'O art. 155, §2º, I, da Constituição assegura a compensação do ICMS devido em cada operação com o montante cobrado nas anteriores.',
      'O STF reconhece que a apropriação de créditos de ICMS tem suporte direto na técnica constitucional da não cumulatividade.',
      'A não cumulatividade visa evitar que a incidência em cascata onere demasiadamente a cadeia produtiva.',
      'O direito ao abatimento do ICMS constitui direito público subjetivo do contribuinte, oponível ao ente tributante.',
    ],
    medios: [
      'A apropriação dos créditos relativos a operações anteriores preserva a neutralidade econômica do tributo.',
      'A restrição ao creditamento sem previsão constitucional expressa compromete a sistemática não cumulativa.',
      'O direito ao crédito independe de o fornecedor ter efetivamente recolhido o tributo, conforme entendimento consolidado.',
    ],
    fracos: [
      'Qualquer aquisição realizada pela empresa gera direito automático a crédito de ICMS, independente de vínculo com a operação tributada.',
      'A não cumulatividade permite ao contribuinte compensar livremente qualquer tributo pago, não apenas o ICMS das operações anteriores.',
      'O crédito de ICMS pode ser apropriado mesmo sem qualquer documento fiscal que o comprove.',
    ],
  },

  // ──────────────────────────────────────────────────────
  nao_cumulatividade_pc: {
    nome: 'Não Cumulatividade PIS/COFINS',
    fundamento: 'Lei 10.637/2002 e Lei 10.833/2003',
    fortes: [
      'As Leis 10.637/2002 e 10.833/2003 instituíram o regime não cumulativo de PIS e COFINS, com direito a desconto de créditos sobre insumos.',
      'O método indireto subtrativo adotado pela legislação permite ao contribuinte descontar créditos apurados sobre bens e serviços adquiridos.',
      'O §12 do art. 195 da Constituição autoriza a definição legal dos setores sujeitos à sistemática não cumulativa.',
      'A apuração do crédito deve observar os critérios objetivos previstos no art. 3º das Leis 10.637/2002 e 10.833/2003.',
    ],
    medios: [
      'O regime não cumulativo busca evitar a tributação em cascata sobre a cadeia produtiva das contribuições sociais.',
      'A restrição ao creditamento deve ter amparo expresso na legislação de regência das contribuições.',
      'A neutralidade tributária é finalidade que orienta a interpretação do regime não cumulativo.',
    ],
    fracos: [
      'Qualquer despesa da empresa gera direito a crédito de PIS/COFINS, independente de previsão nas Leis 10.637/2002 e 10.833/2003.',
      'O regime não cumulativo de PIS/COFINS funciona de forma idêntica ao do ICMS, com crédito físico destacado em nota fiscal.',
      'O contribuinte pode optar livremente por aplicar o regime cumulativo quando lhe for mais vantajoso, independente de sua atividade.',
    ],
  },

  // ──────────────────────────────────────────────────────
  creditamento_insumos: {
    nome: 'Creditamento de Insumos',
    fundamento: 'Tema 779 STJ (REsp 1.221.170/PR)',
    fortes: [
      'O STJ, no Tema 779 (REsp 1.221.170/PR), fixou que o conceito de insumo deve ser aferido pelos critérios de essencialidade ou relevância.',
      'É ilegal a disciplina restritiva de creditamento prevista nas Instruções Normativas SRF 247/2002 e 404/2004, por comprometer a não cumulatividade.',
      'O critério da essencialidade considera o item do qual a produção depende intrinsecamente, pelo teste da subtração.',
      'O critério da relevância considera a importância do item na cadeia produtiva, ainda que não fisicamente indispensável.',
      'Despesas com segurança do trabalho e controles sanitários obrigatórios podem ser consideradas insumo, conforme entendimento consolidado.',
    ],
    medios: [
      'O item adquirido possui vínculo direto e comprovado com a atividade econômica desenvolvida pela empresa.',
      'A produção ou prestação do serviço seria inviável ou substancialmente comprometida sem a utilização do item analisado.',
      'A documentação acostada demonstra relação econômica relevante entre o insumo e a atividade-fim da empresa.',
    ],
    fracos: [
      'Toda despesa registrada na contabilidade da empresa gera direito a crédito como insumo, independente de vínculo com a produção.',
      'Qualquer gasto operacional, ainda que administrativo geral, deve ser considerado insumo para fins de creditamento.',
      'O contribuinte pode definir unilateralmente o que considera insumo, sem necessidade de demonstrar essencialidade ou relevância.',
    ],
  },

  // ──────────────────────────────────────────────────────
  exclusao_iss_base: {
    nome: 'Exclusão do ISS da Base PIS/COFINS',
    fundamento: 'Tema 118 STF (RE 592.616)',
    fortes: [
      'O ISS, assim como o ICMS no Tema 69, não constitui receita própria do contribuinte, mas mero ingresso transitório destinado ao município.',
      'O raciocínio fixado pelo STF no Tema 69 aplica-se por analogia à exclusão do ISS da base de cálculo do PIS/COFINS, conforme decisões dos TRFs.',
      'O valor do ISS é repassado integralmente ao ente municipal, não se enquadrando no conceito constitucional de faturamento.',
      'A discussão está afetada ao STF como Tema 118 (RE 592.616), com entendimento majoritariamente favorável aos contribuintes nos TRFs.',
    ],
    medios: [
      'A natureza do ISS como imposto indireto, que apenas transita pela contabilidade da empresa, recomenda sua exclusão da base.',
      'A coerência com o entendimento já fixado para o ICMS sustenta a aplicação do mesmo raciocínio ao ISS.',
      'A inclusão do ISS na base de cálculo das contribuições amplia indevidamente a carga tributária sobre o setor de serviços.',
    ],
    fracos: [
      'A exclusão do ISS já está definitivamente pacificada pelo STF, sem qualquer ressalva de modulação de efeitos.',
      'Qualquer imposto municipal deve ser automaticamente excluído de toda base de cálculo federal, independente de tese específica.',
      'A simples existência de decisões favoráveis em segunda instância garante o direito independentemente de ação judicial própria.',
    ],
  },

  // ──────────────────────────────────────────────────────
  exclusao_icmsst_base: {
    nome: 'Exclusão do ICMS-ST da Base PIS/COFINS',
    fundamento: 'Tema 1125 STJ',
    fortes: [
      'O STJ, no Tema 1125, firmou que o ICMS-ST não compõe a base de cálculo das contribuições devidas pelo contribuinte substituído.',
      'A modulação de efeitos do Tema 1125 preserva o direito a partir de 15/03/2017, mesma data do Tema 69 do STF.',
      'O substituído tributário arca de fato com o ônus financeiro do ICMS-ST, que apenas transita por sua fatura sem constituir receita própria.',
      'O raciocínio aplicado ao ICMS regular no Tema 69 foi estendido ao ICMS-ST pelo STJ, por identidade de fundamento.',
    ],
    medios: [
      'A sistemática de substituição tributária não altera a natureza não receitual do valor do imposto repassado.',
      'A coerência entre os regimes de ICMS normal e ICMS-ST recomenda tratamento tributário equivalente para fins de PIS/COFINS.',
      'O contribuinte substituído não deve suportar tributação sobre valor que não integra seu faturamento próprio.',
    ],
    fracos: [
      'Qualquer empresa da cadeia de substituição tributária tem direito automático à exclusão, independente de ser o substituído final.',
      'A exclusão do ICMS-ST vale para todo o período anterior a 2017 sem qualquer limitação de modulação.',
      'O ICMS-ST nunca pode compor nenhuma base de cálculo de tributo federal, em qualquer hipótese.',
    ],
  },

  // ──────────────────────────────────────────────────────
  compensacao_tributaria: {
    nome: 'Compensação Tributária',
    fundamento: 'Art. 74 Lei 9.430/96',
    fortes: [
      'O art. 74 da Lei 9.430/1996 autoriza a compensação de créditos tributários reconhecidos administrativa ou judicialmente.',
      'O STF, na ADI 4.905, declarou inconstitucional a multa isolada por mera negativa de homologação de compensação tributária.',
      'O Tema 736 do STF (RE 796.939) reafirma a inconstitucionalidade da penalização do contribuinte pela simples não homologação.',
      'A compensação devidamente declarada e amparada em crédito líquido e certo extingue o débito tributário correspondente.',
    ],
    medios: [
      'O crédito utilizado na compensação está devidamente demonstrado por documentação idônea.',
      'A compensação tributária promove eficiência na gestão fiscal, reduzindo litigiosidade administrativa.',
      'A boa-fé do contribuinte na declaração de compensação deve ser considerada na análise do caso.',
    ],
    fracos: [
      'Qualquer crédito alegado pelo contribuinte pode ser compensado de imediato, independente de homologação ou comprovação.',
      'A compensação tributária independe totalmente de procedimento administrativo, bastando a declaração unilateral.',
      'O contribuinte pode escolher livremente quais tributos compensar, mesmo sem relação de mesma espécie.',
    ],
  },

  // ──────────────────────────────────────────────────────
  resp_tributaria_indevida: {
    nome: 'Responsabilidade Tributária Indevida',
    fundamento: 'Súmula 430 STJ',
    fortes: [
      'A Súmula 430 do STJ estabelece que o inadimplemento da obrigação tributária pela sociedade não gera, por si só, responsabilidade do sócio-gerente.',
      'O redirecionamento da execução fiscal exige comprovação de que o sócio agiu com excesso de poderes ou infração à lei, contrato ou estatuto.',
      'O mero inadimplemento tributário não caracteriza a conduta dolosa exigida pelo art. 135, III, do CTN para responsabilização pessoal.',
      'O STJ exige elementos concretos de fraude ou confusão patrimonial para o redirecionamento da cobrança ao responsável solidário.',
    ],
    medios: [
      'A dificuldade financeira da empresa, por si só, não evidencia conduta irregular do administrador.',
      'A ausência de comprovação de ato ilícito específico enfraquece a pretensão de responsabilização pessoal.',
      'A interpretação restritiva da responsabilidade de terceiros é exigência do sistema tributário.',
    ],
    fracos: [
      'Qualquer sócio de empresa inadimplente é automaticamente responsável pelos débitos tributários, independente de comprovação de irregularidade.',
      'A simples participação no quadro societário já basta para redirecionar a execução fiscal a qualquer sócio.',
      'O inadimplemento do tributo por si só já presume fraude do administrador, dispensando prova específica.',
    ],
  },

  // ──────────────────────────────────────────────────────
  grupo_economico_trib: {
    nome: 'Inexistência de Grupo Econômico',
    fundamento: 'Art. 124, I, CTN',
    fortes: [
      'A responsabilidade solidária por grupo econômico exige a comprovação de que as empresas conjuntamente realizaram o fato gerador, conforme art. 124, I, CTN.',
      'O simples fato de empresas integrarem o mesmo grupo econômico não as torna automaticamente responsáveis pelos débitos da empresa devedora.',
      'A jurisprudência exige confusão patrimonial e conduta fraudulenta entre as empresas para reconhecer o grupo econômico de fato.',
      'A separação societária formal deve ser respeitada salvo demonstração concreta de abuso da personalidade jurídica.',
    ],
    medios: [
      'As empresas mantêm contabilidade, administração e patrimônio distintos, o que afasta a caracterização de grupo de fato.',
      'A ausência de prova de atuação conjunta no fato gerador específico enfraquece a responsabilização solidária.',
      'A autonomia patrimonial das pessoas jurídicas deve ser preservada na ausência de elementos concretos de confusão.',
    ],
    fracos: [
      'Qualquer empresa com sócios em comum já caracteriza grupo econômico automático para fins de responsabilidade tributária.',
      'A simples existência de mesmo endereço ou ramo de atividade já basta para presumir grupo econômico de fato.',
      'O grupo econômico pode ser presumido pelo Fisco sem necessidade de qualquer comprovação documental.',
    ],
  },

  // ──────────────────────────────────────────────────────
  subst_tributaria_indevida: {
    nome: 'Substituição Tributária Indevida',
    fundamento: 'Art. 150, §7º, CF',
    fortes: [
      'O art. 150, §7º, da Constituição autoriza a substituição tributária progressiva, mas assegura a restituição quando o fato gerador presumido não se realiza.',
      'A base de cálculo presumida da substituição tributária é provisória, sujeita a ajuste conforme a operação efetivamente realizada.',
      'O STF, no Tema 201, fixou que é devida a restituição quando a base de cálculo efetiva for inferior à presumida.',
      'A exigência de complementação do imposto quando a base efetiva for superior à presumida decorre do mesmo fundamento constitucional.',
    ],
    medios: [
      'A sistemática de substituição tributária deve refletir, na medida do possível, a operação econômica efetivamente realizada.',
      'O ajuste entre valor presumido e valor real é mecanismo de equilíbrio inerente à substituição tributária progressiva.',
      'A divergência entre a base presumida e a realidade da operação deve ser corrigida em favor de quem suportou o excesso.',
    ],
    fracos: [
      'A substituição tributária é sempre ilegal, independente de previsão constitucional expressa que a autorize.',
      'O contribuinte substituído pode ignorar a base presumida e recolher o valor que considerar correto.',
      'Qualquer diferença entre valores, ainda que mínima, gera direito automático e irrestrito à restituição sem comprovação documental.',
    ],
  },

  // ──────────────────────────────────────────────────────
  restituicao_icmsst: {
    nome: 'Restituição de ICMS-ST',
    fundamento: 'Tema 201 STF (RE 593.849)',
    fortes: [
      'O STF, no Tema 201 (RE 593.849), fixou que é devida a restituição da diferença de ICMS pago a mais na substituição tributária para frente.',
      'A restituição é devida sempre que a base de cálculo efetiva da operação for inferior à presumida, conforme tese de repercussão geral.',
      'O direito à restituição decorre diretamente do art. 150, §7º, da Constituição, que assegura devolução do excesso pago.',
      'A garantia de restituição não inviabiliza a sistemática da substituição tributária progressiva, conforme reconhecido pelo próprio STF.',
    ],
    medios: [
      'A diferença entre o valor presumido e o valor real da operação foi comprovada por documentação fiscal idônea.',
      'A restituição do excesso pago promove justiça fiscal na sistemática de substituição tributária.',
      'A modulação dos efeitos da decisão deve ser considerada na análise do período de cobertura do direito.',
    ],
    fracos: [
      'Toda operação sujeita à substituição tributária gera direito automático a restituição, independente de comprovação de diferença.',
      'O contribuinte pode estimar livremente o valor a restituir sem apresentar documentação que comprove a base efetiva.',
      'A restituição de ICMS-ST independe totalmente de qualquer comprovação documental da operação realizada.',
    ],
  },

  // ──────────────────────────────────────────────────────
  denuncia_espontanea: {
    nome: 'Denúncia Espontânea',
    fundamento: 'Art. 138 CTN',
    fortes: [
      'O art. 138 do CTN exclui a responsabilidade por multa quando há denúncia espontânea da infração antes de qualquer ação fiscal.',
      'O pagamento integral do tributo devido, acompanhado dos juros de mora, antes de qualquer procedimento fiscal, configura denúncia espontânea válida.',
      'A denúncia espontânea afasta tanto a multa punitiva quanto a multa moratória, mantendo-se devido apenas o tributo e os juros.',
      'Não se considera espontânea a denúncia apresentada após o início de procedimento fiscal relacionado à infração, conforme parágrafo único do art. 138.',
    ],
    medios: [
      'A iniciativa do contribuinte em regularizar a situação antes de qualquer ação do Fisco demonstra boa-fé relevante.',
      'O reconhecimento voluntário do débito, seguido do pagamento integral, atende à finalidade do instituto.',
      'A regularização espontânea contribui para a eficiência da arrecadação sem necessidade de atuação fiscal coercitiva.',
    ],
    fracos: [
      'A denúncia espontânea se aplica a qualquer tributo, inclusive aos sujeitos a lançamento por homologação regularmente declarados e pagos a destempo.',
      'Basta o contribuinte alegar boa-fé para ter reconhecida a denúncia espontânea, independente do momento do pagamento.',
      'O parcelamento do débito equivale à denúncia espontânea para todos os efeitos legais.',
    ],
  },

  // ──────────────────────────────────────────────────────
  retroatividade_benigna: {
    nome: 'Retroatividade Benigna',
    fundamento: 'Art. 106, II, "c", CTN',
    fortes: [
      'O art. 106, II, "c", do CTN admite a retroatividade da lei tributária mais benéfica em casos ainda não definitivamente julgados.',
      'A posterior alteração do valor da multa, quando mais benéfica ao contribuinte, deve retroagir, conforme entendimento consolidado do STJ.',
      'A multa moratória possui natureza de penalidade administrativa, conforme Súmula 565 do STF, justificando a retroatividade benéfica.',
      'A retroatividade alcança apenas a parcela punitiva da exigência, não afetando o tributo principal nem os juros de mora.',
    ],
    medios: [
      'A redução legislativa do percentual da multa aplicável reflete reavaliação da proporcionalidade da penalidade.',
      'O caso ainda não transitou definitivamente em julgado, permitindo a aplicação da norma mais favorável.',
      'A segurança jurídica é compatível com a aplicação retroativa de norma sancionatória mais benéfica.',
    ],
    fracos: [
      'A retroatividade benigna se aplica mesmo a casos já definitivamente julgados e com pagamento já realizado.',
      'Qualquer alteração legislativa, mesmo que apenas processual, deve retroagir em favor do contribuinte.',
      'A retroatividade benéfica permite ao contribuinte deixar de pagar integralmente o tributo principal, não apenas a multa.',
    ],
  },

  // ──────────────────────────────────────────────────────
  seguranca_juridica: {
    nome: 'Segurança Jurídica e Proteção da Confiança',
    fundamento: 'Princípio Constitucional Implícito',
    fortes: [
      'O princípio da segurança jurídica, decorrente do Estado de Direito, exige estabilidade e previsibilidade nas relações jurídico-tributárias.',
      'A proteção da confiança legítima impede que o contribuinte seja surpreendido por mudança abrupta de entendimento fiscal já consolidado.',
      'A modulação de efeitos em julgamentos tributários relevantes é instrumento que concretiza a segurança jurídica do sistema.',
      'A jurisprudência dos tribunais superiores reconhece a necessidade de resguardar situações já consolidadas sob entendimento anterior.',
    ],
    medios: [
      'A previsibilidade das normas tributárias é elemento essencial para o planejamento da atividade econômica do contribuinte.',
      'A alteração de entendimento administrativo sem aviso prévio compromete a confiança depositada pelo contribuinte.',
      'A estabilidade das relações jurídicas consolidadas há longo período deve ser considerada na análise do caso.',
    ],
    fracos: [
      'A segurança jurídica impede qualquer mudança de entendimento fiscal, ainda que a posição anterior fosse equivocada.',
      'O contribuinte pode invocar segurança jurídica para descumprir qualquer norma tributária que considere inconveniente.',
      'Qualquer prazo ou exigência processual pode ser relativizado em nome da segurança jurídica, independente de previsão legal.',
    ],
  },

};

const BANCO = {

  tributario: {
    polo_ativo: ['Contribuinte PF', 'Contribuinte PJ'],
    polo_passivo: ['União', 'Estado do RJ', 'Município do Rio de Janeiro'],
    competencia: ['Justiça Federal', 'Justiça Estadual', 'CARF'],

    // ── TRIBUTOS — cada um já amarra o ENTE competente (réu) e se aplica
    // a PF, PJ ou ambos. `peso` controla frequência relativa dentro do
    // perfil de empresa (varejo/serviço/indústria); tributos sem peso
    // explícito caem no pool "outros" (≤10% de chance total).
    tributos: {
      icms:        { nome:'ICMS',        ente:'Estado do RJ',                      pf:false, pj:true },
      ipva:        { nome:'IPVA',        ente:'Estado do RJ',                      pf:true,  pj:true },
      itcmd:       { nome:'ITCMD',       ente:'Estado do RJ',                      pf:true,  pj:false },
      iss:         { nome:'ISS',         ente:'Município do Rio de Janeiro',       pf:false, pj:true },
      itbi:        { nome:'ITBI',        ente:'Município do Rio de Janeiro',       pf:true,  pj:true },
      irpf:        { nome:'IRPF',        ente:'União',                             pf:true,  pj:false },
      irpj:        { nome:'IRPJ',        ente:'União',                             pf:false, pj:true },
      pis_cofins:  { nome:'PIS/COFINS',  ente:'União',                             pf:false, pj:true },
      csll:        { nome:'CSLL',        ente:'União',                             pf:false, pj:true },
      iof:         { nome:'IOF',         ente:'União',                             pf:false, pj:true },
      ipi:         { nome:'IPI',         ente:'União',                             pf:false, pj:true },
    },

    // ── PERFIS DE EMPRESA (só usados quando o contribuinte é PJ) — cada
    // perfil tem seus tributos "do dia a dia" com alta frequência. Os
    // demais tributos PJ não listados aqui entram no pool "outros".
    perfis_empresa: {
      varejo:    { label:'Comércio/Varejo',  tributos_comuns:['icms','irpj','pis_cofins'] },
      servico:   { label:'Prestação de Serviços', tributos_comuns:['iss','irpj','pis_cofins'] },
      industria: { label:'Indústria',        tributos_comuns:['ipi','irpj','pis_cofins'] },
    },

    // ── CONFLITOS — `fisco_e_autor:true` marca os casos em que é o ENTE
    // TRIBUTANTE (Fisco/Estado/Município/União) quem move a ação, com o
    // contribuinte na defesa. Só Execução Fiscal tem essa inversão: é o
    // Fisco que executa o contribuinte. Embargos e Exceção de Pré-
    // Executividade são peças que o CONTRIBUINTE ajuíza (mesmo sendo
    // incidentais a uma execução em curso), então nelas o contribuinte
    // continua sendo tratado como autor da peça.
    conflitos: [
      { id:'execucao_fiscal', nome:'Execução Fiscal', requer_fatos:['divida_inscrita'], fisco_e_autor:true },
      { id:'embargos_execucao', nome:'Embargos à Execução', requer_fatos:['divida_inscrita','execucao_em_curso'] },
      { id:'excecao_pre_executividade', nome:'Exceção de Pré-Executividade', requer_fatos:['divida_inscrita','vicio_formal'] },
      { id:'repeticao_indebito', nome:'Repetição de Indébito', requer_fatos:['pagamento_indevido'] },
      { id:'auto_infracao', nome:'Impugnação de Auto de Infração', requer_fatos:['auto_infracao_lavrado'] },
      { id:'mandado_seguranca', nome:'Mandado de Segurança Tributário', requer_fatos:['ato_iminente_ou_praticado'] },
      { id:'compensacao', nome:'Compensação Tributária', requer_fatos:['credito_tributario_existente'] },
      { id:'exclusao_base_calculo', nome:'Exclusão de Base de Cálculo', requer_fatos:['tributo_calculado_incorretamente'] },
      { id:'restituicao', nome:'Ação de Restituição', requer_fatos:['pagamento_indevido'] },
      { id:'imunidade', nome:'Reconhecimento de Imunidade Tributária', requer_fatos:['atividade_imune'] },
    ],

    // ── FATOS — cada um marcado quanto a quem pode vivenciá-lo. Fatos que só
    // fazem sentido entre empresas (grupo econômico, substituição tributária,
    // créditos de insumo, denúncia espontânea de obrigação acessória) são
    // pf:false. Os demais (prazo, dívida inscrita, vício formal, etc.) valem
    // para os dois, porque são situações processuais genéricas.
    fatos_possiveis: [
      { id:'divida_inscrita',                pf:true,  pj:true },
      { id:'execucao_em_curso',              pf:true,  pj:true },
      { id:'vicio_formal',                   pf:true,  pj:true },
      { id:'pagamento_indevido',              pf:true,  pj:true },
      { id:'auto_infracao_lavrado',          pf:true,  pj:true },
      { id:'ato_iminente_ou_praticado',      pf:true,  pj:true },
      { id:'credito_tributario_existente',   pf:false, pj:true },  // compensação tributária — operação tipicamente empresarial
      { id:'tributo_calculado_incorretamente', pf:false, pj:true }, // base de cálculo de ICMS/PIS-COFINS/ISS — não se aplica a IRPF de PF
      { id:'atividade_imune',                pf:false, pj:true },  // imunidade tributária é tipicamente de entidade/instituição
      { id:'processo_paralisado_5anos',      pf:true,  pj:true },
      { id:'notificacao_recebida',           pf:true,  pj:true },
      { id:'prazo_decadencial_vencido',      pf:true,  pj:true },
      { id:'parcelamento_ativo',             pf:true,  pj:true },
      { id:'denuncia_espontanea_feita',      pf:false, pj:true },  // regularização de obrigação acessória — contexto empresarial
      { id:'grupo_economico_alegado',        pf:false, pj:true },  // só existe entre empresas
      { id:'substituicao_tributaria_aplicada', pf:false, pj:true }, // ICMS-ST — cadeia de circulação de mercadorias (PJ)
      { id:'icms_st_recolhido',              pf:false, pj:true },
      { id:'creditos_insumo_glosados',       pf:false, pj:true },  // crédito de insumo é conceito de não-cumulatividade (PJ)
      { id:'responsabilidade_terceiro_imputada', pf:true, pj:true },
      { id:'lei_alterada_posteriormente',    pf:true,  pj:true },
      { id:'confisco_alegado',               pf:true,  pj:true },
      { id:'isencao_legal_existente',        pf:true,  pj:true },
    ],

    // ── TESES — cada item aqui só guarda o ID (chave em
    // TESES_TRIBUTARIO_EXPANDIDO) e o requer_fatos (lógica de elegibilidade).
    // Nome, fundamento e os argumentos forte/médio/fraco vêm do banco
    // expandido, montado por _hidratarTese() em tempo de geração do processo.
    teses: [
      { id:'tema69_stf', requer_fatos:['tributo_calculado_incorretamente'] },
      { id:'sumula436_stj', requer_fatos:['divida_inscrita'] },
      { id:'prescricao_intercorrente', requer_fatos:['execucao_em_curso','processo_paralisado_5anos'] },
      { id:'nulidade_cda', requer_fatos:['vicio_formal','divida_inscrita'] },
      { id:'nulidade_auto', requer_fatos:['auto_infracao_lavrado','vicio_formal'] },
      { id:'decadencia', requer_fatos:['prazo_decadencial_vencido'] },
      { id:'prescricao', requer_fatos:['divida_inscrita','processo_paralisado_5anos'] },
      { id:'170a_ctn', requer_fatos:['credito_tributario_existente'] },
      { id:'imunidade_tributaria', requer_fatos:['atividade_imune'] },
      { id:'isencao_tributaria', requer_fatos:['isencao_legal_existente'] },
      { id:'bis_in_idem', requer_fatos:['auto_infracao_lavrado'] },
      { id:'confisco_tributario', requer_fatos:['confisco_alegado'] },
      { id:'nao_cumulatividade_icms', requer_fatos:['creditos_insumo_glosados'] },
      { id:'nao_cumulatividade_pc', requer_fatos:['creditos_insumo_glosados'] },
      { id:'creditamento_insumos', requer_fatos:['creditos_insumo_glosados'] },
      { id:'exclusao_iss_base', requer_fatos:['tributo_calculado_incorretamente'] },
      { id:'exclusao_icmsst_base', requer_fatos:['icms_st_recolhido'] },
      { id:'compensacao_tributaria', requer_fatos:['credito_tributario_existente'] },
      { id:'resp_tributaria_indevida', requer_fatos:['responsabilidade_terceiro_imputada'] },
      { id:'grupo_economico_trib', requer_fatos:['grupo_economico_alegado'] },
      { id:'subst_tributaria_indevida', requer_fatos:['substituicao_tributaria_aplicada'] },
      { id:'restituicao_icmsst', requer_fatos:['icms_st_recolhido'] },
      { id:'denuncia_espontanea', requer_fatos:['denuncia_espontanea_feita'] },
      { id:'retroatividade_benigna', requer_fatos:['lei_alterada_posteriormente'] },
      { id:'seguranca_juridica', requer_fatos:[] },
    ],

    // ── PROVAS — cada prova agora é restrita aos CONFLITOS em que faz
    // sentido jurídico aparecer, com base no rito processual real de cada
    // ação (pesquisado e verificado):
    //
    // - Mandado de Segurança exige prova documental PRÉ-CONSTITUÍDA e NÃO
    //   ADMITE dilação probatória nem perícia (rito sumário, cognição sem
    //   instrução) — por isso nunca recebe provas tipo:'pericial', e só
    //   aceita documentos que já existiam ANTES do ajuizamento.
    // - Execução Fiscal/Embargos/Exceção de Pré-Executividade têm rito
    //   mais aberto (CDA é o título central; perícia cabe nos embargos,
    //   mas raramente na exceção, que não admite dilação probatória).
    // - Impugnação de Auto de Infração (PAF) admite provas documentais e
    //   periciais, conforme art. citado na pesquisa (diligências/perícia
    //   no processo administrativo fiscal).
    // - Repetição de Indébito/Restituição/Compensação dependem de prova
    //   do pagamento indevido — DARF, extrato, PERDCOMP são centrais.
    //
    // `conflitos_compativeis` ausente = compatível com todos (fallback).
    provas: [
      { id:'auto_infracao_doc', nome:'Auto de Infração', tipo:'documental', forca:80, requer_fatos:['auto_infracao_lavrado'],
        conflitos_compativeis:['auto_infracao','embargos_execucao','excecao_pre_executividade'] },
      { id:'cda', nome:'Certidão de Dívida Ativa (CDA)', tipo:'documental', forca:75, requer_fatos:['divida_inscrita'],
        conflitos_compativeis:['execucao_fiscal','embargos_execucao','excecao_pre_executividade'] },
      { id:'notificacao_lancamento', nome:'Notificação de Lançamento', tipo:'documental', forca:72, requer_fatos:['notificacao_recebida'],
        conflitos_compativeis:['auto_infracao','mandado_seguranca','excecao_pre_executividade','imunidade'] },
      { id:'darf', nome:'Comprovante DARF', tipo:'documental', forca:85, requer_fatos:['pagamento_indevido'],
        conflitos_compativeis:['repeticao_indebito','restituicao','compensacao','mandado_seguranca'] },
      { id:'perdcomp', nome:'PERDCOMP', tipo:'documental', forca:82, requer_fatos:['credito_tributario_existente','pagamento_indevido'],
        conflitos_compativeis:['compensacao','repeticao_indebito','restituicao'] },
      { id:'dctf', nome:'DCTF', tipo:'documental', forca:65, requer_fatos:[],
        conflitos_compativeis:['execucao_fiscal','embargos_execucao','excecao_pre_executividade','auto_infracao','decadencia'] },
      { id:'sped_fiscal', nome:'SPED Fiscal', tipo:'contabil', forca:70, requer_fatos:['tributo_calculado_incorretamente'],
        conflitos_compativeis:['exclusao_base_calculo','auto_infracao','embargos_execucao'] },
      { id:'sped_contribuicoes', nome:'SPED Contribuições', tipo:'contabil', forca:68, requer_fatos:['creditos_insumo_glosados'],
        conflitos_compativeis:['exclusao_base_calculo','compensacao','auto_infracao'] },
      { id:'ecd', nome:'ECD — Escrituração Contábil Digital', tipo:'contabil', forca:60, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao','compensacao','imunidade'] },
      { id:'ecf', nome:'ECF — Escrituração Contábil Fiscal', tipo:'contabil', forca:62, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao','compensacao','imunidade'] },
      { id:'livro_razao', nome:'Livro Razão', tipo:'contabil', forca:55, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao'] },
      { id:'livro_diario', nome:'Livro Diário', tipo:'contabil', forca:55, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao'] },
      { id:'balancete', nome:'Balancete Contábil', tipo:'contabil', forca:58, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao'] },
      // Provas PERICIAIS: NUNCA disponíveis em Mandado de Segurança (rito
      // sumário sem dilação probatória) nem em Exceção de Pré-Executividade
      // (também sem dilação) — só onde cabe instrução de fato (Embargos,
      // Impugnação de Auto de Infração no PAF).
      { id:'laudo_contabil', nome:'Laudo Contábil Pericial', tipo:'pericial', forca:75, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao'] },
      { id:'parecer_fiscal', nome:'Parecer Fiscal Técnico', tipo:'pericial', forca:60, requer_fatos:[],
        conflitos_compativeis:['embargos_execucao','auto_infracao'] },
      { id:'extrato_bancario_t', nome:'Extrato Bancário', tipo:'documental', forca:70, requer_fatos:['pagamento_indevido'],
        conflitos_compativeis:['repeticao_indebito','restituicao','mandado_seguranca','compensacao'] },
      { id:'declaracao_fiscal', nome:'Declaração Fiscal Retificadora', tipo:'documental', forca:65, requer_fatos:['denuncia_espontanea_feita'],
        conflitos_compativeis:['auto_infracao','embargos_execucao'] },
    ],

    eventos: [
      { id:'penhora_online', nome:'Penhora Online', efeito:'pressao_acordo', delta:-6, requer_fatos:['divida_inscrita'], desc:'O juízo determinou bloqueio de valores via sistema bancário. A pressão por acordo aumenta.' },
      { id:'bloqueio_sisbajud', nome:'Bloqueio SISBAJUD', efeito:'pressao_acordo', delta:-7, requer_fatos:['execucao_em_curso'], desc:'Bloqueio judicial de contas via SISBAJUD foi efetivado.' },
      { id:'exclusao_refis', nome:'Exclusão do REFIS', efeito:'prejudica_boa_fe', delta:-9, requer_fatos:['parcelamento_ativo'], desc:'O contribuinte foi excluído do parcelamento por inadimplência.' },
      { id:'mudanca_stf', nome:'Mudança Jurisprudencial STF', efeito:'depende_tese', delta:0, requer_fatos:[], desc:'O STF alterou recentemente seu entendimento sobre tema correlato.' },
      { id:'pgfn_favoravel', nome:'Parecer PGFN Favorável', efeito:'beneficia_autor', delta:10, requer_fatos:[], desc:'A PGFN emitiu parecer reconhecendo o direito do contribuinte.' },
      { id:'pgfn_desfavoravel', nome:'Parecer PGFN Desfavorável', efeito:'prejudica_autor', delta:-8, requer_fatos:[], desc:'A PGFN reafirmou a posição fiscal.' },
      { id:'penhora_faturamento', nome:'Penhora de Faturamento', efeito:'pressao_acordo', delta:-8, requer_fatos:['execucao_em_curso'], desc:'Penhora sobre o faturamento foi deferida.' },
      { id:'repetitivo_favoravel', nome:'Decisão Favorável em Recurso Repetitivo', efeito:'beneficia_autor', delta:12, requer_fatos:[], desc:'Tribunal Superior decidiu repetitivo favoravelmente.' },
      { id:'tema_repetitivo_t', nome:'Afetação a Tema Repetitivo', efeito:'depende_tese', delta:0, requer_fatos:[], desc:'O caso foi afetado como representativo de controvérsia repetitiva — o julgamento pode ser suspenso.' },
      { id:'modulacao_efeitos_t', nome:'Modulação de Efeitos', efeito:'prejudica_autor', delta:-5, requer_fatos:[], desc:'O tribunal modulou os efeitos da decisão, limitando o alcance temporal do benefício.' },
    ],
  },

  trabalhista: {
    polo_ativo: ['Operador de Caixa', 'Motorista', 'Vendedor', 'Gerente', 'Analista'],
    polo_passivo: ['Supermercado', 'Transportadora', 'Banco', 'Indústria', 'Comércio'],
    competencia: ['Vara do Trabalho', 'TRT-1', 'TST'],

    conflitos: [
      { id:'horas_extras', nome:'Horas Extras', requer_fatos:['jornada_excedida'] },
      { id:'justa_causa', nome:'Reversão de Justa Causa', requer_fatos:['demissao_justa_causa'] },
      { id:'acidente_trabalho', nome:'Indenização por Acidente de Trabalho', requer_fatos:['acidente_ocorrido'] },
      { id:'verbas_rescisorias', nome:'Verbas Rescisórias não Pagas', requer_fatos:['rescisao_sem_pagamento'] },
      { id:'assedio_moral', nome:'Indenização por Assédio Moral', requer_fatos:['conduta_abusiva_chefia'] },
      { id:'equiparacao_salarial', nome:'Equiparação Salarial', requer_fatos:['colega_funcao_igual_salario_maior'] },
      { id:'reconhecimento_vinculo', nome:'Reconhecimento de Vínculo Empregatício', requer_fatos:['prestacao_servico_sem_registro'] },
      { id:'desvio_funcao', nome:'Desvio de Função', requer_fatos:['funcao_diferente_contratada'] },
    ],

    fatos_possiveis: [
      'jornada_excedida','demissao_justa_causa','acidente_ocorrido','rescisao_sem_pagamento',
      'conduta_abusiva_chefia','colega_funcao_igual_salario_maior','prestacao_servico_sem_registro',
      'funcao_diferente_contratada','sem_registro_ponto','testemunha_disponivel','prova_documental_fraca',
    ],

    teses: [
      { id:'sumula338', nome:'Súmula 338 TST — Ônus da Prova de Horas Extras', fundamento:'Súmula 338 TST', requer_fatos:['jornada_excedida'] },
      { id:'sumula212', nome:'Súmula 212 TST — Ônus da Prova de Dispensa', fundamento:'Súmula 212 TST', requer_fatos:['demissao_justa_causa'] },
      { id:'art483_clt', nome:'Rescisão Indireta', fundamento:'Art. 483 CLT', requer_fatos:['conduta_abusiva_chefia'] },
      { id:'art482_clt_nulidade', nome:'Nulidade da Justa Causa', fundamento:'Art. 482 CLT', requer_fatos:['demissao_justa_causa'] },
      { id:'equiparacao', nome:'Equiparação Salarial', fundamento:'Art. 461 CLT', requer_fatos:['colega_funcao_igual_salario_maior'] },
      { id:'vinculo_empregaticio', nome:'Reconhecimento de Vínculo', fundamento:'Art. 3º CLT', requer_fatos:['prestacao_servico_sem_registro'] },
      { id:'dano_existencial', nome:'Dano Existencial', fundamento:'Construção Doutrinária TST', requer_fatos:['jornada_excedida'] },
      { id:'principio_protecao', nome:'Princípio da Proteção ao Trabalhador', fundamento:'Princípio Geral do Direito do Trabalho', requer_fatos:[] },
      { id:'desvio_funcao_tese', nome:'Desvio de Função', fundamento:'Art. 456, parágrafo único, CLT', requer_fatos:['funcao_diferente_contratada'] },
    ],

    provas: [
      { id:'controle_ponto', nome:'Controle de Ponto', tipo:'documental', forca:80, requer_fatos:['jornada_excedida'] },
      { id:'contracheques', nome:'Contracheques', tipo:'documental', forca:70, requer_fatos:[] },
      { id:'testemunhas_t', nome:'Depoimento de Testemunhas', tipo:'testemunhal', forca:55, requer_fatos:['testemunha_disponivel'] },
      { id:'whatsapp', nome:'Mensagens de WhatsApp', tipo:'eletronica', forca:60, requer_fatos:[] },
      { id:'cat', nome:'CAT — Comunicação de Acidente', tipo:'documental', forca:85, requer_fatos:['acidente_ocorrido'] },
      { id:'ppp', nome:'PPP — Perfil Profissiográfico', tipo:'documental', forca:70, requer_fatos:[] },
    ],

    eventos: [
      { id:'revelia', nome:'Revelia do Empregador', efeito:'beneficia_autor', delta:15, requer_fatos:[], desc:'O empregador não compareceu à audiência. Presunção de veracidade dos fatos alegados pelo reclamante.' },
      { id:'pericia_medica_t', nome:'Perícia Médica', efeito:'depende_resultado', delta:0, requer_fatos:['acidente_ocorrido'], desc:'Perícia médica foi designada para apurar nexo causal do acidente.' },
      { id:'testemunha_contraditoria', nome:'Testemunha Contraditória', efeito:'prejudica_quem_arrolou', delta:-8, requer_fatos:['testemunha_disponivel'], desc:'A testemunha apresentou versão que contradiz parcialmente os fatos narrados na inicial.' },
      { id:'fiscalizacao_mpt', nome:'Fiscalização do MPT', efeito:'beneficia_autor', delta:9, requer_fatos:[], desc:'O Ministério Público do Trabalho abriu inquérito civil sobre práticas similares na empresa ré.' },
    ],
  },

  consumidor: {
    // Cível: PF e PJ podem ocupar qualquer polo (ex: empresa cobrando
    // indevidamente outra empresa, ou pessoa física vs banco). O sorteio
    // de nome (PF/PJ) é resolvido em gerarTextoLocal a partir do tipo aqui.
    polo_ativo: ['Pessoa Física', 'Pessoa Física', 'Pessoa Física', 'Empresa PJ'],
    polo_passivo: ['Banco', 'Companhia Aérea', 'Operadora de Saúde', 'Loja Virtual', 'Telecom', 'Empresa PJ'],
    competencia: ['Juizado Especial Civil', 'Justiça Comum'],
    // Usado quando meuLado === 'reu': tribunal mais exigente/conservador.
    competencia_dificil: ['Justiça Comum', 'Câmara Cível do TJ'],
    lado_variavel: true,

    conflitos: [
      { id:'cobranca_indevida', nome:'Cobrança Indevida', requer_fatos:['cobranca_sem_contrato'] },
      { id:'negativacao', nome:'Negativação Indevida', requer_fatos:['nome_negativado_sem_divida'] },
      { id:'produto_defeituoso', nome:'Produto com Vício', requer_fatos:['produto_com_defeito'] },
      { id:'golpe_bancario', nome:'Indenização por Fraude Bancária', requer_fatos:['transacao_nao_reconhecida'] },
      { id:'plano_saude_negativa', nome:'Negativa de Cobertura — Plano de Saúde', requer_fatos:['procedimento_negado'] },
      { id:'overbooking', nome:'Indenização por Overbooking/Cancelamento', requer_fatos:['voo_cancelado_ou_atrasado'] },
      { id:'vazamento_dados', nome:'Indenização por Vazamento de Dados', requer_fatos:['dados_pessoais_expostos'] },
    ],

    fatos_possiveis: [
      'cobranca_sem_contrato','nome_negativado_sem_divida','produto_com_defeito',
      'transacao_nao_reconhecida','procedimento_negado','voo_cancelado_ou_atrasado',
      'dados_pessoais_expostos','tentativa_solucao_extrajudicial','reclamacao_protocolada',
    ],

    teses: [
      { id:'cdc_art14', nome:'Responsabilidade Objetiva do Fornecedor', fundamento:'CDC Art. 14', requer_fatos:[] },
      { id:'sumula479', nome:'Responsabilidade do Banco por Fraude', fundamento:'Súmula 479 STJ', requer_fatos:['transacao_nao_reconhecida'] },
      { id:'inversao_onus', nome:'Inversão do Ônus da Prova', fundamento:'CDC Art. 6º, VIII', requer_fatos:[] },
      { id:'dano_moral_in_re_ipsa', nome:'Dano Moral In Re Ipsa', fundamento:'Construção Jurisprudencial STJ', requer_fatos:['nome_negativado_sem_divida'] },
      { id:'cdc_art51', nome:'Nulidade de Cláusula Abusiva', fundamento:'CDC Art. 51', requer_fatos:['procedimento_negado'] },
    ],

    provas: [
      { id:'extrato_bancario_c', nome:'Extrato Bancário', tipo:'documental', forca:80, requer_fatos:['transacao_nao_reconhecida'] },
      { id:'protocolo_sac', nome:'Protocolo de Atendimento SAC', tipo:'documental', forca:60, requer_fatos:['tentativa_solucao_extrajudicial'] },
      { id:'print_tela', nome:'Print de Tela/Conversa', tipo:'eletronica', forca:55, requer_fatos:[] },
      { id:'contrato_adesao', nome:'Contrato de Adesão', tipo:'documental', forca:65, requer_fatos:[] },
      { id:'boletim_ocorrencia', nome:'Boletim de Ocorrência', tipo:'documental', forca:70, requer_fatos:['transacao_nao_reconhecida'] },
    ],

    eventos: [
      { id:'oferta_acordo', nome:'Oferta de Acordo da Ré', efeito:'oferece_acordo', delta:0, requer_fatos:[], desc:'A parte ré apresentou proposta de acordo durante a audiência.' },
      { id:'doc_novo_c', nome:'Documento Novo Trazido pela Ré', efeito:'prejudica_autor', delta:-6, requer_fatos:[], desc:'A defesa juntou documento não previsto, exigindo manifestação imediata.' },
      { id:'cancelamento_liminar', nome:'Cancelamento Imediato por Liminar', efeito:'beneficia_autor', delta:8, requer_fatos:['nome_negativado_sem_divida'], desc:'Liminar já determinou a retirada do nome dos cadastros de inadimplentes.' },
    ],
  },
};
function sortear(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── HIDRATAÇÃO DE TESE — pega a referência leve {id, requer_fatos} e
// monta o objeto completo sorteando 1 argumento de cada nível (forte/
// médio/fraco) do banco TESES_TRIBUTARIO_EXPANDIDO. Isso é o que
// multiplica as combinações possíveis: a mesma tese nunca repete os
// mesmos 3 argumentos entre duas partidas diferentes.
function _hidratarTese(teseRef){
  const dados = TESES_TRIBUTARIO_EXPANDIDO[teseRef.id];
  if (!dados) {
    // Fallback defensivo — não deveria ocorrer com o banco bem mapeado
    return { id: teseRef.id, nome: teseRef.id, fundamento: '—', requer_fatos: teseRef.requer_fatos||[],
      argumentoForte: 'Fundamentação técnica aplicável ao caso.', argumentoMedio: 'Argumento de princípio geral.', argumentoFraco: 'Generalização sem amparo técnico específico.' };
  }
  return {
    id: teseRef.id,
    nome: dados.nome,
    fundamento: dados.fundamento,
    requer_fatos: teseRef.requer_fatos || [],
    argumentoForte: sortear(dados.fortes),
    argumentoMedio: sortear(dados.medios),
    argumentoFraco: sortear(dados.fracos),
  };
}

// Sorteia fatos compatíveis com o tipo de contribuinte (pf/pj). Quando
// `apenasTipo` é omitido, sorteia de todos os fatos da área (comportamento
// usado por áreas sem distinção pf/pj, como trabalhista/consumidor).
function sortearFatos(area, qtd = 3, apenasTipo = null) {
  const banco = BANCO[area];
  const todos = banco.fatos_possiveis;
  // Compatibilidade: se os fatos ainda forem strings simples (áreas sem
  // marcação pf/pj), usa direto. Se forem objetos {id,pf,pj}, filtra e
  // extrai só o id.
  const pool = todos.map(f => typeof f === 'string' ? { id: f, pf: true, pj: true } : f)
    .filter(f => !apenasTipo || f[apenasTipo]);
  const fatos = pool.map(f => f.id);
  const escolhidos = [];
  for (let i = 0; i < qtd && fatos.length > 0; i++) {
    const idx = Math.floor(Math.random() * fatos.length);
    escolhidos.push(fatos.splice(idx, 1)[0]);
  }
  return escolhidos;
}

function temRequisitos(item, fatosAtivos) {
  if (!item.requer_fatos || item.requer_fatos.length === 0) return true;
  return item.requer_fatos.every(f => fatosAtivos.includes(f));
}

// Checa se uma prova é compatível com o CONFLITO específico do processo
// (não apenas com os fatos). Ausência de `conflitos_compativeis` na prova
// significa "compatível com qualquer conflito" (fallback liberal, usado
// por provas genéricas como print de tela, contrato de adesão etc., que
// não têm essa restrição de rito processual).
function provaCompativelComConflito(prova, conflitoId) {
  if (!prova.conflitos_compativeis) return true;
  return prova.conflitos_compativeis.includes(conflitoId);
}

// ════════════════════════════════════════════════════════
// SORTEIO DE TRIBUTO (área tributário) — decide em cadeia:
// 1) PF ou PJ (PJ 60%, PF 40% restrito a tributos pf:true — hoje:
//    IRPF, IPVA, ITBI, ITCMD — IOF e ICMS/ISS/IRPJ/PIS-COFINS/CSLL/IPI
//    são exclusivos de PJ, pois pressupõem empresa)
// 2) Se PJ: perfil de empresa (varejo/serviço/indústria)
// 3) Tributo: 90% dentre os "comuns" do perfil, 10% dentre os "outros"
// 4) Ente réu: sempre derivado do tributo (nunca sorteado solto)
// ════════════════════════════════════════════════════════
function sortearTributo(banco) {
  const tributosTodos = Object.entries(banco.tributos).map(([id, t]) => ({ id, ...t }));

  const ehPJ = Math.random() < 0.60;

  if (!ehPJ) {
    // PF: só tributos com pf:true (hoje: IRPF, IPVA, ITBI, ITCMD)
    const tributosPF = tributosTodos.filter(t => t.pf);
    const tributo = sortear(tributosPF);
    return { ehPJ: false, perfil: null, tributo };
  }

  // PJ: escolhe perfil de empresa, depois tributo dentro/fora dos comuns do perfil
  const perfisIds = Object.keys(banco.perfis_empresa);
  const perfilId  = sortear(perfisIds);
  const perfil    = banco.perfis_empresa[perfilId];

  const tributosComuns = tributosTodos.filter(t => t.pj && perfil.tributos_comuns.includes(t.id));
  const tributosOutros = tributosTodos.filter(t => t.pj && !perfil.tributos_comuns.includes(t.id));

  const usarComum = tributosOutros.length === 0 || Math.random() < 0.90;
  const pool = usarComum ? tributosComuns : tributosOutros;
  const tributo = sortear(pool.length ? pool : tributosComuns);

  return { ehPJ: true, perfil: { id: perfilId, ...perfil }, tributo };
}

// ════════════════════════════════════════════════════════
// SORTEIO DE LADO PROCESSUAL — usado na CÍVEL (consumidor), onde o
// jogador pode estar pelo Autor ou pelo Réu. Tributário e trabalhista
// são sempre 'autor' (decidido na regra de negócio, não aqui).
// ════════════════════════════════════════════════════════
function sortearLado(probReu = 0.5) {
  return Math.random() < probReu ? 'reu' : 'autor';
}

/**
 * GERAR PROCESSO — motor procedural puro, sem IA decidindo lógica.
 * Retorna estrutura completa e juridicamente coerente.
 */
function gerarProcesso(area, dificuldade = 'media') {
  const banco = BANCO[area];
  if (!banco) throw new Error(`Área "${area}" não cadastrada no banco jurídico.`);

  const qtdFatos = dificuldade === 'alta' ? 4 : dificuldade === 'baixa' ? 2 : 3;

  // No TRIBUTÁRIO, PF/PJ e o tributo precisam ser decididos ANTES de
  // sortear os fatos — senão um fato tipicamente empresarial (grupo
  // econômico, créditos de insumo, substituição tributária) pode cair
  // num caso cujo autor é pessoa física, o que não faz sentido jurídico
  // (ex.: "Rodrigo Vieira Sampaio" como PF discutindo grupo econômico).
  let tributoInfoPrevio = null;
  let apenasTipoFatos = null;
  if (area === 'tributario') {
    tributoInfoPrevio = sortearTributo(banco);
    apenasTipoFatos = tributoInfoPrevio.ehPJ ? 'pj' : 'pf';
  }

  // 1. Sortear fatos-base que vão condicionar tudo o resto — já filtrados
  // pelo tipo de contribuinte quando a área for tributário.
  const fatosAtivos = sortearFatos(area, qtdFatos, apenasTipoFatos);

  // 2. Escolher conflito cujos requisitos batem com os fatos sorteados
  const conflitosValidos = banco.conflitos.filter(c => temRequisitos(c, fatosAtivos));
  const conflito = conflitosValidos.length > 0
    ? sortear(conflitosValidos)
    : sortear(banco.conflitos); // fallback se nenhum bater (não deveria ocorrer com banco bem desenhado)

  // 3. Filtrar teses cujos requisitos batem com os fatos — ESSA É A REGRA CRÍTICA
  const tesesValidas = banco.teses.filter(t => temRequisitos(t, fatosAtivos));
  // Garantir pelo menos 2 teses (fallback pra teses sem requisito se faltar)
  const tesesFallback = banco.teses.filter(t => (!t.requer_fatos || t.requer_fatos.length === 0));
  const tesesPool = tesesValidas.length >= 2
    ? tesesValidas
    : [...tesesValidas, ...tesesFallback.filter(tf => !tesesValidas.some(tv => tv.id === tf.id))];
  // Embaralha antes de qualquer corte — mesma correção aplicada às provas,
  // para que a tese sorteada não dependa da ordem de declaração no banco.
  const tesesFinaisRef = [...tesesPool].sort(() => Math.random() - 0.5);
  // No tributário, hidrata cada referência {id, requer_fatos} com nome,
  // fundamento e os 3 argumentos (forte/médio/fraco) sorteados do banco
  // expandido. Trabalhista/consumidor ainda usam o formato antigo direto
  // (nome/fundamento já embutidos), então passam direto sem hidratação.
  const tesesFinais = area === 'tributario' ? tesesFinaisRef.map(_hidratarTese) : tesesFinaisRef;

  // 4. Filtrar provas cujos requisitos batem — e, no tributário, também
  // compatíveis com o RITO PROCESSUAL do conflito sorteado (ex: Mandado
  // de Segurança nunca recebe prova pericial, que exige dilação probatória
  // incompatível com seu rito sumário).
  let provasValidas = banco.provas.filter(p => temRequisitos(p, fatosAtivos));
  let provasFallback = banco.provas.filter(p => (!p.requer_fatos || p.requer_fatos.length === 0));
  if (area === 'tributario') {
    // A compatibilidade de CONFLITO (rito processual) nunca pode ser
    // relaxada — é uma regra jurídica, não uma preferência. Se a
    // interseção com os fatos ficar vazia, relaxamos o requisito de FATO
    // primeiro (ainda dentro do universo compatível com o conflito),
    // nunca o inverso. Isso evita que, por exemplo, Mandado de Segurança
    // (rito sumário, poucas provas compatíveis) acabe recebendo prova
    // pericial só porque nenhuma prova compatível tinha o fato sorteado.
    const todasCompativeisComConflito = banco.provas.filter(p => provaCompativelComConflito(p, conflito.id));
    const validasECompativeis = provasValidas.filter(p => provaCompativelComConflito(p, conflito.id));
    provasValidas = validasECompativeis.length > 0 ? validasECompativeis : todasCompativeisComConflito;
    provasFallback = provasFallback.filter(p => provaCompativelComConflito(p, conflito.id));
  }
  const provasPool = provasValidas.length >= 3
    ? provasValidas
    : [...provasValidas, ...provasFallback.filter(pf => !provasValidas.some(pv => pv.id === pf.id))];
  // Embaralha antes de cortar em 5 — sem isso, o slice(0,5) sempre pegava
  // as primeiras provas na ordem de DECLARAÇÃO do banco, nunca sorteando
  // de fato (ex.: provas periciais, declaradas mais ao final da lista,
  // praticamente nunca apareciam mesmo quando compatíveis com o conflito).
  const provasFinais = [...provasPool].sort(() => Math.random() - 0.5).slice(0, 5);

  // 5. Filtrar eventos possíveis (mas não necessariamente vão ocorrer)
  const eventosValidos = banco.eventos.filter(e => temRequisitos(e, fatosAtivos));

  // 6. Sortear partes — regra de negócio específica por área:
  //    - tributario: SEMPRE autor (contribuinte). Réu derivado do tributo
  //      já sorteado no passo 0 (acima), e PF/PJ seguem a regra 40/60 com
  //      tributos restritos por perfil de empresa.
  //    - trabalhista: SEMPRE autor (reclamante, pessoa física). Réu é
  //      sempre a empresa (polo_passivo já é só empresa nesse banco).
  //    - consumidor (cível): lado sorteado 50/50. Quando Réu, o caso é
  //      mais difícil (tribunal mais conservador, convencimento inicial
  //      mais baixo) e os honorários ao final são maiores.
  let autor, reu, tribunal, meuLado = 'autor', tributoInfo = null, dificuldadeExtra = false;

  if (area === 'tributario') {
    tributoInfo = tributoInfoPrevio; // já decidido antes de sortear fatos
    const contribuinte = tributoInfo.ehPJ ? 'Contribuinte PJ' : 'Contribuinte PF';
    const fisco = tributoInfo.tributo.ente;
    if (conflito.fisco_e_autor) {
      // EXECUÇÃO FISCAL: é o Fisco/ente tributante quem executa o
      // contribuinte. Autor = Fisco, Réu = contribuinte (defesa). O
      // jogador continua jogando pelo contribuinte, mas agora na DEFESA
      // — meuLado='reu' para que a polaridade dos argumentos se inverta
      // corretamente (você defende a improcedência da execução).
      autor = fisco;
      reu   = contribuinte;
      meuLado = 'reu';
    } else {
      // Demais conflitos tributários (inclusive Embargos e Exceção de
      // Pré-Executividade, que o contribuinte ajuíza mesmo sendo
      // incidentais): contribuinte é autor, Fisco é réu.
      autor = contribuinte;
      reu   = fisco;
      meuLado = 'autor';
    }
    tribunal = reu === 'Estado do RJ' || reu === 'Município do Rio de Janeiro' || autor === 'Estado do RJ' || autor === 'Município do Rio de Janeiro'
      ? 'Justiça Estadual'
      : sortear(['Justiça Federal','CARF']);
  } else if (area === 'trabalhista') {
    // Reclamação Trabalhista: SEMPRE pessoa física como autor (reclamante)
    // e empresa como réu — nunca o inverso (empresa nunca é autora aqui).
    autor = sortear(banco.polo_ativo); // sempre PF (cargo/profissão)
    reu   = sortear(banco.polo_passivo); // sempre empresa
    tribunal = sortear(banco.competencia);
    meuLado = 'autor';
  } else {
    // Cível (consumidor): lado variável (50/50), MAS o réu é sempre PJ —
    // uma pessoa física nunca ocupa o polo passivo aqui (ex.: banco,
    // operadora, loja). O autor pode ser PF ou PJ (sorteado normalmente).
    autor = sortear(banco.polo_ativo);
    reu   = sortear(banco.polo_passivo); // banco.polo_passivo já é só PJ por banco
    meuLado = banco.lado_variavel ? sortearLado(0.5) : 'autor';
    dificuldadeExtra = meuLado === 'reu';
    tribunal = dificuldadeExtra
      ? sortear(banco.competencia_dificil || banco.competencia)
      : sortear(banco.competencia);
  }

  // 7. Valor da causa escalado pela dificuldade
  const valorBase = { baixa: [5000, 30000], media: [20000, 150000], alta: [100000, 800000] }[dificuldade];
  const valor_causa = Math.floor(valorBase[0] + Math.random() * (valorBase[1] - valorBase[0]));

  return {
    area, dificuldade, conflito, fatosAtivos,
    autor, reu, tribunal, valor_causa,
    meuLado,              // 'autor' ou 'reu' — define polaridade dos argumentos/sentença
    tributoInfo,          // só preenchido na área tributário (perfil, tributo, ente)
    dificuldadeExtra,      // true quando réu na cível — usado para honorários/convencimento inicial
    teses: tesesFinais.slice(0, 4),
    provas: provasFinais,
    eventos_possiveis: eventosValidos,
  };
}

// ════════════════════════════════════════════════════════
// PROCESSAR EFEITO DE EVENTO (lógica determinística, sem IA)
// ════════════════════════════════════════════════════════
function processarEvento(evento, tesesEscolhidas, convencimentoAtual) {
  switch (evento.efeito) {
    case 'beneficia_autor':
      return { delta: evento.delta, msg: evento.desc };
    case 'prejudica_autor':
      return { delta: evento.delta, msg: evento.desc };
    case 'pressao_acordo':
      return { delta: evento.delta, msg: evento.desc, sugestao: 'considerar_acordo' };
    case 'prejudica_boa_fe':
      // Penaliza mais se a tese escolhida depender de boa-fé
      const dependeBoaFe = tesesEscolhidas.some(t => t.id === 'sumula436_stj' || t.id === 'nulidade_cda');
      return { delta: dependeBoaFe ? evento.delta - 4 : evento.delta, msg: evento.desc };
    case 'depende_tese':
      // Mudança jurisprudencial: bom se a tese escolhida é a tese 69, ruim genérico se não
      const temTese69 = tesesEscolhidas.some(t => t.id === 'tema69_stf');
      return { delta: temTese69 ? 12 : -3, msg: evento.desc };
    case 'depende_resultado':
      // Perícia: 50/50 mas influenciada pela força das provas médicas selecionadas
      const favoravel = Math.random() < 0.5;
      return { delta: favoravel ? 14 : -14, msg: evento.desc + (favoravel ? ' Resultado: favorável.' : ' Resultado: desfavorável.') };
    case 'prejudica_quem_arrolou':
      return { delta: evento.delta, msg: evento.desc };
    case 'oferece_acordo':
      return { delta: 0, msg: evento.desc, sugestao: 'oferta_acordo_disponivel' };
    default:
      return { delta: 0, msg: evento.desc };
  }
}
const NOMES_PF = ['Ana Paula Ferreira','Carlos Eduardo Souza','Mariana Costa Lima','João Pedro Almeida','Fernanda Ribeiro Santos','Rafael Oliveira Dias','Juliana Mendes Carvalho','Bruno Henrique Rocha','Camila Andrade Pinto','Lucas Gabriel Martins','Beatriz Nogueira Castro','Thiago Barros Cunha','Larissa Fontes Moreira','Eduardo Tavares Neves','Patrícia Lopes Gouveia','Rodrigo Vieira Sampaio','Gabriela Pires Monteiro','Felipe Cardoso Teixeira','Renata Azevedo Borges','André Luiz Correia'];
const NOMES_PJ = ['Comércio Atlântico Ltda','Indústria Boa Vista S/A','Distribuidora Rio Norte Eireli','Grupo Serrano Comércio Ltda','Mercantil Vale Verde S/A','Transportes Litoral Ltda','Construtora Pedra Azul S/A','Comercial Estrela do Sul Ltda','Indústria Mineira Têxtil S/A','Grupo Atlântico Logística Ltda'];
const NOMES_PJ_VAREJO    = ['Comércio Atlântico Ltda','Mercantil Vale Verde S/A','Comercial Estrela do Sul Ltda','Distribuidora Rio Norte Eireli','Varejo Boa Vista Ltda','Magazine Litoral S/A'];
const NOMES_PJ_SERVICO   = ['Consultoria Atlântico Ltda','Serviços Vale Verde S/A','Assessoria Estrela do Sul Ltda','Soluções Rio Norte Eireli','Facilities Boa Vista Ltda'];
const NOMES_PJ_INDUSTRIA = ['Indústria Boa Vista S/A','Indústria Mineira Têxtil S/A','Metalúrgica Serrano S/A','Construtora Pedra Azul S/A','Indústria Litoral Ltda'];
const NOMES_JUIZ = ['Dr. Marcelo Andrade Reis','Dra. Helena Mourão Castro','Dr. Sérgio Bittencourt Lima','Dra. Patrícia Wagner Souza','Dr. Fábio Ramalho Teixeira','Dra. Cristina Albano Ferraz','Dr. Otávio Drummond Pacheco','Dra. Renata Quintão Brandão'];

const PERFIL_HINT = {
  formalista: 'Magistrado conhecido pelo rigor técnico e apego à letra da lei — valoriza fundamentação precisa.',
  garantista: 'Magistrado com histórico de decisões favoráveis à parte mais vulnerável da relação processual.',
  conservador: 'Magistrado cauteloso, pouco receptivo a teses inovadoras ou argumentação mais agressiva.',
};

// Dicionário fato → frase narrativa, cobrindo os fatos_possiveis das 3 áreas do BANCO.
const FATO_FRASE = {
  // tributário
  divida_inscrita: 'A dívida foi formalmente inscrita em dívida ativa pelo ente tributante.',
  execucao_em_curso: 'Já existe execução fiscal em curso contra a parte devedora.',
  vicio_formal: 'Foi identificado vício formal na constituição do crédito tributário.',
  pagamento_indevido: 'O contribuinte efetuou pagamento que posteriormente se revelou indevido.',
  auto_infracao_lavrado: 'Um auto de infração foi lavrado pela fiscalização tributária.',
  ato_iminente_ou_praticado: 'Há ato da administração, iminente ou já praticado, que ameaça direito líquido e certo.',
  credito_tributario_existente: 'Existe crédito tributário reconhecido em favor do contribuinte.',
  tributo_calculado_incorretamente: 'O tributo foi calculado com base de cálculo incorreta.',
  atividade_imune: 'A atividade exercida está abrangida por imunidade tributária constitucional.',
  processo_paralisado_5anos: 'O processo permaneceu paralisado por mais de cinco anos sem movimentação útil.',
  notificacao_recebida: 'A parte recebeu notificação formal da autoridade fiscal.',
  prazo_decadencial_vencido: 'O prazo decadencial para lançamento já se encontra vencido.',
  parcelamento_ativo: 'Havia parcelamento tributário ativo sobre o débito discutido.',
  denuncia_espontanea_feita: 'O contribuinte fez denúncia espontânea antes de qualquer ação fiscalizatória.',
  grupo_economico_alegado: 'A autoridade alega a existência de grupo econômico entre as empresas envolvidas.',
  substituicao_tributaria_aplicada: 'Foi aplicado o regime de substituição tributária na operação discutida.',
  icms_st_recolhido: 'O ICMS-ST foi recolhido antecipadamente na cadeia de circulação.',
  creditos_insumo_glosados: 'Créditos de insumos foram glosados pela fiscalização.',
  responsabilidade_terceiro_imputada: 'A responsabilidade tributária foi imputada a terceiro estranho ao fato gerador.',
  lei_alterada_posteriormente: 'A legislação aplicável foi alterada após a ocorrência dos fatos.',
  confisco_alegado: 'A parte alega que a cobrança assume caráter confiscatório.',
  isencao_legal_existente: 'Existe isenção legal expressa aplicável à operação discutida.',
  // trabalhista
  jornada_excedida: 'A jornada de trabalho contratual foi sistematicamente excedida sem compensação ou pagamento.',
  demissao_justa_causa: 'O empregado foi demitido sob alegação de justa causa.',
  acidente_ocorrido: 'Houve acidente de trabalho durante o exercício das atividades laborais.',
  rescisao_sem_pagamento: 'A rescisão contratual ocorreu sem o pagamento integral das verbas devidas.',
  conduta_abusiva_chefia: 'Há relatos de conduta abusiva reiterada por parte da chefia direta.',
  colega_funcao_igual_salario_maior: 'Colega exercendo função idêntica recebe salário superior ao da parte reclamante.',
  prestacao_servico_sem_registro: 'A prestação de serviços ocorreu de forma contínua sem o devido registro em carteira.',
  funcao_diferente_contratada: 'A função efetivamente exercida diverge da função registrada em contrato.',
  sem_registro_ponto: 'Não havia controle formal de ponto na empresa ré.',
  testemunha_disponivel: 'Há testemunha disponível para confirmar os fatos narrados.',
  prova_documental_fraca: 'O conjunto documental disponível é considerado frágil para comprovação isolada dos fatos.',
  // consumidor
  cobranca_sem_contrato: 'Houve cobrança de valores sem que existisse relação contratual válida correspondente.',
  nome_negativado_sem_divida: 'O nome da parte consumidora foi negativado nos órgãos de proteção ao crédito sem dívida correspondente.',
  produto_com_defeito: 'O produto adquirido apresentou vício que comprometeu sua utilização regular.',
  transacao_nao_reconhecida: 'Foram identificadas transações bancárias que a parte não reconhece como próprias.',
  procedimento_negado: 'A cobertura de procedimento foi negada pela operadora, mesmo diante de indicação técnica.',
  voo_cancelado_ou_atrasado: 'O voo contratado foi cancelado ou sofreu atraso significativo sem assistência adequada.',
  dados_pessoais_expostos: 'Dados pessoais da parte consumidora foram expostos em incidente de segurança da informação.',
  tentativa_solucao_extrajudicial: 'Houve tentativa prévia de solução extrajudicial do conflito, sem sucesso.',
  reclamacao_protocolada: 'Foi protocolada reclamação formal junto ao fornecedor antes do ajuizamento.',
};

function fatoParaFrase(fatoId) {
  return FATO_FRASE[fatoId] || `Restou demonstrado fato relevante relacionado a ${fatoId.replace(/_/g,' ')}.`;
}

// Templates de argumento da parte contrária e respostas, parametrizados pela
// tese/prova/conflito já escolhidos pelo motor — mantém a mesma variedade que
// a IA produzia, só que sem custo e sem dependência de rede.
// ── Templates de ARGUMENTO DA PARTE CONTRÁRIA — sensíveis ao lado do
// jogador. Quando meuLado='autor', a parte contrária é a DEFESA pedindo
// improcedência. Quando meuLado='reu', a parte contrária é o AUTOR
// pedindo procedência. O conteúdo do que a parte contrária defende muda.
const TEMPLATES_ARGUMENTO_COMO_AUTOR = [
  conflito => `A parte ré sustenta que não há fundamento para o pedido relativo a "${conflito.nome}", defendendo a improcedência total da ação.`,
  conflito => `Em sua manifestação, a defesa contesta a ocorrência dos fatos narrados sobre "${conflito.nome}", pugnando pela improcedência total.`,
  conflito => `A ré argumenta que eventual responsabilidade estaria afastada por circunstância excludente, defendendo a improcedência do pedido de "${conflito.nome}".`,
  conflito => `A defesa sustenta ausência de nexo causal entre os fatos narrados em "${conflito.nome}" e a pretensão deduzida pelo autor.`,
  conflito => `A parte ré impugna especificamente os documentos juntados, alegando que não comprovam o alegado em "${conflito.nome}".`,
  conflito => `Em preliminar, a defesa argui a inadequação da via processual eleita para a pretensão de "${conflito.nome}".`,
  conflito => `A ré sustenta que os fatos descritos em "${conflito.nome}" foram interpretados de forma equivocada pela parte autora.`,
  conflito => `A defesa requer a total rejeição do pedido relativo a "${conflito.nome}", por ausência de amparo legal e probatório.`,
];

const TEMPLATES_ARGUMENTO_COMO_REU = [
  conflito => `A parte autora sustenta que os fatos relativos a "${conflito.nome}" estão plenamente comprovados, pugnando pela procedência integral do pedido.`,
  conflito => `Em sua manifestação, o autor reafirma a ocorrência dos fatos narrados sobre "${conflito.nome}", requerendo a procedência total da ação.`,
  conflito => `O autor argumenta que a responsabilidade da parte ré está configurada, defendendo a procedência do pedido de "${conflito.nome}".`,
  conflito => `A parte autora sustenta que o conjunto probatório acostado aos autos confirma integralmente a tese de "${conflito.nome}".`,
  conflito => `Em réplica, o autor reforça que nenhuma circunstância excludente foi comprovada quanto a "${conflito.nome}".`,
  conflito => `O autor argumenta que a própria conduta da parte ré, já documentada, sustenta a procedência de "${conflito.nome}".`,
  conflito => `A parte autora sustenta que a interpretação dada pela defesa aos fatos de "${conflito.nome}" não encontra amparo na prova dos autos.`,
  conflito => `Em sua manifestação, o autor requer o integral acolhimento do pedido relativo a "${conflito.nome}", por ausência de impugnação específica.`,
];

const TEMPLATES_ARGUMENTO = TEMPLATES_ARGUMENTO_COMO_AUTOR; // mantém compat. com chamadas antigas

const TEMPLATES_RESPOSTA_TECNICA = [
  (tese) => tese ? (tese.argumentoForte || `Aplica-se ao caso a tese de "${tese.nome}" (${tese.fundamento}), que afasta integralmente a alegação contrária.`) : 'A fundamentação jurídica aplicável ao caso não favorece a tese da parte contrária.',
  (tese) => tese ? `Nos termos de "${tese.fundamento}", a posição sustentada pela defesa não encontra amparo na legislação ou jurisprudência vigentes.` : 'A jurisprudência consolidada sobre a matéria contraria diretamente o argumento apresentado.',
  (tese) => tese ? (tese.argumentoMedio || `O entendimento consagrado em "${tese.fundamento}" é direto: a tese de "${tese.nome}" sustenta integralmente a pretensão autoral.`) : 'O fundamento legal aplicável sustenta integralmente a pretensão autoral.',
];

// Respostas TÉCNICAS quando o jogador é RÉU — defendem a IMPROCEDÊNCIA,
// citando a mesma tese disponível mas com a conclusão invertida.
const TEMPLATES_RESPOSTA_TECNICA_REU = [
  (tese) => tese ? (tese.argumentoForte || `Aplica-se ao caso a tese de "${tese.nome}" (${tese.fundamento}), que afasta integralmente a pretensão do autor.`) : 'A fundamentação jurídica aplicável ao caso não favorece a pretensão da parte autora.',
  (tese) => tese ? `Nos termos de "${tese.fundamento}", a posição sustentada pelo autor não encontra amparo na legislação ou jurisprudência vigentes.` : 'A jurisprudência consolidada sobre a matéria contraria diretamente o pedido formulado.',
  (tese) => tese ? (tese.argumentoMedio || `O entendimento consagrado em "${tese.fundamento}" é direto: a tese de "${tese.nome}" sustenta integralmente a improcedência do pedido.`) : 'O fundamento legal aplicável sustenta integralmente a improcedência do pedido.',
];

const TEMPLATES_RESPOSTA_AGRESSIVA = [
  () => 'Impugno veementemente a alegação contrária, por ausência completa de provas que a sustentem.',
  () => 'Tal afirmação inverte indevidamente o ônus probatório, que recai sobre quem o alega.',
  () => 'Os elementos dos autos demonstram exatamente o contrário do que pretende fazer crer a parte adversa.',
  () => 'A alegação contrária é manifestamente contraditória com os próprios documentos juntados pela parte adversa.',
  () => 'Não há um único elemento nos autos que sustente minimamente a tese contrária apresentada.',
  () => 'A versão apresentada pela parte adversa carece de qualquer lastro probatório idôneo.',
  () => 'Causa estranheza que a parte contrária sustente tal posição sem qualquer amparo documental.',
  () => 'A tentativa de reescrever os fatos não encontra respaldo em nenhum elemento dos autos.',
];

const TEMPLATES_RESPOSTA_PASSIVA = [
  () => 'Deixo a apreciação do ponto ao prudente critério do magistrado.',
  () => 'Reconheço que a questão admite interpretações distintas e aguardo a manifestação do juízo.',
  () => 'Não me oponho a que o tribunal avalie livremente esse aspecto específico da controvérsia.',
  () => 'Submeto o ponto à livre apreciação do juízo, sem maiores ponderações neste momento.',
  () => 'Entendo que a questão pode ser melhor esclarecida pela própria instrução processual.',
  () => 'Não tenho objeção a que o magistrado pondere livremente esse aspecto da lide.',
  () => 'Confio no exame técnico do juízo sobre essa questão específica.',
  () => 'Deixo à apreciação do tribunal a definição do peso a ser dado a esse argumento.',
];

function gerarTextoLocal(PROC) {
  const meuLado = PROC.meuLado || 'autor';

  // ── Geração de nome por VALOR (não por posição fixa autor/réu) ──
  // Antes assumia-se que autor=contribuinte/PF-PJ e réu=ente/empresa
  // sempre. Isso quebrou com Execução Fiscal, onde o Fisco é autor e o
  // contribuinte é réu (a inversão é proposital — ver gerarProcesso).
  // Por isso cada nome agora é gerado a partir do VALOR da string em si,
  // não da posição (autor/réu) onde ela aparece.
  const perfilEmpresaId = PROC.tributoInfo?.perfil?.id || null;
  const poolNomePJ = perfilEmpresaId === 'varejo' ? NOMES_PJ_VAREJO
    : perfilEmpresaId === 'servico' ? NOMES_PJ_SERVICO
    : perfilEmpresaId === 'industria' ? NOMES_PJ_INDUSTRIA
    : NOMES_PJ;
  const sufixoEmpresa = sortear(['Brasil','Nacional','Atlântico','Premium','Sul','Norte','Holding']);

  function _nomePara(valor){
    if (/^(União|Estado|Município)/.test(valor)) return valor; // ente público — nome já completo
    if (/PJ\b/.test(valor)) return sortear(poolNomePJ);          // Contribuinte PJ / Empresa PJ
    if (/PF\b|Pessoa Física/.test(valor)) return sortear(NOMES_PF); // Contribuinte PF / Pessoa Física
    if (valor === 'Empresa PJ') return sortear(NOMES_PJ);
    // Demais valores de polo_passivo (Banco, Loja Virtual, Supermercado,
    // cargos trabalhistas como Operador de Caixa etc.) — heurística:
    // se for um cargo/profissão típico de pessoa física, usa nome PF;
    // senão trata como instituição/empresa com sufixo de razão social.
    const CARGOS_PF = ['Operador de Caixa','Motorista','Vendedor','Gerente','Analista'];
    if (CARGOS_PF.includes(valor)) return sortear(NOMES_PF);
    return `${valor} ${sufixoEmpresa}`;
  }

  const autor_nome = _nomePara(PROC.autor);
  const reu_nome    = _nomePara(PROC.reu);

  const fatos = PROC.fatosAtivos.slice(0, 3).map(fatoParaFrase);
  while (fatos.length < 3) fatos.push('Fato complementar relevante ao deslinde da causa.');

  // Quando o jogador é réu, o tribunal já vem mais conservador (definido em
  // gerarProcesso via competencia_dificil) — aqui só reforçamos o perfil do
  // magistrado pra coerência: réu enfrenta juiz mais "formalista/conservador"
  // com maior frequência, refletindo a dificuldade extra combinada.
  const perfis = meuLado === 'reu'
    ? ['formalista', 'formalista', 'conservador', 'garantista']
    : ['formalista', 'garantista', 'conservador'];
  const perfil = sortear(perfis);
  const juiz = { nome: sortear(NOMES_JUIZ), perfil_oculto: perfil, hint: PERFIL_HINT[perfil] };

  // Número CNJ sintético — formato n7-dv.AAAA.J.TR.OOOO
  const seq = String(Math.floor(Math.random()*9999999)).padStart(7,'0');
  const dv  = String(Math.floor(Math.random()*99)).padStart(2,'0');
  const ano = 2024 + Math.floor(Math.random()*3);
  const numero = `${seq}-${dv}.${ano}.8.19.0001`;

  const tesesDisponiveis = PROC.teses || [];
  const tipos = ['tecnica','agressiva','passiva'];

  const templatesArgumento = meuLado === 'reu' ? TEMPLATES_ARGUMENTO_COMO_REU : TEMPLATES_ARGUMENTO_COMO_AUTOR;
  const templatesRespTecnica = meuLado === 'reu' ? TEMPLATES_RESPOSTA_TECNICA_REU : TEMPLATES_RESPOSTA_TECNICA;

  // Sorteia 3 templates de argumento SEM REPETIÇÃO entre as rodadas (antes
  // usava i % length, que sempre mapeava rodada->template de forma fixa e
  // previsível; agora embaralha o pool e pega os 3 primeiros, garantindo
  // variedade real entre partidas e dentro da mesma audiência).
  const poolArgumentos = [...templatesArgumento].sort(() => Math.random() - 0.5);
  const args = [0,1,2].map(i => {
    const txtFn = poolArgumentos[i % poolArgumentos.length];
    const ordemAleatoria = [...tipos].sort(() => Math.random() - 0.5);
    return {
      txt: txtFn(PROC.conflito),
      ideal: ordemAleatoria[0],
      neutro: ordemAleatoria[1],
      fraco: ordemAleatoria[2],
    };
  });

  // Mesma lógica para as respostas agressiva/passiva — sorteia sem repetir
  // dentro da mesma audiência.
  const poolAgressiva = [...TEMPLATES_RESPOSTA_AGRESSIVA].sort(() => Math.random() - 0.5);
  const poolPassiva = [...TEMPLATES_RESPOSTA_PASSIVA].sort(() => Math.random() - 0.5);

  const resps = {
    tecnica: [0,1,2].map(i => templatesRespTecnica[i % templatesRespTecnica.length](tesesDisponiveis[i % Math.max(1,tesesDisponiveis.length)])),
    agressiva: [0,1,2].map(i => poolAgressiva[i % poolAgressiva.length]()),
    passiva: [0,1,2].map(i => poolPassiva[i % poolPassiva.length]()),
  };

  return { numero, autor_nome, reu_nome, fatos, juiz, args, resps };
}
function calcularPrazosRecurso(mesBase, anoBase){
  const bloqueioMeses = 2 + Math.floor(Math.random()*2); // 2 ou 3
  const dataDisponivel = somarMeses(mesBase, anoBase, bloqueioMeses);
  const janelaMeses = 2 + Math.floor(Math.random()*2); // 2 ou 3
  const prazoFinal = somarMeses(dataDisponivel.mes, dataDisponivel.ano, janelaMeses);
  return { dataDisponivel, prazoFinal };
}

// Funções puras de calendário — em produção não há "mesAtual/anoAtual"
// globais (isso era do calendário simulado do demo standalone); o
// calendário real vem de window.JOGADOR.mes_pessoal/ano_pessoal, sempre
// passado explicitamente para cada função que precisa de uma data.
const MESES_PT_CAL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function mesLabel(m, a){ return `${MESES_PT_CAL[m%12]}, Ano ${a}`; }
function somarMeses(m, a, delta){
  const total = (a*12+m) + delta;
  return { mes: total%12, ano: Math.floor(total/12) };
}

// (Bloco de simulação de cargo/equipe do demo standalone removido — em
// produção, CARGO_IDX, repCapDoJogador(), cargoPodeSustentar() e
// buscarRepasseEscritorio() já estão definidos no topo deste arquivo,
// usando window.JOGADOR.cargo_id e a subcoleção real de funcionarios do
// Firestore, em vez de variáveis simuladas fixas.)

// ════════════════════════════════════════════════
// PERFIS DE TRIBUNAL (tendências ocultas)
// ════════════════════════════════════════════════
const PERFIL_TRIBUNAL={
  'TJ':  { nome:'Tribunal de Justiça', tendencia:'documental', desc:'mais sensível à prova documental', votos:3 },
  'TRF': { nome:'Tribunal Regional Federal', tendencia:'tecnica', desc:'mais técnico e formalista', votos:3 },
  'TRT': { nome:'Tribunal Regional do Trabalho', tendencia:'trabalhador', desc:'mais favorável ao trabalhador', votos:3 },
  'STJ': { nome:'Superior Tribunal de Justiça', tendencia:'jurisprudencia', desc:'foco em jurisprudência consolidada', votos:5 },
  'TST': { nome:'Tribunal Superior do Trabalho', tendencia:'trabalhador', desc:'uniformiza jurisprudência trabalhista', votos:5 },
  'STF': { nome:'Supremo Tribunal Federal', tendencia:'constitucional', desc:'foco em matéria constitucional', votos:5 },
};

// ── CADEIA DE INSTÂNCIAS POR ORIGEM DO PROCESSO ──
// tributário estadual/municipal (ISS, IPVA, ITBI, ITCMD, ICMS): Just. Estadual → TJ → STJ → STF
// tributário federal (IRPF, IRPJ, IPI, PIS/COFINS, CSLL, IOF, II, ITR): Just. Federal → TRF → STJ → STF
// trabalhista: Vara do Trabalho → TRT → TST → STF (NUNCA passa por STJ)
// cível/consumidor: Justiça Comum/Juizado → TJ → STJ → STF
const CADEIA_INSTANCIAS = {
  tj_padrao:    ['1grau','TJ','STJ','STF'],
  trf_padrao:   ['1grau','TRF','STJ','STF'],
  trabalhista:  ['1grau','TRT','TST','STF'],
};

// Entes tributários cuja origem é Justiça Estadual (cai na cadeia tj_padrao)
const ENTES_TRIBUTARIOS_ESTADUAIS = ['Estado do RJ', 'Município do Rio de Janeiro'];

function _cadeiaDoProcesso(proc){
  if (proc.area === 'trabalhista') return CADEIA_INSTANCIAS.trabalhista;
  if (proc.area === 'tributario') {
    // O ente tributante pode estar no AUTOR (Execução Fiscal, onde o
    // Fisco executa o contribuinte) ou no RÉU (demais conflitos, onde o
    // contribuinte aciona o Fisco) — checar os dois lados.
    const entePresente = ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.reu) || ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.autor);
    return entePresente ? CADEIA_INSTANCIAS.tj_padrao : CADEIA_INSTANCIAS.trf_padrao;
  }
  // cível/consumidor e demais áreas futuras
  return CADEIA_INSTANCIAS.tj_padrao;
}

// Retorna o próximo tribunal na cadeia do PROCESSO (não só da área), dado a
// instância atual. instanciaAtual: '1grau' | 'TJ' | 'TRF' | 'TRT' | 'STJ' | 'TST'.
// Precisa do PROC completo (não só area) porque tributário bifurca por ente.
function tribunalRecursal(proc, instanciaAtual){
  const cadeia = _cadeiaDoProcesso(proc);
  const idx = cadeia.indexOf(instanciaAtual);
  if (idx === -1 || idx >= cadeia.length - 1) return cadeia[cadeia.length - 1]; // já no topo
  return cadeia[idx + 1];
}

// É o topo da cadeia (STF sempre, pela regra: lá não há mais recurso)?
function ehTopoDaCadeia(proc, instanciaAtual){
  return instanciaAtual === 'STF';
}


// ════════════════════════════════════════════════
// CLASSIFICAÇÃO DA SENTENÇA + PROBABILIDADE DE RECURSO
// ════════════════════════════════════════════════
// Antes existiam DUAS regras conflitantes (classificarSentenca cortava em 40,
// decidirRecurso cortava em 65) — o texto exibido na tela e a decisão real
// discordavam entre si (ex.: score 66 mostrava "ainda sujeita a recurso" mas
// na prática nunca recorria, porque 66>65). Unificado numa só fonte de
// verdade: SEMPRE pode recorrer, mas com chance decrescente conforme a força
// da sentença — nunca 0% (toda sentença é teoricamente recorrível) nem 100%
// (decisão estratégica da parte vencida nunca é uma certeza absoluta).
function classificarSentenca(score){
  if(score<=40)return{tier:'fragil',chanceRecurso:0.85,label:'Sentença Frágil',cor:'#e57373',mult_perda:2,
    desc:'A fundamentação apresenta pontos vulneráveis. É muito provável que a parte vencida recorra.'};
  if(score<=60)return{tier:'fraca',chanceRecurso:0.65,label:'Sentença Moderadamente Frágil',cor:'#ef9f27',mult_perda:1.5,
    desc:'Decisão com lacunas relevantes — recurso é provável.'};
  if(score<=75)return{tier:'moderada',chanceRecurso:0.35,label:'Sentença Moderadamente Forte',cor:'#ef9f27',mult_perda:1,
    desc:'Decisão bem fundamentada, mas ainda sujeita a recurso pela parte vencida.'};
  return{tier:'muito_forte',chanceRecurso:0.12,label:'Sentença Muito Bem Fundamentada',cor:'#3aaa6a',mult_perda:0.2,
    desc:'Excelente fundamentação. A parte contrária ainda pode recorrer, mas a chance de reforma é baixa.'};
}

// Decisão de recorrer — sorteio único ancorado na chanceRecurso da faixa.
// Substitui o antigo decidirRecurso(score) binário.
function decidirRecurso(score){
  const classif = classificarSentenca(score);
  return Math.random() < classif.chanceRecurso;
}

// ════════════════════════════════════════════════
// XP POR INSTÂNCIA — escala conforme sobe na cadeia, para desincentivar
// "girar" muitos processos fracos em vez de levar um caso até o fim.
// ════════════════════════════════════════════════
const XP_BASE_INSTANCIA = { '1grau':20, 'TJ':32, 'TRF':32, 'TRT':32, 'STJ':50, 'TST':50, 'STF':70 };
function xpPorDecisao(instancia, score){
  const base = XP_BASE_INSTANCIA[instancia] || 20;
  return Math.round(base + score*0.15);
}
const ESTRATEGIAS_RECURSO_DEFESA=[
  { id:'defender_provas', nome:'Defender as Provas', desc:'Reforça a valoração do conjunto probatório já produzido.', afeta:'prova_documental' },
  { id:'defender_jurisprudencia', nome:'Defender a Jurisprudência', desc:'Sustenta que a decisão segue entendimento consolidado dos tribunais.', afeta:'jurisprudencia' },
  { id:'defender_processual', nome:'Defender Aspecto Processual', desc:'Argumenta que não houve qualquer vício processual na instrução.', afeta:'aspecto_processual' },
  { id:'defender_pericia', nome:'Defender a Perícia', desc:'Reforça a conclusão técnica do laudo pericial produzido.', afeta:'prova_pericial' },
  { id:'defender_precedentes', nome:'Defender Precedentes', desc:'Cita precedentes do próprio tribunal recursal em casos similares.', afeta:'precedente' },
  { id:'defender_constitucional', nome:'Defender Matéria Constitucional', desc:'Eleva a discussão a princípios constitucionais aplicáveis.', afeta:'materia_constitucional' },
  { id:'defender_prazo', nome:'Defender o Marco Temporal', desc:'Sustenta que o cômputo do prazo prescricional/decadencial foi correto.', afeta:'prazo' },
];
const ESTRATEGIAS_RECURSO_ATAQUE=[
  { id:'atacar_provas', nome:'Atacar a Valoração das Provas', desc:'Demonstra que o conjunto probatório foi mal valorado na origem.', afeta:'prova_documental' },
  { id:'atacar_jurisprudencia', nome:'Invocar Jurisprudência Superior', desc:'Sustenta que a decisão contraria entendimento consolidado dos tribunais.', afeta:'jurisprudencia' },
  { id:'atacar_processual', nome:'Apontar Vício Processual', desc:'Argumenta que houve vício processual relevante na instrução do feito.', afeta:'aspecto_processual' },
  { id:'atacar_pericia', nome:'Contestar a Perícia', desc:'Questiona a conclusão técnica do laudo pericial produzido na origem.', afeta:'prova_pericial' },
  { id:'atacar_precedentes', nome:'Citar Precedentes Favoráveis', desc:'Cita precedentes do próprio tribunal recursal que sustentam a reforma.', afeta:'precedente' },
  { id:'atacar_constitucional', nome:'Elevar Matéria Constitucional', desc:'Eleva a discussão a princípios constitucionais que justificam a reforma.', afeta:'materia_constitucional' },
  { id:'atacar_prazo', nome:'Apontar Erro no Marco Temporal', desc:'Sustenta que o cômputo do prazo prescricional/decadencial foi incorreto.', afeta:'prazo' },
];
function _estrategiasRecursoAtuais(){
  return RECURSO_ATIVO.quem_recorre === 'jogador' ? ESTRATEGIAS_RECURSO_ATAQUE : ESTRATEGIAS_RECURSO_DEFESA;
}

// ════════════════════════════════════════════════
// CLASSES OCULTAS DOS JULGADORES — sistema expandido de 6 para 11 classes,
// cada uma reagindo com peso DIFERENTE a cada TEMA de argumento (não mais
// um bônus fixo igual para todo "argumento técnico"). Isso é o que torna
// a escolha de resposta estratégica de verdade: o jogador precisa notar
// que tipo de fundamentação aquele julgador valoriza e atacar o tema certo.
//
// IMPORTANTE: nomes fictícios em TODAS as instâncias (TJ/STJ/STF) — nunca
// nomes reais de magistrados, mesmo sendo um jogo. Os nomes do STJ abaixo
// foram desenhados pelo usuário como variações claramente fictícias,
// inspiradas em ministros reais mas com identidade própria no universo
// do Advocatus (sobrenomes alterados, sem atribuição de fala real).
// ════════════════════════════════════════════════
const CLASSES_JULGADOR = [
  'tributarista','empresarialista','consumerista','civilista','penalista',
  'garantista','formalista','pragmatico','administrativista','constitucionalista','humanista',
];
const CARGOS_3 = ['Relator','Revisor','Vogal'];
const CARGOS_5 = ['Relator','Revisor','1º Vogal','2º Vogal','3º Vogal'];

// ── PESO POR TEMA DE ARGUMENTO — cada classe reage de forma diferente a
// cada tema. Escala calibrada para jogo: pesos entre -3 (repulsa leve) e
// +9 (afinidade forte), nunca tão extremos que tornem outras escolhas
// irrelevantes, mas suficientes para fazer a leitura de banca valer a pena.
const PESO_TEMA_POR_CLASSE = {
  jurisprudencia:   { tributarista:6, empresarialista:4, consumerista:3, civilista:4, penalista:3, garantista:4, formalista:5, pragmatico:3, administrativista:5, constitucionalista:5, humanista:2 },
  prova_documental: { tributarista:5, empresarialista:6, consumerista:4, civilista:5, penalista:3, garantista:3, formalista:7, pragmatico:5, administrativista:6, constitucionalista:2, humanista:2 },
  prova_pericial:   { tributarista:3, empresarialista:4, consumerista:3, civilista:5, penalista:4, garantista:6, formalista:6, pragmatico:4, administrativista:4, constitucionalista:1, humanista:3 },
  precedente:       { tributarista:6, empresarialista:5, consumerista:4, civilista:4, penalista:4, garantista:5, formalista:6, pragmatico:4, administrativista:5, constitucionalista:6, humanista:3 },
  materia_constitucional: { tributarista:4, empresarialista:2, consumerista:3, civilista:3, penalista:5, garantista:7, formalista:2, pragmatico:2, administrativista:3, constitucionalista:9, humanista:6 },
  aspecto_processual: { tributarista:4, empresarialista:4, consumerista:3, civilista:4, penalista:6, garantista:8, formalista:9, pragmatico:2, administrativista:5, constitucionalista:4, humanista:4 },
  prazo:            { tributarista:7, empresarialista:5, consumerista:4, civilista:5, penalista:6, garantista:5, formalista:8, pragmatico:3, administrativista:6, constitucionalista:3, humanista:2 },
  agressivo:        { tributarista:1, empresarialista:2, consumerista:2, civilista:1, penalista:3, garantista:-2, formalista:-3, pragmatico:4, administrativista:1, constitucionalista:-2, humanista:-3 },
  passivo:          { tributarista:0, empresarialista:1, consumerista:1, civilista:1, penalista:0, garantista:2, formalista:1, pragmatico:3, administrativista:1, constitucionalista:1, humanista:3 },
};

function pesoTemaPorClasse(tema, classe) {
  return (PESO_TEMA_POR_CLASSE[tema] && PESO_TEMA_POR_CLASSE[tema][classe]) || 0;
}

// ── DICAS TEXTUAIS POR CLASSE — mesmo padrão do PERFIL_HINT do juiz de
// 1ª instância: uma frase que sugere a tendência sem nomear a classe
// oculta explicitamente. Exibida na ficha de cada julgador na tela de
// preparação do recurso, para que o jogador possa "ler a banca" antes
// de escolher a estratégia — sem isso, toda a profundidade do sistema
// de classes/pesos fica invisível até o erro já ter sido cometido.
const HINT_CLASSE_JULGADOR = {
  tributarista: 'Costuma se aprofundar em precedentes e técnica fiscal nos casos que envolvem a Fazenda Pública.',
  empresarialista: 'Tem histórico de decisões atentas a contratos, governança e impacto na atividade econômica.',
  consumerista: 'Tende a valorizar a vulnerabilidade da parte mais fraca da relação jurídica.',
  civilista: 'Conhecido pelo apego às relações contratuais e à segurança dos negócios jurídicos privados.',
  penalista: 'Costuma examinar com rigor a legalidade estrita e a técnica recursal do caso.',
  garantista: 'Tem histórico de decisões que priorizam contraditório, ampla defesa e devido processo.',
  formalista: 'Conhecido pelo rigor processual e observância estrita das regras procedimentais.',
  pragmatico: 'Tende a buscar soluções práticas e efetivas, com foco no resultado concreto da decisão.',
  administrativista: 'Costuma examinar com atenção a legalidade dos atos da Administração Pública.',
  constitucionalista: 'Tem histórico de decisões que elevam a discussão a princípios constitucionais.',
  humanista: 'Conhecido por decisões atentas à dignidade da pessoa e aos direitos fundamentais envolvidos.',
};

// ── BANCO DE NOMES FICTÍCIOS — TJ (genérico, qualquer área) ──
const JULGADORES_TJ = [
  { nome: 'Des. Roberto Salgueiro', classe: 'formalista' },
  { nome: 'Des. Helena Vasconcelos Pita', classe: 'garantista' },
  { nome: 'Des. Otávio Monte Ribeiro', classe: 'tributarista' },
  { nome: 'Desa. Cristina Albano Ferraz', classe: 'formalista' },
  { nome: 'Des. Fábio Ramalho Teixeira', classe: 'pragmatico' },
  { nome: 'Des. Marcelo Andrade Reis', classe: 'administrativista' },
  { nome: 'Desa. Patrícia Wagner Souza', classe: 'humanista' },
  { nome: 'Des. Sérgio Bittencourt Lima', classe: 'civilista' },
  { nome: 'Desa. Renata Quintão Brandão', classe: 'consumerista' },
  { nome: 'Des. Otávio Drummond Pacheco', classe: 'constitucionalista' },
  { nome: 'Des. Carlos Eduardo Monteiro', classe: 'empresarialista' },
  { nome: 'Desa. Beatriz Nogueira Castro', classe: 'penalista' },
  { nome: 'Des. Thiago Barros Cunha', classe: 'pragmatico' },
  { nome: 'Desa. Larissa Fontes Moreira', classe: 'garantista' },
  { nome: 'Des. Eduardo Tavares Neves', classe: 'tributarista' },
];

// ── BANCO DE NOMES FICTÍCIOS — STJ (32 ministros fictícios, lista
// desenhada pelo usuário a partir de variações claramente distintas dos
// nomes reais, com classe oculta correspondente) ──
const JULGADORES_STJ = [
  { nome: 'Min. Antônio Benjamim Vasques', classe: 'humanista' },
  { nome: 'Min. Luís Carvalhal', classe: 'pragmatico' },
  { nome: 'Min. Francisco Falcari', classe: 'administrativista' },
  { nome: 'Min. Fátima Andrigues', classe: 'civilista' },
  { nome: 'Min. João Bittencourt', classe: 'formalista' },
  { nome: 'Min. Humberto Esteves Rocha', classe: 'pragmatico' },
  { nome: 'Min. Maria Teresa Bandeira', classe: 'garantista' },
  { nome: 'Min. Geraldo Fernandes Nicéas', classe: 'pragmatico' },
  { nome: 'Min. Mauro Cantelmo', classe: 'tributarista' },
  { nome: 'Min. Benedito Oliveira', classe: 'administrativista' },
  { nome: 'Min. Raul Montenegro', classe: 'civilista' },
  { nome: 'Min. Maria Isabel Galotti', classe: 'empresarialista' },
  { nome: 'Min. Antônio Ferreira Costa', classe: 'empresarialista' },
  { nome: 'Min. Ricardo Montalvão', classe: 'empresarialista' },
  { nome: 'Min. Sebastião Pontes', classe: 'garantista' },
  { nome: 'Min. Marco Buzzetti', classe: 'consumerista' },
  { nome: 'Min. Marco Bellizzi', classe: 'empresarialista' },
  { nome: 'Min. Sérgio Kukin', classe: 'administrativista' },
  { nome: 'Min. Paulo Ribeiro Moura', classe: 'civilista' },
  { nome: 'Min. Regina Almeida Paranhos', classe: 'tributarista' },
  { nome: 'Min. Rogério Machado Cruz', classe: 'garantista' },
  { nome: 'Min. Luís Gurgel Farias', classe: 'tributarista' },
  { nome: 'Min. Reinaldo Petruzzi', classe: 'humanista' },
  { nome: 'Min. Marcelo Albuquerque', classe: 'humanista' },
  { nome: 'Min. Joel Paciori', classe: 'penalista' },
  { nome: 'Min. Messod Azular', classe: 'tributarista' },
  { nome: 'Min. Paulo Domingues Neto', classe: 'empresarialista' },
  { nome: 'Min. Teodoro Santos Silva', classe: 'constitucionalista' },
  { nome: 'Min. José Avelino Marrocos', classe: 'civilista' },
  { nome: 'Min. Daniela Quintanilha', classe: 'garantista' },
  { nome: 'Min. Maria Marluce Andrade', classe: 'humanista' },
  { nome: 'Min. Carlos Brandoni', classe: 'constitucionalista' },
];

// ── BANCO DE NOMES FICTÍCIOS — STF (mesmo padrão, topo da cadeia,
// foco predominante em matéria constitucional) ──
const JULGADORES_STF = [
  { nome: 'Min. Eduardo Fachini', classe: 'constitucionalista' },
  { nome: 'Min. Gílson Vasconcellos', classe: 'constitucionalista' },
  { nome: 'Min. Carmem Lucena', classe: 'humanista' },
  { nome: 'Min. Dias Tofolatto', classe: 'pragmatico' },
  { nome: 'Min. Luiz Hartmann', classe: 'formalista' },
  { nome: 'Min. Alexandre Tarantino', classe: 'administrativista' },
  { nome: 'Min. Kássio Nunes da Marca', classe: 'civilista' },
  { nome: 'Min. André Castilho', classe: 'garantista' },
  { nome: 'Min. Cristiano Belmonte', classe: 'penalista' },
  { nome: 'Min. Flávio Dinis', classe: 'humanista' },
];

function gerarBancoJulgador(numVotos, instancia){
  let pool;
  if (instancia === 'STJ' || instancia === 'TST') pool = JULGADORES_STJ;
  else if (instancia === 'STF') pool = JULGADORES_STF;
  else pool = JULGADORES_TJ;

  // Sorteia numVotos julgadores distintos do pool (sem repetir nomes na
  // mesma sessão de julgamento) — pode repetir entre sessões diferentes.
  const embaralhado = [...pool].sort(() => Math.random() - 0.5);
  const cargos = numVotos === 5 ? CARGOS_5 : CARGOS_3;
  return cargos.map((cargo, i) => ({
    cargo,
    nome: embaralhado[i % embaralhado.length].nome,
    classe: embaralhado[i % embaralhado.length].classe,
  }));
}

// ════════════════════════════════════════════════════════
// MAPEAMENTO ÁREA DO PERSONAGEM → ÁREA DO BANCO JURÍDICO
// ════════════════════════════════════════════════════════
// O banco jurídico hoje só tem 'tributario', 'trabalhista', 'consumidor'
// estruturados (com fatos/conflitos/teses/provas). Demais especialidades
// do jogador caem em 'consumidor' como fallback genérico até que bancos
// próprios sejam construídos para elas.
function _areaBancoParaEspecialidade(especialidade){
  if (especialidade === 'tributario') return 'tributario';
  if (especialidade === 'trabalhista') return 'trabalhista';
  return 'consumidor'; // civil, empresarial, criminal, etc. — fallback genérico
}

// ════════════════════════════════════════════════════════
// NOVO PROCESSO — gera o caso jurídico completo (estrutura determinística
// do motor v8 + persistência em Firestore), substituindo o antigo
// _gerarProcesso (sorteio solto de tipo/autor/réu sem tese/prova).
// ════════════════════════════════════════════════════════
function _gerarProcessoCompleto(j, distribuidoPeloEscritorio = false) {
  const areaBanco = _areaBancoParaEspecialidade(j.especialidade || 'civil');
  const PROC = gerarProcesso(areaBanco, 'media');
  const TXT  = gerarTextoLocal(PROC);

  const mesG = j.mes_global_pessoal || 1;
  return {
    numero: TXT.numero,
    tipo: PROC.conflito.nome,
    autor: TXT.autor_nome,
    reu: TXT.reu_nome,
    area: j.especialidade || 'civil',           // especialidade do PERSONAGEM (compat. com o resto do jogo)
    area_banco: areaBanco,                       // área usada no banco jurídico (pode diferir da especialidade)
    tribunal: PROC.tribunal,
    instancia: '1grau',                          // agora NOMEADA, não numérica — ver tribunalRecursal()
    instancia_seguinte: tribunalRecursal(PROC, '1grau'),
    meu_lado: PROC.meuLado,                       // 'autor' ou 'reu' — define polaridade de toda a sustentação
    dificuldade_extra: PROC.dificuldadeExtra,
    conflito_id: PROC.conflito.id,
    fatos_ativos: PROC.fatosAtivos,
    fatos_narrativa: TXT.fatos,
    teses: PROC.teses,                            // [{id,nome,fundamento,argumentoForte,argumentoMedio,argumentoFraco}]
    provas: PROC.provas,                          // [{id,nome,tipo,forca,...}]
    juiz: TXT.juiz,                                // {nome, perfil_oculto, hint}
    args_audiencia: TXT.args,                      // 3 rodadas de argumento da parte contrária
    resps_audiencia: TXT.resps,                    // {tecnica:[3], agressiva:[3], passiva:[3]}
    provas_selecionadas: [],                       // índices das provas escolhidas pelo jogador (até 3)
    teses_selecionadas: [],                        // índices das teses escolhidas pelo jogador (até 2)
    convencimento: PROC.dificuldadeExtra ? 28 : 38, // cv inicial da audiência (1ª instância)
    rodada_audiencia: 0,
    status: 'andamento',
    progresso: 0,                                  // % de rodadas de audiência concluídas (0/33/66/100)
    valor: PROC.valor_causa,
    advogado_uid: j.uid,
    escritorio_id: j.escritorio_id || null,
    distribuido_pelo_escritorio: distribuidoPeloEscritorio,
    escritorio_nome_etiqueta: distribuidoPeloEscritorio ? (j.escritorio_nome || null) : null,
    prazo_limite_mes: distribuidoPeloEscritorio ? (mesTotalPessoalProc(j) + 3) : null,
    hon_total_acumulado: 0,
    hon_pendente: 0,                               // honorários presos até trânsito em julgado
    urgente: Math.random() < 0.2,
    criado_mes: mesG,
    encerrado_mes: null,
    recurso_pendente: false,
  };
}

function mesTotalPessoalProc(j) {
  return (j.ano_pessoal || 1) * 12 + (j.mes_pessoal || 0);
}

// ════════════════════════════════════════════════════════
// ABRIR PROCESSO (modal principal)
// ════════════════════════════════════════════════════════
let _estado = null; // { procId, proc, fase }

window.abrirProcesso = async function(processoId) {
  try {
    const snap = await getDoc(doc(db, 'processos', processoId));
    if (!snap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
    const p = snap.data();
    _estado = { procId: processoId, proc: p, fase: 'modal' };
    _renderModalProcesso(processoId, p);
  } catch (err) { toast('Erro ao abrir processo.', 'ko'); console.error(err); }
};

function _renderModalProcesso(id, p) {
  const j   = window.JOGADOR;
  const cv  = p.convencimento || 38;
  const prog = p.progresso || 0;
  const cvColor = cv >= 58 ? 'var(--verde2)' : cv >= 38 ? 'var(--amber)' : 'var(--verm2)';
  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));
  const honInfo = isSolo
    ? `Solo: 30% causa + 10% sucumbência (1ª inst.)`
    : `Escritório: 10% da sucumbência`;

  const cargoIdx = CARGO_IDX[j.cargo_id] || 0;
  const ehCasoPool = !!p.pool_escritorio_id;
  const travadoPorCargo = ehCasoPool && prog >= PROGRESSO_MAX_SEM_ADVOGADO && cargoIdx < CARGO_IDX_CONCLUSAO_MIN;

  const avisoEnergia = energiaDisp === 0
    ? `<div style="background:var(--verm-bg);border:1px solid var(--verm3);border-radius:var(--r);padding:.55rem .75rem;margin-bottom:.7rem;font-size:.75rem;color:var(--verm2);text-align:center">
        ⚡ Energia esgotada — avance o mês para continuar
       </div>`
    : '';
  const avisoCargo = travadoPorCargo
    ? `<div style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r);padding:.55rem .75rem;margin-bottom:.7rem;font-size:.72rem;color:var(--amber);text-align:center">
        🔒 Caso pronto para sentença, mas requer um Advogado Júnior+ do escritório para assinar e concluir.
       </div>`
    : '';

  const ladoLabel = p.meu_lado === 'reu' ? '🛡️ Você está na DEFESA' : '⚖️ Você é o AUTOR da ação';

  abrirModal(`⚖️ ${p.tipo || '—'}`,
    `<div style="background:var(--surface2);border:var(--borda);border-radius:var(--r);padding:.75rem;margin-bottom:.85rem">
      <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4);margin-bottom:.25rem">${p.numero || '—'}</div>
      <div style="font-weight:700;font-size:.9rem;color:var(--navy);margin-bottom:.15rem">${p.autor || '—'} <span style="opacity:.4">vs</span> ${p.reu || '—'}</div>
      <div style="font-size:.7rem;color:var(--ouro2)">${p.tribunal || '—'} · ${p.instancia === '1grau' ? '1ª Instância' : p.instancia}</div>
      <div style="font-size:.68rem;color:var(--navy3);margin-top:.25rem">${ladoLabel}</div>
      <div style="font-size:.7rem;color:var(--verde2);margin-top:.25rem">${fmt(p.valor)} · ${honInfo}</div>
      ${ehCasoPool ? `<div style="font-size:.65rem;color:var(--navy3);margin-top:.3rem">🏢 Caso colaborativo do escritório${p.escritorio_nome_etiqueta ? ' — ' + p.escritorio_nome_etiqueta : ''}</div>` : ''}
    </div>
    <div style="margin-bottom:.85rem">
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3);margin-bottom:.2rem">
        <span>Progresso da audiência</span><span style="color:var(--navy);font-weight:700">${prog}%</span>
      </div>
      <div style="height:7px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-bottom:.4rem">
        <div style="height:100%;width:${prog}%;background:linear-gradient(90deg,var(--navy3),var(--ouro2));transition:width .4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--txt3)">
        <span>Convencimento do magistrado</span>
        <span style="font-weight:700;color:${cvColor}">${cv}</span>
      </div>
      <div style="height:5px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:.18rem">
        <div style="height:100%;width:${cv}%;background:${cvColor};transition:width .4s"></div>
      </div>
    </div>
    ${avisoEnergia}
    ${avisoCargo}
    ${prog >= 100 && !travadoPorCargo
      ? `<button class="btn btn-prim btn-block" onclick="window.processarSentenca('${id}')">⚖️ Processar sentença →</button>`
      : prog >= 100 && travadoPorCargo
      ? `<button class="btn btn-prim btn-block" disabled style="opacity:.5;cursor:not-allowed">⚖️ Aguardando Advogado Júnior+ →</button>`
      : `<button class="btn btn-prim btn-block" ${energiaDisp < ENERGIA_POR_RODADA_AUDIENCIA || travadoPorCargo ? 'disabled' : ''} onclick="window.iniciarRodadaAudiencia('${id}')">
           ▶ Sustentação oral — rodada ${(p.rodada_audiencia || 0) + 1}/3 →
         </button>`}
    <button class="btn btn-ghost btn-sm btn-block" style="margin-top:.4rem" onclick="window.tentarAcordo('${id}')">
      🤝 Propor acordo (-5 ⚡)
    </button>`
  );
}

// ════════════════════════════════════════════════════════
// AUDIÊNCIA — 3 rodadas de sustentação oral. Substitui o antigo fluxo
// "peça processual + quiz técnico". Antes da 1ª rodada, jogador escolhe
// até 3 provas e até 2 teses (uma vez só por processo, igual ao motor).
// ════════════════════════════════════════════════════════
window.iniciarRodadaAudiencia = async function(procId) {
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) return;
  const p = snap.data();
  const j = window.JOGADOR;

  if (p.pool_escritorio_id && j) {
    await _registrarContribuinte(procId, p, j);
  }

  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes || 0));
  if (energiaDisp < ENERGIA_POR_RODADA_AUDIENCIA) {
    toast(`⚡ Energia insuficiente (requer ${ENERGIA_POR_RODADA_AUDIENCIA}⚡).`, 'ko');
    return;
  }

  _estado = { procId, proc: p, fase: 'instrucao' };

  // Instrução probatória só na 1ª rodada (provas + teses ainda não escolhidas)
  if (!p.provas_selecionadas || p.provas_selecionadas.length === 0) {
    _renderSelecaoProvas(procId, p);
    return;
  }

  _renderRodadaAudiencia(procId, p);
};

function _renderSelecaoProvas(procId, p) {
  document.getElementById('modal-body') && null; // no-op, abrirModal cuida do container
  abrirModal('📋 Fase 1 de 3 — Instrução Probatória',
    `${_painelContextoProcesso(p)}
    <div class="stitle">Selecione as provas</div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:.75rem">Escolha até 3 provas. Todas aqui são juridicamente coerentes com os fatos deste processo.</div>
    <div class="pgrid" id="provas-sel" style="margin-bottom:1rem">
      ${p.provas.map((prova, i) => `
        <div class="pcard" id="prova-${i}" onclick="window.togProvaAudiencia(${i})">
          <div class="pico">📄</div><div class="pnm">${prova.nome}</div><div class="ptyp">${prova.tipo.toUpperCase()}</div>
        </div>`).join('')}
    </div>
    <button class="btn-avancar-fase" id="btn-teses-aud" onclick="window.irParaSelecaoTeses('${procId}')">
      <span>Definir teses jurídicas</span><span class="baf-seta">→</span>
    </button>`
  );
  window._provasEscolhidasAud = [];
}

window.togProvaAudiencia = function(i){
  const arr = window._provasEscolhidasAud;
  const idx = arr.indexOf(i);
  if (idx >= 0) { arr.splice(idx,1); document.getElementById('prova-'+i)?.classList.remove('sel'); }
  else if (arr.length < 3) { arr.push(i); document.getElementById('prova-'+i)?.classList.add('sel'); }
};

window.irParaSelecaoTeses = function(procId){
  const p = _estado.proc;
  abrirModal('📋 Fase 1 de 3 — Teses Jurídicas',
    `${_painelContextoProcesso(p)}
    <div class="stitle">Selecione até 2 teses</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem">
      ${p.teses.map((t,i) => `
        <div class="ti" id="tese-${i}" onclick="window.togTeseAudiencia(${i})">
          <div class="tck" id="teseck-${i}"></div>
          <div><div class="tnm">${t.nome}</div><div class="tds">${t.fundamento}</div></div>
        </div>`).join('')}
    </div>
    <button class="btn-avancar-fase" onclick="window.confirmarInstrucaoAudiencia('${procId}')">
      <span>Iniciar sustentação oral</span><span class="baf-seta">→</span>
    </button>`
  );
  window._tesesEscolhidasAud = [];
};

window.togTeseAudiencia = function(i){
  const arr = window._tesesEscolhidasAud;
  const idx = arr.indexOf(i);
  if (idx >= 0) { arr.splice(idx,1); document.getElementById('tese-'+i)?.classList.remove('sel'); document.getElementById('teseck-'+i).textContent=''; }
  else if (arr.length < 2) { arr.push(i); document.getElementById('tese-'+i)?.classList.add('sel'); document.getElementById('teseck-'+i).textContent='✓'; }
};

window.confirmarInstrucaoAudiencia = async function(procId){
  const provasSel = window._provasEscolhidasAud || [];
  const tesesSel  = window._tesesEscolhidasAud || [];
  await updateDoc(doc(db, 'processos', procId), {
    provas_selecionadas: provasSel,
    teses_selecionadas: tesesSel,
  });
  const snap = await getDoc(doc(db, 'processos', procId));
  const p = snap.data();
  _estado = { procId, proc: p, fase: 'audiencia' };
  _renderRodadaAudiencia(procId, p);
};

function _renderRodadaAudiencia(procId, p) {
  const rd = p.rodada_audiencia || 0;
  if (rd >= 3) { window.processarSentenca(procId); return; }

  const arg = p.args_audiencia[rd];
  const meuLado = p.meu_lado || 'autor';
  const labelArg = meuLado === 'reu' ? 'O autor sustenta:' : 'A parte ré argumenta:';

  const opts = [
    { tipo:'tecnica',   txt:p.resps_audiencia.tecnica[rd] },
    { tipo:'agressiva', txt:p.resps_audiencia.agressiva[rd] },
    { tipo:'passiva',   txt:p.resps_audiencia.passiva[rd] },
  ].sort(() => Math.random() - 0.5);

  abrirModal('🏛️ Fase 2 de 3 — Audiência',
    `${_painelContextoProcesso(p)}
    <div class="ftag">${p.juiz.nome} · rodada ${rd+1} de 3</div>
    <div style="font-size:.72rem;color:var(--txt3);font-style:italic;margin-bottom:.5rem">${p.juiz.hint}</div>
    <div class="abox"><div class="albl">${labelArg}</div><div class="atxt">${arg.txt}</div></div>
    <div style="margin:.75rem 0">
      <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--txt3)">
        <span>convencimento do magistrado</span><span>${p.convencimento}</span>
      </div>
      <div style="height:6px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-top:.2rem">
        <div style="height:100%;width:${p.convencimento}%;background:linear-gradient(90deg,#e57373,#3aaa6a)"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${opts.map((o,i) => `<button class="rbtn" onclick="window.responderAudiencia('${procId}','${o.tipo}')"><span class="rl">${String.fromCharCode(65+i)}</span><span>${o.txt}</span></button>`).join('')}
    </div>`
  );
}

window.responderAudiencia = async function(procId, tipo) {
  const j = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const ok = await _gastarEnergia(ENERGIA_POR_RODADA_AUDIENCIA, 'Sustentação oral');
  if (!ok) return;

  const snap = await getDoc(doc(db, 'processos', procId));
  const p = snap.data();
  const rd = p.rodada_audiencia || 0;
  const arg = p.args_audiencia[rd];

  let d = tipo === arg.ideal ? 11 : tipo === arg.neutro ? 2 : -14;
  const perfilJuiz = p.juiz.perfil_oculto;
  if (perfilJuiz === 'formalista' && tipo === 'tecnica') d += 5;
  if (perfilJuiz === 'garantista' && tipo === 'agressiva') d += 5;
  if (perfilJuiz === 'conservador' && tipo === 'passiva') d -= 9;
  if (perfilJuiz === 'formalista' && tipo === 'agressiva') d -= 4;

  const provasSel = (p.provas_selecionadas || []).map(i => p.provas[i]);
  const fm = provasSel.length ? provasSel.reduce((s,pr) => s + (pr.forca || 60), 0) / provasSel.length : 60;
  if (fm >= 85 && tipo !== 'passiva') d += 5;
  else if (fm >= 65 && tipo !== 'passiva') d += 2;
  else if (fm < 50) d -= 4;
  else if (fm < 35) d -= 8;

  const tesesSel = p.teses_selecionadas || [];
  d += tesesSel.length * 2;
  if (tesesSel.length === 0) d -= 4;

  const novoCv = Math.max(5, Math.min(95, (p.convencimento || 38) + d));
  const novaRodada = rd + 1;
  const novoProgresso = Math.round((novaRodada / 3) * 100);

  // Registra o HISTÓRICO de respostas (rodada + tipo escolhido), não só o
  // convencimento final — é esse histórico que a Cloud Function usa para
  // RECALCULAR o resultado do zero na hora da sentença, em vez de confiar
  // no convencimento que o próprio cliente calculou e salvou. Sem isso, um
  // jogador malicioso poderia escrever qualquer score direto no Firestore.
  const historicoAnterior = p.historico_respostas_audiencia || [];
  const novoHistorico = [...historicoAnterior, { rodada: rd, tipo }];

  await updateDoc(doc(db, 'processos', procId), {
    convencimento: novoCv, // valor exibido imediatamente na UI (otimista)
    rodada_audiencia: novaRodada,
    progresso: novoProgresso,
    historico_respostas_audiencia: novoHistorico,
  });

  if (novaRodada >= 3) {
    window.processarSentenca(procId);
  } else {
    const snap2 = await getDoc(doc(db, 'processos', procId));
    _estado = { procId, proc: snap2.data(), fase: 'audiencia' };
    _renderRodadaAudiencia(procId, snap2.data());
  }
};

// ════════════════════════════════════════════════════════
// SENTENÇA DE 1ª INSTÂNCIA — substitui o cálculo antigo de chance única
// (Math.random()*100 < cs) pela classificação por faixa de convencimento
// (mesmos limiares calibrados no motor v8: 80 procedência total, 58
// favorável, 38 improcedência simples, abaixo disso agravada).
//
// REGRAS DE ECONOMIA (separadas por design):
//  - XP: ganho a cada decisão/instância, sempre cumulativo, nunca revertido.
//  - Reputação: ganha/perde a cada decisão, mesmo sabendo que pode ser
//    revertida depois (reflete o abalo real ao cliente).
//  - Dinheiro: só no TRÂNSITO EM JULGADO — fica "pendente" (hon_pendente)
//    até a cadeia de recursos se esgotar, para nunca pagar honorários de
//    uma vitória que pode ser cassada em recurso.
// ════════════════════════════════════════════════════════
window.processarSentenca = async function(procId) {
  const j = window.JOGADOR;
  const cargoIdx = CARGO_IDX[j?.cargo_id] || 0;
  const snapCheck = await getDoc(doc(db, 'processos', procId));
  if (!snapCheck.exists()) { toast('Processo não encontrado.', 'ko'); return; }
  const pCheck = snapCheck.data();
  const ehPool = !!pCheck.pool_escritorio_id;
  if (ehPool && (pCheck.progresso || 0) >= PROGRESSO_MAX_SEM_ADVOGADO && cargoIdx < CARGO_IDX_CONCLUSAO_MIN) {
    toast('🔒 Este caso precisa de um Advogado Júnior+ do escritório para assinar a sentença.', 'ko', 5000);
    return;
  }

  toast('⏳ Processando sentença...', 'neutro', 2000);
  fecharModal();

  // A Cloud Function RECALCULA o convencimento do zero a partir do
  // historico_respostas_audiencia salvo no Firestore — nunca confia no
  // campo `convencimento`, que é só exibição otimista calculada no
  // cliente e poderia ser adulterado.
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'processarSentenca');
    const result = await fn({ processo_id: procId });
    _mostrarResultadoSentenca(result.data, procId);
  } catch (err) {
    console.error('[SENTENÇA] Erro ao chamar Cloud Function:', err);
    toast('Erro ao processar a sentença. Tente novamente.', 'ko');
  }
};

function _mostrarResultadoSentenca(r, procId) {
  const icons = { procedente:'🏆', parcial:'⚖️', improcedente:'📋', improcedente_agravada:'❌' };
  const labelCategoria = {
    procedente: 'Procedente', parcial: 'Parcialmente Procedente',
    improcedente: 'Improcedente', improcedente_agravada: 'Improcedente',
  }[r.categoria] || r.categoria;
  const corCategoria = r.categoria === 'procedente' ? 'var(--verde2)'
    : r.categoria === 'parcial' ? 'var(--amber)'
    : 'var(--verm2)';

  // "Força da fundamentação contra você" — só faz sentido quando o
  // jogador perdeu (é a força da decisão que jogou contra ele).
  const fundamentacaoHtml = (r.aguardandoDecisaoDoJogador && r.score !== undefined)
    ? (() => {
        const classif = classificarSentenca(100 - r.score);
        return `<div style="font-size:.7rem;color:var(--txt3);font-style:italic;margin-top:.6rem">Força da fundamentação contra você: <b>${classif.label}</b>. ${classif.desc}</div>`;
      })()
    : '';

  let botoesHtml;
  if (r.aguardandoDecisaoDoJogador) {
    // Escolha real do jogador — nunca decidida automaticamente.
    botoesHtml = `
      <button class="btn-avancar-fase" style="margin-top:1rem" onclick="window.decidirRecursoSentencaProducao('${procId}', true)">
        <span>⚖️ Recorrer da decisão</span>
      </button>
      <button class="btn btn-ghost btn-block" style="margin-top:.5rem" onclick="window.decidirRecursoSentencaProducao('${procId}', false)">
        Aceitar a derrota e encerrar
      </button>`;
  } else {
    botoesHtml = `<button class="btn btn-prim btn-block" style="margin-top:1rem" onclick="fecharModal();window.navTo&&window.navTo('processos',null)">Fechar</button>`;
  }

  abrirModal(`${icons[r.categoria]||'⚖️'} Sentença`,
    `<div class="ftag">Sentença Final${r.instanciaSeguinte ? ' · próxima instância: ' + r.instanciaSeguinte : ''}</div>
    <div class="sh" style="justify-content:flex-start">${labelCategoria}${r.score!==undefined ? `<span class="score-pill" style="background:${corCategoria}22;color:${corCategoria}">score ${r.score}</span>` : ''}</div>
    <div style="font-size:.85rem;line-height:1.75;margin-bottom:.4rem;color:var(--txt2)">${r.txt}</div>
    ${fundamentacaoHtml}
    <div class="gains" style="margin-top:.8rem">
      <span class="gain" style="${r.repDelta<0?'background:rgba(192,57,43,.12);border-color:rgba(192,57,43,.3);color:#e57373':''}">${r.repDelta>=0?'+':''}${r.repDelta} Reputação</span>
      <span class="gain">+${r.xpGanho} XP</span>
    </div>
    ${r.hon > 0 ? `<div style="font-size:.95rem;color:var(--verde2);font-weight:700;margin-top:.65rem">💰 +${fmt(r.hon)} honorários (trânsito em julgado imediato)</div>` : ''}
    ${r.recorre ? `<div style="font-size:.75rem;color:var(--amber);margin-top:.65rem">📋 A parte contrária recorreu — caso entra na fila do ${r.instanciaSeguinte}. Acesse a carteira processual para sustentar.</div>` : ''}
    ${r.demitido ? `<div style="font-size:.8rem;color:var(--verm2);margin-top:.65rem;font-weight:600">⚠️ Demitido(a) — 5 derrotas consecutivas.</div>` : ''}
    ${botoesHtml}`
  );
}

// ════════════════════════════════════════════════════════
// DECIDIR RECURSO DA SENTENÇA — chama a Cloud Function que registra a
// escolha real do jogador (recorrer ou aceitar a derrota) quando o
// processo está em 'aguardando_decisao_recurso'. Antes esta decisão era
// tomada automaticamente por sorteio dentro da própria Cloud Function de
// sentença, sem nunca perguntar ao jogador.
// ════════════════════════════════════════════════════════
window.decidirRecursoSentencaProducao = async function(procId, recorrer) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'decidirRecursoSentenca');
    const result = await fn({ processo_id: procId, recorrer });
    if (document.getElementById('modal')?.classList.contains('vis')) fecharModal();
    toast(result.data.msg, recorrer ? 'ok' : 'neutro');
    setTimeout(() => window.navTo && window.navTo('processos', null), 400);
  } catch (err) {
    console.error('[SENTENÇA] Erro ao decidir recurso:', err);
    toast('Erro ao processar sua decisão. Tente novamente.', 'ko');
  }
};


// Honorários só são creditados aqui — no trânsito em julgado de fato.
// Continua existindo no frontend porque é usada por tentarAcordo() (uma
// ação cujo resultado de aceite/rejeição já é um sorteio simples, de baixo
// risco de exploração) — mas a sentença de 1ª instância e o acórdão do
// recurso agora SEMPRE creditam honorários através das Cloud Functions,
// nunca chamando esta função diretamente a partir desses dois fluxos.
async function _creditarHonorariosTransito(j, uid, hon) {
  if (j.escritorio_proprio_id) {
    const escSnap = await getDoc(doc(db, 'escritorios', j.escritorio_proprio_id));
    if (escSnap.exists()) {
      const esc = escSnap.data();
      await updateDoc(doc(db, 'escritorios', j.escritorio_proprio_id), { caixa: (esc.caixa||0) + hon });
      return { foiParaCaixa: true };
    }
  }
  await updateDoc(doc(db, 'jogadores', uid), {
    dinheiro: (j.dinheiro||0) + hon,
    honorarios_mes: (j.honorarios_mes||0) + hon,
  });
  return { foiParaCaixa: false };
}

async function _penalizarPrestigioEscritorio(escritorioId, repDelta) {
  try {
    const escSnap = await getDoc(doc(db, 'escritorios', escritorioId));
    if (escSnap.exists()) {
      const escRep = escSnap.data().prestigio || 10;
      await updateDoc(doc(db, 'escritorios', escritorioId), { prestigio: Math.max(0, escRep - Math.ceil(Math.abs(repDelta) * 0.5)) });
    }
  } catch (e) { console.warn('Penalidade rep escritório:', e); }
}

// ════════════════════════════════════════════════════════
// CARTEIRA PROCESSUAL — lista processos em status 'recurso_pendente'
// (aguardando movimentação ou já disponíveis para sustentar).
// ════════════════════════════════════════════════════════
window.renderCarteiraProcessual = async function(el) {
  const j = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const mesAtualTotal = mesTotalPessoalProc(j);

  // Casos INDIVIDUAIS do jogador (advogado_uid === uid).
  const snapIndividual = await getDocs(query(
    collection(db, 'processos'),
    where('advogado_uid', '==', uid),
    where('status', 'in', ['recurso_pendente', 'aguardando_decisao_recurso'])
  ));

  // Casos do POOL do escritório (advogado_uid é null por design — sem
  // este segundo bloco, recursos de casos colaborativos nunca apareciam
  // em lugar nenhum, mesmo já estando em fase de recurso de fato).
  const escId = j.escritorio_proprio_id || (j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo' ? j.escritorio_empregado_id : null);
  let snapPool = { docs: [] };
  if (escId) {
    snapPool = await getDocs(query(
      collection(db, 'processos'),
      where('pool_escritorio_id', '==', escId),
      where('status', 'in', ['recurso_pendente', 'aguardando_decisao_recurso'])
    ));
  }

  const procs = [
    ...snapIndividual.docs.map(d => ({ id: d.id, ...d.data() })),
    ...snapPool.docs.map(d => ({ id: d.id, ...d.data() })),
  ];

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">📁 Carteira Processual</div></div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:1rem">Acompanhe processos aguardando sua decisão de recurso, recursos disponíveis para sustentar, e prazos.</div>
    ${procs.length === 0 ? '<div class="card" style="text-align:center;padding:2rem;color:var(--txt3)">Nenhum processo em fila de recurso.</div>' :
      procs.map(p => {
        // Sentença perdida, ainda aguardando o JOGADOR decidir se recorre
        // (nunca decidido automaticamente — ver decidirRecursoSentenca).
        if (p.status === 'aguardando_decisao_recurso') {
          return `
          <div class="card" style="margin-bottom:.6rem;border-left:3px solid var(--amber)">
            <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4)">${p.numero}</div>
            <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${p.autor} vs ${p.reu}</div>
            <div style="font-size:.68rem;color:var(--txt3)">${p.tipo} · sentença desfavorável · score ${p.score_anterior}</div>
            <div style="display:flex;gap:.5rem;margin-top:.6rem">
              <button class="btn btn-sm btn-prim" style="flex:1" onclick="window.decidirRecursoSentencaProducao('${p.id}', true)">⚖️ Recorrer</button>
              <button class="btn btn-sm btn-ghost" style="flex:1" onclick="window.decidirRecursoSentencaProducao('${p.id}', false)">Aceitar derrota</button>
            </div>
          </div>`;
        }

        const disponivel = p.data_disponivel_recurso && mesTotalPessoalProc({mes_pessoal:p.data_disponivel_recurso.mes, ano_pessoal:p.data_disponivel_recurso.ano}) <= mesAtualTotal;
        const restante = p.prazo_final_recurso ? (mesTotalPessoalProc({mes_pessoal:p.prazo_final_recurso.mes, ano_pessoal:p.prazo_final_recurso.ano}) - mesAtualTotal) : null;
        const recorrenteLbl = p.quem_recorre === 'jogador' ? 'Você recorreu' : 'A parte contrária recorreu';
        return `
        <div class="card" style="margin-bottom:.6rem">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4)">${p.numero}</div>
              <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${p.autor} vs ${p.reu}</div>
              <div style="font-size:.68rem;color:var(--txt3)">${p.tipo} · ${recorrenteLbl} · score base: ${p.score_anterior}</div>
            </div>
            <span style="font-size:.65rem;font-weight:600;color:${disponivel?'var(--verde2)':'var(--txt4)'}">${disponivel?'⚖️ Recurso disponível':'Aguardando movimentação'}</span>
          </div>
          ${disponivel ? `<div style="font-size:.65rem;color:var(--txt3);margin-top:.4rem">Prazo: ${restante>0?restante+' mês(es) restante(s)':'PRAZO ESGOTADO'}</div>
            <button class="btn btn-sm btn-prim btn-block" style="margin-top:.5rem" onclick="window.jogarRecursoProducao('${p.id}')">⚖️ ${p.quem_recorre==='jogador'?'Sustentar Seu Recurso':'Defender a Sentença'} — ${p.instancia_seguinte}</button>` : ''}
        </div>`;
      }).join('')}`;
};

// ════════════════════════════════════════════════════════
// POOL DO ESCRITÓRIO — listagem dos casos colaborativos visíveis a
// qualquer funcionário (dono ou empregado) do escritório. Antes essa
// listagem não tinha nenhuma tela que a chamasse: os casos eram criados
// no Firestore corretamente (via novoProcessoPool/novoProcessoPoolEmpregado)
// mas ficavam invisíveis para o jogador, sem nenhuma forma de acessá-los
// pela interface.
// ════════════════════════════════════════════════════════
window.renderPoolEscritorio = async function(el) {
  const j = window.JOGADOR;
  if (!j) return;
  const ehDeEscritorio = j.escritorio_proprio_id || (j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo');
  if (!ehDeEscritorio) {
    el.innerHTML = '';
    return;
  }

  const casos = await buscarCasosPoolEscritorio(j);
  const mesAtualTotal = mesTotalPessoalProc(j);
  const uid = j.uid || window.JOGADOR_UID;

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">🏢 Pool do Escritório</div></div>
    <div style="font-size:.72rem;color:var(--txt3);margin-bottom:1rem">Casos colaborativos disponíveis para qualquer funcionário do escritório trabalhar.</div>
    ${casos.length === 0 ? '<div class="card" style="text-align:center;padding:2rem;color:var(--txt3)">Nenhum caso no pool no momento. Capte um novo caso para o escritório.</div>' :
      casos.map(p => {
        const restante = p.prazo_limite_mes ? (p.prazo_limite_mes - mesAtualTotal) : null;
        const jaContribui = (p.contribuintes || []).some(c => c.uid === uid);
        const progresso = p.progresso || 0;
        return `
        <div class="card" style="margin-bottom:.6rem">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--txt4)">${p.numero}</div>
              <div style="font-weight:700;font-size:.85rem;color:var(--navy)">${p.autor} vs ${p.reu}</div>
              <div style="font-size:.68rem;color:var(--txt3)">${p.tipo} · progresso ${progresso}%${jaContribui ? ' · você já contribuiu' : ''}</div>
              ${restante !== null ? `<div style="font-size:.65rem;color:${restante<=1?'var(--verm2)':'var(--txt4)'}">Prazo: ${restante>0?restante+' mês(es) restante(s)':'PRAZO ESGOTADO'}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-prim btn-block" style="margin-top:.5rem" onclick="window.abrirProcesso('${p.id}')">⚖️ ${jaContribui?'Continuar':'Assumir'} caso →</button>
        </div>`;
      }).join('')}`;
};

// ════════════════════════════════════════════════════════
// RECURSO — preparação, composição do colegiado, sustentação, apuração.
// ════════════════════════════════════════════════════════
let RECURSO_ATIVO = null;
let BANCO_JULGADOR = null;
let SCORES_JULGADOR = [];
let recursoRd = 0;
let estrategiasEscolhidas = [];

window.jogarRecursoProducao = async function(procId) {
  const j = window.JOGADOR;
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) { toast('Processo não encontrado.', 'ko'); return; }
  RECURSO_ATIVO = { id: procId, ...snap.data() };

  // ── TRAVA DE CAPACIDADE POSTULATÓRIA ──
  // Só se aplica quando É O JOGADOR quem precisa SUSTENTAR (recorrer ou
  // defender um recurso ofensivo da parte contrária ofende sua própria
  // sentença) — defender uma vitória própria qualquer cargo pode fazer.
  if (RECURSO_ATIVO.quem_recorre === 'jogador' && !cargoPodeSustentar(j.cargo_id, RECURSO_ATIVO.instancia_seguinte)) {
    const escId = j.escritorio_proprio_id || j.escritorio_empregado_id;
    const repasse = await buscarRepasseEscritorio(escId, j.uid, RECURSO_ATIVO.instancia_seguinte);
    if (!repasse) {
      toast(`🔒 Seu cargo não tem capacidade postulatória para sustentar no ${RECURSO_ATIVO.instancia_seguinte}, e ninguém no seu escritório tem cargo suficiente. Evolua de cargo antes do prazo expirar.`, 'ko', 7000);
      return;
    }
    toast(`🔁 Seu cargo não alcança o ${RECURSO_ATIVO.instancia_seguinte}. ${repasse.nome} do seu escritório assumiu a sustentação.`, 'neutro', 6000);
    // Repasse: troca o advogado responsável pela sustentação narrativamente,
    // mas o jogador ainda acompanha o resultado normalmente.
  }

  const tribInfo = PERFIL_TRIBUNAL[RECURSO_ATIVO.instancia_seguinte];
  const numVotos = tribInfo.votos || 3;
  estrategiasEscolhidas = [];
  BANCO_JULGADOR = gerarBancoJulgador(numVotos, RECURSO_ATIVO.instancia_seguinte);

  _renderPreparacaoRecurso(tribInfo);
};

function _renderPreparacaoRecurso(tribInfo) {
  const fundamentosSentenca = (RECURSO_ATIVO.teses_selecionadas || []).length
    ? RECURSO_ATIVO.teses_selecionadas.map(i => RECURSO_ATIVO.teses[i]?.nome).filter(Boolean)
    : ['Apreciação do conjunto fático-probatório'];

  const POOL_PONTOS_RECORRENTE = [
    'Valoração incorreta das provas','Interpretação equivocada da legislação aplicável',
    'Divergência com jurisprudência consolidada dos tribunais superiores','Desconsideração de precedente vinculante aplicável ao caso',
    'Conclusão pericial não devidamente considerada na sentença','Matéria constitucional não enfrentada pelo juízo a quo',
    'Prazo prescricional ou decadencial mal computado na decisão recorrida','Fundamentação insuficiente quanto a ponto essencial da controvérsia',
  ];
  const POOL_PONTOS_CONTRARIO = [
    'Cerceamento de defesa alegado pela parte contrária','Suposta valoração incorreta das provas pelo juízo a quo',
    'Alegada divergência com entendimento jurisprudencial dominante','Questionamento sobre a aplicação de precedente ao caso concreto',
    'Impugnação à conclusão técnica do laudo pericial produzido','Arguição de violação a princípio constitucional pelo julgado',
    'Alegação de equívoco na contagem do prazo prescricional aplicável',
  ];
  const pool = RECURSO_ATIVO.quem_recorre === 'jogador' ? POOL_PONTOS_RECORRENTE : POOL_PONTOS_CONTRARIO;
  const pontosAtacados = [...pool].sort(() => Math.random()-0.5).slice(0,2);

  abrirModal(`${tribInfo.nome} · Fase 1 de 2 — Preparação`,
    `${_painelContextoProcesso(RECURSO_ATIVO)}
    <div class="fsub">${tribInfo.nome} ${tribInfo.desc}.</div>

    <div class="stitle">Composição do Colegiado</div>
    <div style="margin-bottom:14px;display:flex;flex-direction:column;gap:6px">
      ${BANCO_JULGADOR.map(jz => `
        <div style="background:#1a2332;border:1px solid #2a3548;border-radius:6px;padding:8px 10px">
          <div style="font-size:12px;font-weight:700;color:#e2c97e">${jz.cargo.toUpperCase()} — ${jz.nome}</div>
          <div style="font-size:11px;color:#8a95a8;margin-top:2px">${HINT_CLASSE_JULGADOR[jz.classe] || ''}</div>
        </div>`).join('')}
    </div>

    <div class="stitle">Decisão Recorrida — Fundamentos</div>
    <div style="margin-bottom:12px">${fundamentosSentenca.map(f => `<div style="font-size:12px;color:#b8b0a0;padding:4px 0">✓ ${f}</div>`).join('')}</div>

    <div class="stitle">Pontos Atacados pelo Recorrente</div>
    <div style="margin-bottom:14px">${pontosAtacados.map(p => `<div style="font-size:12px;color:#e2c97e;padding:4px 0">✓ ${p}</div>`).join('')}</div>

    <div class="stitle">Escolha até 2 Estratégias Recursais</div>
    <div id="estrategias-list" style="margin-bottom:10px">
      ${_estrategiasRecursoAtuais().map((e,i) => `
        <div class="ti" id="est${i}" onclick="window.togEstrategiaProducao(${i})">
          <div class="tck" id="estck${i}"></div>
          <div><div class="tnm">${e.nome}</div><div class="tds">${e.desc}</div></div>
        </div>`).join('')}
    </div>
    <button class="btn-avancar-fase" id="btn-prep-recurso" disabled onclick="window.confirmarPreparacaoProducao()">
      <span>Protocolar Sustentação</span><span class="baf-seta">→</span>
    </button>`
  );
}

window.togEstrategiaProducao = function(i) {
  const idx = estrategiasEscolhidas.indexOf(i);
  if (idx >= 0) {
    estrategiasEscolhidas.splice(idx,1);
    document.getElementById('est'+i)?.classList.remove('sel');
    document.getElementById('estck'+i).textContent = '';
  } else if (estrategiasEscolhidas.length < 2) {
    estrategiasEscolhidas.push(i);
    document.getElementById('est'+i)?.classList.add('sel');
    document.getElementById('estck'+i).textContent = '✓';
  }
  document.getElementById('btn-prep-recurso').disabled = estrategiasEscolhidas.length < 1;
};

window.confirmarPreparacaoProducao = async function() {
  const ok = await _gastarEnergia(ENERGIA_PREPARACAO_RECURSO, 'Preparação do recurso');
  if (!ok) return;
  recursoRd = 0;
  const base = Math.round(RECURSO_ATIVO.score_anterior * 0.6 + 40 * 0.4);
  // Sensibilidade individual sorteada AQUI e PERSISTIDA — junto com o
  // colegiado (nomes/classes), passa a viver no Firestore, não só na
  // memória do cliente. Isso é o que permite a Cloud Function recalcular
  // o julgamento do zero a partir do histórico de respostas, sem confiar
  // em nenhum score calculado no navegador.
  SCORES_JULGADOR = BANCO_JULGADOR.map(jz => ({
    ...jz,
    score: Math.max(5, Math.min(95, base + (Math.random()*40-20))),
    sensibilidade: 0.45 + Math.random()*1.25,
  }));

  await updateDoc(doc(db, 'processos', RECURSO_ATIVO.id), {
    colegiado_recurso: SCORES_JULGADOR.map(jz => ({ cargo: jz.cargo, nome: jz.nome, classe: jz.classe, sensibilidade: jz.sensibilidade, score_inicial: jz.score })),
    estrategias_recurso: estrategiasEscolhidas,
    historico_respostas_recurso: [],
  });

  _renderRodadaRecurso();
};

// ── ARGUMENTOS E RESPOSTAS DA SUSTENTAÇÃO RECURSAL — 2 rodadas fixas,
// uma para cada perspectiva (defesa/recorrente). Rodada 0 = tema valoração
// das provas, rodada 1 = tema legislação/dispositivo legal — mesmo
// alinhamento temático usado em respRecurso() (ver temaDaRodada).
const ARGS_RECURSO_DEFESA = [
  {txt:'A parte recorrente sustenta que a sentença não apreciou corretamente as provas dos autos.',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrente requer a reforma integral por violação a dispositivo legal.',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
];
const ARGS_RECURSO_RECORRENTE = [
  {txt:'A parte recorrida sustenta que a sentença apreciou corretamente as provas dos autos, não havendo o que reformar.',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrida requer a manutenção integral da decisão, por ausência de violação a dispositivo legal.',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
];
const RESPS_RECURSO_DEFESA = {
  tecnica:['Mantenho que a valoração das provas na sentença recorrida foi correta e suficiente para o convencimento do juízo.','A aplicação da legislação na sentença recorrida foi correta, não havendo violação a dispositivo legal.'],
  agressiva:['A insurgência recursal sobre as provas carece de qualquer fundamento jurídico novo.','O recurso é mera tentativa de rediscutir a aplicação da lei já corretamente decidida.'],
  passiva:['Submeto a valoração das provas à elevada apreciação deste Tribunal.','Reconheço que a interpretação da norma é passível de reanálise.'],
};
const RESPS_RECURSO_RECORRENTE = {
  tecnica:['A sentença recorrida não valorou corretamente as provas dos autos, impondo-se sua reforma.','A sentença recorrida não aplicou corretamente a legislação ao caso, impondo-se sua reforma.'],
  agressiva:['A defesa da valoração das provas carece de qualquer fundamento que afaste a reforma.','A resistência à reforma com base na legislação é mera tentativa de manter um erro já demonstrado.'],
  passiva:['Submeto a valoração das provas à elevada apreciação deste Tribunal, confiante na reforma.','Submeto a aplicação da legislação à reanálise deste Tribunal, e peço que seja revista a meu favor.'],
};

function _argsRecursoAtuais() {
  return RECURSO_ATIVO.quem_recorre === 'jogador' ? ARGS_RECURSO_RECORRENTE : ARGS_RECURSO_DEFESA;
}
function _respsRecursoAtuais() {
  return RECURSO_ATIVO.quem_recorre === 'jogador' ? RESPS_RECURSO_RECORRENTE : RESPS_RECURSO_DEFESA;
}

function _renderRodadaRecurso() {
  const ARGS = _argsRecursoAtuais();
  if (recursoRd >= ARGS.length) { _renderApuracaoVotos(); return; }
  const a = ARGS[recursoRd];
  const RESPS = _respsRecursoAtuais();
  const labelParteContraria = RECURSO_ATIVO.quem_recorre === 'jogador' ? 'Parte recorrida (defende a manutenção):' : 'Parte recorrente no recurso:';

  const opts = [
    { tipo:'tecnica', txt:RESPS.tecnica[recursoRd] },
    { tipo:'agressiva', txt:RESPS.agressiva[recursoRd] },
    { tipo:'passiva', txt:RESPS.passiva[recursoRd] },
  ].sort(() => Math.random() - 0.5);

  abrirModal(`Fase 2 de 2 — Julgamento · rodada ${recursoRd+1} de ${ARGS.length}`,
    `${_painelContextoProcesso(RECURSO_ATIVO)}
    <div class="fh">Sustentação Recursal</div>
    <div class="abox"><div class="albl">${labelParteContraria}</div><div class="atxt">${a.txt}</div></div>
    <div class="stitle" style="margin-bottom:8px">Convencimento individual</div>
    <div class="timeline" id="votos-preview">
      ${SCORES_JULGADOR.map((jz,i) => `
        <div class="timeline-item atual">
          <div class="timeline-inst" style="font-size:10px">${jz.cargo.toUpperCase()}</div>
          <div style="font-size:11px;font-weight:600;margin-bottom:2px">${jz.nome}</div>
          <div class="timeline-score" id="score-${i}">${Math.round(jz.score)}</div>
        </div>`).join('')}
    </div>
    <div class="fbx" id="rec-fbk">O colegiado aguarda manifestação.</div>
    <div id="rec-rs">${opts.map((o,i) => `<button class="rbtn" onclick="window.responderRecursoProducao('${o.tipo}')"><span class="rl">${String.fromCharCode(65+i)}</span><span>${o.txt}</span></button>`).join('')}</div>`
  );
}

window.responderRecursoProducao = async function(tipo) {
  const ok = await _gastarEnergia(ENERGIA_POR_RODADA_RECURSO, 'Sustentação recursal');
  if (!ok) return;

  const ARGS = _argsRecursoAtuais();
  const a = ARGS[recursoRd];
  const euSouDefesa = RECURSO_ATIVO.quem_recorre === 'parte_contraria';
  const sinal = euSouDefesa ? -1 : 1;
  const baseD = (tipo === a.ideal ? 7 : tipo === a.neutro ? 1 : -10) * sinal;

  const temaDaRodada = recursoRd === 0 ? 'prova_documental' : 'prazo';
  const temaDoTipo = tipo === 'agressiva' ? 'agressivo' : tipo === 'passiva' ? 'passivo' : null;

  SCORES_JULGADOR.forEach(jz => {
    let d = baseD;
    if (tipo === 'tecnica') d += pesoTemaPorClasse(temaDaRodada, jz.classe) * 0.5 * sinal;
    if (temaDoTipo) d += pesoTemaPorClasse(temaDoTipo, jz.classe) * sinal;
    estrategiasEscolhidas.forEach(idx => {
      const est = _estrategiasRecursoAtuais()[idx];
      d += pesoTemaPorClasse(est.afeta, jz.classe) * 0.6 * sinal;
    });
    d *= (jz.sensibilidade || 1);
    jz.score = Math.max(5, Math.min(95, jz.score + d)); // exibição otimista local
  });

  // Persiste o histórico bruto (rodada + tipo escolhido) — fonte de
  // verdade que a Cloud Function usa para recalcular o julgamento do
  // zero, em vez de confiar no SCORES_JULGADOR calculado no navegador
  // (que pode ser adulterado via console/DevTools).
  const snap = await getDoc(doc(db, 'processos', RECURSO_ATIVO.id));
  const historicoAnterior = snap.exists() ? (snap.data().historico_respostas_recurso || []) : [];
  await updateDoc(doc(db, 'processos', RECURSO_ATIVO.id), {
    historico_respostas_recurso: [...historicoAnterior, { rodada: recursoRd, tipo }],
  });

  recursoRd++;
  _renderRodadaRecurso();
};

// ════════════════════════════════════════════════════════
// APURAÇÃO DE VOTOS E ACÓRDÃO
// (a lógica de categoria por placar e trava de goleada agora vive
// exclusivamente no módulo compartilhado functions/shared/banco_juridico.js
// e é executada pela Cloud Function 'processarAcordao' — removida do
// frontend para não ter duas fontes de verdade da mesma regra jurídica.)
// ════════════════════════════════════════════════════════
function _renderApuracaoVotos() {
  const tribInfo = PERFIL_TRIBUNAL[RECURSO_ATIVO.instancia_seguinte];
  let html = `<div class="fh">Apuração dos Votos</div>
    <div class="timeline" id="votos-final">
      ${SCORES_JULGADOR.map((jz,i) => `
        <div class="timeline-item" id="voto-${i}">
          <div class="timeline-inst" style="font-size:10px">${jz.cargo.toUpperCase()}</div>
          <div style="font-size:11px;font-weight:600;margin-bottom:2px">${jz.nome}</div>
          <div class="timeline-score">⬜ aguardando</div>
        </div>`).join('')}
    </div>
    <div class="fbx" id="apuracao-fbk" style="text-align:center">Apurando votos...</div>`;
  abrirModal(`${tribInfo.nome} · Julgamento Colegiado`, html);

  // A animação de apuração ainda usa SCORES_JULGADOR local (exibição
  // otimista, calculada igual ao servidor vai recalcular) — mas o
  // RESULTADO REAL (reputação, XP, honorários, próxima instância) só é
  // decidido pela Cloud Function chamada em _processarAcordaoProducao(),
  // nunca pelo que está calculado aqui na memória do cliente.
  let i = 0;
  const intervalo = setInterval(() => {
    if (i >= SCORES_JULGADOR.length) { clearInterval(intervalo); setTimeout(_processarAcordaoProducao, 800); return; }
    const jz = SCORES_JULGADOR[i];
    const score = Math.round(jz.score);
    const reforma = score >= 50;
    const favoravelAoJogador = RECURSO_ATIVO.quem_recorre === 'jogador' ? reforma : !reforma;
    const el = document.getElementById('voto-'+i);
    if (el) {
      if (reforma) el.classList.add('done');
      el.style.borderColor = favoravelAoJogador ? '#3aaa6a' : '#e57373';
      el.querySelector('.timeline-score').innerHTML = `${reforma?'✅ Reforma':'❌ Mantém'}<br><span style="font-size:9px">score ${score}</span>`;
    }
    i++;
  }, 700);
}

// ════════════════════════════════════════════════════════
// PROCESSAR ACÓRDÃO — chama a Cloud Function 'processarAcordao', que
// RECALCULA o julgamento do zero a partir do histórico persistido
// (colegiado_recurso, estrategias_recurso, historico_respostas_recurso),
// nunca confiando em SCORES_JULGADOR ou em qualquer cálculo feito aqui no
// cliente. Tudo que muda saldo/reputação/XP/honorários é decidido no
// servidor.
// ════════════════════════════════════════════════════════
async function _processarAcordaoProducao() {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'processarAcordao');
    const result = await fn({ processo_id: RECURSO_ATIVO.id });
    _mostrarResultadoAcordao(result.data);
  } catch (err) {
    console.error('[ACÓRDÃO] Erro ao chamar Cloud Function:', err);
    toast('Erro ao processar o acórdão. Tente novamente.', 'ko');
  }
}

function _mostrarResultadoAcordao(r) {
  const tribInfo = PERFIL_TRIBUNAL[RECURSO_ATIVO.instancia_seguinte];
  const labelCategoria = { mantem:'Mantida a Decisão Recorrida', reforma_parcial:'Reforma Parcial', reforma_total:'Reforma Total' }[r.categoria];

  let htmlProx = '';
  if (r.ehTopo) {
    htmlProx = `<div style="font-size:11px;color:#3aaa6a;margin-top:10px">⚖️ Acórdão do STF — trânsito em julgado imediato. Não há recurso adicional.</div>`;
  } else if (r.travado) {
    htmlProx = `<div style="font-size:11px;color:#807060;margin-top:10px;font-style:italic">🔒 Placar de goleada (${r.placar}) — acesso à instância superior está travado para ambas as partes. Trânsito em julgado.</div>`;
  } else if (r.transitouSemRecurso) {
    htmlProx = `<div style="font-size:11px;color:#3aaa6a;margin-top:10px">✅ Placar ${r.placar} permitiria recurso, mas a parte vencida optou por não recorrer. Trânsito em julgado.</div>`;
  } else if (r.parteContrariaRecorreu) {
    htmlProx = `<div style="font-size:11px;color:#e2c97e;margin-top:10px">📋 Placar ${r.placar} permite recurso à instância superior. A <b>parte vencida recorreu</b> — o processo entra na fila do <b>${r.proxTribunalNome}</b>.</div>`;
  } else if (r.podeRecorrer) {
    htmlProx = `
      <div style="font-size:11px;color:#e2c97e;margin-top:10px;margin-bottom:8px">📋 Placar ${r.placar} permite que você recorra ao ${r.proxTribunalNome}.</div>
      <div style="display:flex;gap:8px">
        <button onclick="window.recorrerProximaInstanciaProducao(true)" style="flex:1">⚖️ Recorrer ao ${r.proxTribunalNome}</button>
        <button class="btn-ghost" onclick="window.recorrerProximaInstanciaProducao(false)" style="flex:1">Aceitar e encerrar</button>
      </div>`;
  }
  if (r.honCreditado > 0) {
    htmlProx += `<div style="font-size:13px;color:#3aaa6a;font-weight:700;margin-top:10px">💰 +${fmt(r.honCreditado)} honorários${r.honNoCaixa?' (caixa do escritório)':''} — trânsito em julgado.</div>`;
  }

  window._dadosRecursoProximaInstancia = r;

  abrirModal(`Acórdão · ${tribInfo.nome}`,
    `<div class="fh" style="margin-bottom:14px">Resultado do Recurso</div>
    <div class="sbox">
      <div class="sico">${r.ico}</div>
      <div class="sh" style="color:${r.cor}">${labelCategoria}<span class="score-pill" style="background:${r.cor}22;color:${r.cor}">placar ${r.placar}</span></div>
      <div class="stxt">${r.txt}</div>
      <div class="gains">
        <span class="gain" style="${r.repDelta<0?'background:rgba(192,57,43,.12);border-color:rgba(192,57,43,.3);color:#e57373':''}">${r.repDelta>=0?'+':''}${r.repDelta} Reputação</span>
        <span class="gain">+${r.xpGanho} XP</span>
      </div>
      ${htmlProx}
      <button onclick="fecharModal();window.navTo&&window.navTo('processos',null)" style="margin-top:16px">📁 Voltar à carteira</button>
    </div>`
  );
}

window.recorrerProximaInstanciaProducao = async function(recorrer) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'decidirProximaInstancia');
    const result = await fn({ processo_id: RECURSO_ATIVO.id, recorrer });
    fecharModal();
    toast(result.data.msg, recorrer ? 'ok' : 'neutro');
  } catch (err) {
    console.error('[RECURSO] Erro ao decidir próxima instância:', err);
    toast('Erro ao processar sua decisão. Tente novamente.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// ACORDO
// ════════════════════════════════════════════════════════
window.tentarAcordo = async function(procId) {
  const ok = await _gastarEnergia(5, 'Tentativa de acordo');
  if (!ok) return;
  const j = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const snap = await getDoc(doc(db, 'processos', procId));
  if (!snap.exists()) return;
  const p = snap.data();
  const cv = p.convencimento || 38;
  const aceito = Math.random() < (cv/120 + 0.25);
  const isSolo = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  if (aceito) {
    const suc = Math.floor(p.valor * 0.10);
    const hon = isSolo ? Math.floor((p.valor*0.30 + suc) / 2) : Math.floor(suc*0.10/2);
    await updateDoc(doc(db, 'processos', procId), { status:'ganho', encerrado_mes: mesTotalPessoalProc(j), hon_total_acumulado: hon });
    await updateDoc(doc(db, 'jogadores', uid), { wins:(j.wins||0)+1, wins_ano:(j.wins_ano||0)+1, derrotas_consecutivas:0 });
    const { foiParaCaixa } = await _creditarHonorariosTransito(j, uid, hon);
    fecharModal();
    toast(`🤝 Acordo! +${fmt(hon)} honorários${foiParaCaixa?' (no caixa do escritório)':''}`, 'ok');
  } else {
    toast('❌ Proposta de acordo rejeitada.', 'ko');
  }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO — quando o jogador trabalha em escritório (dono OU
// empregado), TODO processo nasce no POOL do escritório, nunca
// individual. Geração é sempre manual (o jogador clica "Novo caso"),
// nunca automática — isso é proposital: gera demanda conforme aceitação
// real do jogador, evitando gargalo de casos parados que ninguém pediu.
//
// Limite mensal por cargo do FUNCIONÁRIO (jnr+ apenas — est/ass não
// geram, só recebem o que já está no pool). Dono do escritório usa um
// limite diferente, por Tier do escritório (ver LIMITE_POOL_CASOS_MES_TIER
// em novoProcessoPool).
// ════════════════════════════════════════════════════════
const LIMITE_NOVOS_PROCESSOS_CARGO = { est:0, ass:0, jnr:2, pln:3, snr:5, asc:7, soc:10, snm:15 };

window.novoProcesso = async function() {
  const j = window.JOGADOR;
  if (!j) return;
  const uid = j.uid || window.JOGADOR_UID;
  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes||0));
  if (j.em_burnout) { toast('🔴 Em burnout. Descanse antes de novos casos.', 'ko'); return; }

  // Dono de escritório: capta pro pool do PRÓPRIO escritório, com limite por Tier.
  if (j.escritorio_proprio_id) { await window.novoProcessoPool(); return; }

  // Empregado de escritório de outra pessoa (NPC ou jogador): TODO
  // processo também nasce no pool do empregador, nunca individual —
  // mesma regra do dono, só que com limite por CARGO em vez de por Tier.
  const isEmpregado = j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo';
  if (isEmpregado) { await window.novoProcessoPoolEmpregado(); return; }

  // Solo (sem escritório): único caso em que o processo continua individual.
  if (energiaDisp < 5) { toast('⚡ Energia insuficiente para novos casos.', 'ko'); return; }

  const proc = _gerarProcessoCompleto(j);
  try {
    await addDoc(collection(db, 'processos'), proc);
    toast(`📁 Novo caso: ${proc.tipo}`, 'ok');
    setTimeout(() => window.navTo && window.navTo('processos', null), 400);
  } catch (err) { toast('Erro ao criar processo.', 'ko'); console.error(err); }
};

// ════════════════════════════════════════════════════════
// NOVO PROCESSO DO POOL — gerado por um FUNCIONÁRIO EMPREGADO (não dono)
// para o pool do escritório onde trabalha. Espelha novoProcessoPool()
// (dono), mas usa o limite por CARGO em vez de por Tier do escritório, e
// nunca debita energia do "dono" — debita do próprio funcionário que
// captou, como custo de prospecção.
// ════════════════════════════════════════════════════════
window.novoProcessoPoolEmpregado = async function() {
  const j = window.JOGADOR;
  if (!j || !j.escritorio_empregado_id || j.escritorio_empregado_id === 'solo') return;
  const uid = j.uid || window.JOGADOR_UID;

  if (j.cargo_id === 'est' || j.cargo_id === 'ass') {
    toast('🔒 Estagiários e Assistentes não geram processos novos — vocês recebem casos já existentes no pool do escritório.', 'ko', 6000);
    return;
  }

  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes||0));
  if (energiaDisp < ENERGIA_CAPTAR_CASO_POOL) {
    toast(`⚡ Energia insuficiente para captar caso (requer ${ENERGIA_CAPTAR_CASO_POOL}⚡).`, 'ko');
    return;
  }

  const limite = LIMITE_NOVOS_PROCESSOS_CARGO[j.cargo_id] ?? 1;
  const usados = j.processos_novos_mes || 0;
  if (usados >= limite) {
    toast(`🔒 Limite mensal de captação atingido (${usados}/${limite} no seu cargo).`, 'ko', 5000);
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', j.escritorio_empregado_id));
  if (!escSnap.exists()) { toast('Escritório não encontrado.', 'ko'); return; }
  const esc = escSnap.data();

  // Mesmo teto de casos ABERTOS simultaneamente do escritório (por Tier)
  // que já existe para o dono — funcionários captando também respeitam
  // esse limite, para não furar a trava por outra porta.
  const tier = esc.tier || 1;
  const limiteAbertos = LIMITE_POOL_CASOS_ABERTOS_TIER[tier] || LIMITE_POOL_CASOS_ABERTOS_TIER[1];
  const abertosSnap = await getDocs(query(
    collection(db, 'processos'),
    where('pool_escritorio_id', '==', j.escritorio_empregado_id),
    where('status', '==', 'andamento')
  ));
  if (abertosSnap.size >= limiteAbertos) {
    toast(`🔒 Fila do escritório cheia (${abertosSnap.size}/${limiteAbertos} casos abertos). Conclua casos antes de captar novos.`, 'ko', 6000);
    return;
  }

  const proc = _gerarProcessoCompleto(j);
  proc.pool_escritorio_id = j.escritorio_empregado_id;
  proc.escritorio_nome_etiqueta = esc.nome || j.escritorio_nome || null;
  proc.distribuido_pelo_escritorio = true;
  proc.prazo_limite_mes = mesTotalPessoalProc(j) + PRAZO_POOL_MESES;
  proc.contribuintes = [];
  proc.advogado_uid = null;

  try {
    await addDoc(collection(db, 'processos'), proc);
    await updateDoc(doc(db, 'jogadores', uid), {
      processos_novos_mes: usados + 1,
      energia_usada_mes: (j.energia_usada_mes||0) + ENERGIA_CAPTAR_CASO_POOL,
    });
    toast(`📁 Caso captado para o escritório: ${proc.tipo} (${usados+1}/${limite} este mês)`, 'ok', 4000);
    setTimeout(() => window.navTo && window.navTo('processos', null), 400);
  } catch (err) { toast('Erro ao captar caso para o escritório.', 'ko'); console.error(err); }
};

window.novoProcessoPool = async function() {
  const j = window.JOGADOR;
  if (!j || !j.escritorio_proprio_id) return;
  const uid = j.uid || window.JOGADOR_UID;
  if (j.em_burnout) { toast('🔴 Em burnout. Descanse antes de captar novos casos.', 'ko'); return; }

  const energiaDisp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - (j.energia_usada_mes||0));
  if (energiaDisp < ENERGIA_CAPTAR_CASO_POOL) {
    toast(`⚡ Energia insuficiente para captar caso (requer ${ENERGIA_CAPTAR_CASO_POOL}⚡).`, 'ko');
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', j.escritorio_proprio_id));
  if (!escSnap.exists()) { toast('Escritório não encontrado.', 'ko'); return; }
  const esc = escSnap.data();
  const tier = esc.tier || 1;
  const limiteMes = LIMITE_POOL_CASOS_MES_TIER[tier] || LIMITE_POOL_CASOS_MES_TIER[1];
  const limiteAbertos = LIMITE_POOL_CASOS_ABERTOS_TIER[tier] || LIMITE_POOL_CASOS_ABERTOS_TIER[1];

  const usadosMes = esc.pool_casos_criados_mes || 0;
  if (usadosMes >= limiteMes) {
    toast(`🔒 Limite mensal de captação atingido (${usadosMes}/${limiteMes} para Tier ${tier}).`, 'ko', 5000);
    return;
  }

  const abertosSnap = await getDocs(query(
    collection(db, 'processos'),
    where('pool_escritorio_id', '==', j.escritorio_proprio_id),
    where('status', '==', 'andamento')
  ));
  if (abertosSnap.size >= limiteAbertos) {
    toast(`🔒 Fila do escritório cheia (${abertosSnap.size}/${limiteAbertos} casos abertos). Conclua casos antes de captar novos.`, 'ko', 6000);
    return;
  }

  const proc = _gerarProcessoCompleto(j);
  proc.pool_escritorio_id = j.escritorio_proprio_id;
  proc.escritorio_nome_etiqueta = esc.nome || j.escritorio_nome || null;
  proc.distribuido_pelo_escritorio = true;
  proc.prazo_limite_mes = mesTotalPessoalProc(j) + PRAZO_POOL_MESES;
  proc.contribuintes = [];
  proc.advogado_uid = null;

  try {
    await addDoc(collection(db, 'processos'), proc);
    await updateDoc(doc(db, 'escritorios', j.escritorio_proprio_id), { pool_casos_criados_mes: usadosMes + 1 });
    await updateDoc(doc(db, 'jogadores', uid), { energia_usada_mes: (j.energia_usada_mes||0) + ENERGIA_CAPTAR_CASO_POOL });
    toast(`📁 Caso captado para o escritório: ${proc.tipo} (${usadosMes+1}/${limiteMes} este mês)`, 'ok', 4000);
    setTimeout(() => window.navTo && window.navTo('processos', null), 400);
  } catch (err) { toast('Erro ao captar caso para o escritório.', 'ko'); console.error(err); }
};

// ════════════════════════════════════════════════════════
// LISTAGEM DO POOL
// ════════════════════════════════════════════════════════
export async function buscarCasosPoolEscritorio(j) {
  const escId = j.escritorio_proprio_id || (j.escritorio_empregado_id && j.escritorio_empregado_id !== 'solo' ? j.escritorio_empregado_id : null);
  if (!escId) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'processos'),
      where('pool_escritorio_id', '==', escId),
      where('status', '==', 'andamento')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.warn('[POOL] Erro ao buscar casos do pool:', err); return []; }
}
window.buscarCasosPoolEscritorio = buscarCasosPoolEscritorio;

async function _registrarContribuinte(procId, p, j) {
  const uid = j.uid || window.JOGADOR_UID;
  const ja = (p.contribuintes || []).some(c => c.uid === uid);
  if (ja) return;
  const novos = [...(p.contribuintes || []), { uid, nome: j.nome_personagem || 'Advogado' }];
  await updateDoc(doc(db, 'processos', procId), { contribuintes: novos });
}

async function _gastarEnergia(custo, desc) {
  const j = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  const usado = j?.energia_usada_mes || 0;
  const disp = Math.max(0, (window.getEnergiaTotal ? window.getEnergiaTotal(j) : 100) - usado);
  if (disp < custo) { toast(`⚡ Energia insuficiente (${disp} restantes, requer ${custo}).`, 'ko'); return false; }
  try { await updateDoc(doc(db,'jogadores',uid), { energia_usada_mes: usado + custo }); return true; }
  catch (err) { toast('Erro ao gastar energia.', 'ko'); return false; }
}


// (A função processarDistribuicaoProcessosMensal foi REMOVIDA deste
// arquivo — ela nunca era chamada por nada no frontend (window.avancarMes
// é definido apenas pela Cloud Function avancar_mes.js, que não conhecia
// esta função). Migrada para dentro de functions/avancar_mes.js, que é
// onde o avanço de mês de fato acontece. Manter aqui seria deixar uma
// segunda fonte de verdade morta e divergente da implementação real.)
function fmt(n) {
  if (!n && n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000) return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}

// ════════════════════════════════════════════════════════
// PAINEL DE CONTEXTO DO PROCESSO — número, partes, valor, tribunal e
// fatos narrativos, num bloco compacto no topo das telas de audiência e
// recurso. O modal do jogo é compartilhado (.modal, max-width 520px) e
// usado por todo o resto da interface, então em vez de duas colunas
// (como no motor standalone) isso fica resumido em uma faixa horizontal
// + lista compacta de fatos, sem exigir alargar o modal global.
// ════════════════════════════════════════════════════════
function _painelContextoProcesso(p) {
  const fatos = p.fatos_narrativa || [];
  return `
    <div style="background:var(--surface2);border:var(--borda-sub);border-radius:var(--r);padding:.65rem .8rem;margin-bottom:.9rem">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:.6rem;flex-wrap:wrap">
        <div style="min-width:0">
          <div style="font-family:var(--font-mono);font-size:.58rem;color:var(--txt4)">${p.numero || '—'}</div>
          <div style="font-weight:700;font-size:.82rem;color:var(--navy);line-height:1.3">${p.autor || '—'} <span style="opacity:.4">vs</span> ${p.reu || '—'}</div>
          <div style="font-size:.66rem;color:var(--ouro2);margin-top:.1rem">${p.tipo || '—'} · ${p.tribunal || '—'}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.78rem;font-weight:700;color:var(--verde2)">${fmt(p.valor)}</div>
        </div>
      </div>
      ${fatos.length ? `
        <div style="margin-top:.55rem;padding-top:.5rem;border-top:var(--borda-sub)">
          ${fatos.map((f,i) => `<div style="font-size:.68rem;color:var(--txt3);line-height:1.45;margin-bottom:.2rem"><span style="color:var(--txt4);font-family:var(--font-mono)">0${i+1}</span> ${f}</div>`).join('')}
        </div>` : ''}
    </div>`;
}

