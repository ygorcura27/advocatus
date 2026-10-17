/**
 * PERSONAGENS — Advocatus Online
 * Multi-personagem por conta: 1 ativo por vez, espelhado direto nos campos
 * de jogadores/{uid} (é o que todo o resto do jogo já lê via window.JOGADOR
 * sem saber de onde veio o dado). Os demais personagens ficam arquivados em
 * jogadores/{uid}/personagens/{id} — id fixo 'principal' pro personagem
 * original (criado de forma preguiçosa, na primeira vez que o jogador troca
 * pra outro alguém — enquanto isso, personagem_ativo_id fica null/ausente e
 * os dados do principal continuam nos campos padrão do doc, path legado,
 * sem nenhuma migração necessária pros personagens criados antes desta
 * feature existir).
 */
import { doc, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, functions } from './firebase-init.js';

// Campos de identidade da CONTA — nunca trocam junto com o personagem.
const _EXCLUIR_TROCA = new Set([
  'uid', 'email', 'nome', 'criado_em', 'ultimo_login', 'personagem_ativo_id',
]);

function _somenteFichaPersonagem(jd) {
  const out = {};
  for (const [k, v] of Object.entries(jd || {})) {
    if (!_EXCLUIR_TROCA.has(k)) out[k] = v;
  }
  return out;
}

// ════════════════════════════════════════════════════════
// RESOLUÇÃO DE PATH — relacionamentos/filhos do personagem ATIVO
// Usado por js/relacionamento.js e js/carreira.js em vez de hardcodar
// jogadores/{uid}/relacionamentos|filhos diretamente, pra cada personagem
// ter sua própria vida pessoal isolada.
// ════════════════════════════════════════════════════════
export function relColecaoAtual(uid, j) {
  const ativoId = j?.personagem_ativo_id;
  return ativoId
    ? collection(db, 'jogadores', uid, 'personagens', ativoId, 'relacionamentos')
    : collection(db, 'jogadores', uid, 'relacionamentos');
}
export function filhosColecaoAtual(uid, j) {
  const ativoId = j?.personagem_ativo_id;
  return ativoId
    ? collection(db, 'jogadores', uid, 'personagens', ativoId, 'filhos')
    : collection(db, 'jogadores', uid, 'filhos');
}
export function relDocAtual(uid, j, relId) {
  const ativoId = j?.personagem_ativo_id;
  return ativoId
    ? doc(db, 'jogadores', uid, 'personagens', ativoId, 'relacionamentos', relId)
    : doc(db, 'jogadores', uid, 'relacionamentos', relId);
}
export function filhoDocAtual(uid, j, filhoId) {
  const ativoId = j?.personagem_ativo_id;
  return ativoId
    ? doc(db, 'jogadores', uid, 'personagens', ativoId, 'filhos', filhoId)
    : doc(db, 'jogadores', uid, 'filhos', filhoId);
}

/** Id do personagem ativo pra tag em processos/favores — null = principal. */
export function personagemIdAtual(j) {
  return j?.personagem_ativo_id || null;
}

/**
 * Doc certo pra ler/escrever um personagem específico (uid+id), mesmo que
 * NÃO seja o ativo agora — ativo vive em jogadores/{uid}, os outros em
 * jogadores/{uid}/personagens/{id}. Usado por convites de emprego, que
 * apontam pra um personagem específico e não podem assumir "quem estiver
 * ativo quando a pessoa clicar aceitar" (cada personagem tem seu próprio
 * ID de convite, uid+personagemId).
 */
export function personagemDocRef(uid, ativoId, personagemId) {
  const alvo = personagemId || 'principal';
  const ativo = ativoId || 'principal';
  return alvo === ativo
    ? doc(db, 'jogadores', uid)
    : doc(db, 'jogadores', uid, 'personagens', alvo);
}

/** Compara a tag salva num doc (processo/favor) com quem está jogando agora. */
export function ehDoPersonagemAtivo(doc, j) {
  return (doc?.personagem_id || null) === personagemIdAtual(j);
}

// ════════════════════════════════════════════════════════
// LISTAR PERSONAGENS DA CONTA (pro seletor do topbar)
// ════════════════════════════════════════════════════════
export async function listarPersonagens(uid, j) {
  const snap = await getDocs(collection(db, 'jogadores', uid, 'personagens'));
  const arquivados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ativoId = j.personagem_ativo_id || 'principal';
  // A entrada arquivada do personagem ATIVO está sempre desatualizada (o
  // dado de verdade é o que está em `j` agora) — troca pela versão viva.
  const outros = arquivados.filter(p => p.id !== ativoId);
  const ativo  = { id: ativoId, ..._somenteFichaPersonagem(j) };
  return [ativo, ...outros];
}

// ════════════════════════════════════════════════════════
// TROCAR DE PERSONAGEM
// ════════════════════════════════════════════════════════
window.trocarPersonagem = async function(targetId) {
  const j   = window.JOGADOR;
  const uid = j?.uid || window.JOGADOR_UID;
  if (!uid || !j || !targetId) return;
  if (targetId === (j.personagem_ativo_id || 'principal')) return;

  // A troca (arquivar quem sai + ativar quem entra) roda no servidor —
  // functions/personagens.js:trocarPersonagem. As regras não deixam mais o
  // navegador escrever fichas de personagem inteiras.
  try {
    const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
    const r = await httpsCallable(functions, 'trocarPersonagem')({ targetId });
    toast(`🔀 Trocou para ${r.data.nome}.`, 'ok', 4000);
  } catch (e) {
    console.error('[TROCAR PERSONAGEM]', e);
    toast('Erro ao trocar de personagem: ' + (e.message||''), 'ko');
  }
};

// ════════════════════════════════════════════════════════
// SELETOR NO TOPBAR
// ════════════════════════════════════════════════════════
async function _renderSeletorPersonagens(j) {
  const wrap = document.getElementById('tb-personagens-wrap');
  const select = document.getElementById('tb-personagem-select');
  if (!wrap || !select || !j) return;
  const uid = j.uid || window.JOGADOR_UID;
  if (!uid) return;

  try {
    const lista = await listarPersonagens(uid, j);
    if (lista.length <= 1) { wrap.style.display = 'none'; return; }

    const ativoId = j.personagem_ativo_id || 'principal';
    select.innerHTML = lista.map(p => {
      const aposentado = (p.idade || 0) >= 75;
      const label = `${p.nome_personagem || '—'} (${p.idade ?? '?'}a)${aposentado ? ' — aposentado' : ''}${p.id === 'principal' ? ' · principal' : ''}`;
      return `<option value="${p.id}" ${p.id === ativoId ? 'selected' : ''} ${aposentado && p.id !== ativoId ? 'disabled' : ''}>${label}</option>`;
    }).join('');
    wrap.style.display = '';
  } catch (e) {
    console.error('[SELETOR PERSONAGENS]', e);
  }
}

window.addEventListener('jogador:update', (e) => {
  const j = e.detail;
  if (j) _renderSeletorPersonagens(j);
});
