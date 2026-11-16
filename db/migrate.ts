import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDatabases, openDatabase } from '../src/server/db';
import { loadEnv } from '../src/server/env';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

interface AppliedMigration {
  filename: string;
  checksum: string;
}

async function main(): Promise<void> {
  loadEnv();
  const pool = openDatabase();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await pool.query<AppliedMigration>(
    'SELECT filename, checksum FROM schema_migrations',
  );
  const applied = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));

  const filenames = readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const filename of filenames) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(filename);

    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${filename} changed after it was applied. Create a new migration instead of editing history.`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      await client.query('COMMIT');
      ran += 1;
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(
    ran === 0
      ? 'database is up to date'
      : `migration complete: ${ran} file${ran === 1 ? '' : 's'} applied`,
  );
}

main()
  .then(async () => {
    await closeDatabases();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeDatabases();
    process.exit(1);
  });
