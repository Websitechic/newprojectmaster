
-- Add updatedAt column to direct_messages table
ALTER TABLE "direct_messages" ADD COLUMN "updated_at" timestamp DEFAULT now();

-- Add updatedAt column to team_messages table
ALTER TABLE "team_messages" ADD COLUMN "updated_at" timestamp DEFAULT now();
