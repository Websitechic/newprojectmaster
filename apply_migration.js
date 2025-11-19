
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function applyMigration() {
  try {
    console.log("Starting migration...");
    
    // Add timer_sessions column
    console.log("Adding timer_sessions column...");
    await sql`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS timer_sessions JSONB DEFAULT '[]'::jsonb
    `;
    
    console.log("Initializing timer_sessions for existing tasks...");
    await sql`
      UPDATE tasks 
      SET timer_sessions = jsonb_build_array(
        jsonb_build_object(
          'startTime', (updated_at - (time_spent || ' seconds')::interval)::text,
          'endTime', updated_at::text,
          'duration', time_spent
        )
      )
      WHERE time_spent > 0 AND (timer_sessions IS NULL OR timer_sessions = '[]'::jsonb)
    `;
    
    console.log("Setting empty arrays for tasks without time spent...");
    await sql`
      UPDATE tasks 
      SET timer_sessions = '[]'::jsonb
      WHERE timer_sessions IS NULL
    `;
    
    console.log("✅ Migration completed successfully!");
    console.log("The productivity tracking page should now work.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

applyMigration();
