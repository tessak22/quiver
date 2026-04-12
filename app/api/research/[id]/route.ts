import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import {
  getResearchEntry,
  updateResearchEntry,
  deleteResearchEntry,
} from '@/lib/db/research';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const entry = await getResearchEntry(params.id);

    if (!entry) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch research entry') },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getResearchEntry(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    // Only allow metadata updates, NOT rawNotes
    const updateData: {
      title?: string;
      contactName?: string;
      contactCompany?: string;
      contactSegment?: string;
      contactStage?: string;
      researchDate?: Date;
      productSignal?: boolean;
      productNote?: string;
      campaignId?: string;
    } = {};

    if (typeof body.title === 'string' && body.title.trim()) {
      updateData.title = body.title.trim();
    }
    if (typeof body.contactName === 'string') {
      updateData.contactName = body.contactName;
    }
    if (typeof body.contactCompany === 'string') {
      updateData.contactCompany = body.contactCompany;
    }
    if (typeof body.contactSegment === 'string') {
      updateData.contactSegment = body.contactSegment;
    }
    if (typeof body.contactStage === 'string') {
      updateData.contactStage = body.contactStage;
    }
    if (body.researchDate !== undefined) {
      const parsed = parseISODate(body.researchDate);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid researchDate format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      updateData.researchDate = parsed;
    }
    if (typeof body.productSignal === 'boolean') {
      updateData.productSignal = body.productSignal;
    }
    if (typeof body.productNote === 'string') {
      updateData.productNote = body.productNote;
    }
    if (typeof body.campaignId === 'string') {
      updateData.campaignId = body.campaignId;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const entry = await updateResearchEntry(params.id, updateData);

    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update research entry') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getResearchEntry(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    await deleteResearchEntry(params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete research entry') },
      { status: 500 }
    );
  }
}
