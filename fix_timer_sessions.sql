
-- Add timer_sessions column to track individual start-stop sessions
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timer_sessions JSONB DEFAULT '[]'::jsonb;

-- Initialize timer_sessions for existing tasks with timeSpent
-- This creates a single historical session for tasks that have accumulated time
UPDATE tasks 
SET timer_sessions = jsonb_build_array(
  jsonb_build_object(
    'startTime', (updated_at - (time_spent || ' seconds')::interval)::text,
    'endTime', updated_at::text,
    'duration', time_spent
  )
)
WHERE time_spent > 0 AND (timer_sessions IS NULL OR timer_sessions = '[]'::jsonb);

-- Set empty array for tasks without time spent
UPDATE tasks 
SET timer_sessions = '[]'::jsonb
WHERE timer_sessions IS NULL;
