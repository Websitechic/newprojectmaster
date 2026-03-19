import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

// Support both development (Replit) and production (VPS) database URLs
const databaseUrl = process.env.NODE_ENV === 'production'
  ? process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log(`Connecting to ${process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'} database`);

const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });
