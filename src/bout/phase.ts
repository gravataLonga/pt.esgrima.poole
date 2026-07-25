/**
 * Fases de um assalto e o que o cronómetro oferece a seguir.
 *
 * Um assalto não é uma contagem só: é *n* períodos, com descanso pelo meio, e possivelmente um
 * minuto de morte súbita no fim. Cada fase tem a sua duração — e é por isso que o `useTimer` deixou
 * de conhecer períodos (ADR-015): conta a fase que lhe derem, e quem decide qual é são estas
 * funções.
 *
 * Tudo aqui é puro. A decisão "que botão mostrar ao árbitro" é a parte com regras FIE dentro, e é
 * a que dá para verificar sem renderizar nada.
 */

export type BoutPhase =
  /** Um dos períodos regulamentares. */
  | 'period'
  /** Descanso entre períodos. */
  | 'rest'
  /** Minuto de morte súbita, com prioridade sorteada. */
  | 'priority';

/** Presets do assalto, tal como vêm da API. */
export interface BoutTiming {
  /** Duração de **um** período, em segundos. */
  durationSeconds: number;
  /** Número de períodos. `1` em poule. */
  periods: number;
  /** Descanso entre períodos, em segundos. `0` → não há descanso. */
  restSeconds: number;
}

/** Normaliza os presets. `rest_seconds` é opcional no contrato (1.1.0) e pode vir a `null`. */
export function boutTiming(input: {
  duration_seconds: number;
  periods: number;
  rest_seconds?: number | null;
}): BoutTiming {
  return {
    durationSeconds: Math.max(0, input.duration_seconds),
    periods: Math.max(1, input.periods),
    // Sem períodos para separar, o descanso não existe — nem que a API mande um valor.
    restSeconds: input.periods > 1 ? Math.max(0, input.rest_seconds ?? 0) : 0,
  };
}

/** Quantos segundos a fase atual conta. */
export function phaseDuration(
  phase: BoutPhase,
  timing: BoutTiming,
  prioritySeconds: number,
): number {
  if (phase === 'priority') return prioritySeconds;
  if (phase === 'rest') return timing.restSeconds;
  return timing.durationSeconds;
}

/**
 * O passo seguinte do assalto — no máximo um, sempre. Um único botão contextual em vez de três
 * permanentes: em qualquer instante de um assalto só um deles faz sentido, e tê-los todos no ecrã
 * dava três alvos onde só há uma decisão.
 */
export type ClockAction =
  /** Entrar no descanso entre períodos. */
  | { kind: 'rest' }
  /** Passar ao período seguinte — também é a forma de dispensar o descanso. */
  | { kind: 'nextPeriod'; period: number }
  /** Sortear a prioridade: acabou o último período com o resultado empatado. */
  | { kind: 'drawPriority' };

export interface ClockActionInput {
  phase: BoutPhase;
  /** Período atual, 1..periods. */
  period: number;
  timing: BoutTiming;
  /** O cronómetro da fase atual chegou a zero. */
  expired: boolean;
  /** O resultado está empatado. */
  tied: boolean;
}

export function nextClockAction({
  phase,
  period,
  timing,
  expired,
  tied,
}: ClockActionInput): ClockAction | null {
  // Em descanso, avançar está sempre disponível — é assim que se dispensa o resto do intervalo
  // quando os dois atletas já estão em pista.
  if (phase === 'rest') return { kind: 'nextPeriod', period: period + 1 };

  // Na morte súbita não há passo seguinte: ou alguém toca, ou ganha quem tem prioridade.
  if (phase === 'priority') return null;

  if (!expired) return null;

  if (period < timing.periods) {
    return timing.restSeconds > 0 ? { kind: 'rest' } : { kind: 'nextPeriod', period: period + 1 };
  }

  return tied ? { kind: 'drawPriority' } : null;
}
