
-- Add category column to notes table
ALTER TABLE notes ADD COLUMN category TEXT DEFAULT 'general';
