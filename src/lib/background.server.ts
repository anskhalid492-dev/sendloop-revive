/**
 * Background work that survives the response.
 *
 * The serverless runtime cancels any promise still in flight when the request
 * ends or the client disconnects. A webhook sender that gives up after a few
 * seconds therefore kills processing mid-way, leaving the stored event stuck
 * with no error recorded. Registering the promise with the platform's
 * `waitUntil` keeps it running after we answer.
 */

type WaitUntil = (promise: Promise<unknown>) => void;

let cached: WaitUntil | null | undefined;

async function resolveWaitUntil(): Promise<WaitUntil | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as {
      waitUntil?: WaitUntil;
    };
    cached = typeof mod.waitUntil === "function" ? mod.waitUntil.bind(mod) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Keeps `work` running after the response is sent when the runtime supports it.
 * Returns true when the work was handed to the platform, false when the caller
 * must await it itself.
 */
export async function keepAlive(work: Promise<unknown>): Promise<boolean> {
  const waitUntil = await resolveWaitUntil();
  if (!waitUntil) return false;
  try {
    waitUntil(work);
    return true;
  } catch {
    return false;
  }
}

/** Resolves to `timeoutValue` when `work` has not settled within `ms`. */
export async function settleWithin<T, F>(work: Promise<T>, ms: number, timeoutValue: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(timeoutValue), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
