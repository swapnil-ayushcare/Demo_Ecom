import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from '@playwright/test';

loadDotenv();

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw';
}

function withDatabaseName(connectionString: string, name: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  return url.toString();
}

function databaseName(connectionString: string): string {
  return decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
}

const configuredDatabase = process.env.DATABASE_URL;
if (!configuredDatabase) {
  throw new Error('DATABASE_URL is required to run the Playwright specs');
}

const configuredName = databaseName(configuredDatabase);
const testDatabase =
  configuredName.endsWith('_test') || configuredName.endsWith('_visual')
    ? configuredDatabase
    : withDatabaseName(configuredDatabase, `${configuredName}_test`);
const visualDatabase =
  process.env.VISUAL_DATABASE_URL ??
  (configuredName.endsWith('_test')
    ? withDatabaseName(configuredDatabase, configuredName.replace(/_test$/, '_visual'))
    : withDatabaseName(configuredDatabase, `${configuredName}_visual`));

process.env.DATABASE_URL = testDatabase;
process.env.VISUAL_DATABASE_URL = visualDatabase;
process.env.SESSION_SECRET ||= 'test-session-secret-local-only-0000000000';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_foundation';
process.env.RAZORPAY_KEY_SECRET ||= 'foundation-test-key-secret';
process.env.RAZORPAY_SANDBOX ||= '1';
process.env.COOKIE_SECURE ??= 'false';

const PORT = 3100;
const env = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  DATABASE_URL: testDatabase,
  VISUAL_DATABASE_URL: visualDatabase,
} as Record<string, string>;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  },
});
