const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(connectionString);

async function updateBreakTimes() {
  try {
    console.log('Updating break times for specific users...');

    // Update testpm
    const result1 = await sql`
      UPDATE users 
      SET break_one_time = '22:00', break_two_time = '12:00' 
      WHERE username = 'testpm'
      RETURNING username, break_one_time, break_two_time;
    `;
    console.log('testpm updated:', result1);

    // Update testuser
    const result2 = await sql`
      UPDATE users 
      SET break_one_time = '12:30', break_two_time = '15:00' 
      WHERE username = 'testuser'
      RETURNING username, break_one_time, break_two_time;
    `;
    console.log('testuser updated:', result2);

    // Update Staff1
    const result3 = await sql`
      UPDATE users 
      SET break_one_time = '13:00', break_two_time = '16:00' 
      WHERE username = 'Staff1'
      RETURNING username, break_one_time, break_two_time;
    `;
    console.log('Staff1 updated:', result3);

    // Verify all users
    const allUsers = await sql`
      SELECT username, break_one_time, break_two_time 
      FROM users 
      WHERE username IN ('testpm', 'testuser', 'Staff1');
    `;
    console.log('All specified users break times:', allUsers);

    console.log('Break times updated successfully!');

  } catch (error) {
    console.error('Error updating break times:', error);
  } finally {
    await sql.end();
  }
}

updateBreakTimes();