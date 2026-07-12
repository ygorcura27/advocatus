/**
 * PODCASTS / APARIÇÕES NA INTERNET — Advocatus Online (GDD v5.1)
 * Convites ao escritório (genéricos) + convites direcionados a um advogado
 * específico, estilo "TV Appearances" do Popmundo.
 */

import { collection, query, where, orderBy, getDocs, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { db, functions } from './firebase-init.js';

const AREA_LABELS_CURTO = {
  employment: 'Trabalhista', tax: 'Tributário', civil: 'Cível', criminal: 'Criminal',
  corporate: 'Empresarial', immigration: 'Imigração', bankruptcy: 'Recuperação Jud.',
};

window.renderConvitesMidia = async function(j, el) {
  const escId = j.escritorio_proprio_id || j.escritorio_empregado_id || null;

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🎙️ Aparições na Internet</div>
    </div>
    <div style="font-size:.78rem;color:var(--txt3);margin-bottom:1rem">
      Convites de podcasts e canais jurídicos — chegam ao escritório (o sócio/gestor escolhe quem vai)
      ou direto a um advogado, quando uma petição dele viraliza.
    </div>
    <div id="midia-convites-escritorio"></div>
    <div id="midia-convites-diretos" style="margin-top:1.2rem"></div>`;

  if (escId) await _carregarConvitesEscritorio(escId);
  await _carregarConvitesDiretos(j.uid);
};

async function _carregarConvitesEscritorio(escId) {
  const host = document.getElementById('midia-convites-escritorio');
  if (!host) return;

  try {
    const snap = await getDocs(query(
      collection(db, 'escritorios', escId, 'convites_midia'),
      where('status', '==', 'pendente'),
      orderBy('criado_em', 'desc')
    ));

    if (snap.empty) {
      host.innerHTML = `
        <div class="esc-card-bloco">
          <div class="secao-header"><div class="secao-titulo">Convites ao Escritório</div></div>
          <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Nenhum convite de mídia pendente para o escritório.</div>
        </div>`;
      return;
    }

    // Sócios (jogadores humanos) são os candidatos a representar o escritório —
    // funcionários NPC não participam de aparições na mídia.
    const escSnap = await getDoc(doc(db, 'escritorios', escId));
    const esc = escSnap.exists() ? escSnap.data() : {};
    const candidatos = [
      ...(esc.dono_uid ? [{ uid: esc.dono_uid, nome: esc.dono_nome || 'Dono do escritório' }] : []),
      ...(esc.socios || []),
    ];

    const opcoesAdvogados = candidatos.length
      ? candidatos.map(f => `<option value="${f.uid}">${f.nome}</option>`).join('')
      : `<option value="">Nenhum advogado disponível</option>`;

    host.innerHTML = `
      <div class="esc-card-bloco">
        <div class="secao-header"><div class="secao-titulo">Convites ao Escritório</div></div>
        ${snap.docs.map(d => {
          const c = d.data();
          return `
          <div style="display:flex;align-items:center;gap:.6rem;padding:.55rem 0;border-bottom:1px solid var(--borda-sub)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.8rem;color:var(--txt)">${c.podcast_nome}</div>
              <div style="font-size:.65rem;color:var(--txt3)">${AREA_LABELS_CURTO[c.area]||c.area} · Tier ${c.tier}</div>
            </div>
            <select id="midia-sel-${d.id}" style="font-size:.72rem;padding:.3rem .5rem;border-radius:var(--r);border:var(--borda);background:var(--surface);color:var(--txt)">
              ${opcoesAdvogados}
            </select>
            <button class="btn btn-sm btn-prim" onclick="window._responderConviteMidia('${escId}','${d.id}',true)">Aceitar</button>
            <button class="btn btn-sm btn-ghost" onclick="window._responderConviteMidia('${escId}','${d.id}',false)">Recusar</button>
          </div>`;
        }).join('')}
      </div>`;
  } catch (err) {
    host.innerHTML = `<div class="card" style="color:var(--verm3)">Erro ao carregar convites do escritório: ${err.message}</div>`;
    console.error('[MIDIA]', err);
  }
}

async function _carregarConvitesDiretos(uid) {
  const host = document.getElementById('midia-convites-diretos');
  if (!host || !uid) return;

  try {
    const snap = await getDocs(query(
      collection(db, 'jogadores', uid, 'convites_midia'),
      where('status', '==', 'pendente'),
      orderBy('criado_em', 'desc')
    ));

    if (snap.empty) {
      host.innerHTML = `
        <div class="esc-card-bloco">
          <div class="secao-header"><div class="secao-titulo">Convites Diretos</div></div>
          <div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0">Nenhum convite direcionado a você no momento.</div>
        </div>`;
      return;
    }

    host.innerHTML = `
      <div class="esc-card-bloco">
        <div class="secao-header"><div class="secao-titulo">Convites Diretos</div></div>
        ${snap.docs.map(d => {
          const c = d.data();
          return `
          <div style="display:flex;align-items:center;gap:.6rem;padding:.55rem 0;border-bottom:1px solid var(--borda-sub)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.8rem;color:var(--txt)">${c.podcast_nome}</div>
              <div style="font-size:.65rem;color:var(--txt3)">${AREA_LABELS_CURTO[c.area]||c.area} · Tier ${c.tier}${c.peticao_titulo?` · por "${c.peticao_titulo}"`:''}</div>
            </div>
            <button class="btn btn-sm btn-prim" onclick="window._responderConviteMidia(null,'${d.id}',true)">Aceitar</button>
            <button class="btn btn-sm btn-ghost" onclick="window._responderConviteMidia(null,'${d.id}',false)">Recusar</button>
          </div>`;
        }).join('')}
      </div>`;
  } catch (err) {
    host.innerHTML = `<div class="card" style="color:var(--verm3)">Erro ao carregar seus convites: ${err.message}</div>`;
    console.error('[MIDIA]', err);
  }
}

window._responderConviteMidia = async function(escId, conviteId, aceito) {
  try {
    const payload = { convite_id: conviteId, aceito };
    if (escId) {
      payload.escritorio_id = escId;
      const sel = document.getElementById(`midia-sel-${conviteId}`);
      if (aceito && sel) payload.advogado_uid = sel.value;
    }

    const res = await httpsCallable(functions, 'responderConviteMidia')(payload);
    if (aceito) {
      const d = res.data || {};
      window.toast(d.viral
        ? `🔥 Viralizou! ${d.podcast_nome} — ${(d.views||0).toLocaleString('pt-BR')} views. +${d.rep_ganho} Rep.`
        : `Participação registrada em ${d.podcast_nome} — ${(d.views||0).toLocaleString('pt-BR')} views.`,
        'ok');
    } else {
      window.toast('Convite recusado.', 'neutro');
    }

    window.renderConvitesMidia(window.JOGADOR, document.getElementById('main-content'));
  } catch (err) {
    window.toast(err.message || 'Erro ao responder convite.', 'ko');
    console.error('[MIDIA]', err);
  }
};
