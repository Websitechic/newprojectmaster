
<contents>
-- Add timer_sessions column to tasks table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tasks' AND column_name = 'timer_sessions'
  ) THEN
    ALTER TABLE tasks ADD COLUMN timer_sessions JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
</contents>
