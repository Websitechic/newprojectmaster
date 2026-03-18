const { drizzle } = require('drizzle-orm/node-postgres');
const pg = require('pg');

async function checkTable() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'memo_responses'
      );
    `);
    
    if (result.rows[0].exists) {
      console.log('✅ memo_responses table EXISTS');
    } else {
      console.log('❌ memo_responses table DOES NOT EXIST');
      console.log('Creating table...');
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS memo_responses (
          id SERIAL PRIMARY KEY,
          memo_id INTEGER NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ memo_responses table created successfully');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTable();
