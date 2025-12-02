
-- Apply General Channel Migration
-- Run this on your production database

-- Create general_channel_messages table
CREATE TABLE IF NOT EXISTS general_channel_messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP,
  is_edited BOOLEAN DEFAULT FALSE,
  CONSTRAINT fk_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_general_channel_messages_created_at ON general_channel_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_general_channel_messages_sender_id ON general_channel_messages(sender_id);

-- Create read receipts for general channel
CREATE TABLE IF NOT EXISTS general_channel_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES general_channel_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_general_channel_read_receipts_user_id ON general_channel_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_general_channel_read_receipts_message_id ON general_channel_read_receipts(message_id);

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'general_channel%'
ORDER BY table_name;
