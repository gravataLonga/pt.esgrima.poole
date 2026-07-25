# Grelha de Poule — Especificação Visual

Descrição da **grelha de poule** (poule sheet) tal como existe em `poole.esgrima.pt`, para ser
reimplementada noutro projeto. Cobre **aparência, formato e informação apresentada**. Os dados são
populados por **API servida por esta aplicação** — o projeto cliente não calcula nada, só desenha.

Referência de implementação atual: `resources/views/poole/sheet.blade.php`,
`resources/js/game.js`, `resources/js/classification.js`.

---

## 1. O que é o ecrã

Uma página com **dois blocos empilhados**, ambos alimentados pela mesma resposta de API:

1. **Classification** — tabela de classificação, uma linha por atleta, ordenada por lugar.
2. **Poole Grid** — a matriz clássica de poule (todos contra todos), com a diagonal preenchida e as
   colunas de estatísticas à direita.

Cada bloco é um *painel*: cartão branco, cantos arredondados 10px (`0.625rem`), borda cinzenta
clara (`#E2E8F0` / slate-200), padding 1rem em mobile e 2.5rem em desktop, blocos separados por
1.5rem de espaçamento vertical.

---

## 2. Fonte de dados

Endpoint único: **`GET /poole/{uuid}/match`** → devolve um **array**, um elemento por atleta, já pela
ordem da poule (número 1..n). Ambos os blocos consomem exatamente esta resposta.

```json
[
  {
    "player":  { "number": 1, "id": 42, "name": "Ana Silva", "club": "CE Lisboa" },
    "bouts":   [ { "player_against_id": 43, "given": 5, "received": 3 } ],
    "number":  1,
    "victories": 3,
    "given":     14,
    "received":  9,
    "diff":      5,
    "place":     1,
    "done":      4,
    "missing":   2
  }
]
```

| Campo | Significado | Uso no ecrã |
|---|---|---|
| `player.number` | Número do atleta na poule (1..n) | Coluna/linha da matriz, gutter esquerdo |
| `player.name` | Nome | Coluna de nome, tooltip |
| `player.club` | Clube (pode ser `null`) | Só se a poule pertencer a um torneio |
| `bouts[]` | Assaltos já pontuados **na perspetiva deste atleta** | Preenche as células da matriz |
| `bouts[].player_against_id` | Adversário (id) | Localiza a coluna |
| `bouts[].given` | Toques dados por este atleta | **Valor mostrado na célula** |
| `bouts[].received` | Toques recebidos | Aparece na célula espelhada da linha do adversário |
| `victories` | Vitórias (V) | Coluna V |
| `given` | Toques dados totais (TS/TD) | Coluna TS |
| `received` | Toques recebidos totais (TR) | Coluna TR |
| `diff` | Indicador = `given - received` | Coluna Ind. |
| `place` | Lugar calculado no servidor | Coluna Pl. e coluna `#` da classificação |
| `done` | Assaltos já disputados | Coluna "Done" |
| `missing` | Assaltos em falta (`n - 1 - done`) | Coluna "Missing" |

Notas importantes:

- Um atleta **sem nenhum assalto** vem com `victories`, `given` e `received` a `null` (mostrar `0` ou
  vazio, à escolha do cliente) e `diff` a `0`.
- Os assaltos existem **espelhados**: o resultado A×B aparece nos `bouts` de A (`given`/`received`) e
  nos de B com os valores trocados. A matriz aproveita isto — cada célula lê sempre o `given` do
  atleta **da linha**.
- Só existem `bouts` para assaltos já pontuados. Assalto por disputar = **célula vazia**.
- O cliente **não ordena nem recalcula**: `place` vem pronto. A ordenação da classificação é por
  `place` ascendente; a ordem das linhas da grelha é a ordem do array (número da poule).

**Regras de classificação (contexto, calculadas no servidor):** V/M → indicador (TD−TR) → TD, todas
descendentes. Empates totais partilham lugar (1, 2, 2, 4). Ver `docs/fie-classificacao-poule.md`.

---

## 3. Bloco "Classification"

Tabela normal, largura total, `border-collapse`, com scroll horizontal se necessário.

**Cabeçalho:** fundo escuro `#1D3749`, texto branco, Montserrat 12px bold, MAIÚSCULAS,
`letter-spacing` alargado, altura ~2.5rem. Quando a tabela fecha o painel, o cabeçalho corre de
bordo a bordo (margens negativas anulam o padding do cartão) e só os cantos inferiores ficam
arredondados.

**Colunas, por ordem:**

| Coluna | Conteúdo | Formato |
|---|---|---|
| `#` | `place + "°"` (ex.: `1°`) | Largura mínima, 18px bold, tabular |
| `Name` | `player.name` | Coluna elástica (absorve o espaço livre), semibold |
| `Club` | `player.club` ou `—` | **Só quando a poule pertence a um torneio** |
| `V` | `victories` | Numérica, centrada, 4rem |
| `TS` | `given` | Numérica |
| `TR` | `received` | Numérica |
| `Ind.` | `diff` | Numérica |
| `Done` | `done` | Numérica, **escondida abaixo de `sm` (640px)** |
| `Missing` | `missing` | Numérica, **escondida abaixo de `sm`** |

**Corpo:** fundo branco, linhas separadas por 1px slate-100, texto Montserrat 14px, células
numéricas com `tabular-nums`, semibold, cinzento-escuro; nomes a preto-azulado `#1D3749`; texto
secundário (clube, Done/Missing) em cinzento médio. Hover de linha: fundo verde a 4%
(`rgba(0, 246, 185, 0.04)`), com transição de cor.

---

## 4. Bloco "Poole Grid" — a matriz

> **Não é uma `<table>`.** É construída com flexbox: cada célula de resultado é um **quadrado fixo de
> 2.5rem** para que a diagonal fique perfeitamente alinhada. O cromatismo imita a tabela para as duas
> lerem como a mesma família.

Estrutura: contentor com `overflow-x: auto` (margens negativas em relação ao painel para o scroll
correr de bordo a bordo), e dentro dele um bloco `inline-block` com cantos arredondados 10px, borda
slate-200 e `overflow: hidden`.

### 4.1 Cabeçalho (linha superior, fundo `#1D3749`)

| Segmento | Largura | Conteúdo |
|---|---|---|
| Gutter | 1.5rem | vazio |
| `Player` | 10rem | rótulo "Player", Montserrat 12px bold maiúsculas, branco |
| Uma coluna por atleta | 2.5rem cada | `player.number`, branco, semibold 14px, tabular, centrado, separador esquerdo 1px cinzento-escuro |
| `V` | 2.5rem | **separador esquerdo 2px verde `#00F6B9`, texto verde** — marca o início do bloco de estatísticas |
| `TS` | 2.5rem | branco |
| `TR` | 2.5rem | branco |
| `Ind` | 2.5rem | branco |
| `Pl.` | 2.5rem | branco |

Altura do cabeçalho: 2.5rem. Todos os rótulos: Montserrat 12px bold, maiúsculas, tracking alargado.

### 4.2 Linhas de atleta

Uma linha por atleta, na ordem do array. Altura da célula: **2.5rem**, ou **3rem quando se mostra o
clube** (a linha do nome passa a ter duas linhas de texto). Separador inferior 1px slate-100.

| Segmento | Largura | Conteúdo |
|---|---|---|
| Gutter | 1.5rem | `number` do atleta, centrado, bold 14px, cinzento médio, tabular |
| Nome | 10rem | `player.name` — Montserrat 14px semibold, truncado com reticências; por baixo, quando aplicável, `player.club` em Work Sans 12px cinzento, também truncado |
| Células de resultado | 2.5rem cada | ver 4.3 |
| `V` | 2.5rem | `victories` — bold, escuro, separador esquerdo 2px verde |
| `TS` / `TR` / `Ind` | 2.5rem cada | `given` / `received` / `diff` — 14px, cinzento-escuro, tabular |
| `Pl.` | 2.5rem | `place` — bold, escuro |

### 4.3 Células de resultado

- **Diagonal** (atleta contra si próprio): quadrado **preenchido a `#1D3749`**, sem texto.
- **Assalto pontuado:** os **toques dados pelo atleta da linha** (`bouts[].given` correspondente à
  coluna). Texto bold 14px centrado.
- **Assalto por disputar:** célula **vazia**, fundo branco.
- Cada célula tem separador esquerdo 1px e é clicável (ver §6) quando o utilizador pode editar.

A leitura é a convencional da folha de poule FIE: **linha = quem marcou, coluna = contra quem**. O
valor espelhado (`received`) aparece na célula simétrica, na linha do adversário.

### 4.4 Realce cruzado (hover)

Ao passar o rato numa célula de resultado:

- A **linha inteira** do atleta ganha fundo cinzento (slate-300).
- A **célula simétrica** (o mesmo assalto visto do outro lado) e a célula sob o cursor ficam
  cinzento mais escuro (slate-400) — o par de resultados é evidenciado em conjunto.
- Aparece um **tooltip** com `"Nome da linha vs Nome da coluna"`.

Hover normal de linha (fora das células): fundo verde a 4%.

---

## 5. Estados

| Estado | Aparência |
|---|---|
| **A carregar** | A grelha/tabela não é renderizada. Em vez disso, uma frase centrada — "Loading..." — em caixa com **borda tracejada**, cantos 10px, texto cinzento médio, Montserrat, padding 1.5rem vertical. |
| **Sem atletas suficientes** | Mesma caixa tracejada: "Add at least two players". |
| **Classificação vazia** | Mesma caixa tracejada, no bloco de classificação. |
| **Com dados** | A caixa tracejada desaparece e a tabela/matriz aparece. |

---

## 6. Interação (opcional no cliente)

O original permite, a quem tem sessão de gestor, **clicar numa célula** para abrir um modal
"Register Score": overlay escuro a 90% sobre toda a viewport, cartão branco centrado (11/12 da
largura em mobile, 6/12 em desktop), cantos 10px, com dois campos de resultado lado a lado
(etiquetados com os nomes dos dois atletas), uma faixa de erro a vermelho-claro quando aplicável, e
um botão de submissão que passa a "saving..." enquanto grava. Fecha com `Esc`, clique fora, ou botão
`×` no canto superior direito.

**Num cliente só de leitura, esta parte não se aplica** — as células mantêm-se, apenas sem cursor de
ponteiro nem clique.

---

## 7. Tokens de design

```
Cores
  dark            #1D3749   cabeçalhos, diagonal, texto principal
  green           #00F6B9   acento (separador da coluna V, foco)
  green-4         rgba(0, 246, 185, 0.04)   hover de linha
  slate-200       #E2E8F0   bordas de contentor
  slate-100       #F1F5F9   separadores internos
  slate-300/400   #CBD5E1 / #94A3B8   realce cruzado no hover
  slate-500       #64748B   texto secundário (clube, números do gutter)
  branco          #FFFFFF   fundo dos cartões e células

Tipografia
  Montserrat      cabeçalhos, rótulos, nomes, todos os números
  Work Sans       texto secundário (clube)
  Números         sempre com tabular-nums

Raios
  10px (0.625rem) cartões, contentor da matriz
   6px (0.375rem) botões/campos

Métricas da matriz
  célula          2.5rem × 2.5rem   (altura 3rem quando há clube)
  gutter nº       1.5rem
  coluna nome     10rem
  cabeçalho       2.5rem de altura
```

---

## 8. Comportamento responsivo

- Ambos os blocos fazem **scroll horizontal** quando não cabem; o resto da página nunca faz.
- A matriz mantém as células a 2.5rem em qualquer viewport — encolher partia o alinhamento da
  diagonal. É o scroll que resolve poules grandes.
- Na classificação, `Done` e `Missing` desaparecem abaixo de 640px; o resto das colunas mantém-se.
- A coluna de nome é fixa a 10rem com truncagem — nomes longos cortam com reticências, não quebram.

---

## 9. Checklist de aceitação

- [ ] Diagonal alinhada: célula *i,i* preenchida a escuro em todas as linhas.
- [ ] Célula mostra os toques **dados** pelo atleta da linha; a simétrica mostra os recebidos.
- [ ] Assalto por disputar aparece vazio, não a `0`.
- [ ] Coluna V separada por linha verde de 2px, no cabeçalho e em todas as linhas.
- [ ] Hover realça linha + célula simétrica e mostra tooltip `A vs B`.
- [ ] `place` mostrado tal como vem da API (empates repetem o lugar), sem reordenar.
- [ ] Clube só visível quando a poule pertence a um torneio.
- [ ] Estado vazio e de carregamento usam a caixa tracejada, não a grelha vazia.
