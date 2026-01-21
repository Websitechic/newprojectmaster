-- Add missing columns to review_links table for comment functionality
-- These columns were added to the Drizzle schema but not properly migrated to production

-- Add review_comment column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'review_links' AND column_name = 'review_comment'
    ) THEN
        ALTER TABLE review_links ADD COLUMN review_comment TEXT;
        RAISE NOTICE 'Added review_comment column to review_links';
    END IF;
END $$;

-- Add commented_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'review_links' AND column_name = 'commented_at'
    ) THEN
        ALTER TABLE review_links ADD COLUMN commented_at TIMESTAMP;
        RAISE NOTICE 'Added commented_at column to review_links';
    END IF;
END $$;
