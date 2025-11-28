
-- Create review_links table
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

-- Create index for faster queries
CREATE INDEX idx_review_links_assigned_to ON review_links(assigned_to);
CREATE INDEX idx_review_links_sent_by ON review_links(sent_by);
CREATE INDEX idx_review_links_status ON review_links(status);
