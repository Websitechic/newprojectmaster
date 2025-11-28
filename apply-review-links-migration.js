
import { Client } from 'pg';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Read the migration file
    const migrationSQL = readFileSync(
      join(__dirname, 'migrations/0049_create_review_links.sql'),
      'utf-8'
    );

    console.log('Applying review_links migration...');
    await client.query(migrationSQL);
    console.log('Migration applied successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

applyMigration()
  .then(() => {
    console.log('✅ Review links table created successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
