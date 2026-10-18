import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
} from '../src/constants';
import { IdempotencyKeySchema } from '../src/idempotency';

describe('IdempotencyKeySchema (SRS-FR-CHK-008, §7)', () => {
  it('is the one header this API requires, bounded 1–64', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
    expect(IDEMPOTENCY_KEY_MIN_LENGTH).toBe(1);
    expect(IDEMPOTENCY_KEY_MAX_LENGTH).toBe(64);
  });

  it('accepts every character the rule allows', () => {
    const keys = ['a', 'buyer-1_attempt_2', 'A'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH)];
    for (const key of keys) expect(IdempotencyKeySchema.parse(key)).toBe(key);
  });

  it.each([
    ['an empty key', ''],
    ['one character too many', 'A'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)],
    ['a space', 'has space'],
    ['a slash', 'has/slash'],
    ['a dot', 'has.dot'],
    ['a non-ascii letter', 'üm'],
    ['a missing header', undefined],
  ])('refuses %s', (_label, key) => {
    expect(IdempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});
