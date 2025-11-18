
-- Add product_owner to the user role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'product_owner';
