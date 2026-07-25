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
  type BoutAction,
  type BoutRulesState,
  type CardKind,
  type Side,
} from './rules';
import { usePassivity } from './usePassivity';
import { usePriorityDraw, type PriorityDraw } from './usePriorityDraw';
import type { LiveEventDraft } from './useLiveEvents';

export interface UseBoutEngineOptions {
  /** Toques que terminam o assalto. */
  target: number;
  timing: BoutTiming;
  /** Resultado de partida. Um assalto retomado abre com o que já lá estava. */
  initialA?: number;
  initialB?: number;
  /**
   * Espelha para a plataforma o que acontece na pista, à medida que acontece (contrato §7).
   * Ausente no modo cronómetro autónomo, que não tem servidor para onde o mandar — e é por isso
   * que é opcional: não o passar deixa o motor exatamente como estava.
   */
  onEvent?: (event: LiveEventDraft) => void;
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

/** Os cartões da app nos `type` do contrato §7. */
const CARD_EVENT: Record<CardKind, LiveEventDraft['type']> = {
  yellow: 'card_yellow',
  red: 'card_red',
  black: 'card_black',
};

/** A ação mexeu no assalto? O redutor devolve o estado intacto quando recusa. */
function changed(before: BoutRulesState, after: BoutRulesState): boolean {
  return (
    before.a !== after.a ||
    before.b !== after.b ||
    before.cards.length !== after.cards.length ||
    before.priority !== after.priority
  );
}

export function useBoutEngine({
  target,
  timing,
  initialA = 0,
  initialB = 0,
  onEvent,
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

  const phase: BoutPhase = rules.priority ? 'priority' : resting ? 'rest' : 'period';
  const durationSeconds = phaseDuration(phase, timing);

  /**
   * O período do evento, na numeração do contrato §7: a morte súbita é `periods + 1`. O descanso
   * não tem numeração própria — nada acontece em pista durante ele.
   */
  const eventPeriod = phase === 'priority' ? timing.periods + 1 : period;

  /** Milissegundos decorridos **dentro da fase**, carimbados no instante do evento. */
  const elapsedMs = (): number =>
    Math.max(0, Math.round(durationSeconds * 1000 - timer.remainingNowMs()));

  const onPrioritySettled = (side: Side) => {
    dispatch({ type: 'drawPriority', side });
    // O sorteio abre a morte súbita: é o período a seguir ao último, ao segundo zero dele.
    onEvent?.({
      type: 'priority',
      side,
      period: timing.periods + 1,
      at_ms: 0,
      score_a: rules.a,
      score_b: rules.b,
    });
  };

  const priorityDraw = usePriorityDraw(onPrioritySettled);

  // Fim de tempo tem de ser percetível sem olhar (spec §7). `Vibration` é do core do RN; o som
  // fica para a F3, com o `expo-av` (ADR-002).
  const onExpire = useCallback(() => {
    Vibration.vibrate([0, 400, 180, 400]);

    // Só o tempo regulamentar acaba um período. O descanso é intervalo, e a morte súbita esgotada
    // acaba o assalto — quem o resolve é a prioridade já sorteada.
    if (phase !== 'period') return;

    onEvent?.({
      type: 'period_end',
      period,
      at_ms: Math.round(durationSeconds * 1000),
      score_a: rules.a,
      score_b: rules.b,
    });
  }, [durationSeconds, onEvent, period, phase, rules.a, rules.b]);

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

  /**
   * Aplica a ação e espelha-a para a plataforma, com o placar **depois** dela.
   *
   * O evento só sai se a ação tiver mudado alguma coisa: um `+` no limite de toques e um segundo
   * cartão preto são recusados pelo redutor, e o que não aconteceu não se conta.
   */
  const apply = (action: BoutAction, type: LiveEventDraft['type'], side?: Side) => {
    const at = elapsedMs();
    const next = boutRules(rules, action);
    dispatch(action);

    if (!changed(rules, next)) return;
    onEvent?.({ type, side, period: eventPeriod, at_ms: at, score_a: next.a, score_b: next.b });
  };

  const setScore = (side: Side) => (value: number) => {
    registerCombat();

    if (value <= rules[side]) {
      // Retirar um toque não tem evento: o conjunto de `type` do contrato §7 é fechado e não o
      // prevê. O placar corrigido vai no evento seguinte — quem manda é o placar, não a contagem
      // dos eventos (ADR-029).
      dispatch({ type: 'touch', side, delta: -1 });
      return;
    }

    apply({ type: 'touch', side, delta: 1 }, 'touch', side);
  };

  const giveCard = (side: Side) => (kind: CardKind) => {
    registerCombat();
    apply({ type: 'card', side, kind }, CARD_EVENT[kind], side);
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
