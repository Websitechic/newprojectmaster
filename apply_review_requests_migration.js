
import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync('./migrations/0048_create_review_requests.sql', 'utf8');
    
    console.log('Applying migration...');
    await sql(migrationSQL);
    
    console.log('✅ Review requests table created successfully!');
    
    // Verify the table exists
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'review_requests'
    `;
    
    if (result.length > 0) {
      console.log('✅ Verified: review_requests table exists');
    } else {
      console.log('⚠️ Warning: Could not verify table creation');
    }
    
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
