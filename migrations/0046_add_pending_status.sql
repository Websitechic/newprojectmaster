
-- Add 'pending' status to task status enum
-- This migration adds the 'pending' status to the existing task status enum
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('todo', 'in_progress', 'completed', 'review', 'technical_support', 'pending'));
