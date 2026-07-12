'use strict';

/**
 * SEED DE JULGADORES — Advocatus Online (§30, Alumni Network)
 * Persiste os mesmos 57 julgadores fictícios já usados no recursal
 * colegiado (nome+classe espelhados de js/processos.js:JULGADORES_TJ/
 * STJ/STF — nunca existiram como documento antes, só como array
 * client-side sorteado na hora do julgamento). Continuidade: é o MESMO
 * "Des. Roberto Salgueiro" que aparece no recurso, não um roster paralelo.
 * `faculdade` é campo novo, atribuído por ciclo fixo sobre FACULDADES_DIREITO
 * (determinístico, não muda a cada seed).
 */

const { logger } = require('firebase-functions');

const FACULDADES_DIREITO = [
  'USP', 'PUC-SP', 'Mackenzie', 'FGV Direito SP', 'UFRJ',
  'PUC-Rio', 'UERJ', 'UFMG', 'UnB', 'UFRGS',
];

const _TJ = [
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

const _STJ = [
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

const _STF = [
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

function _slug(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function seedJulgadores(db) {
  const todos = [
    ..._TJ.map(j => ({ ...j, instancia: 'TJ' })),
    ..._STJ.map(j => ({ ...j, instancia: 'STJ' })),
    ..._STF.map(j => ({ ...j, instancia: 'STF' })),
  ];

  let criados = 0, jaExistentes = 0;
  const batch = db.batch();
  for (let i = 0; i < todos.length; i++) {
    const j    = todos[i];
    const id   = _slug(j.nome);
    const ref  = db.collection('julgadores').doc(id);
    const snap = await ref.get();
    if (snap.exists) { jaExistentes++; continue; }
    batch.set(ref, {
      nome: j.nome,
      classe: j.classe,
      instancia: j.instancia,
      faculdade: FACULDADES_DIREITO[i % FACULDADES_DIREITO.length],
      colegas_curso: [],
    });
    criados++;
  }
  if (criados > 0) await batch.commit();

  logger.info(`[JULGADORES_SEED] ${criados} criado(s), ${jaExistentes} já existente(s).`);
  return { criados, jaExistentes, total: todos.length };
}

module.exports = { seedJulgadores, FACULDADES_DIREITO };
