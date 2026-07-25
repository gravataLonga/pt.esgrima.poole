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

// O Keychain não existe em Jest. Um `Map` chega: o que os testes precisam é que um token guardado
// se leia de volta, e que apagá-lo o apague mesmo.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();

  return {
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `expo-crypto` é módulo nativo. O `submission_id` só tem de ser único dentro do teste — o que
// interessa verificar é que **não muda entre tentativas**, e isso é do código da fila, não daqui.
jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: jest.fn(() => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    }),
  };
});

/**
 * A app fala com o servidor por `@/api/endpoints` e mais nada — é a fronteira do contrato. Trocá-la
 * inteira por um servidor falso (`src/__tests__/support/fakeApi.ts`) é o que deixa os testes
 * exercitar 409, 404, falta de rede e sessão expirada sem os provocar num servidor a sério.
 *
 * Quem garante que as formas do falso são as do verdadeiro é o `src/api/live.test.ts`, que corre
 * contra a plataforma e noutro ambiente (`npm run test:live`).
 */
jest.mock('@/api/endpoints', () => jest.requireActual('./src/__tests__/support/fakeApi'));
