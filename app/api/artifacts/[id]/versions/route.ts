import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getArtifactVersions, createArtifactVersion } from '@/lib/db/artifacts';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const versions = await getArtifactVersions(params.id);
  return NextResponse.json({ versions });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { title, content } = body;

  if (!title || !content) {
    return NextResponse.json({ error: 'Title and content required' }, { status: 400 });
  }

  const version = await createArtifactVersion(params.id, {
    title,
    content,
    createdBy: user.id,
  });

  return NextResponse.json({ version });
}
