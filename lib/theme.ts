// Shared theme constants used by both the FOUC-prevention script in
// app/layout.tsx (interpolated into a raw <script> tag) and the
// ThemeToggle client component.

export const THEME_STORAGE_KEY = 'quiver-theme';
export const THEME_DARK_CLASS = 'dark';

/** Returns the value to persist in localStorage for the given dark-mode state. */
export function persistedThemeValue(isDark: boolean): string {
  return isDark ? THEME_DARK_CLASS : 'light';
}
