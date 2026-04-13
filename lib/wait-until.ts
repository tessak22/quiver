// Platform-agnostic waitUntil shim.
// On Vercel: delegates to @vercel/functions to keep the function alive after the HTTP
// response is sent, allowing async AI processing to complete without timing out.
// On Netlify / self-hosted: fire-and-forget — the response returns immediately and
// the promise runs until the function timeout; log any errors so they surface in logs.

type WaitUntilFn = (promise: Promise<unknown>) => void;

function makeWaitUntil(): WaitUntilFn {
  if (process.env.VERCEL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('@vercel/functions') as { waitUntil: WaitUntilFn }).waitUntil;
    } catch {
      // @vercel/functions unavailable despite VERCEL env — fall through
    }
  }
  return (promise) => {
    promise.catch((err) => console.error('[wait-until] background task error:', err));
  };
}

export const waitUntil = makeWaitUntil();
