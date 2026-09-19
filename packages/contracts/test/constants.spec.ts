import { describe, expect, it } from 'vitest';
import {
  API_PREFIX,
  CurrencyCodes,
  DependencyStates,
  FORWARDED_FOR_HEADER,
  FORWARDED_PROTO_HEADER,
  HealthStatuses,
  MemberRoles,
  ORGANIZATION_ID_HEADER,
  OrganizationStatuses,
  ProductStatuses,
  READINESS_HTTP_STATUS,
  REQUEST_ID_HEADER,
  ReadinessStatuses,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SLUG_PATTERN,
  SessionRevocationReasons,
  wireValues,
} from '../src/index';

/**
 * The wire format, pinned by value.
 *
 * Every other test in this repository imports these constants rather than writing
 * the strings, which is right — one definition, no drift. The consequence is that
 * changing a value keeps the whole suite green, because both sides of every
 * assertion move together. A client does not move with them.
 *
 * Mutation testing demonstrated it: replacing `'x-request-id'` with `''` survived. So
 * this file is a deliberate speed bump, in the same spirit as the closed-set check
 * in `error.test.ts`. Renaming a header or an enum member is an API change, and an
 * API change should fail a test that someone has to look at.
 */
describe('wire constants', () => {
  it('fixes the header names clients must send', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
    expect(ORGANIZATION_ID_HEADER).toBe('x-organization-id');
    expect(FORWARDED_PROTO_HEADER).toBe('x-forwarded-proto');
    expect(FORWARDED_FOR_HEADER).toBe('x-forwarded-for');
  });

  it('fixes the route prefix a client builds every URL from', () => {
    expect(API_PREFIX).toBe('/api/v1');
  });

  it('fixes every enum value a client branches on', () => {
    expect(Object.values(HealthStatuses)).toEqual(['ok']);
    expect(Object.values(ReadinessStatuses)).toEqual(['ok', 'degraded']);
    expect(Object.values(DependencyStates)).toEqual(['up', 'down']);
    expect(Object.values(MemberRoles)).toEqual(['OWNER', 'MEMBER']);
    expect(Object.values(OrganizationStatuses)).toEqual(['ACTIVE', 'DISABLED']);
    expect(Object.values(ProductStatuses)).toEqual(['DRAFT', 'PUBLISHED']);
    expect(Object.values(CurrencyCodes)).toEqual(['USD', 'EUR', 'EGP']);
    expect(Object.values(SessionRevocationReasons)).toEqual(['LOGOUT', 'REUSE_DETECTED']);
  });

  it('fixes the readiness-to-HTTP-status mapping, which no caller may hand-write', () => {
    expect(READINESS_HTTP_STATUS).toEqual({ ok: 200, degraded: 503 });
  });

  it('fixes the slug bounds', () => {
    expect(SLUG_MIN_LENGTH).toBe(3);
    expect(SLUG_MAX_LENGTH).toBe(50);
  });

  describe('SLUG_PATTERN', () => {
    it('accepts a single segment and any number of further segments', () => {
      expect(SLUG_PATTERN.test('abc')).toBe(true);
      expect(SLUG_PATTERN.test('abc-def')).toBe(true);
      // Two separators: this is what proves the `*` on the repeating group, rather
      // than a mutation that allows only one.
      expect(SLUG_PATTERN.test('abc-def-ghi')).toBe(true);
    });

    it('anchors at the end, so trailing junk is not silently accepted', () => {
      expect(SLUG_PATTERN.test('abc-')).toBe(false);
      expect(SLUG_PATTERN.test('abc\n')).toBe(false);
      expect(SLUG_PATTERN.test('-abc')).toBe(false);
    });

    it('rejects anything outside the documented character set', () => {
      expect(SLUG_PATTERN.test('Abc')).toBe(false);
      expect(SLUG_PATTERN.test('abc_def')).toBe(false);
      expect(SLUG_PATTERN.test('')).toBe(false);
    });
  });

  it('wireValues returns every member, so a z.enum built from it cannot silently shrink', () => {
    const values = wireValues(ProductStatuses);

    expect(values).toHaveLength(Object.keys(ProductStatuses).length);
    expect(values).toEqual(['DRAFT', 'PUBLISHED']);
  });
});
