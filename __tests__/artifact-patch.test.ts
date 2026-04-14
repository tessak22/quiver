/**
 * Tests for PATCH /api/artifacts/[id] — type and campaign assignment validation.
 *
 * Covers the new fields added in feat/artifact-detail-improvements:
 *   - `type`: must be a member of ARTIFACT_TYPES; any other string returns 400
 *   - `campaignId`: campaign must exist; missing campaign returns 400
 *
 * Also verifies that the existing guard (status changes via PATCH are blocked)
 * still holds alongside the new fields.
 *
 * lib/db/artifacts, @/lib/db (prisma), and @/lib/auth are mocked
 * — no live database or auth in test env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ARTIFACT_TYPES } from '@/types';

// ── Mocks (hoisted before any imports) ──────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user-1', role: 'member' }),
}));

vi.mock('@/lib/db/artifacts', () => ({
  getArtifact: vi.fn(),
  updateArtifact: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    artifact: { update: vi.fn() },
    campaign: { findUnique: vi.fn() },
  },
}));

import { PATCH } from '@/app/api/artifacts/[id]/route';
import { getArtifact, updateArtifact } from '@/lib/db/artifacts';
import { prisma } from '@/lib/db';

const mockGetArtifact = vi.mocked(getArtifact);
const mockUpdateArtifact = vi.mocked(updateArtifact);
const mockCampaignFindUnique = vi.mocked(prisma.campaign.findUnique);

// ── Helpers ───────────────────────────────────────────────────────────────────

const STUB_ARTIFACT = {
  id: 'art-1',
  title: 'Test Artifact',
  type: 'copywriting',
  content: '# Hello',
  status: 'draft',
  tags: [],
  campaignId: 'camp-1',
  skillUsed: null,
  sessionId: null,
  contextVersionId: null,
  version: 1,
  parentArtifactId: null,
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  campaign: { id: 'camp-1', name: 'Campaign One' },
  session: null,
  contextVersion: null,
  performanceLogs: [],
};

function makeRequest(body: unknown, id = 'art-1'): [Request, { params: { id: string } }] {
  return [
    new Request(`http://localhost/api/artifacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/artifacts/[id] — type validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetArtifact.mockResolvedValue(STUB_ARTIFACT as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdateArtifact.mockResolvedValue(STUB_ARTIFACT as any);
  });

  it('returns 400 for an unrecognised type string', async () => {
    const [req, ctx] = makeRequest({ type: 'totally_fake_type' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/invalid artifact type/i);
  });

  it('returns 400 for an empty type string (no valid fields)', async () => {
    const [req, ctx] = makeRequest({ type: '   ' });
    const res = await PATCH(req, ctx);
    // Empty after trim → type block skipped → no valid update fields → 400
    expect(res.status).toBe(400);
  });

  it('accepts every valid ArtifactType value', async () => {
    for (const validType of ARTIFACT_TYPES) {
      vi.clearAllMocks();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockGetArtifact.mockResolvedValue(STUB_ARTIFACT as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUpdateArtifact.mockResolvedValue({ ...STUB_ARTIFACT, type: validType } as any);

      const [req, ctx] = makeRequest({ type: validType });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(mockUpdateArtifact).toHaveBeenCalledWith(
        'art-1',
        expect.objectContaining({ type: validType })
      );
    }
  });

  it('ARTIFACT_TYPES covers all 16 supported types', () => {
    expect(ARTIFACT_TYPES).toHaveLength(16);
  });
});

describe('PATCH /api/artifacts/[id] — campaign assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetArtifact.mockResolvedValue(STUB_ARTIFACT as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdateArtifact.mockResolvedValue(STUB_ARTIFACT as any);
  });

  it('returns 400 when the target campaign does not exist', async () => {
    mockCampaignFindUnique.mockResolvedValue(null);

    const [req, ctx] = makeRequest({ campaignId: 'nonexistent-campaign' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/campaign not found/i);
  });

  it('accepts a valid campaignId and updates the artifact', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCampaignFindUnique.mockResolvedValue({ id: 'camp-2', name: 'Campaign Two' } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdateArtifact.mockResolvedValue({ ...STUB_ARTIFACT, campaignId: 'camp-2' } as any);

    const [req, ctx] = makeRequest({ campaignId: 'camp-2' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    expect(mockUpdateArtifact).toHaveBeenCalledWith(
      'art-1',
      expect.objectContaining({ campaignId: 'camp-2' })
    );
  });
});

describe('PATCH /api/artifacts/[id] — status guard still enforced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetArtifact.mockResolvedValue(STUB_ARTIFACT as any);
  });

  it('returns 400 when status is sent directly (must use /status endpoint)', async () => {
    const [req, ctx] = makeRequest({ status: 'review' });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status/i);
  });
});
