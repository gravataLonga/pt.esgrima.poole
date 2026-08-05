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
 *
 * O contrato `2.3.0` acrescentou-lhe o **largar**: o assalto deixa de ser deste dispositivo sem ter
 * sido pontuado, e a memória tem de o dizer no mesmo instante em que se pede ao servidor para o
 * libertar. Passaram a ser duas perguntas — qual é o meu assalto, e se já arbitrei nesta pista — e
 * é por isso que a entrada sobrevive ao `clearStarted`.
 */

const STORAGE_KEY = 'poole.referee.refereeing.v1';

/** Uma pista de ontem já não interessa. Mesma idade da fila (spec §8), pela mesma razão. */
export const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;

interface StartedBout {
  /**
   * Id opaco do assalto em que este dispositivo chamou o `start`. **Um assalto pontuado continua
   * aqui** — foi este dispositivo que o arbitrou, e a `status.ts` conta com isso.
   *
   * Volta a `null` quando o árbitro o **larga** (contrato `2.3.0`), e só nesse caso: aí ele deixou
   * de ser deste dispositivo do lado do servidor também, e qualquer outro árbitro o pode começar.
   *
   * A entrada em si **fica**, com `bout_id` a `null`. São duas coisas diferentes e o cartão do topo
   * da lista precisa das duas: qual é o meu assalto, e se já arbitrei nesta pista — que é o que
   * impede a app de voltar a propor "Retomar" sobre o assalto do árbitro do lado.
   */
  bout_id: string | null;
  /** ISO-8601 UTC. Só serve para a limpeza na hidratação — nada o lê para decidir. */
  at: string;
}

interface RefereeingState {
  /** Por pista (`competitionKey`): o UUID da poule, ou o id opaco do combate. */
  started: Record<string, StartedBout>;

  hydrate: () => Promise<void>;
  /** "Este assalto é meu", dito no mesmo instante em que se diz ao servidor. */
  markStarted: (competitionKey: string, boutId: string) => void;
  /**
   * "Já não tenho assalto nenhum em mãos nesta pista" — dito no mesmo instante em que se pede ao
   * servidor para o libertar (`DELETE .../start`, contrato `2.3.0`), e ao terminar a sessão.
   *
   * **Não apaga a entrada.** Ver o `bout_id`: o que se esquece é qual era o assalto, não que se
   * arbitrou aqui.
   */
  clearStarted: (competitionKey: string) => void;
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

  clearStarted: (competitionKey) =>
    set((state) => {
      const entry = state.started[competitionKey];
      // Nunca arbitrou aqui: não há nada para largar, e inventar uma entrada era passar a dizer
      // "já arbitrei nesta pista" a quem só passou pelo ecrã.
      if (!entry || entry.bout_id === null) return state;

      const started = { ...state.started, [competitionKey]: { bout_id: null, at: entry.at } };

      persist(started);
      return { started };
    }),
}));

/**
 * O assalto que este dispositivo começou nesta pista e ainda não largou, ou `null` se não houver
 * nenhum.
 *
 * **Mantém-se depois de o assalto ficar `done`**, e é isso que distingue os dois casos que a
 * `status.ts` precisa de separar: "nunca arbitrei aqui" — em que um `in_progress` sozinho se
 * assume meu, como sempre se assumiu — e "arbitrei e acabei", em que o que sobra é de outro.
 *
 * Volta a `null` quando o árbitro **larga** o assalto (contrato `2.3.0`): aí ele deixou de ser
 * deste dispositivo de verdade, e continuar a apontar-lhe era arriscar propor "Retomar" sobre um
 * assalto que outro árbitro entretanto começou.
 */
export function useStartedBoutId(competitionKey: string | null): string | null {
  return useRefereeingStore((state) =>
    competitionKey ? (state.started[competitionKey]?.bout_id ?? null) : null,
  );
}

/**
 * Se este dispositivo já arbitrou alguma coisa nesta pista — mesmo que não tenha nada em mãos
 * agora, por ter registado o resultado ou por ter largado o assalto.
 *
 * Enquanto o `start` foi uma porta de sentido único, isto lia-se do `useStartedBoutId`: um id
 * qualquer queria dizer "arbitrei". Largar um assalto separou as duas perguntas.
 */
export function useRefereedHere(competitionKey: string | null): boolean {
  return useRefereeingStore((state) =>
    competitionKey ? state.started[competitionKey] !== undefined : false,
  );
}
