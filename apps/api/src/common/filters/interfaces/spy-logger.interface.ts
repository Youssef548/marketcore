import type { LoggerService } from '@nestjs/common';

/** A logger whose `error` calls a spec can assert on. */
export interface SpyLogger extends LoggerService {
  error: jest.Mock;
}
