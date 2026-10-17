'use strict';
/**
 * Simula milhares de audiências-duelo para calibrar dificuldade
 * (metas em docs/DUELO_AUDIENCIA.md §12). Rodar: node scripts/simular_duelo.js
 */
const m = require('../duelo_motor');

function rngSeed(seed) { let s = seed % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const FAM = { testemunho: 'fato', prova_documental: 'documento', prova_pericial: 'pericia', jurisprudencia: 'direito', precedente: 'direito' };
const TIPOS_NO = ['consulta', 'analise_documental', 'entrevista', 'pericia'];

function montarCaso(rng, { nCartas, faixa, valor }) {
  const nos = [], pecas = [];
  for (let i = 0; i < nCartas; i++) {
    const tipo = TIPOS_NO[Math.floor(rng() * TIPOS_NO.length)];
    nos.push({ id: `n${i}`, tipo });
    pecas.push({ no_id: `n${i}`, forca: faixa[0] + rng() * (faixa[1] - faixa[0]), suja: rng() < 0.18, pilar: tipo === 'pericia' });
  }
  return { valor, titulo: 'Caso', investigacao: { nos, investigacao_adversaria: 5, julgamento: { pecas_restantes: pecas } } };
}

function jogar(estado, estrategia, rng) {
  let guard = 0;
  while (estado.fase !== 'fim' && guard++ < 40) {
    const pub = m.estadoPublico(estado);
    const livres = estado.mao.filter((c) => !c.usada);
    const porForca = [...livres].sort((a, b) => b.forca - a.forca);
    if (pub.acordo.pendente) { m.aplicarAcao(estado, { tipo: estrategia === 'bom' && pub.convencimento < 50 ? 'aceitar_acordo' : 'recusar_acordo' }, rng); continue; }
    if (estrategia === 'bom' && process.env.ACORDO && pub.pode_propor_acordo && pub.convencimento < 46) { m.aplicarAcao(estado, { tipo: 'propor_acordo' }, rng); continue; }
    if (estado.fase === 'ataque') {
      const jg = pub.jogada;
      if (estrategia === 'ingenuo') {
        if (porForca[0]) m.aplicarAcao(estado, { tipo: 'contestar', carta_id: porForca[0].id }, rng);
        else m.aplicarAcao(estado, { tipo: 'conceder' }, rng);
        continue;
      }
      if (estado.tracos.some((t) => t.id === 'memoria_eidetica' && t.usos > 0) && !estado.revelado) { m.aplicarAcao(estado, { tipo: 'traco_memoria' }, rng); continue; }
      const info = m.estadoPublico(estado).jogada;
      if (info.vicio) { m.aplicarAcao(estado, { tipo: 'objecao' }, rng); continue; }
      const contra = info.tipo ? [...livres].filter((c) => FAM[c.tipo] === FAM[info.tipo] || (info.tipo === 'precedente' && c.tipo === 'jurisprudencia')).sort((a, b) => a.forca - b.forca)[0] : null;
      const ataquesRestantes = estado.plano.slice(estado.rodada).filter((f) => f === 'ataque').length;
      const vezesRestantes = estado.plano.slice(estado.rodada).filter((f) => f !== 'ataque').length;
      if (contra && livres.length > vezesRestantes) m.aplicarAcao(estado, { tipo: 'contestar', carta_id: contra.id }, rng);
      else if (!info.tipo && livres.length > vezesRestantes + 1 && ataquesRestantes > 0) m.aplicarAcao(estado, { tipo: 'contestar', carta_id: porForca[porForca.length - 1].id }, rng);
      else m.aplicarAcao(estado, { tipo: 'conceder' }, rng);
    } else {
      if (!livres.length) { m.aplicarAcao(estado, { tipo: 'conceder' }, rng); continue; }
      const carta = estado.fase === 'final' || estrategia === 'ingenuo' ? porForca[0] : porForca[Math.min(1, porForca.length - 1)];
      const blefe = estrategia === 'bom' && estado.fase === 'final' && estado.tracos.some((t) => t.id === 'o_fechador' && t.usos > 0);
      m.aplicarAcao(estado, { tipo: 'argumentar', carta_id: carta.id, blefe }, rng);
    }
  }
  return estado.final.resultado;
}

function cenario(nome, cfg, N = 4000) {
  const cont = { procedente: 0, parcial: 0, improcedente: 0, acordo: 0 };
  for (let i = 0; i < N; i++) {
    const rng = rngSeed(1000 + i * 7919);
    const p = montarCaso(rng, cfg);
    const j = { skills: { pesquisa: cfg.pesquisa, persuasao: cfg.persuasao || 15 }, skills_jur: { oral_advocacy: cfg.oral, argumentation: cfg.oral, procedure: cfg.oral, discricao: cfg.oral }, estresse: cfg.estresse || 15, tracos_assinatura: cfg.tracos || [] };
    const e = m.criarDuelo(p, j, rng, `p${i}`);
    cont[jogar(e, cfg.estrategia, rng)]++;
  }
  const pct = (k) => `${Math.round(cont[k] / N * 100)}%`;
  const vitoria = Math.round((cont.procedente + cont.parcial) / N * 100);
  console.log(`${nome.padEnd(52)} vitória(proc+parc) ${String(vitoria).padStart(3)}% | proc ${pct('procedente')} parc ${pct('parcial')} improc ${pct('improcedente')} acordo ${pct('acordo')}`);
}

cenario('Iniciante, caso do nível, investigação média, ingênuo', { estrategia: 'ingenuo', nCartas: 4, faixa: [10, 26], valor: 40000, pesquisa: 12, oral: 5 });
cenario('Iniciante, caso do nível, investigação média, razoável', { estrategia: 'bom', nCartas: 4, faixa: [10, 26], valor: 40000, pesquisa: 12, oral: 5 });
cenario('Jogador bom, investigação boa', { estrategia: 'bom', nCartas: 5, faixa: [16, 34], valor: 150000, pesquisa: 35, oral: 30 });
cenario('Jogador bom + Memória + Fechador, investigação boa', { estrategia: 'bom', nCartas: 5, faixa: [16, 34], valor: 150000, pesquisa: 40, persuasao: 40, oral: 30, tracos: [{ id: 'memoria_eidetica' }, { id: 'o_fechador' }] });
cenario('Jogador bom, caso grande (400k), investigação boa', { estrategia: 'bom', nCartas: 5, faixa: [16, 34], valor: 400000, pesquisa: 35, oral: 30 });
cenario('  + Memória Eidética + O Fechador', { estrategia: 'bom', nCartas: 5, faixa: [16, 34], valor: 400000, pesquisa: 40, persuasao: 40, oral: 30, tracos: [{ id: 'memoria_eidetica' }, { id: 'o_fechador' }] });
cenario('Pleno médio, caso do nível, sem traço', { estrategia: 'bom', nCartas: 4, faixa: [12, 28], valor: 120000, pesquisa: 22, oral: 15 });
cenario('  + Memória Eidética + O Fechador', { estrategia: 'bom', nCartas: 4, faixa: [12, 28], valor: 120000, pesquisa: 30, persuasao: 30, oral: 15, tracos: [{ id: 'memoria_eidetica' }, { id: 'o_fechador' }] });
cenario('Iniciante, caso muito acima do nível (800k)', { estrategia: 'bom', nCartas: 4, faixa: [10, 24], valor: 800000, pesquisa: 12, oral: 5 });
cenario('Investigação fraca (3 cartas fracas), razoável', { estrategia: 'bom', nCartas: 3, faixa: [6, 16], valor: 40000, pesquisa: 15, oral: 10 });
