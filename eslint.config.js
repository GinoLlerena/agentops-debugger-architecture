// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node build scripts (ESM): allow Node globals like console/process.
    files: ['**/scripts/**/*.mjs', '**/*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
