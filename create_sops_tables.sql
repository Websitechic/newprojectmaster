
-- Create SOPs tables if they don't exist
CREATE TABLE IF NOT EXISTS sops (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create SOP segments table for storing individual steps/sections
CREATE TABLE IF NOT EXISTS sop_segments (
  id SERIAL PRIMARY KEY,
  sop_id INTEGER REFERENCES sops(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  segment_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sops_department ON sops(department);
CREATE INDEX IF NOT EXISTS idx_sops_created_by ON sops(created_by);
CREATE INDEX IF NOT EXISTS idx_sop_segments_sop_id ON sop_segments(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_segments_order ON sop_segments(sop_id, segment_order);
