
import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function applyFix() {
  try {
    console.log("Reading SQL fix file...");
    const sqlContent = readFileSync("./fix_timer_sessions.sql", "utf-8");
    
    console.log("Applying timer_sessions column fix...");
    await sql(sqlContent);
    
    console.log("✅ Successfully added timer_sessions column!");
    console.log("You can now refresh the productivity tracking page.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error applying fix:", error);
    process.exit(1);
  }
}

applyFix();
