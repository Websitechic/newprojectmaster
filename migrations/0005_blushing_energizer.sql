CREATE TABLE IF NOT EXISTS "issue_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "suggestions" text,
        "reporter_name" text NOT NULL,
        "reporter_email" text NOT NULL,
        "priority" text DEFAULT 'medium',
        "category" text DEFAULT 'other',
        "status" text DEFAULT 'pending',
        "submitter_id" integer,
        "reviewed_by" integer,
        "reviewed_at" timestamp,
        "review_comments" text,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text,
        "content" text NOT NULL,
        "type" text DEFAULT 'freetext',
        "todo_items" jsonb,
        "user_id" integer NOT NULL,
        "created_by" integer NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        "category" text DEFAULT 'general'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_segments" (
        "id" serial PRIMARY KEY NOT NULL,
        "sop_id" integer NOT NULL,
        "title" text NOT NULL,
        "content" text NOT NULL,
        "file_url" text,
        "segment_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sops" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "department" text NOT NULL,
        "reference_link" text,
        "created_by" integer NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "client_sentiment" ALTER COLUMN "week_start" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "client_sentiment" ALTER COLUMN "week_end" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sop_segments" ADD CONSTRAINT "sop_segments_sop_id_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."sops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sops" ADD CONSTRAINT "sops_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "memo_reads" ADD CONSTRAINT "memo_reads_memo_id_user_id_unique" UNIQUE("memo_id","user_id");