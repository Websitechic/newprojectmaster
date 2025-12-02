
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: PRODUCTION_DATABASE_URL or DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('\x1b[33m%s\x1b[0m', '========================================');
  console.log('\x1b[33m%s\x1b[0m', 'Production Database Migration');
  console.log('\x1b[33m%s\x1b[0m', '========================================');
  console.log('');

  const migrationFile = path.join(__dirname, 'migrations', '0051_consolidated_production_migration.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error('\x1b[31m%s\x1b[0m', `Error: Migration file not found at ${migrationFile}`);
    process.exit(1);
  }

  console.log('\x1b[32m%s\x1b[0m', 'Reading migration file...');
  const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

  console.log('\x1b[32m%s\x1b[0m', 'Connecting to production database...');
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('\x1b[32m%s\x1b[0m', 'Connected successfully!');
    console.log('');

    console.log('\x1b[33m%s\x1b[0m', 'IMPORTANT: Make sure you have backed up your database!');
    console.log('\x1b[33m%s\x1b[0m', 'Press CTRL+C within 5 seconds to cancel...');
    console.log('');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\x1b[32m%s\x1b[0m', 'Applying migration...');
    await client.query(migrationSQL);

    console.log('');
    console.log('\x1b[32m%s\x1b[0m', '========================================');
    console.log('\x1b[32m%s\x1b[0m', 'Migration completed successfully!');
    console.log('\x1b[32m%s\x1b[0m', '========================================');
  } catch (error) {
    console.error('');
    console.error('\x1b[31m%s\x1b[0m', '========================================');
    console.error('\x1b[31m%s\x1b[0m', 'Migration failed!');
    console.error('\x1b[31m%s\x1b[0m', '========================================');
    console.error('\x1b[31m%s\x1b[0m', 'Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
