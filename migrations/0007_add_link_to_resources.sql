
-- Migration to add link column to resources table
ALTER TABLE "resources" ADD COLUMN "link" text;
ALTER TABLE "resources" ALTER COLUMN "path" DROP NOT NULL;
