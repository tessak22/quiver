import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  assertOnboardingNotCompleted,
  ensureAdminTeamMember,
  initializeWorkspace,
  parseOnboardingInput,
  sendOnboardingInvites,
} from '@/lib/onboarding';

export async function POST(request: Request) {
  try {
    const auth = await getAuthUser();
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!auth.email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const parsed = await parseJsonBody(request);
    if (parsed.error) return parsed.error;
    const onboardingInput = parseOnboardingInput(parsed.data);

    await assertOnboardingNotCompleted();
    await ensureAdminTeamMember(auth.id, auth.email);
    await initializeWorkspace(onboardingInput, auth.id);

    const inviteFailures = await sendOnboardingInvites(onboardingInput.inviteEmails);

    if (inviteFailures.length > 0) {
      console.error('[onboarding/complete] Some team invites failed', {
        inviteFailures,
      });
    }

    const response = NextResponse.json({
      success: true,
      inviteFailures,
    });
    response.cookies.set('quiver_onboarded', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
    });

    return response;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Required fields missing')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message.startsWith('Onboarding already completed')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }

    console.error('[onboarding/complete] Failed to complete onboarding', {
      error: err,
    });
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to complete onboarding') },
      { status: 500 }
    );
  }
}
