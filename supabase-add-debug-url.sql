-- Add debug_events_url column to runs table
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

ALTER TABLE runs ADD COLUMN IF NOT EXISTS debug_events_url TEXT;

COMMENT ON COLUMN runs.debug_events_url IS 'Supabase Storage public URL for debug events JSON (set by pipeline when --debug flag is active)';
