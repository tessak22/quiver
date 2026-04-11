/**
 * Content Data Layer — lib/db/content.ts
 *
 * What it does: Provides CRUD operations for content pieces, distributions,
 *   and metric snapshots. Content pieces are published marketing content —
 *   blog posts, case studies, landing pages, etc. — with full SEO metadata,
 *   distribution tracking across channels, and performance metric snapshots.
 *
 * What it reads from: The content_pieces, content_distributions, and
 *   content_metric_snapshots tables (via Prisma), with related campaign data.
 *
 * What it produces: Content piece records with optional distributions,
 *   metric snapshots, derived/parent content, and performance signals.
 *
 * Edge cases:
 *   - Slug generation strips non-alphanumeric characters and appends `-2`, `-3`
 *     etc. when the slug already exists.
 *   - getContentPerformanceSignal returns 'no_data' for empty snapshots,
 *     'logging' for fewer than 3, 'strong' when latest pageviews >= average,
 *     'weak' when latest pageviews < 50% of average.
 *   - publishContentPiece only sets publishedAt if it was previously null.
 */

import { prisma } from '@/lib/db';
import type { PerformanceSignal } from '@/types';

// -------------------------------------------------------------------------
// Slug generation
// -------------------------------------------------------------------------

export async function generateSlug(title: string): Promise<string> {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check if base slug is available
  const existing = await prisma.contentPiece.findUnique({
    where: { slug: base },
    select: { id: true },
  });

  if (!existing) return base;

  // Append incrementing suffix until we find an available slug
  let suffix = 2;
  while (true) {
    const candidate = `${base}-${suffix}`;
    const taken = await prisma.contentPiece.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    suffix++;
  }
}

// -------------------------------------------------------------------------
// Content pieces — read
// -------------------------------------------------------------------------

export async function getContentPieces(filters?: {
  status?: string;
  contentType?: string;
  campaignId?: string;
}) {
  return prisma.contentPiece.findMany({
    where: {
      status: filters?.status,
      contentType: filters?.contentType,
      campaignId: filters?.campaignId,
    },
    include: {
      campaign: { select: { id: true, name: true } },
      distributions: { select: { id: true } },
      metricSnapshots: {
        orderBy: { snapshotDate: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getContentPiece(id: string) {
  return prisma.contentPiece.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      distributions: {
        orderBy: { createdAt: 'desc' },
      },
      metricSnapshots: {
        orderBy: { snapshotDate: 'desc' },
        take: 24,
      },
      derivedContent: {
        select: { id: true, title: true, contentType: true, slug: true, status: true },
      },
      parentContent: {
        select: { id: true, title: true, contentType: true, slug: true },
      },
    },
  });
}

export async function getContentPieceBySlug(slug: string) {
  return prisma.contentPiece.findUnique({
    where: { slug },
    include: {
      campaign: { select: { id: true, name: true } },
      distributions: {
        orderBy: { createdAt: 'desc' },
      },
      metricSnapshots: {
        orderBy: { snapshotDate: 'desc' },
        take: 24,
      },
    },
  });
}

// -------------------------------------------------------------------------
// Content pieces — write
// -------------------------------------------------------------------------

export async function createContentPiece(data: {
  title: string;
  slug?: string;
  contentType: string;
  status?: string;
  body: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  targetKeyword?: string;
  secondaryKeywords?: string[];
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  twitterCardType?: string;
  publishedAt?: Date;
  campaignId?: string;
  parentContentId?: string;
  artifactId?: string;
  contextVersionId?: string;
  createdBy: string;
}) {
  const slug = data.slug || await generateSlug(data.title);

  return prisma.contentPiece.create({
    data: {
      title: data.title,
      slug,
      contentType: data.contentType,
      status: data.status ?? 'draft',
      body: data.body,
      excerpt: data.excerpt,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      targetKeyword: data.targetKeyword,
      secondaryKeywords: data.secondaryKeywords ?? [],
      canonicalUrl: data.canonicalUrl,
      ogTitle: data.ogTitle,
      ogDescription: data.ogDescription,
      ogImageUrl: data.ogImageUrl,
      twitterCardType: data.twitterCardType ?? 'summary_large_image',
      publishedAt: data.publishedAt,
      campaignId: data.campaignId,
      parentContentId: data.parentContentId,
      artifactId: data.artifactId,
      contextVersionId: data.contextVersionId,
      createdBy: data.createdBy,
    },
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });
}

export async function updateContentPiece(
  id: string,
  data: {
    title?: string;
    slug?: string;
    contentType?: string;
    status?: string;
    body?: string;
    excerpt?: string;
    metaTitle?: string;
    metaDescription?: string;
    targetKeyword?: string;
    secondaryKeywords?: string[];
    canonicalUrl?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    twitterCardType?: string;
    publishedAt?: Date | null;
    campaignId?: string;
    parentContentId?: string;
  }
) {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.contentType !== undefined) updateData.contentType = data.contentType;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
  if (data.metaTitle !== undefined) updateData.metaTitle = data.metaTitle;
  if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription;
  if (data.targetKeyword !== undefined) updateData.targetKeyword = data.targetKeyword;
  if (data.secondaryKeywords !== undefined) updateData.secondaryKeywords = data.secondaryKeywords;
  if (data.canonicalUrl !== undefined) updateData.canonicalUrl = data.canonicalUrl;
  if (data.ogTitle !== undefined) updateData.ogTitle = data.ogTitle;
  if (data.ogDescription !== undefined) updateData.ogDescription = data.ogDescription;
  if (data.ogImageUrl !== undefined) updateData.ogImageUrl = data.ogImageUrl;
  if (data.twitterCardType !== undefined) updateData.twitterCardType = data.twitterCardType;
  if (data.publishedAt !== undefined) updateData.publishedAt = data.publishedAt;
  if (data.campaignId !== undefined) updateData.campaignId = data.campaignId;
  if (data.parentContentId !== undefined) updateData.parentContentId = data.parentContentId;

  return prisma.contentPiece.update({
    where: { id },
    data: updateData,
    include: {
      campaign: { select: { id: true, name: true } },
      distributions: {
        orderBy: { createdAt: 'desc' },
      },
      metricSnapshots: {
        orderBy: { snapshotDate: 'desc' },
        take: 24,
      },
      derivedContent: {
        select: { id: true, title: true, contentType: true, slug: true, status: true },
      },
      parentContent: {
        select: { id: true, title: true, contentType: true, slug: true },
      },
    },
  });
}

export async function publishContentPiece(id: string) {
  const existing = await prisma.contentPiece.findUnique({
    where: { id },
    select: { publishedAt: true },
  });

  return prisma.contentPiece.update({
    where: { id },
    data: {
      status: 'published',
      publishedAt: existing?.publishedAt ?? new Date(),
    },
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });
}

// -------------------------------------------------------------------------
// Distributions
// -------------------------------------------------------------------------

export async function addDistribution(data: {
  contentPieceId: string;
  channel: string;
  url?: string;
  publishedAt?: Date;
  status?: string;
  notes?: string;
}) {
  return prisma.contentDistribution.create({
    data: {
      contentPieceId: data.contentPieceId,
      channel: data.channel,
      url: data.url,
      publishedAt: data.publishedAt,
      status: data.status ?? 'planned',
      notes: data.notes,
    },
  });
}

export async function updateDistribution(
  id: string,
  data: {
    channel?: string;
    url?: string;
    publishedAt?: Date | null;
    status?: string;
    notes?: string;
  }
) {
  const updateData: Record<string, unknown> = {};

  if (data.channel !== undefined) updateData.channel = data.channel;
  if (data.url !== undefined) updateData.url = data.url;
  if (data.publishedAt !== undefined) updateData.publishedAt = data.publishedAt;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;

  return prisma.contentDistribution.update({
    where: { id },
    data: updateData,
  });
}

export async function getDistribution(id: string) {
  return prisma.contentDistribution.findUnique({
    where: { id },
    select: { id: true, contentPieceId: true },
  });
}

export async function deleteDistribution(id: string) {
  return prisma.contentDistribution.delete({
    where: { id },
  });
}

// -------------------------------------------------------------------------
// Metric snapshots
// -------------------------------------------------------------------------

export async function addMetricSnapshot(data: {
  contentPieceId: string;
  snapshotDate: Date;
  pageviews?: number;
  uniqueVisitors?: number;
  avgTimeOnPage?: number;
  bounceRate?: number;
  organicClicks?: number;
  impressions?: number;
  avgPosition?: number;
  ctr?: number;
  socialShares?: number;
  backlinks?: number;
  comments?: number;
  signups?: number;
  conversionRate?: number;
  source?: string;
  notes?: string;
  recordedBy: string;
}) {
  return prisma.contentMetricSnapshot.create({
    data: {
      contentPieceId: data.contentPieceId,
      snapshotDate: data.snapshotDate,
      pageviews: data.pageviews,
      uniqueVisitors: data.uniqueVisitors,
      avgTimeOnPage: data.avgTimeOnPage,
      bounceRate: data.bounceRate,
      organicClicks: data.organicClicks,
      impressions: data.impressions,
      avgPosition: data.avgPosition,
      ctr: data.ctr,
      socialShares: data.socialShares,
      backlinks: data.backlinks,
      comments: data.comments,
      signups: data.signups,
      conversionRate: data.conversionRate,
      source: data.source ?? 'manual',
      notes: data.notes,
      recordedBy: data.recordedBy,
    },
  });
}

export async function getMetricSnapshots(contentPieceId: string, limit: number = 24) {
  return prisma.contentMetricSnapshot.findMany({
    where: { contentPieceId },
    orderBy: { snapshotDate: 'desc' },
    take: limit,
  });
}

// -------------------------------------------------------------------------
// Slug availability check
// -------------------------------------------------------------------------

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const existing = await prisma.contentPiece.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !existing;
}

// -------------------------------------------------------------------------
// Public-facing queries (no auth, limited fields)
// -------------------------------------------------------------------------

export async function getPublishedContentList(options: {
  contentType?: string;
  limit: number;
  offset: number;
}) {
  return prisma.contentPiece.findMany({
    where: {
      status: 'published',
      ...(options.contentType ? { contentType: options.contentType } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    skip: options.offset,
    take: options.limit,
    select: {
      slug: true,
      title: true,
      contentType: true,
      excerpt: true,
      publishedAt: true,
      ogImageUrl: true,
    },
  });
}

export async function getPublishedContentBySlug(slug: string) {
  return prisma.contentPiece.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      contentType: true,
      body: true,
      excerpt: true,
      status: true,
      metaTitle: true,
      metaDescription: true,
      canonicalUrl: true,
      ogTitle: true,
      ogDescription: true,
      ogImageUrl: true,
      twitterCardType: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

// -------------------------------------------------------------------------
// Performance signal
// -------------------------------------------------------------------------

export function getContentPerformanceSignal(
  snapshots: Array<{ pageviews: number | null }>
): PerformanceSignal {
  if (!snapshots || snapshots.length === 0) return 'no_data';
  if (snapshots.length < 3) return 'logging';

  const withPageviews = snapshots.filter(
    (s): s is { pageviews: number } => s.pageviews !== null
  );

  if (withPageviews.length === 0) return 'logging';

  const latest = withPageviews[0].pageviews;
  const avg =
    withPageviews.reduce((sum, s) => sum + s.pageviews, 0) / withPageviews.length;

  if (avg === 0) return 'logging';

  if (latest >= avg) return 'strong';
  if (latest < avg * 0.5) return 'weak';
  return 'logging';
}
