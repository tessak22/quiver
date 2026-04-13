// Netlify scheduled function — equivalent to the vercel.json cron for /api/cron/digest.
// Runs hourly. Calls the existing Next.js API route so no logic is duplicated.
import type { Config } from '@netlify/functions';

export default async function handler(): Promise<void> {
  const baseUrl = process.env.URL;
  if (!baseUrl) {
    console.error('[digest] URL environment variable not set — cannot call cron endpoint');
    return;
  }
  const res = await fetch(`${baseUrl}/api/cron/digest`);
  if (!res.ok) {
    console.error(`[digest] cron endpoint returned ${res.status}`);
  }
}

export const config: Config = {
  schedule: '0 * * * *',
};
