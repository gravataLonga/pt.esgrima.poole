# API de Arbitragem — Contrato

**Versão do contrato: `1.5.0`** · Estado: **servido pela plataforma, consumido pela app** · 2026-07-25

Fronteira partilhada entre a **plataforma** (`poole.esgrima.pt`, Laravel 12) e a **app de arbitragem**
(React Native, repositório separado). Este ficheiro é a **única fonte de verdade** do que os dois
lados trocam entre si.

> ✅ **Os dois lados falam este contrato.** A plataforma serve os endpoints da [§7](#7-endpoints), o
> envelope de erro da [§3](#3-envelope-de-erro), o catálogo da [§8](#8-catálogo-de-erros), o
> `submission_id` da [§4](#4-idempotência-e-retry) e os `ETag` da [§5](#5-polling-e-etag); a app
> consome-os todos, sem *fixtures* pelo meio. O levantamento feito a ligar os dois — incluindo o que
> só aparece com o servidor a sério do outro lado — está em
> [§12 — Levantamento de campo](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério).
>
> ⚠️ **Duas coisas por corrigir, ambas do lado do servidor**, e nenhuma delas trava a app:
> (1) a comparação do `If-None-Match` é forte, e o `304` do [§5](#5-polling-e-etag) nunca acontece
> através do proxy — detalhe na caixa da §5; (2) um pedido sem `Accept: application/json` e sem
> token devolve `500` em vez de `401` — [§12](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério), ponto 6.

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

**No `POST /connect` o cabeçalho também não vai.** É o único endpoint público, fora do middleware
que o acrescenta, e não precisa dele: a expiração vem no corpo, em `expires_at`. Daí para a frente,
todas as respostas autenticadas o trazem.

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

> ### ⚠️ A comparação do `If-None-Match` tem de ser **fraca** (por corrigir do lado do servidor)
>
> Levantado a 2026-07-25 a ligar a app ao servidor a sério pela primeira vez. **O `304` nunca
> acontece** contra a plataforma tal como está publicada, e a razão não está em nenhum dos dois
> lados isoladamente:
>
> 1. O servidor gera um `ETag` forte — `"ffbe1697229bc37f"` — e compara o `If-None-Match` por
>    **igualdade de string** com ele (`RefereeListVersion` / os controladores).
> 2. O nginx à frente comprime a resposta e, ao fazê-lo, **enfraquece o `ETag`**: quem manda
>    `Accept-Encoding: gzip` recebe `W/"ffbe1697229bc37f"`. É comportamento normal de um proxy que
>    altera a codificação do corpo, e manda `Accept-Encoding: gzip` toda a gente — o `fetch` do
>    React Native incluído.
> 3. O cliente devolve o que recebeu, `W/"..."`, a igualdade de string falha, e a resposta é
>    sempre `200` com a lista inteira.
>
> Verificado com `curl`: sem `--compressed` o `ETag` vem forte e o `304` funciona; com
> `--compressed` vem `W/"..."` e o mesmo pedido dá `200`. Reenviando à mão a forma forte, dá `304`.
>
> **Efeito prático:** o polling de 10 s do §5 passa a transferir a lista completa a cada volta, em
> vez de um cabeçalho. Numa poule de 12 com 15 dispositivos ligados é a diferença entre alguns
> kilobytes por minuto e alguns megabytes.
>
> **Correção do lado do servidor** — é a que resolve o problema: o `If-None-Match` usa
> **comparação fraca** (RFC 9110 §13.1.2), portanto `W/"x"` e `"x"` têm de ser tratados como o
> mesmo validador. Na prática é ignorar o prefixo `W/` dos dois lados antes de comparar, e aceitar
> uma lista separada por vírgulas.
>
> **Mitigação já feita do lado da app:** o cliente normaliza o `ETag` para a forma forte antes de o
> reenviar (`strongEtag` em `src/api/client.ts`). Fica correto com a plataforma de hoje **e**
> continua correto depois de o servidor passar a fazer a comparação fraca. Não substitui a
> correção: qualquer outro cliente do `/api/v1` continua a apanhar o problema.

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
| `GET /bouts/{bout}` · `POST .../start` · `.../events` · `.../score` | `poule` |
| `GET /poules/{poule}/elimination` | `poule` |
| `GET /tournaments/{tournament}/elimination` | `tournament` |
| `GET /elimination/{match}` · `POST .../start` · `.../events` · `.../score` | o do quadro a que o combate pertence |
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
| `scored_at` | string \| null | ISO-8601 UTC. **Pode ser `null` mesmo com `status: "done"`**: resultados registados antes de a plataforma passar a guardar a hora não a têm ([§12](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério)). O cliente mostra o resultado à mesma e omite a hora |
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

### `POST /bouts/{bout}/events`

O que está a acontecer na pista **enquanto o assalto decorre**: o toque que caiu, o duplo, o cartão,
a prioridade, o fim do período.

**Porque existe.** Sem ele a plataforma só fica a saber do assalto no fim, de uma vez. Uma poule a
meio parece, da página do organizador e da página pública, exatamente igual a uma poule que ninguém
começou. Com ele, o placar sobe na web toque a toque.

**Opcional, e *fire-and-forget*.** Uma app que não recolha nada disto continua a funcionar na mesma —
o que fica registado é o `score`. Falhar aqui **nunca** pode travar a arbitragem: não se enfileira,
não se espera pela resposta, não se mostra erro ao árbitro. O cronómetro e o placar da app são dele.

**Request**

```json
{
  "events": [
    { "seq": 1, "type": "touch",  "side": "a", "period": 1, "at_ms": 12400, "score_a": 1, "score_b": 0 },
    { "seq": 2, "type": "double",              "period": 1, "at_ms": 30100, "score_a": 2, "score_b": 1 }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `events` | array | 1 a **50** por pedido. Um lote, não um evento: um telemóvel que perdeu a rede trinta segundos tem três toques para recuperar e não deve precisar de três idas ao servidor. |
| `seq` | int ≥ 1 | **Contador do próprio assalto**, atribuído pela app a partir de 1. É a idempotência toda — ver abaixo. |
| `type` | string | O mesmo conjunto fechado do `events` do `score`: `touch` · `double` · `card_yellow` · `card_red` · `card_black` · `priority` · `period_end`. |
| `side` | `"a"` \| `"b"` \| ausente | O atleta a que o evento diz respeito. Ausente quando não se aplica (ex.: `double`). |
| `period` | int ≥ 1 | Período em que ocorreu. A morte súbita é `periods + 1`. |
| `at_ms` | int ≥ 0 | Milissegundos decorridos **dentro do período**, pelo cronómetro local. |
| `score_a`, `score_b` | int ≥ 0, opcionais | O placar **depois** do evento. É o que a web mostra enquanto o assalto decorre. |

**A idempotência é o `seq`, e só o `seq`.** Um toque é enviado no instante em que cai, por cima de
uma rede de pavilhão que falha, portanto o mesmo toque chega duas vezes tantas vezes como não chega.
Não há nada que distinga um toque do toque idêntico ao lado dele a não ser o contador. O servidor
guarda `(assalto, seq)` como chave única e **ignora** em silêncio um `seq` que já lá esteja — não é
erro, é o mesmo toque outra vez. O contador é único **dentro do assalto**: o assalto seguinte volta
a numerar a partir de 1.

**O placar não é recalculado.** Vem contado pela app, e é o que a app disser. Um árbitro que retire
um toque deixa a contagem dos eventos a não bater certo com o placar — e quem manda é o placar.
Continua a valer a regra do `score`: **nada disto entra no resultado**, que são os dois números do
`POST .../score`.

**Se a app enviar eventos em direto, o `events` do `score` é ignorado.** São os mesmos toques
contados duas vezes, e só a cópia em direto traz contador para se impedir de duplicar. Uma app faz
uma coisa **ou** a outra: em direto (este endpoint) ou em lote no fim (`events` do `score`).

**Cadência sugerida:** enviar assim que o evento acontece; havendo falha, juntar ao lote seguinte em
vez de repetir sozinho. O `throttle` da API é de **60 pedidos por minuto** por dispositivo e é
partilhado com o *polling* da [§5](#5-polling-e-etag) — daí o lote.

**202 Accepted**

```json
{ "accepted": 2 }
```

`accepted` é quantos eram novos. `0` quer dizer que já lá estavam todos — o pedido correu bem.

**Erros:** `401` · `403 poule_scope_mismatch` · `404` · `422 validation_failed` · `422 poule_locked`
· `429 rate_limited`

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

> **Alternativa ao envio em direto, não complemento.** Uma app que use
> [`POST /bouts/{bout}/events`](#post-boutsboutevents) já mandou estes eventos enquanto o assalto
> decorria, e o servidor **ignora** este campo nesse caso — são os mesmos toques contados duas
> vezes. Este campo continua a ser a forma certa para uma app que só saiba do assalto no fim.

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
| `bracket` | int | Tamanho do quadro — `8` num quadro de 8. Constante em todas as rondas. **`0` num quadro sem ronda 1**, de onde o tamanho é derivado: o cliente não desenha nada a partir deste campo sem o verificar |
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

> **Só o quadro principal.** A plataforma tem também quadros de **consolação**, e o
> `EliminationMatch` deste contrato não tem forma de os distinguir do principal: viriam com
> `round`/`position` repetidos e a app desenharia um quadro impossível. Ficam de fora da API e
> arbitram-se na web. Trazê-los implica um campo novo (`bracket_type`) e uma versão MINOR.

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

### `POST /elimination/{match}/events`

Igual ao [`POST /bouts/{bout}/events`](#post-boutsboutevents) — mesmo corpo, mesmo `seq`, mesma
resposta `202`. Um combate a decorrer tem de mostrar o placar a subir tal como um assalto de poule.

Não devolve `422 poule_locked`: o quadro **é** a fase aberta da competição.

**Erros:** `401` · `403 poule_scope_mismatch` · `404` · `422 validation_failed` · `429 rate_limited`

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
`409 match_not_ready` · `422 validation_failed` · `429 rate_limited`

> **Sem `422 poule_locked` aqui**, ao contrário do `score` de poule. Um combate já pontuado é
> travado pela escrita condicional (`409`), e um quadro decidido revoga o token — o pedido seguinte
> apanha `401 poule_complete` antes de chegar a este controlador. Ver [§12](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério).

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
| `1.5.0` | 2026-07-25 | **MINOR, aditivo — a pista passa a ver-se enquanto está a ser arbitrada.** `POST /bouts/{bout}/events` e `POST /elimination/{match}/events`: a app envia o toque, o duplo, o cartão e a prioridade **no momento em que acontecem**, com um contador `seq` por assalto que é a idempotência toda. Até aqui a plataforma só sabia do assalto no fim, e uma poule a meio parecia uma poule que ninguém tinha começado; agora o placar sobe toque a toque no painel do organizador, na gaveta do assalto e na página pública do evento. **Nada disto é obrigatório e nada disto entra no resultado** — quem não enviar continua a funcionar exatamente como antes. Consequência: uma app que envie em direto tem o `events` do `score` **ignorado**, porque são os mesmos toques contados duas vezes. |
| `1.4.2` | 2026-07-25 | **PATCH, redação — a app ligou-se ao servidor a sério pela primeira vez.** Nada mudou no que os dois lados trocam; mudou o que este documento diz sobre isso. (1) [§12](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério) nova, com o levantamento de campo e a lista de arestas. (2) A caixa da [§5](#5-polling-e-etag) sobre o `If-None-Match`: a comparação tem de ser **fraca**, senão o `304` nunca dispara através de um proxy que comprima — é o único ponto que fica por corrigir, e é do servidor. (3) `Bout.scored_at` pode vir `null` com `status: "done"`, em resultados anteriores às colunas de metadados. (4) `EliminationMatch.bracket` pode vir `0` num quadro sem ronda 1. (5) `422 poule_locked` sai da lista de erros do `POST /elimination/{match}/score`, que nunca o devolve. (6) A [§2](#2-transporte-e-cabeçalhos) diz agora que o `POST /connect` não traz `X-Session-Expires-At` — a expiração vem no corpo. |
| `1.4.1` | 2026-07-25 | **PATCH, redação.** A plataforma passou a servir este contrato por inteiro ([§11](#11-estado-da-implementação) reescrita). Duas clarificações, sem impacto no que estava especificado: (1) os endpoints de eliminatória devolvem **só o quadro principal** — os quadros de consolação não são representáveis no `EliminationMatch` e arbitram-se na web; (2) a distinção entre `token_expired`, `token_revoked` e `poule_complete` fica descrita do lado do servidor: um token substituído ou rodado é **apagado**, um token de competição encerrada é **expirado no lugar**, e é isso que permite responder `poule_complete` em vez de "expirou". |
| `1.4.0` | 2026-07-25 | **As decisões que estavam em aberto na `1.3.0`, tomadas.** (1) **Eliminatórias entram no contrato:** `GET /poules/{poule}/elimination`, `GET /tournaments/{tournament}/elimination`, `GET /elimination/{match}`, `POST .../start` e `POST .../score`, mais os objetos `EliminationMatch` e `TournamentSummary`. O `POST /connect` e o `GET /session` ganham `scope` (`poule` \| `tournament`). (2) **O PIN volta a ser de utilização múltipla** — o árbitro que perde a sessão volta a ligar-se sozinho; quem quiser cortar acesso roda o PIN. (3) **O QR passa a levar só os 6 dígitos**; o payload JSON com `base_url` fica especificado como formato reservado, para uma fase futura. (4) **`submission_id` obrigatório no `score`**, substituindo a comparação por token — ver o §4. (5) `Fencer.number` passa a poder ser `null` (na eliminatória o atleta não tem número de folha); `PouleSummary.elimination` diz se há quadro para arbitrar. **Nota de versionamento:** o `submission_id` obrigatório e o `number` *nullable* seriam MAJOR se houvesse alguma app instalada. Não há: nada disto está implementado em nenhum dos lados, e o `/api/v1` ainda não serviu um único pedido em produção. |
| `1.3.0` | 2026-07-25 | **Reconciliação das duas cópias, mais o estado real.** As duas cópias do contrato tinham divergido: a da plataforma levou a revisão `1.0.0` (abaixo) e a da app levou a `1.1.0` e a `1.2.0` — nenhuma das duas conhecia a outra. Esta versão é a **união** das duas, mais a [§11](#11-estado-da-implementação) que descreve o que a plataforma serve hoje e onde é que isso diverge daqui. Uma decisão de nomenclatura pelo meio: o minuto de morte súbita é `sudden_death_seconds` (nome da plataforma), **não** `priority_seconds` (nome que a app tinha proposto) — são o mesmo tempo e nenhum dos dois está implementado, por isso a escolha não parte nada. `410` volta ao catálogo, agora como `competition_finished`, que é o que o servidor realmente devolve. A invalidação do token passou a exigir competição encerrada, não poule completa. |
| `1.2.0` | 2026-07-25 | **MINOR, aditivo** (proposto do lado da app). (1) `GET /poules/{poule}/standings` — a classificação passa a ser calculada pelo servidor, e sai da lista de exclusões do §1. (2) `weapon` opcional em `PouleSummary` e em `GET /bouts/{bout}`. (3) `passivity_seconds` opcional nos mesmos dois sítios — o tempo de FIE t.87 deixa de estar *hardcoded* na app. (4) Redação: `POST /bouts/{bout}/score` diz agora o que `a`/`b` incluem e o que a plataforma não fica a saber. |
| `1.1.0` | 2026-07-25 | **MINOR, aditivo** (proposto do lado da app). `rest_seconds` opcional em `PouleSummary` e em `GET /bouts/{bout}` — descanso entre períodos, que a app cronometra. Irrelevante com `periods: 1`, que é o caso normal em poule; ganha uso quando a app arbitrar eliminatórias, que correm a 3 períodos. |
| `1.0.0` | 2026-07-25 | Revisão do rascunho, antes de qualquer implementação: removido `410 pin_expired` (indistinguível de PIN errado sem guardar o PIN anterior); `X-Session-Expires-At` deixa de ser prometido em `401`; `PouleSummary.ordered` acrescentado, com a regra de estabilidade de `sequence`; `events` opcional no `score`, para estatística; `sudden_death_seconds` acrescentado aos presets, configurável e vindo da API; escrito que a plataforma não implementa regulamento FIE e que em poule não há descanso entre períodos. **Sem alteração de versão: a app não foi lançada e nada está implementado dos dois lados.** |
| `1.0.0` | 2026-07-24 | Versão inicial. Extraída de `docs/app-arbitragem-client-spec.md` §5–§8. Nada implementado ainda. |

---

## 11. Estado da implementação

**Levantado a 2026-07-25 contra o código da plataforma** (branch `test`), depois de o servidor se ter
alinhado pelo contrato. A lista de trabalho que esta secção continha — os pontos A1 a A13, e os D1 a
D13 do `app-arbitragem-todo.md` — está **feita**.

### A. O que a plataforma serve

```
POST   /api/v1/connect
GET    /api/v1/session · DELETE /api/v1/session
GET    /api/v1/poules/{poule}/bouts          ← ETag
GET    /api/v1/poules/{poule}/standings      ← ETag (o mesmo da lista)
GET    /api/v1/bouts/{bout}                  ← leitura pura
POST   /api/v1/bouts/{bout}/start · /events · /score
GET    /api/v1/poules/{poule}/elimination        ← ETag
GET    /api/v1/tournaments/{tournament}/elimination ← ETag
GET    /api/v1/elimination/{match}           ← leitura pura
POST   /api/v1/elimination/{match}/start · /events · /score
```

Ponto a ponto, contra a lista de trabalho anterior:

| # | O que passou a acontecer |
|---|---|
| A1 | **Envelope `{ code, message, errors? }` em todas as respostas de erro** de `/api/*`, por um *renderable* em `bootstrap/app.php`. Os `code` vivem num sítio só — `App\Enums\ApiErrorCode` —, com o estado HTTP e a mensagem pt-PT ao lado. Um erro escrito à mão num controlador é um erro que a app não reconhece, por isso não existem |
| A2 | **`/api/v1` e recursos no plural.** As rotas antigas (`/api/poule/{}`, singular, sem versão) foram **removidas** — nunca serviram produção |
| A3 | **`submission_id` obrigatório** no `score` de assalto e de combate, com as colunas `submission_id` e `scored_by_token_id` gravadas na transação do resultado. Mesma submissão → `200` com o mesmo corpo; submissão diferente sobre um assalto pontuado → `409` com `current` |
| A4 | **`PouleSummary` e `TournamentSummary`** como estão especificados, no `connect`, no `session`, nas listas e no `standings`, com `scope` a dizer qual dos dois vem preenchido |
| A5 | **`POST .../start` nos dois quadros**, e os `GET` de detalhe voltaram a ser leituras puras. Um *prefetch*, um *retry* ou um duplo-toque já não mudam estado |
| A6 | **Envelope `{ poule, bouts[] }` / `{ poule\|tournament, matches[] }` e `ETag`** nas quatro listas |
| A7 | **`X-Session-Expires-At`** em todas as respostas autenticadas, e em nenhum `401` |
| A8 | ***Resources* achatados:** `score_a`/`score_b`, `scored_at`, `scored_by_me`, `id` como string opaca, `number` nulo na eliminatória |
| A9 | **`current` no `409` e corpo completo no `201`**, com `bouts_done`/`bouts_total` (ou `matches_*`) |
| A10 | **PIN inválido → `422 pin_invalid`**, mantendo o `410 competition_finished` |
| A11 | **O PIN deixou de se gastar.** Rodá-lo continua a matar os tokens |
| A12 | **Presets completos:** `weapon`, `rest_seconds`, `sudden_death_seconds` e `passivity_seconds`, na poule e na eliminatória, em colunas novas com os valores FIE por omissão, editáveis no formulário de criação e herdados do torneio para as suas poules |
| A13 | **`GET /poules/{poule}/standings`**, `GET` e `DELETE /session`, `ordered`, `events` e `device_name` — todos implementados |
| A14 | **`POST .../events` nos dois quadros** (contrato `1.5.0`), com o contador `seq` por assalto como chave única e o `insertOrIgnore` que faz do reenvio um não-evento. O `events` do `score` desliga-se quando o assalto já recebeu eventos em direto. Do lado da web, o placar ao vivo entrou no painel do organizador, na gaveta do assalto — que passou a fazer *poll* — e na página pública do evento, por um `GET /event/{poole}/live` que **não** é do `/api/v1` e nunca serve o PIN |

### B. Como o `401` sabe qual dos três é

O [§8](#8-catálogo-de-erros) exige distinguir `token_expired`, `token_revoked` e `poule_complete`, e
um token apagado não consegue dizer qual dos três foi. A regra do servidor:

| O que aconteceu ao token | O que o servidor faz | O que a app recebe |
|---|---|---|
| Outro dispositivo ligou-se, ou o PIN foi rodado | a linha é **apagada** | `401 token_revoked` |
| A hora deslizante esgotou-se | a linha fica, com `expires_at` no passado | `401 token_expired` |
| A competição ficou encerrada | a linha é **expirada no lugar**, não apagada | `401 poule_complete` |

Sem a terceira linha o fim de uma competição chegava à app como "a sessão expirou", que é a única das
três que se corrige a voltar a ligar — e não havia nada a que voltar.

### C. O lado da app — feito a 2026-07-25

O que esta secção listava como em falta está entregue. Fica o registo:

| O que faltava | O que passou a haver |
|---|---|
| `src/api/types.ts` tipado para a `1.0.0`/`1.2.0` | Tipado a partir deste documento: `EliminationMatch`, `TournamentSummary`, `scope`, `submission_id`, os presets todos e o `number` *nullable* |
| O cliente HTTP e os endpoints eram esqueletos | `src/api/client.ts` (cabeçalhos, envelope, *retry* com *backoff*, `ETag`, `X-Session-Expires-At`, *timeout*) e `src/api/endpoints.ts`, uma função por endpoint |
| A fila não guardava o `submission_id` | `src/queue/` — UUID v4 gerado **na confirmação**, persistido com a submissão e repetido em cada tentativa, incluindo depois de uma reconexão |
| Não havia ecrã do quadro | `app/bracket.tsx` e `app/match/[id].tsx`, com o mesmo ecrã de assalto que a poule usa |
| A máquina de estados não conhecia a transição | `phaseFor()` em `src/session/store.ts`: `locked` **com** quadro → quadro; `locked` **sem** quadro → só leitura. Acontece num *poll*, sem pedir código novo |
| A classificação era calculada no cliente | Vem de `GET /poules/{poule}/standings`. O cliente deixou de aplicar critérios de desempate — a §7 é explícita a dizer que não os deve aplicar |
| A morte súbita e a passividade eram constantes no código | `sudden_death_seconds` e `passivity_seconds`, vindos da API como todos os outros tempos |
| `API_CONTRACT_VERSION` em `'1.0.0'` | `'1.4.2'` |

**O que voltou a ficar em aberto deste lado, com a `1.5.0`:** enviar os eventos do assalto em
direto ([`POST /bouts/{bout}/events`](#post-boutsboutevents)). O servidor serve-os e a web mostra-os;
enquanto a app não os enviar, a plataforma continua a saber do assalto só no fim e as páginas
mostram o que sempre mostraram. É a **F7** da `app-arbitragem-client-spec.md` §14, e é aditiva:
não enviar nada deixa a app a funcionar exatamente como está.

### D. O que ficou deliberadamente de fora

| O quê | Porquê |
|---|---|
| Quadros de **consolação** | Não são representáveis no `EliminationMatch` ([§7](#get-poulespouleelimination--get-tournamentstournamentelimination)). Arbitram-se na web |
| `base_url` no QR | Formato reservado do [§9](#9-emparelhamento-qr--pin); o QR continua a levar só os seis dígitos |
| `round_name` | A app não nomeia rondas e o servidor ainda não as nomeia por ela. Entra como MINOR quando fizer falta no ecrã |
| Vitória por prioridade | Não é representável (`a == b` é recusado). Reabrir implica `allow_draw` mais um campo de vencedor, e é **MAJOR** |

---

## 12. Levantamento de campo — a app ligada ao servidor a sério

**2026-07-25.** A app deixou de falar com *fixtures* e passou a falar com a plataforma
(`poule.esgrima.pt.test`, dados reais). Todos os treze endpoints da [§7](#7-endpoints) existem,
respondem, e as formas batem certo com o que este documento diz — o levantamento está fixado em
`src/api/live.test.ts`, que corre contra o servidor e não contra mocks (`npm run test:live`).

**Não falta nenhum endpoint.** Não houve nenhuma área da app à espera de um endpoint que não
exista. O que se segue são as arestas que só aparecem com o servidor a sério do outro lado.

| # | O que se encontrou | Quem corrige | Estado |
|---|---|---|---|
| 1 | **`If-None-Match` comparado por igualdade de string.** Com `Accept-Encoding: gzip` — ou seja, sempre — o proxy enfraquece o `ETag` para `W/"..."` e o `304` deixa de acontecer. Ver a caixa da [§5](#5-polling-e-etag) | **servidor** | Por corrigir. A app mitiga (`strongEtag`), mas a correção é do lado de lá |
| 2 | **`scored_at` pode vir `null` num assalto `done`.** As colunas de metadados do resultado são recentes; resultados registados antes delas continuam sem hora | ambos | **Documentado aqui.** O tipo já era `string \| null`; o que faltava era dizer que o `null` também acontece com `status: "done"`. O cliente não pode assumir que um assalto pontuado traz hora — o ecrã de conflito omite-a quando falta |
| 3 | **`422 poule_locked` está listado no `POST /elimination/{match}/score` e o servidor nunca o devolve.** O controlador não verifica bloqueio: um combate já pontuado é travado pela escrita condicional (`409`), e um quadro decidido revoga o token (`401 poule_complete`) antes de chegar aqui | documento | **Corrigido abaixo:** o erro sai da lista desse endpoint. Não é regressão — o caso está coberto pelos outros dois códigos |
| 4 | **`bracket` vem `0` num quadro sem ronda 1.** O tamanho do quadro é derivado do número de combates da primeira ronda; sem eles a conta dá zero | documento | **Documentado:** o cliente não deve desenhar nada a partir de `bracket` sem o verificar. A app não o usa para nada além de exibição |
| 5 | **`POST /connect` não traz `X-Session-Expires-At`.** É o único endpoint fora do middleware que o acrescenta — e não precisa dele, porque a expiração vem no corpo (`expires_at`) | documento | **Clarificado na [§2](#2-transporte-e-cabeçalhos):** o cabeçalho vale para os endpoints autenticados; no `connect` a fonte é o corpo |
| 6 | **Um pedido sem `Accept: application/json` e sem token devolve `500`, não `401`.** O `Authenticate` do Laravel só evita calcular o destino do *redirect* quando `expectsJson()` é verdadeiro; sem esse cabeçalho chama `route('login')`, que não existe nesta aplicação, e o `RouteNotFoundException` cai no `server_error` do renderer. Reproduzido com `curl` sem `Accept`, com `Accept: */*` e com `Accept: text/html`; com `Accept: application/json` responde `401` como deve | **servidor** | Por corrigir. **A app não é afetada** — o cliente HTTP manda sempre `Accept: application/json` ([§2](#2-transporte-e-cabeçalhos)) —, mas qualquer outro cliente apanha um `500` onde o [§8](#8-catálogo-de-erros) promete um `401`, e o log do servidor enche-se de erros que não são erros |
| 7 | **CORS fechado a todas as origens**, por decisão explícita em `config/cors.php`: um `/connect` aberto ao browser deixaria qualquer página gastar o *rate limit* dos visitantes a adivinhar PINs. Consequência prática: a app **não corre em `expo web`** contra a plataforma | nenhum | **Está certo assim.** Fica escrito porque não é óbvio: verificar a app a olho faz-se em simulador ou dispositivo, não no browser |

### O que ficou provado contra o servidor a sério

- `POST /connect` nos dois âmbitos, com `scope` a decidir o ecrã que a app abre.
- A matriz de idempotência da [§4](#4-idempotência-e-retry), inteira: **201** a gravar, **200** ao
  repetir a mesma submissão, **409** com `current` numa submissão diferente.
- `POST .../start` idempotente, e os `GET` de detalhe a **não** mudar estado.
- O `ETag` a mudar quando um resultado entra — sem isso o *poll* ficava cego.
- `422 validation_failed` num empate, com o `errors` por campo.
- `401` sem `X-Session-Expires-At`, e com um dos três `code` do catálogo.
- Um id de outra competição a responder `404`, como a [§8](#8-catálogo-de-erros) prevê.

---
## Referências

- `docs/app-arbitragem-client-spec.md` — especificação da app (consome este contrato)
- `docs/app-arbitragem-todo.md` — pontos em aberto do lado do servidor (A1, A2 e A3 cruzam com a §11)
- `docs/app-arbitragem-spec.md` — visão de produto e trabalho do lado do servidor
- [Laravel Sanctum — API token authentication](https://laravel.com/docs/12.x/sanctum#api-token-authentication)
