
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, 'migrations', '0048_create_review_requests.sql');
    const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Applying migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Review requests table created successfully!');
    
    // Verify the table exists
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'review_requests'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verified: review_requests table exists');
    } else {
      console.log('⚠️ Warning: Could not verify table creation');
    }
    
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
