
-- Add onboarding_status column to users table
ALTER TABLE users ADD COLUMN onboarding_status TEXT DEFAULT 'not_onboarded';

-- Add check constraint for valid onboarding status values
ALTER TABLE users ADD CONSTRAINT users_onboarding_status_check 
  CHECK (onboarding_status IN ('onboarded', 'not_onboarded', 'onboarding_in_progress', 'onboarding_pending'));
