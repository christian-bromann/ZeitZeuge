import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: null,
  categories: {},
  rules: {
    'eslint/no-unused-vars': 'error',
  },
  settings: {
    vitest: {
      typecheck: false,
    },
  },
  env: {
    builtin: true,
  },
  globals: {},
  ignorePatterns: [],
});
