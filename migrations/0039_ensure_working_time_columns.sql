
-- Ensure working_hours and working_minutes columns exist
DO $$ 
BEGIN
    -- Add working_minutes if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'working_minutes'
    ) THEN
        ALTER TABLE tasks ADD COLUMN working_minutes INTEGER DEFAULT 0;
    END IF;

    -- Ensure working_hours exists (it should already)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'working_hours'
    ) THEN
        ALTER TABLE tasks ADD COLUMN working_hours INTEGER DEFAULT 0;
    END IF;
END $$;

-- Set default values for existing null records
UPDATE tasks 
SET working_hours = 0 
WHERE working_hours IS NULL;

UPDATE tasks 
SET working_minutes = 0 
WHERE working_minutes IS NULL;
