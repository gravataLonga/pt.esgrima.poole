module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Só ficheiros `.test.*` são suites. Sem isto os utilitários de `__tests__/support/` contam
  // como testes vazios e a suite falha por não encontrar nada lá dentro.
  testMatch: ['**/*.test.[jt]s?(x)'],
  // O teste contra o servidor a sério corre noutro ambiente e com outro `fetch` — ver
  // `jest.live.config.js` e `npm run test:live`.
  testPathIgnorePatterns: ['<rootDir>/src/api/live.test.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
};
