-- AlterTable
ALTER TABLE "Lease" ADD COLUMN "portalToken" TEXT;

-- Generate tokens for existing rows
UPDATE "Lease" SET "portalToken" = gen_random_uuid()::text WHERE "portalToken" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Lease_portalToken_key" ON "Lease"("portalToken");
