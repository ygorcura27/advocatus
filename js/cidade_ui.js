/**
 * CIDADE — Advocatus Online
 * Painel com o Rio de Janeiro em 3D (js/cidade3d.js). O advogado anda até um
 * lugar e, ao chegar, o card lateral oferece abrir o painel daquele lugar.
 * Só navegação: nenhuma escrita no Firestore sai daqui.
 */
import { MORADIAS } from './patrimonio.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// id do lugar → nome, sigla do medalhão, painel do jogo e o que se faz lá
const LUGARES = {
  escritorio:  { name:'Seu escritório',          g:'E',   painel:'escritorio',       txt:'Sua equipe, os clientes e as finanças da banca.' },
  casa:        { name:'Sua casa',                g:'C',   painel:'vida_pessoal',     txt:'Descanso, família e a vida fora do fórum.' },
  forum:       { name:'Fórum Central',           g:'1º',  painel:'processos',        txt:'Varas de 1º grau: audiências, despachos e sentenças.' },
  tj:          { name:'Tribunal de Justiça',     g:'TJ',  painel:'processos',        txt:'Recursos em 2ª instância no TJRJ.' },
  trf:         { name:'TRF da 2ª Região',        g:'TRF', painel:'processos',        txt:'Causas federais e seus recursos.' },
  trt:         { name:'TRT da 1ª Região',        g:'TRT', painel:'processos',        txt:'Reclamações trabalhistas e recursos.' },
  delegacia:   { name:'Delegacia',               g:'D',   painel:'processos',        txt:'Inquéritos e investigação dos seus casos.' },
  aeroporto:   { name:'Aeroporto — voo a Brasília', g:'BSB', painel:'processos',     txt:'STJ e STF: os casos que sobem a Brasília.' },
  oab:         { name:'OAB/RJ',                  g:'OAB', painel:'progressao',       txt:'Exame da Ordem e a sua progressão de carreira.' },
  universidade:{ name:'Universidade',            g:'U',   painel:'posgraduacao',     txt:'Pós-graduação, mestrado e doutorado.' },
  imprensa:    { name:'Emissora de TV',          g:'TV',  painel:'imprensa',         txt:'Entrevistas, colunas e a sua imagem pública.' },
  clube:       { name:'Clube',                   g:'CL',  painel:'sistemas_sociais', txt:'Networking e relações que abrem portas.' },
  banco:       { name:'Banco',                   g:'$',   painel:'financeiro',       txt:'Investimentos e as contas do escritório.' },
  shopping:    { name:'Shopping',                g:'S',   painel:'loja',             txt:'Ternos, livros e o que mais a carreira pedir.' },
  empresas:    { name:'Torre empresarial',       g:'EM',  painel:'clientes',         txt:'Clientes corporativos e novos contratos.' },
  vagas:       { name:'Consultoria de carreira', g:'V',   painel:'vagas',            txt:'Vagas em escritórios e propostas de trabalho.' }
};

// bairro → posição no mapa (tiles; x = leste, z = sul)
const BAIRROS = {
  'Centro':{x:43,z:17}, 'Catete':{x:43,z:32}, 'Glória':{x:44,z:29}, 'Flamengo':{x:44,z:33}, 'Laranjeiras':{x:40,z:31},
  'Botafogo':{x:46,z:39}, 'Copacabana':{x:47,z:52}, 'Ipanema':{x:31,z:57}, 'Leblon':{x:25,z:57}, 'Lagoa':{x:36,z:50},
  'Tijuca':{x:30,z:20}, 'Barra da Tijuca':{x:4,z:52}, 'Icaraí (Niterói)':{x:65,z:33}, 'Niterói':{x:65,z:33}
};
const ZONA_NORTE = {x:14,z:8};

function posicaoBairro(b){ if(!b) return null; return BAIRROS[b] || (Object.entries(BAIRROS).find(([k])=>b.startsWith(k))||[])[1] || null; }

let _carregando = null;
function carregarScript(src){ return new Promise((ok,erro)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=ok; s.onerror=erro; document.head.appendChild(s); }); }
function carregarMotor(){
  if(window.cidade3d) return Promise.resolve();
  if(!_carregando) _carregando = (window.THREE ? Promise.resolve() : carregarScript(THREE_URL)).then(()=>carregarScript('js/cidade3d.js'));
  return _carregando;
}
function carregarCss(){ if(document.getElementById('css-cidade')) return; const l=document.createElement('link'); l.id='css-cidade'; l.rel='stylesheet'; l.href='css/cidade.css'; document.head.appendChild(l); }

let _aqui = null;
function cardAqui(){
  const L = LUGARES[_aqui];
  if(!L) return `<div class="cid-aqui"><span class="cid-rot">Rio de Janeiro</span><h3>Para onde?</h3><p>Toque num medalhão do mapa ou escolha um lugar abaixo. O advogado vai até lá a pé ou de táxi.</p></div>`;
  return `<div class="cid-aqui"><span class="cid-rot">Você está em</span><h3>${L.name}</h3><p>${L.txt}</p>
    <button type="button" class="cid-entrar" data-painel="${L.painel}">Entrar</button></div>`;
}
function desenharLado(el){
  const lado = el.querySelector('.cid-lado'); if(!lado) return;
  lado.innerHTML = cardAqui() + `<div class="cid-lista" role="list">${Object.entries(LUGARES).map(([id,L])=>
    `<button type="button" role="listitem" data-ir="${id}" ${id===_aqui?'aria-current="true"':''}><span class="cid-sigla">${L.g}</span>${L.name}</button>`).join('')}</div>`;
  lado.querySelector('.cid-entrar')?.addEventListener('click', e => window.navTo?.(e.currentTarget.dataset.painel));
  lado.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => window.cidade3d?.ir(b.dataset.ir)));
}

window.renderCidade = function(j, main){
  carregarCss();
  main.innerHTML = `<div class="cid-wrap"><div class="cid-mapa" id="cid-mapa"><div class="cid-carregando">Carregando o Rio de Janeiro…</div></div><div class="cid-lado"></div></div>`;
  try{ _aqui = localStorage.getItem('advocatus_cidade_loc') || 'escritorio'; }catch(e){ _aqui='escritorio'; }
  desenharLado(main);
  carregarMotor().then(() => {
    const slot = document.getElementById('cid-mapa'); if(!slot) return;
    if(!window.cidade3d.disponivel()){ slot.innerHTML = '<p class="cid-semgl">Seu navegador não tem suporte a 3D (WebGL). Use os lugares da lista ao lado.</p>'; return; }
    slot.innerHTML = '';
    const mor = MORADIAS.find(m => m.id === (j.pat?.moradia || 'pais'));
    const posicoes = {
      escritorio: posicaoBairro(j.escritorio_bairro) || BAIRROS['Centro'],
      casa: posicaoBairro(mor?.bairro) || ZONA_NORTE
    };
    const lugares = {}; for(const id in LUGARES) lugares[id] = { name:LUGARES[id].name, g:LUGARES[id].g, zone:'centro' };
    window.cidade3d.montar(slot, {
      lugares, posicoes, destaques:[],
      aoChegar: id => { _aqui = id; desenharLado(main); }
    });
  }).catch(() => {
    const slot = document.getElementById('cid-mapa');
    if(slot) slot.innerHTML = '<p class="cid-semgl">Não foi possível carregar o mapa agora. Use os lugares da lista ao lado.</p>';
  });
};
