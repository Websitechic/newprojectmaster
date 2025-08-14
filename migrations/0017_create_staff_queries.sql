CREATE TABLE "staff_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"staff_name" text NOT NULL,
	"department" text NOT NULL,
	"staff_unique_value" text NOT NULL,
	"reason" text NOT NULL,
	"why_query" text NOT NULL,
	"attachment_path" text,
	"likely_penalty" text NOT NULL,
	"additional_note" text,
	"sent_by" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

ALTER TABLE "staff_queries" ADD CONSTRAINT "staff_queries_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "staff_queries" ADD CONSTRAINT "staff_queries_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;