import { renderHook } from '@testing-library/react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import { useAllowLandscape } from './orientation';

/**
 * O ciclo é o que interessa: se o `unlockAsync` correr e o bloqueio não voltar ao sair, a app fica
 * a rodar em todos os ecrãs — e isso só se descobre a usá-la de lado num ecrã que não foi desenhado
 * para isso.
 */
describe('useAllowLandscape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // `renderHook` e `unmount` são assíncronos no RNTL v14, tal como `render` e `fireEvent` (ADR-006).
  it('liberta a rotação ao montar', async () => {
    await renderHook(() => useAllowLandscape());

    expect(ScreenOrientation.unlockAsync).toHaveBeenCalledTimes(1);
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalled();
  });

  it('volta a fixar portrait ao desmontar', async () => {
    const { unmount } = await renderHook(() => useAllowLandscape());
    await unmount();

    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  });

  it('não rebenta quando o sistema recusa o bloqueio', async () => {
    // Acontece a sério: iPad em multitasking recusa `lockAsync`. Não é motivo para deitar abaixo
    // um ecrã de arbitragem a meio de um assalto.
    jest.mocked(ScreenOrientation.unlockAsync).mockRejectedValueOnce(new Error('unsupported'));
    jest.mocked(ScreenOrientation.lockAsync).mockRejectedValueOnce(new Error('unsupported'));

    const { unmount } = await renderHook(() => useAllowLandscape());

    await expect(unmount()).resolves.not.toThrow();
  });
});
