-- CreateTable
CREATE TABLE "research_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "contactName" TEXT,
    "contactCompany" TEXT,
    "contactSegment" TEXT,
    "contactStage" TEXT,
    "researchDate" TIMESTAMP(3),
    "rawNotes" TEXT NOT NULL,
    "summary" TEXT,
    "themes" TEXT[],
    "sentiment" TEXT,
    "productSignal" BOOLEAN NOT NULL DEFAULT false,
    "productNote" TEXT,
    "hypothesisSignals" JSONB,
    "campaignId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_quotes" (
    "id" TEXT NOT NULL,
    "researchEntryId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "context" TEXT,
    "theme" TEXT,
    "segment" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_quotes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "research_entries" ADD CONSTRAINT "research_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_quotes" ADD CONSTRAINT "research_quotes_researchEntryId_fkey" FOREIGN KEY ("researchEntryId") REFERENCES "research_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
