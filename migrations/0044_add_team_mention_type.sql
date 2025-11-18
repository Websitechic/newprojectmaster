
-- Add team_mention to notification types
-- This allows the system to track when users are mentioned in team chats

-- No actual ALTER needed for text enums in PostgreSQL, 
-- the schema change in db/schema.ts will handle the TypeScript types
-- and Drizzle will validate the values at runtime
