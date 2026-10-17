import { Prisma } from '@app/database';
import { isRetryableTransactionError, withTransactionRetry } from './retryable-transaction';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test', meta });

describe('isRetryableTransactionError', () => {
  it('accepts a transaction write conflict or deadlock (P2034)', () => {
    expect(isRetryableTransactionError(known('P2034'))).toBe(true);
  });
  it('accepts a raw query that failed with a deadlock or serialization SQLSTATE', () => {
    expect(isRetryableTransactionError(known('P2010', { code: '40P01' }))).toBe(true);
    expect(isRetryableTransactionError(known('P2010', { code: '40001' }))).toBe(true);
  });
  it('refuses everything else, including a unique violation and a CHECK violation', () => {
    expect(isRetryableTransactionError(known('P2002'))).toBe(false);
    expect(isRetryableTransactionError(known('P2010', { code: '23514' }))).toBe(false);
    expect(isRetryableTransactionError(new Error('40P01'))).toBe(false);
  });
});

describe('withTransactionRetry', () => {
  const options = { retries: 3, baseDelayMs: 10, sleep: jest.fn(async () => undefined), random: () => 0.5 };

  it('retries a retryable failure and returns the eventual result', async () => {
    const run = jest.fn().mockRejectedValueOnce(known('P2034')).mockResolvedValueOnce('ok');
    const onRetry = jest.fn();

    await expect(withTransactionRetry(run, { ...options, onRetry })).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Prisma.PrismaClientKnownRequestError));
  });

  it('gives up after 3 retries — 4 attempts — and rethrows the last failure', async () => {
    const run = jest.fn().mockRejectedValue(known('P2034'));

    await expect(withTransactionRetry(run, options)).rejects.toMatchObject({ code: 'P2034' });
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('never retries a non-retryable failure', async () => {
    const run = jest.fn().mockRejectedValue(known('P2002'));

    await expect(withTransactionRetry(run, options)).rejects.toMatchObject({ code: 'P2002' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits a jittered, growing delay between attempts', async () => {
    const sleep = jest.fn(async () => undefined);
    const run = jest.fn().mockRejectedValue(known('P2034'));

    await expect(withTransactionRetry(run, { ...options, sleep })).rejects.toBeDefined();
    // random() = 0.5 → half of 10, 20, 40. The mock declares no parameters, so its
    // call tuple is [] and the argument is read through a cast rather than by
    // widening the mock's signature just to satisfy the type checker.
    const delays = (sleep.mock.calls as unknown as [number][]).map(([ms]) => ms);
    expect(delays).toEqual([5, 10, 20]);
  });
});
