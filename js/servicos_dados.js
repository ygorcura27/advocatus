/**
 * SERVIÇOS JURÍDICOS — DADOS BASE
 * Tipos de serviço, geração de oportunidades, clientes e contratos recorrentes.
 */

// ════════════════════════════════════════════════════════
// TIPOS DE SERVIÇO
// ════════════════════════════════════════════════════════
export const TIPOS_SERVICO = {
  consulta: {
    l:'Consulta Jurídica', icone:'💬', energia:5,
    valor_min:200, valor_max:2000, prazo_meses:0,
    confianca:5, chance_recorrente:0.15, chance_processo:0.10,
    desc:'Reunião e orientação jurídica inicial.',
  },
  parecer: {
    l:'Parecer Jurídico', icone:'📄', energia:10,
    valor_min:1000, valor_max:20000, prazo_meses:1,
    confianca:10, chance_recorrente:0.20, chance_processo:0.20,
    desc:'Parecer técnico tributário, trabalhista ou empresarial.',
  },
  contrato: {
    l:'Elaboração de Contrato', icone:'📝', energia:5,
    valor_min:500, valor_max:15000, prazo_meses:0,
    confianca:15, chance_recorrente:0.25, chance_processo:0,
    desc:'Elaboração, revisão ou negociação contratual.',
  },
  notificacao: {
    l:'Notificação Extrajudicial', icone:'✉️', energia:3,
    valor_min:300, valor_max:5000, prazo_meses:0,
    confianca:8, chance_recorrente:0, chance_processo:0.20, chance_resolver:0.30,
    desc:'Notificação para resolução extrajudicial de conflito.',
  },
  cobranca: {
    l:'Cobrança Extrajudicial', icone:'💰', energia:5,
    valor_min:0, valor_max:0, prazo_meses:0, // valor calculado dinamicamente (5-20% do recuperado)
    confianca:10, chance_recorrente:0, chance_processo:0.15,
    desc:'Recuperação de valores de devedores do cliente.',
    pct_min:0.05, pct_max:0.20,
  },
};

// ════════════════════════════════════════════════════════
// GERAÇÃO MENSAL DE OPORTUNIDADES POR TIER
// ════════════════════════════════════════════════════════
export const OPORTUNIDADES_POR_TIER = {
  1: { min:1,  max:3  },
  2: { min:2,  max:5  },
  3: { min:4,  max:8  },
  4: { min:8,  max:15 },
  5: { min:15, max:30 },
};

// ════════════════════════════════════════════════════════
// MODIFICADORES
// ════════════════════════════════════════════════════════
export function modificadorNetworking(networking) {
  if (networking >= 81) return 1.00;
  if (networking >= 61) return 0.50;
  if (networking >= 41) return 0.25;
  if (networking >= 21) return 0.10;
  return 0;
}

export function multiplicadorPrestigio(prestigioPct) {
  // prestigioPct = % do cap de reputação do cargo (0-100+)
  if (prestigioPct >= 90) return 3.0;
  if (prestigioPct >= 70) return 2.0;
  if (prestigioPct >= 40) return 1.5;
  return 1.0;
}

// ════════════════════════════════════════════════════════
// NOMES DE CLIENTES (PF e PJ)
// ════════════════════════════════════════════════════════
export const NOMES_CLIENTE_PF = [
  'Roberto Almeida','Sandra Lopes','Marcelo Tavares','Cristina Souza','Eduardo Ramos',
  'Fernanda Castro','Paulo Henrique Dias','Juliana Mendes','Sérgio Nogueira','Patrícia Aguiar',
  'André Luiz Barros','Vanessa Pinheiro','Ricardo Monteiro','Beatriz Cunha','Marcos Vinícius Reis',
];

export const NOMES_CLIENTE_PJ = {
  micro: ['Padaria Pão Dourado ME','Salão Bela Vista','Oficina São Jorge','Mercadinho Bom Preço',
          'Estúdio Foto Arte','Clínica Odonto Sorriso ME'],
  pequena: ['Distribuidora Rio Verde Ltda','Construtora Alves & Filhos','Restaurante Sabor Carioca',
            'Transportadora Vitória Ltda','Confecções Moda Brasil'],
  media: ['Indústria Metalúrgica Atlântico','Rede de Farmácias VidaSaúde','Supermercados Boa Compra',
          'Construtora Horizonte S/A','Grupo Educacional Saber'],
  grande: ['Conglomerado Industrial Cariri S/A','Rede Varejista Nacional Maxx','Holding Financeira Atlas',
           'Grupo Logístico TransBrasil','Indústria Petroquímica Sul'],
};

// ════════════════════════════════════════════════════════
// CONTRATOS RECORRENTES — FAIXAS POR PORTE
// ════════════════════════════════════════════════════════
export const FAIXA_RECORRENTE = {
  pf:      { min:100,   max:1000,   l:'Pessoa Física' },
  micro:   { min:1000,  max:3000,   l:'Microempresa' },
  pequena: { min:3000,  max:10000,  l:'Pequena Empresa' },
  media:   { min:10000, max:30000,  l:'Média Empresa' },
  grande:  { min:30000, max:100000, l:'Grande Empresa' },
};

// ════════════════════════════════════════════════════════
// LIMITE DE CLIENTES EMPRESARIAIS POR TIER
// ════════════════════════════════════════════════════════
export const LIMITE_EMPRESAS_TIER = { 1:1, 2:3, 3:5, 4:10, 5:20 };

// ════════════════════════════════════════════════════════
// CHANCE MENSAL DE DEMANDA AUTOMÁTICA POR PORTE
// ════════════════════════════════════════════════════════
export const CHANCE_DEMANDA_AUTOMATICA = { micro:0.05, pequena:0.10, media:0.15, grande:0.20 };

export const TIPOS_DEMANDA_AUTOMATICA = ['trabalhista','tributario','consumidor','contratual','ambiental','societario'];

// ════════════════════════════════════════════════════════
// SISTEMA DE CONFIANÇA
// ════════════════════════════════════════════════════════
export const CONFIANCA_INICIAL = 50;
export const CONFIANCA_EVENTOS = {
  consulta: 5, parecer: 10, contrato: 15,
  vitoria_judicial: 25, derrota_judicial: -5,
  prazo_perdido: -10, processo_abandonado: -25,
};
export const CONFIANCA_RECORRENTE_MIN = 70;

// ════════════════════════════════════════════════════════
// PRODUTIVIDADE POR CARGO (delegação a funcionários)
// ════════════════════════════════════════════════════════
// Percentual do valor do serviço que o EXECUTOR recebe (resto vai pro caixa do escritório)
export const PRODUTIVIDADE_CARGO = {
  est: 0.10,  // Estagiário — 10%
  ass: 0.20,  // Assistente — 20%
  jnr: 0.30,  // Advogado Júnior — 30%
  pln: 0.40,  // Advogado Pleno — 40%
  snr: 0.50,  // Advogado Sênior — 50%
  asc: 0.70,  // Associado — 70%
  soc: 1.00,  // Sócio — 100%
  socn:1.00,  // Sócio Nominal — 100%
};

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

/** Gera uma oportunidade de serviço aleatória */
export function gerarOportunidade(tier, prestigioPct) {
  const tiposKeys = Object.keys(TIPOS_SERVICO);
  const tipoKey   = tiposKeys[Math.floor(Math.random()*tiposKeys.length)];
  const tipo      = TIPOS_SERVICO[tipoKey];

  const ehPJ = Math.random() < 0.5;
  const porte = ehPJ ? _portePorTier(tier) : null;
  const cliente_nome = ehPJ
    ? NOMES_CLIENTE_PJ[porte][Math.floor(Math.random()*NOMES_CLIENTE_PJ[porte].length)]
    : NOMES_CLIENTE_PF[Math.floor(Math.random()*NOMES_CLIENTE_PF.length)];

  const mult = multiplicadorPrestigio(prestigioPct);
  let valor;
  if (tipoKey === 'cobranca') {
    const valorRecuperar = 5000 + Math.floor(Math.random()*95000);
    const pct = tipo.pct_min + Math.random()*(tipo.pct_max-tipo.pct_min);
    valor = Math.floor(valorRecuperar * pct * mult);
  } else {
    valor = Math.floor((tipo.valor_min + Math.random()*(tipo.valor_max-tipo.valor_min)) * mult);
  }

  return {
    tipo: tipoKey, cliente_nome, cliente_tipo: ehPJ?'PJ':'PF', cliente_porte: porte,
    valor, energia: tipo.energia, prazo_meses: tipo.prazo_meses,
    confianca_gerada: tipo.confianca,
    chance_cliente_recorrente: tipo.chance_recorrente,
    chance_gerar_processo: tipo.chance_processo || 0,
    criado_em: new Date().toISOString(),
  };
}

function _portePorTier(tier) {
  const pesos = {
    1: { micro:0.7, pequena:0.3 },
    2: { micro:0.4, pequena:0.4, media:0.2 },
    3: { micro:0.2, pequena:0.4, media:0.3, grande:0.1 },
    4: { micro:0.1, pequena:0.3, media:0.4, grande:0.2 },
    5: { micro:0.05,pequena:0.2, media:0.35,grande:0.4 },
  }[tier] || { micro:0.7, pequena:0.3 };

  const r = Math.random();
  let acc = 0;
  for (const [porte, peso] of Object.entries(pesos)) {
    acc += peso;
    if (r <= acc) return porte;
  }
  return 'micro';
}

/** Valor mensal de um contrato recorrente baseado no porte */
export function valorContratoRecorrente(clienteTipo, porte) {
  const faixa = clienteTipo === 'PF' ? FAIXA_RECORRENTE.pf : (FAIXA_RECORRENTE[porte] || FAIXA_RECORRENTE.micro);
  return Math.floor(faixa.min + Math.random()*(faixa.max-faixa.min));
}
