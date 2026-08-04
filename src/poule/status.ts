/**
 * Estado de cada assalto do ponto de vista de **quem está a chamar a poule**.
 *
 * O contrato só conhece três `status` (`pending`, `in_progress`, `done`). Ao árbitro falta um
 * quarto: qual é o par que deve estar a equipar-se agora. É informação derivável — é o primeiro
 * `pending` por sequência — e não exige nada do servidor.
 */

import type { Bout } from '@/api/types';

export type BoutState =
  /** Por disputar, ainda longe. */
  | 'pending'
  /** É este que o árbitro chama agora. Existe no máximo um. */
  | 'up_next'
  /** O par que se deve ir equipar, para entrar a seguir. Existe no máximo um. */
  | 'on_deck'
  /** A decorrer na pista. */
  | 'in_progress'
  /** Resultado registado. */
  | 'done';

/**
 * O assalto que **este** árbitro tem em mãos: o que ele está a arbitrar ou, se não houver nenhum, o
 * primeiro por disputar. `undefined` quando a poule está completa.
 *
 * O `startedId` é o assalto em que este dispositivo chamou o `start` (`refereeing.ts`), e existe
 * desde o contrato `2.2.0`: uma poule pode ter **N** assaltos `in_progress`, porque pode estar a
 * ser arbitrada em duas pistas com o mesmo código. Sem ele, o primeiro `in_progress` da lista podia
 * ser o do árbitro do lado — e propor "Retomar" sobre esse era mandar este para dentro do assalto
 * de outro.
 *
 * Três ramos, e é toda a regra:
 * - o meu, se estiver a decorrer;
 * - senão, se já arbitrei aqui, o primeiro por disputar — o que decorre é de outra pista;
 * - senão (nunca arbitrei aqui) o primeiro a decorrer, que é o comportamento de sempre e o que
 *   acerta com um árbitro só, que continua a ser o normal.
 */
export function currentBout(bouts: Bout[], startedId: string | null = null): Bout | undefined {
  if (startedId) {
    const mine = bouts.find((bout) => bout.id === startedId);
    return mine?.status === 'in_progress' ? mine : firstPending(bouts);
  }

  return bouts.find((bout) => bout.status === 'in_progress') ?? firstPending(bouts);
}

/** O par que deve estar a preparar-se. `undefined` quando o atual é o último por disputar. */
export function onDeckBout(bouts: Bout[], startedId: string | null = null): Bout | undefined {
  const current = currentBout(bouts, startedId);
  return bouts.find((bout) => bout.status === 'pending' && bout.id !== current?.id);
}

function firstPending(bouts: Bout[]): Bout | undefined {
  return bouts.find((bout) => bout.status === 'pending');
}

/**
 * A ordem em que a **lista** se mostra: primeiro o que falta arbitrar, no fim o que já tem
 * resultado. Dentro de cada bloco a ordem do servidor mantém-se — é a `sequence`, e é ela que diz
 * qual se chama a seguir.
 *
 * A meio de uma poule os assaltos feitos são os primeiros da lista, e empurravam o que falta para
 * fora do ecrã: o árbitro abria o telemóvel e tinha de percorrer o que já não lhe interessa até
 * chegar ao que tem para fazer. Os `done` continuam alcançáveis — só deixam de ser o que se vê
 * primeiro.
 *
 * **Não serve para calcular estados**: `currentBout`, `onDeckBout` e `boutStates` continuam a
 * receber a lista como o servidor a deu, porque "o primeiro por disputar" é por `sequence` e não
 * por posição no ecrã.
 */
export function listOrder(bouts: Bout[]): Bout[] {
  return [
    ...bouts.filter((bout) => bout.status !== 'done'),
    ...bouts.filter((bout) => bout.status === 'done'),
  ];
}

/**
 * Estado de cada assalto por `id`. Calculado de uma vez para a lista inteira porque `on_deck`
 * depende dos outros assaltos — decidi-lo linha a linha daria vários "a preparar".
 *
 * **Um assalto a decorrer mostra-se a decorrer, seja de quem for** (contrato `2.2.0`, e a
 * `CLIENT-SPEC.md` §6 decidiu-o assim): para quem está na pista ao lado é informação verdadeira e
 * é a que interessa. O que o `startedId` muda é quem é o `up_next` — que volta a existir quando o
 * `in_progress` visível não é deste dispositivo.
 */
export function boutStates(
  bouts: Bout[],
  startedId: string | null = null,
): Record<string, BoutState> {
  const onDeckId = onDeckBout(bouts, startedId)?.id;
  const currentId = currentBout(bouts, startedId)?.id;

  return Object.fromEntries(
    bouts.map((bout) => {
      if (bout.status === 'done') return [bout.id, 'done' as const];
      if (bout.status === 'in_progress') return [bout.id, 'in_progress' as const];
      // O atual e o seguinte pedem coisas diferentes ao árbitro: um é para **chamar agora**, o
      // outro é para os atletas se irem equipar. Dizer "preparar" aos dois não distinguia qual
      // deles ia à pista.
      if (bout.id === currentId) return [bout.id, 'up_next' as const];
      if (bout.id === onDeckId) return [bout.id, 'on_deck' as const];
      return [bout.id, 'pending' as const];
    }),
  );
}
