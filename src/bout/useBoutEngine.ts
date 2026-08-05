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

import { useReducer, useRef, useState } from 'react';
import { Vibration } from 'react-native';

import type { EventPhase } from '@/api/types';
import { monotonicNow, useTimer, type Timer } from '@/timer/useTimer';

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
  /**
   * O passo seguinte, feito. **A prioridade fica de fora**: essa tem duas respostas — sortear ou
   * marcar à mão — e quem escolhe entre elas é a folha da prioridade.
   */
  onAction: () => void;
  /**
   * Dar a prioridade a um atleta sem sorteio, ou passá-la ao outro depois de atribuída. É como
   * entra na app a prioridade que o aparelho da pista tirou.
   */
  setPriority: (side: Side) => void;
  /** Entrar em descanso por decisão do árbitro. `null` quando esta fase não o admite. */
  startRest: (() => void) | null;
  /** Mudar de período à mão, para trás ou para a frente. `null` num assalto de um período só. */
  goToPeriod: ((period: number) => void) | null;
  setScore: (side: Side) => (value: number) => void;
  giveCard: (side: Side) => (kind: CardKind) => void;
  /** Sem argumentos anula o último cartão; com eles, o último daquele atleta e daquele tipo. */
  undoCard: (side?: Side, kind?: CardKind) => void;
  /**
   * O combate acabou — a última linha da história (contrato `2.1.0`). Quem o chama é o ecrã, no
   * instante em que o árbitro confirma o resultado: o motor não sabe que existe submissão.
   */
  end: () => void;
  /** Volta ao princípio: 0–0, sem cartões, sem prioridade, primeiro período, tempo cheio. */
  reset: () => void;
}

/** Os cartões da app nos `type` do contrato §7. */
const CARD_EVENT: Record<CardKind, LiveEventDraft['type']> = {
  yellow: 'card_yellow',
  red: 'card_red',
  black: 'card_black',
};

/**
 * As fases do motor nos nomes do contrato §7. Só uma muda de nome: o minuto de morte súbita
 * chama-se `priority` aqui — pelo botão — e `sudden_death` no contrato, pelo regulamento.
 */
const EVENT_PHASE: Record<BoutPhase, EventPhase> = {
  period: 'period',
  rest: 'rest',
  priority: 'sudden_death',
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
   * O instante monotónico do `bout_start`, e a origem de todos os `elapsed_ms` (contrato `2.1.0`).
   *
   * Monotónico e não `Date`: é uma duração, e uma duração medida com hora de parede muda de valor
   * se o telemóvel acertar a hora a meio do combate. `null` até o cronómetro arrancar pela primeira
   * vez — antes disso não há de onde contar, e o campo é omitido em vez de inventado.
   */
  const boutStartedAt = useRef<number | null>(null);

  const phase: BoutPhase = rules.priority ? 'priority' : resting ? 'rest' : 'period';
  const durationSeconds = phaseDuration(phase, timing);

  /**
   * O período do evento, na numeração do contrato §7: a morte súbita é `periods + 1`. O descanso
   * não tem numeração própria — leva o período que acabou de terminar.
   */
  const eventPeriod = phase === 'priority' ? timing.periods + 1 : period;

  /*
   * O cronómetro vem antes de tudo o que o lê, e o `onExpire` é uma **declaração de função** —
   * sobe por içamento e passa-se aqui antes de existir o `emit` que ele chama. Ao contrário: o
   * carimbo dos eventos leria o cronómetro acima da linha onde ele é criado.
   */
  const timer = useTimer(durationSeconds, { onExpire });

  /** Milissegundos decorridos **dentro da fase**, carimbados no instante do evento. */
  const elapsedMs = (): number =>
    Math.max(0, Math.round(durationSeconds * 1000 - timer.remainingNowMs()));

  /**
   * Os quatro campos que a `2.1.0` acrescenta a **todos** os eventos, o grupo A incluído.
   *
   * O `at_ms` é tempo de esgrima e pára no halt; o `elapsed_ms` é tempo de relógio e nunca pára.
   * Nenhum se deriva do outro sem reconstruir todas as paragens — que é o que os `clock_start` e
   * `clock_stop` passam a permitir.
   */
  const stamp = () => ({
    phase: EVENT_PHASE[phase],
    ...(boutStartedAt.current === null
      ? {}
      : { elapsed_ms: Math.max(0, Math.round(monotonicNow() - boutStartedAt.current)) }),
    remaining_ms: Math.max(0, Math.round(timer.remainingNowMs())),
    at: new Date().toISOString(),
  });

  /**
   * Guarda o acontecimento e, havendo para onde, manda-o.
   *
   * A ordem importa: o registo local **não** depende de haver emissor. No modo cronómetro não há
   * servidor nenhum e a linha temporal tem de existir na mesma; num assalto ligado, o emissor pode
   * desistir a meio (`useLiveEvents`) sem que o árbitro perca o que se passou.
   *
   * O carimbo vem primeiro e o `draft` por cima: quase sempre são campos disjuntos, e onde não são
   * — a morte súbita, que se carimba antes de a fase mudar — quem sabe é quem emite.
   *
   * **O placar pertence aos eventos que o mudam** (ADR-035): o toque, o cartão, e o `bout_end`, que
   * leva o resultado final por definição. Um `clock_start` não sabe o resultado nem tem de saber —
   * quem lê o placar ao vivo lê o último evento *com* placar, não o último.
   */
  const emit = (draft: LiveEventDraft) => {
    const event: LiveEventDraft = { ...stamp(), ...draft };
    setLog((entries) => [...entries, { ...event, seq: entries.length + 1 }]);
    onEvent?.(event);
  };

  /*
   * Fim de tempo tem de ser percetível sem olhar (spec §7). `Vibration` é do core do RN; o som
   * fica para a F3, com o `expo-av` (ADR-002).
   *
   * Não é memorizado: lê a fase, o período e o placar deste render, e o `useTimer` guarda-o numa
   * ref de propósito — trocar de identidade não reinicia o intervalo de contagem.
   */
  function onExpire() {
    Vibration.vibrate([0, 400, 180, 400]);

    // Só o tempo regulamentar acaba um período. O descanso é intervalo, e a morte súbita esgotada
    // acaba o assalto — quem o resolve é a prioridade já sorteada.
    if (phase !== 'period') return;

    /*
     * **Não há `clock_stop` aqui.** O tempo a esgotar-se já tem evento próprio, no mesmo instante,
     * e o `clock_stop` existe para contar o halt — que é decisão de quem arbitra.
     */
    emit({
      type: 'period_end',
      period,
      at_ms: Math.round(durationSeconds * 1000),
      score_a: rules.a,
      score_b: rules.b,
    });
  }

  const onPrioritySettled = (side: Side) => {
    dispatch({ type: 'drawPriority', side });

    /*
     * A morte súbita é o período a seguir ao último, ao segundo zero dele — e é preciso dizê-lo
     * por extenso: no instante em que isto corre o `dispatch` ainda não se aplicou, a fase do
     * motor é a do período que acabou, e o cronómetro está a zero.
     */
    const suddenDeath = {
      period: timing.periods + 1,
      at_ms: 0,
      phase: 'sudden_death' as const,
      remaining_ms: timing.suddenDeathSeconds * 1000,
    };

    // O sorteio abre a morte súbita, e o `sudden_death_start` vem **antes** dele (contrato §7).
    emit({ type: 'sudden_death_start', ...suddenDeath });
    emit({ type: 'priority', side, ...suddenDeath, score_a: rules.a, score_b: rules.b });
  };

  const priorityDraw = usePriorityDraw(onPrioritySettled);

  /**
   * A prioridade dita por quem arbitra, sem passar pelo sorteio da app.
   *
   * Muitos aparelhos de pista tiram a prioridade eles próprios: quando isso acontece, o resultado já
   * existe antes de a app ser tocada, e sortear outra vez seria inventar uma segunda prioridade para
   * o mesmo assalto. Serve também de correção — a mesma pergunta, feita depois: passa a marca ao
   * outro atleta sem recomeçar a morte súbita, que já vai a meio.
   *
   * A linha temporal distingue os dois casos sozinha: o primeiro leva o `sudden_death_start` à
   * frente, o segundo é só mais um `priority` — e quem a leia vê a prioridade a mudar de lado, com
   * o tempo em que mudou.
   */
  const setPriority = (side: Side) => {
    if (rules.priority === null) {
      onPrioritySettled(side);
      return;
    }

    if (rules.priority === side) return;

    dispatch({ type: 'drawPriority', side });
    emit({
      type: 'priority',
      side,
      period: eventPeriod,
      at_ms: elapsedMs(),
      score_a: rules.a,
      score_b: rules.b,
    });
  };

  /**
   * O cronómetro com os marcos por cima dele — é este `toggle` que o ecrã carrega, e o do
   * `useTimer` fica por baixo, intocado.
   *
   * É aqui que o combate ganha um princípio: o primeiro arranque é o `bout_start`, e é dele que
   * todos os `elapsed_ms` se contam. Daí para a frente, cada arranque e cada paragem sobem — o par
   * `clock_start`/`clock_stop`. Sem os dois, um combate de três minutos que demorou vinte não se
   * distingue de um que demorou quatro, e é essa diferença que uma reclamação discute.
   */
  const toggleClock = () => {
    if (timer.state === 'running') {
      emit({ type: 'clock_stop', period: eventPeriod, at_ms: elapsedMs() });
      timer.toggle();
      return;
    }

    // Inerte: o tempo esgotou-se, ou está a zero. O `useTimer` não arranca, e o que não aconteceu
    // não se conta.
    if (timer.state === 'expired' || timer.remainingMs <= 0) return;

    if (boutStartedAt.current === null) {
      boutStartedAt.current = monotonicNow();

      const opening = { period: eventPeriod, at_ms: elapsedMs() };

      // O `period_start` do primeiro período é redundante e entra na mesma (contrato §7): quem leia
      // a linha temporal não devia ter de saber que o primeiro período se chama `bout_start`.
      emit({ type: 'bout_start', ...opening });
      emit({ type: 'period_start', ...opening });
    }

    emit({ type: 'clock_start', period: eventPeriod, at_ms: elapsedMs() });
    timer.toggle();
  };

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

  /**
   * Entrar no descanso, venha do tempo esgotado ou do árbitro.
   *
   * O `remaining_ms` é que distingue os dois casos, e é a razão de o campo existir: `0` é o período
   * a esgotar-se; `85000` é o árbitro a parar o combate com um minuto e meio por esgrimir.
   */
  const beginRest = () => {
    emit({ type: 'rest_start', period: eventPeriod, at_ms: elapsedMs() });
    setResting(true);
  };

  const onAction = () => {
    if (!action) return;

    if (action.kind === 'rest') {
      beginRest();
      return;
    }

    if (action.kind === 'nextPeriod') {
      // Só há descanso para acabar se se estava nele: sem intervalo configurado, passa-se de um
      // período ao seguinte diretamente. O `remaining_ms` diz quanto se dispensou.
      if (phase === 'rest') {
        emit({ type: 'rest_end', period: eventPeriod, at_ms: elapsedMs() });
      }

      /*
       * O período novo começa por extenso, e não pelo carimbo: o `setPeriod` ainda não se aplicou
       * — a fase, o período e o cronómetro deste render são os do que acabou de terminar.
       */
      emit({
        type: 'period_start',
        period: action.period,
        at_ms: 0,
        phase: 'period',
        remaining_ms: timing.durationSeconds * 1000,
      });

      setResting(false);
      setPeriod(action.period);
    }

    // A prioridade **não** se resolve aqui. O botão dela abre uma folha, porque há duas respostas à
    // mesma pergunta — sortear (`priorityDraw.start`) ou marcar quem já a tirou no aparelho da pista
    // (`setPriority`) — e escolher entre as duas é do ecrã, não do motor.
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
  const startRest = canRest ? beginRest : null;

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
    // Pelo `toggleClock` e não pelo cronómetro cru: este halt é um acontecimento do combate como
    // qualquer outro, e é dele que vem a maior parte dos `clock_stop`.
    if (timer.state === 'running') toggleClock();
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

  /**
   * A última linha da história, com o resultado final.
   *
   * **Não substitui o `score`** (contrato §7): o que fica registado continua a ser o `a`/`b` da
   * submissão. Um combate cujo `score` nunca chegou por a rede ter caído fica com `bout_end` e sem
   * resultado — que é precisamente a situação que interessa ver.
   */
  const end = () => {
    emit({
      type: 'bout_end',
      period: eventPeriod,
      at_ms: elapsedMs(),
      score_a: rules.a,
      score_b: rules.b,
    });
  };

  const reset = () => {
    dispatch({ type: 'reset' });
    setPeriod(1);
    setResting(false);
    setLog([]);
    // Volta ao princípio quer dizer também sem princípio: o arranque seguinte é outro `bout_start`,
    // e é dele que os `elapsed_ms` passam a contar-se.
    boutStartedAt.current = null;
    // Conta como acontecimento: o relógio de passividade do assalto anterior não transita.
    setCombatToken((token) => token + 1);
    timer.reset();
  };

  return {
    rules,
    phase,
    period,
    durationSeconds,
    // O cronómetro que sai daqui é o embrulhado: quem carrega no mostrador emite os marcos sem
    // saber que o faz.
    timer: { ...timer, toggle: toggleClock },
    passivityMs: phase === 'rest' ? null : passivity.remainingMs,
    priorityDraw,
    log,
    action,
    onAction,
    setPriority,
    startRest,
    goToPeriod,
    setScore,
    giveCard,
    undoCard,
    end,
    reset,
  };
}
