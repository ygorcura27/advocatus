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
import { doc, getDoc, setDoc, updateDoc, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

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

  const idAtual = j.personagem_ativo_id || 'principal';
  if (targetId === idAtual) return;

  const jogadorRef  = doc(db, 'jogadores', uid);
  const outgoingRef = doc(db, 'jogadores', uid, 'personagens', idAtual);

  try {
    // Leitura fresca do doc ativo ANTES de escrever qualquer coisa — não
    // confia em window.JOGADOR (pode estar um passo atrás do que o
    // Firestore tem gravado). As Rules exigem notChanging('uid')/
    // notChanging('criado_em') batendo com o valor real armazenado.
    const jogadorAtualSnap = await getDoc(jogadorRef);
    const jd = jogadorAtualSnap.exists() ? jogadorAtualSnap.data() : j;

    // 1. Guarda o personagem que está saindo — cria jogadores/{uid}/
    // personagens/principal na primeira troca de saída dele, de forma
    // preguiçosa (nunca precisou existir antes disso). Sem bounds check
    // nas Rules pra essa subcoleção — sempre passa.
    try {
      await setDoc(outgoingRef, _somenteFichaPersonagem(jd));
    } catch (e) {
      console.error('[TROCAR PERSONAGEM] falhou salvando quem sai', e);
      throw e;
    }

    // 2. Busca a ficha de quem vai entrar.
    const targetRef  = doc(db, 'jogadores', uid, 'personagens', targetId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) { toast('Personagem não encontrado.', 'ko'); return; }
    const fichaAlvo = targetSnap.data();

    if ((fichaAlvo.idade || 0) >= 75) {
      toast(`${fichaAlvo.nome_personagem} já se aposentou — não dá mais pra jogar com ele, só usar pra passar herança.`, 'ko', 6000);
      return;
    }

    // 3. Sobrescreve o doc ativo com a ficha de quem entrou — setDoc SEM
    // merge de propósito: updateDoc deixaria campos que só existiam no
    // personagem que saiu (e não existem na ficha de quem entrou)
    // vazarem/sobrarem no personagem novo. Reconstrói a identidade da
    // CONTA (nunca troca) + a ficha inteira do alvo.
    const identidade = {};
    for (const k of _EXCLUIR_TROCA) {
      if (k === 'personagem_ativo_id') continue;
      if (jd[k] !== undefined) identidade[k] = jd[k];
    }
    // Clamp defensivo de reputacao: as Rules de jogadores/{uid} exigem
    // 0-100 no documento inteiro pós-escrita. Uma ficha arquivada pode ter
    // saído de faixa por algum caminho que grava via Admin SDK (Cloud
    // Functions não passam pelas Rules) — sem isso, a troca pra esse
    // personagem específico falhava com permission-denied pra sempre.
    const reputacaoClamped = Math.max(0, Math.min(100, fichaAlvo.reputacao ?? 30));
    try {
      await setDoc(jogadorRef, {
        ...identidade,
        ...fichaAlvo,
        reputacao: reputacaoClamped,
        personagem_ativo_id: targetId === 'principal' ? null : targetId,
      });
    } catch (e) {
      console.error('[TROCAR PERSONAGEM] falhou ativando quem entra', e, { fichaAlvo, identidade });
      throw e;
    }

    toast(`🔀 Trocou para ${fichaAlvo.nome_personagem}.`, 'ok', 4000);
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
