import type { ExecutionContext } from '@nestjs/common';
import { buildBuyerContext } from '@app/domain';
import { SecurityMetadata } from '../security.constants';
import { BuyerGuard } from './buyer.guard';

type Request = { user?: { id: string }; buyer?: unknown };

const contextFor = (request: Request) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardFor = (marks: { isPublic?: boolean; tenantFree?: boolean }) =>
  new BuyerGuard({
    getAllAndOverride: jest.fn((key: string) =>
      key === SecurityMetadata.PUBLIC ? marks.isPublic : marks.tenantFree,
    ),
  } as never);

describe('BuyerGuard (D75)', () => {
  it('builds the buyer from the authenticated user on a tenant-free route', () => {
    const request: Request = { user: { id: 'user_1' } };

    expect(guardFor({ tenantFree: true }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toEqual(buildBuyerContext('user_1'));
  });

  it('builds nothing on a tenant route, so @Buyer() cannot be used there', () => {
    const request: Request = { user: { id: 'user_1' } };

    expect(guardFor({ tenantFree: false }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toBeUndefined();
  });

  it('builds nothing on a public route', () => {
    const request: Request = {};

    expect(guardFor({ isPublic: true, tenantFree: true }).canActivate(contextFor(request))).toBe(true);
    expect(request.buyer).toBeUndefined();
  });

  it('never refuses: authentication belongs to AccessTokenGuard', () => {
    expect(guardFor({ tenantFree: true }).canActivate(contextFor({}))).toBe(true);
  });
});
