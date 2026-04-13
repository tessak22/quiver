// Netlify scheduled function — equivalent to the vercel.json cron for /api/cron/pattern-report.
// Runs on the 1st of each month. Calls the existing Next.js API route so no logic is duplicated.
import type { Config } from '@netlify/functions';

export default async function handler(): Promise<void> {
  const baseUrl = process.env.URL;
  if (!baseUrl) {
    console.error('[pattern-report] URL environment variable not set — cannot call cron endpoint');
    return;
  }
  const res = await fetch(`${baseUrl}/api/cron/pattern-report`);
  if (!res.ok) {
    console.error(`[pattern-report] cron endpoint returned ${res.status}`);
  }
}

export const config: Config = {
  schedule: '0 0 1 * *',
};
