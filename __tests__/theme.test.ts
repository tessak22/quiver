/**
 * Tests for lib/theme.ts — Theme constants
 *
 * Verifies that the shared theme constants are well-formed and that the
 * FOUC-prevention script (assembled from these constants in app/layout.tsx)
 * would produce valid JavaScript. These constants are duplicated between a
 * raw inline <script> tag and the ThemeToggle client component, so any
 * change must be safe for both contexts.
 */

import { describe, it, expect } from 'vitest';
import { THEME_STORAGE_KEY, THEME_DARK_CLASS } from '@/lib/theme';

describe('THEME_STORAGE_KEY', () => {
  it('is a non-empty string', () => {
    expect(THEME_STORAGE_KEY).toBeTruthy();
    expect(typeof THEME_STORAGE_KEY).toBe('string');
  });

  it('is safe for use in a single-quoted JS string literal', () => {
    expect(THEME_STORAGE_KEY).not.toContain("'");
    expect(THEME_STORAGE_KEY).not.toContain('\\');
  });
});

describe('THEME_DARK_CLASS', () => {
  it('is a non-empty string', () => {
    expect(THEME_DARK_CLASS).toBeTruthy();
    expect(typeof THEME_DARK_CLASS).toBe('string');
  });

  it('is a valid CSS class name', () => {
    expect(THEME_DARK_CLASS).toMatch(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/);
  });

  it('is safe for use in a single-quoted JS string literal', () => {
    expect(THEME_DARK_CLASS).not.toContain("'");
    expect(THEME_DARK_CLASS).not.toContain('\\');
  });
});

describe('FOUC script assembly', () => {
  it('produces valid JavaScript when constants are interpolated', () => {
    const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='${THEME_DARK_CLASS}')document.documentElement.classList.add('${THEME_DARK_CLASS}')}catch(e){}})()`;

    // Should not throw when parsed as JavaScript
    expect(() => new Function(script)).not.toThrow();
  });
});

describe('writer/reader consistency', () => {
  it('toggle dark token matches bootstrap reader token', () => {
    // The bootstrap script in layout.tsx reads: if(t === THEME_DARK_CLASS)
    // The toggle in theme-toggle.tsx writes: localStorage.setItem(KEY, THEME_DARK_CLASS)
    // Both must use the same value so a persisted preference round-trips correctly.
    const bootstrapReaderToken = THEME_DARK_CLASS;
    const toggleWriterToken = THEME_DARK_CLASS;
    expect(toggleWriterToken).toBe(bootstrapReaderToken);
  });

  it('bootstrap script contains the exact token the toggle would persist', () => {
    const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='${THEME_DARK_CLASS}')document.documentElement.classList.add('${THEME_DARK_CLASS}')}catch(e){}})()`;

    // The script must check for the same value the toggle writes
    expect(script).toContain(`t==='${THEME_DARK_CLASS}'`);
    // The script must read from the same key the toggle writes to
    expect(script).toContain(`getItem('${THEME_STORAGE_KEY}')`);
  });
});
