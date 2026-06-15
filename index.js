'use strict';

const { initializeApp } = require('firebase-admin/app');
initializeApp();

const { tickMensal }                        = require('./tick_mensal');
const { avancarMes }                        = require('./avancar_mes');
const { processarSentenca }                 = require('./processar_sentenca');
const { criarEscritorio, convidarSocio,
        responderConvite, calcularRanking } = require('./criar_escritorio');
const { adminAction }                       = require('./admin');

exports.tickMensal        = tickMensal;        // mantido para admin forçar tick global
exports.avancarMes        = avancarMes;        // NOVO — callable pelo botão do jogador
exports.processarSentenca = processarSentenca;
exports.criarEscritorio   = criarEscritorio;
exports.convidarSocio     = convidarSocio;
exports.responderConvite  = responderConvite;
exports.calcularRanking   = calcularRanking;
exports.adminAction       = adminAction;
