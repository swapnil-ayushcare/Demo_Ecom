import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from '../src/server/env';

const TEST_DATABASE_NAME = 'demo_ecom_test';
const VISUAL_DATABASE_NAME = 'demo_ecom_visual';

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', (error) => {
      console.error(`${command} could not start: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });
}

async function recreateDatabase(baseUrl: string, databaseName: string): Promise<void> {
  const databaseUrl = withDatabaseName(baseUrl, databaseName);
  const maintenance = new Client({
    connectionString: withDatabaseName(baseUrl, 'postgres'),
  });

  try {
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${databaseName}`);
    await maintenance.end();
    return;
  } catch (error) {
    await maintenance.end().catch(() => undefined);
    console.warn(
      `Could not recreate ${databaseName} from the maintenance database (${
        error instanceof Error ? error.message : String(error)
      }); falling back to a clean schema in the existing test database.`,
    );
  }

  const testDb = new Client({ connectionString: databaseUrl });
  await testDb.connect();
  await testDb.query('DROP SCHEMA IF EXISTS public CASCADE');
  await testDb.query('CREATE SCHEMA public');
  await testDb.end();
}

async function main(): Promise<void> {
  // The foundation tests do not call Razorpay, but startup deliberately
  // requires every configured secret. Supply obvious test placeholders when a
  // local .env has not set them; never a real key.
  process.env.SESSION_SECRET ||= 'test-session-secret-local-only-0000000000';
  process.env.RAZORPAY_KEY_ID ||= 'rzp_test_foundation';
  process.env.RAZORPAY_KEY_SECRET ||= 'foundation-test-key-secret';

  const baseEnv = loadEnv();
  const testUrl = withDatabaseName(baseEnv.DATABASE_URL, TEST_DATABASE_NAME);
  const visualUrl = withDatabaseName(baseEnv.DATABASE_URL, VISUAL_DATABASE_NAME);

  console.log(`Preparing test databases ${TEST_DATABASE_NAME} and ${VISUAL_DATABASE_NAME}`);
  await recreateDatabase(baseEnv.DATABASE_URL, TEST_DATABASE_NAME);
  await recreateDatabase(baseEnv.DATABASE_URL, VISUAL_DATABASE_NAME);

  const commonEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    COOKIE_SECURE: 'false',
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw',
  };

  for (const databaseUrl of [testUrl, visualUrl]) {
    const databaseEnv = { ...commonEnv, DATABASE_URL: databaseUrl };
    console.log(`Running migration for ${new URL(databaseUrl).pathname.slice(1)}`);
    if ((await run('npm', ['run', 'migrate'], databaseEnv)) !== 0) {
      process.exit(1);
    }
    console.log(`Running seed for ${new URL(databaseUrl).pathname.slice(1)}`);
    if ((await run('npm', ['run', 'seed'], databaseEnv)) !== 0) {
      process.exit(1);
    }
  }

  const env: NodeJS.ProcessEnv = {
    ...commonEnv,
    DATABASE_URL: testUrl,
    VISUAL_DATABASE_URL: visualUrl,
  };

  console.log('Building the production server');
  if ((await run('npm', ['run', 'build'], env)) !== 0) {
    process.exit(1);
  }

  console.log('Running Playwright specs');
  const playwrightBin = join(process.cwd(), 'node_modules', '.bin', 'playwright');
  const code = await run(playwrightBin, ['test', '--workers=4'], env);
  process.exit(code);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
