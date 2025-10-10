-- This migration is no longer needed as onboarding_status was already added in migration 0004
-- Keeping this file for migration history but making it a no-op

-- The onboarding_status column was already added in migration 0004_reflective_meteorite.sql
-- No action needed here
-- Make this migration idempotent by checking if column exists first
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_status'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "onboarding_status" text DEFAULT 'not_onboarded';
    END IF;
END $$;