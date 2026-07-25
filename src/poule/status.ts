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
 * O assalto que o árbitro tem em mãos: o que está a decorrer ou, se não houver nenhum, o primeiro
 * por disputar. `undefined` quando a poule está completa.
 */
export function currentBout(bouts: Bout[]): Bout | undefined {
  return bouts.find((bout) => bout.status === 'in_progress') ?? firstPending(bouts);
}

/** O par que deve estar a preparar-se. `undefined` quando o atual é o último por disputar. */
export function onDeckBout(bouts: Bout[]): Bout | undefined {
  const current = currentBout(bouts);
  return bouts.find((bout) => bout.status === 'pending' && bout.id !== current?.id);
}

function firstPending(bouts: Bout[]): Bout | undefined {
  return bouts.find((bout) => bout.status === 'pending');
}

/**
 * Estado de cada assalto por `id`. Calculado de uma vez para a lista inteira porque `on_deck`
 * depende dos outros assaltos — decidi-lo linha a linha daria vários "a preparar".
 */
export function boutStates(bouts: Bout[]): Record<string, BoutState> {
  const onDeckId = onDeckBout(bouts)?.id;
  const currentId = currentBout(bouts)?.id;

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
