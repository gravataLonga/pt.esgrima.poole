# poole-referee-app

App de arbitragem de poules de esgrima. Companion da plataforma `poole.esgrima.pt` — o árbitro liga-se
a **uma** poule por QR ou PIN, conduz os assaltos com cronómetro local e regista os resultados.

Em paralelo, um **modo cronómetro** autónomo: um assalto, offline, sem atletas e sem ligação a nada
([ADR-021](docs/DECISIONS.md)). É para treinos e provas locais, que não têm poule na plataforma.

**Estado: F0 — Andaimes.** O esqueleto navega e desenha os ecrãs com dados de exemplo. Não há rede,
câmara, persistência nem cronómetro a contar. Ver [Onde está cada coisa](#onde-está-cada-coisa).

## Como correr

```sh
npm install
npm start          # depois: i (iOS), a (Android), w (web)
```

Não é preciso servidor: o esqueleto lê a fixture de `src/fixtures/poule.ts`. Qualquer PIN de 6 dígitos
entra.

Quando a F1 trouxer os mocks MSW, passa a haver `EXPO_PUBLIC_API_MOCK=1`; quando a API real existir,
`EXPO_PUBLIC_API_MOCK=0` contra um servidor local.

## Verificação

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest
```

Build real do bundle (apanha erros de Metro que o `tsc` não vê):

```sh
npx expo export --platform ios --output-dir /tmp/export-check
```

## Onde está o contrato

[`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) — **fronteira partilhada** com a plataforma, cópia byte
a byte de `docs/app-arbitragem-api-contract.md` do repositório Laravel. Alterar o contrato primeiro,
implementar depois, **nos dois lados**. Código que diverge do contrato é bug, seja qual for o lado que
o escreveu.

[`docs/CLIENT-SPEC.md`](docs/CLIENT-SPEC.md) — a especificação desta app. É cópia fiel do documento da
plataforma, incluindo as ligações internas que apontam para os nomes de ficheiro de lá.

[`docs/DECISIONS.md`](docs/DECISIONS.md) — decisões técnicas tomadas neste repositório.

`src/api/types.ts` é tipado diretamente a partir do contrato e não contém mais nada.

## Onde está cada coisa

```
app/                    rotas (expo-router)
  connect.tsx           §6 ecrã 1 — ligar por PIN
  poule.tsx             §6 ecrã 2 — assaltos e folha de poule
  bout/[id].tsx         §6 ecrã 3 — assalto (portrait e landscape)
  complete.tsx          §6 ecrã 5 — poule completa
  timer.tsx             modo cronómetro — offline, sem atletas (ADR-021)
src/
  api/                  types.ts (real) · client/endpoints/errors (esqueleto)
  poule/                sheet (classificação + matriz) · status (estados) · vistas
  bout/                 rules (toques, cartões, prioridade) · useBoutEngine · Clock · ScoreColumn
  session/              store zustand em memória · secureStorage (esqueleto)
  queue/                fila FIFO em memória · drain (esqueleto)
  timer/                format.ts (real) · useTimer (esqueleto)
  qr/                   parse (esqueleto)
  fixtures/             poule de 6 atletas, 15 assaltos
  i18n/                 en (inicial) · pt-PT
  ui/                   design system Esgrima.pt portado para RN
```

Módulos marcados **esqueleto** lançam `por implementar` e dizem em que fase entram. O que está feito a
sério: os tipos do contrato, a formatação do cronómetro, a fixture, o design system e as regras de
domínio que não dependem de rede — sem empates em poule, contadores entre 0 e o `target`, a
classificação FIE da poule ([ADR-011](docs/DECISIONS.md)), e os cartões e a prioridade do assalto
([ADR-012](docs/DECISIONS.md)).

## Fases

| Fase | Conteúdo                                                    | Estado    |
| ---- | ----------------------------------------------------------- | --------- |
| F0   | Andaimes, tipos do contrato, ecrãs com fixture              | **feito** |
| F1   | Ligar: QR, PIN, secure-store, cliente HTTP, mocks MSW       |           |
| F2   | Lista: polling + ETag, pull to refresh                      |           |
| F3   | Assalto: cronómetro monotónico, `start`, submissão          |           |
| F4   | Resiliência: fila offline, 409, expiração, poule bloqueada  |           |
| F5   | Ligação ao servidor real, E2E Maestro                       |           |
| F6   | Polimento: acessibilidade, som/háptica, legibilidade em sol |           |

O **modo cronómetro** (`/timer`) é ortogonal a esta tabela: não usa rede, por isso não espera por
fase nenhuma. Está a funcionar a sério — é a única parte da app que não depende do servidor.
