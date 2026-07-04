import { rmSync } from 'node:fs';

/** Start every test run with a fresh throwaway DB (see vitest.config.ts). */
export default function setup(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`data/test.db${suffix}`, { force: true });
  }
}
