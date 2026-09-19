import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CreateProductRequestSchema,
  CurrencyCodes,
  DependencyStates,
  ErrorEnvelopeSchema,
  OrganizationSchema,
  OrganizationStatuses,
  ProductSchema,
  ProductStatuses,
  ReadinessSchema,
  ReadinessStatuses,
  MemberRoles,
  buildReadiness,
  wireValues,
} from '../src/index';

/**
 * A schema is a claim about a whole set of values, and example tests only ever
 * sample it. These properties state what the schema promises — round-trips,
 * required fields, cross-field rules — and let the generator look for the value
 * that breaks it.
 */
const product = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1 }),
  priceMinor: fc.integer(),
  currency: fc.constantFrom(...wireValues(CurrencyCodes)),
  status: fc.constantFrom(...wireValues(ProductStatuses)),
});

const organization = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1 }),
  slug: fc.string({ minLength: 1 }),
  status: fc.constantFrom(...wireValues(OrganizationStatuses)),
  role: fc.constantFrom(...wireValues(MemberRoles)),
});

const readinessChecks = fc.record({
  database: fc.constantFrom(...wireValues(DependencyStates)),
});

/** The wire round-trip: what a client actually does with a response body. */
const throughJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('contracts (property)', () => {
  it('ProductSchema is idempotent through a JSON round-trip', () => {
    fc.assert(
      fc.property(product, (value) => {
        const parsed = ProductSchema.parse(value);
        expect(throughJson(parsed)).toEqual(ProductSchema.parse(throughJson(parsed)));
      }),
    );
  });

  it('OrganizationSchema is idempotent through a JSON round-trip', () => {
    fc.assert(
      fc.property(organization, (value) => {
        const parsed = OrganizationSchema.parse(value);
        expect(throughJson(parsed)).toEqual(OrganizationSchema.parse(throughJson(parsed)));
      }),
    );
  });

  it('the error envelope requires a request id for every code and message', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string(), (code, message) => {
        const withId = { error: { code, message, requestId: 'req_x' } };

        expect(ErrorEnvelopeSchema.safeParse(withId).success).toBe(true);
        expect(
          ErrorEnvelopeSchema.safeParse({ error: { code, message } }).success,
          'an envelope without a requestId must not parse',
        ).toBe(false);
      }),
    );
  });

  it('every payload buildReadiness can construct satisfies the wire contract', () => {
    // The builder is the only sanctioned constructor, so if it can produce a value
    // the schema rejects, the two have drifted.
    fc.assert(
      fc.property(readinessChecks, (checks) => {
        expect(ReadinessSchema.safeParse(buildReadiness(checks)).success).toBe(true);
      }),
    );
  });

  it('never accepts a readiness payload whose status contradicts its checks', () => {
    fc.assert(
      fc.property(readinessChecks, (checks) => {
        const built = buildReadiness(checks);
        const contradicted = {
          ...built,
          status:
            built.status === ReadinessStatuses.OK
              ? ReadinessStatuses.DEGRADED
              : ReadinessStatuses.OK,
        };

        expect(ReadinessSchema.safeParse(contradicted).success).toBe(false);
      }),
    );
  });

  it('refuses every non-integer price, because money is never a float', () => {
    const fractional = fc
      .double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true })
      .filter((priceMinor) => !Number.isInteger(priceMinor));

    fc.assert(
      fc.property(fractional, (priceMinor) => {
        const parsed = CreateProductRequestSchema.safeParse({
          name: 'Widget',
          priceMinor,
          currency: CurrencyCodes.EGP,
        });

        expect(parsed.success).toBe(false);
      }),
    );
  });

  it('accepts every integer price, including the negative and zero ones the domain rejects', () => {
    // The contract's job is shape, not policy: a zero price is a domain decision
    // ("nothing is sold for nothing"), and pushing that up here would put the rule
    // in two places.
    fc.assert(
      fc.property(fc.integer(), (priceMinor) => {
        const parsed = CreateProductRequestSchema.safeParse({
          name: 'Widget',
          priceMinor,
          currency: CurrencyCodes.EGP,
        });

        expect(parsed.success).toBe(true);
      }),
    );
  });
});
