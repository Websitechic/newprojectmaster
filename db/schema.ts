import { pgTable, text, serial, integer, boolean, timestamp, jsonb, json, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

// User role and specialization types remain unchanged
export const UserRole = {
  CLIENT: "client",
  PROJECT_MANAGER: "project_manager",
  STAFF: "staff",
  INTERN: "intern",
  CUSTOMER_SUPPORT_OFFICER: "customer_support_officer",
  OPERATIONS_MANAGER: "operations_manager",
  TEAM_LEAD: "team_lead",
} as const;

export const UserSpecialization = {
  CUSTOMER_SUPPORT_OFFICER: "customer_support_officer",
  PRODUCT_MANAGER: "product_manager",
  AUTOMATION: "automation",
  COPYWRITING: "copywriting",
  DESIGN: "design",
  MEDIA_BUYING: "media_buying",
  DEVELOPMENT: "development",
  COMMUNITY_MANAGER: "community_manager",
  OPERATIONS_MANAGER: "operations_manager",
  TECHNICAL_SUPPORT: "technical_support",
  REPLIT_DEVELOPMENT: "replit_development",
} as const;

export const ProjectManagerType = {
  MAIN: "main",
  SUPERVISOR: "supervisor",
} as const;

export const WorkStatus = {
  ACTIVE: "active",
  ON_BREAK: "on_break",
  ABSENT: "absent",
} as const;

export const AbsenceReason = {
  LEAVE: "leave",
  OFF_DAY: "off_day",
  NOT_APPLICABLE: "not_applicable",
} as const;

export const UserStatus = {
  ONLINE: "online",
  OFFLINE: "offline",
  IDLE: "idle",
} as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: Object.values(UserRole) as [string, ...string[]] }).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  gender: text("gender", { enum: ["male", "female"] }),
  specialization: text("specialization", {
    enum: Object.values(UserSpecialization) as [string, ...string[]]
  }),
  projectManagerType: text("project_manager_type", {
    enum: Object.values(ProjectManagerType) as [string, ...string[]]
  }),
  status: text("status", { enum: Object.values(UserStatus) as [string, ...string[]] }).default(UserStatus.OFFLINE),
  workStatus: text("work_status", {
    enum: Object.values(WorkStatus) as [string, ...string[]]
  }).default(WorkStatus.ACTIVE),
  breakStartTime: timestamp("break_start_time"),
  breakCount: integer("break_count").default(0),
  absenceReason: text("absence_reason", {
    enum: Object.values(AbsenceReason) as [string, ...string[]]
  }).default(AbsenceReason.NOT_APPLICABLE),
  absenceEndDate: timestamp("absence_end_date"),
  breakOneTime: text("break_one_time"), // Format: "HH:mm" (e.g., "10:00") - Daily break time
  breakTwoTime: text("break_two_time"), // DEPRECATED: No longer used
  currentTaskId: integer("current_task_id"),
  taskStartTime: timestamp("task_start_time"),
  emailVerified: boolean("email_verified").default(false),
  verificationToken: text("verification_token"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpires: timestamp("reset_password_expires"),
  onboardingStatus: text("onboarding_status", {
    enum: ["onboarded", "not_onboarded", "onboarding_in_progress", "onboarding_pending"]
  }).default("not_onboarded"),
  productService: text("product_service", {
    enum: ["website_development", "dpl_outright", "dpl_partnership", "direct_marketing", "support_maintenance"]
  }),
  clientType: text("client_type", {
    enum: ["project_client", "support_maintenance_client"]
  }),
  lastActive: timestamp("last_active").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clientInvitations = pgTable("client_invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  invitedBy: integer("invited_by").references(() => users.id),
  token: text("token").notNull(),
  status: text("status", { enum: ["pending", "accepted", "declined"] }).default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
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
  category: text("category", {
    enum: [
      "website_development",
      "dpl_outright",
      "dpl_partnership",
      "direct_marketing",
      "support_maintenance"
    ]
  }),
  status: text("status", { enum: ["active", "inactive", "pending"] }).default("pending"),
  clientId: integer("client_id").references(() => users.id),
  pendingClientEmail: text("pending_client_email"),
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
  role: text("role", { enum: ["viewer", "member", "admin", "technical_support"] }).default("member"),
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
  status: text("status", { enum: ["todo", "in_progress", "completed", "review", "technical_support"] }).default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium"),
  progress: integer("progress").default(0),
  startDate: timestamp("start_date"),
  deadline: timestamp("deadline"),
  workingHours: integer("working_hours"),
  timeSpent: integer("time_spent").default(0), // in seconds
  isTimerRunning: boolean("is_timer_running").default(false),
  timerStartTime: timestamp("timer_start_time"),
  hasBeenStarted: boolean("has_been_started").default(false),
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

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type", {
    enum: [
      "task_assigned",
      "task_updated",
      "task_completed",
      "mention",
      "technical_support_request",
      "communication_warning",
      "communication_query_discarded",
      "break_reminder",
      "deadline_reminder",
      "project_updated",
      "memo_received"
    ]
  }).notNull(),
  content: text("content").notNull(),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type", {
    enum: [
      "task",
      "project",
      "message",
      "technical_support_request",
      "complaint",
      "communication_delay",
      "memo"
    ]
  }),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(users, {
    fields: [projects.clientId],
    references: [users.id],
  }),
  manager: one(users, {
    fields: [projects.managerId],
    references: [users.id],
  }),
  clientInvitations: many(clientInvitations),
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

export const clientInvitationsRelations = relations(clientInvitations, ({ one }) => ({
  project: one(projects, {
    fields: [clientInvitations.projectId],
    references: [projects.id],
  }),
  invitedByUser: one(users, {
    fields: [clientInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const projectPlans = pgTable("project_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status", { enum: ["draft", "active", "completed", "on_hold"] }).default("draft"),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deliverables = pgTable("deliverables", {
  id: serial("id").primaryKey(),
  projectPlanId: integer("project_plan_id").references(() => projectPlans.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  duration: integer("duration"), // in days
  status: text("status", { enum: ["pending", "in_progress", "completed", "overdue"] }).default("pending"),
  order: integer("order").default(0),
  dependencies: jsonb("dependencies"), // Array of deliverable IDs this depends on
  assigneeId: integer("assignee_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  currentTask: one(tasks, {
    fields: [users.currentTaskId],
    references: [tasks.id],
  }),
}));

export const projectPlansRelations = relations(projectPlans, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectPlans.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [projectPlans.createdBy],
    references: [users.id],
  }),
  deliverables: many(deliverables),
}));

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  projectPlan: one(projectPlans, {
    fields: [deliverables.projectPlanId],
    references: [projectPlans.id],
  }),
  assignee: one(users, {
    fields: [deliverables.assigneeId],
    references: [users.id],
  }),
}));

export const leaveApplications = pgTable("leave_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  leaveType: text("leave_type", { enum: ["day_off", "leave_of_absence"] }).notNull(),
  reason: text("reason").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalDays: integer("total_days").notNull(),
  proofImageUrl: text("proof_image_url"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending"),
  appliedAt: timestamp("applied_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewComments: text("review_comments"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leaveApplicationsRelations = relations(leaveApplications, ({ one }) => ({
  user: one(users, {
    fields: [leaveApplications.userId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [leaveApplications.reviewedBy],
    references: [users.id],
  }),
}));

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectMessages = pgTable("project_messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isEdited: boolean("is_edited").default(false), // Added to indicate if the message has been edited
});

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [directMessages.receiverId],
    references: [users.id],
  }),
}));

export const projectMessagesRelations = relations(projectMessages, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectMessages.projectId],
    references: [projects.id],
  }),
  sender: one(users, {
    fields: [projectMessages.senderId],
    references: [users.id],
  }),
  readReceipts: many(messageReadReceipts),
}));

export const messageReadReceipts = pgTable("message_read_receipts", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => projectMessages.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at").defaultNow(),
});

export const messageReadReceiptsRelations = relations(messageReadReceipts, ({ one }) => ({
  message: one(projectMessages, {
    fields: [messageReadReceipts.messageId],
    references: [projectMessages.id],
  }),
  user: one(users, {
    fields: [messageReadReceipts.userId],
    references: [users.id],
  }),
}));

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", {
    enum: ["one_on_one", "team_booking", "marketing_meeting", "general_booking"]
  }).notNull(),
  scheduledBy: integer("scheduled_by").references(() => users.id).notNull(),
  participants: jsonb("participants").notNull(), // Array of user IDs
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status", {
    enum: ["scheduled", "completed", "cancelled"]
  }).default("scheduled"),
  meetingLink: text("meeting_link"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bookingsRelations = relations(bookings, ({ one }) => ({
  scheduler: one(users, {
    fields: [bookings.scheduledBy],
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
export const insertClientInvitationSchema = createInsertSchema(clientInvitations);
export const selectClientInvitationSchema = createSelectSchema(clientInvitations);
export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);
export const insertProjectPlanSchema = createInsertSchema(projectPlans);
export const selectProjectPlanSchema = createSelectSchema(projectPlans);
export const insertDeliverableSchema = createInsertSchema(deliverables);
export const selectDeliverableSchema = createSelectSchema(deliverables);
export const insertLeaveApplicationSchema = createInsertSchema(leaveApplications);
export const selectLeaveApplicationSchema = createSelectSchema(leaveApplications);
export const insertDirectMessageSchema = createInsertSchema(directMessages);
export const selectDirectMessageSchema = createSelectSchema(directMessages);


// Types
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Performance = typeof performance.$inferSelect;
export type ClientInvitation = typeof clientInvitations.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ProjectPlan = typeof projectPlans.$inferSelect;
export type Deliverable = typeof deliverables.$inferSelect;
export type LeaveApplication = typeof leaveApplications.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type ProjectMessage = typeof projectMessages.$inferSelect;
export type Booking = typeof bookings.$inferSelect;

export const insertBookingSchema = createInsertSchema(bookings);
export const selectBookingSchema = createSelectSchema(bookings);

export const insertMessageReadReceiptSchema = createInsertSchema(messageReadReceipts);
export const selectMessageReadReceiptSchema = createSelectSchema(messageReadReceipts);

// Resources table for file uploads and links
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size"),
  path: text("path"),
  link: text("link"), // For storing external links
  projectId: integer("project_id").references(() => projects.id),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const technicalSupportRequests = pgTable("technical_support_requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  taskId: integer("task_id").references(() => tasks.id),
  requesterId: integer("requester_id").references(() => users.id).notNull(),
  assignedToId: integer("assigned_to_id").references(() => users.id),
  status: text("status", {
    enum: ["pending", "in_progress", "resolved", "closed"]
  }).default("pending"),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"]
  }).default("medium"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const technicalSupportRequestsRelations = relations(technicalSupportRequests, ({ one }) => ({
  requester: one(users, {
    fields: [technicalSupportRequests.requesterId],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [technicalSupportRequests.assignedToId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [technicalSupportRequests.taskId],
    references: [tasks.id],
  }),
}));

export type Resource = typeof resources.$inferSelect;
export type TechnicalSupportRequest = typeof technicalSupportRequests.$inferSelect;
export const deadlineExtensionRequests = pgTable("deadline_extension_requests", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  requesterId: integer("requester_id").references(() => users.id).notNull(),
  projectManagerId: integer("project_manager_id").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  requestedDeadline: timestamp("requested_deadline"),
  status: text("status", {
    enum: ["pending", "approved", "declined"]
  }).default("pending"),
  decisionReason: text("decision_reason"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  approvedDeadline: timestamp("approved_deadline"),
  approvedWorkingHours: integer("approved_working_hours"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deadlineExtensionRequestsRelations = relations(deadlineExtensionRequests, ({ one }) => ({
  task: one(tasks, {
    fields: [deadlineExtensionRequests.taskId],
    references: [tasks.id],
  }),
  requester: one(users, {
    fields: [deadlineExtensionRequests.requesterId],
    references: [users.id],
  }),
  projectManager: one(users, {
    fields: [deadlineExtensionRequests.projectManagerId],
    references: [users.id],
  }),
  decidedByUser: one(users, {
    fields: [deadlineExtensionRequests.decidedBy],
    references: [users.id],
  }),
}));

export type DeadlineExtensionRequest = typeof deadlineExtensionRequests.$inferSelect;
export const insertDeadlineExtensionRequestSchema = createInsertSchema(deadlineExtensionRequests);
export const selectDeladlineExtensionRequestSchema = createSelectSchema(deadlineExtensionRequests);

export const complaints = pgTable("complaints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  productManagerName: text("product_manager_name"),
  developerName: text("developer_name"),
  technicalManagerName: text("technical_manager_name"),
  valuableThings: json("valuable_things").$type<string[]>().default([]),
  detailedExplanation: text("detailed_explanation").notNull(),
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull().default("pending"),
  reviewComments: text("review_comments"),
  submitterId: integer("submitter_id").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const complaintsRelations = relations(complaints, ({ one }) => ({
  submitter: one(users, {
    fields: [complaints.submitterId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [complaints.reviewedBy],
    references: [users.id],
  }),
}));

export type Complaint = typeof complaints.$inferSelect;
export const insertComplaintSchema = createInsertSchema(complaints);
export const selectComplaintSchema = createSelectSchema(complaints);

// Staff complaints table
export const staffComplaints = pgTable("staff_complaints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  department: text("department"),
  detailedExplanation: text("detailed_explanation").notNull(),
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull().default("pending"),
  reviewComments: text("review_comments"),
  submitterId: integer("submitter_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const staffComplaintsRelations = relations(staffComplaints, ({ one }) => ({
  submitter: one(users, {
    fields: [staffComplaints.submitterId],
    references: [users.id],
  }),
}));

export type StaffComplaint = typeof staffComplaints.$inferSelect;
export const insertStaffComplaintSchema = createInsertSchema(staffComplaints);
export const selectStaffComplaintSchema = createSelectSchema(staffComplaints);

export const memos = pgTable("memos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type", {
    enum: ["individual", "general", "department"]
  }).notNull(),
  recipients: jsonb("recipients").notNull(), // Array of user IDs or department names
  sentBy: integer("sent_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const memoReads = pgTable("memo_reads", {
  id: serial("id").primaryKey(),
  memoId: integer("memo_id").references(() => memos.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at").defaultNow(),
}, (table) => ({
  uniqueMemoUser: unique().on(table.memoId, table.userId),
}));

export const memosRelations = relations(memos, ({ one, many }) => ({
  sender: one(users, {
    fields: [memos.sentBy],
    references: [users.id],
  }),
  reads: many(memoReads),
}));

export const memoReadsRelations = relations(memoReads, ({ one }) => ({
  memo: one(memos, {
    fields: [memoReads.memoId],
    references: [memos.id],
  }),
  user: one(users, {
    fields: [memoReads.userId],
    references: [users.id],
  }),
}));

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  type: text("type", { enum: ["freetext", "todo"] }).default("freetext"),
  todoItems: jsonb("todo_items").$type<Array<{id: string; text: string; completed: boolean}>>(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  category: text("category").default("general"),
});

// Removed duplicate declarations - keeping the earlier definitions

export const staffQueries = pgTable("staff_queries", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  staffName: text("staff_name").notNull(),
  department: text("department").notNull(),
  staffUniqueValue: text("staff_unique_value").notNull(),
  reason: text("reason", {
    enum: [
      "wrongly_using_work_app",
      "substandard_delivery",
      "repeatedly_missed_deadlines",
      "disrespectful_communication",
      "disregard_company_policy"
    ]
  }).notNull(),
  whyQuery: text("why_query").notNull(),
  attachmentPath: text("attachment_path"),
  likelyPenalty: text("likely_penalty").notNull(),
  additionalNote: text("additional_note"),
  sentBy: integer("sent_by").references(() => users.id).notNull(),
  status: text("status", { enum: ["pending", "acknowledged", "resolved"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const staffQueriesRelations = relations(staffQueries, ({ one }) => ({
  staff: one(users, {
    fields: [staffQueries.staffId],
    references: [users.id],
  }),
  sender: one(users, {
    fields: [staffQueries.sentBy],
    references: [users.id],
  }),
}));

export type Memo = typeof memos.$inferSelect;
export type MemoRead = typeof memoReads.$inferSelect;
export const insertMemoSchema = createInsertSchema(memos);
export const selectMemoSchema = createSelectSchema(memos);
export const insertMemoReadSchema = createInsertSchema(memoReads);
export const selectMemoReadSchema = createSelectSchema(memoReads);

export const insertTechnicalSupportRequestSchema = createInsertSchema(technicalSupportRequests);
export const selectTechnicalSupportRequestSchema = createSelectSchema(technicalSupportRequests);

export type StaffQuery = typeof staffQueries.$inferSelect;
export const insertStaffQuerySchema = createInsertSchema(staffQueries);
export const selectStaffQuerySchema = createSelectSchema(staffQueries);

export const clientSentiment = pgTable("client_sentiment", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  sentiment: text("sentiment", {
    enum: ["satisfied", "dissatisfied", "flags"]
  }).notNull(),
  reason: text("reason").notNull(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientSentimentRelations = relations(clientSentiment, ({ one }) => ({
  client: one(users, {
    fields: [clientSentiment.clientId],
    references: [users.id],
  }),
}));

export type ClientSentiment = typeof clientSentiment.$inferSelect;
export const insertClientSentimentSchema = createInsertSchema(clientSentiment);
export const selectClientSentimentSchema = createSelectSchema(clientSentiment);

// SOP Tables
export const sops = pgTable("sops", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  referenceLink: text("reference_link"),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sopSegments = pgTable("sop_segments", {
  id: serial("id").primaryKey(),
  sopId: integer("sop_id").references(() => sops.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  fileUrl: text("file_url"),
  segmentOrder: integer("segment_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sopsRelations = relations(sops, ({ one, many }) => ({
  creator: one(users, {
    fields: [sops.createdBy],
    references: [users.id],
  }),
  segments: many(sopSegments),
}));

export const sopSegmentsRelations = relations(sopSegments, ({ one }) => ({
  sop: one(sops, {
    fields: [sopSegments.sopId],
    references: [sops.id],
  }),
}));

export type Sop = typeof sops.$inferSelect;
export type SopSegment = typeof sopSegments.$inferSelect;
export const insertSopSchema = createInsertSchema(sops);
export const selectSopSchema = createSelectSchema(sops);
export const insertSopSegmentSchema = createInsertSchema(sopSegments);
export const selectSopSegmentSchema = createSelectSchema(sopSegments);

// Issue Reports table
export const issueReports = pgTable("issue_reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  suggestions: text("suggestions"),
  reporterName: text("reporter_name").notNull(),
  reporterEmail: text("reporter_email").notNull(),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"]
  }).default("medium"),
  category: text("category", {
    enum: ["bug", "feature_request", "improvement", "other"]
  }).default("other"),
  status: text("status", {
    enum: ["pending", "reviewing", "resolved", "closed"]
  }).default("pending"),
  submitterId: integer("submitter_id").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewComments: text("review_comments"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const issueReportsRelations = relations(issueReports, ({ one }) => ({
  submitter: one(users, {
    fields: [issueReports.submitterId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [issueReports.reviewedBy],
    references: [users.id],
  }),
}));

export type IssueReport = typeof issueReports.$inferSelect;
export const insertIssueReportSchema = createInsertSchema(issueReports);
export const selectIssueReportSchema = createSelectSchema(issueReports);

// Removed duplicate notes declaration - keeping the earlier definition

export type Note = typeof notes.$inferSelect;
export const insertNoteSchema = createInsertSchema(notes);
export const selectNoteSchema = createSelectSchema(notes);