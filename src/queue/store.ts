import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { BoutEvent } from '@/api/types';

/**
 * Fila de submissões por enviar — spec §8.
 *
 * **Só resultados entram aqui.** O `start` e os `GET` falham em silêncio e voltam a tentar mais
 * tarde; nada disso é dado do árbitro. Perder um resultado registado é que é inaceitável.
 *
 * Persiste em `AsyncStorage` porque a app pode ser morta entre o registo e o envio — que é
 * exatamente o caso que a fila existe para cobrir. A escrita é assíncrona e não bloqueia a UI: o
 * item entra em memória primeiro e o disco vai atrás.
 */

/** Limite da spec §8. Uma poule de 12 tem 66 assaltos; 50 pendentes já é catástrofe operacional. */
export const MAX_QUEUE_SIZE = 50;

/** Itens acima desta idade são descartados com aviso ao abrir a app (spec §8). */
export const MAX_ITEM_AGE_MS = 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'poole.referee.queue.v1';

export interface QueuedScore {
  /**
   * Chave de idempotência do contrato §4, gerada **no momento em que o árbitro confirma** e
   * repetida em todas as tentativas. Gerada no envio não servia de nada: cada retry seria uma
   * submissão nova aos olhos do servidor — o falso 409 que a chave existe para evitar.
   */
  submission_id: string;
  /** O `score` de poule e o de quadro são o mesmo caso com URL diferente. */
  kind: 'bout' | 'match';
  /** Id opaco do assalto ou do combate. */
  target_id: string;
  a: number;
  b: number;
  events?: BoutEvent[];
  /**
   * A **pista** a que este resultado pertence: o UUID da poule, ou o id opaco do combate. A fila é
   * por pista (spec §8), e desde o contrato `2.0.0` uma pista pode ser um combate — o nome do campo
   * ficou de quando só havia poules, e mantém-se para não migrar uma fila com resultados por enviar.
   */
  competition_uuid: string;
  /** ISO-8601 UTC. */
  queued_at: string;
  /** Para o ecrã dizer de que assalto se trata sem ter a lista carregada. */
  label: string;
}

/** O que aconteceu a um item que saiu da fila sem ficar registado. O ecrã mostra e dispensa. */
export interface QueueNotice {
  submission_id: string;
  label: string;
  reason: 'conflict' | 'gone' | 'rejected' | 'expired' | 'full';
  /** A mensagem do servidor, quando houve uma. Já vem pronta a mostrar (contrato §3). */
  detail?: string;
}

interface QueueState {
  items: QueuedScore[];
  notices: QueueNotice[];
  /** `false` até o disco responder. Antes disso a fila em memória ainda não é a fila real. */
  hydrated: boolean;

  hydrate: () => Promise<void>;
  enqueue: (item: QueuedScore) => void;
  /** Remove o item já processado. A fila é FIFO e drena um de cada vez. */
  remove: (submissionId: string) => void;
  notify: (notice: QueueNotice) => void;
  dismissNotice: (submissionId: string) => void;
  clear: () => void;
}

function persist(items: QueuedScore[]): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {
    // Um disco cheio não pode derrubar a app a meio de um assalto. A fila continua em memória.
  });
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  notices: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    let stored: QueuedScore[] = [];

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as QueuedScore[];
    } catch {
      stored = [];
    }

    const cutoff = Date.now() - MAX_ITEM_AGE_MS;
    const fresh = stored.filter((item) => Date.parse(item.queued_at) >= cutoff);
    const stale = stored.filter((item) => Date.parse(item.queued_at) < cutoff);

    set({
      items: fresh,
      hydrated: true,
      // Um resultado de ontem não se envia em silêncio nem se deita fora em silêncio: a poule já
      // acabou e o árbitro tem de saber que aquele resultado nunca chegou.
      notices: stale.map((item) => ({
        submission_id: item.submission_id,
        label: item.label,
        reason: 'expired' as const,
      })),
    });

    if (stale.length > 0) persist(fresh);
  },

  enqueue: (item) =>
    set((state) => {
      // Mesma submissão já em fila: é o mesmo resultado a ser reconfirmado, não um segundo.
      if (state.items.some((queued) => queued.submission_id === item.submission_id)) return state;

      // Fila cheia é catástrofe operacional, não rotina — mas **em silêncio** era pior: a app
      // dizia "guardado" e deitava o resultado fora. Fica o aviso, que é tudo o que resta.
      if (state.items.length >= MAX_QUEUE_SIZE) {
        return {
          notices: [
            ...state.notices,
            { submission_id: item.submission_id, label: item.label, reason: 'full' as const },
          ],
        };
      }

      const items = [...state.items, item];
      persist(items);
      return { items };
    }),

  remove: (submissionId) =>
    set((state) => {
      const items = state.items.filter((item) => item.submission_id !== submissionId);
      persist(items);
      return { items };
    }),

  notify: (notice) =>
    set((state) => ({
      notices: state.notices.some((existing) => existing.submission_id === notice.submission_id)
        ? state.notices
        : [...state.notices, notice],
    })),

  dismissNotice: (submissionId) =>
    set((state) => ({
      notices: state.notices.filter((notice) => notice.submission_id !== submissionId),
    })),

  clear: () => {
    persist([]);
    set({ items: [], notices: [] });
  },
}));
