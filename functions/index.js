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
} = require('./peticoes');
const { montarSetlist, resolverEventoJulgamento } = require('./setlist');
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
exports.tickMensal               = tickMensal;
// GDD Seção 31-33 — Financeiro Avançado
exports.anteciparHonorarios      = anteciparHonorarios;
exports.contratarLinhaCredito    = contratarLinhaCredito;
exports.pagarLinhaCredito        = pagarLinhaCredito;
exports.contratarSocioInvestidor = contratarSocioInvestidor;
exports.aplicarInvestimento      = aplicarInvestimento;
exports.resgatarInvestimento     = resgatarInvestimento;
