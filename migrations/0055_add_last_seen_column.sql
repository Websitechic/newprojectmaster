
-- Add last_seen column to users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_seen') THEN
    ALTER TABLE users ADD COLUMN last_seen TIMESTAMP DEFAULT NOW();
    RAISE NOTICE 'Added last_seen column to users table';
  ELSE
    RAISE NOTICE 'last_seen column already exists';
  END IF;
END $$;
