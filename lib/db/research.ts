/**
 * Research Data Layer — lib/db/research.ts
 *
 * What it does: Provides CRUD operations for customer research entries and
 *   extracted quotes. Research entries capture raw notes from calls, interviews,
 *   surveys, reviews, and other customer touchpoints. AI processing extracts
 *   summaries, themes, sentiment, hypothesis signals, and quotable snippets.
 *
 * What it reads from: The research_entries and research_quotes tables (via
 *   Prisma), with related campaign data.
 *
 * What it produces: Research entry records with optional quotes, and a
 *   standalone Voice-of-Customer quote library with parent entry metadata.
 *
 * Edge cases:
 *   - Entries may have no quotes yet (AI processing is async and may still
 *     be running). summary === null indicates processing hasn't completed.
 *   - themes is a string[] stored in Postgres; filtering uses `has` for
 *     single-theme containment.
 *   - hypothesisSignals is a JSON column; may be null before AI processing.
 *   - Deleting an entry cascades to its quotes (via onDelete: Cascade in schema).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

// -------------------------------------------------------------------------
// Research Entries
// -------------------------------------------------------------------------

export async function createResearchEntry(data: {
  title: string;
  sourceType: string;
  contactName?: string;
  contactCompany?: string;
  contactSegment?: string;
  contactStage?: string;
  researchDate?: Date;
  rawNotes: string;
  productSignal?: boolean;
  productNote?: string;
  campaignId?: string;
  createdBy: string;
}) {
  return prisma.researchEntry.create({
    data: {
      title: data.title,
      sourceType: data.sourceType,
      contactName: data.contactName,
      contactCompany: data.contactCompany,
      contactSegment: data.contactSegment,
      contactStage: data.contactStage,
      researchDate: data.researchDate,
      rawNotes: data.rawNotes,
      productSignal: data.productSignal ?? false,
      productNote: data.productNote,
      campaignId: data.campaignId,
      createdBy: data.createdBy,
    },
  });
}

export async function updateResearchEntry(
  id: string,
  data: {
    title?: string;
    contactName?: string;
    contactCompany?: string;
    contactSegment?: string;
    contactStage?: string;
    researchDate?: Date;
    summary?: string;
    themes?: string[];
    sentiment?: string;
    sentimentLocked?: boolean;
    productSignal?: boolean;
    productNote?: string;
    rawNotes?: string;
    hypothesisSignals?: unknown;
    campaignId?: string;
  }
) {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.contactCompany !== undefined) updateData.contactCompany = data.contactCompany;
  if (data.contactSegment !== undefined) updateData.contactSegment = data.contactSegment;
  if (data.contactStage !== undefined) updateData.contactStage = data.contactStage;
  if (data.researchDate !== undefined) updateData.researchDate = data.researchDate;
  if (data.summary !== undefined) updateData.summary = data.summary;
  if (data.themes !== undefined) updateData.themes = data.themes;
  if (data.sentiment !== undefined) updateData.sentiment = data.sentiment;
  if (data.sentimentLocked !== undefined) updateData.sentimentLocked = data.sentimentLocked;
  if (data.productSignal !== undefined) updateData.productSignal = data.productSignal;
  if (data.productNote !== undefined) updateData.productNote = data.productNote;
  if (data.rawNotes !== undefined) updateData.rawNotes = data.rawNotes;
  if (data.campaignId !== undefined) updateData.campaignId = data.campaignId;
  if (data.hypothesisSignals !== undefined) {
    updateData.hypothesisSignals = data.hypothesisSignals as Prisma.InputJsonValue;
  }

  return prisma.researchEntry.update({
    where: { id },
    data: updateData,
  });
}

export async function getResearchEntries(filters?: {
  sourceType?: string;
  contactSegment?: string;
  contactStage?: string;
  theme?: string;
  campaignId?: string;
  productSignal?: boolean;
  limit?: number;
}) {
  const where: Prisma.ResearchEntryWhereInput = {};

  if (filters?.sourceType) where.sourceType = filters.sourceType;
  if (filters?.contactSegment) where.contactSegment = filters.contactSegment;
  if (filters?.contactStage) where.contactStage = filters.contactStage;
  if (filters?.campaignId) where.campaignId = filters.campaignId;
  if (filters?.productSignal !== undefined) where.productSignal = filters.productSignal;
  if (filters?.theme) where.themes = { has: filters.theme };

  return prisma.researchEntry.findMany({
    where,
    include: {
      campaign: { select: { id: true, name: true } },
      _count: { select: { quotes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit ?? 50,
  });
}

export async function getResearchEntry(id: string) {
  return prisma.researchEntry.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      quotes: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function deleteResearchEntry(id: string) {
  return prisma.researchEntry.delete({
    where: { id },
  });
}

// Atomically write AI-derived sentiment only when not manually locked.
// Uses updateMany with WHERE sentimentLocked=false so no separate read is needed.
export async function updateResearchEntrySentimentConditional(
  id: string,
  sentiment: string
): Promise<void> {
  await prisma.researchEntry.updateMany({
    where: { id, sentimentLocked: false },
    data: { sentiment },
  });
}

// -------------------------------------------------------------------------
// Research Quotes
// -------------------------------------------------------------------------

export async function createResearchQuotes(
  quotes: Array<{
    researchEntryId: string;
    quote: string;
    context?: string;
    theme?: string;
    segment?: string;
  }>
) {
  if (quotes.length === 0) return { count: 0 };

  return prisma.researchQuote.createMany({
    data: quotes.map((q) => ({
      researchEntryId: q.researchEntryId,
      quote: q.quote,
      context: q.context,
      theme: q.theme,
      segment: q.segment,
    })),
  });
}

export async function getResearchQuotes(filters?: {
  theme?: string;
  segment?: string;
  isFeatured?: boolean;
  limit?: number;
}) {
  const where: Prisma.ResearchQuoteWhereInput = {};

  if (filters?.theme) where.theme = filters.theme;
  if (filters?.segment) where.segment = filters.segment;
  if (filters?.isFeatured !== undefined) where.isFeatured = filters.isFeatured;

  return prisma.researchQuote.findMany({
    where,
    include: {
      entry: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          researchDate: true,
        },
      },
    },
    orderBy: [
      { isFeatured: 'desc' },
      { createdAt: 'desc' },
    ],
    take: filters?.limit ?? 100,
  });
}

export async function toggleQuoteFeatured(id: string) {
  const quote = await prisma.researchQuote.findUnique({
    where: { id },
    select: { isFeatured: true },
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  return prisma.researchQuote.update({
    where: { id },
    data: { isFeatured: !quote.isFeatured },
  });
}
