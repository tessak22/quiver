/**
 * Tests for MCP response helpers — mcp/lib/response.ts
 *
 * Verifies that text() and error() produce correctly structured MCP
 * CallToolResult objects matching the MCP protocol specification.
 */

import { describe, it, expect } from 'vitest';
import { text, error } from '@/mcp/lib/response';

describe('MCP response helpers', () => {
  describe('text()', () => {
    it('returns a content array with a single text block', () => {
      const result = text('hello');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'hello' });
    });

    it('does not set isError', () => {
      const result = text('hello');
      expect(result).not.toHaveProperty('isError');
    });

    it('handles empty string', () => {
      const result = text('');
      expect(result.content[0].text).toBe('');
    });

    it('preserves JSON content without modification', () => {
      const json = JSON.stringify({ id: '123', version: 1 }, null, 2);
      const result = text(json);
      expect(JSON.parse(result.content[0].text)).toEqual({ id: '123', version: 1 });
    });

    it('preserves multiline content', () => {
      const msg = 'Line 1\nLine 2\nLine 3';
      const result = text(msg);
      expect(result.content[0].text).toBe(msg);
    });
  });

  describe('error()', () => {
    it('returns a content array with a single text block', () => {
      const result = error('something failed');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'something failed' });
    });

    it('sets isError to true', () => {
      const result = error('fail');
      expect(result.isError).toBe(true);
    });

    it('handles empty string', () => {
      const result = error('');
      expect(result.content[0].text).toBe('');
      expect(result.isError).toBe(true);
    });
  });
});
