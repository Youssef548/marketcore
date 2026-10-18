import type { Logger } from '@app/runtime';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** The API's capturing logger, repeated: apps never import apps (ADR 0001). */
export function captureLogger(): Logger & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const at =
    (level: string) =>
    (message: unknown, ...params: unknown[]) =>
      lines.push({
        level,
        event: message,
        fields: Object.assign({}, ...params.filter((p) => p !== null && typeof p === 'object')) as Record<string, unknown>,
      });
  return { lines, log: at('log'), error: at('error'), warn: at('warn'), debug: at('debug'), verbose: at('verbose') };
}
