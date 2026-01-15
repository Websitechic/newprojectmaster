-- Add review_comment and commented_at columns to review_links table
-- Also update the status check constraint to include new statuses

-- Add new columns if they don't exist
ALTER TABLE review_links ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE review_links ADD COLUMN IF NOT EXISTS commented_at TIMESTAMP;

-- Update the status constraint to include new values (needs_revision, not_approved)
-- First drop the existing constraint if it exists
DO $$ 
BEGIN
    ALTER TABLE review_links DROP CONSTRAINT IF EXISTS review_links_status_check;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Add new check constraint with all valid statuses
ALTER TABLE review_links ADD CONSTRAINT review_links_status_check 
CHECK (status IN ('pending', 'reviewed', 'needs_revision', 'not_approved'));
