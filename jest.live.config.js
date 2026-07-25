/**
 * Configuração dos testes contra o servidor a sério (`src/api/live.test.ts`).
 *
 * Ambiente `node`, e não o preset `jest-expo`: o preset troca o `fetch` global pelo *stub* do
 * React Native, que na máquina de testes não fala com rede nenhuma — devolve uma resposta com
 * `status: undefined`. O cliente HTTP não importa nada de `react-native` precisamente para poder
 * correr aqui, contra o `fetch` do Node.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/api/live.test.ts'],
};
