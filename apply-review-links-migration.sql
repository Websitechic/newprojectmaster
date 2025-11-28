
-- First check if the table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'review_links'
);

-- If it doesn't exist, create it
CREATE TABLE IF NOT EXISTS review_links (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link_url TEXT NOT NULL,
  description TEXT,
  sent_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes (will skip if they already exist)
CREATE INDEX IF NOT EXISTS idx_review_links_assigned_to ON review_links(assigned_to);
CREATE INDEX IF NOT EXISTS idx_review_links_sent_by ON review_links(sent_by);
CREATE INDEX IF NOT EXISTS idx_review_links_status ON review_links(status);

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'review_links'
ORDER BY ordinal_position;
