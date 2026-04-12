/**
 * POST /api/artifacts/bulk
 *
 * What it does: Applies a bulk action to a set of artifact IDs.
 *   Supported actions: status_change, campaign_reassign, add_tags, remove_tags, archive.
 *
 * What it reads from: request body (discriminated by `action` field)
 * What it produces: { result: BulkOperationResult }
 *
 * Edge cases:
 *   - Empty or missing ids → 400
 *   - ids.length > 100 → 400 (abuse prevention)
 *   - Non-string or empty-string IDs → 400
 *   - Unknown action → 400
 *   - Partial success is returned as 200 — callers check result.failed
 *   - status_change to 'live' creates a performance log reminder per artifact
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  bulkStatusChange,
  bulkCampaignReassign,
  bulkAddTags,
  bulkRemoveTags,
  bulkArchive,
  MAX_BULK_IDS,
  normalizeBulkTags,
} from '@/lib/db/artifacts-bulk';
import { ARTIFACT_STATUSES } from '@/types';
import type { ArtifactStatus } from '@/types';

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  // Validate ids
  if (!Array.isArray(body.ids) || (body.ids as unknown[]).length === 0) {
    return NextResponse.json(
      { error: 'ids must be a non-empty array' },
      { status: 400 }
    );
  }
  if ((body.ids as unknown[]).length > MAX_BULK_IDS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BULK_IDS} items per bulk operation` },
      { status: 400 }
    );
  }
  if (
    !(body.ids as unknown[]).every(
      (id) => typeof id === 'string' && (id as string).trim().length > 0
    )
  ) {
    return NextResponse.json(
      { error: 'All ids must be non-empty strings' },
      { status: 400 }
    );
  }
  const ids = body.ids as string[];

  try {
    switch (body.action) {
      case 'status_change': {
        if (!ARTIFACT_STATUSES.includes(body.targetStatus as ArtifactStatus)) {
          return NextResponse.json(
            { error: `targetStatus must be one of: ${ARTIFACT_STATUSES.join(', ')}` },
            { status: 400 }
          );
        }
        const result = await bulkStatusChange(
          ids,
          body.targetStatus as ArtifactStatus,
          auth.id
        );
        return NextResponse.json({ result });
      }

      case 'campaign_reassign': {
        if (
          typeof body.campaignId !== 'string' ||
          !(body.campaignId as string).trim()
        ) {
          return NextResponse.json(
            { error: 'campaignId must be a non-empty string' },
            { status: 400 }
          );
        }
        const result = await bulkCampaignReassign(ids, body.campaignId as string);
        return NextResponse.json({ result });
      }

      case 'add_tags': {
        if (!Array.isArray(body.tags)) {
          return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
        }
        const tags = normalizeBulkTags(body.tags as unknown[]);
        if (tags.length === 0) {
          return NextResponse.json(
            { error: 'No valid tags provided after normalization' },
            { status: 400 }
          );
        }
        const result = await bulkAddTags(ids, tags);
        return NextResponse.json({ result });
      }

      case 'remove_tags': {
        if (!Array.isArray(body.tags)) {
          return NextResponse.json({ error: 'tags must be an array' }, { status: 400 });
        }
        const tags = normalizeBulkTags(body.tags as unknown[]);
        if (tags.length === 0) {
          return NextResponse.json(
            { error: 'No valid tags provided after normalization' },
            { status: 400 }
          );
        }
        const result = await bulkRemoveTags(ids, tags);
        return NextResponse.json({ result });
      }

      case 'archive': {
        const result = await bulkArchive(ids, auth.id);
        return NextResponse.json({ result });
      }

      default:
        return NextResponse.json(
          {
            error:
              'Unknown action. Must be one of: status_change, campaign_reassign, add_tags, remove_tags, archive',
          },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Bulk operation failed') },
      { status: 500 }
    );
  }
}
