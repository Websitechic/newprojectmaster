
-- Create review requests table
CREATE TABLE IF NOT EXISTS review_requests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  review_link TEXT NOT NULL,
  project_manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_lead_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed')),
  completed_at TIMESTAMP,
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_review_requests_pm ON review_requests(project_manager_id);
CREATE INDEX idx_review_requests_tl ON review_requests(team_lead_id);
CREATE INDEX idx_review_requests_status ON review_requests(status);
