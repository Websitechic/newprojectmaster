
-- Update complaints table to have proper column names
DO $$ 
BEGIN
    -- Update complaints table columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'screenshot_url') THEN
        ALTER TABLE complaints RENAME COLUMN screenshot_path TO screenshot_url;
    END IF;
    
    -- Ensure staff_complaints table has proper columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_complaints' AND column_name = 'screenshot_url') THEN
        ALTER TABLE staff_complaints ADD COLUMN screenshot_url text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_complaints' AND column_name = 'detailed_explanation') THEN
        ALTER TABLE staff_complaints ADD COLUMN detailed_explanation text NOT NULL DEFAULT '';
    END IF;
END $$;
