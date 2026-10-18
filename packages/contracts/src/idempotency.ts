import { z } from 'zod';
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_PATTERN,
} from './constants';

/**
 * The key a retry carries (SRS-FR-CHK-008, ADR 003).
 *
 * It is the client's own token for one operation, so nothing here shapes it beyond
 * making it safe to carry in a header: bounded, and printable ASCII with no separator
 * that a proxy might rewrite. `undefined` — an absent header — is not a key, so the
 * schema refuses it and the route answers `400 VALIDATION_ERROR` before any lock.
 */
export const IdempotencyKeySchema = z
  .string()
  .min(IDEMPOTENCY_KEY_MIN_LENGTH)
  .max(IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(IDEMPOTENCY_KEY_PATTERN)
  .meta({ id: 'IdempotencyKey' });

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
