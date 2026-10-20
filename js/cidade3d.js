/* =====================================================================
   MAPA 3D — Capítulos 1 a 6 (Rio de Janeiro)
   Cidade isométrica em Three.js no lugar do mapa pintado do Rio.
   Sem WebGL, sem Three.js (offline) ou com "Mapa clássico" escolhido, o jogo
   cai no mapa pintado de sempre. O motor do jogo não muda: o clique num local
   anda com o Vincent até lá e no fim chama enterLocation(), como travelTo().
   x = leste, z = sul, 1 tile ≈ 150 m.
   ===================================================================== */
/* =====================================================================
   CIDADE 3D — Advocatus Online
   Rio de Janeiro isométrico em Three.js (motor vindo do jogo Condicional).
   Os lugares do mapa são os do mundo jurídico; chegar a um lugar chama
   opts.aoChegar(id), que abre o painel correspondente do jogo.
   Só navegação e visual: nada aqui grava no Firestore.
   x = leste, z = sul, 1 tile ≈ 150 m.
   ===================================================================== */
(function(){
'use strict';
let temWebGL=null;
function webglOk(){
  if(temWebGL!==null) return temWebGL;
  try{ const c=document.createElement('canvas'); temWebGL=!!(c.getContext('webgl')||c.getContext('experimental-webgl')); }catch(e){ temWebGL=false; }
  return temWebGL;
}
const mapa3d={ falhou:false, usar(){ return !this.falhou && typeof THREE!=='undefined' && webglOk(); } };

/* ---------- camada de adaptação: o que o motor esperava do jogo de origem ---------- */
let OPTS={ lugares:{}, destaques:new Set(), aoChegar(){}, avatar:{} };
const PERIODO=()=>{ const h=new Date().getHours(); return h>=6&&h<17 ? 0 : h>=17&&h<19 ? 1 : 2; };
const S={ season:1, caso:1, flags:{}, ended:false, period:PERIODO(), loc:'escritorio', trail:['escritorio'] };
let traveling=null, mode='map';
const getActiveLocs=()=>OPTS.lugares;
const hasNewSceneNow=id=>OPTS.destaques.has(id);
const temTornozeleira=()=>false;
const telaCoberta=()=>!!document.querySelector('.modal-overlay.ativo, .modal.ativo, #modal-overlay.ativo');
const menosMovimento=()=>!!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const graficoLeve=()=>Math.min(innerWidth,innerHeight)<700 || (navigator.hardwareConcurrency||8)<=4;
const LOCS={}, LOCS_S2={}, LOCS_S4={}, LOCS_S6={}, LOCS_S7={}, LOCS_S8={}, LOCS_S9={}, LOCS_S10={}, LOCS_S11={}, LOCS_S12={};
function enterLocation(id){ S.loc=id; try{ localStorage.setItem('advocatus_cidade_loc',id); }catch(e){} OPTS.aoChegar(id); }
function render(){ try{ mapa3d.aposRender(); }catch(e){ console.error(e); } }
/* o advogado: boneco de blocos com terno, gravata e pasta (mesmas juntas que o motor anima) */
const _mats={};
const _mat=(c,o)=>{ const k=c+JSON.stringify(o||{}); return _mats[k]||(_mats[k]=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.7},o||{}))); };
const _cx=(g,w,h,d,m,x,y,z)=>{ const k=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); k.position.set(x||0,y||0,z||0); k.castShadow=true; g.add(k); return k; };
function pessoa(id,look){
  const o=Object.assign({pele:0xc89a78, cabelo:0x2a1e16, terno:0x1b2a4a, camisa:0xf2f2f2, gravata:0xc9a227, calca:0x1b2a4a, sapato:0x15110e, pasta:true}, OPTS.avatar||{}, look||{});
  if(look && look.camisa && !look.terno){ o.terno=look.camisa; o.calca=look.calca||o.calca; o.pasta=false; o.gravata=null; }
  const g=new THREE.Group(), u={};
  const quadril=new THREE.Group(); quadril.position.y=.9; g.add(quadril); u.quadril=quadril;
  const perna=x=>{ const p=new THREE.Group(); p.position.set(x,0,0); _cx(p,.15,.84,.17,_mat(o.calca),0,-.42,0); _cx(p,.17,.08,.27,_mat(o.sapato,{roughness:.3}),0,-.86,.04); quadril.add(p); return p; };
  u.pE=perna(-.1); u.pD=perna(.1);
  const tronco=new THREE.Group(); quadril.add(tronco);
  _cx(tronco,.44,.62,.25,_mat(o.terno),0,.31,0);
  _cx(tronco,.12,.5,.02,_mat(o.camisa),0,.36,.13);
  if(o.gravata){ _cx(tronco,.06,.36,.025,_mat(o.gravata,{roughness:.35,metalness:.3}),0,.32,.145); }
  for(const s of [-1,1]){ const l=_cx(tronco,.12,.42,.02,_mat(o.terno),s*.11,.42,.135); l.rotation.z=s*.18; }
  const braco=x=>{ const b=new THREE.Group(); b.position.set(x,.58,0); _cx(b,.12,.56,.14,_mat(o.terno),0,-.28,0); _cx(b,.1,.1,.1,_mat(o.pele),0,-.6,0); tronco.add(b); return b; };
  u.bE=braco(-.29); u.bD=braco(.29);
  if(o.pasta){ const p=_cx(u.bD,.06,.24,.32,_mat(0x4a2a16,{roughness:.4}),0,-.72,0); _cx(u.bD,.065,.03,.12,_mat(0xc9a227,{metalness:.6,roughness:.3}),0,-.58,0); }
  _cx(tronco,.12,.08,.12,_mat(o.pele),0,.66,0);
  const cab=new THREE.Group(); cab.position.y=.82; tronco.add(cab); u.cabeca=cab;
  _cx(cab,.26,.28,.26,_mat(o.pele),0,0,0);
  _cx(cab,.28,.09,.28,_mat(o.cabelo),0,.13,-.01); _cx(cab,.28,.18,.06,_mat(o.cabelo),0,.03,-.12);
  if(o.est==='longoOndulado'){ _cx(cab,.3,.42,.09,_mat(o.cabelo),0,-.12,-.14); }
  for(const s of [-1,1]) _cx(cab,.035,.03,.015,_mat(0x15110e),s*.058,.03,.135);
  u.led=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),new THREE.MeshBasicMaterial({color:0x000000})); u.led.visible=false; g.add(u.led);
  u.tornoz=new THREE.Group(); u.tornoz.visible=false; g.add(u.tornoz);
  g.userData=u; g.traverse(m=>{ if(m.isMesh) m.castShadow=true; }); return g;
}
function veiculo(){ // táxi das corridas longas: sedã de blocos (o motor pinta de amarelo no Rio)
  const g=new THREE.Group(), lata=new THREE.MeshPhysicalMaterial({color:0x0c0c0e,metalness:.5,roughness:.28,clearcoat:1,clearcoatRoughness:.08});
  _cx(g,1.7,.5,4.2,lata,0,.6,0); _cx(g,1.5,.45,2.1,lata,0,1.05,-.2); _cx(g,1.52,.36,1.9,_mat(0x1a2630,{roughness:.1,metalness:.6}),0,1.05,-.2);
  for(const x of [-.8,.8]) for(const z of [1.3,-1.3]){ const r=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.24,16),_mat(0x111111)); r.rotation.z=Math.PI/2; r.position.set(x,.32,z); g.add(r); }
  g.userData.tipo='carro'; return g;
}
window.figurino={ pessoa, veiculo, atual:()=>({veiculo:null}), versao:0 };

let M=null;   // o mundo da cidade do capítulo, construído na primeira vez que o mapa 3D aparece nela
const MUNDOS={};

/* --------------------------- GEOGRAFIA --------------------------- */
function dentroPoly(px,pz,poly){
  let ins=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const [xi,zi]=poly[i],[xj,zj]=poly[j];
    if(((zi>pz)!==(zj>pz)) && (px<(xj-xi)*(pz-zi)/(zj-zi)+xi)) ins=!ins; }
  return ins;
}
const elevacao=(morros,x,z)=>{ let e=0; for(const [mx,mz,h,s] of morros){ e+=h*Math.exp(-((x-mx)**2+(z-mz)**2)/(2*s*s)); } return e; };
function distLinha(px,pz,pts){ let d=1e9;
  for(let i=1;i<pts.length;i++){ const [ax,az]=pts[i-1], [bx,bz]=pts[i], vx=bx-ax, vz=bz-az, t=Math.max(0,Math.min(1,((px-ax)*vx+(pz-az)*vz)/(vx*vx+vz*vz)));
    d=Math.min(d,Math.hypot(px-ax-vx*t,pz-az-vz*t)); } return d; }

/* ---------- Rio de Janeiro (Capítulos 1 a 6) ---------- */
const CONTINENTE=[[0,0],[40,0],[42,4],[44,8],[45,11],[46.5,12.5],[46,16],[45.2,19],[45,21],[48.4,21],[48.4,26.5],[45.4,27.5],
  [45.2,31],[46,34],[45.2,36.5],[46.6,39.2],[49.5,40],[51.3,41.2],[53.5,42],[56.5,42.6],[59,44.2],[57.2,46],[54,46.5],[51.6,46.8],
  [50.4,49.5],[49,52.5],[47.4,55.5],[45.6,58.4],[44,59.8],[42,59.2],[40,60.2],[30,60.8],[22,61],[20,60.6],[16,62],[10,62.6],[5,62],[0,62.6]];
const ILHA_GOV=[[46,1],[60,0],[63.5,4],[60.5,9],[52,11],[47,8.5]];
const PAQUETA=[[66.6,1.4],[69.6,.9],[70.6,3.6],[68.6,5],[66.9,4.6]];
const NITEROI=[[66.5,18.2],[84,14.5],[84,62],[72,62],[66.5,55],[63.2,50.5],[64.4,46],[62.2,42.5],[64.2,38.5],[63.2,32],[65.4,26],[64.4,20.5]];
const LAGOA={x:33,z:52.5,rx:4.4,rz:3.1};
const MORROS=[[14,34,7,6],[8,45,6.5,6],[20,41,6,4],[18,28,4,5],[6,25,4.5,5],[26,47,3,3],[31,43,9.5,2.1],
  [39,28,2.4,2.4],[37,40,3.2,1.7],[41,15,1.6,1.4],[42,44,2.2,1.6],[25,8,2.6,3],[22,59,2.2,2.4],[16,57,2.6,2.6],
  [75,30,4.2,5],[77,47,4.5,5],[69,53,2.4,3]];
/* Onde cada local do Capítulo 1 fica na cidade. "barca": chega-se de barca
   pela Praça XV (ilha, Niterói, balsa ancorada). */
/* Lugares do mundo jurídico. "escritorio" e "casa" mudam de posição conforme o bairro do jogador. */
const LUGARES_RIO={
  escritorio:{x:43,z:17, alt:3,   cor:0x2e4270},
  casa:      {x:43,z:32, alt:2.1, cor:0x8a6a4a},
  forum:     {x:41,z:13, alt:1.6, cor:0xe8e2d4, tipo:'tribunal'},
  tj:        {x:40,z:20, alt:1.8, cor:0xe4dccb, tipo:'tribunal'},
  trf:       {x:44,z:12, alt:1.6, cor:0xd8d2c4, tipo:'tribunal'},
  trt:       {x:40,z:17, alt:1.5, cor:0xd2cbbb, tipo:'tribunal'},
  oab:       {x:41,z:25, alt:2.2, cor:0x3a5080},
  delegacia: {x:40,z:9,  alt:1.4, cor:0x5b6e86, tipo:'pf'},
  aeroporto: {x:55,z:4,  alt:1.1, cor:0x7c7f80, tipo:'hangar'},
  universidade:{x:28,z:50, alt:1.6, cor:0xb9ad98},
  imprensa:  {x:27,z:57, alt:2.4, cor:0x31406b},
  clube:     {x:51,z:42, alt:1.2, cor:0xf0ebe0, tipo:'solar'},
  banco:     {x:42,z:6,  alt:2.6, cor:0x2a3a5a},
  shopping:  {x:46,z:55, alt:2.2, cor:0xb9ad98},
  empresas:  {x:34,z:57, alt:3.4, cor:0x4d5f6c},
  vagas:     {x:44,z:29, alt:1.6, cor:0x8a7a6a}
};
const ehPaqueta=(x,z)=> x>=66 && x<=71 && z<=5;
const RESERVA_R_RIO=[[38.2,24,43,25.2],[36.6,15.8,38.4,21.2],[25.2,47.9,29,49.3],[47.6,5.6,56.4,7.4],[45.6,20.8,48.6,26.8]];
const RIO={id:'rio', nomeDe:'do Rio', chefe:'a Ordem', metros:150, W:84, H:72, semente:1957, mar:true,
  LUGARES:LUGARES_RIO, RAIO:{x:38,z:34,rx:22,rz:30,aviso:3},
  grupoDe:(s)=> s===1?'s1' : s<=3?'s2' : s===4?'s4' : 's6',
  grupos:()=>({s1:OPTS.lugares}),
  terra:(cx,cz)=> (dentroPoly(cx,cz,CONTINENTE)||dentroPoly(cx,cz,ILHA_GOV)||dentroPoly(cx,cz,PAQUETA)||dentroPoly(cx,cz,NITEROI))
    && !(((cx-LAGOA.x)/LAGOA.rx)**2+((cz-LAGOA.z)/LAGOA.rz)**2<1),
  alt:(cx,cz)=> dentroPoly(cx,cz,ILHA_GOV) ? 0 : elevacao(MORROS,cx,cz),
  ehOceano:(T,x,z)=> T(x,z)==='agua' && z>=44 && !(x>=29&&x<=38&&z>=48&&z<=56),
  praia:(x,z,e,dm)=> dm<=2 && e<1.2 && z>=44,
  // áreas reservadas dos pontos turísticos; os Arcos da Lapa não bloqueiam a rua, que passa por baixo deles
  reservaC:[[57.6,44.2,2.9],[53.6,43.4,2.5],[21.3,59.4,2.6],[10.8,59.6,3.4],[43.5,23.2,1.8],[42.5,19.5,1.3],[44.5,15.5,1.3],
    [47.6,13.8,1.9],[24.5,17.5,2.6],[47.2,52.4,1.8],[45,59.1,1.1],[63,42.6,1.7],[31.5,43.5,1.2]],
  reservaR:RESERVA_R_RIO, bloqueioR:RESERVA_R_RIO.slice(1),
  semRua:ehPaqueta,
  ruaExtra:(x,z,T,dm)=> (dm===3 && z>=44) || (x>=44 && x<=47 && z>=21 && z<=39 && [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>T(x+a,z+b)==='agua')),
  pistas:[[46,21,48,26]],
  cais:{x0:42,x1:47,z0:14,z1:20,cx:45,cz:17.5},
  pontes:()=>{ const p=[]; for(let x=40;x<=47;x++) p.push([x,3]); return p; },   // ponte da Ilha do Governador
  parques:[],
  rochaNua:(x,z,e)=> e>7.5 && Math.hypot(x-31,z-43)<2.6,
  corChao:0x3c4136,
  lote(x,z,rnd,G){
    const b= ehPaqueta(x,z)?'paqueta' : (z<=11&&x>=46&&x<=64)?'ilha' : x>=62?'niteroi' : (x>=36&&x<=46&&z>=10&&z<=24)?'centro'
      : (x>=34&&x<=45&&z>=4&&z<10)?'porto' : (z>=44&&G.distMar[z][x]<=7)?'orla' : z>=26?'zonaSul' : 'zonaNorte';
    const r=rnd(); let h, est;
    if(b==='centro'){ h=2+Math.floor(r*r*16); est=h>8?'vidro':(rnd()<.5?'antigo':'creme'); }
    else if(b==='porto'){ h=1+Math.floor(r*2); est=rnd()<.6?'galpao':'antigo'; }
    else if(b==='orla'){ h=5+Math.floor(r*9); est=rnd()<.6?'residencial':'creme'; }
    else if(b==='zonaSul'){ h=2+Math.floor(r*r*8); est=rnd()<.5?'residencial':(rnd()<.5?'creme':'antigo'); }
    else if(b==='niteroi'){ h=1+Math.floor(r*r*8); est=rnd()<.6?'residencial':'creme'; }
    else if(b==='ilha'){ if(rnd()<.5) return null; h=1; est='galpao'; }
    else if(b==='paqueta'){ if(rnd()<.45) return 'praca'; h=1; est='casa'; }
    else { h=1+Math.floor(r*r*3); est=h<=2?'casa':'antigo'; }
    return {h,est};
  },
  favelas:[[14,24,51,60],[34,38,37,43],[39,42,12,17],[37,41,26,30],[22,29,4,11],[40,44,42,46]],
  arvoreExtra:(x,z,t)=> x>=44&&x<=47&&z>=27&&z<=39&&t==='terra',                // Aterro do Flamengo
  luzExtra:(x,z,t,dm)=> t==='rua'&&dm===3&&z>=44&&(x+z)%2===0,                   // orla
  barcos:{n:8,x:52,z:28,dx:8,dz:12,r0:2,r1:6},
  agua:[0x2a7092,0x0c2a3c]
};

/* ---------- São Paulo (Capítulos 7 a 12) ----------
   Sem mar: o Tietê corta a cidade de leste a oeste, o Pinheiros desce da
   Guarapiranga até ele; a Paulista corre no espigão, de diagonal. */
const TIETE=x=> 8+1.2*Math.sin(x*.12);
const PINHEIROS=[[22,8],[25,18],[29,28],[31,38],[33,48],[36,58],[37,66],[34,70]];
const PAULISTA=[[44,29],[58,37]];
const LAGOS_SP=[[26,76,8,5.5],[33,72,4,3.5],[53,46,2,1.2]];   // Guarapiranga e o lago do Ibirapuera
const MORROS_SP=[[60,0,4,6],[72,2,5,7],[84,1,4,5],[46,1,2.5,4],[10,2,6.5,3.2],[18,77,2.4,4],[40,81,2.6,4],[16,66,1.6,4],[21,53,1.5,1.7],
  [47,31,.45,3],[52,33,.45,3],[56,35,.4,3],[24,44,.5,4]];
const pinheirosX=z=>{ for(let i=1;i<PINHEIROS.length;i++){ const [ax,az]=PINHEIROS[i-1],[bx,bz]=PINHEIROS[i]; if(z>=az&&z<=bz) return ax+(bx-ax)*(z-az)/((bz-az)||1); } return 34; };
const LUGARES_SP={
  pf:          {x:27,z:13, alt:2.8, cor:0x5b6e86, tipo:'pf'},              // Lapa
  apto:        {x:45,z:26, alt:3.5, cor:0x8a6a4a},                        // Consolação
  fariaLima:   {x:36,z:44, alt:6,   cor:0x4d5f6c},
  vilaOlimpia: {x:39,z:51, alt:1,   cor:0x8f8a80, tipo:'galpao'},
  jardins:     {x:43,z:37, alt:1.5, cor:0xd9d2c0},
  ibirapuera:  {x:48,z:45, alt:.6,  tipo:'monumento'},
  barraFunda:  {x:35,z:13, alt:1,   cor:0x8f8a80, tipo:'galpao'},
  congonhas:   {x:53,z:62, alt:1,   tipo:'monumento'},
  morumbi:     {x:22,z:44, alt:1.4, cor:0xd8cbb2, tipo:'solar'},          // mansão do herdeiro do café
  'morumbi@s10':{x:25,z:47, alt:1.6, cor:0xe0d8c4, tipo:'solar'},         // Fundação Luz para o Amanhã
  pinheiros:   {x:33,z:31, alt:1,   cor:0x8f8a80, tipo:'galpao'},
  ruaAugusta:  {x:47,z:27, alt:1.5, cor:0xb9ad98},
  bixiga:      {x:53,z:29, alt:1.5, cor:0xb9ad98},
  paulista:    {x:51,z:34, alt:1.4, cor:0xd8cbb2, tipo:'solar'},          // palacete histórico
  'paulista@s11':{x:54,z:36, alt:8, cor:0x4d5f6c},                        // torre da Nova Pauliceia
  higienopolis:{x:43,z:21, alt:1,   cor:0x6b3b2c, tipo:'bar'},
  cartorio:    {x:54,z:25, alt:2,   cor:0xb9ad98},
  jockeyClub:  {x:29,z:40, alt:1,   tipo:'monumento'},
  vanguard:    {x:47,z:31, alt:7,   cor:0x4d5f6c},
  deposito:    {x:42,z:56, alt:1.1, cor:0x7c7f80, tipo:'hangar'},
  represa:     {x:38,z:71, alt:.6,  cor:0xd9c3a0, tipo:'casa'},
  servidor:    {x:57,z:37, alt:6,   cor:0x3a4a56},
  corregedoria:{x:51,z:22, alt:3,   cor:0xb9ad98},
  luz:         {x:52,z:14, alt:1.5, tipo:'monumento'},
  tribunal:    {x:57,z:22, alt:2.2, cor:0xd8cfbd},
  estrada:     {x:64,z:2,  alt:.5,  tipo:'placa'},
  copan:       {x:48,z:21, alt:5,   tipo:'monumento'}
};
const SP={id:'sp', nomeDe:'de São Paulo', chefe:'Beatriz', metros:200, W:88, H:84, semente:1554, mar:false,
  LUGARES:LUGARES_SP, RAIO:{x:44,z:32,rx:26,rz:27,aviso:3},
  grupoDe:(s)=>'s'+s,
  grupos:()=>({s7:LOCS_S7, s8:LOCS_S8, s9:LOCS_S9, s10:LOCS_S10, s11:LOCS_S11, s12:LOCS_S12}),
  terra:(cx,cz)=> Math.abs(cz-TIETE(cx))>1.1 && distLinha(cx,cz,PINHEIROS)>.9 && !LAGOS_SP.some(([x,z,rx,rz])=>((cx-x)/rx)**2+((cz-z)/rz)**2<1),
  alt:(cx,cz)=>{ const e=elevacao(MORROS_SP,cx,cz); return cx>62.5&&cx<65.5&&cz<8 ? e*.12 : e; },   // o vale da Fernão Dias
  ehOceano:()=>false, praia:()=>false,
  reservaC:[[48.5,21.5,1.4],[52.5,14.5,1.6],[27.5,40.5,2.4],[53.5,62.5,1.3],[24.5,50.5,2.3],[55.6,25.6,1.5],[53.5,19.5,1]],
  reservaR:[[48.6,32.9,50.6,34.3]],
  bloqueioR:[[48.6,32.9,50.6,34.3]],
  semRua:(x,z)=> x>=49&&x<=57&&z>=41&&z<=49,
  // marginais dos rios, a Paulista no espigão e a Fernão Dias subindo para o norte
  ruaExtra:(x,z,T)=> [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>T(x+a,z+b)==='agua') || distLinha(x+.5,z+.5,PAULISTA)<.62 || (x===64&&z<8),
  pistas:[[49,59,58,60]],
  cais:null,
  pontes:()=>{ const p=[];
    for(const x of [30,40,48,56,64,72,80]) for(let z=4;z<=12;z++) p.push([x,z]);
    for(const z of [16,24,33,41,46,53,60]) for(let x=18;x<=40;x++) p.push([x,z]);
    return p; },
  parques:[[49,41,57,49]],
  rochaNua:(x,z,e)=> e>4.6 && Math.hypot(x-10,z-2)<1.6,
  corChao:0x44464a,
  lote(x,z,rnd){
    const px=pinheirosX(z), dp=distLinha(x+.5,z+.5,PAULISTA);
    const b= z<8?'norte' : dp<2.3?'paulista' : (x>=47&&x<=60&&z>=15&&z<=27)?'centro' : (x>=33&&x<=41&&z>=38&&z<=52&&x>px)?'fariaLima'
      : (x<px&&z>=30&&z<=60)?'morumbi' : (x>=38&&x<=48&&z>=32&&z<=42)?'jardins' : (x>=40&&x<=50&&z>=16&&z<=31)?'consolacao'
      : z>=52?'sul' : (x<40&&z<30)?'oeste' : 'misto';
    const r=rnd(); let h, est;
    if(b==='paulista'){ h=6+Math.floor(r*8); est=rnd()<.7?'vidro':'residencial'; }
    else if(b==='centro'){ h=2+Math.floor(r*r*12); est=h>8?'vidro':(rnd()<.5?'antigo':'creme'); }
    else if(b==='fariaLima'){ h=5+Math.floor(r*9); est='vidro'; }
    else if(b==='consolacao'){ h=3+Math.floor(r*6); est=rnd()<.6?'residencial':'creme'; }
    else if(b==='jardins'){ if(rnd()<.12) return 'praca'; h=1+Math.floor(r*r*6); est=rnd()<.5?'residencial':(rnd()<.5?'creme':'casa'); }
    else if(b==='morumbi'){ if(rnd()<.35) return 'praca'; h=1+Math.floor(r*2); est='casa'; }
    else if(b==='norte'){ h=1+Math.floor(r*r*4); est=h<=2?'casa':'residencial'; }
    else if(b==='oeste'){ h=1+Math.floor(r*3); est=rnd()<.6?'galpao':'antigo'; }
    else if(b==='sul'){ h=1+Math.floor(r*r*5); est=h<=2?'casa':'residencial'; }
    else { h=1+Math.floor(r*r*7); est=rnd()<.5?'residencial':'creme'; }
    return {h,est};
  },
  favelas:[[19,24,50,56],[12,20,61,69]],          // Paraisópolis e as encostas da Zona Sul
  arvoreExtra:()=>false,
  luzExtra:(x,z,t)=> t==='rua' && distLinha(x+.5,z+.5,PAULISTA)<.62 && (x+z)%2===0,
  barcos:{n:5,x:21,z:73.5,dx:9,dz:4,r0:.8,r1:1.6},
  agua:[0x24505c,0x0c1e24]
};
/* a cidade do capítulo: o mundo de cada uma é construído uma vez */
let CID=RIO, W=RIO.W, H=RIO.H, LUGARES=RIO.LUGARES, RAIO=RIO.RAIO;
const cidadeDe=()=>RIO;
function entrarCidade(c){ CID=c; W=c.W; H=c.H; LUGARES=c.LUGARES; RAIO=c.RAIO; }
/* O mesmo id do jogo pode ser outro lugar em outro capítulo (o leilão do
   Cap. 1 fica em Ipanema; o dos Caps. 5–6, no Leblon): "id@grupo" sobrepõe. */
const chaveEm=(id,g)=> LUGARES[id+'@'+g] ? id+'@'+g : id;
const chave=(id)=> id.indexOf('@')>=0 ? id : chaveEm(id, CID.grupoDe(S.season));
const idDoJogo=(k)=> k.split('@')[0];
function distElipse(x,z){ const dx=x-RAIO.x, dz=z-RAIO.z, r=Math.hypot(dx,dz)||1e-6;
  return 1/Math.sqrt((dx/r/RAIO.rx)**2+(dz/r/RAIO.rz)**2)-r; }
/* Local que o jogo dá como "fora do raio" mas cai dentro da elipse (ex.: os
   trilhos do Corcovado) ganha uma área restrita própria, com cerca vermelha. */
let exclusoes=[];
function distBorda(x,z){ let d=distElipse(x,z); for(const e of exclusoes) d=Math.min(d, Math.hypot(x-e.x,z-e.z)-e.r); return d; }

function construir(){
  let semente=CID.semente; const rnd=()=>{ semente=(semente*1664525+1013904223)%4294967296; return semente/4294967296; };
  const tiles=[], alt=[];
  for(let z=0;z<H;z++){ tiles.push([]); alt.push([]);
    for(let x=0;x<W;x++){ const cx=x+.5, cz=z+.5;
      const t= CID.terra(cx,cz) ? 'terra' : 'agua';
      tiles[z].push(t); alt[z].push(t==='agua' ? 0 : CID.alt(cx,cz)); } }
  const T=(x,z)=> (x<0||z<0||x>=W||z>=H) ? 'agua' : tiles[z][x];
  const distMar=[]; for(let z=0;z<H;z++) distMar.push(new Array(W).fill(99));
  { const fila=[]; for(let z=0;z<H;z++) for(let x=0;x<W;x++) if(CID.ehOceano(T,x,z)){ distMar[z][x]=0; fila.push([x,z]); }
    for(let q=0;q<fila.length;q++){ const [x,z]=fila[q]; for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,nz=z+dz;
      if(nx<0||nz<0||nx>=W||nz>=H) continue; if(distMar[nz][nx]>distMar[z][x]+1){ distMar[nz][nx]=distMar[z][x]+1; fila.push([nx,nz]); } } } }
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ if(tiles[z][x]!=='terra') continue; const e=alt[z][x];
    if(CID.praia(x,z,e,distMar[z][x])){ tiles[z][x]='praia'; alt[z][x]=0; continue; }
    if(e>.7) tiles[z][x]='morro'; }
  const terrestres=Object.keys(LUGARES).filter(id=>!LUGARES[id].naAgua);
  terrestres.forEach(id=>{ const l=LUGARES[id]; for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){ const x=l.x+dx, z=l.z+dz;
    if(tiles[z][x]==='morro') tiles[z][x]='terra'; if(tiles[z][x]!=='agua') alt[z][x]=Math.min(alt[z][x],.3); } });
  const reservado=[]; for(let z=0;z<H;z++) reservado.push(new Array(W).fill(false));
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ const cx=x+.5, cz=z+.5;
    if(CID.reservaC.some(([a,b,r])=>Math.hypot(cx-a,cz-b)<r+.65) || CID.reservaR.some(([x0,z0,x1,z1])=>cx>x0-.65&&cx<x1+.65&&cz>z0-.65&&cz<z1+.65)) reservado[z][x]=true; }
  terrestres.forEach(id=>{ const l=LUGARES[id]; reservado[l.z][l.x]=false; });
  const RES=(x,z)=> x>=0&&z>=0&&x<W&&z<H && reservado[z][x];
  // rua só não passa pelo chão que o monumento ocupa de fato (sem a folga dos prédios)
  const bloqueio=[]; for(let z=0;z<H;z++) bloqueio.push(new Array(W).fill(false));
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ const cx=x+.5, cz=z+.5;
    if(CID.reservaC.some(([a,b,r])=>Math.hypot(cx-a,cz-b)<r-.4) || CID.bloqueioR.some(([x0,z0,x1,z1])=>cx>x0+.3&&cx<x1-.3&&cz>z0+.3&&cz<z1-.3)) bloqueio[z][x]=true; }
  const BLQ=(x,z)=> x>=0&&z>=0&&x<W&&z<H && bloqueio[z][x];
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){
    if(tiles[z][x]!=='terra' || alt[z][x]>.55 || bloqueio[z][x] || CID.semRua(x,z)) continue;
    if(x%4===0 || z%4===0 || CID.ruaExtra(x,z,T,distMar[z][x])) tiles[z][x]='rua'; }
  CID.pistas.forEach(([x0,z0,x1,z1])=>{ for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) if(tiles[z][x]!=='agua') tiles[z][x]='pista'; });
  CID.parques.forEach(([x0,z0,x1,z1])=>{ for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) if(tiles[z][x]==='terra') tiles[z][x]='praca'; });
  terrestres.forEach(id=>{ const l=LUGARES[id]; tiles[l.z][l.x]='marco'; });
  // portas, cais das barcas e caminhos (túneis e pontes onde precisar)
  const porta=(x0,z0)=>{ for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1]]){ const x=x0+dx,z=z0+dz; if(tiles[z][x]==='rua') return [x,z]; }
    for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1]]){ const x=x0+dx,z=z0+dz; if(tiles[z][x]==='terra' && !bloqueio[z][x]){ tiles[z][x]='rua'; return [x,z]; } } return [x0,z0+1]; };
  const portas={}; terrestres.filter(k=>!LUGARES[k].barca).forEach(k=>{ portas[k]=porta(LUGARES[k].x,LUGARES[k].z); });
  // cais das barcas: rua da orla com água ao lado, perto da Praça XV
  let cais=null, doca=null;
  if(CID.cais){ const c=CID.cais; let md=1e9;
    for(let z=c.z0;z<=c.z1;z++) for(let x=c.x0;x<=c.x1;x++){ if(T(x,z)==='agua') continue; const viz=[[1,0],[0,1],[0,-1]].map(([a,b])=>[x+a,z+b]).find(([a,b])=>T(a,b)==='agua');
      if(!viz || BLQ(x,z)) continue; const d=Math.hypot(x-c.cx,z-c.cz); if(d<md){ md=d; cais=[x,z]; doca=viz; } }
    tiles[cais[1]][cais[0]]='rua'; }
  CID.pontes().forEach(([x,z])=>{ if(tiles[z][x]==='agua') tiles[z][x]='ponte'; });
  const custo=(x,z)=>{ const t=T(x,z); if(BLQ(x,z) && t!=='rua' && t!=='marco') return 1e9;
    return t==='rua'||t==='tunel'||t==='ponte'?1 : t==='terra'?2.2 : t==='praia'?7 : t==='morro'?9 : t==='agua'?22 : 1e9; };
  function cavar(a,b){
    const N=W*H, d=new Float64Array(N).fill(1e18), prev=new Int32Array(N).fill(-1), feito=new Uint8Array(N), heap=[];
    const push=(k,v)=>{ heap.push([v,k]); let i=heap.length-1; while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0]) break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
    const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=2*i+1,r=l+1; let m=i;
      if(l<heap.length&&heap[l][0]<heap[m][0]) m=l; if(r<heap.length&&heap[r][0]<heap[m][0]) m=r; if(m===i) break; [heap[m],heap[i]]=[heap[i],heap[m]]; i=m; } } return top; };
    const ka=a[1]*W+a[0], kb=b[1]*W+b[0]; d[ka]=0; push(ka,0);
    while(heap.length){ const [v,k]=pop(); if(feito[k]) continue; feito[k]=1; if(k===kb) break; const x=k%W, z=(k/W)|0;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,nz=z+dz; if(nx<0||nz<0||nx>=W||nz>=H) continue;
        const nk=nz*W+nx, c=custo(nx,nz); if(c>=1e9) continue; if(v+c<d[nk]){ d[nk]=v+c; prev[nk]=k; push(nk,v+c); } } }
    let k=kb; while(k!==-1){ const x=k%W, z=(k/W)|0, t=tiles[z][x];
      if(t==='terra'||t==='praia') tiles[z][x]='rua'; else if(t==='morro') tiles[z][x]='tunel'; else if(t==='agua') tiles[z][x]='ponte'; k=prev[k]; }
  }
  // liga os destinos de cada capítulo entre si e ao cais: a rua só é aberta onde encurta muito o caminho
  const GRUPOS=CID.grupos();
  Object.keys(GRUPOS).forEach(g=>{
    const nos=Object.keys(GRUPOS[g]).map(id=>chaveEm(id,g)).filter(k=>portas[k]).map(k=>portas[k]).concat(cais?[cais]:[]);
    for(let a=0;a<nos.length;a++) for(let b=a+1;b<nos.length;b++) cavar(nos[a],nos[b]);
  });
  const anda=(x,z)=>{ const t=T(x,z); return t==='rua'||t==='tunel'||t==='ponte'; };
  // docas das barcas: água ao lado de cada destino de barca
  const docas={};
  Object.keys(LUGARES).filter(id=>LUGARES[id].barca).forEach(id=>{ const l=LUGARES[id]; let best=null, bd=1e9;
    for(let z=l.z-4;z<=l.z+4;z++) for(let x=l.x-4;x<=l.x+4;x++){ if(T(x,z)!=='agua' || (x===l.x&&z===l.z)) continue; const d=Math.hypot(x-l.x,z-l.z); if(d<bd){ bd=d; best=[x,z]; } }
    docas[id]=best; });
  return {tiles,alt,T,distMar,reservado,RES,anda,portas,cais,doca,docas,rnd};
}

/* --------------------------- CENA 3D --------------------------- */
/* Põe no grupo do mapa o boneco do Vincent (o das cenas, na escala da cidade) e
   a silhueta dele, desenhada só onde um prédio alto o encobre (o Centro e a Paulista o esconderiam). */
function vestirVincent(grupo){
  while(grupo.children.length) grupo.remove(grupo.children[0]);
  const p=window.figurino.pessoa('vice'); p.scale.setScalar(1.15); grupo.add(p);
  // silhueta: formas convexas um pouco maiores que o corpo, desenhadas só onde algo as encobre
  const mrx=new THREE.MeshBasicMaterial({color:0xd8b45a,transparent:true,opacity:.55,depthFunc:THREE.GreaterDepth,depthWrite:false,toneMapped:false});
  const rx=new THREE.Group(); const corpo=new THREE.Mesh(new THREE.CylinderGeometry(.3,.24,1.55,12),mrx); corpo.position.y=.8; const cabeca=new THREE.Mesh(new THREE.SphereGeometry(.22,12,10),mrx); cabeca.position.y=1.78;
  rx.add(corpo,cabeca); rx.scale.setScalar(1.15); rx.children.forEach(o=>o.renderOrder=9); grupo.add(rx);
  // o veículo da garagem: estacionado ao lado dele, e levando-o nas viagens por terra
  const cena=grupo.parent; if(grupo.userData.veic && cena) cena.remove(grupo.userData.veic);
  const vid=window.figurino.atual().veiculo, veic= vid && vid!=='nenhum' ? window.figurino.veiculo(vid) : null;
  if(veic){ veic.scale.setScalar(veic.userData.tipo==='moto'?1.15:.7); if(cena) cena.add(veic); }
  grupo.userData.veic=veic;
  const u=p.userData; return {pE:u.pE, pD:u.pD, bE:u.bE, bD:u.bD, quadril:u.quadril, boneco:p, veic, tornoz:u.led, faixa:u.tornoz, ver:window.figurino.versao};
}
function montarMundo(){
  const G=construir();
  const {tiles,alt,T,distMar,reservado,RES,rnd}=G;
  const cont=document.createElement('div'); cont.className='m3d';
  cont.innerHTML=`<canvas class="m3d-tela" aria-label="Mapa 3D ${CID.nomeDe}: toque num medalhão para ir até o local; arraste para mover, pinça ou roda para aproximar"></canvas>
    <div class="m3d-tz" hidden><b><span class="m3d-led"></span>Tornozeleira</b><span class="m3d-tz-est">Dentro do raio</span>
      <span class="m3d-barra"><i class="m3d-bd"></i></span><span class="m3d-tz-dist"></span></div>
    <div class="m3d-ctl"><button type="button" class="m3d-b" data-a="esq" title="Girar a câmera">⟲</button><button type="button" class="m3d-b" data-a="dir" title="Girar a câmera">⟳</button>
      <button type="button" class="m3d-b" data-a="nomes" aria-pressed="true">Pontos</button></div>
    <div class="m3d-vinheta"></div>
    <div class="m3d-conf" hidden></div>`;
  const canvas=cont.querySelector('canvas');
  const renderer=new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  const leve = graficoLeve();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, leve?1.5:2));
  renderer.outputEncoding=THREE.sRGBEncoding; renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=!leve; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const ceuNoite=new THREE.Color(0x0a1820), ceuDia=new THREE.Color(0x9cc3d6), ceuTarde=new THREE.Color(0xd9a77a);
  scene.background=ceuNoite.clone(); scene.fog=new THREE.Fog(0x0a1820,128,210);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,400);
  const hemi=new THREE.HemisphereLight(0x8fb0d0,0x1a1410,.35); scene.add(hemi);
  const sol=new THREE.DirectionalLight(0xbfd2ff,.55); sol.castShadow=true; sol.shadow.mapSize.set(2048,2048);
  Object.assign(sol.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:220}); sol.shadow.bias=-.0008; scene.add(sol); scene.add(sol.target);
  const m4=new THREE.Matrix4(), cor=new THREE.Color();
  const mat=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.7},o||{}));
  function texCanvas(w,h,fn){ const c=document.createElement('canvas'); c.width=w; c.height=h; fn(c.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t; }
  /* Fachadas: cada repetição da textura é 1 unidade de largura e 2 andares de altura, com
     4 janelas por andar; a textura de luz (emissiva) acende só os vidros, à noite. */
  function fachada(e){
    const W=128, A=64, acesas=[];
    for(let a=0;a<2;a++) for(let c=0;c<4;c++){ const q=rnd(); acesas.push(rnd()<e.acesas ? (q<.6?'#ffcf7a':q<.85?'#ffe9b8':'#9fd0ff') : null); }
    const janelas=(g,luz)=>{ for(let a=0;a<2;a++){ const y0=a*A;
      if(e.tipo==='vidro'){ for(let c=0;c<4;c++){ const x0=c*32, cor=acesas[a*4+c];
          if(luz){ if(cor){ g.fillStyle=cor; g.fillRect(x0+2,y0+6,28,50); } continue; }
          const gr=g.createLinearGradient(x0,y0,x0+32,y0+A); gr.addColorStop(0,e.vidro); gr.addColorStop(.55,'#2a3e4e'); gr.addColorStop(1,e.vidro); g.fillStyle=gr; g.fillRect(x0+2,y0+6,28,50);
          g.fillStyle='rgba(255,255,255,.18)'; g.fillRect(x0+4,y0+8,3,46); }
        if(!luz){ g.fillStyle=e.parede; g.fillRect(0,y0+56,W,8); for(let c=0;c<=4;c++) g.fillRect(c*32-1,y0,3,A); }
        continue; }
      for(let c=0;c<4;c++){ const x0=c*32+7, wj=18, hj=e.tipo==='antigo'?32:e.tipo==='casa'?24:28, yj=y0+(A-hj)/2-3, cor=acesas[a*4+c];
        if(luz){ if(cor){ g.fillStyle=cor; g.fillRect(x0+2,yj+2,wj-4,hj-4); } continue; }
        g.fillStyle=e.moldura||'#eeeae0'; g.fillRect(x0-2,yj-2,wj+4,hj+4);
        if(e.tipo==='antigo'){ g.beginPath(); g.arc(x0+wj/2,yj,wj/2+2,Math.PI,0); g.fill(); g.fillRect(x0-4,yj+hj+1,wj+8,3); }
        g.fillStyle=e.vidro; g.fillRect(x0,yj,wj,hj); if(e.tipo==='antigo'){ g.beginPath(); g.arc(x0+wj/2,yj,wj/2,Math.PI,0); g.fill(); }
        g.fillStyle='rgba(255,255,255,.14)'; g.fillRect(x0+2,yj+2,3,hj-4); g.fillStyle=e.moldura||'#eeeae0'; g.fillRect(x0+wj/2-1,yj,2,hj);
        if(e.venezianas){ g.fillStyle=e.venezianas; g.fillRect(x0-8,yj,6,hj); g.fillRect(x0+wj+2,yj,6,hj); g.fillStyle='rgba(0,0,0,.25)'; for(let k=yj+3;k<yj+hj;k+=4){ g.fillRect(x0-8,k,6,1); g.fillRect(x0+wj+2,k,6,1); } } }
      if(!luz && e.varanda){ g.fillStyle=e.laje||'#e8e4dc'; g.fillRect(0,y0+A-9,W,5); g.fillStyle='rgba(0,0,0,.28)'; g.fillRect(0,y0+A-4,W,2);
        g.fillStyle='rgba(40,48,56,.75)'; g.fillRect(0,y0+A-24,W,2); for(let x=2;x<W;x+=6) g.fillRect(x,y0+A-24,1.5,15); }
      if(!luz && (e.tipo==='antigo'||e.frisos)){ g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(0,y0+A-3,W,3); g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(0,y0+A-6,W,2); } } };
    const base=texCanvas(W,W,(g)=>{ g.fillStyle=e.parede; g.fillRect(0,0,W,W); for(let k=0;k<500;k++){ g.fillStyle=`rgba(${rnd()<.5?0:255},${rnd()<.5?0:255},${rnd()<.5?0:255},.035)`; g.fillRect(rnd()*W,rnd()*W,2,2); }
      if(e.tipo==='galpao'){ g.fillStyle='rgba(0,0,0,.12)'; for(let x=0;x<W;x+=6) g.fillRect(x,0,2,W); g.fillStyle=e.vidro; for(let c=0;c<4;c++) g.fillRect(c*32+4,6,24,10); }
      else janelas(g,false); });
    const luz=texCanvas(W,W,(g)=>{ g.fillStyle='#000'; g.fillRect(0,0,W,W); if(e.tipo!=='galpao') janelas(g,true); });
    base.wrapS=base.wrapT=luz.wrapS=luz.wrapT=THREE.RepeatWrapping; return {base,luz};
  }
  const ESTILOS={ residencial:fachada({parede:'#e4ddcc',vidro:'#26313a',acesas:.36,moldura:'#f2efe6'}), creme:fachada({parede:'#d9b99a',vidro:'#26313a',acesas:.38,venezianas:'#3a6a5a',frisos:true}),
    vidro:fachada({tipo:'vidro',parede:'#3a4650',vidro:'#7f9eb2',acesas:.3}), antigo:fachada({tipo:'antigo',parede:'#b9ad98',vidro:'#1d262d',acesas:.3,moldura:'#ddd4c0'}),
    casa:fachada({tipo:'casa',parede:'#d8cbb2',vidro:'#2a2a2a',acesas:.25,venezianas:'#2c5a8a'}), galpao:fachada({tipo:'galpao',parede:'#8f8a80',vidro:'#3a3a3a',acesas:.1}),
    varanda:fachada({parede:'#ece6d8',vidro:'#2a3640',acesas:.45,varanda:true,laje:'#f4f0e8',moldura:'#f8f6f0'}) };
  const texBrilho=texCanvas(64,64,(g)=>{ const r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.25,'rgba(255,240,200,.55)'); r.addColorStop(1,'rgba(255,220,160,0)'); g.fillStyle=r; g.fillRect(0,0,64,64); });
  function texMedalhao(glifo,fora){ return texCanvas(128,128,(g)=>{ g.beginPath(); g.arc(64,64,58,0,Math.PI*2); g.fillStyle='#14100c'; g.fill();
    g.lineWidth=7; g.strokeStyle=fora?'#be4a33':'#d8b45a'; g.stroke(); g.lineWidth=2; g.strokeStyle='#8a6f3a'; g.beginPath(); g.arc(64,64,47,0,Math.PI*2); g.stroke();
    g.fillStyle=fora?'#e8a088':'#e9c873'; g.font=(glifo.length>1?'600 44px':'600 60px')+' Georgia, serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(glifo,64,68); }); }
  function texRotulo(txt){ return texCanvas(512,80,(g,w,h)=>{ let tam=38; g.font=`italic 600 ${tam}px Georgia, serif`;
    while(g.measureText(txt).width>w-30 && tam>18){ tam-=2; g.font=`italic 600 ${tam}px Georgia, serif`; }
    g.textAlign='center'; g.textBaseline='middle'; g.lineWidth=7; g.strokeStyle='rgba(10,14,17,.85)'; g.strokeText(txt,w/2,h/2); g.fillStyle='#efe2c2'; g.fillText(txt,w/2,h/2); }); }
  const brilhos=[], fixos=[];
  const brilhoFixo=(x,y,z,e,c,op)=>{ fixos.push([x,y,z,e,c,op]); };
  const addBrilho=(x,y,z,e,c,op)=>{ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texBrilho,color:c,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:op}));
    s.position.set(x,y,z); s.scale.set(e,e,1); s.userData.op=op; scene.add(s); brilhos.push(s); return s; };

  /* terreno */
  const topo=(x,z)=>{ const t=T(x,z); if(t==='agua'||t==='ponte') return 0; if(t==='rua'||t==='pista') return .18; if(t==='praia') return .14;
    if(t==='morro'||t==='tunel'||t==='favela') return .24+Math.round(alt[z][x]*.6/.3)*.3; return .24+Math.min(.3,alt[z][x]*.4); };
  const geoCol=new THREE.BoxGeometry(1,1,1); geoCol.translate(0,-.5,0);
  let n=0; for(let z=0;z<H;z++) for(let x=0;x<W;x++){ const t=tiles[z][x]; if(t!=='agua'&&t!=='ponte') n++; }
  const terreno=new THREE.InstancedMesh(geoCol,new THREE.MeshStandardMaterial({roughness:.92,flatShading:true}),n); terreno.receiveShadow=true; terreno.castShadow=true;
  let i=0;
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ const t=tiles[z][x]; if(t==='agua'||t==='ponte') continue;
    const y=topo(x,z); m4.makeScale(1,Math.max(.05,y+.6),1); m4.setPosition(x+.5,y,z+.5); terreno.setMatrixAt(i,m4); const e=alt[z][x];
    if(t==='rua') cor.setHex(0x22262a); else if(t==='pista') cor.setHex(0x2e3236); else if(t==='praia') cor.setHex(0xd8c497).offsetHSL(0,0,(rnd()-.5)*.04);
    else if(t==='morro'||t==='tunel'){ if(CID.rochaNua(x,z,e)) cor.setHex(0x5a524a); else cor.setHSL(.27+rnd()*.05,.36,.16+Math.min(.1,e*.012)+rnd()*.03); }
    else if(t==='praca') cor.setHSL(.27+rnd()*.04,.32,.2);
    else cor.setHex(CID.corChao).offsetHSL(0,0,(rnd()-.5)*.04);
    terreno.setColorAt(i,cor); i++; }
  scene.add(terreno);
  { const fx=[]; for(let z=0;z<H;z++) for(let x=0;x<W;x++){ if(tiles[z][x]!=='rua') continue; const h=G.anda(x-1,z)||G.anda(x+1,z), v=G.anda(x,z-1)||G.anda(x,z+1); if(h&&v) continue; fx.push([x,z,h]); }
    const g=new THREE.PlaneGeometry(.06,.42); g.rotateX(-Math.PI/2);
    const im=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0xc9a94e,transparent:true,opacity:.55}),fx.length);
    fx.forEach(([x,z,h],k)=>{ m4.makeRotationY(h?Math.PI/2:0); m4.setPosition(x+.5,.185,z+.5); im.setMatrixAt(k,m4); }); scene.add(im); }
  const matPonte=mat(0x8d8a84), pontesTile=[];
  for(let z=0;z<H;z++) for(let x=0;x<W;x++) if(tiles[z][x]==='ponte'){ const p=new THREE.Mesh(new THREE.BoxGeometry(1,.16,1),matPonte); p.position.set(x+.5,.3,z+.5); pontesTile.push(p);
    const pil=new THREE.Mesh(new THREE.BoxGeometry(.2,.5,.2),matPonte); pil.position.set(x+.5,0,z+.5); pontesTile.push(pil); }
  /* água */
  const geoAgua= CID.mar ? new THREE.PlaneGeometry(W+90,H+70,120,100) : new THREE.PlaneGeometry(W,H,W,H); geoAgua.rotateX(-Math.PI/2);
  const matAgua=new THREE.MeshStandardMaterial({color:0x123a52,roughness:.6,metalness:.1,transparent:true,opacity:.97});
  const agua=new THREE.Mesh(geoAgua,matAgua); agua.position.set(W/2,.04,H/2); agua.receiveShadow=true; scene.add(agua);
  const aguaPos=geoAgua.attributes.position, aguaBase=Float32Array.from(aguaPos.array);
  const fundo=new THREE.Mesh(new THREE.PlaneGeometry(W+90,H+70).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:CID.mar?0x061520:0x14130f})); fundo.position.set(W/2,-.6,H/2); scene.add(fundo);
  const ehOceano=(x,z)=>CID.ehOceano(T,x,z);
  const esp=[]; for(let z=0;z<H;z++) for(let x=0;x<W;x++) if(tiles[z][x]==='praia' && [[0,1],[1,0],[-1,0],[0,-1]].some(([a,b])=>ehOceano(x+a,z+b))) esp.push([x,z]);
  const geoEsp=new THREE.PlaneGeometry(1.1,.35); geoEsp.rotateX(-Math.PI/2);
  const espuma=new THREE.InstancedMesh(geoEsp,new THREE.MeshBasicMaterial({color:0xeaf4f7,transparent:true,opacity:.5,depthWrite:false}),esp.length);
  esp.forEach(([x,z],k)=>{ const dz=ehOceano(x,z+1)?.6:ehOceano(x,z-1)?-.6:0, dx=ehOceano(x+1,z)?.6:ehOceano(x-1,z)?-.6:0; m4.makeRotationY(dx?Math.PI/2:0); m4.setPosition(x+.5+dx,.1,z+.5+dz); espuma.setMatrixAt(k,m4); });
  scene.add(espuma);
  /* a casa de telhado roxo em Paquetá: um terreno de terra da ilha, perto do ponto da barca */
  CID.casaRoxa=null;
  if(CID.id==='rio' && LUGARES.paqueta){ const lp=LUGARES.paqueta; let melhor=null;
    // de frente para o mar (nada na frente da porta), o mais perto possível do cais
    for(let z=0;z<=6;z++) for(let x=64;x<=72;x++){ if(!tiles[z]||tiles[z][x]!=='terra'||reservado[z][x]) continue;
      const d=Math.hypot(x-lp.x,z-lp.z); if(d<1.6) continue; const frente=tiles[z+1]&&tiles[z+1][x];
      const nota=d - (frente==='agua'||frente==='praia'?10:0) - z*.5; if(!melhor||nota<melhor.n) melhor={x,z,d,n:nota}; }
    CID.casaRoxa=melhor; }
  /* prédios por bairro */
  const lotes=[];
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ if(tiles[z][x]!=='terra'||reservado[z][x]) continue;
    const l=CID.lote(x,z,rnd,G); if(!l) continue; if(l==='praca'){ tiles[z][x]='praca'; continue; } const h=l.h, est= l.est==='residencial' && h>=4 && (x*3+z*7)%3!==0 ? 'varanda' : l.est;
    if(rnd()<.08){ tiles[z][x]='praca'; continue; }
    if(CID.casaRoxa && x===CID.casaRoxa.x && z===CID.casaRoxa.z){ rnd(); rnd(); tiles[z][x]='praca'; continue; }   // o terreno fica livre para a casa (os dois rnd mantêm o resto da cidade igual)
    lotes.push({x,z,h,est,y:topo(x,z),w:.72+rnd()*.18,d:.72+rnd()*.18}); }
  const matsPredio={}; Object.keys(ESTILOS).forEach(k=>{ matsPredio[k]=new THREE.MeshStandardMaterial({map:ESTILOS[k].base,emissiveMap:ESTILOS[k].luz,emissive:0xffffff,emissiveIntensity:1.15,roughness:.82,metalness:k==='vidro'?.35:.05}); });
  const cacheGeo={};
  const geoPredio=h=>{ if(cacheGeo[h]) return cacheGeo[h]; const hh=h*.5, g=new THREE.BoxGeometry(1,hh,1); g.translate(0,hh/2,0); const uv=g.attributes.uv;
    for(let f=0;f<6;f++) for(let k=0;k<4;k++){ const idx=f*4+k; if(f===2||f===3){ uv.setXY(idx,.01,.995); continue; } uv.setY(idx,uv.getY(idx)*hh); } return cacheGeo[h]=g; };   // 1 repetição = 2 andares
  { const grupos={}; lotes.forEach(l=>{ const k=l.h+'|'+l.est; (grupos[k]=grupos[k]||[]).push(l); });
    Object.keys(grupos).forEach(k=>{ const lista=grupos[k], [h,est]=k.split('|'); const im=new THREE.InstancedMesh(geoPredio(+h),matsPredio[est],lista.length);
      lista.forEach((l,j)=>{ m4.makeScale(l.w,1,l.d); m4.setPosition(l.x+.5,l.y,l.z+.5); im.setMatrixAt(j,m4); cor.setHSL(.08+rnd()*.05,.1+rnd()*.15,.78+rnd()*.22); im.setColorAt(j,cor); });
      im.castShadow=true; im.receiveShadow=true; scene.add(im); }); }
  /* detalhes dos prédios: cornija, loja no térreo, caixa d'água, ar-condicionado, antena,
     torre recuada no alto dos arranha-céus e telhado de telha nas casas */
  { const det={cornija:[],loja:[],caixa:[],ar:[],antena:[],telhado:[],torre:{}};
    lotes.forEach(l=>{ const k=l.x*7+l.z*13;
      if(l.est==='casa'){ det.telhado.push(l); return; } if(l.est==='galpao') return;
      if(l.h>=3) det.cornija.push(l);
      if(l.h>=3 && k%3!==0) det.loja.push(l);
      if(l.h>=3 && l.est!=='vidro' && k%2===0) det.caixa.push(l);
      if(l.h>=4 && k%5===1) det.ar.push(l);
      if(l.est==='vidro' && l.h>=9) det.antena.push(l);
      if(l.h>=12) (det.torre[l.est]=det.torre[l.est]||[]).push(l); });
    const inst=(geo,material,lista,f,cores)=>{ if(!lista.length) return null; const im=new THREE.InstancedMesh(geo,material,lista.length);
      lista.forEach((l,j)=>{ f(l); im.setMatrixAt(j,m4); if(cores){ cores(l); im.setColorAt(j,cor); } }); im.castShadow=true; im.receiveShadow=true; scene.add(im); return im; };
    const topoDe=l=>l.y+l.h*.5;
    inst(new THREE.BoxGeometry(1,.07,1),mat(0xe2dccf),det.cornija,l=>{ m4.makeScale(l.w+.06,1,l.d+.06); m4.setPosition(l.x+.5,topoDe(l)+.035,l.z+.5); });
    const vitrine=texCanvas(128,32,(g)=>{ g.fillStyle='#1a1e22'; g.fillRect(0,0,128,32); const cs=['#b8322a','#2a6a4a','#c9a24a','#2c4f86'];
      for(let c=0;c<4;c++){ g.fillStyle=cs[(c*3)%4]; g.fillRect(c*32+1,0,30,7); g.fillStyle='rgba(255,255,255,.35)'; for(let x=c*32+1;x<c*32+31;x+=6) g.fillRect(x,0,3,7); g.fillStyle='#3a4a52'; g.fillRect(c*32+4,10,24,20); } });
    const vitrineLuz=texCanvas(128,32,(g)=>{ g.fillStyle='#000'; g.fillRect(0,0,128,32); for(let c=0;c<4;c++){ g.fillStyle=c%3?'#ffd08a':'#fff0d0'; g.fillRect(c*32+4,10,24,20); } });
    vitrine.wrapS=vitrineLuz.wrapS=THREE.RepeatWrapping;
    const matLoja=new THREE.MeshStandardMaterial({map:vitrine,emissiveMap:vitrineLuz,emissive:0xffffff,emissiveIntensity:1,roughness:.4}); matsPredio._loja=matLoja;
    const gLoja=new THREE.BoxGeometry(1,.3,1); gLoja.translate(0,.15,0);
    inst(gLoja,matLoja,det.loja,l=>{ m4.makeScale(l.w+.03,1,l.d+.03); m4.setPosition(l.x+.5,l.y,l.z+.5); });
    const gCaixa=new THREE.CylinderGeometry(.11,.12,.18,12); gCaixa.translate(0,.09,0);
    inst(gCaixa,mat(0x2f6aa8,{roughness:.5}),det.caixa,l=>{ m4.makeScale(1,1,1); m4.setPosition(l.x+.5+l.w*.22,topoDe(l)+.07,l.z+.5-l.d*.2); });
    const gAr=new THREE.BoxGeometry(.14,.08,.1); gAr.translate(0,.04,0);
    inst(gAr,mat(0xa8a8a4),det.ar,l=>{ m4.makeScale(1,1,1); m4.setPosition(l.x+.5-l.w*.25,topoDe(l)+.07,l.z+.5+l.d*.2); });
    const gAnt=new THREE.CylinderGeometry(.012,.02,.8,5); gAnt.translate(0,.4,0);
    inst(gAnt,mat(0x8a8a8a,{metalness:.6}),det.antena,l=>{ m4.makeScale(1,1,1); const ty=topoDe(l)+(l.h>=12?2:0); m4.setPosition(l.x+.5,ty,l.z+.5); brilhoFixo(l.x+.5,ty+.82,l.z+.5,.9,0xff3020,.8); });
    Object.keys(det.torre).forEach(est=>inst(geoPredio(4),matsPredio[est],det.torre[est],l=>{ m4.makeScale(l.w*.64,1,l.d*.64); m4.setPosition(l.x+.5,topoDe(l),l.z+.5); },()=>cor.setHSL(.08+rnd()*.05,.1+rnd()*.15,.78+rnd()*.22)));
    const gTel=new THREE.ConeGeometry(.71,.34,4); gTel.rotateY(Math.PI/4); gTel.translate(0,.17,0);
    inst(gTel,mat(0xffffff,{roughness:.85,flatShading:true}),det.telhado,l=>{ m4.makeScale(l.w*1.06,1,l.d*1.06); m4.setPosition(l.x+.5,topoDe(l),l.z+.5); },()=>cor.setHSL(.03+rnd()*.03,.5+rnd()*.15,.32+rnd()*.1)); }
  /* favelas */
  const ZF=CID.favelas;
  const barracos=[];
  for(let z=0;z<H;z++) for(let x=0;x<W;x++){ if(tiles[z][x]!=='morro'||reservado[z][x]) continue; const e=alt[z][x]; if(e<.7||e>3.4) continue;
    if(!ZF.some(([x0,x1,z0,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1)) continue; tiles[z][x]='favela'; const y=topo(x,z);
    for(let k=0;k<3;k++) barracos.push([x+.18+rnd()*.64,y,z+.18+rnd()*.64,.3+rnd()*.2,.28+rnd()*.35]); }
  const CF=[0xd9c3a0,0xb5523a,0x4f86a6,0xe0b83c,0x7aa35a,0xd27a5a,0xece6da,0x9a7aa8,0xc98a3a];
  const matBarraco=new THREE.MeshStandardMaterial({map:ESTILOS.casa.base,emissiveMap:ESTILOS.casa.luz,emissive:0xffffff,emissiveIntensity:1.2,roughness:.85});
  { const im=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1).translate(0,.5,0),matBarraco,barracos.length);
    barracos.forEach((b,k)=>{ m4.makeScale(b[3],b[4],b[3]); m4.setPosition(b[0],b[1],b[2]); im.setMatrixAt(k,m4); cor.setHex(CF[Math.floor(rnd()*CF.length)]); im.setColorAt(k,cor); });
    im.castShadow=true; scene.add(im); }
  /* árvores */
  { const pa=[];
    for(let z=0;z<H;z++) for(let x=0;x<W;x++){ if(reservado[z][x]) continue; const t=tiles[z][x], e=alt[z][x], y=topo(x,z);
      if(t==='morro' && !CID.rochaNua(x,z,e) && rnd()<.85) pa.push([x+.5+(rnd()-.5)*.5,y,z+.5+(rnd()-.5)*.5,.8+rnd()*.6]);
      if(t==='praca') for(let k=0;k<2;k++) pa.push([x+.25+rnd()*.5,y,z+.25+rnd()*.5,.6+rnd()*.4]);
      if(CID.arvoreExtra(x,z,t)) pa.push([x+.5,y,z+.5,.8]); }
    const im=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.34,0),new THREE.MeshStandardMaterial({color:0x2e5a2c,roughness:.9,flatShading:true}),pa.length);
    pa.forEach((p,k)=>{ m4.makeScale(p[3],p[3]*1.15,p[3]); m4.setPosition(p[0],p[1]+.3*p[3],p[2]); im.setMatrixAt(k,m4); cor.setHSL(.27+rnd()*.06,.35+rnd()*.15,.2+rnd()*.1); im.setColorAt(k,cor); });
    im.castShadow=true; scene.add(im); }
  /* brilhos de rua, orla e favela */
  for(let z=0;z<H;z+=4) for(let x=0;x<W;x+=4) if(tiles[z][x]==='rua') brilhoFixo(x+.15,.9,z+.15,1.5,0xffc27a,.5);
  for(let z=0;z<H;z++) for(let x=0;x<W;x++) if(CID.luzExtra(x,z,tiles[z][x],distMar[z][x])) brilhoFixo(x+.5,.9,z+.5,1.2,0xfff0c8,.5);
  barracos.forEach((b,k)=>{ if(k%5===0) brilhoFixo(b[0],b[1]+b[4]+.1,b[2],.9,0xffc070,.45); });

  /* rótulos e monumentos */
  const rotulos=[];
  const rotulo=(txt,x,y,z)=>{ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texRotulo(txt),transparent:true,depthTest:false,toneMapped:false,opacity:.92}));
    s.scale.set(5.4,.86,1); s.userData.base=[5.4,.86]; s.position.set(x,y,z); s.renderOrder=8; scene.add(s); rotulos.push(s); return s; };
  const estaticos=new THREE.Group();
  const add=(m,x,y,z,vivo)=>{ m.position.set(x,y,z); m.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); (vivo?scene:estaticos).add(m); return m; };
  const yTopo=(x,z)=>topo(Math.floor(x),Math.floor(z));
  const rocha=(r,h,seg,lisa)=>{ const pts=[]; for(let k=0;k<=14;k++){ const t=k/14; pts.push(new THREE.Vector2(Math.max(.001,r*Math.pow(1-t,lisa)*(1+.06*Math.sin(t*11))),t*h)); }
    const g=new THREE.LatheGeometry(pts,seg); const p=g.attributes.position; for(let k=0;k<p.count;k++){ p.setX(k,p.getX(k)*(1+(rnd()-.5)*.1)); p.setZ(k,p.getZ(k)*(1+(rnd()-.5)*.1)); } g.computeVertexNormals(); return g; };
  const matRocha=mat(0x6e645a,{flatShading:true,roughness:.85}), matMata=mat(0x2c4a2a,{flatShading:true,roughness:.95});
  /* pontos do Rio */
  function pontosRio(){
    // Pão de Açúcar e Morro da Urca: domos de granito com escorridos escuros na rocha, mata nas encostas e no topo,
    // estações do bondinho na Praia Vermelha, na Urca e no cume, e os dois bondinhos de vidro no cabo
    const texGranito=texCanvas(256,256,(q,w,h)=>{ q.fillStyle='#8a8278'; q.fillRect(0,0,w,h); for(let k=0;k<900;k++){ q.fillStyle=`rgba(${rnd()<.5?40:200},${rnd()<.5?36:190},${rnd()<.5?30:176},.08)`; q.fillRect(rnd()*w,rnd()*h,3,3); }
      for(let k=0;k<70;k++){ const x=rnd()*w, l=40+rnd()*200; const gr=q.createLinearGradient(0,h-l,0,h); gr.addColorStop(0,'rgba(40,36,30,0)'); gr.addColorStop(.4,'rgba(40,36,30,.35)'); gr.addColorStop(1,'rgba(40,36,30,.1)'); q.fillStyle=gr; q.fillRect(x,h-l-rnd()*60,2+rnd()*5,l); } });
    const matGranito=new THREE.MeshStandardMaterial({map:texGranito,roughness:.85,flatShading:false});
    const domo=(perfil,altura,inclina,seg)=>{ const pts=perfil.map(([r,y])=>new THREE.Vector2(Math.max(.001,r),y*altura)); const g=new THREE.LatheGeometry(pts,seg||28), p=g.attributes.position;
      for(let k=0;k<p.count;k++){ const y=p.getY(k); p.setX(k,p.getX(k)*(1+(rnd()-.5)*.05)+y*inclina); p.setZ(k,p.getZ(k)*(1+(rnd()-.5)*.05)); } g.computeVertexNormals(); return g; };
    const pao=new THREE.Mesh(domo([[2.5,0],[2.42,.12],[2.26,.3],[2.02,.52],[1.72,.7],[1.36,.83],[.95,.92],[.5,.98],[.001,1]],7.4,.07),matGranito); add(pao,57.6,0,44.2,true);
    const urca=new THREE.Mesh(domo([[2.3,0],[2.22,.2],[2.04,.45],[1.78,.68],[1.3,.88],[.7,.97],[.001,1]],3.5,.03),matGranito); add(urca,53.6,0,43.4,true);
    add(new THREE.Mesh(domo([[2.6,0],[2.52,.07],[2.4,.15],[.001,.15]],7.4,.07,20),matMata),57.6,0,44.2).scale.set(1.03,1,1.03);   // mata só no pé
    add(new THREE.Mesh(domo([[.7,.0],[.45,.05],[.001,.09]],1,0,14),matMata),57.6+7.4*.07*.95,7.1,44.2).scale.set(1.1,1.6,1.1);
    add(new THREE.Mesh(domo([[2.4,0],[2.25,.3],[1.9,.62],[1.35,.85],[.7,.96],[.001,1.02]],3.5,.03,20),matMata),53.6,0,43.4).scale.set(1.03,1,1.03);
    const caboPts=[new THREE.Vector3(51.4,.5,45.6),new THREE.Vector3(53.66,3.62,43.4),new THREE.Vector3(57.95,7.5,44.2)];
    for(const d of [-.08,.08]) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(caboPts.map(p=>p.clone().add(new THREE.Vector3(0,0,d)))),new THREE.LineBasicMaterial({color:0x1a1a1a})));
    caboPts.forEach((p,k)=>{ const e=new THREE.Group(); const b=new THREE.Mesh(new THREE.BoxGeometry(.7,.35,.55),mat(0xe8e4dc)); b.position.y=.17; const t=new THREE.Mesh(new THREE.BoxGeometry(.8,.05,.65),mat(0x6a6e74)); t.position.y=.37; e.add(b,t); add(e,p.x,p.y-.42,p.z); });
    const bondinhos=[0,.5].map(f=>{ const b=new THREE.Group(); const vid=new THREE.Mesh(new THREE.BoxGeometry(.42,.3,.32),new THREE.MeshStandardMaterial({color:0x9ab8c8,transparent:true,opacity:.6,roughness:.1,emissive:0xffe8b0,emissiveIntensity:.3}));
      const tt=new THREE.Mesh(new THREE.BoxGeometry(.46,.05,.36),mat(0xe0b83c)); tt.position.y=.17; const ch=new THREE.Mesh(new THREE.BoxGeometry(.46,.05,.36),mat(0xe0b83c)); ch.position.y=-.17; const h=new THREE.Mesh(new THREE.BoxGeometry(.03,.22,.03),mat(0x333333)); h.position.y=.3;
      b.add(vid,tt,ch,h); scene.add(b); b.userData.f=f; return b; });
    rotulo('Pão de Açúcar',57.9,8.8,44.2); rotulo('Morro da Urca',53.6,4.6,43.4);
    if(CID.casaRoxa){ // Paquetá: casa de telhado roxo, com um casal à porta
      const cx=CID.casaRoxa.x+.5, cz=CID.casaRoxa.z+.5, y0=yTopo(cx,cz), casa=new THREE.Group();
      const parede=mat(0xf2ead8), roxo=mat(0x3c1258,{roughness:.6}), madeira=mat(0x5a3a22), vidroC=mat(0x2a3a48,{emissive:0xffd890,emissiveIntensity:.25});
      const corpo=new THREE.Mesh(new THREE.BoxGeometry(.9,.62,.7),parede); corpo.position.y=.31; casa.add(corpo);
      const fr=new THREE.Shape(); fr.moveTo(-.52,0); fr.lineTo(0,.38); fr.lineTo(.52,0); fr.lineTo(-.52,0);
      const tel=new THREE.Mesh(new THREE.ExtrudeGeometry(fr,{depth:.84,bevelEnabled:false}),roxo); tel.position.set(0,.62,-.42); casa.add(tel);
      const beiral=new THREE.Mesh(new THREE.BoxGeometry(1.06,.03,.86),roxo); beiral.position.y=.625; casa.add(beiral);
      const porta=new THREE.Mesh(new THREE.BoxGeometry(.18,.34,.02),madeira); porta.position.set(0,.17,.36); casa.add(porta);
      for(const x of [-.3,.3]){ const j=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.02),vidroC); j.position.set(x,.38,.36); casa.add(j);
        const ab=new THREE.Mesh(new THREE.BoxGeometry(.2,.03,.03),roxo); ab.position.set(x,.47,.37); casa.add(ab); }
      const deg=new THREE.Mesh(new THREE.BoxGeometry(.4,.04,.16),mat(0xb8b0a0)); deg.position.set(0,.02,.44); casa.add(deg);
      const cerca=mat(0xffffff); for(let k=-4;k<=4;k++){ if(Math.abs(k)<=1) continue; const r=new THREE.Mesh(new THREE.BoxGeometry(.03,.14,.03),cerca); r.position.set(k*.11,.07,.74); casa.add(r); }
      for(const s of [-1,1]){ const t=new THREE.Mesh(new THREE.BoxGeometry(.33,.025,.02),cerca); t.position.set(s*.33,.11,.74); casa.add(t); }
      // o casal: os dois de pele clara e cabelo preto
      const F=window.figurino;
      if(F && F.pessoa){
        const ele=F.pessoa('vice',{pele:0xf0d2bc, cabelo:0x111111, est:'curto', camisa:0xe8e4da, calca:0x2a2a32, sapato:0x1a1512});
        const ela=F.pessoa('vice',{pele:0xf3d8c6, cabelo:0x111111, est:'longoOndulado', fem:true, camisa:0xb88ac8, calca:0x3a2a48, sapato:0x2a1a22, batom:0x9a3a42});
        [[ele,-.16],[ela,.16]].forEach(([q,x])=>{ q.scale.setScalar(.4); q.position.set(x,.04,.6); q.rotation.y=x<0?.25:-.25; casa.add(q); });
      }
      casa.position.set(cx,y0,cz); casa.rotation.y=0; casa.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } }); scene.add(casa);
    }
    const matCristo=mat(0xe8e2d6,{emissive:0xfff3d8,emissiveIntensity:.35,roughness:.6});
    { // Cristo Redentor: túnica que se alarga no pé, braços abertos com mangas, cabeça inclinada, sobre o pedestal-capela
      const pico={x:31.5,z:43.5}, yP=yTopo(pico.x,pico.z), c=new THREE.Group();
      const ped=new THREE.Mesh(new THREE.BoxGeometry(.6,.38,.6),matCristo); ped.position.y=.19; const ped2=new THREE.Mesh(new THREE.BoxGeometry(.46,.12,.46),matCristo); ped2.position.y=.44;
      const tun=new THREE.Mesh(new THREE.LatheGeometry([[.2,0],[.24,.06],[.22,.4],[.19,.8],[.17,1.1],[.19,1.25],[.12,1.36],[.001,1.38]].map(([r,y])=>new THREE.Vector2(r,y)),16),matCristo); tun.position.y=.5;
      const om=new THREE.Mesh(new THREE.BoxGeometry(.5,.14,.2),matCristo); om.position.y=1.68;
      const bracos=[-1,1].map(s=>{ const b=new THREE.Mesh(new THREE.CylinderGeometry(.045,.085,.8,8),matCristo); b.rotation.z=s*(Math.PI/2-.06); b.position.set(s*.62,1.7,0); return b; });
      const maos=[-1,1].map(s=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(.06,.1,.05),matCristo); m.position.set(s*1.04,1.66,0); return m; });
      const cab=new THREE.Mesh(new THREE.SphereGeometry(.11,12,10),matCristo); cab.position.set(0,1.98,.03); cab.scale.set(.9,1.1,1);
      const pesc=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,.1,8),matCristo); pesc.position.y=1.82;
      c.add(ped,ped2,tun,om,...bracos,...maos,cab,pesc); c.rotation.y=Math.PI*.18; add(c,pico.x,yP,pico.z,true); brilhoFixo(pico.x,yP+1.6,pico.z,6,0xfff1cc,.7); rotulo('Cristo Redentor',pico.x,yP+3,pico.z); }
    add(new THREE.Mesh(rocha(1.7,4.6,12,.7),matRocha),20.2,0,59.6); add(new THREE.Mesh(rocha(1.5,3.8,12,.7),matRocha),22.4,0,59.2); rotulo('Dois Irmãos',21.3,5.6,59.4);
    add(new THREE.Mesh(rocha(3,4.4,14,.25),matRocha),10.8,0,59.6); add(new THREE.Mesh(new THREE.CylinderGeometry(2,2.3,.6,14),matMata),10.8,4.3,59.6); rotulo('Pedra da Gávea',10.8,5.8,59.6);
    let bondeArcos=null;
    { const g=new THREE.Group(), branco=mat(0xf0ebe0,{emissive:0xfff5e0,emissiveIntensity:.15});
      const tp=new THREE.Mesh(new THREE.BoxGeometry(4.2,.25,.5),branco); tp.position.y=1.35; g.add(tp);
      for(let k=0;k<=8;k++){ const p=new THREE.Mesh(new THREE.BoxGeometry(.18,1.25,.5),branco); p.position.set(-2+k*.5,.6,0); g.add(p);
        if(k<8){ const ar=new THREE.Mesh(new THREE.TorusGeometry(.17,.07,4,10,Math.PI),branco); ar.position.set(-1.75+k*.5,1.05,0); g.add(ar); const a2=ar.clone(); a2.scale.set(.6,.6,1); a2.position.y=.62; g.add(a2); } }
      bondeArcos=add(new THREE.Mesh(new THREE.BoxGeometry(.6,.3,.3),mat(0xe0b83c)),40.6,.24+1.65,24.6,true);
      add(g,40.6,.24,24.6); rotulo('Arcos da Lapa',40.6,2.6,24.6); }
    { // Catedral Metropolitana: o tronco de cone de concreto em caixotões, com os quatro vitrais verticais e a cruz no alto
      const tc=texCanvas(256,128,(q,w,h)=>{ q.fillStyle='#8d877d'; q.fillRect(0,0,w,h); for(let y=0;y<h;y+=8) for(let x=0;x<w;x+=8){ q.fillStyle=`rgba(0,0,0,${.18+((x+y)%16?0:.06)})`; q.fillRect(x+1,y+1,6,6); q.fillStyle='rgba(255,255,255,.08)'; q.fillRect(x,y,8,1); }
        const vit=['#e8c23c','#3a8a4a','#2a5aa8','#c8402a']; for(let k=0;k<4;k++){ q.fillStyle=vit[k]; q.fillRect(k*64+26,0,12,h); q.fillStyle='rgba(255,255,255,.25)'; for(let y=0;y<h;y+=6) q.fillRect(k*64+26,y,12,1); } });
      const tl=texCanvas(256,128,(q,w,h)=>{ q.fillStyle='#000'; q.fillRect(0,0,w,h); const vit=['#ffd860','#6ae08a','#6a9aff','#ff7a5a']; for(let k=0;k<4;k++){ q.fillStyle=vit[k]; q.fillRect(k*64+26,0,12,h); } });
      const mcat=new THREE.MeshStandardMaterial({map:tc,emissiveMap:tl,emissive:0xffffff,emissiveIntensity:.6,roughness:.9}); matsPredio._catedral=mcat;
      const g=new THREE.Group(); const cone=new THREE.Mesh(new THREE.CylinderGeometry(.72,1.4,2.3,32,1,true),mcat); cone.position.y=1.15; g.add(cone);
      const tampa=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.04,32),mat(0x7a756c)); tampa.position.y=2.3; g.add(tampa);
      const cr=new THREE.Group(); const v=new THREE.Mesh(new THREE.BoxGeometry(.05,.55,.05),mat(0xd8d0c0)); v.position.y=.27; const h2=new THREE.Mesh(new THREE.BoxGeometry(.3,.05,.05),mat(0xd8d0c0)); h2.position.y=.38; cr.add(v,h2); cr.position.y=2.32; g.add(cr);
      const pr=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,.06,32),mat(0xb8b2a6)); pr.position.y=.03; g.add(pr);
      add(g,43.5,.24,23.2,true); brilhoFixo(43.5,1.4,23.2,3.6,0xffe8c0,.35); }
    rotulo('Catedral',43.5,4.2,23.2);
    { // Theatro Municipal: colunata na fachada, cúpula central verde-cobre com a águia dourada, cúpulas laterais
      const g=new THREE.Group(), b=mat(0xe2d8bf), dour=mat(0xd8b45a,{metalness:.8,roughness:.3,emissive:0x553300,emissiveIntensity:.4}), verde=mat(0x5f9a7a,{metalness:.4,roughness:.4});
      const c=new THREE.Mesh(new THREE.BoxGeometry(1.7,1,1.2),b); c.position.y=.5; g.add(c);
      const fr=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.15,.15),b); fr.position.set(0,.57,.62); g.add(fr);
      for(let k=0;k<6;k++){ const col=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.6,8),mat(0xf2ead6)); col.position.set(-.5+k*.2,.68,.72); g.add(col); }
      const ent=new THREE.Mesh(new THREE.BoxGeometry(1.1,.06,.2),b); ent.position.set(0,1.0,.72); g.add(ent);
      for(let k=0;k<3;k++){ const d=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,.12),mat(0xd8d0bc)); d.position.set(0,.03+k*.05,.86-k*.06); g.add(d); }
      const tb=new THREE.Mesh(new THREE.CylinderGeometry(.34,.36,.25,16),b); tb.position.y=1.12; g.add(tb);
      const cp=new THREE.Mesh(new THREE.SphereGeometry(.36,18,10,0,Math.PI*2,0,Math.PI/2),verde); cp.position.y=1.24; cp.scale.y=1.3; g.add(cp);
      const ag=new THREE.Mesh(new THREE.ConeGeometry(.06,.3,8),dour); ag.position.y=1.85; g.add(ag); const asa=new THREE.Mesh(new THREE.BoxGeometry(.24,.04,.04),dour); asa.position.y=1.92; g.add(asa);
      for(const x of [-.72,.72]){ const t=new THREE.Mesh(new THREE.BoxGeometry(.32,1.25,.32),b); t.position.set(x,.62,.45); g.add(t); const cpl=new THREE.Mesh(new THREE.SphereGeometry(.17,12,8,0,Math.PI*2,0,Math.PI/2),verde); cpl.position.set(x,1.25,.45); cpl.scale.y=1.4; g.add(cpl);
        const pi=new THREE.Mesh(new THREE.ConeGeometry(.03,.16,6),dour); pi.position.set(x,1.55,.45); g.add(pi); }
      add(g,42.5,.24,19.5); brilhoFixo(42.5,.9,20.4,3.5,0xffe8b0,.5); rotulo('Theatro Municipal',42.5,2.8,19.5); }
    { // Candelária: nave em cruz, cúpula com tambor e lanterna, duas torres com coruchéus barrocos
      const g=new THREE.Group(), b=mat(0xeee8dc), cin=mat(0xb8b2a6), cup=mat(0xdcd6ca);
      const nave=new THREE.Mesh(new THREE.BoxGeometry(.8,.85,1.7),b); nave.position.y=.42; g.add(nave);
      const tr=new THREE.Mesh(new THREE.BoxGeometry(1.4,.8,.55),b); tr.position.set(0,.4,.2); g.add(tr);
      const tel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.7,3,1),cin); tel.rotation.x=-Math.PI/2; tel.scale.set(1,1,.55); tel.position.y=.95; g.add(tel);
      const tb=new THREE.Mesh(new THREE.CylinderGeometry(.3,.32,.35,16),b); tb.position.set(0,1.05,.2); g.add(tb);
      const cp=new THREE.Mesh(new THREE.SphereGeometry(.31,16,10,0,Math.PI*2,0,Math.PI/2),cup); cp.position.set(0,1.22,.2); cp.scale.y=1.25; g.add(cp);
      const la=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,.25,8),b); la.position.set(0,1.7,.2); g.add(la); const cr=new THREE.Mesh(new THREE.ConeGeometry(.05,.15,6),cin); cr.position.set(0,1.9,.2); g.add(cr);
      for(const x of [-.3,.3]){ const t=new THREE.Mesh(new THREE.BoxGeometry(.28,1.25,.28),b); t.position.set(x,.62,-.78); g.add(t);
        const s=new THREE.Mesh(new THREE.SphereGeometry(.15,12,8),cup); s.position.set(x,1.38,-.78); s.scale.y=1.4; g.add(s); const ag=new THREE.Mesh(new THREE.ConeGeometry(.05,.25,6),cin); ag.position.set(x,1.68,-.78); g.add(ag); }
      const fr=new THREE.Mesh(new THREE.ConeGeometry(.35,.25,3),b); fr.position.set(0,.98,-.86); fr.scale.set(1,1,.25); g.add(fr);
      add(g,44.5,.24,15.5); brilhoFixo(44.5,1.6,15.7,3,0xfff1cc,.4); rotulo('Candelária',44.5,2.6,15.5); }
    { const g=new THREE.Group(), b=mat(0xf2f2ee,{roughness:.4}); const bs=new THREE.Mesh(new THREE.BoxGeometry(.9,.35,3.2),b); bs.position.y=.18; g.add(bs);
      for(const lado of [-1,1]) for(let k=0;k<7;k++){ const a=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,1.2),b); a.position.set(lado*.32,.55,-1.4+k*.47); a.rotation.set(0,0,lado*.6); a.scale.z=.4; g.add(a); }
      const lm=new THREE.Mesh(new THREE.BoxGeometry(1.4,.05,3.6),b); lm.position.y=.6; g.add(lm);
      const es=new THREE.Mesh(new THREE.BoxGeometry(2,.02,4.2),mat(0x2a5a72,{roughness:.1,metalness:.6})); es.position.y=.05; g.add(es);
      add(g,47.6,.1,13.8); rotulo('Museu do Amanhã',47.6,1.8,13.8); }
    { // Ilha Fiscal: o castelinho neogótico verde-claro com a torre do relógio
      const g=new THREE.Group(), pe=mat(0x9ec8b0), tel=mat(0x3a6a5a,{roughness:.5}), cin=mat(0xd8d0c0);
      const il=new THREE.Mesh(new THREE.CylinderGeometry(.85,.95,.25,14),mat(0x3c4136)); il.position.y=.12; g.add(il);
      const cais=new THREE.Mesh(new THREE.BoxGeometry(1.5,.08,.8),cin); cais.position.y=.27; g.add(cais);
      const corpo=new THREE.Mesh(new THREE.BoxGeometry(1,.5,.5),pe); corpo.position.y=.55; g.add(corpo);
      for(const x of [-.35,0,.35]){ const ga=new THREE.Mesh(new THREE.ConeGeometry(.2,.3,4),tel); ga.position.set(x,.95,0); ga.rotation.y=Math.PI/4; ga.scale.set(1,1,1.4); g.add(ga); }
      const tr=new THREE.Mesh(new THREE.BoxGeometry(.24,.65,.24),pe); tr.position.set(.38,.95,0); g.add(tr);
      const ag=new THREE.Mesh(new THREE.ConeGeometry(.17,.55,4),tel); ag.position.set(.38,1.55,0); ag.rotation.y=Math.PI/4; g.add(ag);
      const rl=new THREE.Mesh(new THREE.CircleGeometry(.06,12),new THREE.MeshBasicMaterial({color:0xf2e8c8})); rl.position.set(.38,1.08,.125); g.add(rl);
      for(const x of [-.4,-.13,.13]){ const j=new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.01),new THREE.MeshBasicMaterial({color:0xffd890})); j.position.set(x,.58,.255); g.add(j); }
      for(const [x,z] of [[-.65,.3],[.65,-.3]]){ const pal=new THREE.Mesh(new THREE.CylinderGeometry(.02,.03,.6,5),mat(0x6a5a3a)); pal.position.set(x,.55,z); g.add(pal); const fo=new THREE.Mesh(new THREE.ConeGeometry(.22,.12,6),mat(0x3a6a34,{flatShading:true})); fo.position.set(x,.88,z); g.add(fo); }
      add(g,48.6,0,17.2); brilhoFixo(48.6,.9,17.2,1.6,0xffe2a0,.6); brilhoFixo(48.98,1.15,17.33,.6,0xfff0c8,.8); rotulo('Ilha Fiscal',48.6,2.2,17.2); }
    { add(new THREE.Mesh(new THREE.BoxGeometry(1.2,.02,5.8),mat(0x1c1f22)),47.6,.2,23.8);
      for(let k=0;k<8;k++) add(new THREE.Mesh(new THREE.BoxGeometry(.08,.02,.4),new THREE.MeshBasicMaterial({color:0xe6e1d2})),47.6,.22,21.4+k*.7);
      const av=new THREE.Group(); const fu=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,1,8),mat(0xe8e8e8)); fu.rotation.x=Math.PI/2; av.add(fu); av.add(new THREE.Mesh(new THREE.BoxGeometry(1,.03,.2),mat(0xe8e8e8))); add(av,47.6,.35,22.6);
      rotulo('Santos Dumont',46.6,1.4,24.2); }
    { // Maracanã: anel de arquibancadas sobre pilares, cobertura em lona branca e as rampas
      const g=new THREE.Group(), cz=mat(0xd9d4ca,{side:THREE.DoubleSide});
      const an=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.2,.75,40,1,true),cz); an.position.y=.55; an.scale.set(1,1,.78); g.add(an);
      const arq=new THREE.Mesh(new THREE.CylinderGeometry(2.08,1.45,.72,40,1,true),mat(0xb8b0a0,{side:THREE.DoubleSide})); arq.position.y=.5; arq.scale.set(1,1,.78); g.add(arq);
      for(let k=0;k<24;k++){ const a=k/24*Math.PI*2; const pl=new THREE.Mesh(new THREE.BoxGeometry(.1,.95,.12),mat(0xc8c2b6)); pl.position.set(Math.cos(a)*2.2,.47,Math.sin(a)*2.2*.78); pl.rotation.y=-a; g.add(pl); }
      const cb=new THREE.Mesh(new THREE.RingGeometry(1.5,2.25,40),mat(0xf6f4ee,{side:THREE.DoubleSide,emissive:0xfff8e8,emissiveIntensity:.1})); cb.rotation.x=-Math.PI/2; cb.position.y=1.0; cb.scale.set(1,.78,1); g.add(cb);
      const cp=new THREE.Mesh(new THREE.CircleGeometry(1.45,32),mat(0x3f8a3a)); cp.rotation.x=-Math.PI/2; cp.position.y=.12; cp.scale.set(1,.78,1); g.add(cp);
      for(const [x,z] of [[-2.3,0],[2.3,0],[0,1.85],[0,-1.85]]){ const r=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.8,16,1,true),mat(0xd0cabe,{side:THREE.DoubleSide})); r.position.set(x,.4,z); g.add(r); }
      add(g,24.5,.24,17.5); brilhoFixo(24.5,1.6,17.5,5,0xe8f4ff,.55); for(const [x,z] of [[-1.6,-1.2],[1.6,-1.2],[-1.6,1.2],[1.6,1.2]]) brilhoFixo(24.5+x,1.4,17.5+z,1.5,0xf0f8ff,.6); rotulo('Maracanã',24.5,2.6,17.5); }
    { const g=new THREE.Group(); for(const l of [-.6,.6]){ const a=new THREE.Mesh(new THREE.BoxGeometry(.5,.6,5),mat(0xd8d2c4)); a.position.set(l,.3,0); g.add(a); }
      const p=new THREE.Mesh(new THREE.BoxGeometry(.7,.02,5),mat(0x8a8478)); p.position.y=.02; g.add(p); add(g,37.5,.24,18.5); rotulo('Sambódromo',37.5,1.6,18.5); }
    { // Copacabana Palace: bloco neoclássico branco, arcadas no térreo, mansarda cinza com águas-furtadas
      const fx=texCanvas(256,128,(q,w,h)=>{ q.fillStyle='#f4f1ea'; q.fillRect(0,0,w,h); for(let a=0;a<3;a++) for(let c=0;c<16;c++){ const x=4+c*16, y=10+a*30; q.fillStyle='#e2dccd'; q.fillRect(x-2,y-2,12,22); q.fillStyle='#2a3440'; q.fillRect(x,y,8,18); q.fillStyle='#d8d2c2'; q.fillRect(x-3,y+19,14,3); }
        q.fillStyle='#e8e2d4'; for(let c=0;c<16;c++){ q.beginPath(); q.arc(8+c*16,106,7,Math.PI,0); q.fill(); } q.fillStyle='#1e2630'; for(let c=0;c<16;c++){ q.beginPath(); q.arc(8+c*16,108,5,Math.PI,0); q.fill(); q.fillRect(3+c*16,108,10,20); } });
      const fxl=texCanvas(256,128,(q,w,h)=>{ q.fillStyle='#000'; q.fillRect(0,0,w,h); for(let a=0;a<3;a++) for(let c=0;c<16;c++) if(rnd()<.55){ q.fillStyle='#ffd890'; q.fillRect(4+c*16,10+a*30,8,18); } q.fillStyle='#ffe8b0'; for(let c=0;c<16;c++) q.fillRect(3+c*16,108,10,20); });
      const mf=new THREE.MeshStandardMaterial({map:fx,emissiveMap:fxl,emissive:0xffffff,emissiveIntensity:.8,roughness:.7}), mb=mat(0xf4f1ea), mt=mat(0x6a6e74,{roughness:.6});
      matsPredio._copa=mf;
      const g=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.25,.9),[mb,mb,mb,mb,mf,mf]); c.position.y=.62; g.add(c);
      for(const x of [-1.25,1.25]){ const a=new THREE.Mesh(new THREE.BoxGeometry(.5,1.35,1),mb); a.position.set(x,.67,.02); g.add(a); }
      const cor=new THREE.Mesh(new THREE.BoxGeometry(2.9,.08,1),mb); cor.position.y=1.28; g.add(cor);
      const man=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-.42,0),new THREE.Vector2(.42,0),new THREE.Vector2(.26,.32),new THREE.Vector2(-.26,.32)]),{depth:2.7,bevelEnabled:false}),mt); man.geometry.translate(0,0,-1.35); man.rotation.y=Math.PI/2; man.position.y=1.32; g.add(man);   // mansarda em trapézio
      for(let k=0;k<7;k++){ const d=new THREE.Mesh(new THREE.BoxGeometry(.16,.14,.14),mb); d.position.set(-1.05+k*.35,1.52,.36); g.add(d); }
      const marq=new THREE.Mesh(new THREE.BoxGeometry(.8,.04,.4),mt); marq.position.set(0,.36,.62); g.add(marq);
      add(g,47.2,.24,52.4,true); g.rotation.y=-.45; brilhoFixo(47.2,.6,53,3.5,0xfff0d0,.35); rotulo('Copacabana Palace',47.2,2.6,52.4); }
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2,.6,1.2),mat(0x8a7a5a)),45,.54,59.1); rotulo('Forte de Copacabana',44.8,1.6,60);
    { const cs=[0xd84a3a,0xe8c23c,0x3a7ab8,0xf2f0e8,0x4aa36a]; for(let k=0;k<70;k++){ const x=20+rnd()*31, z=44+rnd()*18, tx=Math.floor(x), tz=Math.floor(z);
      if(T(tx,tz)!=='praia'||RES(tx,tz)) continue; add(new THREE.Mesh(new THREE.ConeGeometry(.2,.12,8),mat(cs[k%cs.length])),x,.32,z); add(new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.2,4),mat(0x2a2a2a)),x,.22,z); } }
    for(let k=0;k<7;k++) for(const l of [-.4,.4]){ const x=25.6+k*.45, z=48.6+l; add(new THREE.Mesh(new THREE.CylinderGeometry(.03,.04,1.3,5),mat(0xb8b0a0)),x,yTopo(x,z)+.65,z);
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(.18,0),mat(0x3a6a34,{flatShading:true})),x,yTopo(x,z)+1.35,z); }
    rotulo('Jardim Botânico',26.8,2.4,48.6); rotulo('Lagoa',LAGOA.x,1,LAGOA.z); rotulo('Copacabana',45.5,1.2,55.2); rotulo('Ipanema',34,1.2,61.8); rotulo('Leblon',25.5,1.2,62);
    rotulo('Botafogo',47.8,1,38.6); rotulo('Baía de Guanabara',56,1,28); rotulo('Oceano Atlântico',40,1,67); rotulo('Rocinha',17,3.4,55.2); rotulo('Santa Teresa',38.4,3.2,28.4);
    rotulo('Praça XV · Barcas',G.cais[0]+2.2,1,G.cais[1]+1.6);
    // Ponte Rio–Niterói: viaduto de concreto sobre pares de pilares, que sobe em rampa até o vão central de aço
    // (a viga-caixão azulada, alta, para os navios passarem), com guarda-corpos, postes e carros
    const ponteDe=new THREE.Vector3(44.6,0,9.8), ponteAte=new THREE.Vector3(65,0,22.5), carrosPonte=[];
    const alturaPonte=t=>{ const r=(a,b,x)=>Math.max(0,Math.min(1,(x-a)/(b-a))), s=x=>x*x*(3-2*x); return .9+1.4*s(r(.3,.46,t))*(1-s(r(.56,.72,t))); };
    const pontoPonte=t=>new THREE.Vector3(ponteDe.x+(ponteAte.x-ponteDe.x)*t, alturaPonte(t), ponteDe.z+(ponteAte.z-ponteDe.z)*t);
    { const nn=60, aco=mat(0x4a6a8a,{metalness:.5,roughness:.45}), guarda=mat(0xd8d4cc), faixa=new THREE.MeshBasicMaterial({color:0xe8e2c8});
      for(let k=0;k<nn;k++){ const t=k/nn, t2=(k+1)/nn, a=pontoPonte(t), b=pontoPonte(t2), len=a.distanceTo(b)+.02, m=a.clone().add(b).multiplyScalar(.5), central=t>.44&&t<.58;
        const s=new THREE.Mesh(new THREE.BoxGeometry(.78,.12,len),matPonte); s.position.copy(m); s.lookAt(b); estaticos.add(s);
        for(const lado of [-.37,.37]){ const gc=new THREE.Mesh(new THREE.BoxGeometry(.04,.1,len),guarda); gc.position.set(lado,.11,0); s.add(gc); }
        if(k%2===0){ const f=new THREE.Mesh(new THREE.BoxGeometry(.03,.005,len*.5),faixa); f.position.set(0,.065,0); s.add(f); }
        if(central){ const vc=new THREE.Mesh(new THREE.BoxGeometry(.7,.42,len),aco); vc.position.set(0,-.27,0); s.add(vc); }
        if(k%3===0 && !central){ for(const lado of [-.2,.2]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,a.y,8),matPonte); p.position.set(a.x+lado*Math.cos(Math.atan2(ponteAte.x-ponteDe.x,ponteAte.z-ponteDe.z)),a.y/2,a.z-lado*Math.sin(Math.atan2(ponteAte.x-ponteDe.x,ponteAte.z-ponteDe.z))); estaticos.add(p); }
          const cap=new THREE.Mesh(new THREE.BoxGeometry(.7,.1,.16),matPonte); cap.position.set(a.x,a.y-.1,a.z); cap.lookAt(b.x,a.y-.1,b.z); estaticos.add(cap); }
        if(central && k%4===0){ const pg=new THREE.Mesh(new THREE.BoxGeometry(.5,a.y,.5),matPonte); pg.position.set(a.x,a.y/2-.3,a.z); estaticos.add(pg); }
        if(k%4===0) brilhoFixo(a.x,a.y+.55,a.z,1,0xffd59a,.55); }
      for(let k=0;k<8;k++){ const c=new THREE.Group(); const cb=new THREE.Mesh(new THREE.BoxGeometry(.14,.09,.28),mat([0xe0c040,0xe3dccb,0x2a3f5a,0xb23a2a][k%4],{roughness:.35,metalness:.4})); cb.position.y=.12; c.add(cb);
        c.userData={t:k/8, sent:k%2?1:-1}; scene.add(c); carrosPonte.push(c); }
      rotulo('Ponte Rio–Niterói',56,3.4,18.2); }
    { const g=new THREE.Group(); const p=new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,.7,12),mat(0xeeeeea)); p.position.y=.35; g.add(p);
      const d=new THREE.Mesh(new THREE.CylinderGeometry(1.05,.45,.55,24),mat(0xf4f4f0,{emissive:0xfff0d0,emissiveIntensity:.2})); d.position.y=.95; g.add(d);
      const fj=new THREE.Mesh(new THREE.CylinderGeometry(1,.9,.12,24),new THREE.MeshBasicMaterial({color:0x2a3a44})); fj.position.y=1.02; g.add(fj);
      const es=new THREE.Mesh(new THREE.CircleGeometry(1.4,20),mat(0x2a5a72,{metalness:.6,roughness:.1})); es.rotation.x=-Math.PI/2; es.position.y=.02; g.add(es);
      const rp=new THREE.Mesh(new THREE.BoxGeometry(.2,.04,1.4),mat(0xb5423a)); rp.position.set(.6,.5,.4); rp.rotation.x=.35; g.add(rp);
      add(g,63,yTopo(63,42.6),42.6); rotulo('MAC Niterói',63,2.6,42.6); }
    { const p=new THREE.Mesh(new THREE.BoxGeometry(8,.02,.9),mat(0x1c1f22)); add(p,52,.2,6.5); p.rotation.y=.12;
      for(let k=0;k<2;k++){ const av=new THREE.Group(); const fu=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,1.3,8),mat(0xeeeeee)); fu.rotation.z=Math.PI/2; av.add(fu); av.add(new THREE.Mesh(new THREE.BoxGeometry(.25,.03,1.3),mat(0xeeeeee))); add(av,49+k*5,.35,5.2); }
      rotulo('Ilha do Governador · Galeão',54,1.6,9.8); }
    rotulo('Paquetá',68.6,1.6,3); rotulo('Niterói',73,5,36);
    for(let k=0;k<10;k++){ add(new THREE.Mesh(new THREE.BoxGeometry(.18,.12,.5),mat(0xf2f0ea)),48.4+(k%5)*.35,.08,38.2+Math.floor(k/5)*.7);
      add(new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,.6,4),mat(0xdddddd)),48.4+(k%5)*.35,.38,38.2+Math.floor(k/5)*.7); }

    return {
      animar(t,dt){ carrosPonte.forEach(c=>{ const u=c.userData; u.t=(u.t+(dt||.016)*.025*u.sent+1)%1; const p=pontoPonte(u.t), q=pontoPonte(Math.min(.999,Math.max(.001,u.t+.01*u.sent)));
          const ang=Math.atan2(q.x-p.x,q.z-p.z), lado=u.sent>0?.17:-.17; c.position.set(p.x+Math.cos(ang)*lado,p.y,p.z-Math.sin(ang)*lado); c.rotation.y=ang; c.rotation.x=-Math.atan2(q.y-p.y,Math.hypot(q.x-p.x,q.z-p.z)); });
        bondinhos.forEach(b=>{ const f=((t*.05+b.userData.f)%1), s=f<.5?f*2:2-f*2, seg=s<.5?0:1, k=s<.5?s*2:(s-.5)*2; const p=new THREE.Vector3().lerpVectors(caboPts[seg],caboPts[seg+1],k); b.position.set(p.x,p.y-.25,p.z); });
        bondeArcos.position.x=-1.8+((Math.sin(t*.4)+1)/2)*3.6; },
      noite(n){ matCristo.emissiveIntensity=THREE.MathUtils.lerp(0,.45,n); }
    };
  }
  /* pontos de São Paulo */
  function pontosSP(){
    const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
    const predio=(h,est,cor)=>{ const m=new THREE.Mesh(geoPredio(h),matsPredio[est].clone()); if(cor) m.material.color.setHex(cor); return m; };
    // Edifício Copan: a onda de concreto na Ipiranga, riscada pelos brises horizontais de cada andar
    { const tb=texCanvas(64,128,(q,w,h)=>{ q.fillStyle='#22282e'; q.fillRect(0,0,w,h); for(let y=0;y<h;y+=16){ q.fillStyle='#f2efe6'; q.fillRect(0,y+9,w,6); q.fillStyle='rgba(0,0,0,.25)'; q.fillRect(0,y+15,w,1); } });
      const tl=texCanvas(64,128,(q,w,h)=>{ q.fillStyle='#000'; q.fillRect(0,0,w,h); for(let y=0;y<h;y+=16) for(let x=0;x<w;x+=8) if(rnd()<.45){ q.fillStyle=rnd()<.7?'#ffcf7a':'#fff0c8'; q.fillRect(x+1,y+1,6,7); } });
      tb.wrapS=tb.wrapT=tl.wrapS=tl.wrapT=THREE.RepeatWrapping; tb.repeat.set(3,6); tl.repeat.set(3,6);
      const mc=new THREE.MeshStandardMaterial({map:tb,emissiveMap:tl,emissive:0xffffff,emissiveIntensity:1,roughness:.8}); matsPredio._copan=mc;
      const g=new THREE.Group(), seg=14; for(let k=0;k<seg;k++){ const u=-1.7+k*3.4/(seg-1), z=Math.sin(u*1.4)*.42, dz=Math.cos(u*1.4)*1.4*.42;
        const s=new THREE.Mesh(new THREE.BoxGeometry(.3,5.4,.62),mc); s.position.set(u,2.7,z); s.rotation.y=-Math.atan(dz); g.add(s); }
      const base=new THREE.Mesh(new THREE.BoxGeometry(3.8,.5,1.2),mat(0xe8e2d6)); base.position.y=.25; g.add(base);
      add(g,48.5,yTopo(48.5,21.5),21.5,true); rotulo('Copan',48.5,6.4,21.5); }
    // Banespa, com a antena
    { const g=new THREE.Group(); const a=predio(12,'antigo',0xd8cfbd); a.scale.set(.8,1,.8); g.add(a); const b=predio(3,'antigo',0xd8cfbd); b.scale.set(.5,1,.5); b.position.y=6; g.add(b);
      const c=new THREE.Mesh(new THREE.BoxGeometry(.3,.5,.3),mat(0xd8cfbd)); c.position.y=7.75; g.add(c); const an=new THREE.Mesh(new THREE.CylinderGeometry(.03,.05,1.2,6),mat(0x9a9a9a)); an.position.y=8.6; g.add(an);
      add(g,53.5,yTopo(53.5,19.5),19.5,true); brilhoFixo(53.5,9.25,19.5,1.2,0xff3020,.8); rotulo('Banespa',53.5,9.8,19.5); }
    // Catedral da Sé: neogótica, duas torres de 92 m com agulhas e pináculos, a cúpula verde renascentista no cruzeiro
    { const g=new THREE.Group(), pedra=mat(0x9a948a,{flatShading:true}), ard=mat(0x5a6a72), verde=mat(0x4f8a6a,{metalness:.4,roughness:.4});
      const n=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,2.2),pedra); n.position.y=.55; g.add(n); const tr=new THREE.Mesh(new THREE.BoxGeometry(1.8,1,.7),pedra); tr.position.set(0,.5,-.2); g.add(tr);
      const tel=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,2.2,3),ard); tel.rotation.x=-Math.PI/2; tel.scale.set(1,1,.6); tel.position.y=1.2; g.add(tel);
      const tb=new THREE.Mesh(new THREE.CylinderGeometry(.42,.45,.45,12),pedra); tb.position.set(0,1.3,-.2); g.add(tb);
      const cp=new THREE.Mesh(new THREE.SphereGeometry(.44,16,10,0,Math.PI*2,0,Math.PI/2),verde); cp.position.set(0,1.52,-.2); cp.scale.y=1.2; g.add(cp);
      const la=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.3,8),pedra); la.position.set(0,2.15,-.2); g.add(la);
      for(const x of [-.42,.42]){ const t=new THREE.Mesh(new THREE.BoxGeometry(.34,2.4,.34),pedra); t.position.set(x,1.2,.95); g.add(t);
        const t2=new THREE.Mesh(new THREE.BoxGeometry(.28,.5,.28),pedra); t2.position.set(x,2.65,.95); g.add(t2);
        const ag=new THREE.Mesh(new THREE.ConeGeometry(.2,1.4,8),ard); ag.position.set(x,3.6,.95); g.add(ag);
        for(const [a,b] of [[-.15,-.15],[.15,-.15],[-.15,.15],[.15,.15]]){ const pi=new THREE.Mesh(new THREE.ConeGeometry(.04,.32,4),pedra); pi.position.set(x+a,3.05,.95+b); g.add(pi); } }
      const ros=new THREE.Mesh(new THREE.CircleGeometry(.18,16),new THREE.MeshBasicMaterial({color:0x8a5a9a})); ros.position.set(0,1.05,1.11); g.add(ros);
      const port=new THREE.Mesh(new THREE.BoxGeometry(.28,.5,.02),mat(0x2a1e14)); port.position.set(0,.25,1.11); g.add(port);
      add(g,55.6,yTopo(55.6,25.6),25.6); brilhoFixo(55.6,1.4,26.8,4,0xfff1cc,.45); brilhoFixo(55.6,1.05,26.75,1,0xc890ff,.6); rotulo('Catedral da Sé',55.6,4.9,25.6); }
    // Estação da Luz, de tijolo inglês, com a torre do relógio
    { const g=new THREE.Group(), tij=mat(0xa8553a,{roughness:.85}); const c=new THREE.Mesh(new THREE.BoxGeometry(2.6,.8,1),tij); c.position.y=.4; g.add(c);
      const tl=new THREE.Mesh(new THREE.BoxGeometry(2.7,.1,1.1),mat(0x4f6a5a)); tl.position.y=.85; g.add(tl);
      const tr=new THREE.Mesh(new THREE.BoxGeometry(.45,2.2,.45),tij); tr.position.set(1,1.1,0); g.add(tr);
      const rl=new THREE.Mesh(new THREE.CircleGeometry(.14,16),new THREE.MeshBasicMaterial({color:0xf2e8c8})); rl.position.set(1,1.85,.23); g.add(rl);
      const ct=new THREE.Mesh(new THREE.ConeGeometry(.32,.45,4),mat(0x4f6a5a)); ct.position.set(1,2.42,0); ct.rotation.y=Math.PI/4; g.add(ct);
      add(g,52.5,yTopo(52.5,14.5),14.5); brilhoFixo(53.5,1.9,14.8,1.2,0xfff0c8,.6); rotulo('Estação da Luz',52.5,3.4,14.5); }
    // MASP: a caixa de concreto e vidro pendurada nas duas vigas vermelhas que correm sobre o teto,
    // apoiadas em quatro pilares; embaixo, o vão livre de 74 m, a praça aberta para a Paulista
    { const g=new THREE.Group(), verm=new THREE.MeshStandardMaterial({color:0xc8281e,roughness:.45}), conc=mat(0x9a968e,{roughness:.9});
      const vg=texCanvas(256,64,(q,w,h)=>{ q.fillStyle='#8a867e'; q.fillRect(0,0,w,h); q.fillStyle='#1a242c'; q.fillRect(0,10,w,44); q.fillStyle='rgba(120,160,190,.35)'; for(let x=0;x<w;x+=16) q.fillRect(x,10,1,44); q.fillStyle='rgba(255,255,255,.12)'; q.fillRect(0,12,w,6); });
      const vl=texCanvas(256,64,(q,w,h)=>{ q.fillStyle='#000'; q.fillRect(0,0,w,h); for(let x=0;x<w;x+=16) if(rnd()<.7){ q.fillStyle='#fff0d0'; q.fillRect(x+1,14,14,36); } });
      const mv=new THREE.MeshStandardMaterial({map:vg,emissiveMap:vl,emissive:0xffffff,emissiveIntensity:.7,roughness:.3,metalness:.3}); matsPredio._masp=mv;
      const cx=new THREE.Mesh(new THREE.BoxGeometry(2.4,.62,1.05),[mv,mv,conc,conc,mv,mv]); cx.position.y=1.12; g.add(cx);
      for(const x of [-1.25,1.25]) for(const z of [-.62,.62]){ const p=new THREE.Mesh(new THREE.BoxGeometry(.24,1.6,.24),verm); p.position.set(x,.8,z); g.add(p); }
      for(const z of [-.62,.62]){ const v=new THREE.Mesh(new THREE.BoxGeometry(2.74,.26,.24),verm); v.position.set(0,1.6,z); g.add(v); }
      const praca=new THREE.Mesh(new THREE.BoxGeometry(3.2,.04,1.8),mat(0xc8c2b4,{roughness:.9})); praca.position.y=.02; g.add(praca);
      for(let k=0;k<7;k++){ const pe=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.16,6),mat([0x2a3a5a,0x8a2a22,0x3a3a3a][k%3])); pe.position.set(-1+k*.33,.12,(k%2?.25:-.3)); g.add(pe); }
      add(g,49.6,yTopo(49.6,33.6),33.6,true); g.rotation.y=-Math.atan2(8,14); brilhoFixo(49.6,.5,33.6,3,0xfff0d0,.4); rotulo('MASP',49.6,2.5,33.6); }
    // Ibirapuera: o lago, o Obelisco e a Oca
    { add(new THREE.Mesh(new THREE.ConeGeometry(.26,3.2,4),mat(0xd8d2c4)),50.6,yTopo(50.6,48.4)+1.6,48.4); rotulo('Obelisco',50.6,4,48.4);
      add(new THREE.Mesh(new THREE.SphereGeometry(.85,20,10,0,Math.PI*2,0,Math.PI/2),mat(0xf4f1ea)),55.6,yTopo(55.6,42.6),42.6); rotulo('Oca',55.6,1.6,42.6);
      const mq=new THREE.Mesh(new THREE.BoxGeometry(3,.08,.5),mat(0xe8e4dc)); add(mq,52.6,.9,43.4); for(let k=0;k<4;k++) add(new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.7,5),mat(0xe8e4dc)),51.4+k*.8,.55,43.4);
      rotulo('Parque Ibirapuera',53,1.6,46.4); }
    // Congonhas: o terminal, a torre e os aviões na pista
    let aviao=null;
    { const g=new THREE.Group(); const t=new THREE.Mesh(new THREE.BoxGeometry(2.4,.6,1),mat(0xd8d2c4)); t.position.y=.3; g.add(t);
      const v=new THREE.Mesh(new THREE.BoxGeometry(2.3,.22,.02),new THREE.MeshBasicMaterial({color:0xffe2a0})); v.position.set(0,.36,-.51); g.add(v);
      const tr=new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,1.6,8),mat(0xd8d2c4)); tr.position.set(1.4,.8,0); g.add(tr); const cb=new THREE.Mesh(new THREE.CylinderGeometry(.26,.2,.3,8),mat(0x2a3640)); cb.position.set(1.4,1.7,0); g.add(cb);
      add(g,53.5,yTopo(53.5,62.5),62.5); rotulo('Congonhas',53.5,2.6,62.5);
      const fazAviao=()=>{ const av=new THREE.Group(); const fu=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,1.3,8),mat(0xeeeeee)); fu.rotation.z=Math.PI/2; av.add(fu);
        av.add(new THREE.Mesh(new THREE.BoxGeometry(.25,.03,1.3),mat(0xeeeeee))); const le=new THREE.Mesh(new THREE.BoxGeometry(.18,.3,.03),mat(0xc8281e)); le.position.set(-.58,.18,0); av.add(le); return av; };
      add(fazAviao(),51.2,.35,59.5); aviao=add(fazAviao(),0,0,0,true); }
    // Estádio do Morumbi
    { const g=new THREE.Group(); const an=new THREE.Mesh(new THREE.CylinderGeometry(1.8,2,.8,28,1,true),mat(0xd9d4ca,{side:THREE.DoubleSide})); an.position.y=.4; an.scale.set(1,1,.82); g.add(an);
      const cb=new THREE.Mesh(new THREE.RingGeometry(1.2,1.85,28),mat(0xf0eee8,{side:THREE.DoubleSide})); cb.rotation.x=-Math.PI/2; cb.position.y=.82; cb.scale.set(1,.82,1); g.add(cb);
      const cp=new THREE.Mesh(new THREE.CircleGeometry(1.2,24),mat(0x3f8a3a)); cp.rotation.x=-Math.PI/2; cp.position.y=.05; cp.scale.set(1,.82,1); g.add(cp);
      add(g,24.5,yTopo(24.5,50.5),50.5); brilhoFixo(24.5,1.4,50.5,4.4,0xe8f4ff,.5); rotulo('Estádio do Morumbi',24.5,2.4,50.5); }
    // Jockey Club: a pista oval e a arquibancada
    { const g=new THREE.Group(); const gr=new THREE.Mesh(new THREE.CircleGeometry(2.3,32),mat(0x4a7a3a)); gr.rotation.x=-Math.PI/2; gr.scale.set(1,.62,1); gr.position.y=.02; g.add(gr);
      const pi=new THREE.Mesh(new THREE.RingGeometry(1.7,2.15,40),mat(0x8a6a4a)); pi.rotation.x=-Math.PI/2; pi.scale.set(1,.62,1); pi.position.y=.03; g.add(pi);
      const ar=new THREE.Mesh(new THREE.BoxGeometry(.5,.6,1.6),mat(0xe8e2d2)); ar.position.set(2.2,.3,0); g.add(ar);
      add(g,27.3,yTopo(27.3,40.5),40.5); rotulo('Jockey Club',27.3,1.6,40.5); }
    // Ponte Estaiada, no Pinheiros
    { const xm=34.4, zm=52.3, g=new THREE.Group(), br=mat(0xeeeeea); for(const s of [-1,1]){ const p=new THREE.Mesh(new THREE.BoxGeometry(.2,4.6,.2),br); p.position.set(s*.35,2.3,0); p.rotation.z=-s*.12; g.add(p); }
      add(g,xm,0,zm);
      for(let k=0;k<7;k++){ const de=new THREE.Vector3(xm,4.2-k*.25,zm), ate=new THREE.Vector3(xm-1.2+k*.4,.42,53.5); const c=new THREE.Mesh(new THREE.BoxGeometry(.03,.03,de.distanceTo(ate)),br);
        c.position.copy(de).add(ate).multiplyScalar(.5); c.lookAt(ate); estaticos.add(c); }
      brilhoFixo(xm,4.7,zm,1.2,0xff3020,.7); rotulo('Ponte Estaiada',xm,5.4,zm); }
    // Pico do Jaraguá, com as antenas
    { const y=yTopo(10.5,2.5); add(new THREE.Mesh(new THREE.CylinderGeometry(.04,.08,1.8,6),mat(0xb0b0b0)),10.5,y+.9,2.5); brilhoFixo(10.5,y+1.85,2.5,1.2,0xff3020,.8); rotulo('Pico do Jaraguá',10.5,y+2.6,2.5); }
    rotulo('Rio Tietê',40,1,TIETE(40)); rotulo('Rio Pinheiros',29.6,1,31); rotulo('Avenida Paulista',53,4.2,33.4); rotulo('Centro',57.5,3,17.5);
    rotulo('Represa de Guarapiranga',26,1,77); rotulo('Serra da Cantareira',74,5.6,2); rotulo('Marginal Pinheiros',35.6,1,62); rotulo('Faria Lima',37.5,7,47);
    // garoa: chuvisco fino em volta da câmera
    const N=700, gp=new Float32Array(N*3), vel=new Float32Array(N);
    for(let k=0;k<N;k++){ gp[k*3]=(rnd()-.5)*44; gp[k*3+1]=rnd()*14; gp[k*3+2]=(rnd()-.5)*44; vel[k]=5+rnd()*3; }
    const gg=new THREE.BufferGeometry(); gg.setAttribute('position',new THREE.BufferAttribute(gp,3).setUsage(THREE.DynamicDrawUsage));
    const garoa=new THREE.Points(gg,new THREE.PointsMaterial({color:0xb8c8d4,size:.07,transparent:true,opacity:.45,depthWrite:false})); garoa.frustumCulled=false; scene.add(garoa);
    const pista=[V3(58.5,.35,59.5),V3(49,.35,59.5),V3(44,2.4,59),V3(30,7,57)];
    return {
      animar(t,dt){ if(!reduzMov()){ for(let k=0;k<N;k++){ gp[k*3+1]-=vel[k]*dt; gp[k*3]-=dt*.8; if(gp[k*3+1]<0){ gp[k*3+1]+=14; gp[k*3]=(Math.random()-.5)*44; } } gg.attributes.position.needsUpdate=true; }
        garoa.position.set(st.alvoSuave?st.alvoSuave.x:44,0,st.alvoSuave?st.alvoSuave.z:40);
        // um avião decola de Congonhas de tempos em tempos
        const f=(t*.06)%1, seg=f<.45?0:f<.7?1:2, k=seg===0?f/.45:seg===1?(f-.45)/.25:(f-.7)/.3;
        aviao.position.lerpVectors(pista[seg],pista[seg+1],k); aviao.rotation.y=Math.PI; aviao.visible=f<.98; },
      noite(n){ garoa.material.opacity=.3+.25*n; }
    };
  }
  const extra= CID.id==='rio' ? pontosRio() : pontosSP();

  /* marcos dos locais do jogo */
  const clicaveis=[], marcos={};
  Object.keys(LUGARES).forEach(id=>{
    const l=LUGARES[id], yb= l.naAgua ? .05 : topo(l.x,l.z);
    const g=new THREE.Group(); g.position.set(l.x+.5,yb,l.z+.5);
    let corpo;
    if(l.tipo==='hangar'){ const geo=new THREE.CylinderGeometry(1,1,1.8,16,1,false,0,Math.PI); geo.rotateZ(Math.PI/2); geo.rotateY(Math.PI/2); corpo=new THREE.Mesh(geo,mat(l.cor,{metalness:.3})); }
    else if(l.tipo==='pf'){ corpo=new THREE.Group(); const b=new THREE.Mesh(new THREE.BoxGeometry(.95,l.alt,.95),mat(l.cor)); b.position.y=l.alt/2; corpo.add(b);
      const f=new THREE.Mesh(new THREE.BoxGeometry(.98,.18,.98),mat(0xd8cfbd)); f.position.y=l.alt+.09; corpo.add(f); }
    else if(l.tipo==='balsa'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(1.1,.35,2.2),mat(l.cor)); c.position.y=.1; corpo.add(c);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(.7,.5,.7),mat(0xd8d0c0)); cab.position.set(0,.5,.5); corpo.add(cab); brilhoFixo(l.x+.5,1,l.z+.5,1.4,0xfff0c0,.55); }
    else if(l.tipo==='solar'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(.95,.8,.8),mat(l.cor)); c.position.y=.4; corpo.add(c);
      const tel=new THREE.Mesh(new THREE.ConeGeometry(.75,.45,4),mat(0x9a4a2a)); tel.position.y=1.02; tel.rotation.y=Math.PI/4; corpo.add(tel); }
    else if(l.tipo==='tribunal'){ corpo=new THREE.Group(); const pedra=mat(l.cor), ouro=mat(0xc9a227,{metalness:.6,roughness:.3});
      for(let k=0;k<3;k++){ const d=new THREE.Mesh(new THREE.BoxGeometry(1.1-k*.08,.07,1.1-k*.08),pedra); d.position.y=.035+k*.07; corpo.add(d); }
      const nave=new THREE.Mesh(new THREE.BoxGeometry(.86,l.alt*.55,.66),pedra); nave.position.set(0,.21+l.alt*.275,-.08); corpo.add(nave);
      for(let k=0;k<6;k++){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,l.alt*.55,10),pedra); c.position.set(-.375+k*.15,.21+l.alt*.275,.32); corpo.add(c); }
      const ent=new THREE.Mesh(new THREE.BoxGeometry(.98,.08,.78),pedra); ent.position.set(0,.21+l.alt*.55+.04,0); corpo.add(ent);
      const fr=new THREE.Shape(); fr.moveTo(-.49,0); fr.lineTo(0,.24); fr.lineTo(.49,0); fr.lineTo(-.49,0);
      const fron=new THREE.Mesh(new THREE.ExtrudeGeometry(fr,{depth:.78,bevelEnabled:false}),pedra); fron.position.set(0,.21+l.alt*.55+.08,-.39); corpo.add(fron);
      const cup=new THREE.Mesh(new THREE.SphereGeometry(.2,16,10,0,Math.PI*2,0,Math.PI/2),ouro); cup.position.set(0,.21+l.alt*.55+.12,-.12); corpo.add(cup);
      const tam=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.08,16),pedra); tam.position.set(0,.21+l.alt*.55+.09,-.12); corpo.add(tam);
      brilhoFixo(l.x+.5,.3,l.z+1,1.1,0xffe0a0,.45); }
    else if(l.tipo==='monumento'){ corpo=new THREE.Group(); }   // o próprio monumento (Theatro Municipal, Copacabana Palace) é o local
    else if(l.tipo==='igreja'){ corpo=new THREE.Group(); const n=new THREE.Mesh(new THREE.BoxGeometry(.5,.55,.9),mat(l.cor)); n.position.y=.28; corpo.add(n);
      const tr=new THREE.Mesh(new THREE.BoxGeometry(.3,.95,.3),mat(l.cor)); tr.position.set(0,.48,-.45); corpo.add(tr);
      const cp=new THREE.Mesh(new THREE.ConeGeometry(.2,.35,4),mat(0x5a6a72)); cp.position.set(0,1.12,-.45); cp.rotation.y=Math.PI/4; corpo.add(cp); }
    else if(l.tipo==='estacao'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(.9,.55,.6),mat(l.cor)); c.position.y=.28; corpo.add(c);
      const tl=new THREE.Mesh(new THREE.BoxGeometry(1,.08,.7),mat(0x6a4a3a)); tl.position.y=.6; corpo.add(tl);
      const tr=new THREE.Mesh(new THREE.BoxGeometry(.5,.25,.25),mat(0xd84a3a)); tr.position.set(.25,.12,.5); corpo.add(tr); }
    else if(l.tipo==='galpao'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(.95,.6,.9),mat(l.cor)); c.position.y=.3; corpo.add(c);
      const tel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.95,10,1,false,0,Math.PI),mat(0x5d5a55)); tel.rotation.z=Math.PI/2; tel.rotation.y=Math.PI/2; tel.position.y=.6; tel.scale.set(1,1,.6); corpo.add(tel); }
    else if(l.tipo==='obra'){ corpo=new THREE.Group(); const cz=mat(l.cor);
      for(let a=0;a<3;a++){ const lj=new THREE.Mesh(new THREE.BoxGeometry(.9,.06,.9),cz); lj.position.y=.4+a*.55; corpo.add(lj); }
      for(const [a,b] of [[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]]){ const pl=new THREE.Mesh(new THREE.BoxGeometry(.08,1.5,.08),cz); pl.position.set(a,.75,b); corpo.add(pl); }
      const gr=new THREE.Mesh(new THREE.BoxGeometry(.06,2.4,.06),mat(0xe0b83c)); gr.position.set(.55,1.2,.55); corpo.add(gr);
      const br=new THREE.Mesh(new THREE.BoxGeometry(1.4,.06,.06),mat(0xe0b83c)); br.position.set(.2,2.35,.55); corpo.add(br); }
    else if(l.tipo==='mam'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(1.6,.35,.7),mat(l.cor)); c.position.y=.55; corpo.add(c);
      for(let k=0;k<5;k++){ const p=new THREE.Mesh(new THREE.BoxGeometry(.06,.4,.7),mat(0xb8b2a4)); p.position.set(-.72+k*.36,.2,0); p.rotation.z=(k%2?.35:-.35); corpo.add(p); } }
    else if(l.tipo==='placa'){ corpo=new THREE.Group(); for(const x of [-.4,.4]){ const p=new THREE.Mesh(new THREE.BoxGeometry(.06,1.1,.06),mat(0x9a9a9a)); p.position.set(x,.55,0); corpo.add(p); }
      const pl=new THREE.Mesh(new THREE.BoxGeometry(1.1,.5,.05),mat(0x1f6a3a)); pl.position.y=1.05; corpo.add(pl);
      const fx=new THREE.Mesh(new THREE.BoxGeometry(.8,.04,.06),mat(0xf2f0e8)); fx.position.y=1.1; corpo.add(fx); }
    else if(l.tipo==='castelo'){ corpo=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.7),mat(l.cor)); c.position.y=.4; corpo.add(c);
      for(const [a,b] of [[-.42,-.35],[.42,-.35],[-.42,.35],[.42,.35]]){ const tr=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,1.2,8),mat(l.cor)); tr.position.set(a,.6,b); corpo.add(tr);
        const ct=new THREE.Mesh(new THREE.ConeGeometry(.18,.35,8),mat(0x4a3a5a)); ct.position.set(a,1.37,b); corpo.add(ct); } }
    else { const est=l.tipo==='bar'?'creme':id==='galeria'?'residencial':l.tipo==='casa'?'casa':'antigo';
      corpo=new THREE.Mesh(geoPredio(Math.round(l.alt*2)),matsPredio[est].clone()); corpo.material.color.setHex(l.cor); corpo.scale.set(.92,1,.92); }
    corpo.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; o.userData.loc=id; clicaveis.push(o); } });
    g.add(corpo);
    if(l.tipo==='bar'){ const ne=new THREE.Mesh(new THREE.BoxGeometry(.7,.16,.04),new THREE.MeshBasicMaterial({color:0xff4d3a})); ne.position.set(0,.75,.48); g.add(ne); brilhoFixo(l.x+.5,yb+.95,l.z+1,2,0xff4d3a,.6); }
    const topoM= l.tipo==='hangar'?1.1 : l.tipo==='balsa'?.8 : l.tipo==='solar'?1.2 : l.tipo==='pf'?l.alt+.2 : l.tipo==='monumento'?l.alt :
      l.tipo==='igreja'?1.3 : l.tipo==='estacao'?.7 : l.tipo==='galpao'?1 : l.tipo==='obra'?2.4 : l.tipo==='mam'?.8 : l.tipo==='castelo'?1.55 : l.tipo==='placa'?1.3 : Math.round(l.alt*2)*.5;
    const med=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,toneMapped:false}));
    med.scale.set(1.9,1.9,1); med.position.y=topoM+1.7; med.renderOrder=10; med.userData.loc=id; clicaveis.push(med); g.add(med);
    const haste=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1,4),new THREE.MeshBasicMaterial({color:0xb98f2f})); haste.position.y=topoM+.55; g.add(haste);
    const halo=new THREE.Mesh(new THREE.RingGeometry(1.05,1.25,48),new THREE.MeshBasicMaterial({color:0xd8b45a,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
    halo.rotation.x=-Math.PI/2; halo.position.y=.03; if(l.tipo==='monumento') halo.scale.set(1.6,1.6,1.6); g.add(halo);
    const br=addBrilho(l.x+.5,yb+med.position.y+.24,l.z+.5,3.2,0xffd27a,0);
    scene.add(g); marcos[id]={grupo:g,med,halo,brilho:br,baseY:med.position.y,texs:{}};
  });

  /* carros e barcos de fundo */
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]], ehRua=(x,z)=>T(x,z)==='rua';
  const ruas=[]; for(let z=0;z<H;z++) for(let x=0;x<W;x++) if(ehRua(x,z)) ruas.push([x,z]);
  const carros=[], cc=[0xe0c040,0xe3dccb,0x2a3f5a,0x1e1e1e,0xb23a2a,0x3e6b4a,0x8a8f96], NC=40;
  // carros de fundo: o mesmo perfil lateral dos carros da garagem, em miniatura (sem WebGL do guarda-roupa, caixas)
  const F=window.figurino, mini=g=>g.scale(.135,.2,.135);
  const geoCorpo= F&&F.lateral ? mini(F.lateral([['m',-2.2,.1],['l',-2.26,.78],['l',-1.5,.9],['l',1.3,.9],['l',2.26,.76],['l',2.2,.1],['l',-2.2,.1]],2.3,.12)) : new THREE.BoxGeometry(.32,.16,.6).translate(0,.14,0);
  const geoCab= F&&F.lateral ? mini(F.lateral([['m',-1.4,.88],['l',-.9,1.45],['l',.5,1.47],['l',1.1,.88],['l',-1.4,.88]],2,.08)) : new THREE.BoxGeometry(.28,.14,.3).translate(0,.28,-.03);
  const imCarro=new THREE.InstancedMesh(geoCorpo,new THREE.MeshStandardMaterial({roughness:.3,metalness:.45}),NC);
  const imCabine=new THREE.InstancedMesh(geoCab,mat(0x1a2630,{roughness:.15,metalness:.6}),NC);
  imCarro.castShadow=true; scene.add(imCarro,imCabine);
  for(let k=0;k<NC;k++){ let x,z,op=[]; for(let tent=0;tent<20&&!op.length;tent++){ [x,z]=ruas[Math.floor(rnd()*ruas.length)]; op=DIRS.filter(d=>ehRua(x+d[0],z+d[1])); }
    cor.setHex(cc[k%3===0?0:k%cc.length]); imCarro.setColorAt(k,cor);
    carros.push({k,x,z,d:op[Math.floor(rnd()*op.length)]||[1,0],t:0,v:1.4+rnd()*1.2}); }
  const barcos=[], BC=CID.barcos; for(let k=0;k<BC.n;k++){ const g=new THREE.Group(); const c=new THREE.Mesh(new THREE.BoxGeometry(.5,.2,1.2),mat(0xe9e4d8)); c.position.y=.1; g.add(c);
    barcos.push({g,luz:addBrilho(0,0,0,1.2,0xfff0c0,.55),cx:BC.x+rnd()*BC.dx,cz:BC.z+rnd()*BC.dz,r:BC.r0+rnd()*(BC.r1-BC.r0),a:rnd()*6.28,v:.04+rnd()*.07}); scene.add(g); }
  // a barca de passageiros que leva o Vincent
  const barca=new THREE.Group(); { const c=new THREE.Mesh(new THREE.BoxGeometry(.8,.3,1.8),mat(0xf2f0e8)); c.position.y=.12; barca.add(c);
    const s=new THREE.Mesh(new THREE.BoxGeometry(.7,.35,1.2),mat(0x2f6a8a)); s.position.y=.45; barca.add(s); } barca.visible=false; scene.add(barca);
  const luzBarca=addBrilho(0,0,0,1.6,0xfff0c0,0);

  /* Vincent */
  /* Vincent: o mesmo boneco das cenas, com a roupa que ele escolheu no apartamento */
  const vincent=new THREE.Group(); scene.add(vincent);
  const corpoV=vestirVincent(vincent);
  const pE=corpoV.pE, pD=corpoV.pD, tornoz=corpoV.tornoz;
  const anel=new THREE.Mesh(new THREE.RingGeometry(.62,.74,40),new THREE.MeshBasicMaterial({color:0xf5ead0,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
  anel.rotation.x=-Math.PI/2; scene.add(anel);
  const luzTornoz=addBrilho(0,0,0,.7,0x4cff7a,.6);

  /* raio da tornozeleira */
  const texCerca=texCanvas(8,64,(g)=>{ const gr=g.createLinearGradient(0,64,0,0); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(.35,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,8,64); });
  const matCerca=new THREE.MeshBasicMaterial({map:texCerca,color:0xd8b45a,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const cerca=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1.6,192,1,true),matCerca); cerca.scale.set(RAIO.rx,1,RAIO.rz); cerca.position.set(RAIO.x,1.05,RAIO.z); cerca.renderOrder=5; scene.add(cerca);
  const matLinha=new THREE.MeshBasicMaterial({color:0xd8b45a,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const linha=new THREE.Mesh(new THREE.RingGeometry(1-.12/RAIO.rz,1+.12/RAIO.rz,192),matLinha); linha.scale.set(RAIO.rx,RAIO.rz,1); linha.rotation.x=-Math.PI/2; linha.position.set(RAIO.x,.36,RAIO.z); scene.add(linha);
  const matAviso=new THREE.MeshBasicMaterial({color:0xc98b3a,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const faixa=new THREE.Mesh(new THREE.RingGeometry(1-RAIO.aviso/RAIO.rz,1,192),matAviso); faixa.scale.set(RAIO.rx,RAIO.rz,1); faixa.rotation.x=-Math.PI/2; faixa.position.set(RAIO.x,.34,RAIO.z); scene.add(faixa);
  const matRestrita=new THREE.MeshBasicMaterial({map:texCerca,color:0xff3a2a,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const restritas=[0,1,2].map(()=>{ const g=new THREE.Group(); const c=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1.4,64,1,true),matRestrita); c.position.y=.95; g.add(c);
    const r=new THREE.Mesh(new THREE.RingGeometry(.95,1,64),new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,toneMapped:false})); r.rotation.x=-Math.PI/2; r.position.y=.4; g.add(r);
    g.visible=false; scene.add(g); return g; });
  const pulsos=[0,1,2].map(k=>{ const m=new THREE.Mesh(new THREE.RingGeometry(.9,1,48),new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
    m.rotation.x=-Math.PI/2; m.userData.k=k; scene.add(m); return m; });

  /* mescla os monumentos fixos num objeto só (centenas de peças viram 1 desenho) */
  pontesTile.forEach(p=>estaticos.add(p));
  estaticos.updateMatrixWorld(true);
  { const pos=[], nor=[], cr=[], c=new THREE.Color();
    estaticos.traverse(o=>{ if(!o.isMesh) return; const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()); g.applyMatrix4(o.matrixWorld);
      if(!g.attributes.normal) g.computeVertexNormals(); const pa=g.attributes.position.array, na=g.attributes.normal.array; c.copy(o.material.color||new THREE.Color(1,1,1));
      for(let k=0;k<pa.length;k++){ pos.push(pa[k]); nor.push(na[k]); } for(let k=0;k<pa.length/3;k++) cr.push(c.r,c.g,c.b); });
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cr,3));
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,side:THREE.DoubleSide})); m.castShadow=true; m.receiveShadow=true; scene.add(m); }
  /* luzes fixas: um objeto de pontos, com tamanho e cor por ponto */
  const VS='attribute float tam; attribute vec3 cor; uniform float escala; varying vec3 vCor; void main(){ vCor=cor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=tam*escala; }';
  const FS='uniform sampler2D mapa; uniform float opac; varying vec3 vCor; void main(){ vec4 t=texture2D(mapa,gl_PointCoord); gl_FragColor=vec4(vCor*t.a*opac, t.a*opac); }';
  const novoMatPontos=()=>new THREE.ShaderMaterial({uniforms:{mapa:{value:texBrilho},escala:{value:20},opac:{value:1}},vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const pontosDe=(lista)=>{ const g=new THREE.BufferGeometry(), p=new Float32Array(lista.length*3), cl=new Float32Array(lista.length*3), tm=new Float32Array(lista.length), c=new THREE.Color();
    lista.forEach(([x,y,z,e,h,op],k)=>{ p.set([x,y,z],k*3); c.setHex(h); cl.set([c.r*op,c.g*op,c.b*op],k*3); tm[k]=e*.62; });
    g.setAttribute('position',new THREE.BufferAttribute(p,3)); g.setAttribute('cor',new THREE.BufferAttribute(cl,3)); g.setAttribute('tam',new THREE.BufferAttribute(tm,1));
    const pts=new THREE.Points(g,novoMatPontos()); pts.frustumCulled=false; scene.add(pts); return pts; };
  const luzesFixas=pontosDe(fixos);
  // faróis e lanternas: 2 pontos por carro, posições atualizadas a cada quadro
  const luzesCarros=pontosDe(carros.flatMap(()=>[[0,0,0,.9,0xfff2c0,.6],[0,0,0,.6,0xff3020,.5]]));
  luzesCarros.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return {G,cont,canvas,renderer,luzesFixas,luzesCarros,imCarro,imCabine,scene,cam,hemi,sol,ceuNoite,ceuDia,ceuTarde,matsPredio,matBarraco,matAgua,aguaD:new THREE.Color(CID.agua[0]),aguaN:new THREE.Color(CID.agua[1]),extra,aguaPos,aguaBase,espuma,brilhos,rotulos,
    marcos,clicaveis,carros,barcos,barca,luzBarca,restritas,matRestrita,vincent,pE,pD,tornoz,corpoV,anel,luzTornoz,matCerca,matLinha,matAviso,cerca,linha,faixa,pulsos,
    texMedalhao,topo,addBrilho};
}

/* --------------------------- ESTADO / CONTROLE --------------------------- */
const DIRS4=[[1,0],[-1,0],[0,1],[0,-1]];
const st={alvo:null, alvoSuave:null, az:Math.PI*.2, azAlvo:Math.PI*.2, zoom:1.15, zoomAlvo:1.15, seguir:true,
  pos:{x:0,z:0}, pernas:[], ativo:false, raf:0, nomes:true, viagem:null, ultimoT:0, tz:'dentro'};
function posicaoDe(id){
  id=chave(id); const l=LUGARES[id]; if(!l) return null;
  if(l.barca){ const d=M.G.docas[id]; if(l.naAgua) return {x:l.x, z:l.z, agua:true};
    // em terra, ao lado da doca
    let best=[l.x,l.z], bd=1e9; for(const [a,b] of DIRS4.concat([[1,1],[-1,1],[1,-1],[-1,-1]])){ const x=l.x+a, z=l.z+b; if(M.G.T(x,z)==='agua') continue;
      const dd=Math.hypot(x-d[0],z-d[1]); if(dd<bd){ bd=dd; best=[x,z]; } } return {x:best[0], z:best[1]}; }
  const p=M.G.portas[id]; return {x:p[0], z:p[1]};
}
function bfsTerra(a,b){
  const key=(x,z)=>z*W+x, prev=new Map(), fila=[a]; prev.set(key(a[0],a[1]),null);
  for(let q=0;q<fila.length;q++){ const [x,z]=fila[q]; if(x===b[0]&&z===b[1]) break;
    for(const [dx,dz] of DIRS4){ const nx=x+dx,nz=z+dz,k=key(nx,nz); if(M.G.anda(nx,nz)&&!prev.has(k)){ prev.set(k,[x,z]); fila.push([nx,nz]); } } }
  if(!prev.has(key(b[0],b[1]))) return null; const out=[]; let c=b; while(c){ out.push(c); c=prev.get(key(c[0],c[1])); } return out.reverse();
}
function rotaAgua(a,b){   // BFS na água e depois "puxa o fio" para a barca não andar em zigue-zague
  const T=M.G.T, key=(x,z)=>z*W+x, prev=new Map(), fila=[a]; prev.set(key(a[0],a[1]),null);
  const nav=(x,z)=> x>=0&&z>=0&&x<W&&z<H && (T(x,z)==='agua'||T(x,z)==='ponte');
  for(let q=0;q<fila.length;q++){ const [x,z]=fila[q]; if(x===b[0]&&z===b[1]) break;
    for(const [dx,dz] of DIRS4){ const nx=x+dx,nz=z+dz,k=key(nx,nz); if(nav(nx,nz)&&!prev.has(k)){ prev.set(k,[x,z]); fila.push([nx,nz]); } } }
  if(!prev.has(key(b[0],b[1]))) return [a,b];
  const cru=[]; let c=b; while(c){ cru.push(c); c=prev.get(key(c[0],c[1])); } cru.reverse();
  const livre=(p,q)=>{ const n=Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])*3); for(let i=0;i<=n;i++){ const t=i/n; if(!nav(Math.round(p[0]+(q[0]-p[0])*t),Math.round(p[1]+(q[1]-p[1])*t))) return false; } return true; };
  const out=[cru[0]]; let i=0; while(i<cru.length-1){ let j=cru.length-1; while(j>i+1 && !livre(cru[i],cru[j])) j--; out.push(cru[j]); i=j; } return out;
}
function planejar(de, para){
  de=chave(de); para=chave(para);
  const A=LUGARES[de], B=LUGARES[para]; const pA=posicaoDe(de)||posicaoDe('apto'), pB=posicaoDe(para);
  const pernas=[], G=M.G;
  const cais=G.cais, doca=G.doca;
  if(A && A.barca){ pernas.push({tipo:'barco', pts:rotaAgua(G.docas[de], B&&B.barca ? G.docas[para] : doca)}); }
  if(B && B.barca){
    if(!(A && A.barca)){ const p=bfsTerra([pA.x,pA.z],cais); if(p) pernas.push({tipo:'pe', pts:p}); pernas.push({tipo:'barco', pts:rotaAgua(doca,G.docas[para])}); }
    pernas.push({tipo:'chega', x:pB.x, z:pB.z, agua:!!pB.agua});
  } else {
    const ini = A && A.barca ? cais : [pA.x,pA.z];
    const p=bfsTerra(ini,[pB.x,pB.z]); if(p) pernas.push({tipo:'pe', pts:p}); else pernas.push({tipo:'chega', x:pB.x, z:pB.z});
  }
  return pernas;
}

/* --- integração com o jogo --- */
function visiveis(){
  const out=[]; const A=getActiveLocs();
  for(const id in A){ const l=A[id]; if(l.caso && l.caso!==S.caso) continue; if(l.reqFlag && !S.flags[l.reqFlag]) continue; const k=chave(id); if(LUGARES[k]) out.push(k); }
  return out;
}
function texDoMarco(id, glifo, fora){ const m=M.marcos[id]; const k=glifo+(fora?'f':'d'); if(!m.texs[k]) m.texs[k]=M.texMedalhao(glifo,fora); return m.texs[k]; }
function sincronizar(){
  const vis=new Set(visiveis()); const A=getActiveLocs();
  Object.keys(M.marcos).forEach(id=>{ const mc=M.marcos[id], on=vis.has(id); mc.grupo.visible=on;
    if(!on){ mc.brilho.userData.op=0; return; }
    const gid=idDoJogo(id), l=A[gid], fora= l.zone==='fora' && temTornozeleira(), viva=hasNewSceneNow(gid);
    mc.med.material.map=texDoMarco(id,l.g,fora); mc.med.material.needsUpdate=true;
    mc.halo.visible=viva; mc.halo.material.color.setHex(fora?0xbe4a33:0xd8b45a);
    mc.brilho.material.color.setHex(fora?0xff7a5a:0xffd27a); mc.brilho.userData.op= viva?.55:0;
    mc.nome=l.name; });
  const tz=temTornozeleira(); M.cerca.visible=M.linha.visible=M.faixa.visible=tz; M.cont.querySelector('.m3d-tz').hidden=!tz;
  exclusoes=[];
  if(tz) vis.forEach(k=>{ const l=LUGARES[k], g=A[idDoJogo(k)]; if(g && g.zone==='fora' && distElipse(l.x+.5,l.z+.5)>-.5) exclusoes.push({x:l.x+.5, z:l.z+.5, r:2.4}); });
  M.restritas.forEach((r,i)=>{ const e=exclusoes[i]; r.visible=!!e; if(e){ r.position.set(e.x,0,e.z); r.scale.set(e.r,1,e.r); } });
  if(!st.viagem){ const p=posicaoDe(S.loc)||posicaoDe('apto'); st.pos={x:p.x,z:p.z}; st.naAgua=!!p.agua; if(st.seguir || !st.alvo) st.alvo=new THREE.Vector3(p.x+.5,0,p.z+.5); }
  if(!st.alvoSuave){ st.alvoSuave=st.alvo.clone(); }
}
mapa3d.viajar=function(id, confirmado){
  if(S.ended || traveling || mode!=='map' || st.viagem) return;
  const L=getActiveLocs()[id];
  if(!L || (L.caso && L.caso!==S.caso) || (L.reqFlag && !S.flags[L.reqFlag])) return;
  if(id===S.loc){ enterLocation(id); return; }
  if(L.zone==='fora' && temTornozeleira() && !confirmado){ confirmar(id,L); return; }
  fecharConf();
  st.viagem={id, pernas:planejar(S.loc,id), i:0, k:0};
  traveling={from:S.loc, to:id};
  st.seguir=true;
  /* A pé ele anda sempre no mesmo passo (as pernas acompanham). Trajeto longo sem
     veículo próprio vira corrida de táxi; de táxi, carro ou moto a velocidade é de
     carro, e só cresce um pouco nos trajetos enormes para a viagem não passar de ~5 s. */
  const total=st.viagem.pernas.reduce((s,p)=>s+(p.tipo==='pe'?p.pts.length:0),0);
  const PASSO=3.4, LIMITE_A_PE=14;
  st.viagem.taxi = !M.corpoV.veic && total>LIMITE_A_PE;
  st.viagem.vel = (M.corpoV.veic||st.viagem.taxi) ? Math.max(7,total/5) : PASSO;
  if(reduzMov() || window.__mapa3dInstantaneo) concluirViagem();
};
function taxiDaCidade(){
  if(M.taxi && M.taxi.userData.cid===CID.id) return M.taxi;
  if(M.taxi) M.scene.remove(M.taxi);
  const t=window.figurino.veiculo('opala'); if(!t) return null;
  const corT = CID.id==='sp' ? 0xeeeee8 : 0xf2c21a;   // amarelo no Rio, branco em São Paulo
  const trocadas=new Map();
  t.traverse(o=>{ if(o.isMesh && o.material && o.material.clearcoat===1 && o.material.color.getHex()===0x0c0c0e){
    if(!trocadas.has(o.material)){ const m=o.material.clone(); m.color.setHex(corT); trocadas.set(o.material,m); } o.material=trocadas.get(o.material); } });
  const placa=new THREE.Mesh(new THREE.BoxGeometry(.5,.16,.2),new THREE.MeshStandardMaterial({color:0xfff2c0,emissive:0xffd060,emissiveIntensity:.8}));
  placa.position.set(0,1.0,-.25); t.add(placa);
  if(CID.id!=='sp'){ const faixa=new THREE.Mesh(new THREE.BoxGeometry(1.82,.06,3.2),new THREE.MeshStandardMaterial({color:0x1f4fa8,roughness:.4})); faixa.position.set(0,.62,0); t.add(faixa); }
  t.scale.setScalar(.7); t.userData.cid=CID.id; t.userData.tipo='carro'; t.visible=false; M.scene.add(t); M.taxi=t; return t;
}
function concluirViagem(){
  const v=st.viagem; if(!v) return; st.viagem=null; M.barca.visible=false; M.luzBarca.userData.op=0; if(M.taxi) M.taxi.visible=false;
  const id=v.id;
  S.loc=id; S.trail.push(id); if(S.trail.length>14) S.trail.shift();
  traveling=null;
  enterLocation(id);
}
function confirmar(id,L){
  const box=M.cont.querySelector('.m3d-conf');
  box.innerHTML=`<p><b>${L.name}</b> fica fora do raio da tornozeleira.</p><p class="m3d-conf-s">Sair do raio aparece no relatório da ${CID.chefe} e custa Calor.</p>
    <div><button type="button" class="m3d-b m3d-ir">Ir mesmo assim</button><button type="button" class="m3d-b m3d-nao">Ficar no raio</button></div>`;
  box.hidden=false;
  box.querySelector('.m3d-ir').onclick=()=>mapa3d.viajar(id,true);
  box.querySelector('.m3d-nao').onclick=fecharConf;
}
function fecharConf(){ const b=M&&M.cont.querySelector('.m3d-conf'); if(b) b.hidden=true; }
const reduzMov=()=> menosMovimento();

/* --- entrada (arrastar, pinça, roda, toque) --- */
function ligarEntrada(){
  const c=M.canvas, ray=new THREE.Raycaster(), ndc=new THREE.Vector2(), ptr=new Map(); let arrastou=false, pinca=0, ini=null;
  const chao=(cx,cy)=>{ const r=c.getBoundingClientRect(); ndc.set(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1); ray.setFromCamera(ndc,M.cam);
    const t=-ray.ray.origin.y/ray.ray.direction.y; return ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(t)); };
  c.addEventListener('pointerdown',e=>{ c.setPointerCapture(e.pointerId); ptr.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(ptr.size===1){ arrastou=false; ini={x:e.clientX,y:e.clientY}; }
    if(ptr.size===2){ const [a,b]=[...ptr.values()]; pinca=Math.hypot(a.x-b.x,a.y-b.y); arrastou=true; } });
  c.addEventListener('pointermove',e=>{ if(!ptr.has(e.pointerId)) return; const ant=ptr.get(e.pointerId), at={x:e.clientX,y:e.clientY}; ptr.set(e.pointerId,at);
    if(ptr.size===2){ const [a,b]=[...ptr.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(pinca) st.zoomAlvo=THREE.MathUtils.clamp(st.zoomAlvo*d/pinca,.45,4); pinca=d; return; }
    if(ini && Math.hypot(at.x-ini.x,at.y-ini.y)>6){ arrastou=true; c.classList.add('arrastando'); }
    if(arrastou){ const p0=chao(ant.x,ant.y), p1=chao(at.x,at.y); st.alvo.x=THREE.MathUtils.clamp(st.alvo.x-(p1.x-p0.x),0,W); st.alvo.z=THREE.MathUtils.clamp(st.alvo.z-(p1.z-p0.z),0,H); st.alvoSuave.copy(st.alvo); st.seguir=false; } });
  const solta=e=>{ if(!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId); c.classList.remove('arrastando');
    if(!ptr.size && !arrastou && e.type==='pointerup'){ const r=c.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); ray.setFromCamera(ndc,M.cam);
      const hit=ray.intersectObjects(M.clicaveis.filter(o=>{ let p=o; while(p){ if(!p.visible) return false; p=p.parent; } return true; }),false)[0];
      if(hit && hit.object.userData.loc) mapa3d.viajar(hit.object.userData.loc); }
    if(ptr.size<2) pinca=0; };
  c.addEventListener('pointerup',solta); c.addEventListener('pointercancel',solta);
  c.addEventListener('wheel',e=>{ e.preventDefault(); st.zoomAlvo=THREE.MathUtils.clamp(st.zoomAlvo*(e.deltaY<0?1.12:1/1.12),.45,4); },{passive:false});
  M.cont.querySelector('.m3d-ctl').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; const a=b.dataset.a;
    if(a==='esq') st.azAlvo+=Math.PI/2; else if(a==='dir') st.azAlvo-=Math.PI/2;
    else if(a==='nomes'){ st.nomes=!st.nomes; b.setAttribute('aria-pressed',String(st.nomes)); M.rotulos.forEach(r=>r.visible=st.nomes); }
  });
}

/* --- quadro --- */
// cores criadas na primeira vez: o Three.js chega de forma assíncrona, depois deste módulo
let C=null, noite=1;
function hora(dt){
  if(!C) C={corSolD:new THREE.Color(0xfff0d8), corSolT:new THREE.Color(0xffb070), corLua:new THREE.Color(0xa9c2ff), hemiD:new THREE.Color(0xdfeaf5), hemiN:new THREE.Color(0x6f8fb3)};
  const {corSolD,corSolT,corLua,hemiD,hemiN}=C;
  const alvo= S.period===2 ? 1 : S.period===1 ? .42 : 0, tarde=S.period===1;
  noite+= (alvo-noite)*Math.min(1,dt*2);
  const n=noite;
  M.scene.background.copy(M.ceuDia).lerp(tarde?M.ceuTarde:M.ceuDia, tarde?.5:0).lerp(M.ceuNoite,n); M.scene.fog.color.copy(M.scene.background);
  M.scene.fog.near=THREE.MathUtils.lerp(170,128,n); M.scene.fog.far=THREE.MathUtils.lerp(320,210,n);
  M.sol.color.copy(tarde?corSolT:corSolD).lerp(corLua,n>.6?n:0); M.sol.intensity=THREE.MathUtils.lerp(2.3,.5,n);
  M.hemi.intensity=THREE.MathUtils.lerp(.85,.3,n); M.hemi.color.copy(hemiD).lerp(hemiN,n);
  const em=THREE.MathUtils.lerp(0,1.15,Math.max(0,(n-.25)/.75));
  Object.values(M.matsPredio).forEach(m=>m.emissiveIntensity=em); M.matBarraco.emissiveIntensity=em;
  Object.values(M.marcos).forEach(mc=>mc.grupo.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissiveMap) o.material.emissiveIntensity=em; }));
  M.matAgua.color.copy(M.aguaD).lerp(M.aguaN,n); M.extra.noite(n);
  M.renderer.toneMappingExposure=THREE.MathUtils.lerp(1,1.1,n);
  M.brilhos.forEach(s=>{ s.material.opacity=s.userData.op*(.15+.85*n); });
  M.luzesFixas.material.uniforms.opac.value=M.luzesCarros.material.uniforms.opac.value=.15+.85*n;
  return n;
}
let _m4=null;
function passoCarro(c,dt){
  if(!_m4) _m4=new THREE.Matrix4();
  const T=M.G.T, eh=(x,z)=>T(x,z)==='rua';
  c.t+=dt*c.v; while(c.t>=1){ c.t-=1; c.x+=c.d[0]; c.z+=c.d[1]; const op=DIRS4.filter(d=>eh(c.x+d[0],c.z+d[1]) && !(d[0]===-c.d[0]&&d[1]===-c.d[1]));
    if(op.length) c.d=(op.some(o=>o[0]===c.d[0]&&o[1]===c.d[1]) && Math.random()<.7)?c.d:op[Math.floor(Math.random()*op.length)]; else c.d=[-c.d[0],-c.d[1]]; }
  const lx=-c.d[1]*.2, lz=c.d[0]*.2, px=c.x+.5+c.d[0]*c.t+lx, pz=c.z+.5+c.d[1]*c.t+lz;
  _m4.makeRotationY(Math.atan2(c.d[0],c.d[1])); _m4.setPosition(px,.18,pz); M.imCarro.setMatrixAt(c.k,_m4); M.imCabine.setMatrixAt(c.k,_m4);
  const a=M.luzesCarros.geometry.attributes.position.array, i=c.k*6;
  a[i]=px+c.d[0]*.45; a[i+1]=.35; a[i+2]=pz+c.d[1]*.45; a[i+3]=px-c.d[0]*.35; a[i+4]=.3; a[i+5]=pz-c.d[1]*.35;
}
function passoViagem(dt){
  const v=st.viagem; if(!v) return false;
  const p=v.pernas[v.i]; if(!p){ concluirViagem(); return false; }
  if(p.tipo==='chega'){ st.pos={x:p.x,z:p.z}; st.naAgua=p.agua; v.i++; return false; }
  if(p.tipo==='pe'){
    if(v.k>=p.pts.length-1){ v.i++; v.k=0; return false; }
    const [nx,nz]=p.pts[v.k+1], dx=nx-st.pos.x, dz=nz-st.pos.z, d=Math.hypot(dx,dz), passo=dt*v.vel;
    if(d<=passo){ st.pos.x=nx; st.pos.z=nz; v.k++; } else { st.pos.x+=dx/d*passo; st.pos.z+=dz/d*passo; M.vincent.rotation.y=Math.atan2(dx,dz); }
    st.naAgua=false; M.barca.visible=false; return true;
  }
  if(p.tipo==='barco'){
    if(v.k>=p.pts.length-1){ v.i++; v.k=0; M.barca.visible=false; M.luzBarca.userData.op=0; return false; }
    if(!M.barca.visible){ M.barca.visible=true; M.barca.position.set(p.pts[0][0]+.5,.05,p.pts[0][1]+.5); M.luzBarca.userData.op=.6; }
    const [nx,nz]=p.pts[v.k+1], bx=M.barca.position.x-.5, bz=M.barca.position.z-.5, dx=nx-bx, dz=nz-bz, d=Math.hypot(dx,dz), passo=dt*Math.max(6,v.vel*1.6);
    if(d<=passo){ M.barca.position.set(nx+.5,.05,nz+.5); v.k++; } else { M.barca.position.x+=dx/d*passo; M.barca.position.z+=dz/d*passo; M.barca.rotation.y=Math.atan2(dx,dz); }
    st.pos.x=M.barca.position.x-.5; st.pos.z=M.barca.position.z-.5; st.naAgua=true; st.naBarca=true;
    M.luzBarca.position.set(M.barca.position.x,.6,M.barca.position.z);
    return true;
  }
  v.i++; return false;
}
function tornozeleira(t,emTunel){
  M.corpoV.faixa.visible=temTornozeleira();
  if(!temTornozeleira()){ M.corpoV.tornoz.material.color.setHex(0x2a2a2a); M.luzTornoz.material.opacity=0; M.cont.querySelector('.m3d-vinheta').style.opacity='0'; M.pulsos.forEach(m=>m.material.opacity=0); return; }
  const d=distBorda(st.pos.x+.5,st.pos.z+.5), est= d<0?'fora':d<RAIO.aviso?'borda':'dentro';
  const freq= est==='dentro'?1:est==='borda'?2.6:6, aceso=Math.sin(t*Math.PI*2*freq)>0, corLed= est==='dentro'?0x4cff7a:est==='borda'?0xffb040:0xff3a2a;
  M.corpoV.tornoz.material.color.setHex(aceso?corLed:0x221510); M.luzTornoz.material.color.setHex(corLed); M.luzTornoz.userData.op=0; M.luzTornoz.material.opacity= emTunel?0:(aceso?.95:.15);
  const pulso=.5+.5*Math.sin(t*(est==='fora'?7:3)), corC= est==='fora'?0xff3a2a:est==='borda'?0xffa040:0xd8b45a;
  M.matCerca.color.setHex(corC); M.matLinha.color.setHex(corC);
  M.matRestrita.opacity=.35+.25*pulso;
  M.matCerca.opacity= est==='dentro'?.2:est==='borda'?.32+.2*pulso:.45+.35*pulso; M.matLinha.opacity= est==='dentro'?.5:.75+.25*pulso; M.matAviso.opacity= est==='dentro'?.07:.15+.1*pulso;
  M.pulsos.forEach(m=>{ if(est!=='fora'||emTunel){ m.material.opacity=0; return; } const k=((t*.8+m.userData.k/3)%1); m.position.set(st.pos.x+.5,.4,st.pos.z+.5); m.scale.setScalar(.5+k*5); m.material.opacity=(1-k)*.8; });
  M.cont.querySelector('.m3d-vinheta').style.opacity= est==='fora'?String(.5+.3*pulso):est==='borda'?'.15':'0';
  if(est!==st.tz || t-st.ultimoT>.25){ st.tz=est; st.ultimoT=t;
    const box=M.cont.querySelector('.m3d-tz'); box.className='m3d-tz '+est;
    box.querySelector('.m3d-tz-est').textContent= est==='dentro'?'Dentro do raio':est==='borda'?'Perto da borda':'Fora do raio — sinal enviado';
    const metros=Math.round(Math.abs(d)*CID.metros), txt= metros>=1000?(metros/1000).toFixed(1)+' km':metros+' m';
    box.querySelector('.m3d-tz-dist').textContent= d>=0 ? txt+' até a borda' : txt+' além da borda';
    const bd=box.querySelector('.m3d-bd'); bd.style.width=Math.max(0,Math.min(100,d/12*100))+'%'; bd.style.background= est==='dentro'?'#5FA08C':est==='borda'?'#C98B3A':'#BE4A33';
    box.querySelector('.m3d-led').style.background= aceso?'#'+corLed.toString(16).padStart(6,'0'):'#2a1a12'; }
}
const relogio={ant:0};
function quadro(ts){
  if(!st.ativo) return;
  if(!M.cont.isConnected){ st.ativo=false; return; }      // o jogo trocou de tela: pausa
  if(telaCoberta()){ relogio.ant=0; st.raf=requestAnimationFrame(quadro); return; }   // mesa ou minigame por cima: não desenha
  const t=ts/1000, dtReal=Math.min(.5, relogio.ant? t-relogio.ant : .016), dt=Math.min(.05,dtReal); relogio.ant=t;
  const n=hora(dt);
  if(!reduzMov()){ const a=M.aguaPos.array, b=M.aguaBase; for(let k=0;k<a.length;k+=3) a[k+1]=b[k+1]+Math.sin(b[k]*.7+t*1.3)*.035+Math.cos(b[k+2]*.9+t*1.1)*.03; M.aguaPos.needsUpdate=true; M.espuma.material.opacity=.35+.25*Math.sin(t*1.7); }
  M.carros.forEach(c=>passoCarro(c,dt)); M.imCarro.instanceMatrix.needsUpdate=true; M.imCabine.instanceMatrix.needsUpdate=true; M.luzesCarros.geometry.attributes.position.needsUpdate=true;
  M.barcos.forEach(b=>{ b.a+=dt*b.v; const x=b.cx+Math.cos(b.a)*b.r, z=b.cz+Math.sin(b.a)*b.r; b.g.position.set(x,0,z); b.g.rotation.y=-b.a; b.luz.position.set(x,.45,z); });
  M.extra.animar(t,dt);
  Object.values(M.marcos).forEach((mc,k)=>{ mc.med.position.y=mc.baseY+(reduzMov()?0:Math.sin(t*1.6+k)*.12);
    if(mc.halo.visible){ const s=1+.06*Math.sin(t*2.4+k); mc.halo.scale.set(s,s,s); mc.halo.material.opacity=.55+.35*Math.sin(t*2.4+k)**2; } });
  st.naBarca=false;
  const andando=passoViagem(dtReal);
  const T=M.G.T, tt=T(Math.round(st.pos.x),Math.round(st.pos.z)), tunel=tt==='tunel', naBarca=st.naBarca;
  const yV= st.naAgua ? (naBarca?.42:.3) : tt==='ponte'?.38:.18;
  const cv=M.corpoV, emTaxi=!!(st.viagem&&st.viagem.taxi), vc= emTaxi ? taxiDaCidade() : cv.veic, dirige=!!vc && andando && !naBarca, moto=vc && vc.userData.tipo==='moto';
  if(cv.veic && emTaxi) cv.veic.visible=false;
  M.vincent.visible=!tunel && !naBarca && !(dirige && !moto); M.anel.visible=!tunel;
  st.fase=(st.fase||0)+(andando&&!naBarca&&!dirige?dt*11:0);
  // na moto ele vai sentado no banco; de carro some dentro dele
  const ySela= dirige&&moto ? vc.userData.assento.y*1.15-.575 : 0;
  M.vincent.position.set(st.pos.x+.5,yV+ySela+(andando&&!naBarca&&!dirige?Math.abs(Math.sin(st.fase))*.05:0),st.pos.z+.5);
  const bal=andando&&!naBarca&&!dirige?Math.sin(st.fase)*.6:0;
  cv.pE.rotation.x= dirige ? -1.35 : bal; cv.pD.rotation.x= dirige ? -1.35 : -bal; cv.quadril.position.y= dirige ? .5 : .9;
  cv.bE.rotation.x= dirige ? -1.1 : -.08-bal*.8; cv.bD.rotation.x= dirige ? -1.1 : -.08+bal*.8;
  if(vc){ vc.visible=!tunel && !naBarca;
    if(dirige){ vc.position.set(st.pos.x+.5,yV,st.pos.z+.5); vc.rotation.y=M.vincent.rotation.y; if(moto){ const a=vc.userData.assento.z*1.15; M.vincent.position.x+=Math.sin(vc.rotation.y)*a; M.vincent.position.z+=Math.cos(vc.rotation.y)*a; } }
    else if(emTaxi){ vc.visible=false; }
    else { vc.position.set(st.pos.x+.5+(moto?1:1.6),yV,st.pos.z+.5+.4); vc.rotation.y=Math.PI*.5; } }
  M.anel.position.set(st.pos.x+.5,yV+.02,st.pos.z+.5); M.anel.material.opacity=.45+.35*Math.sin(t*3)**2;
  M.luzTornoz.position.set(st.pos.x+.6,yV+.12,st.pos.z+.5);
  tornozeleira(t,tunel||naBarca);
  if(st.seguir) st.alvo.set(st.pos.x+.5,0,st.pos.z+.5);
  st.alvoSuave.lerp(st.alvo,Math.min(1,dt*3));
  st.az+=(st.azAlvo-st.az)*Math.min(1,dt*5); st.zoom+=(st.zoomAlvo-st.zoom)*Math.min(1,dt*6);
  const cam=M.cam, d=120, el=THREE.MathUtils.degToRad(52), w=M.canvas.clientWidth||1, h=M.canvas.clientHeight||1, asp=w/h, metade=14;
  cam.left=-metade*asp; cam.right=metade*asp; cam.top=metade; cam.bottom=-metade; cam.zoom=st.zoom; cam.updateProjectionMatrix();
  cam.position.set(st.alvoSuave.x+Math.sin(st.az)*Math.cos(el)*d, Math.sin(el)*d, st.alvoSuave.z+Math.cos(st.az)*Math.cos(el)*d); cam.lookAt(st.alvoSuave);
  const fz=1.3/Math.max(st.zoom,.45); M.rotulos.forEach(r=>r.scale.set(r.userData.base[0]*fz,r.userData.base[1]*fz,1));
  const ppu=M.renderer.domElement.height*st.zoom/(2*metade); M.luzesFixas.material.uniforms.escala.value=M.luzesCarros.material.uniforms.escala.value=ppu;
  M.sol.target.position.set(st.alvoSuave.x,0,st.alvoSuave.z);
  M.sol.position.set(st.alvoSuave.x+THREE.MathUtils.lerp(70,-30,n), THREE.MathUtils.lerp(80,60,n), st.alvoSuave.z+THREE.MathUtils.lerp(-10,-20,n));
  M.renderer.render(M.scene,cam);
  st.raf=requestAnimationFrame(quadro);
}
function redimensionar(){ if(!M) return; const w=M.cont.clientWidth, h=M.cont.clientHeight; if(w&&h) M.renderer.setSize(w,h,false); }
window.addEventListener('resize',redimensionar);

/* chamado depois de cada render() do jogo */
mapa3d.aposRender=function(){
  const slot=document.getElementById('mapa3d-slot');
  if(!slot){ st.ativo=false; return; }
  try{
    const c=cidadeDe(S.season);
    if(c!==CID || !M){   // mudou de cidade (Rio → São Paulo): outro mundo, a câmera volta para o Vincent
      entrarCidade(c); st.viagem=null; st.alvo=st.alvoSuave=null; st.seguir=true; exclusoes=[];
      M=MUNDOS[c.id] || (MUNDOS[c.id]=montarMundo()); if(!M.ligado){ ligarEntrada(); M.ligado=true; } }
    if(M.corpoV.ver!==window.figurino.versao) M.corpoV=vestirVincent(M.vincent);   // trocou de roupa no apartamento
  }catch(e){ mapa3d.falhou=true; console.error('Mapa 3D indisponível:',e); render(); return; }
  slot.appendChild(M.cont);
  fecharConf();
  sincronizar();
  redimensionar();
  M.rotulos.forEach(r=>r.visible=st.nomes);
  if(!st.ativo){ noite= S.period===2 ? 1 : S.period===1 ? .42 : 0;   // abre já na luz do período, sem transição
    st.ativo=true; relogio.ant=0; st.raf=requestAnimationFrame(quadro); }
};
mapa3d._estado=st; mapa3d._mundo=()=>M;
/* API para o Advocatus */
window.cidade3d={
  disponivel:()=>mapa3d.usar(),
  /* monta (ou remonta) o mapa dentro de `slot`.
     opts.lugares: {id:{name, g (sigla do medalhão), zone}}
     opts.posicoes: {escritorio:{x,z}, casa:{x,z}} (opcional)
     opts.destaques: ids com algo esperando (halo dourado)
     opts.aoChegar(id): chamado quando o advogado chega ao lugar */
  montar(slot, opts){
    OPTS=Object.assign({lugares:{},destaques:new Set(),aoChegar(){},avatar:{}}, opts||{});
    if(!(OPTS.destaques instanceof Set)) OPTS.destaques=new Set(OPTS.destaques||[]);
    let mudou=false;
    for(const k in (opts&&opts.posicoes)||{}){ const p=opts.posicoes[k], L=LUGARES_RIO[k];
      if(L && (L.x!==p.x || L.z!==p.z)){ L.x=p.x; L.z=p.z; mudou=true; } }
    if(mudou && MUNDOS.rio){   // mudou de casa ou de escritório: o mundo é refeito com o prédio no lugar novo
      st.ativo=false; cancelAnimationFrame(st.raf);
      try{ MUNDOS.rio.renderer.dispose(); MUNDOS.rio.renderer.forceContextLoss(); }catch(e){}
      MUNDOS.rio.cont.remove(); delete MUNDOS.rio; M=null; }
    try{ const salvo=localStorage.getItem('advocatus_cidade_loc'); if(salvo && OPTS.lugares[salvo]) { S.loc=salvo; S.trail=[salvo]; } }catch(e){}
    S.period=PERIODO(); traveling=null; mode='map';
    slot.id='mapa3d-slot'; mapa3d.aposRender();
  },
  ir(id){ mapa3d.viajar(id,true); },
  /* atualiza halos (ids com algo esperando) e, opcionalmente, nomes/siglas dos medalhões */
  atualizar(destaques, lugares){
    OPTS.destaques=new Set(destaques||[]);
    if(lugares) for(const k in lugares) if(OPTS.lugares[k]) Object.assign(OPTS.lugares[k], lugares[k]);
    if(M && M.cont && M.cont.isConnected) sincronizar();
  },
  parar(){ st.ativo=false; },
  _tile(x,z){ return M && M.G ? M.G.T(x,z) : null; }   // para testes
};
})();
