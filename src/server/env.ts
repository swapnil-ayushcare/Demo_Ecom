import { config as loadDotenv } from 'dotenv';

if (process.env.DEMO_ECOM_SKIP_DOTENV !== '1') {
  loadDotenv();
}

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];

export interface AppEnv {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
}

let cached: AppEnv | null = null;

export class MissingEnvironmentError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    const label = variables.length === 1 ? 'variable' : 'variables';
    super(
      `Missing required environment ${label}: ${variables.join(', ')}. ` +
        'Copy .env.example to .env and fill in every value before starting Demo_Ecom.',
    );
    this.name = 'MissingEnvironmentError';
    this.variables = variables;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const missing = REQUIRED_ENV.filter((name) => {
    const value = source[name];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new MissingEnvironmentError(missing);
  }

  const env: AppEnv = {
    DATABASE_URL: String(source.DATABASE_URL).trim(),
    SESSION_SECRET: String(source.SESSION_SECRET).trim(),
    RAZORPAY_KEY_ID: String(source.RAZORPAY_KEY_ID).trim(),
    RAZORPAY_KEY_SECRET: String(source.RAZORPAY_KEY_SECRET).trim(),
  };

  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    throw new Error(
      'DATABASE_URL must be a PostgreSQL connection string beginning with postgresql:// or postgres://.',
    );
  }

  if (env.SESSION_SECRET.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters long.');
  }

  cached = env;
  return env;
}

export function getEnv(): AppEnv {
  if (cached === null) {
    cached = loadEnv();
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
