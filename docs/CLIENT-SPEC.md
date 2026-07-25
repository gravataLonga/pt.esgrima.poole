# App de Arbitragem — Especificação do Repositório Cliente

Documento de arranque do repositório **novo e separado** que aloja a app React Native de arbitragem
(`poole-referee-app`). É auto-contido: quem o lê **não precisa de acesso ao código da plataforma**.

- **Plataforma (servidor):** `poole.esgrima.pt` — Laravel 12 / PHP 8.4, repositório existente.
- **App (cliente):** React Native, repositório novo, este documento.
- **Fronteira partilhada:** [`app-arbitragem-api-contract.md`](app-arbitragem-api-contract.md) —
  documento próprio, duplicado nos dois repositórios. Alterá-lo é alterar os dois lados.

Complementa `docs/app-arbitragem-spec.md` (visão de produto + trabalho do lado do servidor). Onde os
dois divergirem, **este documento manda no cliente** e o outro manda no servidor.

> ⚠️ **Estado à data (2026-07-25):** a plataforma **já tem** Sanctum, `routes/api.php` e uma API de
> arbitragem a correr — mas ela **não é a do contrato**: URLs diferentes, sem `code` nos erros, sem
> `ETag`, sem `/start` e sem chave de idempotência. **Está decidido que é o servidor que se alinha**,
> e a lista de trabalho está em **§11 do contrato**. Até estar feito, o desenvolvimento da app corre
> contra o **mock server** de [§10](#10-mock-server--desbloquear-a-app), não contra produção.

---

## Índice

1. [Contexto de domínio](#1-contexto-de-domínio)
2. [Âmbito da app](#2-âmbito-da-app)
3. [Decisões fechadas](#3-decisões-fechadas)
4. [Tecnologia](#4-tecnologia)
5. [Contrato de API](#5-contrato-de-api)
6. [Máquina de estados e ecrãs](#6-máquina-de-estados-e-ecrãs)
7. [Cronómetro](#7-cronómetro)
8. [Offline e fila de submissões](#8-offline-e-fila-de-submissões)
9. [Segurança](#9-segurança)
10. [Mock server](#10-mock-server--desbloquear-a-app)
11. [Estrutura do repositório](#11-estrutura-do-repositório)
12. [Testes e critérios de aceitação](#12-testes-e-critérios-de-aceitação)
13. [Dependências no servidor](#13-dependências-no-servidor-o-que-a-plataforma-tem-de-entregar)
14. [Fases de entrega](#14-fases-de-entrega)
15. [Glossário](#15-glossário)

---

## 1. Contexto de domínio

Esgrima. Não é preciso saber esgrima para trabalhar no repo, mas é preciso saber isto:

| Termo | O que é |
|---|---|
| **Poule** (`poule` / `poole`) | Grupo de 4–12 atletas em que **todos jogam contra todos**. Uma poule de `n` atletas tem `n(n-1)/2` assaltos. |
| **Assalto** (*bout*) | Um combate entre dois atletas da poule. |
| **Atleta** (*fencer* / `player`) | Participante numa poule. Tem `nome`, `clube` (opcional) e um **número** (1..n) que é a posição na folha de poule. |
| **Toques** | Pontos. Cada assalto de poule vai até ao `touch_cap` (por omissão **5**) ou até esgotar o tempo (por omissão **3 min**). |
| **Torneio** (*tournament*) | Agrupa várias poules e, depois, o quadro de eliminatórias. Uma poule pode existir isolada ou dentro de um torneio. |
| **Eliminatória** (*direct elimination*) | Quadro a eliminar depois das poules. **Dentro do âmbito da app** desde o contrato `1.4.0`: a app arbitra o quadro da poule e o do torneio, com a mesma sessão. Gerar o quadro é da web. |
| **Árbitro** | Quem a app serve. Conduz os assaltos de **uma** poule, cronometra e regista o resultado. |

Regras que **condicionam diretamente o cliente** (não são detalhe de servidor):

1. **Não há empates em poule.** A plataforma rejeita `a == b` com 422. O botão de submeter tem de
   estar desativado enquanto os dois resultados forem iguais.
2. **Nenhum resultado excede o `touch_cap`** da poule (validação servidor: `max:touch_cap`).
3. **Uma poule fica bloqueada** assim que o quadro de eliminatórias é gerado a partir dela. A partir
   daí toda a escrita **sobre assaltos de poule** devolve 422 — mas a sessão **não** acaba: é esse o
   momento em que o quadro passa a aceitar resultados, e a app muda de fase sem voltar a ligar. Só é
   modo leitura se também não houver quadro para arbitrar.
4. **Atletas podem ser removidos** da poule na web enquanto a app está ligada. A lista de assaltos
   pode encolher entre *polls*; a app nunca assume que a lista que tem em memória é a atual.
5. **A classificação** é calculada no servidor (V/M → indicador → toques dados). A app **não calcula
   classificações** — mostra o que a API devolver, se e quando devolver.

### Modelo de assaltos — o que o cliente pode assumir

A plataforma guarda hoje os assaltos num formato interno (duas linhas espelhadas por assalto, uma na
perspetiva de cada atleta) que **não** tem `id` de assalto estável. Está em curso a migração para
assaltos pré-gerados com `sequence` e `status`.

**O cliente é imune a isto**, e tem de continuar a ser:

- O `id` de um assalto é uma **string opaca**. A app **nunca** a interpreta, decompõe, ordena ou
  constrói. Só a devolve tal e qual ao servidor.
- A ordem de disputa vem do campo `sequence` (inteiro, 1..N) — a app **não reordena** a lista. O
  `sequence` só é obrigatório quando `poule.ordered` é `true` (poule de torneio); numa poule isolada
  o plantel muda a meio, a ordem é regerada e o `sequence` desloca-se. **Nunca** usar `sequence`
  para identificar um assalto — para isso serve o `id`, que é estável nos dois modos.
- A app **não conhece** `given`/`received` nem linhas espelhadas. Só conhece `score_a` / `score_b`.

> Se o servidor mudar de representação interna, o contrato mantém-se e a app não muda. Essa é a razão
> de ser da string opaca.

---

## 2. Âmbito da app

A app é um **companion**: apoia a plataforma web, não a substitui.

### Dentro do âmbito

- Ligar a uma **competição** — poule ou torneio — por **scan de QR** ou **PIN manual**. O árbitro
  escreve seis dígitos; é o `scope` da resposta que diz à app o que abrir.
- Listar os assaltos da poule pela ordem definida, com estado.
- **Arbitrar o quadro de eliminatórias**, da poule e do torneio: mesma sessão, mesmo ecrã de assalto,
  presets do quadro (15 toques, 3 períodos, descanso entre eles) vindos da API. Quando o quadro da
  poule é gerado, a poule fecha e a app muda de fase sem voltar a ligar.
- Conduzir um assalto: **cronómetro local**, contadores de toques, submissão do resultado.
- Sinalizar à plataforma que um assalto **começou** (alimenta o "joga agora" na web).
- Tratar concorrência (409), expiração de sessão, poule bloqueada e falta de rede.
- **Modo cronómetro autónomo** (`/timer`): um assalto sem poule, sem rede e sem atletas — tempo,
  toques, cartões e prioridade, sem nada para submeter. Serve treinos e provas locais, e é a única
  parte da app que não espera pela API. Não toca na sessão: `app/timer.tsx` **não importa**
  `@/session/store`, e essa ausência é verificada por teste.

### Fora do âmbito (v1)

- Autenticação de utilizadores (não há contas — a sessão pertence à poule).
- Criar/editar poules, atletas ou torneios.
- **Gerar** o quadro de eliminatórias, semear atletas, decidir emparelhamentos — a app lê o quadro que
  a web produziu e regista resultados nele. Arbitrá-lo **está** dentro do âmbito.
- Cartões (amarelo/vermelho/preto), penalizações, prioridade/*minuto de ouro*.
- Classificações e folha de poule.
- Arbitrar **mais do que uma competição** em simultâneo no mesmo dispositivo.
- Modo espectador / público.

> **Cartões e prioridade ficam de fora conscientemente.** São regra FIE real e vão ser pedidos mais
> cedo ou mais tarde; o ecrã de assalto deve deixar espaço de layout para eles, mas a v1 não os
> implementa. **A API já os aceita**, no campo opcional `events` do `score` — o caminho de dados está
> aberto para quando a app os recolher, sem alteração de contrato.
>
> Quando os implementar: **o regulamento é da app, não do servidor.** A plataforma não converte um
> cartão vermelho num toque nem arbitra morte súbita — recebe o resultado que o árbitro registou e a
> linha temporal que a app lhe der, e grava.

---

## 3. Decisões fechadas

Herdadas de `docs/app-arbitragem-spec.md`:

| Tema | Decisão |
|---|---|
| App | React Native, companion |
| Auth | Sanctum modo *token*; o token pertence ao model `Poule` (tabela polimórfica), **sem utilizadores** |
| Conexão | **Uma por competição**; um novo *connect* invalida o token anterior |
| Cronómetro | **Local**; presets (tempo/toques/períodos) vêm da API |
| Concorrência | Primeiro a submeter ganha; o segundo recebe **409** |
| Token | Expira em **60 min deslizantes**; auto-invalida quando a competição fica encerrada — assaltos feitos **e** quadro decidido |

Decisões **novas**, fechadas ao escrever esta spec (o documento de produto não as cobria). As sete
primeiras estão formalizadas no [contrato de API](app-arbitragem-api-contract.md):

| Tema | Decisão | Porquê |
|---|---|---|
| Versionamento | Prefixo `/api/v1/` | Permite v2 sem partir apps instaladas. |
| Formato do PIN | 6 dígitos, único entre PINs ativos, **de utilização múltipla** | Digitável à mão em pavilhão com QR ilegível. Múltipla utilização porque o árbitro que perde a sessão — bateria, reinstalação — tem de voltar a ligar-se sozinho; cortar acesso faz-se rodando o PIN, que mata também os tokens. |
| Payload do QR | **Só os 6 dígitos.** O JSON `{v, base_url, pin}` fica especificado como formato reservado | Ler o QR e escrever o PIN passam a ser o mesmo caminho. O `base_url` no QR entra quando houver *self-hosting* a justificá-lo; o cliente já o aceita, para a migração não ser coordenada. |
| Atualizações | **Polling com ETag**, não WebSockets | A plataforma não tem *broadcasting*; polling resolve com custo quase zero. |
| Re-submissão | **`submission_id`** (UUID v4 do cliente) no `score`; mesma submissão → **200**, não 409 | Sem chave de idempotência, um *retry* por *timeout* dá 409 falso ("outra pessoa") ao próprio autor. A chave é da submissão, não da sessão: sobrevive a uma reconexão com a fila cheia. |
| Início do assalto | `POST /bouts/{id}/start` | O widget "quem joga agora" da web precisa de `in_progress`; sem endpoint nunca sai de `pending`. |
| Id de assalto | String **opaca** | Isola a app da migração do modelo de assaltos, ainda por fechar do lado do servidor. |
| Fila offline | Persistente, FIFO, só para submissões de resultado | Rede de pavilhão cai. Perder um resultado é inaceitável; perder um `start` não é. |
| Eliminatórias | **Dentro do âmbito**: mesma sessão, mesmo ecrã de assalto, `scope` a distinguir poule de torneio | O árbitro que fez a poule é o que arbitra o quadro a seguir, e o ecrã de assalto não precisa de saber em que fase está. |
| Idioma | **en** como idioma inicial; `pt-PT` fica no repo, sem troca na interface na v1 | Um idioma só na v1 mantém a *copy* num sítio. A troca entra como funcionalidade depois, sem refactor. |
| Orientação | Portrait fixo, **exceto no ecrã de assalto** | Encostado à pista, o telemóvel deitado dá dígitos maiores e uma coluna de resultado para cada polegar. |

---

## 4. Tecnologia

### Stack

| Camada | Escolha | Notas |
|---|---|---|
| Runtime | **Expo (managed)**, SDK atual estável | `expo-camera` e `expo-secure-store` resolvem QR e armazenamento de token sem código nativo. |
| Linguagem | **TypeScript**, `strict: true` | O contrato de API é tipado à mão a partir do documento de contrato. |
| Navegação | `expo-router` | Rotas por ficheiro; *deep link* do QR entra direto. |
| Estado servidor | **TanStack Query** | Polling, ETag, *retry*, invalidação — não reimplementar à mão. |
| Estado cliente | **Zustand** | Sessão, cronómetro, contadores. Pequeno e testável. |
| Token | **`expo-secure-store`** | Keychain/Keystore. **Nunca** `AsyncStorage`. |
| Fila offline | **`react-native-mmkv`** (ou `AsyncStorage`) | Persistência síncrona da fila de submissões. |
| Câmara / QR | `expo-camera` (`barcodeScannerSettings: ['qr']`) | |
| Ecrã ligado | `expo-keep-awake` | Durante um assalto o ecrã não pode apagar. |
| Orientação | `expo-screen-orientation` | Portrait fixo, levantado só no ecrã de assalto (ver *Alvos*). |
| Áudio/vibração | `expo-haptics` + `expo-av` | Fim de tempo tem de ser percetível sem olhar. |
| i18n | `i18next` + `react-i18next` | `en` é o idioma inicial; `pt-PT` carregado mas sem troca na interface. |
| Testes | Jest + React Native Testing Library; **MSW** para a API | |
| E2E | Maestro | Fluxos de [§12](#12-testes-e-critérios-de-aceitação). |
| Qualidade | ESLint + Prettier + `tsc --noEmit` em CI | |

### Alvos

- **iOS 15+**, **Android 8+ (API 26)**.
- Telemóvel, **portrait** — exceto o **ecrã de assalto** (e o modo cronómetro autónomo), que aceita
  também *landscape*. O bloqueio é feito em código, não em `app.json`: portrait fixo no arranque,
  levantado enquanto o ecrã de assalto estiver montado. Tablet funciona mas não é otimizado.
- Sem *tablet split-view*. Nenhum outro ecrã roda.

### Convenções

- Sem `any`. O contrato de API vive em `src/api/types.ts` e é a única fonte de verdade de tipos.
- Toda a chamada HTTP passa pelo cliente único de `src/api/client.ts`. Nenhum `fetch` solto.
- Nenhuma string visível ao utilizador *hardcoded* em componentes — tudo por `t()`.

---

## 5. Contrato de API

> **O contrato vive num documento próprio: [`app-arbitragem-api-contract.md`](app-arbitragem-api-contract.md)** —
> transporte e cabeçalhos, envelope de erro, idempotência e *retry*, polling/ETag, sessão e
> expiração, endpoints, catálogo de erros e payload do QR/PIN.

Regras de trabalho:

- O ficheiro está **em duplicado, byte a byte igual**, nos dois repositórios:
  `docs/app-arbitragem-api-contract.md` na plataforma, `docs/API-CONTRACT.md` na app.
- **Alterar o contrato primeiro, implementar depois** — nos dois lados. Código que diverge do
  contrato é *bug*, seja qual for o lado que o escreveu.
- `src/api/types.ts` é tipado diretamente a partir do contrato e não contém mais nada.
- A app **ignora campos que não conhece** e nunca falha por os receber. É isto que torna seguro o
  servidor acrescentar campos (versão *minor* do contrato).

### O essencial, em cinco linhas

| | |
|---|---|
| Base | `{base_url}/api/v1`, HTTPS, JSON, sem cookies |
| Auth | `Authorization: Bearer <token>` — token de **âmbito de uma competição** (`scope: poule` \| `tournament`), 60 min deslizantes, sem *refresh* |
| Endpoints | `POST /connect` · `GET /poules/{uuid}/bouts` · `.../standings` · `.../elimination` · `GET /tournaments/{uuid}/elimination` · `GET /bouts/{id}` e `/elimination/{id}` · `POST .../start` e `.../score` · `GET/DELETE /session` |
| Erros | `{ code, message, errors? }` — a app só faz lógica sobre `code`, nunca sobre `message` |
| Sincronização | Polling de 10 s com `If-None-Match`/`ETag`; sem *push* |

---

## 6. Máquina de estados e ecrãs

### Estados da sessão

```
        ┌─────────────┐
        │ DISCONNECTED│◄───────────────────────┐ 401 / logout / código novo
        └──────┬──────┘                        │
               │ connect ok                    │
       ┌───────┴────────┐                      │
 scope=poule      scope=tournament             │
       │                │                      │
 ┌─────▼──────┐   ┌─────▼──────┐               │
 │   POULE    │   │  BRACKET   ├───────────────┘
 └─────┬──────┘   └─────┬──────┘
       │ poule.locked = true, e há quadro
       ├────────────────►│
       │
       │ locked sem quadro         ┌──────────────┐
       ├──────────────────────────►│  READ_ONLY   │
       │                           └──────────────┘
       │ competição encerrada      ┌──────────────┐
       └──────────────────────────►│   COMPLETE   │
                                   └──────────────┘
```

`POULE` e `BRACKET` são **fases da mesma sessão**, não sessões diferentes: a transição acontece
sozinha quando um *poll* traz `locked: true` com `elimination` preenchido, e não pede código novo.

`READ_ONLY` e `COMPLETE` continuam a mostrar o que havia; só a escrita está fechada. `COMPLETE` é
sempre precedido de um `401 poule_complete`, que só chega quando a competição está encerrada para
sempre — assaltos feitos **e** quadro decidido.

### Ecrãs

**1. Ligar** (`/connect`)
- Câmara em ecrã cheio com moldura de leitura; permissão pedida no primeiro uso, com explicação e
  caminho para as Definições se for negada.
- Botão "Introduzir PIN" → teclado numérico, 6 dígitos, com casas desenhadas e *caret* próprio.
- Terceira via: **"Só cronómetro"** → `/timer`, o assalto sem poule do [§2](#2-âmbito-da-app).
- **Sem campo de URL do servidor.** O `base_url` vem do QR ou do valor por omissão; um campo de texto
  livre à frente de quem só quer escrever 6 dígitos é ruído, e editável por engano. Apontar a app a
  outro servidor à mão é assunto de um ecrã de definições, se algum dia for preciso.
- Estados: a ligar / PIN inválido / bloqueado até HH:MM / sem rede.
- Fallbacks de leitura do QR: ver o contrato, §9.

**2. Lista de assaltos** (`/poule`)
- Cabeçalho: nome da poule, torneio, progresso `4/15`, indicador de sessão (tempo restante), estado
  de rede.
- Lista ordenada por `sequence`, cada linha: `#seq`, `Nº nome (clube)` vs `Nº nome (clube)`, estado.
  - `pending` — neutro, tocável.
  - `in_progress` — destacado.
  - `done` — resultado `5–3`, esbatido, tocável só para consulta.
- **Destaque do próximo**, só quando `poule.ordered` é `true`: primeiro `pending` por `sequence` fica
  no topo visual com botão "Começar". Com `ordered: false` (poule isolada) não há "próximo" — a lista
  é plana e qualquer `pending` é tocável, porque a ordem não tem valor regulamentar e desloca-se
  sempre que o plantel muda.
- *Pull to refresh*. Polling de 10 s.
- Banner permanente quando `READ_ONLY` ou offline com fila pendente.

**3. Assalto** (`/bout/[id]`)
- Nomes e números dos dois atletas, em grande, lado a lado (A à esquerda, B à direita) — mesma ordem
  que a API devolve, sempre.
- **Cronómetro** central, grande, legível a 2 m. Ver [§7](#7-cronómetro).
- Contadores de toques: `+`/`−` por atleta, alvo `target` visível. `−` nunca abaixo de 0; `+` nunca
  acima de `target`.
- **Submeter** — desativado enquanto `a === b` (`allow_draw: false`), com o motivo escrito por baixo.
- Confirmação antes de submeter: *"Registar 5–3 para Ana Silva?"* — um resultado errado só se corrige
  na web.
- Sair com resultado por submeter → pede confirmação.

**4. Conflito (409)** — folha modal, não ecrã
- *"Este assalto já foi registado por outra pessoa: **4–5**, às 17:31."*
- Ações: **Voltar à lista** (primária) · **Ver assalto**.
- Sem opção de forçar. Corrigir é trabalho da plataforma web.

**5. Quadro de eliminatórias** (`/bracket`)
- Ronda a ronda, cada combate: `Nome (clube)` vs `Nome (clube)`, estado, resultado se já houver.
- **Combates com `ready: false` aparecem mas não abrem** — o lugar ainda espera o vencedor da ronda
  anterior. A app mostra-os por preencher em vez de os esconder: é assim que o árbitro vê o caminho.
- Abrir um combate leva ao **mesmo ecrã de assalto**, com os presets do quadro (15 toques,
  3 períodos, descanso entre eles). Nada na condução do assalto muda por ser eliminatória.
- Chega-se aqui por duas vias: `scope: "tournament"` no *connect*, ou a poule fechar com quadro
  gerado. Com uma poule ligada, a lista de assaltos e o quadro coexistem e alternam-se.
- Registar um resultado **faz subir o vencedor** — do lado do servidor. A app descobre o quadro novo
  no *poll* seguinte; não o recalcula.

**6. Competição completa** (`/complete`)
- *"Competição completa."* Sessão terminada. Botão "Ligar a outra competição".

### Navegação

```
Ligar ──► Lista ──► Assalto ──► (submeter) ──► Lista
                        └─────► Conflito ────► Lista
Ligar ──► Quadro ─► Combate ─► (submeter) ──► Quadro
Lista ──(poule fechada, há quadro)──► Quadro
Lista/Quadro ──► Completa ──► Ligar
qualquer ──401──► Ligar
```

---

## 7. Cronómetro

O cronómetro é **local e autoritário**. O servidor não cronometra e não é consultado durante o assalto.

### Regras

- Conta **decrescente** a partir de `duration_seconds`.
- Estados: `idle` → `running` → `paused` → `expired`. Reiniciável enquanto o assalto não for submetido.
- Toque no cronómetro alterna *iniciar/parar* — o alvo tocável tem de ser generoso (≥ 96 pt).
- O **primeiro** `running` de um assalto dispara `POST /bouts/{id}/start` (*fire-and-forget*).
- Ao chegar a `00:00`: som + vibração + estado `expired`. **Não** submete nada automaticamente.
- Atingir `target` toques **não** para o cronómetro automaticamente — só o destaca. Quem decide é o
  árbitro.
- `periods > 1`: mostra `Período 1/3`; ao esgotar um período, para e espera confirmação manual para
  o seguinte. (Preparado, mas raro em poule, onde `periods` é `1` por omissão.)
- **Não há descanso entre períodos numa poule** — por isso o contrato não envia tempo de descanso.
  Esgotado o último período, passa-se diretamente a **morte súbita**: mais um período de
  `sudden_death_seconds` (`60` por omissão, **vindo da API** como todos os outros tempos — não
  *hardcoded*), prioridade sorteada, quem toca primeiro ganha. A regra é conduzida pela app; o
  servidor não a conhece. Na linha temporal, a morte súbita é `period = periods + 1`.
- `expo-keep-awake` ativo enquanto o cronómetro corre; desativado ao sair do ecrã.

### Precisão

**Não** decrementar um contador a cada *tick* — acumula erro e perde tempo em *background*.

```ts
// Guardar o instante de arranque e derivar sempre o restante do relógio monotónico.
const startedAt = performance.now();          // monotónico, imune a mudanças de hora
const remaining = () => durationMs - elapsedBeforeThisRun - (performance.now() - startedAt);
// Render a ~10 Hz para o dígito dos décimos; a fonte de verdade é a expressão acima.
```

Ao voltar do *background*, o valor recalcula-se sozinho e está correto — sem código de reconciliação.
Requisito: **≤ 100 ms de desvio** ao fim de 3 minutos, incluindo 30 s em *background*.

### Legibilidade

- `MM:SS` acima de 10 s; `SS,d` (décimos) nos últimos 10 s.
- Fonte tabular (`fontVariant: ['tabular-nums']`) — sem os dígitos a saltar.
- Contraste alto; o pavilhão tem luz má e o telemóvel está a um braço de distância.

---

## 8. Offline e fila de submissões

Rede de pavilhão cai. **Perder um resultado registado é inaceitável.**

### O que entra na fila

**Só** os registos de resultado — `POST /bouts/{id}/score` e `POST /elimination/{id}/score`. Tudo o
resto (`start`, `GET`) falha em silêncio ou tenta de novo mais tarde — nada disso é dado do árbitro.

### Comportamento

1. Falha de rede ou 5xx → a submissão vai para uma fila **persistente FIFO** (MMKV), com
   `{ submission_id, kind: 'bout'|'match', target_id, a, b, competition_uuid, queued_at }`.

   O **`submission_id` é gerado quando o árbitro confirma o resultado**, não quando o item é enviado,
   e é o mesmo em todas as tentativas. Gerá-lo no envio anulava a idempotência: cada *retry* seria
   uma submissão nova aos olhos do servidor, que é exatamente o falso `409` que a chave existe para
   evitar (contrato §4).
2. A app confirma ao árbitro: *"Resultado guardado. Vai ser enviado quando houver rede."* — não
   finge que enviou.
3. O assalto aparece na lista como **"por enviar"** (estado local, distinto de `done`).
4. A fila é drenada **por ordem** quando: a rede volta (`expo-network` / `NetInfo`), a app volta ao
   *foreground*, ou de 30 em 30 segundos.
5. Cada item drena com o *retry*/*backoff* definido no contrato (§4), que garante que uma
   re-submissão do mesmo resultado pela mesma sessão devolve **200** em vez de um 409 falso.
6. Resultado do drenar:
   - `201`/`200` → remove da fila, atualiza a lista.
   - `409` → remove da fila e **notifica**: *"O assalto Nº2 vs Nº3 já tinha sido registado por outra
     pessoa (4–5). O teu registo não foi aplicado."*
   - `404` → remove da fila, **notifica** e faz *refetch* da lista: *"O assalto Nº2 vs Nº3 já não
     existe — um dos atletas foi removido da poule. O resultado não foi guardado."* Acontece quando
     um atleta é removido na web enquanto o resultado esperava por rede; sem esta regra a app ou
     tenta para sempre, ou deita o resultado fora em silêncio.
   - `422` → remove da fila e reporta como erro (não vai passar a valer com o tempo).
   - `401` → **para de drenar e mantém a fila**. Volta a ligar-se → retoma.

### Limites

- Fila máxima: 50 itens (uma poule de 12 tem 66 assaltos; 50 pendentes já é catástrofe operacional).
- Itens com mais de **24 h** são descartados com aviso ao abrir a app.
- A fila é **por poule**. Ligar a uma poule diferente com fila pendente noutra → aviso explícito
  antes de prosseguir.

---

## 9. Segurança

- **Token em `expo-secure-store`** (Keychain / Android Keystore). Nunca `AsyncStorage`, nunca em
  ficheiro, nunca em log.
- **Nunca registar** o token, o PIN ou o payload do QR — nem em `console.log`, nem em Sentry/*crash
  reports*. Filtro explícito no reporter.
- **HTTPS obrigatório.** `http://` só é aceite quando `__DEV__ === true` **e** o *host* é `localhost`,
  `127.0.0.1` ou `10.*`/`192.168.*`. Em *release*, `http://` é rejeitado com mensagem clara.
- **Sem SSL pinning** na v1 — impede *self-hosting*, que é um objetivo explícito. Reavaliar se surgir
  um domínio único obrigatório.
- **Sem cookies, sem CSRF.** Sanctum em modo token com cliente nativo não usa sessão *stateful* nem
  `csrf-cookie`. O cliente HTTP não guarda cookies.
- **Âmbito mínimo:** o token só permite ler e pontuar **a competição que o emitiu** — uma poule (com
  o quadro dela) ou um torneio (só o quadro dele). Um `403 poule_scope_mismatch` — ou o `404` que o
  servidor devolve em vez dele, para não revelar que ids existem — indica *bug*: reportar, não
  contornar.
- **Sem dados pessoais persistidos** além de nomes de atletas em cache volátil. Sem analytics de
  utilizador na v1.
- Ao terminar sessão (manual, 401 ou poule completa): apagar token e cache; **manter a fila** de
  submissões pendentes ([§8](#8-offline-e-fila-de-submissões)).

---

## 10. Mock server — desbloquear a app

A API não existe. **O desenvolvimento da app não espera pelo servidor.**

- **MSW** (`msw` + `msw/native`) implementa o contrato por inteiro em `src/mocks/handlers.ts`, ativo
  com `EXPO_PUBLIC_API_MOCK=1`.
- *Fixtures*: poule de 6 atletas (15 assaltos), com nomes e clubes portugueses realistas.
- Cenários acionáveis por PIN, para testar sem servidor:

| PIN | Cenário |
|---|---|
| `111111` | Poule normal, 6 atletas, 0 assaltos feitos |
| `222222` | Poule a meio (7/15 feitos) |
| `333333` | Poule bloqueada (`locked: true`) |
| `444444` | Poule a um assalto do fim (testa `poule_complete`) |
| `555555` | Todos os `score` devolvem **409** |
| `666666` | Rede intermitente: 50% dos pedidos falham (testa fila e *retry*) |
| `000000` | PIN inválido |

Os mesmos *handlers* servem os testes de integração — o contrato é testado uma vez só.

**Contrato de aceitação:** quando a API real ficar pronta, trocar `EXPO_PUBLIC_API_MOCK=0` deve
bastar. Qualquer divergência encontrada nesse momento é *bug de contrato* e resolve-se **atualizando
o documento de contrato primeiro**, depois os dois lados.

---

## 11. Estrutura do repositório

```
poole-referee-app/
├── app/                      # rotas (expo-router)
│   ├── _layout.tsx
│   ├── connect.tsx           # §6 ecrã 1
│   ├── poule.tsx             # §6 ecrã 2
│   ├── bout/[id].tsx         # §6 ecrã 3
│   ├── bracket.tsx           # §6 ecrã 5 — quadro de eliminatórias
│   ├── match/[id].tsx        # combate do quadro; reusa o ecrã de assalto
│   ├── timer.tsx             # §2 modo cronómetro autónomo
│   └── complete.tsx          # §6 ecrã 6
├── src/
│   ├── api/
│   │   ├── client.ts         # fetch único: headers, envelope de erro, retry, ETag
│   │   ├── endpoints.ts      # uma função por endpoint do contrato
│   │   ├── types.ts          # tipos do contrato — fonte de verdade
│   │   └── errors.ts         # ApiError + catálogo de erros do contrato
│   ├── session/
│   │   ├── store.ts          # zustand: token, base_url, poule, expires_at
│   │   └── secureStorage.ts
│   ├── queue/
│   │   ├── store.ts          # fila persistente §8
│   │   └── drain.ts
│   ├── timer/
│   │   ├── useTimer.ts       # cronómetro monotónico §7
│   │   └── feedback.ts       # som + háptica
│   ├── qr/parse.ts           # payload do QR, com fallbacks
│   ├── bout/                 # regras FIE locais: cartões, prioridade, fases, passividade
│   ├── i18n/en.json          # idioma inicial; pt-PT.json ao lado
│   ├── mocks/handlers.ts     # §10
│   └── ui/                   # componentes partilhados
├── e2e/                      # Maestro
├── docs/
│   ├── API-CONTRACT.md       # cópia byte a byte do contrato da plataforma
│   ├── CLIENT-SPEC.md        # cópia deste documento
│   └── DECISIONS.md          # ADRs
└── README.md
```

O `README.md` tem de responder, em cinco minutos, a: como correr com mocks, como correr contra um
servidor local, como gerar *build* de teste, e onde está o contrato.

---

## 12. Testes e critérios de aceitação

### Unitários

- `qr/parse` — payload v1, PIN nu, `v` desconhecida, lixo, `http://` em *release*.
- `timer` — desvio ≤ 100 ms em 3 min; pausa/retoma; *background* de 30 s; chegada a 0.
- `queue` — FIFO, persistência entre arranques, limite de 50, expiração de 24 h, drenar com 409/422/401.
- `api/errors` — mapeamento HTTP+`code` → `ApiError`; `code` desconhecido não faz *crash*; campo
  desconhecido numa resposta não faz *crash*.

### Integração (MSW)

- Connect feliz → lista carregada.
- Connect com PIN inválido → 422 tratado, ecrã mantido.
- Connect com *throttle* → campo bloqueado até `Retry-After`.
- Submeter → 201 → lista atualizada e progresso incrementado.
- Submeter → 409 → modal de conflito com o resultado atual, sem *retry*.
- Submeter → *timeout* → *retry* com o **mesmo `submission_id`** → 200 → **sem** falso conflito.
- 401 a meio com fila pendente → reconectar → drenar **com token novo** → 200, **não** 409. É o
  cenário que a chave de idempotência existe para cobrir, e o que a regra antiga por token falhava.
- Poule `locked` **com** quadro → app passa ao quadro sem voltar a ligar.
- Poule `locked` **sem** quadro → escrita desativada, banner presente.
- Connect com `scope: "tournament"` → vai direto ao quadro, sem lista de assaltos.
- Combate com `ready: false` → não abre; depois de o anterior ser registado, abre.
- Último combate do quadro → 201 → `401 poule_complete` no pedido seguinte → ecrã de completa.
- ETag → 304 não altera a lista nem pisca a UI.

### E2E (Maestro)

1. Scan de QR → lista → começar assalto → cronómetro → toques → submeter → volta à lista com `done`.
2. Modo avião a meio de uma submissão → resultado guardado → rede volta → enviado automaticamente.
3. Dois dispositivos na mesma competição → o segundo recebe `token_revoked`.
4. Poule até ao fim → organizador gera o quadro → a app passa ao quadro e arbitra um combate.

### Critérios de aceitação da v1

- [ ] Ligar por QR **e** por PIN, contra servidor real.
- [ ] Lista completa, ordenada, com estado correto, a atualizar sozinha.
- [ ] Assalto conduzido de ponta a ponta: cronómetro, toques, submissão, confirmação.
- [ ] 409 apresentado com o resultado vencedor e sem forma de forçar.
- [ ] Perder rede a meio **não perde** nenhum resultado registado.
- [ ] Sessão expirada devolve ao ecrã de ligar com a razão escrita, sem *crash* e sem perder a fila.
- [ ] Poule bloqueada e competição completa têm ecrã próprio, não uma mensagem de erro.
- [ ] **Quadro de eliminatórias arbitrado de ponta a ponta**, da poule e do torneio, com o vencedor a
      subir de ronda entre *polls*.
- [ ] **A transição poule → quadro acontece sozinha**, sem pedir código novo.
- [ ] Token nunca aparece em logs nem em *crash reports* (verificado à mão).
- [ ] Cronómetro legível a 2 m e com desvio ≤ 100 ms em 3 min.
- [ ] Tudo em `en`, sem strings *hardcoded* em componentes.

---

## 13. Dependências no servidor (o que a plataforma tem de entregar)

A app está bloqueada em tudo o que se segue. Ordem de dependência, não de importância:

| # | Entrega | Bloqueia | Estado (2026-07-25) |
|---|---|---|---|
| 1 | Modelo de assaltos com **id estável**, `sequence` e `status`, gerados e regerados a cada alteração de plantel | Tudo. É o alicerce. | ✅ feito — id inteiro, não opaco |
| 2 | Serviço de ordem de assaltos (tabelas FIE 4–12 **ou** *round-robin*) | `sequence` | ✅ feito |
| 3 | Colunas de preset `duration_seconds` e `periods` na poule (hoje só existe `touch_cap`) | Cronómetro | ✅ feito (falta `sudden_death_seconds`) |
| 4 | Sanctum em modo token + `personal_access_tokens` polimórfica + `HasApiTokens` no model `Poule` | Auth | ✅ feito |
| 5 | Campo PIN de árbitro na poule + geração/rotação + `throttle` | `/connect` | ✅ feito — PIN de **uso único** |
| 6 | Registar `api:` no `withRouting()` do `bootstrap/app.php` + criar `routes/api.php` | Todos os endpoints | ✅ feito — **sem prefixo `v1`** |
| 7 | Os endpoints do contrato, com o envelope de erro e os `code` do catálogo | — | ⚠️ URLs e formas diferentes; **sem `code`** |
| 8 | **Concorrência 409** no `score` (hoje a plataforma faz *overwrite* silencioso — é lógica nova) | Conflitos | ✅ feito (sem `current` no corpo) |
| 9 | Regra de *retry* seguro: mesmo token + mesmo resultado → **200**, não 409 | Fila offline | ❌ por fazer — **bloqueia a fila** |
| 10 | `X-Session-Expires-At` em todas as respostas autenticadas | Aviso de expiração | ❌ por fazer |
| 11 | `ETag` / `If-None-Match` em `GET /poules/{uuid}/bouts` | Polling barato | ❌ por fazer |
| 12 | Invalidação automática do token quando a competição fica encerrada | Ecrã de conclusão | ✅ feito |
| 13 | Geração do QR na web com o payload do contrato (a plataforma já tem `chillerlan/php-qrcode`) | Emparelhamento | ⚠️ QR só com os 6 dígitos |
| 14 | `POST /bouts/{id}/start` e `POST /elimination/{id}/start` — hoje é o `GET` do detalhe que muda o estado | "Joga agora" sem efeitos laterais | ❌ por fazer |
| 15 | `submission_id` guardado com o resultado (assalto e combate), e a matriz 201/200/409 | **Fila offline** | ❌ por fazer |
| 16 | `scope` no `connect` e no `session`, mais `PouleSummary` / `TournamentSummary` | Saber o que abrir | ❌ por fazer |
| 17 | Endpoints de eliminatória com as URLs e as formas do contrato | Arbitrar o quadro | ⚠️ existem, com outra forma |
| 18 | PIN deixa de se gastar na ligação | Voltar a ligar sem o organizador | ❌ por fazer |

**Ordem prática:** 1–3 (modelo) → 4–6 (infraestrutura) → 7–9 e 15–18 (endpoints) → 10–14 (afinação).
A app pode desenvolver-se por inteiro contra os mocks até 7 estar pronto.

> O detalhe de cada ⚠️ e ❌ — o que o servidor faz hoje, o que custa à app e a correção proposta —
> está em **§11 do contrato**. Esta coluna é só o resumo.

### Notas de compatibilidade que o servidor não pode partir

- A poule é exposta por **UUID**, não por id numérico (a plataforma já usa UUID como chave de rota).
- O `score` reaproveita a lógica de escrita existente (transação, linhas espelhadas, verificação de
  bloqueio). **Não** escrever direto na base de dados a partir do controlador da API.
- CORS e CSRF **não** são problema: Sanctum em modo token com cliente nativo não usa cookies
  *stateful* nem `csrf-cookie`.
- A auth web continua a ser *session-based* e **coexiste** com a API — a API não depende da sessão.

---

## 14. Fases de entrega

| Fase | Conteúdo | Depende de |
|---|---|---|
| **F0 — Andaimes** | Repo, Expo, TS, ESLint, CI, i18n, MSW ([§10](#10-mock-server--desbloquear-a-app)), tipos do contrato | nada |
| **F1 — Ligar** | Ecrã de ligar, scan de QR, PIN manual, `secure-store`, tratamento de 422/429 | F0 |
| **F2 — Lista** | Lista de assaltos, polling + ETag, *pull to refresh*, estados vazio/erro | F1 |
| **F3 — Assalto** | Cronómetro [§7](#7-cronómetro), contadores, `start`, submissão, confirmação | F2 |
| **F4 — Resiliência** | Fila offline [§8](#8-offline-e-fila-de-submissões), 409, expiração, poule bloqueada, poule completa | F3 |
| **F5 — Real** | Ligar ao servidor real, resolver divergências de contrato, E2E, *builds* internas | F4 + servidor §13.7 |
| **F6 — Polimento** | Acessibilidade, som/háptica, legibilidade em sol, ecrãs de erro, *store* | F5 |

F0–F4 correm **inteiramente contra os mocks** e não dependem do trabalho do servidor.

---

## 15. Glossário

| Termo | Inglês | Notas |
|---|---|---|
| Assalto | *bout* | Combate entre dois atletas |
| Poule | *pool* | Grupo todos-contra-todos. No código da plataforma é `poole`/`Poole` (com "o") — mantido por compatibilidade histórica; nas URLs da API é `poules`. |
| Toque | *touch* | Ponto |
| Atleta / esgrimista | *fencer* | Na base de dados da plataforma é `player` dentro de uma poule e `athlete` ao nível do torneio |
| Indicador | *indicator* | Toques dados menos recebidos; critério de desempate |
| V/M | — | Vitórias a dividir por assaltos disputados; primeiro critério de classificação |
| Eliminatória | *direct elimination* | Quadro a eliminar. Arbitrável pela app desde o contrato `1.4.0` |
| Pista | *piste* | Onde se joga. A app não a modela na v1 |

---

## Referências

- [`app-arbitragem-api-contract.md`](app-arbitragem-api-contract.md) — **o contrato de API** (fronteira partilhada)
- `docs/app-arbitragem-spec.md` — visão de produto e trabalho do lado do servidor
- `docs/fie-classificacao-poule.md` — classificação FIE (V/M, indicador)
- [FIE Organisation Rules (Dez 2025)](https://static.fie.org/uploads/38/190670-Organisation%20rules%20ang.pdf)
- [USA Fencing — Order of Bouts (poules de 4–12)](https://cdn1.sportngin.com/attachments/document/0034/5494/bout_order.pdf)
