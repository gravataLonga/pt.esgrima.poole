/**
 * Fixture de desenvolvimento: poule de 6 atletas, 15 assaltos.
 *
 * Alimenta o esqueleto enquanto não há rede. Os mesmos dados vão servir os handlers MSW da F1
 * (spec §10), por isso respeitam o contrato à letra — incluindo a ordem de assaltos FIE para 6.
 */

import type { Bout, BoutDetail, Fencer, PouleSummary } from '@/api/types';

export const fencers: Fencer[] = [
  { id: 41, number: 1, name: 'Ana Silva', club: 'CE Lisboa' },
  { id: 42, number: 2, name: 'Bruno Dias', club: 'CE Porto' },
  { id: 43, number: 3, name: 'Carla Neves', club: 'CE Porto' },
  { id: 44, number: 4, name: 'Rui Costa', club: null },
  { id: 45, number: 5, name: 'Marta Lopes', club: 'AE Coimbra' },
  { id: 46, number: 6, name: 'Tiago Rocha', club: 'CE Espinho' },
];

/** Ordem oficial de assaltos para uma poule de 6 (FIE / USA Fencing). */
const boutOrder: [number, number][] = [
  [1, 2],
  [4, 5],
  [2, 3],
  [5, 6],
  [3, 1],
  [6, 4],
  [2, 5],
  [1, 4],
  [5, 3],
  [1, 6],
  [4, 2],
  [3, 6],
  [5, 1],
  [3, 4],
  [6, 2],
];

/** Resultados já registados, por `sequence`. Dá à lista os três estados de uma só vez. */
const scored: Record<number, { a: number; b: number; at: string }> = {
  1: { a: 5, b: 3, at: '2026-07-24T17:12:04Z' },
  2: { a: 2, b: 5, at: '2026-07-24T17:18:47Z' },
  3: { a: 5, b: 4, at: '2026-07-24T17:24:10Z' },
};

/** O assalto que a web mostraria como "joga agora". */
const inProgressSequence = 4;

const byNumber = (n: number): Fencer => {
  const fencer = fencers.find((f) => f.number === n);
  if (!fencer) throw new Error(`fixture: atleta número ${n} inexistente`);
  return fencer;
};

export const bouts: Bout[] = boutOrder.map(([a, b], index) => {
  const sequence = index + 1;
  const result = scored[sequence];

  return {
    // Id opaco — a app nunca o interpreta, só o devolve. Aqui só tem de ser estável e único.
    id: `b_01J8X${sequence.toString().padStart(3, '0')}`,
    sequence,
    status: result ? 'done' : sequence === inProgressSequence ? 'in_progress' : 'pending',
    fencer_a: byNumber(a),
    fencer_b: byNumber(b),
    score_a: result ? result.a : null,
    score_b: result ? result.b : null,
    scored_at: result ? result.at : null,
    scored_by_me: result !== undefined,
  };
});

export const poule: PouleSummary = {
  uuid: '9f3c1b2a-7d4e-4c81-9a2f-1b6e5d3c8a70',
  name: 'Poule 3 — Sabre Masculino',
  tournament_name: 'Torneio de Verão 2026',
  touch_cap: 5,
  duration_seconds: 180,
  // Uma poule a sério manda `periods: 1` (contrato §7). A fixture manda 3 e um minuto de descanso
  // para o ecrã de assalto exercitar os tempos e o descanso enquanto não há API — é o único sítio
  // onde esses campos entram. Pôr `1` aqui volta ao comportamento de poule.
  periods: 3,
  rest_seconds: 60,
  bouts_total: bouts.length,
  bouts_done: Object.keys(scored).length,
  locked: false,
};

/** Detalhe de um assalto, montado a partir da lista — o formato do `GET /bouts/{bout}`. */
export function boutDetail(boutId: string): BoutDetail | undefined {
  const bout = bouts.find((b) => b.id === boutId);
  if (!bout) return undefined;

  return {
    id: bout.id,
    sequence: bout.sequence,
    status: bout.status,
    fencer_a: bout.fencer_a,
    fencer_b: bout.fencer_b,
    score_a: bout.score_a,
    score_b: bout.score_b,
    target: poule.touch_cap,
    duration_seconds: poule.duration_seconds,
    periods: poule.periods,
    rest_seconds: poule.rest_seconds,
    allow_draw: false,
    poule_locked: poule.locked,
  };
}
