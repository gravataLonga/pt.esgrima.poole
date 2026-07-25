import { act, renderHook } from '@testing-library/react-native';

import { PASSIVITY_SECONDS, usePassivity } from './usePassivity';

/**
 * Os fake timers do Jest 29 falsificam também `performance.now()`, por isso `advanceTimersByTime`
 * move o relógio monotónico e os ticks em conjunto — que é o que o contador deriva.
 */
describe('usePassivity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  const setup = async (props = { running: false, resetToken: 0 }) =>
    renderHook((p: { running: boolean; resetToken: number }) => usePassivity(p), {
      initialProps: props,
    });

  it('arranca no minuto cheio', async () => {
    const { result } = await setup();

    expect(result.current.remainingMs).toBe(PASSIVITY_SECONDS * 1000);
    expect(result.current.expired).toBe(false);
  });

  it('não conta com o tempo principal parado', async () => {
    const { result } = await setup();

    await advance(20_000);
    expect(result.current.remainingMs).toBe(60_000);
  });

  it('conta enquanto o tempo principal corre', async () => {
    const { result, rerender } = await setup();

    await rerender({ running: true, resetToken: 0 });
    await advance(15_000);

    expect(result.current.remainingMs).toBe(45_000);
  });

  it('volta ao minuto cheio quando o tempo principal pára', async () => {
    const { result, rerender } = await setup();

    await rerender({ running: true, resetToken: 0 });
    await advance(30_000);
    await rerender({ running: false, resetToken: 0 });

    expect(result.current.remainingMs).toBe(60_000);
  });

  it('volta ao minuto cheio a cada sinal de combate', async () => {
    const { result, rerender } = await setup();

    await rerender({ running: true, resetToken: 0 });
    await advance(40_000);
    expect(result.current.remainingMs).toBe(20_000);

    // Um toque ou um cartão: o contador recomeça sem o cronómetro principal parar.
    await rerender({ running: true, resetToken: 1 });
    expect(result.current.remainingMs).toBe(60_000);

    await advance(5_000);
    expect(result.current.remainingMs).toBe(55_000);
  });

  it('reinicia duas vezes em dois sinais seguidos', async () => {
    const { result, rerender } = await setup();

    await rerender({ running: true, resetToken: 1 });
    await advance(10_000);
    await rerender({ running: true, resetToken: 2 });

    expect(result.current.remainingMs).toBe(60_000);
  });

  it('pára em zero e assinala, sem passar a negativo', async () => {
    const { result, rerender } = await setup();

    await rerender({ running: true, resetToken: 0 });
    await advance(90_000);

    expect(result.current.remainingMs).toBe(0);
    expect(result.current.expired).toBe(true);
  });
});
