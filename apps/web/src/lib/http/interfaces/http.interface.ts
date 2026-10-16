import type { ErrorEnvelope } from '@app/contracts';

export interface FailureResponse {
  status: number;
  body: ErrorEnvelope;
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false; failure: FailureResponse };
