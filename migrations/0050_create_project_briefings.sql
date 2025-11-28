
CREATE TABLE IF NOT EXISTS project_briefings (
  id SERIAL PRIMARY KEY,
  "projectName" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  category TEXT NOT NULL,
  "projectDetails" TEXT NOT NULL,
  "createdBy" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_briefings_created_by ON project_briefings("createdBy");
CREATE INDEX IF NOT EXISTS idx_project_briefings_created_at ON project_briefings("createdAt");
