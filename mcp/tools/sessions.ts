import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSession, getSessions, deleteSession } from '@/lib/db/sessions';
import { text, error } from '../lib/response.js';
import type { SessionMode } from '@/types';

export function registerSessionTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_sessions
  // -----------------------------------------------------------------------
  server.tool(
    'list_sessions',
    'List recent Quiver AI sessions with mode, title, and linked campaign.',
    {
      mode: z
        .enum(['strategy', 'create', 'feedback', 'analyze', 'optimize'])
        .optional()
        .describe('Filter by session mode'),
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of sessions to return'),
    },
    async ({ mode, campaign_id, limit }) => {
      try {
        const sessions = await getSessions({
          mode: mode as SessionMode | undefined,
          campaignId: campaign_id,
        });

        const sliced = sessions.slice(0, limit);
        const summaries = sliced.map((s) => ({
          id: s.id,
          title: s.title,
          mode: s.mode,
          campaign: s.campaign?.name,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
        return text(JSON.stringify(summaries, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_sessions error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to list sessions'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_session
  // -----------------------------------------------------------------------
  server.tool(
    'get_session',
    'Get the full message history and metadata for a specific Quiver session.',
    {
      session_id: z.string().describe('Session ID'),
    },
    async ({ session_id }) => {
      try {
        const session = await getSession(session_id);
        if (!session) {
          return error(`No session found with ID '${session_id}'.`);
        }
        return text(JSON.stringify(session, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_session error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to fetch session'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // delete_session
  // -----------------------------------------------------------------------
  server.tool(
    'delete_session',
    'Permanently delete a session. Attached artifacts survive with their sessionId cleared.',
    {
      session_id: z.string().describe('Session ID to delete'),
    },
    async ({ session_id }) => {
      try {
        const existing = await prisma.session.findUnique({
          where: { id: session_id },
          select: { id: true, title: true },
        });
        if (!existing) {
          return error(`Session '${session_id}' not found.`);
        }

        await deleteSession(session_id);
        return text(`Deleted session '${existing.title ?? session_id}'.`);
      } catch (err) {
        console.error('[quiver-mcp] delete_session error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to delete session'
        );
      }
    }
  );
}
