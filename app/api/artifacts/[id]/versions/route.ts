import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getArtifactVersions, createArtifactVersion } from '@/lib/db/artifacts';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const versions = await getArtifactVersions(params.id);
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch versions') },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { title, content } = parsed.data;

  if (!title || !content) {
    return NextResponse.json({ error: 'Title and content required' }, { status: 400 });
  }

  try {
    const version = await createArtifactVersion(params.id, {
      title: title as string,
      content: content as string,
      createdBy: auth.id,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create version') },
      { status: 500 }
    );
  }
}
