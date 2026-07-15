'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from '@/types';
import type { TaskStatus, TaskPriority } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: string | null;
  createdBy: string;
  campaignId: string | null;
  contentPieceId: string | null;
  artifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<TaskStatus, string> = {
  proposed: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  approved: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

// Board columns, left to right through the workflow.
const BOARD_COLUMNS: TaskStatus[] = [...TASK_STATUSES];

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function formatShortDate(dateStr: string): string {
  return shortDateFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Quick-create form state
// ---------------------------------------------------------------------------

interface CreateFormState {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
}

const INITIAL_FORM: CreateFormState = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
};

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onPromote,
  onApprove,
  busy,
}: {
  task: TaskRecord;
  onPromote: (id: string) => void;
  onApprove: (id: string) => void;
  busy: boolean;
}) {
  const status = task.status as TaskStatus;

  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
          >
            {TASK_STATUS_LABELS[status]}
          </span>
          {task.priority !== 'medium' && (
            <Badge variant="outline" className="text-xs">
              {TASK_PRIORITY_LABELS[task.priority as TaskPriority]}
            </Badge>
          )}
          {task.createdBy === 'agent' && (
            <Badge variant="secondary" className="text-xs">
              Agent
            </Badge>
          )}
        </div>

        <p className="mt-1.5 font-medium">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          {task.dueDate ? (
            <span>Due {formatShortDate(task.dueDate)}</span>
          ) : (
            <span>Updated {formatShortDate(task.updatedAt)}</span>
          )}
        </div>

        {/* Human-only approval actions */}
        {status === 'proposed' && (
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => onPromote(task.id)}
          >
            Approve to To Do
          </Button>
        )}
        {status === 'done' && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => onApprove(task.id)}
          >
            Approve
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to load tasks');
      }

      const data: { tasks: TaskRecord[] } = await res.json();
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Status change via PATCH (human-only gates: proposed -> todo, done -> approved)
  const patchStatus = useCallback(
    async (id: string, status: TaskStatus) => {
      setActionBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const data: { error?: string } = await res.json();
          throw new Error(data.error ?? 'Failed to update task');
        }
        await fetchTasks();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update task');
      } finally {
        setActionBusy(false);
      }
    },
    [fetchTasks]
  );

  // Create task handler
  async function handleCreate() {
    if (!createForm.title.trim()) {
      setCreateError('Task title is required');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          priority: createForm.priority,
          dueDate: createForm.dueDate || undefined,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to create task');
      }

      setCreateForm(INITIAL_FORM);
      setCreateOpen(false);
      fetchTasks();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track work items. Agents propose tasks; you approve them into the queue.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New Task</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>
                Add a task to the queue. Tasks you create here start as &ldquo;To Do&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="task-title">Title *</Label>
                <Input
                  id="task-title"
                  placeholder="e.g. Draft the launch changelog"
                  value={createForm.title}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  placeholder="Add any detail or acceptance criteria..."
                  rows={3}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="task-priority">Priority</Label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(value) =>
                      setCreateForm((prev) => ({ ...prev, priority: value as TaskPriority }))
                    }
                  >
                    <SelectTrigger id="task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {TASK_PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-due">Due Date</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Task'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading tasks...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No tasks yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Create your first task, or let an agent propose one for you to approve.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              Create your first task
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Board */}
      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {BOARD_COLUMNS.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {TASK_STATUS_LABELS[status]}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {columnTasks.length}
                  </Badge>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {columnTasks.length === 0 && (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      None
                    </div>
                  )}
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      busy={actionBusy}
                      onPromote={(id) => patchStatus(id, 'todo')}
                      onApprove={(id) => patchStatus(id, 'approved')}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
