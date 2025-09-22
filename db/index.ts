import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

// Add connection error handling
client.on('error', (err) => {
  console.error('Database client error:', err);
});

// Connect with retry logic and graceful failure handling
async function connectWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.connect();
      console.log('Database connected successfully');
      return true;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        console.error('Failed to connect to database after', retries, 'attempts');
        console.error('Continuing without database connection - some features will be limited');
        return false;
      }
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  return false;
}

// Don't block server startup on database connection failure
const dbConnected = await connectWithRetry();
if (!dbConnected) {
  console.warn('Server starting without database connection');
}

export const db = drizzle(client, { schema });