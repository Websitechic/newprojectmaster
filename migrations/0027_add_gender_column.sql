
-- Add gender column to users table
ALTER TABLE users ADD COLUMN gender TEXT;

-- Add check constraint for valid gender values
ALTER TABLE users ADD CONSTRAINT users_gender_check 
  CHECK (gender IN ('male', 'female') OR gender IS NULL);

-- Set default gender to 'male' for existing clients
UPDATE users 
SET gender = 'male' 
WHERE role = 'client' AND gender IS NULL;
