
const { db } = require('./db');
const { sql } = require('drizzle-orm');
const fs = require('fs');

async function applyMigration() {
  try {
    console.log('Applying general channel migration...');
    
    const migrationSQL = fs.readFileSync('./migrations/0050_create_general_channel.sql', 'utf8');
    
    // Execute the entire migration as a single transaction
    console.log('Executing migration SQL...');
    await db.execute(sql.raw(migrationSQL));
    
    console.log('✅ General channel migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

applyMigration();
