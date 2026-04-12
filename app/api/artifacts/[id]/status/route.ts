import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { transitionArtifactStatus, getArtifact } from '@/lib/db/artifacts';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { status } = parsed.data;

  try {
    await transitionArtifactStatus(params.id, status as string, auth.id);
    // Return the full artifact with relations for UI update
    const artifact = await getArtifact(params.id);
    return NextResponse.json({ artifact });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update status') },
      { status: 400 }
    );
  }
}
