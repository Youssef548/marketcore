import { CurrencyCode, MemberRole, ProductStatus, UserStatus, type Prisma } from '@prisma/client';

/**
 * Not credentials. These values are not argon2id hashes, so they cannot
 * authenticate against anything; they exist so the seed has real rows to write.
 * Nothing in the API accepts them. The auth module hashes with argon2id.
 */
const SEED_PASSWORD_HASH = 'not-a-credential-seed-placeholder';

/**
 * Fixed identifiers, because products carry no business-level unique key and
 * inventing one purely so the seed can upsert would distort the domain to serve
 * the seed. Deterministic ids make the seed idempotent without inventing a rule.
 */
export const SEED_IDS = {
  ORG_NILE: '11111111-1111-4111-8111-111111111111',
  ORG_DELTA: '22222222-2222-4222-8222-222222222222',
  USER_OWNER: '33333333-3333-4333-8333-333333333333',
  USER_MEMBER: '44444444-4444-4444-8444-444444444444',
  USER_OUTSIDER: '55555555-5555-4555-8555-555555555555',
  PRODUCT_NILE: '66666666-6666-4666-8666-666666666666',
  PRODUCT_DELTA: '77777777-7777-4777-8777-777777777777',
} as const;

export const SEED_ORGANIZATIONS = [
  { id: SEED_IDS.ORG_NILE, name: 'Nile Traders', slug: 'nile-traders' },
  { id: SEED_IDS.ORG_DELTA, name: 'Delta Goods', slug: 'delta-goods' },
] as const;

export const SEED_USERS: readonly Prisma.UserCreateInput[] = [
  {
    id: SEED_IDS.USER_OWNER,
    email: 'owner@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
  {
    id: SEED_IDS.USER_MEMBER,
    email: 'member@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
  {
    id: SEED_IDS.USER_OUTSIDER,
    email: 'outsider@marketcore.test',
    passwordHash: SEED_PASSWORD_HASH,
    status: UserStatus.ACTIVE,
  },
];

export const SEED_MEMBERSHIPS = [
  { organizationId: SEED_IDS.ORG_NILE, userId: SEED_IDS.USER_OWNER, role: MemberRole.OWNER },
  { organizationId: SEED_IDS.ORG_NILE, userId: SEED_IDS.USER_MEMBER, role: MemberRole.MEMBER },
  // The outsider belongs to Delta only, which is what makes a cross-tenant check
  // readable by hand: this user must never see Nile's product.
  { organizationId: SEED_IDS.ORG_DELTA, userId: SEED_IDS.USER_OUTSIDER, role: MemberRole.OWNER },
] as const;

/**
 * Stock the seed starts each product with. A named value because it is seed data,
 * not an incidental number — the tests that read it should find one definition.
 */
export const SEED_INVENTORY_AVAILABLE = 10;

export const SEED_PRODUCTS = [
  {
    id: SEED_IDS.PRODUCT_NILE,
    organizationId: SEED_IDS.ORG_NILE,
    name: 'Nile Cotton Shirt',
    priceMinor: 24900,
    currency: CurrencyCode.EGP,
    status: ProductStatus.PUBLISHED,
  },
  {
    id: SEED_IDS.PRODUCT_DELTA,
    organizationId: SEED_IDS.ORG_DELTA,
    name: 'Delta Olive Oil',
    priceMinor: 18900,
    currency: CurrencyCode.EGP,
    status: ProductStatus.PUBLISHED,
  },
] as const;
