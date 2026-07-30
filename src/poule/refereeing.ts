import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * O assalto que **este dispositivo** está a arbitrar em cada pista — contrato `2.2.0`.
 *
 * Até aqui o servidor garantia um `in_progress` por poule: começar um assalto despromovia os
 * outros, e "o assalto a decorrer" e "o meu assalto" eram a mesma coisa. Deixou de garantir — dois
 * árbitros levam a mesma poule a duas pistas com o mesmo código —, e a lista passou a poder mostrar
 * um assalto a decorrer que não é deste telemóvel.
 *
 * Quem sabe qual é o dele é ele: foi ele que chamou o `POST /bouts/{bout}/start`. **Não há campo no
 * contrato que o diga**, e o contrato §6 explica porquê — não há repartição, atribuição nem reserva
 * de assaltos, porque os esgrimistas estão fisicamente num sítio só.
 *
 * Persiste em `AsyncStorage` pela mesma razão da fila: a app é morta em *background* a meio de uma
 * poule com regularidade operacional, e voltar sem memória é voltar a apontar o cartão do topo ao
 * assalto do árbitro do lado.
 */

const STORAGE_KEY = 'poole.referee.refereeing.v1';

/** Uma pista de ontem já não interessa. Mesma idade da fila (spec §8), pela mesma razão. */
export const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;

interface StartedBout {
  /** Id opaco do assalto em que este dispositivo chamou o `start`. */
  bout_id: string;
  /** ISO-8601 UTC. Só serve para a limpeza na hidratação — nada o lê para decidir. */
  at: string;
}

interface RefereeingState {
  /** Por pista (`competitionKey`): o UUID da poule, ou o id opaco do combate. */
  started: Record<string, StartedBout>;

  hydrate: () => Promise<void>;
  /** "Este assalto é meu", dito no mesmo instante em que se diz ao servidor. */
  markStarted: (competitionKey: string, boutId: string) => void;
}

function persist(started: Record<string, StartedBout>): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(started)).catch(() => {
    // Um disco cheio não pode derrubar a app a meio de um assalto. A memória fica em RAM.
  });
}

export const useRefereeingStore = create<RefereeingState>((set) => ({
  started: {},

  hydrate: async () => {
    let stored: Record<string, StartedBout> = {};

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as Record<string, StartedBout>;
    } catch {
      stored = {};
    }

    const cutoff = Date.now() - MAX_ENTRY_AGE_MS;
    const fresh = Object.fromEntries(
      Object.entries(stored).filter(([, entry]) => Date.parse(entry.at) >= cutoff),
    );

    // O que já está em memória manda: o disco pode responder depois de o árbitro ter começado um
    // assalto, e a resposta atrasada não pode desfazer o que ele acabou de fazer.
    set((state) => ({ started: { ...fresh, ...state.started } }));

    if (Object.keys(fresh).length !== Object.keys(stored).length) persist(fresh);
  },

  markStarted: (competitionKey, boutId) =>
    set((state) => {
      if (state.started[competitionKey]?.bout_id === boutId) return state;

      const started = {
        ...state.started,
        [competitionKey]: { bout_id: boutId, at: new Date().toISOString() },
      };

      persist(started);
      return { started };
    }),
}));

/**
 * O assalto que este dispositivo começou nesta pista, ou `null` se nunca começou nenhum.
 *
 * **Mantém-se depois de o assalto ficar `done`**, e é isso que distingue os dois casos que a
 * `status.ts` precisa de separar: "nunca arbitrei aqui" — em que um `in_progress` sozinho se
 * assume meu, como sempre se assumiu — e "arbitrei e acabei", em que o que sobra é de outro.
 */
export function useStartedBoutId(competitionKey: string | null): string | null {
  return useRefereeingStore((state) =>
    competitionKey ? (state.started[competitionKey]?.bout_id ?? null) : null,
  );
}
