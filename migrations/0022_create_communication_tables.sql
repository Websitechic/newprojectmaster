
-- Create communication_delays table
CREATE TABLE IF NOT EXISTS communication_delays (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  staff_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_manager_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  last_response_time TIMESTAMP,
  delay_hours INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create communication_warnings table
CREATE TABLE IF NOT EXISTS communication_warnings (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  reason TEXT,
  advice TEXT,
  monetary_penalty DECIMAL(10,2),
  staff_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  sent_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create communication_escalations table
CREATE TABLE IF NOT EXISTS communication_escalations (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  escalated_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  report_generated BOOLEAN DEFAULT FALSE
);

-- Create communication_discards table
CREATE TABLE IF NOT EXISTS communication_discards (
  id SERIAL PRIMARY KEY,
  delayed_response_id INTEGER REFERENCES communication_delays(id) ON DELETE CASCADE,
  date_of_entry DATE,
  project_name VARCHAR(255),
  hours_late INTEGER,
  reason TEXT,
  discarded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
