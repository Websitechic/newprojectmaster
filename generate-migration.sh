
#!/bin/bash

# Script to generate a new migration file
# Usage: ./generate-migration.sh "migration_name"

if [ -z "$1" ]; then
  echo "Error: Please provide a migration name"
  echo "Usage: ./generate-migration.sh \"migration_name\""
  exit 1
fi

echo "Generating migration: $1"
npx drizzle-kit generate --name "$1"
echo "Migration generated successfully in ./migrations folder"
