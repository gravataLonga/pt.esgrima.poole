# API de Arbitragem — Contrato

**Versão do contrato: `1.1.0`** · Estado: **proposto** (nada implementado do lado do servidor) · 2026-07-25

Fronteira partilhada entre a **plataforma** (`poole.esgrima.pt`, Laravel 12) e a **app de arbitragem**
(React Native, repositório separado). Este ficheiro é a **única fonte de verdade** do que os dois
lados trocam entre si.

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

Autenticação web (*session-based*, coexiste em paralelo), quadro de eliminatórias, classificações,
gestão de atletas/torneios, cartões e penalizações. Tudo isso é da plataforma web.

---

## 2. Transporte e cabeçalhos

- **HTTPS obrigatório.** O cliente recusa `http://` exceto em desenvolvimento contra *host* local
  ([§9](#9-emparelhamento-qr--pin)).
- **Base URL:** `{base_url}/api/v1`. O `base_url` vem do QR — **não** está *hardcoded* na app.
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

Em **todas as respostas autenticadas**, incluindo erros 4xx:

```http
X-Session-Expires-At: 2026-07-24T18:42:11Z
```

É assim que a app conhece a janela deslizante sem gastar um pedido ([§6](#6-sessão-e-expiração)).

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
| `POST /bouts/{id}/start` | Sim — idempotente por definição |
| `POST /bouts/{id}/score` | Sim, através da fila persistente do cliente |

Nunca há *retry* de 4xx (exceto 408 e 429), e **nunca** em resposta a 409.

### Regra do servidor que torna o *retry* do `score` seguro

> Se o assalto já está `done` **e** foi submetido pelo **mesmo token** **e** com **exatamente o mesmo
> resultado**, o servidor responde **200 OK** (não 409). Só um resultado *diferente*, ou de *outro*
> token, produz **409**.

Sem esta regra perde-se este cenário: a app submete → a rede engasga → o servidor grava → a resposta
não chega → a app repete → **409 "já registado por outra pessoa"**, sobre o registo do próprio autor.
O árbitro conclui que perdeu o resultado. Com a regra, o *retry* converge para o estado correto.

O servidor precisa portanto de guardar, por assalto, **que token** registou o resultado.

> **Alternativa considerada:** cabeçalho `Idempotency-Key` com armazenamento de chave→resposta. É
> mais geral e mais caro. A regra do token resolve o único caso que existe hoje; fica como caminho
> de evolução se aparecerem escritas concorrentes de outro tipo.

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

Em `429`, o cliente respeita `Retry-After` e duplica o intervalo até ao máximo de 60 s.

---

## 6. Sessão e expiração

- O token dura **60 minutos deslizantes**: cada pedido autenticado bem-sucedido renova a janela.
- O token tem **âmbito de uma poule** — só permite ler e pontuar a poule que o emitiu.
- **Uma sessão por poule.** Um `POST /connect` bem-sucedido invalida o token anterior dessa poule; o
  dispositivo anterior recebe `401 token_revoked` no pedido seguinte.
- Quando **todos** os assaltos ficam `done`, o servidor **invalida o token**. A resposta do último
  `score` chega na mesma (201); é o pedido **seguinte** que recebe `401 poule_complete`.
- **Não há refresh de token.** Renovar = gerar um QR/PIN novo na plataforma web.

O cliente lê `X-Session-Expires-At`, avisa o árbitro a menos de 5 minutos do fim e, em `401`, limpa
o token, volta ao ecrã de ligação com a razão explicada e **preserva** as submissões por enviar.

---

## 7. Endpoints

Base: `{base_url}/api/v1`. Todos exigem `Authorization: Bearer`, exceto `POST /connect`.

- `{poule}` — **UUID** da poule (a plataforma expõe poules por UUID, não por id numérico).
- `{bout}` — **id opaco** do assalto.

### Objetos partilhados

**`Fencer`**

```json
{ "id": 41, "number": 1, "name": "Ana Silva", "club": "CE Lisboa" }
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int | Id do atleta dentro da poule |
| `number` | int 1..n | Número na folha de poule — é o que o árbitro chama em voz alta |
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
| `sequence` | int ≥ 1 | Ordem de disputa. O cliente **não reordena**. |
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
  "touch_cap": 5,
  "duration_seconds": 180,
  "periods": 1,
  "rest_seconds": 60,
  "bouts_total": 15,
  "bouts_done": 4,
  "locked": false
}
```

| Campo | Notas |
|---|---|
| `tournament_name` | `null` se a poule for isolada |
| `touch_cap` | Toques que terminam um assalto. **Os presets vêm sempre da API** — nunca *hardcoded* na app. |
| `duration_seconds` | Duração **de um período** |
| `periods` | Nº de períodos. `1` em poule |
| `rest_seconds` | **Opcional.** Descanso entre períodos, em segundos (FIE: 60). Ausente, `null` ou `0` → sem descanso, e a app passa direto ao período seguinte. Irrelevante quando `periods` é `1`. |
| `locked` | `true` → poule fechada porque as eliminatórias foram geradas. Toda a escrita passa a devolver 422. |

---

### `POST /connect`

Troca um PIN por um token com âmbito de uma poule. **Público**, com *rate limit* (5/min por IP, o
mesmo limite que a auth web da plataforma já usa).

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
  "poule": { "...": "PouleSummary" }
}
```

O `token` é guardado no armazenamento seguro do dispositivo. **Nunca** aparece em log, nem em
*crash report*.

**Erros:** `422 pin_invalid` · `410 pin_expired` · `429 pin_throttled` (com `Retry-After`)

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
  "target": 5,
  "duration_seconds": 180,
  "periods": 1,
  "rest_seconds": 60,
  "allow_draw": false,
  "poule_locked": false
}
```

| Campo | Notas |
|---|---|
| `target` | Toques que terminam o assalto. Igual ao `touch_cap` da poule. |
| `rest_seconds` | **Opcional.** O mesmo campo do `PouleSummary`. |
| `allow_draw` | **`false` em poule** — a plataforma rejeita `a == b` com 422. O cliente desativa o botão de submeter enquanto os resultados forem iguais. |
| `poule_locked` | `true` → só leitura |

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `POST /bouts/{bout}/start`

Marca o assalto como `in_progress`. Alimenta o widget "quem joga agora" da web — sem este endpoint,
nenhum assalto sai de `pending`.

**Idempotente:** chamar duas vezes sobre o mesmo assalto devolve 200 nas duas.

O cliente chama-o quando o árbitro **inicia o cronómetro pela primeira vez** neste assalto, em modo
*fire-and-forget*: falhar **não bloqueia** a arbitragem e não é enfileirado. O cronómetro é local; o
`start` só informa a web.

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
{ "a": 5, "b": 3 }
```

| Campo | Regras |
|---|---|
| `a` | inteiro, `0 ≤ a ≤ target`, corresponde a `fencer_a` |
| `b` | inteiro, `0 ≤ b ≤ target`, corresponde a `fencer_b` |
| — | `a != b` — **não há empates em poule** |

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

### `GET /session` *(opcional, recomendado)*

Valida no arranque da app um token guardado, sem escrever nada. Evita abrir uma sessão morta.

**200 OK**

```json
{ "expires_at": "2026-07-24T18:42:11Z", "poule": { "...": "PouleSummary" } }
```

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
| 422 | `pin_invalid` | PIN errado ou inexistente | Erro no campo, mantém o ecrã |
| 410 | `pin_expired` | PIN já rodado na web | "Pede um QR novo" |
| 429 | `pin_throttled` | Demasiadas tentativas | Bloqueia o campo até `Retry-After` |
| 401 | `token_expired` | 60 min sem atividade | Volta ao ecrã de ligar |
| 401 | `token_revoked` | Outro dispositivo ligou-se a esta poule | "Outro dispositivo assumiu esta poule" |
| 401 | `poule_complete` | Todos os assaltos `done` | Ecrã de poule completa — **não é erro** |
| 403 | `poule_scope_mismatch` | Token de outra poule | Volta a ligar; sinaliza *bug* |
| 404 | `not_found` | Assalto/poule inexistente (ex.: atleta removido) | *Refetch* da lista |
| 409 | `bout_already_scored` | Já registado | Mostra `current`, não repete |
| 422 | `poule_locked` | Eliminatórias geradas | Modo leitura, banner permanente |
| 422 | `validation_failed` | Corpo inválido | Mostra `errors`; sinaliza *bug do cliente* |
| 429 | `rate_limited` | Excesso de pedidos | *Backoff*, respeita `Retry-After` |
| 5xx | `server_error` | Falha do servidor | *Retry* com *backoff*; submissões vão para a fila |
| — | *(sem resposta)* | Rede indisponível | Modo offline |

---

## 9. Emparelhamento QR / PIN

### PIN

- **6 dígitos** (`000000`–`999999`), gerado por poule na plataforma web.
- **Único entre os PINs ativos.**
- Rodável a qualquer momento (botão "gerar novo QR"). Rodar **invalida o PIN anterior**, mas **não**
  o token já emitido.
- Não é de uso único: vale até ser rodado ou até a poule ficar completa.

### Payload do QR

O QR carrega a URL base **e** o PIN, para funcionar em *self-hosting*, *staging* e desenvolvimento
sem recompilar a app:

```json
{ "v": 1, "base_url": "https://poole.esgrima.pt", "pin": "483920" }
```

| Campo | Notas |
|---|---|
| `v` | Versão do payload. O cliente rejeita uma `v` que não conheça com mensagem clara: *"Este QR foi gerado por uma versão mais recente da plataforma. Atualiza a app."* |
| `base_url` | **Sem barra final.** Tem de ser `https://`, exceto em desenvolvimento contra `localhost`, `127.0.0.1`, `10.*` ou `192.168.*`. |
| `pin` | 6 dígitos |

**Fallbacks de leitura do cliente**, por ordem:

1. JSON acima → usa `base_url` + `pin`.
2. String de 6 dígitos → usa o `base_url` da última sessão; se não houver, pede-o.
3. Qualquer outra coisa → *"QR não reconhecido."*

**Entrada manual:** campo de 6 dígitos, mais um campo de servidor pré-preenchido com o último usado
(recolhido num "avançado", para não estorvar o caso normal).

---

## 10. Changelog

| Versão | Data | Alterações |
|---|---|---|
| `1.1.0` | 2026-07-25 | **MINOR, aditivo.** `rest_seconds` opcional em `PouleSummary` e em `GET /bouts/{bout}` — descanso entre períodos, que a app cronometra. Um servidor em `1.0.0` continua compatível: sem o campo, a app não oferece descanso. |
| `1.0.0` | 2026-07-24 | Versão inicial. Extraída de `docs/app-arbitragem-client-spec.md` §5–§8. Nada implementado ainda. |

---

## Referências

- `docs/app-arbitragem-client-spec.md` — especificação da app (consome este contrato)
- `docs/app-arbitragem-spec.md` — visão de produto e trabalho do lado do servidor
- [Laravel Sanctum — API token authentication](https://laravel.com/docs/12.x/sanctum#api-token-authentication)
