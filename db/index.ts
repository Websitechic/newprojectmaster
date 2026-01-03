import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

// Detect production environment - Replit sets REPLIT_DEPLOYMENT=1 for published apps
const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

// Use DATABASE_URL for both development and production
// Replit's built-in database works in both environments and keeps data synchronized
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  const errorMsg = "DATABASE_URL must be set. Did you forget to provision a database?";
  console.error(`❌ Database Error: ${errorMsg}`);
  throw new Error(errorMsg);
}

// Log database connection info (without exposing the actual URL)
console.log(`🔌 Connecting to database (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} environment)`);

// Create postgres client with connection options
// Note: Neon databases require SSL, but the connection string already includes sslmode=require
// We only add explicit SSL config if not in the URL to avoid conflicts
const hasSSLInUrl = databaseUrl.includes('sslmode=') || databaseUrl.includes('ssl=');
const client = postgres(databaseUrl, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  // Only set SSL if not already specified in URL
  ...(isProduction && !hasSSLInUrl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle({ client, schema });

// Export a function to test the database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}
