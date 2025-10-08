
-- Create enum type for project manager types
DO $$ BEGIN
    CREATE TYPE project_manager_type AS ENUM ('main', 'supervisor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add projectManagerType column to users table (matching the camelCase in schema)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "projectManagerType" project_manager_type;
