-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "CheckoutStatus" ADD VALUE 'PAID';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PAID';

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PROCESSING',
    "amountMinor" INTEGER NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "refundedReason" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_charges" (
    "operationKey" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_charges_pkey" PRIMARY KEY ("operationKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkoutId_key" ON "payments"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerRef_key" ON "payments"("providerRef");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
--
-- What Prisma cannot express, and what the code should not be the only guard for:
-- a payment is for positive money, an attempt count is never negative, and the two
-- "settled" columns are present exactly when the status says they should be. A refund
-- with no reason would be an unexplainable row in the books, and a SUCCEEDED payment with
-- no capturedAt would be a claim that money moved with nothing saying when.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_attempts_non_negative" CHECK ("attempts" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_marked"
  CHECK (("status" = 'REFUNDED') = ("refundedReason" IS NOT NULL));
ALTER TABLE "payments" ADD CONSTRAINT "payments_captured_when_settled"
  CHECK (("status" IN ('SUCCEEDED', 'REFUNDED')) = ("capturedAt" IS NOT NULL));

ALTER TABLE "provider_charges" ADD CONSTRAINT "provider_charges_amount_positive" CHECK ("amountMinor" > 0);
