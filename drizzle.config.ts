import { defineConfig } from "drizzle-kit";

// Support both development (Replit) and production (VPS) database URLs
const databaseUrl = process.env.NODE_ENV === 'production' 
  ? process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or PRODUCTION_DATABASE_URL must be set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
