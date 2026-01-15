
-- Add gender column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;

-- Add check constraint for valid gender values (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_gender_check' AND table_name = 'users') THEN
        ALTER TABLE users ADD CONSTRAINT users_gender_check CHECK (gender IN ('male', 'female') OR gender IS NULL);
    END IF;
END $$;

-- Set default gender to 'male' for existing clients
UPDATE users 
SET gender = 'male' 
WHERE role = 'client' AND gender IS NULL;
