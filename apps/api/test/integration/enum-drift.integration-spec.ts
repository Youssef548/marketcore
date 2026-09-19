import { $Enums } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import {
  CurrencyCodes,
  MemberRoles,
  OrganizationStatuses,
  ProductStatuses,
  SessionRevocationReasons,
} from '@app/contracts';

/**
 * The same value set exists in three places: the Prisma schema (the database), the
 * contracts package (the wire) and — for roles and statuses — the rules in
 * @app/domain that branch on them. Rather than pretend they cannot diverge, this
 * asserts they have not. It fails, not warns.
 *
 * If `$Enums` is not the export in this Prisma version, `Prisma.MemberRole` is.
 */
const values = (source: Record<string, string>) => Object.values(source).sort();

describe('enum drift', () => {
  it('roles agree between the database and the wire', () => {
    expect(values($Enums.MemberRole)).toEqual(values(MemberRoles));
  });

  it('organization statuses agree', () => {
    expect(values($Enums.OrganizationStatus)).toEqual(values(OrganizationStatuses));
  });

  it('product statuses agree', () => {
    expect(values($Enums.ProductStatus)).toEqual(values(ProductStatuses));
  });

  it('currency codes agree', () => {
    expect(values($Enums.CurrencyCode)).toEqual(values(CurrencyCodes));
  });

  it('session revocation reasons agree', () => {
    expect(values($Enums.SessionRevocationReason)).toEqual(values(SessionRevocationReasons));
  });
});
