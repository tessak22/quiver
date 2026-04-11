'use client';

// Client component: toggle between light and dark theme.
// Reads initial value from localStorage on mount to avoid SSR mismatch.
// Updates localStorage and the `dark` class on <html> simultaneously.

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { THEME_STORAGE_KEY, THEME_DARK_CLASS } from '@/lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains(THEME_DARK_CLASS));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle(THEME_DARK_CLASS, next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? THEME_DARK_CLASS : 'light');
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">{dark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
    </Button>
  );
}
