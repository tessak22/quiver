'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import type { SessionMode, ChatMessage } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<SessionMode, string> = {
  strategy: 'Strategy',
  create: 'Create',
  feedback: 'Feedback',
  analyze: 'Analyze',
  optimize: 'Optimize',
};

const MODE_COLORS: Record<SessionMode, string> = {
  strategy: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  feedback: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  analyze: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  optimize: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SharedSessionData {
  id: string;
  title: string | null;
  mode: string;
  messages: unknown;
  createdAt: string;
  campaign: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      typeof m === 'object' &&
      m !== null &&
      'role' in m &&
      'content' in m &&
      typeof (m as Record<string, unknown>).role === 'string' &&
      typeof (m as Record<string, unknown>).content === 'string'
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SharedSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const sessionId = params.id as string;
  const token = searchParams.get('token');

  const [session, setSession] = useState<SharedSessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSharedSession() {
      if (!token) {
        setError('Invalid or expired link');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/share?token=${encodeURIComponent(token)}`
        );

        if (!res.ok) {
          const data: { error?: string } = await res.json();
          throw new Error(data.error ?? 'Failed to load shared session');
        }

        const data: { session: SharedSessionData } = await res.json();
        setSession(data.session);
        setMessages(parseMessages(data.session.messages));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared session');
      } finally {
        setLoading(false);
      }
    }

    fetchSharedSession();
  }, [sessionId, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading shared session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-destructive text-lg">{error}</p>
        <p className="text-sm text-muted-foreground">
          This link may be invalid or expired.
        </p>
      </div>
    );
  }

  if (!session) return null;

  const mode = session.mode as SessionMode;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Branding header */}
      <header className="border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">Quiver</span>
          <span className="text-muted-foreground text-sm">Shared Session</span>
        </div>
        <Badge variant="outline" className="text-xs">
          Read-only
        </Badge>
      </header>

      {/* Session info */}
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
            MODE_COLORS[mode] ?? ''
          }`}
        >
          {MODE_LABELS[mode] ?? mode}
        </span>

        <span className="font-medium text-sm truncate">
          {session.title ?? 'Untitled session'}
        </span>

        {session.campaign && (
          <Badge variant="outline" className="text-xs shrink-0">
            {session.campaign.name}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No messages in this session.</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={`${msg.role}-${i}`} message={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-2 text-center shrink-0">
        <p className="text-xs text-muted-foreground">
          Shared from Quiver &mdash; AI Marketing Command Center
        </p>
      </footer>
    </div>
  );
}
