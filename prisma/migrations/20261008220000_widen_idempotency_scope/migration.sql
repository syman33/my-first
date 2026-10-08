-- Scopes may embed an entity id ("return:<uuid>" is 43 characters), which
-- overflowed VARCHAR(40) and failed every return request.
-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "scope" SET DATA TYPE VARCHAR(80);
