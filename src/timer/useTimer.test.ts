import { act, renderHook } from '@testing-library/react-native';

import { useTimer } from './useTimer';

/**
 * Os fake timers do Jest 29 também falsificam `performance.now()`, por isso `advanceTimersByTime`
 * move o relógio monotónico e os ticks em conjunto — que é exatamente o que o cronómetro deriva.
 */
describe('useTimer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('arranca parado no tempo cheio', async () => {
    const { result } = await renderHook(() => useTimer(180));

    expect(result.current.state).toBe('idle');
    expect(result.current.remainingMs).toBe(180_000);
  });

  it('não conta enquanto ninguém o iniciar', async () => {
    const { result } = await renderHook(() => useTimer(180));

    await advance(5_000);
    expect(result.current.remainingMs).toBe(180_000);
  });

  it('conta decrescente depois do toggle', async () => {
    const { result } = await renderHook(() => useTimer(180));

    await act(async () => result.current.toggle());
    expect(result.current.state).toBe('running');

    await advance(3_000);
    expect(result.current.remainingMs).toBe(177_000);
  });

  it('congela no toggle seguinte e retoma de onde parou', async () => {
    const { result } = await renderHook(() => useTimer(180));

    await act(async () => result.current.toggle());
    await advance(10_000);
    await act(async () => result.current.toggle());

    expect(result.current.state).toBe('paused');
    expect(result.current.remainingMs).toBe(170_000);

    await advance(30_000);
    expect(result.current.remainingMs).toBe(170_000);

    await act(async () => result.current.toggle());
    await advance(5_000);
    expect(result.current.remainingMs).toBe(165_000);
  });

  /** É este o teste que falha se alguém trocar a derivação monotónica por um decremento por tick. */
  it('não acumula desvio ao fim de 3 minutos', async () => {
    const { result } = await renderHook(() => useTimer(200));

    await act(async () => result.current.toggle());
    await advance(180_000);

    expect(Math.abs(result.current.remainingMs - 20_000)).toBeLessThanOrEqual(100);
  });

  it('expira em zero e avisa uma só vez', async () => {
    const onExpire = jest.fn();
    const { result } = await renderHook(() => useTimer(3, { onExpire }));

    await act(async () => result.current.toggle());
    await advance(4_000);

    expect(result.current.state).toBe('expired');
    expect(result.current.remainingMs).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('não reinicia sozinho depois de expirar', async () => {
    const { result } = await renderHook(() => useTimer(3));

    await act(async () => result.current.toggle());
    await advance(4_000);
    await act(async () => result.current.toggle());

    expect(result.current.state).toBe('expired');
    expect(result.current.remainingMs).toBe(0);
  });

  it('reset volta ao tempo cheio, parado', async () => {
    const { result } = await renderHook(() => useTimer(180));

    await act(async () => result.current.toggle());
    await advance(20_000);
    await act(async () => result.current.reset());

    expect(result.current.state).toBe('idle');
    expect(result.current.remainingMs).toBe(180_000);

    await advance(5_000);
    expect(result.current.remainingMs).toBe(180_000);
  });

  it('recomeça no tempo cheio quando a duração muda de fase', async () => {
    // É assim que o descanso e a morte súbita reutilizam o mesmo cronómetro (ADR-015).
    const { result, rerender } = await renderHook(
      ({ seconds }: { seconds: number }) => useTimer(seconds),
      { initialProps: { seconds: 180 } },
    );

    await act(async () => result.current.toggle());
    await advance(20_000);
    await rerender({ seconds: 60 });

    expect(result.current.state).toBe('idle');
    expect(result.current.remainingMs).toBe(60_000);
  });

  describe('acertar o tempo', () => {
    it('soma e subtrai ao que falta', async () => {
      const { result } = await renderHook(() => useTimer(180));

      await act(async () => result.current.adjust(10_000));
      expect(result.current.remainingMs).toBe(190_000);

      await act(async () => result.current.adjust(-30_000));
      expect(result.current.remainingMs).toBe(160_000);
    });

    it('não pára a contagem nem perde a precisão', async () => {
      const { result } = await renderHook(() => useTimer(180));

      await act(async () => result.current.toggle());
      await advance(20_000);
      await act(async () => result.current.adjust(10_000));

      expect(result.current.state).toBe('running');
      expect(result.current.remainingMs).toBe(170_000);

      await advance(5_000);
      expect(Math.abs(result.current.remainingMs - 165_000)).toBeLessThanOrEqual(100);
    });

    it('não desce abaixo de zero, e a zero dá o tempo por esgotado', async () => {
      const onExpire = jest.fn();
      const { result } = await renderHook(() => useTimer(180, { onExpire }));

      await act(async () => result.current.adjust(-999_000));

      expect(result.current.remainingMs).toBe(0);
      expect(result.current.state).toBe('expired');
      // Esgotar por decisão do árbitro não é o mesmo que esgotar sozinho: nada de vibrar.
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('acrescentar tempo depois de esgotar deixa o cronómetro pronto a retomar', async () => {
      const { result } = await renderHook(() => useTimer(3));

      await act(async () => result.current.toggle());
      await advance(4_000);
      expect(result.current.state).toBe('expired');

      await act(async () => result.current.adjust(30_000));
      expect(result.current.state).toBe('paused');

      await act(async () => result.current.toggle());
      expect(result.current.state).toBe('running');
    });

    it('`set` escreve um valor exato', async () => {
      const { result } = await renderHook(() => useTimer(180));

      await act(async () => result.current.set(65_000));
      expect(result.current.remainingMs).toBe(65_000);
    });
  });
});
