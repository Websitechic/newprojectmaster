
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;
console.log('Connection string:', connectionString ? 'Found' : 'Not found');

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(connectionString);
const db = drizzle(sql);

async function migrate() {
  try {
    console.log('Checking current table structure...');
    
    // Check if columns exist
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('break_one_time', 'break_two_time');
    `;
    
    console.log('Existing break time columns:', columnCheck);
    
    if (columnCheck.length < 2) {
      console.log('Adding missing break time columns...');
      
      // Add the new columns if they don't exist
      await sql`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS break_one_time TEXT,
        ADD COLUMN IF NOT EXISTS break_two_time TEXT;
      `;
      
      console.log('Columns added successfully!');
    } else {
      console.log('Break time columns already exist.');
    }
    
    // Update existing users with default break times
    console.log('Updating existing users with default break times...');
    await sql`
      UPDATE users SET 
        break_one_time = COALESCE(break_one_time, '10:00'), 
        break_two_time = COALESCE(break_two_time, '15:00')
      WHERE break_one_time IS NULL OR break_two_time IS NULL;
    `;
    
    // Set specific times for known users
    await sql`
      UPDATE users SET break_one_time = '22:00', break_two_time = '12:00' 
      WHERE username = 'testpm' AND (break_one_time != '22:00' OR break_two_time != '12:00');
    `;
    
    await sql`
      UPDATE users SET break_one_time = '12:30', break_two_time = '15:00' 
      WHERE username = 'testuser' AND (break_one_time != '12:30' OR break_two_time != '15:00');
    `;
    
    await sql`
      UPDATE users SET break_one_time = '13:00', break_two_time = '16:00' 
      WHERE username = 'Staff1' AND (break_one_time != '13:00' OR break_two_time != '16:00');
    `;
    
    console.log('Migration completed successfully!');
    
    // Verify the changes
    const users = await sql`SELECT username, break_one_time, break_two_time FROM users;`;
    console.log('Updated users:', users);
    
  } catch (error) {
    console.error('Migration failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
  } finally {
    await sql.end();
    process.exit(0);
  }
}

migrate();
