'use client';

// Client component: handles logout button interaction for non-member users

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        setError('Sign out failed. Please try again.');
        setIsLoading(false);
        return;
      }
      window.location.href = '/login';
    } catch {
      setError('Sign out failed. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">No Access</h1>
          <p className="text-sm text-muted-foreground">
            Your account is not a member of this workspace. Ask your team admin
            for an invite, then check your email for the invite link.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? 'Signing out...' : 'Sign out'}
        </Button>
      </div>
    </div>
  );
}
