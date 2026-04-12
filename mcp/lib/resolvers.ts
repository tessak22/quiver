/**
 * Name-to-ID resolvers for MCP tools.
 *
 * The lib/db functions use exact IDs. MCP tools accept human-friendly names
 * with case-insensitive partial matching. These resolvers bridge the gap.
 */

import {
  getDefaultCampaign,
  findCampaignMatchesByName,
} from '@/lib/db/campaigns';
import { findArtifactMatchesByTitle } from '@/lib/db/artifacts';

/**
 * Resolve a campaign ID from an optional ID or name.
 * If fallbackToDefault is true, returns the Unassigned campaign when neither is provided.
 */
export async function resolveCampaignId(
  campaignId?: string,
  campaignName?: string,
  options?: { fallbackToDefault?: boolean }
): Promise<string | undefined> {
  if (campaignId) return campaignId;

  if (campaignName) {
    const matches = await findCampaignMatchesByName(campaignName);
    if (matches.length === 0) {
      throw new Error(
        `No campaign found matching '${campaignName}'. Check campaign names with list_campaigns.`
      );
    }
    if (matches.length > 1) {
      const list = matches.map((c) => `${c.name} (${c.id})`).join(', ');
      throw new Error(
        `Found ${matches.length} campaigns matching '${campaignName}': ${list}. Provide the campaign_id.`
      );
    }
    return matches[0].id;
  }

  if (options?.fallbackToDefault) {
    const fallback = await getDefaultCampaign();
    if (!fallback) {
      throw new Error(
        'No Unassigned campaign found. Complete onboarding at /setup first.'
      );
    }
    return fallback.id;
  }

  return undefined;
}

/**
 * Resolve an artifact ID from an optional ID or title.
 * Title uses case-insensitive partial match; throws on ambiguous results.
 */
export async function resolveArtifactId(
  artifactId?: string,
  artifactTitle?: string
): Promise<string | undefined> {
  if (artifactId) return artifactId;
  if (!artifactTitle) return undefined;

  const matches = await findArtifactMatchesByTitle(artifactTitle);

  if (matches.length === 0) {
    throw new Error(`No artifact found matching '${artifactTitle}'.`);
  }
  if (matches.length > 1) {
    const list = matches.map((a) => `${a.title} (${a.id})`).join(', ');
    throw new Error(
      `Found ${matches.length} artifacts matching '${artifactTitle}': ${list}. Provide the artifact_id.`
    );
  }
  return matches[0].id;
}
