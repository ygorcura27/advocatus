/**
 * WIKI & AJUDA — Advocatus Online
 * Guia de referência em linguagem simples, sem fórmulas/números internos —
 * só o suficiente pra qualquer jogador entender o que cada tela faz e como
 * usar. Conteúdo estático (não lê Firestore), renderizado direto em
 * #main-content via window.renderWiki, chamado por js/ui-main.js quando o
 * painel ativo é 'wiki'.
 */

'use strict';

const WIKI_DADOS = [
  {
    cat: 'Primeiros Passos', icone: '🚀',
    artigos: [
      { t: 'O que é o Advocatus Online',
        c: 'Você joga um(a) advogado(a) construindo carreira do zero: estuda, pega processos, ganha reputação, sobe de cargo, e pode eventualmente abrir seu próprio escritório e contratar equipe. O jogo avança em meses — cada "Avançar Mês" processa tudo que você preparou e mostra os resultados.' },
      { t: 'O menu lateral',
        c: 'As seções ficam agrupadas por tema: Carreira (perfil, energia, foco, escritório, processos, progressão), Desenvolvimento (petições, habilidades, cursos, pós-graduação, artigos & livros, redes/imprensa, concurso), Vida (patrimônio, investimentos, loja, vida pessoal) e Social (redes sociais, vagas, rankings, mensagens). Se não souber onde algo fica, comece pelo Perfil — ele resume o essencial.' },
      { t: 'Avançando o mês',
        c: 'O botão "Avançar Mês" fecha o mês atual: processa seus processos e da sua equipe, paga (ou cobra) salários e custos, aplica estudo/pós-graduação em andamento, atualiza estresse e reputação, e libera novas oportunidades. Vale a pena revisar processos pendentes e energia alocada antes de avançar.' },
    ],
  },
  {
    cat: 'Carreira & Progressão', icone: '📈',
    artigos: [
      { t: 'Cargos e como subir',
        c: 'Você começa como Estagiário/Júnior e sobe de cargo conforme acumula reputação suficiente no cargo atual. Cada cargo tem um teto de reputação — ao bater nesse teto você fica elegível pra promoção. Cargos mais altos abrem processos maiores e melhores oportunidades, mas também cobram mais.' },
      { t: 'Reputação',
        c: 'Reputação é sua "nota geral" na carreira. Sobe vencendo casos, entregando bom trabalho e mantendo boa relação com clientes; cai com derrotas e problemas. É o principal medidor de progresso pessoal.' },
      { t: 'Território — reputação por comarca',
        c: 'Além da reputação geral, você acumula reputação separada em cada comarca (região) onde atua — vitórias locais contam pra reputação daquela comarca especificamente. Dá pra ver o mapa completo no Perfil, seção Território.' },
      { t: 'Atributos',
        c: 'Seis atributos de personagem (Charm, Inteligência, Retórica, Raciocínio Jurídico, Aparência, Constituição) aparecem no Perfil como parte da sua ficha. Hoje a maioria é só informativa; o jogo vai ligando mais efeitos neles com o tempo.' },
    ],
  },
  {
    cat: 'Energia & Bem-Estar', icone: '⚡',
    artigos: [
      { t: 'Energia por categoria',
        c: 'Sua energia mensal é dividida em "baldes" por tipo de atividade: Processos, Supervisão (gerir sua equipe), Estudo, Captação (buscar clientes/oportunidades), Pessoal e Descanso. Na tela Energia você decide quanto alocar em cada balde no início do mês — cada ação real consome do balde correspondente.' },
      { t: 'Estresse, Saúde Mental e Disposição',
        c: 'Três medidores acompanham seu bem-estar. Estresse alto atrapalha seu desempenho e, em excesso, pode levar a burnout — cuide dele com descanso, férias e boas decisões. Saúde Mental e Disposição também influenciam sua qualidade de trabalho ao longo do mês.' },
      { t: 'Foco do mês',
        c: 'Você pode travar um "foco" mensal (estudar, escrever petição, curso, trabalhar intensamente, etc.) — fica marcado até você trocar e ajuda a lembrar sua prioridade do mês. É só um lembrete pessoal; a ação real ainda acontece na tela específica de cada sistema.' },
    ],
  },
  {
    cat: 'Habilidades', icone: '🎓',
    artigos: [
      { t: 'Habilidades gerais x jurídicas',
        c: 'Habilidades gerais (oratória, negociação, pesquisa, gestão etc.) afetam seu desempenho amplo. Habilidades jurídicas (Redação, Pesquisa Jurídica, tipos de peça, áreas do Direito) definem a qualidade das suas petições e argumentos em processos daquela matéria específica.' },
      { t: 'Estudar uma habilidade',
        c: 'Na tela Habilidades, escolha uma habilidade e clique em Estudar — isso custa energia da categoria Estudo e um valor em dinheiro, e o ganho aparece no mês seguinte. Dá pra ter várias habilidades diferentes em estudo ao mesmo tempo, dependendo de quanta energia de Estudo você alocou.' },
      { t: 'OAB / Exame da Ordem',
        c: 'Antes de atuar como advogado(a) pleno, você precisa passar no Exame da Ordem. Prepare-se estudando as habilidades relacionadas antes de tentar.' },
    ],
  },
  {
    cat: 'Petições & Peças', icone: '📄',
    artigos: [
      { t: 'Compor uma petição',
        c: 'Petições, teses e outras peças são "encomendadas" na tela Petições — você escolhe o tipo, a área do Direito, e ela fica em composição por um tempo antes de ficar pronta pra uso. A qualidade final depende das suas habilidades jurídicas no momento em que ela termina.' },
      { t: 'Repertório do escritório',
        c: 'Peças podem ser compartilhadas com o repertório do seu escritório, ficando disponíveis pra qualquer sócio ou membro usar em processos — útil pra não depender só das suas próprias peças.' },
      { t: 'Mercado de petições',
        c: 'Também é possível colocar peças à venda no Mercado pra outros jogadores comprarem, e comprar peças prontas de terceiros quando precisar de algo que ainda não tem.' },
      { t: 'Montando a Setlist de um processo',
        c: 'Quando um processo pede sua argumentação, você monta uma "setlist": uma sequência de peças e ações processuais pra aquele caso específico. Só entram peças da mesma área do Direito do processo (uma petição Tributária não serve pra um processo Cível, por exemplo).' },
    ],
  },
  {
    cat: 'Processos & Julgamento', icone: '⚖️',
    artigos: [
      { t: 'Aceitar um processo',
        c: 'Processos aparecem como oportunidades — você pode assumir pessoalmente (gasta sua energia, fica com o crédito e o valor) ou delegar a um funcionário do seu escritório (gasta menos da sua energia, mas o funcionário fica com parte do resultado).' },
      { t: 'Investigação',
        c: 'Em processos mais elaborados, antes de ir a julgamento você percorre uma fase de investigação: entrevistas, perícias, análise de documentos e favores com contatos, reunindo material pra fortalecer seu caso.' },
      { t: 'Audiência e Julgamento',
        c: 'Depois da investigação e da montagem da peça/setlist, o processo vai a julgamento. O resultado (procedente, parcial ou improcedente) depende da força do que você preparou frente à outra parte.' },
      { t: 'Recurso',
        c: 'Se o resultado não foi favorável (ou a parte contrária recorreu), o processo pode entrar em fase de recurso — você monta uma nova setlist, agora pra instância superior, e o caso é julgado de novo.' },
    ],
  },
  {
    cat: 'Escritório Próprio', icone: '🏢',
    artigos: [
      { t: 'Abrindo seu escritório',
        c: 'Ao juntar reputação e recursos suficientes, você pode abrir seu próprio escritório em vez de trabalhar pra outro. Isso libera contratação de equipe, caixa próprio e progressão de tier.' },
      { t: 'Tiers e upgrade',
        c: 'O escritório evolui por tiers (portes), cada um liberando mais vagas de equipe e capacidade. Subir de tier exige capital acumulado, reputação do escritório e tempo de carreira — acompanhe o progresso na própria tela do Escritório.' },
      { t: 'Caixa, capital e distribuição de lucros',
        c: 'O escritório tem um caixa separado do seu dinheiro pessoal — é dele que saem salários e custos fixos, e nele entram os honorários. Você pode aportar capital pessoal no caixa, ou distribuir lucros do caixa entre os sócios.' },
      { t: 'Sócios e Assembleia',
        c: 'Escritórios podem ter mais de um sócio, cada um com uma participação. Decisões importantes passam pela Assembleia de Sócios.' },
      { t: 'Marketing e Benefícios',
        c: 'Investir em marketing atrai mais oportunidades pro escritório. Benefícios (plano de saúde, vale-refeição, bônus por performance etc.) custam do caixa todo mês, mas reduzem o estresse da equipe e melhoram o clima interno.' },
    ],
  },
  {
    cat: 'Equipe (Funcionários)', icone: '👥',
    artigos: [
      { t: 'Contratando funcionários',
        c: 'Na tela Equipe (ou Contratação), você abre vagas por cargo — quanto maior o porte do escritório, melhores os candidatos e salários disponíveis. Cada funcionário tem suas próprias habilidades, que evoluem com o tempo.' },
      { t: 'Salário, aumento e bônus',
        c: 'O salário de cada funcionário acompanha o porte do escritório. Se ficar muito abaixo do mercado por muito tempo, isso gera estresse nele. Você pode oferecer um aumento (o funcionário pode aceitar ou recusar, dependendo de quão boa é a oferta e da relação com ele) ou dar um bônus pontual, sem negociação.' },
      { t: 'Estresse, férias e conflitos',
        c: 'Funcionários acumulam estresse por sobrecarga, salário defasado, falta de férias ou desentendimentos entre colegas. Estresse muito alto por muito tempo pode levar o funcionário a pedir demissão. Conceder férias e mediar conflitos ajuda a manter a equipe saudável.' },
      { t: 'Promoção e mentoria',
        c: 'Funcionários elegíveis podem ser promovidos de cargo, com uma nova proposta de salário que eles aceitam ou não. Funcionários mais experientes também podem mentorar os mais novos, acelerando o desenvolvimento deles.' },
      { t: 'Delegar processos e oportunidades',
        c: 'Em vez de tocar tudo pessoalmente, você pode designar processos e oportunidades do mês pra membros da equipe — gasta energia de Supervisão em vez de Processos, e fica de olho na energia disponível de cada funcionário pra não sobrecarregar ninguém.' },
    ],
  },
  {
    cat: 'Carreira Acadêmica', icone: '🎓',
    artigos: [
      { t: 'Pós-graduação',
        c: 'Mestrado, Doutorado e Cátedra são trilhas acadêmicas opcionais que exigem tempo, dedicação e a entrega de um trabalho final (dissertação/tese) pra concluir. Concluir um grau abre acesso a escrever artigos e livros, entre outros benefícios de prestígio.' },
      { t: 'Artigos e Livros',
        c: 'Com o grau acadêmico necessário, você pode escrever artigos (Mestrado+) e livros (Doutorado+). Eles não usam fama como as petições — em vez disso acumulam citações, que constroem seu prestígio acadêmico. Livros publicados no Mercado também rendem uma renda mensal enquanto estiverem em circulação.' },
    ],
  },
  {
    cat: 'Emprego & Vagas', icone: '💼',
    artigos: [
      { t: 'Trabalhar num escritório de terceiros',
        c: 'Se ainda não tem (ou não quer) escritório próprio, dá pra trabalhar como empregado(a) num escritório NPC ou de outro jogador — você recebe salário fixo e atua sob a estrutura deles.' },
      { t: 'Convites e candidaturas',
        c: 'Vagas abertas aparecem na tela Vagas, e você também pode receber convites diretos (de sócios, escritórios NPC etc.) na caixa de entrada. Aceitar um convite ou candidatura te move pro novo escritório automaticamente.' },
      { t: 'Correspondentes',
        c: 'Correspondentes são parcerias com escritórios de outras comarcas — uma forma de ter presença ou renda extra em regiões onde você não atua diretamente.' },
    ],
  },
  {
    cat: 'Vida & Patrimônio', icone: '🏠',
    artigos: [
      { t: 'Patrimônio',
        c: 'Sua moradia, transporte e estrutura pessoal de trabalho afetam sua reputação e conforto. Melhorar esses itens custa dinheiro, mas traz retorno em imagem e produtividade.' },
      { t: 'Investimentos & Financeiro',
        c: 'Uma vez com dinheiro sobrando, dá pra investir e acompanhar sua situação financeira pessoal com mais detalhe nesta tela.' },
      { t: 'Vida Pessoal',
        c: 'Cobre decisões e eventos da vida fora do trabalho — relacionamentos, família e outras escolhas pessoais que também repercutem na carreira.' },
      { t: 'Loja',
        c: 'Itens e serviços variados que você pode comprar pra si mesmo, com efeitos que vão de conforto a reputação.' },
    ],
  },
  {
    cat: 'Social & Imagem Pública', icone: '📣',
    artigos: [
      { t: 'Redes Sociais',
        c: 'Postar em redes sociais gera engajamento com chance de viralizar, o que ajuda sua imagem pública e comunicação com a mídia.' },
      { t: 'Imprensa',
        c: 'Cobre sua relação com veículos de imprensa — cobertura de casos grandes, entrevistas e como isso repercute na sua reputação.' },
      { t: 'Rankings',
        c: 'Mostra como você se compara a outros jogadores (e a NPCs) em reputação, vitórias e outras métricas de destaque.' },
    ],
  },
  {
    cat: 'Concurso Público', icone: '🏛️',
    artigos: [
      { t: 'O que é',
        c: 'Uma trilha de carreira alternativa pra quem quer seguir como magistrado(a), promotor(a), defensor(a) ou outro cargo público, em vez da advocacia privada. Exige preparação nas habilidades certas antes de tentar.' },
    ],
  },
];

function _wikiArtigoHtml(a, catIdx, artIdx) {
  const searchBlob = (a.t + ' ' + a.c).toLowerCase();
  return `
    <details class="wiki-artigo" data-busca="${searchBlob.replace(/"/g, '&quot;')}" style="margin-bottom:.4rem;background:var(--surface2,var(--bg2));border-radius:6px;padding:.15rem .7rem">
      <summary style="cursor:pointer;font-size:.8rem;font-weight:600;color:var(--txt);padding:.5rem 0">${a.t}</summary>
      <div style="font-size:.76rem;color:var(--txt3);line-height:1.6;padding:0 0 .7rem 0">${a.c}</div>
    </details>`;
}

function _wikiCategoriaHtml(cat, catIdx) {
  return `
    <div class="wiki-categoria" data-cat="${catIdx}" style="margin-bottom:1.1rem">
      <div class="secao-header" style="margin-bottom:.4rem">
        <div class="secao-titulo">${cat.icone} ${cat.cat}</div>
      </div>
      ${cat.artigos.map((a, i) => _wikiArtigoHtml(a, catIdx, i)).join('')}
    </div>`;
}

window.renderWiki = function(j, el) {
  el.innerHTML = `
    ${window._capaHeader ? window._capaHeader('AJUDA · ADVOCATUS ONLINE', '❓ Wiki & Ajuda',
      '<span class="pill pill-oab">Guia rápido, sem números nem fórmulas</span>')
      : `<div class="secao-header"><div class="secao-titulo">❓ Wiki & Ajuda</div></div>`}
    <div class="card" style="margin-bottom:1rem;font-size:.74rem;color:var(--txt3);line-height:1.6">
      Guia rápido de cada sistema do jogo, em linguagem simples. Não entra em números exatos, fórmulas
      ou cálculos internos — só o suficiente pra você entender pra que serve cada tela e como usá-la.
      Clique num tópico pra abrir, ou busque abaixo.
    </div>
    <div class="card" style="margin-bottom:1.2rem">
      <input type="text" id="wiki-busca" placeholder="🔎 Buscar (ex: energia, salário, processo, escritório...)"
        oninput="window._wikiFiltrar(this.value)"
        style="width:100%;padding:.6rem .7rem;border-radius:6px;border:1px solid var(--borda-sub,#ccc);background:var(--bg2);color:var(--txt);font-size:.8rem;box-sizing:border-box">
    </div>
    <div id="wiki-conteudo">${WIKI_DADOS.map((cat, i) => _wikiCategoriaHtml(cat, i)).join('')}</div>
    <div id="wiki-sem-resultado" style="display:none;text-align:center;color:var(--txt4);padding:2rem;font-size:.8rem">
      Nada encontrado. Tenta outra palavra.
    </div>`;
};

window._wikiFiltrar = function(termoRaw) {
  const termo = (termoRaw || '').trim().toLowerCase();
  const categorias = document.querySelectorAll('#wiki-conteudo .wiki-categoria');
  let algumaVisivel = false;

  categorias.forEach(catEl => {
    const artigos = catEl.querySelectorAll('.wiki-artigo');
    let catTemMatch = false;
    artigos.forEach(artEl => {
      const bate = !termo || (artEl.dataset.busca || '').includes(termo);
      artEl.style.display = bate ? '' : 'none';
      artEl.open = !!termo && bate; // abre automático só durante busca ativa
      if (bate) catTemMatch = true;
    });
    catEl.style.display = catTemMatch ? '' : 'none';
    if (catTemMatch) algumaVisivel = true;
  });

  const semResultado = document.getElementById('wiki-sem-resultado');
  if (semResultado) semResultado.style.display = algumaVisivel ? 'none' : '';
};
