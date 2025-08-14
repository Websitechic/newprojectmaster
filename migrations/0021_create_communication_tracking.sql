
-- Create communication delays tracking table
CREATE TABLE IF NOT EXISTS communication_delays (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_manager_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  last_response_time TIMESTAMP NOT NULL,
  delay_hours DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigated', 'warned', 'escalated', 'discarded')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create communication warnings table
CREATE TABLE IF NOT EXISTS communication_warnings (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  advice TEXT NOT NULL,
  monetary_penalty DECIMAL(10,2) DEFAULT 0,
  staff_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sent_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create communication escalations table
CREATE TABLE IF NOT EXISTS communication_escalations (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  escalated_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  report_generated BOOLEAN DEFAULT true
);

-- Create communication discards table
CREATE TABLE IF NOT EXISTS communication_discards (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  date_of_entry DATE NOT NULL,
  project_name TEXT NOT NULL,
  hours_late DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  discarded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_communication_delays_project_id ON communication_delays(project_id);
CREATE INDEX IF NOT EXISTS idx_communication_delays_staff_id ON communication_delays(staff_id);
CREATE INDEX IF NOT EXISTS idx_communication_delays_status ON communication_delays(status);
CREATE INDEX IF NOT EXISTS idx_communication_delays_created_at ON communication_delays(created_at);
