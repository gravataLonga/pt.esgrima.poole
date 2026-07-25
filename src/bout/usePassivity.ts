/**
 * Relógio de passividade (não combatividade) — FIE t.87.
 *
 * Um minuto sem toque nem cartão e o árbitro pode dar P-cartão amarelo aos dois. Aqui **só se
 * conta**: chegar a zero não dá cartão nenhum nem bloqueia nada. A decisão é do árbitro, e a
 * penalização entra pelos cartões normais como qualquer outra.
 *
 * Conta enquanto o tempo principal corre, e volta ao início a cada sinal de combate: um toque, um
 * cartão, ou o próprio "halt" — que é o que a paragem do cronómetro representa.
 */

import { useEffect, useState } from 'react';

import { monotonicNow } from '@/timer/useTimer';

/** Um minuto, FIE t.87. */
export const PASSIVITY_SECONDS = 60;

/** Igual ao do cronómetro principal: só provoca re-render, o valor é sempre derivado. */
const TICK_MS = 200;

export interface UsePassivityOptions {
  /** `true` enquanto o cronómetro principal estiver a correr. */
  running: boolean;
  /**
   * Muda a cada acontecimento que reinicia a contagem — um toque, um cartão. É um contador e não
   * um booleano porque dois toques seguidos têm de reiniciar duas vezes.
   */
  resetToken: number;
  seconds?: number;
}

export interface Passivity {
  remainingMs: number;
  /** O minuto esgotou. Informativo: não desencadeia nada. */
  expired: boolean;
}

export function usePassivity({
  running,
  resetToken,
  seconds = PASSIVITY_SECONDS,
}: UsePassivityOptions): Passivity {
  const durationMs = Math.max(0, Math.round(seconds * 1000));

  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [anchor, setAnchor] = useState({ startedAt: null as number | null, running, resetToken });

  // Reiniciar durante o render, e não num efeito: é o padrão do `useTimer` (ADR-008) e o que a
  // regra `set-state-in-effect` do React Compiler deixa passar.
  if (anchor.running !== running || anchor.resetToken !== resetToken) {
    setAnchor({ startedAt: running ? monotonicNow() : null, running, resetToken });
    setRemainingMs(durationMs);
  }

  const { startedAt } = anchor;

  useEffect(() => {
    if (startedAt === null) return;

    const id = setInterval(() => {
      setRemainingMs(Math.max(0, durationMs - (monotonicNow() - startedAt)));
    }, TICK_MS);

    return () => clearInterval(id);
  }, [durationMs, startedAt]);

  return { remainingMs, expired: remainingMs <= 0 };
}
