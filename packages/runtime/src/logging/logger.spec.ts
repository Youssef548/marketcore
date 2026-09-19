import { describe, expect, it, vi } from 'vitest';
import { JsonLogger, createLogger } from './logger';

function loggerWith(sink = vi.fn()) {
  return { sink, logger: new JsonLogger({ context: 'api', write: sink }) };
}

const recordOf = (sink: ReturnType<typeof vi.fn>) => JSON.parse(sink.mock.calls[0][0]);

describe('JsonLogger', () => {
  it('emits one JSON line carrying level, event and context', () => {
    const { sink, logger } = loggerWith();

    logger.log('payment.capture.succeeded');

    expect(sink).toHaveBeenCalledTimes(1);
    const [line, level] = sink.mock.calls[0];
    expect(level).toBe('log');
    expect(JSON.parse(line)).toEqual({
      level: 'log',
      event: 'payment.capture.succeeded',
      context: 'api',
    });
  });

  it('merges a fields object, which is how a request id reaches a log line', () => {
    const { sink, logger } = loggerWith();

    logger.log('checkout.received', { requestId: 'req_abc', orderId: 'ord_1' });

    expect(recordOf(sink)).toMatchObject({
      event: 'checkout.received',
      requestId: 'req_abc',
      orderId: 'ord_1',
    });
  });

  it('passes the level through so the sink can route error lines', () => {
    const { sink, logger } = loggerWith();

    logger.error('payment.capture.failed');
    logger.warn('outbox.backlog');
    logger.debug('prisma.query');

    expect(sink.mock.calls.map((call: unknown[]) => call[1])).toEqual(['error', 'warn', 'debug']);
  });

  it('sends warn and error to stderr, and the rest to stdout', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = createLogger('api');

    logger.log('a.started');
    logger.error('b.failed');

    expect(out).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);

    out.mockRestore();
    err.mockRestore();
  });

  it('does not throw on a circular payload', () => {
    const { sink, logger } = loggerWith();
    const circular: Record<string, unknown> = { orderId: 'ord_1' };
    circular.self = circular;

    expect(() => logger.log('cycle', { payload: circular })).not.toThrow();
    expect(recordOf(sink).payload.self).toBe('[circular]');
  });

  it('serializes bigint instead of throwing, because ledger amounts are bigint', () => {
    // JSON.stringify throws on bigint by default. Ledger entries are BigInt by
    // design (spec D9), so a logger without this guard is a landmine that goes
    // off the first time anyone logs an amount.
    const { sink, logger } = loggerWith();

    expect(() => logger.log('ledger.posted', { amountMinor: 900n })).not.toThrow();
    expect(recordOf(sink).amountMinor).toBe('900');
  });
});
