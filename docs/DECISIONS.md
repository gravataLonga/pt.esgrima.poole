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

**Data:** 2026-07-25 · **Estado:** aceite

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

---

## ADR-012 — Cartões e prioridade são locais ao assalto

**Data:** 2026-07-25 · **Estado:** aceite

O `API-CONTRACT.md` §1 exclui "cartões e penalizações" do âmbito da API, e o corpo do `score`
continua a ser `{ a, b }`.

**Decisão:** os cartões (amarelo, vermelho, preto) e a prioridade vivem em `src/bout/rules.ts`, em
memória, durante o assalto. **Não são submetidos.** O que sobe é o resultado — incluindo o toque que
o cartão vermelho deu, porque esse é resultado.

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
