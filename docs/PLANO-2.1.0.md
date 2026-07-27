# Contrato `2.1.0` — os marcos do combate · plano

**Data:** 2026-07-26 · **Estado: executado** · Baseado em `docs/API-CONTRACT.md` §11 E,
`docs/CLIENT-SPEC.md` §7.2 e no [ADR-035](DECISIONS.md), contra o código de então
(`API_CONTRACT_VERSION = '2.0.1'`).

> ✅ **Executado a 2026-07-26.** M1 a M6 estão feitos: 357 testes verdes (eram 341), `typecheck` e
> `lint` limpos. O que se decidiu ao fazê-lo está no [ADR-035](DECISIONS.md), e a especificação já
> reflete o resultado ([`CLIENT-SPEC.md`](CLIENT-SPEC.md) §7.2). Este documento fica como registo do
> raciocínio — e das **duas coisas que mudaram a meio** (§8).
>
> **Por fazer, e não é deste repositório:** a §11 E do contrato continua a dizer "**App — por
> fazer**". O contrato vive em duplicado, byte a byte, nos dois repositórios — atualizá-lo é alterar
> os dois lados, e não se faz de um só.

> **Nada disto quebra o que existe.** A `2.1.0` é MINOR aditiva: oito `type` novos e quatro campos
> opcionais. Um servidor na `2.0.0` ignora os campos que não conhece — mas **recusa os `type` que não
> conhece com `422`**, e é essa a única aresta real deste plano. Ver §3.2.

> **O contrato não se altera daqui.** `docs/API-CONTRACT.md` vive em duplicado, byte a byte, nos dois
> repositórios: a §11 E é que regista o que falta a cada lado, e mudá-la é mudar os dois. Este plano
> executa **o lado da app** — a **F9** da `CLIENT-SPEC.md` §14.

---

## 1. O que muda, e porquê

A `1.5.0` pôs o **placar** a subir na web enquanto o assalto decorre. Não pôs lá o **relógio**: um
toque sobe com "aos 29 s do primeiro período" e mais nada. A que horas o combate começou, a que horas
se entrou no terceiro período, a que horas o tempo voltou a correr depois de um halt, quanto faltava
quando o árbitro mandou descansar — nada disso sai do telemóvel. Um assalto assim resume-se; não se
reconstitui, que é a única coisa que uma reclamação pede.

| # | Mudança do contrato | Consequência para a app |
|---|---|---|
| 1 | **Oito `type` novos** — `bout_start`, `period_start`, `rest_start`, `rest_end`, `sudden_death_start`, `clock_start`, `clock_stop`, `bout_end` | O motor passa a chamar `emit()` em mais oito sítios |
| 2 | **Quatro campos novos** em todos os eventos: `at`, `elapsed_ms`, `remaining_ms`, `phase` | Todos os eventos passam a ser carimbados, o grupo A incluído |
| 3 | `score_a`/`score_b` passam a valer **também no lote do `score`** | Só tipos: `BoutEvent` e `LiveBoutEvent` colapsam, menos o `seq` |
| 4 | O teto por assalto sobe de **200 para 300** | `MAX_BOUT_EVENTS`, e um travão que hoje não existe (§4.4) |
| 5 | A definição do evento passa a viver **num sítio só** no contrato | Nada — a app já a tinha num sítio só |

**O motor já sabe tudo isto.** O `useBoutEngine` conduz as fases, muda de período, sorteia a
prioridade e é dono do cronómetro que arranca e pára. Nenhum destes momentos é informação nova: são
transições que já acontecem lá dentro e que hoje não saem do telemóvel. **O trabalho é emitir, não
descobrir** — e é por isso que a adição é barata. O que se paga é o volume: um combate de quadro
passa de ~40 eventos para ~115.

---

## 2. Estado do código — onde é que dói

| Ficheiro | O que tem hoje | Destino |
|---|---|---|
| `src/api/types.ts` | `BoutEventType` com 7 casos; `BoutEvent` com 4 campos; `score_a`/`score_b` só no `LiveBoutEvent`; `MAX_BOUT_EVENTS = 200`; versão `'2.0.1'` | **M1** |
| `src/bout/useBoutEngine.ts` | `emit()` chamado em 3 sítios (toque, cartão, `period_end`, `priority`); `elapsedMs()` mede dentro da fase; `timer` devolvido tal como vem do `useTimer` | **M2** — o grosso do trabalho |
| `src/bout/phase.ts` | `BoutPhase = 'period' \| 'rest' \| 'priority'` | **M2** — tradução para o `phase` do contrato |
| `src/bout/BoutScreen.tsx` | `onConfirm` submete sem fechar a história do assalto | **M3** — `bout_end` |
| `src/bout/useLiveEvents.ts` | Um 4xx qualquer → `givenUp`, e o assalto inteiro deixa de espelhar | **M4** — degradação em vez de desistência |
| `src/bout/EventSheet.tsx`, `src/i18n/*.json` | 7 chaves em `bout.events.type.*`; a caixa do placar mostra `–—–` quando não há placar | **M5** |
| `src/__tests__/bout-screen.test.tsx` | *"o fim do tempo e o sorteio de prioridade também sobem"* espera `seq: 1` num `period_end` | **M6** — passa a ter marcos antes |

**Ninguém mais mexe.** O `submit.ts`, o `store.ts` da fila e o `endpoints.ts` já transportam
`BoutEvent[]` e `LiveBoutEvent[]` sem lhes tocar no conteúdo — alargar o tipo chega. Os ecrãs
`app/bout/[id].tsx` e `app/match/[id].tsx` continuam a passar o mesmo `onEvents`.

---

## 3. Decisões tomadas antes de escrever código

### 3.1 O histórico passa a mostrar os marcos

O `engine.log` alimenta o **EventSheet** ("O que aconteceu"), e o ADR-035 escreveu que "o ecrã não
muda, nem um pixel". Muda: a folha passa de ~40 para ~115 linhas num combate de quadro, com um
`clock_stop` a preceder quase todos os toques.

**Decidido mostrá-los na mesma.** A folha existe para responder a *"o segundo amarelo foi antes ou
depois do meu toque?"*, e um halt sem nada a seguir — material partido, um atleta fora da pista — é
informação da mesma natureza. O `log` continua a ser a linha temporal verdadeira, sem uma segunda
regra a decidir o que lá entra. **O ADR-035 tem de ser corrigido neste ponto** (M6).

### 3.2 A app deixa de depender da ordem de entrega

O ADR-035 diz que a F9 "não se entrega antes do servidor": um `type` que a plataforma não conheça dá
`422 validation_failed`, e o `useLiveEvents` trata um 4xx como desistência definitiva — desistiria do
assalto inteiro, perdendo com os marcos também os toques que **hoje** sobem.

**Decidido resolver isso do lado da app** (M4), em vez de esperar. Num `422`, o lote é reenviado sem
o grupo B e os marcos desligam-se para o resto do assalto; os toques e os cartões continuam a subir
como sempre subiram. A app fica correta contra a `2.0.0` **e** contra a `2.1.0`, entrega-se hoje, e
deixa de haver ordem de entrega entre os dois lados. **O ADR-035 tem de ser corrigido neste ponto**
(M6).

### 3.3 As três que o contrato deixa em aberto, e ficam decididas aqui

| Questão | Decisão | Porquê |
|---|---|---|
| O tempo a esgotar-se emite `clock_stop`? | **Não.** Só o `toggle()` emite, dos dois lados | O tempo esgotado já tem evento próprio, o `period_end`, no mesmo instante. Dois eventos para a mesma coisa é ruído — e o `clock_stop` existe para contar o halt, que é decisão de quem arbitra |
| Mudar de período à mão (`goToPeriod`) emite `period_start`? | **Não** | É o que o motor já diz em comentário sobre o `goToPeriod`: um período corrigido não é um acontecimento da pista, é uma correção de quem a arbitra. Emiti-lo punha na história do combate um terceiro período que nunca se disputou |
| E os eventos antes do primeiro arranque do cronómetro? | **Sem `elapsed_ms`**, que é opcional | O `elapsed_ms` conta-se do `bout_start`, e antes dele não há de onde contar. Inventar um zero seria dizer que o combate começou num toque que caiu com o cronómetro parado |

---

## 4. Marcos

### M1 — Os tipos (`src/api/types.ts`)

1. `API_CONTRACT_VERSION` → `'2.1.0'`.
2. `BoutEventType` ganha os oito casos, separados em comentário por grupo A (o que acontece em
   pista) e grupo B (os marcos do combate) — é a divisão que o contrato faz e é a que o M4 precisa
   de ler.
3. `EventPhase = 'period' | 'rest' | 'sudden_death'`, novo.
4. `BoutEvent` ganha `phase?`, `elapsed_ms?`, `remaining_ms?`, `at?` e — vindos do `LiveBoutEvent` —
   `score_a?`/`score_b?`. O `LiveBoutEvent` fica só com o `seq`, que é a única diferença que a
   `2.1.0` lhe deixa.
5. `MAX_BOUT_EVENTS` → `300`.
6. `MARKER_EVENT_TYPES`, o conjunto do grupo B, exportado — é dele que o M4 se serve.

**Verificar:** `npm run typecheck` limpo (o `LiveBoutEvent` deixa de declarar `score_*` e nada o nota).

### M2 — O motor emite (`src/bout/useBoutEngine.ts`)

O núcleo. Por ordem:

1. **Carimbo comum.** Uma função `stamp()` que devolve `{ phase, elapsed_ms, remaining_ms, at }`,
   aplicada dentro do `emit()` — **todos** os eventos passam a levá-la, o grupo A incluído.
   - `phase`: a `BoutPhase` traduzida (`priority` → `sudden_death`).
   - `elapsed_ms`: `monotonicNow() - boutStartedAt`, com o `monotonicNow` já exportado pelo
     `useTimer` (uma duração medida com hora de parede muda de valor se o telemóvel acertar a hora a
     meio). **Ausente** enquanto não houver `bout_start`.
   - `remaining_ms`: `timer.remainingNowMs()` — o mesmo que já alimenta o `at_ms`.
   - `at`: `new Date().toISOString()`. É a única hora de parede do ficheiro, e o contrato assume-a
     como do dispositivo.
2. **O cronómetro passa a ser embrulhado.** O motor devolve `{ ...timer, toggle }` com um `toggle`
   próprio; o `Clock` continua a chamar `timer.toggle` sem saber de nada. O embrulho:
   - a correr → carimba, chama o `toggle` de baixo, emite `clock_stop`;
   - parado e com tempo (`state !== 'expired'` e `remainingMs > 0`) → se for o primeiro arranque do
     assalto, fixa o `boutStartedAt` e emite `bout_start` + `period_start`; depois arranca e emite
     `clock_start`;
   - inerte (esgotado, ou a zero) → **não emite nada**, porque nada aconteceu.
   - O `registerCombat`, que dá halt antes de cada toque e cada cartão, passa a chamar este
     `toggle` — é daí que vem a maior parte dos `clock_stop`, e é para vir.
3. **`period_start`** no `onAction` do `nextPeriod`, depois do `rest_end` e depois do `setPeriod`,
   com o período novo.
4. **`rest_start`** nos dois caminhos que hoje fazem `setResting(true)`: o `action.kind === 'rest'` e
   o `startRest` do árbitro. O `remaining_ms` é que distingue os dois — `0` é o período esgotado, e
   `85000` é o árbitro a parar o combate com um minuto e meio por esgrimir.
5. **`rest_end`** ao sair do descanso, **antes** do `setPeriod`, com o período que acabou de
   terminar — que é o que o contrato pede para os eventos de descanso.
6. **`sudden_death_start`** no `onPrioritySettled`, imediatamente antes do `priority` que já lá está.
   Leva `period: periods + 1` e `phase: 'sudden_death'`, como o `priority`.
7. **`end(a, b)`**, novo no `BoutEngine`: emite o `bout_end` com o placar final. Quem o chama é o
   ecrã (M3) — o motor não sabe que existe submissão.

**Verificar:** testes novos em `src/bout/` sobre a sequência emitida (§5), e `npm test` verde.

### M3 — O `bout_end` na confirmação (`src/bout/BoutScreen.tsx`)

`onConfirm` chama `engine.end(rules.a, rules.b)` **antes** do `submitScore`. A ordem é o que o
contrato pede ("o `bout_end` é a última linha da história, não o registo dela") e é também a que
funciona: o `record` faz `void flush()` de imediato, e o `live.discard()` que vem a seguir à
submissão não cancela um lote já em voo.

Emite-se **a cada confirmação**, e não uma só vez. Um `rejected` devolve o árbitro ao assalto para
corrigir e submeter outra vez; foram dois fins de combate declarados, e a história é para os mostrar.

O ecrã do cronómetro autónomo (`app/timer.tsx`) **não** ganha `bout_end`: não tem submissão, e um
combate que ninguém registou não acabou.

**Verificar:** teste de ecrã — confirmar um resultado põe `bout_end` com o placar final no `fakeApi`.

### M4 — O `useLiveEvents` degrada em vez de desistir (`src/bout/useLiveEvents.ts`)

Duas defesas, ambas pequenas:

1. **`422` deixa de ser desistência.** Hoje qualquer erro não-retentável marca `givenUp` e o assalto
   inteiro deixa de espelhar. Passa a: no primeiro `422`, tirar do lote os `type` do grupo B, marcar
   `markers = off` para o resto do assalto e reenviar. Um `422` **depois** disso — ou qualquer outro
   4xx — continua a ser `givenUp`, como hoje. É o que torna a app correta contra um servidor na
   `2.0.0` (§3.2).
2. **Travão nos 300.** O contrato limita o assalto a 300 eventos nos dois caminhos, e os marcos
   triplicam o volume: um combate de quadro com muitos halts passa a poder lá chegar. Ao ultrapassar
   o `MAX_BOUT_EVENTS`, o `record` deixa de mandar — **e o `log` local continua a crescer**, porque a
   folha do histórico é do árbitro e não tem teto de servidor nenhum.

**Verificar:** `src/bout/useLiveEvents.test.ts` — um `422` deixa passar os toques do mesmo lote; um
segundo `422` desiste; o 301.º evento não sai.

### M5 — O histórico mostra os marcos (`EventSheet.tsx`, `src/i18n/*.json`)

1. Oito chaves novas em `bout.events.type.*`, em **pt-PT e en**. Sem elas a folha mostra a chave crua.
2. A caixa do placar só se desenha quando o evento **traz** placar: um `clock_start` não tem, e
   `–—–` num painel preto lê-se como um placar a zero em vez de "não se aplica".

**Verificar:** `src/__tests__/bout-screen.test.tsx` — a folha aberta a meio de um assalto mostra o
arranque e os halts com nome legível, nenhuma chave crua.

### M6 — Testes e documentos

1. **`src/__tests__/bout-screen.test.tsx`**, teste *"o fim do tempo e o sorteio de prioridade também
   sobem"*: passa a haver `bout_start`, `period_start` e `clock_start` antes do `period_end`. Ajustar
   as posições em vez de afrouxar a asserção — é ela que fixa a ordem que o contrato desenha.
2. **`docs/DECISIONS.md`, ADR-035:** corrigir os dois pontos que este plano contraria — "o ecrã não
   muda" (§3.1) e "a F9 não se entrega antes do servidor" (§3.2) —, com a razão de cada um.
3. **`docs/CLIENT-SPEC.md`:** §7.2 deixa de ser "por implementar"; a F9 da §14 e a dependência §13.20
   passam a ✅, esta com a nota de que deixou de bloquear.
4. **`docs/API-CONTRACT.md`: não se toca.** Vive em duplicado nos dois repositórios e a §11 E é o
   registo dos dois lados. Fica **por fazer, e não é deste repositório**: a linha "App" da §11 E
   passa a feita quando a plataforma também lá chegar.

**Verificar:** `npm test`, `npm run typecheck` e `npm run lint` limpos.

---

## 5. Os testes que faltam

Os marcos são uma **sequência**, e é a sequência que se verifica — não um evento de cada vez.

| O quê | Onde | O que fixa |
|---|---|---|
| Arrancar o cronómetro pela primeira vez emite `bout_start`, `period_start` e `clock_start`, por esta ordem, com `elapsed_ms: 0` | `src/bout/` | O único sítio de onde o início do combate se conhece |
| Um toque com o cronómetro a correr emite `clock_stop` **e** `touch`, e não um só | `src/bout/` | O halt e o toque são dois acontecimentos (ADR-035) |
| Um toque com o cronómetro parado emite só o `touch` | `src/bout/` | Não se inventa um halt que não houve |
| O `elapsed_ms` cresce com paragens pelo meio e o `at_ms` não | `src/bout/` | A distinção que justifica os dois campos existirem |
| Descanso pedido a meio do período leva `remaining_ms > 0`; esgotado leva `0` | `src/bout/` | É o campo que responde ao "porquê" do descanso |
| A morte súbita emite `sudden_death_start` **antes** do `priority` | `src/__tests__/bout-screen.test.tsx` | A ordem que o contrato desenha |
| Um `422` tira os marcos e deixa passar os toques | `src/bout/useLiveEvents.test.ts` | A independência da §3.2 |
| Confirmar o resultado emite `bout_end` com o placar final | `src/__tests__/bout-screen.test.tsx` | A última linha da história |

O `src/api/live.test.ts` (`npm run test:live`, contra o servidor a sério) **fica como está** enquanto
a plataforma servir a `2.0.0`: um lote com marcos responderia `422`, que é exatamente o que o M4
existe para tolerar. Ganha um caso quando o outro lado chegar lá.

---

## 6. O que fica de fora

| O quê | Porquê |
|---|---|
| O `events` em lote no `score` | O contrato é explícito: **ou em direto, ou em lote, nunca as duas**. A app envia em direto desde a `1.5.0` e o servidor ignora o lote nesse caso. O `submitScore` continua a aceitar o campo e ninguém lho passa |
| `double` | O ecrã não tem botão de duplo, e dois toques seguidos são dois eventos. Não é da `2.1.0` |
| Retirar um toque | Continua sem `type` que o represente. O placar corrigido viaja no evento seguinte (ADR-029) |
| `bout_end` no cronómetro autónomo | Não há submissão nem servidor. Ver M3 |
| Sincronização de relógio | O `at` é o relógio do telemóvel e assume-se como tal — nenhuma decisão do servidor depende dele (contrato §11 D) |

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| **O servidor está na `2.0.0` e recusa os `type` novos** | M4. Deixa de ser risco: os toques continuam a subir e os marcos desligam-se sozinhos |
| **Volume — ~115 eventos por combate, e 60 pedidos/min partilhados com o polling** | O `useLiveEvents` já junta ao lote seguinte em vez de repetir sozinho, e o teto de 50 por pedido não muda. Um halt e o toque a seguir cabem no mesmo lote |
| **O embrulho do `toggle` mexe no caminho mais quente da app** | É o botão do cronómetro. Os testes do M2 verificam-no pelo comportamento observável (o que sai), e o `useTimer` não se toca |
| **`elapsed_ms` a divergir do `at`** | São medidos com relógios diferentes de propósito: um monotónico, o outro de parede. A divergência é o dado, não o defeito |

---

## 8. O que mudou a meio da execução

Duas coisas, e nenhuma delas estava neste plano quando ele foi escrito.

### 8.1 A plataforma chegou lá primeiro

A §11 E do contrato foi atualizada **enquanto isto se implementava**: o servidor passou a aceitar os
oito `type` e os quatro campos a 2026-07-26, no mesmo dia. A dependência §13.20 da `CLIENT-SPEC.md`
deixou de existir.

**O M4 fez-se na mesma**, e a razão mudou: era um desbloqueio e passou a ser seguro. Vale mais do que
a regra que substitui porque não depende de uma janela — serve **qualquer** instalação anterior à
`2.1.0`, hoje e daqui a dois anos, e não só o intervalo entre as duas entregas.

### 8.2 O placar deixou de ir em todos os eventos

A implementação do servidor descobriu um bug que estava em produção desde a `1.5.0`: o `liveScore()`
lia o placar do **último** evento em vez do último **com** placar, e um `period_end` sem placar
apagava o placar ao vivo da web. Está corrigido do lado de lá, e o ADR-035 tirou daí a regra para
este lado: *o placar pertence aos eventos que o mudam*.

Foi seguida. Os marcos saem **sem** `score_a`/`score_b` — menos o `bout_end`, que leva o resultado
final por definição do contrato. O `period_end` e o `priority` continuam a levá-lo porque já o
levavam: mudá-lo era mexer em comportamento que não é da `2.1.0`.

**Consequência no ecrã, e é a razão de o M5 ter uma linha a mais:** metade das linhas da folha do
histórico passou a não ter placar, e o `–—–` que lá aparecia lia-se como um resultado a zero. O
painel passou a só se desenhar em quem traz placar.
