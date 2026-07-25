import type { Bout, Fencer } from '@/api/types';
import { bouts as fixtureBouts } from '@/fixtures/poule';

import { buildSheet, fencersFromBouts } from './sheet';

const fencer = (number: number): Fencer => ({
  id: 40 + number,
  number,
  name: `Atleta ${number}`,
  club: null,
});

let nextId = 0;

/** Assalto mínimo. Sem resultado fica `pending`; com resultado fica `done`. */
const bout = (a: number, b: number, scoreA?: number, scoreB?: number): Bout => {
  nextId += 1;
  const scored = scoreA !== undefined && scoreB !== undefined;

  return {
    id: `b_${nextId}`,
    sequence: nextId,
    status: scored ? 'done' : 'pending',
    fencer_a: fencer(a),
    fencer_b: fencer(b),
    score_a: scored ? scoreA : null,
    score_b: scored ? scoreB : null,
    scored_at: scored ? '2026-07-24T17:12:04Z' : null,
    scored_by_me: scored,
  };
};

beforeEach(() => {
  nextId = 0;
});

describe('fencersFromBouts', () => {
  it('junta os atletas dos assaltos sem repetições e por número', () => {
    const numbers = fencersFromBouts([bout(3, 1), bout(2, 3), bout(1, 2)]).map((f) => f.number);
    expect(numbers).toEqual([1, 2, 3]);
  });
});

describe('matriz', () => {
  it('preenche a diagonal', () => {
    const { cells } = buildSheet([bout(1, 2), bout(2, 3), bout(3, 1)]);
    expect(cells.map((row, i) => row[i]!.kind)).toEqual(['self', 'self', 'self']);
  });

  it('mostra os toques dados pelo atleta da linha e os recebidos na célula simétrica', () => {
    const { cells } = buildSheet([bout(1, 2, 5, 3)]);

    expect(cells[0]![1]).toEqual({ kind: 'score', given: 5, received: 3 });
    expect(cells[1]![0]).toEqual({ kind: 'score', given: 3, received: 5 });
  });

  it('deixa o assalto por disputar vazio, não a zero', () => {
    const { cells } = buildSheet([bout(1, 2)]);
    expect(cells[0]![1]).toEqual({ kind: 'empty' });
  });
});

describe('atletas fora da poule', () => {
  it('ignora assaltos de atletas que já não estão na poule sem rebentar', () => {
    const orphan = { ...bout(1, 2, 5, 3), fencer_b: { ...fencer(9), id: 999 } };
    expect(() => buildSheet([orphan])).not.toThrow();
  });
});

describe('sobre a fixture de desenvolvimento', () => {
  it('produz 6 atletas e uma matriz 6×6', () => {
    const { fencers, cells } = buildSheet(fixtureBouts);

    expect(fencers).toHaveLength(6);
    expect(cells).toHaveLength(6);
    expect(cells.every((row) => row.length === 6)).toBe(true);
  });
});
