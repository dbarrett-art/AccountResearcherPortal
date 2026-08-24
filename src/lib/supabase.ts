import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://yeraphdhllaylogqiqht.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmFwaGRobGxheWxvZ3FpcWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDY4NjQsImV4cCI6MjA5MDA4Mjg2NH0.5ZIIIoYU3-4ZoGX448LMyuKfu4ncmIUVwyNDImEsVTY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Worker base URL. Defaults to production; VITE_WORKER_BASE points a local dev
 * server at a `wrangler dev` Worker, which is the only way to exercise a Worker
 * endpoint that has not been deployed yet. A production build has no such env
 * var, so the default is what ships.
 */
const WORKER_BASE = import.meta.env.VITE_WORKER_BASE || 'https://go.accountresearch.workers.dev';

/**
 * Fetch wrapper for Worker API calls that always uses a fresh Supabase JWT.
 * Checks token expiry and refreshes if needed before each request.
 */
export async function workerFetch(
  path: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<Response> {
  let { data: { session } } = await supabase.auth.getSession();

  // getSession() returns from memory — token may be expired.
  // Refresh if expired or expiring within 60 seconds.
  if (session?.expires_at && session.expires_at - Math.floor(Date.now() / 1000) < 60) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    session = refreshed;
  }

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(`${WORKER_BASE}${path}`, { ...init, headers });
}

/**
 * Brief artifacts live in the `briefs` Storage bucket, which is private. The
 * absolute URLs still sitting in `runs.pdf_url` and friends are dead links; the
 * only way in is the Worker, which runs the run-ownership check and then mints a
 * signed URL valid for a few minutes.
 *
 * Callers should treat `runs.pdf_url` as a boolean ("is there a PDF?") and never
 * as an href.
 */
export type BriefArtifact = 'pdf' | 'excel' | 'pdf-v2' | 'debug-events';

/** Mint a short-lived signed URL for one artifact of one run. Throws on refusal. */
export async function briefFileUrl(runId: string, artifact: BriefArtifact = 'pdf'): Promise<string> {
  // ?json=1 rather than following the endpoint's default 302: window.open() on a
  // redirect cannot carry the Authorization header, and putting the JWT in a
  // query string would write it into every log between here and Supabase.
  const res = await workerFetch(`/brief/${runId}/${artifact}?json=1`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  const { signedUrl } = await res.json();
  if (!signedUrl) throw new Error('No signed URL returned');
  return signedUrl;
}

/** Open one artifact of one run in a new tab. */
export async function openBriefFile(runId: string, artifact: BriefArtifact = 'pdf'): Promise<void> {
  window.open(await briefFileUrl(runId, artifact), '_blank');
}
