import { spawn, type ChildProcess } from 'node:child_process';

export interface RunningServer {
  baseURL: string;
  stop: () => Promise<void>;
  logs: () => string;
}

async function waitForHealth(baseURL: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server at ${baseURL} did not become healthy: ${lastError}`);
}

export async function startServer(
  port: number,
  extraEnv: Record<string, string | undefined> = {},
): Promise<RunningServer> {
  const baseURL = `http://127.0.0.1:${port}`;
  let logText = '';
  const child: ChildProcess = spawn('npm', ['start'], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let exited = false;
  let exitCode: number | null = null;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    logText += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    logText += chunk.toString();
  });

  try {
    await waitForHealth(baseURL);
    if (exited) {
      throw new Error(`Server exited with code ${exitCode} before serving requests`);
    }
  } catch (error) {
    killProcessGroup(child, 'SIGKILL');
    throw new Error(`${(error as Error).message}\n${logText}`);
  }

  return {
    baseURL,
    logs: () => logText,
    stop: async () => {
      if (exited) {
        return;
      }
      killProcessGroup(child, 'SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 10_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      killProcessGroup(child, 'SIGKILL');
    },
  };
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process group is already gone.
    }
  }
}
