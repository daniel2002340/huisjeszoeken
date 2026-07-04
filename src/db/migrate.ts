import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';

/**
 * Apply pending migrations at startup. Programmatic (drizzle-orm, not
 * drizzle-kit) so the production container needs no dev dependencies. The
 * folder path is relative to the working directory and exists both in the
 * repo and in the Docker image.
 */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: 'src/db/migrations' });
}
