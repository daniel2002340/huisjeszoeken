import { rmSync } from 'node:fs';

/**
 * Start every test run with a fresh throwaway DB (see vitest.config.ts) and
 * apply migrations here, once, before the parallel workers start: concurrent
 * first-time migrations from multiple test files would race on the shared
 * test.db. DB_PATH must be set before the client module is imported.
 */
export default async function setup(): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`data/test.db${suffix}`, { force: true });
  }
  process.env.DB_PATH = 'data/test.db';
  const { runMigrations } = await import('../src/db/migrate.js');
  runMigrations();
}
