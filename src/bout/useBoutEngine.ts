/**
 * O assalto a decorrer, sem identidade e sem destino.
 *
 * Junta num sítio só tudo o que é *conduzir* um assalto — toques, cartões, prioridade, períodos,
 * descanso, cronómetro e passividade — e deixa de fora as duas coisas que mudam consoante quem o
 * usa: **quem** está em pista e **para onde** vai o resultado.
 *
 * Existe porque há dois ecrãs a conduzir assaltos: o `/bout/[id]`, ligado a uma poule, e o
 * `/timer`, autónomo e offline (ADR-021). Duplicar isto seria duplicar regra FIE, que é
 * exatamente o género de código que não pode divergir entre cópias.
 */

import { useCallback, useReducer, useState } from 'react';
import { Vibration } from 'react-native';

import { useTimer, type Timer } from '@/timer/useTimer';

import {
  nextClockAction,
  phaseDuration,
  type BoutPhase,
  type BoutTiming,
  type ClockAction,
} from './phase';
import {
  boutRules,
  initialBoutRules,
  type BoutRulesState,
  type CardKind,
  type Side,
} from './rules';
import { usePassivity } from './usePassivity';
import { usePriorityDraw, type PriorityDraw } from './usePriorityDraw';

export interface UseBoutEngineOptions {
  /** Toques que terminam o assalto. */
  target: number;
  timing: BoutTiming;
  /** Resultado de partida. Um assalto retomado abre com o que já lá estava. */
  initialA?: number;
  initialB?: number;
}

export interface BoutEngine {
  rules: BoutRulesState;
  phase: BoutPhase;
  /** Período atual, 1..periods. */
  period: number;
  /** Quanto conta a fase atual. */
  durationSeconds: number;
  timer: Timer;
  /** Relógio de passividade, ou `null` nas fases em que não se conta. */
  passivityMs: number | null;
  priorityDraw: PriorityDraw;
  /** O passo seguinte do assalto, ou `null` se não houver. */
  action: ClockAction | null;
  onAction: () => void;
  setScore: (side: Side) => (value: number) => void;
  giveCard: (side: Side) => (kind: CardKind) => void;
  undoCard: () => void;
  /** Volta ao princípio: 0–0, sem cartões, sem prioridade, primeiro período, tempo cheio. */
  reset: () => void;
}

export function useBoutEngine({
  target,
  timing,
  initialA = 0,
  initialB = 0,
}: UseBoutEngineOptions): BoutEngine {
  const [rules, dispatch] = useReducer(boutRules, undefined, () =>
    initialBoutRules(target, initialA, initialB),
  );

  // Período e descanso são fases do assalto, não do cronómetro (ADR-015). A prioridade já vive no
  // redutor porque decide o vencedor, e é dela que se deriva a terceira fase.
  const [period, setPeriod] = useState(1);
  const [resting, setResting] = useState(false);
  // Conta os sinais de combate — toque ou cartão. Cada incremento reinicia o minuto de passividade.
  const [combatToken, setCombatToken] = useState(0);

  const onPrioritySettled = useCallback(
    (side: Side) => dispatch({ type: 'drawPriority', side }),
    [],
  );
  const priorityDraw = usePriorityDraw(onPrioritySettled);

  const phase: BoutPhase = rules.priority ? 'priority' : resting ? 'rest' : 'period';
  const durationSeconds = phaseDuration(phase, timing);

  // Fim de tempo tem de ser percetível sem olhar (spec §7). `Vibration` é do core do RN; o som
  // fica para a F3, com o `expo-av` (ADR-002).
  const onExpire = useCallback(() => Vibration.vibrate([0, 400, 180, 400]), []);
  const timer = useTimer(durationSeconds, { onExpire });

  // Não se conta passividade no intervalo: os atletas não estão em pista. O minuto vem da API
  // (contrato §7, `passivity_seconds`) e não daqui.
  const passivity = usePassivity({
    running: timer.state === 'running' && phase !== 'rest',
    resetToken: combatToken,
    seconds: timing.passivitySeconds,
  });

  const action = nextClockAction({
    phase,
    period,
    timing,
    expired: timer.state === 'expired',
    tied: rules.a === rules.b,
  });

  const onAction = () => {
    if (!action) return;

    if (action.kind === 'rest') {
      setResting(true);
      return;
    }

    if (action.kind === 'nextPeriod') {
      setResting(false);
      setPeriod(action.period);
      return;
    }

    // A piscadela mostra o sorteio a acontecer, como nos aparelhos da FIE. A marca fixa-se no
    // atleta sorteado quando ela pára — daí não haver aqui nenhum aviso escrito.
    priorityDraw.start();
  };

  /**
   * Um toque ou um cartão é sempre precedido de "halt": param o cronómetro, e reiniciam o minuto
   * de passividade (ADR-020). Fica aqui e não no redutor porque mexe no cronómetro, que é um hook.
   */
  const registerCombat = () => {
    if (timer.state === 'running') timer.toggle();
    setCombatToken((token) => token + 1);
  };

  const setScore = (side: Side) => (value: number) => {
    registerCombat();
    dispatch({ type: 'touch', side, delta: value > rules[side] ? 1 : -1 });
  };

  const giveCard = (side: Side) => (kind: CardKind) => {
    registerCombat();
    dispatch({ type: 'card', side, kind });
  };

  const undoCard = () => dispatch({ type: 'undoCard' });

  const reset = () => {
    dispatch({ type: 'reset' });
    setPeriod(1);
    setResting(false);
    // Conta como acontecimento: o relógio de passividade do assalto anterior não transita.
    setCombatToken((token) => token + 1);
    timer.reset();
  };

  return {
    rules,
    phase,
    period,
    durationSeconds,
    timer,
    passivityMs: phase === 'rest' ? null : passivity.remainingMs,
    priorityDraw,
    action,
    onAction,
    setScore,
    giveCard,
    undoCard,
    reset,
  };
}
