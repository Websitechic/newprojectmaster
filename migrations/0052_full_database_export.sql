
-- Full Database Export Migration
-- This file contains the complete database structure and data export functionality
-- Run this to create a complete backup or restore point

-- ==========================================
-- COMPLETE SCHEMA STRUCTURE
-- ==========================================

-- Drop all tables in reverse dependency order (if recreating)
-- Uncomment only if you want to recreate from scratch
/*
DROP TABLE IF EXISTS project_briefings CASCADE;
DROP TABLE IF EXISTS review_links CASCADE;
DROP TABLE IF EXISTS general_channel_read_receipts CASCADE;
DROP TABLE IF EXISTS general_channel_messages CASCADE;
DROP TABLE IF EXISTS issue_reports CASCADE;
DROP TABLE IF EXISTS sop_segments CASCADE;
DROP TABLE IF EXISTS sops CASCADE;
DROP TABLE IF EXISTS client_sentiment CASCADE;
DROP TABLE IF EXISTS staff_queries CASCADE;
DROP TABLE IF EXISTS memo_reads CASCADE;
DROP TABLE IF EXISTS memos CASCADE;
DROP TABLE IF EXISTS staff_complaints CASCADE;
DROP TABLE IF EXISTS complaints CASCADE;
DROP TABLE IF EXISTS deadline_extension_requests CASCADE;
DROP TABLE IF EXISTS technical_support_requests CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE;
DROP TABLE IF EXISTS deliverables CASCADE;
DROP TABLE IF EXISTS project_plans CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS performance CASCADE;
DROP TABLE IF EXISTS message_read_receipts CASCADE;
DROP TABLE IF EXISTS project_messages CASCADE;
DROP TABLE IF EXISTS direct_messages CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS task_sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS client_invitations CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;
*/

-- ==========================================
-- CREATE ALL TABLES
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client', 'project_manager', 'staff', 'intern', 'customer_support_officer', 'operations_manager', 'team_lead')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')),
  specialization TEXT CHECK (specialization IN ('customer_support_officer', 'product_manager', 'automation', 'copywriting', 'design', 'media_buying', 'development', 'community_manager', 'operations_manager', 'technical_support', 'replit_development')),
  project_manager_type TEXT CHECK (project_manager_type IN ('main', 'supervisor')),
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'idle')),
  work_status TEXT DEFAULT 'active' CHECK (work_status IN ('active', 'on_break', 'absent')),
  break_start_time TIMESTAMP,
  break_count INTEGER DEFAULT 0,
  absence_reason TEXT DEFAULT 'not_applicable' CHECK (absence_reason IN ('leave', 'off_day', 'not_applicable')),
  absence_end_date TIMESTAMP,
  break_one_time TEXT,
  current_task_id INTEGER,
  task_start_time TIMESTAMP,
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  reset_password_token TEXT,
  reset_password_expires TIMESTAMP,
  onboarding_status TEXT DEFAULT 'not_onboarded' CHECK (onboarding_status IN ('onboarded', 'not_onboarded', 'onboarding_in_progress', 'onboarding_pending')),
  product_service TEXT CHECK (product_service IN ('website_development', 'dpl_outright', 'dpl_partnership', 'direct_marketing', 'support_maintenance')),
  client_type TEXT CHECK (client_type IN ('project_client', 'support_maintenance_client')),
  last_active TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('web_development', 'mobile_app', 'digital_marketing', 'ui_ux_design', 'content_creation', 'automation', 'social_media')),
  category TEXT CHECK (category IN ('website_development', 'dpl_outright', 'dpl_partnership', 'direct_marketing', 'support_maintenance')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'inactive', 'pending')),
  client_id INTEGER REFERENCES users(id),
  pending_client_email TEXT,
  manager_id INTEGER NOT NULL REFERENCES users(id),
  progress INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  user_id INTEGER REFERENCES users(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('viewer', 'member', 'admin', 'technical_support')),
  invitation_status TEXT DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'accepted', 'declined')),
  invited_by INTEGER REFERENCES users(id),
  invited_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_invitations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  invited_by INTEGER REFERENCES users(id),
  token TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id INTEGER REFERENCES projects(id),
  assignee_id INTEGER REFERENCES users(id),
  assigned_by INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed', 'review', 'technical_support', 'pending')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  progress INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  deadline TIMESTAMP,
  working_hours INTEGER DEFAULT 0,
  working_minutes INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  is_timer_running BOOLEAN DEFAULT false,
  timer_start_time TIMESTAMP,
  has_been_started BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_sessions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('task_assigned', 'task_updated', 'task_completed', 'mention', 'team_mention', 'technical_support_request', 'communication_warning', 'communication_query_discarded', 'break_reminder', 'deadline_reminder', 'project_updated', 'memo_received')),
  content TEXT NOT NULL,
  reference_id INTEGER,
  reference_type TEXT CHECK (reference_type IN ('task', 'project', 'message', 'technical_support_request', 'complaint', 'communication_delay', 'memo')),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  is_edited BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS message_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES project_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  metrics JSONB NOT NULL,
  date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_plans (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'on_hold')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliverables (
  id SERIAL PRIMARY KEY,
  project_plan_id INTEGER NOT NULL REFERENCES project_plans(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  duration INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  "order" INTEGER DEFAULT 0,
  dependencies JSONB,
  assignee_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('day_off', 'leave_of_absence')),
  reason TEXT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  total_days INTEGER NOT NULL,
  proof_image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  applied_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),
  review_comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('one_on_one', 'team_booking', 'marketing_meeting', 'general_booking')),
  scheduled_by INTEGER NOT NULL REFERENCES users(id),
  participants JSONB NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  meeting_link TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER,
  path TEXT,
  link TEXT,
  project_id INTEGER REFERENCES projects(id),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS technical_support_requests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id),
  requester_id INTEGER NOT NULL REFERENCES users(id),
  assigned_to_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  resolution TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deadline_extension_requests (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  requester_id INTEGER NOT NULL REFERENCES users(id),
  project_manager_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  requested_deadline TIMESTAMP,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decision_reason TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMP,
  approved_deadline TIMESTAMP,
  approved_working_hours INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  product_manager_name TEXT,
  developer_name TEXT,
  technical_manager_name TEXT,
  valuable_things JSON DEFAULT '[]',
  detailed_explanation TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  submitter_id INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_complaints (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT,
  detailed_explanation TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  submitter_id INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('individual', 'general', 'department')),
  recipients JSONB NOT NULL,
  sent_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memo_reads (
  id SERIAL PRIMARY KEY,
  memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(memo_id, user_id)
);

CREATE TABLE IF NOT EXISTS staff_queries (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  department TEXT NOT NULL,
  staff_unique_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('wrongly_using_work_app', 'substandard_delivery', 'repeatedly_missed_deadlines', 'disrespectful_communication', 'disregard_company_policy')),
  why_query TEXT NOT NULL,
  attachment_path TEXT,
  likely_penalty TEXT NOT NULL,
  additional_note TEXT,
  sent_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_sentiment (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('satisfied', 'dissatisfied', 'flags')),
  reason TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'freetext' CHECK (type IN ('freetext', 'todo')),
  todo_items JSONB,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  category TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS sops (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  reference_link TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sop_segments (
  id SERIAL PRIMARY KEY,
  sop_id INTEGER NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  segment_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_reports (
  id SERIAL PRIMARY KEY,
  submitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggestions TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('bug', 'feature_request', 'improvement', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'closed')),
  screenshot_url TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_comments TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS general_channel_messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP,
  is_edited BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS general_channel_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES general_channel_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS review_links (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link_url TEXT NOT NULL,
  description TEXT,
  sent_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

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

-- ==========================================
-- CREATE INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_id ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task_id ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_user_id ON task_sessions(user_id);

-- ==========================================
-- DATA EXPORT SCRIPT
-- ==========================================
-- To export all data, run these commands individually:

-- Export users (excluding passwords for security)
-- COPY (SELECT id, username, role, name, email, gender, specialization, project_manager_type, status, work_status, onboarding_status, product_service, client_type, created_at FROM users) TO '/tmp/users_export.csv' WITH CSV HEADER;

-- Export all other tables
-- COPY projects TO '/tmp/projects_export.csv' WITH CSV HEADER;
-- COPY tasks TO '/tmp/tasks_export.csv' WITH CSV HEADER;
-- COPY project_members TO '/tmp/project_members_export.csv' WITH CSV HEADER;
-- COPY notifications TO '/tmp/notifications_export.csv' WITH CSV HEADER;
-- COPY memos TO '/tmp/memos_export.csv' WITH CSV HEADER;
-- COPY notes TO '/tmp/notes_export.csv' WITH CSV HEADER;

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

SELECT 'Database structure created successfully' AS status;

SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
