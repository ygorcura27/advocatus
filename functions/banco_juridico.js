'use strict';

/**
 * BANCO JURÍDICO COMPARTILHADO (Cloud Function, CommonJS)
 * Espelho de js/processos.js — mesmo conteúdo, sintaxe adaptada para
 * require()/module.exports em vez de import/export ES Module. Usado por
 * functions/processar_sentenca.js e functions/processar_acordao.js.
 *
 * IMPORTANTE: qualquer mudança de CONTEÚDO jurídico (argumentos de
 * recurso, pesos por classe, julgadores, estratégias) feita em
 * js/processos.js precisa ser replicada manualmente aqui — os dois
 * arquivos não compartilham módulo fisicamente porque Cloud Functions
 * usa CommonJS e o frontend usa ES Modules, sem pipeline de build que
 * unifique os dois formatos neste projeto.
 *
 * v2 — Inclui ARGS_RECURSO_DEFESA/RECORRENTE com campo `tema` em cada
 * argumento (antes a Cloud Function usava hardcode
 * `temaDaRodada = rodada===0 ? 'prova_documental' : 'prazo'`,
 * descolado do conteúdo real do argumento sorteado — ver correção em
 * processar_acordao.js::recalcularVotos).
 */

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

const CLASSES_JULGADOR = [
  'tributarista','empresarialista','consumerista','civilista','penalista',
  'garantista','formalista','pragmatico','administrativista','constitucionalista','humanista',
];

const ARGS_RECURSO_DEFESA = [
  {txt:'O recorrente alega que o juízo não examinou bem as provas dos autos.',tema:'prova_documental',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'O recorrente pede a reforma total, alegando violação direta da lei.',tema:'aspecto_processual',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'O recorrente sustenta que a sentença ignorou um documento decisivo.',tema:'prova_documental',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'O recorrente alega que a fundamentação da sentença foi insuficiente.',tema:'aspecto_processual',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'O recorrente sustenta que houve clara contradição entre os fundamentos e a conclusão da sentença.',tema:'aspecto_processual',ideal:'agressiva',neutro:'tecnica',fraco:'passiva'},
  {txt:'O recorrente alega que o juízo deu peso indevido a um laudo pericial frágil.',tema:'prova_pericial',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'O recorrente sustenta que precedente recente do tribunal favorece sua tese.',tema:'precedente',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'O recorrente alega violação a princípio constitucional aplicável ao caso.',tema:'materia_constitucional',ideal:'agressiva',neutro:'tecnica',fraco:'passiva'},
  {txt:'O recorrente sustenta que o prazo prescricional foi contado de forma incorreta na sentença.',tema:'prazo',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'O recorrente invoca jurisprudência consolidada do próprio tribunal para sustentar a reforma.',tema:'jurisprudencia',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
];

const ARGS_RECURSO_RECORRENTE = [
  {txt:'A parte recorrida sustenta que as provas foram bem examinadas — não há nada a reformar.',tema:'prova_documental',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrida pede a manutenção integral, por ausência de qualquer violação à lei.',tema:'aspecto_processual',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'A parte recorrida sustenta que o documento citado pelo recorrente já foi devidamente analisado.',tema:'prova_documental',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrida sustenta que a fundamentação da sentença é completa e suficiente.',tema:'aspecto_processual',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'A parte recorrida nega qualquer contradição entre os fundamentos e a conclusão da sentença.',tema:'aspecto_processual',ideal:'agressiva',neutro:'tecnica',fraco:'passiva'},
  {txt:'A parte recorrida sustenta que o laudo pericial foi corretamente valorado pelo juízo.',tema:'prova_pericial',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrida sustenta que o precedente citado pelo recorrente não se aplica a este caso.',tema:'precedente',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
  {txt:'A parte recorrida nega qualquer violação a princípio constitucional no caso.',tema:'materia_constitucional',ideal:'agressiva',neutro:'tecnica',fraco:'passiva'},
  {txt:'A parte recorrida sustenta que o prazo foi contado corretamente, sem qualquer equívoco na sentença.',tema:'prazo',ideal:'tecnica',neutro:'agressiva',fraco:'passiva'},
  {txt:'A parte recorrida invoca jurisprudência consolidada que sustenta a manutenção da sentença.',tema:'jurisprudencia',ideal:'tecnica',neutro:'passiva',fraco:'agressiva'},
];

const RESPS_RECURSO_DEFESA = {
  tecnica: [
    'As provas foram bem avaliadas. Não há motivo para reforma.',
    'A sentença aplicou a lei corretamente — não houve violação alguma.',
    'O documento citado já constava nos autos e foi devidamente considerado.',
    'A fundamentação da sentença é completa. Cobre todos os pontos relevantes.',
    'Não há contradição entre os fundamentos e a conclusão. A leitura é clara.',
    'O laudo pericial foi avaliado com o rigor técnico que o caso exigia.',
    'O precedente que citam não se aplica aqui — os fatos são diferentes.',
    'Nenhum princípio constitucional foi violado nesta sentença.',
    'O prazo foi contado exatamente como a lei determina. Não há erro.',
    'A jurisprudência que sustenta esta sentença é sólida e atual.',
  ],
  agressiva: [
    'Isto não é um recurso — é a repetição de um argumento que já perdeu.',
    'Alegam violação da lei sem apontar qual dispositivo teria sido violado.',
    'Esse "documento decisivo" já estava nos autos. Não ignoramos nada.',
    'Dizer que a fundamentação é insuficiente não a torna insuficiente.',
    'Não existe contradição — existe a tentativa de criar uma onde não há.',
    'Questionam a perícia porque o resultado não foi o que esperavam.',
    'Esse precedente foi escolhido a dedo e não tem nada a ver com este caso.',
    'Invocar a Constituição não substitui a ausência de argumento de mérito.',
    'O prazo está certo. Discordar da matemática não é fundamento jurídico.',
    'Essa jurisprudência foi superada — quem está desatualizado é o recurso.',
  ],
  passiva: [
    'Aceito que se reanalise esse ponto. Não muda quem prevalece.',
    'Posso aceitar essa leitura sobre a aplicação da lei, sem prejuízo do resultado.',
    'Tudo bem revisitar esse documento — ele só confirma o que já está provado.',
    'Aceito que a fundamentação seja detalhada novamente, com o mesmo resultado.',
    'Não vejo problema em esclarecer esse ponto. A conclusão segue firme.',
    'Aceito reabrir a discussão sobre a perícia. O laudo resiste bem.',
    'Pode-se discutir esse precedente — não creio que mude o desfecho.',
    'Aceito examinar a questão constitucional. Confio no resultado de qualquer forma.',
    'Sem problema em revisar a contagem do prazo. O resultado é o mesmo.',
    'Aceito que se atualize a pesquisa de jurisprudência. Ela continua a nosso favor.',
  ],
};

const RESPS_RECURSO_RECORRENTE = {
  tecnica: [
    'A sentença não avaliou as provas como deveria. A reforma se impõe.',
    'Houve, sim, violação da lei. E isso, por si só, já justifica a reforma.',
    'Esse documento foi ignorado — e ele muda o resultado do caso.',
    'A fundamentação é insuficiente. Faltou enfrentar pontos centrais.',
    'Existe contradição clara entre os fundamentos e a conclusão da sentença.',
    'O laudo pericial recebeu peso maior do que merecia. Isso pesa contra nós.',
    'O precedente que trazemos é diretamente aplicável a este caso.',
    'Há violação a princípio constitucional que não pode ser ignorada.',
    'O prazo foi contado de forma equivocada — e isso muda tudo.',
    'A jurisprudência mais recente do tribunal já aponta para outro lado.',
  ],
  agressiva: [
    'A defesa da prova não resiste a uma leitura atenta dos autos.',
    'Não há argumento sólido que sustente a ausência de violação legal.',
    'Ignorar esse documento não foi escolha — foi erro.',
    'Chamar a fundamentação de completa não a torna completa.',
    'A contradição está lá. Negá-la não a faz desaparecer.',
    'Defender esse laudo é defender uma conclusão que os próprios dados não sustentam.',
    'Dizer que o precedente "não se aplica" é a única defesa que conseguiram montar.',
    'A questão constitucional é real, e a resistência a ela só confirma seu peso.',
    'O erro no prazo está nos autos. Não há como negar matemática.',
    'A jurisprudência citada pela defesa já foi superada — e eles sabem disso.',
  ],
  passiva: [
    'Posso aceitar a avaliação das provas como está — ainda assim, peço a reforma.',
    'Tudo bem que considerem não haver violação. Mantenho o pedido de reforma.',
    'Aceito que o documento já constasse nos autos. Ele continua sendo decisivo.',
    'Aceito a fundamentação como está. Ainda assim, ela não responde ao essencial.',
    'Posso não insistir na contradição. O pedido de reforma permanece o mesmo.',
    'Aceito a defesa da perícia. O laudo, ainda assim, não resolve a questão de fundo.',
    'Tudo bem discutir a aplicação do precedente. Acredito que ele ainda nos socorre.',
    'Aceito ouvir a defesa sobre a Constituição. Mantenho que o princípio foi violado.',
    'Posso aceitar a contagem como está. O resultado prático ainda nos prejudica.',
    'Aceito a jurisprudência citada pela defesa. A nossa, ainda assim, é mais recente.',
  ],
};

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

const XP_BASE_INSTANCIA = { '1grau':20, 'TJ':32, 'TRF':32, 'TRT':32, 'STJ':50, 'TST':50, 'STF':70 };

const CADEIA_INSTANCIAS = {
  tj_padrao:    ['1grau','TJ','STJ','STF'],
  trf_padrao:   ['1grau','TRF','STJ','STF'],
  trabalhista:  ['1grau','TRT','TST','STF'],
};

const ENTES_TRIBUTARIOS_ESTADUAIS = ['Estado do RJ', 'Município do Rio de Janeiro'];

const PERFIL_TRIBUNAL={
  'TJ':  { nome:'Tribunal de Justiça', tendencia:'documental', desc:'mais sensível à prova documental', votos:3 },
  'TRF': { nome:'Tribunal Regional Federal', tendencia:'tecnica', desc:'mais técnico e formalista', votos:3 },
  'TRT': { nome:'Tribunal Regional do Trabalho', tendencia:'trabalhador', desc:'mais favorável ao trabalhador', votos:3 },
  'STJ': { nome:'Superior Tribunal de Justiça', tendencia:'jurisprudencia', desc:'foco em jurisprudência consolidada', votos:5 },
  'TST': { nome:'Tribunal Superior do Trabalho', tendencia:'trabalhador', desc:'uniformiza jurisprudência trabalhista', votos:5 },
  'STF': { nome:'Supremo Tribunal Federal', tendencia:'constitucional', desc:'foco em matéria constitucional', votos:5 },
};

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

const CARGOS_3 = ['Relator','Revisor','Vogal'];

const CARGOS_5 = ['Relator','Revisor','1º Vogal','2º Vogal','3º Vogal'];

// ════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES — réplicas das versões em js/processos.js
// ════════════════════════════════════════════════════════

function pesoTemaPorClasse(tema, classe) {
  return (PESO_TEMA_POR_CLASSE[tema] && PESO_TEMA_POR_CLASSE[tema][classe]) || 0;
}

const XP_BASE_INSTANCIA_FALLBACK = { '1grau':20, 'TJ':32, 'TRF':32, 'TRT':32, 'STJ':50, 'TST':50, 'STF':70 };
function xpPorDecisao(instancia, score) {
  const tabela = (typeof XP_BASE_INSTANCIA !== 'undefined') ? XP_BASE_INSTANCIA : XP_BASE_INSTANCIA_FALLBACK;
  const base = tabela[instancia] || 20;
  return Math.round(base + score * 0.15);
}

function classificarSentenca(score) {
  if (score <= 40) return { tier:'fragil', chanceRecurso:0.85, label:'Sentença Frágil', cor:'#e57373', mult_perda:2,
    desc:'A fundamentação apresenta pontos vulneráveis. É muito provável que a parte vencida recorra.' };
  if (score <= 60) return { tier:'fraca', chanceRecurso:0.65, label:'Sentença Moderadamente Frágil', cor:'#ef9f27', mult_perda:1.5,
    desc:'Decisão com lacunas relevantes — recurso é provável.' };
  if (score <= 75) return { tier:'moderada', chanceRecurso:0.35, label:'Sentença Moderadamente Forte', cor:'#ef9f27', mult_perda:1,
    desc:'Decisão bem fundamentada, mas ainda sujeita a recurso pela parte vencida.' };
  return { tier:'muito_forte', chanceRecurso:0.12, label:'Sentença Muito Bem Fundamentada', cor:'#3aaa6a', mult_perda:0.2,
    desc:'Excelente fundamentação. A parte contrária ainda pode recorrer, mas a chance de reforma é baixa.' };
}

function decidirRecurso(score) {
  const classif = classificarSentenca(score);
  return Math.random() < classif.chanceRecurso;
}

const MESES_PT_CAL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function mesLabel(m, a) { return `${MESES_PT_CAL[m % 12]}, Ano ${a}`; }
function somarMeses(m, a, delta) {
  const total = (a * 12 + m) + delta;
  return { mes: total % 12, ano: Math.floor(total / 12) };
}
function calcularPrazosRecurso(mesBase, anoBase) {
  const bloqueioMeses = 2 + Math.floor(Math.random() * 2);
  const dataDisponivel = somarMeses(mesBase, anoBase, bloqueioMeses);
  const janelaMeses = 2 + Math.floor(Math.random() * 2);
  const prazoFinal = somarMeses(dataDisponivel.mes, dataDisponivel.ano, janelaMeses);
  return { dataDisponivel, prazoFinal };
}

function _cadeiaDoProcesso(proc) {
  if (proc.area === 'trabalhista') return CADEIA_INSTANCIAS.trabalhista;
  if (proc.area === 'tributario') {
    const entePresente = ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.reu) || ENTES_TRIBUTARIOS_ESTADUAIS.includes(proc.autor);
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

function gerarBancoJulgador(numVotos, instancia) {
  let pool;
  if (instancia === 'STJ' || instancia === 'TST') pool = JULGADORES_STJ;
  else if (instancia === 'STF') pool = JULGADORES_STF;
  else pool = JULGADORES_TJ;

  const embaralhado = [...pool].sort(() => Math.random() - 0.5);
  const cargos = numVotos === 5 ? CARGOS_5 : CARGOS_3;
  return cargos.map((cargo, i) => ({
    cargo,
    nome: embaralhado[i % embaralhado.length].nome,
    classe: embaralhado[i % embaralhado.length].classe,
  }));
}

function argsRecursoPara(quemRecorre) {
  return quemRecorre === 'jogador' ? ARGS_RECURSO_RECORRENTE : ARGS_RECURSO_DEFESA;
}
function respsRecursoPara(quemRecorre) {
  return quemRecorre === 'jogador' ? RESPS_RECURSO_RECORRENTE : RESPS_RECURSO_DEFESA;
}
function estrategiasRecursoPara(quemRecorre) {
  return quemRecorre === 'jogador' ? ESTRATEGIAS_RECURSO_ATAQUE : ESTRATEGIAS_RECURSO_DEFESA;
}

// ════════════════════════════════════════════════════════
// EXPORTS — consumidos por functions/processar_sentenca.js e
// functions/processar_acordao.js via require('./shared/banco_juridico.js')
// ════════════════════════════════════════════════════════
module.exports = {
  PESO_TEMA_POR_CLASSE, HINT_CLASSE_JULGADOR, CLASSES_JULGADOR,
  ARGS_RECURSO_DEFESA, ARGS_RECURSO_RECORRENTE,
  RESPS_RECURSO_DEFESA, RESPS_RECURSO_RECORRENTE,
  ESTRATEGIAS_RECURSO_DEFESA, ESTRATEGIAS_RECURSO_ATAQUE,
  XP_BASE_INSTANCIA, CADEIA_INSTANCIAS, ENTES_TRIBUTARIOS_ESTADUAIS,
  PERFIL_TRIBUNAL, JULGADORES_TJ, JULGADORES_STJ, JULGADORES_STF,
  CARGOS_3, CARGOS_5,
  pesoTemaPorClasse, xpPorDecisao, classificarSentenca, decidirRecurso,
  mesLabel, somarMeses, calcularPrazosRecurso,
  tribunalRecursal, ehTopoDaCadeia, gerarBancoJulgador,
  argsRecursoPara, respsRecursoPara, estrategiasRecursoPara,
};
