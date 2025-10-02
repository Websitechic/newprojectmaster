
-- Add customer_support_officer to the user role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer_support_officer';

-- Update existing product_owner users to customer_support_officer
UPDATE users SET role = 'customer_support_officer' WHERE role = 'product_owner';
UPDATE users SET specialization = 'customer_support_officer' WHERE specialization = 'product_owner';
