
CREATE TABLE IF NOT EXISTS "deadline_extension_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"requester_id" integer NOT NULL,
	"project_manager_id" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_deadline" timestamp,
	"status" text DEFAULT 'pending',
	"decision_reason" text,
	"decided_by" integer,
	"decided_at" timestamp,
	"approved_deadline" timestamp,
	"approved_working_hours" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "deadline_extension_requests" ADD CONSTRAINT "deadline_extension_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "deadline_extension_requests" ADD CONSTRAINT "deadline_extension_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "deadline_extension_requests" ADD CONSTRAINT "deadline_extension_requests_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "deadline_extension_requests" ADD CONSTRAINT "deadline_extension_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
