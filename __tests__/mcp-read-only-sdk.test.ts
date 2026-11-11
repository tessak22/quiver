/**
 * Integration test for restrictToolRegistration against the real MCP SDK.
 *
 * The route tests mock McpServer, so they cannot show that a tool removed by
 * the filter is really gone. This one wires a real McpServer to a real Client
 * over the SDK's in-memory transport and checks both tools/list and tools/call,
 * with no route-level pre-check in front.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { restrictToolRegistration } from '@/mcp/lib/read-only-tools';

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('restrictToolRegistration (real SDK)', () => {
  it('hides and refuses tools outside the allowlist, for tool() and registerTool()', async () => {
    let writes = 0;
    const server = new McpServer({ name: 'test', version: '0' });
    restrictToolRegistration(server, new Set(['get_thing', 'list_things']));

    const read = server.tool('get_thing', 'Read', { id: z.string() }, async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }));
    server.registerTool('list_things', { description: 'Read' }, async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }));
    server.tool('save_thing', 'Write', { id: z.string() }, async () => {
      writes += 1;
      return { content: [{ type: 'text', text: 'saved' }] };
    });
    server.registerTool('delete_thing', { description: 'Write' }, async () => {
      writes += 1;
      return { content: [{ type: 'text', text: 'deleted' }] };
    });
    expect(typeof read.remove).toBe('function');

    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_thing', 'list_things']);

    const ok = await client.callTool({ name: 'get_thing', arguments: { id: '1' } });
    expect(ok.isError).toBeFalsy();

    for (const name of ['save_thing', 'delete_thing']) {
      const result = await client
        .callTool({ name, arguments: { id: '1' } })
        .then((r) => ({ rejected: false, isError: r.isError === true }))
        .catch(() => ({ rejected: true, isError: true }));
      expect(result.isError).toBe(true);
    }
    expect(writes).toBe(0);
    await client.close();
  });
});
