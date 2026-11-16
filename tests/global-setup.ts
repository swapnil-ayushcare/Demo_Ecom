import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

function run(command: string, args: string[], databaseUrl: string): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed for ${databaseUrl}`);
  }
}

function withoutDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function databaseName(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
}

async function ensureDatabase(connectionString: string): Promise<void> {
  const name = databaseName(connectionString);
  const maintenance = new Client({ connectionString: withoutDatabase(connectionString) });
  await maintenance.connect();
  try {
    const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      await maintenance.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await maintenance.end();
  }
}

async function prepare(connectionString: string): Promise<void> {
  await ensureDatabase(connectionString);
  run('npm', ['run', 'migrate'], connectionString);
  run('npm', ['run', 'seed'], connectionString);
}

export default async function globalSetup(): Promise<void> {
  const testDatabase = process.env.DATABASE_URL;
  const visualDatabase = process.env.VISUAL_DATABASE_URL;
  if (!testDatabase) {
    throw new Error('DATABASE_URL is required for the Playwright global setup');
  }
  await prepare(testDatabase);
  if (visualDatabase && visualDatabase !== testDatabase) {
    await prepare(visualDatabase);
  }
}
