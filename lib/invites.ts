import type { TeamRole } from '@/types';
import { safeErrorMessage } from '@/lib/utils';
import { getAppUrl, getSupabaseAdminClient } from '@/lib/env';

export interface InviteTeamMemberResult {
  email: string;
  success: boolean;
  error?: string;
}

function getInviteRedirectUrl(): string {
  return new URL('/invite', getAppUrl()).toString();
}

export async function inviteTeamMemberByEmail(
  email: string,
  role: TeamRole = 'member'
): Promise<InviteTeamMemberResult> {
  const adminClient = getSupabaseAdminClient();

  try {
    const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: getInviteRedirectUrl(),
      data: { role },
    });

    if (error) {
      return {
        email,
        success: false,
        error: error.message,
      };
    }

    return { email, success: true };
  } catch (err) {
    return {
      email,
      success: false,
      error: safeErrorMessage(err, `Failed to invite ${email}`),
    };
  }
}
