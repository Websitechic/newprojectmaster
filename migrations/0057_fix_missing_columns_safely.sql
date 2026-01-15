-- Fix missing columns that might cause migration failures in production
-- This migration runs safely using IF NOT EXISTS to avoid conflicts with already applied migrations

DO $$ 
BEGIN
    -- Ensure onboarding_status exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='onboarding_status') THEN
        ALTER TABLE users ADD COLUMN onboarding_status TEXT DEFAULT 'not_onboarded';
    END IF;

    -- Ensure product_service exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='product_service') THEN
        ALTER TABLE users ADD COLUMN product_service TEXT;
    END IF;

    -- Ensure client_type exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='client_type') THEN
        ALTER TABLE users ADD COLUMN client_type TEXT;
    END IF;

    -- Ensure gender exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='gender') THEN
        ALTER TABLE users ADD COLUMN gender TEXT;
    END IF;

    -- Ensure gender check constraint exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_gender_check' AND table_name = 'users') THEN
        ALTER TABLE users ADD CONSTRAINT users_gender_check CHECK (gender IN ('male', 'female') OR gender IS NULL);
    END IF;
END $$;
