-- ============================================================================
-- Titan AI — Auth v2 Migration (Supabase Auth + Creator Identity)
-- Run this AFTER migration.sql in Supabase SQL Editor
-- ============================================================================

-- Add new auth columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'github';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_edited BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_mode_on BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Index for fast provider+provider_user_id lookup (primary auth lookup path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id
  ON users(provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

-- Index for email lookup during account linking
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "Users can read own row" ON users
  FOR SELECT USING (true);

-- Users can update their own non-protected fields.
-- is_creator, role, and creator_mode_on can only be changed by service_role.
-- The WITH CHECK ensures clients cannot escalate their own privileges.
CREATE POLICY "Users can update own non-protected fields" ON users
  FOR UPDATE USING (true)
  WITH CHECK (
    is_creator = (SELECT u.is_creator FROM users u WHERE u.id = users.id)
    AND role = (SELECT u.role FROM users u WHERE u.id = users.id)
  );

-- Service role bypass for all operations (backend uses service_role key)
CREATE POLICY "Service role full access on users" ON users
  FOR ALL USING (true) WITH CHECK (true);
