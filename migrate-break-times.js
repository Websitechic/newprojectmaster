
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/projectmanagement';
const sql = postgres(connectionString);
const db = drizzle(sql);

async function migrate() {
  try {
    console.log('Adding break time columns...');
    
    // Add the new columns if they don't exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS break_one_time TEXT,
      ADD COLUMN IF NOT EXISTS break_two_time TEXT;
    `;
    
    console.log('Columns added successfully!');
    
    // Update existing users with default break times
    await sql`
      UPDATE users SET break_one_time = '22:00', break_two_time = '12:00' WHERE username = 'testpm';
      UPDATE users SET break_one_time = '12:30', break_two_time = '15:00' WHERE username = 'testuser';
      UPDATE users SET break_one_time = '13:00', break_two_time = '16:00' WHERE username = 'Staff1';
    `;
    
    console.log('Break times updated for existing users!');
    
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
