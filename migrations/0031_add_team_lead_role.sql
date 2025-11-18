
-- Add team_lead role to existing role enum
-- This migration adds the team_lead role to support the new Team Lead position

-- First, check if the value already exists and add it if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'team_lead' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'user_role'
        )
    ) THEN
        ALTER TYPE user_role ADD VALUE 'team_lead';
    END IF;
END$$;
