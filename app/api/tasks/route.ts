import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getTasks, createTask } from '@/lib/db/tasks';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_CREATORS } from '@/types';
import type { TaskStatus, TaskPriority, TaskCreator } from '@/types';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') as TaskStatus | null;
  const campaignId = url.searchParams.get('campaignId');

  if (status && !TASK_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }

  try {
    const tasks = await getTasks({
      status: status ?? undefined,
      campaignId: campaignId ?? undefined,
    });

    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch tasks') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

  // Validate required fields
  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
  }

  // Validate status if provided (the API/human may set any valid status)
  if (body.status && !TASK_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
  }

  // Validate priority if provided
  if (body.priority && !TASK_PRIORITIES.includes(body.priority as TaskPriority)) {
    return NextResponse.json({ error: 'Invalid task priority' }, { status: 400 });
  }

  // Validate createdBy if provided
  if (body.createdBy && !TASK_CREATORS.includes(body.createdBy as TaskCreator)) {
    return NextResponse.json({ error: 'Invalid task creator' }, { status: 400 });
  }

  // Validate due date if provided
  if (body.dueDate !== undefined && body.dueDate !== null) {
    const parsed = parseISODate(body.dueDate);
    if (!parsed) return NextResponse.json({ error: 'Invalid dueDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
    body.dueDate = parsed.toISOString();
  }

  try {
    const task = await createTask({
      title: (body.title as string).trim(),
      description: body.description as string | undefined ?? undefined,
      status: (body.status as TaskStatus) ?? 'todo',
      priority: (body.priority as TaskPriority) ?? 'medium',
      dueDate: body.dueDate as string | undefined ?? undefined,
      assignee: body.assignee as string | undefined ?? undefined,
      // Humans creating via the dashboard/API author as 'human' by default.
      createdBy: (body.createdBy as TaskCreator) ?? 'human',
      campaignId: body.campaignId as string | undefined ?? undefined,
      contentPieceId: body.contentPieceId as string | undefined ?? undefined,
      artifactId: body.artifactId as string | undefined ?? undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create task') },
      { status: 500 }
    );
  }
}
