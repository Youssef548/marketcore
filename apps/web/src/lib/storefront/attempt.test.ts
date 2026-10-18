import { describe, expect, it } from 'vitest';
import { IdempotencyKeySchema } from '@app/contracts';
import { newAttemptKey } from './attempt';

describe('newAttemptKey', () => {
  it('mints a key the API accepts (SRS-FR-CHK-008)', () => {
    expect(IdempotencyKeySchema.parse(newAttemptKey())).toBeTruthy();
  });

  it('mints a different key for every attempt (D100)', () => {
    expect(newAttemptKey()).not.toBe(newAttemptKey());
  });
});
