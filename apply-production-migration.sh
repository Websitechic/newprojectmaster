
#!/bin/bash

# Production Migration Script
# This script applies the consolidated migration to your production database

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Production Database Migration${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check if PRODUCTION_DATABASE_URL is set
if [ -z "$PRODUCTION_DATABASE_URL" ]; then
  echo -e "${RED}Error: PRODUCTION_DATABASE_URL environment variable is not set${NC}"
  echo "Please set it with: export PRODUCTION_DATABASE_URL='your-database-url'"
  exit 1
fi

echo -e "${GREEN}Database URL found${NC}"
echo ""

# Backup reminder
echo -e "${YELLOW}IMPORTANT: Have you backed up your database?${NC}"
echo "Press CTRL+C to cancel, or any other key to continue..."
read -n 1 -s
echo ""

# Apply migration
echo -e "${GREEN}Applying consolidated migration...${NC}"
psql "$PRODUCTION_DATABASE_URL" -f migrations/0051_consolidated_production_migration.sql

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Migration completed successfully!${NC}"
  echo -e "${GREEN}========================================${NC}"
else
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}Migration failed!${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
