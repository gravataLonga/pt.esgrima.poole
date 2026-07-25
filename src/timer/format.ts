/**
 * Formatação do cronómetro — spec §7 "Legibilidade".
 *
 * `MM:SS` acima de 10 s, `M:SS,d` (décimos) nos últimos 10 s. Sempre com fonte tabular no render,
 * para os dígitos não saltarem.
 *
 * Os minutos aparecem **também** na contagem por décimos. Sem eles o fim de tempo lia-se `00,0`,
 * que a 88 pt não se distingue de um relógio parado: `0:00,0` mostra logo que é um cronómetro e
 * que chegou ao fim.
 */

/** Abaixo deste valor mostram-se décimos. */
export const TENTHS_THRESHOLD_MS = 10_000;

export function formatClock(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);

  if (clamped < TENTHS_THRESHOLD_MS) {
    const totalSeconds = Math.floor(clamped / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')},${tenths}`;
  }

  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * `M:SS`, sem décimos e sem zero à esquerda nos minutos. Para durações que se leem de relance e
 * não se cronometram ao décimo: o relógio de passividade e o "repor" da folha de acerto.
 */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}
