/**
 * BANCO DE PEÇAS PROCESSUAIS — Advocatus Online
 * Para cada tipo de caso: peça correta, peça parcial, peças erradas
 * Usado na primeira pergunta ao abrir uma ação no processo
 */

// Estrutura de cada entrada:
// {
//   caso: string (nome do tipo de caso),
//   area: string (especialidade),
//   instancia: [1,2,3,4] (em quais instâncias aparece),
//   correta: { peca, justificativa },
//   parcial: { peca, justificativa },  // às vezes pode funcionar
//   erradas: [{ peca, motivo }]        // claramente inadequadas
// }

export const BANCO_PECAS = [

  // ══════════════════════════════════════════════════════
  // TRIBUTÁRIO
  // ══════════════════════════════════════════════════════
  {
    caso: 'Execução Fiscal',
    area: 'tributario', instancia: [1],
    correta:  { peca: 'Embargos à Execução Fiscal', justificativa: 'Meio de defesa típico do executado na LEF (art. 16), exige garantia do juízo.' },
    parcial:  { peca: 'Exceção de Pré-Executividade', justificativa: 'Cabível apenas para vícios cognoscíveis de ofício (Súmula 393/STJ), sem necessidade de garantia, mas de alcance limitado.' },
    erradas:  [
      { peca: 'Ação Rescisória', motivo: 'Serve para desconstituir coisa julgada, não para defesa em execução fiscal.' },
      { peca: 'Mandado de Segurança Preventivo', motivo: 'Não é o meio adequado quando já ajuizada a execução.' },
    ],
  },
  {
    caso: 'Repetição de Indébito',
    area: 'tributario', instancia: [1],
    correta:  { peca: 'Ação de Repetição de Indébito Tributário', justificativa: 'Ação própria para restituição de tributo pago indevidamente (CTN art. 165).' },
    parcial:  { peca: 'Mandado de Segurança com pedido liminar', justificativa: 'Cabível apenas para tributos futuros (preventivo), não para repetição de valores já pagos.' },
    erradas:  [
      { peca: 'Embargos à Execução', motivo: 'Serve para defesa na execução fiscal, não para restituição de valores.' },
      { peca: 'Ação Popular', motivo: 'Instrumento de cidadania contra atos lesivos ao patrimônio público, não cabível aqui.' },
    ],
  },
  {
    caso: 'Mandado de Segurança Tributário',
    area: 'tributario', instancia: [1],
    correta:  { peca: 'Mandado de Segurança Preventivo', justificativa: 'Cabível para evitar lançamento ou cobrança de tributo inconstitucional ou ilegal (Súmula 266/STF — não para pagar tributo já vencido).' },
    parcial:  { peca: 'Ação Declaratória de Inexistência de Relação Jurídico-Tributária', justificativa: 'Válida, porém mais demorada e sem liminar com efeito suspensivo imediato.' },
    erradas:  [
      { peca: 'Habeas Corpus', motivo: 'Protege a liberdade de locomoção, não direitos tributários.' },
      { peca: 'Ação Rescisória', motivo: 'Serve para desconstituir coisa julgada, não para questionar tributo.' },
    ],
  },
  {
    caso: 'Impugnação de Auto de Infração',
    area: 'tributario', instancia: [1],
    correta:  { peca: 'Impugnação Administrativa ao Auto de Infração', justificativa: 'Primeiro passo obrigatório no contencioso administrativo fiscal (Decreto 70.235/72).' },
    parcial:  { peca: 'Mandado de Segurança', motivo: '' },
    erradas:  [
      { peca: 'Embargos de Declaração', motivo: 'Cabível para sanar obscuridade/omissão em decisão judicial, não em auto de infração.' },
      { peca: 'Ação Anulatória de Débito Fiscal', motivo: 'Cabível após esgotamento da via administrativa, não como primeiro recurso.' },
    ],
  },
  {
    caso: 'Recurso ao CARF',
    area: 'tributario', instancia: [2],
    correta:  { peca: 'Recurso Voluntário ao CARF', justificativa: 'Recurso cabível da decisão de 1ª instância administrativa (DRJ) ao Conselho Administrativo de Recursos Fiscais.' },
    parcial:  { peca: 'Embargos de Declaração', justificativa: 'Cabível para sanar omissão/contradição em acórdão do CARF, mas não substitui o recurso voluntário.' },
    erradas:  [
      { peca: 'Apelação', motivo: 'Recurso judicial, não cabível em processo administrativo fiscal.' },
      { peca: 'Agravo de Instrumento', motivo: 'Recurso judicial contra decisão interlocutória, não aplicável ao CARF.' },
    ],
  },
  {
    caso: 'Compensação Tributária',
    area: 'tributario', instancia: [1],
    correta:  { peca: 'Pedido Administrativo de Compensação (PER/DCOMP)', justificativa: 'Instrumento próprio para compensação de tributos federais via Receita Federal.' },
    parcial:  { peca: 'Ação de Repetição de Indébito com pedido de compensação', justificativa: 'Possível judicialmente, mas a via administrativa é prioritária e mais célere.' },
    erradas:  [
      { peca: 'Mandado de Segurança Repressivo', motivo: 'Não serve para pleitear compensação de créditos tributários.' },
      { peca: 'Exceção de Pré-Executividade', motivo: 'Cabível em execução fiscal para alegar matérias de ordem pública, não para compensação.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // TRABALHISTA
  // ══════════════════════════════════════════════════════
  {
    caso: 'Reclamação Trabalhista',
    area: 'trabalhista', instancia: [1],
    correta:  { peca: 'Petição Inicial de Reclamação Trabalhista', justificativa: 'Peça inaugural do processo na JT (CLT art. 840), pode ser verbal ou escrita.' },
    parcial:  { peca: 'Reclamação Verbal na Vara do Trabalho', justificativa: 'Admitida pelo art. 840 CLT, mas inadequada para casos complexos com múltiplos pedidos.' },
    erradas:  [
      { peca: 'Ação Civil Pública', motivo: 'Instrumento coletivo do MP/sindicatos, não ação individual trabalhista.' },
      { peca: 'Mandado de Segurança', motivo: 'Não é o instrumento para reclamar direitos trabalhistas individuais.' },
    ],
  },
  {
    caso: 'Ação de Indenização por Acidente de Trabalho',
    area: 'trabalhista', instancia: [1],
    correta:  { peca: 'Ação de Indenização por Danos Materiais e Morais (Acidente do Trabalho)', justificativa: 'Competência da Justiça do Trabalho (STF Súmula 736) para ações decorrentes do contrato de trabalho.' },
    parcial:  { peca: 'Ação de Indenização na Justiça Estadual', justificativa: 'Era competente antes da EC 45/2004, mas hoje a competência é da JT (STF).' },
    erradas:  [
      { peca: 'Reclamação Trabalhista simples', motivo: 'Não abrange adequadamente o pedido de indenização civil por acidente.' },
      { peca: 'Ação Popular', motivo: 'Instrumento de cidadania contra atos lesivos ao erário, não para indenizações laborais.' },
    ],
  },
  {
    caso: 'Recurso Ordinário Trabalhista',
    area: 'trabalhista', instancia: [2],
    correta:  { peca: 'Recurso Ordinário (CLT art. 895)', justificativa: 'Recurso cabível das decisões definitivas das Varas do Trabalho ao TRT.' },
    parcial:  { peca: 'Agravo de Petição', justificativa: 'Cabível na execução trabalhista, não para impugnar sentença de mérito.' },
    erradas:  [
      { peca: 'Apelação Cível', motivo: 'Recurso do CPC para a Justiça Estadual/Federal, não para a JT.' },
      { peca: 'Recurso Especial', motivo: 'Recurso ao STJ, somente após esgotamento das instâncias ordinárias.' },
    ],
  },
  {
    caso: 'Ação de Equiparação Salarial',
    area: 'trabalhista', instancia: [1],
    correta:  { peca: 'Reclamação Trabalhista com pedido de equiparação salarial', justificativa: 'CLT art. 461 — exige identidade de função, mesmo empregador, mesma localidade, diferença ≤ 4 anos na função.' },
    parcial:  { peca: 'Ação de Cobrança de Diferenças Salariais', justificativa: 'Pode ser usada, mas não é a denominação técnica correta para o instituto da equiparação salarial.' },
    erradas:  [
      { peca: 'Mandado de Segurança contra ato do empregador', motivo: 'MS não cabe contra ato de particular, somente contra autoridade pública.' },
      { peca: 'Ação Civil Pública', motivo: 'Instrumento coletivo para direitos difusos/coletivos, não para equiparação individual.' },
    ],
  },
  {
    caso: 'Rescisão Indireta',
    area: 'trabalhista', instancia: [1],
    correta:  { peca: 'Reclamação Trabalhista com pedido de rescisão indireta (CLT art. 483)', justificativa: 'O empregado pede o reconhecimento da falta grave do empregador e os direitos rescisórios plenos.' },
    parcial:  { peca: 'Pedido de demissão com reserva de direitos', justificativa: 'Não é tecnicamente correto — o pedido de demissão implica renuncia a verbas rescisórias.' },
    erradas:  [
      { peca: 'Ação de Danos Morais isolada', motivo: 'Não abrange os direitos rescisórios; deve ser cumulada com a rescisão indireta.' },
      { peca: 'Inquérito para apuração de falta grave', motivo: 'Instrumento do empregador para demitir por justa causa, não do empregado.' },
    ],
  },
  {
    caso: 'Agravo de Petição',
    area: 'trabalhista', instancia: [2],
    correta:  { peca: 'Agravo de Petição (CLT art. 897, a)', justificativa: 'Recurso próprio da fase de execução trabalhista, para impugnar decisão do juiz da execução.' },
    parcial:  { peca: 'Embargos à Execução Trabalhista', justificativa: 'Cabível mas com menor efetividade — o AP é o recurso natural na execução da JT.' },
    erradas:  [
      { peca: 'Recurso Ordinário', motivo: 'Cabe das decisões de mérito das Varas, não das decisões da execução.' },
      { peca: 'Apelação', motivo: 'Recurso do CPC, inadequado na Justiça do Trabalho.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // CIVIL
  // ══════════════════════════════════════════════════════
  {
    caso: 'Ação de Indenização',
    area: 'civil', instancia: [1],
    correta:  { peca: 'Petição Inicial de Ação de Reparação de Danos (CC art. 186/927)', justificativa: 'Ação própria para responsabilidade civil extracontratual, com prazo prescricional de 3 anos (CC art. 206 §3º V).' },
    parcial:  { peca: 'Ação de Cobrança', justificativa: 'Tecnicamente possível quando o valor já é líquido e certo, mas inadequada para danos a quantificar.' },
    erradas:  [
      { peca: 'Ação Popular', motivo: 'Instrumento de cidadania contra lesão ao patrimônio público, não para indenizações privadas.' },
      { peca: 'Mandado de Segurança', motivo: 'Protege direito líquido e certo contra ato de autoridade pública, não para indenizações.' },
    ],
  },
  {
    caso: 'Ação Revisional de Contrato',
    area: 'civil', instancia: [1],
    correta:  { peca: 'Ação Revisional de Cláusulas Contratuais (CC art. 317/478)', justificativa: 'Cabível quando há onerosidade excessiva superveniente ou lesão, permitindo revisão judicial das condições.' },
    parcial:  { peca: 'Ação de Nulidade Contratual', justificativa: 'Cabível se há vício de formação do contrato, mas não para revisão de cláusulas por desequilíbrio superveniente.' },
    erradas:  [
      { peca: 'Exceção de Pré-Executividade', motivo: 'Cabível apenas em processo de execução, não para revisão de contrato.' },
      { peca: 'Ação Monitória', motivo: 'Serve para cobrança de dívida com prova escrita sem força executiva, não para revisão contratual.' },
    ],
  },
  {
    caso: 'Ação de Despejo',
    area: 'civil', instancia: [1],
    correta:  { peca: 'Ação de Despejo (Lei 8.245/91)', justificativa: 'Ação própria para retomada de imóvel urbano locado, com rito específico da Lei do Inquilinato.' },
    parcial:  { peca: 'Reintegração de Posse', justificativa: 'Cabível para imóvel rural ou quando há esbulho, não para relação locatícia urbana regida pela Lei 8.245/91.' },
    erradas:  [
      { peca: 'Ação de Usucapião', motivo: 'Instrumento para aquisição originária da propriedade, nada tem a ver com despejo.' },
      { peca: 'Interdito Proibitório', motivo: 'Ação possessória preventiva, não para retomada de imóvel locado.' },
    ],
  },
  {
    caso: 'Ação de Cobrança',
    area: 'civil', instancia: [1],
    correta:  { peca: 'Ação de Cobrança (CPC art. 771)', justificativa: 'Ação adequada para cobrança de dívida sem título executivo, com cognição plena.' },
    parcial:  { peca: 'Ação Monitória (CPC art. 700)', justificativa: 'Cabível quando há prova escrita do débito sem força executiva — mais célere, mas exige documento.' },
    erradas:  [
      { peca: 'Ação de Despejo', motivo: 'Serve para retomada de imóvel locado, não para cobrança de dívida.' },
      { peca: 'Habeas Corpus', motivo: 'Protege a liberdade de locomoção, sem relação com cobranças civis.' },
    ],
  },
  {
    caso: 'Ação de Usucapião',
    area: 'civil', instancia: [1],
    correta:  { peca: 'Ação de Usucapião (CPC art. 565)', justificativa: 'Ação declaratória de aquisição originária da propriedade pelo decurso do prazo legal de posse.' },
    parcial:  { peca: 'Pedido de Reconhecimento Extrajudicial de Usucapião (Lei 13.465/17)', justificativa: 'Possível via cartório, mas somente se não houver litígio; havendo oposição, vai a juízo.' },
    erradas:  [
      { peca: 'Ação Reivindicatória', motivo: 'Instrumento do proprietário para reaver o bem de quem injustamente o possua, não para declarar propriedade por posse.' },
      { peca: 'Ação de Nunciação de Obra Nova', motivo: 'Ação possessória preventiva para impedir construção prejudicial ao vizinho.' },
    ],
  },
  {
    caso: 'Apelação Cível',
    area: 'civil', instancia: [2],
    correta:  { peca: 'Apelação (CPC art. 1.009)', justificativa: 'Recurso cabível contra sentenças de 1º grau, no prazo de 15 dias úteis.' },
    parcial:  { peca: 'Embargos de Declaração', justificativa: 'Cabível para sanar obscuridade, contradição ou omissão na sentença, mas não para rediscutir o mérito integralmente.' },
    erradas:  [
      { peca: 'Recurso Especial', motivo: 'Recurso ao STJ após o TJ/TRF, não recurso de 1ª para 2ª instância.' },
      { peca: 'Agravo de Instrumento', motivo: 'Cabível contra decisões interlocutórias, não contra sentença.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // CRIMINAL
  // ══════════════════════════════════════════════════════
  {
    caso: 'Defesa Criminal',
    area: 'criminal', instancia: [1],
    correta:  { peca: 'Resposta à Acusação (CPP art. 396-A)', justificativa: 'Defesa preliminar apresentada em 10 dias após notificação, podendo arguir preliminares e apresentar provas.' },
    parcial:  { peca: 'Alegações Finais por Memoriais', justificativa: 'Apresentada ao final da instrução, não substitui a Resposta à Acusação como peça inicial de defesa.' },
    erradas:  [
      { peca: 'Apelação Criminal', motivo: 'Recurso contra sentença, não defesa no início do processo.' },
      { peca: 'Embargos de Declaração', motivo: 'Serve para sanar vícios em decisão, não como defesa inicial.' },
    ],
  },
  {
    caso: 'Habeas Corpus',
    area: 'criminal', instancia: [1,2,3],
    correta:  { peca: 'Habeas Corpus (CF art. 5º LXVIII)', justificativa: 'Remédio constitucional para proteger a liberdade de locomoção contra prisão ilegal ou ameaça de constrangimento.' },
    parcial:  { peca: 'Mandado de Segurança', justificativa: 'Protege direito líquido e certo, mas não é o remédio específico para a liberdade de locomoção.' },
    erradas:  [
      { peca: 'Recurso em Sentido Estrito', motivo: 'Recurso criminal específico, não remédio constitucional para ilegalidade de prisão.' },
      { peca: 'Ação de Indenização', motivo: 'Instrumento cível, inadequado para tutelar a liberdade de locomoção.' },
    ],
  },
  {
    caso: 'Recurso em Sentido Estrito',
    area: 'criminal', instancia: [2],
    correta:  { peca: 'Recurso em Sentido Estrito (CPP art. 581)', justificativa: 'Recurso criminal cabível nas hipóteses taxativas do art. 581 CPP, como decisão de pronúncia ou rejeição de denúncia.' },
    parcial:  { peca: 'Apelação Criminal', justificativa: 'Cabível para sentenças definitivas; o RESE é para decisões interlocutórias taxativamente previstas.' },
    erradas:  [
      { peca: 'Mandado de Segurança', motivo: 'Não é o recurso adequado em matéria criminal; tem natureza residual.' },
      { peca: 'Embargos Infringentes', motivo: 'Cabível em acórdão não unânime do Tribunal do Júri, hipótese específica.' },
    ],
  },
  {
    caso: 'Apelação Criminal',
    area: 'criminal', instancia: [2],
    correta:  { peca: 'Apelação Criminal (CPP art. 593)', justificativa: 'Recurso contra sentença definitiva condenatória ou absolutória, no prazo de 5 dias.' },
    parcial:  { peca: 'Embargos de Declaração Criminais', justificativa: 'Serve para sanar vícios formais na sentença, mas não para rediscutir plenamente o mérito.' },
    erradas:  [
      { peca: 'Habeas Corpus', motivo: 'Remédio para ilegalidade de prisão, não recurso contra sentença criminal.' },
      { peca: 'Recurso Especial', motivo: 'Recurso ao STJ após o TJ, não recurso de 1ª para 2ª instância.' },
    ],
  },
  {
    caso: 'Absolvição Sumária',
    area: 'criminal', instancia: [1],
    correta:  { peca: 'Pedido de Absolvição Sumária na Resposta à Acusação (CPP art. 397)', justificativa: 'O juiz pode absolver sumariamente quando há excludente evidente, prescrição, fato atípico ou extinção da punibilidade.' },
    parcial:  { peca: 'Exceção de Coisa Julgada', justificativa: 'Cabível se o fato já foi julgado, mas não é o instrumento geral de absolvição sumária.' },
    erradas:  [
      { peca: 'Habeas Corpus preventivo', motivo: 'Instrumento para ameaça à liberdade, não para absolvição no processo.' },
      { peca: 'Revisão Criminal', motivo: 'Serve para desconstituir condenação passada em julgado, não durante a instrução.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // EMPRESARIAL
  // ══════════════════════════════════════════════════════
  {
    caso: 'Recuperação Judicial',
    area: 'empresarial', instancia: [1],
    correta:  { peca: 'Pedido de Recuperação Judicial (Lei 11.101/05 art. 51)', justificativa: 'Petição inicial com os documentos do art. 51, incluindo demonstrações contábeis e relação de credores.' },
    parcial:  { peca: 'Pedido de Falência Voluntária', justificativa: 'Tecnicamente possível, mas a recuperação é preferível quando há viabilidade econômica da empresa.' },
    erradas:  [
      { peca: 'Ação de Dissolução de Sociedade', motivo: 'Serve para encerrar a sociedade, não para reorganizá-la.' },
      { peca: 'Inventário Extrajudicial', motivo: 'Instrumento de direito sucessório, sem relação com recuperação empresarial.' },
    ],
  },
  {
    caso: 'Ação de Dissolução de Sociedade',
    area: 'empresarial', instancia: [1],
    correta:  { peca: 'Ação de Dissolução Parcial de Sociedade (CPC art. 599)', justificativa: 'Ação própria do CPC/15 para apuração de haveres e dissolução parcial com exclusão/retirada de sócio.' },
    parcial:  { peca: 'Ação de Prestação de Contas', justificativa: 'Cabível para verificar gestão societária, mas não substitui a dissolução quando esta é necessária.' },
    erradas:  [
      { peca: 'Recuperação Judicial', motivo: 'Instrumento para manter a empresa em funcionamento, não para dissolvê-la.' },
      { peca: 'Ação de Despejo', motivo: 'Serve para retomada de imóvel locado, sem relação com dissolução societária.' },
    ],
  },
  {
    caso: 'Due Diligence Judicial',
    area: 'empresarial', instancia: [1],
    correta:  { peca: 'Produção Antecipada de Provas (CPC art. 381)', justificativa: 'Instrumento para coleta de informações e documentos antes ou durante o processo de M&A ou contencioso.' },
    parcial:  { peca: 'Ação de Exibição de Documentos', justificativa: 'Pode ser usada incidentalmente, mas a produção antecipada é mais abrangente para due diligence.' },
    erradas:  [
      { peca: 'Mandado de Segurança', motivo: 'Não é o instrumento para coleta de informações empresariais.' },
      { peca: 'Habeas Corpus', motivo: 'Protege a liberdade de locomoção, sem relação com due diligence.' },
    ],
  },
  {
    caso: 'Arbitragem Empresarial',
    area: 'empresarial', instancia: [1],
    correta:  { peca: 'Requerimento de Instauração de Arbitragem (Lei 9.307/96)', justificativa: 'Peça inaugural do procedimento arbitral, apresentada à câmara de arbitragem conforme a cláusula compromissória.' },
    parcial:  { peca: 'Mediação Extrajudicial', justificativa: 'Método alternativo válido, mas não vinculante como a arbitragem e sem força de título executivo judicial.' },
    erradas:  [
      { peca: 'Petição Inicial Comum no TJRJ', motivo: 'Quando há cláusula arbitral, o Judiciário é incompetente para o mérito.' },
      { peca: 'Ação Popular', motivo: 'Instrumento de cidadania, sem relação com arbitragem comercial.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // PREVIDENCIÁRIO
  // ══════════════════════════════════════════════════════
  {
    caso: 'Concessão de Benefício Previdenciário',
    area: 'previdenciario', instancia: [1],
    correta:  { peca: 'Ação de Concessão de Benefício Previdenciário no JEF', justificativa: 'Ação própria nos Juizados Especiais Federais (Lei 10.259/01) para causas até 60 SM contra o INSS.' },
    parcial:  { peca: 'Ação Ordinária na Justiça Federal', justificativa: 'Cabível para causas acima de 60 SM ou de maior complexidade, mas o JEF é preferível para causas simples.' },
    erradas:  [
      { peca: 'Mandado de Segurança', motivo: 'Só cabe para direito líquido e certo; benefício previdenciário normalmente exige dilação probatória.' },
      { peca: 'Reclamação Trabalhista', motivo: 'A Justiça do Trabalho não tem competência para concessão de benefícios previdenciários.' },
    ],
  },
  {
    caso: 'Revisão de Aposentadoria',
    area: 'previdenciario', instancia: [1],
    correta:  { peca: 'Ação de Revisão de Benefício Previdenciário', justificativa: 'Ação para revisão do salário-de-benefício, com prazo decadencial de 10 anos (Lei 8.213/91 art. 103).' },
    parcial:  { peca: 'Pedido Administrativo de Revisão ao INSS', justificativa: 'Via administrativa válida e necessária antes do ajuizamento, mas judicialmente a ação de revisão é mais efetiva.' },
    erradas:  [
      { peca: 'Embargos à Execução', motivo: 'Serve para defesa em execução fiscal, sem relação com revisão previdenciária.' },
      { peca: 'Ação Popular', motivo: 'Instrumento de cidadania, inadequado para revisão de benefício individual.' },
    ],
  },
  {
    caso: 'Recurso ao CRPS',
    area: 'previdenciario', instancia: [2],
    correta:  { peca: 'Recurso Ordinário ao Conselho de Recursos da Previdência Social (CRPS)', justificativa: 'Recurso administrativo da decisão da Agência do INSS ao CRPS, no prazo de 30 dias.' },
    parcial:  { peca: 'Mandado de Segurança contra ato do INSS', justificativa: 'Cabível se houver ilegalidade, mas o recurso ao CRPS deve ser esgotado primeiro (Súmula 213/STJ).' },
    erradas:  [
      { peca: 'Apelação', motivo: 'Recurso judicial, não administrativo-previdenciário.' },
      { peca: 'Agravo de Instrumento', motivo: 'Recurso do CPC contra decisão interlocutória, sem relação com o CRPS.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // ADMINISTRATIVO / CONSTITUCIONAL
  // ══════════════════════════════════════════════════════
  {
    caso: 'Mandado de Segurança',
    area: 'constitucional', instancia: [1,2],
    correta:  { peca: 'Mandado de Segurança Individual (CF art. 5º LXIX / Lei 12.016/09)', justificativa: 'Remédio constitucional para proteger direito líquido e certo contra ato ilegal ou abusivo de autoridade pública.' },
    parcial:  { peca: 'Ação Ordinária Anulatória', justificativa: 'Alternativa mais demorada, admite dilação probatória e não exige direito líquido e certo de plano.' },
    erradas:  [
      { peca: 'Habeas Corpus', motivo: 'Protege especificamente a liberdade de locomoção, não direitos em geral.' },
      { peca: 'Ação Popular', motivo: 'Instrumento do cidadão contra lesão ao patrimônio público, não para direito individual.' },
    ],
  },
  {
    caso: 'Ação Popular',
    area: 'constitucional', instancia: [1],
    correta:  { peca: 'Ação Popular (CF art. 5º LXXIII / Lei 4.717/65)', justificativa: 'Instrumento do cidadão (com título de eleitor) para anular ato lesivo ao patrimônio público, moralidade ou meio ambiente.' },
    parcial:  { peca: 'Ação Civil Pública', justificativa: 'Instrumento do MP e outros legitimados para interesses difusos/coletivos, sem exigir qualidade de cidadão.' },
    erradas:  [
      { peca: 'Mandado de Segurança Coletivo', motivo: 'Instrumento de entidade associativa para proteger direito líquido e certo coletivo, não para anular ato lesivo ao erário.' },
      { peca: 'Habeas Data', motivo: 'Instrumento para acesso e retificação de informações pessoais em bancos de dados públicos.' },
    ],
  },
  {
    caso: 'Impugnação de Licitação',
    area: 'constitucional', instancia: [1],
    correta:  { peca: 'Impugnação Administrativa ao Edital (Lei 14.133/21 art. 164)', justificativa: 'Qualquer pessoa pode impugnar o edital até 3 dias úteis antes da abertura das propostas.' },
    parcial:  { peca: 'Mandado de Segurança contra ato da comissão de licitação', justificativa: 'Cabível se esgotada a via administrativa e houver ilegalidade manifesta com direito líquido e certo.' },
    erradas:  [
      { peca: 'Ação Popular', motivo: 'Pode ser usada mas exige lesão ao erário já consumada, não é o instrumento primário de impugnação.' },
      { peca: 'Recurso Especial', motivo: 'Recurso ao STJ, completamente fora de contexto para impugnar licitação em curso.' },
    ],
  },

  // ══════════════════════════════════════════════════════
  // AMBIENTAL
  // ══════════════════════════════════════════════════════
  {
    caso: 'Defesa Autuação IBAMA',
    area: 'ambiental', instancia: [1],
    correta:  { peca: 'Defesa Administrativa ao Auto de Infração Ambiental (Decreto 6.514/08)', justificativa: 'Impugnação administrativa no prazo de 20 dias, com suspensão da exigibilidade da multa.' },
    parcial:  { peca: 'Mandado de Segurança contra ato do IBAMA', justificativa: 'Cabível se houver ilegalidade manifesta, mas a via administrativa deve ser esgotada primeiro.' },
    erradas:  [
      { peca: 'Ação Civil Pública Ambiental', motivo: 'Instrumento de tutela coletiva do ambiente, não de defesa individual contra auto de infração.' },
      { peca: 'Embargos à Execução Fiscal', motivo: 'Apenas após a multa ser inscrita em dívida ativa e executada, não como primeira defesa.' },
    ],
  },
  {
    caso: 'Ação Civil Pública Ambiental',
    area: 'ambiental', instancia: [1],
    correta:  { peca: 'Ação Civil Pública (Lei 7.347/85)', justificativa: 'Instrumento para tutela de interesses difusos e coletivos, incluindo dano ambiental, com legitimidade do MP, entidades e entes públicos.' },
    parcial:  { peca: 'Ação Popular Ambiental', justificativa: 'Também protege o meio ambiente (CF art. 5º LXXIII), mas de menor alcance reparatório que a ACP.' },
    erradas:  [
      { peca: 'Mandado de Segurança Coletivo', motivo: 'Exige direito líquido e certo de entidade associativa, diferente da tutela ambiental difusa.' },
      { peca: 'Habeas Corpus', motivo: 'Protege a liberdade de locomoção, sem relação com tutela ambiental.' },
    ],
  },
];

/**
 * Retorna as peças para um determinado tipo de caso e área
 * Se não encontrar correspondência exata, retorna peças genéricas da área
 */
export function getPecasParaCaso(tipoCaso, area, instancia) {
  // Busca exata por caso + área
  let entrada = BANCO_PECAS.find(p =>
    p.area === area &&
    p.caso.toLowerCase().includes(tipoCaso.toLowerCase().split(' ')[0]) &&
    (p.instancia.includes(instancia) || p.instancia.includes(1))
  );

  // Fallback: qualquer peça da área na instância
  if (!entrada) {
    const opcoes = BANCO_PECAS.filter(p =>
      p.area === area &&
      p.instancia.includes(Math.min(instancia, 2))
    );
    entrada = opcoes[Math.floor(Math.random() * opcoes.length)];
  }

  // Fallback final: civil genérico
  if (!entrada) {
    entrada = BANCO_PECAS.find(p => p.area === 'civil' && p.instancia.includes(1));
  }

  if (!entrada) return null;

  // Montar array de 4 opções embaralhadas
  const opcoes = [
    { texto: entrada.correta.peca, tipo: 'correta', justificativa: entrada.correta.justificativa },
    { texto: entrada.parcial.peca, tipo: 'parcial', justificativa: entrada.parcial.justificativa },
    ...entrada.erradas.map(e => ({ texto: e.peca, tipo: 'errada', justificativa: e.motivo })),
  ];

  // Embaralhar
  for (let i = opcoes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opcoes[i], opcoes[j]] = [opcoes[j], opcoes[i]];
  }

  return {
    pergunta: `Qual é a peça processual adequada para este caso?\n\n📋 ${entrada.caso} — ${area}`,
    caso:     entrada.caso,
    opcoes,
  };
}
