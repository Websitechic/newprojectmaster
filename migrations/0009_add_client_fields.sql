
-- Add new columns to users table
ALTER TABLE "users" ADD COLUMN "product_service" text;
ALTER TABLE "users" ADD COLUMN "client_type" text;

-- Update existing clients to have default values
UPDATE "users" 
SET "product_service" = 'direct_marketing', "client_type" = 'project_client' 
WHERE "role" = 'client';
