/** Standard MCP tool response helpers. */

export function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

export function error(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
