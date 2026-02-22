/**
 * Target function for CLI evaluation.
 *
 * Starts the fixture site Vite dev server, runs the zeitzeuge CLI
 * against it with --output json, and returns the parsed findings.
 */

import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Finding } from '@zeitzeuge/utils';

const EVALS_DIR = resolve(dirname(import.meta.filename), '..');
const FIXTURE_SITE_DIR = resolve(EVALS_DIR, 'fixture-site');
const CLI_ENTRY = resolve(EVALS_DIR, '..', 'src', 'cli.ts');

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

export interface RunCliOutput {
  findings: Finding[];
  metrics?: Record<string, unknown>;
}

/**
 * Start the Vite dev server for the fixture site.
 * Returns a handle to stop the server and the URL it's listening on.
 */
export async function startFixtureSite(): Promise<{
  process: ChildProcess;
  url: string;
  stop: () => void;
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bunx', ['vite', '--port', '5199', '--strictPort'], {
      cwd: FIXTURE_SITE_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Vite dev server did not start within 30s. Output: ${stripAnsi(output)}`));
    }, 30_000);

    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      const clean = stripAnsi(output);
      const urlMatch = clean.match(/Local:\s+(http:\/\/localhost:\d+)/);
      if (urlMatch) {
        clearTimeout(timeout);
        const url = urlMatch[1]!;
        resolvePromise({
          process: child,
          url,
          stop: () => {
            child.kill('SIGTERM');
          },
        });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Vite process exited with code ${code}. Output: ${output}`));
      }
    });
  });
}

/**
 * Run the zeitzeuge CLI against a URL and return the JSON report.
 */
export async function runCli(url: string): Promise<RunCliOutput> {
  const tmpDir = resolve(EVALS_DIR, '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  const outputPath = resolve(tmpDir, `eval-report-${Date.now()}.json`);

  return new Promise((resolvePromise, reject) => {
    const child = spawn('bun', ['run', CLI_ENTRY, url, '--output', outputPath, '--headless'], {
      cwd: resolve(EVALS_DIR, '..', '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`CLI process error: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `CLI exited with code ${code}.\nstdout: ${stdout.slice(-2000)}\nstderr: ${stderr.slice(-2000)}`,
          ),
        );
        return;
      }

      if (!existsSync(outputPath)) {
        reject(
          new Error(
            `CLI completed but no JSON report found at ${outputPath}.\nstdout: ${stdout.slice(-2000)}`,
          ),
        );
        return;
      }

      try {
        const content = readFileSync(outputPath, 'utf-8');
        const report = JSON.parse(content) as {
          findings: Finding[];
          metrics?: Record<string, unknown>;
        };
        resolvePromise({
          findings: report.findings ?? [],
          metrics: report.metrics,
        });
      } catch (err) {
        reject(
          new Error(`Failed to parse CLI JSON output: ${err instanceof Error ? err.message : err}`),
        );
      }
    });
  });
}
