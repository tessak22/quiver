'use client';

// Client component: multi-step onboarding wizard with localStorage persistence
// and AI-assisted input structuring for steps 1-4.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STORAGE_KEY = 'quiver_onboarding';
const TOTAL_STEPS = 6;

interface OnboardingData {
  // Step 1: Product basics
  productName: string;
  oneLiner: string;
  productCategory: string;
  businessModel: string;
  // Step 2: Target audience
  icpDefinition: string;
  decisionMaker: string;
  primaryUseCase: string;
  jobsToBeDone: string;
  // Step 3: Positioning
  coreProblem: string;
  whyAlternativesFallShort: string;
  keyDifferentiators: string;
  positioningStatement: string;
  // Step 4: Messaging
  valuePillars: string;
  customerLanguage: string;
  wordsToUse: string;
  wordsToAvoid: string;
  // Step 5: Competitive landscape
  competitors: Array<{ name: string; notes: string }>;
  // Step 6: Team
  teamEmails: string;
}

const defaultData: OnboardingData = {
  productName: '',
  oneLiner: '',
  productCategory: '',
  businessModel: '',
  icpDefinition: '',
  decisionMaker: '',
  primaryUseCase: '',
  jobsToBeDone: '',
  coreProblem: '',
  whyAlternativesFallShort: '',
  keyDifferentiators: '',
  positioningStatement: '',
  valuePillars: '',
  customerLanguage: '',
  wordsToUse: '',
  wordsToAvoid: '',
  competitors: [{ name: '', notes: '' }],
  teamEmails: '',
};

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setData({ ...defaultData, ...parsed.data });
        if (parsed.step) setStep(parsed.step);
      } catch {
        // Corrupt data — start fresh
      }
    }
  }, []);

  // Save to localStorage on change
  const saveProgress = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data }));
  }, [step, data]);

  useEffect(() => {
    saveProgress();
  }, [saveProgress]);

  function updateField(field: keyof OnboardingData, value: string | Array<{ name: string; notes: string }>) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return !!(data.productName && data.oneLiner);
      case 2:
        return !!(data.icpDefinition);
      case 3:
        return !!(data.coreProblem);
      case 4:
        return !!(data.valuePillars);
      case 5:
      case 6:
        return true;
      default:
        return false;
    }
  }

  async function handleAiAssist(stepNum: number) {
    setIsAiLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepNum, data }),
      });

      if (!response.ok) {
        throw new Error('AI assist failed');
      }

      const result = await response.json();

      // Merge AI suggestions into current data
      if (result.suggestions) {
        setData((prev) => ({ ...prev, ...result.suggestions }));
      }
    } catch {
      setError('AI assist is unavailable. You can continue manually.');
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to complete setup');
      }

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsSubmitting(false);
    }
  }

  // Add competitor helper
  function addCompetitor() {
    setData((prev) => ({
      ...prev,
      competitors: [...prev.competitors, { name: '', notes: '' }],
    }));
  }

  function updateCompetitor(index: number, field: 'name' | 'notes', value: string) {
    setData((prev) => {
      const updated = [...prev.competitors];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, competitors: updated };
    });
  }

  function removeCompetitor(index: number) {
    setData((prev) => ({
      ...prev,
      competitors: prev.competitors.filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="space-y-8">
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Step {step} of {TOTAL_STEPS}</span>
          <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Product basics */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Product basics</h2>
            <p className="text-sm text-muted-foreground">
              Tell us about your product. Be as rough as you want — AI will help refine it.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productName">Product name *</Label>
              <Input
                id="productName"
                value={data.productName}
                onChange={(e) => updateField('productName', e.target.value)}
                placeholder="e.g. Acme Analytics"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oneLiner">One-liner *</Label>
              <Input
                id="oneLiner"
                value={data.oneLiner}
                onChange={(e) => updateField('oneLiner', e.target.value)}
                placeholder="What does your product do in one sentence?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productCategory">Product category</Label>
              <Input
                id="productCategory"
                value={data.productCategory}
                onChange={(e) => updateField('productCategory', e.target.value)}
                placeholder="e.g. Marketing analytics, DevOps, CRM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessModel">Business model</Label>
              <Input
                id="businessModel"
                value={data.businessModel}
                onChange={(e) => updateField('businessModel', e.target.value)}
                placeholder="e.g. SaaS, freemium, usage-based"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => handleAiAssist(1)}
              disabled={isAiLoading || !data.productName}
            >
              {isAiLoading ? 'Thinking...' : 'AI Assist — refine my one-liner'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Target audience */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Target audience</h2>
            <p className="text-sm text-muted-foreground">
              Who is this product for? Rough notes are fine.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="icpDefinition">Ideal customer profile *</Label>
              <Textarea
                id="icpDefinition"
                value={data.icpDefinition}
                onChange={(e) => updateField('icpDefinition', e.target.value)}
                placeholder="Describe your ideal customer — company size, industry, stage, etc."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decisionMaker">Decision maker</Label>
              <Input
                id="decisionMaker"
                value={data.decisionMaker}
                onChange={(e) => updateField('decisionMaker', e.target.value)}
                placeholder="e.g. VP Marketing, Engineering Manager, Founder"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="primaryUseCase">Primary use case</Label>
              <Input
                id="primaryUseCase"
                value={data.primaryUseCase}
                onChange={(e) => updateField('primaryUseCase', e.target.value)}
                placeholder="What's the #1 thing they use your product for?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobsToBeDone">Jobs to be done</Label>
              <Textarea
                id="jobsToBeDone"
                value={data.jobsToBeDone}
                onChange={(e) => updateField('jobsToBeDone', e.target.value)}
                placeholder="List the jobs your customers hire your product to do"
                rows={3}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => handleAiAssist(2)}
              disabled={isAiLoading || !data.icpDefinition}
            >
              {isAiLoading ? 'Thinking...' : 'AI Assist — structure my ICP'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Positioning */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Positioning</h2>
            <p className="text-sm text-muted-foreground">
              What problem do you solve and why are you different?
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coreProblem">Core problem you solve *</Label>
              <Textarea
                id="coreProblem"
                value={data.coreProblem}
                onChange={(e) => updateField('coreProblem', e.target.value)}
                placeholder="What's the #1 problem your product exists to solve?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whyAlternativesFallShort">Why alternatives fall short</Label>
              <Textarea
                id="whyAlternativesFallShort"
                value={data.whyAlternativesFallShort}
                onChange={(e) => updateField('whyAlternativesFallShort', e.target.value)}
                placeholder="What do competitors or workarounds get wrong?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keyDifferentiators">Key differentiators</Label>
              <Textarea
                id="keyDifferentiators"
                value={data.keyDifferentiators}
                onChange={(e) => updateField('keyDifferentiators', e.target.value)}
                placeholder="What makes your approach different or better?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="positioningStatement">Positioning statement (AI will draft this)</Label>
              <Textarea
                id="positioningStatement"
                value={data.positioningStatement}
                onChange={(e) => updateField('positioningStatement', e.target.value)}
                placeholder="Click AI Assist to generate, or write your own"
                rows={3}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => handleAiAssist(3)}
              disabled={isAiLoading || !data.coreProblem}
            >
              {isAiLoading ? 'Thinking...' : 'AI Assist — draft positioning statement'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Messaging */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Messaging</h2>
            <p className="text-sm text-muted-foreground">
              Your value pillars and the language your customers use.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="valuePillars">Value pillars *</Label>
              <Textarea
                id="valuePillars"
                value={data.valuePillars}
                onChange={(e) => updateField('valuePillars', e.target.value)}
                placeholder="List 3-5 core value propositions, one per line"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerLanguage">Customer language</Label>
              <Textarea
                id="customerLanguage"
                value={data.customerLanguage}
                onChange={(e) => updateField('customerLanguage', e.target.value)}
                placeholder="Paste actual quotes from customers — how they describe the problem in their own words"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wordsToUse">Words to use</Label>
                <Textarea
                  id="wordsToUse"
                  value={data.wordsToUse}
                  onChange={(e) => updateField('wordsToUse', e.target.value)}
                  placeholder="Approved vocabulary, one per line"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wordsToAvoid">Words to avoid</Label>
                <Textarea
                  id="wordsToAvoid"
                  value={data.wordsToAvoid}
                  onChange={(e) => updateField('wordsToAvoid', e.target.value)}
                  placeholder="Banned vocabulary, one per line"
                  rows={3}
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => handleAiAssist(4)}
              disabled={isAiLoading || !data.valuePillars}
            >
              {isAiLoading ? 'Thinking...' : 'AI Assist — structure messaging pillars'}
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Competitive landscape */}
      {step === 5 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Competitive landscape</h2>
            <p className="text-sm text-muted-foreground">
              Add up to 5 competitors. Sparse is fine — &quot;we don&apos;t know much yet&quot; is a valid answer.
            </p>
          </div>
          <div className="space-y-4">
            {data.competitors.map((comp, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <Input
                    value={comp.name}
                    onChange={(e) => updateCompetitor(i, 'name', e.target.value)}
                    placeholder="Competitor name"
                  />
                  <Input
                    value={comp.notes}
                    onChange={(e) => updateCompetitor(i, 'notes', e.target.value)}
                    placeholder="Positioning notes (optional)"
                  />
                </div>
                {data.competitors.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCompetitor(i)}
                    className="mt-1"
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {data.competitors.length < 5 && (
              <Button variant="outline" size="sm" onClick={addCompetitor}>
                Add competitor
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 6: Team setup */}
      {step === 6 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Team setup</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re the admin. Optionally invite teammates now, or do it later from settings.
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-md border p-4 bg-muted/50">
              <p className="text-sm font-medium">Your account</p>
              <p className="text-sm text-muted-foreground">
                You&apos;ll be set up as the admin with full access.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamEmails">Invite teammates (optional)</Label>
              <Textarea
                id="teamEmails"
                value={data.teamEmails}
                onChange={(e) => updateField('teamEmails', e.target.value)}
                placeholder="Enter email addresses, one per line"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                They&apos;ll receive an email invite. You can always add more from settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 1}
        >
          Back
        </Button>

        {step < TOTAL_STEPS ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Setting up Quiver...' : 'Complete setup'}
          </Button>
        )}
      </div>
    </div>
  );
}
