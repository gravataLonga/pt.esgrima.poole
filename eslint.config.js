const tsPlugin = require('@typescript-eslint/eslint-plugin');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    // `.claude/skills/reference` são ficheiros de referência do design system (Alpine/Blade, web),
    // não código desta app.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', '.claude/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // Convenção da spec §4: sem `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // Os stubs do esqueleto recebem parâmetros que ainda não usam.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
