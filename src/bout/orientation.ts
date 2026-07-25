/**
 * Rotação, só no ecrã de assalto.
 *
 * A app é portrait (spec §4) e continua a sê-lo em todo o lado menos aqui: com o telemóvel
 * encostado à pista, landscape é o que dá dígitos maiores e as duas colunas de resultado ao alcance
 * dos dois polegares. `app.json` passa a `orientation: "default"` — sem isso o iOS nem chega a
 * considerar rodar — e o bloqueio passa a ser feito em código, no layout de raiz.
 */

import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * `expo-screen-orientation` não existe em web e o bloqueio pode ser recusado pelo sistema (iPad em
 * multitasking, por exemplo). Nenhum dos casos é motivo para rebentar um ecrã de arbitragem.
 */
const ignoreFailure = () => {};

export function lockPortrait(): void {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(ignoreFailure);
}

/** Liberta a rotação enquanto o ecrã estiver montado e volta a fixar portrait ao sair. */
export function useAllowLandscape(): void {
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(ignoreFailure);
    return lockPortrait;
  }, []);
}

export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}
