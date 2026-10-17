/**
 * AUDIÊNCIA COMO DUELO — tela da cena (docs/DUELO_AUDIENCIA.md, fase 1).
 * Toda regra roda no servidor (functions/duelo.js + duelo_motor.js); aqui só
 * desenha o estado público e envia a ação escolhida.
 */
import { renderAvatarJogador } from './avatar_svg.js';

const TIPO_LABEL = {
  testemunho: 'Testemunho', prova_documental: 'Documento', prova_pericial: 'Perícia',
  jurisprudencia: 'Tese', precedente: 'Precedente', aspecto_processual: 'Processual',
  prazo: 'Prazo', agressivo: 'Ataque pessoal', materia_constitucional: 'Constitucional',
};
const CLASSE_LABEL = {
  tributarista: 'Tributarista', empresarialista: 'Empresarialista', consumerista: 'Consumerista',
  civilista: 'Civilista', penalista: 'Penalista', garantista: 'Garantista', formalista: 'Formalista',
  pragmatico: 'Pragmático', administrativista: 'Administrativista', constitucionalista: 'Constitucionalista',
  humanista: 'Humanista',
};
const RESULTADO_LABEL = {
  procedente: 'Procedente', parcial: 'Parcialmente procedente', improcedente: 'Improcedente', acordo: 'Acordo homologado',
};

let _ctx = null;          // { procId, j, main, onAtualizar }
let _blefe = false;
let _ocupado = false;

const _fmt = (v) => `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`;
const _esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _iniciais = (nome) => String(nome || '?').replace(/^(Dr|Dra|Des|Desa)\.\s*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('');

async function _call(nome, payload) {
  const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
  return (await httpsCallable(window.FB_FUNCTIONS, nome)(payload)).data;
}
const _erro = (e) => (e?.message || 'Erro').replace('Firebase: ', '').replace(/\s*\(.*\)\s*$/, '');

/**
 * Abre a audiência do processo. Se o duelo ainda não começou, inicia.
 * @param {object} p  processo (com investigacao.julgamento)
 * @param {function} onAtualizar  chamado quando a audiência termina (recarregar o caso)
 */
export async function renderDuelo(j, main, p, procId, onAtualizar) {
  _ctx = { procId, j, main, onAtualizar };
  let duelo = p.investigacao?.julgamento?.duelo;
  if (!duelo) {
    main.innerHTML = `<div class="duelo-carregando"><div class="spinner-ring"></div>Entrando na sala de audiências…</div>`;
    try {
      duelo = (await _call('iniciarDuelo', { processo_id: procId })).duelo;
    } catch (e) {
      main.innerHTML = `<div class="card" style="color:var(--verm2)">Não foi possível abrir a audiência: ${_esc(_erro(e))}</div>`;
      return;
    }
  }
  _desenhar(duelo, p);
}

function _pips(valor, max, classe) {
  return Array.from({ length: max }, (_, i) => `<span class="duelo-pip ${classe}${i < valor ? ' on' : ''}"></span>`).join('');
}

function _desenhar(d, p) {
  const { main, j } = _ctx;
  const fim = d.fase === 'fim';
  const ataque = d.fase === 'ataque';
  const pendenteAcordo = d.acordo?.pendente;
  const fase = { ataque: 'Ataque do adversário', sua_vez: 'Sua vez de argumentar', final: 'Alegações finais', fim: 'Sentença' }[d.fase];
  const conv = d.convencimento;
  const corConv = conv >= d.limiares.procedente ? 'var(--navy3)' : conv >= d.limiares.parcial ? 'var(--amber)' : 'var(--verm3)';
  const memoria = d.tracos.find((t) => t.id === 'memoria_eidetica');
  const fechador = d.tracos.find((t) => t.id === 'o_fechador');
  const contra = new Set(d.jogada?.cartas_contra || []);

  const jogadaInfo = ataque && d.jogada ? `
    <div class="duelo-leitura" aria-label="O que você percebe do ataque">
      ${d.jogada.tipo ? `<span class="duelo-chip tipo-${d.jogada.tipo}">${TIPO_LABEL[d.jogada.tipo] || d.jogada.tipo}</span>` : '<span class="duelo-chip neutro">Tipo de argumento: incerto</span>'}
      ${d.jogada.forca != null ? `<span class="duelo-chip">Força ${d.jogada.forca}</span>` : d.jogada.faixa ? `<span class="duelo-chip">Golpe ${d.jogada.faixa}</span>` : ''}
      ${d.jogada.vicio === true ? '<span class="duelo-chip alerta">Tem brecha — cabe objeção</span>' : d.jogada.vicio === false ? '<span class="duelo-chip neutro">Sem brecha aparente</span>' : ''}
    </div>` : '';

  const log = d.log.slice(-6).map((l, i, arr) => `
    <div class="duelo-fala quem-${l.quem}${i === arr.length - 1 ? ' nova' : ''}">
      <span class="duelo-fala-quem">${{ juiz: 'Juiz', adversario: d.adversario.nome, jogador: 'Você', sistema: '' }[l.quem] || ''}</span>
      <span class="duelo-fala-texto">${_esc(l.texto)}</span>
      ${typeof l.delta === 'number' && l.delta !== 0 ? `<span class="duelo-delta ${l.delta > 0 ? 'pos' : 'neg'}">${l.delta > 0 ? '+' : ''}${l.delta}</span>` : ''}
    </div>`).join('');

  const cartas = d.mao.map((c) => {
    const destaque = contra.has(c.id);
    const acao = fim || pendenteAcordo || c.usada ? '' : `onclick="window._dueloCarta('${c.id}')"`;
    return `
      <button class="duelo-carta tipo-${c.tipo}${c.usada ? ' usada' : ''}${destaque ? ' contra' : ''}" ${acao} ${c.usada || fim ? 'disabled' : ''}
        aria-label="${_esc(c.nome)}, ${TIPO_LABEL[c.tipo] || ''}, força ${c.forca}${c.suja ? ', obtida de forma duvidosa' : ''}${c.pilar ? ', prova-pilar' : ''}">
        <span class="duelo-carta-tipo">${TIPO_LABEL[c.tipo] || c.tipo}</span>
        <span class="duelo-carta-nome">${_esc(c.nome)}</span>
        <span class="duelo-carta-forca">${c.forca}</span>
        <span class="duelo-carta-tags">${c.suja ? '<i class="suja">suja</i>' : ''}${c.pilar ? '<i class="pilar">pilar</i>' : ''}${destaque ? '<i class="contra">contradiz</i>' : ''}</span>
      </button>`;
  }).join('');

  let acoes = '';
  if (fim) {
    acoes = `<button class="btn btn-prim duelo-concluir" onclick="window._dueloConcluir()">Ver desfecho do caso</button>`;
  } else if (pendenteAcordo) {
    acoes = `
      <div class="duelo-acordo">
        <div>Proposta da parte contrária: <strong>${_fmt(d.acordo.oferta)}</strong> de honorários, encerrando o caso agora.</div>
        <div class="duelo-acoes-linha">
          <button class="btn btn-prim" onclick="window._dueloAcao('aceitar_acordo')">Aceitar acordo</button>
          <button class="btn btn-ghost" onclick="window._dueloAcao('recusar_acordo')">Recusar e seguir</button>
        </div>
      </div>`;
  } else if (ataque) {
    acoes = `
      <div class="duelo-dica">Toque numa carta para <strong>contestar</strong> com ela — se for do mesmo tipo do ataque, derruba tudo.</div>
      <div class="duelo-acoes-linha">
        <button class="btn btn-sec" onclick="window._dueloAcao('objecao')">Objeção!</button>
        <button class="btn btn-ghost" onclick="window._dueloAcao('conceder')">Conceder <small>(+2 compostura)</small></button>
        ${memoria ? `<button class="btn btn-ghost duelo-traco" ${memoria.usos > 0 ? '' : 'disabled'} onclick="window._dueloAcao('traco_memoria')">Memória Eidética <small>${memoria.usos}×</small></button>` : ''}
        ${(p.investigacao?.favores_reservados || []).length ? `<button class="btn btn-ghost" onclick="window._dueloFavor()">Usar favor</button>` : ''}
        ${d.pode_propor_acordo ? `<button class="btn btn-ghost" onclick="window._dueloAcao('propor_acordo')">Propor acordo</button>` : ''}
      </div>`;
  } else {
    acoes = `
      <div class="duelo-dica">${d.fase === 'final' ? '<strong>Alegações finais</strong>: sua carta vale mais agora.' : 'Toque numa carta para <strong>argumentar</strong>. Guarde a melhor para o final.'}</div>
      <div class="duelo-acoes-linha">
        ${fechador ? `<label class="duelo-blefe${fechador.usos > 0 ? '' : ' off'}"><input type="checkbox" ${_blefe ? 'checked' : ''} ${fechador.usos > 0 ? '' : 'disabled'} onchange="window._dueloBlefe(this.checked)"> Blefar (O Fechador, ${fechador.usos}×): dobra o efeito, mas pode sair caro</label>` : ''}
        <button class="btn btn-ghost" onclick="window._dueloAcao('conceder')">Passar <small>(+3 compostura)</small></button>
        ${d.pode_propor_acordo ? `<button class="btn btn-ghost" onclick="window._dueloAcao('propor_acordo')">Propor acordo</button>` : ''}
      </div>`;
  }

  const avatarJog = j ? renderAvatarJogador(j, { size: 64 }) : '';

  main.innerHTML = `
    <section class="duelo" aria-live="polite">
      <header class="duelo-topo">
        <div>
          <div class="duelo-kicker">Audiência · ${_esc(p.titulo || p.tipo || 'Processo')}</div>
          <div class="duelo-fase">${fase}</div>
        </div>
        <div class="duelo-rodada">Rodada ${Math.min(d.rodada + 1, d.total_rodadas)}<span>/${d.total_rodadas}</span></div>
      </header>

      <div class="duelo-medidor" role="meter" aria-label="Convencimento do juiz" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${conv}">
        <div class="duelo-medidor-rotulo"><span>Convencimento do juiz</span><strong style="color:${corConv}">${conv}</strong></div>
        <div class="duelo-medidor-trilho">
          <div class="duelo-medidor-fill" style="width:${conv}%;background:${corConv}"></div>
          <span class="duelo-marca" style="left:${d.limiares.parcial}%" title="Parcial"></span>
          <span class="duelo-marca forte" style="left:${d.limiares.procedente}%" title="Procedente"></span>
        </div>
        <div class="duelo-medidor-legenda"><span>Improcedente</span><span style="left:${d.limiares.parcial}%">Parcial ${d.limiares.parcial}</span><span style="left:${d.limiares.procedente}%">Procedente ${d.limiares.procedente}</span></div>
      </div>

      <div class="duelo-palco">
        <figure class="duelo-ator voce">
          <div class="duelo-retrato">${avatarJog}</div>
          <figcaption>Você<small>Compostura</small><span class="duelo-pips">${_pips(d.compostura, d.compostura_max, 'comp')}</span></figcaption>
        </figure>
        <figure class="duelo-ator juiz${d.irritado ? ' irritado' : ''}">
          <div class="duelo-retrato mono">${_esc(_iniciais(d.juiz.nome))}</div>
          <figcaption>${_esc(d.juiz.nome)}<small>${d.juiz.classe ? CLASSE_LABEL[d.juiz.classe] : _esc(d.juiz.fama)}</small>
            <span class="duelo-pips" title="Paciência do juiz">${_pips(d.paciencia, 10, 'pac')}</span>${d.irritado ? '<em>Irritado</em>' : ''}</figcaption>
        </figure>
        <figure class="duelo-ator adv">
          <div class="duelo-retrato mono adv">${_esc(_iniciais(d.adversario.nome))}</div>
          <figcaption>${_esc(d.adversario.nome)}<small>Estilo ${_esc(d.adversario.estilo)}</small></figcaption>
        </figure>
      </div>

      <div class="duelo-dialogo">${log}</div>
      ${jogadaInfo}
      ${fim ? `<div class="duelo-sentenca res-${d.final.resultado}"><span>Sentença</span><strong>${RESULTADO_LABEL[d.final.resultado]}</strong>${d.final.honorario ? `<small>Honorários do acordo: ${_fmt(d.final.honorario)}</small>` : ''}</div>` : ''}
      <div class="duelo-acoes">${acoes}</div>
      ${fim ? '' : `<div class="duelo-mao" role="group" aria-label="Suas provas">${cartas}</div>`}
    </section>`;
}

async function _enviar(payload) {
  if (_ocupado || !_ctx) return;
  _ocupado = true;
  document.querySelector('.duelo')?.classList.add('ocupado');
  try {
    const r = await _call('jogarRodadaDuelo', { processo_id: _ctx.procId, ...payload });
    _blefe = false;
    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const { db } = await import('./firebase-init.js');
    const p = (await getDoc(doc(db, 'processos', _ctx.procId))).data();
    _desenhar(r.duelo, p);
  } catch (e) {
    window.toast && window.toast(_erro(e), 'ko');
    document.querySelector('.duelo')?.classList.remove('ocupado');
  } finally {
    _ocupado = false;
  }
}

window._dueloAcao = (acao) => _enviar({ acao });
window._dueloBlefe = (v) => { _blefe = !!v; };
window._dueloCarta = (cartaId) => {
  const faseAtaque = document.querySelector('.duelo-fase')?.textContent.startsWith('Ataque');
  _enviar(faseAtaque ? { acao: 'contestar', carta_id: cartaId } : { acao: 'argumentar', carta_id: cartaId, blefe: _blefe });
};
window._dueloFavor = async () => {
  const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const { db } = await import('./firebase-init.js');
  const p = (await getDoc(doc(db, 'processos', _ctx.procId))).data();
  const favores = p.investigacao?.favores_reservados || [];
  if (!favores.length) { window.toast && window.toast('Nenhum favor reservado para este caso.', 'ko'); return; }
  window.abrirModal('Usar favor', `
    <p style="font-size:.8rem;color:var(--txt3);margin-bottom:.6rem">Um contato derruba o argumento do adversário nesta rodada. A dívida com ele continua.</p>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${favores.map((fid, i) => `<button class="btn btn-sec" onclick="window.fecharModal();window._dueloUsarFavor('${fid}')">Favor ${i + 1}</button>`).join('')}
    </div>`);
};
window._dueloUsarFavor = (fid) => _enviar({ acao: 'favor', favor_id: fid });
window._dueloConcluir = () => { if (_ctx?.onAtualizar) _ctx.onAtualizar(); };

// ─── Traços de assinatura (tela de Progressão) ──────────────────────────────
const TRACOS_INFO = {
  memoria_eidetica: { nome: 'Memória Eidética', insp: 'Mike Ross', desc: 'Uma vez por audiência, revela o ataque exato do adversário e qual prova sua o derruba. Precedentes e teses rendem +20%.', skill: 'Pesquisa' },
  o_fechador: { nome: 'O Fechador', insp: 'Harvey Specter', desc: 'Blefe: uma vez por audiência, sua prova vale o dobro — se o adversário pagar pra ver, você perde compostura. Alegações finais mais fortes.', skill: 'Persuasão' },
};
const CARGO_IDX = { est: 0, ass: 1, jnr: 2, pln: 3, snr: 4, asc: 5, soc: 6, snm: 7 };

export function htmlTracosAssinatura(j) {
  const idx = CARGO_IDX[j.cargo_id] ?? 0;
  const permitidos = idx >= 7 ? 3 : idx >= 6 ? 2 : idx >= 3 ? 1 : 0;
  const meus = (j.tracos_assinatura || []).map((t) => t.id);
  const podeEscolher = meus.length < permitidos;
  return `
    <section class="card tracos-bloco">
      <div class="card-titulo">Traços de assinatura</div>
      <div class="card-sub" style="margin-bottom:.7rem">${permitidos === 0
        ? 'Destrava ao virar <strong>Advogado Pleno</strong> (o segundo, ao virar Sócio). Cada traço muda como você joga as audiências.'
        : podeEscolher ? `Você pode escolher ${permitidos - meus.length} traço(s) agora. A escolha é para a carreira inteira.` : 'Seus traços estão definidos.'}</div>
      <div class="tracos-grid">
        ${Object.entries(TRACOS_INFO).map(([id, t]) => {
          const tenho = meus.includes(id);
          return `
          <div class="traco-card${tenho ? ' ativo' : ''}">
            <div class="traco-nome">${t.nome}<small>inspirado em ${t.insp}</small></div>
            <p>${t.desc}</p>
            <div class="traco-rodape">Evolui com ${t.skill}
              ${tenho ? '<span class="traco-tag">Seu traço</span>' : podeEscolher ? `<button class="btn btn-sm btn-prim" onclick="window._escolherTraco('${id}')">Escolher</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

window._escolherTraco = async (id) => {
  if (!confirm(`Escolher "${TRACOS_INFO[id].nome}"? Não dá para trocar depois.`)) return;
  try {
    await _call('escolherTracoAssinatura', { traco_id: id });
    window.toast && window.toast(`Traço escolhido: ${TRACOS_INFO[id].nome}`, 'ok', 4000);
    setTimeout(() => window.navTo && window.navTo('progressao', null), 600);
  } catch (e) {
    window.toast && window.toast(_erro(e), 'ko');
  }
};
