'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionMode, ArtifactType, ChatMessage, ArtifactReadyMarker } from '@/types';

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

const CONTEXT_FIELDS: { value: string; label: string }[] = [
  { value: 'positioningStatement', label: 'Positioning Statement' },
  { value: 'icpDefinition', label: 'ICP Definition' },
  { value: 'messagingPillars', label: 'Messaging Pillars' },
  { value: 'customerLanguage', label: 'Customer Language' },
  { value: 'proofPoints', label: 'Proof Points' },
  { value: 'activeHypotheses', label: 'Active Hypotheses' },
  { value: 'brandVoice', label: 'Brand Voice' },
  { value: 'competitiveLandscape', label: 'Competitive Landscape' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionData {
  id: string;
  title: string | null;
  mode: string;
  skillsLoaded: string[];
  messages: unknown;
  campaignId: string | null;
  contextVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  campaign: { id: string; name: string } | null;
  contextVersion: { id: string; version: number } | null;
}

// SSE event types
interface SSESessionIdEvent {
  type: 'session_id';
  sessionId: string;
}

interface SSETextEvent {
  type: 'text';
  content: string;
}

interface SSEArtifactReadyEvent {
  type: 'artifact_ready';
  artifactType: string;
  suggestedTitle: string;
}

interface SSEDoneEvent {
  type: 'done';
}

interface SSEErrorEvent {
  type: 'error';
  message: string;
}

type SSEEvent =
  | SSESessionIdEvent
  | SSETextEvent
  | SSEArtifactReadyEvent
  | SSEDoneEvent
  | SSEErrorEvent;

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
// Message Bubble Component
// ---------------------------------------------------------------------------

function SaveToContextButton({
  messageContent,
  sessionId,
}: {
  messageContent: string;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSelect(field: string) {
    setSaving(true);

    try {
      const res = await fetch('/api/context/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          proposedValue: messageContent,
          sessionId,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to propose context update');
      }

      setSaved(true);
      setOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to propose context update';
      window.alert(message);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <span className="text-xs text-muted-foreground italic">
        Proposed update saved
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        title="Save to Context"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save to Context'}
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-10 w-56 rounded-md border bg-popover p-1 shadow-md">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Save as context field:
          </p>
          {CONTEXT_FIELDS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => handleSelect(f.value)}
              disabled={saving}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
  sessionId,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  sessionId?: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className="max-w-[85%] space-y-1">
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse" />
          )}
        </div>
        {!isUser && !isStreaming && sessionId && (
          <div className="px-1">
            <SaveToContextButton
              messageContent={message.content}
              sessionId={sessionId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Panel Component
// ---------------------------------------------------------------------------

function ContextPanel({
  session,
  isOpen,
  onToggle,
}: {
  session: SessionData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Session Context
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {isOpen ? 'Hide' : 'Show'}
            </span>
          </div>
        </CardHeader>
      </button>
      {isOpen && (
        <CardContent className="pt-0 px-4 pb-3 space-y-2">
          {session.contextVersion && (
            <div className="text-xs">
              <span className="text-muted-foreground">Context version:</span>{' '}
              <span className="font-medium">v{session.contextVersion.version}</span>
            </div>
          )}
          {session.campaign && (
            <div className="text-xs">
              <span className="text-muted-foreground">Campaign:</span>{' '}
              <span className="font-medium">{session.campaign.name}</span>
            </div>
          )}
          {session.skillsLoaded.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Skills loaded:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {session.skillsLoaded.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-xs py-0">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Artifact Save Banner Component
// ---------------------------------------------------------------------------

function ArtifactSaveBanner({
  marker,
  sessionId,
  onDismiss,
}: {
  marker: ArtifactReadyMarker;
  sessionId: string;
  onDismiss: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      // Navigate to artifact creation with pre-filled data
      const params = new URLSearchParams();
      params.set('sessionId', sessionId);
      params.set('type', marker.type);
      params.set('title', marker.suggestedTitle);
      window.location.href = `/artifacts/new?${params.toString()}`;
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-primary/50 bg-primary/5 p-3 flex items-center justify-between gap-3">
      <div className="text-sm">
        <span className="font-medium">Artifact ready:</span>{' '}
        {marker.suggestedTitle}
        <Badge variant="outline" className="ml-2 text-xs">
          {marker.type}
        </Badge>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save Artifact'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SessionChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Determine if this is a new session (route: /sessions/new-chat?mode=...)
  // or existing session (route: /sessions/[id])
  const routeId = params.id as string;
  const isNewSession = routeId === 'new-chat';

  // New session params
  const initialMode = searchParams.get('mode') as SessionMode | null;
  const initialArtifactType = searchParams.get('artifactType') as ArtifactType | null;
  const initialCampaignId = searchParams.get('campaignId');
  const initialMessage = searchParams.get('initialMessage') ?? '';

  // State
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState(initialMessage);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNewSession);
  const [sessionId, setSessionId] = useState<string | null>(isNewSession ? null : routeId);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [artifactMarker, setArtifactMarker] = useState<ArtifactReadyMarker | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // Fetch existing session — only for initial page load, not during streaming
  const fetchSession = useCallback(async (id: string, isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to load session');
      }

      const data: { session: SessionData } = await res.json();
      setSession(data.session);
      // Only overwrite messages on initial load — not during/after streaming
      if (isInitialLoad) {
        setMessages(parseMessages(data.session.messages));
      }
      setSessionId(data.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isNewSession && routeId) {
      fetchSession(routeId, true);
    }
  }, [isNewSession, routeId, fetchSession]);

  // Stable ref to the latest handleSendMessage — lets the one-shot effect below
  // call the up-to-date function without needing it in deps.
  const handleSendMessageRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  // Auto-send the initial message when arriving from the new session page.
  // Strips initialMessage from the URL immediately so:
  //   (a) back-navigation doesn't re-trigger a second auto-send, and
  //   (b) React Strict Mode remounts see initialMessage='' and skip the guard.
  useEffect(() => {
    if (!isNewSession || !initialMessage) return;

    // Strip param before firing so remounts don't re-send
    const next = new URLSearchParams(searchParams.toString());
    next.delete('initialMessage');
    router.replace(`/sessions/new-chat?${next.toString()}`);

    if (!autoSentRef.current) {
      autoSentRef.current = true;
      const timer = setTimeout(() => handleSendMessageRef.current(), 0);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on mount
  }, []);

  // Determine the mode for display and API calls
  const currentMode: SessionMode = (session?.mode as SessionMode) ?? initialMode ?? 'strategy';

  // Send message and handle streaming response
  async function handleSendMessage() {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;

    // Clear input immediately
    setInputValue('');
    setError(null);
    setArtifactMarker(null);

    // Optimistically add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Start streaming
    setIsStreaming(true);
    setStreamingContent('');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const payload: Record<string, unknown> = {
        message: trimmed,
        mode: currentMode,
      };

      if (sessionId) {
        payload.sessionId = sessionId;
      }
      if (initialArtifactType) {
        payload.artifactType = initialArtifactType;
      }
      if (initialCampaignId) {
        payload.campaignId = initialCampaignId;
      }

      const res = await fetch('/api/sessions/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Stream request failed');
      }

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let receivedDoneEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as SSEEvent;

            switch (event.type) {
              case 'session_id': {
                setSessionId(event.sessionId);
                // Update URL without full navigation for new sessions
                if (isNewSession) {
                  window.history.replaceState(
                    null,
                    '',
                    `/sessions/${event.sessionId}`
                  );
                }
                // Don't fetch session during streaming — messages aren't saved yet.
                // Set minimal session data from what we already know.
                if (!session) {
                  setSession({
                    id: event.sessionId,
                    title: null,
                    mode: currentMode,
                    skillsLoaded: [],
                    messages: [],
                    campaignId: initialCampaignId ?? null,
                    contextVersionId: null,
                    campaign: null,
                    contextVersion: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isArchived: false,
                  });
                }
                break;
              }
              case 'text': {
                fullContent += event.content;
                setStreamingContent(fullContent);
                break;
              }
              case 'artifact_ready': {
                setArtifactMarker({
                  type: event.artifactType as ArtifactType,
                  suggestedTitle: event.suggestedTitle,
                });
                break;
              }
              case 'done': {
                receivedDoneEvent = true;
                // Finalize: add the full assistant message
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: fullContent,
                  timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent('');
                setIsStreaming(false);

                // Trigger title generation for new sessions
                // Full session fetch happens via the sessionId state update
                break;
              }
              case 'error': {
                setError(event.message);
                setIsStreaming(false);
                setStreamingContent('');
                break;
              }
            }
          } catch {
            // Malformed JSON line — skip
          }
        }
      }

      // If stream ended without a done event, finalize
      if (fullContent && !receivedDoneEvent) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: fullContent,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent('');
        setIsStreaming(false);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setIsStreaming(false);
        setStreamingContent('');
      }
    } finally {
      abortControllerRef.current = null;
    }
  }

  // Handle Enter to send, Shift+Enter for newline
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  // Cancel streaming
  function handleCancelStream() {
    abortControllerRef.current?.abort();
    setIsStreaming(false);

    // Keep any content streamed so far as a partial message
    if (streamingContent) {
      const partialMessage: ChatMessage = {
        role: 'assistant',
        content: streamingContent + '\n\n[Streaming cancelled]',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, partialMessage]);
      setStreamingContent('');
    }
  }

  // Title editing
  async function handleSaveTitle() {
    if (!sessionId || !titleValue.trim()) return;
    setSavingTitle(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleValue.trim() }),
      });

      if (res.ok) {
        setSession((prev) =>
          prev ? { ...prev, title: titleValue.trim() } : prev
        );
        setEditingTitle(false);
      }
    } catch {
      // Silent fail — title update is not critical
    } finally {
      setSavingTitle(false);
    }
  }

  // Share session
  async function handleShare() {
    if (!sessionId) return;
    setShareLoading(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to generate share link');
      }

      const data: { shareUrl: string } = await res.json();
      const fullUrl = `${window.location.origin}${data.shareUrl}`;
      setShareUrl(fullUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate share link');
    } finally {
      setShareLoading(false);
    }
  }

  async function handleCopyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Fallback: select the text in the input
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  // --- Error loading session (not streaming errors) ---
  if (!isNewSession && !session && error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href="/sessions">Back to Sessions</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sessions">Back</Link>
          </Button>

          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
              MODE_COLORS[currentMode] ?? ''
            }`}
          >
            {MODE_LABELS[currentMode] ?? currentMode}
          </span>

          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="h-7 px-2 text-sm border rounded bg-background"
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveTitle}
                disabled={savingTitle}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTitle(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="font-medium truncate text-sm hover:underline"
              onClick={() => {
                setTitleValue(session?.title ?? '');
                setEditingTitle(true);
              }}
              title="Click to edit title"
            >
              {session?.title ?? 'Untitled session'}
            </button>
          )}

          {session?.campaign && (
            <Badge variant="outline" className="text-xs shrink-0">
              {session.campaign.name}
            </Badge>
          )}
        </div>

        {/* Share button */}
        {sessionId && !isNewSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={shareLoading}
            className="shrink-0"
          >
            {shareLoading ? 'Generating...' : 'Share'}
          </Button>
        )}
      </div>

      {/* Share URL banner */}
      {shareUrl && (
        <div className="border-b px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 h-8 px-2 text-xs border rounded bg-muted truncate"
              onFocus={(e) => e.target.select()}
            />
            <Button variant="outline" size="sm" onClick={handleCopyShareUrl}>
              {shareCopied ? 'Copied!' : 'Copy link'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareUrl(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Context Panel */}
      {session && (
        <div className="px-4 pt-2 shrink-0">
          <ContextPanel
            session={session}
            isOpen={contextPanelOpen}
            onToggle={() => setContextPanelOpen((prev) => !prev)}
          />
        </div>
      )}

      {/* Artifact Save Banner */}
      {artifactMarker && sessionId && (
        <div className="px-4 pb-2 shrink-0">
          <ArtifactSaveBanner
            marker={artifactMarker}
            sessionId={sessionId}
            onDismiss={() => setArtifactMarker(null)}
          />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="px-4 pb-2 shrink-0">
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-lg font-medium">
              {isNewSession ? 'Start your session' : 'No messages yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Type a message below to begin. The AI will use your product context
              and loaded skills to provide relevant marketing guidance.
            </p>
          </div>
        )}

        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <MessageBubble key={`${msg.role}-${i}`} message={msg} sessionId={sessionId} />
          ))}

          {/* Streaming response */}
          {streamingContent && (
            <MessageBubble
              message={{
                role: 'assistant',
                content: streamingContent,
                timestamp: new Date().toISOString(),
              }}
              isStreaming
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          {isStreaming ? (
            <div className="flex items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">AI is responding...</p>
              <Button variant="outline" size="sm" onClick={handleCancelStream}>
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
                rows={2}
                className="resize-none min-h-[52px]"
                disabled={isStreaming}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isStreaming}
                className="shrink-0 self-end"
              >
                Send
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            AI responses are grounded in your product context and marketing frameworks.
          </p>
        </div>
      </div>
    </div>
  );
}
