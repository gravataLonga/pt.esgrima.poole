/**
 * Drenagem da fila de submissões — spec §8.
 *
 * Dispara quando a rede volta, quando a app volta ao foreground, ou de 30 em 30 s. Por ordem,
 * um item de cada vez. Tratamento por resposta: 200/201 remove · 409 remove e notifica ·
 * 422 remove e reporta · 401 **para e mantém a fila**.
 *
 * ESQUELETO — por implementar na F4.
 */

export const DRAIN_INTERVAL_MS = 30_000;

export function drainQueue(): Promise<void> {
  return Promise.reject(new Error('queue/drain: por implementar (F4)'));
}
