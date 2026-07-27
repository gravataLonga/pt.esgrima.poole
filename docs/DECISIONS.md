# Decisões

Decisões técnicas deste repositório. As decisões de produto e de contrato estão em
[`CLIENT-SPEC.md`](CLIENT-SPEC.md) §3 e em [`API-CONTRACT.md`](API-CONTRACT.md) — não se repetem aqui.

---

## ADR-001 — Estilos com `StyleSheet` e tokens, não NativeWind

**Data:** 2026-07-24 · **Estado:** aceite

O design system Esgrima.pt (`.claude/skills/reference/`) está escrito em Tailwind v4 + Blade, para web.
Havia duas formas de o trazer para React Native: NativeWind (classes Tailwind em RN) ou portar os
tokens para um módulo TypeScript consumido por `StyleSheet`.

**Decisão:** portar os tokens. `src/ui/theme.ts` tem as cores, raios, espaçamentos, fontes e escala
tipográfica; os componentes de `src/ui/` usam `StyleSheet`.

**Porquê:** NativeWind acrescenta configuração de Babel e Metro e acopla versões (Tailwind ×
NativeWind × RN) num esqueleto que ainda não tem UI para justificar isso. E metade do que o design
system especifica — `hover`, focus rings, breakpoints, `prose` — não tem equivalente em RN, portanto a
paridade de classes seria ilusória de qualquer maneira.

**Consequências:** as classes do documento de design não se copiam e colam; traduzem-se. Reversível —
os tokens ficam num sítio só.

**Adaptações deliberadas ao portar:** `touch.min` (48) e `touch.large` (96) para os alvos tocáveis que
a spec §7 exige, e `type.timer` (88) para o cronómetro ser legível a 2 m. Nenhum dos dois existe na
escala web.

---

## ADR-002 — Dependências nativas instaladas só na fase que as usa

**Data:** 2026-07-24 · **Estado:** aceite

A spec §4 lista a stack completa: `expo-camera`, `expo-secure-store`, `react-native-mmkv`,
`expo-keep-awake`, `expo-haptics`, `expo-av`, MSW.

**Decisão:** a F0 instala só o que corre — `expo-router`, `zustand`, `@tanstack/react-query`,
`i18next`, `@expo-google-fonts/*`. O resto entra na fase que o liga.

**Porquê:** cada dependência nativa por usar é peso de build, uma versão a manter e um vetor de
incompatibilidade em cada SDK, sem nada em troca enquanto ninguém a chama.

**Consequências:** F1 traz `expo-camera` + `expo-secure-store` + MSW; F3 traz `expo-keep-awake`,
`expo-haptics` e `expo-av`; F4 traz `react-native-mmkv`. Os módulos-esqueleto correspondentes já
existem com as assinaturas certas, por isso é acrescentar corpo, não desenhar de novo.

---

## ADR-003 — Fontes importadas por subpath

**Data:** 2026-07-24 · **Estado:** aceite

`import { Montserrat_400Regular } from '@expo-google-fonts/montserrat'` puxa o índice do pacote, que
exporta **todos** os pesos — o Metro empacotava ~36 TTF (medido num `expo export`).

**Decisão:** importar de `@expo-google-fonts/montserrat/400Regular` e afins, e usar `useFonts` de
`expo-font`. O bundle passou a levar 4 TTF.

---

## ADR-004 — O esqueleto grava resultados em memória

**Data:** 2026-07-24 · **Estado:** aceite, temporário

O `useSessionStore` da F0 carrega a fixture no `connect()` e o `recordScore()` altera o array em
memória.

**Porquê:** sem isto o ecrã de assalto não teria para onde submeter e o de poule completa nunca seria
alcançável — o esqueleto não se conseguiria percorrer de ponta a ponta, que é a única coisa que ele
tem de provar.

**Consequências:** este é o ponto exato que a F1/F4 substituem por `POST /bouts/{id}/score` mais a
fila persistente. Está marcado com `ESQUELETO` no código. Não acrescentar mais lógica de domínio aqui.

---

## ADR-007 — A barra de estado pertence ao `Screen`, não ao layout de raiz

**Data:** 2026-07-24 · **Estado:** aceite

`<StatusBar />` é renderizado dentro de `src/ui/Screen.tsx` e o seu estilo deriva do `tone`:
fundo escuro → `light`, fundo claro → `dark`.

**Porquê:** fixá-lo uma vez no `app/_layout.tsx` serve o ecrã de ligar (fundo escuro) e estraga os
outros três — relógio e bateria brancos sobre fundo claro, invisíveis. Foi assim que arrancou e só se
viu no simulador. Amarrando-o ao `tone`, um ecrã novo não pode enganar-se.

**Regra derivada:** todo o ecrã passa pelo `Screen`. Nenhum renderiza `StatusBar` por sua conta.

---

## ADR-006 — A navegação verifica-se em Jest, não no simulador

**Data:** 2026-07-24 · **Estado:** aceite

`src/__tests__/navigation.test.tsx` usa `renderRouter` de `expo-router/testing-library` para percorrer
a árvore de rotas real: ligar → lista → assalto → contar toques → submeter → lista, mais o ecrã de
poule completa.

**Porquê:** é a única verificação de navegação que corre em CI. `tsc` e o `expo export` provam que
compila, não que se percorre.

**Nota sobre `react-native-web`:** está instalado para dar uma superfície de verificação rápida
(`npm run web`). **Não é alvo de suporte** — a spec §4 fixa iOS 15+ e Android 8+, telemóvel, portrait.
Nada de específico de web deve entrar no código.

**Cuidado com a API:** o `@testing-library/react-native` v14 tornou `render` e `fireEvent`
**assíncronos**. Sem `await`, `screen` fica vazio e o erro é `render function has not been called`,
que não sugere nada disto.

---

## ADR-008 — O cronómetro guarda a âncora em estado, não em `ref`

**Data:** 2026-07-24 · **Estado:** aceite

`useTimer` deriva o restante de `performance.now()`, como a spec §7 exige. A âncora do cálculo
(`{ startedAt, remainingAtStart }`) chegou a viver em `useRef` — o instinto óbvio, por não ser dado
de render.

**Decisão:** a âncora vive em `useState`. O `setInterval` só provoca re-render; o valor mostrado
continua a ser calculado, nunca decrementado.

**Porquê:** o `eslint-config-expo` traz as regras do React Compiler, e duas delas fecham a porta ao
`ref`: `set-state-in-effect` proíbe repor o cronómetro num efeito quando a duração muda, e `refs`
proíbe tocar em `.current` durante o render — que é onde o ajuste de estado derivado de props tem de
acontecer. Com a âncora em estado, o reset faz-se durante o render, só com `setState`, e passa nas
duas.

**Consequência com dentes:** um tick que expira dispara `setState`, mas o intervalo só é desmontado
no render seguinte — e podem entrar ticks pelo meio. Sem a guarda `expired` local ao efeito,
`onExpire` dispara uma vez **por tick**. Está coberto por teste (`expira em zero e avisa uma só vez`),
que falhou primeiro.

**Precisão:** `não acumula desvio ao fim de 3 minutos` é o teste que trava a regressão para
decremento por tick. Os fake timers do Jest 29 falsificam também `performance.now()`, por isso o
desvio mede-se sem esperar 3 minutos reais.

---

## ADR-009 — O URL do servidor não aparece no ecrã de ligar

**Data:** 2026-07-24 · **Estado:** aceite

A spec §6 pede uma "zona avançado" com o URL do servidor no ecrã 1.

**Decisão:** o campo não existe na UI. O `connect()` usa o valor por omissão e o QR continua a trazer
`base_url` no payload (contrato §9), que é por onde o *self-hosting* entra.

**Porquê:** decisão do dono do produto — é detalhe interno e o árbitro em pavilhão não tem nada a
fazer com ele. Um campo de texto livre à frente de quem só quer escrever 6 dígitos é ruído, e ainda
por cima editável por engano.

**Consequência:** apontar a app a outro servidor passa a depender do QR. Se a F1 precisar de o fazer
à mão (ambientes de teste sem QR), o sítio para isso é um ecrã de definições, não o ecrã de ligar.
**Isto revoga o ponto "Zona 'avançado': URL do servidor" da spec §6** — a spec manda no cliente,
por isso a divergência fica registada aqui em vez de ficar por dizer.

---

## ADR-010 — Casas de PIN desenhadas à mão obrigam a caret próprio

**Data:** 2026-07-25 · **Estado:** aceite

O PIN passou de um `TextInput` visível para seis casas desenhadas, com um input transparente por
cima. Resultado: o ecrã parecia **bloqueado**. Tocava-se, o input recebia foco (confirmado por
`onFocus`), e não mudava nada no ecrã — porque o cursor que dá esse sinal é do `TextInput` nativo, e
o nativo estava invisível.

Só se vê quando o teclado do sistema não sobe: teclado físico ligado (o que o Simulator faz por
omissão), iPad com teclado, teclado externo. Aí não há teclado a servir de confirmação e o ecrã fica
sem qualquer resposta ao toque — e, com o QR desativado até à F1, sem saída nenhuma.

**Decisão:** quem desenha o campo desenha o cursor. As casas têm caret próprio a piscar, ligado ao
`onFocus`/`onBlur`, e o campo faz `autoFocus` — o teclado sobe sozinho, sem depender de o utilizador
adivinhar que aquilo é tocável.

**Também:** o teclado `number-pad` não tem tecla de fecho. O conteúdo vive num `ScrollView` com
`keyboardShouldPersistTaps="handled"` — tocar fora fecha o teclado, tocar num botão continua a
funcionar à primeira, e o que não cabe com o teclado aberto alcança-se a deslizar em vez de ficar
cortado.

**Regra derivada:** um controlo de entrada desenhado de raiz tem de mostrar o estado de foco por si.
Vale para o PIN e para qualquer campo que venha a substituir um nativo.

---

## ADR-005 — `app/index.tsx` redireciona para `/connect`

**Data:** 2026-07-24 · **Estado:** aceite

A spec §11 nomeia o ecrã de ligação `connect.tsx`, mas o `expo-router` precisa de uma rota `index`
para a raiz. `app/index.tsx` é um `<Redirect href="/connect" />` de três linhas, mantendo os nomes de
ficheiro da spec.

---

## ADR-011 — A classificação e a grelha são calculadas no cliente

**Data:** 2026-07-25 · **Estado:** **aceite, temporário** — substituído em parte pelo
[ADR-024](#adr-024--contrato-120-arma-tempos-de-regulamento-e-classificação-servida)

`docs/poole-grelha-spec.md` descreve a folha de poule de `poole.esgrima.pt` e é explícita: o cliente
**não calcula nada**, consome `GET /poole/{uuid}/match`, que devolve `victories`, `diff`, `place` já
prontos.

Esse endpoint não faz parte do contrato desta app. O `API-CONTRACT.md` §1 exclui classificações do
seu âmbito e o único endpoint de leitura de poule é `GET /poules/{uuid}/bouts`.

**Decisão:** derivar a matriz e a classificação dos assaltos, em `src/poule/sheet.ts`, aplicando as
regras FIE que a spec da grelha documenta (V/M → indicador → TD, empates completos partilham lugar).

**Porquê:** as duas alternativas eram piores. Acrescentar o endpoint ao contrato é um MINOR do lado
do servidor, trabalho de outra equipa, para dados que a app já tem na mão — o resultado de um
assalto está em `bouts[]`. E não mostrar a grelha por falta de endpoint privava o árbitro do ecrã
que ele mais consulta entre assaltos.

**Consequências:** duas implementações das mesmas regras de classificação, uma por repositório.
Só divergem se as regras FIE mudarem, e nesse caso mudam nos dois lados de qualquer maneira. O
cálculo está coberto por `src/poule/sheet.test.ts`, incluindo os empates partilhados.

**Se o endpoint aparecer:** `buildSheet` passa a ser a montagem da resposta, e os testes de ordenação
passam a testar o servidor. As duas vistas não mudam.

**Atualização (2026-07-25):** o endpoint passou a existir no contrato — `GET /poules/{poule}/standings`,
`1.2.0` ([ADR-024](#adr-024--contrato-120-arma-tempos-de-regulamento-e-classificação-servida)).
O cálculo local **fica** até a plataforma o entregar, senão a folha de poule deixava de funcionar
hoje. Quando entregar, executa-se o parágrafo acima — que era exatamente para isto.

---

## ADR-012 — Cartões e prioridade são locais ao assalto

**Data:** 2026-07-25 · **Estado:** aceite

O `API-CONTRACT.md` §1 exclui "cartões e penalizações" do âmbito da API, e o corpo do `score`
continua a ser `{ a, b }`.

**Decisão:** os cartões (amarelo, vermelho, preto) e a prioridade vivem em `src/bout/rules.ts`, em
memória, durante o assalto. **Não são submetidos.** O que sobe é o resultado — incluindo o toque que
o cartão vermelho deu, porque esse é resultado.

> **Atualizado pelo [ADR-029](#adr-029--contrato-150-a-pista-passa-a-ver-se-enquanto-está-a-ser-arbitrada) (contrato `1.5.0`).**
> Continuam locais e autoritários — o árbitro vê-os sem servidor —, mas passam a ser **espelhados**
> para a plataforma como eventos descritivos. O corpo do `score` mantém-se `{ a, b }`.

**Porquê:** um árbitro que dá um vermelho precisa de o ver contado no resultado *já*, e precisa de
saber quantos amarelos vão. Nada disso exige o servidor. Fazer disto um pedido de API era esperar
por uma alteração de contrato para resolver um problema que é de ecrã.

**Consequência com dentes — a prioridade em empate:** FIE t.41 dá a vitória a quem tem prioridade se
o minuto de morte súbita acabar sem toques. Nessa situação o resultado correto é, por exemplo,
`3–3` com V para um dos dois. **A plataforma recusa `a === b`** (contrato §7, `allow_draw: false`),
portanto esse resultado não é representável.

A app não inventa o toque em falta: mostra um banner a dizer quem venceu, que a plataforma não
aceita resultados iguais, e deixa o árbitro registar o toque decisivo. É a decisão dele, explícita.
**Isto é uma lacuna real do contrato** — se as poules passarem a poder acabar em vitória por
prioridade com toques iguais, o `allow_draw: false` tem de ser revisto do lado do servidor.

---

## ADR-013 — Landscape só no ecrã de assalto

**Data:** 2026-07-25 · **Estado:** aceite

A spec §4 fixa portrait. Encostado à pista, porém, o telemóvel deitado é o que dá dígitos maiores e
as duas colunas de resultado, uma para cada polegar.

**Decisão:** `app.json` passa a `orientation: "default"` — sem isso o iOS nem chega a considerar
rodar — e o bloqueio passa para código: `app/_layout.tsx` fixa `PORTRAIT_UP` no arranque e
`useAllowLandscape()` (em `src/bout/orientation.ts`) levanta-o enquanto o ecrã de assalto estiver
montado, voltando a fixar ao sair.

**Porquê:** a alternativa era deixar as quatro orientações abertas e tornar os quatro ecrãs
tolerantes a landscape. Três deles não ganham nada com isso e passariam a ser mais um layout para
manter.

**Atualização (2026-07-25):** ao contrário do [ADR-009](#adr-009--o-url-do-servidor-não-aparece-no-ecrã-de-ligar),
esta divergência **foi corrigida na `CLIENT-SPEC.md`** — §4 *Alvos* passou a descrever o portrait com
a exceção do ecrã de assalto, e a tabela de stack ganhou o `expo-screen-orientation`. A spec é cópia
byte a byte do documento da plataforma, por isso **fica a mesma obrigação de espelhar** que o
[ADR-024](#adr-024--contrato-120-arma-tempos-de-regulamento-e-classificação-servida) tem para o contrato.

**Consequências:** `expo-screen-orientation` entra como dependência nativa (ADR-002 — entra a fase
que a usa). Falhar o bloqueio não é erro: em iPad com multitasking o sistema recusa, e a app
continua a funcionar. Em Jest o módulo nativo não existe e está mockado no `jest.setup.ts`.

---

## ADR-014 — O contraste é verificado por teste

**Data:** 2026-07-25 · **Estado:** aceite

O design system dá a `gray-dark` (`#BBC3C8`) o papel de *disabled text*. A variante `caption` do
`Text` usava-a como **texto secundário sobre fundo branco**: clubes, ajudas de botão, rótulos de
progresso. São **1.77:1** — nem perto dos 4.5:1 da WCAG AA, e ilegível num pavilhão. As cores de
sinalização tinham o mesmo problema em ponto pequeno: `warning` sobre `light-warning` dá 3.03:1.

**Decisão:** três tokens novos — `textMuted` (`#5A6C7A`) para fundo claro, `textMutedOnDark`, e as
variantes `dangerText` / `warningText` / `successText`, escurecidas **só para texto**. As cores de
sinalização originais mantêm-se em bordas, preenchimentos e nos dígitos grandes do cronómetro, onde
o limite é 3:1 e passam.

**E um teste:** `src/ui/contrast.test.ts` calcula o rácio WCAG de cada par cor/fundo realmente usado
e falha abaixo do limite. Inclui uma asserção que trava a regressão original.

**Regra derivada:** um par cor/fundo novo entra na tabela desse teste. Sem isso, nada o apanha —
contraste é o único erro de design que não se vê a olho num simulador iluminado a 100%.

---

## ADR-015 — O cronómetro só conta tempo; as fases são do ecrã

**Data:** 2026-07-25 · **Estado:** aceite · **Substitui parte do ADR-008**

O `useTimer` sabia quantos períodos tinha o assalto e em qual estava (`period`, `hasNextPeriod`,
`nextPeriod`). Enquanto uma poule teve um período só, isso não incomodou ninguém.

Passou a incomodar quando um assalto ganhou **três** fases com durações diferentes: período
(`duration_seconds`), descanso (`rest_seconds`) e morte súbita (60 s). A forma de trocar de fase é
mudar a duração — e o `useTimer` **repõe o período a 1 sempre que a duração muda**. Entrar em
descanso no fim do 2.º tempo teria voltado ao 1.º.

**Decisão:** o `useTimer` conta a duração que lhe derem e mais nada. O período e o descanso vivem no
ecrã de assalto; a prioridade já vivia no redutor porque decide o vencedor. Que fase é a atual, o
que ela dura e qual é o passo seguinte estão em `src/bout/phase.ts`, puro e testado.

**Porquê aqui e não no cronómetro:** "que botão ofereço a seguir ao árbitro" é uma pergunta de
regulamento — depende de haver mais períodos, de a API mandar descanso, de o resultado estar
empatado. Nada disso é assunto de quem conta milissegundos.

**Também entrou:** `adjust(delta)` e `set(ms)`. A correr, re-ancoram a contagem no instante atual em
vez de a parar, e a chegar a zero **não** chamam `onExpire` — quem acertou o tempo à mão não precisa
que o telemóvel lhe vibre a resposta.

**Consequência:** um único botão contextual por fase, em vez de "Repor" e "Período seguinte"
permanentes. Foi o que resolveu o botão de sortear mal formatado em landscape: nunca há dois.

---

## ADR-016 — Confirmar resultado é uma folha da app, não um `Alert`

**Data:** 2026-07-25 · **Estado:** aceite

Registar um resultado **não tem desfazer** — corrigi-lo é trabalho da plataforma web
(contrato §7). Essa confirmação era um `Alert.alert`: caixa cinzenta a meio do ecrã, tipografia do
sistema, nada do design system. A decisão mais irreversível da app parecia vir de outra aplicação.

**Decisão:** `src/ui/Sheet.tsx`, uma folha inferior. Usada em três sítios — confirmar o resultado
(com o resultado outra vez em grande, para se reler), anunciar o sorteio de prioridade, e acertar o
tempo.

**O que fica no `Alert`:** sair sem submeter. Aí a ação é destrutiva e vem da navegação, e o corte
de contexto do alerta nativo é a mensagem — é para interromper mesmo.

**Arrumação que veio de borla:** o "Repor" do cronómetro mudou-se para dentro da folha de acertar o
tempo. É a mesma pergunta — *que tempo devia estar no relógio?* — e tirou um botão permanente de um
ecrã que já tinha cinco.

---

## ADR-017 — `rest_seconds` é aditivo no contrato (1.1.0)

**Data:** 2026-07-25 · **Estado:** proposto — **falta o lado da plataforma**

O descanso entre períodos é um preset de competição (FIE: um minuto), não uma constante de app.

**Decisão:** `rest_seconds`, **opcional**, em `PouleSummary` e em `GET /bouts/{bout}`. Contrato a
`1.1.0`, MINOR aditivo. Ausente, `null` ou `0` → não há descanso e a app passa direto ao período
seguinte; com `periods: 1` é ignorado, porque não há intervalo entre períodos que não existem.

**Compatibilidade:** um servidor em `1.0.0` continua a servir esta app — é a regra de tolerância do
contrato §1 a fazer o seu trabalho. Nenhuma app fica partida por o campo faltar.

**Por fazer:** o `docs/API-CONTRACT.md` vive em duplicado, byte a byte, nos dois repositórios. Esta
alteração está só do lado da app. **Tem de ser copiada para `docs/app-arbitragem-api-contract.md`
na plataforma** e implementada lá, senão os dois lados divergem — que é precisamente o que o §1
chama *bug*.

**Atualização (2026-07-25):** espelhado. As duas cópias voltaram a ser byte a byte iguais na `1.3.0`
([ADR-025](#adr-025--as-duas-cópias-do-contrato-divergiram-e-o-servidor-também)). Implementação do
lado do servidor: continua por fazer.

---

## ADR-018 — O sorteio de prioridade mostra-se, não se explica

**Data:** 2026-07-25 · **Estado:** aceite

O sorteio abria uma folha a dizer quem tinha ficado com a prioridade, mais um banner de três linhas
a explicar a regra. Muito texto para uma coisa que os aparelhos da FIE resolvem com uma lâmpada.

**Decisão:** ao tocar em "Sortear prioridade", a marca pisca entre os dois atletas com os intervalos
a crescer (`priorityDrawFrames`, em `rules.ts`) e trava no sorteado. Depois fica lá, a pulsar
devagar. Sem folha, e o banner passou a uma linha: *"Prioridade a X — regista o toque decisivo."*

**Porquê a travagem:** um resultado aleatório que aparece de repente não se distingue de um toque
mal dado. A desaceleração é o que mostra que houve sorteio — e é a razão de as molduras serem
calculadas **a partir do fim**, para o número de passos nunca poder trocar o vencedor. Está em
teste (`acaba sempre no lado sorteado, seja qual for o número de passos`).

**Também nesta passagem:** os períodos deixaram de ter texto e passaram a pontos — preenchido
escuro para os disputados, verde e maior para o atual, contorno para os que faltam. Todos com
contorno escuro, porque o verde sozinho sobre branco dá 1.4:1 e a WCAG 1.4.11 pede 3:1 para
elementos não textuais que transmitem informação. O rótulo de acessibilidade continua a dizer
"Período *n* de *m*", que é o que o VoiceOver precisa e a cor não lhe diz.

---

## ADR-019 — Passividade conta-se, não se arbitra

**Data:** 2026-07-25 · **Estado:** aceite

FIE t.87: um minuto sem toque nem cartão e o árbitro **pode** dar P-cartão amarelo aos dois.

**Decisão:** um relógio pequeno no canto do mostrador, a contar esse minuto. Corre com o tempo
principal, volta ao início a cada toque, a cada cartão e a cada paragem. **Chegar a zero não faz
nada** — passa a laranja e fica à espera.

**Porquê parar aí:** a regra tem um "pode" lá dentro. Quem decide se houve passividade é o árbitro,
que está a ver o assalto; a app está a ver um contador. Dar o cartão automaticamente seria arbitrar
por ele com um décimo da informação. E se ele decidir dar, dá-o pelos cartões normais, que já
existem — não é preciso um caminho especial.

**Não conta no descanso:** os atletas não estão em pista.

---

## ADR-020 — Toque e cartão param o cronómetro

**Data:** 2026-07-25 · **Estado:** aceite

Em assalto real, um toque ou um cartão vêm sempre depois de "halt". O cronómetro parava à mão, num
segundo toque no mostrador, e ninguém se lembra disso a meio de uma poule — o tempo continuava a
correr durante a discussão do toque.

**Decisão:** registar um toque ou um cartão pára o tempo principal, se estiver a correr. Retomar
continua a ser um toque no mostrador, que é o "en garde, prêts, allez".

**Onde vive:** no ecrã (`registerCombat`), e não no redutor de regras. Mexe no cronómetro, que é um
hook — o redutor é puro e assim continua.

**Consequência:** o `−` do contador também pára o tempo. Corrigir um toque a mais é raro e acontece
com o assalto já parado; distinguir "somar" de "corrigir" acrescentava um ramo à regra para poupar
um toque no mostrador num caso que quase não existe.

---

## ADR-021 — Modo cronómetro autónomo, sem sessão

**Data:** 2026-07-25 · **Estado:** aceite

A app é um companion: sem poule na plataforma, não fazia nada. Mas nem todo o assalto que se
arbitra tem poule — treinos, provas locais e amigáveis não têm, e nesses o árbitro precisa
exatamente do que a app já sabe fazer: contar tempo, contar toques e registar cartões.

Há ainda uma razão de calendário: é a única parte da app inteiramente entregável hoje. Tudo o resto
espera pela API (F1–F5); isto não espera por nada.

**Decisão:** uma rota nova, `/timer`, em paralelo com o QR e o PIN — não em vez deles. Um assalto,
offline, sem atletas, sem submissão. O ecrã de ligar ganha uma terceira via; o caminho principal
continua a ser ligar a uma poule.

**Onde vive:** `app/timer.tsx`. Conduzir o assalto — toques, cartões, prioridade, períodos,
cronómetro, passividade — vem inteiro do `useBoutEngine`, partilhado com o `/bout/[id]`. Duplicar
essa parte seria duplicar regra FIE, que é o género de código que não pode divergir entre cópias.

**Regra:** `app/timer.tsx` **não importa `@/session/store`, e não pode passar a importar.** É essa
ausência que garante que o modo continua a funcionar sem rede quando a F1–F5 trouxerem cliente
HTTP, fila e expiração de sessão. Verificado em `timer-screen.test.tsx`: a sessão fica em
`disconnected` do princípio ao fim.

**Consequências:**

- **O empate é resultado legítimo.** `canSubmit`/`needsDecidingTouch` existem porque a plataforma
  recusa `a === b` (contrato §7, `allow_draw: false`). Sem plataforma não há quem o recuse, e pedir
  um toque decisivo que ninguém vai receber seria inventar regra. A prioridade continua disponível
  para quem a queira sortear.
- **Os presets são fixos:** 5 toques, 3:00, um período. Não há API que os mande, e um ecrã de
  configuração para os pedir seria mais interface do que o modo inteiro — o `± 10 s` e o "Acertar"
  do mostrador cobrem o desvio pontual. Rever se aparecer uso real em eliminatórias (15 toques,
  3 × 3:00).
- **Nada fica guardado.** Matar a app perde o assalto em curso; é o significado de "um assalto só".
  Sobreviver ao *background* exigia armazenamento persistente e mais uma dependência nativa
  ([ADR-002](#adr-002--dependências-nativas-instaladas-só-na-fase-que-as-usa)).
- O landscape do [ADR-013](#adr-013--landscape-só-no-ecrã-de-assalto) estende-se a esta rota: é um
  ecrã de assalto como o outro.
- **Está fora do âmbito da `CLIENT-SPEC.md` §2**, que assume sempre-ligado e exclui o modo
  espectador. A spec é cópia byte a byte do documento da plataforma e não se altera aqui — quem for
  dono desse documento do lado Laravel tem de espelhar esta decisão lá.
  **Feito a 2026-07-25:** o modo entrou na §2 das duas cópias, com a regra do `@/session/store` a
  acompanhá-lo ([ADR-025](#adr-025--as-duas-cópias-do-contrato-divergiram-e-o-servidor-também)).

## ADR-022 — `ScoreColumn` recebe um rótulo, não um `Fencer`

**Data:** 2026-07-25 · **Estado:** aceite

A coluna de resultado recebia um `Fencer` do contrato de API e lia-lhe `name`, `number` e `club` —
para desenhar **e** para os rótulos de acessibilidade. Sem atletas ([ADR-021](#adr-021--modo-cronómetro-autónomo-sem-sessão))
não havia o que lhe passar, e um `Fencer` falso com nome "Verde" punha dados inventados a atravessar
tipos que descrevem respostas do servidor.

**Decisão:** a coluna passa a receber `label`, `number`, `club` e `tone`. `number === null` **é** a
definição de "não há atletas": colapsa o bloco de nome e dá lugar à faixa de cor. O `label` alimenta
sempre os rótulos de acessibilidade — nome do atleta com a poule ligada, "Verde"/"Vermelho" sem ela.

**Consequência:** `src/bout/` deixa de importar `@/api/types`. As regras de domínio do assalto já
não conheciam a API ([ADR-012](#adr-012--cartões-e-prioridade-são-locais-ao-assalto)); agora as
vistas também não.

**Sobre a cor:** verde à esquerda, vermelho à direita, como as lâmpadas do aparelho — é o que o
árbitro já chama em voz alta, o que torna "mais um toque para o verde" um rótulo melhor do que
"para A". Fica confinada à faixa do topo da coluna: o `+` continua verde e o mostrador continua a
ficar verde a correr, e assim cada zona do ecrã mantém um só significado para a cor. Com a poule
ligada `tone` é `null` — aí quem distingue as colunas é o nome, e mais cor só competiria com ele.
Os dois pares de contraste (`dark` sobre `green`, `light` sobre `cardRed`) já estavam cobertos por
`contrast.test.ts`.

## ADR-023 — O logo entra como PNG, não como SVG

**Data:** 2026-07-25 · **Estado:** aceite

O wordmark do design system (`.claude/skills/reference/design/logo-green.svg`) é uma máscara de
letras atravessada por três barras diagonais — verde `#00F6B9` e branco `#FEFEFE`, as cores que o
`theme.ts` já tem. Não se reproduz com Views, ao contrário dos ícones desenhados à mão que há pelo
resto da app: uma máscara não é um retângulo com bordas.

Render de SVG em React Native exige `react-native-svg`, uma dependência **nativa**. Instalá-la por
causa de uma imagem contraria o [ADR-002](#adr-002--dependências-nativas-instaladas-só-na-fase-que-as-usa),
e o splash precisa de um ficheiro de imagem de qualquer maneira — o `expo-splash-screen` não aceita
SVG, seja qual for a biblioteca instalada. Havendo de rasterizar para o splash, rasterizar também
para o ecrã é o mesmo trabalho e poupa a dependência.

**Decisão:** PNG. `assets/logo.png` com as densidades `@2x`/`@3x` ao lado, que o Metro escolhe
sozinho, e `assets/splash-icon.png` para o arranque.

**Como se regeneram** (o SVG é a fonte; os PNG são derivados e não se editam à mão):

```sh
render() {  # $1 svg · $2 largura · $3 altura · $4 saída
  printf '<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:%dpx;height:%dpx}</style>' "$2" "$3" > /tmp/logo.html
  cat "$1" >> /tmp/logo.html
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
    --default-background-color=00000000 --force-device-scale-factor=1 \
    --window-size="$2,$3" --screenshot="$4" file:///tmp/logo.html
}
SVG=.claude/skills/reference/design/logo-green.svg
render $SVG 150  40 assets/logo.png
render $SVG 300  80 assets/logo@2x.png
render $SVG 450 120 assets/logo@3x.png
render $SVG 900 240 assets/splash-icon.png
```

**Consequências:**

- **A variante é a `logo-green`**, com barras verdes e brancas: foi desenhada para fundo escuro, que
  é o do ecrã de ligar (`tone="dark"`) e o do splash (`backgroundColor` a `#1D3749`, o `colors.dark`).
  A `logo-mono` é a mesma coisa toda em branco, para quando não houver verde disponível.
- **O *eyebrow* do ecrã de ligar deixou de dizer "Esgrima.pt"** — passou a só "Arbitragem". Com o
  wordmark logo por cima, a marca aparecia duas vezes seguidas.
- **`imageWidth` do splash é menor em Android** (150 contra 220). O Android 12+ recorta o ícone de
  arranque num círculo; um wordmark de 3,75:1 só sobrevive inteiro se couber no diâmetro visível.
  Por verificar em dispositivo — não há aqui como o ver.
- **O ícone da app continua a ser o placeholder do Expo** (`assets/icon.png`). Precisa de uma marca
  quadrada, que o design system não tem — o wordmark não serve para ícone.

---

## ADR-024 — Contrato 1.2.0: arma, tempos de regulamento e classificação servida

**Data:** 2026-07-25 · **Estado:** proposto — **falta o lado da plataforma**

A app cresceu para dentro do regulamento FIE (cartões, prioridade, passividade, folha de poule) sem
que o contrato tivesse crescido com ela. O resultado eram três coisas *hardcoded* e uma regra
duplicada, todas em contradição com o princípio do contrato §7: **os presets vêm sempre da API**.

**Decisão:** `1.2.0`, MINOR aditivo, com três acrescentos e uma clarificação.

| | O que entra | O que substitui |
|---|---|---|
| `weapon` | `foil` \| `epee` \| `sabre`, opcional | A app não tinha como saber a arma. A passividade não se aplica ao sabre, e estava a ser contada em todas. |
| `priority_seconds` · `passivity_seconds` | Opcionais, FIE 60/60 | `PRIORITY_SECONDS` (`rules.ts`) e `PASSIVITY_SECONDS` (`usePassivity.ts`), constantes no código. |
| `GET /poules/{poule}/standings` | V, M, TD, TR, indicador, lugar — já ordenado | O cálculo de `sheet.ts` ([ADR-011](#adr-011--a-classificação-e-a-grelha-são-calculadas-no-cliente)), que duplicava critérios FIE entre repositórios. |
| — | Redação do `POST .../score` | Não estava escrito que o toque de cartão vermelho sobe misturado no resultado, nem que a plataforma não o consegue distinguir. |

**A matriz não vem no endpoint novo.** Cada célula é o resultado de um assalto, e esses já estão em
`GET /poules/{poule}/bouts` — pedi-los outra vez era abrir uma segunda fonte para o mesmo dado, e com
ela a hipótese de as duas discordarem.

**O que ficou deliberadamente de fora:** a **vitória por prioridade com toques iguais**. É a lacuna
que o [ADR-012](#adr-012--cartões-e-prioridade-são-locais-ao-assalto) identificou, e a decisão é **não
a resolver na API** — mexer no `allow_draw` é MAJOR, e o caso é raro o suficiente para não pagar um
`/api/v2/`. Passou a estar **escrita no contrato** em vez de viver só neste ficheiro: quem ler o
`score` fica a saber que o resultado que recebe pode não ser o resultado que o regulamento produziu.
Cartões e passividade também continuam fora — só os seus *tempos* entraram, não os seus *eventos*.

**Consequências:**

- **`API_CONTRACT_VERSION` fica em `'1.0.0'`.** Passa a ser a versão *em vigor*, não a do documento:
  a `1.1.0` e a `1.2.0` existem só deste lado. Sobe quando a plataforma implementar.
- **Nada disto está tipado em `src/api/types.ts`.** O contrato altera-se primeiro, implementa-se
  depois — é a regra do §1, e vale também para os tipos.
- **`CLIENT-SPEC.md` §5 lista os endpoints e ficou desatualizada** — falta-lhe o `standings`. Não se
  corrigiu aqui por ser cópia byte a byte do documento da plataforma.
- **Por fazer, e é o mesmo pendente do [ADR-017](#adr-017--rest_seconds-é-aditivo-no-contrato-110):**
  copiar o `docs/API-CONTRACT.md` para `docs/app-arbitragem-api-contract.md` na plataforma. São agora
  **duas** versões por espelhar, `1.1.0` e `1.2.0`.

**Atualização (2026-07-25) — espelhado, com duas correções:**

- O `priority_seconds` **chama-se `sudden_death_seconds`** na `1.3.0`. A plataforma já tinha proposto
  esse nome para o mesmo tempo, e o nome do regulamento ganha ao nome do botão. Não existem dois
  campos; a app renomeia ao tipar.
- O `standings` entrou na `CLIENT-SPEC.md` §5 e §13, que deixaram de estar desatualizadas.

Ver [ADR-025](#adr-025--as-duas-cópias-do-contrato-divergiram-e-o-servidor-também).

---

## ADR-025 — As duas cópias do contrato divergiram, e o servidor também

**Data:** 2026-07-25 · **Estado:** aceite

O `API-CONTRACT.md` devia viver byte a byte igual nos dois repositórios (§1). Não vivia. Cada lado
editou a sua cópia sem ver a outra:

| Lado | O que acrescentou sozinho |
|---|---|
| App | `1.1.0` (`rest_seconds`), `1.2.0` (`weapon`, `priority_seconds`, `passivity_seconds`, `GET /standings`) |
| Plataforma | `ordered` e a regra de estabilidade do `sequence`, `events` no `score`, `sudden_death_seconds`, `410 pin_expired` removido, `X-Session-Expires-At` fora do `401` |

E, entretanto, **a plataforma implementou uma API** (`78afee4`) que não é nenhuma das duas: `/api`
sem `v1`, recursos no singular, erros sem `code`, `score` aninhado, sem `ETag`, sem `/start`, sem a
regra de *retry* seguro — e, por cima, quatro *endpoints* de eliminatórias que o contrato não conhece.

**Decisão:** três coisas, por esta ordem.

1. **`1.3.0` é a união das duas cópias**, não a escolha de uma. Conflitos resolvidos: o minuto de
   morte súbita fica `sudden_death_seconds` (nome da plataforma — nenhum dos dois lados o tinha
   implementado, por isso a escolha não parte nada), o `rest_seconds` fica apesar de ser irrelevante
   com `periods: 1`, porque ganha uso quando a app arbitrar eliminatórias.
2. **O contrato ganhou uma §11 com o estado real.** O que a plataforma serve hoje, campo a campo, com
   a consequência para a app e a correção proposta. Treze pontos bloqueiam a ligação; quatro são
   casos em que a implementação tem razão e foi o contrato que se corrigiu.
3. **As duas cópias voltaram a ser iguais**, contrato e `CLIENT-SPEC.md`, com um `cp` verificado por
   `diff`.

**Porquê a §11 em vez de reescrever o contrato para o que existe:** o contrato é o alvo, não o
relatório. Reescrevê-lo para o código apagava a lista do que falta — e é essa lista que diz à app o
que pode assumir. A §11 mantém as duas verdades separadas e visíveis.

**O que continua por decidir, e é do dono do produto:**

- A app v1 arbitra eliminatórias? A API já as serve, para poule e para torneio.
- O PIN de uso único fica? Está implementado e tem razão de segurança, mas custa uma ida ao
  organizador sempre que um telemóvel morre.
- O QR passa a levar `base_url`, ou o *self-hosting* deixa de se fazer por QR?

**Regra derivada:** um `cp` entre repositórios não é parte do trabalho — é o trabalho. Uma alteração
ao contrato que fique num só lado volta a produzir exatamente isto.

**`API_CONTRACT_VERSION` continua em `'1.0.0'`** ([ADR-024](#adr-024--contrato-120-arma-tempos-de-regulamento-e-classificação-servida)):
é a versão *em vigor*, e o que os dois lados garantem hoje é menos do que a `1.0.0`, não mais.

---

## ADR-026 — A leitura de QR é uma rota, e o parser não conhece a câmara

**Data:** 2026-07-25 · **Estado:** aceite

A F1 traz a câmara. Duas perguntas ficaram por responder no esqueleto: **onde** vive o visor, e **o
que** faz a app com um código que lê.

**Decisão 1 — rota própria (`/scan`), não uma camada dentro de `/connect`.** A câmara tem ciclo de
vida: montada quando se lê, largada quando se sai. Como camada ficaria montada por baixo do
formulário de PIN — sensor ligado enquanto ninguém lê nada, e o teclado numérico do PIN a disputar
espaço com o visor. O ecrã de ligar só ganhou o `router.push('/scan')`.

**Decisão 2 — um QR válido *é* a ligação.** O resultado não volta ao ecrã anterior para lá ser
"submetido": `/scan` liga e segue para `/poule`. Devolver o PIN ao formulário obrigaria o árbitro a
confirmar aquilo que a leitura já confirmou.

**Decisão 3 — `parseQr` é pura e não conhece o store.** Recebe uma string, devolve um resultado
discriminado. É o que permite cobrir o contrato §9 inteiro — os três *fallbacks*, a versão futura, a
recusa de `http://` — em testes sem câmara nem ecrã. O ecrã só traduz o resultado em mensagem.

**Decisão 4 — a leitura tranca-se ao primeiro código.** `onBarcodeScanned` dispara **a cada frame**
enquanto o código estiver enquadrado, não uma vez por código. Sem tranca, um QR válido chamava
`connect()` e `router.replace()` dezenas de vezes antes de a rota seguinte montar. São duas trancas
sobrepostas, porque uma só não chega: um `ref` lido dentro do *handler*, que apanha os frames que
chegam antes do próximo render, e `onBarcodeScanned={undefined}` enquanto há erro no ecrã, que
impede o mesmo código mau de se reler por trás do banner.

**Decisão 5 — `insecure_base_url` é um resultado à parte**, fora dos três *fallbacks* do contrato.
O §9 manda recusar `http://` e é isso que acontece; o que se acrescenta é a razão. Quem aponta a app
a um servidor de teste em `http://` acerta no QR e no PIN, e "QR não reconhecido" mandava-o procurar
o erro no sítio errado.

**Sobre a barra final:** o contrato diz `base_url` **sem** barra final, mas recusar o QR por causa
dela punia o árbitro por um erro do servidor. Normaliza-se na leitura — `{base_url}/api/v1` tem de
dar uma barra só.

**Permissões:** o plugin do `expo-camera` entra com `microphonePermission: false` e
`recordAudioAndroid: false`. Por omissão pede as duas, e uma app que lê QR a pedir microfone é um
pedido que não se sabe justificar em revisão de loja. Verificado por `expo config --type introspect`:
`NSCameraUsageDescription` presente, `NSMicrophoneUsageDescription` ausente, e `CAMERA` como única
permissão Android.

**Consequência para a F1:** o QR que a plataforma gera **hoje** traz só os seis dígitos, não o JSON
do §9 ([ADR-025](#adr-025--as-duas-cópias-do-contrato-divergiram-e-o-servidor-também)). O caminho que
corre na prática é portanto o *fallback* 2, com o `base_url` por omissão do store. O caminho do JSON
está implementado e testado à espera de que a plataforma o gere — é uma linha no `RefereeQrService`.

---

## ADR-026 — Contrato 1.4.0: as decisões que estavam em aberto

**Data:** 2026-07-25 · **Estado:** aceite · **Fecha o que o [ADR-025](#adr-025--as-duas-cópias-do-contrato-divergiram-e-o-servidor-também) deixou em aberto**

O ADR-025 arrumou os documentos e deixou três perguntas por responder e uma escolha técnica por
fazer. Foram todas respondidas, e a direção geral também: **é o servidor que se alinha pelo
contrato** — prefixo `/api/v1`, recursos no plural, `code` no envelope de erro, `ETag`, `/start`,
`PouleSummary`. Nada disto é negociado por endpoint; o contrato manda.

### 1. A app arbitra eliminatórias

Sim. Entra como fase da **mesma sessão**, não como aplicação nova: um token de poule alcança os
assaltos da poule **e** o quadro dela; um token de torneio alcança o quadro do torneio. Quando o
quadro é gerado a poule fecha (`locked: true`) e o quadro abre — a app muda de fase sem pedir código
novo ao árbitro.

O ecrã de assalto é o mesmo. O que muda são os presets, e esses vêm da API: 15 toques, 3 períodos, e
é aqui que o `rest_seconds` do [ADR-017](#adr-017--rest_seconds-é-aditivo-no-contrato-110) deixa de
ser decorativo — em quadro há mesmo descanso entre períodos.

**O que a app não faz:** gerar o quadro, semear, decidir quem sobe. O vencedor sobe do lado do
servidor, na transação do resultado; a app descobre-o no *poll* seguinte. E **não nomeia rondas** —
"quartos-de-final" depende do tamanho do quadro e do regulamento da prova, é decisão da plataforma,
não aritmética do cliente.

### 2. O PIN volta a ser de utilização múltipla

O servidor tinha-o feito de uso único, com um argumento real: o QR é projetado, e quem o fotografa
pode ligar-se mais tarde e ficar com o *scoring*.

**Decisão: múltipla utilização.** O caso que o uso único protege é raro; o que ele estraga é comum —
telemóvel sem bateria, app reinstalada, sessão perdida a meio de uma poule — e deixa o árbitro parado
à espera do organizador. Quem quiser cortar acesso roda o PIN, que é um clique e mata também os
tokens já emitidos. A segurança que se perde recupera-se com uma ação explícita; a autonomia que se
perdia não se recuperava de todo.

### 3. O QR leva só o PIN

O JSON `{v, base_url, pin}` fica **especificado como formato reservado** e não é emitido. Ler o QR e
escrever os seis dígitos passam a ser o mesmo caminho, com a mesma validação.

**O `parseQr` continua a aceitar os dois.** Custa umas linhas e evita uma migração coordenada: no dia
em que a plataforma emitir o formato novo, as apps já instaladas entendem-no. É o inverso do que
parece — o *parser* tolerante é que torna a decisão reversível.

### 4. A idempotência é `submission_id`, não o token

A regra antiga do contrato era "mesmo token + mesmo resultado → 200". **Tem um buraco que a fila
desta app atravessa em condições normais:** a sessão expira com submissões por enviar (§8 manda
preservar a fila), o árbitro volta a ligar, a fila drena **com um token novo** — e o servidor vê
outro token a registar o mesmo assalto. `409` falso, exatamente sobre o resultado que a fila estava a
proteger.

**Decisão:** o `score` leva um `submission_id` **obrigatório**, UUID v4 gerado pelo cliente. Mesma
submissão → `200`; submissão diferente sobre um assalto já pontuado → `409`.

**Onde é gerado importa mais do que parece:** no momento em que o árbitro **confirma** o resultado, e
guardado com o item na fila. Gerá-lo no envio anulava tudo — cada *retry* seria uma submissão nova
aos olhos do servidor, que é precisamente o falso conflito que a chave existe para evitar. Está
escrito na `CLIENT-SPEC.md` §8 e tem de ter teste.

**Porquê não `Idempotency-Key`:** é a mesma ideia a exigir um armazenamento de chave→resposta com TTL,
para repetir uma resposta que aqui se deriva do estado do assalto. Uma coluna resolve.

**Consequência aceite:** o `scored_by_me` continua a derivar do token, por isso **reinicia numa
reconexão**. Um resultado que o árbitro registou antes de voltar a ligar passa a aparecer como sendo
de outra pessoa. É cosmético — serve o ecrã de lista, não decide escritas — e fica dito para não ser
lido como bug.

### O que isto obriga do lado da app

- `src/api/types.ts` ganha `EliminationMatch`, `TournamentSummary`, `scope`, `submission_id`, o
  `number` *nullable* e o `PouleSummary.elimination`. **Continua a esperar pelo servidor** — a regra
  do §1 não muda por a decisão estar tomada.
- A fila passa a guardar `submission_id` e o tipo de alvo (`bout` \| `match`).
- Ecrãs novos: `/bracket` e `/match/[id]`, este último a reusar o `useBoutEngine` como o `/timer` já
  faz ([ADR-021](#adr-021--modo-cronómetro-autónomo-sem-sessão)). Duplicar a condução do assalto seria
  duplicar regra FIE.
- A máquina de estados ganha `POULE → BRACKET`, disparada por um *poll*, não por uma ação.

**`API_CONTRACT_VERSION` continua em `'1.0.0'`** até a plataforma servir isto. Sobe direta a
`'1.4.0'`: as intermédias nunca existiram em código.

---

## ADR-027 — A plataforma serve o contrato; o desbloqueio é agora deste lado

**Data:** 2026-07-25 · **Estado:** aceite · **Fecha o ADR-025 e o segundo ADR-026**

O servidor alinhou-se pelo contrato. Está servido, em `/api/v1` e fixado por teste do lado da
plataforma: o envelope `{ code, message, errors? }` com o catálogo do §8, o `submission_id`
obrigatório com a matriz 201/200/409, os `POST .../start` com os `GET` de detalhe a voltarem a ser
leituras puras, o `PouleSummary`/`TournamentSummary` com `scope`, os `ETag` nas quatro listas, o
`X-Session-Expires-At`, a classificação servida, o `GET`/`DELETE /session`, os presets completos
(`weapon`, `rest_seconds`, `sudden_death_seconds`, `passivity_seconds`) e o PIN reutilizável.

**A regra do §1 do contrato deixa de nos travar.** "Alterar o contrato primeiro, implementar depois"
foi cumprido: o documento está na `1.4.1` e os dois lados conhecem-no. O que estava à espera do
servidor passa a estar à espera de nós.

### Duas coisas que o contrato não previa e que mudam o que a app pode assumir

**1. Os quadros de consolação não vêm na API.** O `EliminationMatch` não tem forma de os distinguir
do quadro principal — viriam com `round`/`position` repetidos, e a app desenharia um quadro
impossível. `GET .../elimination` devolve **só o quadro principal**; consolação arbitra-se na web.
Se um dia fizerem falta, é um campo novo (`bracket_type`) e uma versão MINOR.

**2. O `401` distingue-se em três, e o servidor teve de trabalhar para isso.** Um token apagado não
consegue dizer porque desapareceu, por isso a plataforma passou a **apagar** o token que foi
substituído ou rodado (`token_revoked`) e a **expirar no lugar** o de uma competição encerrada
(`poule_complete`). Para a app isto significa que **`poule_complete` é de confiança**: quando chega,
a competição acabou mesmo, e o ecrã a mostrar é o de conclusão, não o de voltar a ligar.

### O trabalho que fica

1. `src/api/types.ts` tipado a partir da `1.4.1`.
2. A fila a guardar o `submission_id` gerado **na confirmação**, com teste que o prove — é a metade
   do ADR-026 que só a app pode entregar.
3. `/bracket` e `/match/[id]`, e a transição `POULE → BRACKET` na máquina de estados.
4. `API_CONTRACT_VERSION` sobe para `'1.4.1'` quando a app deixar de correr só contra os mocks.

---

## ADR-028 — A app ligada ao servidor a sério: o que se decidiu ao fazê-lo

**Data:** 2026-07-25 · **Estado:** aceite · **Fecha o ADR-027**

O ADR-027 listava o que faltava deste lado. Está feito. Estas são as decisões que só apareceram
com o servidor a sério do outro lado — nenhuma delas estava no plano.

### 1. O `ETag` reenvia-se na forma forte, e a correção a sério é do servidor

O `304` do contrato §5 **nunca acontecia**. Não por culpa de nenhum dos lados isoladamente: o
servidor compara o `If-None-Match` por igualdade de string com o `ETag` forte que gerou, e o nginx
à frente enfraquece-o para `W/"..."` sempre que comprime — ou seja, para todos os clientes que
mandam `Accept-Encoding: gzip`, que são todos.

O cliente passa a normalizar para a forma forte antes de reenviar (`strongEtag`). **É mitigação,
não correção**: resolve o polling desta app e continua correto quando o servidor passar a fazer a
comparação fraca que o RFC 9110 §13.1.2 manda. Qualquer outro cliente do `/api/v1` continua a
transferir a lista inteira de dez em dez segundos até lá.

Isto só se descobre ligando os dois lados. Um mock teria concordado com a app para sempre.

### 2. A classificação deixou de se calcular aqui

O contrato `1.2.0` acrescentou `GET /poules/{poule}/standings` e diz-lhe o essencial: *"O servidor
é que ordena. (…) O cliente mostra `place` tal como vem e não reordena."* A app tinha uma
implementação própria dos critérios FIE (V/M → indicador → TD), do tempo em que a classificação não
era servida (ADR-011).

Duas implementações dos mesmos critérios de desempate são duas respostas para a mesma pergunta, e a
que o árbitro vê na web ganha sempre. A daqui saiu, com os testes que a cobriam. **A matriz fica**:
o contrato §7 diz explicitamente que não é servida, e cada célula é um assalto que a lista já traz —
não é cálculo de classificação, é a mesma lista noutra disposição.

### 3. Servidor falso no lugar do MSW, mais um teste contra a plataforma

A spec §10 previa MSW. O que ela quer é que os cenários de erro se testem sem os provocar num
servidor, e isso consegue-se trocando `@/api/endpoints` inteiro — que é a fronteira exata onde o
contrato acaba e a app começa — por um servidor em memória. Uma dependência a menos, e o mesmo
alcance: 409, assalto removido, sessão expirada, rede em baixo.

Mas um mock testa a app contra a **leitura que a app fez** do contrato. Foi por isso que o `ETag`
acima passou despercebido. Daí o `src/api/live.test.ts`, que corre contra a plataforma com um PIN
de uma competição descartável e verifica as formas campo a campo, a matriz 201/200/409 e o `304`.
Fica fora do `npm test` — sem as variáveis de ambiente é saltado, e a suite continua a não precisar
de rede.

### 4. O polling pára enquanto o cronómetro corre

O `Stack` do expo-router não desmonta a lista ao empilhar o ecrã de assalto por cima. Sem nada, a
lista revalidava de dez em dez segundos durante um assalto inteiro. O contrato §5 já previa a
cadência — 10 s com a lista em foco, 30 s no ecrã de assalto parado, **pausado** com o cronómetro a
correr — e faltava só um sítio onde a declarar: `src/api/polling.ts`.

### 5. A morte súbita e a passividade passaram a vir da API

Estavam em constantes (`PRIORITY_SECONDS`, `PASSIVITY_SECONDS`), e o contrato §7 é explícito: *"nenhum
é hardcoded na app, nem sequer o minuto da morte súbita"*. Entraram no `BoutTiming`, ao lado da
duração e dos períodos. A constante `PRIORITY_SECONDS` desapareceu — o nome do contrato é o do
regulamento (`sudden_death_seconds`), e não existem dois campos.

### 6. Um ecrã de assalto, não dois

O contrato §7 diz que a app arbitra a poule e o quadro *"no mesmo ecrã de assalto"*, e é literal: a
única diferença é o URL para onde o resultado vai e o texto do cabeçalho. `src/bout/BoutScreen.tsx`
recebe um `BoutAssignment` e não sabe em que fase da competição está; `app/bout/[id].tsx` e
`app/match/[id].tsx` são as duas rotas que o alimentam. Duplicá-lo seria duplicar condução de
assalto, que é a parte que não pode divergir entre cópias.

---

## ADR-029 — Contrato 1.5.0: a pista passa a ver-se enquanto está a ser arbitrada

**Data:** 2026-07-25 · **Estado:** aceite · **Servidor entregue; o lado da app é a F7**

Levantado do lado da plataforma: os eventos de dentro de um assalto não apareciam em lado nenhum. A
web mostrava `Bout called` e `Result recorded`, e no meio — o assalto inteiro — nada. Uma poule a
meio era, vista de fora, indistinguível de uma poule que ninguém tinha começado.

O contrato já tinha desde a `1.0.0` o `events` **opcional no `score`**, e nunca ninguém o enviou.
Não é acidente: chega no fim, e o que faz falta é durante.

**Decisão:** `POST /bouts/{id}/events` e `POST /elimination/{id}/events`, aditivos (MINOR), com o
toque, o duplo, os cartões, a prioridade e o fim de período enviados **no instante em que
acontecem**. A plataforma já os serve e já os mostra no painel do organizador, na gaveta do assalto
e na página pública do evento.

### A idempotência é um contador por assalto, não um UUID

O `score` usa `submission_id` porque uma submissão é única e cara: perdê-la é perder o resultado.
Um toque é o contrário — barato, repetido e **indistinguível do toque idêntico ao lado dele**. Dois
toques seguidos para o mesmo atleta, no mesmo período, com `at_ms` a 40 ms de distância, são duas
linhas legitimamente quase iguais; nada no conteúdo diz se são dois toques ou o mesmo enviado duas
vezes por uma rede que falhou.

**Decisão:** a app numera os eventos a partir de `1` **dentro do assalto** e envia `seq`. O servidor
tem `(assalto, seq)` como chave única e ignora um repetido em silêncio, devolvendo `accepted: 0`.

**Porquê não um UUID por evento:** funcionava, e custava 36 bytes por toque e uma tabela de chaves
do lado do servidor para dizer o que um inteiro por assalto já diz. O contador tem outra
propriedade que o UUID não tem: é **legível** — uma linha temporal com buracos vê-se a olho.

### O placar vai no evento e não se recalcula

Contar os `touch` e derivar o placar parece mais limpo e está errado: um árbitro que retire um toque
deixa a contagem a divergir do que o telemóvel mostra, e o que o público vê na parede tem de ser o
que o árbitro tem à frente. Cada evento leva `score_a`/`score_b` **depois** do evento, e a web mostra
o último. Mantém a regra que o contrato já tinha para o `events` do `score`: **descritivo, nunca
autoritário**.

### Ou em direto, ou em lote

Uma app que envie em direto tem o `events` do `score` **ignorado** pelo servidor — são os mesmos
toques contados duas vezes, e só a cópia em direto tem contador para se impedir de duplicar. Não há
modo misto e não vale a pena inventar um.

### Não entram na fila offline

A fila da `CLIENT-SPEC.md` §8 existe para o que não se pode perder, e tem limite de 50 itens. Um
assalto pode gerar 30 eventos; três assaltos sem rede enchiam-na e passavam a competir com
resultados por enviar. **Um toque perdido é uma linha a menos num ecrã que ninguém está a arbitrar
por ele.** Na falha, junta-se ao lote seguinte (o `seq` trata da duplicação) e desiste-se dele
quando o assalto é submetido.

### O que isto muda no [ADR-012](#adr-012--cartões-e-prioridade-são-locais-ao-assalto)

Nada do que ele decidiu. Os cartões e a prioridade **continuam locais e autoritários** durante o
assalto — o árbitro vê-os já, sem servidor. O que muda é que passam também a ser **espelhados** para
a plataforma como eventos descritivos. O ADR-012 dizia "não são submetidos" a respeito do
*resultado*, e isso mantém-se: o que sobe no `score` continua a ser `{ a, b }`.

### O trabalho da F7

1. Um contador por assalto no `useBoutEngine`, reiniciado a cada assalto.
2. `postEvents(...)` em `src/api/endpoints.ts`, *fire-and-forget*, com o lote acumulado na falha.
3. `API_CONTRACT_VERSION` sobe para `'1.5.0'`.
4. Teste que prove o essencial: reenviar o mesmo `seq` não duplica, e uma falha de rede não estraga
   o assalto nem enche a fila de resultados.

> **Feito a 2026-07-25.** O que se decidiu ao implementá-lo — o que a app não emite, o teto do lote,
> quando se desiste — está no [ADR-030](#adr-030--a-pista-ao-vivo-do-lado-da-app-o-que-se-decidiu-ao-enviá-la).

---

## ADR-030 — A pista ao vivo do lado da app: o que se decidiu ao enviá-la

**Data:** 2026-07-25 · **Estado:** aceite · **Fecha a F7 do [ADR-029](#adr-029--contrato-150-a-pista-passa-a-ver-se-enquanto-está-a-ser-arbitrada)**

O contrato `1.5.0` disse o que enviar. Ao enviá-lo apareceram cinco perguntas que ele não responde,
porque nenhuma delas é do servidor.

### O que a app **não** emite, e porquê

O conjunto de `type` do contrato é fechado, e a app usa seis dos sete: `touch`, os três cartões,
`priority` e `period_end`.

- **`double` não.** O ecrã de assalto não tem botão de duplo — tem `+` e `−` por atleta, e um duplo
  são dois toques em dois botões. Emitir um `double` obrigaria a adivinhar a intenção a partir de
  dois toques próximos no tempo, e um evento inventado é pior do que dois eventos certos.
- **Retirar um toque não tem evento**, porque não há `type` para isso. O placar corrigido viaja no
  evento seguinte, que é exatamente a regra que o ADR-029 já tinha fixado: **quem manda é o placar**,
  não a contagem dos eventos. Uma linha temporal que não fecha com o resultado é o comportamento
  esperado, não um defeito.
- **O `period_end` é só do tempo regulamentar.** O descanso é intervalo — não acontece nada em pista
  — e a morte súbita a esgotar não acaba um período, acaba o assalto, e quem o resolve é a
  prioridade já sorteada. O sorteio, esse, sobe como `priority` com `period = periods + 1` e
  `at_ms: 0`: é ele que abre a morte súbita.

### O lote é o *buffer*, com teto de 50 e a perder os mais velhos

O contrato aceita 1 a 50 eventos por pedido. Em vez de uma fila com política própria, o que ficou por
enviar **é** o próximo lote: cabe num pedido por construção, e o teto resolve-se deitando fora o mais
antigo. Um assalto inteiro sem rede perde o princípio da linha temporal e mantém o fim — que é o que
a web mostra, porque o placar que ela pinta é o do evento mais recente.

Não é a fila da [`CLIENT-SPEC.md`](CLIENT-SPEC.md) §8, e não pode ser: aquela existe para o que não
se pode perder, tem 50 itens e protege resultados. Um toque perdido é uma linha a menos.

### Desistir de vez num 4xx, insistir num 5xx

Uma falha de rede junta-se ao lote seguinte. Uma recusa que não passa a valer com o tempo — poule
fechada, sessão morta, id que já não existe — desliga o espelho para o resto do assalto. Sem isto,
cada toque gastava um pedido do limite de 60/min que este endpoint **partilha com o *polling***, para
mandar algo que vai ser recusado outra vez. A regra reaproveita o `isRetryable` do cliente HTTP, que
já é a mesma distinção que o `score` faz.

Pela mesma razão o `postBoutEvents` vai com `retries: 1`: repetir aqui é mandar duas vezes o que o
toque seguinte já vai levar.

### O `at_ms` é carimbado no toque, não lido do *tick*

O `remainingMs` do cronómetro atualiza-se a cada 50 ms, e isso chega para o **mostrar**. Não chega
para dizer em que instante um toque caiu. O `useTimer` passou a expor `remainingNowMs()`, derivado do
relógio monotónico no momento em que é chamado — a mesma fonte da [precisão](CLIENT-SPEC.md#precisão)
que o ADR-008 fixou, sem um segundo relógio a discordar do primeiro.

### O motor emite, mas não sabe para onde

`useBoutEngine` recebe um `onEvent` **opcional**. O modo cronómetro autónomo (ADR-021) não o passa e
continua a não conhecer servidor nenhum — a mesma razão por que ele não importa `@/session/store`. As
duas rotas ligadas passam o endpoint que lhes diz respeito, `/bouts/{id}/events` ou
`/elimination/{id}/events`, e o `BoutScreen` não sabe qual é. É a fronteira que o ADR-028 já tinha
traçado entre o ecrã de assalto e a fase em que ele está.

---

## ADR-031 — Sair é da app, concluir é do árbitro

**Data:** 2026-07-25 · **Estado:** aceite

A app tinha **uma** saída de uma competição, e era do servidor: o `401 poule_complete`, que só chega
quando a competição está encerrada para sempre — assaltos feitos **e** quadro decidido (contrato §6).
Até lá não havia botão nenhum. Um árbitro que acabasse a poule ficava a olhar para uma lista toda
pontuada; um árbitro que se ligasse à poule errada ficava lá até o token expirar sozinho, 60 minutos
depois. O `disconnect()` do *store* existia desde a F1 e **não era chamado por ecrã nenhum** a não ser
o de competição completa, que é precisamente o que não se alcançava.

**Decisão: duas saídas, com significados diferentes.**

### "Sair", sempre

No canto do cabeçalho da lista e do quadro. Termina a sessão, revoga o token e volta ao ecrã de
ligar. É a saída de quem se enganou de poule, de quem passa o telemóvel a outra pessoa, e de quem
acabou o dia.

Não espera pela rede: o `disconnect()` apaga o token localmente primeiro e só depois tenta o
`DELETE /session`. **A fila fica** (spec §9) e drena na sessão seguinte, com a chave de idempotência
que já tinha — é o cenário do [ADR-026](#adr-026--contrato-140-as-decisões-que-estavam-em-aberto), e
a folha de confirmação diz ao árbitro quantos resultados ficam à espera.

### "Concluir", só quando não sobra nada

Aparece por uma condição, e não por uma fase: `nothingLeftToDo` em `src/session/completion.ts` —
todos os assaltos registados e, havendo quadro, todos os combates decididos; ou a poule fechada, que
já não aceita resultados nem que tenha assaltos por disputar; ou o quadro do torneio completo.
`0/0` não conta: é uma lista a carregar, não uma lista acabada.

Um botão que só aparece quando é verdade vale mais do que um botão permanente desativado: o que ele
comunica é **"acabou"**, e um botão cinzento no fundo do ecrã comunica isso ao contrário.

### Concluir **não** é o `poule_complete` do servidor

A app passa à fase `complete` e mostra o resumo, mas **não** revoga o token — quem o revoga é o
"Ligar a outra competição" do resumo. São duas coisas diferentes e é deliberado:

- O servidor não sabe que o árbitro acabou. A poule pode continuar a receber um quadro gerado
  depois, e outra pessoa a arbitrá-lo. Uma app que dissesse "encerrada" ao servidor estaria a decidir
  por ele.
- O resumo mostra o retrato do que ficou feito, e esse retrato é o *summary* que está no *store*. O
  `disconnect()` limpa-o — concluir e desligar no mesmo gesto deixava o ecrã de resumo sem nada para
  mostrar, e o `/complete` a redirecionar para o `/connect`.

Um *poll* atrasado não desfaz a decisão: o `applySummary` já não tirava ninguém de `complete`.

### O custo de sair é seis dígitos

As duas folhas dizem a mesma coisa, e é o que torna as duas seguras: o PIN é de **utilização
múltipla** (contrato §9, decisão da spec §3), portanto voltar a entrar é escrever seis dígitos. Se
sair fosse caro — se o PIN se gastasse — este ADR teria de ser outro, com um passo de confirmação
muito mais pesado.

---

## ADR-032 — O quadro saiu da app, e o combate passou a ser a sessão

**Data:** 2026-07-25 · **Estado:** aceite · **Contrato:** `2.0.0`

O contrato desceu o código de árbitro da competição para a **pista**: cada combate de eliminatória
passou a ter o seu PIN, e o `scope` da sessão passou a `poule | match`. A razão vem do pavilhão e
está na §7 do contrato — um quadro de 16 corre em oito pistas ao mesmo tempo, e um código só para o
quadro inteiro dava a cada um dos oito árbitros todos os combates. Pior: como um código segura um
dispositivo de cada vez, o segundo a lê-lo tirava a sessão ao primeiro.

Do lado da app, a consequência não é uma mudança de tipos — é uma mudança de produto.

### `app/bracket.tsx` foi apagado, e nada ficou no lugar

Os dois endpoints que o alimentavam saíram da API. Não há como desenhar o quadro, e não deve haver:
uma sessão alcança **um** combate, e desenhar o resto seria desenhá-lo a partir de dados a que ela
não tem direito. Quem quer o quadro inteiro abre a página do organizador, que é onde ele é
desenhado, semeado e onde os códigos são distribuídos — um por cartão.

Isto apaga também a transição `poule fechada → quadro`, que era a peça mais elaborada do *store*: o
`bracketAnnounced`, o `markBracketAnnounced` e o *redirect* de uma vez só. Uma poule que fecha passa
a **ler-se**, com o `elimination` ao lado a dizer o progresso do quadro para onde os atletas foram, e
uma frase a explicar que cada combate tem código próprio. O banner substitui um ecrã inteiro, e tem
de o fazer: sem ele o árbitro vê uma lista que deixou de aceitar resultados e não tem nada que lho
explique.

### O ecrã do combate herdou o que a lista carregava

Era uma rota-folha: chegava-se lá a partir do quadro, e o quadro carregava o cabeçalho, a barra de
sessão, o banner da fila e o "Sair". Sem quadro, o combate é o **único** ecrã da sessão e passou a
carregar tudo isso. Duas consequências que valem a pena estar escritas:

- **Não há galho de "voltar".** O `BoutScreen` passou a receber `back?: () => void` em vez de
  `home: Href`, e num combate não recebe nada: as saídas são o "Sair", que revoga o token, e registar
  o resultado. Um galho que apontasse a um ecrã que não existe era pior do que não haver galho.
- **`ready: false` ganhou ecrã próprio.** O código de uma pista pode ser entregue antes de se saber
  quem lá joga, e até aqui esse caso era tratado pela *lista* — a linha aparecia e não abria. Agora
  é o ecrã inteiro: os dois lugares, sem cronómetro e sem contadores. **Não se monta o motor do
  assalto**, porque sem atletas não há o que cronometrar e o servidor recusaria o resultado com
  `409 match_not_ready`.

### O `useMatchDetail` passou a fazer *polling*, e é isso que destranca o ecrã

Um assalto de poule tem a lista por baixo a revalidar por ele. Um combate não tem lista nenhuma — o
contrato §5 diz isso mesmo ao explicar porque não há `ETag` do lado da eliminatória. Este pedido
passou a ser a única fonte de notícias da pista, e há uma que o árbitro não pode perder: um combate
entregue por preencher **destranca-se sozinho** quando a ronda anterior acaba. Sem *polling* ele
ficava a olhar para um ecrã trancado à espera de nada. A cadência é a do ecrã de assalto — 30 s com o
cronómetro parado, pausada com ele a correr.

### Quem decide para onde se vai é a rota, não o ecrã

Registar o resultado de um combate **encerra a sessão** do lado do servidor. O `BoutScreen` ganhou
`onFinished(result)`, chamado quando o resultado passa a ser a palavra final do árbitro — registado
ou em fila. A rota da poule ignora-o e volta à lista; a rota do combate escreve o resultado no
*store* e leva ao resumo.

**O resultado tem de viajar por aí e não por uma releitura**, e é a parte que só se vê ao usar: com
a rede em baixo, releitura nenhuma o traz, e o resumo mostrava um combate por pontuar por cima de um
resultado que o árbitro tinha acabado de dar.

### A fila ganhou uma segunda contagem, e é uma aresta nova

A fila é filtrada por pista, e tem de ser: um token de combate não alcança outro combate. Com um
código por pista, isso abre um caso que antes não existia:

1. o árbitro regista o resultado da pista 3 **sem rede**;
2. a sessão da pista 3 acaba ali — não há mais nada a arbitrar nela;
3. o árbitro liga-se à pista 5, com outro código;
4. o resultado da pista 3 **não drena**, e não há token que o possa entregar a não ser o daquela
   pista.

Com o quadro inteiro num só código isto não acontecia: a sessão continuava viva e a fila drenava.
Não há forma de a app resolver isto sozinha — o que ela pode fazer é **não fingir que está a tratar
do assunto**. O `QueueBanner` passou a contar à parte o que pertence a outra pista, e diz o que é
preciso: voltar a ligar-se com aquele código. Resolver resolve-se rodando o PIN daquela pista, ou
registando o resultado na web.

### O `410 competition_finished` passou a mostrar o texto do servidor

Ia contra a regra escrita no `useConnect`: a app está em `en` e traduz os `code` que conhece, para
não misturar duas línguas no mesmo ecrã. Mas esta é a única `message` do contrato que **muda com o
caso** — diz se a poule fechou por um quadro, se foi toda disputada, ou se o combate já foi
arbitrado — e, quando é a primeira, diz para onde ir: *"cada combate das eliminatórias tem o seu
próprio código — peça o da sua pista."*

Uma constante em `en` no lugar disso deixa o árbitro parado à espera do organizador no meio de um
evento que claramente não terminou. **A frase certa na língua errada desbloqueia-o; a frase errada
na língua certa não.** A saída limpa é um `reason` traduzível vindo do servidor, e isso é uma
alteração MINOR do contrato — que se faz alterando o documento primeiro.

## ADR-033 — O mostrador passou a ser um painel, e os algarismos passaram a ser pontos

**Data:** 2026-07-26 · **Estado:** aceite

O cronómetro e os resultados deixaram de ser texto grande e passaram a **algarismos de pontos sobre
painel preto**, à maneira do marcador da FIE. É a única mudança da app que é puramente de aparência
— e a razão de a fazer é que a aparência, aqui, é função: um mostrador que se parece com o aparelho
que está ao lado da pista lê-se sem se aprender.

### Sete segmentos, não uma matriz de pontos

A tentação era desenhar uma matriz 5×7 e escrever nela. Não é o que os marcadores fazem: cada traço
do algarismo é uma **corrente de LEDs**, e a silhueta continua a ser a dos sete segmentos de sempre.
Uma matriz dá letras de consola; sete segmentos dão um mostrador. A `dotGlyphs` guarda os sete
segmentos, cada um com os seus extremos — é a sobreposição nos cantos que fecha o contorno do `0` e
dá ao `1` uma coluna contínua em vez de dois troços soltos.

Só se desenham os pontos **acesos**. Num painel preto os apagados não se veem, e não os desenhar
baixa o mostrador de umas 200 `View`s para menos de 70 — o que interessa porque o cronómetro
re-renderiza a 20 Hz. Cada algarismo é memorizado à parte: na maior parte dos ciclos muda um só.

### O tamanho vem da caixa, não de uma constante

O `DotDisplay` mede-se por `onLayout` e tira daí o tamanho do ponto. Tem de ser: o mesmo componente
serve o cronómetro em retrato, o mesmo cronómetro apertado em landscape e o resultado dentro da
coluna. E reserva sempre a largura do formato mais comprido — sem isso, os algarismos mudavam de
tamanho ao cruzar os 10 s e ao passar de 9 para 10 toques. Num mostrador, dígitos que encolhem
sozinhos leem-se como avaria.

### Os pontos não são texto, e isso tem um preço

O que estava escrito num `<Text>` passou a ser um monte de `View`s. **Nenhum leitor de ecrã as
reconstrói**, e nenhum teste as encontra por texto: o valor vive agora no `accessibilityLabel` do
mostrador, e as asserções do cronómetro passaram de `getByText` a `getByLabelText`. É a troca
inteira desta decisão — o ecrã ficou mais legível para quem vê e continua igual para quem ouve,
mas só porque o rótulo é obrigatório na API do componente.

A vírgula dos décimos ficou um ponto em baixo, como em qualquer mostrador de segmentos: a 5 pontos
de largura não há forma de desenhar a cauda sem ela parecer sujidade. O `0:09,9` continua inteiro,
com vírgula, no rótulo.

### O fundo do painel não muda com a fase

Em cartão branco, cada fase tinha o seu fundo — cinzento no descanso, laranja claro na morte súbita.
Um painel não faz isso; aparelho nenhum muda de cor de fundo. Quem diz a fase passou a ser a borda
e a cor dos algarismos: verde a contar, laranja nos últimos dez segundos, vermelho esgotado, branco
esbatido no descanso — porque aí o tempo que corre não é o do assalto.

Nos resultados, a cor do lado deixou de estar confinada à faixa do nome e passou também aos
algarismos: verde de um lado, vermelho do outro, como as lâmpadas do aparelho. Com a poule ligada
não há lado nenhum e o painel acende a branco. O limite de toques, que antes pintava o número de
verde, passou a acender a **borda** do painel — com os algarismos já verdes de um dos lados, pintá-
los de verde não dizia nada.

Todos os pares novos entraram na `contrast.test.ts`. Os algarismos são medidos pela régua do texto
grande e não pelos 3:1 do não textual: para o sistema são `View`s, mas para quem olha são números.

## ADR-034 — O ecrã de assalto passou a falar a língua do painel

**Data:** 2026-07-26 · **Estado:** aceite

O [ADR-033](#adr-033--o-mostrador-passou-a-ser-um-painel-e-os-algarismos-passaram-a-ser-pontos)
trouxe painéis pretos para o meio de um ecrã desenhado à volta de texto e botões verdes. O que se
seguiu foi a conta de o fazer: metade dos controlos deste ecrã tinham sido desenhados para o ecrã
anterior, e viam-se.

### A borda a correr passou a pulsar

Verde fixo dizia "a correr" tão bem como dizia "parado com uma borda verde": a 2 m, uma cor estática
não tem estado. Agora respira, e é a única coisa do ecrã que se mexe sozinha quando o tempo anda.
Anima-se `opacity` numa camada por cima da borda, e não a `borderColor` da borda: cor animada obriga
a largar o *native driver* e a passar cada fotograma pela ponte JS, ao lado de um cronómetro que já
re-renderiza a 20 Hz.

### O descanso e os períodos deixaram de depender do cronómetro

O passo seguinte (`nextClockAction`) continua a ser um só, e continua a aparecer quando o tempo
acaba — mas passou a haver **descanso a pedido** e **períodos com galhos para os dois lados**. A
razão é a mesma do `± 10 s`: o árbitro é a autoridade, e a app não pode ser mais teimosa do que ele.
Um intervalo pode ser preciso a meio de um período — assistência, material partido — e um período
mal contado corrigia-se, até aqui, saindo do assalto e perdendo-o.

Os galhos ficam **dentro do painel**, aos lados dos pontos que já diziam em que período se está: os
pontos são a leitura, os galhos são a escrita da mesma coisa. Mudar de período recomeça sempre no
tempo cheio — um período que começa a meio não é um período — e **não entra na linha temporal**: o
conjunto de `type` do contrato §7 é fechado, e uma correção de quem arbitra não é um acontecimento
da pista.

### O painel do resultado é o botão de marcar

Como o mostrador é o botão de arrancar (spec §7). Dois botões `+`/`−` de igual peso por baixo do
resultado diziam que tirar um toque é tão frequente como dar um, e não é: dão-se cinco a quinze por
assalto, tira-se um de tempos a tempos e por engano. O `+` desapareceu para dentro do painel — alvo
de meia coluna, que se acerta sem olhar — e o `−` ficou numa tira baixa por baixo dos cartões.

O aceso ao toque foi tentado e recusado: aclarar o fundo do painel punha os algarismos vermelhos a
**1.95:1** contra o fundo novo, e o número que se está a mudar deixava de se ler no instante em que
se lhe toca. Esmorece, como o mostrador.

A borda verde de limite de toques deu lugar a uma **lâmpada ao canto**. Uma borda de 2 pt a toda a
volta de um painel preto era um berro para dizer o que uma lâmpada acesa diz melhor — e é assim que
o aparelho o diz.

### Anular um cartão mudou de sítio, e de significado

O botão "Anular último cartão" era de largura inteira, só existia depois do primeiro cartão — e ao
aparecer empurrava o resto do ecrã para baixo. Pior: com dois atletas, anulava o **último cartão do
assalto** e não o daquela coluna, que é o que quem carrega naquela coluna espera.

Agora anula-se **premindo o próprio cartão sem largar**, e o redutor ganhou o alvo: `undoCard` com
`side` e `kind` tira o mais recente daquele atleta e daquele tipo; sem argumentos continua a tirar o
último, que é o que os testes de sempre exercem. O preto esgotado deixou de ser `disabled` e passou
a ser só **anunciado** como esgotado: `disabled` fechava também a pressão longa, e ela é a única
saída de um preto dado por engano.

O preço é ser uma ação escondida. Vive no `accessibilityHint`, e é a troca aceite: um gesto que se
descobre uma vez, contra uma linha permanente no ecrã para uma ação que acontece uma vez em dez
assaltos.

### A linha temporal passou a ver-se — e é local

A app envia os eventos desde a `1.5.0` e nunca os mostrou. Agora o motor guarda-os (`engine.log`) e
há uma folha que os lê, do mais recente para o mais antigo, com o tempo **decorrido dentro da fase**
— que é como o árbitro o viu no mostrador, e não uma hora do relógio que ninguém olhou.

**É local, e tem de ser**: o contrato só tem `POST .../events`. Não existe `GET`, e por isso não há
de onde reler o que já subiu. Ficou escrito no contrato dos dois lados
([`API-CONTRACT.md`](API-CONTRACT.md), secção *Linha temporal por ler*) o que a ausência custa e
qual seria a adição MINOR que a resolve. O registo local **não depende de haver emissor**: no modo
cronómetro não há servidor nenhum, e a lista existe na mesma.

### O submeter ficou preto

Um botão verde cheio, por baixo de dois painéis pretos, era o único elemento do ecrã ainda a falar a
linguagem da lista de assaltos. A variante `panel` do `Button` — tecla preta, letras verdes
maiúsculas — é a do marcador, e é a mesma no "Novo assalto" do modo cronómetro. Ao lado dela, o
`Histórico` fica secundário e a um terço da largura: ver é uma escapadela, registar é o fim.

O `± 10 s` passou a `small` (36 pt) com `hitSlop` a devolver os 48 pt de alvo: acertar o tempo é
trabalho miúdo, e três botões à altura de HIG somavam mais peso do que importância por baixo do
mostrador que **é** o botão grande deste ecrã.

---

## ADR-035 — Contrato 2.1.0: o assalto passa a ter horas, e não só cronómetro

**Data:** 2026-07-26 · **Estado:** aceite · **A plataforma serve-o desde 2026-07-26; o lado da app é a F9**

O [ADR-029](#adr-029--contrato-150-a-pista-passa-a-ver-se-enquanto-está-a-ser-arbitrada) pôs o placar
a subir na web enquanto o assalto decorre. O que ele não pôs foi o **relógio**.

O que a app envia hoje diz que um toque caiu aos 29 s do primeiro período. Não diz a que horas o
combate começou, a que horas se entrou no terceiro período, a que horas o tempo voltou a correr
depois de um halt, a que horas se foi a morte súbita, nem quanto faltava quando o árbitro mandou
descansar. Um assalto assim **resume-se**, mas não se **reconstitui** — e reconstituí-lo é a única
coisa que uma reclamação pede.

**Decisão:** contrato `2.1.0`, MINOR aditivo. Oito tipos de evento novos — `bout_start`,
`period_start`, `rest_start`, `rest_end`, `sudden_death_start`, `clock_start`, `clock_stop`,
`bout_end` — e quatro campos em todos os eventos: `at` (hora de parede), `elapsed_ms` (desde o
início do combate), `remaining_ms` (o que faltava da fase) e `phase`. **Todos opcionais.**

### O motor já sabia; o que faltava era dizê-lo

Nenhum destes momentos é informação nova. O `useBoutEngine` já conduz as fases, já muda de período,
já sorteia a prioridade e já é dono do cronómetro que arranca e pára — o `emit()` existe desde o
[ADR-030](#adr-030--a-pista-ao-vivo-do-lado-da-app-o-que-se-decidiu-ao-enviá-la) e passa a ser
chamado em mais oito sítios.

É por isso que esta é a adição barata que parece: não se descobre nada, **exporta-se**. O que se
paga é o volume — um combate de quadro passa de ~40 eventos para ~115.

### `at_ms` fica como está, e o `elapsed_ms` entra ao lado

A tentação era redefinir o `at_ms` para "desde o início do combate", que é como o pedido foi
formulado. Seria *breaking*, e seria pior: são duas perguntas diferentes.

- **`at_ms` é tempo de esgrima.** "O toque caiu a 29 s do fim do segundo período" é o que decide se
  um assalto foi ganho no último segundo. Pára quando o árbitro dá halt.
- **`elapsed_ms` é tempo de relógio.** "O combate ia em 3 min 34 s" é o que diz a um organizador que
  a pista está atrasada. Nunca pára.

Nenhum se deriva do outro sem reconstruir todas as paragens — que é precisamente o que o
`clock_start`/`clock_stop` passa a permitir, e só depois de existirem.

O `elapsed_ms` mede-se pelo relógio **monotónico** da `CLIENT-SPEC.md` §7, não pelo `Date`: é uma
duração, e uma duração medida com hora de parede muda de valor se o telemóvel acertar a hora a meio.

### O `at` é o relógio do telemóvel, e assume-se

Não há sincronização de relógio neste contrato e não vai haver. Custaria uma troca de horas em todos
os pedidos para corrigir o desvio do dispositivo de quem está a arbitrar, e **nenhuma decisão do
servidor depende do `at`**: não valida, não ordena, não entra no resultado. Ordena-se pelo `seq`
dentro do assalto, que é o único relógio de que a plataforma precisa.

O servidor continua a guardar o seu `created_at` — a hora a que o evento *chegou*. São coisas
diferentes, e um evento que passou dez minutos numa fila de rede prova porquê.

### O `clock_stop` não estava no pedido e entra na mesma

Foi pedido saber a que horas o tempo **começou** a correr. Um `clock_start` sozinho não responde:
sem o par, um combate de três minutos que demorou vinte não se distingue de um que demorou quatro — e
é essa diferença que uma reclamação discute. São o mesmo evento visto dos dois lados.

Quase todos os `clock_stop` vão ter um `touch` ou um cartão a um passo, porque o `registerCombat` dá
halt antes de os aplicar. **Não se filtram:** um halt sem nada a seguir — material partido, um atleta
que sai da pista — é exatamente o que só ele conta, e no instante em que se emite não há como saber
qual é qual.

### O ecrã não muda — menos o histórico, que passa a mostrá-los

**A arbitragem não muda um pixel.** Um árbitro não deve conseguir dizer se a app está a emitir marcos
ou não: continua tudo *fire-and-forget*, continua tudo fora da fila offline, e falhar continua a não
subir ao ecrã — as três regras do ADR-029 valem sem exceção.

**A folha do histórico muda, e foi decidido que mudasse.** O `engine.log` é a mesma linha temporal
que sobe para a plataforma, e é dele que a folha "O que aconteceu" (ADR-034) se serve: com os marcos,
um combate de quadro passa de ~40 para ~115 linhas, com um `clock_stop` antes de quase todos os
toques.

Escondê-los pedia uma segunda regra a dizer o que é do árbitro e o que é do servidor, e a resposta a
essa regra é que não há diferença: a folha existe para responder a *"o segundo amarelo foi antes ou
depois do meu toque?"*, e *"o tempo esteve parado quanto tempo?"* é a mesma pergunta com outro
sujeito. Um halt sem toque a seguir — material partido, um atleta fora da pista — só ali se vê.

O que se afinou foi o desenho da linha: **o painel do placar só aparece em quem o traz.** Um
`clock_start` não sabe o resultado, e um `–—–` no preto do painel lia-se como um resultado a zero em
vez de "não se aplica".

### Três arestas que só apareceram a emitir

| O quê | Como ficou | Porquê |
|---|---|---|
| O tempo a esgotar-se emite `clock_stop`? | **Não** | O fim de tempo já tem evento próprio no mesmo instante, o `period_end`. Dois eventos para o mesmo acontecimento é ruído, e o `clock_stop` existe para contar o **halt** — que é decisão de quem arbitra, não do cronómetro |
| Mudar de período à mão emite `period_start`? | **Não** | O `goToPeriod` é a correção de um período mal contado, e já estava escrito que não vai à linha temporal. Emiti-lo punha na história do combate um terceiro período que nunca se disputou |
| E os eventos antes do primeiro arranque? | **Sem `elapsed_ms`** | O campo conta-se do `bout_start`, e antes dele não há de onde contar. É opcional, e omiti-lo diz a verdade; um zero dizia que o combate tinha começado num toque dado com o cronómetro parado |

E uma quarta, que é de volume: **o teto de 300 eventos por assalto passou a ser alcançável.** Os
marcos triplicam a contagem, e o que vinha a seguir a ultrapassá-lo era um `422` que desistia do
assalto inteiro — perdendo os toques por causa dos halts. O `useLiveEvents` pára de enviar ao chegar
lá; o `log` do motor continua a crescer, porque a folha do histórico não tem teto de servidor nenhum.

### A ordem de entrega era uma dependência, e passou a não ser

Este ADR dizia que a F9 se podia **escrever** antes da plataforma mas não **entregar** antes. Um
`type` que o servidor não conheça devolve `422 validation_failed`, e o `useLiveEvents` trata um 4xx
como desistência definitiva (ADR-030) — desistiria do assalto inteiro, perdendo com os marcos também
os toques, que esse servidor aceitava bem.

**Resolveu-se no emissor, e é melhor do que esperar pela ordem certa.** Ao primeiro `422`, o
`useLiveEvents` tira os marcos do lote e continua a espelhar o resto: uma vez, para o resto do
assalto, e sem voltar a tentar, porque a versão do outro lado não muda a meio. Uma instalação
anterior à `2.1.0` passa a custar os marcos e mais nada.

Vale mais do que a regra que substitui porque não depende de uma janela: serve **qualquer** servidor
anterior, hoje e daqui a dois anos, e não só o intervalo entre as duas entregas. A plataforma
aceita-os desde 2026-07-26 de qualquer maneira — o registo do lado de lá é a secção **F** do
`app-arbitragem-todo.md`.

**A exceção à regra do ADR-030 é estreita de propósito.** Desistir num 4xx continua certo para tudo o
resto: uma poule fechada, uma sessão morta, um id que já não existe são erros que não passam com o
tempo, e insistir a cada toque só gasta o limite de pedidos. O `422` dos marcos é o único 4xx que não
é do assalto — é da versão do outro lado —, e por isso é o único que tem uma segunda tentativa mais
pobre em vez de nenhuma.

**O motor não sabe de nada disto.** O `log` do assalto continua a receber tudo: a folha do histórico
é do árbitro e não tem teto de servidor nenhum. O que a plataforma recusa, ele continua a poder
consultar.

### O que a implementação do servidor mostrou, e que muda o que a app pode assumir

**Um evento sem placar já apagava o placar ao vivo da web.** O `score_a`/`score_b` do
`POST .../events` sempre foi opcional, e o servidor lia o placar do evento **mais recente** — não do
mais recente **com placar**. Um `period_end` enviado sem placar, que é o caso normal, deixava a
página pública e o painel do organizador em branco a meio do assalto.

É um bug do servidor, e está corrigido lá. **Esta app nunca o disparou**, e por acaso: o
`useBoutEngine` põe `score_a`/`score_b` em tudo o que emite — no toque, no cartão, no `period_end` e
no `priority`, que não precisava deles. Foi essa generosidade que escondeu o problema durante meses.

O que fica dito, para a F9: **os marcos não vão ter placar**, e isso passa a ser normal em vez de
acidental. Um `clock_start` não sabe o resultado nem tem de saber. A regra a não esquecer é a
inversa da que se poderia tirar daqui — não "manda sempre o placar por precaução", mas "o placar
pertence aos eventos que o mudam", e o servidor é que tem de aguentar os outros.
