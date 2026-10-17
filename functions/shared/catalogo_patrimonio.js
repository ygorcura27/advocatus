'use strict';

/**
 * CATÁLOGOS DE PATRIMÔNIO — cópia servidor de js/patrimonio.js (MORADIAS,
 * CARROS, SHOP). O cliente continua usando a própria cópia pra DESENHAR a
 * tela; preço, reputação e bônus que valem de verdade são sempre os daqui
 * (functions/patrimonio.js:acaoPatrimonio). Qualquer ajuste de preço ou
 * bônus feito em js/patrimonio.js precisa ser replicado aqui manualmente —
 * mesma convenção já usada em avancar_mes.js:EFEITO_TRACO_REL.
 */

const MORADIAS = {
  pais:        { l: 'Casa dos pais',        v: 0,       rep_al: 0,  rep_cp: 0,  pais: true },
  belford:     { l: 'Casa em Belford Roxo', v: 150000,  rep_al: -2, rep_cp: 0 },
  penha:       { l: 'Casa na Penha',        v: 250000,  rep_al: 0,  rep_cp: 3 },
  catete:      { l: 'Apto no Catete',       v: 700000,  rep_al: 7,  rep_cp: 18 },
  centro_apto: { l: 'Apto no Centro',       v: 500000,  rep_al: 4,  rep_cp: 10 },
  laranjeiras: { l: 'Apto nas Laranjeiras', v: 1100000, rep_al: 9,  rep_cp: 24 },
  icarai:      { l: 'Apto em Icaraí',       v: 1400000, rep_al: 11, rep_cp: 29 },
  ipanema:     { l: 'Apto em Ipanema',      v: 2500000, rep_al: 14, rep_cp: 38 },
  leblon:      { l: 'Apto em Leblon',       v: 3000000, rep_al: 15, rep_cp: 40 },
};

const CARROS = {
  onibus:     { l: 'Ônibus / Metrô',             v: 0,      rep: -1 },
  hatch:      { l: 'Hatchback',                  v: 75000,  rep: 2 },
  sedan:      { l: 'Sedã Executivo',             v: 160000, rep: 7 },
  suv:        { l: 'SUV',                        v: 200000, rep: 9 },
  esp_alemao: { l: 'Esportivo Alemão',           v: 380000, rep: 14 },
  esp_ital:   { l: 'Esportivo Italiano Premium', v: 850000, rep: 20 },
};

// skills: bônus aplicado na compra (mesma regra de js/patrimonio.js:comprarItem).
// 'todas' = +N em todas as skills que o jogador já tem.
const SHOP = {
  terno_basic: { n: 'Terno de Alfaiataria',     img: 'img/loja/terno-alfaiataria.jpeg', p: 4500,  cat: 'status', rep: 2 },
  terno_ital:  { n: 'Terno Italiano (Brioni)',  img: 'img/loja/terno-italiano.jpeg', p: 18000, cat: 'status', rep: 4 },
  sapato:      { n: 'Sapatos de Couro',         img: 'img/loja/sapato-couro.jpeg', p: 3200,  cat: 'status', rep: 1 },
  cinto:       { n: 'Cinto de Couro',           img: 'img/loja/cinto-couro.jpeg', p: 1800,  cat: 'status', rep: 1 },
  carteira:    { n: 'Carteira de Couro',        img: 'img/loja/carteira-couro.jpeg', p: 2200,  cat: 'status', rep: 1 },
  relogio_med: { n: 'Relógio Tissot',           img: 'img/loja/relogio-tissot.jpeg', p: 22000, cat: 'status', rep: 3 },
  rel_prem:    { n: 'Relógio Premium',          img: 'img/loja/relogio-premium.jpeg', p: 45000, cat: 'status', rep: 4 },
  relogio_lux: { n: 'Relógio Rolex',            img: 'img/loja/relogio-rolex.jpeg', p: 85000, cat: 'status', rep: 6 },
  bolsa:       { n: 'Pasta Hermès',             img: 'img/loja/pasta-hermes.jpeg', p: 12000, cat: 'status', rep: 2 },
  bj:          { n: 'Biblioteca Jurídica',      img: 'img/loja/biblioteca-juridica.jpeg', p: 12000, cat: 'prof', rep: 0, skills: { pesquisa: [8, 18] } },
  nb:          { n: 'Notebook Premium',         img: 'img/loja/notebook-premium.jpeg', p: 8500,  cat: 'prof', rep: 0, skills: { escrita: [6, 15], pesquisa: [6, 18] } },
  ai:          { n: 'Assistente IA Jurídico',   img: 'img/loja/assistente-ia.jpeg', p: 35000, cat: 'prof', rep: 1, skills: { todas: [8, 15] } },
  ac:          { n: 'Academia Premium (1 ano)', img: 'img/loja/academia-premium.jpeg', p: 3600,  cat: 'exp',  rep: 0, skills: { persuasao: [6, 12], oratoria: [4, 15] } },
  cong_sp:     { n: 'Congresso em São Paulo',   img: 'img/loja/congresso-sp.jpeg', p: 8000,  cat: 'cong', rep: 2, mes: 2,  networking: 5 },
  cong_rio:    { n: 'Congresso Rio de Janeiro', img: 'img/loja/congresso-rio.jpeg', p: 6000,  cat: 'cong', rep: 2, mes: 4,  networking: 5 },
  cong_lis:    { n: 'Congresso em Lisboa',      img: 'img/loja/congresso-lisboa.jpeg', p: 15000, cat: 'cong', rep: 3, mes: 6,  networking: 6 },
  cong_par:    { n: 'Congresso em Paris',       img: 'img/loja/congresso-paris.jpeg', p: 22000, cat: 'cong', rep: 4, mes: 8,  networking: 8 },
  cong_ber:    { n: 'Congresso em Berlim',      img: 'img/loja/congresso-berlim.jpeg', p: 18000, cat: 'cong', rep: 3, mes: 10, networking: 7 },
};

module.exports = { MORADIAS, CARROS, SHOP };
