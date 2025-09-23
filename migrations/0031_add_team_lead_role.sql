
-- Add team_lead role to existing role enum
-- This migration adds the team_lead role to support the new Team Lead position

-- Add team_lead to the user role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead';
