#!/bin/bash

# Production Database Export Script
# This script exports your production PostgreSQL database to a backup file

set -e

echo "========================================="
echo "Production Database Export Tool"
echo "========================================="
echo ""

# Check if DATABASE_URL is provided as argument
if [ -z "$1" ]; then
    echo "Usage: ./export-production-db.sh <PRODUCTION_DATABASE_URL>"
    echo ""
    echo "To find your production DATABASE_URL:"
    echo "1. Open the Database pane in Replit"
    echo "2. Switch to 'Production' environment"
    echo "3. Go to the 'Commands' tab"
    echo "4. Copy the DATABASE_URL from the Environment variables section"
    echo ""
    echo "Example:"
    echo "  ./export-production-db.sh 'postgresql://user:pass@host:5432/dbname'"
    echo ""
    exit 1
fi

PRODUCTION_DB_URL="$1"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXPORT_FILE="production_db_backup_${TIMESTAMP}.sql"

echo "Starting database export..."
echo "Export file: ${EXPORT_FILE}"
echo ""

# Use pg_dump to create the backup
if pg_dump "$PRODUCTION_DB_URL" > "$EXPORT_FILE"; then
    FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
    echo ""
    echo "✓ Export completed successfully!"
    echo ""
    echo "Backup file: ${EXPORT_FILE}"
    echo "File size: ${FILE_SIZE}"
    echo ""
    echo "To restore this backup later, use:"
    echo "  psql \$DATABASE_URL < ${EXPORT_FILE}"
    echo ""
else
    echo ""
    echo "✗ Export failed. Please check your DATABASE_URL and try again."
    exit 1
fi
