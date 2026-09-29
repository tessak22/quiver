'use client';

// Client component: handles interactive login form with Supabase Auth

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // null while unknown, true only on a fresh install with no account yet.
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // A fresh self-hosted install has no account and no way to make one — every
  // other path needs an admin who does not exist yet. The server decides
  // whether this door is open; the answer here only changes what is offered.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/bootstrap')
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then((body: { available?: boolean }) => {
        if (!cancelled) setFirstRun(Boolean(body.available));
      })
      .catch(() => {
        if (!cancelled) setFirstRun(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (firstRun) {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not create the account');
        setIsLoading(false);
        return;
      }
      setFirstRun(false);
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Quiver</h1>
          <p className="text-sm text-muted-foreground">
            {firstRun
              ? 'Create the first account for this Quiver. You will be its admin.'
              : 'Sign in to your developer marketing system'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? firstRun
                ? 'Creating account...'
                : 'Signing in...'
              : firstRun
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
