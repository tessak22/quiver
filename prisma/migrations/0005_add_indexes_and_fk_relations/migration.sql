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

-- Artifact.parentArtifactId -> Artifact (self-referential)
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_parentArtifactId_fkey" FOREIGN KEY ("parentArtifactId") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ContentPiece.artifactId -> Artifact
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ContentPiece.contextVersionId -> ContextVersion
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_contextVersionId_fkey" FOREIGN KEY ("contextVersionId") REFERENCES "context_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
