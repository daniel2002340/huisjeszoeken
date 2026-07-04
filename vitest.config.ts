import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // DB-backed tests (api/server.test.ts) run against a throwaway database,
    // never the dev data/app.db. Wiped before each run in globalSetup.
    env: { DB_PATH: 'data/test.db' },
    globalSetup: './scripts/vitest-global-setup.ts',
  },
});
