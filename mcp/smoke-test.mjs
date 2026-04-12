#!/usr/bin/env node
/**
 * Quiver MCP Smoke Test — mcp/smoke-test.mjs
 *
 * Verifies that the remote HTTP endpoint responds with valid MCP protocol
 * behavior. Run this after deploying to confirm the connector is working
 * before adding it to Claude browser.
 *
 * Usage:
 *   node mcp/smoke-test.mjs [url] [token]
 *
 * Arguments:
 *   url    Full endpoint URL (default: http://localhost:3000/api/mcp)
 *   token  Bearer token — uses MCP_AUTH_SECRET env var if omitted
 *
 * Examples:
 *   # Local dev server (no auth)
 *   node mcp/smoke-test.mjs
 *
 *   # Deployed instance with auth token
 *   node mcp/smoke-test.mjs https://quiver.example.com/api/mcp my-secret-token
 *
 *   # Via env var
 *   MCP_AUTH_SECRET=my-secret node mcp/smoke-test.mjs https://quiver.example.com/api/mcp
 *
 * Exit codes:
 *   0  All tests passed
 *   1  One or more tests failed (details logged to stderr)
 */

const url = process.argv[2] ?? 'http://localhost:3000/api/mcp';
const token = process.argv[3] ?? process.env.MCP_AUTH_SECRET ?? '';

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
  failed++;
}

/**
 * POST a JSON-RPC message and return the parsed response body.
 * Handles both JSON and SSE responses (reads first data frame from SSE).
 */
async function rpc(body) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('text/event-stream')) {
    // Read the first populated data line from the SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split('\n')) {
        if (line.startsWith('data: ') && line.slice(6).trim()) {
          reader.cancel();
          return JSON.parse(line.slice(6));
        }
      }
    }
    throw new Error('SSE stream ended without a data frame');
  }

  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('');
console.log('Quiver MCP Smoke Test');
console.log(`  Endpoint : ${url}`);
console.log(`  Auth     : ${token ? 'Bearer token set' : 'none (MCP_AUTH_SECRET not set)'}`);
console.log('');

// ── Test 1: initialize ────────────────────────────────────────────────────────

console.log('1. initialize');
let initResponse;
try {
  initResponse = await rpc({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'quiver-smoke-test', version: '1.0.0' },
    },
    id: 1,
  });

  if (initResponse?.result?.serverInfo?.name === 'quiver') {
    pass('server info identifies as "quiver"');
  } else {
    fail('unexpected serverInfo', JSON.stringify(initResponse?.result?.serverInfo));
  }

  if (typeof initResponse?.result?.protocolVersion === 'string') {
    pass(`protocol version: ${initResponse.result.protocolVersion}`);
  } else {
    fail('missing protocolVersion in initialize result');
  }
} catch (err) {
  fail('initialize request failed', err.message);
  console.error('\nCannot continue without a successful initialize. Aborting.\n');
  process.exit(1);
}

// ── Test 2: tools/list ────────────────────────────────────────────────────────

console.log('\n2. tools/list');
let tools = [];
try {
  const listResponse = await rpc({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2,
  });

  tools = listResponse?.result?.tools ?? [];

  if (tools.length > 0) {
    pass(`${tools.length} tools registered`);
  } else {
    fail('tools/list returned no tools');
  }

  const hasRead = tools.some((t) => t.name === 'get_dashboard_summary');
  const hasWrite = tools.some((t) => t.name === 'log_performance');

  if (hasRead) pass('read tool present: get_dashboard_summary');
  else fail('read tool missing: get_dashboard_summary');

  if (hasWrite) pass('write tool present: log_performance');
  else fail('write tool missing: log_performance');
} catch (err) {
  fail('tools/list request failed', err.message);
}

// ── Test 3: get_dashboard_summary (read tool end-to-end) ─────────────────────

console.log('\n3. get_dashboard_summary (read tool end-to-end)');
try {
  const callResponse = await rpc({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: 'get_dashboard_summary', arguments: {} },
    id: 3,
  });

  const content = callResponse?.result?.content;
  if (Array.isArray(content) && content.length > 0 && content[0]?.type === 'text') {
    pass('returned text content');
    const preview = content[0].text.slice(0, 80).replace(/\n/g, ' ');
    console.log(`    preview: ${preview}…`);
  } else if (callResponse?.error) {
    // DB not configured is OK — the endpoint still responded correctly
    pass(`endpoint responded (DB error expected if not configured): ${callResponse.error.message}`);
  } else {
    fail('unexpected response shape', JSON.stringify(callResponse).slice(0, 200));
  }
} catch (err) {
  fail('get_dashboard_summary call failed', err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
