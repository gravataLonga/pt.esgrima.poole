# poole-referee-app

App de arbitragem de poules de esgrima. Companion da plataforma `poole.esgrima.pt` — o árbitro liga-se
a **uma** poule por QR ou PIN, conduz os assaltos com cronómetro local e regista os resultados.

Em paralelo, um **modo cronómetro** autónomo: um assalto, offline, sem atletas e sem ligação a nada
([ADR-021](docs/DECISIONS.md)). É para treinos e provas locais, que não têm poule na plataforma.

**Estado: F5 — ligada ao servidor a sério.** A app fala com a plataforma em `/api/v1`: liga por QR ou
PIN, lista os assaltos com *polling* e `ETag`, arbitra com os presets vindos da API, regista o
resultado com chave de idempotência, guarda em fila o que não conseguir enviar, e arbitra o quadro de
eliminatórias da poule e do torneio. O levantamento de campo está na
[§12 do contrato](docs/API-CONTRACT.md).

Desde a **F7**, a pista também se vê enquanto está a ser arbitrada: cada toque, cartão, sorteio de
prioridade e fim de período sobe no instante em que acontece (`POST .../events`, contrato `1.5.0`), e
o placar da web deixou de esperar pelo fim do assalto. Falhar não trava a arbitragem — nada disto
entra no resultado.

## Como correr

```sh
npm install
npm start          # depois: i (iOS), a (Android)
```

Por omissão aponta a **produção** (`https://poole.esgrima.pt`). Contra um servidor local:

```sh
EXPO_PUBLIC_BASE_URL=https://poole.esgrima.pt.test npm start
```

Falhar para produção é falhar do lado seguro: uma variável em falta não pode apontar a app de um
árbitro em pavilhão para o portátil de alguém (`src/config/env.ts`).

**Precisas de um PIN.** Gera-se na plataforma, no painel de arbitragem da poule ou do torneio. Num
servidor local, também por `tinker`:

```php
App\Models\Poole::find(1)->issueRefereePin();   // devolve os seis dígitos
```

**`w` (web) não serve para testar contra a API.** O CORS da plataforma está fechado a todas as
origens, de propósito: um `/connect` aberto ao browser deixaria qualquer página gastar o *rate limit*
dos visitantes a adivinhar PINs. Verificação a olho faz-se em simulador ou telemóvel.

A leitura de QR precisa de câmara: no simulador de iOS não há nenhuma, e o ecrã `/scan` fica preto.
Testa-a em telemóvel. Um QR de teste gera-se em qualquer sítio a partir dos seis dígitos do PIN.

## Verificação

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest — contra o servidor falso, sem rede
```

E, contra a plataforma a sério, o que nenhum mock consegue verificar — que os dois lados estão de
acordo, e não só que a app é consistente consigo própria:

```sh
LIVE_API_BASE_URL=https://poole.esgrima.pt.test LIVE_API_PIN=123456 \
  NODE_OPTIONS=--use-system-ca npm run test:live

# com um PIN de torneio, a outra metade do contrato:
LIVE_API_SCOPE=tournament LIVE_API_PIN=654321 ... npm run test:live

# inclui os testes que escrevem (201 → 200 → 409). Só contra dados descartáveis:
LIVE_API_ALLOW_WRITES=1 ... npm run test:live
```

Sem as variáveis de ambiente é saltado, por isso o `npm test` de toda a gente continua a não precisar
de rede. O `--use-system-ca` só é preciso contra um `.test` local, para o Node confiar na CA do
Herd/Valet — **não** desligar a verificação de TLS para isto.

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

[`docs/APP-STORE.md`](docs/APP-STORE.md) — o que é preciso para submeter à App Store: URLs, poule de
demonstração, e as chaves de `app.json` que lá estão por causa da revisão da Apple.

`src/api/types.ts` é tipado diretamente a partir do contrato e não contém mais nada.

## Onde está cada coisa

```
app/                    rotas (expo-router)
  connect.tsx           §6 ecrã 1 — ligar por QR ou PIN
  scan.tsx              leitura do QR pela câmara (ADR-026)
  poule.tsx             §6 ecrã 2 — assaltos e folha de poule
  bout/[id].tsx         §6 ecrã 3 — assalto de poule (portrait e landscape)
  bracket.tsx           §6 ecrã 5 — quadro de eliminatórias
  match/[id].tsx        combate do quadro — o mesmo ecrã de assalto
  complete.tsx          §6 ecrã 6 — competição completa
  timer.tsx             modo cronómetro — offline, sem atletas (ADR-021)
src/
  api/                  types (contrato) · client (HTTP) · endpoints · queries (polling+ETag) · polling
  poule/                sheet (matriz) · status (estados) · vistas
  bout/                 BoutScreen (partilhado) · rules · useBoutEngine · useLiveEvents · Clock
  session/              store (máquina de estados) · secureStorage · useConnect · banners
  queue/                fila persistente · submit (submission_id) · drain
  timer/                useTimer monotónico · format
  qr/                   parse.ts — os fallbacks do contrato §9
  fixtures/             poule de 6 atletas, 15 assaltos (alimenta o servidor falso dos testes)
  i18n/                 en (inicial) · pt-PT
  ui/                   design system Esgrima.pt portado para RN
```

O ecrã de assalto é **um só** para a poule e para o quadro (`src/bout/BoutScreen.tsx`): o contrato §7
diz que a app arbitra os dois no mesmo ecrã, e a única diferença é para onde vai o resultado.

## Fases

| Fase | Conteúdo                                                    | Estado    |
| ---- | ----------------------------------------------------------- | --------- |
| F0   | Andaimes, tipos do contrato, ecrãs com fixture              | **feito** |
| F1   | Ligar: QR, PIN, secure-store, cliente HTTP                   | **feito** |
| F2   | Lista: polling + ETag, pull to refresh                      | **feito** |
| F3   | Assalto: cronómetro monotónico, `start`, submissão          | **feito** |
| F4   | Resiliência: fila offline, 409, expiração, poule bloqueada  | **feito** |
| F5   | Ligação ao servidor real, quadro de eliminatórias           | **feito** |
| F6   | Polimento: acessibilidade, som/háptica, legibilidade em sol |           |
| F7   | Pista ao vivo: os eventos do assalto à medida que acontecem | **feito** |

Falta da F5 o **E2E com Maestro**: os fluxos do [§12 da spec](docs/CLIENT-SPEC.md) estão cobertos por
testes de integração sobre a árvore de rotas real, mas não num dispositivo a sério.

O **modo cronómetro** (`/timer`) é ortogonal a esta tabela: não usa rede, por isso não espera por
fase nenhuma. Está a funcionar a sério — é a única parte da app que não depende do servidor.
