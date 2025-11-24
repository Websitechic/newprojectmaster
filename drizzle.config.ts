import { defineConfig } from "drizzle-kit";

// Use PRODUCTION_DATABASE_URL in production, DATABASE_URL in development
const databaseUrl = process.env.NODE_ENV === 'production' 
  ? process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
