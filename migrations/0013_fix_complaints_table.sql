
-- Create complaints table if it doesn't exist
CREATE TABLE IF NOT EXISTS "complaints" (
	"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"product_manager_name" text,
	"developer_name" text,
	"technical_manager_name" text,
	"valuable_things" text DEFAULT '[]',
	"detailed_explanation" text NOT NULL,
	"screenshot_path" text,
	"created_at" integer DEFAULT (unixepoch()) NOT NULL
);
