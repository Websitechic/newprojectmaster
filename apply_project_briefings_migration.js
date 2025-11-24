
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const sql = neon(process.env.DATABASE_URL);

async function applyMigration() {
  try {
    console.log('Applying project briefings migration...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS "project_briefings" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_name" text NOT NULL,
        "client_name" text NOT NULL,
        "project_type" text NOT NULL,
        "description" text NOT NULL,
        "objectives" text DEFAULT '' NOT NULL,
        "scope" text DEFAULT '' NOT NULL,
        "timeline" text DEFAULT '' NOT NULL,
        "budget" text,
        "deliverables" text DEFAULT '' NOT NULL,
        "technical_requirements" text,
        "reference_links" text,
        "additional_notes" text,
        "created_by" integer NOT NULL REFERENCES "users"("id"),
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      );
    `;
    
    console.log('✅ Project briefings table created successfully!');
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    throw error;
  }
}

applyMigration()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
