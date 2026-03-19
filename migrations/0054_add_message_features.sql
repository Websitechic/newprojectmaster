
-- Add last seen to users table if not exists
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen" timestamp DEFAULT now();

-- Add pinned message support to general channel
ALTER TABLE "general_channel_messages" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false;

-- Ensure read receipts tables exist with proper indexes
CREATE INDEX IF NOT EXISTS "message_read_receipts_user_idx" ON "message_read_receipts" ("user_id");
CREATE INDEX IF NOT EXISTS "message_read_receipts_message_idx" ON "message_read_receipts" ("message_id");

CREATE INDEX IF NOT EXISTS "general_channel_read_receipts_user_idx" ON "general_channel_read_receipts" ("user_id");
CREATE INDEX IF NOT EXISTS "general_channel_read_receipts_message_idx" ON "general_channel_read_receipts" ("message_id");
