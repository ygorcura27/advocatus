/**
 * RELACIONAMENTO — DADOS BASE
 * Traços de personalidade, locais para conhecer pessoas, nomes NPC,
 * fórmulas de compatibilidade e tabelas de afinidade.
 */

// ════════════════════════════════════════════════════════
// TRAÇOS DE PERSONALIDADE
// ════════════════════════════════════════════════════════
export const TRACOS = {
  academica:    { l:'Acadêmica',    icone:'📚', desc:'Valoriza estudos e títulos.' },
  ambiciosa:    { l:'Ambiciosa',    icone:'💼', desc:'Valoriza sucesso profissional.' },
  caseira:      { l:'Caseira',      icone:'🏠', desc:'Valoriza presença e rotina.' },
  aventureira:  { l:'Aventureira',  icone:'✈️', desc:'Ama viagens e novidades.' },
  romantica:    { l:'Romântica',    icone:'❤️', desc:'Afinidade cresce mais rápido, mas sofre mais.' },
  independente: { l:'Independente', icone:'🧘', desc:'Necessita menos atenção.' },
  ciumenta:     { l:'Ciumenta',     icone:'😒', desc:'Eventos extras de conflito e desconfiança.' },
  materialista: { l:'Materialista', icone:'💎', desc:'Valoriza presentes e padrão financeiro.' },
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
// NOMES NPC (parceiros românticos)
// ════════════════════════════════════════════════════════
export const NOMES_PARCEIRO = {
  f: ['Larissa','Beatriz','Camila','Fernanda','Juliana','Amanda','Carolina','Isabela',
      'Mariana','Gabriela','Natália','Renata','Priscila','Vanessa','Aline','Débora',
      'Letícia','Patrícia','Bruna','Rafaela'],
  m: ['Rafael','Bruno','Gustavo','Felipe','Lucas','Thiago','André','Diego',
      'Henrique','Leonardo','Rodrigo','Victor','Marcelo','Eduardo','Daniel','Pedro',
      'Gabriel','Mateus','Vinícius','Carlos'],
  sobrenomes: ['Almeida','Souza','Costa','Lima','Ferreira','Carvalho','Oliveira',
               'Pereira','Rocha','Cardoso','Barros','Teixeira','Moraes','Pinto','Nunes'],
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

/** Gera um parceiro NPC aleatório com 1-3 traços */
export function gerarParceiroNPC(sexoParceiro) {
  const nomes = NOMES_PARCEIRO[sexoParceiro] || NOMES_PARCEIRO.f;
  const nome  = nomes[Math.floor(Math.random()*nomes.length)] + ' ' +
                NOMES_PARCEIRO.sobrenomes[Math.floor(Math.random()*NOMES_PARCEIRO.sobrenomes.length)];

  const todasChaves = Object.keys(TRACOS);
  const qtdTracos    = 1 + Math.floor(Math.random()*3); // 1 a 3
  const tracos = [];
  while (tracos.length < qtdTracos) {
    const t = todasChaves[Math.floor(Math.random()*todasChaves.length)];
    if (!tracos.includes(t)) tracos.push(t);
  }

  return {
    nome, sexo: sexoParceiro, tracos,
    idade: 20 + Math.floor(Math.random()*15),
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

/** Calcula bônus de felicidade pela compatibilidade do relacionamento ativo */
export function efeitoFelicidadeCompatibilidade(compatibilidade) {
  if (compatibilidade >= 90) return 10;
  if (compatibilidade >= 70) return 5;
  if (compatibilidade >= 50) return 0;
  if (compatibilidade >= 30) return -5;
  return -10;
}

/** Custo de filho baseado na idade */
export function custoFilhoPorIdade(idade) {
  if (idade <= 5)  return CUSTO_FILHO.bebe.custo;
  if (idade <= 17) return CUSTO_FILHO.crianca.custo;
  if (idade <= 22) return CUSTO_FILHO.jovem.custo;
  return 0; // independente após 22
}

/** Energia total disponível considerando bônus da academia */
window.getEnergiaTotal = function(j) {
  const bonus = (j && j.academia_ativa) ? (j.academia_bonus_energia || 0) : 0;
  return 100 + bonus;
};

/** Custo de adesão à academia, escalando com reputação */
export function custoAcademia(reputacao) {
  return Math.floor(ACADEMIA.custo_base + (reputacao||0) * ACADEMIA.custo_por_rep);
}
