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

/**
 * Um acontecimento do assalto, tal como ele sobe para a plataforma — mesmos `type`, mesmo `period`,
 * mesmo placar depois. O `at` é local e serve para ordenar a lista sem depender do relógio de
 * ninguém.
 */
export interface BoutLogEntry extends LiveEventDraft {
  /** Ordem de chegada, a partir de `1`. É o `seq` que subiria, mesmo sem servidor para onde subir. */
  seq: number;
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
  /**
   * O que já aconteceu no assalto, por ordem de chegada. Mantido **sempre**, com servidor ou sem
   * ele: é o que o árbitro consulta quando duvida de um cartão, e não há endpoint que o devolva.
   */
  log: BoutLogEntry[];
  /** O passo seguinte do assalto, ou `null` se não houver. */
  action: ClockAction | null;
  onAction: () => void;
  /** Entrar em descanso por decisão do árbitro. `null` quando esta fase não o admite. */
  startRest: (() => void) | null;
  /** Mudar de período à mão, para trás ou para a frente. `null` num assalto de um período só. */
  goToPeriod: ((period: number) => void) | null;
  setScore: (side: Side) => (value: number) => void;
  giveCard: (side: Side) => (kind: CardKind) => void;
  /** Sem argumentos anula o último cartão; com eles, o último daquele atleta e daquele tipo. */
  undoCard: (side?: Side, kind?: CardKind) => void;
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
  const [log, setLog] = useState<BoutLogEntry[]>([]);

  /**
   * Guarda o acontecimento e, havendo para onde, manda-o.
   *
   * A ordem importa: o registo local **não** depende de haver emissor. No modo cronómetro não há
   * servidor nenhum e a linha temporal tem de existir na mesma; num assalto ligado, o emissor pode
   * desistir a meio (`useLiveEvents`) sem que o árbitro perca o que se passou.
   */
  const emit = useCallback(
    (draft: LiveEventDraft) => {
      setLog((entries) => [...entries, { ...draft, seq: entries.length + 1 }]);
      onEvent?.(draft);
    },
    [onEvent],
  );

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
    emit({
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

    emit({
      type: 'period_end',
      period,
      at_ms: Math.round(durationSeconds * 1000),
      score_a: rules.a,
      score_b: rules.b,
    });
  }, [durationSeconds, emit, period, phase, rules.a, rules.b]);

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
   * Descansar por decisão do árbitro, e não só quando o tempo acaba.
   *
   * O `action` só oferece o descanso no instante em que o período esgota, e na pista isso não
   * chega: o intervalo pode ser preciso a meio — assistência médica, material partido, um atleta
   * que sai da pista. Só existe onde existe intervalo (`restSeconds > 0`), nunca no último período
   * e nunca na morte súbita, que não tem intervalo por definição.
   */
  const canRest = phase === 'period' && timing.restSeconds > 0 && period < timing.periods;
  const startRest = canRest ? () => setResting(true) : null;

  /**
   * Mudar de período à mão, nos dois sentidos.
   *
   * Existe pela mesma razão que o `± 10 s`: o árbitro é a autoridade e a app não pode ser mais
   * teimosa do que ele — um período mal contado corrigia-se, até aqui, saindo do assalto. Recomeça
   * sempre no tempo cheio, porque um período que começa a meio não é um período.
   *
   * **Não vai à linha temporal.** O conjunto de `type` do contrato §7 é fechado, e um período
   * corrigido não é um acontecimento da pista — é uma correção de quem a arbitra.
   */
  const goToPeriod =
    timing.periods > 1
      ? (next: number) => {
          const clamped = Math.min(Math.max(1, next), timing.periods);
          setResting(false);
          setPeriod(clamped);
          timer.reset();
        }
      : null;

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
    emit({ type, side, period: eventPeriod, at_ms: at, score_a: next.a, score_b: next.b });
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

  const undoCard = (side?: Side, kind?: CardKind) => dispatch({ type: 'undoCard', side, kind });

  const reset = () => {
    dispatch({ type: 'reset' });
    setPeriod(1);
    setResting(false);
    setLog([]);
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
    log,
    action,
    onAction,
    startRest,
    goToPeriod,
    setScore,
    giveCard,
    undoCard,
    reset,
  };
}
