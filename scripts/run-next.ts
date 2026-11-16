import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnv } from '../src/server/env';

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: tsx scripts/run-next.ts <dev|start>');
  process.exit(2);
}

try {
  loadEnv();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, mode], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
