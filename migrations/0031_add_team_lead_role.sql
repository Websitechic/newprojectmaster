
-- Add team_lead role to existing role enum
-- This migration adds the team_lead role to support the new Team Lead position

-- Note: PostgreSQL doesn't allow adding values to enums in a transaction,
-- so this will be handled by the application code during startup
-- The schema.ts already includes the team_lead role definition

-- This file serves as documentation for the change
-- The actual enum update will happen through Drizzle's schema changes
