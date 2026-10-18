import { Injectable } from '@nestjs/common';
import type { Prisma } from '@app/database';
import type { IdempotencyClaim, IdempotencyScope } from '../interfaces/idempotency.interface';
import { IdempotencyClaimKinds } from '../orders.constants';

/**
 * The idempotency record, inside the transaction that produces the effect (ADR 003).
 *
 * Both methods take a `Prisma.TransactionClient` and there is nothing else to do: a key
 * means nothing outside the transaction it arbitrates, so this class holds no client of
 * its own and is the one repository in the module with no constructor.
 */
@Injectable()
export class IdempotencyRepository {

  /**
   * `INSERT … ON CONFLICT DO NOTHING`, and the unique index is the arbiter (D97).
   *
   * On a conflict nothing is written, so the row read next is the statement's answer --
   * not a hash of four possibilities. A duplicate that arrives while the first request is
   * still in flight blocks here on the unique index and, when the first commits, reads
   * the row it inserted: an order, not a second one.
   *
   * `count === 1` means this call is the one that did the work.
   */
  async claim(tx: Prisma.TransactionClient, scope: IdempotencyScope): Promise<IdempotencyClaim> {
    const { count } = await tx.idempotencyKey.createMany({ data: scope, skipDuplicates: true });
    if (count === 1) return { kind: IdempotencyClaimKinds.CLAIMED };

    const existing = await tx.idempotencyKey.findUniqueOrThrow({
      where: { buyerId_key: { buyerId: scope.buyerId, key: scope.key } },
      select: { requestFingerprint: true, checkoutId: true },
    });
    if (existing.requestFingerprint !== scope.requestFingerprint) {
      return { kind: IdempotencyClaimKinds.KEY_REUSED };
    }

    return { kind: IdempotencyClaimKinds.REPLAY, checkoutId: existing.checkoutId };
  }

  /**
   * A refused placement leaves no claim (D98), in the same transaction that refused it.
   *
   * This is what keeps the invariant honest in both directions. Without it a transient
   * refusal -- a cart that changed between two clicks, a contended row -- would burn the
   * key and the client's retry would get `KEY_REUSED` for a request that never happened.
   * With the foreign key deferred, this is also what keeps a refused transaction
   * committable: the claim it inserted names a checkout that was never created.
   */
  async release(tx: Prisma.TransactionClient, scope: Pick<IdempotencyScope, 'buyerId' | 'key'>): Promise<void> {
    await tx.idempotencyKey.deleteMany({ where: { buyerId: scope.buyerId, key: scope.key } });
  }
}
