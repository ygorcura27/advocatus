/**
 * RELACIONAMENTO — DADOS BASE
 * Traços de personalidade, locais para conhecer pessoas, fichas de NPC,
 * fórmulas de compatibilidade, efeitos mecânicos de traço e tabelas de afinidade.
 *
 * v3 — NPCs passam a ser entidades ÚNICAS E GLOBAIS (compartilhadas entre
 * todos os jogadores), travadas por um lock em npcs_locks/{npcId} (ver
 * relacionamento.js). Por isso, idade e traços de personalidade deixam de
 * ser sorteados a cada vez que alguém "descobre" a ficha — agora são FIXOS,
 * definidos aqui, para que a mesma Larissa Almeida seja sempre a mesma
 * pessoa (mesma idade-base, mesma personalidade) para qualquer jogador.
 */

// ════════════════════════════════════════════════════════
// TRAÇOS DE PERSONALIDADE
// ════════════════════════════════════════════════════════
export const TRACOS = {
  academica:    { l:'Acadêmica',    icone:'📚', desc:'Valoriza estudos e títulos.' },
  ambiciosa:    { l:'Ambiciosa',    icone:'💼', desc:'Valoriza sucesso profissional.' },
  caseira:      { l:'Caseira',      icone:'🏠', desc:'Valoriza presença e rotina.' },
  aventureira:  { l:'Aventureira',  icone:'✈️', desc:'Ama viagens — precisa viajar ao menos 1x por ano.' },
  romantica:    { l:'Romântica',    icone:'❤️', desc:'Afinidade cresce mais rápido, mas sofre mais.' },
  independente: { l:'Independente', icone:'🧘', desc:'Necessita menos atenção (decaimento reduzido).' },
  ciumenta:     { l:'Ciumenta',     icone:'😒', desc:'Eventos extras de conflito — pode terminar do nada.' },
  materialista: { l:'Materialista', icone:'💎', desc:'Valoriza presentes e padrão financeiro. Custo de saídas maior.' },
  familiar:     { l:'Familiar',     icone:'👶', desc:'Valoriza filhos e vida familiar.' },
  conservadora: { l:'Conservadora', icone:'💍', desc:'Deseja casamento relativamente rápido.' },
  moderna:      { l:'Moderna',      icone:'🌆', desc:'Não valoriza casamento formal.' },
  carente:      { l:'Carente',      icone:'🔥', desc:'Relacionamento intenso e instável.' },
  competitiva:  { l:'Competitiva',  icone:'🏆', desc:'Valoriza sucesso e status constantemente.' },
};

// Pares compatíveis (+15 na compatibilidade inicial) e conflitantes (-15)
export const TRACOS_COMPATIVEIS = [
  ['academica','ambiciosa'], ['academica','romantica'], ['academica','conservadora'],
  ['ambiciosa','competitiva'], ['ambiciosa','independente'], ['ambiciosa','moderna'],
  ['caseira','familiar'], ['caseira','conservadora'], ['caseira','romantica'],
  ['aventureira','moderna'], ['aventureira','independente'], ['aventureira','carente'],
  ['romantica','carente'], ['romantica','conservadora'],
  ['independente','moderna'], ['independente','competitiva'],
  ['materialista','competitiva'], ['materialista','ambiciosa'],
  ['familiar','conservadora'],
  ['competitiva','ambiciosa'],
];

export const TRACOS_CONFLITANTES = [
  ['caseira','aventureira'], ['caseira','ambiciosa'], ['caseira','independente'],
  ['ambiciosa','familiar'], ['ambiciosa','caseira'],
  ['aventureira','conservadora'], ['aventureira','caseira'],
  ['independente','carente'], ['independente','ciumenta'], ['independente','caseira'],
  ['ciumenta','independente'], ['ciumenta','moderna'], ['ciumenta','aventureira'],
  ['materialista','independente'],
  ['familiar','moderna'], ['familiar','ambiciosa'], ['familiar','aventureira'],
  ['conservadora','moderna'], ['conservadora','aventureira'],
  ['moderna','conservadora'], ['moderna','familiar'], ['moderna','ciumenta'],
  ['carente','independente'],
];

// ════════════════════════════════════════════════════════
// LOCAIS PARA CONHECER PESSOAS
// ════════════════════════════════════════════════════════
export const LOCAIS_CONHECER = {
  igreja: {
    l:'Igreja', icone:'⛪', energia:2,
    tracos_favorecidos: ['conservadora','familiar','caseira'],
    desc:'Ambiente tradicional, pessoas em busca de relacionamentos sérios.',
  },
  mercado: {
    l:'Mercado', icone:'🛒', energia:2,
    tracos_favorecidos: ['caseira','familiar'],
    desc:'Encontros casuais do dia a dia.',
  },
  livraria: {
    l:'Livraria', icone:'📚', energia:2,
    tracos_favorecidos: ['academica','romantica'],
    desc:'Para quem valoriza cultura e boas conversas.',
  },
  shopping: {
    l:'Shopping', icone:'🛍️', energia:3,
    tracos_favorecidos: ['materialista','moderna'],
    desc:'Ambiente social variado, ótimo para socializar.',
  },
  cafe: {
    l:'Café Literário', icone:'☕', energia:3,
    tracos_favorecidos: ['academica','romantica'],
    desc:'Clima intimista, conversas profundas.',
  },
  academia_social: {
    l:'Academia', icone:'🏋️', energia:3,
    tracos_favorecidos: ['ambiciosa','competitiva'],
    desc:'Pessoas focadas em disciplina e resultados.',
  },
  teatro: {
    l:'Teatro / Vernissage', icone:'🎭', energia:4,
    tracos_favorecidos: ['moderna','romantica'],
    desc:'Eventos culturais sofisticados.',
  },
  congresso: {
    l:'Congresso Jurídico', icone:'💼', energia:4,
    tracos_favorecidos: ['ambiciosa','academica','competitiva'],
    desc:'Network profissional — também concede +2 networking.',
    bonus_networking: 2,
  },
  balada: {
    l:'Balada', icone:'🎉', energia:5,
    tracos_favorecidos: ['aventureira','carente','independente'],
    desc:'Ambiente intenso, encontros imprevisíveis.',
  },
};

// ════════════════════════════════════════════════════════
// FICHAS DE NPC (parceiros românticos) — nome completo + foto + região
// + idade_base + traços, todos FIXOS e emparelhados.
//
// idade_base: idade da NPC no Ano 1 do jogo (quando o jogador tem 22 anos).
// Faixa 18-22, pensada para que TODAS as fichas já sejam elegíveis para
// o jogador desde o começo (regra: só aparecem mulheres com idade entre
// 18 e a idade atual do jogador). Conforme o jogador envelhece, a NPC
// também envelhece no mesmo "mês-aniversário" (ver avancar_mes.js).
//
// tracos: exatamente 3, fixos — não sorteados. Como as NPCs agora são
// entidades ÚNICAS e globais (lock em npcs_locks/{npcId}), a personalidade
// não pode variar de jogador para jogador.
//
// id: chave normalizada usada como ID do documento em npcs_locks/{id} —
// mesma string do nome do arquivo de foto, sem extensão.
//
// foto: nome do arquivo dentro de img/npcs/. Se o arquivo não existir
// ainda, o avatar cai num placeholder genérico (ver _avatarUrlNpc no
// frontend) — então é seguro adicionar fichas aqui antes de ter todas
// as imagens prontas.
// ════════════════════════════════════════════════════════
export const NPCS_FICHAS = {
  f: [
    { id:'larissa_almeida',     nome:'Larissa Almeida',     regiao:'Rio de Janeiro',    foto:'larissa_almeida.png',     idade_base:19, tracos:['romantica','aventureira','moderna'] },
    { id:'beatriz_souza',       nome:'Beatriz Souza',       regiao:'Rio de Janeiro',    foto:'beatriz_souza.png',       idade_base:21, tracos:['ambiciosa','academica','independente'] },
    { id:'camila_ferreira',     nome:'Camila Ferreira',     regiao:'São Paulo',         foto:'camila_ferreira.png',     idade_base:20, tracos:['academica','ambiciosa','conservadora'] },
    { id:'mariana_bittencourt', nome:'Mariana Bittencourt', regiao:'Rio Grande do Sul', foto:'mariana_bittencourt.png', idade_base:20, tracos:['romantica','conservadora','familiar'] },
    { id:'gabriela_schmidt',    nome:'Gabriela Schmidt',    regiao:'Rio Grande do Sul', foto:'gabriela_schmidt.png',    idade_base:18, tracos:['conservadora','caseira','familiar'] },
    { id:'carolina_nascimento', nome:'Carolina Nascimento', regiao:'Bahia',             foto:'carolina_nascimento.png', idade_base:19, tracos:['aventureira','independente','ciumenta'] },
    { id:'isabela_santana',     nome:'Isabela Santana',     regiao:'Bahia',             foto:'isabela_santana.png',     idade_base:22, tracos:['academica','romantica','carente'] },
    { id:'vitoria_reis',        nome:'Vitória Reis',        regiao:'Bahia',             foto:'vitoria_reis.png',        idade_base:21, tracos:['ambiciosa','competitiva','independente'] },
    { id:'natalia_borges',      nome:'Natália Borges',      regiao:'Paraná',            foto:'natalia_borges.png',      idade_base:19, tracos:['aventureira','independente','ciumenta'] },
    { id:'renata_kowalski',     nome:'Renata Kowalski',     regiao:'Paraná',            foto:'renata_kowalski.png',     idade_base:21, tracos:['independente','aventureira','moderna'] },
    { id:'sayuri_kobayashi',    nome:'Sayuri Kobayashi',    regiao:'Paraná',            foto:'sayuri_kobayashi.png',    idade_base:20, tracos:['academica','ambiciosa','competitiva'] },
    { id:'manuela_pires',       nome:'Manuela Pires',       regiao:'Pernambuco',        foto:'manuela_pires.png',       idade_base:19, tracos:['aventureira','romantica','ciumenta'] },
    { id:'vanessa_lima',        nome:'Vanessa Lima',        regiao:'Pernambuco',        foto:'vanessa_lima.png',        idade_base:22, tracos:['ambiciosa','materialista','competitiva'] },
    { id:'yara_bare',           nome:'Yara Baré',           regiao:'Amazonas',          foto:'yara_bare.png',           idade_base:18, tracos:['caseira','romantica','familiar'] },
    { id:'debora_monteiro',     nome:'Débora Monteiro',     regiao:'Amazonas',          foto:'debora_monteiro.png',     idade_base:21, tracos:['ambiciosa','competitiva','moderna'] },
    { id:'leticia_rocha',       nome:'Letícia Rocha',       regiao:'Ceará',             foto:'leticia_rocha.png',       idade_base:19, tracos:['academica','romantica','caseira'] },
    { id:'patricia_aguiar',     nome:'Patrícia Aguiar',     regiao:'Goiás',             foto:'patricia_aguiar.png',     idade_base:22, tracos:['ambiciosa','independente','moderna'] },
    { id:'bruna_martins',       nome:'Bruna Martins',       regiao:'Espírito Santo',    foto:'bruna_martins.png',       idade_base:18, tracos:['romantica','conservadora','familiar'] },
    { id:'rafaela_teixeira',    nome:'Rafaela Teixeira',    regiao:'Santa Catarina',    foto:'rafaela_teixeira.png',    idade_base:20, tracos:['materialista','moderna','independente'] },
    { id:'layla_khalil',        nome:'Layla Khalil',        regiao:'São Paulo',         foto:'layla_khalil.png',        idade_base:19, tracos:['materialista','conservadora','familiar'] },
    { id:'samira_haddad',       nome:'Samira Haddad',       regiao:'Minas Gerais',      foto:'samira_haddad.png',       idade_base:22, tracos:['romantica','materialista','independente'] },
    { id:'yumi_tanaka',         nome:'Yumi Tanaka',         regiao:'São Paulo',         foto:'yumi_tanaka.png',         idade_base:18, tracos:['academica','caseira','conservadora'] },
  ],
  m: [
    { id:'rafael_almeida',       nome:'Rafael Almeida',       regiao:'Rio de Janeiro',    foto:'rafael_almeida.png',       idade_base:20, tracos:['ambiciosa','moderna','independente'] },
    { id:'bruno_souza',         nome:'Bruno Souza',          regiao:'Rio de Janeiro',    foto:'bruno_souza.png',          idade_base:21, tracos:['aventureira','carente','moderna'] },
    { id:'gustavo_ferreira',    nome:'Gustavo Ferreira',     regiao:'São Paulo',         foto:'gustavo_ferreira.png',     idade_base:19, tracos:['academica','ambiciosa','competitiva'] },
    { id:'felipe_oliveira',     nome:'Felipe Oliveira',      regiao:'São Paulo',         foto:'felipe_oliveira.png',      idade_base:20, tracos:['materialista','competitiva','moderna'] },
    { id:'lucas_andrade',       nome:'Lucas Andrade',        regiao:'Minas Gerais',      foto:'lucas_andrade.png',        idade_base:18, tracos:['caseira','familiar','conservadora'] },
    { id:'thiago_carvalho',     nome:'Thiago Carvalho',      regiao:'Minas Gerais',      foto:'thiago_carvalho.png',      idade_base:21, tracos:['ambiciosa','independente','academica'] },
    { id:'andre_nascimento',    nome:'André Nascimento',     regiao:'Bahia',             foto:'andre_nascimento.png',     idade_base:19, tracos:['aventureira','independente','moderna'] },
    { id:'diego_santana',       nome:'Diego Santana',        regiao:'Bahia',             foto:'diego_santana.png',        idade_base:22, tracos:['carente','romantica','ciumenta'] },
    { id:'henrique_bittencourt',nome:'Henrique Bittencourt', regiao:'Rio Grande do Sul', foto:'henrique_bittencourt.png', idade_base:20, tracos:['conservadora','familiar','caseira'] },
    { id:'leonardo_schmidt',    nome:'Leonardo Schmidt',     regiao:'Rio Grande do Sul', foto:'leonardo_schmidt.png',     idade_base:18, tracos:['competitiva','ambiciosa','moderna'] },
    { id:'rodrigo_borges',      nome:'Rodrigo Borges',       regiao:'Paraná',            foto:'rodrigo_borges.png',       idade_base:21, tracos:['aventureira','independente','carente'] },
    { id:'victor_kowalski',     nome:'Victor Kowalski',      regiao:'Paraná',            foto:'victor_kowalski.png',      idade_base:19, tracos:['academica','conservadora','romantica'] },
    { id:'marcelo_cardoso',     nome:'Marcelo Cardoso',      regiao:'Pernambuco',        foto:'marcelo_cardoso.png',      idade_base:22, tracos:['ambiciosa','materialista','competitiva'] },
    { id:'eduardo_lima',        nome:'Eduardo Lima',         regiao:'Pernambuco',        foto:'eduardo_lima.png',         idade_base:20, tracos:['moderna','independente','aventureira'] },
    { id:'daniel_bare',         nome:'Daniel Baré',          regiao:'Amazonas',          foto:'daniel_bare.png',          idade_base:18, tracos:['caseira','familiar','romantica'] },
    { id:'pedro_monteiro',      nome:'Pedro Monteiro',       regiao:'Amazonas',          foto:'pedro_monteiro.png',       idade_base:21, tracos:['ambiciosa','moderna','competitiva'] },
    { id:'gabriel_rocha',       nome:'Gabriel Rocha',        regiao:'Ceará',             foto:'gabriel_rocha.png',        idade_base:19, tracos:['academica','caseira','romantica'] },
    { id:'mateus_aguiar',       nome:'Mateus Aguiar',        regiao:'Goiás',             foto:'mateus_aguiar.png',        idade_base:22, tracos:['independente','ambiciosa','moderna'] },
    { id:'vinicius_martins',    nome:'Vinícius Martins',     regiao:'Espírito Santo',    foto:'vinicius_martins.png',     idade_base:20, tracos:['romantica','conservadora','familiar'] },
    { id:'carlos_teixeira',     nome:'Carlos Teixeira',      regiao:'Santa Catarina',    foto:'carlos_teixeira.png',      idade_base:19, tracos:['materialista','independente','moderna'] },
  ],
};

// ════════════════════════════════════════════════════════
// TABELAS DE AFINIDADE POR ESTÁGIO
// ════════════════════════════════════════════════════════
export const ESTAGIOS = {
  affair:   { l_m:'Affair',    l_f:'Affair',    cap:50,  decai:10, termino_chance:0.03, tempo_chance:0.05 },
  namorado: { l_m:'Namorado',  l_f:'Namorada',  cap:100, decai:8,  termino_chance:0.02, tempo_chance:0.03 },
  noivo:    { l_m:'Noivo',     l_f:'Noiva',     cap:150, decai:5,  termino_chance:0.01, tempo_chance:0.02 },
  esposo:   { l_m:'Esposo',    l_f:'Esposa',    cap:200, decai:3,  termino_chance:0.005,tempo_chance:0.01 },
};

// Impacto na saúde mental de "dar um tempo" e "término" por estágio
export const IMPACTO_SM = {
  tempo:   { affair:5,  namorado:10, noivo:15, esposo:20 },
  termino: { affair:10, namorado:20, noivo:35, esposo:50 },
};

// ════════════════════════════════════════════════════════
// INTERAÇÕES (ganho de afinidade)
// ════════════════════════════════════════════════════════
export const INTERACOES = {
  mensagem: { l:'Mandar mensagem',     icone:'💬', energia:2,  afinidade:2  },
  jantar:    { l:'Jantar',              icone:'🍽️', energia:5,  afinidade:5  },
  passeio:   { l:'Passeio',             icone:'🚶', energia:8,  afinidade:8  },
  viagem_nac:{ l:'Viagem Nacional',     icone:'🏖️', energia:15, afinidade:15 },
  viagem_int:{ l:'Viagem Internacional',icone:'🌍', energia:25, afinidade:25 },
  intimidade:{ l:'Momento de Intimidade', icone:'💞', energia:4, afinidade:6 },
};

export const GANHO_MAX_MENSAL = 25;

// ════════════════════════════════════════════════════════
// LOJA DE PRESENTES — dar presente a uma NPC ativa. Qualquer NPC recebe
// o ganho base de afinidade; NPCs com o traço 'materialista' recebem um
// bônus extra fixo por cima (ver EFEITO_TRACO.materialista.afinidade_presente)
// e resetam o contador de "meses sem presente" usado para a penalidade
// de tolerância (ver MATERIALISTA_TOLERANCIA abaixo).
// ════════════════════════════════════════════════════════
export const PRESENTES = {
  simples:  { l:'Presente Simples',  icone:'🎀', custo:200,   afinidade:3  },
  medio:    { l:'Presente Médio',    icone:'🎁', custo:1000,  afinidade:8  },
  luxuoso:  { l:'Presente Luxuoso',  icone:'💎', custo:5000,  afinidade:15 },
};

// Tolerância de Materialista para "tempo sem receber presente" — mesmo
// padrão conceitual de SEXO_CONFIG.meses_tolerancia, mas para presentes.
// Penalidade simplificada (sem vínculo a aniversário): a partir deste
// número de meses sem nenhum presente, penaliza por mês até receber um.
export const MATERIALISTA_TOLERANCIA = {
  meses_tolerancia: 6,
  perda_afinidade_mes: 10, // = EFEITO_TRACO.materialista.afinidade_aniversario_sem_presente, reaproveitado aqui
};

// ════════════════════════════════════════════════════════
// PROGRESSÃO DE ESTÁGIO
// ════════════════════════════════════════════════════════
export const PROGRESSAO = {
  affair_namorado: {
    afinidade_min: 50, tempo_min_meses: 6,
    presente: 'Anel simples', custo: 1000, acao: 'Pedir em namoro',
  },
  namorado_noivo: {
    afinidade_min: 100, tempo_min_meses: 12,
    presente: 'Anel de noivado', custo: 10000, acao: 'Pedir em casamento',
  },
  noivo_esposo: {
    afinidade_min: 150, tempo_min_meses: 12,
    presente: 'Casamento', custo: 50000, acao: 'Realizar casamento',
  },
};

// ════════════════════════════════════════════════════════
// GRAVIDEZ E FILHOS
// ════════════════════════════════════════════════════════
export const CHANCE_GRAVIDEZ = { namorado: 0.02, noivo: 0.04, esposo: 0.08 };
export const DURACAO_GESTACAO = 9;

export const CUSTO_FILHO = {
  bebe:       { min:0,  max:5,  custo:800  },
  crianca:    { min:6,  max:17, custo:1200 },
  jovem:      { min:18, max:22, custo:2000 },
};

// ════════════════════════════════════════════════════════
// ACADEMIA (sistema de bônus de energia)
// ════════════════════════════════════════════════════════
export const ACADEMIA = {
  custo_base: 100,
  custo_por_rep: 3,         // custo escala com reputação
  energia_uso: 5,           // custo para "comparecer"
  bonus_por_mes: 1,         // +1 energia bônus cumulativo por mês de uso
  bonus_max: 25,            // até +25 (total 125)
  perda_sem_uso: 1,         // -1 bônus por mês sem comparecer
};

// ════════════════════════════════════════════════════════
// SEXO / INTIMIDADE — saúde mental e afinidade
// ════════════════════════════════════════════════════════
export const SEXO_CONFIG = {
  energia: 4,
  ganho_saude_mental: 1,        // +1 SM no mês em que ocorre
  meses_tolerancia: 3,          // a partir do 3º mês sem, começa a penalizar
  perda_saude_mental_mes: 1,    // -1 SM/mês após tolerância
  perda_afinidade_mes: 3,       // -3 afinidade/mês após tolerância
};

// ════════════════════════════════════════════════════════
// INFIDELIDADE — chance de flagra
// ════════════════════════════════════════════════════════
export const FLAGRA = {
  chance_por_affair_extra: 0.08,      // 8% por affair adicional ativo
  chance_namorada_com_affair: 0.12,   // 12%/mês se tem affair ativo sendo namorado+
  penalidade_sm: 25,
  penalidade_felicidade: 30,
  penalidade_afinidade_pct: 1.0,      // zera a afinidade (término automático)
};

// ════════════════════════════════════════════════════════
// EFEITOS MECÂNICOS DE TRAÇO (spec V2)
// Cada traço aqui descrito tem um efeito real sobre afinidade, saúde
// mental, custo de eventos ou chance de eventos negativos — deixam de
// ser apenas decorativos (usados só na compatibilidade inicial).
//
// "Gostosas com risco": por decisão de design, traços de volatilidade
// mais alta (ciumenta, carente) e custo mais alto (materialista) foram
// distribuídos preferencialmente entre as fichas de perfil mais
// sensual/praiano, criando um trade-off real de risco x recompensa.
// A exceção combinada é Yara Baré (Amazonas) — perfil mais simples e
// conectado à natureza, sem nenhum traço de volatilidade.
// ════════════════════════════════════════════════════════
export const EFEITO_TRACO = {
  academica: {
    afinidade_curso_concluido: 5,   // MBA, pós, mestrado, doutorado, LLM, artigo publicado
  },
  ambiciosa: {
    afinidade_promocao: 4,
    afinidade_sem_evolucao_12m: -5,
  },
  caseira: {
    limite_energia_mes: 80,         // acima disso no mês, penaliza
    afinidade_excesso_energia: -4,
  },
  aventureira: {
    exige_viagem_por_ano: true,
    afinidade_sem_viagem_ano: -5,
    afinidade_viagem_nacional_extra: 5,
    afinidade_viagem_internacional_extra: 10,
  },
  romantica: {
    multiplicador_ganho: 1.20,
    multiplicador_dano_sm_termino: 1.50,
  },
  independente: {
    multiplicador_decaimento: 0.50, // -50% no decaimento mensal
  },
  ciumenta: {
    chance_evento_mensal: 0.02,
    chance_termino_evento: 0.15,    // dado o evento, chance de virar término
  },
  materialista: {
    afinidade_aniversario_sem_presente: -10,
    afinidade_presente: 10,
    multiplicador_custo_eventos: 1.20,
  },
  familiar: {
    afinidade_nascimento: 15,
    idade_limite_sem_filhos: 30,
    afinidade_mes_sem_filhos_apos_limite: -10,
  },
  conservadora: {
    prazo_ideal_anos_namoro: 2,
    afinidade_mes_apos_prazo_sem_proposta: -5,
  },
  moderna: {
    isenta_penalidade_tempo: true,
  },
  carente: {
    multiplicador_ganho: 1.25,
    multiplicador_perda: 1.50,
  },
  competitiva: {
    afinidade_promocao: 8,
    afinidade_sem_evolucao_12m: -5,
  },
};

// ════════════════════════════════════════════════════════
// IMPACTO DA COMPATIBILIDADE NA FELICIDADE
// ════════════════════════════════════════════════════════
export const FELICIDADE_POR_COMPATIBILIDADE = [
  { min:90, valor:10 },
  { min:70, valor:5  },
  { min:50, valor:0  },
  { min:30, valor:-5 },
  { min:0,  valor:-10},
];

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

/** Calcula a compatibilidade inicial entre o jogador e um traço-set do parceiro */
export function calcCompatibilidade(tracosJogador, tracosParceiro) {
  let score = 50;
  for (const tj of tracosJogador) {
    for (const tp of tracosParceiro) {
      if (TRACOS_COMPATIVEIS.some(([a,b]) => (a===tj&&b===tp)||(a===tp&&b===tj))) score += 15;
      if (TRACOS_CONFLITANTES.some(([a,b]) => (a===tj&&b===tp)||(a===tp&&b===tj))) score -= 15;
    }
  }
  return Math.max(10, Math.min(95, score));
}

/** Efeito da compatibilidade na felicidade (mesma fórmula usada na Cloud Function) */
export function efeitoFelicidadeCompatibilidade(compatibilidade) {
  const faixa = FELICIDADE_POR_COMPATIBILIDADE.find(f => compatibilidade >= f.min);
  return faixa ? faixa.valor : -10;
}

/**
 * Calcula a idade ATUAL de uma NPC com base na idade_base (fixa, no Ano 1)
 * e na idade atual do jogador, assumindo que o jogador começa com 22 anos
 * e que ambos envelhecem juntos, no mesmo "mês-aniversário" de jogo.
 */
export function idadeAtualNPC(idadeBase, idadeJogadorAtual, idadeJogadorInicial = 22) {
  const anosPassados = Math.max(0, idadeJogadorAtual - idadeJogadorInicial);
  return idadeBase + anosPassados;
}

/**
 * Retorna apenas as fichas elegíveis para aparecer a um jogador de uma
 * dada idade: 18 <= idade_da_NPC <= idade_do_jogador.
 */
export function fichasElegiveis(sexoParceiro, idadeJogadorAtual, idadeJogadorInicial = 22) {
  const fichas = NPCS_FICHAS[sexoParceiro] || NPCS_FICHAS.f;
  return fichas
    .map(f => ({ ...f, idade: idadeAtualNPC(f.idade_base, idadeJogadorAtual, idadeJogadorInicial) }))
    .filter(f => f.idade >= 18 && f.idade <= idadeJogadorAtual);
}

/**
 * Gera um "candidato" NPC a partir de uma ficha fixa (não sorteia mais
 * nome/foto/traços/idade — tudo isso já é fixo na ficha). Mantido por
 * compatibilidade de assinatura com chamadas existentes; agora recebe
 * a ficha já filtrada por elegibilidade em vez de sortear do banco todo.
 */
export function candidatoDeFicha(ficha, sexo) {
  return {
    id: ficha.id, nome: ficha.nome, foto: ficha.foto, regiao: ficha.regiao,
    idade: ficha.idade, tracos: ficha.tracos, sexo,
  };
}

/** Retorna o label do estágio considerando o sexo do parceiro */
export function labelEstagio(estagioKey, sexoParceiro) {
  const e = ESTAGIOS[estagioKey];
  if (!e) return estagioKey;
  return sexoParceiro === 'm' ? e.l_m : e.l_f;
}

/** Calcula efeito de felicidade na chance de vitória dos processos */
export function efeitoFelicidadeChance(felicidade) {
  if (felicidade <= 20) return -10;
  if (felicidade <= 40) return -5;
  if (felicidade <= 60) return 0;
  if (felicidade <= 80) return 5;
  return 10;
}

/** Custo de filho baseado na idade */
export function custoFilhoPorIdade(idade) {
  if (idade <= 5)  return CUSTO_FILHO.bebe.custo;
  if (idade <= 17) return CUSTO_FILHO.crianca.custo;
  if (idade <= 22) return CUSTO_FILHO.jovem.custo;
  return 0; // independente após 22
}

/** Energia total disponível considerando bônus da academia e penalidade de exaustão */
window.getEnergiaTotal = function(j) {
  if (!j) return 100;
  const bonus = j.academia_ativa ? (j.academia_bonus_energia || 0) : 0;
  const pen   = j.penalidade_energia_val || 0;
  return Math.max(10, 100 + bonus - pen);
};

/** Custo de adesão à academia, escalando com reputação */
export function custoAcademia(reputacao) {
  return Math.floor(ACADEMIA.custo_base + (reputacao||0) * ACADEMIA.custo_por_rep);
}
