import type { LogLevelName } from '../constants';

/** Where a finished line goes. Injected so tests never touch the real streams. */
export type LogSink = (line: string, level: LogLevelName) => void;

export interface JsonLoggerOptions {
  context: string;
  write?: LogSink;
}

/** A structured record. Field values are merged in, so a request id can join a line. */
export type LogFields = Record<string, unknown>;
