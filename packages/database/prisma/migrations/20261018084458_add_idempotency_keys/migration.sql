-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_checkoutId_key" ON "idempotency_keys"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_buyerId_key_key" ON "idempotency_keys"("buyerId", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
--
-- DEFERRABLE INITIALLY DEFERRED, and that is the whole design (ADR 003, D95): the claim is
-- inserted with the id of the checkout the request is *about* to create, so before the
-- checkout exists. A refused placement releases the claim inside the same transaction, so
-- a committed key always names a checkout — enforced here rather than by a CHECK, because
-- PostgreSQL cannot defer one. PostgreSQL defers UNIQUE, PRIMARY KEY, REFERENCES and
-- EXCLUDE only.
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddCheckConstraint
--
-- The database repeats the wire bound (SRS §7, ADR 003 D97) rather than trusting the
-- controller, the same way phase 4 repeated the cart quantity rule.
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_key_length" CHECK (char_length("key") BETWEEN 1 AND 64);
