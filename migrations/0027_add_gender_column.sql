
-- Add gender column to users table
ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));

-- Set default gender to 'male' for existing clients
UPDATE users SET gender = 'male' WHERE role = 'client';
