import type { Bout, BoutStatus } from '@/api/types';

import { boutStates, currentBout, onDeckBout } from './status';

const bout = (sequence: number, status: BoutStatus): Bout => ({
  id: `b_${sequence}`,
  sequence,
  status,
  fencer_a: { id: 1, number: 1, name: 'A', club: null },
  fencer_b: { id: 2, number: 2, name: 'B', club: null },
  score_a: status === 'done' ? 5 : null,
  score_b: status === 'done' ? 3 : null,
  scored_at: null,
  scored_by_me: false,
});

describe('currentBout', () => {
  it('é o assalto a decorrer', () => {
    const bouts = [bout(1, 'done'), bout(2, 'in_progress'), bout(3, 'pending')];
    expect(currentBout(bouts)?.id).toBe('b_2');
  });

  it('é o primeiro por disputar quando nenhum está a decorrer', () => {
    expect(currentBout([bout(1, 'done'), bout(2, 'pending'), bout(3, 'pending')])?.id).toBe('b_2');
  });

  it('não existe com a poule completa', () => {
    expect(currentBout([bout(1, 'done')])).toBeUndefined();
  });
});

describe('onDeckBout', () => {
  it('é o por disputar seguinte ao que está a decorrer', () => {
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending'), bout(3, 'pending')];
    expect(onDeckBout(bouts)?.id).toBe('b_2');
  });

  it('nunca é o assalto atual', () => {
    const bouts = [bout(1, 'pending'), bout(2, 'pending')];
    expect(currentBout(bouts)?.id).toBe('b_1');
    expect(onDeckBout(bouts)?.id).toBe('b_2');
  });

  it('não existe quando só falta o assalto atual', () => {
    expect(onDeckBout([bout(1, 'done'), bout(2, 'in_progress')])).toBeUndefined();
  });
});

describe('boutStates', () => {
  it('dá os estados todos de uma vez', () => {
    const bouts = [bout(1, 'done'), bout(2, 'in_progress'), bout(3, 'pending'), bout(4, 'pending')];

    expect(boutStates(bouts)).toEqual({
      b_1: 'done',
      b_2: 'in_progress',
      b_3: 'on_deck',
      b_4: 'pending',
    });
  });

  it('sem nada em pista, o primeiro é para começar e só o segundo é para preparar', () => {
    const bouts = [bout(1, 'pending'), bout(2, 'pending'), bout(3, 'pending')];

    expect(Object.values(boutStates(bouts))).toEqual(['up_next', 'on_deck', 'pending']);
  });

  it('nunca há mais do que um de cada', () => {
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending'), bout(3, 'pending')];
    const states = Object.values(boutStates(bouts));

    expect(states.filter((state) => state === 'up_next')).toHaveLength(0);
    expect(states.filter((state) => state === 'on_deck')).toHaveLength(1);
  });
});
