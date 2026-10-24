import { describe, expect, it } from 'vitest';
import { MemberRoles } from '@app/contracts';
import { buildBuyerContext, buyerScope } from '../../src/buyer/buyer';
import { buildTenantContext, tenantScope } from '../../src/tenancy/tenant';

describe('buildBuyerContext', () => {
  it('carries the authenticated user as the buyer', () => {
    expect(buildBuyerContext('user_1')).toEqual({ buyerId: 'user_1' });
  });

  it('refuses to build without a buyer id', () => {
    // Same rule as TenantContext: a BuyerContext that exists always names a buyer,
    // so a scope built from it can never match every buyer's rows.
    expect(() => buildBuyerContext('')).toThrow(/buyerId/);
  });
});

describe('buyerScope', () => {
  it('produces the filter every buyer query composes from', () => {
    expect(buyerScope(buildBuyerContext('user_2'))).toEqual({ buyerId: 'user_2' });
  });

  it('never produces a tenant filter, so a buyer read cannot be a tenant read', () => {
    // RULE-BORD-001: buyer queries are by buyer id only. The two scopes share no key,
    // so spreading the wrong one into a where clause filters on a column that is not
    // there and fails loudly in Prisma rather than quietly matching.
    const buyer = buyerScope(buildBuyerContext('user_3'));
    const tenant = tenantScope(buildTenantContext('org_3', MemberRoles.OWNER));

    expect(Object.keys(buyer)).toEqual(['buyerId']);
    expect(Object.keys(buyer).some((key) => key in tenant)).toBe(false);
  });
});
