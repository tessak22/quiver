import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/shared/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Verify team membership — redirect non-members
  const member = await prisma.teamMember.findUnique({
    where: { id: user.id },
    select: { name: true, role: true },
  });

  if (!member) {
    redirect('/login');
  }

  // Get active context version for header
  const activeContext = await prisma.contextVersion.findFirst({
    where: { isActive: true },
    select: { id: true, version: true },
  });

  // Get pending proposals count
  const pendingProposals = await prisma.performanceLog.count({
    where: { contextUpdateStatus: 'pending' },
  });

  return (
    <AppShell
      user={{ name: member.name, role: member.role }}
      contextVersion={activeContext ? activeContext.version : null}
      pendingProposals={pendingProposals}
    >
      {children}
    </AppShell>
  );
}
