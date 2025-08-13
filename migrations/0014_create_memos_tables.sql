
-- Create memos table
CREATE TABLE IF NOT EXISTS "memos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"recipients" jsonb NOT NULL,
	"sent_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Create memo_reads table
CREATE TABLE IF NOT EXISTS "memo_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"memo_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE "memos" ADD CONSTRAINT "memos_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "memo_reads" ADD CONSTRAINT "memo_reads_memo_id_memos_id_fk" FOREIGN KEY ("memo_id") REFERENCES "memos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "memo_reads" ADD CONSTRAINT "memo_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Add check constraint for memo type
ALTER TABLE "memos" ADD CONSTRAINT "memos_type_check" CHECK ("type" IN ('individual', 'staff_members', 'department'));
