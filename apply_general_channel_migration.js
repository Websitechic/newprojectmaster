
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function applyMigration() {
  try {
    console.log('Applying general channel migration...');
    
    const migrationSQL = fs.readFileSync('./migrations/0050_create_general_channel.sql', 'utf8');
    
    // Split by statement and execute each one
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50) + '...');
      await db.execute(sql.raw(statement));
    }
    
    console.log('✅ General channel migration applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();
