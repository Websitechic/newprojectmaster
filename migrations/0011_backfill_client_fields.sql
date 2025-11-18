
-- Backfill existing client accounts with default values if they don't have clientType and productService
UPDATE "users" 
SET 
  "product_service" = COALESCE("product_service", 'direct_marketing'),
  "client_type" = COALESCE("client_type", 'project_client')
WHERE "role" = 'client' 
  AND ("product_service" IS NULL OR "client_type" IS NULL);
