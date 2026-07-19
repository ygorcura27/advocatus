/**
 * ESCRITÓRIOS NPC — Advocatus Online
 * 90 escritórios fixos: 3 por tier (1-5) × 6 especializações
 * Nomes inspirados em bancas reais brasileiras
 */

// ════════════════════════════════════════════════════════
// TIPOS DE VAGA — requisitos compatíveis com HABILIDADE_CAP
// ════════════════════════════════════════════════════════
export const TIPOS_VAGA = {
  estagiario_pesquisa: {
    l:       'Estagiário de Pesquisa',
    cargo:   'est',
    skills:  { pesquisa: 10 },
    sal_mult: 1.0,
    desc:    'Pesquisa legislativa e doutrinária. Porta de entrada.',
    bonus_chance: 0,
  },
  advogado_peticionante: {
    l:       'Advogado Peticionante',
    cargo:   'jnr',
    skills:  { escrita: 25, pesquisa: 20 },   // cap jnr = 45
    sal_mult: 1.05,
    desc:    'Elaboração de peças processuais e recursos.',
    bonus_chance: 2,
  },
  advogado_audiencista: {
    l:       'Advogado Audiencista',
    cargo:   'jnr',
    skills:  { oratoria: 28, persuasao: 20 }, // cap jnr = 45
    sal_mult: 1.08,
    desc:    'Audiências, sustentações orais e júri.',
    bonus_chance: 3,
  },
  advogado_contencioso: {
    l:       'Advogado Contencioso',
    cargo:   'jnr',
    skills:  { argumentacao: 28, oratoria: 22 },
    sal_mult: 1.10,
    desc:    'Litigância estratégica em todas as instâncias.',
    bonus_chance: 3,
  },
  advogado_consultor: {
    l:       'Advogado Consultor',
    cargo:   'pln',
    skills:  { pesquisa: 38, escrita: 32 },   // cap pln = 55
    sal_mult: 1.12,
    desc:    'Pareceres, due diligence e assessoria preventiva.',
    bonus_chance: 2,
  },
  advogado_parecerista: {
    l:       'Advogado Parecerista',
    cargo:   'pln',
    skills:  { escrita: 42, argumentacao: 36 }, // cap pln = 55
    sal_mult: 1.15,
    desc:    'Produção de pareceres técnicos de alta complexidade.',
    bonus_chance: 4,
  },
  advogado_palestrante: {
    l:       'Advogado Palestrante',
    cargo:   'snr',
    skills:  { oratoria: 48, networking: 38 }, // cap snr = 65
    sal_mult: 1.20,
    desc:    'Eventos, academia e desenvolvimento de negócios.',
    bonus_chance: 2,
  },
  socio_associado: {
    l:       'Sócio-Associado',
    cargo:   'soc',
    skills:  { gestao: 42, argumentacao: 45, escrita: 42 }, // cap snr = 65
    sal_mult: 1.35,
    desc:    'Gestão de equipe, carteira de clientes e participação nos lucros.',
    bonus_chance: 5,
  },
};

// ════════════════════════════════════════════════════════
// BÔNUS POR TIER
// ════════════════════════════════════════════════════════
export const TIER_BONUS = {
  1: { rep_passivo: 0,  networking_passivo: 0, caso_min: 1000,    caso_max: 50000,      bonus_chance_esp: 3 },
  2: { rep_passivo: 1,  networking_passivo: 1, caso_min: 20000,   caso_max: 200000,     bonus_chance_esp: 5 },
  3: { rep_passivo: 1,  networking_passivo: 1, caso_min: 80000,   caso_max: 800000,     bonus_chance_esp: 7 },
  4: { rep_passivo: 2,  networking_passivo: 2, caso_min: 300000,  caso_max: 5000000,    bonus_chance_esp: 10 },
  5: { rep_passivo: 3,  networking_passivo: 3, caso_min: 1000000, caso_max: 100000000,  bonus_chance_esp: 12 },
};

// Vagas abertas com frequência por tier
export const VAGA_FREQ = {
  1: 0.75,  // 75% de chance de ter vaga todo mês
  2: 0.55,
  3: 0.35,
  4: 0.15,
  5: 0.05,  // Tier 5 raramente tem vagas abertas — só convites por prestígio
};

// ════════════════════════════════════════════════════════
// ESCRITÓRIOS NPC
// Estrutura: { id, nome, tier, esp, bairro, zona, prestigio_base,
//              vagas_tipo[], sal_base, casos_min, casos_max }
// ════════════════════════════════════════════════════════
export const ESCRITORIOS_NPC = [

  // ══════════════════════════════
  // TRIBUTÁRIO
  // ══════════════════════════════

  // Tier 1
  { id:'tri_t1_a', nome:'Almeida & Sousa Advogados',         tier:1, esp:'tributario',    bairro:'Centro',          zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'tri_t1_b', nome:'Cunha Tributária',                   tier:1, esp:'tributario',    bairro:'Tijuca',          zona:'centro',   prestigio_base:22, sal_base:1800,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'tri_t1_c', nome:'Borges & Melo Consultores',          tier:1, esp:'tributario',    bairro:'Flamengo',        zona:'sul',      prestigio_base:25, sal_base:2000,  vagas:['estagiario_pesquisa','advogado_contencioso'] },

  // Tier 2
  { id:'tri_t2_a', nome:'Sacha Calmon & Misabel Derzi',       tier:2, esp:'tributario',    bairro:'Flamengo',        zona:'sul',      prestigio_base:40, sal_base:4500,  vagas:['advogado_peticionante','advogado_contencioso','advogado_consultor'] },
  { id:'tri_t2_b', nome:'Lacaz Martins Pereira Neto',         tier:2, esp:'tributario',    bairro:'Botafogo',        zona:'sul',      prestigio_base:42, sal_base:4800,  vagas:['advogado_contencioso','advogado_consultor'] },
  { id:'tri_t2_c', nome:'Vella Buosi & Guidetti',             tier:2, esp:'tributario',    bairro:'Copacabana',      zona:'sul',      prestigio_base:45, sal_base:5200,  vagas:['advogado_peticionante','advogado_parecerista'] },

  // Tier 3
  { id:'tri_t3_a', nome:'Machado Associados',                  tier:3, esp:'tributario',    bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:62, sal_base:9000,  vagas:['advogado_consultor','advogado_parecerista','advogado_contencioso'] },
  { id:'tri_t3_b', nome:'Freitas Leite Tributário',            tier:3, esp:'tributario',    bairro:'Ipanema',         zona:'sul',      prestigio_base:65, sal_base:9500,  vagas:['advogado_parecerista','advogado_audiencista'] },
  { id:'tri_t3_c', nome:'Pinheiro Neto Consultores',           tier:3, esp:'tributario',    bairro:'Lagoa',           zona:'sul',      prestigio_base:68, sal_base:10000, vagas:['advogado_consultor','advogado_parecerista'] },

  // Tier 4
  { id:'tri_t4_a', nome:'TozziniFreire Tributário',            tier:4, esp:'tributario',    bairro:'Ipanema',         zona:'sul',      prestigio_base:78, sal_base:18000, vagas:['advogado_parecerista','advogado_palestrante','socio_associado'] },
  { id:'tri_t4_b', nome:'Mattos Muriel Kestener',              tier:4, esp:'tributario',    bairro:'Leblon',          zona:'sul',      prestigio_base:80, sal_base:20000, vagas:['advogado_parecerista','socio_associado'] },
  { id:'tri_t4_c', nome:'Souza Cescon Tributário',             tier:4, esp:'tributario',    bairro:'São Conrado',     zona:'sul',      prestigio_base:82, sal_base:22000, vagas:['advogado_palestrante','socio_associado'] },

  // Tier 5
  { id:'tri_t5_a', nome:'Levy & Salomão Advogados',           tier:5, esp:'tributario',    bairro:'Leblon',          zona:'sul',      prestigio_base:92, sal_base:40000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'tri_t5_b', nome:'Barbosa Müssnich Aragão',            tier:5, esp:'tributario',    bairro:'São Conrado',     zona:'sul',      prestigio_base:94, sal_base:45000, vagas:['socio_associado'] },
  { id:'tri_t5_c', nome:'Trench Rossi Watanabe',              tier:5, esp:'tributario',    bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:96, sal_base:50000, vagas:['advogado_palestrante','socio_associado'] },

  // ══════════════════════════════
  // EMPRESARIAL
  // ══════════════════════════════

  // Tier 1
  { id:'emp_t1_a', nome:'Costa & Ribeiro Empresarial',        tier:1, esp:'empresarial',   bairro:'Centro',          zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'emp_t1_b', nome:'Dias Carneiro Advogados',             tier:1, esp:'empresarial',   bairro:'Tijuca',          zona:'centro',   prestigio_base:22, sal_base:1900,  vagas:['estagiario_pesquisa','advogado_contencioso'] },
  { id:'emp_t1_c', nome:'Faria & Nunes Consultores',           tier:1, esp:'empresarial',   bairro:'Flamengo',        zona:'sul',      prestigio_base:25, sal_base:2100,  vagas:['estagiario_pesquisa','advogado_peticionante'] },

  // Tier 2
  { id:'emp_t2_a', nome:'Azevedo Sette Advogados',             tier:2, esp:'empresarial',   bairro:'Botafogo',        zona:'sul',      prestigio_base:40, sal_base:4600,  vagas:['advogado_consultor','advogado_contencioso'] },
  { id:'emp_t2_b', nome:'Pacheco Neto Jordão',                 tier:2, esp:'empresarial',   bairro:'Flamengo',        zona:'sul',      prestigio_base:43, sal_base:4900,  vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'emp_t2_c', nome:'Braga & Moretti Empresarial',         tier:2, esp:'empresarial',   bairro:'Copacabana',      zona:'sul',      prestigio_base:46, sal_base:5300,  vagas:['advogado_contencioso','advogado_parecerista'] },

  // Tier 3
  { id:'emp_t3_a', nome:'Demarest Advogados',                  tier:3, esp:'empresarial',   bairro:'Lagoa',           zona:'sul',      prestigio_base:63, sal_base:9200,  vagas:['advogado_consultor','advogado_parecerista'] },
  { id:'emp_t3_b', nome:'Lefosse Advogados',                   tier:3, esp:'empresarial',   bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:66, sal_base:9800,  vagas:['advogado_parecerista','advogado_contencioso'] },
  { id:'emp_t3_c', nome:'Finocchio & Ustra',                   tier:3, esp:'empresarial',   bairro:'Ipanema',         zona:'sul',      prestigio_base:68, sal_base:10200, vagas:['advogado_consultor','advogado_audiencista'] },

  // Tier 4
  { id:'emp_t4_a', nome:'Mattos Filho Advogados',              tier:4, esp:'empresarial',   bairro:'Ipanema',         zona:'sul',      prestigio_base:79, sal_base:19000, vagas:['advogado_parecerista','socio_associado'] },
  { id:'emp_t4_b', nome:'Stocche Forbes Advogados',            tier:4, esp:'empresarial',   bairro:'Leblon',          zona:'sul',      prestigio_base:81, sal_base:21000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'emp_t4_c', nome:'Veirano Advogados',                   tier:4, esp:'empresarial',   bairro:'São Conrado',     zona:'sul',      prestigio_base:83, sal_base:23000, vagas:['advogado_parecerista','socio_associado'] },

  // Tier 5
  { id:'emp_t5_a', nome:'Pinheiro Neto Advogados',             tier:5, esp:'empresarial',   bairro:'Leblon',          zona:'sul',      prestigio_base:93, sal_base:42000, vagas:['socio_associado'] },
  { id:'emp_t5_b', nome:'Machado Meyer Advogados',             tier:5, esp:'empresarial',   bairro:'São Conrado',     zona:'sul',      prestigio_base:95, sal_base:47000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'emp_t5_c', nome:'Leite Tosto e Barros',                tier:5, esp:'empresarial',   bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:96, sal_base:52000, vagas:['socio_associado'] },

  // ══════════════════════════════
  // CIVIL
  // ══════════════════════════════

  // Tier 1
  { id:'civ_t1_a', nome:'Pereira & Lemos Civil',               tier:1, esp:'civil',         bairro:'Centro',          zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'civ_t1_b', nome:'Santos Rodrigues Advogados',           tier:1, esp:'civil',         bairro:'Tijuca',          zona:'centro',   prestigio_base:21, sal_base:1800,  vagas:['estagiario_pesquisa','advogado_contencioso'] },
  { id:'civ_t1_c', nome:'Moura & Tavares',                      tier:1, esp:'civil',         bairro:'Flamengo',        zona:'sul',      prestigio_base:24, sal_base:2000,  vagas:['estagiario_pesquisa','advogado_audiencista'] },

  // Tier 2
  { id:'civ_t2_a', nome:'Gama & Vasconcellos Civil',            tier:2, esp:'civil',         bairro:'Copacabana',      zona:'sul',      prestigio_base:40, sal_base:4400,  vagas:['advogado_contencioso','advogado_audiencista'] },
  { id:'civ_t2_b', nome:'Lima Andrade Advogados',               tier:2, esp:'civil',         bairro:'Botafogo',        zona:'sul',      prestigio_base:43, sal_base:4700,  vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'civ_t2_c', nome:'Cavalcante & Ferreira',                tier:2, esp:'civil',         bairro:'Flamengo',        zona:'sul',      prestigio_base:45, sal_base:5000,  vagas:['advogado_audiencista','advogado_contencioso'] },

  // Tier 3
  { id:'civ_t3_a', nome:'Muniz Advogados',                      tier:3, esp:'civil',         bairro:'Ipanema',         zona:'sul',      prestigio_base:62, sal_base:8800,  vagas:['advogado_parecerista','advogado_contencioso'] },
  { id:'civ_t3_b', nome:'Schiefler Advocacia',                  tier:3, esp:'civil',         bairro:'Lagoa',           zona:'sul',      prestigio_base:64, sal_base:9300,  vagas:['advogado_consultor','advogado_audiencista'] },
  { id:'civ_t3_c', nome:'Alves Pedroza & Associados',           tier:3, esp:'civil',         bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:67, sal_base:9700,  vagas:['advogado_parecerista','advogado_audiencista'] },

  // Tier 4
  { id:'civ_t4_a', nome:'Castro Barros Sobral',                 tier:4, esp:'civil',         bairro:'Ipanema',         zona:'sul',      prestigio_base:78, sal_base:17500, vagas:['advogado_parecerista','socio_associado'] },
  { id:'civ_t4_b', nome:'Dannemann Siemsen',                    tier:4, esp:'civil',         bairro:'São Conrado',     zona:'sul',      prestigio_base:80, sal_base:20000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'civ_t4_c', nome:'Fragata & Antunes',                    tier:4, esp:'civil',         bairro:'Leblon',          zona:'sul',      prestigio_base:82, sal_base:21500, vagas:['advogado_parecerista','socio_associado'] },

  // Tier 5
  { id:'civ_t5_a', nome:'Wald Associados',                      tier:5, esp:'civil',         bairro:'Leblon',          zona:'sul',      prestigio_base:91, sal_base:38000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'civ_t5_b', nome:'Siqueira Castro Advogados',            tier:5, esp:'civil',         bairro:'São Conrado',     zona:'sul',      prestigio_base:93, sal_base:44000, vagas:['socio_associado'] },
  { id:'civ_t5_c', nome:'Ulhoa Canto Rezende e Guerra',         tier:5, esp:'civil',         bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:95, sal_base:48000, vagas:['advogado_palestrante','socio_associado'] },

  // ══════════════════════════════
  // TRABALHISTA
  // ══════════════════════════════

  // Tier 1
  { id:'trab_t1_a', nome:'Mota & Correia Trabalhista',          tier:1, esp:'trabalhista',   bairro:'Centro',          zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_audiencista'] },
  { id:'trab_t1_b', nome:'Queiroz & Lima Advogados',            tier:1, esp:'trabalhista',   bairro:'Tijuca',          zona:'centro',   prestigio_base:22, sal_base:1850,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'trab_t1_c', nome:'Barbosa & Netto Trabalhista',         tier:1, esp:'trabalhista',   bairro:'Flamengo',        zona:'sul',      prestigio_base:24, sal_base:2000,  vagas:['estagiario_pesquisa','advogado_contencioso'] },

  // Tier 2
  { id:'trab_t2_a', nome:'Góes & Nicoladeli',                   tier:2, esp:'trabalhista',   bairro:'Botafogo',        zona:'sul',      prestigio_base:41, sal_base:4500,  vagas:['advogado_audiencista','advogado_contencioso'] },
  { id:'trab_t2_b', nome:'Feliciano Advogados',                  tier:2, esp:'trabalhista',   bairro:'Copacabana',      zona:'sul',      prestigio_base:44, sal_base:4900,  vagas:['advogado_contencioso','advogado_consultor'] },
  { id:'trab_t2_c', nome:'Torres Trabalhista',                   tier:2, esp:'trabalhista',   bairro:'Flamengo',        zona:'sul',      prestigio_base:46, sal_base:5100,  vagas:['advogado_audiencista','advogado_peticionante'] },

  // Tier 3
  { id:'trab_t3_a', nome:'Pimentel & Rohenkohl',                tier:3, esp:'trabalhista',   bairro:'Lagoa',           zona:'sul',      prestigio_base:62, sal_base:8900,  vagas:['advogado_consultor','advogado_audiencista'] },
  { id:'trab_t3_b', nome:'Furtado Trabalhista',                  tier:3, esp:'trabalhista',   bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:65, sal_base:9400,  vagas:['advogado_parecerista','advogado_contencioso'] },
  { id:'trab_t3_c', nome:'Sá Cavalcante Advogados',             tier:3, esp:'trabalhista',   bairro:'Ipanema',         zona:'sul',      prestigio_base:67, sal_base:9900,  vagas:['advogado_consultor','advogado_audiencista'] },

  // Tier 4
  { id:'trab_t4_a', nome:'Lara Martins Advogados',              tier:4, esp:'trabalhista',   bairro:'Ipanema',         zona:'sul',      prestigio_base:79, sal_base:18500, vagas:['advogado_parecerista','socio_associado'] },
  { id:'trab_t4_b', nome:'Alino & Santiago Trabalhista',        tier:4, esp:'trabalhista',   bairro:'Leblon',          zona:'sul',      prestigio_base:81, sal_base:20500, vagas:['advogado_palestrante','socio_associado'] },
  { id:'trab_t4_c', nome:'Bomfim Advogados',                    tier:4, esp:'trabalhista',   bairro:'São Conrado',     zona:'sul',      prestigio_base:83, sal_base:22500, vagas:['advogado_parecerista','socio_associado'] },

  // Tier 5
  { id:'trab_t5_a', nome:'Carvalho Siqueira Advogados',         tier:5, esp:'trabalhista',   bairro:'São Conrado',     zona:'sul',      prestigio_base:92, sal_base:40000, vagas:['socio_associado'] },
  { id:'trab_t5_b', nome:'Mauro Menezes & Advogados',           tier:5, esp:'trabalhista',   bairro:'Leblon',          zona:'sul',      prestigio_base:94, sal_base:46000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'trab_t5_c', nome:'Rodrigues & Calheiros',               tier:5, esp:'trabalhista',   bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:95, sal_base:49000, vagas:['socio_associado'] },

  // ══════════════════════════════
  // CRIMINAL
  // ══════════════════════════════

  // Tier 1
  { id:'crim_t1_a', nome:'Azevedo & Lima Criminal',             tier:1, esp:'criminal',      bairro:'Centro',          zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'crim_t1_b', nome:'Brandão & Matos Defesa',              tier:1, esp:'criminal',      bairro:'Tijuca',          zona:'centro',   prestigio_base:22, sal_base:1900,  vagas:['estagiario_pesquisa','advogado_audiencista'] },
  { id:'crim_t1_c', nome:'Sousa Neto Criminal',                  tier:1, esp:'criminal',      bairro:'Flamengo',        zona:'sul',      prestigio_base:24, sal_base:2100,  vagas:['estagiario_pesquisa','advogado_contencioso'] },

  // Tier 2
  { id:'crim_t2_a', nome:'Arantes & Pugliese',                  tier:2, esp:'criminal',      bairro:'Botafogo',        zona:'sul',      prestigio_base:40, sal_base:4600,  vagas:['advogado_audiencista','advogado_contencioso'] },
  { id:'crim_t2_b', nome:'Dallagnol & Vasconcellos',            tier:2, esp:'criminal',      bairro:'Copacabana',      zona:'sul',      prestigio_base:43, sal_base:5000,  vagas:['advogado_contencioso','advogado_consultor'] },
  { id:'crim_t2_c', nome:'Bechara Criminal',                    tier:2, esp:'criminal',      bairro:'Flamengo',        zona:'sul',      prestigio_base:46, sal_base:5300,  vagas:['advogado_audiencista','advogado_peticionante'] },

  // Tier 3
  { id:'crim_t3_a', nome:'Fernandes & Pacelli',                 tier:3, esp:'criminal',      bairro:'Ipanema',         zona:'sul',      prestigio_base:63, sal_base:9000,  vagas:['advogado_consultor','advogado_audiencista'] },
  { id:'crim_t3_b', nome:'Bitencourt Criminal',                 tier:3, esp:'criminal',      bairro:'Lagoa',           zona:'sul',      prestigio_base:66, sal_base:9600,  vagas:['advogado_parecerista','advogado_contencioso'] },
  { id:'crim_t3_c', nome:'Zaffaroni & Pierangeli',              tier:3, esp:'criminal',      bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:68, sal_base:10100, vagas:['advogado_audiencista','advogado_parecerista'] },

  // Tier 4
  { id:'crim_t4_a', nome:'Reale Júnior Advogados',              tier:4, esp:'criminal',      bairro:'Ipanema',         zona:'sul',      prestigio_base:79, sal_base:18000, vagas:['advogado_parecerista','socio_associado'] },
  { id:'crim_t4_b', nome:'Toron Torinho Criminal',              tier:4, esp:'criminal',      bairro:'Leblon',          zona:'sul',      prestigio_base:81, sal_base:21000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'crim_t4_c', nome:'Maurício Zanoide Criminal',           tier:4, esp:'criminal',      bairro:'São Conrado',     zona:'sul',      prestigio_base:83, sal_base:23000, vagas:['advogado_parecerista','socio_associado'] },

  // Tier 5
  { id:'crim_t5_a', nome:'Delmanto Advogados',                  tier:5, esp:'criminal',      bairro:'Leblon',          zona:'sul',      prestigio_base:91, sal_base:39000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'crim_t5_b', nome:'Malan & Procópio',                   tier:5, esp:'criminal',      bairro:'São Conrado',     zona:'sul',      prestigio_base:93, sal_base:45000, vagas:['socio_associado'] },
  { id:'crim_t5_c', nome:'Shecaira & Silveira',                tier:5, esp:'criminal',      bairro:'Barra da Tijuca', zona:'sudoeste', prestigio_base:95, sal_base:50000, vagas:['socio_associado'] },

  // ══════════════════════════════
  // PREVIDENCIÁRIO
  // ══════════════════════════════

  // Tier 1
  { id:'prev_t1_a', nome:'Oliveira & Castro Previdência',       tier:1, esp:'previdenciario', bairro:'Centro',         zona:'centro',   prestigio_base:20, sal_base:1700,  vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'prev_t1_b', nome:'Mendes & Souza Previdenciário',       tier:1, esp:'previdenciario', bairro:'Tijuca',         zona:'centro',   prestigio_base:21, sal_base:1800,  vagas:['estagiario_pesquisa','advogado_audiencista'] },
  { id:'prev_t1_c', nome:'Porto & Vieira Previdência',          tier:1, esp:'previdenciario', bairro:'Flamengo',       zona:'sul',      prestigio_base:23, sal_base:1950,  vagas:['estagiario_pesquisa','advogado_contencioso'] },

  // Tier 2
  { id:'prev_t2_a', nome:'Coimbra & Chaves Previdenciário',     tier:2, esp:'previdenciario', bairro:'Copacabana',     zona:'sul',      prestigio_base:40, sal_base:4300,  vagas:['advogado_audiencista','advogado_contencioso'] },
  { id:'prev_t2_b', nome:'Fonseca & Luz Previdência',           tier:2, esp:'previdenciario', bairro:'Botafogo',       zona:'sul',      prestigio_base:42, sal_base:4600,  vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'prev_t2_c', nome:'Ibrahim & Vieira Previdenciário',     tier:2, esp:'previdenciario', bairro:'Flamengo',       zona:'sul',      prestigio_base:44, sal_base:4900,  vagas:['advogado_audiencista','advogado_peticionante'] },

  // Tier 3
  { id:'prev_t3_a', nome:'Horvath & Musetti',                   tier:3, esp:'previdenciario', bairro:'Lagoa',          zona:'sul',      prestigio_base:61, sal_base:8700,  vagas:['advogado_consultor','advogado_audiencista'] },
  { id:'prev_t3_b', nome:'Balthazar & Associados',              tier:3, esp:'previdenciario', bairro:'Ipanema',        zona:'sul',      prestigio_base:64, sal_base:9200,  vagas:['advogado_parecerista','advogado_contencioso'] },
  { id:'prev_t3_c', nome:'Cardoso Previdência',                 tier:3, esp:'previdenciario', bairro:'Barra da Tijuca',zona:'sudoeste', prestigio_base:66, sal_base:9600,  vagas:['advogado_consultor','advogado_audiencista'] },

  // Tier 4
  { id:'prev_t4_a', nome:'Savaris & Gonçalves',                 tier:4, esp:'previdenciario', bairro:'Ipanema',        zona:'sul',      prestigio_base:78, sal_base:17000, vagas:['advogado_parecerista','socio_associado'] },
  { id:'prev_t4_b', nome:'Martinez Previdenciário',             tier:4, esp:'previdenciario', bairro:'Leblon',         zona:'sul',      prestigio_base:80, sal_base:19500, vagas:['advogado_palestrante','socio_associado'] },
  { id:'prev_t4_c', nome:'Lazzari & Castro',                    tier:4, esp:'previdenciario', bairro:'São Conrado',    zona:'sul',      prestigio_base:82, sal_base:21000, vagas:['advogado_parecerista','socio_associado'] },

  // Tier 5
  { id:'prev_t5_a', nome:'Kertzman Previdência',                tier:5, esp:'previdenciario', bairro:'Leblon',         zona:'sul',      prestigio_base:90, sal_base:36000, vagas:['advogado_palestrante','socio_associado'] },
  { id:'prev_t5_b', nome:'Goes & Zuanazzi',                     tier:5, esp:'previdenciario', bairro:'São Conrado',    zona:'sul',      prestigio_base:92, sal_base:42000, vagas:['socio_associado'] },
  { id:'prev_t5_c', nome:'Rocha Previdência Nacional',          tier:5, esp:'previdenciario', bairro:'Barra da Tijuca',zona:'sudoeste', prestigio_base:94, sal_base:46000, vagas:['socio_associado'] },

  // ══════════════════════════════
  // TERRITÓRIO (GDD v6.0 §8) — 1 escritório por especialidade em cada
  // comarca nova, pra nenhuma especialidade ficar sem vaga nenhuma fora do
  // Rio. Catálogo bem menor que o do Rio (que é a "capital", 90 entradas) —
  // essas são praças secundárias/em expansão, não espelham o Rio 1:1.
  // Todo escritório SEM campo `comarca` é do Rio (ver comarcaDoEscritorio
  // abaixo) — os 90 acima nunca precisaram ganhar o campo retroativamente.
  // ══════════════════════════════

  // São Paulo — maior mercado jurídico do país, tiers 2-4 (mercado grande,
  // mas não é onde fica o endgame — isso é Brasília, ver abaixo)
  { id:'sp_civ_a',  nome:'Perissinotto & Andrade Cível',   tier:2, esp:'civil',          bairro:'Pinheiros',    zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:42, sal_base:4600,  vagas:['advogado_peticionante','advogado_contencioso','advogado_consultor'] },
  { id:'sp_crim_a', nome:'Bittar Criminalistas',           tier:2, esp:'criminal',       bairro:'Brooklin',     zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:43, sal_base:4300,  vagas:['advogado_contencioso','advogado_audiencista'] },
  { id:'sp_emp_a',  nome:'Faria Lima Corporate',           tier:4, esp:'empresarial',    bairro:'Faria Lima',   zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:80, sal_base:19500, vagas:['advogado_parecerista','advogado_palestrante','socio_associado'] },
  { id:'sp_prev_a', nome:'Damasceno Previdenciário SP',    tier:2, esp:'previdenciario', bairro:'Jardins',      zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:41, sal_base:4100,  vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'sp_trab_a', nome:'Vila Olímpia Trabalhista',       tier:3, esp:'trabalhista',    bairro:'Itaim Bibi',   zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:64, sal_base:9600,  vagas:['advogado_consultor','advogado_parecerista'] },
  { id:'sp_tri_a',  nome:'Bela Vista Tributário',          tier:3, esp:'tributario',     bairro:'Vila Olímpia', zona:'sao_paulo', comarca:'sao_paulo',    prestigio_base:66, sal_base:9900,  vagas:['advogado_consultor','advogado_parecerista','advogado_contencioso'] },

  // Brasília — "endgame territorial" do GDD (STJ/STF, caro/estressante,
  // renome altíssimo) — tiers 3-5 só, sem porta de entrada tier 1, de propósito.
  { id:'df_civ_a',  nome:'Asa Sul Advocacia Cível',        tier:3, esp:'civil',          bairro:'Asa Sul',      zona:'brasilia',  comarca:'brasilia',     prestigio_base:65, sal_base:9200,  vagas:['advogado_consultor','advogado_contencioso'] },
  { id:'df_crim_a', nome:'Asa Norte Criminalistas',        tier:3, esp:'criminal',       bairro:'Asa Norte',    zona:'brasilia',  comarca:'brasilia',     prestigio_base:66, sal_base:9400,  vagas:['advogado_contencioso','advogado_audiencista'] },
  { id:'df_emp_a',  nome:'Sudoeste Corporate Brasília',    tier:4, esp:'empresarial',    bairro:'Sudoeste',     zona:'brasilia',  comarca:'brasilia',     prestigio_base:79, sal_base:18800, vagas:['advogado_parecerista','advogado_palestrante','socio_associado'] },
  { id:'df_prev_a', nome:'SCS Previdência Federal',        tier:3, esp:'previdenciario', bairro:'SCS',          zona:'brasilia',  comarca:'brasilia',     prestigio_base:67, sal_base:9700,  vagas:['advogado_consultor','advogado_parecerista'] },
  { id:'df_trab_a', nome:'Lago Sul Trabalhista',           tier:4, esp:'trabalhista',    bairro:'Lago Sul',     zona:'brasilia',  comarca:'brasilia',     prestigio_base:81, sal_base:19200, vagas:['advogado_parecerista','socio_associado'] },
  { id:'df_tri_a',  nome:'Brasília Tributário Federal',    tier:5, esp:'tributario',     bairro:'Asa Sul',      zona:'brasilia',  comarca:'brasilia',     prestigio_base:95, sal_base:43000, vagas:['advogado_palestrante','socio_associado'] },

  // Interior (2-3 comarcas do GDD) — Petrópolis e Volta Redonda, praças
  // pequenas, só tier 1-2 (porta de entrada, sem mercado pra escritório
  // grande — Volta Redonda puxado por trabalhista/previdenciário, cidade
  // industrial/CSN).
  { id:'pet_civ_a',  nome:'Valparaíso Advocacia',          tier:1, esp:'civil',          bairro:'Valparaíso', zona:'petropolis',    comarca:'petropolis',    prestigio_base:20, sal_base:1700, vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'pet_crim_a', nome:'Retiro Criminalistas',          tier:1, esp:'criminal',       bairro:'Retiro',     zona:'petropolis',    comarca:'petropolis',    prestigio_base:21, sal_base:1750, vagas:['estagiario_pesquisa','advogado_contencioso'] },
  { id:'pet_emp_a',  nome:'Centro Empresarial Petrópolis', tier:2, esp:'empresarial',    bairro:'Centro',     zona:'petropolis',    comarca:'petropolis',    prestigio_base:40, sal_base:4200, vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'pet_prev_a', nome:'Quitandinha Previdência',       tier:1, esp:'previdenciario', bairro:'Valparaíso', zona:'petropolis',    comarca:'petropolis',    prestigio_base:20, sal_base:1700, vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'pet_trab_a', nome:'Centro Trabalhista Serrano',    tier:2, esp:'trabalhista',    bairro:'Centro',     zona:'petropolis',    comarca:'petropolis',    prestigio_base:41, sal_base:4400, vagas:['advogado_peticionante','advogado_contencioso'] },
  { id:'pet_tri_a',  nome:'Retiro Tributário',             tier:1, esp:'tributario',     bairro:'Retiro',     zona:'petropolis',    comarca:'petropolis',    prestigio_base:22, sal_base:1800, vagas:['estagiario_pesquisa','advogado_peticionante'] },

  { id:'vr_civ_a',  nome:'Aterrado Advocacia Cível',       tier:1, esp:'civil',          bairro:'Aterrado',           zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:20, sal_base:1700, vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'vr_crim_a', nome:'Santa Cecília Criminalistas',    tier:2, esp:'criminal',       bairro:'Vila Santa Cecília', zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:40, sal_base:4300, vagas:['advogado_peticionante','advogado_contencioso'] },
  { id:'vr_emp_a',  nome:'Jardim Paraíba Empresarial',     tier:1, esp:'empresarial',    bairro:'Jardim Paraíba',     zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:21, sal_base:1800, vagas:['estagiario_pesquisa','advogado_peticionante'] },
  { id:'vr_prev_a', nome:'Aterrado Previdência do Trabalhador', tier:2, esp:'previdenciario', bairro:'Aterrado',     zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:42, sal_base:4100, vagas:['advogado_peticionante','advogado_consultor'] },
  { id:'vr_trab_a', nome:'CSN Trabalhista Associados',     tier:2, esp:'trabalhista',    bairro:'Vila Santa Cecília', zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:44, sal_base:4600, vagas:['advogado_peticionante','advogado_contencioso','advogado_consultor'] },
  { id:'vr_tri_a',  nome:'Jardim Paraíba Tributário',      tier:1, esp:'tributario',     bairro:'Jardim Paraíba',     zona:'volta_redonda', comarca:'volta_redonda', prestigio_base:22, sal_base:1750, vagas:['estagiario_pesquisa','advogado_peticionante'] },
];

// ════════════════════════════════════════════════════════
// COMARCAS (GDD v6.0 §8 — Território)
// ════════════════════════════════════════════════════════
export const COMARCAS = [
  { id:'rio',           nome:'Rio de Janeiro', capital:true,  endgame:false },
  { id:'sao_paulo',     nome:'São Paulo',      capital:false, endgame:false },
  { id:'brasilia',      nome:'Brasília',       capital:false, endgame:true  },
  { id:'petropolis',    nome:'Petrópolis',     capital:false, endgame:false },
  { id:'volta_redonda', nome:'Volta Redonda',  capital:false, endgame:false },
];

/** Todo escritório dos 90 originais do Rio nunca ganhou o campo `comarca` — default lazy, mesmo padrão do resto do jogo (`?? valor`). */
export function comarcaDoEscritorio(esc) {
  return esc?.comarca || 'rio';
}

// ════════════════════════════════════════════════════════
// CORRESPONDENTES (GDD v6.0 §7.5) — B2B, contratar presença numa comarca
// sem precisar abrir filial lá. Opção NPC "flagship" (a firma de maior
// tier do catálogo daquela comarca, sempre disponível) — decisão híbrida
// do usuário: NPC funciona desde o dia 1; a opção "jogador real" (outro
// player oferecendo correspondência) fica pronta na estrutura de dados mas
// só aparece quando existir alguém — hoje ninguém tem escritório fora do
// Rio (criarEscritorio só aceita bairros do Rio, "abrir filial" é feature
// separada ainda não construída), então o lado jogador nasce vazio.
// Rio não entra — é onde todo mundo já começa, não faz sentido "contratar
// correspondente" pra onde você já está.
export const CORRESPONDENTE_NPC_POR_COMARCA = {
  sao_paulo:     { nome: 'Faria Lima Corporate',        valor_mensal: 3000 },
  brasilia:      { nome: 'Brasília Tributário Federal',  valor_mensal: 6000 },
  petropolis:    { nome: 'Centro Empresarial Petrópolis', valor_mensal: 800 },
  volta_redonda: { nome: 'CSN Trabalhista Associados',   valor_mensal: 800 },
};

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

/** Retorna escritórios por especialização */
export function escritoriosPorEsp(esp) {
  return ESCRITORIOS_NPC.filter(e => e.esp === esp);
}

/** Retorna escritórios por tier */
export function escritoriosPorTier(tier) {
  return ESCRITORIOS_NPC.filter(e => e.tier === tier);
}

/** Retorna escritórios compatíveis com o jogador (cargo + skills) */
export function escritoriosCompativeis(jogador) {
  const CARGO_IDX = { est:0, ass:1, jnr:2, pln:3, snr:4, asc:5, soc:6, snm:7 };
  const meuIdx    = CARGO_IDX[jogador.cargo_id] || 0;
  const esp       = jogador.especialidade;
  const skills    = jogador.skills || {};

  return ESCRITORIOS_NPC.filter(esc => {
    if (esc.esp !== esp) return false;
    // Verificar se há pelo menos uma vaga acessível
    return esc.vagas.some(vagaId => {
      const vaga = TIPOS_VAGA[vagaId];
      if (!vaga) return false;
      const vagaIdx = CARGO_IDX[vaga.cargo] || 0;
      if (meuIdx < vagaIdx) return false;
      // Verificar skills mínimas (respeitando o cap do cargo)
      return Object.entries(vaga.skills).every(([sk, min]) => {
        const capAtual = window.HABILIDADE_CAP || 50;
        const minAdj   = Math.min(min, capAtual); // nunca exigir acima do cap
        return (skills[sk] || 0) >= minAdj;
      });
    });
  });
}

/** Calcula salário de uma vaga num escritório NPC */
export function calcSalarioVaga(esc, vagaId, jogador) {
  const vaga    = TIPOS_VAGA[vagaId];
  if (!vaga) return esc.sal_base;
  const repF    = Math.min(1, (jogador.reputacao || 30) / 100);
  const salMin  = Math.floor(esc.sal_base * vaga.sal_mult);
  const salMax  = Math.floor(salMin * 1.4);
  return Math.floor(salMin + (salMax - salMin) * repF);
}

/** Verifica se o escritório tem vaga aberta este mês (probabilidade por tier) */
export function temVagaAberta(esc) {
  const freq = VAGA_FREQ[esc.tier] || 0.5;
  return Math.random() < freq;
}

/** Calcula o prestígio atual do jogador no seu tier
 *  (rep / REP_CAP do cargo atual, em %) */
export function prestigioNoTier(jogador) {
  const cap = window.REP_CAP?.[jogador.cargo_id] || 55;
  return Math.round(((jogador.reputacao || 0) / cap) * 100);
}
