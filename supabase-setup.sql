-- ============================================================
-- M4S Research Portal — Supabase Setup SQL
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Fix RLS on users table (drop recursive policies, create clean ones)
-- -----------------------------------------------------------------------

-- Drop all existing policies on users to clear the recursion
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.users;
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_update_any" ON public.users;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.users;

-- Make sure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read their own row
-- (NO subquery back to users table — avoids recursion)
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: authenticated users can read other users (needed for team view, admin)
-- Uses auth.jwt() to check role claim instead of querying users table
CREATE POLICY "users_select_all_for_managers"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);
  -- Note: all authenticated users can see the users list.
  -- Role-based filtering is done in the app. This avoids the recursion
  -- that comes from a policy that queries the users table itself.

-- Policy: users can update their own row (non-sensitive fields ONLY)
-- SECURITY: role, credits_remaining, and manager_id are protected — users cannot
-- self-promote to admin or grant themselves credits. Admin operations route through
-- the Cloudflare Worker (service key, bypasses RLS).
CREATE POLICY "users_update_own_profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND credits_remaining = (SELECT credits_remaining FROM public.users WHERE id = auth.uid())
    AND manager_id IS NOT DISTINCT FROM (SELECT manager_id FROM public.users WHERE id = auth.uid())
  );

-- Policy: allow insert (for auto-provisioning new users)
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Service role bypasses RLS, so the worker and GHA are unaffected.


-- 2. Fix RLS on runs table
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "runs_select_policy" ON public.runs;
DROP POLICY IF EXISTS "runs_insert_policy" ON public.runs;
DROP POLICY IF EXISTS "runs_update_policy" ON public.runs;
DROP POLICY IF EXISTS "Users can view own runs" ON public.runs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.runs;

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- Users can read their own runs, runs assigned to them, + admins/managers can read all
-- Duplicate check uses service key (Worker), so this doesn't affect it
CREATE POLICY "runs_select_own_or_assigned_or_admin"
  ON public.runs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Users can insert their own runs (though worker handles this via service key)
CREATE POLICY "runs_insert_authenticated"
  ON public.runs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());


-- 3. Fix RLS on credit_grants table
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "credit_grants_select_policy" ON public.credit_grants;
DROP POLICY IF EXISTS "credit_grants_insert_policy" ON public.credit_grants;

ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_grants_select_authenticated"
  ON public.credit_grants FOR SELECT
  TO authenticated
  USING (true);

-- credit_grants INSERT restricted to service role only (Worker uses service key)
-- No authenticated INSERT policy — prevents users from forging audit trail entries


-- 4. Ensure Realtime is enabled on runs table
-- -----------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;


-- 5. Auto-provision user trigger
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow @figma.com email addresses (server-side enforcement)
  IF NEW.email NOT LIKE '%@figma.com' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.users (id, email, name, role, credits_remaining)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'ae',
    5
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- 6. Ensure health_log table exists (for service health tracking)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  service text NOT NULL,
  status text NOT NULL,
  message text,
  run_id uuid REFERENCES public.runs(id)
);

ALTER TABLE public.health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_log_select_authenticated"
  ON public.health_log FOR SELECT
  TO authenticated
  USING (true);

-- health_log INSERT restricted to service role only (Worker uses service key)
-- No authenticated INSERT policy — prevents users from injecting fake health records


-- 7. Verify your user row exists and is admin
-- -----------------------------------------------------------------------
-- Replace YOUR_AUTH_USER_UUID and YOUR_EMAIL with your auth.users values
INSERT INTO public.users (id, email, name, role, credits_remaining)
VALUES (
  'YOUR_AUTH_USER_UUID',  -- Replace with your auth.users id
  'your-email@figma.com', -- Replace with your email
  'Your Name',
  'admin',
  20
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  credits_remaining = GREATEST(public.users.credits_remaining, 20);
