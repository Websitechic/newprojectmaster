
-- Create stop_gap_allocations table to track monthly allocations
CREATE TABLE IF NOT EXISTS stop_gap_allocations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: "YYYY-MM"
  total_hours INTEGER NOT NULL DEFAULT 5,
  used_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
  remaining_hours DECIMAL(10, 2) NOT NULL DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month_year)
);

-- Create stop_gap_task_assignments table to track which tasks have stop gap applied
CREATE TABLE IF NOT EXISTS stop_gap_task_assignments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stop_gap_hours DECIMAL(10, 2) NOT NULL,
  month_year TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stop_gap_allocations_user_month ON stop_gap_allocations(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_stop_gap_task_assignments_task ON stop_gap_task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_stop_gap_task_assignments_user ON stop_gap_task_assignments(user_id);
