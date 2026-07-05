---
name: Advocatus Online
description: Uma simulação de carreira em que a ascensão de um advogado no sistema jurídico brasileiro é retratada com a gravitas de um grande escritório.
colors:
  ink-navy: "#1B2A4A"
  navy-deep: "#243659"
  navy-mid: "#2E4270"
  navy-bright: "#3A5080"
  navy-mist: "#D6DCF0"
  earned-gold: "#C9A227"
  gold-deep: "#B8922A"
  gold-bronze: "#9A7820"
  gold-parchment: "#FDF3D8"
  fog-bg: "#F4F6FA"
  fog-bg-2: "#EAECF2"
  fog-bg-3: "#E0E3EC"
  paper-surface: "#FFFFFF"
  paper-surface-2: "#F8F9FC"
  text-primary: "#1B2A4A"
  text-secondary: "#3D4F6E"
  text-muted: "#6B7FA0"
  text-faint: "#9BAAC4"
  verdict-green: "#2E8B57"
  verdict-green-bg: "#EAF7EF"
  verdict-red: "#C0392B"
  verdict-red-bg: "#FDECEA"
  verdict-amber: "#B7791F"
  verdict-amber-bg: "#FEFCE8"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  headline:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Courier Prime, Courier New, monospace"
    fontSize: "0.62rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  pill: "20px"
  circle: "50%"
spacing:
  xs: "0.35rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-primary-hover:
    backgroundColor: "{colors.navy-mid}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 1.1rem"
  card:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "1rem"
---

# Design System: Advocatus Online

## 1. Overview

**Norte Criativo: "As Câmaras do Mérito"**

Uma instituição jurídica atemporal, onde toda conquista rende prestígio. O sistema se inspira em grandes escritórios de advocacia, tribunais históricos e câmaras de julgamento — não em convenções de app ou de jogo: o navy profundo, os neutros acinzentados e o papel marfim carregam o peso da sala, e o dourado é reservado como sinal de algo que foi conquistado. A progressão — uma promoção, uma causa ganha, um prêmio — deve se registrar como um marco genuíno, encenado com a mesma confiança cinematográfica e discreta de uma cerimônia nas câmaras, não como um item de loot.

Esse sistema rejeita explicitamente o exagero barato de jogo mobile: sem gradientes saturados, sem ícones cartunescos, sem chrome estilo gacha, sem teatro de confete-e-medalha. Rejeita igualmente o blend genérico de dashboard SaaS — sem tiles de "métrica-herói", sem texto em gradiente, sem grids de cards idênticos fazendo o papel de hierarquia. O registro está mais para "a recepção de um escritório que existe há um século" do que para um brinquedo ou uma planilha.

**Características-Chave:**
- Autoridade do navy institucional como linguagem dominante das superfícies; o dourado aparece apenas para marcar distinção.
- Elevação estrutural: plano em repouso, sombras se aprofundam somente em resposta à interação.
- Serifa da marca (Playfair Display) reservada exclusivamente para o wordmark; DM Sans carrega todos os demais papéis de título e corpo de texto, mantendo a interface legível e precisa em vez de ornamental.
- Status comunicado por famílias de cor nomeadas e discretas (verde/vermelho/âmbar de veredito), nunca por saturação bruta.

## 2. Colors

A paleta se lê como uma instituição de papel e tinta, iluminada em navy e aquecida apenas pelo dourado: fundos neutros e frios, um navy de autoridade para estrutura e texto, e dourado usado exclusivamente para distinção conquistada.

### Primary
- **Navy Institucional** (#1B2A4A): A cor estrutural dominante — barra superior, estados ativos de navegação, botões primários, texto primário. Deve parecer a confiança de um advogado sênior e a permanência da lei.
- **Navy Profundo** (#243659) / **Navy Médio** (#2E4270) / **Navy Claro** (#3A5080): Uma rampa tonal usada em gradientes (barra superior, botão "avançar mês"), estados de hover e elementos estruturais secundários.
- **Névoa de Navy** (#D6DCF0): O tom usado nos fundos de hover/ativo dos itens de navegação e em badges secundários — o navy diluído a um sussurro.

### Secondary
- **Dourado Conquistado** (#C9A227): Reservado para conquista e distinção — valores de reputação, o itálico do wordmark, a borda do call-to-action de "avançar mês", ênfase em rankings/prêmios. Nunca decorativo; sua presença sempre marca um marco ou um valor que merece atenção.
- **Dourado Profundo** (#B8922A) / **Dourado Bronze** (#9A7820): Passos mais escuros da mesma rampa, usados em estados de hover e no preenchimento das barras de skill, onde o dourado aparece como um valor, não como um acento.
- **Dourado Pergaminho** (#FDF3D8): O passo mais claro do dourado, usado como fundo quente para blocos de evento/aviso — o único lugar onde o calor entra numa superfície em vez de numa cor de texto.

### Neutral
- **Fundo Névoa** (#F4F6FA), **Fundo Névoa 2** (#EAECF2), **Fundo Névoa 3** (#E0E3EC): O pano de fundo frio e de baixa saturação sobre o qual toda a interface se assenta — nunca um "creme" aquecido, sempre um cinza frio com tom de navy.
- **Superfície Papel** (#FFFFFF) / **Superfície Papel 2** (#F8F9FC): Superfícies de cards e painéis, ligeiramente mais claras que o fundo da página.
- **Texto Primário** (#1B2A4A), **Texto Secundário** (#3D4F6E), **Texto Discreto** (#6B7FA0), **Texto Tênue** (#9BAAC4): Uma rampa de texto em quatro passos, da autoridade plena da tinta até a discrição no nível de legendas.

### Regras Nomeadas
**A Regra do Dourado Conquistado.** O dourado nunca é uma cor de acento padrão para chrome ou decoração. Ele aparece apenas onde algo foi conquistado, ranqueado, ou merece ser distinguido (reputação, prêmios, wordmark, um CTA primário pronto para ação). Se o dourado aparecer em um elemento puramente estrutural ou decorativo, está sendo mal utilizado.

**A Regra do Neutro Frio.** Os fundos tendem para o navy, nunca para o creme ou areia quentes. O calor neste sistema é carregado pelos acentos dourados e pelo caráter serifado do Playfair, não pelo fundo do corpo.

## 3. Typography

**Fonte de Display:** Playfair Display (com fallback Georgia, serif) — apenas o wordmark.
**Fonte de Corpo/Título:** DM Sans (com fallback system-ui, sans-serif) — tudo o mais, incluindo títulos de seção, títulos de card e valores numéricos.
**Fonte Mono:** Courier Prime (com fallback Courier New, monospace) — números de processo e outros identificadores estilo livro-razão.

**Caráter:** Uma sans discreta e precisa (DM Sans) carrega quase toda a interface — legível até em tamanhos pequenos de legenda, com numerais tabulares para dinheiro e estatísticas — enquanto o itálico serifado do Playfair Display fica reservado exclusivamente para o nome da marca, mantendo sua gravitas rara e significativa em vez de diluída em cada título.

### Hierarchy
- **Display** (700, 1.1rem, letter-spacing apertado de 0.04em): O wordmark ("Advocatu*s*"), o único momento serifado do sistema.
- **Headline** (700, 0.9–1rem): Títulos de seção (`.secao-titulo`), títulos de modal, a data do relógio global — DM Sans no seu peso mais confiante, colorido em navy institucional ou dourado dependendo do contexto.
- **Title** (600–700, 0.8–0.92rem): Títulos de card, nomes das partes em processos, valores de estatística — o tamanho de título mais usado nos painéis.
- **Body** (400–500, 0.7–0.88rem): Descrições, perguntas de quiz, texto de dica.
- **Label** (600, 0.55–0.66rem, caixa alta, letter-spacing 0.06–0.12em): Títulos de grupos de navegação, labels de campo, legendas de estatística, badges — o registro pequeno em caixa alta usado sempre que um dado precisa de um nome.

### Regras Nomeadas
**A Regra da Serifa Única.** Playfair Display aparece em exatamente um lugar: o wordmark. Todo outro título, por maior ou mais em negrito que seja, é composto em DM Sans. Uma segunda serifa aparecendo em outro lugar é uma regressão, não uma escolha estilística.

## 4. Elevation

A elevação cumpre duas funções ao mesmo tempo: atmosfera e interação. Em repouso, as sombras são sutis — uma profundidade quase imperceptível que se lê como a iluminação discreta de um escritório executivo, não como uma sombra dramática. No hover ou em estados ativos, a elevação aumenta apenas o suficiente para comunicar responsividade e confiança: um card se eleva, uma borda esquenta em direção ao navy, um botão ganha um translateY fracionário. As sombras nunca se anunciam; elas confirmam que algo é clicável ou já é distinto.

### Shadow Vocabulary
- **Repouso Ambiente** (`box-shadow: 0 1px 4px rgba(27,42,74,.08), 0 2px 12px rgba(27,42,74,.06)`): Elevação padrão de repouso para cards e itens de processo.
- **Hover Ambiente** (`box-shadow: 0 4px 20px rgba(27,42,74,.12), 0 8px 32px rgba(27,42,74,.08)`): Estado elevado no hover — mais profundo, ainda suave, ainda com tom de navy em vez de preto neutro.
- **Estrutural Navy** (`box-shadow: 0 2px 12px rgba(27,42,74,.2)`): Usado nos próprios elementos navy escuros (barra superior, relógio global) para assentá-los contra a página mais clara.

### Regras Nomeadas
**A Regra Confirma-Não-Anuncia.** Mudanças de elevação são sempre uma resposta a um estado (hover, ativo, "pulsos de pronto" como o botão de avançar mês), nunca um floreio decorativo estático sobre um elemento que não faz nada.

## 5. Components

### Buttons
- **Shape:** raio de 4px (`--r`), nunca em formato de pílula, exceto nas tags de status.
- **Primary:** Fundo sólido em navy institucional, texto branco, padding de `.55rem 1.1rem`; o hover muda para Navy Médio com uma sombra estrutural em navy e uma elevação de 1px.
- **Secondary:** Preenchimento transparente, borda de 1px em navy-médio, texto em navy; o hover preenche com Névoa de Navy.
- **Ghost:** Preenchimento transparente, borda neutra sutil, texto discreto; o hover deixa a borda navy e tinge o fundo com Fundo Névoa 2.
- **Danger:** Fundo vermelho claro com borda e texto vermelhos, para ações destrutivas; o hover aprofunda levemente o tom de vermelho.
- **Sizes:** `sm` (padding .32rem/.65rem, tipo .72rem) e `lg` (padding .75rem/1.5rem, tipo .9rem) como os únicos passos de escala; `block` força largura total.
- **Botão-assinatura "Avançar Mês":** fundo em gradiente navy, borda dourada de 2px, texto dourado, gravitas ao estilo Playfair via DM Sans em negrito + letter-spacing; quando uma ação está pronta, ele pulsa com um anel dourado suave (`pulseGold`) em vez de um badge ou ponto de exclamação — a única animação de chamar atenção sancionada pelo sistema.

### Chips / Status Tags
- **Style:** Totalmente em formato de pílula (raio de 20px), caixa alta, letter-spacing de 0.04em, peso 600, sempre com um par de cor semântico (fundo tingido + cor de texto correspondente da paleta de veredito: verde/vermelho/âmbar/névoa-de-navy/neutro) — nunca um preenchimento saturado bruto.
- **State:** Sem estado de alternância selecionado/não-selecionado; as tags são marcadores de status somente leitura (urgente, administrativo, instância, resolvido, pendente).

### Cards / Containers
- **Corner Style:** raio de 8px (`--r2`).
- **Background:** Superfície Papel (branco), com borda de 1px em neutro frio.
- **Shadow Strategy:** Repouso Ambiente em repouso, Hover Ambiente no hover (ver Elevation), combinado com a borda esquentando em direção à Névoa de Navy.
- **Border:** 1px sólida, neutra fria por padrão; cards de processo carregam adicionalmente uma borda esquerda de 3px em vermelho (urgente) ou navy (administrativo) como um flag de status — o único uso sancionado de uma faixa lateral colorida, porque é um sinal funcional de status, não decoração.
- **Internal Padding:** 0.85–1rem, generoso o suficiente para deixar a paleta navy/dourado respirar.

### Inputs / Fields
- **Style:** Fundo branco, borda de 1px em neutro frio, raio de 4px, label discreto em caixa alta acima do campo a 0.63rem com tracking largo.
- **Focus:** A borda muda para Navy Médio mais um anel de brilho navy suave de 3px (`box-shadow: 0 0 0 3px rgba(46,66,112,.1)`) — sem mudança para dourado; o foco é um sinal de navy, o dourado permanece reservado para conquista.
- **Hint text:** Legenda em texto tênue abaixo do campo.

### Navigation
- **Style:** Itens de navegação da barra lateral esquerda em DM Sans a 0.78rem, texto secundário discreto em repouso; o hover tinge o fundo com Névoa de Navy com texto navy; o item ativo é um preenchimento sólido em navy institucional com texto branco — o mesmo tratamento do botão primário, reforçando que "ativo" se lê como importância, não apenas seleção.
- **Mobile:** Ainda não definido no código atual; tratar como uma lacuna aberta ao adaptar para telas menores.

### Componente-assinatura: Barras de Progresso e Reputação
Barras finas (4–8px) e arredondadas aparecem por todo o jogo (reputação, energia, skills, progresso de processo) como a visualização primária de "progresso conquistado" do sistema. São sempre um preenchimento em gradiente sobre um trilho neutro plano, coloridas pelo significado: navy-para-dourado no progresso de processos, tons de verde para energia/skills positivas, tons de dourado para reputação. Essa linguagem de barra é como o sistema mostra avanço sem recorrer a badges, confete ou pop-ups de level-up.

## 6. Do's and Don'ts

### Do:
- **Do** reservar o dourado (#C9A227 e sua rampa) estritamente para distinção conquistada: reputação, prêmios, wordmark, CTAs primários prontos para ação.
- **Do** manter todo título em DM Sans, exceto o wordmark; Playfair Display é uma assinatura de um único lugar, não uma fonte de título.
- **Do** deixar a elevação responder ao estado de interação (hover/ativo/pulso-de-pronto) em vez de ficar estática como decoração.
- **Do** usar as famílias de cor de veredito (verde/vermelho/âmbar) para status, nunca um preenchimento saturado bruto.
- **Do** usar barras de progresso, não badges ou confete, como a linguagem principal para avanço e marcos.

### Don't:
- **Don't** usar estética de jogo mobile barato: gradientes exagerados, ícones cartunescos, chrome de UI estilo gacha, padrões de celebração de badge-e-confete.
- **Don't** cair nos clichês genéricos de dashboard SaaS: tiles de "métrica-herói", texto em gradiente, grids de cards idênticos.
- **Don't** esquentar os fundos neutros em direção a creme ou areia — os neutros do sistema tendem para o frio, em direção ao navy, não para o calor.
- **Don't** introduzir uma segunda serifa ou fonte de display decorativa; a raridade do Playfair Display é o que faz o wordmark parecer conquistado.
- **Don't** usar uma faixa lateral colorida como decoração pura — a única exceção (cards de processo urgente/administrativo) é um flag funcional de status, não um acento estético, e não deve se espalhar para outros componentes.
- **Don't** deixar as sombras ficarem dramáticas ou brincalhonas — devem sempre se ler como a iluminação discreta de um escritório executivo, nunca uma sombra caricata.
