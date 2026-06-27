/**
 * PATRIMÔNIO — Advocatus Online v2
 * Moradia, transporte, escritório e loja — com imagens.
 */

import { doc, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

// ════════════════════════════════════════════════════════
// ZONAS
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

// ════════════════════════════════════════════════════════
// DADOS — MORADIAS
// ════════════════════════════════════════════════════════
const MORADIAS = [
  {id:'pais',        l:'Casa dos pais',         bairro:'—',                zona:'norte',   img:null,                               v:0,        rep_al:0,   rep_cp:0,  perigo:0, pais:true},
  {id:'belford',     l:'Casa em Belford Roxo',  bairro:'Belford Roxo',     zona:'baixada', img:'img/imoveis/belford-roxo.jpeg',    v:150000,   rep_al:-2,  rep_cp:0,  perigo:2},
  {id:'penha',       l:'Casa na Penha',         bairro:'Penha',            zona:'norte',   img:'img/imoveis/penha.jpeg',           v:250000,   rep_al:0,   rep_cp:3,  perigo:2},
  {id:'catete',      l:'Apto no Catete',        bairro:'Catete',           zona:'sul',     img:'img/imoveis/catete.jpeg',          v:700000,   rep_al:7,   rep_cp:18, perigo:0},
  {id:'centro_apto', l:'Apto no Centro',        bairro:'Centro',           zona:'centro',  img:'img/imoveis/centro.jpeg',          v:500000,   rep_al:4,   rep_cp:10, perigo:1},
  {id:'laranjeiras', l:'Apto nas Laranjeiras',  bairro:'Laranjeiras',      zona:'sul',     img:'img/imoveis/laranjeiras.jpeg',     v:1100000,  rep_al:9,   rep_cp:24, perigo:0},
  {id:'icarai',      l:'Apto em Icaraí',        bairro:'Icaraí (Niterói)', zona:'niteroi', img:'img/imoveis/icarai.jpeg',          v:1400000,  rep_al:11,  rep_cp:29, perigo:0},
  {id:'ipanema',     l:'Apto em Ipanema',       bairro:'Ipanema',          zona:'sul',     img:'img/imoveis/ipanema.jpeg',         v:2500000,  rep_al:14,  rep_cp:38, perigo:0},
  {id:'leblon',      l:'Apto em Leblon',        bairro:'Leblon',           zona:'sul',     img:'img/imoveis/leblon.jpeg',          v:3000000,  rep_al:15,  rep_cp:40, perigo:0},
];

// ════════════════════════════════════════════════════════
// DADOS — TRANSPORTES
// ════════════════════════════════════════════════════════
const CARROS = [
  {id:'onibus',     l:'Ônibus / Metrô',             img:'img/transportes/onibus.png',       v:0,       cm:176,   rep:-1, desc:'R$8/dia × 22 dias'},
  {id:'hatch',      l:'Hatchback',                  img:'img/transportes/hatch.png',        v:75000,   cm:950,   rep:2,  desc:'Compacto popular urbano'},
  {id:'sedan',      l:'Sedã Executivo',             img:'img/transportes/sedan.png',        v:160000,  cm:2200,  rep:7,  desc:'Sedã espaçoso e confiável'},
  {id:'suv',        l:'SUV',                        img:'img/transportes/suv.png',          v:200000,  cm:2600,  rep:9,  desc:'Espaço e conforto urbano'},
  {id:'esp_alemao', l:'Esportivo Alemão',           img:'img/transportes/esp-alemao.png',   v:380000,  cm:5000,  rep:14, desc:'Luxo e performance alemã'},
  {id:'esp_ital',   l:'Esportivo Italiano Premium', img:'img/transportes/esp-italiano.png', v:850000,  cm:12000, rep:20, desc:'O topo do prestígio executivo'},
];

// ════════════════════════════════════════════════════════
// DADOS — ESPAÇO DE TRABALHO
// ════════════════════════════════════════════════════════
const ESC_PAT = [
  {id:'home', l:'Home Office',         img:'img/escritorios/home-office.png',         cm:0,     rep:-2, desc:'Gratuito. -2 rep/mês.'},
  {id:'cw',   l:'Coworking Jurídico',  img:'img/escritorios/cowork.png',              cm:600,   rep:0,  desc:'Para advogados solo.'},
  {id:'sal',  l:'Sala Própria',        img:'img/escritorios/sala-propria.png',        cm:3000,  rep:3,  desc:'Escritório individual. +3 rep/mês.'},
  {id:'esm',  l:'Escritório Médio',    img:'img/escritorios/escritorio-medio.png',    cm:7500,  rep:6,  desc:'Espaço para equipe. +6 rep/mês.'},
  {id:'esp',  l:'Escritório Premium',  img:'img/escritorios/escritorio-premium.png',  cm:18000, rep:12, desc:'Big Law. +12 rep/mês.'},
];

// ════════════════════════════════════════════════════════
// DADOS — LOJA
// ════════════════════════════════════════════════════════
const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const SHOP = [
  {id:'terno_basic', img:'img/loja/terno-alfaiataria.jpeg', n:'Terno de Alfaiataria',    p:4500,  cat:'status', rep:2, d:'+2 rep permanente'},
  {id:'terno_ital',  img:'img/loja/terno-italiano.jpeg',    n:'Terno Italiano (Brioni)',  p:18000, cat:'status', rep:4, d:'+4 rep permanente'},
  {id:'sapato',      img:'img/loja/sapato-couro.jpeg',      n:'Sapatos de Couro',        p:3200,  cat:'status', rep:1, d:'+1 rep permanente'},
  {id:'cinto',       img:'img/loja/cinto-couro.jpeg',       n:'Cinto de Couro',          p:1800,  cat:'status', rep:1, d:'+1 rep permanente'},
  {id:'carteira',    img:'img/loja/carteira-couro.jpeg',    n:'Carteira de Couro',       p:2200,  cat:'status', rep:1, d:'+1 rep permanente'},
  {id:'relogio_med', img:'img/loja/relogio-tissot.jpeg',    n:'Relógio Tissot',          p:22000, cat:'status', rep:3, d:'+3 rep permanente'},
  {id:'rel_prem',    img:'img/loja/relogio-premium.jpeg',   n:'Relógio Premium',         p:45000, cat:'status', rep:4, d:'+4 rep permanente'},
  {id:'relogio_lux', img:'img/loja/relogio-rolex.jpeg',     n:'Relógio Rolex',           p:85000, cat:'status', rep:6, d:'+6 rep permanente'},
  {id:'bolsa',       img:'img/loja/pasta-hermes.jpeg',      n:'Pasta Hermès',            p:12000, cat:'status', rep:2, d:'+2 rep permanente'},
  {id:'bj',  img:'img/loja/biblioteca-juridica.jpeg', n:'Biblioteca Jurídica',      p:12000, cat:'prof', rep:0, d:'+8 Pesquisa'},
  {id:'nb',  img:'img/loja/notebook-premium.jpeg',    n:'Notebook Premium',         p:8500,  cat:'prof', rep:0, d:'+6 Escrita · +6 Pesquisa'},
  {id:'ai',  img:'img/loja/assistente-ia.jpeg',       n:'Assistente IA Jurídico',   p:35000, cat:'prof', rep:1, d:'+8 em todas as skills'},
  {id:'ac',  img:'img/loja/academia-premium.jpeg',    n:'Academia Premium (1 ano)', p:3600,  cat:'exp',  rep:0, d:'+6 Persuasão · +4 Oratória'},
  {id:'cong_sp',  img:'img/loja/congresso-sp.jpeg',      n:'Congresso em São Paulo',   p:8000,  cat:'cong', rep:2, d:'+2 rep · +5 Networking', mes:2},
  {id:'cong_rio', img:'img/loja/congresso-rio.jpeg',     n:'Congresso Rio de Janeiro', p:6000,  cat:'cong', rep:2, d:'+2 rep · +5 Networking', mes:4},
  {id:'cong_lis', img:'img/loja/congresso-lisboa.jpeg',  n:'Congresso em Lisboa',      p:15000, cat:'cong', rep:3, d:'+3 rep · +6 Networking', mes:6},
  {id:'cong_par', img:'img/loja/congresso-paris.jpeg',   n:'Congresso em Paris',       p:22000, cat:'cong', rep:4, d:'+4 rep · +8 Networking', mes:8},
  {id:'cong_ber', img:'img/loja/congresso-berlim.jpeg',  n:'Congresso em Berlim',      p:18000, cat:'cong', rep:3, d:'+3 rep · +7 Networking', mes:10},
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
  if (z?.adj?.includes(zonaM)) return 4 * 22;
  return 8 * 22;
}

function _mesAtual() { return (((window.SERVER?.mes_global||1) - 1) % 12) + 1; }
function _anoAtual()  { return Math.ceil((window.SERVER?.mes_global||1) / 12); }

function _carroEhProprío(j, id) {
  if (id === 'onibus') return true;
  if (j.carros_comprados?.[id]) return true;
  if (j.pat?.transporte === id && !(j.financiamentos?.[id]?.parcelas_restantes > 0)) return true;
  return false;
}

// ── helper: monta um card com imagem + corpo ──────────────
function _card(img, alt, nome, bodyHtml, ativo) {
  const imgEl = img
    ? `<img class="pc-img" src="${img}" alt="${alt}" loading="lazy">`
    : `<div class="pc-icon">🏠</div>`;
  return `<div class="pat-card${ativo?' ativo':''}">
    ${imgEl}
    <div class="pat-card-body">
      <div class="pc-nome">${nome}</div>
      ${bodyHtml}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
// RENDERIZAÇÃO — PATRIMÔNIO
// ════════════════════════════════════════════════════════
window.renderPatrimonio = function(j, el) {
  const morId       = j.pat?.moradia    || 'pais';
  const carId       = j.pat?.transporte || 'onibus';
  const escId       = j.pat?.escritorio || 'home';
  const mor         = MORADIAS.find(m=>m.id===morId) || MORADIAS[0];
  const car         = CARROS.find(c=>c.id===carId);
  const esc         = ESC_PAT.find(e=>e.id===escId);
  const compradaMor = j.moradias_compradas?.[morId];
  const fins        = j.financiamentos || {};
  const deslocamento = calcDeslocamento(morId, 'centro');
  const CUSTO_BASE_PAT = {
    est:600, ass:700, jnr:900, pln:1400, snr:2200,
    asc:3000, soc:4500, snm:6000,
    jsub:2200, jtit:3000, dsb:4000, mstj:5500,
    padj:2000, prom:2800, pjus:3800, pgj:5000,
    dadj:1800, def:2400, dch:3200, dge:4500,
  };
  const custoVida  = CUSTO_BASE_PAT[j.cargo_id] || 700;
  const despEsc    = (!j.escritorio_empregado_id || j.escritorio_id === 'solo') ? (esc?.cm||0) : 0;
  const despCar    = car?.cm || 0;
  const despAlug   = (morId === 'pais' || compradaMor) ? 0 : calcAluguel(mor?.v||0);
  const despFin    = Object.values(fins).reduce((s,f)=>s+(f.parcelas_restantes>0?f.parcela_mensal:0),0);
  const despEst    = (j.estagiarios||[]).length * 1700;
  const despTotal  = despEsc+despCar+despAlug+despFin+despEst+deslocamento;
  const saldoLiq   = (j.renda_calculada||0) - despTotal - custoVida;

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🏠 Patrimônio</div>
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
      <span class="secao-badge">${compradaMor?'Casa própria':morId==='pais'?'Com os pais':'Aluguel'}</span>
    </div>
    ${j.prazo_sair_pais > 0 ? `<div style="background:rgba(139,38,53,.12);border:1px solid rgba(200,80,80,.35);border-radius:2px;padding:.6rem;margin-bottom:.6rem;font-size:.75rem;color:var(--verm3)">⚠️ Advogado(a) precisa de moradia própria! Prazo: ${Math.max(0,3-j.prazo_sair_pais)} mês(es) restante(s).</div>`:''}
    <div class="grid-cards" style="margin-bottom:1.2rem">
      ${MORADIAS.filter(m => m.pais ? (j.ci<=2||!j.oab) : true).map(m => {
        const isAt    = m.id === morId;
        const alug    = m.pais ? 0 : calcAluguel(m.v);
        const propria = j.moradias_compradas?.[m.id];

        let body;
        if (isAt) {
          body = `<div class="pc-ativo">✓ ${propria?'Sua casa':'Alugando'}</div>
            ${propria&&!m.pais?`<button class="btn-vender" onclick="window.venderImovel('${m.id}')">Vender ${fmt(Math.floor(m.v*.6))}</button>`:''}`;
        } else if (propria) {
          body = `<button class="btn btn-sm btn-ghost" onclick="window.alternarMoradia('${m.id}')">🏠 Morar aqui</button>
            <button class="btn-vender" onclick="window.venderImovel('${m.id}')">Vender ${fmt(Math.floor(m.v*.6))}</button>`;
        } else if (m.pais) {
          body = `<button class="btn btn-sm btn-ghost" onclick="window.escolherMoradia('${m.id}','aluguel')">Morar aqui</button>`;
        } else {
          body = `<button class="btn btn-sm btn-ghost" onclick="window.escolherMoradia('${m.id}','aluguel')">Alugar ${fmt(alug)}/mês</button>
            ${(j.dinheiro||0)>=m.v?`<button class="btn btn-sm btn-sec" onclick="window.escolherMoradia('${m.id}','compra')">Comprar ${fmt(m.v)}</button>`:''}`;
        }
        return _card(m.img, m.l, m.l, body, isAt);
      }).join('')}
    </div>

    <!-- TRANSPORTE -->
    <div class="secao-header"><div class="secao-titulo">🚗 Transporte</div></div>
    <div class="grid-cards" style="margin-bottom:1.2rem">
      ${CARROS.map(cr => {
        const isAt    = cr.id === carId;
        const proprio = _carroEhProprío(j, cr.id);
        const fin     = fins[cr.id];
        const p36     = cr.v>0 ? Math.ceil(cr.v/36*1.35) : 0;
        const p48     = cr.v>0 ? Math.ceil(cr.v/48*1.35) : 0;

        let body;
        if (isAt) {
          body = `<div class="pc-ativo">✓ Seu veículo${fin&&fin.parcelas_restantes>0?` · <span style="color:var(--amber)">${fin.parcelas_restantes}× restantes</span>`:''}</div>
            ${cr.id!=='onibus'? fin&&fin.parcelas_restantes>0
              ? `<button class="btn-vender" onclick="window.devolverCarro('${cr.id}')">↩ Devolver (50% pago)</button>`
              : `<button class="btn-vender" onclick="window.venderCarro('${cr.id}')">Vender ${fmt(Math.floor(cr.v*.5))}</button>`
            :''}`;
        } else if (proprio && cr.id !== 'onibus') {
          body = `<div class="pc-ativo" style="color:var(--ouro2)">✓ Possuído</div>
            <button class="btn btn-sm btn-ghost" onclick="window.alternarCarro('${cr.id}')">🚗 Usar este</button>
            <button class="btn-vender" onclick="window.venderCarro('${cr.id}')">Vender ${fmt(Math.floor(cr.v*.5))}</button>`;
        } else if (cr.id === 'onibus') {
          body = isAt
            ? `<div class="pc-ativo">✓ Usando</div>`
            : `<button class="btn btn-sm btn-ghost" onclick="window.escolherCarro('onibus','vista')">Usar</button>`;
        } else {
          body = `${(j.dinheiro||0)>=cr.v?`<button class="btn btn-sm btn-sec" onclick="window.escolherCarro('${cr.id}','vista')">À vista ${fmt(cr.v)}</button>`:''}
            ${!(j.no_serasa)
              ? `<button class="btn btn-sm btn-ghost" onclick="window.escolherCarro('${cr.id}','fin36')">36× ${fmt(p36)}/mês</button>
                 <button class="btn btn-sm btn-ghost" onclick="window.escolherCarro('${cr.id}','fin48')">48× ${fmt(p48)}/mês</button>`
              : `<div style="font-size:.6rem;color:var(--verm3)">Financiamento bloqueado (Serasa)</div>`}`;
        }
        return _card(cr.img, cr.l, cr.l, body, isAt);
      }).join('')}
    </div>`;
};

// ════════════════════════════════════════════════════════
// AÇÕES — MORADIA
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

window.alternarMoradia = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if (!j.moradias_compradas?.[id] && id !== 'pais') { toast('Você não possui este imóvel.','ko'); return; }
  await _salvar(uid, { 'pat.moradia': id });
  toast(`🏠 Moradia alternada para ${MORADIAS.find(x=>x.id===id)?.l||id}.`,'ok');
};

window.venderImovel = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const m   = MORADIAS.find(x=>x.id===id);
  if (!m || m.pais || !j.moradias_compradas?.[id]) { toast('Imóvel não encontrado.','ko'); return; }
  const vVenda = Math.floor(m.v * 0.6);
  if (!confirm(`Vender ${m.l}?\n\nValor de venda (60%): ${fmt(vVenda)}${j.pat?.moradia===id?'\nVocê voltará para outra propriedade ou casa dos pais.':''}`)) return;
  const novasComp = {...(j.moradias_compradas||{})}; delete novasComp[id];
  const updates = { moradias_compradas: novasComp, dinheiro: (j.dinheiro||0)+vVenda };
  if (j.pat?.moradia === id) {
    const outras = Object.keys(novasComp).filter(k=>novasComp[k]);
    updates['pat.moradia'] = outras.length > 0 ? outras[0] : 'pais';
    if ((m.rep_cp||0) > 0) updates.reputacao = Math.max(0,(j.reputacao||30)-(m.rep_cp||0));
  }
  await _salvar(uid, updates);
  toast(`🏠 ${m.l} vendida por ${fmt(vVenda)}.`,'ok');
};

// ════════════════════════════════════════════════════════
// AÇÕES — TRANSPORTE
// ════════════════════════════════════════════════════════
window.escolherCarro = async function(id, mod) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if (j.no_serasa && mod !== 'vista' && id !== 'onibus') { toast('Financiamento bloqueado — nome no Serasa.','ko'); return; }
  const cr = CARROS.find(x=>x.id===id);
  const updates = {};
  if (id === 'onibus' || mod === 'vista') {
    if (cr?.v && (j.dinheiro||0) < cr.v) { toast('Saldo insuficiente.','ko'); return; }
    if (cr?.v) { updates.dinheiro = (j.dinheiro||0)-cr.v; updates[`carros_comprados.${id}`] = true; }
    updates['pat.transporte'] = id;
    updates.reputacao = Math.min(100,(j.reputacao||30)+(cr?.rep||0));
    toast(`${cr?.l||'Transporte'} selecionado!`,'ok');
  } else {
    const parcelas = mod === 'fin36' ? 36 : 48;
    const parcela  = Math.ceil((cr?.v||0)/parcelas*1.35);
    updates[`financiamentos.${id}`] = { nome:cr?.l, parcela_mensal:parcela, parcelas_restantes:parcelas, valor_total:parcela*parcelas };
    updates[`carros_comprados.${id}`] = true;
    updates['pat.transporte'] = id;
    updates.reputacao = Math.min(100,(j.reputacao||30)+Math.floor((cr?.rep||0)*0.6));
    toast(`${cr?.l} financiado! ${parcelas}× ${fmt(parcela)}/mês`,'ok');
  }
  await _salvar(uid, updates);
};

window.alternarCarro = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if (!_carroEhProprío(j, id)) { toast('Você não possui este veículo.','ko'); return; }
  await _salvar(uid, { 'pat.transporte': id });
  toast(`🚗 Veículo alternado para ${CARROS.find(x=>x.id===id)?.l||id}.`,'ok');
};

window.venderCarro = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const cr  = CARROS.find(x=>x.id===id);
  if (!cr || id === 'onibus') { toast('Operação inválida.','ko'); return; }
  const vVenda = Math.floor(cr.v * 0.5);
  if (!confirm(`Vender ${cr.l}?\n\nValor de venda (50%): ${fmt(vVenda)}${j.pat?.transporte===id?'\nVocê passará a usar outro veículo ou transporte público.':''}`)) return;
  const novosCom = {...(j.carros_comprados||{})}; delete novosCom[id];
  const updates  = { carros_comprados: novosCom, dinheiro: (j.dinheiro||0)+vVenda };
  if (j.pat?.transporte === id) {
    const outros = Object.keys(novosCom).filter(k=>novosCom[k] && k!=='onibus');
    updates['pat.transporte'] = outros.length > 0 ? outros[0] : 'onibus';
    if ((cr.rep||0) > 0) updates.reputacao = Math.max(0,(j.reputacao||30)-(cr.rep||0));
  }
  if (j.financiamentos?.[id]) { const f={...j.financiamentos}; delete f[id]; updates.financiamentos=f; }
  await _salvar(uid, updates);
  toast(`🚗 ${cr.l} vendido por ${fmt(vVenda)}!`,'ok',5000);
};

window.devolverCarro = async function(carroId) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const fin = (j.financiamentos||{})[carroId];
  if (!fin || fin.parcelas_restantes <= 0) { toast('Nenhum financiamento ativo para este veículo.','ko'); return; }
  const totalParcelas = Math.round(fin.valor_total/fin.parcela_mensal)||1;
  const pagas         = totalParcelas - fin.parcelas_restantes;
  const reembolso     = Math.floor(pagas*fin.parcela_mensal*0.5);
  if (!confirm(`Devolver ${fin.nome}?\n\nParcelas pagas: ${pagas}/${totalParcelas}\nReembolso (50%): ${fmt(reembolso)}\n\nVocê voltará para o ônibus.`)) return;
  const novosFins = {...(j.financiamentos||{})}; delete novosFins[carroId];
  const novosCom  = {...(j.carros_comprados||{})}; delete novosCom[carroId];
  await _salvar(uid, { financiamentos:novosFins, carros_comprados:novosCom, 'pat.transporte':'onibus', dinheiro:(j.dinheiro||0)+reembolso });
  toast(`🚗 Carro devolvido. +${fmt(reembolso)} de reembolso.`,'ok',5000);
};

// ════════════════════════════════════════════════════════
// AÇÃO — ESCRITÓRIO PESSOAL
// ════════════════════════════════════════════════════════
window.escolherEscritorioPat = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  await _salvar(uid, { 'pat.escritorio': id });
  toast('💼 Escritório/coworking atualizado!','ok');
};

// ════════════════════════════════════════════════════════
// RENDERIZAÇÃO — LOJA
// ════════════════════════════════════════════════════════
window.renderLoja = function(j, el) {
  const comprados  = (j.compras||[]).map(c=>c.id);
  const congUsados = j.congressos_usados || {};
  const mesAtual   = _mesAtual();
  const anoAtual   = _anoAtual();

  const porCat = {status:[], prof:[], exp:[], cong:[]};
  SHOP.forEach(it => (porCat[it.cat]||porCat.status).push(it));

  function renderCard(it) {
    const jatem      = comprados.includes(it.id);
    const isCong     = it.cat === 'cong';
    const usadoAno   = congUsados[it.id] === anoAtual;
    const mesCorreto = isCong ? mesAtual === it.mes : true;

    let body;
    if (isCong) {
      const mesBadge = `<div style="font-size:.6rem;color:var(--navy3);margin-bottom:.1rem">📅 ${MESES_NOME[it.mes-1]}</div>`;
      if (usadoAno) {
        body = mesBadge + `<div class="pc-ativo" style="color:var(--txt3)">✓ Participado (ano ${anoAtual})</div>`;
      } else if (!mesCorreto) {
        body = mesBadge + `<div style="font-size:.65rem;color:var(--txt3)">Disponível em ${MESES_NOME[it.mes-1]}</div>`;
      } else if ((j.dinheiro||0) >= it.p) {
        body = mesBadge + `<button class="btn btn-sm btn-sec" onclick="window.comprarItem('${it.id}')">Participar ${fmt(it.p)}</button>`;
      } else {
        body = mesBadge + `<div style="font-size:.65rem;color:var(--ardosia)">Saldo insuficiente</div>`;
      }
    } else if (jatem) {
      body = `<div class="pc-ativo">✓ Adquirido</div>
        <button class="btn-vender" onclick="window.venderItem('${it.id}')">Vender ${fmt(Math.floor(it.p*.5))}</button>`;
    } else if ((j.dinheiro||0) >= it.p) {
      body = `<button class="btn btn-sm btn-sec" onclick="window.comprarItem('${it.id}')">Comprar ${fmt(it.p)}</button>`;
    } else {
      body = `<div style="font-size:.65rem;color:var(--ardosia)">Saldo insuficiente</div>`;
    }

    return _card(it.img, it.n, it.n, body, jatem&&!isCong || usadoAno);
  }

  el.innerHTML = `
    <div class="secao-header">
      <div class="secao-titulo">🛍️ Loja</div>
      <span class="secao-badge">Saldo: ${fmt(j.dinheiro||0)}</span>
    </div>
    <div class="secao-header" style="margin-top:.8rem"><div class="secao-titulo" style="font-size:.82rem">👔 Status</div></div>
    <div class="grid-cards" style="margin-bottom:1rem">${porCat.status.map(renderCard).join('')}</div>
    <div class="secao-header"><div class="secao-titulo" style="font-size:.82rem">💼 Profissional</div></div>
    <div class="grid-cards" style="margin-bottom:1rem">${[...porCat.prof,...porCat.exp].map(renderCard).join('')}</div>
    <div class="secao-header">
      <div class="secao-titulo" style="font-size:.82rem">✈️ Congressos</div>
      <span class="secao-badge" style="font-size:.62rem">1× por ano · mês fixo</span>
    </div>
    <div class="grid-cards" style="margin-bottom:1.2rem">${porCat.cong.map(renderCard).join('')}</div>`;
};

// ════════════════════════════════════════════════════════
// COMPRAR ITEM
// ════════════════════════════════════════════════════════
window.comprarItem = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const it  = SHOP.find(x=>x.id===id);
  if (!it) return;
  if ((j.dinheiro||0) < it.p) { toast('Saldo insuficiente.','ko'); return; }

  if (it.cat === 'cong') {
    if (_mesAtual() !== it.mes) { toast(`Congresso disponível apenas em ${MESES_NOME[it.mes-1]}.`,'ko'); return; }
    if ((j.congressos_usados||{})[it.id] === _anoAtual()) { toast('Você já participou deste congresso este ano.','ko'); return; }
    const netBonus = {cong_par:8,cong_ber:7,cong_lis:6,cong_sp:5,cong_rio:5}[it.id]||5;
    const updates  = { dinheiro:(j.dinheiro||0)-it.p, [`congressos_usados.${it.id}`]:_anoAtual() };
    if (it.rep>0) updates.reputacao = Math.min(100,(j.reputacao||30)+it.rep);
    updates['skills.networking'] = Math.min(window.REP_CAP?.[j.cargo_id]||55, ((j.skills||{}).networking||10)+netBonus);
    await _salvar(uid, updates);
    toast(`✈️ ${it.n} — participação confirmada!${it.rep>0?` +${it.rep} rep`:''}`, 'ok');
    return;
  }

  if ((j.compras||[]).some(c=>c.id===id)) { toast('Você já possui este item.',''); return; }
  const novasCompras = [...(j.compras||[]), {id:it.id,n:it.n,rep:it.rep||0,p:it.p,img:it.img}];
  const updates = { dinheiro:(j.dinheiro||0)-it.p, compras:novasCompras };
  if (it.rep>0) updates.reputacao = Math.min(100,(j.reputacao||30)+it.rep);
  if (it.id==='bj') updates['skills.pesquisa'] = Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{}).pesquisa||18)+8);
  if (it.id==='nb') {
    updates['skills.escrita']  = Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{}).escrita||15)+6);
    updates['skills.pesquisa'] = Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{}).pesquisa||18)+6);
  }
  if (it.id==='ai') Object.keys(j.skills||{}).forEach(k=>{
    updates[`skills.${k}`]=Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{})[k]||15)+8);
  });
  if (it.id==='ac') {
    updates['skills.persuasao']=Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{}).persuasao||12)+6);
    updates['skills.oratoria'] =Math.min(window.REP_CAP?.[j.cargo_id]||55,((j.skills||{}).oratoria||15)+4);
  }
  await _salvar(uid, updates);
  toast(`${it.n} adquirido!${it.rep>0?` +${it.rep} rep`:''}`, 'ok');
};

// ════════════════════════════════════════════════════════
// VENDER ITEM DA LOJA
// ════════════════════════════════════════════════════════
window.venderItem = async function(id) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  const it  = SHOP.find(x=>x.id===id);
  if (!it || !(j.compras||[]).some(c=>c.id===id)) { toast('Item não encontrado.','ko'); return; }
  const vVenda = Math.floor(it.p*.5);
  if (!confirm(`Vender ${it.n}?\n\nValor de venda (50%): ${fmt(vVenda)}${it.rep>0?`\nPerda de reputação: -${it.rep} rep`:''}`)) return;
  const updates = { dinheiro:(j.dinheiro||0)+vVenda, compras:(j.compras||[]).filter(c=>c.id!==id) };
  if ((it.rep||0)>0) updates.reputacao = Math.max(0,(j.reputacao||30)-(it.rep||0));
  await _salvar(uid, updates);
  toast(`${it.n} vendido por ${fmt(vVenda)}.${it.rep>0?` -${it.rep} rep`:''}`, 'ok');
};

// ════════════════════════════════════════════════════════
// ESTUDAR SKILL
// ════════════════════════════════════════════════════════
window.estudarSkill = async function(sk, skLabel) {
  const j   = window.JOGADOR;
  const uid = j.uid || window.JOGADOR_UID;
  if ((j.dinheiro||0)<400) { toast('Saldo insuficiente. Estudar custa R$400.','ko'); return; }
  if ((j.study_queue||[]).some(s=>s.skill===sk)) { toast('Já há um estudo desta skill em andamento.','ko'); return; }
  const novaFila = [...(j.study_queue||[]), { skill:sk, skill_label:skLabel, ganho:3, mes_conclusao:(window.SERVER?.mes_global||1)+1 }];
  await _salvar(uid, { dinheiro:(j.dinheiro||0)-500, study_queue:novaFila });
  toast(`📖 Estudando ${skLabel} — resultado em 1 mês!`, 'ok');
};

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
async function _salvar(uid, updates) {
  try { await updateDoc(doc(db,'jogadores',uid), updates); }
  catch(err) { toast('Erro ao salvar.','ko'); console.error('[PAT]',err); }
}

function _calcRepPat(j) {
  const morId  = j.pat?.moradia    || 'pais';
  const carId  = j.pat?.transporte || 'onibus';
  const escId  = j.pat?.escritorio || 'home';
  const mor    = MORADIAS.find(m=>m.id===morId);
  const car    = CARROS.find(c=>c.id===carId);
  const esc    = ESC_PAT.find(e=>e.id===escId);
  const propria = j.moradias_compradas?.[morId];
  let rep = 0;
  if (mor) rep += propria ? mor.rep_cp : Math.max(0, mor.rep_al);
  if (car) rep += (car.rep||0);
  if (esc && (!j.escritorio_empregado_id || j.escritorio_id==='solo')) rep += esc.rep;
  (j.compras||[]).forEach(c=>{ if ((c.rep||0)>0) rep+=c.rep; });
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
