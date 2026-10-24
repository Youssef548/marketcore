import type { Logger } from '@app/runtime';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** A Logger that also keeps every line it was given. */
export interface CapturingLogger extends Logger {
  lines: CapturedLine[];
}
