/**
 * Estado de arbitragem de um assalto: toques, cartões e prioridade.
 *
 * Vive num redutor puro, fora do ecrã, por duas razões: as regras FIE aqui dentro são as únicas
 * do assalto que dão para verificar sem renderizar nada, e o cartão vermelho toca no resultado —
 * ligá-lo ao `useState` do ecrã espalharia essa regra por dois sítios.
 *
 * **Nada disto sobe para a plataforma.** O `API-CONTRACT.md` §1 exclui explicitamente cartões e
 * penalizações do âmbito da API; o que se submete continua a ser `{ a, b }`. Cartões e prioridade
 * são auxiliares de arbitragem, locais ao assalto — ver ADR-012.
 */

export type Side = 'a' | 'b';

/** Cartões FIE. Amarelo avisa, vermelho dá um toque ao adversário, preto exclui. */
export type CardKind = 'yellow' | 'red' | 'black';

export interface CardEntry {
  side: Side;
  kind: CardKind;
  /**
   * Se este cartão chegou mesmo a dar um toque ao adversário. Um vermelho com o adversário já no
   * limite de toques não dá nada — e sem isto o "anular" devolveria um toque que nunca existiu.
   */
  awardedTouch: boolean;
}

export interface BoutRulesState {
  /** Toques que terminam o assalto. Vem da API (`touch_cap`), nunca *hardcoded*. */
  readonly target: number;
  a: number;
  b: number;
  /** Por ordem de atribuição — é esta ordem que o "anular" desfaz. */
  cards: CardEntry[];
  /** Quem ficou com a prioridade no sorteio. `null` enquanto não houver morte súbita. */
  priority: Side | null;
}

export type BoutAction =
  | { type: 'touch'; side: Side; delta: 1 | -1 }
  | { type: 'card'; side: Side; kind: CardKind }
  /**
   * Anula um cartão. Sem argumentos é o último dado, seja de quem for; com `side` e `kind` é o
   * último **daquele atleta e daquele tipo** — que é o que o ecrã pede quando se anula carregando
   * no próprio cartão, e não num botão à parte que não sabe em que coluna se está.
   */
  | { type: 'undoCard'; side?: Side; kind?: CardKind }
  /** Sorteio de prioridade. O lado sorteado entra como argumento para o redutor ficar puro. */
  | { type: 'drawPriority'; side: Side }
  /** Assalto novo com os mesmos presets. Só o modo cronómetro o usa — ali encadeiam-se assaltos. */
  | { type: 'reset' };

export function initialBoutRules(target: number, a = 0, b = 0): BoutRulesState {
  return { target, a, b, cards: [], priority: null };
}

const other = (side: Side): Side => (side === 'a' ? 'b' : 'a');

const clamp = (value: number, target: number): number => Math.min(target, Math.max(0, value));

/** O índice do último cartão que serve o filtro. `-1` se não houver nenhum. */
function lastCardIndex(cards: CardEntry[], side?: Side, kind?: CardKind): number {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (!card) continue;
    if ((!side || card.side === side) && (!kind || card.kind === kind)) return index;
  }

  return -1;
}

export function boutRules(state: BoutRulesState, action: BoutAction): BoutRulesState {
  switch (action.type) {
    case 'touch': {
      return { ...state, [action.side]: clamp(state[action.side] + action.delta, state.target) };
    }

    case 'card': {
      // O preto é a exclusão: dá-se uma vez e o atleta está fora. Um segundo não existe em
      // arbitragem, e permiti-lo só abria a porta a um toque a mais por engano.
      if (action.kind === 'black' && cardCount(state, action.side, 'black') > 0) return state;

      const opponent = other(action.side);
      // Só o vermelho pontua. O preto exclui, mas quem decide o resultado de uma exclusão é a
      // plataforma web — aqui fica registado, não aplicado.
      const awardsTouch = action.kind === 'red' && state[opponent] < state.target;

      return {
        ...state,
        [opponent]: awardsTouch ? state[opponent] + 1 : state[opponent],
        cards: [
          ...state.cards,
          { side: action.side, kind: action.kind, awardedTouch: awardsTouch },
        ],
      };
    }

    case 'undoCard': {
      const index = lastCardIndex(state.cards, action.side, action.kind);
      const card = state.cards[index];
      if (!card) return state;

      const opponent = other(card.side);

      return {
        ...state,
        // `max(0, …)` porque o toque dado pelo vermelho pode já ter sido retirado à mão pelo `−`:
        // devolver um toque que já não está lá deixava o placar negativo.
        [opponent]: card.awardedTouch ? Math.max(0, state[opponent] - 1) : state[opponent],
        cards: [...state.cards.slice(0, index), ...state.cards.slice(index + 1)],
      };
    }

    case 'drawPriority': {
      return { ...state, priority: action.side };
    }

    case 'reset': {
      return initialBoutRules(state.target);
    }
  }
}

/** Cartões de um lado, por tipo. */
export function cardCount(state: BoutRulesState, side: Side, kind: CardKind): number {
  return state.cards.filter((card) => card.side === side && card.kind === kind).length;
}

/**
 * Quem vence: quem tem mais toques ou, em igualdade, quem detém a prioridade (FIE t.41 — a morte
 * súbita que acaba sem toque é ganha por quem foi sorteado). `null` enquanto não houver decisão.
 */
export function winner(state: BoutRulesState): Side | null {
  if (state.a > state.b) return 'a';
  if (state.b > state.a) return 'b';
  return state.priority;
}

/**
 * A plataforma recusa `a === b` (contrato §7, `allow_draw: false`), e isso não muda por haver
 * prioridade: uma vitória por prioridade com toques iguais não é representável do outro lado. O
 * ecrã resolve-o pedindo ao árbitro o toque decisivo, em vez de o inventar.
 */
export function canSubmit(state: BoutRulesState): boolean {
  return state.a !== state.b;
}

/** Há vencedor decidido, mas o resultado ainda é um empate que a plataforma não aceita. */
export function needsDecidingTouch(state: BoutRulesState): boolean {
  return state.a === state.b && state.priority !== null;
}

/** Um preto por atleta — a exclusão não se repete. */
export const BLACK_CARD_LIMIT = 1;

/** `false` quando o cartão já não pode ser dado. Só o preto tem limite. */
export function canGiveCard(state: BoutRulesState, side: Side, kind: CardKind): boolean {
  return kind !== 'black' || cardCount(state, side, 'black') < BLACK_CARD_LIMIT;
}

/** Sorteio a 50/50. Isolado aqui para o redutor não ter de conhecer `Math.random`. */
export function drawPrioritySide(random: number = Math.random()): Side {
  return random < 0.5 ? 'a' : 'b';
}

/**
 * Intervalos entre piscadelas do sorteio, em ms. A desacelerar, como nos aparelhos da FIE: é a
 * travagem que faz o sorteio parecer um sorteio em vez de um resultado que apareceu do nada.
 */
export const PRIORITY_DRAW_STEPS = [70, 70, 90, 110, 140, 180, 230, 290, 360, 450];

export interface DrawFrame {
  /** Instante da piscadela, em ms desde o início do sorteio. */
  at: number;
  side: Side;
}

/**
 * As piscadelas do sorteio, alternadas e a terminar **no lado sorteado** — contadas a partir do
 * fim, para o número de passos não poder trocar o vencedor.
 */
export function priorityDrawFrames(side: Side, steps: number[] = PRIORITY_DRAW_STEPS): DrawFrame[] {
  let at = 0;

  return steps.map((ms, index) => {
    at += ms;
    const fromEnd = steps.length - 1 - index;
    return { at, side: fromEnd % 2 === 0 ? side : other(side) };
  });
}
