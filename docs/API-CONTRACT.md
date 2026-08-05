# API de Arbitragem — Contrato

**Versão do contrato: `2.3.0`** · Estado: **servidor feito, app por fazer** · 2026-08-05

Fronteira partilhada entre a **plataforma** (`poole.esgrima.pt`, Laravel 12) e a **app de arbitragem**
(React Native, repositório separado). Este ficheiro é a **única fonte de verdade** do que os dois
lados trocam entre si.

> 🆕 **`2.3.0` — o `start` deixa de ser uma porta de sentido único.** MINOR **aditivo**: um endpoint
> novo, nenhum campo alterado, nenhum `type` novo. ⚠️ **Mas o defeito só desaparece quando a app
> chamar o endpoint** — é a app que sabe que o árbitro saiu do assalto, e o servidor não tem como o
> adivinhar. Ver [§11 G](#g-a-230-do-lado-da-app--por-fazer).
>
> **O que estava mal.** Um árbitro abre um assalto, põe o cronómetro a andar, vê que se enganou na
> linha da folha e volta à lista para abrir o certo. Ninguém dizia nada à plataforma: o assalto
> errado ficava `in_progress` **para sempre**, com os toques do arranque falso agarrados a ele. Do
> lado de fora a poule aparecia em duas pistas ao mesmo tempo, com dois placares a sério na página
> pública; na app de todos os outros árbitros da mesma folha apareciam dois assaltos a decorrer. E
> era do mesmo árbitro. Antes da [`2.2.0`](#versionamento) isto não se via, porque o `start`
> despromovia os outros assaltos e tapava o problema com outro pior.
>
> **O que muda:** `DELETE /bouts/{bout}/start` e `DELETE /elimination/{match}/start`. O assalto volta
> a `pending`, os eventos em direto dessa tentativa **são apagados** e fica no registo do organizador
> uma linha `abandoned` a dizer quantos toques se descartaram. O `DELETE /session` faz o mesmo, por
> si, ao que este dispositivo tenha deixado aberto.
>
> **Só liberta quem abriu.** A plataforma passa a guardar que dispositivo chamou o `start`, e um
> árbitro nunca tira o assalto ao da pista ao lado — que é exatamente o que a `2.2.0` deixou de
> poder assumir.

> ✅ **`2.2.0` — um código segura tantos dispositivos quantos os que o lerem.** MINOR. **Nenhum campo
> muda de forma e a app não muda uma linha**; o que muda é o comportamento por trás de dois pedidos
> que ela já faz.
>
> Uma poule atrasada é levada a uma segunda pista por um segundo árbitro, com a folha e o código que
> já lá estavam. Até aqui a plataforma respondia a isso das duas piores maneiras: o segundo `connect`
> **tirava a sessão ao primeiro**, e o segundo `start` **despromovia o assalto do primeiro** — que
> reaparecia na app dele como "por disputar" a meio de ser arbitrado. Passa a haver **N dispositivos
> agarrados ao mesmo PIN** e **N assaltos em curso na mesma poule**.
>
> **Não há repartição, atribuição nem reserva**, e não é esquecimento: os esgrimistas estão
> fisicamente num sítio só, portanto dois árbitros não podem estar a disputar o mesmo assalto. A
> submissão em duplicado já estava tratada desde a `1.0.0` — primeiro a submeter leva o assalto, o
> segundo apanha `409` com o resultado atual, e o `Refused` fica no registo do organizador.
> Ver [§11 A17](#a-o-que-a-plataforma-serve) e [§6](#6-sessão-e-expiração).

> ✅ **`2.1.0` — o assalto passa a ter horas, e não só cronómetro.** MINOR **aditivo**, e **os dois
> lados já lá estão** (2026-07-26): a plataforma aceita-o e a app emite-o. Uma app na `2.0.0`
> continua correta contra este servidor sem trocar uma linha, e uma app na `2.1.0` continua correta
> contra um servidor anterior — que é o que "aditivo" quer dizer, e o [§11 E](#e-a-210--feita-dos-dois-lados)
> diz como.
>
> Até aqui a linha temporal dizia *em que altura do período* caiu um toque e mais nada. Não dizia a
> que horas o combate começou, a que horas se entrou no terceiro período, a que horas o tempo voltou
> a correr, nem a que horas se foi a morte súbita — e sem isso um assalto não se reconstitui, só se
> resume. A `2.1.0` acrescenta **oito tipos de evento** para os marcos do combate e **quatro campos**
> a todos eles: a hora de parede (`at`), o tempo desde o início do combate (`elapsed_ms`), o tempo
> que faltava da fase (`remaining_ms`) e a fase em que se estava (`phase`). Tudo opcional.
> Ver [Eventos do assalto](#eventos-do-assalto--o-vocabulário-partilhado).

> ✅ **`2.0.0` foi *breaking*, e os dois lados já lá estão.** O código deixou de ser da competição e
> passou a ser **da pista**: uma poule continua a ter o seu, e **cada combate de eliminatória passa
> a ter um só dele**. O código de torneio deixou de existir, as duas listas de quadro saíram da API,
> e o `scope` da sessão passou a ser `poule` \| `match`.
>
> A plataforma serve-o desde 2026-07-25 e **a app migrou no mesmo dia** — o ponto a ponto do que
> mudou do lado dela está em [§11 C](#c-o-lado-da-app--feito). Excecionalmente **não houve
> `/api/v2`**: não havia nenhuma app instalada e o `/api/v1` nunca tinha servido produção, portanto
> não havia nada com que coexistir — a regra do [§1](#versionamento) mantém-se para o dia em que
> houver.
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

O **combate de eliminatória** está coberto desde `1.4.0` e passou a ser arbitrado **um a um** em
`2.0.0` ([§7](#eliminatórias)): a app abre o combate cujo código lhe deram, no mesmo ecrã de assalto
que usa na poule. O que continua fora é **gerar** o quadro, semear atletas e decidir emparelhamentos
— isso é da plataforma web; a app regista resultados no que ela produziu.

O **quadro como desenho** saiu da API em `2.0.0`. Uma sessão alcança um combate e não os outros, por
isso não há lista de quadro para lhe dar: quem quiser ver o quadro inteiro vê-o na web, que é onde
ele é desenhado, semeado e corrigido.

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
>
> **E quer dizer *este dispositivo*, não *esta arbitragem*** (`2.2.0`). Com dois árbitros no mesmo
> código, o assalto que o primeiro registou chega ao segundo com `scored_by_me: false`, que é
> literalmente verdade e continua a ser o que o ecrã de lista quer saber. Quem precisa de saber quem
> arbitrou o quê é o organizador, e isso lê-se no registo da poule, não aqui.

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

O mesmo vale, com o mesmo formato, para `GET /poules/{poule}/standings`, que partilha o `ETag` da
lista de assaltos.

**Não há `ETag` do lado da eliminatória**, porque não há lista: uma sessão de combate tem um objeto
só, e relê-lo é um pedido pequeno. A cadência ali é a do ecrã de assalto — pausada com o cronómetro a
correr, 30 s com ele parado.

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
- O token tem **âmbito de uma pista**, e a pista é de um de dois tipos:
  - `scope: "poule"` — os assaltos dessa poule e a classificação dela. Mais nada.
  - `scope: "match"` — **um** combate de eliminatória, seja ele do quadro de uma poule ou do quadro
    de um torneio. Não alcança o combate da pista ao lado, nem a poule de onde os atletas vieram.
- **Tantas sessões quantos os dispositivos que lerem o código** (`2.2.0`). Um `POST /connect`
  bem-sucedido **acrescenta** uma sessão em vez de substituir a anterior: uma poule atrasada é levada
  a uma segunda pista por um segundo árbitro, com a folha e o código que já lá estavam, e tirar a
  sessão ao primeiro era responder ao pavilhão com um erro. Dois árbitros em dois combates do mesmo
  quadro continuam a não se pisar — é para isso que o código desceu ao combate na `2.0.0`.
  - **Não há repartição, atribuição nem reserva.** Os esgrimistas estão fisicamente num sítio só, e
    o que resta — a submissão em duplicado — está tratado desde a `1.0.0`: primeiro a submeter leva o
    assalto, o segundo recebe `409 bout_already_scored` com o resultado atual.
  - **O que corta acesso é rodar o código**, e corta-o a **todos** os dispositivos de uma vez. É o
    preço de partilharem um código, e é o comportamento certo: quem roda quer cortar à poule inteira.
- O servidor **invalida o token quando não há mais nada a fazer naquela pista**. A resposta do último
  `score` chega na mesma (201); é o pedido **seguinte** que recebe `401 poule_complete`.
  - Num combate: assim que o resultado é registado. A ronda seguinte é outro combate, com código
    próprio.
  - Numa poule: quando o cartão está todo disputado **e** fechado por um quadro.

  > **Não basta a poule estar completa.** Nos minutos a seguir ao último assalto o árbitro está
  > normalmente a ler a classificação do cartão que acabou de arbitrar, no telemóvel com que o
  > arbitrou. Cortá-lo aí não ganha nada — a poule completa já só se lê. É o quadro que a encerra,
  > porque é para o quadro que a competição vai, e o quadro corre em códigos que este não alcança.

- **Não há refresh de token.** Renovar = gerar um QR/PIN novo na plataforma web.

O cliente lê `X-Session-Expires-At`, avisa o árbitro a menos de 5 minutos do fim e, em `401`, limpa
o token, volta ao ecrã de ligação com a razão explicada e **preserva** as submissões por enviar.

---

## 7. Endpoints

Base: `{base_url}/api/v1`. Todos exigem `Authorization: Bearer`, exceto `POST /connect`.

- `{poule}` — **UUID** da poule (a plataforma expõe poules por UUID, não por id numérico).
- `{bout}` — **id opaco** do assalto de poule.
- `{match}` — **id opaco** do combate de eliminatória.

| Endpoint | Âmbito que o alcança |
|---|---|
| `POST /connect` | público |
| `GET /poules/{poule}/bouts` · `/standings` | `poule` |
| `GET /bouts/{bout}` · `POST .../start` · `DELETE .../start` · `POST .../events` · `.../score` | `poule` |
| `GET /elimination/{match}` · `POST .../start` · `DELETE .../start` · `POST .../events` · `.../score` | `match`, e só o combate do próprio código |
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
| `elimination` | `null` enquanto não houver quadro. Presente → o progresso do quadro **para onde estes atletas foram**: o da própria poule quando ela corre sozinha, o do torneio quando ela é uma pool de várias. **Informativo, não navegável** — esta sessão não o alcança. |

> **`locked: true` quer dizer que a competição passou para o quadro**, e o quadro corre em códigos
> que este token não alcança: um por combate ([Eliminatórias](#eliminatórias)). A app mostra a poule
> em leitura e diz onde a competição foi — com o `elimination` ao lado, tem o número para o dizer.
>
> **Este campo é a correção de um buraco concreto.** Uma pool de torneio fecha no instante em que o
> quadro do torneio é desenhado, e nunca alcançou esse quadro. Enquanto `elimination` só olhava para
> o quadro *da própria poule*, a app recebia `locked: true` com `elimination: null` — cartão fechado,
> nada do outro lado, nenhuma razão dada — e ficava num ecrã que se lia como "isto acabou", sem
> deixar prosseguir nem registar. É o mesmo buraco, do lado do servidor, que o `410` do
> [`POST /connect`](#post-connect) fecha com uma frase em vez de com um silêncio.

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

**`MatchDetail`**

O que uma sessão de âmbito `match` vê, que é o combate inteiro e mais nada. É a mesma forma que
[`GET /elimination/{match}`](#get-eliminationmatch) devolve, e vem já no `POST /connect` — o árbitro
escreve seis dígitos e o combate abre, sem um segundo pedido pelo meio.

Não há sumário de torneio por cima disto. Um torneio não é arbitrado como um todo: as suas poules
têm código próprio e cada combate do quadro tem o seu, portanto não sobra nada para um objeto de
torneio descrever. O nome do evento vem no `competition_name` do próprio combate, que é a única
coisa que o árbitro precisa de ler para saber onde está.

---

### Eventos do assalto — o vocabulário partilhado

Um evento é **uma coisa que aconteceu na pista, no instante em que aconteceu**. O mesmo objeto serve
os quatro sítios que o transportam, e por isso é definido aqui uma vez só:

| Onde | Diferença |
|---|---|
| [`POST /bouts/{bout}/events`](#post-boutsboutevents) | leva `seq` — enviado em direto |
| [`POST /elimination/{match}/events`](#post-eliminationmatchevents) | idem |
| `events` do [`POST /bouts/{bout}/score`](#linha-temporal-do-assalto--events-opcional) | sem `seq` — enviado em lote no fim |
| `events` do [`POST /elimination/{match}/score`](#post-eliminationmatchscore) | idem |

**Descritivos, nunca autoritários.** O resultado é o `a`/`b` do `score` e mais nada. O servidor
guarda os eventos como vieram, **não** recalcula o resultado a partir deles e **não** rejeita uma
submissão porque as duas coisas não batem certo — rejeitar faria uma submissão em fila falhar para
sempre sobre um assalto que o árbitro já deu por resolvido.

#### Os tipos

Conjunto **fechado**. Um `type` fora desta lista devolve `422 validation_failed`.

**Grupo A — o que acontece em pista.** Existiam desde a `1.5.0`.

| `type` | `side` | O que é |
|---|---|---|
| `touch` | **sim** | Um toque atribuído a um atleta |
| `double` | não | Toque duplo — vale aos dois |
| `card_yellow` | **sim** | Advertência |
| `card_red` | **sim** | Cartão vermelho. Em regra FIE concede um toque, que o `score_a`/`score_b` já reflete |
| `card_black` | **sim** | Exclusão |
| `priority` | **sim** | A prioridade da morte súbita, **e a quem calhou** (FIE t.41). É este evento que responde a "quem ganhava se ninguém tocasse" |

**Grupo B — os marcos do combate.** Novos na `2.1.0`. Nenhum deles leva `side`: não são de um atleta,
são do assalto.

| `type` | Quando a app o emite |
|---|---|
| `bout_start` | O combate começou — o **primeiro** arranque do cronómetro. É o `at` deste evento que responde a "a que horas começou", e é dele que todos os `elapsed_ms` se contam |
| `period_start` | Entrou-se num período. **Também no primeiro**, a seguir ao `bout_start` — é o que faz com que "a que horas entrou no terceiro período" se responda sempre da mesma maneira, e não de duas |
| `period_end` | O período acabou. Já existia na `1.5.0`, com o mesmo significado |
| `rest_start` | Entrou-se no descanso entre períodos, por o período ter esgotado **ou** por decisão do árbitro a meio dele. O `remaining_ms` diz qual dos dois foi |
| `rest_end` | Saiu-se do descanso, esgotado ou dispensado. O `remaining_ms` diz quanto se dispensou |
| `sudden_death_start` | Entrou-se na morte súbita. Vem **antes** do `priority`, que é o sorteio |
| `clock_start` | O tempo começou a correr. Emitido a cada arranque, não só no primeiro |
| `clock_stop` | O tempo parou — o "halt". Emitido a cada paragem |
| `bout_end` | O combate acabou. Leva o **resultado final** em `score_a`/`score_b` |

> **Porquê `clock_stop` se ninguém o pediu.** Porque um `clock_start` sozinho não responde à pergunta
> que o justifica. Saber a que horas o tempo voltou a correr no terceiro período só vale se também se
> souber quando parou — sem o par, um combate de três minutos que demorou vinte não se distingue de
> um que demorou quatro, e é precisamente essa diferença que uma reclamação discute. São o mesmo
> evento visto dos dois lados e entram juntos.

> **`period_start` no primeiro período é redundante e entra na mesma.** Um leitor que queira as horas
> de cada período não devia ter de escrever "o primeiro é o `bout_start`, os outros são o
> `period_start`". Um caso especial numa linha temporal é um caso especial em todo o código que a
> leia.

#### Os campos

```json
{
  "seq": 14,
  "type": "touch",
  "side": "a",
  "phase": "period",
  "period": 2,
  "at_ms": 29400,
  "elapsed_ms": 214800,
  "remaining_ms": 150600,
  "at": "2026-07-26T14:22:31.412Z",
  "score_a": 7,
  "score_b": 5
}
```

| Campo | Tipo | Desde | Notas |
|---|---|---|---|
| `seq` | int ≥ 1 | `1.5.0` | **Só no envio em direto**, e obrigatório aí. Contador do próprio assalto, a partir de 1. É a idempotência toda — ver [`POST .../events`](#post-boutsboutevents). Ausente no lote do `score`, que não o tem nem precisa |
| `type` | string | `1.5.0` | Do conjunto fechado acima |
| `side` | `"a"` \| `"b"` \| ausente | `1.5.0` | O atleta a que o evento diz respeito. Ausente sempre que não se aplica — em `double` e em todo o **grupo B** |
| `period` | int ≥ 1 | `1.5.0` | **Obrigatório.** O período a que o evento pertence. A morte súbita é `periods + 1`. Um evento de descanso leva o período que **acabou de terminar** — o descanso não tem número próprio |
| `at_ms` | int ≥ 0 | `1.5.0` | **Obrigatório.** Milissegundos decorridos **dentro da fase**, pelo cronómetro local. Não é hora de parede |
| `phase` | `"period"` \| `"rest"` \| `"sudden_death"` | **`2.1.0`** | Opcional. Que segmento o `at_ms` e o `remaining_ms` estão a medir. Ausente → `sudden_death` se `period > periods`, `period` nos outros casos |
| `elapsed_ms` | int ≥ 0 | **`2.1.0`** | Opcional. Milissegundos desde o `bout_start`, **de parede**: contam os descansos, as paragens e as discussões. É o "aos 29 s do combate" |
| `remaining_ms` | int ≥ 0 | **`2.1.0`** | Opcional. Milissegundos que faltavam **da fase em curso** no instante do evento |
| `at` | string \| ausente | **`2.1.0`** | Opcional. ISO-8601 **UTC**, com milissegundos. A hora de parede em que o evento aconteceu, pelo relógio do dispositivo |
| `score_a`, `score_b` | int ≥ 0 | `1.5.0` em direto, **`2.1.0`** em lote | Opcionais. O placar **depois** do evento. Vem contado pela app e **não** é recalculado |

> **`at_ms` e `elapsed_ms` respondem a duas perguntas diferentes, e as duas fazem falta.** O `at_ms`
> é tempo de esgrima: "o toque caiu a 29 s do fim do segundo período" é o que decide se um assalto foi
> ganho no último segundo. O `elapsed_ms` é tempo de relógio: "o combate ia em 3 min 34 s" é o que
> diz a um organizador que a pista está atrasada. O primeiro pára quando o árbitro dá halt; o segundo
> nunca pára. Nenhum se deriva do outro sem reconstruir todas as paragens.

> **O `remaining_ms` é o que responde ao descanso.** Um `rest_start` com `remaining_ms: 0` é um
> descanso que veio de o período ter esgotado; um `rest_start` com `remaining_ms: 85000` é o árbitro
> a parar o combate com um minuto e meio por esgrimir — material partido, assistência médica, um
> atleta fora da pista. E um `rest_end` com `remaining_ms: 36000` é um minuto de descanso dispensado
> aos 24 s. A mesma pergunta em todos os eventos, com um campo só e sem casos especiais.

```json
{ "type": "rest_start", "period": 1, "phase": "period", "at_ms": 95000,  "remaining_ms": 85000 }
{ "type": "rest_end",   "period": 1, "phase": "rest",   "at_ms": 24000,  "remaining_ms": 36000 }
```

#### O `at` é o relógio do telemóvel, e o contrato diz isso em vez de fingir que não

O `at` vem do dispositivo do árbitro, e um dispositivo pode ter a hora errada. O servidor:

- **guarda-o como veio.** Não o corrige, não o rejeita por estar no futuro, não o compara com nada;
- **continua a guardar o seu próprio `created_at`**, que é a hora a que o evento *chegou* — e essa é
  do servidor, não do telemóvel;
- **mostra o `at` quando existe e o `created_at` quando não existe.** Um evento que passou dez
  minutos numa fila de rede tem um `created_at` que não diz nada sobre quando aconteceu; é para isso
  que o `at` serve.

Não há sincronização de relógio neste contrato, e não vai haver: custaria uma troca de horas em todos
os pedidos para corrigir um desvio que, na prática, é o do telemóvel de quem está a arbitrar.
**Nenhuma decisão do servidor depende do `at`** — nem validação, nem ordenação, nem resultado. Ordena-se
pelo `seq` dentro do assalto, que é o único relógio de que a plataforma precisa.

#### Um combate inteiro, do princípio ao fim

Poule a 5 toques, um período de 3 min. O árbitro chama, corre o tempo, cai um toque aos 29 s:

```json
{ "seq": 1, "type": "bout_start",   "period": 1, "at_ms": 0,     "elapsed_ms": 0,     "remaining_ms": 180000, "at": "2026-07-26T14:18:02.000Z", "score_a": 0, "score_b": 0 }
{ "seq": 2, "type": "period_start", "period": 1, "at_ms": 0,     "elapsed_ms": 0,     "remaining_ms": 180000, "at": "2026-07-26T14:18:02.000Z", "score_a": 0, "score_b": 0 }
{ "seq": 3, "type": "clock_start",  "period": 1, "at_ms": 0,     "elapsed_ms": 4000,  "remaining_ms": 180000, "at": "2026-07-26T14:18:06.000Z" }
{ "seq": 4, "type": "clock_stop",   "period": 1, "at_ms": 29000, "elapsed_ms": 33000, "remaining_ms": 151000, "at": "2026-07-26T14:18:35.000Z" }
{ "seq": 5, "type": "touch",        "period": 1, "at_ms": 29000, "elapsed_ms": 33400, "remaining_ms": 151000, "at": "2026-07-26T14:18:35.400Z", "side": "a", "score_a": 1, "score_b": 0 }
```

E o fim de um combate de quadro que foi a morte súbita, empatado a 14:

```json
{ "seq": 61, "type": "period_end",         "period": 3, "at_ms": 180000, "remaining_ms": 0,     "at": "2026-07-26T14:41:12.000Z", "score_a": 14, "score_b": 14 }
{ "seq": 62, "type": "sudden_death_start", "period": 4, "phase": "sudden_death", "at_ms": 0, "remaining_ms": 60000, "at": "2026-07-26T14:41:20.000Z", "score_a": 14, "score_b": 14 }
{ "seq": 63, "type": "priority",           "period": 4, "phase": "sudden_death", "at_ms": 0, "remaining_ms": 60000, "at": "2026-07-26T14:41:24.000Z", "side": "b" }
{ "seq": 64, "type": "touch",              "period": 4, "phase": "sudden_death", "at_ms": 41200, "remaining_ms": 18800, "at": "2026-07-26T14:42:09.000Z", "side": "a", "score_a": 15, "score_b": 14 }
{ "seq": 65, "type": "bout_end",           "period": 4, "phase": "sudden_death", "at_ms": 41200, "remaining_ms": 18800, "at": "2026-07-26T14:42:10.000Z", "score_a": 15, "score_b": 14 }
```

**O `bout_end` não substitui o `score`.** O que fica registado como resultado continua a ser o `a`/`b`
do `POST .../score`, com o `submission_id` e a matriz de idempotência da [§4](#4-idempotência-e-retry).
O `bout_end` é a última linha da história, não o registo dela — e um combate cujo `score` nunca chegou
por a rede ter caído tem `bout_end` sem resultado, que é exatamente a situação que interessa ver.

#### Tolerância — o que uma app pode não enviar

**Nada disto é obrigatório.** Os únicos campos que o são já o eram: `type`, `period`, `at_ms`, e o
`seq` no envio em direto.

- Uma app que não emita **nenhum** evento do grupo B fica com a linha temporal da `1.5.0`, e é
  correta.
- Uma app que não preencha `at`, `elapsed_ms`, `remaining_ms` ou `phase` continua a ser aceite. A
  plataforma mostra o que tem e omite o resto — não inventa, e não recusa.
- O servidor **não verifica coerência** entre eventos: não exige um `period_start` antes de um
  `touch`, não exige que os `elapsed_ms` cresçam, não exige um `bout_end` no fim. Uma linha temporal
  com buracos é o que uma rede de pavilhão produz, e recusá-la seria perder também o que chegou.


### `POST /connect`

Troca um PIN por um token com âmbito de uma pista — uma poule ou um combate de eliminatória,
consoante o código que foi gerado. **Público**, com *rate limit* (5/min por IP, o mesmo limite que a
auth web da plataforma já usa).

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
  "match": null
}
```

| Campo | Notas |
|---|---|
| `scope` | `poule` \| `match`. **Determina o resto da resposta e o que a sessão alcança.** |
| `poule` | `PouleSummary` com `scope: "poule"`; `null` com `scope: "match"` |
| `match` | `MatchDetail` com `scope: "match"`; `null` com `scope: "poule"` |

O árbitro escreve seis dígitos e não sabe — nem tem de saber — que tipo de código lhe deram. É o
`scope` que diz à app se abre a lista de assaltos ou vai direta ao combate que lhe calhou.

O `token` é guardado no armazenamento seguro do dispositivo. **Nunca** aparece em log, nem em
*crash report*.

**Erros:** `422 pin_invalid` · `410 competition_finished` · `429 pin_throttled` (com `Retry-After`)

> Um PIN rodado na web devolve `422 pin_invalid`, igual a um PIN errado. O servidor não guarda o PIN
> anterior, por isso não consegue distinguir os dois casos — e guardá-lo custaria uma coluna para uma
> mensagem de erro ligeiramente melhor.

> **O `message` do `410` diz para onde ir**, e é a única `message` deste contrato que muda com o
> caso. Um árbitro a quem dizem "esta competição já terminou" no meio de um evento que claramente não
> terminou fica parado à espera do organizador. Por isso:
>
> | O código era de | O que a app mostra |
> |---|---|
> | uma poule fechada por um quadro | *"A poule terminou. Cada combate das eliminatórias tem o seu próprio código — peça o da sua pista."* |
> | uma poule toda disputada, ainda sem quadro | *"Esta poule já foi toda disputada."* |
> | um combate já arbitrado | *"Este combate já foi arbitrado."* |
>
> O `code` é sempre `competition_finished` e é sobre ele que a app decide ([§3](#3-envelope-de-erro)).
> O texto é para ler, e o cliente mostra-o tal como vem — não o reconstrói.

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

### `DELETE /bouts/{bout}/start`

**Novo na `2.3.0`.** O árbitro saiu deste assalto **sem resultado**. O assalto volta a `pending` e a
pista fica livre.

**Porque existe.** Abrir a linha errada da folha é o erro mais comum que há a arbitrar, e até aqui
não tinha volta: o assalto ficava a decorrer para sempre, na página pública, no painel do
organizador e na app de todos os outros árbitros da mesma folha. É a outra metade do `start`, e sem
ela o `start` é uma porta de sentido único.

**O que acontece do lado de lá:**

1. o `status` volta a `pending`;
2. **os eventos em direto deste assalto são apagados** — os do `POST .../events`, os que levam `seq`;
3. fica no registo do organizador uma linha **`abandoned`**, com quantos toques se descartaram.

> **Porque é que os toques são apagados e não guardados.** São o registo de um assalto que não
> aconteceu, e mantê-los custa duas coisas que não são cosméticas. **(1)** O placar ao vivo é o
> evento mais recente que traz placar, portanto a tentativa seguinte abria a mostrar o resultado da
> abandonada antes do primeiro toque. **(2)** O `seq` é único por assalto e a app numera **de 1**;
> as linhas abandonadas ocupariam os números 1..N e o `insertOrIgnore` engolia **em silêncio** a
> linha temporal inteira da tentativa seguinte. O que sobrevive é a linha `abandoned`, e chega: o
> painel do organizador nunca mostrou a linha temporal.

**Quem pode.** Só o dispositivo que chamou o `start`. Um assalto aberto por outro árbitro, ou já
`done`, fica como está — e **nos dois casos a resposta é a mesma**, porque não há nada que a app
faça de diferente em nenhum deles.

**Request:** sem corpo. **204 No Content** — sempre, mesmo quando não havia nada para libertar.

*Fire-and-forget* como o `start`: falhar não bloqueia nada, e não se enfileira. A tentativa seguinte
corrige o estado por si.

**Erros:** `401` · `403` · `404`

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
    { "seq": 1, "type": "bout_start",            "period": 1, "at_ms": 0,     "at": "2026-07-26T14:18:02.000Z" },
    { "seq": 2, "type": "touch",  "side": "a",   "period": 1, "at_ms": 12400, "elapsed_ms": 16400, "remaining_ms": 167600, "score_a": 1, "score_b": 0 },
    { "seq": 3, "type": "double",                "period": 1, "at_ms": 30100, "elapsed_ms": 41000, "remaining_ms": 149900, "score_a": 2, "score_b": 1 }
  ]
}
```

**A forma de cada evento é a de [Eventos do assalto](#eventos-do-assalto--o-vocabulário-partilhado)**,
com o `seq` obrigatório. Só o invólucro é próprio deste endpoint:

| Campo | Tipo | Notas |
|---|---|---|
| `events` | array | 1 a **50** por pedido. Um lote, não um evento: um telemóvel que perdeu a rede trinta segundos tem três toques para recuperar e não deve precisar de três idas ao servidor. |

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

### Linha temporal por ler — o `GET` que não existe

**Os eventos só se escrevem.** Não há endpoint que os devolva: quem envia não os pode reler, e uma
app instalada de novo a meio de um assalto não tem como saber o que já lá está.

Do lado da app isto **não é um bloqueio**, e a `2.0.0` não o trata como tal: o motor do assalto
guarda a linha temporal em memória enquanto o assalto dura (`engine.log`), e é ela que o ecrã mostra
quando o árbitro quer confirmar a que minuto caiu um cartão. Chega para o caso real — o árbitro
pergunta pelo assalto que está a arbitrar, não por um de ontem.

O que a ausência custa, custa em três sítios:

- **App reinstalada ou dispositivo trocado a meio.** O placar recupera-se do `GET /bouts/{bout}`;
  o que se passou, não. A app abre com a linha temporal vazia e um placar certo.
- **Segundo dispositivo na mesma pista.** Vê o resultado, não vê o caminho até ele.
- **Reclamação depois de registado.** Os eventos estão na base de dados da plataforma e veem-se na
  web; a app, que os enviou, é o único sítio onde não se leem.

**Se vier a fazer falta, entra como MINOR aditivo** — nada do que existe muda de forma:

```
GET /bouts/{bout}/events        → 200 { "events": [ … ], "count": n }
GET /elimination/{match}/events → idem
```

Devolveria os mesmos objetos que o `POST` aceita — os de
[Eventos do assalto](#eventos-do-assalto--o-vocabulário-partilhado) —, por ordem de `seq`, com o mesmo
alcance de sessão do resto do [§7](#7-endpoints): o token da pista alcança **o seu** assalto e mais
nenhum. Paginação não faz falta: o próprio `POST` já limita o assalto a **300 eventos**.

Enquanto não existir, a regra é a que está escrita acima: **o que a app não guardou, perdeu-se para
a app** — e nunca para a plataforma, que é quem tem de os ter.

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
    { "type": "bout_start",               "period": 1, "at_ms": 0,     "at": "2026-07-26T14:18:02.000Z" },
    { "type": "touch",       "side": "a", "period": 1, "at_ms": 12400, "elapsed_ms": 16400 },
    { "type": "double",                   "period": 1, "at_ms": 30100, "elapsed_ms": 41000 },
    { "type": "card_yellow", "side": "b", "period": 1, "at_ms": 45000, "elapsed_ms": 58200 },
    { "type": "priority",    "side": "a", "period": 2, "at_ms": 0,     "phase": "sudden_death" },
    { "type": "bout_end",                 "period": 2, "at_ms": 12000, "score_a": 5, "score_b": 3 }
  ]
}
```

**A forma de cada evento é a de [Eventos do assalto](#eventos-do-assalto--o-vocabulário-partilhado)**,
sem o `seq` — este lote chega de uma vez e não tem nada de que se defender.

Regras:

- **Descritivos, não autoritários.** O resultado de registo é o `a`/`b`. O servidor guarda a linha
  temporal como veio e **não** recalcula o resultado a partir dela nem rejeita a submissão se as duas
  coisas não baterem certo. Rejeitar faria uma submissão em fila falhar para sempre num assalto que o
  árbitro já deu por resolvido — e quem manda é o número que ele registou.
- **Máximo de 300 eventos** por assalto. Acima disso, `422 validation_failed`.

  > **Eram 200 até à `2.1.0`, e 200 era a conta dos toques.** Um combate de quadro a 15, disputado até
  > ao fim, dá ~30 toques, ~10 cartões, 3 `period_start` e 3 `period_end`, 2 descansos com os seus
  > fins, morte súbita com prioridade, e um `clock_start`/`clock_stop` por cada halt: **~115**. O
  > teto tem de ficar acima do pior caso real com folga, e não muito mais — é ele que impede um
  > cliente com um ciclo mal fechado de escrever um milhão de linhas. **Levantar um máximo não é
  > *breaking*:** nenhum cliente correto reparava que ele subiu.

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

**Um combate de cada vez, com um código de cada vez.** É a diferença que a `2.0.0` traz, e vem do
pavilhão: um quadro de 16 corre em oito pistas ao mesmo tempo, com oito árbitros e oito telemóveis.
Um código só para o quadro inteiro dava a cada um deles todos os combates — e, como um código segura
um dispositivo de cada vez, o segundo árbitro a lê-lo tirava a sessão ao primeiro.

Por isso o código desceu ao combate:

- Um token de **combate** (`scope: "match"`) alcança **esse** combate. Não alcança o da pista ao
  lado, nem a poule de onde os atletas vieram.
- Um token de **poule** alcança o cartão da poule e **não** alcança quadro nenhum — nem sequer o
  quadro desenhado a partir dela. Quando o quadro nasce, a poule fecha (`locked: true`), e o que a
  app faz é dizê-lo: a competição continua, noutros códigos.
- **Não há token de torneio.** Um torneio nunca foi arbitrado como um todo, e agora não tem por onde
  o ser: as poules têm o seu código, os combates têm o deles.

**O que a app faz aqui é o que já faz num assalto de poule:** abre o combate, cronometra, regista o
resultado. Gerar o quadro, semear e decidir quem sobe é da plataforma web — a app **nunca** o faz, e
o vencedor sobe de ronda do lado do servidor, na transação do resultado.

**O quadro como desenho não vem por aqui.** Uma sessão vê um combate; desenhar o resto seria
desenhá-lo a partir de dados que ela não tem direito a ver. Quem quer o quadro inteiro abre a página
do organizador, que é onde ele é desenhado e onde os códigos são distribuídos, um por cartão.

**`EliminationMatch`**

Também chamado `MatchDetail`, que é o nome por que o [`POST /connect`](#post-connect) e o
[`GET /session`](#get-session-opcional-recomendado) o devolvem. Uma forma só, porque uma sessão de
combate só tem esta.

```json
{
  "id": "m_01J9A...",
  "competition_name": "Torneio de Verão 2026",
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
  "scored_by_me": false,
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

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | **Opaco**, como o do assalto. Nunca interpretado pelo cliente |
| `competition_name` | string | O nome da prova a que o combate pertence — a poule quando o quadro é de uma poule, o torneio quando é de um torneio. É a única coisa que diz ao árbitro onde está: chegou com seis dígitos e mais nada |
| `bracket` | int | Tamanho do quadro — `8` num quadro de 8. Constante em todas as rondas. **`0` num quadro sem ronda 1**, de onde o tamanho é derivado: o cliente não desenha nada a partir deste campo sem o verificar |
| `round` | int ≥ 1 | Ronda, a contar do início do quadro. A app **não deduz o nome da ronda a partir daqui** — ver abaixo |
| `position` | int ≥ 1 | Posição dentro da ronda. É a ordem por que as pistas são chamadas |
| `status` | `pending` \| `in_progress` \| `done` | O mesmo conjunto do assalto de poule |
| `ready` | bool | `false` → um dos lados ainda espera o vencedor da ronda anterior. O combate abre-se à mesma — o código pode ser entregue antes de se saber quem sobe — mas **não pode ser começado nem pontuado** |
| `fencer_a` / `fencer_b` | `Fencer` \| null | `null` enquanto o lugar não estiver preenchido. `number` é sempre `null` aqui |
| `score_a` / `score_b` · `scored_at` · `scored_by_me` | | Iguais aos do `Bout` |
| `target` | int | Toques do quadro — `15` por omissão, contra os `5` da poule. **Vem sempre da API** |
| `periods` | int | `3` por omissão num quadro, e é aqui que o `rest_seconds` deixa de ser decorativo: há descanso de um minuto entre períodos |
| `weapon` · `rest_seconds` · `sudden_death_seconds` · `passivity_seconds` | | **Opcionais**, com o mesmo significado da poule |
| `allow_draw` | bool | **`false`** — um combate de quadro tem de ter vencedor, senão ninguém sobe |
| `locked` | bool | `true` → **este** combate já foi arbitrado. Só leitura |

**A app não nomeia rondas.** "Quartos-de-final" depende do tamanho do quadro, de haver repescagem e
do regulamento da prova — é decisão da plataforma, não aritmética do cliente. Se a nomeação for
precisa no ecrã, entra como campo novo (`round_name`) numa versão MINOR, vinda do servidor.

> **Os quadros de consolação deixaram de estar excluídos por construção.** Ficavam de fora porque
> não eram distinguíveis do principal numa *lista* — viriam com `round`/`position` repetidos e a app
> desenharia um quadro impossível. Sem lista, o problema não existe: um combate de consolação com
> código é um combate como os outros. A plataforma ainda não os gera, mas nada neste contrato os
> impede.

---

### `GET /elimination/{match}`

O combate, com os presets do cronómetro — a mesma forma acima. **Leitura pura**: não muda estado, tal
como o detalhe do assalto de poule.

Só o combate do próprio código. Qualquer outro id responde `404` ([§8](#8-catálogo-de-erros)).

**Erros:** `401` · `403 poule_scope_mismatch` · `404 not_found`

---

### `POST /elimination/{match}/start`

Igual ao `start` do assalto: marca `in_progress`, idempotente, *fire-and-forget*.

**200 OK** — `{ "id": "m_01J9A...", "status": "in_progress" }`

**Erros:** `401` · `403` · `404` · `409 match_not_ready` · `409 match_already_scored`

---

### `DELETE /elimination/{match}/start`

**Novo na `2.3.0`.** Igual ao [`DELETE /bouts/{bout}/start`](#delete-boutsboutstart) — mesmas regras,
mesma limpeza, mesmo **204**. O combate volta a `pending` e o `started_at` volta a `null`.

Mais raro aqui, porque um código alcança um combate e não há lista onde enganar a linha. Continua a
existir pela mesma razão: o árbitro que abre o combate, põe o cronómetro a andar e passa a pista a
outro deixa o mesmo fantasma na página da poule.

**Erros:** `401` · `403` · `404`

---

### `POST /elimination/{match}/events`

Igual ao [`POST /bouts/{bout}/events`](#post-boutsboutevents) — mesmo corpo, mesmo `seq`, mesma
resposta `202`. Um combate a decorrer tem de mostrar o placar a subir tal como um assalto de poule.

Não devolve `422 poule_locked`: um combate não é uma poule, e o bloqueio da poule não lhe diz
respeito.

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

`matches_done` / `matches_total` contam o **quadro inteiro**, não o que esta sessão alcança. São o
progresso da prova, para o ecrã dizer "5 de 15" — não uma lista, e não uma forma de descobrir os
outros combates.

Três diferenças em relação à poule:

- **O vencedor sobe na mesma transação.** O combate da ronda seguinte ganha atleta e pode passar a
  `ready: true`. Esta sessão não o vê e não precisa: quem o arbitra tem o código dele.
- **`409 match_not_ready`** existe aqui: um combate cujo lugar ainda espera o vencedor da ronda
  anterior não aceita resultado, mesmo que a app o tenha em cache como abrível.
- **É o fim da sessão.** Registado o resultado, não há mais nada nesta pista: o token é invalidado e
  o pedido seguinte recebe `401 poule_complete` ([§6](#6-sessão-e-expiração)). A resposta do `score`
  chega na mesma.

**Erros:** `401` · `403 poule_scope_mismatch` · `404` · `409 match_already_scored` ·
`409 match_not_ready` · `422 validation_failed` · `429 rate_limited`

> **Sem `422 poule_locked` aqui**, ao contrário do `score` de poule. Um combate já pontuado é
> travado pela escrita condicional (`409`), e um combate arbitrado revoga o token — o pedido seguinte
> apanha `401 poule_complete` antes de chegar a este controlador.

---

### `GET /session` *(opcional, recomendado)*

Valida no arranque da app um token guardado, sem escrever nada. Evita abrir uma sessão morta.

**200 OK**

```json
{
  "expires_at": "2026-07-24T18:42:11Z",
  "scope": "poule",
  "poule": { "...": "PouleSummary" },
  "match": null
}
```

Mesma forma do `POST /connect`, sem o `token` — que a app já tem. É por aqui que uma app relançada
descobre que a poule entretanto fechou, ou que o combate que tinha na mão já foi arbitrado pela web.

**Erros:** `401`

---

### `DELETE /session` *(opcional)*

Revoga o token atual — botão "terminar sessão". **204 No Content**. Falhar não impede o cliente de
apagar o token localmente.

> **`2.3.0`: leva consigo o que este dispositivo deixou aberto.** Qualquer assalto que **este token**
> tenha posto `in_progress` e não tenha pontuado é libertado à saída, com a mesma limpeza do
> [`DELETE /bouts/{bout}/start`](#delete-boutsboutstart). É a rede de segurança e não o caminho
> normal — o normal é a app dizê-lo assalto a assalto —, e existe para o árbitro que termina a
> sessão com um assalto ainda no ecrã.
>
> **Só os deste token.** Uma poule em duas pistas com o mesmo código continua a ter dois árbitros, e
> um sair não pode tirar o assalto ao outro. É a mesma regra do endpoint por assalto, e é a razão de
> a plataforma guardar quem chamou o `start`.

---

## 8. Catálogo de erros

Os `code` são **estáveis** e fazem parte do contrato. As `message` são indicativas: o servidor pode
afinar a redação sem que isso seja uma alteração de contrato.

| HTTP | `code` | Significado | Reação esperada do cliente |
|---|---|---|---|
| 422 | `pin_invalid` | PIN errado, inexistente, ou já rodado na web | Erro no campo, mantém o ecrã |
| 410 | `competition_finished` | O PIN existe mas não há nada a arbitrar nessa pista | Mostra o `message` do servidor, que diz **qual** dos casos é e para onde ir — não é erro de digitação |
| 429 | `pin_throttled` | Demasiadas tentativas | Bloqueia o campo até `Retry-After` |
| 401 | `token_expired` | 60 min sem atividade | Volta ao ecrã de ligar |
| 401 | `token_revoked` | O código foi rodado na web (**`2.2.0`:** ligar-se outro dispositivo já não faz isto) | "O código desta pista foi renovado na plataforma. Peça o novo ao organizador" — texto corrigido na `2.2.1`: dizia "outro dispositivo assumiu esta pista", que passou a ser impossível. O caminho de saída, voltar a ligar, é o mesmo |
| 401 | `poule_complete` | Nada mais a fazer aqui — combate arbitrado, ou poule disputada **e** fechada por um quadro | Ecrã de competição completa — **não é erro** |
| 403 | `poule_scope_mismatch` | Token de outra pista, ou de âmbito errado (código de poule a pedir um combate) | Volta a ligar; sinaliza *bug* |
| 404 | `not_found` | Assalto/poule/combate inexistente, ou de outra pista (ex.: atleta removido) | *Refetch* do que se tem |
| 409 | `bout_already_scored` | Assalto de poule já registado | Mostra `current`, não repete |
| 409 | `match_already_scored` | Combate de quadro já registado | Mostra `current`, não repete |
| 409 | `match_not_ready` | O combate ainda espera o vencedor da ronda anterior | Relê o combate; espera pela ronda anterior |
| 422 | `poule_locked` | Assaltos de poule fechados porque um quadro foi gerado | **Não é fim de sessão:** a poule passa a leitura, e o que se segue corre nos códigos dos combates |
| 422 | `validation_failed` | Corpo inválido | Mostra `errors`; sinaliza *bug do cliente* |
| 429 | `rate_limited` | Excesso de pedidos | *Backoff*, respeita `Retry-After` |
| 5xx | `server_error` | Falha do servidor | *Retry* com *backoff*; submissões vão para a fila |
| — | *(sem resposta)* | Rede indisponível | Modo offline |

> **`403 poule_scope_mismatch` pode chegar como `404 not_found`.** O servidor responde "não existe"
> em vez de "não é seu" a um id de outra pista, para que um árbitro com um combate na mão não possa
> descobrir que ids existem no resto da prova. O cliente **tem de tolerar as duas**: o `403` continua
> reservado e nunca é reutilizado para outra coisa, mas o comportamento a programar é o do `404` —
> reler o que se tem, e só depois voltar a ligar se isso também falhar.

---

## 9. Emparelhamento QR / PIN

### PIN

- **6 dígitos** (`000000`–`999999`), gerado por **pista** na plataforma web: um por poule, e um por
  **cada combate** de eliminatória.
- **Único entre os PINs ativos**, e único **nas duas tabelas**: o `/connect` recebe só os seis dígitos
  e tem de saber para onde mandar o árbitro.
- Rodável a qualquer momento (botão "novo código"). Rodar **invalida o PIN anterior** **e** os
  tokens já emitidos — é assim que o organizador retoma uma pista de um dispositivo perdido.
- **Não é de uso único.** Vale até ser rodado ou até não haver mais nada a arbitrar naquela pista.
- **Redesenhar um quadro deita fora os códigos dele.** Os combates são apagados e refeitos, e um
  código que abre um combate que já não existe não tem como ser explicado a quem o tem na mão.

  > **Decidido assim, sabendo o custo.** Um PIN que se gasta na ligação protege contra quem fotografa
  > o QR projetado, mas cobra o preço no caso comum: telemóvel sem bateria, app reinstalada, sessão
  > perdida a meio de um assalto — e o árbitro fica parado à espera do organizador. O árbitro em
  > pavilhão precisa de poder voltar a ligar-se sozinho. Quem quiser cortar o acesso roda o PIN, que
  > é um clique e mata também os tokens.

> **Onde o organizador os encontra.** O da poule está no painel de arbitragem das páginas da poule.
> Os dos combates estão **no próprio quadro**, um por cartão: o cartão mostra os seis dígitos e um
> ponto verde quando há um telemóvel agarrado a ele, e abre o QR num clique. É o mesmo sítio onde o
> organizador olha para saber que pista chamar, o que é meio caminho para não entregar o código
> errado.

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
| `2.2.0` | 2026-07-30 | **MINOR — um código segura tantos dispositivos quantos os que o lerem, e uma poule pode estar em duas pistas.** Nenhum campo muda de forma e **a app não muda uma linha**; o que muda é o comportamento por trás de dois pedidos que ela já fazia. Uma poule atrasada é levada a uma segunda pista por um segundo árbitro, com a folha e o código que já lá estavam — e a plataforma respondia a isso das duas piores maneiras. **(1) O `POST /connect` deixa de invalidar o token anterior**: as sessões acumulam-se no mesmo PIN em vez de se substituírem, e a linha "outro dispositivo ligou-se" desaparece da tabela do [§11 B](#b-como-o-401-sabe-qual-dos-três-é) — o `401 token_revoked` passa a querer dizer só uma coisa, que o código foi rodado. **(2) O `POST /bouts/{bout}/start` deixa de despromover os outros assaltos em curso**, portanto uma poule pode ter N assaltos `in_progress`; isto conserta de caminho um defeito que já existia sem segundo árbitro nenhum, em que o assalto do primeiro caía para `pending` e reaparecia na app dele como "por disputar" a meio de ser arbitrado. **(3) Não há repartição, atribuição nem reserva de assaltos**, e não é esquecimento: os esgrimistas estão fisicamente num sítio só, e a submissão em duplicado já estava tratada desde a `1.0.0` — primeiro a submeter leva o assalto, o segundo apanha `409` com o `current`, e o `Refused` fica no registo. **(4) Não há entidade "pista"**: um assalto identifica-se pelo número de sequência da folha, que é o que está impresso na que está pendurada na parede. **(5) O que fica pior:** rodar o código passa a expulsar todos os árbitros de uma vez, que é o comportamento certo para quem o roda. Do lado da web, o `now_fencing` e o `up_next` passaram a coleções e o `up_next` traz três, cada um a dizer se os seus esgrimistas estão livres. |
| `2.3.0` | 2026-08-05 | **MINOR, aditivo — o `start` deixa de ser uma porta de sentido único.** Um árbitro abre um assalto, põe o cronómetro a andar, vê que se enganou na linha da folha e volta à lista: nada disto chegava à plataforma, e o assalto errado ficava `in_progress` **para sempre**, com os toques do arranque falso agarrados. Do lado de fora a poule aparecia em duas pistas com dois placares a sério; na app dos outros árbitros da mesma folha, dois assaltos a decorrer — do mesmo árbitro. Antes da `2.2.0` não se via, porque o `start` despromovia os outros e tapava o problema com outro pior. **(1) `DELETE /bouts/{bout}/start` e `DELETE /elimination/{match}/start`**: o assalto volta a `pending`, os eventos em direto dessa tentativa **são apagados**, e fica no registo do organizador uma linha `abandoned` com quantos toques se descartaram. **(2) Os toques são apagados e não marcados**, por duas razões que não são cosméticas: o placar ao vivo é o evento mais recente com placar, portanto a tentativa seguinte abria a mostrar o resultado da abandonada; e o `seq` é único por assalto e a app numera de 1, portanto as linhas abandonadas ocupavam os números 1..N e o `insertOrIgnore` engolia em silêncio a linha temporal inteira da tentativa seguinte. **(3) A plataforma passa a guardar que dispositivo chamou o `start`** (`started_by_token_id`, gémeo do `scored_by_token_id`), e só esse liberta: um árbitro nunca tira o assalto ao da pista ao lado, que é o que a `2.2.0` deixou de poder assumir. **(4) O `DELETE /session` liberta, por si, o que este dispositivo deixou aberto** — rede de segurança para quem termina a sessão com um assalto no ecrã, e não o caminho normal. **(5) ⚠️ Isto não se fecha só do lado do servidor:** é a app que sabe que o árbitro saiu do assalto, e ela sai por navegação — ver [§11 G](#g-a-230-do-lado-da-app--por-fazer). Enquanto a G1 não for feita, o endpoint existe e ninguém o chama. |
| `2.2.1` | 2026-07-30 | **PATCH, redação — "a app não muda uma linha" era verdade sobre os campos, e não sobre o ecrã.** Nada mudou no que os dois lados trocam, e a app continua a pedir o mesmo e a receber o mesmo. O que a `2.2.0` retirou foi uma garantia que a app usava sem nunca a ter escrito: que uma poule tem **no máximo um** assalto `in_progress`. Com dois árbitros no mesmo código, o cartão do topo da lista — que **propõe uma ação** — podia apontar ao assalto da outra pista, com um "Retomar" que levava lá dentro; e o "Começar" desaparecia do ecrã do árbitro que ainda não tinha começado nada. (1) A [§11 F](#f-a-220-do-lado-da-app) regista o lado da app: memória local de qual é o assalto **deste** dispositivo — não há campo no contrato que o diga, e a §6 explica porquê —, o cartão do topo a segui-la, e um banner ao abrir um assalto que decorre noutra pista, informação e nunca proibição. (2) A coluna "o que a app mostra" do `401 token_revoked` no [§8](#8-catálogo-de-erros) deixa de dizer "outro dispositivo assumiu esta pista", que a `2.2.0` tornou impossível — era a meia-verdade que a linha anterior deixava para a `2.3.0`, e corrigi-la é uma linha de i18n do lado da app, não uma alteração de contrato. |
| `2.1.1` | 2026-07-29 | **PATCH, redação — a app emite a `2.1.0`, e este documento passa a dizê-lo.** Nada mudou no que os dois lados trocam. (1) A [§11 E](#e-a-210--feita-dos-dois-lados) deixou de ser "servida pela plataforma; a app é que falta" e passou a ser o registo dos **dois** lados, com a lista do que a app fez — **E6** a **E12**: os tipos e o teto a 300, o carimbo dos quatro campos em **todos** os eventos, o cronómetro embrulhado de onde saem o `bout_start` e os `clock_start`/`clock_stop`, as transições de descanso e de morte súbita, o `bout_end` antes de o resultado ir para a fila, os marcos **sem** placar e o travão nos 300. (2) O aviso de topo e o cabeçalho da §11 deixam de dizer que a app está por chegar — a §11 dizia mesmo que a `2.1.0` "ainda não existe em nenhum dos dois lados", que já contradizia a §11 E ao lado. (3) A ligação da §10 para a §11 E estava partida desde a `2.1.0`: o título da secção mudou e a âncora ficou a apontar para o antigo. |
| `2.1.0` | 2026-07-26 | **MINOR, aditivo — um assalto passa a reconstituir-se, e não só a resumir-se.** A linha temporal da `1.5.0` dizia em que altura do período caiu um toque; não dizia a que horas o combate começou, a que horas se entrou no terceiro período, a que horas o tempo voltou a correr depois de um halt, nem a que horas se foi a morte súbita. **(1) Oito tipos de evento novos**, os marcos do combate: `bout_start`, `period_start`, `rest_start`, `rest_end`, `sudden_death_start`, `clock_start`, `clock_stop` e `bout_end` — a juntar ao `period_end`, que já existia. **(2) Quatro campos novos** em todos os eventos, todos opcionais: `at` (hora de parede ISO-8601 UTC, do relógio do dispositivo), `elapsed_ms` (desde o `bout_start`, contando paragens e descansos), `remaining_ms` (o que faltava da fase) e `phase` (`period` \| `rest` \| `sudden_death`). **(3) `score_a`/`score_b` passam a poder vir também no lote do `score`**, que até aqui só os aceitava em direto — as duas formas do evento passam a ser a mesma, menos o `seq`. **(4) O teto por assalto sobe de 200 para 300 eventos**, porque 200 era a conta dos toques e os marcos acrescentam ~85 a um combate de quadro. **(5) A definição do evento passou a viver num sítio só** — [Eventos do assalto](#eventos-do-assalto--o-vocabulário-partilhado) —, em vez de duplicada entre o `events` do `score` e o `POST .../events`, que era como as duas cópias podiam divergir. **Nada é obrigatório e nada entra no resultado:** uma app na `2.0.0` continua correta contra um servidor na `2.1.0`, e um servidor na `2.0.0` ignora estes campos como ignora qualquer outro que não conheça. **Especificado antes de implementado**, dos dois lados — ver [§11 E](#e-a-210--feita-dos-dois-lados). |
| `2.0.1` | 2026-07-25 | **PATCH, redação — a app migrou, e este documento passa a dizê-lo.** Nada mudou no que os dois lados trocam. (1) A [§11 C](#c-o-lado-da-app--feito) deixou de ser uma lista de trabalho por fazer e passou a ser o registo do que foi feito, com três pontos novos — **C9**, **C10** e **C11** — que a lista original não previa e que só apareceram ao implementá-la: o detalhe do combate precisou de *polling* próprio (era a lista do quadro que revalidava por ele, e é assim que um `ready: false` se destranca sozinho); a chave da fila de submissões passou a aceitar o `id` de um combate, porque um `MatchDetail` não tem `uuid`; e um resultado que fica em fila **só pode ser entregue pelo token da pista que o gerou**, que é uma consequência operacional de o código ter descido ao combate e que a app passou a dizer ao árbitro em vez de a esconder. (2) O aviso de topo e o cabeçalho da §11 deixam de dizer que a app tem de migrar. (3) A caixa da [§12](#12-levantamento-de-campo--a-app-ligada-ao-servidor-a-sério) regista que o `live.test.ts` foi refeito. (4) Fica escrito, no C7, que mostrar o `message` do `410` põe pt-PT numa interface em `en`, e que a saída limpa é um `reason` estável — alteração **MINOR**, quando fizer falta. |
| `2.0.0` | 2026-07-25 | **MAJOR — o código deixou de ser da competição e passou a ser da pista.** Um quadro corre em várias pistas ao mesmo tempo; um código só para o quadro inteiro dava a cada árbitro todos os combates e, porque um código segura um dispositivo de cada vez, o segundo a ligar-se tirava a sessão ao primeiro. **(1) Cada combate de eliminatória tem o seu PIN**, e o `scope` da sessão passa a `poule` \| `match`. **(2) `scope: "tournament"` e o `TournamentSummary` desaparecem** — um torneio nunca foi arbitrável como um todo e agora não tem por onde. **(3) `GET /poules/{poule}/elimination` e `GET /tournaments/{tournament}/elimination` saem da API**: uma sessão vê um combate, não um quadro; o quadro desenha-se na web. **(4) O `connect` e o `session` devolvem `match`** (o `MatchDetail`, que é o detalhe do combate) no lugar de `tournament`, com `competition_name` novo a dizer em que prova o árbitro está. **(5) Um token de poule deixa de alcançar o quadro dessa poule.** **(6) `PouleSummary.elimination` passa a apontar o quadro *para onde os atletas foram*** — o da poule quando ela corre sozinha, o do torneio quando é uma pool — e é informativo, não navegável: era aqui que uma pool de torneio ficava `locked` com `elimination: null` e a app encalhava num ecrã sem saída. **(7) O `message` do `410 competition_finished` passa a dizer qual dos casos é e para onde ir.** **(8) `422 poule_locked` sai do `POST /elimination/{match}/start`.** **Sem `/api/v2`:** não há app instalada e o `/api/v1` nunca serviu produção, portanto não há versão antiga para coexistir; a regra da §1 vale para a próxima. |
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

**Levantado a 2026-07-25 contra o código da plataforma** (branch `test`). O servidor serve a `2.0.0`
por inteiro e **a app consome-a** — o que mudou do lado dela está em
[C](#c-o-lado-da-app--feito). A `2.1.0` foi escrita a 2026-07-26 e **está feita dos dois lados** no
mesmo dia: o registo de cada um está em [E](#e-a-210--feita-dos-dois-lados).

A `2.2.0` foi implementada a 2026-07-30 e **é toda do lado da plataforma** no que os dois lados
trocam — está em [A17](#a-o-que-a-plataforma-serve). A app pede o mesmo e recebe o mesmo; o que ela
teve de fazer foi deixar de assumir que só há um assalto a decorrer por poule, e isso está em
[F](#f-a-220-do-lado-da-app).

### A. O que a plataforma serve

```
POST   /api/v1/connect                       ← scope: poule | match
GET    /api/v1/session · DELETE /api/v1/session
GET    /api/v1/poules/{poule}/bouts          ← ETag
GET    /api/v1/poules/{poule}/standings      ← ETag (o mesmo da lista)
GET    /api/v1/bouts/{bout}                  ← leitura pura
POST   /api/v1/bouts/{bout}/start · /events · /score
GET    /api/v1/elimination/{match}           ← leitura pura, só o combate do próprio código
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
| A15 | **O código desceu ao combate** (contrato `2.0.0`). `elimination_matches.referee_pin` nova, `tournaments.referee_pin` largada com os tokens que dela vieram; `EliminationMatch` passou a ser *tokenable*, com a habilidade `match:{id}`; o `/connect` procura nas duas tabelas e o `scope` diz qual foi; o middleware prende um token de combate a esse combate e mais nenhum; as duas listas de quadro e o `TournamentSummary` foram **removidos**. Redesenhar um quadro apaga os códigos dele e larga os dispositivos agarrados. Do lado da web, os códigos passaram a viver **no cartão de cada combate** do quadro — seis dígitos, ponto verde quando há telemóvel agarrado, QR num clique —, e o painel de arbitragem do torneio desapareceu por não ter mais nada para mostrar |
| A16 | **A poule deixou de encalhar.** `Poole::isFinishedForGood()` passou a ser "cartão disputado **e** fechado por um quadro", em vez de "cartão disputado e quadro decidido": o árbitro que acaba a poule fica com a sessão viva para ler a classificação, e é o quadro que a encerra. `PouleSummary.elimination` passou a olhar para o quadro do torneio quando a poule é uma pool dele — era aqui que uma pool fechada aparecia com `elimination: null` e a app ficava sem saída. E o `410` do `/connect` passou a dizer para onde ir |
| A17 | **Dois árbitros na mesma poule** (contrato `2.2.0`). Duas remoções, e é tudo: `connectReferee()` deixou de apagar os tokens que já lá estavam, e `BoutScheduleService::start()` deixou de despromover os outros assaltos em curso. O segundo `start` conserta de caminho um defeito que já existia sem segundo árbitro nenhum — o assalto do primeiro caía para `pending` e reaparecia na app dele como "por disputar". `activeRefereeTokens()` nova a par da singular, e o painel do organizador passa a listar os N dispositivos. O `now_fencing` e o `up_next` das duas páginas web passaram a **coleções**: o `up_next` traz os três seguintes por sequência, cada um com um `busy` a dizer se algum dos seus esgrimistas está em pista — informação e nunca proibição, porque a ordem da folha é sugestão. **Nada disto toca na API da app**, que continua a pedir o mesmo e a receber o mesmo. Vale para os dois tipos de código: um combate de quadro também aceita um segundo dispositivo em vez de expulsar o primeiro, que é a resposta certa a uma bateria descarregada a meio |

### B. Como o `401` sabe qual dos três é

O [§8](#8-catálogo-de-erros) exige distinguir `token_expired`, `token_revoked` e `poule_complete`, e
um token apagado não consegue dizer qual dos três foi. A regra do servidor — com uma linha a menos
desde a `2.2.0`, porque ligar-se outro dispositivo deixou de apagar seja o que for:

| O que aconteceu ao token | O que o servidor faz | O que a app recebe |
|---|---|---|
| O PIN foi rodado | as linhas são **apagadas**, todas | `401 token_revoked` |
| A hora deslizante esgotou-se | a linha fica, com `expires_at` no passado | `401 token_expired` |
| A pista ficou sem nada a fazer | a linha é **expirada no lugar**, não apagada | `401 poule_complete` |

Sem a terceira linha o fim de uma competição chegava à app como "a sessão expirou", que é a única das
três que se corrige a voltar a ligar — e não havia nada a que voltar.

### C. O lado da app — feito

**Migrada a 2026-07-25**, no mesmo dia em que a plataforma passou a servir a `2.0.0`. Estava tipada
e escrita para a `1.5.0` e não funcionava contra esta versão; o que mudou, por ordem de dependência:

| # | O quê | Onde | Estado |
|---|---|---|---|
| **C1** | `SessionScope` passa a `'poule' \| 'match'`. Tirar `TournamentSummary`, acrescentar `MatchDetail` (o detalhe do combate, agora com `competition_name`, `scored_at` e `scored_by_me`) | `src/api/types.ts` | ✅ — e as duas formas do combate, a de lista e a de detalhe, colapsaram numa só, porque a lista deixou de existir |
| **C2** | Tirar `getPouleElimination` e `getTournamentElimination` — os endpoints já não existem | `src/api/endpoints.ts` | ✅ |
| **C3** | `connect()` e `getSession()` passam a ler `match` no lugar de `tournament`. Guardar o combate no *store* | `src/session/store.ts` | ✅ — e o combate que vem no `connect` é semeado na cache, para o ecrã abrir sem segundo pedido |
| **C4** | `phaseFor()`: `scope === 'match'` → ecrã do combate, direto. Um `scope` desconhecido nunca deve cair no ramo da poule, que é o que faria com que a app pedisse `/poules/undefined/bouts` | `src/session/store.ts` | ✅ — com teste de regressão sobre esse caso exato |
| **C5** | `app/bracket.tsx` deixa de fazer sentido: não há quadro para desenhar. O ecrã de combate (`app/match/[id].tsx`) passa a ser aberto **pela ligação**, não pela lista | `app/` | ✅ — apagado. O ecrã do combate herdou o que a lista carregava: cabeçalho, barra de sessão, fila e "Sair" |
| **C6** | Poule fechada (`locked: true`) deixa de levar ao quadro. Passa a ler-se, com o `elimination` ao lado a dizer o progresso do quadro para onde os atletas foram, e uma frase a explicar que cada combate tem código próprio | `src/session/store.ts`, `app/poule.tsx` | ✅ |
| **C7** | No `410 competition_finished`, mostrar o `message` do servidor em vez da constante `connect.error.finished` — é ele que agora diz para onde ir | `app/connect.tsx`, `src/i18n/` | ✅ — ver a nota de idioma abaixo |
| **C8** | `API_CONTRACT_VERSION` → `'2.0.0'` | `src/config/` | ✅ — em `src/api/types.ts`, onde a constante vive |

**E o que estava em aberto desde a `1.5.0`, também feito:** a app envia os eventos do assalto em
direto ([`POST /bouts/{bout}/events`](#post-boutsboutevents) e o equivalente da eliminatória), com o
contador `seq` por assalto. Era a **F7** da `app-arbitragem-client-spec.md` §14.

#### Três coisas que esta lista não previa, e que só apareceram ao implementá-la

| # | O que apareceu | Como ficou |
|---|---|---|
| C9 | **O detalhe do combate não fazia *polling*.** Era a lista do quadro que revalidava por ele, e sem lista ficou sem fonte de notícias — incluindo a única que o árbitro não pode perder: um combate entregue com `ready: false` **destranca-se sozinho** quando a ronda anterior acaba | O `GET /elimination/{match}` passou a ser pedido na cadência do ecrã de assalto da [§5](#5-polling-e-etag): 30 s com o cronómetro parado, pausado com ele a correr |
| C10 | **A chave da fila de submissões.** É por competição, e um `MatchDetail` não tem `uuid` — tem o `id` opaco | A chave passou a ser o UUID da poule **ou** o id do combate. Nada a interpreta: é agrupamento, não identidade |
| C11 | **Um resultado em fila fica preso à pista que o gerou.** Registado sem rede, a sessão daquela pista acaba (o combate foi arbitrado) e o árbitro liga-se à seguinte — mas nenhum token a não ser o daquela pista o pode entregar. Com o quadro inteiro num só código isto não acontecia | Não é resolúvel do lado da app, e por isso ela **não finge que está a tratar do assunto**: conta à parte o que pertence a outra pista e diz que é preciso voltar a ligar-se com aquele código. Resolve-se rodando o PIN dessa pista, ou registando o resultado na web |

> **Nota de idioma sobre o C7.** A app está em `en` e traduz os `code` que conhece, para não misturar
> duas línguas no mesmo ecrã. O `410` é a exceção porque é a única `message` deste contrato que muda
> com o caso — e, quando diz *"peça o da sua pista"*, é a diferença entre o árbitro continuar e ficar
> parado à espera do organizador. A saída limpa é um campo `reason` estável (`poule_locked` \|
> `poule_played` \| `match_scored`) que o cliente traduza, e isso é uma alteração **MINOR** deste
> documento — que se faz alterando-o primeiro, dos dois lados.

### D. O que ficou deliberadamente de fora

| O quê | Porquê |
|---|---|
| O **quadro como desenho** | Uma sessão alcança um combate, e desenhar o resto seria desenhá-lo a partir de dados a que ela não tem direito. O quadro vê-se na web, que é onde é feito |
| Quadros de **consolação** | Deixaram de estar excluídos por construção com a `2.0.0` ([§7](#eliminatórias)) — era a lista que os tornava indistinguíveis. A plataforma ainda não os gera |
| `base_url` no QR | Formato reservado do [§9](#9-emparelhamento-qr--pin); o QR continua a levar só os seis dígitos |
| `round_name` | A app não nomeia rondas e o servidor ainda não as nomeia por ela. Entra como MINOR quando fizer falta no ecrã |
| Vitória por prioridade | Não é representável (`a == b` é recusado). Reabrir implica `allow_draw` mais um campo de vencedor, e é **MAJOR** |
| `GET` dos eventos de um assalto | A app guarda a linha temporal em memória enquanto o assalto dura e mostra-a de lá. Entra como MINOR aditivo quando fizer falta ler o que já subiu — ver [Linha temporal por ler](#linha-temporal-por-ler--o-get-que-não-existe) |
| Sincronização de relógio | O `at` da `2.1.0` é o relógio do telemóvel, e assume-se como tal. Corrigi-lo custaria uma troca de horas em todos os pedidos para acertar o desvio do dispositivo de quem está a arbitrar, e **nenhuma decisão do servidor depende do `at`** |

### E. A `2.1.0` — feita dos dois lados

**Escrita e implementada a 2026-07-26.** O contrato foi primeiro, que é a regra da
[§1](#como-usar-este-documento), e os dois lados seguiram no mesmo dia — o servidor primeiro, a app
poucas horas depois.

Nada disto é obrigatório para nenhum dos dois: os campos e os tipos novos são todos opcionais, uma
app na `2.0.0` fala com este servidor exatamente como falava antes, e uma app na `2.1.0` fala com um
servidor anterior perdendo os marcos e mais nada — ver a caixa no fim desta secção.

**Servidor — ✅ feito.** Registo em `docs/app-arbitragem-todo.md` §F.

| # | O quê | Onde |
|---|---|---|
| E1 | Os oito casos novos em `BoutEventType`, com `label()` e `tone()`, **todos em `timeline()`** — os marcos são da história do assalto, e o painel da poule filtra-os como já filtrava os toques | `app/Enums/BoutEventType.php` |
| E2 | `at`, `elapsed_ms`, `remaining_ms` e `phase` aceites nos dois caminhos, mais `score_a`/`score_b` no lote do `score`. Teto a 300. **As regras passaram a viver num sítio só**, como o contrato — um *trait* partilhado pelas duas *requests* | `Concerns/DescribesBoutEvents.php` |
| E3 | Os campos gravados no `data`. **Sem migração:** o `data` já é JSON. As chaves nulas deixaram de ser escritas — um evento que não diz nada não é uma linha cheia de `null`, e todos os leitores já perguntavam com `isset()` | `BoutEventRecorder::describe()` |
| E4 | `liveScore()` passa a ler o **último evento com placar** | `BoutEventRecorder.php` |
| E5 | `describeEvent()` expõe `at_wall`, `phase`, `elapsed_ms` e `remaining_ms`; a gaveta do assalto mostra a hora do dispositivo, o tempo desde o início e o que faltava | `RefereePanelPresenter.php` · `resources/js/boutTimeline.js` |

> ### 🔴 A **E4** não era um risco da `2.1.0` — era um bug já em produção
>
> Estava escrito neste documento como "o único ponto que parte alguma coisa que hoje funciona", à
> conta dos marcos novos. Ao escrever o teste de regressão **antes** da implementação, apareceu que
> não era preciso nenhum marco para o disparar: o `score_a`/`score_b` do `POST .../events` **sempre
> foi opcional** ([Os campos](#os-campos)), e um `period_end` enviado sem placar — que é o caso
> normal, porque um fim de período não muda o resultado — já apagava o placar ao vivo do painel do
> organizador e da página pública do evento.
>
> Ou seja: qualquer app que envie `period_end` sem placar deixa a web em branco a meio do assalto, e
> isso é verdade desde a `1.5.0`. A `2.1.0` não o introduziu — tornou-o inevitável, e por isso
> encontrado.
>
> **A correção é a mesma.** O último evento **com placar** é o placar; o mais recente pode não ter
> nada a dizer sobre ele. Filtrado em PHP e não em SQL, porque um `null` de JSON e uma chave em falta
> não são a mesma coisa para todos os *drivers*, e o conjunto é pequeno: o contrato limita um assalto
> a 300 eventos e o índice único de `(subject_type, subject_id, sequence)` é o que a consulta lê.

**App — ✅ feita (F9), a 2026-07-26.** Ver `docs/app-arbitragem-client-spec.md` §7.2. O motor do
assalto (`useBoutEngine`) já conhecia todos estes momentos: as fases, as transições de período, o
sorteio da prioridade e o cronómetro que arranca e pára. O que faltava era emiti-los.

| # | O quê | Onde |
|---|---|---|
| E6 | Os oito `type` novos e o `EventPhase`, com o teto a **300** e o grupo B exportado à parte — é dele que o emissor se serve para o tirar do lote. As duas formas do evento colapsaram numa só, menos o `seq` | `src/api/types.ts` |
| E7 | **Um carimbo comum a todos os eventos**, o grupo A incluído: `phase`, `remaining_ms`, `at` e o `elapsed_ms` medido pelo relógio **monotónico** — e **ausente** enquanto não houver `bout_start`, porque antes dele não há de onde contar | `src/bout/useBoutEngine.ts` |
| E8 | **O cronómetro passou a ser embrulhado.** O `toggle` do motor emite `clock_start`/`clock_stop` e, no primeiro arranque do assalto, `bout_start` + `period_start`. O halt que precede cada toque e cada cartão passa por ele, e é daí que vem a maior parte dos `clock_stop`. O tempo a esgotar-se **não** emite `clock_stop`: já tem o `period_end` no mesmo instante | `src/bout/useBoutEngine.ts` |
| E9 | `rest_start`, `rest_end` e `sudden_death_start` nas transições que já existiam — o `rest_end` com o período que **acabou**, e o `sudden_death_start` imediatamente antes do `priority`. Mudar de período à mão não emite nada: é uma correção de quem arbitra, não um acontecimento da pista | `src/bout/useBoutEngine.ts` |
| E10 | `bout_end` com o placar final, **antes** de o resultado ir para a fila, e a cada confirmação — um `409` corrigido e submetido outra vez são dois fins de combate declarados. O cronómetro autónomo não o emite: não tem submissão | `src/bout/BoutScreen.tsx` |
| E11 | **Os marcos vão sem placar** — só o `bout_end` leva o resultado, por definição deste documento. Consequência no ecrã: a folha do histórico deixou de desenhar o painel do placar nas linhas que não o trazem, porque um `–—–` em painel preto lia-se como um resultado a zero | `src/bout/EventSheet.tsx` |
| E12 | **Travão nos 300.** Ao chegar ao teto o emissor pára de mandar, e o `log` do motor continua a crescer: a folha do histórico é do árbitro e não tem teto de servidor nenhum | `src/bout/useLiveEvents.ts` |

> **A app degrada-se sozinha contra um servidor anterior, e isso apaga uma aresta deste documento.**
> Estava escrito aqui e na `client-spec` que a F9 podia ser escrita antes da plataforma mas não
> **entregue** antes: um `type` desconhecido faz o servidor recusar o lote **inteiro** com `422`, e o
> emissor da app desistia do assalto — perdendo com os marcos também os toques, que esse servidor
> aceitava bem.
>
> Resolveu-se do lado do cliente, que é onde tinha de ser: **ao primeiro `422`, o emissor tira os
> marcos do lote e continua a espelhar o resto**, uma vez e para o resto do assalto. Uma instalação
> anterior à `2.1.0` passa a custar os marcos e mais nada.
>
> **O que isto quer dizer para este contrato:** os tipos da `2.1.0` não são um mínimo exigido ao
> servidor, e nenhuma das duas partes precisa de saber em que versão a outra está. É o que "MINOR
> aditivo" já prometia na [§1](#versionamento) para os *campos* — a regra de tolerância —, agora
> valendo também para os *tipos*, que não a tinham porque um conjunto fechado é validado.

### F. A `2.2.0` do lado da app

**Nenhum campo, nenhum endpoint, nenhum `type`.** A app pede o mesmo e recebe o mesmo, e uma app na
`2.1.1` fala com este servidor sem erro nenhum. O que a `2.2.0` retirou foi uma **garantia** que ela
usava sem nunca a ter escrito: que uma poule tem no máximo um assalto `in_progress`, porque era o
`start` que despromovia os outros. "O assalto a decorrer" e "o meu assalto" eram a mesma coisa, e
deixaram de ser.

| # | O quê | Onde |
|---|---|---|
| F1 | **A app passa a saber qual dos assaltos é o dela**, e sabe-o porque foi ela que chamou o `start` — não há campo aqui que o diga, e a [§6](#6-sessão-e-expiração) explica porquê: não há repartição, atribuição nem reserva. Guarda-o por pista e **em disco**, porque a app é morta em *background* a meio de uma poule e voltar sem memória é voltar ao comportamento errado. Uma pista com mais de 24 h é esquecida | `src/poule/refereeing.ts` |
| F2 | **O cartão do topo da lista segue esse assalto**, em três ramos: o meu se estiver a decorrer; senão, se já arbitrei nesta poule, o primeiro por disputar; senão o primeiro a decorrer, que é o comportamento de sempre e o que acerta com um árbitro só. É o ramo do meio que conserta o "Retomar" sobre o assalto de outro — e o de cima que impede o cartão de saltar para lá a meio de uma arbitragem, por um *poll* de 10 s | `src/poule/status.ts` |
| F3 | **A linha da lista não muda:** um assalto a decorrer diz que está a decorrer, seja de quem for. Para quem está na pista ao lado é a informação certa; o que a app não pode é **propor uma ação** sobre ele, e é só isso que o F2 corrige | — |
| F4 | **Banner ao abrir um assalto que decorre noutra pista**, com o que o [§4](#4-idempotência-e-retry) já garante escrito à letra: quem submeter primeiro fica com o resultado. Informação e nunca proibição. **Só quando a app sabe** que o assalto não é dela: sem memória de ter arbitrado nesta poule, assume que é | `src/bout/BoutScreen.tsx` |
| F5 | **A *copy* do `401 token_revoked` corrigida** — ver a [§8](#8-catálogo-de-erros). Dizia "outro dispositivo assumiu esta pista", que a `2.2.0` tornou impossível | `src/i18n/*.json` |

> **Nada disto é observável do lado do servidor**, e por isso não houve ordem de entrega: a app
> mudou depois da plataforma porque calhou, não porque tivesse de ser. Contra um servidor anterior à
> `2.2.0` a app comporta-se exatamente como antes — nunca há dois assaltos a decorrer, a memória
> aponta sempre para o único, e os três ramos devolvem o que a linha que substituíram devolvia.

### G. A `2.3.0` do lado da app — **por fazer**

**A `2.2.0` não precisava da app e esta precisa.** É a diferença entre as duas: ali o servidor
mudava de comportamento sozinho e a app só tinha de deixar de assumir uma garantia; aqui **só a app
sabe que o árbitro saiu do assalto**. Ela sai por navegação (`back`, "Voltar à lista"), e o servidor
não tem como distinguir isso de um telemóvel no bolso a meio de um assalto a sério. Enquanto a G1
não for feita, o `DELETE` existe e ninguém o chama.

| # | O quê | Onde |
|---|---|---|
| G1 | **`DELETE /bouts/{bout}/start` ao sair do assalto sem resultado.** É o `onLeave`, nos dois ramos: o `back()` direto (sem toques marcados) e o `back` do `Alert` de confirmação. *Fire-and-forget*, sem fila — falhar não pode travar quem quer é sair | `src/bout/BoutScreen.tsx` |
| G2 | **O mesmo numa sessão de combate**, com `DELETE /elimination/{match}/start`. Não há `back` aqui — não existe ecrã por baixo —, portanto o gatilho é sair da sessão | `src/bout/BoutScreen.tsx`, `src/session/SessionExit.tsx` |
| G3 | **Esquecer o assalto ao largá-lo.** O `refereeing.ts` guarda "o meu assalto" por pista e nunca o limpa; depois de sair de um assalto ele continua a apontar-lhe, e o ramo de cima do `currentBout` fica a olhar para um assalto que já não é de ninguém. Um `clearStarted(competitionKey)`, chamado no mesmo sítio do G1 e no `disconnect()` | `src/poule/refereeing.ts`, `src/session/store.ts` |
| G4 | **Não chamar o `DELETE` depois de um `score`.** O assalto acabou, não foi abandonado, e o servidor recusa na mesma — mas pedir a libertação de um assalto que se acabou de registar é dizer a coisa errada e desperdiçar um pedido no fim de cada assalto | `src/bout/BoutScreen.tsx` |

> **Não há ordem de entrega imposta pelo servidor**, e a app degrada-se sozinha: contra um servidor
> anterior à `2.3.0` o `DELETE` responde `405`/`404`, o *fire-and-forget* ignora-o, e tudo se
> comporta como antes. O que **não** se degrada é o contrário — servidor na `2.3.0` e app anterior é
> exatamente o estado de hoje, com o defeito por corrigir.

---

## 12. Levantamento de campo — a app ligada ao servidor a sério

**2026-07-25.** A app deixou de falar com *fixtures* e passou a falar com a plataforma
(`poule.esgrima.pt.test`, dados reais). O levantamento está fixado em `src/api/live.test.ts`, que
corre contra o servidor e não contra mocks (`npm run test:live`).

> ⚠️ **Levantado contra a `1.5.0`.** As arestas 1, 2, 4, 5, 6 e 7 continuam a valer tal e qual; a 3
> ficou resolvida por outro caminho. O `live.test.ts` foi refeito com a
> [C](#c-o-lado-da-app--feito) — as duas chamadas que ele fazia às listas de quadro deixaram de
> existir, e no lugar delas verifica o combate que o próprio código abre, mais o `404` a qualquer
> outro id.

**Não falta nenhum endpoint.** Não houve nenhuma área da app à espera de um endpoint que não
exista. O que se segue são as arestas que só aparecem com o servidor a sério do outro lado.

| # | O que se encontrou | Quem corrige | Estado |
|---|---|---|---|
| 1 | **`If-None-Match` comparado por igualdade de string.** Com `Accept-Encoding: gzip` — ou seja, sempre — o proxy enfraquece o `ETag` para `W/"..."` e o `304` deixa de acontecer. Ver a caixa da [§5](#5-polling-e-etag) | **servidor** | Por corrigir. A app mitiga (`strongEtag`), mas a correção é do lado de lá |
| 2 | **`scored_at` pode vir `null` num assalto `done`.** As colunas de metadados do resultado são recentes; resultados registados antes delas continuam sem hora | ambos | **Documentado aqui.** O tipo já era `string \| null`; o que faltava era dizer que o `null` também acontece com `status: "done"`. O cliente não pode assumir que um assalto pontuado traz hora — o ecrã de conflito omite-a quando falta |
| 3 | **`422 poule_locked` está listado no `POST /elimination/{match}/score` e o servidor nunca o devolve.** O controlador não verifica bloqueio: um combate já pontuado é travado pela escrita condicional (`409`), e um combate arbitrado revoga o token (`401 poule_complete`) antes de chegar aqui | documento | **Resolvido.** O erro saiu dessa lista na `1.4.2` e, na `2.0.0`, saiu também do `start`: um combate não é uma poule e o bloqueio da poule não lhe diz respeito |
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
- Um id de outra pista a responder `404`, como a [§8](#8-catálogo-de-erros) prevê.
- **Da `2.0.0`, fixado por teste no servidor:** dois combates do mesmo quadro arbitrados ao mesmo
  tempo por dois códigos, sem que nenhum tire a sessão ao outro; um código de poule a não alcançar
  combate nenhum; o `410` a dizer para onde ir quando a poule fechou.

---
## Referências

- `docs/app-arbitragem-client-spec.md` — especificação da app (consome este contrato)
- `docs/app-arbitragem-todo.md` — pontos em aberto do lado do servidor (A1, A2 e A3 cruzam com a §11)
- `docs/app-arbitragem-spec.md` — visão de produto e trabalho do lado do servidor
- [Laravel Sanctum — API token authentication](https://laravel.com/docs/12.x/sanctum#api-token-authentication)
