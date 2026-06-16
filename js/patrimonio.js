/**
 * PATRIMÔNIO — Advocatus Online
 * Moradia, transporte, escritório e loja.
 */

import { doc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// DADOS DE IMÓVEIS
// ════════════════════════════════════════════════════════
const ZONAS = {
  sul:      {l:'Zona Sul',         adj:['centro','sudoeste']},
  centro:   {l:'Centro',           adj:['sul','norte','oeste']},
  norte:    {l:'Zona Norte',       adj:['centro','oeste']},
  oeste:    {l:'Zona Oeste',       adj:['norte','centro','baixada']},
  sudoeste: {l:'Zona Sudoeste',    adj:['sul','oeste']},
  niteroi:  {l:'Niterói',          adj:[]},
  baixada:  {l:'Baixada',          adj:['norte','oeste']},
};

const MORADIAS = [
  {id:'pais',         l:'Casa dos pais',            bairro:'—',                zona:'norte',    i:'👨‍👩‍👦', v:0,       rep_al:-3,  rep_cp:-3,  perigo:0, pais:true},
  // Zona Sul
  {id:'ipanema',      l:'Apto em Ipanema',           bairro:'Ipanema',          zona:'sul',      i:'🏖️', v:2500000, rep_al:14,  rep_cp:38,  perigo:0},
  {id:'leblon',       l:'Apto em Leblon',            bairro:'Leblon',           zona:'sul',      i:'🏖️', v:3000000, rep_al:15,  rep_cp:40,  perigo:0},
  {id:'lagoa',        l:'Apto na Lagoa',             bairro:'Lagoa',            zona:'sul',      i:'🏊', v:2200000, rep_al:13,  rep_cp:35,  perigo:0},
  {id:'copacabana',   l:'Apto em Copacabana',        bairro:'Copacabana',       zona:'sul',      i:'🏨', v:1500000, rep_al:11,  rep_cp:28,  perigo:0},
  {id:'botafogo',     l:'Apto em Botafogo',          bairro:'Botafogo',         zona:'sul',      i:'🏙️', v:1200000, rep_al:10,  rep_cp:26,  perigo:0},
  {id:'flamengo',     l:'Apto no Flamengo',          bairro:'Flamengo',         zona:'sul',      i:'🌳', v:1000000, rep_al:9,   rep_cp:23,  perigo:0},
  {id:'catete',       l:'Apto no Catete',            bairro:'Catete',           zona:'sul',      i:'🏠', v:700000,  rep_al:7,   rep_cp:18,  perigo:0},
  {id:'laranjeiras',  l:'Apto nas Laranjeiras',      bairro:'Laranjeiras',      zona:'sul',      i:'🌿', v:1100000, rep_al:9,   rep_cp:24,  perigo:0},
  {id:'santa_teresa', l:'Casa em Santa Teresa',      bairro:'Santa Teresa',     zona:'sul',      i:'🏡', v:900000,  rep_al:8,   rep_cp:20,  perigo:1},
  // Zona Sudoeste
  {id:'barra_lux',    l:'Apto de Luxo na Barra',     bairro:'Barra da Tijuca',  zona:'sudoeste', i:'🏖️', v:3500000, rep_al:15,  rep_cp:42,  perigo:0},
  {id:'barra_med',    l:'Apto Médio na Barra',       bairro:'Barra da Tijuca',  zona:'sudoeste', i:'🏢', v:1800000, rep_al:12,  rep_cp:30,  perigo:0},
  {id:'recreio',      l:'Apto no Recreio',           bairro:'Recreio',          zona:'sudoeste', i:'🌊', v:1000000, rep_al:8,   rep_cp:21,  perigo:0},
  {id:'jacarepagua',  l:'Casa em Jacarepaguá',       bairro:'Jacarepaguá',      zona:'sudoeste', i:'🏡', v:600000,  rep_al:5,   rep_cp:13,  perigo:0},
  {id:'pechincha',    l:'Apto em Pechincha',         bairro:'Pechincha',        zona:'sudoeste', i:'🏠', v:400000,  rep_al:3,   rep_cp:8,   perigo:0},
  // Centro
  {id:'centro_apto',  l:'Apto no Centro',            bairro:'Centro',           zona:'centro',   i:'🏙️', v:500000,  rep_al:4,   rep_cp:10,  perigo:1},
  {id:'lapa',         l:'Apto na Lapa',              bairro:'Lapa',             zona:'centro',   i:'🎭', v:400000,  rep_al:3,   rep_cp:8,   perigo:1},
  {id:'cinelandia',   l:'Apto na Cinelândia',        bairro:'Cinelândia',       zona:'centro',   i:'🎬', v:450000,  rep_al:4,   rep_cp:9,   perigo:1},
  {id:'tijuca',       l:'Apto na Tijuca',            bairro:'Tijuca',           zona:'centro',   i:'🏢', v:700000,  rep_al:6,   rep_cp:16,  perigo:0},
  // Zona Norte
  {id:'meier',        l:'Apto no Méier',             bairro:'Méier',            zona:'norte',    i:'🏠', v:450000,  rep_al:3,   rep_cp:9,   perigo:1},
  {id:'iraja',        l:'Casa em Irajá',             bairro:'Irajá',            zona:'norte',    i:'🏡', v:350000,  rep_al:2,   rep_cp:6,   perigo:1},
  {id:'madureira',    l:'Apto em Madureira',         bairro:'Madureira',        zona:'norte',    i:'🏠', v:300000,  rep_al:1,   rep_cp:4,   perigo:2},
  {id:'sao_cristov',  l:'Apto em São Cristóvão',     bairro:'São Cristóvão',    zona:'norte',    i:'🏠', v:380000,  rep_al:2,   rep_cp:7,   perigo:1},
  {id:'penha',        l:'Casa na Penha',             bairro:'Penha',            zona:'norte',    i:'🏡', v:250000,  rep_al:0,   rep_cp:3,   perigo:2},
  // Zona Oeste
  {id:'campo_grande', l:'Casa em Campo Grande',      bairro:'Campo Grande',     zona:'oeste',    i:'🏡', v:280000,  rep_al:1,   rep_cp:4,   perigo:1},
  {id:'santa_cruz',   l:'Casa em Santa Cruz',        bairro:'Santa Cruz',       zona:'oeste',    i:'🏠', v:200000,  rep_al:0,   rep_cp:2,   perigo:1},
  {id:'bangu',        l:'Apto em Bangu',             bairro:'Bangu',            zona:'oeste',    i:'🏠', v:220000,  rep_al:0,   rep_cp:2,   perigo:2},
  {id:'realengo',     l:'Casa em Realengo',          bairro:'Realengo',         zona:'oeste',    i:'🏡', v:180000,  rep_al:-1,  rep_cp:1,   perigo:2},
  // Niterói
  {id:'icarai',       l:'Apto em Icaraí',            bairro:'Icaraí (Niterói)', zona:'niteroi',  i:'🌅', v:1400000, rep_al:11,  rep_cp:29,  perigo:0},
  {id:'sao_fco_nit',  l:'Apto em São Francisco',     bairro:'S. Francisco/NIT', zona:'niteroi',  i:'🏢', v:1000000, rep_al:8,   rep_cp:22,  perigo:0},
  {id:'centro_nit',   l:'Apto Centro de Niterói',    bairro:'Centro (Niterói)', zona:'niteroi',  i:'🏙️', v:600000,  rep_al:5,   rep_cp:13,  perigo:1},
  // Baixada
  {id:'caxias_apto',  l:'Apto em Duque de Caxias',   bairro:'D. de Caxias',     zona:'baixada',  i:'🏠', v:200000,  rep_al:-1,  rep_cp:1,   perigo:2},
  {id:'nova_iguacu',  l:'Casa em Nova Iguaçu',       bairro:'Nova Iguaçu',      zona:'baixada',  i:'🏡', v:220000,  rep_al:-1,  rep_cp:2,   perigo:2},
  {id:'belford',      l:'Casa em Belford Roxo',      bairro:'Belford Roxo',     zona:'baixada',  i:'🏠', v:150000,  rep_al:-2,  rep_cp:0,   perigo:2},
  {id:'sao_joao',     l:'Apto em S.J. de Meriti',    bairro:'S.J. de Meriti',   zona:'baixada',  i:'🏠', v:160000,  rep_al:-2,  rep_cp:0,   perigo:2},
  {id:'nilop',        l:'Casa em Nilópolis',         bairro:'Nilópolis',        zona:'baixada',  i:'🏡', v:170000,  rep_al:-1,  rep_cp:1,   perigo:2},
];

const CARROS = [
  {id:'onibus',   l:'Ônibus / Metrô',        i:'🚌', v:0,       cm:176,  rep:-1, desc:'R$8/dia × 22 dias'},
  {id:'kwid',     l:'Renault Kwid',          i:'🚗', v:65000,   cm:900,  rep:1,  desc:'Econômico urbano'},
  {id:'mobi',     l:'Fiat Mobi',             i:'🚗', v:60000,   cm:850,  rep:1,  desc:'Compacto popular'},
  {id:'hb20',     l:'Hyundai HB20',          i:'🚗', v:78000,   cm:1000, rep:2,  desc:'Popular e confiável'},
  {id:'gol',      l:'VW Gol',               i:'🚗', v:68000,   cm:950,  rep:2,  desc:'Clássico brasileiro'},
  {id:'onix',     l:'Chevrolet Onix',        i:'🚗', v:82000,   cm:1050, rep:2,  desc:'Mais vendido do Brasil'},
  {id:'polo',     l:'VW Polo',              i:'🚙', v:95000,   cm:1200, rep:3,  desc:'Compacto premium'},
  {id:'cronos',   l:'Fiat Cronos',          i:'🚙', v:88000,   cm:1100, rep:3,  desc:'Sedã espaçoso'},
  {id:'tracker',  l:'Chevrolet Tracker',    i:'🚙', v:130000,  cm:1700, rep:5,  desc:'SUV compacto popular'},
  {id:'t_cross',  l:'VW T-Cross',           i:'🚙', v:145000,  cm:1800, rep:5,  desc:'SUV compacto premium'},
  {id:'compass',  l:'Jeep Compass',         i:'🚙', v:195000,  cm:2500, rep:8,  desc:'SUV médio de status'},
  {id:'corolla',  l:'Toyota Corolla',       i:'🚙', v:165000,  cm:2200, rep:7,  desc:'Sedã executivo clássico'},
  {id:'civic',    l:'Honda Civic',          i:'🚙', v:155000,  cm:2100, rep:7,  desc:'Esportivo e confiável'},
  {id:'tiguan',   l:'VW Tiguan',            i:'🛻', v:250000,  cm:3200, rep:10, desc:'SUV executivo europeu'},
  {id:'hr_v',     l:'Honda HR-V',           i:'🛻', v:175000,  cm:2300, rep:7,  desc:'SUV urbano equipado'},
  {id:'hilux',    l:'Toyota Hilux',         i:'🛻', v:280000,  cm:3500, rep:9,  desc:'Robustez e status'},
  {id:'bmw3',     l:'BMW Série 3',          i:'🚖', v:350000,  cm:4500, rep:13, desc:'Luxo alemão premium'},
  {id:'class_c',  l:'Mercedes-Benz C 200',  i:'🚖', v:390000,  cm:5000, rep:15, desc:'Status executivo máximo'},
  {id:'audi_a4',  l:'Audi A4',              i:'🚖', v:340000,  cm:4400, rep:13, desc:'Luxo e tecnologia alemã'},
  {id:'range_v',  l:'Range Rover Velar',    i:'🏎️', v:490000,  cm:7000, rep:18, desc:'SUV de ultraprestígio'},
];

const ESC_PAT = [
  {id:'home', l:'Home Office',         i:'🏠', cm:0,     rep:-2, desc:'Gratuito. -2 rep/mês (imagem menos profissional).'},
  {id:'cw',   l:'Coworking jurídico',  i:'💼', cm:600,   rep:0,  desc:'Para advogados solo. Endereço profissional.'},
  {id:'sal',  l:'Sala própria',        i:'🏛️', cm:3000,  rep:3,  desc:'Escritório individual. +3 rep/mês.'},
  {id:'esm',  l:'Escritório médio',    i:'🏢', cm:7500,  rep:6,  desc:'Espaço para equipe. +6 rep/mês.'},
  {id:'esp',  l:'Escritório premium',  i:'⚖️', cm:18000, rep:12, desc:'Big Law. +12 rep/mês.'},
];

const SHOP = [
  {id:'terno_basic', i:'👔', n:'Terno de Alfaiataria',      p:4500,  cat:'status', rep:2,  d:'+2 rep permanente'},
  {id:'terno_ital',  i:'🧥', n:'Terno Italiano (Brioni)',    p:18000, cat:'status', rep:4,  d:'+4 rep permanente'},
  {id:'sapato',      i:'👞', n:'Sapatos de Couro Premium',   p:3200,  cat:'status', rep:1,  d:'+1 rep permanente'},
  {id:'relogio_med', i:'⌚', n:'Relógio Suíço (Médio)',      p:22000, cat:'status', rep:3,  d:'+3 rep permanente'},
  {id:'relogio_lux', i:'🕰️', n:'Relógio de Luxo (Rolex)',   p:85000, cat:'status', rep:6,  d:'+6 rep permanente'},
  {id:'bolsa',       i:'👜', n:'Pasta Executiva Hermès',     p:12000, cat:'status', rep:2,  d:'+2 rep permanente'},
  {id:'bj',          i:'📚', n:'Biblioteca Jurídica',        p:12000, cat:'prof',   rep:0,  d:'+8 Pesquisa'},
  {id:'nb',          i:'💻', n:'Notebook Pro',               p:8500,  cat:'prof',   rep:0,  d:'+6 Escrita · +6 Pesquisa'},
  {id:'ai',          i:'🤖', n:'Assistente IA Jurídico',     p:35000, cat:'prof',   rep:1,  d:'+8 em todas as skills'},
  {id:'cg',          i:'✈️', n:'Congresso em Lisboa',        p:15000, cat:'exp',    rep:3,  d:'+3 rep · +6 Networking'},
  {id:'ac',          i:'🏋️', n:'Academia Premium (1 ano)',   p:3600,  cat:'exp',    rep:0,  d:'+6 Persuasão · +4 Oratória'},
];

// ════════════════════════════════════════════════════════
// CÁLCULOS
// ════════════════════════════════════════════════════════
function calcAluguel(v) {
  if (!v || v <= 0) return 0;
  if (v < 500000)  return Math.floor(v * 0.0055);
  if (v < 1000000) return Math.floor(v * 0.0040);
  return Math.floor(v * 0.0030);
}

function calcDeslocamento(morId, escZona) {
  const mor = MORADIAS.find(m=>m.id===morId);
  if (!mor || !escZona || mor.id === 'pais') return 0;
  const zonaM = mor.zona;
  if (zonaM === escZona) return 0;
  const z = ZONAS[escZona];
  if (z?.adj?.includes(zonaM)) return 4 * 22; // adjacente
  return 8 * 22; // distante
}

// ════════════════════════════════════════════════════════
// RENDERIZAÇÃO — PATRIMÔNIO
// ════════════════════════════════════════════════════════
window.renderPatrimonio = function(j, el) {
  const morId   = j.pat?.moradia   || 'pais';
  const carId   = j.pat?.transporte|| 'onibus';
  const escId   = j.pat?.escritorio|| 'home';
  const mor     = MORADIAS.find(m=>m.id===morId) || MORADIAS[0];
  const car     = CARROS.find(c=>c.id===carId);
  const esc     = ESC_PAT.find(e=>e.id===escId);
  const comprada = j.moradias_compradas?.[morId];
  const fins    = j.financiamentos || {};
  const deslocamento = calcDeslocamento(morId, 'centro'); // usa centro como referência
  const CUSTO_BASE_PAT = {
    est:600, ass:700, jnr:900, pln:1400, snr:2200,
    asc:3000, soc:4500, snm:6000,
    jsub:2200, jtit:3000, dsb:4000, mstj:5500,
    padj:2000, prom:2800, pjus:3800, pgj:5000,
    dadj:1800, def:2400, dch:3200, dge:4500,
  };
  const custoVida = CUSTO_BASE_PAT[j.cargo_id] || 700;
  // Coworking só cobra se for solo
  const despEsc  = (!j.escritorio_empregado_id || j.escritorio_id === 'solo') ? (esc?.cm || 0) : 0;
  const despCar  = car?.cm || 0;
  const despAlug = comprada ? 0 : calcAluguel(mor.v||0);
  const despFin  = Object.values(fins).reduce((s,f)=>s+(f.parcelas_restantes>0?f.parcela_mensal:0),0);
  const despEst  = (j.estagiarios||[]).length * 1700;
  const despTotal = despEsc+despCar+despAlug+despFin+despEst+deslocamento;
  const saldoLiq = (j.renda_calculada||0) - despTotal - custoVida;

  el.innerHTML = `
    <div class="secao-header"><div class="secao-titulo">🏠 Patrimônio</div>
      <span class="secao-badge">Rep de patrimônio: +${_calcRepPat(j)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:1.2rem">
      ${_card4('💰','Saldo',fmt(j.dinheiro||0),'money')}
      ${_card4('📈','Renda',fmt(j.renda_calculada||0),'money')}
      ${_card4('💸','Despesas',fmt(despTotal),'danger')}
      ${_card4('🍽️','Custo vida',fmt(custoVida),'danger')}
      ${_card4('🚇','Deslocamento',fmt(deslocamento),deslocamento>0?'danger':'')}
      ${_card4('📊','Saldo líq.',fmt(saldoLiq),saldoLiq>=0?'money':'danger')}
    </div>

    <!-- MORADIA -->
    <div class="secao-header" style="margin-top:.5rem">
      <div class="secao-titulo">🏠 Moradia</div>
      <span class="secao-badge">${comprada?'Casa própria':morId==='pais'?'Com os pais':'Aluguel'}</span>
    </div>
    ${j.prazo_sair_pais > 0 ? `<div style="background:rgba(139,38,53,.12);border:1px solid rgba(200,80,80,.35);border-radius:2px;padding:.6rem;margin-bottom:.6rem;font-size:.75rem;color:var(--verm3)">⚠️ Advogado(a) precisa de moradia própria! Prazo: ${Math.max(0,3-j.prazo_sair_pais)} mês(es) restante(s).</div>`:''}
    <div class="grid-cards" style="margin-bottom:1.2rem">
      ${MORADIAS.filter(m=> m.pais ? (j.ci<=2||!j.oab) : true).map(m => {
        const isAt = m.id === morId;
        const alug = m.pais ? 0 : calcAluguel(m.v);
        const propria = j.moradias_compradas?.[m.id];
        return `<div class="pat-card ${isAt?'ativo':''}">
          <div class="pc-icon">${m.i}</div>
          <div class="pc-nome">${m.l}</div>
          <div class="pc-det">${m.bairro}<br>${ZONAS[m.zona]?.l||m.zona}</div>
          ${m.v>0?`<div class="pc-det">${fmt(m.v)}</div>`:''}
          ${!m.pais?`<div class="pc-det" style="color:#ffa726">Aluguel: ${fmt(alug)}/mês</div>`:''}
          <div class="pc-rep" style="color:${m.rep_al<0?'var(--verm3)':'var(--ouro2)'}">
            Rep: ${m.rep_al>=0?'+':''}${m.rep_al} alug · +${m.rep_cp} próprio
          </div>
          ${m.perigo===2?`<div style="font-size:.6rem;color:var(--verm3)">⚠️ Bairro perigoso</div>`:
            m.perigo===1?`<div style="font-size:.6rem;color:#ffa726">⚡ Risco médio</div>`:''}
          ${isAt ? `<div class="pc-ativo">✓ ${propria?'Sua casa':'Alugando'}</div>` :
            m.pais ? `<button class="btn btn-sm btn-ghost" style="width:100%;margin-top:.3rem" onclick="window.escolherMoradia('${m.id}','aluguel')">Morar aqui</button>` :
            `<div style="display:flex;flex-direction:column;gap:.2rem;margin-top:.3rem">
              <button class="btn btn-sm btn-ghost" style="width:100%;font-size:.6rem" onclick="window.escolherMoradia('${m.id}','aluguel')">Alugar ${fmt(alug)}/mês</button>
              ${(j.dinheiro||0)>=m.v?`<button class="btn btn-sm btn-sec" style="width:100%;font-size:.6rem" onclick="window.escolherMoradia('${m.id}','compra')">Comprar ${fmt(m.v)}</button>`:''}
            </div>`}
        </div>`;
      }).join('')}
    </div>

    <!-- TRANSPORTE -->
    <div class="secao-header"><div class="secao-titulo">🚗 Transporte</div></div>
    <div class="grid-cards" style="margin-bottom:1.2rem">
      ${CARROS.map(cr => {
        const isAt = cr.id === carId;
        const fin  = fins[cr.id];
        const p36  = cr.v > 0 ? Math.ceil(cr.v / 36 * 1.35) : 0;
        const p48  = cr.v > 0 ? Math.ceil(cr.v / 48 * 1.35) : 0;

        return `
        <div class="pat-card ${isAt ? 'ativo' : ''}">
          <div class="pc-icon">${cr.i}</div>
          <div class="pc-nome">${cr.l}</div>
          <div class="pc-det">${cr.desc}</div>

          ${cr.v > 0 ? `<div class="pc-det">${fmt(cr.v)}</div>` : ''}

          <div class="pc-det" style="color:#ffa726">
            ${fmt(cr.cm)}/mês
          </div>

          <div class="pc-rep">
            Rep: ${cr.rep >= 0 ? '+' : ''}${cr.rep}
          </div>

          ${
            isAt
              ? `
                <div class="pc-ativo">
                  ✓ Seu veículo
                  ${
                    fin && fin.parcelas_restantes > 0
                      ? `
                        <br>
                        <span style="font-size:.6rem;color:var(--amber)">
                          ${fin.parcelas_restantes}× restantes
                        </span>
                      `
                      : ''
                  }
                </div>

                ${
                  fin && fin.parcelas_restantes > 0
                    ? `
                      <button
                        style="font-size:.58rem;margin-top:.3rem;background:var(--verm-bg);border:1px solid var(--verm3);color:var(--verm2);padding:.25rem .5rem;border-radius:3px;cursor:pointer;width:100%"
                        onclick="window.devolverCarro('${cr.id}')"
                      >
                        ↩ Devolver carro (50% de volta)
                      </button>
                    `
                    : ''
                }
              `
              : cr.id === 'onibus'
                ? `
                  <button
                    class="btn btn-sm btn-ghost"
                    style="width:100%;margin-top:.3rem"
                    onclick="window.escolherCarro('onibus','vista')"
                  >
                    Usar
                  </button>
                `
                : `
                  <div style="display:flex;flex-direction:column;gap:.2rem;margin-top:.3rem">

                    ${
                      (j.dinheiro || 0) >= cr.v
                        ? `
                          <button
                            class="btn btn-sm btn-sec"
                            style="width:100%;font-size:.6rem"
                            onclick="window.escolherCarro('${cr.id}','vista')"
                          >
                            À vista ${fmt(cr.v)}
                          </button>
                        `
                        : ''
                    }

                    ${
                      !j.no_serasa
                        ? `
                          <button
                            class="btn btn-sm btn-ghost"
                            style="width:100%;font-size:.6rem"
                            onclick="window.escolherCarro('${cr.id}','fin36')"
                          >
                            36× ${fmt(p36)}/mês
                          </button>

                          <button
                            class="btn btn-sm btn-ghost"
                            style="width:100%;font-size:.6rem"
                            onclick="window.escolherCarro('${cr.id}','fin48')"
                          >
                            48× ${fmt(p48)}/mês
                          </button>
                        `
                        : `
                          <div style="font-size:.6rem;color:var(--verm3)">
                            Financiamento bloqueado (Serasa)
                          </div>
                        `
                    }

                  </div>
                `
          }

        </div>
        `;
      }).join('')}
    </div>
    <!-- ESCRITÓRIO PESSOAL -->
    <!-- ESCRITÓRIO PESSOAL -->
    <div class="secao-header">
      <div class="secao-titulo">💼 Espaço de Trabalho</div>
    </div>

    ${j.escritorio_empregado_id && j.escritorio_id !== 'solo'
      ? `<div class="card" style="background:var(--verde-bg);border:1px solid var(--verde3)">
           <div style="font-size:.8rem;color:var(--verde);font-weight:600">
             ✅ Você trabalha em ${j.escritorio_nome || 'escritório'}
           </div>
           <div style="font-size:.72rem;color:var(--txt3);margin-top:.2rem">
             Sem custo de espaço — o escritório cobre sua estrutura.
           </div>
         </div>`
      : `<div class="grid-cards">
           ${ESC_PAT
             .filter(e => e.id !== 'cw' || j.escritorio_id === 'solo' || !j.escritorio_empregado_id)
             .map(e => {
               const isAt = e.id === escId;

               const repTxt =
                 e.rep > 0
                   ? '+' + e.rep + ' rep/mês'
                   : e.rep < 0
                     ? e.rep + ' rep/mês'
                     : 'Neutro';

               const repCor =
                 e.rep > 0
                   ? 'var(--verde2)'
                   : e.rep < 0
                     ? 'var(--verm2)'
                     : 'var(--txt4)';

               return `
                 <div class="pat-card ${isAt ? 'ativo' : ''}">
                   <div class="pc-icon">${e.i}</div>
                   <div class="pc-nome">${e.l}</div>

                   <div class="pc-det" style="color:var(--amber)">
                     ${e.cm > 0 ? fmt(e.cm) + '/mês' : 'Gratuito'}
                   </div>

                   <div class="pc-rep" style="color:${repCor}">
                     ${repTxt}
                   </div>

                   <div class="pc-det" style="font-size:.6rem">
                     ${e.desc || ''}
                   </div>

                   ${isAt
                     ? `<div class="pc-ativo">✓ Atual</div>`
                     : `<button
                          class="btn btn-sm btn-ghost"
                          style="width:100%;margin-top:.3rem"
                          onclick="window.escolherEscritorioPat('${e.id}')">
                          Escolher
                        </button>`
                   }
                 </div>
               `;
             })
             .join('')}
         </div>`
    }

// ════════════════════════════════════════════════════════
// AÇÕES
// ════════════════════════════════════════════════════════
window.escolherMoradia = async function(id, tipo) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const m   = MORADIAS.find(x=>x.id===id);
  if (!m) return;

  const updates = {};
  if (m.pais) {
    updates['pat.moradia'] = 'pais';
    updates.reputacao = Math.max(0,(j.reputacao||30)-3);
    toast('👨‍👩‍👦 Voltou para a casa dos pais. -3 rep.','');
  } else if (tipo === 'compra') {
    if ((j.dinheiro||0) < m.v) { toast(`Saldo insuficiente. Necessário: ${fmt(m.v)}`,'ko'); return; }
    updates.dinheiro = (j.dinheiro||0) - m.v;
    updates[`moradias_compradas.${id}`] = true;
    updates['pat.moradia'] = id;
    updates.reputacao = Math.min(100,(j.reputacao||30)+m.rep_cp);
    toast(`🏠 ${m.l} comprada! +${m.rep_cp} rep`,'ok');
  } else {
    updates['pat.moradia'] = id;
    if (m.rep_al > 0) updates.reputacao = Math.min(100,(j.reputacao||30)+m.rep_al);
    toast(`🏠 Mudou para ${m.l} · Aluguel: ${fmt(calcAluguel(m.v))}/mês`,'ok');
  }

  await _salvar(uid, updates);
};

window.escolherCarro = async function(id, mod) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if (j.no_serasa && mod !== 'vista' && id !== 'onibus') {
    toast('Financiamento bloqueado — nome no Serasa.','ko'); return;
  }
  const cr  = CARROS.find(x=>x.id===id);
  const updates = {};

  if (id === 'onibus' || mod === 'vista') {
    if (cr?.v && (j.dinheiro||0) < cr.v) { toast(`Saldo insuficiente.`,'ko'); return; }
    if (cr?.v) updates.dinheiro = (j.dinheiro||0) - cr.v;
    updates['pat.transporte'] = id;
    updates.reputacao = Math.min(100,(j.reputacao||30)+(cr?.rep||0));
    toast(`${cr?.i||'🚌'} ${cr?.l||'Transporte'} selecionado!`,'ok');
  } else {
    const parcelas = mod === 'fin36' ? 36 : 48;
    const parcela  = Math.ceil((cr?.v||0)/parcelas*1.35);
    updates[`financiamentos.${id}`] = { nome:cr?.l, parcela_mensal:parcela, parcelas_restantes:parcelas, valor_total:parcela*parcelas };
    updates['pat.transporte'] = id;
    updates.reputacao = Math.min(100,(j.reputacao||30)+Math.floor((cr?.rep||0)*0.6));
    toast(`${cr?.i} ${cr?.l} financiado! ${parcelas}× ${fmt(parcela)}/mês`,'ok');
  }
  await _salvar(uid, updates);
};

window.escolherEscritorioPat = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  await _salvar(uid, { 'pat.escritorio': id });
  toast('💼 Escritório/coworking atualizado!','ok');
};

// ════════════════════════════════════════════════════════
// LOJA
// ════════════════════════════════════════════════════════
window.renderLoja = function(j, el) {
  const comprados = (j.compras||[]).map(c=>c.id);
  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🛍️ Loja</div>
      <span class="secao-badge">Saldo: ${fmt(j.dinheiro||0)}</span>
    </div>
    <div style="font-size:.75rem;color:var(--ardosia2);margin-bottom:1rem">
      Itens de status aumentam sua reputação permanentemente. Ferramentas profissionais melhoram suas skills.
    </div>
    <div class="grid-cards">
      ${SHOP.map(it => {
        const jatem = comprados.includes(it.id);
        return `<div class="pat-card ${jatem?'ativo':''}">
          <div class="pc-icon">${it.i}</div>
          <div class="pc-nome">${it.n}</div>
          <div class="pc-det">${it.d}</div>
          <div class="pc-rep">${fmt(it.p)}</div>
          ${jatem ? `<div class="pc-ativo">✓ Adquirido</div>` :
          (j.dinheiro||0)>=it.p ? `<button class="btn btn-sm btn-sec" style="width:100%;margin-top:.3rem" onclick="window.comprarItem('${it.id}')">Comprar</button>` :
          `<div style="font-size:.65rem;color:var(--ardosia);margin-top:.3rem">Saldo insuficiente</div>`}
        </div>`;
      }).join('')}
    </div>
    ${comprados.length > 0 ? `
    <div class="secao-header" style="margin-top:1.5rem"><div class="secao-titulo">🛒 Seus Bens</div></div>
    <div class="grid-cards">
      ${(j.compras||[]).map(cc=>`<div class="pat-card ativo">
        <div class="pc-icon">${cc.i||'📦'}</div>
        <div class="pc-nome">${cc.n}</div>
        ${cc.rep?`<div class="pc-rep">+${cc.rep} rep</div>`:''}
      </div>`).join('')}
    </div>`:'' }`;
};

window.comprarItem = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const it  = SHOP.find(x=>x.id===id);
  if (!it) return;
  if ((j.dinheiro||0) < it.p) { toast('Saldo insuficiente.','ko'); return; }
  if ((j.compras||[]).some(c=>c.id===id)) { toast('Você já possui este item.',''); return; }

  const novasCompras = [...(j.compras||[]), {id:it.id,i:it.i,n:it.n,rep:it.rep||0}];
  const updates = {
    dinheiro: (j.dinheiro||0) - it.p,
    compras:  novasCompras,
  };
  if (it.rep > 0) updates.reputacao = Math.min(100,(j.reputacao||30)+it.rep);

  // Efeitos de skill
  if (it.id==='bj') updates['skills.pesquisa'] = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).pesquisa||18)+8);
  if (it.id==='nb') {
    updates['skills.escrita']  = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).escrita||15)+6);
    updates['skills.pesquisa'] = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).pesquisa||18)+6);
  }
  if (it.id==='ai') Object.keys(j.skills||{}).forEach(k=>{
    updates[`skills.${k}`] = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{})[k]||15)+8);
  });
  if (it.id==='cg') updates['skills.networking'] = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).networking||10)+6);
  if (it.id==='ac') {
    updates['skills.persuasao'] = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).persuasao||12)+6);
    updates['skills.oratoria']  = Math.min(window.REP_CAP[j.cargo_id]||55, ((j.skills||{}).oratoria||15)+4);
  }

  await _salvar(uid, updates);
  toast(`${it.i} ${it.n} adquirido!${it.rep>0?` +${it.rep} rep`:''}`, 'ok');
};

// ════════════════════════════════════════════════════════
// ESTUDAR SKILL
// ════════════════════════════════════════════════════════
window.estudarSkill = async function(sk, skLabel) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if ((j.dinheiro||0) < 400) { toast('Saldo insuficiente. Estudar custa R$400.','ko'); return; }
  if ((j.study_queue||[]).some(s=>s.skill===sk)) { toast('Já há um estudo desta skill em andamento.','ko'); return; }

  const mesAtual = window.SERVER?.mes_global || 1;
  const novaFila = [...(j.study_queue||[]), {
    skill:         sk,
    skill_label:   skLabel,
    ganho:         3,
    mes_conclusao: mesAtual + 1,
  }];
  await _salvar(uid, { dinheiro:(j.dinheiro||0)-500, study_queue:novaFila });
  toast(`📖 Estudando ${skLabel} — resultado em 1 mês!`, 'ok');
};

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
window.devolverCarro = async function(carroId) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const fin = (j.financiamentos || {})[carroId];
  if (!fin || fin.parcelas_restantes <= 0) {
    toast('Nenhum financiamento ativo para este veículo.', 'ko');
    return;
  }

  // Calcular valor pago até agora
  const totalContrato  = fin.valor_total || 0;
  const totalParcelas  = Math.round(totalContrato / fin.parcela_mensal) || 1;
  const pagas          = totalParcelas - fin.parcelas_restantes;
  const valorPago      = pagas * fin.parcela_mensal;
  const reembolso      = Math.floor(valorPago * 0.5);

  if (!confirm(
    `Devolver ${fin.nome}?\n\n` +
    `Parcelas pagas: ${pagas}/${totalParcelas}\n` +
    `Valor pago até agora: R$ ${valorPago.toLocaleString('pt-BR')}\n` +
    `Reembolso (50%): R$ ${reembolso.toLocaleString('pt-BR')}\n\n` +
    `Você voltará para o ônibus.`
  )) return;

  const novosFins = { ...(j.financiamentos || {}) };
  delete novosFins[carroId];

  await _salvar(uid, {
    financiamentos:  novosFins,
    'pat.transporte': 'onibus',
    dinheiro:        (j.dinheiro || 0) + reembolso,
  });

  toast(`🚗 Carro devolvido. +R$ ${reembolso.toLocaleString('pt-BR')} de reembolso.`, 'ok', 5000);
};

async function _salvar(uid, updates) {
  try {
    await updateDoc(doc(db, 'jogadores', uid), updates);
  } catch (err) {
    toast('Erro ao salvar.','ko');
    console.error('[PAT]', err);
  }
}

function _calcRepPat(j) {
  const morId  = j.pat?.moradia||'pais';
  const carId  = j.pat?.transporte||'onibus';
  const escId  = j.pat?.escritorio||'home';
  const mor    = MORADIAS.find(m=>m.id===morId);
  const car    = CARROS.find(c=>c.id===carId);
  const esc    = ESC_PAT.find(e=>e.id===escId);
  const propria= j.moradias_compradas?.[morId];
  let rep = 0;
  if (mor) rep += propria ? mor.rep_cp : Math.max(0, mor.rep_al);
  if (car) rep += car.rep;
  // Escritório: só aplica se for solo (NPC não tem custo/bônus pat)
  const isSoloPat = !j.escritorio_empregado_id || j.escritorio_id === 'solo';
  if (esc && isSoloPat) rep += esc.rep;
  (j.compras||[]).forEach(c=>{ if (c.rep>0) rep+=c.rep; });
  return Math.min(30, rep);
}

function _card4(ic, l, v, t) {
  const cor = t==='money'?'var(--verde3)':t==='danger'?'var(--verm3)':'var(--perg)';
  return `<div class="stat-mini"><div class="v" style="color:${cor}">${v}</div><div class="l">${ic} ${l}</div></div>`;
}

function fmt(n) {
  if (!n && n!==0) return '—';
  if (n>=1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if (n>=1000)    return `R$ ${Math.round(n/1000)}k`;
  return `R$ ${Number(n).toLocaleString('pt-BR')}`;
}
