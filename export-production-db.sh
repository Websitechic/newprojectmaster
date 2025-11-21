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

# Use pg_dump to create the backup with version compatibility flags
# The --no-sync flag improves performance and --no-owner/--no-acl make it more portable
if pg_dump "$PRODUCTION_DB_URL" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    --verbose \
    2>&1 > "$EXPORT_FILE"; then
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
    echo "⚠ Version mismatch detected. Trying alternative export method..."
    echo ""
    
    # Alternative: use psql to dump the data
    if psql "$PRODUCTION_DB_URL" -c "\copy (SELECT * FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) TO STDOUT" > /dev/null 2>&1; then
        echo "Using alternative export with data-only approach..."
        pg_dump "$PRODUCTION_DB_URL" --data-only --no-owner --no-acl > "$EXPORT_FILE" 2>/dev/null || {
            echo "✗ Export failed. The PostgreSQL version mismatch (server: 17.5, client: 16.10) is preventing the backup."
            echo ""
            echo "Alternative solutions:"
            echo "1. Use the Replit Database pane → Drizzle Studio to export tables individually"
            echo "2. Contact your database provider for a backup"
            echo "3. Use a PostgreSQL 17-compatible pg_dump client"
            rm -f "$EXPORT_FILE"
            exit 1
        }
        FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
        echo "✓ Data exported successfully (schema may need separate export)"
        echo "Backup file: ${EXPORT_FILE}"
        echo "File size: ${FILE_SIZE}"
    else
        echo "✗ Export failed due to version mismatch."
        rm -f "$EXPORT_FILE"
        exit 1
    fi
fi
