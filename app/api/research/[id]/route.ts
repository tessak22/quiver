import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getResearchEntry,
  updateResearchEntry,
  deleteResearchEntry,
} from '@/lib/db/research';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const entry = await getResearchEntry(params.id);

    if (!entry) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch research entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const existing = await getResearchEntry(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

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
    if (typeof body.researchDate === 'string') {
      const d = new Date(body.researchDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Invalid researchDate format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      updateData.researchDate = d;
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
    const message = err instanceof Error ? err.message : 'Failed to update research entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const existing = await getResearchEntry(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Research entry not found' }, { status: 404 });
    }

    await deleteResearchEntry(params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete research entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
