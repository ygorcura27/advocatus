'use strict';

const { initializeApp } = require('firebase-admin/app');
initializeApp();

// Apenas as functions essenciais para o jogo funcionar
const { avancarMes }                        = require('./avancar_mes');
const { processarSentenca }                 = require('./processar_sentenca');
const { criarEscritorio, convidarSocio,
        responderConvite, distribuirLucros,
        aportarCapital }                    = require('./criar_escritorio');
const { adminAction }                       = require('./admin');

exports.avancarMes        = avancarMes;
exports.processarSentenca = processarSentenca;
exports.criarEscritorio   = criarEscritorio;
exports.convidarSocio     = convidarSocio;
exports.responderConvite  = responderConvite;
exports.distribuirLucros  = distribuirLucros;
exports.aportarCapital    = aportarCapital;
exports.adminAction       = adminAction;
