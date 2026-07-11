/**
 * SISTEMA DE ÍCONES — Advocatus Online (Art Direction v1.0, seção 4)
 * Line icons, grid 24×24, stroke 1.75px, round cap/join, fill:none,
 * cor herdada via currentColor (nunca hardcoded) — nunca preenchimento
 * sólido, exceto indicadores de status ≤8px (ver `dot`).
 *
 * Uso: `icon('escritorio')` retorna a string do <svg>; `icon('escritorio', {size:20})`
 * para outro tamanho. O `.ni-icon` (css/style.css) já cuida de cor/alinhamento
 * quando o SVG é injetado como innerHTML de um span com essa classe.
 */

const S = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  // Carreira
  perfil:       `<path ${S} d="M12 3l2.6 2.7 3.7.5.6 3.7 2.6 2.6-1.9 3.3.6 3.7-3.6 1.4-1.9 3.3-3.7-1-3.7 1-1.9-3.3-3.6-1.4.6-3.7L2 12.5l2.6-2.6.6-3.7 3.7-.5z"/><circle ${S} cx="12" cy="12" r="3.1"/>`,
  escritorio:   `<path ${S} d="M4 21V9l8-5 8 5v12"/><path ${S} d="M9 21v-6h6v6"/><path ${S} d="M9 12h.01M15 12h.01M9 8h.01M15 8h.01"/>`,
  investigacao: `<circle ${S} cx="10.5" cy="10.5" r="6.5"/><path ${S} d="M20 20l-4.6-4.6"/>`,
  progressao:   `<path ${S} d="M3 19h18"/><path ${S} d="M6 19V11M11 19V6M16 19v-9M21 19V4"/>`,

  // Desenvolvimento
  peticoes:     `<path ${S} d="M7 3h8l4 4v14H7z"/><path ${S} d="M15 3v4h4"/><path ${S} d="M9.5 12h5M9.5 15.5h5M9.5 8.5h2"/>`,
  habilidades:  `<path ${S} d="M13 2 4 14h6l-1 8 9-12h-6z"/>`,
  cursos:       `<path ${S} d="M2 9l10-4.5L22 9l-10 4.5z"/><path ${S} d="M6 11.2V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.8"/><path ${S} d="M22 9v6"/>`,
  concurso:     `<path ${S} d="M14.5 3.5l6 6-3 3-6-6z"/><path ${S} d="M12.5 5.5l-8 8v3h3l8-8"/><path ${S} d="M3 21h6"/>`,

  // Vida
  patrimonio:   `<path ${S} d="M4 11.5 12 4l8 7.5"/><path ${S} d="M6 10v10h12V10"/><path ${S} d="M10 20v-6h4v6"/>`,
  financeiro:   `<rect ${S} x="2.5" y="5.5" width="19" height="13" rx="2"/><path ${S} d="M2.5 10h19"/><path ${S} d="M6 15h4"/>`,
  loja:         `<path ${S} d="M4 8l1.2-4h13.6L20 8"/><path ${S} d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path ${S} d="M9 12a3 3 0 0 0 6 0"/>`,
  vida_pessoal: `<circle ${S} cx="12" cy="8" r="3.4"/><path ${S} d="M5 20c1-4 4-6 7-6s6 2 7 6"/>`,

  // Social
  vagas:        `<rect ${S} x="4" y="7" width="16" height="13" rx="2"/><path ${S} d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path ${S} d="M4 12h16"/>`,
  ranking:      `<path ${S} d="M8 4h8v5a4 4 0 0 1-8 0z"/><path ${S} d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4"/><path ${S} d="M12 13v3M9 20h6M10 20l-.5-4M14 20l.5-4"/>`,
  inbox:        `<path ${S} d="M3 6h18v13H3z"/><path ${S} d="M3 6l9 7 9-7"/>`,

  // Investigação — nós (seção 3, GDD addendum)
  consulta:     `<path ${S} d="M15.5 17.5 20 22M6.5 3.5a12 12 0 0 0 14 14l-3-4-4 1-4-4 1-4z"/>`,
  documento:    `<path ${S} d="M7 3h8l4 4v14H7z"/><path ${S} d="M15 3v4h4"/><path ${S} d="M9.5 12h5M9.5 15.5h5"/>`,
  entrevista:   `<path ${S} d="M4 5h13v9H9l-4 3v-3H4z"/><path ${S} d="M20 9v7l-3 2v-2h-4"/>`,
  pericia:      `<path ${S} d="M9 3h6M10 3v5l-5 8a2.5 2.5 0 0 0 2.2 3.7h9.6A2.5 2.5 0 0 0 19 16l-5-8V3"/><path ${S} d="M7.5 15h9"/>`,
  favor:        `<path ${S} d="M8 12a4 4 0 1 1 4 4"/><path ${S} d="M16 12a4 4 0 1 0-4-4"/>`,
  favores:      `<path ${S} d="M12 20s-7-4.4-7-9.5A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>`,
  vademecum:    `<path ${S} d="M4 5.5A2 2 0 0 1 6 4h12v16H6a2 2 0 0 1-2-2z"/><path ${S} d="M18 4v16"/><path ${S} d="M8 8h6M8 11h6"/>`,
  julgamento:   `<path ${S} d="M12 3v3M12 6l-5 3.5M12 6l5 3.5"/><path ${S} d="M4 9.5h6M14 9.5h6"/><path ${S} d="M4 9.5l-2 4.5a3 3 0 0 0 6 0zM18 9.5l-2 4.5a3 3 0 0 0 6 0z"/><path ${S} d="M8 21h8M12 15v6"/>`,

  // Menu contextual do Escritório (seção "Escritório/Equipe/Negócios/Mídia/Sócios")
  balancete:       `<path ${S} d="M4 20V11"/><path ${S} d="M10 20V6"/><path ${S} d="M16 20v-8"/><path ${S} d="M3 20h18"/>`,
  especializacoes: `<circle ${S} cx="12" cy="12" r="8"/><circle ${S} cx="12" cy="12" r="4.5"/><circle ${S} cx="12" cy="12" r="1.2"/>`,
  workspace:       `<rect ${S} x="3" y="8" width="18" height="12" rx="2"/><path ${S} d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path ${S} d="M3 13h18"/>`,
  equipe:          `<circle ${S} cx="9" cy="8" r="3"/><path ${S} d="M3.5 20c0-3.6 2.5-6.5 5.5-6.5s5.5 2.9 5.5 6.5"/><circle ${S} cx="17.5" cy="9" r="2.2"/><path ${S} d="M15.8 13.8c2.5.5 4.4 2.9 4.7 6.2"/>`,
  assistentes:     `<rect ${S} x="6" y="4" width="12" height="17" rx="2"/><rect ${S} x="9" y="2.3" width="6" height="3" rx="1"/><path ${S} d="M9 11.5h6M9 15h6"/>`,
  advogados:       `<path ${S} d="M12 3v16"/><path ${S} d="M6 6h12"/><path ${S} d="M3.5 6l2.5-1.8L8.5 6l-2.5 5z"/><path ${S} d="M15.5 6l2.5-1.8L20.5 6l-2.5 5z"/><path ${S} d="M9 21h6"/>`,
  diario:          `<rect ${S} x="5" y="3" width="14" height="18" rx="1.5"/><path ${S} d="M9 3v18"/><path ${S} d="M12.5 7.5h4M12.5 11h4M12.5 14.5h4"/>`,
  clientes:        `<path ${S} d="M2.5 13l4-4 3 3-4 4z"/><path ${S} d="M21.5 13l-4-4-3 3 4 4z"/><path ${S} d="M9.5 12l2 2 2-2"/>`,
  oportunidades:   `<path ${S} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>`,
  midia:           `<rect ${S} x="9" y="3" width="6" height="11" rx="3"/><path ${S} d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path ${S} d="M12 17.5V21"/><path ${S} d="M9 21h6"/>`,
  societario:      `<circle ${S} cx="12" cy="4.5" r="2"/><path ${S} d="M12 6.5v3.5"/><path ${S} d="M6 17v-3.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V17"/><circle ${S} cx="6" cy="19.3" r="2"/><circle ${S} cx="12" cy="19.3" r="2"/><circle ${S} cx="18" cy="19.3" r="2"/>`,

  // Chrome persistente (topbar/sidebars/bottom nav) — substituem emojis crus
  alerta:       `<path ${S} d="M12 3.5 21 19H3z"/><path ${S} d="M12 9.5v4.2M12 16.8h.01"/>`,
  menu:         `<path ${S} d="M4 6h16M4 12h16M4 18h16"/>`,
  cadeado:      `<rect ${S} x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path ${S} d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`,
};

/** Retorna o SVG (string) do ícone `nome`. `opts.size` default 20. */
export function icon(nome, opts = {}) {
  const size = opts.size || 20;
  const inner = PATHS[nome];
  if (!inner) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

/** Ponto de status preenchido (≤8px) — única exceção a fill:none. */
export function dot(cor, size = 8) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${cor}"/></svg>`;
}

if (typeof window !== 'undefined') {
  window.NIIcon = icon;
}
