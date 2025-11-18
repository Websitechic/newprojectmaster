
CREATE TABLE IF NOT EXISTS "communication_delays" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"project_manager_id" integer NOT NULL,
	"last_response_time" timestamp NOT NULL,
	"delay_hours" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

ALTER TABLE "communication_delays" ADD CONSTRAINT "communication_delays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "communication_delays" ADD CONSTRAINT "communication_delays_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "communication_delays" ADD CONSTRAINT "communication_delays_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
