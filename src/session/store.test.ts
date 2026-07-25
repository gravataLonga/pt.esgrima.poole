import { bouts as fixtureBouts } from '@/fixtures/poule';

import { useSessionStore } from './store';

const reset = () => useSessionStore.getState().disconnect();

describe('sessão (esqueleto)', () => {
  beforeEach(reset);

  it('arranca desligada', () => {
    expect(useSessionStore.getState().status).toBe('disconnected');
    expect(useSessionStore.getState().poule).toBeNull();
  });

  it('connect carrega a poule da fixture', () => {
    useSessionStore.getState().connect('111111');

    const state = useSessionStore.getState();
    expect(state.status).toBe('connected');
    expect(state.poule?.bouts_total).toBe(15);
    expect(state.bouts).toHaveLength(15);
  });

  it('recordScore marca o assalto como done e incrementa o progresso', () => {
    useSessionStore.getState().connect('111111');
    const before = useSessionStore.getState().poule!.bouts_done;

    const pending = useSessionStore.getState().bouts.find((b) => b.status !== 'done')!;
    useSessionStore.getState().recordScore(pending.id, 5, 2);

    const after = useSessionStore.getState();
    const updated = after.bouts.find((b) => b.id === pending.id)!;

    expect(updated.status).toBe('done');
    expect(updated.score_a).toBe(5);
    expect(updated.score_b).toBe(2);
    expect(updated.scored_by_me).toBe(true);
    expect(after.poule!.bouts_done).toBe(before + 1);
  });

  it('passa a complete quando o último assalto é registado', () => {
    useSessionStore.getState().connect('111111');

    for (const bout of fixtureBouts) {
      if (bout.status !== 'done') useSessionStore.getState().recordScore(bout.id, 5, 1);
    }

    expect(useSessionStore.getState().status).toBe('complete');
  });
});
