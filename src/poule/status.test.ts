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

/**
 * Contrato `2.2.0`: uma poule pode estar a ser arbitrada em duas pistas com o mesmo código, e o
 * servidor deixou de despromover os outros assaltos em curso. "O assalto a decorrer" e "o meu
 * assalto" deixaram de ser a mesma coisa.
 */
describe('dois árbitros na mesma poule', () => {
  it('o assalto atual é o meu, e não o primeiro a decorrer da lista', () => {
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending'), bout(3, 'in_progress')];

    expect(currentBout(bouts, 'b_3')?.id).toBe('b_3');
  });

  it('o assalto do outro nunca vira o meu assalto atual', () => {
    // Este dispositivo arbitrou o 3 e acabou-o; o 1 continua a decorrer, noutra pista. Propor
    // "Retomar" sobre ele era mandar este árbitro para dentro do assalto de outro.
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending'), bout(3, 'done')];

    expect(currentBout(bouts, 'b_3')?.id).toBe('b_2');
    expect(boutStates(bouts, 'b_3')).toEqual({ b_1: 'in_progress', b_2: 'up_next', b_3: 'done' });
  });

  it('o "começar" volta a existir quando quem está em pista é outro', () => {
    // Sem memória de ter arbitrado aqui, o cartão do topo agarrava-se ao assalto do outro e este
    // árbitro ficava sem nada que lhe dissesse qual chamar.
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending'), bout(3, 'pending')];
    const states = boutStates(bouts, 'b_9');

    expect(currentBout(bouts, 'b_9')?.id).toBe('b_2');
    expect(states.b_2).toBe('up_next');
    expect(states.b_3).toBe('on_deck');
  });

  it('quem nunca arbitrou nesta poule assume que o que está em pista é seu', () => {
    // É o comportamento de sempre, e é o que acerta com um árbitro só — que continua a ser o
    // normal. Sem memória não há como saber, e adivinhar ao contrário partia o caso comum.
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending')];

    expect(currentBout(bouts)?.id).toBe('b_1');
  });

  it('um assalto a decorrer mostra-se a decorrer, seja de quem for', () => {
    // A `CLIENT-SPEC.md` §6 decidiu-o assim: para quem está na pista ao lado, é a informação que
    // interessa. O que a app não pode é propor uma **ação** sobre ele.
    const bouts = [bout(1, 'in_progress'), bout(2, 'in_progress'), bout(3, 'pending')];
    const states = boutStates(bouts, 'b_2');

    expect(states.b_1).toBe('in_progress');
    expect(states.b_2).toBe('in_progress');
  });

  it('o meu assalto desaparecido da lista não prende o cartão do topo', () => {
    // Um atleta removido leva o assalto com ele (contrato §8, `404`). O que resta é o primeiro por
    // disputar — nunca o assalto que está a decorrer noutra pista.
    const bouts = [bout(1, 'in_progress'), bout(2, 'pending')];

    expect(currentBout(bouts, 'b_removido')?.id).toBe('b_2');
  });
});
