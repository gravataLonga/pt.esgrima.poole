import { boutTiming, nextClockAction, phaseDuration, type BoutTiming } from './phase';

const timing = (over: Partial<BoutTiming> = {}): BoutTiming => ({
  durationSeconds: 180,
  periods: 3,
  restSeconds: 60,
  suddenDeathSeconds: 60,
  passivitySeconds: 60,
  ...over,
});

describe('boutTiming', () => {
  it('lê os presets da API', () => {
    expect(
      boutTiming({
        duration_seconds: 180,
        periods: 3,
        rest_seconds: 60,
        sudden_death_seconds: 60,
        passivity_seconds: 60,
      }),
    ).toEqual({
      durationSeconds: 180,
      periods: 3,
      restSeconds: 60,
      suddenDeathSeconds: 60,
      passivitySeconds: 60,
    });
  });

  it('cai nos valores FIE quando o servidor não manda os opcionais', () => {
    const fallback = boutTiming({ duration_seconds: 180, periods: 1 });
    expect(fallback.suddenDeathSeconds).toBe(60);
    expect(fallback.passivitySeconds).toBe(60);
  });

  it('respeita `passivity_seconds: 0` — não contar é uma escolha, não uma ausência', () => {
    expect(boutTiming({ duration_seconds: 180, periods: 1, passivity_seconds: 0 }).passivitySeconds).toBe(0);
  });

  it('trata a ausência de `rest_seconds` como sem descanso', () => {
    // Um servidor em 1.0.0 não manda o campo. Não é erro: é uma app sem descanso.
    expect(boutTiming({ duration_seconds: 180, periods: 3 }).restSeconds).toBe(0);
    expect(boutTiming({ duration_seconds: 180, periods: 3, rest_seconds: null }).restSeconds).toBe(
      0,
    );
  });

  it('ignora o descanso num assalto de um período', () => {
    // É o caso da poule: não há intervalo entre períodos que não existem.
    expect(boutTiming({ duration_seconds: 180, periods: 1, rest_seconds: 60 }).restSeconds).toBe(0);
  });
});

describe('phaseDuration', () => {
  it('dá a duração de cada fase', () => {
    expect(phaseDuration('period', timing())).toBe(180);
    expect(phaseDuration('rest', timing())).toBe(60);
    // A morte súbita conta o que a API mandou, não um valor fixo (contrato §7).
    expect(phaseDuration('priority', timing({ suddenDeathSeconds: 90 }))).toBe(90);
  });
});

describe('nextClockAction', () => {
  const input = (over: Partial<Parameters<typeof nextClockAction>[0]> = {}) =>
    nextClockAction({
      phase: 'period',
      period: 1,
      timing: timing(),
      expired: false,
      tied: false,
      ...over,
    });

  it('não oferece nada com o tempo a correr', () => {
    expect(input()).toBeNull();
  });

  it('oferece descanso no fim de um período que tem outro a seguir', () => {
    expect(input({ expired: true })).toEqual({ kind: 'rest' });
  });

  it('salta o descanso quando a API não o manda', () => {
    expect(input({ expired: true, timing: timing({ restSeconds: 0 }) })).toEqual({
      kind: 'nextPeriod',
      period: 2,
    });
  });

  it('em descanso, avançar está sempre disponível — mesmo antes de o intervalo acabar', () => {
    expect(input({ phase: 'rest', expired: false })).toEqual({ kind: 'nextPeriod', period: 2 });
  });

  it('oferece o sorteio no fim do último período com empate', () => {
    expect(input({ period: 3, expired: true, tied: true })).toEqual({ kind: 'drawPriority' });
  });

  it('não oferece sorteio se o último período acabar decidido', () => {
    expect(input({ period: 3, expired: true, tied: false })).toBeNull();
  });

  it('não oferece nada durante a morte súbita', () => {
    expect(input({ phase: 'priority', expired: true, tied: true })).toBeNull();
  });

  it('num assalto de um período, o fim do tempo empatado leva direto ao sorteio', () => {
    const poule = timing({ periods: 1, restSeconds: 0 });
    expect(input({ timing: poule, expired: true, tied: true })).toEqual({ kind: 'drawPriority' });
  });
});
