import { Injectable } from '@nestjs/common';
import type { Prisma } from '@app/database';
import { PrismaService } from '@app/runtime';
import type {
  ProviderChargeRecord,
  ProviderChargeStore,
  RecordedCharge,
} from '../interfaces/provider-charge.interface';

const CHARGE_SELECT = {
  operationKey: true,
  providerRef: true,
  amountMinor: true,
  currency: true,
  capturedAt: true,
} satisfies Prisma.ProviderChargeSelect;

/**
 * The provider's own store, in PostgreSQL (ADR 004).
 *
 * Unlike the idempotency repository this one holds a Prisma client, because the provider
 * call happens **outside** any transaction — the charge must be recorded whether or not the
 * caller's transaction ever commits, or a crash between the two would lose the fact that
 * money moved.
 *
 * `record` is `INSERT … ON CONFLICT DO NOTHING` followed by a read, the shape ADR 003 used
 * for a request key: on a conflict nothing is written, so the row read next is the
 * statement's answer. That is what makes two simultaneous captures safe — the loser reads
 * the winner's charge instead of failing on the primary key.
 */
@Injectable()
export class ProviderChargeRepository implements ProviderChargeStore {
  constructor(private readonly prisma: PrismaService) {}

  find(operationKey: string): Promise<ProviderChargeRecord | null> {
    return this.prisma.providerCharge.findUnique({ where: { operationKey }, select: CHARGE_SELECT });
  }

  async record(charge: ProviderChargeRecord): Promise<RecordedCharge> {
    const { count } = await this.prisma.providerCharge.createMany({ data: charge, skipDuplicates: true });
    if (count === 1) return { charge, created: true };

    const existing = await this.find(charge.operationKey);
    if (existing === null) {
      // Unreachable: the insert was skipped because this key already had a row.
      throw new Error(`provider charge ${charge.operationKey} disappeared between insert and read`);
    }

    return { charge: existing, created: false };
  }
}
