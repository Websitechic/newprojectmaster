
-- Fix missing screenshot_url column in issue_reports table
DO $$ 
BEGIN
    -- Check if the table exists first
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'issue_reports'
    ) THEN
        -- Check if column exists, if not add it
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'issue_reports' 
            AND column_name = 'screenshot_url'
        ) THEN
            ALTER TABLE "issue_reports" ADD COLUMN "screenshot_url" text;
            RAISE NOTICE 'Added screenshot_url column to issue_reports table';
        ELSE
            RAISE NOTICE 'screenshot_url column already exists in issue_reports table';
        END IF;
    ELSE
        RAISE NOTICE 'issue_reports table does not exist';
    END IF;
END $$;
