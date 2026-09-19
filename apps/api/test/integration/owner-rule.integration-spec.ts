import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from '@jest/globals';
import { MemberRole } from '@prisma/client';
import type { PrismaService } from '@app/runtime';
import { MemberRemovalOutcomes } from '../../src/organizations/membership.interface';
import { MembershipRepository } from '../../src/organizations/membership.repository';
import { testPrisma } from '../support/db';

const suffix = () => randomUUID().slice(0, 8);

/**
 * "An organization retains at least one owner" is a rule over sibling rows, so it
 * cannot be a CHECK. It is a count followed by a delete, which is two statements —
 * and at READ COMMITTED a plain transaction lets two concurrent removals of two
 * different owners both read a count of 2 and both succeed, leaving none.
 *
 * This asserts the rule against real Postgres rather than trusting the
 * transaction. On the unlocked version it fails; on the row-locked version exactly
 * one removal succeeds.
 */
describe('the last-owner rule under concurrency', () => {
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('leaves exactly one owner when two removals race', async () => {
    const organization = await testPrisma.organization.create({
      data: { name: 'Race Co', slug: `race-${suffix()}` },
    });
    const [first, second] = await Promise.all([
      testPrisma.user.create({
        data: { email: `owner-a-${suffix()}@marketcore.test`, passwordHash: 'x' },
      }),
      testPrisma.user.create({
        data: { email: `owner-b-${suffix()}@marketcore.test`, passwordHash: 'x' },
      }),
    ]);
    await testPrisma.organizationMember.createMany({
      data: [
        { organizationId: organization.id, userId: first.id, role: MemberRole.OWNER },
        { organizationId: organization.id, userId: second.id, role: MemberRole.OWNER },
      ],
    });

    const repository = new MembershipRepository(testPrisma as unknown as PrismaService);
    const outcomes = await Promise.all([
      repository.removeKeepingAnOwner(organization.id, first.id),
      repository.removeKeepingAnOwner(organization.id, second.id),
    ]);

    expect(outcomes.filter((outcome) => outcome === MemberRemovalOutcomes.REMOVED)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === MemberRemovalOutcomes.LAST_OWNER)).toHaveLength(1);

    const owners = await testPrisma.organizationMember.count({
      where: { organizationId: organization.id, role: MemberRole.OWNER },
    });
    // The invariant itself. Zero would mean both deletions committed, which is the
    // failure the lock exists to prevent.
    expect(owners).toBe(1);
  });

  it('removes a plain member without needing a second owner', async () => {
    const organization = await testPrisma.organization.create({
      data: { name: 'Solo Co', slug: `solo-${suffix()}` },
    });
    const owner = await testPrisma.user.create({
      data: { email: `solo-owner-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    const member = await testPrisma.user.create({
      data: { email: `solo-member-${suffix()}@marketcore.test`, passwordHash: 'x' },
    });
    await testPrisma.organizationMember.createMany({
      data: [
        { organizationId: organization.id, userId: owner.id, role: MemberRole.OWNER },
        { organizationId: organization.id, userId: member.id, role: MemberRole.MEMBER },
      ],
    });

    const repository = new MembershipRepository(testPrisma as unknown as PrismaService);

    await expect(
      repository.removeKeepingAnOwner(organization.id, member.id),
    ).resolves.toBe(MemberRemovalOutcomes.REMOVED);
  });

  it('reports a non-member rather than removing anything', async () => {
    const organization = await testPrisma.organization.create({
      data: { name: 'Empty Co', slug: `empty-${suffix()}` },
    });

    const repository = new MembershipRepository(testPrisma as unknown as PrismaService);

    await expect(
      repository.removeKeepingAnOwner(organization.id, 'no-such-user'),
    ).resolves.toBe(MemberRemovalOutcomes.NOT_A_MEMBER);
  });
});
