
CREATE TABLE IF NOT EXISTS project_briefings (
  id SERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  category TEXT NOT NULL,
  project_details TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_briefings_created_by ON project_briefings(created_by);
CREATE INDEX IF NOT EXISTS idx_project_briefings_created_at ON project_briefings(created_at);
