// 'use client' — required for useState, form interactions, and fetch calls
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
} from '@/types';
import type { ContentType } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewContentPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [contentType, setContentType] = useState<ContentType>('blog_post');
  const [campaignId, setCampaignId] = useState<string>('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');

  // SEO fields
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [targetKeyword, setTargetKeyword] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');

  // OG fields
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [twitterCardType, setTwitterCardType] = useState('summary_large_image');

  // Fetch campaigns
  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json() as { campaigns: CampaignOption[] };
          setCampaigns(data.campaigns);
        }
      } catch {
        // Non-critical
      }
    }
    fetchCampaigns();
  }, []);

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(titleToSlug(title));
    }
  }, [title, slugManuallyEdited]);

  // Best-effort slug validation on blur. Checks against published content via
  // the public API. The POST route does the authoritative uniqueness check
  // across all statuses, returning 409 if the slug is taken.
  const validateSlug = useCallback(async () => {
    if (!slug.trim()) {
      setSlugError(null);
      return;
    }
    try {
      const res = await fetch(`/api/public/content/${encodeURIComponent(slug)}`);
      if (res.ok) {
        setSlugError('This slug is already in use');
      } else {
        setSlugError(null);
      }
    } catch {
      setSlugError(null);
    }
  }, [slug]);

  async function handleSave(status: 'draft' | 'published') {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim() || undefined,
          contentType,
          status,
          body,
          excerpt: excerpt || undefined,
          metaTitle: metaTitle || undefined,
          metaDescription: metaDescription || undefined,
          targetKeyword: targetKeyword || undefined,
          secondaryKeywords: secondaryKeywords
            ? secondaryKeywords.split(',').map((k) => k.trim()).filter(Boolean)
            : undefined,
          canonicalUrl: canonicalUrl || undefined,
          ogTitle: ogTitle || undefined,
          ogDescription: ogDescription || undefined,
          ogImageUrl: ogImageUrl || undefined,
          twitterCardType: twitterCardType || undefined,
          campaignId: campaignId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        if (res.status === 409) {
          setSlugError('This slug is already in use');
          throw new Error('Slug already taken. Please choose a different slug.');
        }
        throw new Error(data.error ?? 'Failed to create content');
      }

      const data = await res.json() as { contentPiece: { id: string } };
      router.push(`/content/${data.contentPiece.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create content');
    } finally {
      setSaving(false);
    }
  }

  const metaDescriptionLength = metaDescription.length;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/content">Back</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New Content</h1>
      </div>

      {/* Error banner */}
      {error && (
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
      )}

      {/* Section 1: Content */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Content</h2>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManuallyEdited(true);
                setSlugError(null);
              }}
              onBlur={validateSlug}
              placeholder="auto-generated-from-title"
            />
            {slugError && (
              <p className="text-xs text-destructive">{slugError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier. Auto-generated from title if left empty.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Content type</Label>
              <Select
                value={contentType}
                onValueChange={(v) => setContentType(v as ContentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select
                value={campaignId || 'none'}
                onValueChange={(v) => setCampaignId(v === 'none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Brief summary of the content"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Content (markdown)</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your content here..."
              rows={16}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: SEO */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">SEO</h2>

          <div className="space-y-2">
            <Label htmlFor="metaTitle">Meta title</Label>
            <Input
              id="metaTitle"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Page title for search engines"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metaDescription">
              Meta description
              <span className={`ml-2 text-xs ${metaDescriptionLength >= 150 && metaDescriptionLength <= 160 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {metaDescriptionLength}/160
              </span>
            </Label>
            <Textarea
              id="metaDescription"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Description for search engine results"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetKeyword">Target keyword</Label>
              <Input
                id="targetKeyword"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="Primary keyword"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryKeywords">Secondary keywords</Label>
              <Input
                id="secondaryKeywords"
                value={secondaryKeywords}
                onChange={(e) => setSecondaryKeywords(e.target.value)}
                placeholder="Comma-separated keywords"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="canonicalUrl">Canonical URL</Label>
            <Input
              id="canonicalUrl"
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 3: OG / Social */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">OG / Social</h2>

          <div className="space-y-2">
            <Label htmlFor="ogTitle">OG title</Label>
            <Input
              id="ogTitle"
              value={ogTitle}
              onChange={(e) => setOgTitle(e.target.value)}
              placeholder="Social share title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ogDescription">OG description</Label>
            <Textarea
              id="ogDescription"
              value={ogDescription}
              onChange={(e) => setOgDescription(e.target.value)}
              placeholder="Social share description"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ogImageUrl">OG image URL</Label>
            <Input
              id="ogImageUrl"
              value={ogImageUrl}
              onChange={(e) => setOgImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Twitter card type</Label>
            <Select
              value={twitterCardType}
              onValueChange={setTwitterCardType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary_large_image">Summary Large Image</SelectItem>
                <SelectItem value="summary">Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          disabled={saving || !title.trim() || !body.trim()}
          onClick={() => handleSave('draft')}
        >
          {saving ? 'Saving...' : 'Save as draft'}
        </Button>
        <Button
          disabled={saving || !title.trim() || !body.trim()}
          onClick={() => handleSave('published')}
        >
          {saving ? 'Publishing...' : 'Save and publish'}
        </Button>
      </div>
    </div>
  );
}
