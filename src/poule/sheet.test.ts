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

describe('classificação', () => {
  it('conta vitórias, toques dados e recebidos, indicador e assaltos em falta', () => {
    // 1 vence 2 por 5–3 e perde com 3 por 2–5. Falta-lhe o assalto com 4.
    const { standings } = buildSheet([bout(1, 2, 5, 3), bout(1, 3, 2, 5), bout(1, 4)]);
    const first = standings.find((s) => s.fencer.number === 1)!;

    expect(first).toMatchObject({
      victories: 1,
      given: 7,
      received: 8,
      diff: -1,
      done: 2,
      missing: 1,
    });
  });

  it('ordena por V/M, depois indicador, depois toques dados', () => {
    const sheet = buildSheet([
      // 1: 1V/1 (ratio 1), ind +2
      bout(1, 4, 5, 3),
      // 2: 1V/2 (ratio 0.5), ind +1
      bout(2, 3, 5, 1),
      bout(2, 4, 1, 5),
      // 3: 0V/2, ind -4 ; 4: 1V/2, ind +2 → 4 fica à frente do 2 pelo indicador
      bout(3, 4, 2, 3),
    ]);

    expect(sheet.standings.map((s) => [s.fencer.number, s.place])).toEqual([
      [1, 1],
      [4, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it('partilha o lugar em empate completo e salta o seguinte', () => {
    // 2 e 3 ficam idênticos — 1V/2, indicador −3, 5 toques dados — por ainda não se terem
    // defrontado. É o caso real que produz lugares partilhados a meio de uma poule.
    const { standings } = buildSheet([
      bout(1, 2, 5, 0),
      bout(1, 3, 5, 0),
      bout(1, 4, 5, 0),
      bout(2, 4, 5, 3),
      bout(3, 4, 5, 3),
      bout(2, 3),
    ]);

    const places = new Map(standings.map((s) => [s.fencer.number, s.place]));
    expect(places.get(2)).toBe(places.get(3));
    expect(standings.map((s) => s.place)).toEqual([1, 2, 2, 4]);
  });

  it('não deixa quem ainda não disputou nada liderar a poule', () => {
    const { standings } = buildSheet([bout(1, 2, 5, 0), bout(3, 4)]);

    expect(standings[0]!.fencer).toMatchObject({ number: 1 });
    expect(standings.filter((s) => s.done === 0).every((s) => s.place > 1)).toBe(true);
  });

  it('ordena pelo índice V/M, e não pelo número absoluto de vitórias', () => {
    // 2 tem mais vitórias (2) do que 1 (1), mas disputou o dobro dos assaltos: 0.5 contra 1.0.
    const { standings } = buildSheet([
      bout(1, 3, 5, 0),
      bout(2, 3, 5, 0),
      bout(2, 4, 5, 0),
      bout(2, 5, 0, 5),
      bout(2, 6, 0, 5),
    ]);

    expect(standings.slice(0, 1).map((s) => s.fencer.number)).toEqual([1]);
    expect(standings.find((s) => s.fencer.number === 2)!.victories).toBe(2);
  });

  it('ignora assaltos de atletas que já não estão na poule sem rebentar', () => {
    const orphan = { ...bout(1, 2, 5, 3), fencer_b: { ...fencer(9), id: 999 } };
    expect(() => buildSheet([orphan])).not.toThrow();
  });
});

describe('sobre a fixture de desenvolvimento', () => {
  it('produz 6 atletas, 6 linhas e uma classificação completa', () => {
    const { fencers, cells, standings } = buildSheet(fixtureBouts);

    expect(fencers).toHaveLength(6);
    expect(cells).toHaveLength(6);
    expect(cells.every((row) => row.length === 6)).toBe(true);
    expect(standings).toHaveLength(6);
    // Três assaltos registados na fixture → seis participações contadas.
    expect(standings.reduce((sum, s) => sum + s.done, 0)).toBe(6);
  });
});
