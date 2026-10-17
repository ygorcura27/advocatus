# Audiência como Duelo — especificação para implementação

> Status: proposta (v1). Números marcados com *calibrar* são pontos de partida, não balanceamento final.

## 1. O que muda e o que fica

Hoje o caso passa por: **Investigação** (mapa de nós, turnos, favores) → **Montagem** (o jogador escolhe a "mão" de evidências + tese do banco) → **Julgamento** (`executarRodadaJulgamento`: o adversário ataca a peça mais fraca e o jogador só escolhe *defender / usar favor / deixar cair*) → **Finalizar** (`_finalizarJulgamentoCore`: força total vs limiar → procedente/parcial/improcedente, honorários, XP, reputação).

**Fica igual:** investigação, montagem, favores, banco de teses, vade mecum, e todo o pós-sentença (honorários, recurso, XP, reputação).

**Muda:** a fase de Julgamento vira o **Duelo** — uma cena com juiz, advogado adversário e falas, em que o jogador toma uma decisão por rodada com informação parcial. As cartas do duelo são as evidências que ele levantou na investigação. Investigar bem continua sendo o que mais pesa, mas jogar bem a audiência vira a cereja.

Casos que já estão em julgamento no sistema antigo terminam no sistema antigo (`investigacao.julgamento.modo` ausente = antigo; `'duelo'` = novo).

## 2. Os três medidores da cena

| Medidor | Faixa | O que é | Como perde/ganha |
|---|---|---|---|
| **Convencimento** do juiz | 0–100, começa em **50** ± bônus da montagem | Quem está ganhando | Seus argumentos sobem; golpes do adversário descem |
| **Compostura** do advogado | 0 a `6 + Fôlego` (Fôlego já existe: `10 − estresse/20`) | "Vida" do jogador na cena | Objeção errada, golpe forte não respondido, habilidade cara. **Zerou → "perdeu a mão":** o adversário ganha a próxima rodada de graça e você só pode *conceder* |
| **Paciência** do juiz | 0–10, começa em **7** | Humor do juiz | Objeção infundada, tática agressiva com juiz formalista/garantista, enrolação. **Zerou → juiz irritado:** todos os seus ganhos −30% até o fim |

**Veredito** (substitui `forca_total ≥ limiar`): convencimento final **≥ 65 procedente · 50–64 parcial · < 50 improcedente** (*calibrar*). Reaproveita `_finalizarJulgamentoCore`, que ganha um ramo para `modo: 'duelo'`.

Bônus inicial de convencimento vindo da montagem: `+min(15, soma das forças da mão / 6)` — quem investigou bem já entra na frente (*calibrar*).

## 3. Estrutura da audiência

6 rodadas, alternando ataque do adversário e vez do jogador:

| # | Fase | Quem age |
|---|---|---|
| 1 | Abertura do adversário | Adversário ataca → você responde |
| 2 | Sua tese | Você argumenta |
| 3 | Testemunha / prova | Adversário ataca → você responde |
| 4 | Réplica | Você argumenta |
| 5 | Último ataque | Adversário ataca → você responde |
| 6 | Alegações finais | Você argumenta com **×1,5** de efeito |

Caso de valor alto ou em instância superior (TJ/STJ) ganha +2 rodadas (um ataque e uma réplica extras).

### 3.1 Rodada de ataque (o adversário age)

O adversário anuncia uma **jogada** com um **tipo** (as mesmas categorias da matriz de afinidade que já existe em `banco_juridico.js`: `jurisprudencia`, `prova_documental`, `prova_pericial`, `precedente`, `materia_constitucional`, `aspecto_processual`, `prazo`, `agressivo`) e uma **força**.

**Telegrafia (informação parcial):** a fala aparece na cena, mas o que o jogador enxerga da jogada depende da **Inteligência + Pesquisa**:
- baixo: só a fala ("A defesa vai demonstrar que o contrato nunca foi assinado.")
- médio: + o tipo ("📄 Prova documental")
- alto: + faixa de força ("forte") e se a jogada tem **vício** (brecha para objeção)

Respostas possíveis:

| Resposta | Efeito |
|---|---|
| **Contestar com carta** | Escolhe uma evidência da mão. Se a carta **contradiz** a jogada (mesma tag de fato/tipo), anula 100% e devolve +30% como convencimento seu. Tipo diferente anula 50%. A carta é gasta. |
| **Objeção** | Só funciona se a jogada tem vício (≈30% das jogadas, *calibrar*). Acertou: anula tudo e −1 de paciência *do adversário* (ele perde ritmo). Errou: −2 compostura e −2 paciência do juiz. Juiz formalista dá +20% de chance de detectar vício a seu favor. |
| **Conceder e redirecionar** | Leva o golpe, mas recupera +2 compostura e a próxima carta sua tem +20%. É a jogada de quem está sem resposta boa. |
| **Favor / Segredo / Habilidade** | Ver seções 5, 6 e 7. |

Dano do golpe no convencimento: `força × afinidade_do_juiz(tipo) / 5` (afinidade 1–9 vem da matriz existente). Golpe forte (≥ 12) não respondido também tira −1 compostura.

### 3.2 Rodada ofensiva (sua vez)

Você joga **uma carta** da mão como argumento. Efeito:

```
ganho = força_carta
      × afinidade_do_juiz(tipo_da_carta) / 5
      × (1 + bônus_skill)        // ver §8
      × multiplicadorNota(estresse)   // já existe
      × (juiz irritado ? 0,7 : 1)
```

Carta **suja** (prova obtida de forma duvidosa — já existe `peca.suja`): +40% de ganho, mas com risco de exposição. A fórmula atual reaproveitada é `45 − reducaoRiscoExposicao(discricao)`. Exposta, a carta perde o efeito, custa −6 de convencimento e −4 de reputação no fim (regra que já existe).

Carta **pilar** (já existe `peca.pilar`): se você a perde ou ela é desmontada, as cartas dependentes perdem metade da força (cascata que já existe).

### 3.3 A mão

- As cartas são as evidências reveladas e escolhidas na montagem (5 a 7) + a tese do banco (se houver).
- Você **não tem cartas para tudo**: 6 rodadas, muitas vezes 6 cartas, e cada uma gasta. Usar sua melhor carta para se defender na rodada 1 pode faltar nas alegações finais. **Esse é o coração do desafio.**

## 4. O juiz

- Usa os **11 arquétipos que já existem** (tributarista, garantista, formalista, pragmático, humanista...) e a matriz de afinidade por tipo de argumento.
- O jogador **não vê o arquétipo** de cara, só o nome e a fama. Ele pode descobrir antes da audiência:
  - na investigação (nó novo "Dossiê do juiz", custa turno);
  - com um favor de quem já atuou com ele;
  - automaticamente se já enfrentou esse juiz 2+ vezes (memória do personagem).
- Juízes reagem na cena com falas curtas que dão pistas ("Doutor, atenha-se aos autos." = formalista impaciente).

## 5. Favores (já existem — ganham usos novos no duelo)

Favor reservado para o caso pode ser gasto numa rodada com efeito por **tipo**:

| Favor | Efeito no duelo |
|---|---|
| Testemunha surpresa | Carta extra de força 12 entra na mão |
| Perito amigo | Anula uma jogada de prova pericial (automático) |
| Cartório / serventia | Um documento "chega a tempo": anula jogada de prazo/processual |
| Colega de turma do juiz | Revela o arquétipo do juiz e +2 paciência |

Todo favor usado continua gerando **dívida** com o NPC (o sistema de apodrecimento e cobrança já existe). Favor não pago vira problema: o NPC passa a ajudar o adversário no próximo caso.

## 6. Segredos (novo)

Cartas especiais **consumíveis** e de efeito forte, guardadas num "cofre" do personagem.

**Como conseguir:**
- nó raro novo na investigação ("Algo não bate…");
- amigos e relacionamentos com confiança alta (sistema de amigos/confiança já existe);
- imprensa e eventos sociais;
- habilidade especial *Investigador Nato*.

**Exemplos:**
- "A testemunha mentiu em outro processo" → desmonta uma jogada de testemunha e −3 paciência do juiz *com o adversário*.
- "O advogado adversário está sendo investigado pela OAB" → o adversário perde a próxima rodada.
- "O perito já trabalhou para a outra parte" → anula toda prova pericial do adversário no caso.

**O preço:**
- Todo segredo tem uma **fonte**. Usar expõe a fonte com chance proporcional à gravidade: a amizade cai, o NPC some ou vira inimigo.
- Alguns segredos são **sobre gente poderosa**. Usar dá manchete (popularidade sobe) e cria um **inimigo** que reaparece em casos futuros como adversário ou juiz hostil.
- Segredos **envelhecem**: depois de N meses, perdem efeito (mesma ideia do apodrecimento de favores).

## 7. Corrupção (o lado escuro — opcional e arriscado)

Ações ilegais disponíveis em momentos específicos: na investigação, num menu "Contatos" que só aparece para quem tem contatos do submundo, e às vezes ofertadas por NPCs em cena.

| Ação | Efeito | Exposição |
|---|---|---|
| Comprar testemunha | Carta de força 18 | +25 |
| Plantar prova | Carta suja de força 20 | +30 |
| Pressionar perito | Anula prova pericial adversária no caso | +20 |
| "Conversar" com o assessor do juiz | +10 convencimento inicial | +40 |
| Pagar para sumir um documento | Anula uma carta pilar do adversário | +35 |

Custam **dinheiro** (de verdade, no servidor) e geram **Exposição**, um medidor do personagem de 0 a 100 que só o servidor grava.

**Bomba-relógio:** cada ato corrupto vira um registro com chance de vir à tona **a cada mês** (processado no Avançar Mês), não só na hora. Fatores:
- `discricao` (skill que já existe) e a habilidade *Sangue Frio* reduzem a chance;
- juízes garantistas/formalistas e jornalistas investigativos aumentam;
- casos de valor alto atraem mais atenção.

**Consequências, em escada:**
1. Boato na imprensa jurídica → −reputação, clientes desconfiados.
2. Anulação do julgamento → o caso volta, sem honorários.
3. Processo no Tribunal de Ética da OAB → multa e **suspensão** (X meses sem poder atuar em processos; só consultoria).
4. Escândalo grande → perda do cargo no escritório, ou dissolução do próprio escritório.
5. Prisão → o personagem sai de cena e o **herdeiro** assume (o sistema de herança já existe).

**Exposição cai devagar** com o tempo e com atos "limpos" (pro bono, que já existe). O ponto não é proibir: é tornar a tentação real e o risco crível.

## 8. Habilidades especiais (Traços de Assinatura)

O personagem escolhe **1 traço ao virar Advogado Pleno** e **1 segundo ao virar Sócio**. Cada traço tem **3 níveis** que sobem com o skill/atributo ligado a ele. Uso no duelo: **1× por audiência** (nível 3: 2×), salvo indicação contrária.

| Traço | Inspiração | Ligado a | Ativa | Passiva |
|---|---|---|---|---|
| **Memória Eidética** | Mike Ross | Inteligência + Pesquisa | Revela tipo, força e vício da próxima jogada adversária e marca a carta da mão que a contradiz | Cartas de precedente/jurisprudência +20% |
| **O Fechador** | Harvey Specter | Retórica + Persuasão (+ Charm) | **Blefe:** jogue uma carta como se fosse 2× mais forte. Se o adversário não tiver contra-jogada à altura, vale; se tiver, −4 compostura | Alegações finais ×1,8 em vez de ×1,5; acordos com +10% de valor |
| **Leitor de Pessoas** | Jessica Pearson | Charm | Mostra o arquétipo do juiz e a paciência em tempo real por 2 rodadas | Objeção errada não custa paciência |
| **Técnico Implacável** | Louis Litt | Direito processual (`procedure`) | A próxima objeção acerta automaticamente se houver vício; se não houver, você sabe antes de usar | +15% contra jogadas de prazo/processual; −1 paciência com juiz humanista |
| **Showman do Tribunal** | — | Oratória (`oral_advocacy`) | Recupera 4 compostura e +5 convencimento | Casos com imprensa rendem 2× popularidade |
| **Fixer** | — | Networking | Usa um favor sem reserva prévia | Favores criados custam −1 de peso (dívida menor) |
| **Sangue Frio** | — | Constituição | Ignora o próximo golpe | Compostura máxima +50%; estresse não reduz ganhos no duelo |
| **Investigador Nato** | — | Pesquisa | (fora do duelo) +1 turno na investigação | Chance de achar Segredos ×2 |

O balanceamento do desafio: traços dão vantagem, nunca vitória garantida, e cada um tem uma fraqueza (o Blefe pode sair caro, o Técnico irrita juiz humanista).

### 8.1 Traços adicionais

Mesma regra: 3 níveis, ligado a um skill/atributo, sempre com uma fraqueza. Ficam em quatro famílias para o jogador montar um "estilo" (o 1º traço sai da família que quiser; o 2º pode ser de outra, para combos).

**Tribunal — dentro do duelo**

| Traço | Inspiração | Ligado a | Efeito | Fraqueza |
|---|---|---|---|---|
| **Contra-interrogatório Letal** | Mickey Haller (*O Poder e a Lei*) | Oratória | Ativa: numa rodada de testemunha, força uma contradição: a jogada adversária vira **sua** carta (força 50%) | Se a testemunha não tem contradição, −3 compostura |
| **Objeção!** | Phoenix Wright | Direito processual | Passiva: vícios do adversário aparecem sempre (telegrafia de vício nível máximo). Ativa: anula uma jogada sem vício, uma vez | Juiz pragmático −1 paciência a cada objeção |
| **Voz da Razão** | Atticus Finch | Retórica + Charm | Juízes humanistas e garantistas começam +8 convencimento; recupera paciência ao argumentar | Contra juiz tributarista/formalista, −10% de ganho |
| **Teatro Total** | Alan Shore / Denny Crane | Charm + Oratória | Alegações finais ×2,2 e chance de "virada" se você estiver até 10 pontos atrás | Juiz formalista: −3 paciência no ato; se falhar, vira piada na imprensa |
| **Leitura de Precedentes** | Diane Lockhart | Pesquisa + Raciocínio Jurídico | Toda carta de precedente/jurisprudência ganha +1 uso (pode ser jogada 2×) | Cartas de prova pericial −15% |
| **Silêncio Estratégico** | — | Constituição | Ativa: "passa" a rodada sem perder nada; o adversário gasta a jogada no vazio | Usável só depois da rodada 2; −1 paciência do juiz |
| **Advogado do Diabo** | Annalise Keating | Argumentação | Antes do duelo, simula a audiência e revela 2 jogadas do baralho adversário | Custa 1 turno de investigação e +5 estresse |

**Investigação e bastidores**

| Traço | Inspiração | Ligado a | Efeito | Fraqueza |
|---|---|---|---|---|
| **Rede de Informantes** | Kalinda Sharma (*The Good Wife*) | Networking | Segredos chegam sozinhos (1 por trimestre) e a investigação revela nós escondidos | Cada informante cobra um favor por ano; não pagar vira inimigo |
| **Olho de Perito** | — | Pesquisa | Detecta prova suja/forjada do adversário (anula e −paciência *dele*) | Sua própria carta suja tem +15% de risco (você "sabe demais") |
| **Saul Goodman** | *Better Call Saul* | Charm + Negociação | Corrupção custa −40% e gera −25% de Exposição; acesso a contatos do submundo desde o início | Clientes corporativos grandes desconfiam (−confiança inicial); a imprensa vigia você (+chance de bomba-relógio estourar em escândalo) |
| **Ficha Limpa** | — | Discrição | Exposição nunca passa de 50; boatos contra você perdem força | Não pode usar corrupção (bloqueada) |

**Escritório e negócios**

| Traço | Inspiração | Ligado a | Efeito | Fraqueza |
|---|---|---|---|---|
| **Fazedor de Chuva** | Harvey (lado comercial) / Jessica | Networking + Charm | +30% oportunidades de cliente; clientes grandes aparecem mais cedo | Clientes grandes exigem você pessoalmente: 1 audiência obrigatória por mês |
| **Mentor** | — | Gestão | Funcionários NPC ganham skill 2× mais rápido e são mais leais | Seus próprios estudos −20% (o tempo vai para a equipe) |
| **Mão de Ferro** | Louis Litt (gestão) | Gestão | Equipe produz +20% | Moral/lealdade cai mais rápido; risco maior de ser roubado por banca rival |
| **Cobrador Implacável** | — | Negociação | Honorários atrasados chegam em dia; calote −70% | Clientes PF −confiança (ganha fama de duro) |
| **Faro para Dinheiro** | — | Inteligência | Investimentos +15% de rendimento e aviso antecipado de crise econômica | Tentação: +5 estresse quando o mercado cai |

**Vida pessoal**

| Traço | Inspiração | Ligado a | Efeito | Fraqueza |
|---|---|---|---|---|
| **Pé no Chão** | — | Constituição | Família e relacionamentos decaem 50% mais devagar; estresse −20% | Disponibilidade para audiências extras −1 por mês |
| **Workaholic** | Harvey Specter | Constituição | +20% de energia por mês | Relacionamentos decaem 2× mais rápido; burnout chega mais cedo |
| **Carisma Natural** | — | Aparência + Charm | +popularidade e imprensa favorável; relacionamentos começam com mais afinidade | Escândalos rendem 2× mais estrago |

### 8.2 Regras de combinação

- No máximo **2 traços ativos** (Pleno e Sócio). Um **3º** destrava em Sócio Nominal *ou* via herança: o herdeiro pode herdar um traço do pai/mãe em nível 1 (incentivo de dinastia).
- Alguns traços se **excluem**: *Ficha Limpa* ✕ *Saul Goodman*; *Pé no Chão* ✕ *Workaholic*.
- Combos pensados: *Memória Eidética* + *O Fechador* (a dupla de Suits: sabe o que vem e fecha forte); *Rede de Informantes* + *Saul Goodman* (submundo); *Fazedor de Chuva* + *Mentor* (construtor de escritório).
- Traço pode ser **trocado** uma vez por "crise de carreira" (evento raro ou custo alto em dinheiro + 3 meses), para quem se arrepender.

## 9. Ligação com o que já existe (skills e atributos)

| Fonte | Efeito no duelo |
|---|---|
| `skills_jur.oral_advocacy` | +ganho nas rodadas ofensivas (`bonusOratoria` já existe) |
| `skills_jur.argumentation` | +eficácia ao contestar com carta de tipo diferente (de 50% para até 70%) |
| `skills_jur.procedure` | +chance de a objeção acertar |
| `skills_jur.discricao` | −risco de carta suja ser exposta (já existe) e −chance da bomba-relógio |
| `skills_jur.negotiation` | Melhores termos ao propor acordo no meio do duelo (§10) |
| Atributo **Retórica** (hoje sem efeito) | +2% de ganho por ponto acima de 11 |
| Atributo **Charm** (hoje sem efeito) | +paciência inicial do juiz (+1 a cada 4 pontos acima de 11) |
| Atributo **Inteligência** (hoje sem efeito) | Nível de telegrafia (§3.1) |
| Atributo **Constituição** | Compostura máxima (+1 a cada 3 pontos acima de 11) |
| Estresse / Fôlego | Compostura inicial; `multiplicadorNota` no ganho (já existem) |

Isso finalmente dá função aos 4 atributos que hoje são "só perfil".

## 10. Acordo no meio do duelo

A qualquer momento após a rodada 2, o jogador pode **propor acordo**:
- o valor oferecido pela outra parte depende do convencimento atual (quem está ganhando consegue mais);
- aceitar encerra o caso com honorário proporcional e sem risco de derrota;
- é a válvula de escape para quem está perdendo, e a armadilha para quem fecha cedo demais.

## 11. Adversário

- Advogado NPC (os advogados NPC com traços já existem em `functions/npc/`), com **estilo**: *Agressivo* (muitos golpes fortes, alguns com vício), *Técnico* (processual e prazos, poucos vícios), *Teatral* (agressivo + humanista; juiz formalista odeia), *Burocrata* (fraco, mas difícil de objetar).
- O **baralho do adversário** é gerado no servidor a partir do caso: valor, área, instância, força adversária da investigação (`VELOCIDADE_ADVERSARIA_BASE` já existe) e provas sujas expostas do jogador.
- Caso grande → adversário melhor. Escala com o cargo do jogador para manter o desafio.

## 12. Meta de dificuldade

| Situação | Taxa de vitória alvo (procedente+parcial) |
|---|---|
| Iniciante, caso do nível dele, investigação mediana, jogando razoável | ~50% |
| Jogador bom, investigação boa | ~70% |
| Jogador bom + traço certo + juiz mapeado | ~80% |
| Qualquer jogador, caso muito acima do nível | ~25% |

O jogo é difícil por **escassez de cartas, informação parcial e consequências adiadas**, nunca por sorte pura. O componente aleatório é limitado a: chance de objeção, exposição de carta suja e bomba-relógio.

Validar com simulação (script em `functions/test/` jogando milhares de duelos com estratégias simples) antes de publicar.

## 13. Implementação técnica

### Dados

- `processos/{id}.investigacao.duelo` (**público** para o dono): rodada, fase, convencimento, compostura, paciência, telegrafia da jogada atual (só o que o jogador pode ver), mão restante, log de falas.
- `processos/{id}/privado/duelo` (**só servidor**, rules `read, write: if false`): baralho do adversário, vícios, arquétipo do juiz, sementes de RNG. **Isso é obrigatório**, porque hoje qualquer jogador logado consegue ler qualquer processo.
- `jogadores/{uid}`: `tracos_assinatura: [{id, nivel}]`, `exposicao`, `juizes_conhecidos: {juizId: arquetipo}`. Todos **só servidor** (adicionar a `fichaAtualizacaoValida` nas rules).
- `jogadores/{uid}/segredos/{id}` e `jogadores/{uid}/atos_corruptos/{id}`: **só servidor**.

### Callables (novas)

| Callable | Faz |
|---|---|
| `iniciarDuelo(processo_id)` | Chamada no lugar de entrar no julgamento antigo após `confirmarMontagem`. Gera o baralho adversário, o juiz e a primeira jogada |
| `jogarRodadaDuelo({processo_id, acao, carta_id?, favor_id?, segredo_id?, traco_id?})` | Valida, resolve e avança. `acao` ∈ `contestar | objecao | conceder | argumentar | favor | segredo | traco | propor_acordo | aceitar_acordo` |
| `finalizarDuelo(processo_id)` | Converte convencimento em veredito e chama `_finalizarJulgamentoCore` (ramo novo) |
| `escolherTracoAssinatura(traco_id)` | Ao bater Pleno/Sócio |
| `acaoCorrupta({processo_id, tipo})` | Debita dinheiro, cria o ato com chance mensal, entrega o efeito |

Tudo em **transaction**, todo número calculado no servidor (mesmo padrão anti-F12 recém-implementado).

### Avançar Mês

- Processar `atos_corruptos` (bomba-relógio) e aplicar consequências.
- Envelhecer segredos.
- Decaimento lento de `exposicao`.

### Tela (frontend)

- Tela própria de cena: cenário de fundo (`img/cenarios/`), retrato do juiz (esquerda) e do adversário (direita) de `img/npcs/`, caixa de diálogo embaixo com a fala da rodada (texto gerado por templates: tipo de jogada × estilo do adversário × arquétipo do juiz).
- Barras de **Convencimento** (no topo, de lado a lado), **Compostura** (sua) e **Paciência** (ícone do martelo).
- **Cartas na base** (as evidências da mão), com tipo e força. Toque na carta para jogar; botões de Objeção / Conceder / Favor / Segredo / Traço.
- Animação curta a cada golpe (barra mexendo, retrato "reagindo"), respeitando `prefers-reduced-motion`.
- No mobile: retratos menores, cartas em carrossel horizontal.

### Textos

`functions/shared/falas_duelo.js` com templates por tipo × estilo (~10 por combinação no MVP), em pt-BR, com placeholders de nome das partes, valor, provas.

## 14. Entregas em fases

1. **MVP do duelo:** 6 rodadas, cartas da montagem, juiz com afinidade escondida, adversário com telegrafia, os três medidores, acordo no meio, favores existentes, 2 traços (*Memória Eidética*, *O Fechador*), tela de cena. Simulação de balanceamento.
2. **Traços de tribunal restantes + Segredos** + hooks dos atributos (Retórica, Charm, Inteligência).
2b. **Traços de bastidores, escritório e vida pessoal** (§8.1) — mexem em sistemas fora do duelo (oportunidades, equipe, cobrança, relacionamentos).
3. **Corrupção + Exposição + bomba-relógio** + consequências (imprensa, OAB, suspensão).
4. **Duelo entre jogadores** (Confronto Direto — já existe documento de design), com os dois lados jogando a mesma audiência.

## 15. Decisões tomadas

- **Corrupção pode levar à prisão.** O degrau 5 da escada de consequências (§7) vale: o personagem sai de cena e o herdeiro assume. Se não houver herdeiro jogável, a conta recomeça com um personagem novo que herda parte do patrimônio (regra a detalhar na fase 3).
- **Traços são escolhidos ao virar Advogado Pleno e ao virar Sócio** (3º em Sócio Nominal ou por herança, §8.2).
- **6 rodadas** por audiência.
- **O duelo vale só para casos assumidos pessoalmente**; o pool do escritório continua automático.
