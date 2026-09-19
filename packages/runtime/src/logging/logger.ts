import type { LoggerService } from '@nestjs/common';

export type LogLevelName = 'debug' | 'error' | 'log' | 'verbose' | 'warn';

/** Where a finished line goes. Injected so tests never touch the real streams. */
export type LogSink = (line: string, level: LogLevelName) => void;

export interface JsonLoggerOptions {
  context: string;
  write?: LogSink;
}

/**
 * JSON, not pretty-printing, because these lines are read by machines first and
 * people second. Two guards earn their place:
 *
 * - `bigint` becomes a string. `JSON.stringify` throws on bigint, and ledger
 *   amounts are BigInt by design (docs/domain-model.md §3), so a logger without
 *   this would go off the first time anyone logged an amount.
 * - a cycle becomes `[circular]`. A logger that throws is worse than a logger
 *   that loses a field, because it throws inside a failure path.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) return '[circular]';
      seen.add(item);
    }
    return item;
  });
}

function defaultSink(line: string, level: LogLevelName): void {
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export class JsonLogger implements LoggerService {
  private readonly context: string;
  private readonly write: LogSink;

  constructor({ context, write = defaultSink }: JsonLoggerOptions) {
    this.context = context;
    this.write = write;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  private emit(level: LogLevelName, message: unknown, params: unknown[]): void {
    // A plain object among the params is treated as structured fields, which is
    // how a request id reaches a log line: logger.error(msg, { requestId }).
    const fields = params.reduce<Record<string, unknown>>((acc, param) => {
      if (param !== null && typeof param === 'object' && !Array.isArray(param)) {
        Object.assign(acc, param);
      }
      return acc;
    }, {});

    this.write(
      safeStringify({
        level,
        event: typeof message === 'string' ? message : 'log',
        context: this.context,
        ...(typeof message === 'string' ? {} : { message }),
        ...fields,
      }),
      level,
    );
  }
}

export function createLogger(context: string, write?: LogSink): LoggerService {
  return new JsonLogger({ context, write });
}
