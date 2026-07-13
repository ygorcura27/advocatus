/**
 * VADE MECUM — PRECEDENTES FICTÍCIOS — Advocatus Online
 * GDD addendum v1.0, Parte V. Como o jogo tem alcance global, a pesquisa de
 * teses não referencia tribunais/casos reais — este é um livro de
 * precedentes fictícios, sem vínculo com nenhuma jurisdição do mundo real.
 *
 * Formato: { id, nome, tema, holding, tags } — `tags` batem com as áreas de
 * caso já usadas em COMPAT_AREAS (functions/skills.js): employment, tax,
 * civil, criminal, corporate, immigration, bankruptcy.
 *
 * A validação de "a tese se encaixa no caso" é feita no SERVIDOR
 * (functions/investigacao.js, aplicarTeseVademecum) comparando as tags aqui
 * com a área do processo — o cliente só lista candidatos e envia as tags
 * públicas do precedente escolhido, nunca decide sozinho o resultado.
 */

export const BANCO_VADEMECUM = [
  { id:'vm_001', nome:'Corte Regional v. Hallwick Trading', tema:'Rescisão indireta por assédio continuado',
    holding:'O empregador que tolera assédio reiterado, mesmo sem participação direta, responde por rescisão indireta caso não comprove medidas corretivas tempestivas.', tags:['employment'] },
  { id:'vm_002', nome:'Merton Holdings v. Fisco Central', tema:'Compensação de créditos em fusão societária',
    holding:'Créditos tributários não se extinguem por fusão da pessoa jurídica; a sucessora responde e pode compensar mediante comprovação documental da origem.', tags:['tax','corporate'] },
  { id:'vm_003', nome:'Corte de Apelações v. Dresden Import', tema:'Cadeia de custódia em prova documental',
    holding:'Documento fiscal sem cadeia de custódia demonstrável tem força probante reduzida, mas não é automaticamente nulo — cabe à parte contrária impugnar especificamente.', tags:['civil','tax'] },
  { id:'vm_004', nome:'Estado v. Kowalik', tema:'Prova obtida por terceiro sem coação',
    holding:'Prova entregue espontaneamente por terceiro, sem coação ou promessa de vantagem, é lícita ainda que o terceiro tivesse dever de sigilo profissional diverso.', tags:['criminal'] },
  { id:'vm_005', nome:'Whitfield Corp. v. Conselho de Credores', tema:'Preferência de crédito trabalhista em recuperação judicial',
    holding:'Créditos trabalhistas mantêm preferência sobre créditos quirografários mesmo quando cedidos a terceiros durante o processo de recuperação.', tags:['bankruptcy','employment'] },
  { id:'vm_006', nome:'Corte Migratória v. Andreoli', tema:'Boa-fé em documentação de residência',
    holding:'Erro formal em documentação de residência, quando não há dolo comprovado, não é causa isolada suficiente para indeferimento de pedido de permanência.', tags:['immigration'] },
  { id:'vm_007', nome:'Corte Central v. Bregman Holdings', tema:'Responsabilidade de administrador por omissão',
    holding:'O administrador responde por omissão apenas quando demonstrado que tinha ciência do risco e poder de ação para evitá-lo — omissão genérica não basta.', tags:['corporate','civil'] },
  { id:'vm_008', nome:'Ministério Público v. Farro', tema:'Nulidade por cerceamento de defesa',
    holding:'A negativa de produção de prova pericial requerida tempestivamente, quando relevante para o mérito, configura cerceamento de defesa e anula o ato decisório.', tags:['criminal','civil'] },
  { id:'vm_009', nome:'Sindicato Regional v. Halvorsen Ind.', tema:'Jornada híbrida e horas extras',
    holding:'O controle indireto de jornada em regime híbrido (mensagens fora do expediente, prazos com cobrança de resposta) equivale a controle de jornada para fins de horas extras.', tags:['employment'] },
  { id:'vm_010', nome:'Corte de Recursos v. Iversen Textile', tema:'Simulação em contrato de compra e venda',
    holding:'Discrepância de valor entre o contrato registrado e o efetivamente pago, somada à proximidade temporal com débito conhecido, autoriza presunção de simulação.', tags:['civil','corporate','tax'] },
  { id:'vm_011', nome:'Estado v. Okonkwo-Reyes', tema:'Confissão extrajudicial não ratificada',
    holding:'Confissão extrajudicial não ratificada em juízo tem valor probatório relativo e não pode, isoladamente, fundamentar condenação sem prova de corroboração.', tags:['criminal'] },
  { id:'vm_012', nome:'Bancorp Regional v. Massard', tema:'Anatocismo em renegociação de dívida',
    holding:'A capitalização de juros em renegociação de dívida é lícita apenas quando pactuada expressamente e informada de forma destacada ao devedor.', tags:['civil','bankruptcy'] },
  { id:'vm_013', nome:'Autoridade Fiscal v. Renner Distribuidora', tema:'Boa-fé do adquirente em nota fiscal inidônea',
    holding:'O adquirente que comprova a regularidade formal da operação e o efetivo recebimento da mercadoria não responde pela inidoneidade posterior do emitente.', tags:['tax','corporate'] },
  { id:'vm_014', nome:'Corte Trabalhista Central v. Doretti', tema:'Dano moral por exposição indevida de dados',
    holding:'A divulgação interna de dados de saúde do empregado sem necessidade e sem consentimento configura dano moral in re ipsa.', tags:['employment','civil'] },
  { id:'vm_015', nome:'Conselho de Imigração v. Petrenko', tema:'Reunião familiar e vínculo socioafetivo',
    holding:'Vínculo socioafetivo comprovado por prova documental contínua supre a ausência de vínculo biológico para fins de reunião familiar migratória.', tags:['immigration','civil'] },
  { id:'vm_016', nome:'Corte de Falências v. Grumman & Filhos', tema:'Fraude à execução em alienação de bens',
    holding:'A alienação de bem essencial da empresa em recuperação, sem autorização judicial e em momento de insolvência notória, presume fraude à execução.', tags:['bankruptcy','corporate'] },
  { id:'vm_017', nome:'Ministério Público v. Castellano', tema:'Legítima defesa putativa',
    holding:'A legítima defesa putativa exige erro escusável quanto à agressão, avaliado pelas circunstâncias objetivas conhecidas pelo agente no momento do fato.', tags:['criminal'] },
  { id:'vm_018', nome:'Corte Cível Regional v. Ashworth', tema:'Prescrição intercorrente em cobrança',
    holding:'A inércia do credor por prazo superior ao legal, após localização do devedor, autoriza o reconhecimento de prescrição intercorrente de ofício.', tags:['civil'] },
  { id:'vm_019', nome:'Fisco Estadual v. Kowalski Transportes', tema:'Substituição tributária e restituição de diferença',
    holding:'O contribuinte substituído tem direito à restituição da diferença quando a base de cálculo presumida supera o valor da operação efetivamente realizada.', tags:['tax'] },
  { id:'vm_020', nome:'Corte Trabalhista v. Belmonte Serviços', tema:'Terceirização e responsabilidade subsidiária',
    holding:'A tomadora de serviços responde subsidiariamente por verbas trabalhistas inadimplidas quando comprovada culpa in vigilando na fiscalização do contrato.', tags:['employment','corporate'] },
];

// As áreas reais de processo (js/escritorio_painel.js:TODAS_AREAS) são em
// português (civil, tributario, trabalhista...), mas as tags acima são em
// inglês (herdadas de COMPAT_AREAS/functions/skills.js). Sem esta tradução,
// `p.tags.includes(areaCaso)` nunca batia pra quase nenhuma área do jogo —
// bug que fazia o Vade Mecum "sempre dar errado". Espelho de
// functions/investigacao.js::AREA_PARA_TAG_VADEMECUM.
const AREA_PARA_TAG_VADEMECUM = {
  civil:'civil', consumidor:'civil', familia:'civil', imobiliario:'civil',
  contencioso:'civil', ambiental:'civil',
  tributario:'tax',
  trabalhista:'employment',
  empresarial:'corporate', societario:'corporate', administrativo:'corporate',
  criminal:'criminal',
};

/** Retorna uma amostra de precedentes candidatos para o Vade Mecum de um caso — mistura da área do caso com ruído de outras áreas, para não entregar a resposta pela simples filtragem. */
export function sortearCandidatosVademecum(areaCaso, n = 6) {
  const tag = AREA_PARA_TAG_VADEMECUM[areaCaso] || areaCaso;
  const doTema = BANCO_VADEMECUM.filter(p => p.tags.includes(tag));
  const outros = BANCO_VADEMECUM.filter(p => !p.tags.includes(tag));
  const embaralhar = arr => arr.map(v => [Math.random(), v]).sort((a,b) => a[0]-b[0]).map(([,v]) => v);
  const qtdCertos = Math.max(1, Math.min(doTema.length, Math.ceil(n / 2)));
  const candidatos = [...embaralhar(doTema).slice(0, qtdCertos), ...embaralhar(outros).slice(0, n - qtdCertos)];
  return embaralhar(candidatos);
}
