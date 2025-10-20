
-- Add reply context fields to direct_messages table
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "reply_to_message_id" integer;
ALTER TABLE "direct_messages" ADD COLUMN IF NOT EXISTS "reply_to_sender_name" text;
