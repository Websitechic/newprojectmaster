
-- Rename product_owner role to customer_support_officer
-- First, update all users with product_owner role
UPDATE users 
SET role = 'customer_support_officer' 
WHERE role = 'product_owner';

-- Update all users with product_owner specialization
UPDATE users 
SET specialization = 'customer_support_officer' 
WHERE specialization = 'product_owner';

-- Add the new enum value
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'customer_support_officer' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'user_role'
        )
    ) THEN
        ALTER TYPE user_role ADD VALUE 'customer_support_officer';
    END IF;
END$$;
