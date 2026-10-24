import type { LogLevelName } from '@app/runtime';
import type { WorkerLogger } from '../main';

/** A line this process would have printed, captured through the logger's injected sink. */
export interface PrintedLine {
  line: string;
  level: LogLevelName;
}

export interface CapturedWorkerLog {
  logger: WorkerLogger;
  lines: PrintedLine[];
}
