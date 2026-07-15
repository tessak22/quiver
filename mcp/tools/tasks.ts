import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
} from '@/lib/db/tasks';
import { text, error } from '../lib/response.js';
import type { TaskStatus, TaskPriority } from '@/types';

// Statuses an agent is allowed to move a task INTO via update_task.
// Promotion into the queue (proposed -> todo) and final sign-off (-> approved)
// are human-only gates, performed from the dashboard.
const AGENT_ALLOWED_STATUSES = ['in_progress', 'blocked', 'done'] as const;

export function registerTaskTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_tasks
  // -----------------------------------------------------------------------
  server.tool(
    'list_tasks',
    'List tasks (to-dos). Optionally filter by status and/or campaign.',
    {
      status: z
        .enum(['proposed', 'todo', 'in_progress', 'blocked', 'done', 'approved'])
        .optional()
        .describe('Filter by task status'),
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
    },
    async ({ status, campaign_id }) => {
      try {
        const tasks = await getTasks({
          status: status as TaskStatus | undefined,
          campaignId: campaign_id,
        });
        return text(JSON.stringify(tasks, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_tasks error:', err);
        return error(err instanceof Error ? err.message : 'Failed to list tasks');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_task
  // -----------------------------------------------------------------------
  server.tool(
    'get_task',
    'Get full details for a specific task.',
    {
      task_id: z.string().describe('Task ID'),
    },
    async ({ task_id }) => {
      try {
        const task = await getTask(task_id);
        if (!task) {
          return error(`No task found with ID '${task_id}'.`);
        }
        return text(JSON.stringify(task, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_task error:', err);
        return error(err instanceof Error ? err.message : 'Failed to fetch task');
      }
    }
  );

  // -----------------------------------------------------------------------
  // create_task
  //
  // Agent-created tasks are ALWAYS proposed and marked as agent-authored.
  // A human must approve them into the queue (proposed -> todo) from the
  // dashboard before work begins.
  // -----------------------------------------------------------------------
  server.tool(
    'create_task',
    'Propose a new task. Agent-created tasks always land as "proposed" and must be approved into the queue by a human via the dashboard.',
    {
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Task description'),
      priority: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .default('medium')
        .describe('Task priority'),
      due_date: z.string().optional().describe('Due date (ISO format)'),
      campaign_id: z.string().optional().describe('Linked campaign ID'),
      content_piece_id: z.string().optional().describe('Linked content piece ID'),
      artifact_id: z.string().optional().describe('Linked artifact ID'),
    },
    async ({ title, description, priority, due_date, campaign_id, content_piece_id, artifact_id }) => {
      try {
        const task = await createTask({
          title,
          description,
          priority: priority as TaskPriority,
          dueDate: due_date,
          campaignId: campaign_id,
          contentPieceId: content_piece_id,
          artifactId: artifact_id,
          // Enforced regardless of input — agents propose, humans approve.
          createdBy: 'agent',
          status: 'proposed',
        });
        return text(JSON.stringify(task, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] create_task error:', err);
        return error(err instanceof Error ? err.message : 'Failed to create task');
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_task
  //
  // Approval gates: an agent may only move status among
  // in_progress / blocked / done. Promoting proposed -> todo and signing off
  // (-> approved) are human-only actions performed from the dashboard.
  // -----------------------------------------------------------------------
  server.tool(
    'update_task',
    'Update a task. An agent may move status among in_progress, blocked, and done. Promoting a proposed task to "todo" and approving a done task are human-only actions via the dashboard.',
    {
      task_id: z.string().describe('Task ID'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      status: z
        .enum(['proposed', 'todo', 'in_progress', 'blocked', 'done', 'approved'])
        .optional()
        .describe('New status (in_progress, blocked, done allowed for agents)'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
      due_date: z.string().optional().describe('New due date (ISO format)'),
      assignee: z.string().optional().describe('New assignee'),
      campaign_id: z.string().optional().describe('Linked campaign ID'),
      content_piece_id: z.string().optional().describe('Linked content piece ID'),
      artifact_id: z.string().optional().describe('Linked artifact ID'),
    },
    async ({ task_id, title, description, status, priority, due_date, assignee, campaign_id, content_piece_id, artifact_id }) => {
      try {
        const existing = await getTask(task_id);
        if (!existing) {
          return error(`No task found with ID '${task_id}'.`);
        }

        // Enforce human-only approval gates.
        if (status !== undefined) {
          if (status === 'approved') {
            return error(
              'Approving a task is human-only. A human must approve it from the dashboard.'
            );
          }
          if (status === 'todo' || status === 'proposed') {
            return error(
              'Promoting a task into the queue (proposed -> todo) is human-only. A human must approve it from the dashboard.'
            );
          }
          if (!AGENT_ALLOWED_STATUSES.includes(status as (typeof AGENT_ALLOWED_STATUSES)[number])) {
            return error(
              `Agents may only set status to: ${AGENT_ALLOWED_STATUSES.join(', ')}.`
            );
          }
        }

        const task = await updateTask(task_id, {
          title,
          description,
          status: status as TaskStatus | undefined,
          priority: priority as TaskPriority | undefined,
          dueDate: due_date,
          assignee,
          campaignId: campaign_id,
          contentPieceId: content_piece_id,
          artifactId: artifact_id,
        });
        return text(JSON.stringify(task, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_task error:', err);
        return error(err instanceof Error ? err.message : 'Failed to update task');
      }
    }
  );

  // -----------------------------------------------------------------------
  // complete_task
  //
  // Marks a task done. Requires a deliverable — either the task already has a
  // contentPieceId/artifactId, or one is passed in with this call.
  // -----------------------------------------------------------------------
  server.tool(
    'complete_task',
    'Mark a task as done. Requires an attached deliverable (a content piece or artifact) — pass one if the task does not already have it.',
    {
      task_id: z.string().describe('Task ID'),
      content_piece_id: z.string().optional().describe('Content piece deliverable to attach'),
      artifact_id: z.string().optional().describe('Artifact deliverable to attach'),
    },
    async ({ task_id, content_piece_id, artifact_id }) => {
      try {
        const existing = await getTask(task_id);
        if (!existing) {
          return error(`No task found with ID '${task_id}'.`);
        }

        const contentPieceId = content_piece_id ?? existing.contentPieceId;
        const artifactId = artifact_id ?? existing.artifactId;

        if (!contentPieceId && !artifactId) {
          return error(
            'attach a deliverable (contentPieceId or artifactId) before completing'
          );
        }

        const task = await updateTask(task_id, {
          status: 'done',
          contentPieceId: content_piece_id,
          artifactId: artifact_id,
        });
        return text(JSON.stringify(task, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] complete_task error:', err);
        return error(err instanceof Error ? err.message : 'Failed to complete task');
      }
    }
  );
}
