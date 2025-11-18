
-- Create enum type for project manager types
DO $$ BEGIN
    CREATE TYPE project_manager_type AS ENUM ('main', 'supervisor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Drop incorrectly named column if it exists
ALTER TABLE users DROP COLUMN IF EXISTS "projectManagerType";

-- Add project_manager_type column to users table (matching schema snake_case)
ALTER TABLE users ADD COLUMN IF NOT EXISTS project_manager_type project_manager_type;
