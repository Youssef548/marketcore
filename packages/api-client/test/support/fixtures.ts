import { ErrorCodes, type ErrorEnvelope } from '@app/contracts';

const REQUEST_ID_FIXTURE = 'req_fixture';

const NOT_FOUND = { code: ErrorCodes.NOT_FOUND, message: 'No such thing' } as const;

/**
 * Builds an error envelope for tests.
 *
 * Every failure the API produces is this one shape, so a test that hand-writes
 * an envelope is a copy that drifts the moment the contract changes — which is
 * exactly what happened when `requestId` became required.
 */
export function errorEnvelope(overrides: Partial<ErrorEnvelope['error']> = {}): ErrorEnvelope {
  return { error: { ...NOT_FOUND, requestId: REQUEST_ID_FIXTURE, ...overrides } };
}

/**
 * The same failure as a server on the previous contract would send it: correct
 * at the time, missing `requestId` now.
 *
 * Deliberately cast — it is an *invalid* envelope, and the point of the test that
 * uses it is that a client must not trust one. Building it through the fixture
 * would defeat that.
 */
export function errorEnvelopeWithoutRequestId(): ErrorEnvelope {
  return { error: { ...NOT_FOUND } } as ErrorEnvelope;
}
