import type { ErrorCode } from '@app/contracts';

/** A failure classified, before the request id turns it into an envelope. */
export interface Failure {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}
