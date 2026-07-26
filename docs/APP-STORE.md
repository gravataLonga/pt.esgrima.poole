# Submeter à App Store

O que é preciso ter em mãos para submeter a Poole Referee, e as razões que não se leem no `git diff`.
Metade disto resolve-se do lado da plataforma (`poole.esgrima.pt`) e no App Store Connect, não aqui.

---

## Os URLs

A base de produção é `https://poole.esgrima.pt` — o mesmo valor por omissão de
[`src/config/env.ts`](../src/config/env.ts), **sem** o `/api/v1` que só o cliente HTTP acrescenta.

| Para quê | URL |
| --- | --- |
| Política de privacidade (obrigatório no App Store Connect) | `https://poole.esgrima.pt/privacy` |
| Suporte (obrigatório no App Store Connect) | `https://poole.esgrima.pt/support` |

> **Verificado a 2026-07-26: os dois respondem `404` em produção.** As páginas existem no repositório
> da plataforma e ainda não foram publicadas. Um URL de privacidade que não responde é recusa
> imediata — confirmar que ambos abrem **antes** de submeter, não depois.

---

## O que já está resolvido nesta app

| Chave | Onde | Porquê |
| --- | --- | --- |
| `ITSAppUsesNonExemptEncryption: false` | `app.json` → `ios.infoPlist` | A app só fala HTTPS e usa `expo-crypto` para UUIDs — é isenta. Sem esta chave, cada *build* fica preso em "Missing Compliance" e o TestFlight não distribui |
| `faceIDPermission: false` | `app.json` → *plugin* `expo-secure-store` | O *plugin* injecta uma `NSFaceIDUsageDescription` por omissão. A app nunca usa `requireAuthentication`: declarar uma API que não se usa é matéria da Guideline 5.1.1 |
| `supportsTablet: false` | `app.json` → `ios` | Ver "O que não desfazer" |
| `cameraPermission` em inglês | `app.json` → *plugin* `expo-camera` | O `src/i18n/index.ts` fixa `lng: 'en'` e não deteta o idioma do telemóvel. Uma caixa de sistema em português dentro de uma interface inglesa é o que o revisor vê |
| `autoIncrement: true` | `eas.json` → perfil `production` | O `CFBundleVersion` estava fixo em `1`. O segundo *upload* com o mesmo número é recusado (ITMS-4238) |

---

## O que falta

| # | Ponto | Onde se resolve | Bloqueia envio |
| --- | --- | --- | --- |
| 1 | Publicar `/privacy` e `/support` em produção | Plataforma | **Sim** |
| 2 | PIN de demonstração em produção + notas de revisão | Plataforma + App Store Connect | **Sim** |
| 3 | URL da política de privacidade e URL de suporte | App Store Connect | **Sim** |
| 4 | Classificação etária | App Store Connect | **Sim** |
| 5 | Questionário de privacidade | App Store Connect | **Sim** |
| 6 | *Screenshots* de iPhone (iPad já não é preciso) | App Store Connect | **Sim** |
| 7 | `pt.esgrima.poole.referee` registado na conta e ligado ao registo da app | Apple Developer | **Sim** |
| 8 | `ios.privacyManifests` | `app.json` | Não — só se a Apple mandar o ITMS-91053 depois do primeiro *upload* |

O texto pronto a colar para os pontos 4 e 5 fica do lado da plataforma, em `scratchpad/app-store-connect.md`.

---

## A poule de demonstração

**É o entrave número um, e não é código desta app.** O revisor abre `/connect` e precisa de seis
dígitos que só a plataforma emite. Sem PIN nas notas de revisão — e sem uma poule que fique viva, não
bloqueada e não completa durante toda a revisão — a resposta é *"we were unable to review your app"*
(Guideline 2.1).

Vive no repositório da plataforma: comando `php artisan poule:demo`, configuração em `config/demo.php`,
PIN e palavra-passe só por ambiente (`DEMO_POULE_PIN`, `DEMO_POULE_PASSWORD`). **O PIN não se escreve
aqui nem em nenhum ficheiro versionado.**

Três arestas que custam caro se forem descobertas no dia:

- **Mudar o `DEMO_POULE_PIN` não chega à poule enquanto o cartão estiver por tocar.** O comando sai em
  silêncio com código zero e a base de dados fica com o código antigo. Quem puser um PIN novo nas
  notas de revisão tem de correr `poule:demo --force`.
- **Mudar o UUID sem mudar o PIN é recusado** — a poule velha continua a segurar o código, e dois
  registos com os mesmos seis dígitos não teriam para onde mandar o árbitro.
- **Sem o cron agendado a poule não se repõe**, mas nunca fica inacessível: o `/connect` responde
  sempre. Perde-se a frescura do cartão, não o acesso. Plano B é `poule:demo --force` à mão.

**Mencionar `/timer` nas notas de revisão.** É alcançável do primeiro ecrã
([`app/connect.tsx`](../app/connect.tsx)), funciona offline e sem atletas, e é o que responde à
Guideline 4.2 (*minimum functionality*) para uma app que de outra forma parece inútil sem um código
que o revisor não tem.

---

## Privacidade: porque é que "Data Not Collected" é honesto

- O token está em Keychain / Android Keystore ([`src/session/secureStorage.ts`](../src/session/secureStorage.ts)),
  nunca em `AsyncStorage`, nunca em log.
- A fila de submissões é a única coisa que persiste em claro, e **não leva nomes de atletas**: o
  rótulo é o título do assalto. Há teste que falha se isso regredir
  (`src/__tests__/navigation.test.tsx`).
- O `X-Client` leva a versão da app e a do sistema, e mais nada — sem identificador de dispositivo.
- O `device_name` que sobe no `/connect` é uma **constante** — `"iOS · Poole Referee"`, igual em todos
  os aparelhos. Não é o IDFA, não distingue telefones, não diz que telefone está ligado. É isto que
  sustenta a resposta ao questionário, dos dois lados.
- Sem analytics, sem *crash reporting*, sem cookies.

---

## Antes de submeter, por esta ordem

1. Publicar a plataforma: `/privacy` e `/support` a responder `200`.
2. `DEMO_POULE_PIN` e `DEMO_POULE_PASSWORD` no `.env` de produção.
3. `php artisan config:cache && php artisan poule:demo --force`.
4. **Ligar esta app ao PIN real de produção e pontuar um assalto.** É o único passo que prova que o
   revisor consegue entrar.
5. Colar no App Store Connect: URLs, notas de revisão com o PIN, classificação etária, questionário
   de privacidade, *screenshots*.

---

## Como ver o `Info.plist` a sério

`npx expo config --type introspect` **mente** quando não existe `ios/`: cai num template com
`NSAllowsArbitraryLoads: true` que não é o que o `prebuild` gera. Para ver a verdade:

```sh
npx expo prebuild --platform ios --no-install --clean
cat ios/PooleReferee/Info.plist
rm -rf ios && git checkout package.json   # o prebuild reescreve os scripts `ios` e `android`
```

O `ios/` é gerado e está no `.gitignore` — não fica.

---

## O que não desfazer

**`supportsTablet: false`.** O `lockAsync(PORTRAIT_UP)` do [`app/_layout.tsx`](../app/_layout.tsx) é
silenciosamente ignorado em iPad enquanto `UIRequiresFullScreen` for `false` — está documentado em
[`src/bout/orientation.ts`](../src/bout/orientation.ts). Com o iPad ligado, todos os ecrãs rodam,
incluindo a folha de poule e o `/connect`, que nunca foram desenhados para landscape de tablet. Quem
quiser reabrir o iPad tem de pôr `ios.requireFullScreen: true`, verificar os ecrãs num iPad a sério e
fornecer *screenshots* de iPad.

**O rótulo da fila é o título do assalto, não os nomes.** Vai a disco e pode lá ficar 24 h.

**A `cameraPermission` fica em inglês** enquanto a interface abrir em inglês. Quando houver troca de
idioma, o sítio da versão portuguesa é `expo.locales` no `app.json`, que gera
`pt-PT.lproj/InfoPlist.strings` e de caminho põe pt-PT no `CFBundleLocalizations` para a ficha da loja.
