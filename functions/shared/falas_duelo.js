'use strict';

/**
 * FALAS DA AUDIÊNCIA COMO DUELO — templates em pt-BR.
 * Usado por functions/duelo_motor.js. Cada fala do adversário já sugere o
 * tipo de argumento (quem lê com atenção percebe), mesmo quando a interface
 * não mostra o tipo explicitamente.
 */

function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }
const parte = (p) => p?.reu || p?.autor || 'a parte contrária';
const _fmt = (v) => `R$ ${Math.round(v || 0).toLocaleString('pt-BR')}`;

const ATAQUE = {
  prova_documental: [
    'Excelência, o contrato juntado à fl. 32 nunca foi assinado pela parte. Não há prova do vínculo.',
    'Os extratos anexados demonstram que os pagamentos foram feitos — o débito alegado não existe.',
    'Peço atenção ao e-mail de março: ali a própria parte autora reconhece que estava ciente das condições.',
    'A nota fiscal apresentada é posterior ao fato. O documento simplesmente não prova o que se alega.',
  ],
  prova_pericial: [
    'O laudo do assistente técnico é claro: o defeito decorre de mau uso, não de vício do produto.',
    'A perícia contábil refez os cálculos e não encontrou a diferença apontada na inicial.',
    'O perito do juízo afasta o nexo causal. Sem nexo, não há dever de indenizar.',
  ],
  testemunho: [
    'A testemunha arrolada pela parte trabalhava para ela até o mês passado. O depoimento é parcial.',
    'Temos aqui o depoimento de quem presenciou tudo — e ele contradiz frontalmente a versão contrária.',
    'O próprio preposto admitiu, em audiência anterior, que a orientação veio da gerência.',
  ],
  precedente: [
    'O Superior Tribunal de Justiça já pacificou a matéria em sentido contrário ao pedido.',
    'Há precedente recente desta mesma vara, em caso idêntico, julgando improcedente a pretensão.',
    'A súmula aplicável é clara, Excelência, e não comporta a leitura forçada que se tenta fazer.',
  ],
  aspecto_processual: [
    'Preliminarmente, a petição inicial é inepta: o pedido não decorre logicamente da narração dos fatos.',
    'Há ilegitimidade passiva. Quem deveria responder por isso é a empresa controladora, não o meu cliente.',
    'A parte inovou em réplica, trazendo fato novo sem oportunizar o contraditório.',
  ],
  prazo: [
    'A pretensão está prescrita, Excelência. O prazo trienal se esgotou antes do ajuizamento.',
    'A juntada desses documentos é intempestiva. A fase de instrução já se encerrou.',
    'O recolhimento das custas foi feito fora do prazo. Requeiro o reconhecimento da deserção.',
  ],
  agressivo: [
    'Com todo respeito, esta ação é uma aventura jurídica. A parte quer enriquecer às custas do meu cliente!',
    'O colega está tentando confundir o juízo com uma narrativa que não para em pé.',
    'É lamentável ver a advocacia usada para pressionar quem cumpre a lei, Excelência.',
  ],
};

const ESTILO_ABERTURA = {
  agressivo: ['', '— dispara, sem tirar os olhos de você.'],
  tecnico:   ['', '— lê com calma das próprias anotações.'],
  teatral:   ['', '— vira-se para a sala, como se houvesse um júri.'],
  burocrata: ['', '— folheia o processo, quase entediado.'],
};

function ataque(tipo, estilo, p, rng) {
  const base = pick(ATAQUE[tipo] || ATAQUE.prova_documental, rng);
  const cauda = pick(ESTILO_ABERTURA[estilo] || [''], rng);
  return `${base}${cauda ? ' ' + cauda : ''}`.replace('a parte contrária', parte(p));
}

function abertura(nomeJuiz, p) {
  return `${nomeJuiz}: Declaro aberta a audiência de instrução e julgamento${p?.titulo ? ` — ${p.titulo}` : ''}. Pela ordem, a palavra é da parte contrária.`;
}

const ARGUMENTAR = {
  testemunho:       ['O depoimento colhido nos autos é coerente do começo ao fim, Excelência.', 'A testemunha estava lá. Viu, ouviu e descreveu cada detalhe sem hesitar.'],
  prova_documental: ['Os documentos falam por si: está tudo registrado, datado e assinado.', 'Peço que Vossa Excelência confronte as datas — a cronologia confirma a nossa tese.'],
  prova_pericial:   ['O laudo técnico não deixa margem para dúvida.', 'A perícia mediu, calculou e concluiu. Não há como afastar essa prova.'],
  jurisprudencia:   ['Este escritório sustenta essa tese há anos — e os tribunais têm acolhido.', 'A jurisprudência consolidada caminha exatamente nesse sentido.'],
  precedente:       ['O precedente é vinculante e se aplica ao caso como uma luva.'],
};

function argumentar(c, estado, blefe) {
  if (blefe) return 'E posso afirmar, Excelência, que há nos autos prova cabal disso — basta conferir.';
  return pick(ARGUMENTAR[c.tipo] || ARGUMENTAR.prova_documental);
}

function contestar(c, total) {
  return total
    ? `Excelência, ${c.nome.toLowerCase()} juntado(a) aos autos desmente exatamente o que o colega acabou de dizer.`
    : `A parte contrária ignora ${c.nome.toLowerCase()} constante dos autos, que no mínimo enfraquece essa versão.`;
}

const REACAO_BOA = {
  formalista: 'Anotado. Está nos autos, e é o que importa.',
  garantista: 'O contraditório está sendo bem exercido. Prossiga.',
  humanista: 'Isso me parece relevante para entender o que de fato aconteceu.',
  pragmatico: 'Objetivo. Gosto disso. Continue.',
};
const REACAO_RUIM = {
  formalista: 'Doutor, atenha-se ao que consta dos autos.',
  pragmatico: 'Vamos ao ponto, doutor. O tempo da pauta é curto.',
  humanista: 'Isso não me ajuda a entender o caso concreto.',
};
function reacaoJuiz(classe, fator, rng = Math.random) {
  if (fator >= 1.4 && rng() < 0.6) return REACAO_BOA[classe] || 'Prossiga, doutor.';
  if (fator <= 0.6 && rng() < 0.6) return REACAO_RUIM[classe] || 'Hum. Prossiga.';
  return null;
}

function objecaoIndeferida(classe) {
  return classe === 'formalista' ? 'Indeferida. E fundamente melhor da próxima vez, doutor.' : 'Indeferida. Prossiga, doutor.';
}
function juizIrritado() { return 'Doutores, minha paciência tem limite. Sejam objetivos ou encerro a instrução.'; }
function exposta(nomeCarta) { return `Excelência, ${nomeCarta.toLowerCase()} da parte contrária foi obtido(a) de forma irregular! Requeiro o desentranhamento.`; }
function ofertaAcordo(valor) { return `Meu cliente está disposto a fechar um acordo. Honorários na casa de ${_fmt(valor)} para encerrarmos hoje.`; }
function homologaAcordo() { return 'Homologo o acordo para que produza seus efeitos. Está encerrada a audiência.'; }
function sentenca(resultado) {
  return {
    procedente: 'Diante do exposto, JULGO PROCEDENTE o pedido.',
    parcial: 'Diante do exposto, JULGO PARCIALMENTE PROCEDENTE o pedido.',
    improcedente: 'Diante do exposto, JULGO IMPROCEDENTE o pedido.',
  }[resultado] || 'Os autos vêm conclusos para sentença.';
}

module.exports = {
  ataque, abertura, argumentar, contestar, reacaoJuiz, objecaoIndeferida,
  juizIrritado, exposta, ofertaAcordo, homologaAcordo, sentenca,
};
