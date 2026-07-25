import { create } from 'zustand';

/**
 * Fila de submissões por enviar — spec §8.
 *
 * ESQUELETO: FIFO em memória. Na F4 passa a persistir em MMKV, que é o que torna a fila útil:
 * perder um resultado registado é inaceitável, e a app pode ser morta entre o registo e o envio.
 */

/** Limite da spec §8. Uma poule de 12 tem 66 assaltos; 50 pendentes já é catástrofe operacional. */
export const MAX_QUEUE_SIZE = 50;

/** Itens acima desta idade são descartados com aviso ao abrir a app (spec §8). */
export const MAX_ITEM_AGE_MS = 24 * 60 * 60 * 1000;

export interface QueuedScore {
  bout_id: string;
  a: number;
  b: number;
  poule_uuid: string;
  /** ISO-8601 UTC. */
  queued_at: string;
}

interface QueueState {
  items: QueuedScore[];
  enqueue: (item: QueuedScore) => void;
  /** Remove o item já processado — só o da cabeça da fila é drenado de cada vez. */
  remove: (boutId: string) => void;
  clear: () => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  items: [],

  enqueue: (item) =>
    set((state) =>
      state.items.length >= MAX_QUEUE_SIZE ? state : { items: [...state.items, item] },
    ),

  remove: (boutId) => set((state) => ({ items: state.items.filter((i) => i.bout_id !== boutId) })),

  clear: () => set({ items: [] }),
}));
