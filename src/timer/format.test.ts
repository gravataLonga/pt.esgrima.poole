import { formatClock } from './format';

describe('formatClock', () => {
  it('mostra MM:SS acima de 10 s', () => {
    expect(formatClock(180_000)).toBe('03:00');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(10_000)).toBe('00:10');
  });

  it('mostra minutos e décimos nos últimos 10 s', () => {
    expect(formatClock(9_900)).toBe('0:09,9');
    expect(formatClock(1_500)).toBe('0:01,5');
    expect(formatClock(0)).toBe('0:00,0');
  });

  it('nunca desce abaixo de zero', () => {
    expect(formatClock(-5_000)).toBe('0:00,0');
  });
});
