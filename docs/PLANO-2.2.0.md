# Contrato `2.2.0` — dois árbitros no mesmo código · plano

**Data:** 2026-07-30 · **Estado: executado** · Baseado em `docs/API-CONTRACT.md` §6, §11 A17 e no
changelog da `2.2.0`, contra o código de então (`API_CONTRACT_VERSION = '2.1.1'`).

> ✅ **Executado a 2026-07-30.** M1 a M5 estão feitos: 391 testes verdes (eram 375), `typecheck` e
> `lint` limpos. As duas questões que a §3.3 deixava em aberto foram **as duas decididas a favor** —
> a *copy* corrigida e o banner feito —, e o que mudou a meio está na §7. O raciocínio ficou no
> [ADR-036](DECISIONS.md); a especificação reflete o resultado ([`CLIENT-SPEC.md`](CLIENT-SPEC.md)
> §6 ecrãs 2 e 3, e a F10 da §14).
>
> ⚠️ **O contrato foi tocado, e tem de ser copiado para o outro repositório.** A `2.2.1` — PATCH de
> redação, como a `2.0.1` e a `2.1.1` foram — regista o lado da app na §11 F e corrige a coluna do
> `401 token_revoked` no §8. `docs/API-CONTRACT.md` vive em duplicado **byte a byte**: a cópia da
> plataforma tem de receber o mesmo ficheiro, senão as duas divergem.

> **O contrato diz que "a app não muda uma linha", e diz bem — no que os dois lados trocam.** Nenhum
> campo muda de forma, nenhum endpoint muda de assinatura, nenhum `type` novo aparece. Uma app na
> `2.1.1` fala com este servidor sem erro nenhum.
>
> **O que muda é uma coisa que a app assumia sem nunca a ter escrito:** que uma poule tem **no
> máximo um** assalto `in_progress`, porque era o servidor que garantia isso a despromover os
> outros. Deixou de garantir. A app continua correta e passa a estar **errada no ecrã** — o cartão
> do topo da lista pode apontar para o assalto que o árbitro da pista ao lado está a arbitrar, com
> um botão "Retomar" que leva lá dentro. É esse o trabalho todo deste plano.

> **O contrato não se altera daqui.** `docs/API-CONTRACT.md` vive em duplicado, byte a byte, nos
> dois repositórios e a `2.2.0` já lá está escrita pelo lado da plataforma. Este plano executa **o
> lado da app**, que é a `CLIENT-SPEC.md` — a §6 já foi atualizada, a fase nova (F10) ainda não.

---

## 1. O que muda no contrato, e o que isso faz à app

| # | Mudança do servidor | Consequência para a app |
|---|---|---|
| 1 | **`POST /connect` deixa de invalidar o token anterior** — N dispositivos no mesmo PIN | Nenhuma no código. O `401 token_revoked` passa a querer dizer **só** "o código foi rodado" — e a *copy* que a app mostra passa a ser uma meia-verdade (§3.3) |
| 2 | **`POST /bouts/{bout}/start` deixa de despromover os outros** — N assaltos `in_progress` na mesma poule | **A aresta real.** `currentBout()` devolve o primeiro `in_progress` da lista, que pode não ser o desta app (§2) |
| 3 | Não há repartição, atribuição nem reserva de assaltos | Nada a fazer: o `409 bout_already_scored` já está tratado desde a `1.0.0` — `isConflict()` em `src/api/errors.ts`, folha de conflito no `BoutScreen` |
| 4 | Rodar o código expulsa **todos** os dispositivos | Nada a fazer: um `401` é um `401`, e o caminho de saída — voltar a ligar — é o mesmo |
| 5 | `now_fencing`/`up_next` passaram a coleções | Nada: é da web, não é da API da app |

**Só a linha 2 custa código.** As outras são leitura de contrato: confirmar que o que já existe
continua certo, e escrever que se confirmou.

---

## 2. A aresta real — o cartão do topo pode ser de outra pista

`src/poule/status.ts`, hoje:

```ts
export function currentBout(bouts: Bout[]): Bout | undefined {
  return bouts.find((bout) => bout.status === 'in_progress') ?? firstPending(bouts);
}
```

Isto foi escrito quando "o assalto a decorrer" e "o meu assalto" eram a mesma coisa, porque o
servidor só deixava haver um. Com dois árbitros na mesma poule:

| Situação | O que a app faz hoje | O que devia fazer |
|---|---|---|
| Árbitro 1 na pista A começa o `#1`; este dispositivo ainda não começou nada | O cartão do topo mostra o `#1` com **"Retomar"**, e o `up_next` desaparece da lista — este árbitro fica sem nada que lhe diga qual chamar | Cartão no primeiro `pending`, com **"Começar"** |
| Este dispositivo está no `#4`; o árbitro 1 começa o `#1`, que vem primeiro na lista | O cartão salta do `#4` para o `#1` a meio da arbitragem, por um *poll* de 10 s | Cartão fica no `#4` |
| Este dispositivo acaba o `#4`; o `#1` do árbitro 1 continua a decorrer | O cartão agarra-se ao `#1` | Cartão no primeiro `pending` |

O `onDeckBout()` não sofre: já só olha para `status === 'pending'`, e um assalto a decorrer noutra
pista fica de fora sozinho. A **lista** também não sofre, e é deliberado — a `CLIENT-SPEC.md` §6 já
o diz: um `#1` marcado "A decorrer" é informação verdadeira e útil a quem está na outra pista. O que
não pode acontecer é a app **propor uma ação** sobre ele.

**Não há campo no contrato que responda a isto.** O `scored_by_me` é do resultado, não do estado, e
o contrato diz à letra que não há repartição nem atribuição. Quem sabe qual é o assalto deste
dispositivo é **o próprio dispositivo**: foi ele que chamou o `POST /bouts/{bout}/start`.

---

## 3. Decisões antes de escrever código

### 3.1 "O meu assalto" é memória local, e guarda-se em disco

A app regista o `id` do assalto em que **ela** chamou o `start`, por pista (`competitionKey`), e
guarda-o em `AsyncStorage` — o mesmo caminho da fila de submissões, e pela mesma razão: a app é
morta em *background* a meio de uma poule com regularidade operacional, e voltar sem memória é
voltar ao comportamento errado.

### 3.2 Sem memória, mantém-se o comportamento de hoje

Um dispositivo que nunca começou nada nesta pista **não sabe** se o `in_progress` que vê é dele —
pode ser dele antes de uma reinstalação. Aí assume-se que é, que é o que a app faz hoje e o que
acerta no caso de um árbitro só, que continua a ser o normal.

A memória, portanto, guarda o último assalto começado **mesmo depois de ele ficar `done`**: é isso
que distingue "nunca arbitrei aqui" (adivinha-se) de "arbitrei e acabei" (o `in_progress` que resta
não é meu). Três ramos, e é toda a regra:

```
o meu, se estiver in_progress
  ↳ senão, se já arbitrei aqui   → primeiro pending
  ↳ senão (nunca arbitrei aqui)  → primeiro in_progress ?? primeiro pending
```

### 3.3 As duas que ficavam em aberto — **decididas as duas a favor**

| Questão | O que estava em jogo, e o que se fez |
|---|---|
| **A *copy* do `token_revoked`** — "Outro dispositivo assumiu esta pista" deixou de ser verdade: agora só há uma maneira de o apanhar, que é o código ter sido rodado. O contrato §8 escrevia à letra que "o texto passa a ser uma meia-verdade que a `2.3.0` corrigirá" | ✅ **Corrigida.** É uma linha em `src/i18n/pt-PT.json` e outra em `en.json`, e é inteiramente do lado da app; esperar por uma `2.3.0` era deixar em produção uma frase que manda o árbitro perguntar a coisa errada ao organizador. A coluna do §8 do contrato foi sincronizada na `2.2.1` — e a cópia da plataforma tem de receber o mesmo ficheiro |
| **Avisar ao abrir um assalto que decorre noutra pista** — um banner no `BoutScreen`, informação e nunca proibição, como o contrato exige | ✅ **Feito**, e entrou como marco a mais: `startedElsewhere` no `BoutAssignment`, banner no `BoutScreen`, três testes no `bout-screen.test.tsx`. Não é preciso para a correção — quem submeter primeiro leva o assalto e o segundo apanha o `409` —, mas é o que evita dois árbitros a arbitrarem o mesmo assalto sem nenhum deles dar por isso até à submissão. Custou um banner e duas chaves de i18n. **Só aparece quando a app sabe** que o assalto não é dela (§6) |

---

## 4. Marcos

### M1 — A memória do assalto deste dispositivo (`src/poule/refereeing.ts`, novo)

1. Store `zustand` com um mapa `competitionKey → boutId`, persistido em `AsyncStorage` sob
   `poole.referee.refereeing.v1`, no molde do `src/queue/store.ts`: memória primeiro, disco atrás.
2. `markStarted(competitionKey, boutId)` e um seletor `startedBoutId(competitionKey)`.
3. Limpeza: a entrada de uma pista sai quando a sessão dela termina — o `disconnect()` do
   `session/store.ts` e o `401` do ouvinte de sinais. Um mapa que só cresce é uma fuga lenta.

**Verificar:** teste de unidade — grava, relê de disco, apaga ao desligar.

### M2 — A regra dos três ramos (`src/poule/status.ts`)

1. `currentBout(bouts, mine?: { boutId: string | null; refereedHere: boolean })` implementa a §3.2.
   O parâmetro é **opcional**: sem ele a função é exatamente o que é hoje, e é assim que os testes
   existentes continuam a valer.
2. `onDeckBout` e `boutStates` passam o mesmo argumento adiante. O `boutStates` não muda de regra:
   um assalto `in_progress` continua a mostrar-se `in_progress`, seja de quem for — o que muda é
   quem é o `up_next`, que volta a existir quando o `in_progress` visível não é deste dispositivo.

**Verificar:** `npm test` — e os casos novos do M4 vermelhos antes, verdes depois.

### M3 — Ligar os fios (`app/bout/[id].tsx`, `app/poule.tsx`)

1. `app/bout/[id].tsx`: o `onStart` que já faz `void startBout(id)` passa a marcar também a memória
   do M1. É o único sítio onde a app declara "este assalto é meu", e é o certo — é o mesmo instante
   em que o diz ao servidor.
2. `app/poule.tsx`: lê a memória pela `competitionKey` e passa-a ao `currentBout`/`boutStates`.
   Mais nada muda neste ecrã: nem a lista, nem os estilos, nem os *badges*.
3. `app/match/[id].tsx` **não se toca**: um combate de quadro é a sessão inteira e não tem lista.

**Verificar:** `npm run typecheck` e `npm run lint` limpos.

### M4 — Os testes que faltam

| Onde | O caso |
|---|---|
| `src/poule/status.test.ts` | Dois `in_progress`: o cartão é o meu · o meu acabou e sobra o do outro → primeiro `pending` · nunca arbitrei aqui → comportamento de hoje · o `up_next` volta a existir quando o `in_progress` é de outro |
| `src/__tests__/poule-sheet.test.tsx` (ou `regression.test.tsx`) | Com um `in_progress` que não é deste dispositivo, o cartão do topo diz **"Começar"** sobre o primeiro `pending` — e não "Retomar" sobre o assalto do outro |
| `src/__tests__/support/fakeApi.ts` | Poder semear **dois** assaltos `in_progress` na mesma poule; hoje a fixture só conhece um (`inProgressSequence`) |

**Verificar:** `npm test` verde, com os casos novos a falhar contra o código de hoje.

### M5 — O registo escrito

1. `src/api/types.ts`: `API_CONTRACT_VERSION` → `'2.2.0'`, com o comentário a dizer o que a `2.2.0`
   é do ponto de vista da app — não campos novos, mas o fim do pressuposto de que só há um assalto
   em curso.
2. `docs/CLIENT-SPEC.md`: §14 ganha a **F10 — Dois árbitros na mesma poule**; a §6 já está escrita.
   O teste de campo nº 3 já foi atualizado e passa a ter par no código (M4).
3. `docs/DECISIONS.md`: **ADR-036 — Qual dos assaltos em curso é o meu**, com a regra dos três
   ramos, a razão de a memória ser local (não há campo no contrato, e o contrato diz porquê) e a
   razão de ela sobreviver ao assalto ficar `done`.
4. `docs/API-CONTRACT.md`: **não se toca** — salvo a decisão da §3.3 sobre a *copy* do
   `token_revoked`, que se tomada obriga a copiar o ficheiro tal e qual para o lado da plataforma.
5. Este plano passa a **executado**, com o que mudou a meio.

**Verificar:** `npm test`, `npm run typecheck`, `npm run lint`.

---

## 5. O que este plano não faz

| O quê | Porquê |
|---|---|
| Distinguir na **lista** os `in_progress` que não são deste dispositivo | A `CLIENT-SPEC.md` §6 decidiu o contrário, e com razão: para quem está na pista ao lado, "a decorrer" é a informação certa. A app só não pode **propor ações** sobre ele — e isso é o M2. O banner do ecrã de assalto está do mesmo lado da linha: avisa, e não trava |
| Reservar, atribuir ou repartir assaltos entre dispositivos | O contrato §6 fecha a porta, e explica: os esgrimistas estão fisicamente num sítio só |
| Mostrar quantos dispositivos estão agarrados ao código | A API da app não o serve, e quem precisa disso é o organizador, no painel da web (contrato §11 A17) |
| Mexer no `scored_by_me` | Continua a querer dizer *este dispositivo*, que é o que o ecrã de lista quer saber (contrato §4) |

---

## 6. O que mudou a meio

| O quê | Porquê |
|---|---|
| **A memória não se apaga ao terminar a sessão** — o M1 previa limpá-la no `disconnect()` e no `401`. Faz-se por **idade**, 24 h, como a fila | Estava errado: uma sessão que expira ao fim de 60 min sem atividade volta a ligar-se **à mesma poule**, e é aí que a memória mais faz falta. Apagá-la no fim da sessão era apagá-la exatamente no caso que ela existe para cobrir |
| **O banner só aparece quando a app *sabe*** que o assalto não é dela — com a memória vazia, cala-se | Coerência com o terceiro ramo da §3.2: um dispositivo que nunca arbitrou nesta poule assume que o que está em pista é dele. Avisar aí era assustar o caso comum — um árbitro só, depois de uma reinstalação — por causa do raro |
| **A `API_CONTRACT_VERSION` foi a `'2.2.1'`, não a `'2.2.0'`** | É o precedente da F9, que a pôs em `'2.1.1'`: a constante segue a versão do documento, e registar o lado da app **é** uma alteração do documento — PATCH de redação |
| **O parâmetro do M2 é um `startedId: string \| null`**, e não o `{ boutId, refereedHere }` que o plano desenhava | O segundo campo era redundante: guardar o assalto começado **mesmo depois de ele ficar `done`** já responde às duas perguntas de uma vez. Um `null` é "nunca arbitrei aqui"; qualquer id é "arbitrei", e o estado desse assalto na lista diz o resto |
| **O `fakeApi` não precisou de knob nenhum** para semear dois assaltos a decorrer | Os testes de ecrã já mexem no `fakeState.bouts` diretamente — é o que o teste "sem nenhum assalto em pista" já fazia. Uma opção nova no servidor falso seria maquinaria por cima de um `map` de uma linha |
| **O primeiro teste de ecrã foi reescrito** — assertava a tira "a seguir" e passava contra o código antigo | Com dois assaltos a decorrer, o "a seguir" dá o mesmo par nas duas leituras: o primeiro `pending` é o mesmo, esteja o cartão no 4 ou no 5. Passou a premir o botão do cartão e a verificar **para onde ele leva** — que é a diferença que interessa. Os dois testes foram depois postos a correr contra a regra antiga, e os dois falharam, que é o que os torna testes |

---

## 7. Ordem de entrega

Não há nenhuma. A plataforma já serve a `2.2.0` desde 2026-07-30, e o que este plano muda é
**inteiramente local** — nenhuma das alterações é observável pelo servidor. Contra um servidor
anterior à `2.2.0` a app fica exatamente como está hoje: nunca há dois `in_progress`, a memória
aponta sempre para o único, e a regra dos três ramos devolve o mesmo que a linha que substitui.
