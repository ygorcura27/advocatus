/**
 * ASSEMBLEIA DE SÓCIOS — Advocatus Online
 * Tela real: qualquer sócio abre uma votação, sócios votam sim/não,
 * apuração ponderada pelo participacao_pct de cada um (Cloud Functions
 * assembleia_socios.js). Sem execução automática de decisões — a
 * votação registra a decisão oficial do escritório, a ação real (aportar,
 * upgrade etc) continua sendo feita manualmente por quem for.
 */

import { collection, doc, getDoc, getDocs, orderBy, query }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db } from './firebase-init.js';

function _normalizarSociosLocal(esc) {
  const donoFallback = esc.dono_uid || esc.fundador_uid;
  if (Array.isArray(esc.socios) && esc.socios.length > 0) {
    const primeiroValido = esc.socios[0] && typeof esc.socios[0] === 'object' && esc.socios[0].uid;
    if (primeiroValido) {
      return esc.socios
        .filter(s => s && typeof s === 'object' && s.uid)
        .map(s => ({ uid: s.uid, participacao_pct: s.participacao_pct || 0 }));
    }
    return esc.socios.map((uidStr, i) => ({
      uid: typeof uidStr === 'string' ? uidStr : donoFallback,
      participacao_pct: i === 0 ? 100 : 0,
    }));
  }
  return [{ uid: donoFallback, participacao_pct: 100 }];
}

function _labelSocio(uid) {
  const meuUid = window.JOGADOR?.uid || window.JOGADOR_UID;
  return uid === meuUid ? 'Você' : (uid || '—').slice(0, 8);
}

function _statusBadge(status) {
  if (status === 'aprovada') return `<span class="badge" style="background:var(--verde-bg);color:var(--verde2)">✅ Aprovada</span>`;
  if (status === 'rejeitada') return `<span class="badge" style="background:var(--verm-bg);color:var(--verm3)">❌ Rejeitada</span>`;
  return `<span class="badge" style="background:var(--amber-bg);color:var(--amber)">🗳️ Em votação</span>`;
}

window.renderAssembleiaSocios = async function(j, el) {
  el.innerHTML = `<div class="secao-header"><div class="secao-titulo">🏛️ Assembleia de Sócios</div></div><div class="card">Carregando...</div>`;

  const escId = j.escritorio_id;
  if (!escId) {
    el.innerHTML = `<div class="secao-header"><div class="secao-titulo">🏛️ Assembleia de Sócios</div></div>
      <div class="card" style="color:var(--txt3)">Você precisa estar em um escritório para participar de uma assembleia.</div>`;
    return;
  }

  const escSnap = await getDoc(doc(db, 'escritorios', escId));
  if (!escSnap.exists()) { el.innerHTML = `<div class="card">Escritório não encontrado.</div>`; return; }
  const esc = escSnap.data();
  const socios = _normalizarSociosLocal(esc);
  const meuUid = window.JOGADOR?.uid || window.JOGADOR_UID;
  const souSocio = socios.some(s => s.uid === meuUid);

  const votSnap = await getDocs(query(collection(db, 'escritorios', escId, 'votacoes'), orderBy('criado_em', 'desc')));
  const votacoes = votSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (socios.length < 2) {
    el.innerHTML = `<div class="secao-header"><div class="secao-titulo">🏛️ Assembleia de Sócios</div></div>
      <div class="card" style="color:var(--txt3)">Assembleia exige pelo menos 2 sócios. Convide um sócio na tela Escritório pra habilitar votações.</div>`;
    return;
  }

  const listaHtml = votacoes.length ? votacoes.map(v => {
    const meuVoto = (v.votos || {})[meuUid];
    const aberta = v.status === 'aberta';
    const totalVotantes = Object.keys(v.votos || {}).length;
    return `
      <div class="card" style="margin-bottom:.7rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem">
          <div>
            <div style="font-weight:600;color:var(--txt);font-size:.85rem">${v.titulo}</div>
            <div style="font-size:.68rem;color:var(--txt4)">por ${v.criado_por_nome || _labelSocio(v.criado_por)} · mês ${v.criado_mes}</div>
          </div>
          ${_statusBadge(v.status)}
        </div>
        ${v.descricao ? `<div style="font-size:.75rem;color:var(--txt3);margin-top:.4rem">${v.descricao}</div>` : ''}
        <div style="font-size:.7rem;color:var(--txt3);margin-top:.5rem">
          ${aberta
            ? `${totalVotantes}/${socios.length} sócios votaram`
            : `Resultado: <b style="color:var(--verde2)">${v.resultado_pct_sim ?? 0}% sim</b> · <b style="color:var(--verm3)">${v.resultado_pct_nao ?? 0}% não</b> · ${v.resultado_pct_abstencao ?? 0}% absteve`}
        </div>
        ${aberta && souSocio ? `
          <div style="display:flex;gap:.5rem;margin-top:.6rem">
            <button class="btn ${meuVoto==='sim'?'btn-prim':'btn-ghost'}" style="flex:1" onclick="window._assVotar('${escId}','${v.id}','sim')">👍 Sim</button>
            <button class="btn ${meuVoto==='nao'?'btn-danger':'btn-ghost'}" style="flex:1" onclick="window._assVotar('${escId}','${v.id}','nao')">👎 Não</button>
          </div>
          <button class="btn btn-ghost btn-block" style="margin-top:.4rem;font-size:.7rem" onclick="window._assEncerrar('${escId}','${v.id}')">Encerrar e apurar</button>
        ` : ''}
      </div>`;
  }).join('') : `<div class="card" style="color:var(--txt4)">Nenhuma votação ainda.</div>`;

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">🏛️ Assembleia de Sócios</div></div>
    <div class="card" style="font-size:.74rem;color:var(--txt3);margin-bottom:1rem;line-height:1.6">
      Cada sócio vota conforme sua % de participação. Aprovada se % sim > % não entre quem votou.
      A votação só registra a decisão — executar (aportar, contratar, mudar de tier etc) continua sendo uma ação manual à parte.
    </div>
    <div class="card" style="margin-bottom:1rem">
      <div style="font-size:.78rem;font-weight:600;margin-bottom:.5rem;color:var(--txt)">Quadro Societário</div>
      ${socios.map(s => `<div style="display:flex;justify-content:space-between;font-size:.75rem;padding:.2rem 0;color:var(--txt3)">
        <span>${_labelSocio(s.uid)}</span><span style="color:var(--txt)">${s.participacao_pct}%</span>
      </div>`).join('')}
      ${souSocio ? `<button class="btn btn-prim btn-block" style="margin-top:.7rem" onclick="window._assAbrirNova('${escId}')">🗳️ Abrir Nova Votação</button>` : ''}
    </div>
    ${listaHtml}`;
};

window._assAbrirNova = function(escId) {
  window.abrirModal('🗳️ Abrir Votação',
    `<div class="campo"><label>Título</label><input type="text" id="ass-titulo" maxlength="120" placeholder="Ex: Aumentar caixa em R$ 20.000"></div>
     <div class="campo"><label>Descrição (opcional)</label><textarea id="ass-desc" maxlength="800" rows="4" placeholder="Contexto pros outros sócios decidirem"></textarea></div>
     <div style="display:flex;gap:.5rem;margin-top:.6rem">
       <button class="btn btn-ghost" style="flex:1" onclick="fecharModal()">Cancelar</button>
       <button class="btn btn-prim" style="flex:1" onclick="window._assConfirmarAbrir('${escId}')">Abrir →</button>
     </div>`);
};

window._assConfirmarAbrir = async function(escId) {
  const titulo = document.getElementById('ass-titulo')?.value || '';
  const descricao = document.getElementById('ass-desc')?.value || '';
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'abrirVotacao');
    const r = await fn({ escritorio_id: escId, titulo, descricao });
    window.toast(`✅ ${r.data.msg}`, 'ok', 2500);
    window.fecharModal();
    setTimeout(() => window.navTo?.('assembleia', null), 500);
  } catch (e) {
    window.toast(e.message || 'Erro ao abrir votação.', 'ko');
  }
};

window._assVotar = async function(escId, votacaoId, voto) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'votar');
    const r = await fn({ escritorio_id: escId, votacao_id: votacaoId, voto });
    window.toast(`✅ ${r.data.msg}`, 'ok', 2000);
    setTimeout(() => window.navTo?.('assembleia', null), 400);
  } catch (e) {
    window.toast(e.message || 'Erro ao votar.', 'ko');
  }
};

window._assEncerrar = async function(escId, votacaoId) {
  try {
    const fn = httpsCallable(window.FB_FUNCTIONS, 'encerrarVotacao');
    const r = await fn({ escritorio_id: escId, votacao_id: votacaoId });
    window.toast(`✅ ${r.data.msg}`, 'ok', 2500);
    setTimeout(() => window.navTo?.('assembleia', null), 500);
  } catch (e) {
    window.toast(e.message || 'Erro ao encerrar votação.', 'ko');
  }
};
