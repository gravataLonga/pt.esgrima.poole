import { act, renderHook } from '@testing-library/react-native';

import type { BoutTiming } from './phase';
import { useBoutEngine } from './useBoutEngine';
import type { LiveEventDraft } from './useLiveEvents';

/**
 * Os marcos do combate (contrato `2.1.0`) — o que o motor **diz** sobre o que já sabia.
 *
 * O que se verifica aqui é a **sequência** e os carimbos, não um evento de cada vez: um combate
 * reconstitui-se pela ordem por que as coisas aconteceram, e é a ordem que se parte primeiro quando
 * alguém mexe no motor sem dar por isso.
 *
 * Os fake timers do Jest falsificam também o `performance.now()`, que é o relógio monotónico de onde
 * o `elapsed_ms` sai — por isso `advanceTimersByTime` move as duas contagens em conjunto.
 */

/** Um combate de quadro: três períodos de 3 min, com um minuto de intervalo pelo meio. */
const timing: BoutTiming = {
  durationSeconds: 180,
  periods: 3,
  restSeconds: 60,
  suddenDeathSeconds: 60,
  passivitySeconds: 60,
};

type Emitted = jest.Mock<void, [LiveEventDraft]>;

const setup = async () => {
  const onEvent: Emitted = jest.fn();
  const hook = await renderHook(() => useBoutEngine({ target: 15, timing, onEvent }));

  return { onEvent, engine: () => hook.result.current };
};

const types = (onEvent: Emitted): string[] => onEvent.mock.calls.map(([event]) => event.type);
const last = (onEvent: Emitted): LiveEventDraft => onEvent.mock.calls.at(-1)![0];

const run = async (fn: () => void) => {
  await act(async () => {
    fn();
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('os marcos do combate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('o primeiro arranque do cronómetro é o princípio do combate', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());

    // O `period_start` do primeiro período é redundante e entra na mesma: quem leia a linha temporal
    // não devia ter de saber que o primeiro período se chama `bout_start`.
    expect(types(onEvent)).toEqual(['bout_start', 'period_start', 'clock_start']);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      period: 1,
      at_ms: 0,
      elapsed_ms: 0,
      remaining_ms: 180_000,
      phase: 'period',
    });
  });

  it('o combate só começa uma vez — o resto são arranques e paragens', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(29_000);
    await run(() => engine().timer.toggle());
    await run(() => engine().timer.toggle());

    expect(types(onEvent)).toEqual([
      'bout_start',
      'period_start',
      'clock_start',
      'clock_stop',
      'clock_start',
    ]);
  });

  it('um toque com o tempo a correr dá halt e toque, e são dois acontecimentos', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(29_000);
    await run(() => engine().setScore('a')(1));

    // O `registerCombat` pára o cronómetro antes de aplicar o toque (ADR-020), e essa paragem conta:
    // um halt sem toque a seguir — material partido, um atleta fora da pista — é o que só ela conta.
    expect(types(onEvent).slice(-2)).toEqual(['clock_stop', 'touch']);
    expect(last(onEvent)).toMatchObject({ side: 'a', at_ms: 29_000, score_a: 1, score_b: 0 });
  });

  it('um toque com o tempo parado não inventa um halt que não houve', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().setScore('a')(1));

    expect(types(onEvent)).toEqual(['touch']);
  });

  it('o `elapsed_ms` conta as paragens e o `at_ms` não', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(29_000);
    await run(() => engine().timer.toggle());
    // Uma discussão de um minuto com o cronómetro parado: o combate anda, a esgrima não.
    await advance(60_000);
    await run(() => engine().timer.toggle());

    expect(last(onEvent)).toMatchObject({
      type: 'clock_start',
      at_ms: 29_000,
      elapsed_ms: 89_000,
      remaining_ms: 151_000,
    });
  });

  it('o descanso diz porque começou, e é o `remaining_ms` que o diz', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(95_000);
    await run(() => engine().startRest?.());

    // Um minuto e meio por esgrimir: isto é o árbitro a parar o combate, não o período a esgotar-se.
    expect(last(onEvent)).toMatchObject({
      type: 'rest_start',
      period: 1,
      at_ms: 95_000,
      remaining_ms: 85_000,
      phase: 'period',
    });
  });

  it('o período esgotado entra em descanso com o tempo a zero', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(180_000);
    await run(() => engine().onAction());

    expect(types(onEvent).slice(-2)).toEqual(['period_end', 'rest_start']);
    expect(last(onEvent)).toMatchObject({ type: 'rest_start', period: 1, remaining_ms: 0 });
  });

  it('sair do descanso acaba um e começa o outro, com o período novo por extenso', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(180_000);
    await run(() => engine().onAction());
    await run(() => engine().onAction());

    expect(types(onEvent).slice(-2)).toEqual(['rest_end', 'period_start']);

    // O descanso dispensado inteiro, e o segundo período a começar no tempo cheio: o `setPeriod`
    // ainda não se aplicou quando isto é emitido, e é por isso que vai escrito e não carimbado.
    expect(onEvent.mock.calls.at(-2)![0]).toMatchObject({
      type: 'rest_end',
      period: 1,
      phase: 'rest',
      remaining_ms: 60_000,
    });
    expect(last(onEvent)).toMatchObject({
      type: 'period_start',
      period: 2,
      at_ms: 0,
      remaining_ms: 180_000,
      phase: 'period',
    });
  });

  it('o `bout_end` leva o resultado final, e é a última linha da história', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(29_000);
    await run(() => engine().setScore('a')(1));
    await run(() => engine().end());

    expect(last(onEvent)).toMatchObject({ type: 'bout_end', score_a: 1, score_b: 0 });
  });

  it('recomeçar o assalto recomeça também o combate', async () => {
    const { onEvent, engine } = await setup();

    await run(() => engine().timer.toggle());
    await advance(29_000);
    await run(() => engine().reset());
    await run(() => engine().timer.toggle());

    // Outro `bout_start`, e outra origem para os `elapsed_ms`: um assalto novo não herda as horas
    // do anterior.
    expect(types(onEvent).slice(-3)).toEqual(['bout_start', 'period_start', 'clock_start']);
    expect(onEvent.mock.calls.at(-3)![0]).toMatchObject({ elapsed_ms: 0, remaining_ms: 180_000 });
  });
});
