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
// Defesa de TCC — banca em rodadas depois de frequência 12/12 (Mestrado/Doutorado)
const {
  iniciarDefesaTCC,
  responderBancaTCC,
  finalizarDefesaTCC,
} = require('./defesa_tcc');
// GDD v5.1 — Sistemas Sociais §25-30
const {
  participarMootCourt,
  iniciarIntercambio,
  gravarConteudoEducativo,
  contratarSeguroMalpractice,
  abrirCasoProBono,
  registrarAlumni,
  listarJulgadores,
} = require('./sistemas_sociais');
// GDD v5.1 — Artigos e Livros §31-34
const {
  confeccionarObra,
  publicarLivro,
  citarObra,
  obterObrasPublicas,
} = require('./artigos_livros');
const { anteciparHonorarios, contratarLinhaCredito, pagarLinhaCredito,
        contratarSocioInvestidor, aplicarInvestimento, resgatarInvestimento,
        lancarCampanha } = require('./financeiro');
const { comprarAtivo, venderAtivo } = require('./investimentos_mercado');
// GDD v5.1 — Podcasts / Aparições na Internet
const { responderConviteMidia } = require('./podcasts_social');
// GDD addendum v1.0 — Investigação, Favores e Julgamento
const {
  iniciarCasoInvestigativo, executarAcaoInvestigacao,
  pedirFavor, consumirFavorNode, confirmarMontagem,
  abrirVadeMecum, aplicarTeseVademecum,
  executarRodadaJulgamento, finalizarJulgamento,
} = require('./investigacao');
// Assembleia de Sócios — votação ponderada por participação
const { abrirVotacao, votar, encerrarVotacao } = require('./assembleia_socios');
// Posts (Redes Sociais) — feed real
const { publicarPost, curtirPost, deletarPost } = require('./posts_sociais');

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
exports.iniciarDefesaTCC         = iniciarDefesaTCC;
exports.responderBancaTCC        = responderBancaTCC;
exports.finalizarDefesaTCC       = finalizarDefesaTCC;
exports.participarMootCourt      = participarMootCourt;
exports.iniciarIntercambio       = iniciarIntercambio;
exports.gravarConteudoEducativo  = gravarConteudoEducativo;
exports.contratarSeguroMalpractice = contratarSeguroMalpractice;
exports.abrirCasoProBono         = abrirCasoProBono;
exports.registrarAlumni          = registrarAlumni;
exports.listarJulgadores         = listarJulgadores;
exports.confeccionarObra         = confeccionarObra;
exports.publicarLivro            = publicarLivro;
exports.citarObra                = citarObra;
exports.obterObrasPublicas       = obterObrasPublicas;
exports.tickMensal               = tickMensal;
exports.responderConviteMidia    = responderConviteMidia;
// GDD Seção 31-33 — Financeiro Avançado
exports.anteciparHonorarios      = anteciparHonorarios;
exports.contratarLinhaCredito    = contratarLinhaCredito;
exports.pagarLinhaCredito        = pagarLinhaCredito;
exports.contratarSocioInvestidor = contratarSocioInvestidor;
exports.lancarCampanha           = lancarCampanha;
exports.aplicarInvestimento      = aplicarInvestimento;
exports.resgatarInvestimento     = resgatarInvestimento;
exports.comprarAtivo             = comprarAtivo;
exports.venderAtivo              = venderAtivo;
// GDD addendum v1.0 — Investigação, Favores e Julgamento
exports.iniciarCasoInvestigativo = iniciarCasoInvestigativo;
exports.executarAcaoInvestigacao = executarAcaoInvestigacao;
exports.pedirFavor               = pedirFavor;
exports.consumirFavorNode        = consumirFavorNode;
exports.confirmarMontagem        = confirmarMontagem;
exports.abrirVadeMecum           = abrirVadeMecum;
exports.aplicarTeseVademecum     = aplicarTeseVademecum;
exports.executarRodadaJulgamento = executarRodadaJulgamento;
exports.finalizarJulgamento      = finalizarJulgamento;
// Assembleia de Sócios
exports.abrirVotacao             = abrirVotacao;
exports.votar                    = votar;
exports.encerrarVotacao          = encerrarVotacao;
// Posts (Redes Sociais)
exports.publicarPost             = publicarPost;
exports.curtirPost               = curtirPost;
exports.deletarPost              = deletarPost;
