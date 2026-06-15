'use strict';

const { initializeApp } = require('firebase-admin/app');
initializeApp();

const { tickMensal }                               = require('./tick_mensal');
const { processarSentenca }                        = require('./processar_sentenca');
const { criarEscritorio, convidarSocio,
        responderConvite, calcularRanking }        = require('./criar_escritorio');
const { adminAction }                              = require('./admin');

exports.tickMensal        = tickMensal;
exports.processarSentenca = processarSentenca;
exports.criarEscritorio   = criarEscritorio;
exports.convidarSocio     = convidarSocio;
exports.responderConvite  = responderConvite;
exports.calcularRanking   = calcularRanking;
exports.adminAction       = adminAction;
