'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import type { TeamRole } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMemberRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface SkillsInfo {
  pinnedVersion: string;
  skillCount: number;
  skillNames: string[];
}

interface CurrentUser {
  id: string;
  role: TeamRole;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function maskApiKey(key: string | null): string {
  if (!key) return 'Configured via environment variable';
  if (key.length <= 8) return key;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'admin':
      return 'default';
    case 'member':
      return 'secondary';
    case 'viewer':
      return 'outline';
    default:
      return 'secondary';
  }
}

function formatSkillName(dirName: string): string {
  return dirName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // ---- State ----
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [skills, setSkills] = useState<SkillsInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [apiKeyHint, setApiKeyHint] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Role change
  const [roleChangeBusy, setRoleChangeBusy] = useState<string | null>(null);

  // Remove member
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  // Skills update
  const [skillsUpdateBusy, setSkillsUpdateBusy] = useState(false);
  const [skillsUpdateMsg, setSkillsUpdateMsg] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // ---- Computed: admin count for last-admin protection ----
  const adminCount = members.filter((m) => m.role === 'admin').length;

  function isLastAdmin(memberId: string): boolean {
    const member = members.find((m) => m.id === memberId);
    return member?.role === 'admin' && adminCount <= 1;
  }

  // ---- Data loading ----
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamRes, skillsRes] = await Promise.all([
        fetch('/api/team'),
        fetch('/api/settings/skills'),
      ]);

      if (!teamRes.ok) throw new Error('Failed to load team data');
      if (!skillsRes.ok) throw new Error('Failed to load skills data');

      const teamData = (await teamRes.json()) as { members: TeamMemberRecord[] };
      const skillsData = (await skillsRes.json()) as SkillsInfo;

      setMembers(teamData.members);
      setSkills(skillsData);

      // Check API key status from server
      const keyRes = await fetch('/api/settings/api-key-status');
      if (keyRes.ok) {
        const keyData: { isSet: boolean; hint: string | null } = await keyRes.json();
        setApiKeyHint(keyData.hint);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const res = await fetch('/api/settings/me');
        if (res.ok) {
          const data = (await res.json()) as CurrentUser;
          setCurrentUser(data);
        }
      } catch {
        // Non-critical — fall back to read-only
      }
    }
    fetchCurrentUser();
  }, []);

  // ---- Invite handler ----
  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || 'Failed to send invite');
      }

      setInviteSuccess(true);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteBusy(false);
    }
  }

  // ---- Role change handler ----
  async function handleRoleChange(memberId: string, newRole: TeamRole) {
    setRoleChangeBusy(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || 'Failed to change role');
      }

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setRoleChangeBusy(null);
    }
  }

  // ---- Remove member handler ----
  async function handleRemoveMember(memberId: string) {
    setRemoveBusy(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || 'Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveBusy(null);
    }
  }

  // ---- Skills update handler ----
  async function handleSkillsUpdate() {
    setSkillsUpdateBusy(true);
    setSkillsUpdateMsg(null);
    try {
      // In v1 this is informational — a real implementation would trigger
      // a server-side git pull. For now, we simulate the intent.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSkillsUpdateMsg(
        'Skills update requested. In a production deployment, this would pull the latest skills from GitHub.'
      );
    } finally {
      setSkillsUpdateBusy(false);
    }
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <LoadingSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your API keys, team, and skills configuration.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>

        {/* ================================================================
            API Key Management
            ================================================================ */}
        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">API Key</CardTitle>
              <CardDescription>
                Anthropic API key used for AI-powered features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Key</Label>
                <div className="flex items-center gap-3">
                  <code className="rounded bg-muted px-3 py-2 font-mono text-sm">
                    {maskApiKey(apiKeyHint)}
                  </code>
                  {apiKeyHint ? (
                    <Badge variant="secondary">Configured</Badge>
                  ) : (
                    <Badge variant="outline">Not set</Badge>
                  )}
                </div>
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">
                API key is configured via environment variables. Update it in
                your deployment settings (e.g.{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  ANTHROPIC_API_KEY
                </code>
                ).
              </p>
              {!isAdmin && currentUser && (
                <p className="text-sm text-muted-foreground italic">
                  Only admins can update deployment configuration.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            Team Management
            ================================================================ */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Team Members</CardTitle>
              <CardDescription>
                Manage who has access to this Quiver instance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ---- Members table ---- */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Email</th>
                      <th className="pb-2 pr-4 font-medium">Role</th>
                      <th className="pb-2 pr-4 font-medium">Joined</th>
                      {isAdmin && (
                        <th className="pb-2 font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const memberIsLastAdmin = isLastAdmin(member.id);
                      const isSelf = member.id === currentUser?.id;

                      return (
                        <tr key={member.id} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <span className="font-medium">{member.name}</span>
                            {isSelf && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {member.email}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant={roleBadgeVariant(member.role)}>
                              {member.role}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {formatDate(member.createdAt)}
                          </td>
                          {isAdmin && (
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                {/* Role dropdown */}
                                <Select
                                  value={member.role}
                                  onValueChange={(val) =>
                                    handleRoleChange(
                                      member.id,
                                      val as TeamRole
                                    )
                                  }
                                  disabled={
                                    memberIsLastAdmin ||
                                    roleChangeBusy === member.id
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[110px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="member">
                                      Member
                                    </SelectItem>
                                    <SelectItem value="viewer">
                                      Viewer
                                    </SelectItem>
                                  </SelectContent>
                                </Select>

                                {/* Remove button with confirmation dialog */}
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      disabled={
                                        memberIsLastAdmin ||
                                        removeBusy === member.id
                                      }
                                    >
                                      {removeBusy === member.id
                                        ? 'Removing...'
                                        : 'Remove'}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Remove team member</DialogTitle>
                                      <DialogDescription>
                                        Are you sure you want to remove{' '}
                                        <strong>{member.name}</strong> (
                                        {member.email}) from the team? This
                                        action cannot be undone.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <DialogClose asChild>
                                        <Button variant="outline">Cancel</Button>
                                      </DialogClose>
                                      <DialogClose asChild>
                                        <Button
                                          variant="destructive"
                                          onClick={() =>
                                            handleRemoveMember(member.id)
                                          }
                                        >
                                          Remove
                                        </Button>
                                      </DialogClose>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>

                                {memberIsLastAdmin && (
                                  <span className="text-xs text-muted-foreground">
                                    Last admin
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {members.length === 0 && (
                      <tr>
                        <td
                          colSpan={isAdmin ? 5 : 4}
                          className="py-6 text-center text-muted-foreground"
                        >
                          No team members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ---- Invite form (admin only) ---- */}
              {isAdmin && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-base font-semibold">
                      Invite a new member
                    </h3>

                    {inviteSuccess && (
                      <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                        Invite sent successfully.
                      </div>
                    )}
                    {inviteError && (
                      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        {inviteError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="invite-email">Email address</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="teammate@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          disabled={inviteBusy}
                        />
                      </div>
                      <div className="w-[140px] space-y-1.5">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={(val) =>
                            setInviteRole(val as TeamRole)
                          }
                          disabled={inviteBusy}
                        >
                          <SelectTrigger id="invite-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={handleInvite}
                        disabled={inviteBusy || !inviteEmail.trim()}
                      >
                        {inviteBusy ? 'Sending...' : 'Send invite'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Viewers can browse sessions and artifacts but cannot
                      create or modify content.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            Skills Management
            ================================================================ */}
        <TabsContent value="skills">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Skills</CardTitle>
              <CardDescription>
                AI skill packs loaded into this Quiver instance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pinned version */}
              <div className="space-y-2">
                <Label>Pinned Version</Label>
                <div className="flex items-center gap-3">
                  <code className="rounded bg-muted px-3 py-2 font-mono text-sm">
                    {skills?.pinnedVersion ?? 'unknown'}
                  </code>
                  <Badge variant="secondary">
                    {skills?.skillCount ?? 0} skills loaded
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Skills list */}
              <div className="space-y-2">
                <Label>Loaded Skills</Label>
                {skills && skills.skillNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.skillNames.map((name) => (
                      <Badge key={name} variant="outline">
                        {formatSkillName(name)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No skills found in the skills directory.
                  </p>
                )}
              </div>

              <Separator />

              {/* Update button (admin only) */}
              {isAdmin ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleSkillsUpdate}
                    disabled={skillsUpdateBusy}
                  >
                    {skillsUpdateBusy
                      ? 'Checking for updates...'
                      : 'Update skills'}
                  </Button>
                  {skillsUpdateMsg && (
                    <p className="text-sm text-muted-foreground">
                      {skillsUpdateMsg}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Pulls the latest skill definitions from the upstream GitHub
                    repository.
                  </p>
                </div>
              ) : (
                currentUser && (
                  <p className="text-sm text-muted-foreground italic">
                    Only admins can update skills.
                  </p>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
