/**
 * O sorteio de prioridade, com a piscadela dos aparelhos da FIE.
 *
 * O resultado é aleatório e irreversível. Mostrá-lo de repente — a marca a aparecer num atleta sem
 * mais nada — deixa o árbitro sem saber se aquilo foi sorteado ou se carregou no sítio errado. A
 * piscadela alternada, a travar, mostra o sorteio a acontecer, e substitui a explicação escrita
 * que estava lá antes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { drawPrioritySide, priorityDrawFrames, type Side } from './rules';

/** Quanto tempo a marca fica no lado sorteado antes de o resultado se fixar. */
const SETTLE_MS = 320;

export interface PriorityDraw {
  /** Lado a piscar neste instante. `null` fora do sorteio. */
  flashing: Side | null;
  /** `true` do toque no botão até o resultado se fixar. */
  drawing: boolean;
  start: () => void;
}

export function usePriorityDraw(onSettled: (side: Side) => void): PriorityDraw {
  const [flashing, setFlashing] = useState<Side | null>(null);
  const [drawing, setDrawing] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Sair do ecrã a meio do sorteio deixava `setState` agendado sobre um componente desmontado.
  useEffect(() => {
    const scheduled = timers.current;
    return () => scheduled.forEach(clearTimeout);
  }, []);

  // Ref para o `start` não se recriar a cada render do ecrã, que reagenda o sorteio a meio dele.
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  const start = useCallback(() => {
    const side = drawPrioritySide();
    const frames = priorityDrawFrames(side);
    const last = frames.at(-1);
    if (!last) return;

    setDrawing(true);

    for (const frame of frames) {
      timers.current.push(setTimeout(() => setFlashing(frame.side), frame.at));
    }

    timers.current.push(
      setTimeout(() => {
        setFlashing(null);
        setDrawing(false);
        onSettledRef.current(side);
      }, last.at + SETTLE_MS),
    );
  }, []);

  return { flashing, drawing, start };
}
