
-- Consolidated Migration File for Production Deployment
-- This file contains all schema changes to bring production database up to date
-- Run this file after cloning the repository on your production server

-- ==========================================
-- TABLES CREATION
-- ==========================================

-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')),
  specialization TEXT,
  project_manager_type TEXT CHECK (project_manager_type IN ('main', 'supervisor')),
  status TEXT DEFAULT 'offline',
  work_status TEXT DEFAULT 'active',
  break_start_time TIMESTAMP,
  break_count INTEGER DEFAULT 0,
  absence_reason TEXT DEFAULT 'not_applicable',
  absence_end_date TIMESTAMP,
  break_one_time TEXT,
  current_task_id INTEGER,
  task_start_time TIMESTAMP,
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  reset_password_token TEXT,
  reset_password_expires TIMESTAMP,
  onboarding_status TEXT DEFAULT 'not_onboarded',
  product_service TEXT,
  client_type TEXT,
  last_active TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'pending',
  client_id INTEGER REFERENCES users(id),
  pending_client_email TEXT,
  manager_id INTEGER NOT NULL REFERENCES users(id),
  progress INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id INTEGER REFERENCES projects(id),
  assignee_id INTEGER REFERENCES users(id),
  assigned_by INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
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

-- Create task_sessions table
CREATE TABLE IF NOT EXISTS task_sessions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create project_members table
CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  user_id INTEGER REFERENCES users(id),
  role TEXT DEFAULT 'member',
  invitation_status TEXT DEFAULT 'pending',
  invited_by INTEGER REFERENCES users(id),
  invited_at TIMESTAMP DEFAULT NOW(),
  joined_at TIMESTAMP
);

-- Create client_invitations table
CREATE TABLE IF NOT EXISTS client_invitations (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  invited_by INTEGER REFERENCES users(id),
  token TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  reference_id INTEGER,
  reference_type TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create direct_messages table
CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create project_messages table
CREATE TABLE IF NOT EXISTS project_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  is_edited BOOLEAN DEFAULT false
);

-- Create message_read_receipts table
CREATE TABLE IF NOT EXISTS message_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES project_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW()
);

-- Create performance table
CREATE TABLE IF NOT EXISTS performance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  metrics JSONB NOT NULL,
  date TIMESTAMP DEFAULT NOW()
);

-- Create project_plans table
CREATE TABLE IF NOT EXISTS project_plans (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status TEXT DEFAULT 'draft',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create deliverables table
CREATE TABLE IF NOT EXISTS deliverables (
  id SERIAL PRIMARY KEY,
  project_plan_id INTEGER NOT NULL REFERENCES project_plans(id),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  duration INTEGER,
  status TEXT DEFAULT 'pending',
  "order" INTEGER DEFAULT 0,
  dependencies JSONB,
  assignee_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create leave_applications table
CREATE TABLE IF NOT EXISTS leave_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  total_days INTEGER NOT NULL,
  proof_image_url TEXT,
  status TEXT DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),
  review_comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  scheduled_by INTEGER NOT NULL REFERENCES users(id),
  participants JSONB NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'scheduled',
  meeting_link TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create resources table
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

-- Create technical_support_requests table
CREATE TABLE IF NOT EXISTS technical_support_requests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id),
  requester_id INTEGER NOT NULL REFERENCES users(id),
  assigned_to_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  resolution TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Create deadline_extension_requests table
CREATE TABLE IF NOT EXISTS deadline_extension_requests (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  requester_id INTEGER NOT NULL REFERENCES users(id),
  project_manager_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  requested_deadline TIMESTAMP,
  status TEXT DEFAULT 'pending',
  decision_reason TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMP,
  approved_deadline TIMESTAMP,
  approved_working_hours INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create complaints table
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

-- Create staff_complaints table
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

-- Create memos table
CREATE TABLE IF NOT EXISTS memos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  recipients JSONB NOT NULL,
  sent_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create memo_reads table
CREATE TABLE IF NOT EXISTS memo_reads (
  id SERIAL PRIMARY KEY,
  memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(memo_id, user_id)
);

-- Create staff_queries table
CREATE TABLE IF NOT EXISTS staff_queries (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  department TEXT NOT NULL,
  staff_unique_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  why_query TEXT NOT NULL,
  attachment_path TEXT,
  likely_penalty TEXT NOT NULL,
  additional_note TEXT,
  sent_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create client_sentiment table
CREATE TABLE IF NOT EXISTS client_sentiment (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sentiment TEXT NOT NULL,
  reason TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'freetext',
  todo_items JSONB,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  category TEXT DEFAULT 'general'
);

-- Create sops table
CREATE TABLE IF NOT EXISTS sops (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  reference_link TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create sop_segments table
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

-- Create issue_reports table
CREATE TABLE IF NOT EXISTS issue_reports (
  id SERIAL PRIMARY KEY,
  submitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggestions TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'pending',
  screenshot_url TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_comments TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create general_channel_messages table
CREATE TABLE IF NOT EXISTS general_channel_messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP,
  is_edited BOOLEAN DEFAULT false
);

-- Create general_channel_read_receipts table
CREATE TABLE IF NOT EXISTS general_channel_read_receipts (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES general_channel_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create review_links table
CREATE TABLE IF NOT EXISTS review_links (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link_url TEXT NOT NULL,
  description TEXT,
  sent_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create project_briefings table
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
-- COLUMN ADDITIONS & MODIFICATIONS
-- ==========================================

-- Add missing columns to users table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='gender') THEN
    ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='project_manager_type') THEN
    ALTER TABLE users ADD COLUMN project_manager_type TEXT CHECK (project_manager_type IN ('main', 'supervisor'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='onboarding_status') THEN
    ALTER TABLE users ADD COLUMN onboarding_status TEXT DEFAULT 'not_onboarded';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='product_service') THEN
    ALTER TABLE users ADD COLUMN product_service TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='client_type') THEN
    ALTER TABLE users ADD COLUMN client_type TEXT;
  END IF;
END $$;

-- Add missing columns to tasks table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='working_minutes') THEN
    ALTER TABLE tasks ADD COLUMN working_minutes INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='working_hours') THEN
    ALTER TABLE tasks ADD COLUMN working_hours INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update NULL values
UPDATE tasks SET working_hours = 0 WHERE working_hours IS NULL;
UPDATE tasks SET working_minutes = 0 WHERE working_minutes IS NULL;

-- Add missing columns to resources table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resources' AND column_name='link') THEN
    ALTER TABLE resources ADD COLUMN link TEXT;
  END IF;
END $$;

-- Add missing columns to project_messages table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_messages' AND column_name='updated_at') THEN
    ALTER TABLE project_messages ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_messages' AND column_name='is_edited') THEN
    ALTER TABLE project_messages ADD COLUMN is_edited BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add missing columns to sops table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sops' AND column_name='reference_link') THEN
    ALTER TABLE sops ADD COLUMN reference_link TEXT;
  END IF;
END $$;

-- Add missing columns to issue_reports table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='issue_reports' AND column_name='screenshot_url') THEN
    ALTER TABLE issue_reports ADD COLUMN screenshot_url TEXT;
  END IF;
END $$;

-- Add missing columns to notes table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notes' AND column_name='category') THEN
    ALTER TABLE notes ADD COLUMN category TEXT DEFAULT 'general';
  END IF;
END $$;

-- Remove break_two_time column if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='break_two_time') THEN
    ALTER TABLE users DROP COLUMN break_two_time;
  END IF;
END $$;

-- ==========================================
-- DATA MIGRATIONS
-- ==========================================

-- Update user roles (rename product_owner to customer_support_officer)
UPDATE users SET role = 'customer_support_officer' WHERE role = 'product_owner';
UPDATE users SET specialization = 'customer_support_officer' WHERE specialization = 'product_owner';

-- Backfill client fields for existing client users
UPDATE users 
SET 
  product_service = 'website_development',
  client_type = 'project_client'
WHERE role = 'client' AND product_service IS NULL;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_id ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task_id ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_user_id ON task_sessions(user_id);

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Verify all tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify critical columns exist
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name IN ('users', 'tasks', 'projects')
  AND column_name IN ('working_hours', 'working_minutes', 'gender', 'project_manager_type', 'onboarding_status')
ORDER BY table_name, column_name;
