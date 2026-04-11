#!/usr/bin/env node

/**
 * Quiver MCP Server — mcp/index.ts
 *
 * Model Context Protocol server that exposes all Quiver functionality as tools.
 * Allows any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf, etc.)
 * to interact with Quiver's data directly without opening the UI.
 *
 * Transport: stdio (standard for local MCP servers)
 * DB access: Imports from lib/db/ — same Prisma client, same schema
 * Auth: DATABASE_URL environment variable (same as main app)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerContextTools } from './tools/context.js';
import { registerCampaignTools } from './tools/campaigns.js';
import { registerArtifactTools } from './tools/artifacts.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerPerformanceTools } from './tools/performance.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerResearchTools } from './tools/research.js';
import { registerContentTools } from './tools/content.js';

const server = new McpServer({
  name: 'quiver',
  version: '1.0.0',
});

// Register all tool groups
registerContextTools(server);
registerCampaignTools(server);
registerArtifactTools(server);
registerSessionTools(server);
registerPerformanceTools(server);
registerWorkspaceTools(server);
registerResearchTools(server);
registerContentTools(server);

// Start stdio transport
const transport = new StdioServerTransport();
try {
  await server.connect(transport);
} catch (err) {
  console.error('[quiver-mcp] Failed to connect transport:', err);
  process.exit(1);
}
