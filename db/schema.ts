import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

// User role and specialization types
export const UserRole = {
  CLIENT: "client",
  PROJECT_MANAGER: "project_manager",
  STAFF: "staff",
} as const;

export const UserSpecialization = {
  DEVELOPER: "developer",
  DESIGNER: "designer",
  COPYWRITER: "copywriter",
  MEDIA_BUYER: "media_buyer",
  AUTOMATION_EXPERT: "automation_expert",
  MARKETING_SPECIALIST: "marketing_specialist",
} as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: Object.values(UserRole) }).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  specialization: text("specialization", { 
    enum: Object.values(UserSpecialization) 
  }),
  status: text("status").default("offline"),
  emailVerified: boolean("email_verified").default(false),
  verificationToken: text("verification_token"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpires: timestamp("reset_password_expires"),
  lastActive: timestamp("last_active").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { 
    enum: [
      "web_development",
      "mobile_app",
      "digital_marketing",
      "ui_ux_design",
      "content_creation",
      "automation",
      "social_media"
    ]
  }).notNull(),
  status: text("status", { enum: ["active", "inactive", "pending"] }).default("pending"),
  clientId: integer("client_id").references(() => users.id).notNull(),
  managerId: integer("manager_id").references(() => users.id).notNull(),
  progress: integer("progress").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectMembers = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  userId: integer("user_id").references(() => users.id),
  role: text("role", { enum: ["viewer", "member", "admin"] }).default("member"),
  invitationStatus: text("invitation_status", { 
    enum: ["pending", "accepted", "declined"] 
  }).default("pending"),
  invitedBy: integer("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  projectId: integer("project_id").references(() => projects.id),
  assigneeId: integer("assignee_id").references(() => users.id),
  assignedBy: integer("assigned_by").references(() => users.id),
  status: text("status", { enum: ["todo", "in_progress", "completed", "review"] }).default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium"),
  progress: integer("progress").default(0),
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const performance = pgTable("performance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  metrics: jsonb("metrics").notNull(),
  date: timestamp("date").defaultNow(),
});

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(users, {
    fields: [projects.clientId],
    references: [users.id],
  }),
  manager: one(users, {
    fields: [projects.managerId],
    references: [users.id],
  }),
  tasks: many(tasks),
  members: many(projectMembers),
  messages: many(messages),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  assigner: one(users, {
    fields: [tasks.assignedBy],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
  inviter: one(users, {
    fields: [projectMembers.invitedBy],
    references: [users.id],
  }),
}));

// Zod Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);
export const insertTaskSchema = createInsertSchema(tasks);
export const selectTaskSchema = createSelectSchema(tasks);
export const insertProjectMemberSchema = createInsertSchema(projectMembers);
export const selectProjectMemberSchema = createSelectSchema(projectMembers);

// Types
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Performance = typeof performance.$inferSelect;