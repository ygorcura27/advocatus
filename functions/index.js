'use strict';
const { initializeApp } = require('firebase-admin/app');
initializeApp();
// Apenas as functions essenciais para o jogo funcionar
const { avancarMes }                        = require('./avancar_mes');
const { tickMensal }                         = require('./tick_mensal');
const { processarSentenca, decidirRecursoSentenca } = require('./processar_sentenca');
const { processarAcordao, decidirProximaInstancia } = require('./processar_acordao');
const { criarEscritorio, convidarSocio,
        responderConvite, distribuirLucros,
        aportarCapital }                    = require('./criar_escritorio');
const { adminAction }                       = require('./admin');
// GDD v4.1 — novas callables
const { fazerBarExam, matricularBarPrep }   = require('./barexam');
const {
  componerPeticao, peticaoGenerica,
  variarPeticao,
  emprestarPeticao, liberarEmprestimo,
  venderPeticao, comprarPeticao,
  retirarPeticaoMercado,
  adicionarCoAutor,
  contratarParecerista,
  adicionarPeticaoRepertorio, removerPeticaoRepertorio,
} = require('./peticoes');
const { montarSetlist, resolverEventoJulgamento } = require('./setlist');
// GDD v5.1 — Petições Genéricas Globais
const { obterPeticaoGenerica } = require('./peticoes_genericas');
// GDD v5.1 — Identificação única de personagens (profile_id §39-40)
const { buscarPerfil }  = require('./perfis');
// GDD v5.1 — Charts do servidor (§14)
const { obterCharts }           = require('./charts');
// GDD v5.1 — Imprensa Jurídica (§15)
const { obterNoticiasImprensa } = require('./imprensa');
// GDD v5.1 — Tese Central (§16)
const { listarTeses }           = require('./teses');
// GDD v5.1 — Pós-Graduação §17-24
const {
  matricularPosGraduacao,
  compararecerAula,
  darAula,
  submeterDissertacao,
} = require('./posgraduacao');
// GDD v5.1 — Sistemas Sociais §25-30
const {
  participarMootCourt,
  iniciarIntercambio,
  gravarPodcast,
  contratarSeguroMalpractice,
  abrirCasoProBono,
  registrarAlumni,
} = require('./sistemas_sociais');
// GDD v5.1 — Artigos e Livros §31-34
const {
  confeccionarObra,
  publicarLivro,
  citarObra,
  obterObrasPublicas,
} = require('./artigos_livros');
const { anteciparHonorarios, contratarLinhaCredito, pagarLinhaCredito,
        contratarSocioInvestidor, aplicarInvestimento, resgatarInvestimento } = require('./financeiro');

exports.avancarMes              = avancarMes;
exports.processarSentenca       = processarSentenca;
exports.decidirRecursoSentenca  = decidirRecursoSentenca;
exports.processarAcordao        = processarAcordao;
exports.decidirProximaInstancia = decidirProximaInstancia;
exports.criarEscritorio         = criarEscritorio;
exports.convidarSocio           = convidarSocio;
exports.responderConvite        = responderConvite;
exports.distribuirLucros        = distribuirLucros;
exports.aportarCapital          = aportarCapital;
exports.adminAction             = adminAction;
// GDD v4.1
exports.fazerBarExam             = fazerBarExam;
exports.matricularBarPrep        = matricularBarPrep;
exports.componerPeticao          = componerPeticao;
exports.peticaoGenerica          = peticaoGenerica;
exports.variarPeticao            = variarPeticao;
exports.emprestarPeticao         = emprestarPeticao;
exports.liberarEmprestimo        = liberarEmprestimo;
exports.venderPeticao            = venderPeticao;
exports.comprarPeticao           = comprarPeticao;
exports.montarSetlist            = montarSetlist;
exports.resolverEventoJulgamento = resolverEventoJulgamento;
exports.retirarPeticaoMercado    = retirarPeticaoMercado;
exports.adicionarPeticaoRepertorio = adicionarPeticaoRepertorio;
exports.removerPeticaoRepertorio    = removerPeticaoRepertorio;
exports.adicionarCoAutor         = adicionarCoAutor;
exports.contratarParecerista     = contratarParecerista;
exports.obterPeticaoGenerica     = obterPeticaoGenerica;
exports.buscarPerfil             = buscarPerfil;
exports.obterCharts              = obterCharts;
exports.obterNoticiasImprensa    = obterNoticiasImprensa;
exports.listarTeses              = listarTeses;
exports.matricularPosGraduacao   = matricularPosGraduacao;
exports.compararecerAula         = compararecerAula;
exports.darAula                  = darAula;
exports.submeterDissertacao      = submeterDissertacao;
exports.participarMootCourt      = participarMootCourt;
exports.iniciarIntercambio       = iniciarIntercambio;
exports.gravarPodcast            = gravarPodcast;
exports.contratarSeguroMalpractice = contratarSeguroMalpractice;
exports.abrirCasoProBono         = abrirCasoProBono;
exports.registrarAlumni          = registrarAlumni;
exports.confeccionarObra         = confeccionarObra;
exports.publicarLivro            = publicarLivro;
exports.citarObra                = citarObra;
exports.obterObrasPublicas       = obterObrasPublicas;
exports.tickMensal               = tickMensal;
// GDD Seção 31-33 — Financeiro Avançado
exports.anteciparHonorarios      = anteciparHonorarios;
exports.contratarLinhaCredito    = contratarLinhaCredito;
exports.pagarLinhaCredito        = pagarLinhaCredito;
exports.contratarSocioInvestidor = contratarSocioInvestidor;
exports.aplicarInvestimento      = aplicarInvestimento;
exports.resgatarInvestimento     = resgatarInvestimento;
