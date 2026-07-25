import { create } from 'zustand';

import type { Bout, PouleSummary } from '@/api/types';
import { bouts as fixtureBouts, poule as fixturePoule } from '@/fixtures/poule';

/** Estados da sessão — spec §6. */
export type SessionStatus = 'disconnected' | 'connected' | 'read_only' | 'complete';

interface SessionState {
  status: SessionStatus;
  baseUrl: string | null;
  poule: PouleSummary | null;
  bouts: Bout[];

  /**
   * ESQUELETO: carrega a fixture e ignora o PIN. Na F1 passa a `POST /connect` e o token vai
   * para `expo-secure-store` (spec §9) — nunca para este store, que é memória volátil.
   */
  connect: (pin: string, baseUrl?: string) => void;
  disconnect: () => void;

  /**
   * ESQUELETO: grava o resultado só em memória, para a lista e o progresso reagirem.
   * Na F4 passa por `POST /bouts/{id}/score` e pela fila persistente (spec §8).
   */
  recordScore: (boutId: string, a: number, b: number) => void;
}

const initial = {
  status: 'disconnected' as SessionStatus,
  baseUrl: null,
  poule: null,
  bouts: [],
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,

  connect: (_pin, baseUrl = 'https://poole.esgrima.pt') =>
    set({
      status: fixturePoule.locked ? 'read_only' : 'connected',
      baseUrl,
      poule: fixturePoule,
      bouts: fixtureBouts,
    }),

  disconnect: () => set(initial),

  recordScore: (boutId, a, b) =>
    set((state) => {
      const bouts = state.bouts.map((bout) =>
        bout.id === boutId
          ? {
              ...bout,
              status: 'done' as const,
              score_a: a,
              score_b: b,
              scored_at: new Date().toISOString(),
              scored_by_me: true,
            }
          : bout,
      );

      const done = bouts.filter((bout) => bout.status === 'done').length;
      const poule = state.poule ? { ...state.poule, bouts_done: done } : null;

      return {
        bouts,
        poule,
        status: poule && done >= poule.bouts_total ? 'complete' : state.status,
      };
    }),
}));
