# API de Arbitragem — Contrato

**Versão do contrato: `1.4.0`** · Estado: **parcialmente implementado** · 2026-07-25

Fronteira partilhada entre a **plataforma** (`poole.esgrima.pt`, Laravel 12) e a **app de arbitragem**
(React Native, repositório separado). Este ficheiro é a **única fonte de verdade** do que os dois
lados trocam entre si.

> ⚠️ **A plataforma já serve uma API de arbitragem, e ela ainda não é esta.** O que está em produção
> hoje, campo a campo e com o que tem de mudar ao lado, está em
> [§11 — Estado da implementação](#11-estado-da-implementação). **A direção está decidida: é o
> servidor que se alinha pelo contrato**, incluindo o prefixo `/api/v1` e o envelope de erro com
> `code`. A §11 é a lista de trabalho, não uma lista de dúvidas.

---

## 1. Âmbito e regras de alteração

### Como usar este documento

- Vive **em duplicado**, byte a byte igual, nos dois repositórios:
  - plataforma: `docs/app-arbitragem-api-contract.md`
  - app: `docs/API-CONTRACT.md`
- **Alterar aqui primeiro, implementar depois** — nos dois lados. Código que diverge deste documento
  é *bug*, independentemente de qual dos lados o escreveu.
- A app tipa `src/api/types.ts` diretamente a partir da [§7](#7-endpoints). O servidor testa as
  respostas contra os mesmos exemplos.

### Versionamento

`MAJOR.MINOR.PATCH` na linha de topo:

| Mudança | Incrementa | Exemplos |
|---|---|---|
| *Breaking* | **MAJOR** | remover/renomear campo, mudar tipo, mudar semântica de código de estado, mudar URL |
| Aditiva | **MINOR** | campo novo opcional, endpoint novo, `code` de erro novo |
| Redação | **PATCH** | corrigir exemplo, clarificar texto, sem impacto em código |

Um **MAJOR** implica prefixo de URL novo (`/api/v2/`) e período de coexistência: a plataforma serve
as duas versões até as apps instaladas terem migrado. Uma app **nunca** é forçada a atualizar a meio
de uma competição.

**Regra de tolerância do cliente:** a app **ignora campos que não conhece** e **nunca** falha por os
receber. Isto é o que torna um MINOR seguro.

### O que este contrato não cobre

Autenticação web (*session-based*, coexiste em paralelo), gestão de atletas/torneios, cartões e
penalizações. Tudo isso é da plataforma web.

A **classificação da poule** passou a estar coberta em `1.2.0` ([§7](#get-poulespoulestandings)): é o
servidor que a calcula, como já calcula a da web. O cliente **não** aplica critérios de desempate.

O **quadro de eliminatórias** passou a estar coberto em `1.4.0` ([§7](#eliminatórias)): a app arbitra
o quadro da poule e o quadro do torneio, com a mesma sessão e o mesmo ecrã de assalto. O que continua
fora é **gerar** o quadro, semear atletas e decidir emparelhamentos — isso é da plataforma web; a app
lê o quadro que ela produziu e regista resultados nele.

---

## 2. Transporte e cabeçalhos

- **HTTPS obrigatório.** O cliente recusa `http://` exceto em desenvolvimento contra *host* local
  ([§9](#9-emparelhamento-qr--pin)).
- **Base URL:** `{base_url}/api/v1`. Hoje o `base_url` é o valor por omissão da app; o QR passa a
  poder trazê-lo quando o formato reservado do [§9](#9-emparelhamento-qr--pin) entrar.
- JSON nos dois sentidos, UTF-8.
- **Sem cookies, sem CSRF.** Sanctum em modo token com cliente nativo não usa sessão *stateful* nem
  `csrf-cookie`. O cliente HTTP não guarda cookies.

### Pedido

```http
Accept: application/json
Content-Type: application/json          # só quando há corpo
X-Client: poole-referee-app/1.0.0 (ios 17.4)
Authorization: Bearer <token>           # todos os endpoints exceto POST /connect
```

### Resposta

Em **todas as respostas em que um token válido foi resolvido**, incluindo erros 4xx:

```http
X-Session-Expires-At: 2026-07-24T18:42:11Z
```

É assim que a app conhece a janela deslizante sem gastar um pedido ([§6](#6-sessão-e-expiração)).

**Num `401` o cabeçalho não vai.** Se o token foi recusado — expirou, foi revogado, ou a poule
ficou completa — não há sessão viva e não existe data de expiração para reportar. A app não precisa
dele nesse caso: em `401` limpa o token e volta ao ecrã de ligar ([§6](#6-sessão-e-expiração)).

### Datas

Sempre **ISO-8601 em UTC** com `Z` (`2026-07-24T18:42:11Z`). Servem para exibição e expiração —
**nunca** para medir a duração de um assalto, que é cronometrada localmente pelo cliente.

---

## 3. Envelope de erro

Formato nativo do Laravel, mais um `code` estável:

```json
{
  "code": "bout_already_scored",
  "message": "Já registado por outra pessoa.",
  "errors": { "a": ["O resultado não pode exceder 5."] }
}
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `code` | sim | **String estável.** A única coisa sobre a qual o cliente faz lógica. Catálogo em [§8](#8-catálogo-de-erros). |
| `message` | sim | Texto **pt-PT já pronto a mostrar** ao árbitro. |
| `errors` | só em `validation_failed` | Mapa campo → lista de mensagens. |

Alguns erros trazem campos extra documentados no endpoint (ex.: `current` no 409 do `score`).

**Regras do cliente:**
- Nunca faz lógica sobre `message` — só o mostra.
- Um `code` desconhecido é tratado como erro genérico recuperável, mostrando o `message` do servidor.
  Nunca faz *crash*.

---

## 4. Idempotência e *retry*

### Política do cliente

| Pedido | *Retry* automático |
|---|---|
| Qualquer `GET` | Sim — 3 tentativas, *backoff* exponencial com *jitter* (1 s, 2 s, 4 s ±30%) |
| `POST /connect` | **Não** — o utilizador reintroduz o PIN |
| `POST /bouts/{id}/start` · `POST /elimination/{id}/start` | Sim — idempotente por definição |
| `POST /bouts/{id}/score` · `POST /elimination/{id}/score` | Sim, através da fila persistente do cliente |

Nunca há *retry* de 4xx (exceto 408 e 429), e **nunca** em resposta a 409.

### `submission_id` — a chave de idempotência

Todo o registo de resultado (`score`, de poule e de eliminatória) leva um **`submission_id`
obrigatório**: um **UUID v4 gerado pelo cliente**, uma só vez, no momento em que o árbitro confirma o
resultado. Fica guardado com a submissão na fila e **não muda entre tentativas** — é a mesma tentativa
a repetir-se, não uma nova.

O servidor guarda-o com o resultado e decide assim:

| Estado no servidor | Resposta |
|---|---|
| Assalto por pontuar | grava → **201 Created** |
| Já pontuado, **mesmo `submission_id`** | **200 OK**, com o estado atual. Não regrava, não duplica eventos |
| Já pontuado, `submission_id` diferente | **409 Conflict**, com `current` |

Sem isto perde-se este cenário: a app submete → a rede engasga → o servidor grava → a resposta não
chega → a app repete → **409 "já registado por outra pessoa"**, sobre o registo do próprio autor. O
árbitro conclui que perdeu o resultado.

**Porquê não a comparação por token e resultado.** Era a regra anterior deste contrato — "mesmo token
+ mesmo resultado → 200" — e tem um buraco que a fila da app atravessa em condições normais: a sessão
expira ou é revogada com submissões por enviar, o árbitro volta a ligar, a fila drena **com um token
novo**, e o servidor vê outro token a registar o mesmo assalto → `409` falso, exatamente sobre o
resultado que ele estava a proteger. O `submission_id` sobrevive à rotação do token porque pertence à
submissão, não à sessão.

**Porquê não o cabeçalho `Idempotency-Key`.** É a mesma ideia com mais maquinaria: exige um
armazenamento de chave→resposta com TTL e limpeza, para poder repetir uma resposta que aqui se deriva
do estado do assalto. O `submission_id` é uma coluna a mais e nada mais, e a operação já tem uma
identidade natural — *este* resultado, *desta* submissão, *neste* assalto.

**O que o servidor guarda por assalto:** `submission_id` e o token que registou (este último para o
`scored_by_me` e para o registo de quem arbitrou). São escritos na mesma transação do resultado.

> **`scored_by_me` reinicia ao reconectar.** Deriva do token, e um `connect` novo emite outro. Um
> resultado que o árbitro registou antes de uma reconexão passa a aparecer como registado por outra
> pessoa. É cosmético — a distinção existe para o ecrã de lista, não para decidir escritas —, mas
> fica dito para não ser lido como bug.

---

## 5. Polling e ETag

Não há *push*. A plataforma não tem infraestrutura de *broadcasting* e o contrato não a exige.

Cadência do cliente:

| Situação | Intervalo |
|---|---|
| Lista de assaltos em foco | **10 s** |
| App em *background* | pausado |
| Ecrã de assalto com cronómetro a correr | **pausado** — não interromper a arbitragem |
| Ecrã de assalto com cronómetro parado | 30 s |
| Regresso ao *foreground* | *refetch* imediato |

Validação condicional em `GET /poules/{uuid}/bouts`:

```http
GET /api/v1/poules/9f3c.../bouts
If-None-Match: "a1b2c3d4"

→ 304 Not Modified              # sem corpo; o cliente mantém a cache
→ 200 OK + ETag: "e5f6..."      # corpo completo
```

O `ETag` **tem de mudar** quando: qualquer assalto muda de `status` ou de resultado, **ou** um atleta
é removido da poule (a lista encolhe), **ou** a poule é bloqueada.

O mesmo vale, com o mesmo formato, para `GET /poules/{poule}/standings` (que partilha o `ETag` da
lista de assaltos) e para as duas listas de eliminatórias, onde o `ETag` muda também quando **um
vencedor sobe de ronda** — o combate seguinte ganha atleta e passa a `ready`.

Em `429`, o cliente respeita `Retry-After` e duplica o intervalo até ao máximo de 60 s.

---

## 6. Sessão e expiração

- O token dura **60 minutos deslizantes**: cada pedido autenticado bem-sucedido renova a janela.
- O token tem **âmbito de uma competição**, e a competição é de um de dois tipos:
  - `scope: "poule"` — os assaltos da poule **e o quadro de eliminatórias dessa poule**.
  - `scope: "tournament"` — o quadro de eliminatórias do torneio. Não dá acesso às poules dele; cada
    poule tem o seu código.
- **Uma sessão por competição.** Um `POST /connect` bem-sucedido invalida o token anterior dessa
  competição; o dispositivo anterior recebe `401 token_revoked` no pedido seguinte.
- O servidor **invalida o token quando a competição está encerrada para sempre** — todos os assaltos
  `done` **e** o quadro de eliminatórias já decidido. A resposta do último `score` chega na mesma
  (201); é o pedido **seguinte** que recebe `401 poule_complete`.

  > **Não basta a poule estar completa.** Registar o último assalto acontece *antes* de o quadro
  > existir, e é a mesma sessão que vai arbitrar a eliminatória a seguir ([§7](#eliminatórias)).
  > Revogar aí expulsa o árbitro no pior momento possível. A regra é `isFinishedForGood()` —
  > competição fenced **e** quadro decidido —, e está fixada por teste no servidor.

- **Não há refresh de token.** Renovar = gerar um QR/PIN novo na plataforma web.

O cliente lê `X-Session-Expires-At`, avisa o árbitro a menos de 5 minutos do fim e, em `401`, limpa
o token, volta ao ecrã de ligação com a razão explicada e **preserva** as submissões por enviar.

---

## 7. Endpoints

Base: `{base_url}/api/v1`. Todos exigem `Authorization: Bearer`, exceto `POST /connect`.

- `{poule}` — **UUID** da poule (a plataforma expõe poules por UUID, não por id numérico).
- `{tournament}` — **UUID** do torneio.
- `{bout}` — **id opaco** do assalto de poule.
- `{match}` — **id opaco** do combate de eliminatória.

| Endpoint | Âmbito que o alcança |
|---|---|
| `POST /connect` | público |
| `GET /poules/{poule}/bouts` · `/standings` | `poule` |
| `GET /bouts/{bout}` · `POST .../start` · `.../score` | `poule` |
| `GET /poules/{poule}/elimination` | `poule` |
| `GET /tournaments/{tournament}/elimination` | `tournament` |
| `GET /elimination/{match}` · `POST .../start` · `.../score` | o do quadro a que o combate pertence |
| `GET` · `DELETE /session` | qualquer |

### Objetos partilhados

**`Fencer`**

```json
{ "id": 41, "number": 1, "name": "Ana Silva", "club": "CE Lisboa" }
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int | Id do atleta dentro da poule |
| `number` | int 1..n \| null | Número na folha de poule — é o que o árbitro chama em voz alta. **`null` na eliminatória**, onde o atleta chega do quadro e já não tem número de folha |
| `name` | string | |
| `club` | string \| null | |

**`Bout`**

```json
{
  "id": "b_01J8Y...",
  "sequence": 5,
  "status": "pending",
  "fencer_a": { "id": 42, "number": 2, "name": "Bruno Dias", "club": "CE Porto" },
  "fencer_b": { "id": 43, "number": 3, "name": "Carla Neves", "club": "CE Porto" },
  "score_a": null,
  "score_b": null,
  "scored_at": null,
  "scored_by_me": false
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | **Opaco.** O cliente nunca o interpreta, decompõe, ordena ou constrói — só o devolve tal e qual. Isto isola a app da representação interna dos assaltos na plataforma. |
| `sequence` | int ≥ 1 | Ordem de disputa. O cliente **não reordena**, mas só a trata como obrigatória quando `poule.ordered` é `true`. |
| `status` | `pending` \| `in_progress` \| `done` | |
| `score_a` / `score_b` | int \| null | `null` enquanto `status != done` |
| `scored_at` | string \| null | ISO-8601 UTC |
| `scored_by_me` | bool | `true` se foi a **sessão atual** a registar. Distingue "eu registei" de "outro registou". |

**`PouleSummary`**

```json
{
  "uuid": "9f3c1b2a-...",
  "name": "Poule 3 — Sabre Masculino",
  "tournament_name": "Torneio de Verão 2026",
  "weapon": "sabre",
  "touch_cap": 5,
  "duration_seconds": 180,
  "periods": 1,
  "rest_seconds": 60,
  "sudden_death_seconds": 60,
  "passivity_seconds": 60,
  "bouts_total": 15,
  "bouts_done": 4,
  "locked": false,
  "ordered": true,
  "elimination": { "matches_total": 7, "matches_done": 3 }
}
```

| Campo | Notas |
|---|---|
| `tournament_name` | `null` se a poule for isolada |
| `ordered` | `true` → a ordem é para cumprir e o `sequence` é estável. `false` → a ordem é meramente indicativa. Ver abaixo. |
| `weapon` | **Opcional.** `foil` \| `epee` \| `sabre`. Determina que regras de arbitragem a app oferece — a passividade (FIE t.87) não se aplica ao sabre. Ausente ou `null` → a app não assume arma nenhuma e oferece o conjunto comum. |
| `touch_cap` | Toques que terminam um assalto. **Os presets vêm sempre da API** — nunca *hardcoded* na app. |
| `duration_seconds` | Duração **de um período**. `180` por omissão, mas configurável por poule — há competições a `90`. |
| `periods` | Nº de períodos. `1` por omissão em poule |
| `rest_seconds` | **Opcional.** Descanso entre períodos, em segundos (FIE: 60). Ausente, `null` ou `0` → sem descanso, e a app passa direto ao período seguinte. Irrelevante quando `periods` é `1`, que é o caso normal em poule. |
| `sudden_death_seconds` | **Opcional.** Duração da morte súbita com prioridade sorteada, em segundos (FIE t.41). Ausente ou `null` → `60`. Em poule passa-se do último período **diretamente** à morte súbita, sem descanso pelo meio. |
| `passivity_seconds` | **Opcional.** Minuto de não combatividade que a app cronometra (FIE t.87). Ausente ou `null` → `60`; `0` → a app não conta passividade. |
| `locked` | `true` → poule fechada porque as eliminatórias foram geradas. Toda a escrita **sobre assaltos de poule** passa a devolver 422. |
| `elimination` | `null` enquanto o quadro não existir. Presente → há quadro desta poule para arbitrar, com o progresso dele. É o que diz à app que pode oferecer o ecrã do quadro. |

> **`locked: true` não quer dizer sessão em modo leitura.** Quer dizer que os *assaltos da poule*
> deixaram de aceitar escrita, porque o quadro foi gerado a partir deles. É exatamente o momento em
> que o quadro passa a aceitar — a mesma sessão muda de fase, não de estado. Ver
> [Eliminatórias](#eliminatórias).

> **Os presets de tempo são só cronometragem.** A app conta-os localmente e **não** comunica ao
> servidor o que acontece dentro deles: uma vitória por prioridade não é representável neste contrato
> ([§7](#post-boutsboutscore), `allow_draw`), e a passividade nunca sobe a não ser como evento
> descritivo em `events`.
>
> **Nota de nomenclatura:** o minuto de morte súbita chama-se `sudden_death_seconds`, e é o mesmo
> tempo a que o código da app chamou `PRIORITY_SECONDS`. O nome do contrato é o do regulamento, não o
> do botão — a app renomeia ao tipar. Não existem dois campos.

#### Estabilidade da ordem — `ordered`

A plataforma corre poules em dois modos, e a diferença entre eles é se o plantel pode mudar depois
de a poule começar:

- **Poule de torneio** (`ordered: true`) — o plantel é fixado quando as pools são geradas e não pode
  mudar a partir daí. O `sequence` segue a tabela FIE e **nunca se desloca**. A app apresenta o
  primeiro `pending` como "o próximo assalto".
- **Poule isolada** (`ordered: false`) — o organizador acrescenta e remove atletas a qualquer
  momento. Cada alteração ao plantel **regera a ordem**, e o assalto que era `sequence: 7` pode
  passar a `sequence: 5`. Neste modo a ordem não tem valor regulamentar: a app lista os assaltos por
  `sequence` mas **não** destaca um "próximo" nem sugere qual arbitrar — qualquer `pending` serve.

**O `id` é estável nos dois modos.** Um assalto entre os mesmos dois atletas mantém o `id` aconteça o
que acontecer ao plantel. Identidade é o `id`; `sequence` é ordem de apresentação. Nunca usar
`sequence` para identificar um assalto, nem em cache, nem na fila de submissões.

Se um atleta for removido, os assaltos dele deixam de aparecer na lista e o `bouts_total` encolhe.

**`TournamentSummary`**

O equivalente para uma sessão de âmbito `tournament`, que arbitra o quadro do torneio e mais nada.

```json
{
  "uuid": "3b7e9a04-...",
  "name": "Torneio de Verão 2026",
  "weapon": "sabre",
  "matches_total": 15,
  "matches_done": 4,
  "locked": false
}
```

| Campo | Notas |
|---|---|
| `weapon` | **Opcional.** O mesmo campo do `PouleSummary`. |
| `matches_total` / `matches_done` | Progresso do quadro. `0`/`0` enquanto o quadro não for gerado. |
| `locked` | `true` → o quadro já não aceita escrita. |

Os presets de tempo **não vêm aqui**: um quadro corre a 15 toques e 3 períodos, mas quem manda é o
combate, e é `GET /elimination/{match}` que os traz. Vale para os dois âmbitos.

---

### `POST /connect`

Troca um PIN por um token com âmbito de uma competição — uma poule ou um torneio, consoante o código
que foi gerado. **Público**, com *rate limit* (5/min por IP, o mesmo limite que a auth web da
plataforma já usa).

**Request**

```json
{ "pin": "483920", "device_name": "iPhone do João" }
```

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `pin` | string | sim | 6 dígitos, só numérico |
| `device_name` | string | não | ≤ 64 chars. Mostrado na web em "quem está a arbitrar". |

**200 OK**

```json
{
  "token": "17|Xk3nP...",
  "expires_at": "2026-07-24T18:42:11Z",
  "scope": "poule",
  "poule": { "...": "PouleSummary" },
  "tournament": null
}
```

| Campo | Notas |
|---|---|
| `scope` | `poule` \| `tournament`. **Determina o resto da resposta e o que a sessão alcança.** |
| `poule` | `PouleSummary` com `scope: "poule"`; `null` com `scope: "tournament"` |
| `tournament` | `TournamentSummary` com `scope: "tournament"`; `null` com `scope: "poule"` |

O árbitro escreve seis dígitos e não sabe — nem tem de saber — que tipo de código lhe deram. É o
`scope` que diz à app se abre a lista de assaltos ou vai direta ao quadro.

O `token` é guardado no armazenamento seguro do dispositivo. **Nunca** aparece em log, nem em
*crash report*.

**Erros:** `422 pin_invalid` · `410 competition_finished` · `429 pin_throttled` (com `Retry-After`)

> Um PIN rodado na web devolve `422 pin_invalid`, igual a um PIN errado. O servidor não guarda o PIN
> anterior, por isso não consegue distinguir os dois casos — e guardá-lo custaria uma coluna para uma
> mensagem de erro ligeiramente melhor.

---

### `GET /poules/{poule}/bouts`

Lista completa dos assaltos, **já ordenada** por `sequence`. Suporta `If-None-Match` → `304`.

**200 OK**

```json
{
  "poule": { "...": "PouleSummary" },
  "bouts": [
    {
      "id": "b_01J8X...",
      "sequence": 1,
      "status": "done",
      "fencer_a": { "id": 41, "number": 1, "name": "Ana Silva", "club": "CE Lisboa" },
      "fencer_b": { "id": 44, "number": 4, "name": "Rui Costa", "club": null },
      "score_a": 5,
      "score_b": 3,
      "scored_at": "2026-07-24T17:12:04Z",
      "scored_by_me": true
    }
  ]
}
```

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `GET /poules/{poule}/standings`

Classificação da poule, **já ordenada por lugar**. Suporta `If-None-Match` → `304`, com o mesmo
`ETag` que a lista de assaltos invalida.

**O servidor é que ordena.** Os critérios FIE são **V/M → indicador (TD−TR) → TD**, todos
descendentes, e é a plataforma que os aplica — a mesma lógica que já serve a folha de poule da web.
O cliente mostra `place` tal como vem e **não reordena**.

A **matriz** de resultados não vem aqui: cada célula é o resultado de um assalto, e esses já estão em
`GET /poules/{poule}/bouts`. Duplicá-los seria uma segunda fonte para o mesmo dado.

**200 OK**

```json
{
  "poule": { "...": "PouleSummary" },
  "standings": [
    {
      "fencer": { "id": 41, "number": 1, "name": "Ana Silva", "club": "CE Lisboa" },
      "victories": 3,
      "bouts": 4,
      "given": 18,
      "received": 11,
      "diff": 7,
      "place": 1
    }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `fencer` | `Fencer` | |
| `victories` | int | **V** — vitórias |
| `bouts` | int | **M** — assaltos já disputados. `0` enquanto o atleta não jogar |
| `given` | int | **TD/TS** — toques dados |
| `received` | int | **TR** — toques recebidos |
| `diff` | int | Indicador, `given - received`. Pode ser negativo |
| `place` | int ≥ 1 | Lugar. **Empates completos partilham o lugar e saltam o seguinte** (1, 2, 2, 4) |

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `GET /bouts/{bout}`

Detalhe de um assalto, com os presets necessários ao cronómetro.

**200 OK**

```json
{
  "id": "b_01J8Y...",
  "sequence": 5,
  "status": "pending",
  "fencer_a": { "id": 42, "number": 2, "name": "Bruno Dias", "club": "CE Porto" },
  "fencer_b": { "id": 43, "number": 3, "name": "Carla Neves", "club": "CE Porto" },
  "score_a": null,
  "score_b": null,
  "weapon": "sabre",
  "target": 5,
  "duration_seconds": 180,
  "periods": 1,
  "rest_seconds": 60,
  "sudden_death_seconds": 60,
  "passivity_seconds": 60,
  "allow_draw": false,
  "poule_locked": false
}
```

| Campo | Notas |
|---|---|
| `target` | Toques que terminam o assalto. Igual ao `touch_cap` da poule. |
| `weapon` · `rest_seconds` · `sudden_death_seconds` · `passivity_seconds` | **Opcionais.** Os mesmos campos do `PouleSummary`, repetidos aqui para o ecrã de assalto não depender de ter a poule em cache. |
| `duration_seconds` / `periods` | Presets do cronómetro, vindos da poule. **Todos configuráveis e todos vindos da API** — nenhum é *hardcoded* na app, nem sequer o minuto da morte súbita. |
| `allow_draw` | **`false` em poule** — a plataforma rejeita `a == b` com 422. O cliente desativa o botão de submeter enquanto os resultados forem iguais. |
| `poule_locked` | `true` → só leitura |

> **A plataforma não implementa regulamento.** As regras FIE — morte súbita, prioridade, o toque que
> um cartão vermelho concede — são da app, ou do árbitro que introduz o número certo. O servidor
> recebe o que lhe mandam, valida limites (`0 ≤ x ≤ target`, `a != b`) e grava. Não arbitra.

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `POST /bouts/{bout}/start`

Marca o assalto como `in_progress`. Alimenta o widget "quem joga agora" da web — sem este endpoint,
nenhum assalto sai de `pending`.

**Idempotente:** chamar duas vezes sobre o mesmo assalto devolve 200 nas duas.

O cliente chama-o quando o árbitro **inicia o cronómetro pela primeira vez** neste assalto, em modo
*fire-and-forget*: falhar **não bloqueia** a arbitragem e não é enfileirado. O cronómetro é local; o
`start` só informa a web.

> **É este endpoint que muda o estado, e só ele.** `GET /bouts/{bout}` é uma leitura pura: não marca
> `in_progress`, não recolhe outros assaltos, não escreve nada. Um *prefetch*, um *retry* ou um
> duplo-toque na app não podem ter efeito no servidor.

**Request:** sem corpo.

**200 OK**

```json
{ "id": "b_01J8Y...", "status": "in_progress" }
```

**Erros:** `401` · `403` · `404` · `409 bout_already_scored` (já `done`) · `422 poule_locked`

---

### `POST /bouts/{bout}/score`

Regista o resultado. **Primeiro a submeter ganha.**

**Request**

```json
{ "submission_id": "6f1c9d2e-4a7b-4f10-9c33-8b2e5a10d7f4", "a": 5, "b": 3 }
```

| Campo | Regras |
|---|---|
| `submission_id` | **Obrigatório.** UUID v4 gerado pelo cliente, uma vez por resultado. Chave de idempotência — ver [§4](#submission_id--a-chave-de-idempotência) |
| `a` | inteiro, `0 ≤ a ≤ target`, corresponde a `fencer_a` |
| `b` | inteiro, `0 ≤ b ≤ target`, corresponde a `fencer_b` |
| — | `a != b` — **não há empates em poule** |
| `events` | **Opcional.** Linha temporal do assalto, para estatísticas. Ver abaixo. |

**O que `a` e `b` incluem, e o que o servidor não fica a saber.** São o resultado final tal como o
árbitro o dá por bom — incluindo os toques atribuídos por **cartão vermelho**, que em regra FIE são
toques como os outros. O contrato exclui cartões e penalizações ([§1](#1-âmbito-e-regras-de-alteração))
do *resultado*, portanto a plataforma recebe o número e **não tem como distinguir** um toque ganho em
pista de um toque de penalização. Um cartão preto (exclusão) não aparece de todo: sobe apenas o
resultado. O campo `events` abaixo existe precisamente para que essa informação não se perca — mas é
descritiva, não entra no resultado.

Pela mesma razão, uma **vitória por prioridade** (FIE t.41, morte súbita que acaba sem toque) não é
representável — daria `a == b`, que este endpoint recusa. A app não inventa o toque em falta: pede-o
ao árbitro. Reabrir isto implica `allow_draw` mais um campo de vencedor, e é alteração **MAJOR**.

#### Linha temporal do assalto — `events` *(opcional)*

Serve estatística futura: quando caíram os toques, que cartões houve, a quem foi a prioridade,
quantos períodos se usaram. **Não é obrigatório** — uma app que ainda não recolha nada disto submete
sem o campo e tudo funciona igual.

```json
{
  "a": 5, "b": 3,
  "events": [
    { "type": "touch",       "side": "a", "period": 1, "at_ms": 12400 },
    { "type": "double",                   "period": 1, "at_ms": 30100 },
    { "type": "card_yellow", "side": "b", "period": 1, "at_ms": 45000 },
    { "type": "priority",    "side": "a", "period": 2, "at_ms": 0 }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `type` | string | Conjunto fechado: `touch` · `double` · `card_yellow` · `card_red` · `card_black` · `priority` · `period_end`. Um `type` fora da lista devolve `422 validation_failed`. |
| `side` | `"a"` \| `"b"` \| ausente | O atleta a que o evento diz respeito. Ausente quando não se aplica (ex.: `double`). |
| `period` | int ≥ 1 | Período em que ocorreu. **A morte súbita é `periods + 1`** — não tem tipo próprio; o evento `priority` diz a quem calhou. |
| `at_ms` | int ≥ 0 | Milissegundos **decorridos dentro do período**, medidos pelo cronómetro local. Não é relógio de parede: o que interessa é em que altura do assalto o toque caiu. |

Regras:

- **Descritivos, não autoritários.** O resultado de registo é o `a`/`b`. O servidor guarda a linha
  temporal como veio e **não** recalcula o resultado a partir dela nem rejeita a submissão se as duas
  coisas não baterem certo. Rejeitar faria uma submissão em fila falhar para sempre num assalto que o
  árbitro já deu por resolvido — e quem manda é o número que ele registou.
- **Máximo de 200 eventos** por assalto. Acima disso, `422 validation_failed`.
- Os eventos são gravados na mesma transação do resultado. Um `409` não grava nada; um *retry* que
  devolve `200` **não** duplica eventos.
- `periods_used` não é um campo: deriva-se do maior `period` da lista.

**201 Created** — gravado por este pedido

```json
{ "id": "b_01J8Y...", "status": "done", "score_a": 5, "score_b": 3, "bouts_done": 5, "bouts_total": 15 }
```

**200 OK** — já estava gravado, **pela mesma sessão e com o mesmo resultado** (*retry* seguro,
[§4](#4-idempotência-e-retry)). Mesmo corpo do 201.

**409 Conflict** — já registado por outro token, ou com resultado diferente

```json
{
  "code": "bout_already_scored",
  "message": "Já registado por outra pessoa.",
  "current": { "score_a": 4, "score_b": 5, "scored_at": "2026-07-24T17:31:02Z" }
}
```

O cliente mostra o `current` e **não repete**. Não existe forma de forçar: corrigir um resultado é
trabalho da plataforma web.

**Notas de implementação no servidor:**
- A deteção de conflito verifica o `status` **dentro da transação** que grava o resultado.
- A escrita **reaproveita a lógica existente** da plataforma (transação, linhas espelhadas,
  verificação de bloqueio). O controlador da API **não** escreve direto na base de dados.
- Quando o último assalto fica `done`, o token é invalidado ([§6](#6-sessão-e-expiração)).

**Erros:** `401` · `403 poule_scope_mismatch` · `404` · `409 bout_already_scored` ·
`422 validation_failed` · `422 poule_locked` · `429 rate_limited`

---

### Eliminatórias

O quadro a eliminar, arbitrado pela **mesma sessão e no mesmo ecrã de assalto**. É a fase seguinte da
competição, não outra competição:

- Um token de **poule** alcança os assaltos da poule **e** o quadro dessa poule. Quando o quadro é
  gerado, a poule fecha (`locked: true`) e o quadro abre — a app muda de fase sem voltar a ligar.
- Um token de **torneio** alcança o quadro do torneio e mais nada.

**O que a app faz aqui é o que já faz na poule:** lê a lista, abre um combate, cronometra, regista o
resultado. Gerar o quadro, semear e decidir quem sobe é da plataforma web — a app **nunca** o faz, e
o vencedor sobe de ronda do lado do servidor, na transação do resultado.

**`EliminationMatch`**

```json
{
  "id": "m_01J9A...",
  "bracket": 8,
  "round": 2,
  "position": 1,
  "status": "pending",
  "ready": true,
  "fencer_a": { "id": 41, "number": null, "name": "Ana Silva", "club": "CE Lisboa" },
  "fencer_b": { "id": 44, "number": null, "name": "Rui Costa", "club": null },
  "score_a": null,
  "score_b": null,
  "scored_at": null,
  "scored_by_me": false
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | **Opaco**, como o do assalto. Nunca interpretado pelo cliente |
| `bracket` | int | Tamanho do quadro — `8` num quadro de 8. Constante em todas as rondas |
| `round` | int ≥ 1 | Ronda, a contar do início do quadro. A app **não deduz o nome da ronda a partir daqui** — ver abaixo |
| `position` | int ≥ 1 | Posição dentro da ronda. É a ordem por que as pistas são chamadas |
| `status` | `pending` \| `in_progress` \| `done` | O mesmo conjunto do assalto de poule |
| `ready` | bool | `false` → um dos lados ainda espera o vencedor da ronda anterior. A app mostra o combate mas **não deixa abri-lo** |
| `fencer_a` / `fencer_b` | `Fencer` \| null | `null` enquanto o lugar não estiver preenchido. `number` é sempre `null` aqui |
| `score_a` / `score_b` · `scored_at` · `scored_by_me` | | Iguais aos do `Bout` |

**A app não nomeia rondas.** "Quartos-de-final" depende do tamanho do quadro, de haver repescagem e
do regulamento da prova — é decisão da plataforma, não aritmética do cliente. Se a nomeação for
precisa no ecrã, entra como campo novo (`round_name`) numa versão MINOR, vinda do servidor.

---

### `GET /poules/{poule}/elimination` · `GET /tournaments/{tournament}/elimination`

O quadro, **já ordenado** por `round` e depois por `position`. Suporta `If-None-Match` → `304`.

**200 OK**

```json
{
  "poule": { "...": "PouleSummary" },
  "matches": [ { "...": "EliminationMatch" } ]
}
```

A versão de torneio devolve `tournament` (`TournamentSummary`) no lugar de `poule`. A lista vem
**completa**, incluindo os combates com `ready: false` — é assim que a app desenha o quadro inteiro em
vez de só a ronda a jogar.

Quadro por gerar → `matches: []`. Não é erro.

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `GET /elimination/{match}`

Detalhe de um combate, com os presets do cronómetro. **Leitura pura** — não muda estado, tal como o
detalhe do assalto.

**200 OK**

```json
{
  "id": "m_01J9A...",
  "bracket": 8,
  "round": 2,
  "position": 1,
  "status": "pending",
  "ready": true,
  "fencer_a": { "id": 41, "number": null, "name": "Ana Silva", "club": "CE Lisboa" },
  "fencer_b": { "id": 44, "number": null, "name": "Rui Costa", "club": null },
  "score_a": null,
  "score_b": null,
  "weapon": "sabre",
  "target": 15,
  "duration_seconds": 180,
  "periods": 3,
  "rest_seconds": 60,
  "sudden_death_seconds": 60,
  "passivity_seconds": 60,
  "allow_draw": false,
  "locked": false
}
```

| Campo | Notas |
|---|---|
| `target` | Toques do quadro — `15` por omissão, contra os `5` da poule. **Vem sempre da API** |
| `periods` | `3` por omissão num quadro, e é aqui que o `rest_seconds` deixa de ser decorativo: há descanso de um minuto entre períodos |
| `weapon` · `rest_seconds` · `sudden_death_seconds` · `passivity_seconds` | **Opcionais**, com o mesmo significado da poule |
| `allow_draw` | **`false`** — um combate de quadro tem de ter vencedor, senão ninguém sobe |
| `locked` | `true` → quadro fechado, só leitura |

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `POST /elimination/{match}/start`

Igual ao `start` do assalto: marca `in_progress`, idempotente, *fire-and-forget*.

**200 OK** — `{ "id": "m_01J9A...", "status": "in_progress" }`

**Erros:** `401` · `403` · `404` · `409 match_not_ready` · `409 match_already_scored` · `422 poule_locked`

---

### `POST /elimination/{match}/score`

Regista o resultado do combate. **Mesmas regras do `score` de poule**, incluindo o `submission_id`
obrigatório, a resposta `200` num *retry* da mesma submissão e o `current` no `409`
([§4](#submission_id--a-chave-de-idempotência)).

```json
{ "submission_id": "0b9d...", "a": 15, "b": 11 }
```

**201 Created**

```json
{
  "id": "m_01J9A...",
  "status": "done",
  "score_a": 15,
  "score_b": 11,
  "matches_done": 5,
  "matches_total": 15
}
```

Duas diferenças em relação à poule:

- **O vencedor sobe na mesma transação.** O combate da ronda seguinte ganha atleta e pode passar a
  `ready: true`. A app descobre isso no *poll* seguinte — a resposta do `score` não descreve o resto
  do quadro.
- **`409 match_not_ready`** existe aqui: um combate cujo lugar ainda espera o vencedor da ronda
  anterior não aceita resultado, mesmo que a app o tenha em cache como abrível.

**Erros:** `401` · `403 poule_scope_mismatch` · `404` · `409 match_already_scored` ·
`409 match_not_ready` · `422 validation_failed` · `422 poule_locked` · `429 rate_limited`

---

### `GET /session` *(opcional, recomendado)*

Valida no arranque da app um token guardado, sem escrever nada. Evita abrir uma sessão morta.

**200 OK**

```json
{
  "expires_at": "2026-07-24T18:42:11Z",
  "scope": "poule",
  "poule": { "...": "PouleSummary" },
  "tournament": null
}
```

Mesma forma do `POST /connect`, sem o `token` — que a app já tem. É por aqui que uma app relançada
descobre que a poule entretanto fechou e que o que há para arbitrar agora é o quadro.

**Erros:** `401`

---

### `DELETE /session` *(opcional)*

Revoga o token atual — botão "terminar sessão". **204 No Content**. Falhar não impede o cliente de
apagar o token localmente.

---

## 8. Catálogo de erros

Os `code` são **estáveis** e fazem parte do contrato. As `message` são indicativas: o servidor pode
afinar a redação sem que isso seja uma alteração de contrato.

| HTTP | `code` | Significado | Reação esperada do cliente |
|---|---|---|---|
| 422 | `pin_invalid` | PIN errado, inexistente, ou já rodado na web | Erro no campo, mantém o ecrã |
| 410 | `competition_finished` | O PIN existe mas a competição já terminou | "Esta competição já terminou" — não é erro de digitação |
| 429 | `pin_throttled` | Demasiadas tentativas | Bloqueia o campo até `Retry-After` |
| 401 | `token_expired` | 60 min sem atividade | Volta ao ecrã de ligar |
| 401 | `token_revoked` | Outro dispositivo ligou-se a esta poule | "Outro dispositivo assumiu esta poule" |
| 401 | `poule_complete` | Competição encerrada — assaltos `done` **e** quadro decidido | Ecrã de competição completa — **não é erro** |
| 403 | `poule_scope_mismatch` | Token de outra competição, ou de âmbito errado (código de poule a pedir o quadro do torneio) | Volta a ligar; sinaliza *bug* |
| 404 | `not_found` | Assalto/poule inexistente (ex.: atleta removido) | *Refetch* da lista |
| 409 | `bout_already_scored` | Assalto de poule já registado | Mostra `current`, não repete |
| 409 | `match_already_scored` | Combate de quadro já registado | Mostra `current`, não repete |
| 409 | `match_not_ready` | O combate ainda espera o vencedor da ronda anterior | *Refetch* do quadro; o combate não devia estar abrível |
| 422 | `poule_locked` | Assaltos de poule fechados porque o quadro foi gerado | **Não é fim de sessão:** a app passa ao quadro. Só é modo leitura se também não houver quadro |
| 422 | `validation_failed` | Corpo inválido | Mostra `errors`; sinaliza *bug do cliente* |
| 429 | `rate_limited` | Excesso de pedidos | *Backoff*, respeita `Retry-After` |
| 5xx | `server_error` | Falha do servidor | *Retry* com *backoff*; submissões vão para a fila |
| — | *(sem resposta)* | Rede indisponível | Modo offline |

> **`403 poule_scope_mismatch` pode chegar como `404 not_found`.** O servidor responde "não existe"
> em vez de "não é seu" a um id de outra competição, para que um árbitro com uma poule na mão não
> possa descobrir que ids existem no resto da prova. O cliente **tem de tolerar as duas**: o `403`
> continua reservado e nunca é reutilizado para outra coisa, mas o comportamento a programar é o do
> `404` — *refetch* da lista, e só depois voltar a ligar se ela também vier vazia.

---

## 9. Emparelhamento QR / PIN

### PIN

- **6 dígitos** (`000000`–`999999`), gerado por **competição** — poule ou torneio — na plataforma web.
- **Único entre os PINs ativos**, e único **nas duas tabelas**: o `/connect` recebe só os seis dígitos
  e tem de saber para onde mandar o árbitro.
- Rodável a qualquer momento (botão "gerar novo QR"). Rodar **invalida o PIN anterior** **e** os
  tokens já emitidos — é assim que o organizador retoma uma competição de um dispositivo perdido.
- **Não é de uso único.** Vale até ser rodado ou até a competição ficar encerrada.

  > **Decidido assim, sabendo o custo.** Um PIN que se gasta na ligação protege contra quem fotografa
  > o QR projetado, mas cobra o preço no caso comum: telemóvel sem bateria, app reinstalada, sessão
  > perdida a meio de uma poule — e o árbitro fica parado à espera do organizador. O árbitro em
  > pavilhão precisa de poder voltar a ligar-se sozinho. Quem quiser cortar o acesso roda o PIN, que
  > é um clique e mata também os tokens.

### Payload do QR

**O QR leva os 6 dígitos do PIN e mais nada** — exatamente o que o árbitro escreveria à mão:

```
483920
```

Ler o QR e escrever o PIN são o mesmo caminho, com a mesma validação e o mesmo tratamento de erro. O
`base_url` vem do valor por omissão compilado na app.

**Fallbacks de leitura do cliente**, por ordem:

1. String de 6 dígitos → é o PIN. É o caso normal, e hoje o único que a plataforma produz.
2. JSON `{ v, base_url, pin }` → **formato reservado**, ainda não emitido pela plataforma. Ver abaixo.
3. Qualquer outra coisa → *"QR não reconhecido."*

**Entrada manual:** campo de 6 dígitos. **Não há campo de servidor** — nem no QR, nem na UI.

#### O `base_url` no QR fica para uma fase futura

O payload abaixo está **especificado e não implementado**, dos dois lados. Serve para o dia em que
houver *self-hosting*, *staging* ou uma segunda instalação; até lá, um QR que leve só o PIN é menos
uma coisa a poder estar errada, e a app aponta ao servidor por omissão.

```json
{ "v": 1, "base_url": "https://poole.esgrima.pt", "pin": "483920" }
```

| Campo | Notas |
|---|---|
| `v` | Versão do payload. O cliente rejeita uma `v` que não conheça com mensagem clara: *"Este QR foi gerado por uma versão mais recente da plataforma. Atualiza a app."* |
| `base_url` | **Sem barra final.** Tem de ser `https://`, exceto em desenvolvimento contra `localhost`, `127.0.0.1`, `10.*` ou `192.168.*`. |
| `pin` | 6 dígitos |

**O cliente já o aceita.** Reconhecer o JSON custa umas linhas de *parser* e evita uma migração
coordenada no dia em que a plataforma passar a emiti-lo: o QR novo funciona em apps antigas, e o QR
antigo continua a funcionar sempre. Ligar isto do lado do servidor não é alteração de contrato — é
passar a emitir o formato 2 em vez do 1.

---

## 10. Changelog

| Versão | Data | Alterações |
|---|---|---|
| `1.4.0` | 2026-07-25 | **As decisões que estavam em aberto na `1.3.0`, tomadas.** (1) **Eliminatórias entram no contrato:** `GET /poules/{poule}/elimination`, `GET /tournaments/{tournament}/elimination`, `GET /elimination/{match}`, `POST .../start` e `POST .../score`, mais os objetos `EliminationMatch` e `TournamentSummary`. O `POST /connect` e o `GET /session` ganham `scope` (`poule` \| `tournament`). (2) **O PIN volta a ser de utilização múltipla** — o árbitro que perde a sessão volta a ligar-se sozinho; quem quiser cortar acesso roda o PIN. (3) **O QR passa a levar só os 6 dígitos**; o payload JSON com `base_url` fica especificado como formato reservado, para uma fase futura. (4) **`submission_id` obrigatório no `score`**, substituindo a comparação por token — ver o §4. (5) `Fencer.number` passa a poder ser `null` (na eliminatória o atleta não tem número de folha); `PouleSummary.elimination` diz se há quadro para arbitrar. **Nota de versionamento:** o `submission_id` obrigatório e o `number` *nullable* seriam MAJOR se houvesse alguma app instalada. Não há: nada disto está implementado em nenhum dos lados, e o `/api/v1` ainda não serviu um único pedido em produção. |
| `1.3.0` | 2026-07-25 | **Reconciliação das duas cópias, mais o estado real.** As duas cópias do contrato tinham divergido: a da plataforma levou a revisão `1.0.0` (abaixo) e a da app levou a `1.1.0` e a `1.2.0` — nenhuma das duas conhecia a outra. Esta versão é a **união** das duas, mais a [§11](#11-estado-da-implementação) que descreve o que a plataforma serve hoje e onde é que isso diverge daqui. Uma decisão de nomenclatura pelo meio: o minuto de morte súbita é `sudden_death_seconds` (nome da plataforma), **não** `priority_seconds` (nome que a app tinha proposto) — são o mesmo tempo e nenhum dos dois está implementado, por isso a escolha não parte nada. `410` volta ao catálogo, agora como `competition_finished`, que é o que o servidor realmente devolve. A invalidação do token passou a exigir competição encerrada, não poule completa. |
| `1.2.0` | 2026-07-25 | **MINOR, aditivo** (proposto do lado da app). (1) `GET /poules/{poule}/standings` — a classificação passa a ser calculada pelo servidor, e sai da lista de exclusões do §1. (2) `weapon` opcional em `PouleSummary` e em `GET /bouts/{bout}`. (3) `passivity_seconds` opcional nos mesmos dois sítios — o tempo de FIE t.87 deixa de estar *hardcoded* na app. (4) Redação: `POST /bouts/{bout}/score` diz agora o que `a`/`b` incluem e o que a plataforma não fica a saber. |
| `1.1.0` | 2026-07-25 | **MINOR, aditivo** (proposto do lado da app). `rest_seconds` opcional em `PouleSummary` e em `GET /bouts/{bout}` — descanso entre períodos, que a app cronometra. Irrelevante com `periods: 1`, que é o caso normal em poule; ganha uso quando a app arbitrar eliminatórias, que correm a 3 períodos. |
| `1.0.0` | 2026-07-25 | Revisão do rascunho, antes de qualquer implementação: removido `410 pin_expired` (indistinguível de PIN errado sem guardar o PIN anterior); `X-Session-Expires-At` deixa de ser prometido em `401`; `PouleSummary.ordered` acrescentado, com a regra de estabilidade de `sequence`; `events` opcional no `score`, para estatística; `sudden_death_seconds` acrescentado aos presets, configurável e vindo da API; escrito que a plataforma não implementa regulamento FIE e que em poule não há descanso entre períodos. **Sem alteração de versão: a app não foi lançada e nada está implementado dos dois lados.** |
| `1.0.0` | 2026-07-24 | Versão inicial. Extraída de `docs/app-arbitragem-client-spec.md` §5–§8. Nada implementado ainda. |

---

## 11. Estado da implementação

**Levantado a 2026-07-25 contra o código da plataforma** (branch `test`, commit `78afee4 — feat: API
e painel de arbitragem`) e atualizado com as decisões da `1.4.0`. A app não tem nada disto ligado:
`src/api/types.ts` continua tipado para o contrato e a app corre contra os *mocks*.

**A direção está decidida: é o servidor que se alinha pelo contrato.** O que segue deixou de ser uma
lista de divergências em aberto e passou a ser a lista de trabalho do lado da plataforma.

### O que a plataforma serve hoje

```
POST /api/connect
GET  /api/poule/{poole}/bouts
GET  /api/bout/{bout}                    ← marca in_progress (efeito lateral)
POST /api/bout/{bout}/score
GET  /api/poule/{poole}/elimination
GET  /api/tournament/{t}/elimination
GET  /api/elimination/{match}            ← marca in_progress (efeito lateral)
POST /api/elimination/{match}/score
```

Autenticação por Sanctum com token de competição (`auth:sanctum` + middleware `referee`), janela de
60 minutos deslizante empurrada a cada pedido, *throttle* de 5/min no `connect` e 60/min por token no
resto. **Isso está conforme o contrato**, e a cobertura de âmbito do middleware — um código de poule
não alcança o quadro do torneio, e vice-versa — é exatamente o que a [§6](#6-sessão-e-expiração)
descreve. O resto tem de mudar.

### A. Trabalho decidido, por ordem de quanto bloqueia

| # | O contrato diz | O servidor faz hoje | O que muda |
|---|---|---|---|
| A1 | Envelope `{ code, message, errors? }` | `{ message }` — sem `code` em lado nenhum | **Acrescentar o `code`, em todas as respostas de erro.** Sem ele o cliente não distingue PIN inválido de sessão expirada de poule bloqueada de conflito: todos caem no ramo genérico. `withExceptions()` com um *renderable*, mais os `code` nas respostas escritas à mão nos controladores. É o ponto que mais custa à app e o mais barato de corrigir |
| A2 | Base `{base}/api/v1`, recursos no plural | `/api` sem versão, recursos no singular | **Prefixar `v1` e pluralizar:** `/api/v1/poules/{poule}/bouts`, `/api/v1/bouts/{bout}`, `/api/v1/tournaments/{t}/elimination`. Barato agora, que não há apps instaladas; caro depois. O prefixo é o que torna possível servir uma `v2` sem partir apps no meio de uma competição |
| A3 | `submission_id` obrigatório; mesma submissão → `200` | Qualquer 2.ª submissão → `409` | **Coluna `submission_id` (e `scored_by_token_id`) no assalto e no combate**, escritas na transação do resultado, mais a matriz de decisão do [§4](#submission_id--a-chave-de-idempotência). Sem isto a fila offline da app não pode existir: um *timeout* faz o árbitro ver "já registado por outra pessoa" sobre o registo dele próprio |
| A4 | `PouleSummary` no `connect`, na lista, no `standings` e no `session`; `TournamentSummary` no âmbito de torneio | Não existe em endpoint nenhum. O `connect` devolve campos soltos (`poole_id`, `name`, `poole_name`) | **Implementar os dois objetos como estão especificados** e devolvê-los onde o contrato os põe, com `scope` a dizer qual dos dois vem preenchido. Sem eles a app não tem presets, progresso, `locked` nem forma de saber se há quadro |
| A5 | `POST /bouts/{bout}/start` e `POST /elimination/{match}/start`; os `GET` são puros | O `GET` do detalhe é que marca `in_progress` | **Acrescentar os dois `POST` e limpar os `GET`.** Um GET com efeito lateral significa que um *prefetch*, um *retry* ou um duplo-toque mudam estado do servidor — e a app faz *polling*. Fecha o ponto A1 do `app-arbitragem-todo.md` |
| A6 | `ETag` / `If-None-Match` nas listas; envelope `{ poule, bouts[] }` / `{ poule\|tournament, matches[] }` | `{ data: [...] }`, sem `ETag` | **Envelope e `ETag`** (`max(updated_at)` + nº de atletas ativos + estado de bloqueio; no quadro, também a subida de vencedores). Sem `ETag` o *polling* de 10 s traz a lista inteira, sempre |
| A7 | `X-Session-Expires-At` em todas as respostas autenticadas | Não é escrito | **Duas linhas no `RefereeTokenMiddleware`**, que já calcula o novo `expires_at`. É o que permite avisar o árbitro antes de a sessão morrer |
| A8 | `Bout`/`EliminationMatch` com `score_a`/`score_b` planos, `scored_at`, `scored_by_me`, `id` string | `score: { a, b }`; sem `scored_at` nem `scored_by_me`; `id` inteiro | **Achatar os *resources*, `(string) $this->id`, e as colunas em falta.** O `scored_by_me` distingue "fui eu que registei" de "registou outro", que é meia razão de ser do ecrã de lista |
| A9 | `409` traz `current`; `201` traz o corpo completo com progresso | `409` só com `message`; `201` devolve `{ status: "done" }` | **Devolver os corpos do contrato.** Sem `current` o ecrã de conflito não tem o que mostrar; sem o progresso a app faz um `GET` a seguir a cada submissão |
| A10 | PIN inválido → `422 pin_invalid` | `401` com `{ message }` | **`422` com `code`**, e manter o `410 competition_finished` que o servidor já devolve bem |
| A11 | PIN de utilização múltipla | `connectReferee()` anula o `referee_pin` ao emitir o token | **Deixar de gastar o PIN.** Rodar o PIN continua a matar os tokens — é essa a forma de cortar acesso. Fecha o ponto A2 do todo |
| A12 | Presets `weapon`, `rest_seconds`, `sudden_death_seconds`, `passivity_seconds` | Só `duration_seconds` e `periods` (e os equivalentes de eliminação) | **Colunas em falta** na poule e no torneio, no molde do par `touch_cap`/`elimination_touch_cap`. Não bloqueia — a app usa os valores FIE enquanto não vierem |
| A13 | `GET /poules/{poule}/standings` · `GET` e `DELETE /session` · `ordered` · `events` no `score` · `device_name` no `connect` | Não existem | **Por implementar.** Nada disto bloqueia: a regra de tolerância do [§1](#1-âmbito-e-regras-de-alteração) cobre os campos, e sem `standings` a app deriva a classificação dos assaltos que já tem |

### B. Onde a implementação tinha razão e foi o contrato que se corrigiu

| O que mudou no contrato | Porquê |
|---|---|
| `410 competition_finished` no catálogo (`1.3.0`) | O servidor já responde `410` a um PIN de competição terminada, e é informação útil ao árbitro |
| Revogação do token exige competição **encerrada**, não poule completa (`1.3.0`) | A regra antiga expulsava o árbitro no momento em que registava o último assalto — antes de o quadro existir, e é a mesma sessão que o vai arbitrar. Corrigido no servidor e fixado por teste |
| `404` aceite onde o contrato prometia `403 poule_scope_mismatch` (`1.3.0`) | Responder "não existe" a um id de outra competição não revela que ids existem na prova. O `403` fica reservado |
| Eliminatórias no contrato, com `scope` no `connect` (`1.4.0`) | A plataforma implementou-as antes de o contrato as prever, e a forma que escolheu — `EliminationMatchResource` deliberadamente igual ao `BoutResource` — é a certa: o ecrã de assalto da app não tem de saber em que fase está |

### C. O que muda do lado da app

Nada disto é trabalho de servidor, mas sai das mesmas decisões:

- **`src/api/types.ts`** ganha `EliminationMatch`, `TournamentSummary`, `scope`, `submission_id` e o
  `number` *nullable*. Continua a ser tipado a partir daqui, e só depois de o servidor alinhar.
- **A fila** ([client-spec §8](app-arbitragem-client-spec.md)) passa a guardar o `submission_id`
  gerado no momento da confirmação, e a repeti-lo em cada tentativa — é isso que faz a chave
  funcionar. Um `submission_id` gerado no momento do envio não serve de nada.
- **O ecrã do quadro** é novo, e a máquina de estados ganha a transição `poule fechada → quadro`.
- **`API_CONTRACT_VERSION` sobe para `'1.4.0'`** quando a plataforma servir isto. Até lá continua a
  ser a versão *em vigor*, e o que os dois lados garantem hoje é menos do que a `1.0.0`, não mais.

---

## Referências

- `docs/app-arbitragem-client-spec.md` — especificação da app (consome este contrato)
- `docs/app-arbitragem-todo.md` — pontos em aberto do lado do servidor (A1, A2 e A3 cruzam com a §11)
- `docs/app-arbitragem-spec.md` — visão de produto e trabalho do lado do servidor
- [Laravel Sanctum — API token authentication](https://laravel.com/docs/12.x/sanctum#api-token-authentication)
