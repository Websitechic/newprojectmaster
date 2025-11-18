
-- Migration to update notes table schema
ALTER TABLE notes 
DROP COLUMN IF EXISTS category,
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'freetext',
ADD COLUMN IF NOT EXISTS todo_items JSONB,
ALTER COLUMN title DROP NOT NULL;
