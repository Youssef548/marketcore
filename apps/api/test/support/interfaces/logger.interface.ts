import type { LoggerService } from '@nestjs/common';

export interface CapturedLine {
  level: string;
  event: unknown;
  fields: Record<string, unknown>;
}

/** A LoggerService that also keeps every line it was given. */
export interface CapturingLogger extends LoggerService {
  lines: CapturedLine[];
}
