import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getActiveContext,
  getContextVersions,
  applyContextUpdates,
  restoreContextVersion,
} from '@/lib/db/context';
import { createPerformanceLog } from '@/lib/db/performance';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { text, error } from '../lib/response.js';
import { CONTEXT_FIELDS } from '../lib/context-fields.js';

export function registerContextTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // get_context
  // -----------------------------------------------------------------------
  server.tool(
    'get_context',
    'Get the current active product marketing context — positioning, ICP, messaging pillars, competitive landscape, brand voice, customer language.',
    async () => {
      try {
        const context = await getActiveContext();
        if (!context) {
          return error(
            'No active context version found. Complete onboarding at /setup first.'
          );
        }
        return text(JSON.stringify(context, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_context error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to fetch context'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_context_history
  // -----------------------------------------------------------------------
  server.tool(
    'get_context_history',
    'List all previous versions of the product marketing context with version number, change summary, who changed it, and when.',
    {
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of versions to return'),
    },
    async ({ limit }) => {
      try {
        const versions = await getContextVersions();
        const sliced = versions.slice(0, limit);
        const summaries = sliced.map((v) => ({
          id: v.id,
          version: v.version,
          changeSummary: v.changeSummary,
          updateSource: v.updateSource,
          updatedBy: v.updatedBy,
          createdAt: v.createdAt,
        }));
        return text(JSON.stringify(summaries, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_context_history error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to fetch context history'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // propose_context_update
  // -----------------------------------------------------------------------
  server.tool(
    'propose_context_update',
    'Propose updates to one or more fields in the product marketing context. Creates a pending proposal that appears in the Quiver UI for human review before taking effect. Use this when suggesting changes based on observations or analysis — the human reviews and approves in the UI.',
    {
      proposals: z
        .array(
          z.object({
            field: z
              .string()
              .describe(
                "Context field name: 'positioningStatement' | 'icpDefinition' | 'messagingPillars' | 'competitiveLandscape' | 'customerLanguage' | 'proofPoints' | 'activeHypotheses' | 'brandVoice' | 'wordsToUse' | 'wordsToAvoid'"
              ),
            current: z.string().describe("Current value as string (for the reviewer's context)"),
            proposed: z.unknown().describe('Proposed new value (type must match the field)'),
            rationale: z.string().describe('Why this change is being proposed'),
          })
        )
        .describe('Array of field-level proposals'),
      source_note: z
        .string()
        .optional()
        .describe("What triggered this proposal, e.g. 'customer call with Acme 2026-04-11'"),
    },
    async ({ proposals, source_note }) => {
      try {
        // Validate that every proposal field is a known context field
        const invalidFields = proposals
          .map((p) => p.field)
          .filter((f) => !CONTEXT_FIELDS.has(f as never));
        if (invalidFields.length > 0) {
          return error(
            `Invalid context field(s): ${invalidFields.join(', ')}. Valid fields: ${Array.from(CONTEXT_FIELDS).join(', ')}`
          );
        }

        const defaultCampaign = await getDefaultCampaign();
        if (!defaultCampaign) {
          return error(
            'No Unassigned campaign found. Complete onboarding at /setup first.'
          );
        }

        const log = await createPerformanceLog({
          campaignId: defaultCampaign.id,
          logType: 'context_proposal',
          proposedContextUpdates: proposals,
          qualitativeNotes: source_note ?? 'Proposed via MCP',
          recordedBy: 'mcp',
        });

        const fields = proposals.map((p) => p.field).join(', ');
        return text(
          `Proposal created (log ID: ${log.id}).\nFields proposed: ${fields}\nReview and approve at /context in the Quiver UI.`
        );
      } catch (err) {
        console.error('[quiver-mcp] propose_context_update error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to create proposal'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // apply_context_update
  // -----------------------------------------------------------------------
  server.tool(
    'apply_context_update',
    'Immediately apply one or more field updates to the product marketing context, creating a new context version. This takes effect right away with no approval step — use only when the user has explicitly told you what to change. For AI-inferred suggestions, use propose_context_update instead.',
    {
      updates: z
        .record(
          z.enum([
            'positioningStatement', 'icpDefinition', 'messagingPillars',
            'competitiveLandscape', 'customerLanguage', 'proofPoints',
            'activeHypotheses', 'brandVoice', 'wordsToUse', 'wordsToAvoid',
          ]),
          z.unknown()
        )
        .describe('Field name → new value pairs to apply (only valid context field names accepted)'),
      change_summary: z
        .string()
        .describe('What changed and why (shown in version history)'),
    },
    async ({ updates, change_summary }) => {
      try {
        const newVersion = await applyContextUpdates(updates, 'mcp', change_summary);
        return text(
          JSON.stringify(
            {
              id: newVersion.id,
              version: newVersion.version,
              isActive: newVersion.isActive,
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] apply_context_update error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to apply context update'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // restore_context_version
  // -----------------------------------------------------------------------
  server.tool(
    'restore_context_version',
    'Restore a previous version of the product marketing context. Creates a new context version copying the content from the specified historical version.',
    {
      version_id: z
        .string()
        .describe('The id of the context version to restore'),
    },
    async ({ version_id }) => {
      try {
        const newVersion = await restoreContextVersion(version_id, 'mcp');
        return text(
          JSON.stringify(
            {
              id: newVersion.id,
              version: newVersion.version,
              isActive: newVersion.isActive,
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] restore_context_version error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to restore context version'
        );
      }
    }
  );
}
