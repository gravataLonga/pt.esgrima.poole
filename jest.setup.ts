import '@testing-library/react-native';

// i18n has to be initialised before any component that calls t() renders.
import '@/i18n';

// `expo-screen-orientation` chama o módulo nativo, que não existe em Jest. O ecrã de assalto
// desbloqueia a rotação ao montar (ADR-013) e sem isto todos os testes que o tocam falhavam.
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 3 },
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
}));

// A câmara é módulo nativo e não existe em Jest. O `CameraView` passa a ser uma `View` que guarda as
// props, para um teste poder disparar `onBarcodeScanned` como a câmara real dispararia; a permissão
// vem concedida por omissão e cada teste pode trocá-la com `jest.mocked(useCameraPermissions)`.
jest.mock('expo-camera', () => {
  // `jest.requireActual` e não `require`: a fábrica do mock é içada para cima dos imports, e o
  // `View` tem de ser resolvido aqui dentro.
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: View,
    useCameraPermissions: jest.fn(() => [
      { granted: true, canAskAgain: true, status: 'granted', expires: 'never' },
      jest.fn(() => Promise.resolve()),
    ]),
  };
});
