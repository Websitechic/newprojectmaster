
-- Add workingMinutes column to tasks table
ALTER TABLE tasks ADD COLUMN working_minutes INTEGER;

-- For existing tasks, if workingHours is stored as total minutes, split it into hours and minutes
-- This assumes workingHours currently contains total minutes
UPDATE tasks 
SET 
  working_minutes = working_hours % 60,
  working_hours = FLOOR(working_hours / 60)
WHERE working_hours IS NOT NULL;
