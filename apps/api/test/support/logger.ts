import type { LoggerService } from '@nestjs/common';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** A LoggerService that remembers what it was told, for asserting structured log lines. */
export function captureLogger(): LoggerService & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const at =
    (level: string) =>
    (message: unknown, ...params: unknown[]) => {
      const fields = Object.assign(
        {},
        ...params.filter((param) => param !== null && typeof param === 'object' && !Array.isArray(param)),
      ) as Record<string, unknown>;
      lines.push({ level, event: message, fields });
    };
  return { lines, log: at('log'), error: at('error'), warn: at('warn'), debug: at('debug'), verbose: at('verbose') };
}
