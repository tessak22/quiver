/**
 * Prisma client for MCP context.
 * Re-exports the shared singleton from the main app's lib/db module.
 * The MCP server connects to the same database via DATABASE_URL.
 */
export { prisma } from '@/lib/db';
