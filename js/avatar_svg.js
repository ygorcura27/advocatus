/**
 * AVATAR EM CAMADAS — Advocatus Online (Art Direction v1.0, seção 5.1)
 * Ilustração vetorial flat, busto (ombros pra cima), sem textura de fio/
 * gradiente 3D. Camadas em grupos <g> nomeados (base/cabelo/roupa/acessorio)
 * para permitir troca individual futura sem regenerar o SVG inteiro.
 *
 * Sem campo de customização no banco ainda — as variações (tom de pele,
 * corte de cabelo, acessório) são derivadas de forma determinística do uid
 * do jogador, então o mesmo jogador sempre vê o mesmo avatar entre reloads,
 * sem precisar migrar o schema agora. `roupa` é a única camada não
 * determinística por hash — depende do cargo atual (progressão de carreira).
 */

const TONS_PELE = ['#F2D3B3', '#E8B98C', '#C98F5E', '#A66E42', '#7C4E2C', '#4E3220'];
const CORES_CABELO = ['#1B1611', '#3B2A1A', '#5C4530', '#8A6A3E', '#2A2A2E', '#6B4226'];

// Tier de carreira -> vestuário (seção 5.1: estagiário camisa simples;
// sócio terno + toga sobre o ombro). Espelha os cargo_id do resto do jogo.
const TIER_ROUPA = {
  est: 'camisa', ass: 'camisa',
  jnr: 'terno_simples', pln: 'terno_simples',
  snr: 'terno', asc: 'terno',
  soc: 'terno_toga', snm: 'terno_toga',
};

function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function _pick(arr, seed) { return arr[seed % arr.length]; }

/**
 * Retorna o SVG (string) do avatar do jogador `j`.
 * `opts.size` (px, default 96), `opts.acessorio` força óculos on/off.
 */
export function renderAvatarJogador(j, opts = {}) {
  const size = opts.size || 96;
  const seed = _hash(j.uid || j.nome_personagem || 'x');
  const pele = _pick(TONS_PELE, seed);
  const cabeloCor = _pick(CORES_CABELO, seed >> 3);
  const cabeloTipo = seed % 4; // 0-3 formas de cabelo
  const temOculos = opts.acessorio ?? (seed % 5 === 0);
  const roupa = TIER_ROUPA[j.cargo_id] || 'camisa';

  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" role="img" aria-label="Avatar de ${j.nome_personagem || 'jogador'}">
    <circle cx="48" cy="48" r="48" fill="var(--navy-light)"/>
    <g class="camada-roupa">${_roupaSvg(roupa)}</g>
    <g class="camada-base">
      <ellipse cx="48" cy="38" rx="17" ry="19" fill="${pele}" stroke="var(--navy)" stroke-width="2"/>
    </g>
    <g class="camada-cabelo">${_cabeloSvg(cabeloTipo, cabeloCor)}</g>
    ${temOculos ? `<g class="camada-acessorio">${_oculosSvg()}</g>` : ''}
  </svg>`;
}

function _roupaSvg(tipo) {
  switch (tipo) {
    case 'terno_toga':
      return `<path d="M20 96V78c0-10 12-16 28-16s28 6 28 16v18z" fill="var(--navy)"/>
              <path d="M48 62v34" stroke="#fff" stroke-width="2"/>
              <path d="M62 60c8 4 12 14 10 30" fill="none" stroke="var(--ouro2)" stroke-width="4" stroke-linecap="round"/>`;
    case 'terno':
      return `<path d="M20 96V80c0-10 12-16 28-16s28 6 28 16v16z" fill="var(--navy)"/>
              <path d="M42 66l6 8 6-8" fill="none" stroke="#fff" stroke-width="2"/>`;
    case 'terno_simples':
      return `<path d="M20 96V80c0-9 12-15 28-15s28 6 28 15v16z" fill="var(--navy3)"/>
              <path d="M44 67l4 6 4-6" fill="none" stroke="#fff" stroke-width="2"/>`;
    default: // camisa
      return `<path d="M20 96V82c0-8 12-13 28-13s28 5 28 13v14z" fill="#E7ECF5"/>
              <path d="M40 71l8 6 8-6" fill="none" stroke="var(--navy3)" stroke-width="2"/>`;
  }
}

function _cabeloSvg(tipo, cor) {
  switch (tipo) {
    case 0: return `<path d="M31 30c0-11 8-19 17-19s17 8 17 19c0-4-4-6-9-5-3-6-8-8-8-8s-5 2-8 8c-5-1-9 1-9 5z" fill="${cor}"/>`;
    case 1: return `<path d="M30 32c-1-13 8-22 18-22s19 9 18 22c-2-6-8-9-9-6-1-8-16-8-17 0-1-3-8 0-10 6z" fill="${cor}"/><path d="M30 32l2 8M64 32l-2 8" stroke="${cor}" stroke-width="3" stroke-linecap="round"/>`;
    case 2: return `<ellipse cx="48" cy="24" rx="18" ry="10" fill="${cor}"/>`;
    default: return `<path d="M31 26c3-9 10-15 17-15s14 6 17 15c-3-3-7-4-7-4l-3 5-7-4-7 4-3-5s-4 1-7 4z" fill="${cor}"/>`;
  }
}

function _oculosSvg() {
  return `<g stroke="var(--navy)" stroke-width="1.75" fill="none">
    <circle cx="40" cy="37" r="6"/><circle cx="56" cy="37" r="6"/><path d="M46 37h4"/>
  </g>`;
}
