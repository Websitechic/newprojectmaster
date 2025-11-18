
-- Add is_edited column to project_messages table
ALTER TABLE project_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
