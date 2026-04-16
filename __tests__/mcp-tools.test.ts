/**
 * Tests for MCP tool registration — verifies every tool in EXPECTED_TOOLS
 * is registered with the correct name and that the server builds without errors.
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

// Expected complete list of MCP tools — kept in sync with the eight tool
// module files in mcp/tools/. When you add or remove a tool, update here.
const EXPECTED_TOOLS = [
  // Context tools (5)
  'get_context',
  'get_context_history',
  'propose_context_update',
  'apply_context_update',
  'restore_context_version',
  // Campaign tools (6)
  'list_campaigns',
  'get_campaign',
  'create_campaign',
  'update_campaign',
  'update_campaign_status',
  'delete_campaign',
  // Artifact tools (7)
  'list_artifacts',
  'get_artifact',
  'save_artifact',
  'update_artifact',
  'update_artifact_status',
  'archive_artifact',
  'delete_artifact',
  // Session tools (3)
  'list_sessions',
  'get_session',
  'delete_session',
  // Performance tools (5)
  'log_performance',
  'get_performance_log',
  'get_close_the_loop_queue',
  'list_proposals',
  'action_proposal',
  // Workspace tools (1)
  'get_dashboard_summary',
  // Research tools (9)
  'list_research_entries',
  'get_research_entry',
  'save_research_entry',
  'list_quotes',
  'get_linear_payload',
  'update_research_entry',
  'delete_research_entry',
  'update_quote',
  'delete_quote',
  // Content tools (10)
  'list_content',
  'get_content',
  'save_content',
  'update_content',
  'add_distribution',
  'log_content_metrics',
  'get_content_metrics',
  'get_content_calendar',
  'archive_content',
  'delete_content',
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
    const { registerResearchTools } = await import('@/mcp/tools/research');
    const { registerContentTools } = await import('@/mcp/tools/content');

    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const server = new McpServer({ name: 'test', version: '0.0.0' });

    registerContextTools(server);
    registerCampaignTools(server);
    registerArtifactTools(server);
    registerSessionTools(server);
    registerPerformanceTools(server);
    registerWorkspaceTools(server);
    registerResearchTools(server);
    registerContentTools(server);
  });

  it('registers the expected number of tools', () => {
    expect(registeredTools).toHaveLength(EXPECTED_TOOLS.length);
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
