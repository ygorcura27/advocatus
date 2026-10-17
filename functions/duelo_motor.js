'use strict';

/**
 * MOTOR DA AUDIÊNCIA COMO DUELO — regras puras (sem Firestore).
 * Especificação: docs/DUELO_AUDIENCIA.md (fase 1 / MVP).
 *
 * Tudo aqui é determinístico dado um `rng` (função () => [0,1)), pra poder
 * testar e simular milhares de audiências (functions/test/duelo*.test.js e
 * scripts/simular_duelo.js). functions/duelo.js só carrega/salva o estado.
 *
 * O estado COMPLETO (baralho do adversário, perfil do juiz, vícios) fica num
 * documento que só o servidor lê; o cliente recebe `estadoPublico(estado)`.
 */

const { PESO_TEMA_POR_CLASSE, HINT_CLASSE_JULGADOR } = require('./banco_juridico');
const sk = require('./investigacao_skills');
const { multiplicadorNota, calcularFolego } = require('./estresse');
const { getAtributo, ESCALA_BASE } = require('./atributos');
const FALAS = require('./shared/falas_duelo');

// ─── Constantes de balanceamento (calibrar com scripts/simular_duelo.js) ────
const CONV_INICIAL        = 40;
const BONUS_MONTAGEM_MAX  = 8;
const LIMIAR_PROCEDENTE   = 65;
const LIMIAR_PARCIAL      = 50;
const K_DANO              = 1.12;
const K_GANHO             = 0.9;
const MULT_FINAL          = 1.5;
const MULT_FINAL_FECHADOR = 1.8;
const MULT_SUJA           = 1.4;
const PACIENCIA_INICIAL   = 7;
const IRRITADO_MULT       = 0.7;
const GOLPE_FORTE         = 14;
const PENALIDADE_EXPOSTA  = 6;

// Peso do testemunho por classe de juiz (a matriz original não tem essa linha).
const PESO_TESTEMUNHO = {
  tributarista: 2, empresarialista: 3, consumerista: 6, civilista: 4, penalista: 6, garantista: 5,
  formalista: 3, pragmatico: 5, administrativista: 3, constitucionalista: 3, humanista: 8,
};

// Juízes de 1º grau (os julgadores existentes são de TJ/STJ/STF).
const JUIZES_1GRAU = [
  { nome: 'Dr. Augusto Mendonça Prado',   classe: 'formalista' },
  { nome: 'Dra. Lúcia Fernandes Rocha',   classe: 'humanista' },
  { nome: 'Dr. Ricardo Albuquerque Lins', classe: 'pragmatico' },
  { nome: 'Dra. Simone Azevedo Barreto',  classe: 'garantista' },
  { nome: 'Dr. Paulo Henrique Cordeiro',  classe: 'civilista' },
  { nome: 'Dra. Mônica Tavares Leal',     classe: 'consumerista' },
  { nome: 'Dr. Gustavo Rangel Peixoto',   classe: 'tributarista' },
  { nome: 'Dra. Fernanda Coutinho Sá',    classe: 'empresarialista' },
  { nome: 'Dr. Henrique Sampaio Falcão',  classe: 'penalista' },
  { nome: 'Dra. Juliana Prates Moura',    classe: 'administrativista' },
  { nome: 'Dr. Vinícius Lacerda Brito',   classe: 'constitucionalista' },
  { nome: 'Dra. Cecília Antunes Vidal',   classe: 'formalista' },
  { nome: 'Dr. Mauro Siqueira Dantas',    classe: 'pragmatico' },
  { nome: 'Dra. Raquel Bastos Guimarães', classe: 'humanista' },
];

const ADVOGADOS_ADV = [
  'Dr. Rodrigo Valente', 'Dra. Carla Montenegro', 'Dr. Fábio Arruda', 'Dra. Paula Rezende',
  'Dr. Leandro Castilho', 'Dra. Vera Sallum', 'Dr. Otávio Brennand', 'Dra. Bianca Furtado',
];

const ESTILOS = {
  agressivo: { tipos: { agressivo: 3, testemunho: 2, prova_documental: 1, precedente: 1 }, mult: 1.12, vicio: 0.40 },
  tecnico:   { tipos: { aspecto_processual: 2, prazo: 2, prova_documental: 2, precedente: 2, prova_pericial: 1 }, mult: 1.0, vicio: 0.15 },
  teatral:   { tipos: { agressivo: 2, testemunho: 3, precedente: 1, prova_pericial: 1 }, mult: 1.05, vicio: 0.35 },
  burocrata: { tipos: { prova_documental: 2, prazo: 2, aspecto_processual: 1, precedente: 1 }, mult: 0.88, vicio: 0.25 },
};

// Tipo de argumento de cada carta, a partir do tipo do nó da investigação.
const TIPO_POR_NO = {
  consulta: 'testemunho', entrevista: 'testemunho', favor_relacionamento: 'testemunho',
  analise_documental: 'prova_documental', pericia: 'prova_pericial',
};
const NOME_CARTA = {
  testemunho: 'Depoimento', prova_documental: 'Documento', prova_pericial: 'Laudo pericial',
  jurisprudencia: 'Tese do escritório', precedente: 'Precedente',
};
// "Família" para contestação total (mesma família = contradiz por completo).
const FAMILIA = {
  testemunho: 'fato', prova_documental: 'documento', prova_pericial: 'pericia',
  jurisprudencia: 'direito', precedente: 'direito', materia_constitucional: 'direito',
  aspecto_processual: 'rito', prazo: 'rito', agressivo: 'retorica',
};

const TRACOS = {
  memoria_eidetica: { nome: 'Memória Eidética', skill: 'pesquisa' },
  o_fechador:       { nome: 'O Fechador', skill: 'persuasao' },
};

// ─── Utilitários ────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function sortearPeso(mapa, rng) {
  const entradas = Object.entries(mapa);
  const total = entradas.reduce((s, [, p]) => s + p, 0);
  let r = rng() * total;
  for (const [k, p] of entradas) { if ((r -= p) < 0) return k; }
  return entradas[entradas.length - 1][0];
}
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function pesoJuiz(tipo, classe) {
  if (tipo === 'testemunho') return PESO_TESTEMUNHO[classe] ?? 4;
  return PESO_TEMA_POR_CLASSE[tipo]?.[classe] ?? 4;
}
/**
 * Potência de uma força bruta (carta ou golpe) — retorno decrescente: dobrar
 * a força de uma prova não dobra o efeito. Sem isso, investigação boa ganhava
 * tudo e investigação fraca perdia tudo, e a jogada no duelo quase não pesava.
 * 16 → 10 · 9 → 7,5 · 30 → 13,7.
 */
function potencia(forca) { return 10 * Math.sqrt(Math.max(0, forca) / 16); }

/** Quanto aquele juiz valoriza aquele tipo de argumento: 0,3 (despreza) a 1,8 (adora). */
function fatorJuiz(tipo, classe) { return clamp(pesoJuiz(tipo, classe) / 5, 0.3, 1.8); }

function nivelTraco(j, id) {
  const base = (j.skills || {})[TRACOS[id].skill] || 0;
  return clamp(1 + Math.floor(Math.max(0, base - 20) / 15), 1, 3);
}

// ─── Criação ────────────────────────────────────────────────────────────────

/**
 * @param {object} p  processo (precisa de investigacao com julgamento montado)
 * @param {object} j  jogador
 * @param {function} rng
 * @param {string} seedId  id do processo (escolha determinística do juiz)
 */
function criarDuelo(p, j, rng, seedId = '') {
  const inv  = p.investigacao || {};
  const julg = inv.julgamento || { pecas_restantes: [] };
  const skJur = j.skills_jur || {};

  // Mão: peças da montagem viram cartas.
  const tipoNo = {};
  for (const no of inv.nos || []) tipoNo[no.id] = no.tipo;
  const mao = (julg.pecas_restantes || []).map((pc, i) => {
    const tipo = pc.tese ? 'jurisprudencia' : (TIPO_POR_NO[tipoNo[pc.no_id]] || 'prova_documental');
    return {
      id: `c${i}`, origem: pc.no_id, tipo, nome: NOME_CARTA[tipo] || 'Prova',
      forca: Math.max(1, Math.round(pc.forca)), suja: !!pc.suja, pilar: !!pc.pilar, usada: false,
    };
  });
  const somaForcas = mao.reduce((s, c) => s + c.forca, 0);
  const bonusVademecum = inv.tese_vademecum?.bonus_limiar || 0;

  // Juiz e adversário.
  const juiz = JUIZES_1GRAU[hash(seedId || String(rng())) % JUIZES_1GRAU.length];
  const vezes = (j.juizes_vistos || {})[juiz.nome] || 0;
  const estilo = sortearPeso({ agressivo: 3, tecnico: 3, teatral: 2, burocrata: 2 }, rng);
  const valor = p.valor || p.valor_causa || 20000;
  const instancia = p.instancia_atual && p.instancia_atual !== '1grau' ? 3 : 0;
  const escalaValor = clamp(Math.log10(Math.max(5000, valor)) - 3.7, 0, 2.3) * 6; // 5k → 0, 800k ≈ +8
  const forcaAdvBase = 12 + escalaValor + (inv.investigacao_adversaria || 0) / 5 + instancia;

  const plano = ['ataque', 'sua_vez', 'ataque', 'sua_vez', 'ataque'];
  if (valor >= 300000) plano.push('sua_vez', 'ataque');
  plano.push('final');

  const est = ESTILOS[estilo];
  const nAtaques = plano.filter((f) => f === 'ataque').length;
  const baralho = [];
  for (let i = 0; i < nAtaques; i++) {
    const tipo = sortearPeso(est.tipos, rng);
    const forca = Math.round((forcaAdvBase + (rng() * 8 - 4)) * est.mult);
    baralho.push({ tipo, forca: Math.max(4, forca), vicio: rng() < est.vicio, fala: FALAS.ataque(tipo, estilo, p, rng) });
  }

  const folego = calcularFolego(j.estresse);
  const constituicao = getAtributo(j, 'constituicao');
  const charm = getAtributo(j, 'charm');
  const compostura_max = 6 + folego + Math.max(0, Math.floor((constituicao - ESCALA_BASE) / 3));

  const tracos = (j.tracos_assinatura || [])
    .filter((t) => TRACOS[t.id || t])
    .map((t) => { const id = t.id || t; const nivel = nivelTraco(j, id); return { id, nome: TRACOS[id].nome, nivel, usos: nivel >= 3 ? 2 : 1 }; });

  const estado = {
    modo: 'duelo', versao: 1,
    plano, rodada: 0, fase: plano[0],
    convencimento: clamp(CONV_INICIAL + Math.min(BONUS_MONTAGEM_MAX, somaForcas / 20) + bonusVademecum * 0.6, 0, 100),
    compostura: compostura_max, compostura_max,
    paciencia: clamp(PACIENCIA_INICIAL + Math.max(0, Math.floor((charm - ESCALA_BASE) / 4)), 1, 10),
    irritado: false,
    bonus_proxima: 0,
    mao,
    juiz: { nome: juiz.nome, classe: juiz.classe, vezes_visto: vezes },
    adversario: { nome: pick(ADVOGADOS_ADV, rng), estilo },
    baralho, idx_ataque: 0,
    revelado: null,          // jogada atual revelada por Memória Eidética
    tracos,
    acordo: { proposto: false, oferta: null },
    log: [],
    final: null,
    expostas: 0,
    leitura: (j.skills || {}).pesquisa || 0,
    leitura_int: getAtributo(j, 'inteligencia'),
    skills_jur: {
      oral_advocacy: skJur.oral_advocacy || 0, argumentation: skJur.argumentation || 0,
      procedure: skJur.procedure || 0, discricao: skJur.discricao || 0,
    },
    estresse: j.estresse || 0,
    valor,
  };
  estado.log.push({ quem: 'juiz', texto: FALAS.abertura(juiz.nome, p) });
  _prepararFase(estado, rng);
  return estado;
}

function _jogadaAtual(estado) {
  return estado.fase === 'ataque' ? estado.baralho[estado.idx_ataque] : null;
}

function _prepararFase(estado, rng) {
  estado.revelado = null;
  if (estado.fase === 'ataque') {
    const jg = _jogadaAtual(estado);
    estado.log.push({ quem: 'adversario', texto: jg.fala });
    // Sem compostura: perde a mão — o golpe entra sem resposta.
    if (estado.compostura <= 0) {
      _aplicarGolpe(estado, jg, 1);
      estado.log.push({ quem: 'sistema', texto: 'Você perdeu a compostura e não consegue reagir a tempo.' });
      estado.compostura = 3;
      _avancar(estado, rng);
    }
  }
}

function _aplicarGolpe(estado, jg, fracao) {
  const dano = potencia(jg.forca) * fatorJuiz(jg.tipo, estado.juiz.classe) * K_DANO * fracao;
  estado.convencimento = clamp(estado.convencimento - dano, 0, 100);
  if (fracao >= 1 && jg.forca >= GOLPE_FORTE) estado.compostura = Math.max(0, estado.compostura - 1);
  return dano;
}

function _avancar(estado, rng) {
  if (estado.fase === 'ataque') estado.idx_ataque += 1;
  estado.rodada += 1;
  if (estado.rodada >= estado.plano.length) {
    estado.fase = 'fim';
    estado.final = { resultado: vereditoDe(estado.convencimento), convencimento: Math.round(estado.convencimento) };
    estado.log.push({ quem: 'juiz', texto: FALAS.sentenca(estado.final.resultado) });
    return;
  }
  estado.fase = estado.plano[estado.rodada];
  _prepararFase(estado, rng);
}

function vereditoDe(conv) {
  if (conv >= LIMIAR_PROCEDENTE) return 'procedente';
  if (conv >= LIMIAR_PARCIAL) return 'parcial';
  return 'improcedente';
}

function _paciencia(estado, delta) {
  estado.paciencia = clamp(estado.paciencia + delta, 0, 10);
  if (estado.paciencia <= 0 && !estado.irritado) {
    estado.irritado = true;
    estado.log.push({ quem: 'juiz', texto: FALAS.juizIrritado() });
  }
}

function _carta(estado, id) {
  const c = estado.mao.find((x) => x.id === id);
  if (!c || c.usada) throw new Error('Carta inválida ou já usada.');
  return c;
}

/** Ganho de convencimento de uma carta jogada como argumento. Pura (sem efeitos). */
function ganhoCarta(estado, c, mult = 1) {
  let g = potencia(c.forca) * fatorJuiz(c.tipo, estado.juiz.classe) * K_GANHO * mult;
  g *= 1 + sk.bonusOratoria(estado.skills_jur.oral_advocacy) / 100;
  g *= 1 + estado.bonus_proxima;
  g *= multiplicadorNota(estado.estresse);
  if (estado.irritado) g *= IRRITADO_MULT;
  if (estado.tracos.some((t) => t.id === 'memoria_eidetica') && (c.tipo === 'jurisprudencia' || c.tipo === 'precedente')) g *= 1.2;
  if (c.suja) g *= MULT_SUJA;
  return g;
}

/** Testa se uma carta suja é exposta; aplica a penalidade. Retorna true se expôs. */
function _riscoSuja(estado, c, rng) {
  if (!c.suja) return false;
  const risco = Math.max(5, 45 - sk.reducaoRiscoExposicao(estado.skills_jur.discricao));
  if (rng() * 100 >= risco) return false;
  estado.expostas += 1;
  estado.convencimento = clamp(estado.convencimento - PENALIDADE_EXPOSTA, 0, 100);
  estado.log.push({ quem: 'adversario', texto: FALAS.exposta(c.nome) });
  _paciencia(estado, -2);
  if (c.pilar) {
    estado.mao.forEach((x) => { if (!x.usada && x !== c) x.forca = Math.max(1, Math.round(x.forca * 0.5)); });
    estado.log.push({ quem: 'sistema', texto: 'Era uma prova-pilar: o resto da sua tese perdeu força.' });
  }
  return true;
}

// ─── Ações ──────────────────────────────────────────────────────────────────

/**
 * Aplica uma ação do jogador. Muta e devolve `estado`.
 * acao: { tipo, carta_id?, blefe?, favor? }
 *   tipo ∈ contestar | objecao | conceder | favor | argumentar |
 *          traco_memoria | propor_acordo | aceitar_acordo | recusar_acordo
 */
function aplicarAcao(estado, acao, rng) {
  if (estado.fase === 'fim') throw new Error('A audiência já terminou.');
  const t = acao?.tipo;
  const conv0 = estado.convencimento;

  // ── Acordo (a partir da 3ª rodada, uma proposta por audiência) ──
  if (t === 'propor_acordo') {
    if (estado.rodada < 2) throw new Error('Ainda é cedo para propor acordo.');
    if (estado.acordo.proposto) throw new Error('Você já propôs acordo nesta audiência.');
    estado.acordo = { proposto: true, oferta: ofertaAcordo(estado), pendente: true };
    estado.log.push({ quem: 'adversario', texto: FALAS.ofertaAcordo(estado.acordo.oferta) });
    return estado;
  }
  if (t === 'aceitar_acordo' || t === 'recusar_acordo') {
    if (!estado.acordo.pendente) throw new Error('Não há proposta de acordo em aberto.');
    estado.acordo.pendente = false;
    if (t === 'aceitar_acordo') {
      estado.fase = 'fim';
      estado.final = { resultado: 'acordo', convencimento: Math.round(estado.convencimento), honorario: estado.acordo.oferta };
      estado.log.push({ quem: 'juiz', texto: FALAS.homologaAcordo() });
    } else {
      estado.log.push({ quem: 'jogador', texto: 'Recusamos a proposta, Excelência. Seguimos com a instrução.' });
    }
    return estado;
  }
  if (estado.acordo.pendente) throw new Error('Responda primeiro à proposta de acordo.');

  // ── Traço: Memória Eidética (ação livre na rodada de ataque) ──
  if (t === 'traco_memoria') {
    const tr = estado.tracos.find((x) => x.id === 'memoria_eidetica');
    if (!tr || tr.usos <= 0) throw new Error('Traço indisponível.');
    if (estado.fase !== 'ataque') throw new Error('Use durante um ataque do adversário.');
    tr.usos -= 1;
    const jg = _jogadaAtual(estado);
    estado.revelado = {
      tipo: jg.tipo, forca: jg.forca, vicio: jg.vicio,
      cartas: estado.mao.filter((c) => !c.usada && FAMILIA[c.tipo] === FAMILIA[jg.tipo]).map((c) => c.id),
    };
    estado.log.push({ quem: 'sistema', texto: 'Memória Eidética: você lembra exatamente onde está a falha desse argumento.' });
    return estado;
  }

  if (estado.fase === 'ataque') {
    const jg = _jogadaAtual(estado);
    if (t === 'contestar') {
      const c = _carta(estado, acao.carta_id);
      c.usada = true;
      const mesmaFamilia = FAMILIA[c.tipo] === FAMILIA[jg.tipo];
      const bloqueio = mesmaFamilia ? 1 : 0.5 + 0.2 * Math.sqrt(clamp(estado.skills_jur.argumentation, 0, 50) / 50);
      const exposta = _riscoSuja(estado, c, rng);
      if (exposta) {
        _aplicarGolpe(estado, jg, 1);
      } else {
        _aplicarGolpe(estado, jg, 1 - bloqueio);
        if (mesmaFamilia) {
          const contra = potencia(jg.forca) * fatorJuiz(jg.tipo, estado.juiz.classe) * K_DANO * 0.3;
          estado.convencimento = clamp(estado.convencimento + contra, 0, 100);
        }
        estado.log.push({ quem: 'jogador', texto: FALAS.contestar(c, mesmaFamilia) });
      }
    } else if (t === 'objecao') {
      // Sem vício, ainda há uma chance pequena de o juiz acolher — maior com
      // juiz formalista e com Direito Processual alto.
      const chanceSemVicio = 0.05 + (estado.juiz.classe === 'formalista' ? 0.10 : 0)
        + 0.10 * Math.sqrt(clamp(estado.skills_jur.procedure, 0, 50) / 50);
      const acertou = jg.vicio || rng() < chanceSemVicio;
      if (acertou) {
        estado.log.push({ quem: 'jogador', texto: 'Objeção, Excelência!' }, { quem: 'juiz', texto: 'Deferida. Desconsidere-se a fala.' });
      } else {
        estado.compostura = Math.max(0, estado.compostura - 2);
        _paciencia(estado, -2);
        _aplicarGolpe(estado, jg, 1);
        estado.log.push({ quem: 'jogador', texto: 'Objeção!' }, { quem: 'juiz', texto: FALAS.objecaoIndeferida(estado.juiz.classe) });
      }
    } else if (t === 'conceder') {
      _aplicarGolpe(estado, jg, 1);
      estado.compostura = Math.min(estado.compostura_max, estado.compostura + 2);
      estado.bonus_proxima = 0.2;
      estado.log.push({ quem: 'jogador', texto: 'Sem objeções, Excelência. A defesa se manifestará em seguida.' });
    } else if (t === 'favor') {
      if (!acao.favor) throw new Error('Favor inválido.');
      estado.log.push({ quem: 'sistema', texto: 'Você aciona um contato: o argumento do adversário cai por terra.' });
    } else {
      throw new Error('Ação inválida durante o ataque.');
    }
  } else {
    // sua_vez | final
    if (t === 'argumentar') {
      const c = _carta(estado, acao.carta_id);
      c.usada = true;
      const ehFinal = estado.fase === 'final';
      const fechador = estado.tracos.find((x) => x.id === 'o_fechador');
      let mult = ehFinal ? (fechador ? MULT_FINAL_FECHADOR : MULT_FINAL) : 1;
      let blefeFalhou = false;
      if (acao.blefe) {
        if (!fechador || fechador.usos <= 0) throw new Error('Traço indisponível.');
        fechador.usos -= 1;
        const chanceContra = 0.35 - 0.05 * (fechador.nivel - 1);
        if (rng() < chanceContra) { blefeFalhou = true; } else { mult *= 2; }
      }
      const exposta = _riscoSuja(estado, c, rng);
      if (blefeFalhou) {
        estado.compostura = Math.max(0, estado.compostura - 4);
        estado.log.push({ quem: 'jogador', texto: FALAS.argumentar(c, estado, true) }, { quem: 'adversario', texto: 'Blefe, Excelência. Os autos não dizem isso.' });
      } else if (!exposta) {
        const g = ganhoCarta(estado, c, mult);
        estado.convencimento = clamp(estado.convencimento + g, 0, 100);
        estado.log.push({ quem: 'jogador', texto: FALAS.argumentar(c, estado, false) });
        const reacao = FALAS.reacaoJuiz(estado.juiz.classe, fatorJuiz(c.tipo, estado.juiz.classe), rng);
        if (reacao) estado.log.push({ quem: 'juiz', texto: reacao });
      }
      estado.bonus_proxima = 0;
    } else if (t === 'conceder') {
      estado.compostura = Math.min(estado.compostura_max, estado.compostura + 3);
      estado.log.push({ quem: 'jogador', texto: 'Nada a acrescentar neste momento, Excelência.' });
    } else {
      throw new Error('Ação inválida na sua vez.');
    }
  }

  const delta = Math.round(estado.convencimento - conv0);
  if (estado.log.length) estado.log[estado.log.length - 1].delta = delta;
  _avancar(estado, rng);
  return estado;
}

/** Honorário oferecido em acordo, conforme quem está ganhando agora. */
function ofertaAcordo(estado) {
  const base = estado.valor * 0.30;
  const c = estado.convencimento;
  const f = c >= 65 ? 0.85 : c >= 55 ? 0.65 : c >= 45 ? 0.45 : 0.25;
  return Math.round(base * f);
}

/** O que o jogador pode ver. Nunca expõe baralho, vícios nem classe do juiz não descoberta. */
function estadoPublico(estado) {
  const jg = _jogadaAtual(estado);
  const leitura = estado.leitura + (estado.leitura_int - ESCALA_BASE) * 2;
  let jogada = null;
  if (jg && estado.fase === 'ataque') {
    jogada = { fala: jg.fala };
    if (leitura >= 25) jogada.tipo = jg.tipo;
    if (leitura >= 45) { jogada.faixa = jg.forca >= GOLPE_FORTE ? 'forte' : jg.forca >= 10 ? 'média' : 'fraca'; jogada.vicio = jg.vicio; }
    if (estado.revelado) Object.assign(jogada, { tipo: jg.tipo, forca: jg.forca, vicio: jg.vicio, cartas_contra: estado.revelado.cartas });
  }
  const v = estado.juiz.vezes_visto;
  return {
    modo: 'duelo', versao: estado.versao,
    rodada: estado.rodada, total_rodadas: estado.plano.length, fase: estado.fase, plano: estado.plano,
    convencimento: Math.round(estado.convencimento),
    compostura: estado.compostura, compostura_max: estado.compostura_max,
    paciencia: estado.paciencia, irritado: estado.irritado,
    mao: estado.mao.map(({ id, tipo, nome, forca, suja, pilar, usada }) => ({ id, tipo, nome, forca, suja, pilar, usada })),
    juiz: {
      nome: estado.juiz.nome,
      fama: v >= 1 ? HINT_CLASSE_JULGADOR[estado.juiz.classe] : 'Você ainda não conhece este juiz.',
      classe: v >= 2 ? estado.juiz.classe : null,
    },
    adversario: estado.adversario,
    jogada,
    tracos: estado.tracos.map(({ id, nome, nivel, usos }) => ({ id, nome, nivel, usos })),
    acordo: { proposto: estado.acordo.proposto, pendente: !!estado.acordo.pendente, oferta: estado.acordo.pendente ? estado.acordo.oferta : null },
    pode_propor_acordo: estado.fase !== 'fim' && estado.rodada >= 2 && !estado.acordo.proposto,
    log: estado.log.slice(-14),
    final: estado.final,
    limiares: { procedente: LIMIAR_PROCEDENTE, parcial: LIMIAR_PARCIAL },
  };
}

module.exports = {
  criarDuelo, aplicarAcao, estadoPublico, vereditoDe, ofertaAcordo, fatorJuiz, ganhoCarta,
  TRACOS, JUIZES_1GRAU, ESTILOS, LIMIAR_PROCEDENTE, LIMIAR_PARCIAL,
};
