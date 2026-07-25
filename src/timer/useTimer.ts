/**
 * Cronómetro local e autoritário — spec §7.
 *
 * O restante **deriva sempre** de um relógio monotónico: guarda-se o instante do arranque e o que
 * faltava nesse instante, e o valor é `faltavaNoArranque - (agora - arranque)`. Nunca se decrementa
 * um contador por tick — é isso que garante os ≤ 100 ms de desvio em 3 minutos e que o valor está
 * certo ao voltar do background sem código de reconciliação.
 *
 * O `setInterval` só existe para provocar re-render; se falhar ticks (background, throttling do JS),
 * o próximo tick mostra o valor correto.
 *
 * **Só conta tempo.** Períodos, descanso e morte súbita são fases do assalto e vivem no ecrã
 * (ADR-015): o cronómetro é reutilizado por todas elas, com durações diferentes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerState = 'idle' | 'running' | 'paused' | 'expired';

export interface Timer {
  state: TimerState;
  remainingMs: number;
  /** Alterna iniciar/parar. Inerte quando o tempo esgotou — aí só `reset`, `adjust` ou `set`. */
  toggle: () => void;
  /** Volta ao tempo cheio da duração atual, parado. */
  reset: () => void;
  /** Soma (ou subtrai) tempo ao que falta, sem interromper a contagem se estiver a correr. */
  adjust: (deltaMs: number) => void;
  /** Define exatamente quanto falta. */
  set: (ms: number) => void;
  /**
   * O que falta **agora**, derivado do relógio monotónico em vez de lido do último *tick*.
   *
   * O `remainingMs` só se atualiza a cada 50 ms, e isso chega para o mostrar. Não chega para
   * carimbar o instante em que um toque caiu: o `at_ms` de um evento ao vivo (contrato §7) é
   * medido no toque, não no tick a seguir.
   */
  remainingNowMs: () => number;
}

export interface UseTimerOptions {
  /** Chamado uma vez, no instante em que a contagem chega a zero sozinha. */
  onExpire?: () => void;
}

/**
 * A âncora do cálculo. Vive em estado e não numa ref porque é lida no render (para reiniciar quando
 * a duração muda) — e refs não se tocam durante o render.
 */
interface Run {
  /** Instante monotónico do último arranque. `null` enquanto está parado. */
  startedAt: number | null;
  /** Quanto faltava nesse arranque. */
  remainingAtStart: number;
}

/**
 * Ritmo de re-render. A spec pede ~10 Hz para o dígito dos décimos; 50 ms dá margem para o dígito
 * mudar no instante certo em vez de até 100 ms depois.
 */
const TICK_MS = 50;

/**
 * `performance.now()` é monotónico — imune a mudanças de hora do sistema, ao contrário de `Date`.
 * Exportado porque o relógio de passividade deriva do mesmo instante: dois relógios a contar o
 * mesmo assalto a partir de bases diferentes acabariam a discordar.
 */
export const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const now = monotonicNow;

export function useTimer(durationSeconds: number, options: UseTimerOptions = {}): Timer {
  const { onExpire } = options;
  const durationMs = Math.max(0, Math.round(durationSeconds * 1000));

  const [state, setState] = useState<TimerState>('idle');
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [run, setRun] = useState<Run>({ startedAt: null, remainingAtStart: durationMs });

  // Ref para o callback não entrar nas dependências do efeito de tick: uma função recriada a cada
  // render do ecrã reiniciaria o intervalo 20 vezes por segundo.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // A duração muda quando a poule carrega e sempre que o assalto troca de fase — período,
  // descanso, morte súbita. Em qualquer dos casos o cronómetro recomeça no tempo cheio da fase
  // nova. Ajustado durante o render, e não num efeito: é o padrão que o React documenta para
  // estado derivado de props, e poupa o render intermédio com o valor velho.
  const [durationAtRender, setDurationAtRender] = useState(durationMs);
  if (durationAtRender !== durationMs) {
    setDurationAtRender(durationMs);
    setRun({ startedAt: null, remainingAtStart: durationMs });
    setRemainingMs(durationMs);
    setState('idle');
  }

  useEffect(() => {
    if (state !== 'running' || run.startedAt === null) return;

    const { startedAt, remainingAtStart } = run;
    // O `setState` abaixo só desmonta este intervalo no render seguinte, e pode haver ticks pelo
    // meio. Sem esta guarda, `onExpire` dispararia uma vez por tick em vez de uma vez por período.
    let expired = false;

    const id = setInterval(() => {
      if (expired) return;

      const left = remainingAtStart - (now() - startedAt);

      if (left <= 0) {
        expired = true;
        setRun({ startedAt: null, remainingAtStart: 0 });
        setRemainingMs(0);
        setState('expired');
        onExpireRef.current?.();
        return;
      }

      setRemainingMs(left);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [state, run]);

  const toggle = useCallback(() => {
    if (state === 'running') {
      const left = Math.max(0, run.remainingAtStart - (now() - (run.startedAt ?? now())));
      setRun({ startedAt: null, remainingAtStart: left });
      setRemainingMs(left);
      setState('paused');
      return;
    }

    if (state === 'expired' || run.remainingAtStart <= 0) return;

    setRun({ startedAt: now(), remainingAtStart: run.remainingAtStart });
    setState('running');
  }, [run, state]);

  const reset = useCallback(() => {
    setRun({ startedAt: null, remainingAtStart: durationMs });
    setRemainingMs(durationMs);
    setState('idle');
  }, [durationMs]);

  /**
   * Escreve um valor novo no que falta. A correr, re-ancora a contagem no instante atual em vez de
   * a parar — quem acerta o tempo a meio de um assalto não quer que o relógio pare por causa disso.
   *
   * A zero, o tempo dá-se por esgotado mas **sem** chamar `onExpire`: quem acabou de acertar o
   * tempo sabe o que fez, e não precisa que o telemóvel lho vibre de volta.
   */
  const applyRemaining = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.round(next));

      if (clamped === 0) {
        setRun({ startedAt: null, remainingAtStart: 0 });
        setRemainingMs(0);
        setState('expired');
        return;
      }

      setRemainingMs(clamped);

      if (state === 'running') {
        setRun({ startedAt: now(), remainingAtStart: clamped });
        return;
      }

      setRun({ startedAt: null, remainingAtStart: clamped });
      // Sair do "esgotado" com tempo novo deixa o cronómetro pronto a retomar. Nos outros estados,
      // acertar o tempo não é motivo para mudar de estado.
      if (state === 'expired') setState('paused');
    },
    [state],
  );

  const currentRemaining = useCallback(
    () =>
      state === 'running' && run.startedAt !== null
        ? Math.max(0, run.remainingAtStart - (now() - run.startedAt))
        : remainingMs,
    [remainingMs, run, state],
  );

  const adjust = useCallback(
    (deltaMs: number) => applyRemaining(currentRemaining() + deltaMs),
    [applyRemaining, currentRemaining],
  );

  const set = useCallback((ms: number) => applyRemaining(ms), [applyRemaining]);

  return { state, remainingMs, toggle, reset, adjust, set, remainingNowMs: currentRemaining };
}
