import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Cadência do *polling*, contrato §5.
 *
 * A lista fica montada por baixo do ecrã de assalto — o `Stack` do expo-router não a desmonta ao
 * empilhar por cima. Sem isto, revalidaria de 10 em 10 segundos durante um assalto inteiro: rede
 * gasta a perguntar por uma lista que ninguém está a ver, e um `setState` no meio de um cronómetro
 * a correr.
 *
 * | Situação | Intervalo |
 * |---|---|
 * | Lista em foco | 10 s |
 * | Ecrã de assalto, cronómetro parado | 30 s |
 * | Ecrã de assalto, cronómetro a correr | **pausado** |
 *
 * (A app em *background* é a quarta linha da tabela do contrato, e essa é do `focusManager`.)
 */
export type PollingMode = 'list' | 'bout_idle' | 'bout_running';

export const POLL_INTERVAL_MS = 10_000;
export const POLL_INTERVAL_BOUT_MS = 30_000;

interface PollingState {
  mode: PollingMode;
  setMode: (mode: PollingMode) => void;
}

export const usePollingStore = create<PollingState>((set) => ({
  mode: 'list',
  setMode: (mode) => set({ mode }),
}));

/** `false` diz ao React Query para não revalidar sozinho — é assim que se pausa. */
export function intervalFor(mode: PollingMode): number | false {
  if (mode === 'bout_running') return false;
  return mode === 'bout_idle' ? POLL_INTERVAL_BOUT_MS : POLL_INTERVAL_MS;
}

export function usePollInterval(): number | false {
  return intervalFor(usePollingStore((state) => state.mode));
}

/**
 * Declara a cadência enquanto o ecrã de assalto estiver montado, e devolve-a ao normal ao sair —
 * inclusive quando se sai a meio de um assalto por causa de um 401.
 */
export function useRefereeingPollingMode(running: boolean): void {
  const setMode = usePollingStore((state) => state.setMode);

  useEffect(() => {
    setMode(running ? 'bout_running' : 'bout_idle');
    return () => setMode('list');
  }, [running, setMode]);
}
