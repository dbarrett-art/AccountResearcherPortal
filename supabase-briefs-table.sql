-- Briefs table: stores structured JSON output from each pipeline run
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL UNIQUE,
  pov_json JSONB NOT NULL,
  personas_json JSONB,               -- null on --no-contacts runs
  schema_version INTEGER DEFAULT 1,  -- increment when POV schema changes significantly
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by run_id
CREATE INDEX briefs_run_id_idx ON briefs(run_id);

-- Enable RLS
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

-- AEs can read briefs for their own runs
CREATE POLICY "briefs_read_own"
ON briefs FOR SELECT
USING (
  run_id IN (
    SELECT id FROM runs WHERE user_id = auth.uid()
  )
);

-- Managers can read briefs for their direct reports' runs
CREATE POLICY "briefs_read_reports"
ON briefs FOR SELECT
USING (
  run_id IN (
    SELECT r.id FROM runs r
    JOIN users u ON r.user_id = u.id
    WHERE u.manager_id = auth.uid()
  )
);

-- Admins can read all briefs
CREATE POLICY "briefs_admin_read_all"
ON briefs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Service role INSERT policy (for pipeline write-back via service key)
CREATE POLICY "briefs_service_insert"
ON briefs FOR INSERT
WITH CHECK (true);

-- Add brief_id FK to runs table
ALTER TABLE runs ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id);

-- Enable realtime on briefs (so portal knows when brief lands after status=complete)
ALTER PUBLICATION supabase_realtime ADD TABLE briefs;
