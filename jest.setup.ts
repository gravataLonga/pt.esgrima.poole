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
