import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Locates the repository root by walking up for the harness's compose file, so the
 * suite behaves the same whether Playwright was started from this package or from
 * the root.
 */
function repositoryRoot(): string {
  let directory = process.cwd();

  for (;;) {
    if (existsSync(join(directory, 'docker-compose.e2e.yml'))) return directory;

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`docker-compose.e2e.yml not found in any directory above ${process.cwd()}`);
    }
    directory = parent;
  }
}

/**
 * The API container's stdout, which is where the structured request log goes.
 *
 * This is what makes the proxy headers verifiable at all. Behind a reverse proxy the
 * process sees only a connection from the proxy — the public hostname and the client
 * scheme exist nowhere except in headers, and nothing in a response echoes them. The
 * log line is the one observable.
 */
export function apiLogs(): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      join(repositoryRoot(), 'docker-compose.e2e.yml'),
      'logs',
      '--no-log-prefix',
      'api',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
}

/**
 * The structured request-log record for one request id, or undefined when the
 * request never reached the application — which is itself a useful failure to
 * distinguish from "it arrived with the wrong headers".
 */
export function requestLogRecord(requestId: string): Record<string, unknown> | undefined {
  for (const line of apiLogs().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // The logger writes one JSON object per line, but the container also prints a
      // dotenv notice on boot. Anything that is not JSON is not a request record.
      continue;
    }

    if (record.requestId === requestId) return record;
  }

  return undefined;
}
