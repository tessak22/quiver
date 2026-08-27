import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getTask, updateTask, deleteTask } from '@/lib/db/tasks';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/types';
import type { TaskStatus, TaskPriority } from '@/types';

// Valid human status transitions: from -> allowed next states.
// Permissive-but-structured; keeps the dashboard's promote (proposed -> todo)
// and approve (done -> approved) working.
const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  proposed:    ['todo'],
  todo:        ['in_progress', 'blocked', 'done'],
  in_progress: ['todo', 'blocked', 'done'],
  blocked:     ['todo', 'in_progress', 'done'],
  done:        ['approved', 'todo', 'in_progress'],
  approved:    ['todo', 'in_progress'],
};

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const task = await getTask(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch task') },
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
    const existing = await getTask(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    // Validate title if provided
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return NextResponse.json({ error: 'Task title cannot be empty' }, { status: 400 });
      }
      body.title = body.title.trim();
    }

    // The API (human) may perform any status transition allowed by the
    // transition graph, including the human-only gates proposed -> todo and
    // done -> approved. A same-status no-op is not treated as a transition.
    if (body.status !== undefined) {
      if (!TASK_STATUSES.includes(body.status as TaskStatus)) {
        return NextResponse.json({ error: 'Invalid task status' }, { status: 400 });
      }

      const currentStatus = existing.status as TaskStatus;
      const allowedTransitions = TASK_STATUS_TRANSITIONS[currentStatus];
      if (body.status !== currentStatus && !allowedTransitions.includes(body.status as TaskStatus)) {
        return NextResponse.json(
          {
            error: `Cannot transition from "${currentStatus}" to "${body.status}". Allowed: ${allowedTransitions.join(', ') || 'none'}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate priority if provided
    if (body.priority !== undefined && !TASK_PRIORITIES.includes(body.priority as TaskPriority)) {
      return NextResponse.json({ error: 'Invalid task priority' }, { status: 400 });
    }

    // Validate due date if provided
    if (body.dueDate !== undefined && body.dueDate !== null) {
      const parsed = parseISODate(body.dueDate);
      if (!parsed) return NextResponse.json({ error: 'Invalid dueDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
      body.dueDate = parsed.toISOString();
    }

    const task = await updateTask(params.id, {
      title: body.title as string | undefined,
      description: body.description as string | null | undefined,
      status: body.status as TaskStatus | undefined,
      priority: body.priority as TaskPriority | undefined,
      dueDate: body.dueDate as string | null | undefined,
      assignee: body.assignee as string | null | undefined,
      campaignId: body.campaignId as string | null | undefined,
      contentPieceId: body.contentPieceId as string | null | undefined,
      artifactId: body.artifactId as string | null | undefined,
    });

    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update task') },
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
    const existing = await getTask(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await deleteTask(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete task') },
      { status: 500 }
    );
  }
}
