-- =============================================================================
-- Clients Feature Migration
-- Run this in your Supabase SQL Editor
-- =============================================================================

-- 1. Add feature flag to workspaces table
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS enable_client_tracker boolean DEFAULT false;

-- 2. Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'potential'
    CHECK (status IN ('potential', 'negotiating', 'active')),
  phone text,
  email text,
  website text,
  social_links jsonb DEFAULT '{}'::jsonb
  -- social_links shape: { instagram?: string, facebook?: string, tiktok?: string, linkedin?: string }
);

-- 3. Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy — same pattern as tasks/tools
CREATE POLICY "Allow full access to authenticated users"
  ON clients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
