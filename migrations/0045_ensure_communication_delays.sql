
-- Ensure communication_delays table exists
CREATE TABLE IF NOT EXISTS "communication_delays" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "delay_hours" integer NOT NULL,
  "detected_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  CONSTRAINT "communication_delays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "communication_delays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "comm_delays_project_idx" ON "communication_delays" ("project_id");
CREATE INDEX IF NOT EXISTS "comm_delays_user_idx" ON "communication_delays" ("user_id");
