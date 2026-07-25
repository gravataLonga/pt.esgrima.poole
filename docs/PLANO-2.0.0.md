# Migração para o contrato `2.0.0` — plano

**Data:** 2026-07-25 · **Estado: executado** · Baseado em `docs/API-CONTRACT.md` §11 C e no
levantamento do código de então (`API_CONTRACT_VERSION = '1.5.0'`).

> ✅ **Executado a 2026-07-25.** M1 a M7 estão feitos; o que se decidiu ao fazê-lo está no
> [ADR-032](DECISIONS.md) e a especificação já reflete o resultado ([`CLIENT-SPEC.md`](CLIENT-SPEC.md)).
> Este documento fica como registo do raciocínio — das três arestas que a §11 C do contrato não
> cobria (§2), a da fila (§4.5) é a única que sobrevive como aresta de produto.
>
> **Por fazer, e não é deste repositório:** a §11 C do contrato continua a dizer que "a app ainda
> serve a `1.5.0`". O contrato vive em duplicado, byte a byte, nos dois repositórios — atualizá-lo é
> alterar os dois lados, e não se faz de um só.

> A app **não funciona** contra o servidor tal como ele está publicado. Um código de combate chega
> com `scope: "match"`, que a app não conhece: o `phaseFor()` cai no ramo da poule, a `poule` vem
> `null`, e o primeiro pedido é `/poules/undefined/bouts`. Não é degradação — é ecrã morto.

---

## 1. O que mudou, e porquê

O contrato subiu de `1.5.0` para `2.0.0` num único movimento: **o código de árbitro deixou de ser
da competição e passou a ser da pista**.

| # | Mudança | Consequência para a app |
|---|---|---|
| 1 | Cada combate de eliminatória tem **PIN próprio** | Uma sessão vê **um** combate, não um quadro |
| 2 | `scope` passa a `poule \| match` (era `poule \| tournament`) | O `SessionScope` e tudo o que ramifica nele |
| 3 | `scope: "tournament"` e `TournamentSummary` **desaparecem** | Todo o código de torneio sai |
| 4 | `GET /poules/{p}/elimination` e `GET /tournaments/{t}/elimination` **saem da API** | O ecrã `/bracket` fica sem fonte de dados |
| 5 | `connect` e `session` devolvem `match` (`MatchDetail`) em vez de `tournament` | O combate abre **sem segundo pedido** |
| 6 | Um token de poule **deixa de alcançar** o quadro dessa poule | A transição "poule fechada → quadro" deixa de existir |
| 7 | `PouleSummary.elimination` passa a ser **informativo, não navegável** | O botão "abrir quadro" da lista deixa de fazer sentido |
| 8 | O `message` do `410 competition_finished` passa a dizer **qual** dos casos é e para onde ir | O ecrã de ligar tem de mostrar o texto do servidor |

**A razão é operacional, não de arquitetura:** um quadro de 16 corre em oito pistas ao mesmo tempo.
Um código único para o quadro inteiro dava a cada árbitro todos os combates e — porque um código
segura um dispositivo de cada vez — o segundo a lê-lo tirava a sessão ao primeiro.

**Efeito de produto:** a app deixa de ter uma *fase de quadro*. Passa a ter **dois tipos de sessão**
que não comunicam: a da poule (lista, folha, classificação) e a de um combate (um assalto, e acabou).

---

## 2. Estado do código — onde é que dói

| Ficheiro | O que tem hoje | Destino |
|---|---|---|
| `src/api/types.ts` | `SessionScope = 'poule' \| 'tournament'`, `TournamentSummary`, `PouleEliminationResponse`, `TournamentEliminationResponse`, `EliminationMatch` + `EliminationMatchDetail` | Reescrever §§ afetadas |
| `src/api/endpoints.ts` | `getPouleElimination`, `getTournamentElimination` | Remover as duas |
| `src/api/queries.ts` | `useBracket`, `queryKeys.bracket`, `BracketData` | Remover; `useMatchDetail` ganha *polling* |
| `src/session/store.ts` | `tournament`, fase `bracket`, `bracketAnnounced`, `markBracketAnnounced`, `phaseFor` com ramo `tournament` | Reescrever |
| `src/session/completion.ts` | Ramo `tournament`, `bracketLeft` | Reescrever |
| `src/session/useConnect.ts` | `router.replace(scope === 'tournament' ? '/bracket' : '/poule')` | Ramo `match` |
| `app/bracket.tsx` | Ecrã inteiro (380 linhas) | **Apagar** |
| `app/match/[id].tsx` | Rota folha, aberta pelo quadro, `home="/bracket"` | Passa a **raiz de sessão** |
| `app/poule.tsx` | Botão "abrir quadro", `Redirect` para `/bracket` | Remover ambos |
| `app/complete.tsx` | `poule ?? tournament` | Ramo `match` |
| `app/index.tsx`, `app/_layout.tsx` | Rota e *redirect* de `/bracket` | Remover |
| `src/__tests__/support/fakeApi.ts` | `seedTournament`, `seedBracket`, PIN `777777` | Reescrever para `seedMatch` |
| `src/api/live.test.ts` | Chama dois endpoints que já não existem | Refazer |
| `navigation` · `store` · `completion` · `regression` (testes) | Cenários de quadro | Reescrever |

---

## 3. Plano de implementação

Por ordem de dependência. Cada marco compila e passa a suite antes do seguinte.

### M1 — Os tipos (nada corre até isto estar feito)

1. `SessionScope = 'poule' | 'match'`.
2. **Colapsar `EliminationMatch` e `EliminationMatchDetail` num tipo só**, `MatchDetail`. O contrato
   é explícito: *"Uma forma só, porque uma sessão de combate só tem esta."* Campos novos:
   `competition_name: string`, e `scored_at` / `scored_by_me` que antes só existiam na lista.
3. Apagar `TournamentSummary`, `PouleEliminationResponse`, `TournamentEliminationResponse`.
4. `ConnectResponse` / `SessionResponse`: `tournament` → `match: MatchDetail | null`.
5. `API_CONTRACT_VERSION = '2.0.0'`. Confirmar que `API_PREFIX` **fica** em `/api/v1` — o contrato
   abre uma exceção explícita à regra do MAJOR (§1): não há app instalada, não há nada a coexistir.
6. `endpoints.ts`: remover `getPouleElimination` e `getTournamentElimination`.

> **Verificar:** `tsc --noEmit` falha em todo o lado. É esse o mapa do trabalho que falta.

### M2 — A sessão

7. `store.ts`: campo `match: MatchDetail | null` no lugar de `tournament`.
8. `SessionPhase`: `'bracket'` → `'match'`. Apagar `bracketAnnounced` e `markBracketAnnounced` — a
   transição que eles memorizavam deixou de existir.
9. `phaseFor(scope, poule, match)`:
   ```
   scope === 'match'  → 'match'
   scope === 'poule'  → poule?.locked ? 'read_only' : 'poule'
   desconhecido       → 'disconnected'          ← C4: nunca cair no ramo da poule
   ```
   A poule fechada é **sempre** `read_only`, com ou sem `elimination`.
10. **`competitionUuid()` precisa de decisão** — o `MatchDetail` não tem `uuid`, tem um `id` opaco.
    A fila de submissões é por competição (`competition_uuid`) e o `submitScore` exige-o.
    **Proposta:** renomear para `competitionKey()` e devolver `poule?.uuid ?? match?.id ?? null`.
    O campo continua a ser uma chave opaca de agrupamento; nada o interpreta.
11. `secureStorage.ts`: o `scope` guardado muda de conjunto. Um valor antigo (`'tournament'`) tem de
    ser tratado como token inválido no arranque, não como poule.
12. `useConnect.ts`: `router.replace(scope === 'match' ? '/match/{id}' : '/poule')`.
13. `app/index.tsx`: fase `match` → `/match/{id}`; remover o ramo `bracket`.
14. **Semear a cache com o combate que vem no `connect`** —
    `queryClient.setQueryData(queryKeys.match(id), match)`. O contrato promete *"o árbitro escreve
    seis dígitos e o combate abre, sem um segundo pedido pelo meio"*; sem isto há um ecrã de
    carregamento entre uma coisa e a outra.

### M3 — A rota do combate passa a ser a raiz da sessão

15. **Apagar `app/bracket.tsx`** e as suas entradas em `_layout.tsx`.
16. `app/match/[id].tsx` deixa de ser rota folha:
    - `home` deixa de poder ser `/bracket`. **Não há para onde voltar** — ver §4.
    - Ganha o *chrome* de sessão que o quadro carregava: `SessionBar`, `LeaveButton`, `QueueBanner`.
    - Cabeçalho passa a `competition_name` + `Round {round} · {position}` (a app **não** nomeia
      rondas — contrato §7).
17. **`useMatchDetail` ganha `refetchInterval`.** Hoje não faz *polling* nenhum: era o quadro que
    revalidava e o detalhe herdava. Sem lista, o detalhe é a **única** fonte, e é por ele que um
    `ready: false` passa a `true` quando a ronda anterior acaba. Cadência do contrato §5: pausado com
    o cronómetro a correr, 30 s com ele parado — reusar `usePollInterval()`/`useRefereeingPollingMode`.
18. `invalidateCompetition`: tirar a chave `bracket`; para `kind: 'match'` invalidar `queryKeys.match`.
    Nota: registado o resultado, o token é revogado — o *refetch* seguinte devolve `401
    poule_complete` e leva ao ecrã de resumo. **É o caminho desejado**, não um erro a esconder.

### M4 — A poule fechada

19. `app/poule.tsx`: remover o `Redirect` para `/bracket` e o botão "abrir quadro".
20. `elimination` passa a **linha informativa** no banner de `read_only`: progresso do quadro para
    onde os atletas foram, mais a frase que explica que cada combate tem código próprio.
21. `completion.ts`: apagar o ramo `tournament` e o `bracketLeft`. `nothingLeftToDo` fica:
    - `read_only` → `true` (já lá está);
    - poule → `bouts_total > 0 && bouts_done >= bouts_total`;
    - **`match` → `false`.** Não há nada para "concluir" num combate: registá-lo encerra a sessão do
      lado do servidor. O botão "Concluir" não aparece nesta sessão.
22. `app/complete.tsx`: ramo `match` — nome da prova em `competition_name`, e o resultado em vez do
    `4/15` de assaltos.

### M5 — Ligar

23. `useConnect.messageFor`: no `410 competition_finished`, **mostrar `failure.message`** em vez de
    `t('connect.error.finished')`. ⚠️ Ver a questão em aberto §6.1 — o `message` vem em pt-PT e a
    interface está em `en`.
24. Copy do ecrã de ligar: hoje diz *"Connect to a poule"* / *"Point the camera at the poule sheet"*.
    O mesmo campo de seis dígitos serve agora poules **e** pistas de quadro.

### M6 — Testes

25. `fakeApi.ts`: `seedTournament` + `seedBracket` → `seedMatch(overrides)`; PIN `777777` passa a
    devolver `scope: 'match'` com um `MatchDetail`. Acrescentar um seed de combate com
    `ready: false` que passa a `true` — é o cenário novo que não existia.
26. `live.test.ts`: tirar as duas chamadas mortas; acrescentar o `connect` de âmbito `match` e a
    verificação de que um código de poule **não** alcança um combate (`403`/`404`).
27. Reescrever os cenários de quadro em `navigation.test.tsx`, `store.test.ts`,
    `completion.test.ts`, `regression.test.tsx`.
28. **Teste novo, de regressão:** um `scope` desconhecido **nunca** produz um pedido a
    `/poules/undefined/...`. É o bug concreto que a `2.0.0` provoca hoje.

### M7 — Documentação

29. `CLIENT-SPEC.md`: reescrever §2 (âmbito), §6 (máquina de estados, ecrãs 5 e 6), §11 (estrutura),
    §12 (aceitação) e §14 (fases). O documento diz de si próprio que está ultrapassado.
30. `DECISIONS.md`: **ADR-032** — porque é que o quadro desapareceu da app e o que ficou no lugar.

---

## 4. UX/UI — o que tem de mudar no ecrã

A mudança de produto é esta: **a app deixa de ter um ecrã de quadro**. O que era uma sessão com duas
fases passa a ser duas sessões que não se conhecem.

### 4.1 Ecrã de ligar (`/connect`)

| Hoje | Passa a |
|---|---|
| *"Connect to a poule"* | Texto neutro — o mesmo código serve uma poule ou uma pista de quadro |
| *"Point the camera at the poule sheet"* | *"…na folha de poule ou no cartão do combate"* |
| `410` → texto fixo *"This competition has already finished"* | **O `message` do servidor**, que diz qual dos três casos é e para onde ir |

O caso que a copy fixa estraga é o mais importante: um árbitro a quem a app diz *"esta competição já
terminou"* no meio de um evento que claramente não terminou fica parado à espera do organizador. O
servidor passou a mandar a frase certa — *"A poule terminou. Cada combate das eliminatórias tem o
seu próprio código — peça o da sua pista."* — e a app está a deitá-la fora.

### 4.2 Ecrã do combate (`/match/[id]`) — o que muda mais

Era uma rota folha alcançada a partir de uma lista. Passa a ser **o único ecrã da sessão**. Precisa
de tudo o que a lista lhe dava e nunca teve:

1. **Cabeçalho de sessão.** `competition_name` em cima (é a única coisa que diz ao árbitro onde
   está: chegou com seis dígitos e mais nada), `Round {round} · {position}` por baixo.
2. **`SessionBar`** (tempo de sessão, estado de rede) e **`QueueBanner`**.
3. **"Sair" no cabeçalho.** Sem ele não há forma de largar a pista: hoje o botão vive no quadro e na
   lista, e nenhum dos dois é alcançável a partir daqui.
4. **Nada de "voltar".** O `home` do `BoutScreen` apontava a `/bracket`. Não há lista para onde
   voltar — o gesto de sair é o "Sair" com confirmação, e o fim natural é o resumo.
5. **Estado de espera, novo e obrigatório.** Um combate pode chegar com `ready: false`: *"o código
   pode ser entregue antes de se saber quem sobe"* (contrato §7). Até aqui esse caso era tratado
   pela **lista** — a linha aparecia e não abria. Agora é o ecrã inteiro:
   - `fencer_a` / `fencer_b` podem ser `null` → placeholder *"Awaiting winner"*;
   - cronómetro, `+`/`−` e submeter **desativados**, com a razão escrita;
   - o *polling* de 30 s é o que faz o ecrã destrancar-se sozinho quando a ronda anterior acaba.
   - ⚠️ Hoje isto entra como `assignment.locked = match.locked || !match.ready`, e `locked` lê-se
     como *"já foi arbitrado"*. **São dois estados diferentes e precisam de copy diferente.**
6. **Depois do resultado, o fim.** Registado o combate, o token morre. O ecrã não deve voltar a
   lado nenhum — segue para o resumo.

### 4.3 Ecrã da poule (`/poule`)

| Hoje | Passa a |
|---|---|
| Botão **"Direct elimination table — 3/7"** que abre `/bracket` | **Sai.** Não há quadro para abrir |
| `locked` **com** quadro → salta para o quadro sozinho | **Nunca salta.** Fica em leitura |
| Banner: *"Poule locked — the direct elimination table has been generated. Read-only mode."* | Diz também **para onde a competição foi**: progresso do quadro (`elimination`) e que cada combate tem código próprio |

O banner é a peça que substitui um ecrã inteiro. Sem ele, o árbitro que acaba a poule vê uma lista
que deixou de aceitar resultados e não tem nada que lhe explique porquê.

### 4.4 Ecrã de resumo (`/complete`)

Hoje mostra `4/15 bouts recorded` e o nome da competição. Para uma sessão de combate isso não quer
dizer nada: a sessão teve **um** assalto.

- **Poule:** fica como está.
- **Combate:** resultado (`15–11`), vencedor, e `competition_name`. O botão continua a ser *"Ligar
  a outra competição"* — e agora é o caminho normal, porque um árbitro que acabe uma pista recebe o
  código da seguinte.

### 4.5 Fila de submissões — a aresta que a `2.0.0` abre

**Isto não está no §11 C do contrato e é o problema operacional real da migração.**

A fila é filtrada por competição (`drainQueue(competitionUuid)`), e é preciso que seja: um token de
combate não alcança outro combate. Mas com um código por pista:

1. o árbitro regista o resultado da pista 3 **sem rede**;
2. o resultado vai para a fila;
3. a sessão da pista 3 acaba ali — não há mais nada a arbitrar nela;
4. o árbitro liga-se à pista 5, com outro código;
5. o resultado da pista 3 **nunca drena**: o filtro exclui-o, e mesmo sem filtro o token da 5 não o
   pode entregar. Fica na fila até expirar às 24 h.

Com o quadro inteiro num só código isto não acontecia — a sessão continuava viva e a fila drenava.

**Mitigação proposta (UX, sem alteração de contrato):**
- o `QueueBanner` passa a **nomear a pista** de cada item pendente, em vez de contar itens;
- ao ligar a uma pista nova com fila pendente noutra, avisar **antes** de prosseguir (a spec §8 já o
  pede — hoje o aviso não distingue quantas pistas estão em causa);
- o aviso de expiração das 24 h ganha peso: era um caso de catástrofe, passa a ser plausível.

**Decisão do organizador, não da app:** um resultado preso desta forma resolve-se rodando o PIN
daquela pista e voltando a ligar, ou registando o resultado na web. A app não pode fazer melhor — e
deve dizê-lo em vez de ficar calada.

### 4.6 i18n

- **Sai:** `bracket.*` na íntegra (14 chaves), `poule.openBracket`.
- **Entra:** `match.*` — cabeçalho, estado de espera, resumo do combate; `poule.readOnly` reescrito;
  `connect.*` com copy neutra.
- `complete.tallyLabel` (*"bouts recorded"*) precisa de variante para o combate.
- Manter as duas línguas (`en.json`, `pt-PT.json`) em paralelo, como está.

---

## 5. Ordem de execução sugerida

```
M1 tipos ──► M2 sessão ──► M3 rota do combate ──► M4 poule fechada ──► M5 ligar
                                │
                                └──► M6 testes (a par de M3–M5)
                                        └──► M7 docs
```

M1+M2 é o troço que **não é entregável a meio**: entre um e outro a app não compila. M3 em diante já
se pode verificar a olho, ecrã a ecrã.

**Estimativa de volume:** ~380 linhas apagadas (`bracket.tsx`), ~250 reescritas (tipos, store,
queries, testes), ~200 novas (estado de espera, *chrome* de sessão, resumo de combate, copy).

---

## 6. Questões em aberto — decididas ao executar (registo em [ADR-032](DECISIONS.md))

**6.1 → (a)**, mostrar o `message` do servidor, com (c) a ficar para uma MINOR do contrato.
**6.2 → `competitionKey() = poule?.uuid ?? match?.id`**, sem migrar a fila persistida.
**6.3 → confirmado:** o `bracket` não entra em *copy* nenhuma.

O texto original das três fica abaixo.

### 6.1 O `410` em pt-PT dentro de uma interface em `en`

O contrato (§7, C7) manda mostrar o `message` do servidor *"tal como vem — não o reconstrói"*, e é
ele que agora carrega a informação útil. Mas o `messageFor` do `useConnect` traduz os códigos
conhecidos de propósito, com uma razão escrita: *"a app está em `en`; misturar as duas línguas no
mesmo ecrã seria pior do que traduzir os casos que a app conhece."*

As duas regras colidem. Opções:

| | Efeito |
|---|---|
| **(a) Seguir o contrato** — mostrar o `message` cru | Frase certa, língua errada. É a única que diz ao árbitro para onde ir |
| **(b) Manter `en`** — texto fixo | Língua consistente, informação perdida. É o buraco que a `2.0.0` foi fechar |
| **(c) Pedir um `reason` ao servidor** (`poule_locked` \| `poule_played` \| `match_scored`) e traduzir na app | Resolve as duas. **Alteração MINOR do contrato** — e o contrato manda alterar o documento primeiro |

**Recomendação: (a) agora, (c) a seguir.** Uma frase em pt-PT desbloqueia o árbitro; uma em `en` que
não diz nada, não.

### 6.2 A chave da fila para uma sessão de combate

Confirmar `competitionKey() = poule?.uuid ?? match?.id`. Alternativa seria uma chave composta
(`match:${id}`), que evita qualquer hipótese de um `id` de combate colidir com um UUID de poule. O
custo é migrar a fila persistida — que, sendo de resultados por enviar, não se pode simplesmente
deitar fora.

### 6.3 O `bracket: 0`

O contrato avisa que `bracket` pode vir `0` num quadro sem ronda 1 e que *"o cliente não desenha
nada a partir deste campo sem o verificar"*. Com o ecrã de quadro apagado, o campo deixa de ser
usado para desenhar. **Confirmar que não entra na copy do cabeçalho** — nem sequer como *"Quadro de
{{bracket}}"*.

---

## 7. O que **não** muda

Fica escrito para não ser reaberto por engano:

- O **ecrã de assalto** (`BoutScreen`, cronómetro, cartões, prioridade, passividade, morte súbita).
  O contrato é literal: *"no mesmo ecrã de assalto que usa na poule"*.
- A **pista ao vivo** (§7.1) — `POST /elimination/{id}/events` mantém-se, mesmo corpo, mesmo `seq`.
- O **`submission_id`** e a matriz 201/200/409.
- O **modo cronómetro autónomo** (`/timer`), que não toca na sessão.
- O **QR** — continua a levar só os seis dígitos.
- O **`ETag`** da lista de assaltos e da classificação. (Não há `ETag` do lado do combate: um objeto
  só, e relê-lo é um pedido pequeno.)
- A mitigação `strongEtag` do `client.ts` — a correção continua a ser do servidor.
