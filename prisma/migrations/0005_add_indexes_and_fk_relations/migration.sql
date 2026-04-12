-- TASK-024: Add missing database indexes

-- ContextVersion.isActive - queried on nearly every request
CREATE INDEX "context_versions_isActive_idx" ON "context_versions"("isActive");

-- Campaign.status - frequent filtering by status
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- PerformanceLog.contextUpdateStatus - pending proposals query
CREATE INDEX "performance_logs_contextUpdateStatus_idx" ON "performance_logs"("contextUpdateStatus");

-- ContentPiece.status - published content queries
CREATE INDEX "content_pieces_status_idx" ON "content_pieces"("status");

-- TASK-029: Add FK relations for orphaned string ID fields
-- Use NOT VALID to avoid failing on existing orphaned rows, then validate separately.

-- Step 1: Null out any orphaned references before adding constraints
UPDATE "artifacts" SET "parentArtifactId" = NULL WHERE "parentArtifactId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "artifacts" p WHERE p."id" = "artifacts"."parentArtifactId");

UPDATE "content_pieces" SET "artifactId" = NULL WHERE "artifactId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "artifacts" WHERE "id" = "content_pieces"."artifactId");

UPDATE "content_pieces" SET "contextVersionId" = NULL WHERE "contextVersionId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "context_versions" WHERE "id" = "content_pieces"."contextVersionId");

-- Step 2: Add constraints as NOT VALID (instant, no full table scan)
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parentArtifactId_fkey"
  FOREIGN KEY ("parentArtifactId") REFERENCES "artifacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_contextVersionId_fkey"
  FOREIGN KEY ("contextVersionId") REFERENCES "context_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- Step 3: Validate constraints (scans table but does not block writes)
ALTER TABLE "artifacts" VALIDATE CONSTRAINT "artifacts_parentArtifactId_fkey";
ALTER TABLE "content_pieces" VALIDATE CONSTRAINT "content_pieces_artifactId_fkey";
ALTER TABLE "content_pieces" VALIDATE CONSTRAINT "content_pieces_contextVersionId_fkey";
