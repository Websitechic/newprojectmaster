-- Migration to update memo types
ALTER TABLE memos DROP CONSTRAINT IF EXISTS memos_type_check;
ALTER TABLE memos ADD CONSTRAINT memos_type_check CHECK (type IN ('individual', 'general', 'department'));

-- Create staff_complaints table
CREATE TABLE IF NOT EXISTS staff_complaints (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT,
  detailed_explanation TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  review_comments TEXT,
  reviewed_at TIMESTAMP,
  submitter_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
