-- CreateTable
CREATE TABLE "installed_skills" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "githubRepo" TEXT,
    "githubRef" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillContent" TEXT NOT NULL,
    "references" JSONB NOT NULL DEFAULT '[]',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "installedBy" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchError" TEXT,

    CONSTRAINT "installed_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installed_skills_githubRepo_key" ON "installed_skills"("githubRepo");

-- CreateIndex
CREATE INDEX "installed_skills_isEnabled_idx" ON "installed_skills"("isEnabled");

-- CreateIndex
CREATE INDEX "installed_skills_name_idx" ON "installed_skills"("name");
