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
 *     Before adding one, confirm its handler and every lib/db helper it calls
 *     only read. If it writes anything, rename it instead: the get_ and list_
 *     prefixes mean read-only in this codebase.
 */

import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

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

type RegisterFn = (name: string, ...rest: unknown[]) => RegisteredTool;

/** Wraps a registration method so tools outside `allowed` are removed at once. */
function allowOnly(register: RegisterFn, allowed: ReadonlySet<string>): RegisterFn {
  return (name, ...rest) => {
    const registered = register(name, ...rest);
    if (!allowed.has(name)) registered.remove();
    return registered;
  };
}

/**
 * Makes `server.tool()` and `server.registerTool()` drop every tool whose name
 * is not in `allowed`.
 *
 * Call it before the register*Tools functions run. Each tool is registered
 * and then removed straight away, so callers still get a real RegisteredTool
 * back. A removed tool is absent from tools/list, and the SDK rejects a
 * tools/call for it, so this narrows both listing and calling. The route's
 * 403 pre-check is the other layer, and covers any registration path this
 * does not wrap.
 */
export function restrictToolRegistration(
  server: McpServer,
  allowed: ReadonlySet<string>,
): McpServer {
  server.tool = allowOnly(server.tool.bind(server) as RegisterFn, allowed) as McpServer['tool'];
  server.registerTool = allowOnly(
    server.registerTool.bind(server) as RegisterFn,
    allowed,
  ) as McpServer['registerTool'];
  return server;
}
