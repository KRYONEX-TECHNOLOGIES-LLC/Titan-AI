-- ============================================================================
-- Titan AI — Auth v3 Fixes (GitHub Device Flow + Creator identity persistence)
-- Run this in Supabase SQL Editor
-- ============================================================================

BEGIN;

-- Ensure users table exists
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  github_id     BIGINT,
  username      TEXT NOT NULL,
  name          TEXT,
  email         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure v2 auth columns exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'github';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_edited BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_mode_on BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Make github_id nullable and non-unique (required for non-GitHub OAuth users)
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;

-- Drop the UNIQUE constraint on github_id (PostgreSQL names it users_github_id_key).
-- Must drop constraint, not index; otherwise: "cannot drop index ... because constraint ... requires it"
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_github_id_key;

-- Ensure required auth indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id
  ON users(provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

COMMIT;
