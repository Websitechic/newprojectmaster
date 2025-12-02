
-- Apply missing migrations to production database

-- First, ensure break_two_time is removed (from migration 0030)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'break_two_time'
    ) THEN
        UPDATE users SET break_two_time = NULL WHERE break_two_time IS NOT NULL;
        COMMENT ON COLUMN users.break_two_time IS 'DEPRECATED: No longer used. Only breakOneTime is used for daily breaks.';
    END IF;
END $$;

-- Create general channel messages table (from migration 0047)
CREATE TABLE IF NOT EXISTS general_channel_messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP,
  is_edited BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_general_channel_messages_created_at ON general_channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_general_channel_messages_sender_id ON general_channel_messages(sender_id);

-- Create general channel read receipts table
CREATE TABLE IF NOT EXISTS general_channel_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES general_channel_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_general_channel_read_receipts_user_id ON general_channel_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_general_channel_read_receipts_message_id ON general_channel_read_receipts(message_id);

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('general_channel_messages', 'general_channel_read_receipts')
ORDER BY table_name;
