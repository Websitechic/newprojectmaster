
-- Create general messages table
CREATE TABLE IF NOT EXISTS general_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  is_edited BOOLEAN DEFAULT FALSE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_general_messages_created_at ON general_messages(created_at DESC);

-- Create read receipts for general messages
CREATE TABLE IF NOT EXISTS general_message_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES general_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_general_message_read_receipts_user ON general_message_read_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_general_message_read_receipts_message ON general_message_read_receipts(message_id);
