/**
 * Read-only MCP tool allowlist (mcp/lib/read-only-tools.ts)
 *
 * What it does: names the tools a read-only MCP caller may see and call, and
 * provides a helper that stops every other tool from being registered on a
 * server instance.
 *
 * Reads: nothing. Produces: a frozen set of tool names and a registration
 * filter used by app/api/mcp/route.ts for the MCP_READONLY_SECRET role.
 *
 * Edge cases:
 *   - The list is explicit on purpose. A prefix match would let any future
 *     tool named get_* or list_* through, even one that writes. Adding a tool
 *     here is a decision that it has no side effects.
 *   - __tests__/mcp-read-only-tools.test.ts fails when a registered get_* or
 *     list_* tool is missing from this list, so a new read tool gets a review.
 *     If a new tool with that prefix writes anything, rename it instead.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  // Context
  'get_context',
  'get_context_history',
  // Campaigns
  'list_campaigns',
  'get_campaign',
  // Artifacts
  'list_artifacts',
  'get_artifact',
  // Sessions
  'list_sessions',
  'get_session',
  // Performance
  'get_performance_log',
  'get_close_the_loop_queue',
  // Workspace
  'get_dashboard_summary',
  // Research
  'list_research_entries',
  'get_research_entry',
  'list_quotes',
  'list_proposals',
  'get_linear_payload',
  // Content
  'list_content',
  'get_content',
  'get_content_calendar',
  'get_content_metrics',
]);

/**
 * Makes `server.tool()` skip every tool whose name is not in `allowed`.
 *
 * Call it before the register*Tools functions run. Tools that are never
 * registered are absent from tools/list, and the SDK rejects a tools/call for
 * them, so this narrows both listing and calling.
 */
export function restrictToolRegistration(
  server: McpServer,
  allowed: ReadonlySet<string>,
): McpServer {
  const register = server.tool.bind(server) as (...args: unknown[]) => unknown;
  const filtered = (...args: unknown[]): unknown =>
    typeof args[0] === 'string' && allowed.has(args[0]) ? register(...args) : undefined;
  server.tool = filtered as McpServer['tool'];
  return server;
}
