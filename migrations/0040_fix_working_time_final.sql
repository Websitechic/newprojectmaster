
-- Comprehensive fix for working_hours and working_minutes columns
-- This script is safe to run multiple times

-- First, check and add working_minutes if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'working_minutes'
    ) THEN
        ALTER TABLE tasks ADD COLUMN working_minutes INTEGER;
        RAISE NOTICE 'Added working_minutes column';
    ELSE
        RAISE NOTICE 'working_minutes column already exists';
    END IF;
END $$;

-- Ensure working_hours column exists (it should, but let's be safe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'working_hours'
    ) THEN
        ALTER TABLE tasks ADD COLUMN working_hours INTEGER;
        RAISE NOTICE 'Added working_hours column';
    ELSE
        RAISE NOTICE 'working_hours column already exists';
    END IF;
END $$;

-- Set default values for NULL records
UPDATE tasks 
SET working_hours = 0 
WHERE working_hours IS NULL;

UPDATE tasks 
SET working_minutes = 0 
WHERE working_minutes IS NULL;

-- Add default constraints if they don't exist
DO $$
BEGIN
    BEGIN
        ALTER TABLE tasks ALTER COLUMN working_hours SET DEFAULT 0;
        RAISE NOTICE 'Set default for working_hours';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Default for working_hours already set or error occurred';
    END;

    BEGIN
        ALTER TABLE tasks ALTER COLUMN working_minutes SET DEFAULT 0;
        RAISE NOTICE 'Set default for working_minutes';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Default for working_minutes already set or error occurred';
    END;
END $$;

-- Verify the columns exist
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'tasks' 
AND column_name IN ('working_hours', 'working_minutes')
ORDER BY column_name;
