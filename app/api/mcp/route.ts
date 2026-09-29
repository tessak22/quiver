/**
 * Remote MCP HTTP endpoint — app/api/mcp/route.ts
 *
 * Exposes all Quiver tools over the MCP Streamable HTTP transport, making
 * them accessible to Claude browser Custom Connectors and any MCP client
 * that supports HTTP (not just local stdio clients like Claude Desktop).
 *
 * Connector URL (once deployed): https://<your-domain>/api/mcp
 *
 * Reads:  All lib/db/* modules via the mcp/tools/* registration functions.
 * Produces: MCP Streamable HTTP responses for GET, POST, and DELETE.
 *
 * Edge cases:
 *   - Stateless mode: each request creates a fresh server + transport.
 *     No shared in-memory session state between requests — compatible with
 *     Vercel serverless where instances don't share memory across invocations.
 *   - Auth: set MCP_AUTH_SECRET in env for Bearer token protection. Omit the
 *     env var to allow unauthenticated access (useful on localhost or inside
 *     a private VPC). Claude browser connectors send the token automatically
 *     once configured.
 *   - Timeout: maxDuration 60 s covers all read tools comfortably. Upgrade to
 *     Vercel Pro and raise maxDuration to 300 if heavy write tools time out.
 */

import { NextResponse } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { safeErrorMessage } from '@/lib/utils';

// Tool registration functions live in mcp/tools/ (excluded from root tsconfig
// to keep the stdio build separate), but tsc resolves explicit imports even
// across the exclude boundary, and Next.js webpack follows the same path.
import { registerContextTools } from '@/mcp/tools/context';
import { registerCampaignTools } from '@/mcp/tools/campaigns';
import { registerArtifactTools } from '@/mcp/tools/artifacts';
import { registerSessionTools } from '@/mcp/tools/sessions';
import { registerPerformanceTools } from '@/mcp/tools/performance';
import { registerWorkspaceTools } from '@/mcp/tools/workspace';
import { registerResearchTools } from '@/mcp/tools/research';
import { registerContentTools } from '@/mcp/tools/content';
import { timingSafeEqual } from 'node:crypto';

// Prisma requires the Node.js runtime (no Edge runtime support).
export const runtime = 'nodejs';

// Adjust to match your Vercel plan: 60 s (Hobby) or up to 300 s (Pro).
export const maxDuration = 60;

/** Build a fresh McpServer with all 34 Quiver tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'quiver', version: '1.0.0' });

  registerContextTools(server);
  registerCampaignTools(server);
  registerArtifactTools(server);
  registerSessionTools(server);
  registerPerformanceTools(server);
  registerWorkspaceTools(server);
  registerResearchTools(server);
  registerContentTools(server);

  return server;
}

/**
 * Returns true when the request passes authentication.
 *
 * This endpoint exposes the whole tool surface, including `delete_artifact`,
 * `delete_campaign`, `delete_content`, `delete_session`, `delete_quote` and
 * `apply_context_update`. It is also in PUBLIC_ROUTES, so the session gate
 * never sees it — this function is the only thing in front of it.
 *
 * So an unset MCP_AUTH_SECRET is refused in production rather than waved
 * through. It used to return true, which meant the Deploy to Vercel path in
 * the README produced a public URL with an anonymous read, write and delete
 * API on it, and nothing said so at the moment it mattered.
 *
 * Development is unchanged: with no secret set, localhost still works, because
 * requiring one there would only teach people to paste a secret into a config
 * they are about to throw away.
 */
function isAuthenticated(request: Request): boolean {
  const secret = process.env.MCP_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const spaceIdx = authHeader.indexOf(' ');
  if (spaceIdx === -1) return false;

  const scheme = authHeader.slice(0, spaceIdx);
  const token = authHeader.slice(spaceIdx + 1);
  if (scheme !== 'Bearer') return false;

  // Constant-time: a length-dependent early exit leaks the secret a character
  // at a time to anyone who can time the responses.
  return timingSafeEqualString(token, secret);
}

/** Compares two strings without leaking their contents through timing. */
function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still compare, so the work does not depend on whether lengths matched.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

async function handleRequest(request: Request): Promise<Response> {
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        hint: process.env.MCP_AUTH_SECRET
          ? 'Set Authorization: Bearer <MCP_AUTH_SECRET> in your connector config.'
          : 'MCP_AUTH_SECRET is not set on this deployment. Set it, redeploy, then send it as a Bearer token.',
      },
      { status: 401 },
    );
  }

  try {
    const server = createMcpServer();

    // Stateless mode (sessionIdGenerator: undefined): no session ID is issued
    // and no session state is retained between requests. Required for Vercel
    // serverless where each invocation may run on a different instance.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to process MCP request') },
      { status: 500 },
    );
  }
}

// The MCP Streamable HTTP spec uses POST for JSON-RPC messages,
// GET for optional SSE streams, and DELETE to close sessions.
export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
