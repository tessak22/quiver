import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  createContentPiece,
  getContentPieces,
  generateSlug,
  isSlugAvailable,
  getContentPerformanceSignal,
} from '@/lib/db/content';
import { getActiveContext } from '@/lib/db/context';
import {
  CONTENT_STATUS_VALUES,
  CONTENT_TYPE_VALUES,
} from '@/types';

const contentListQuerySchema = z.object({
  status: z.enum(CONTENT_STATUS_VALUES).optional(),
  contentType: z.enum(CONTENT_TYPE_VALUES).optional(),
  campaignId: z.string().optional(),
});

const contentCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  body: z.string(),
  contentType: z.union([z.enum(CONTENT_TYPE_VALUES), z.null()]).optional(),
  status: z.union([z.enum(CONTENT_STATUS_VALUES), z.null()]).optional(),
  excerpt: z.union([z.string(), z.null()]).optional(),
  slug: z.union([z.string(), z.null()]).optional(),
  metaTitle: z.union([z.string(), z.null()]).optional(),
  metaDescription: z.union([z.string(), z.null()]).optional(),
  targetKeyword: z.union([z.string(), z.null()]).optional(),
  canonicalUrl: z.union([z.string(), z.null()]).optional(),
  ogTitle: z.union([z.string(), z.null()]).optional(),
  ogDescription: z.union([z.string(), z.null()]).optional(),
  ogImageUrl: z.union([z.string(), z.null()]).optional(),
  twitterCardType: z.union([z.string(), z.null()]).optional(),
  secondaryKeywords: z.union([z.array(z.string()), z.null()]).optional(),
  campaignId: z.union([z.string(), z.null()]).optional(),
  parentContentId: z.union([z.string(), z.null()]).optional(),
  artifactId: z.union([z.string(), z.null()]).optional(),
});

function normalizeQueryValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const parsedFilters = contentListQuerySchema.safeParse({
      status: normalizeQueryValue(url.searchParams.get('status')),
      contentType: normalizeQueryValue(url.searchParams.get('contentType')),
      campaignId: normalizeQueryValue(url.searchParams.get('campaignId')),
    });

    if (!parsedFilters.success) {
      return NextResponse.json(
        { error: parsedFilters.error.issues[0]?.message ?? 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const excludeArchived = !includeArchived && !parsedFilters.data.status;

    const pieces = await getContentPieces({
      status: parsedFilters.data.status,
      contentType: parsedFilters.data.contentType,
      campaignId: parsedFilters.data.campaignId,
      excludeArchived,
    });

    const results = pieces.map((piece) => ({
      ...piece,
      distributionCount: piece.distributions.length,
      latestSnapshot: piece.metricSnapshots[0] ?? null,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    }));

    return NextResponse.json({ contentPieces: results });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch content') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

  const parsedBody = contentCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 }
    );
  }

  const contentType = parsedBody.data.contentType ?? 'other';
  const status = parsedBody.data.status ?? 'draft';

  try {
    // Check slug uniqueness if explicitly provided
    const explicitSlug = parsedBody.data.slug?.trim();
    if (explicitSlug) {
      const available = await isSlugAvailable(explicitSlug);
      if (!available) {
        return NextResponse.json(
          { error: 'Slug already taken' },
          { status: 409 }
        );
      }
    }

    const activeContext = await getActiveContext();

    const slug = explicitSlug
      ? explicitSlug
      : await generateSlug(parsedBody.data.title);

    const piece = await createContentPiece({
      title: parsedBody.data.title,
      slug,
      contentType,
      status,
      body: parsedBody.data.body,
      excerpt: parsedBody.data.excerpt ?? undefined,
      metaTitle: parsedBody.data.metaTitle ?? undefined,
      metaDescription: parsedBody.data.metaDescription ?? undefined,
      targetKeyword: parsedBody.data.targetKeyword ?? undefined,
      secondaryKeywords: parsedBody.data.secondaryKeywords ?? undefined,
      canonicalUrl: parsedBody.data.canonicalUrl ?? undefined,
      ogTitle: parsedBody.data.ogTitle ?? undefined,
      ogDescription: parsedBody.data.ogDescription ?? undefined,
      ogImageUrl: parsedBody.data.ogImageUrl ?? undefined,
      twitterCardType: parsedBody.data.twitterCardType ?? undefined,
      publishedAt: status === 'published' ? new Date() : undefined,
      campaignId: parsedBody.data.campaignId ?? undefined,
      parentContentId: parsedBody.data.parentContentId ?? undefined,
      artifactId: parsedBody.data.artifactId ?? undefined,
      contextVersionId: activeContext?.id,
      createdBy: auth.id,
    });

    return NextResponse.json({ contentPiece: piece }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create content') },
      { status: 500 }
    );
  }
}
