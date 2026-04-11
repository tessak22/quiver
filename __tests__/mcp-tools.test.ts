/**
 * Tests for MCP tool registration — verifies all 23 tools are registered
 * with correct names and that the server builds without errors.
 *
 * Does NOT test database interactions (those are thin wrappers around
 * lib/db functions which are tested via integration tests).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock @prisma/client to avoid DB connection during tool registration
vi.mock('@prisma/client', () => {
  class MockPrismaClient {}
  return {
    PrismaClient: MockPrismaClient,
    Prisma: { AnyNull: null, DbNull: null, InputJsonValue: null },
  };
});

// Mock Anthropic SDK to avoid API key requirement
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {}
  return { default: MockAnthropic };
});

// Capture tool registrations
const registeredTools: string[] = [];

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    tool(...args: unknown[]) {
      registeredTools.push(args[0] as string);
    }
    connect() {}
  }
  return { McpServer: MockMcpServer };
});

// The expected complete list of 23 MCP tools from the issue spec
const EXPECTED_TOOLS = [
  // Context tools (5)
  'get_context',
  'get_context_history',
  'propose_context_update',
  'apply_context_update',
  'restore_context_version',
  // Campaign tools (5)
  'list_campaigns',
  'get_campaign',
  'create_campaign',
  'update_campaign',
  'update_campaign_status',
  // Artifact tools (5)
  'list_artifacts',
  'get_artifact',
  'save_artifact',
  'update_artifact',
  'update_artifact_status',
  // Session tools (2)
  'list_sessions',
  'get_session',
  // Performance tools (5)
  'log_performance',
  'get_performance_log',
  'get_close_the_loop_queue',
  'list_proposals',
  'action_proposal',
  // Workspace tools (1)
  'get_dashboard_summary',
] as const;

describe('MCP tool registration', () => {
  beforeAll(async () => {
    registeredTools.length = 0;

    const { registerContextTools } = await import('@/mcp/tools/context');
    const { registerCampaignTools } = await import('@/mcp/tools/campaigns');
    const { registerArtifactTools } = await import('@/mcp/tools/artifacts');
    const { registerSessionTools } = await import('@/mcp/tools/sessions');
    const { registerPerformanceTools } = await import('@/mcp/tools/performance');
    const { registerWorkspaceTools } = await import('@/mcp/tools/workspace');

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const server = new McpServer({ name: 'test', version: '0.0.0' });

    registerContextTools(server);
    registerCampaignTools(server);
    registerArtifactTools(server);
    registerSessionTools(server);
    registerPerformanceTools(server);
    registerWorkspaceTools(server);
  });

  it('registers exactly 23 tools', () => {
    expect(registeredTools).toHaveLength(23);
  });

  it('registers all expected tools', () => {
    for (const tool of EXPECTED_TOOLS) {
      expect(registeredTools).toContain(tool);
    }
  });

  it('has no unexpected tools', () => {
    for (const tool of registeredTools) {
      expect(EXPECTED_TOOLS).toContain(tool);
    }
  });

  it('has no duplicate tool names', () => {
    const unique = new Set(registeredTools);
    expect(unique.size).toBe(registeredTools.length);
  });

  it('uses snake_case for all tool names', () => {
    for (const tool of registeredTools) {
      expect(tool).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
