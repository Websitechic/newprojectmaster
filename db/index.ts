import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

// Add connection error handling
client.on('error', (err) => {
  console.error('Database client error:', err);
});

// Connect with retry logic
async function connectWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.connect();
      console.log('Database connected successfully');
      break;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        console.error('Failed to connect to database after', retries, 'attempts');
        throw error;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

await connectWithRetry();

export const db = drizzle(client, { schema });