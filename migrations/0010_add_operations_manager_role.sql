
-- Add operations_manager to the user role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operations_manager';
