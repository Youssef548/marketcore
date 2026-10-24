import { Injectable } from '@nestjs/common';
import type { Prisma } from '@app/database';
import type { CheckoutStatus, CurrencyCode } from '@app/contracts';
import { PrismaService } from '@app/runtime';
import type { BuyerContext } from '@app/domain';
import { buyerScope } from '@app/domain';
import {
  INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
  INTERACTIVE_TRANSACTION_TIMEOUT_MS,
} from '../../common/database/database.constants';
import type {
  CapturableCheckout,
  PaymentClaim,
  PaymentSettlement,
} from '../interfaces/payment.interface';
import { PaymentRefundReasons } from '../payments.constants';

const PAYMENT_SELECT = {
  id: true,
  status: true,
  amountMinor: true,
  currency: true,
  attempts: true,
  providerRef: true,
  capturedAt: true,
  refundedReason: true,
} as const;

const TX = { maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS, timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS };

/**
 * The capture's two transactions (D103), and the reason there are two.
 *
 * The provider call happens **between** them, outside any transaction, because holding a
 * row lock across a network call is how one slow provider stalls every buyer of a checkout.
 * So each transaction owns one decision: tx A decides whether to charge at all, tx B decides
 * what a charge means now that it has happened. Both take the checkout row `FOR UPDATE`
 * first, which is what serializes two captures of one checkout and what lets tx B notice
 * that the worker cancelled the checkout while the charge was in flight.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The checkout, if it is this buyer's (INV-12: another buyer's id answers as an unknown one). */
  findForBuyer(buyer: BuyerContext, checkoutId: string): Promise<CapturableCheckout | null> {
    return this.prisma.checkout.findFirst({
      where: { id: checkoutId, ...buyerScope(buyer) },
      select: { id: true, status: true, totalMinor: true, currency: true },
    });
  }

  /**
   * Tx A: lock the checkout, and claim the payment if it may be charged.
   *
   * The row is read under the lock, so the amount charged is the checkout's own total as of
   * now — not a number a client sent. A checkout already `PAID` is answered without a
   * provider call, and one already `CANCELLED` is reported with whatever payment row exists,
   * because that row is the only thing that knows an earlier attempt may have charged.
   */
  claim(checkoutId: string): Promise<PaymentClaim> {
    return this.prisma.$transaction(async (tx) => {
      const [checkout] = await tx.$queryRaw<
        { status: CheckoutStatus; totalMinor: number; currency: CurrencyCode }[]
      >`SELECT status, "totalMinor", currency FROM checkouts WHERE id = ${checkoutId} FOR UPDATE`;
      if (checkout === undefined) return { kind: 'CANCELLED', payment: null } satisfies PaymentClaim;

      const existing = await tx.payment.findUnique({ where: { checkoutId }, select: PAYMENT_SELECT });
      if (checkout.status === 'PAID') {
        return { kind: 'ALREADY_PAID' } satisfies PaymentClaim;
      }
      if (checkout.status === 'CANCELLED') {
        return { kind: 'CANCELLED', payment: existing } satisfies PaymentClaim;
      }

      // The amount charged is the locked row's own total, never a number a client sent.
      const payment =
        existing === null
          ? await tx.payment.create({
              data: {
                checkoutId,
                amountMinor: checkout.totalMinor,
                currency: checkout.currency,
                attempts: 1,
              },
              select: PAYMENT_SELECT,
            })
          : await tx.payment.update({
              where: { checkoutId },
              data: { attempts: { increment: 1 } },
              select: PAYMENT_SELECT,
            });

      return { kind: 'CLAIMED', payment } satisfies PaymentClaim;
    }, TX);
  }

  /**
   * Tx B: what the charge means, re-read under the lock.
   *
   * The checkout is read *again* rather than trusted from tx A, which is the whole point:
   * the worker's cancel can land between the two, and a charge on a cancelled checkout is
   * refunded instead of marking anything paid (SRS-FR-PAY-004).
   */
  settle(checkoutId: string, captured: { providerRef: string; capturedAt: Date }): Promise<PaymentSettlement> {
    return this.prisma.$transaction(async (tx) => {
      const [checkout] = await tx.$queryRaw<{ status: CheckoutStatus }[]>`
        SELECT status FROM checkouts WHERE id = ${checkoutId} FOR UPDATE
      `;
      if (checkout?.status === 'PAID') return { kind: 'ALREADY_PAID' } satisfies PaymentSettlement;

      if (checkout?.status === 'CANCELLED') {
        await this.refundWithin(tx, checkoutId, captured, PaymentRefundReasons.CHECKOUT_CANCELLED);
        return { kind: 'REFUNDED' } satisfies PaymentSettlement;
      }

      // One statement each, so a checkout cannot be paid with an unpaid order or the reverse.
      await tx.payment.update({
        where: { checkoutId },
        data: { status: 'SUCCEEDED', providerRef: captured.providerRef, capturedAt: captured.capturedAt },
      });
      await tx.checkout.update({ where: { id: checkoutId }, data: { status: 'PAID' } });
      // The order has no `FOR UPDATE` re-read of its own, so its terminal-state guard
      // lives here in the WHERE instead: a cancelled (or already paid) order must not
      // move again. The checkout's guard above is its own re-read; this pins the order's
      // state at the same moment in the same transaction.
      await tx.order.updateMany({
        where: { checkoutId, status: 'PENDING_PAYMENT' },
        data: { status: 'PAID' },
      });

      return { kind: 'PAID' } satisfies PaymentSettlement;
    }, TX);
  }

  /** A decline is recorded and nothing else moves: the checkout stays payable (D106). */
  markFailed(checkoutId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const [checkout] = await tx.$queryRaw<{ status: CheckoutStatus }[]>`
        SELECT status FROM checkouts WHERE id = ${checkoutId} FOR UPDATE
      `;
      if (checkout === undefined || checkout.status !== 'PENDING_PAYMENT') return;
      await tx.payment.updateMany({ where: { checkoutId, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    }, TX);
  }

  /**
   * Refund a charge found for a checkout that was already cancelled when tx A read it
   * (D107's second case, through the port's lookup): the provider has the money, so the row
   * has to say so even though no new charge was made.
   */
  refundCancelled(
    checkoutId: string,
    captured: { providerRef: string; capturedAt: Date },
  ): Promise<void> {
    return this.prisma.$transaction(
      (tx) => this.refundWithin(tx, checkoutId, captured, PaymentRefundReasons.CHECKOUT_CANCELLED),
      TX,
    );
  }

  private async refundWithin(
    tx: Prisma.TransactionClient,
    checkoutId: string,
    captured: { providerRef: string; capturedAt: Date },
    reason: string,
  ): Promise<void> {
    // `capturedAt` comes from the charge, not from now: the money moved when the provider
    // said so, and the constraint on the table insists a REFUNDED row has one.
    await tx.payment.updateMany({
      where: { checkoutId },
      data: {
        status: 'REFUNDED',
        providerRef: captured.providerRef,
        capturedAt: captured.capturedAt,
        refundedReason: reason,
      },
    });
  }
}
