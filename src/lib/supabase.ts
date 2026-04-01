import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://yeraphdhllaylogqiqht.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmFwaGRobGxheWxvZ3FpcWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDY4NjQsImV4cCI6MjA5MDA4Mjg2NH0.5ZIIIoYU3-4ZoGX448LMyuKfu4ncmIUVwyNDImEsVTY'
);

const WORKER_BASE = 'https://go.accountresearch.workers.dev';

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
