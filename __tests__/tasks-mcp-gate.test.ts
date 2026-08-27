/**
 * Tests for the tasks MCP approval gate — mcp/tools/tasks.ts
 *
 * Agents propose tasks; humans approve them into the queue and sign them off.
 * These tests verify the gate an agent hits through the MCP tools:
 *
 *   - create_task always forces createdBy='agent' and status='proposed',
 *     regardless of input.
 *   - update_task refuses to set a human-only target status (proposed, todo,
 *     approved).
 *   - update_task refuses to act on a task whose EXISTING status is proposed
 *     (not yet promoted) or approved (signed off, human-only).
 *   - update_task succeeds moving an in_progress task to done/blocked.
 *   - complete_task requires a deliverable and respects the existing-status gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP server so we can capture and invoke the registered handlers.
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    handlers = new Map<string, (args: unknown) => unknown>();
    tool(name: string, _desc: string, _schema: unknown, handler: (args: unknown) => unknown) {
      this.handlers.set(name, handler);
    }
  }
  return { McpServer: MockMcpServer };
});

vi.mock('@/lib/db/tasks', () => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('../mcp/lib/response.js', () => ({
  text: (content: string) => ({ content: [{ type: 'text', text: content }] }),
  error: (message: string) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
  }),
}));

import { registerTaskTools } from '@/mcp/tools/tasks';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTask, createTask, updateTask } from '@/lib/db/tasks';

type ToolResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

type MockServer = InstanceType<typeof McpServer> & {
  handlers: Map<string, (args: unknown) => Promise<ToolResult>>;
};

const getTaskMock = getTask as unknown as ReturnType<typeof vi.fn>;
const createTaskMock = createTask as unknown as ReturnType<typeof vi.fn>;
const updateTaskMock = updateTask as unknown as ReturnType<typeof vi.fn>;

function getHandlers(): Map<string, (args: unknown) => Promise<ToolResult>> {
  const server = new McpServer({ name: 'test', version: '0.0.0' }) as MockServer;
  registerTaskTools(server);
  return server.handlers;
}

function getHandler(name: string): (args: unknown) => Promise<ToolResult> {
  const handler = getHandlers().get(name);
  if (!handler) throw new Error(`${name} handler not registered`);
  return handler;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Draft the changelog',
    description: null,
    status: 'in_progress',
    priority: 'medium',
    dueDate: null,
    assignee: null,
    createdBy: 'agent',
    campaignId: null,
    contentPieceId: null,
    artifactId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('tasks MCP approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // create_task
  // -----------------------------------------------------------------------
  describe('create_task', () => {
    it('forces createdBy=agent and status=proposed regardless of input', async () => {
      createTaskMock.mockResolvedValue(makeTask({ status: 'proposed' }));

      const handler = getHandler('create_task');
      // Attempt to sneak in a privileged status/creator via input.
      const result = await handler({
        title: 'Sneaky task',
        status: 'approved',
        createdBy: 'human',
      });

      expect(result.isError).not.toBe(true);
      expect(createTaskMock).toHaveBeenCalledTimes(1);
      const arg = createTaskMock.mock.calls[0][0];
      expect(arg.createdBy).toBe('agent');
      expect(arg.status).toBe('proposed');
      expect(arg.title).toBe('Sneaky task');
    });
  });

  // -----------------------------------------------------------------------
  // update_task — target-status gate
  // -----------------------------------------------------------------------
  describe('update_task target-status gate', () => {
    it.each(['approved', 'todo', 'proposed'] as const)(
      'returns an error when target status is %s',
      async (target) => {
        getTaskMock.mockResolvedValue(makeTask({ status: 'in_progress' }));

        const handler = getHandler('update_task');
        const result = await handler({ task_id: 'task-1', status: target });

        expect(result.isError).toBe(true);
        expect(updateTaskMock).not.toHaveBeenCalled();
      }
    );

    it('succeeds moving an in_progress task to done', async () => {
      getTaskMock.mockResolvedValue(makeTask({ status: 'in_progress' }));
      updateTaskMock.mockResolvedValue(makeTask({ status: 'done' }));

      const handler = getHandler('update_task');
      const result = await handler({ task_id: 'task-1', status: 'done' });

      expect(result.isError).not.toBe(true);
      expect(updateTaskMock).toHaveBeenCalledTimes(1);
      expect(updateTaskMock.mock.calls[0][1].status).toBe('done');
    });

    it('succeeds moving an in_progress task to blocked', async () => {
      getTaskMock.mockResolvedValue(makeTask({ status: 'in_progress' }));
      updateTaskMock.mockResolvedValue(makeTask({ status: 'blocked' }));

      const handler = getHandler('update_task');
      const result = await handler({ task_id: 'task-1', status: 'blocked' });

      expect(result.isError).not.toBe(true);
      expect(updateTaskMock).toHaveBeenCalledTimes(1);
      expect(updateTaskMock.mock.calls[0][1].status).toBe('blocked');
    });
  });

  // -----------------------------------------------------------------------
  // update_task — existing-status gate (Fix 1)
  // -----------------------------------------------------------------------
  describe('update_task existing-status gate', () => {
    it.each(['proposed', 'approved'] as const)(
      'returns an error when the existing task status is %s',
      async (existingStatus) => {
        getTaskMock.mockResolvedValue(makeTask({ status: existingStatus }));

        const handler = getHandler('update_task');
        // Even a benign field-only update must be refused on a gated task.
        const result = await handler({ task_id: 'task-1', title: 'New title' });

        expect(result.isError).toBe(true);
        expect(updateTaskMock).not.toHaveBeenCalled();
      }
    );

    it('returns an error for a not-found task', async () => {
      getTaskMock.mockResolvedValue(null);

      const handler = getHandler('update_task');
      const result = await handler({ task_id: 'missing', status: 'done' });

      expect(result.isError).toBe(true);
      expect(updateTaskMock).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // complete_task
  // -----------------------------------------------------------------------
  describe('complete_task', () => {
    it('errors when the task has no deliverable and none is passed', async () => {
      getTaskMock.mockResolvedValue(
        makeTask({ status: 'in_progress', contentPieceId: null, artifactId: null })
      );

      const handler = getHandler('complete_task');
      const result = await handler({ task_id: 'task-1' });

      expect(result.isError).toBe(true);
      expect(updateTaskMock).not.toHaveBeenCalled();
    });

    it('succeeds when a content_piece_id is passed', async () => {
      getTaskMock.mockResolvedValue(
        makeTask({ status: 'in_progress', contentPieceId: null, artifactId: null })
      );
      updateTaskMock.mockResolvedValue(makeTask({ status: 'done', contentPieceId: 'cp-1' }));

      const handler = getHandler('complete_task');
      const result = await handler({ task_id: 'task-1', content_piece_id: 'cp-1' });

      expect(result.isError).not.toBe(true);
      expect(updateTaskMock).toHaveBeenCalledTimes(1);
      expect(updateTaskMock.mock.calls[0][1].status).toBe('done');
    });

    it('succeeds when the task already has an attached contentPieceId', async () => {
      getTaskMock.mockResolvedValue(
        makeTask({ status: 'in_progress', contentPieceId: 'cp-existing', artifactId: null })
      );
      updateTaskMock.mockResolvedValue(makeTask({ status: 'done', contentPieceId: 'cp-existing' }));

      const handler = getHandler('complete_task');
      const result = await handler({ task_id: 'task-1' });

      expect(result.isError).not.toBe(true);
      expect(updateTaskMock).toHaveBeenCalledTimes(1);
    });

    it.each(['proposed', 'approved'] as const)(
      'errors when the existing status is %s',
      async (existingStatus) => {
        getTaskMock.mockResolvedValue(
          makeTask({ status: existingStatus, contentPieceId: 'cp-1' })
        );

        const handler = getHandler('complete_task');
        const result = await handler({ task_id: 'task-1', content_piece_id: 'cp-1' });

        expect(result.isError).toBe(true);
        expect(updateTaskMock).not.toHaveBeenCalled();
      }
    );
  });
});
