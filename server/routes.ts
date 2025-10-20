import { Express, Response, Request, NextFunction } from "express";
import express from "express";
import { createServer, Server } from "http";
import { setupWebSocket } from "./websocket";
import { setupAuth } from "./auth";
import { db } from "../db";
import { breakScheduler } from "./break-scheduler";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  users,
  projects,
  tasks,
  projectMembers,
  projectPlans,
  deliverables,
  performance,
  UserRole,
  UserStatus,
  WorkStatus,
  AbsenceReason,
  clientInvitations,
  notifications,
  leaveApplications,
  directMessages,
  projectMessages,
  messages,
  resources,
  bookings,
  technicalSupportRequests,
  messageReadReceipts,
  deadlineExtensionRequests,
  complaints,
  insertTechnicalSupportRequestSchema,
  memos,
  memoReads,
  clientSentiment,
  staffComplaints,
  staffQueries,
  notes,
  sops,
  sopSegments,
  issueReports,
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull, or, sql, ne, gte, isNull } from "drizzle-orm";
import WebSocket from "ws";

// Helper function to create notifications
async function createNotification(userId: number, type: string, content: string, referenceId?: number, referenceType?: string) {
  try {
    const [newNotification] = await db
      .insert(notifications)
      .values({
        userId,
        type,
        content,
        referenceId,
        referenceType,
        read: false,
        createdAt: new Date(),
      })
      .returning();

    console.log(`✅ Notification created for user ${userId}:`, {
      id: newNotification.id,
      type: newNotification.type,
      referenceType: newNotification.referenceType,
      content: newNotification.content
    });

    // Send SSE notification if user is connected
    if (global.sseClients && global.sseClients.has(userId)) {
      const userClient = global.sseClients.get(userId);
      if (userClient && !userClient.writableEnded) {
        try {
          // Ensure all required fields are present for sound triggering
          const notificationPayload = {
            type: 'notification',
            notification: {
              id: newNotification.id,
              userId: newNotification.userId,
              type: newNotification.type,
              content: newNotification.content,
              referenceId: newNotification.referenceId,
              referenceType: newNotification.referenceType,
              read: newNotification.read,
              createdAt: newNotification.createdAt?.toISOString() || new Date().toISOString()
            }
          };

          userClient.write(`data: ${JSON.stringify(notificationPayload)}\n\n`);
          console.log(`📨 SSE notification sent to user ${userId}:`, notificationPayload);
        } catch (error) {
          console.error(`❌ Error sending SSE notification to user ${userId}:`, error);
          global.sseClients.delete(userId);
        }
      } else {
        console.log(`⚠️ No active SSE client for user ${userId}`);
      }
    } else {
      console.log(`⚠️ User ${userId} not in SSE clients map`);
    }

    return newNotification;
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    throw error;
  }
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'leave-proof');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {fileSize: 10 * 1024 * 1024}, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];

    const isAllowed = allowedMimeTypes.some(type => file.mimetype.startsWith(type) || file.mimetype === type);

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only images and documents (PDF, Word, Excel, TXT) are allowed'));
    }
  }
});

// Middleware for authentication (assuming it's defined elsewhere and imported)
// For demonstration purposes, we'll define a placeholder here.
// In a real application, this would likely be imported from './auth' or a similar file.
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user) {
    next();
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
};


export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const server = createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Add middleware to ensure API routes return JSON - BEFORE static files
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');

    // Override res.send to ensure JSON for API routes
    const originalSend = res.send;
    res.send = function(data) {
      // Always ensure we're sending JSON for API routes
      if (typeof data === 'string' && !data.startsWith('{') && !data.startsWith('[')) {
        // If it's a plain string that's not JSON, wrap it
        return originalSend.call(this, JSON.stringify({ message: data }));
      }
      return originalSend.call(this, data);
    };

    // Override res.status().send() to ensure JSON
    const originalStatus = res.status;
    res.status = function(code) {
      const statusRes = originalStatus.call(this, code);
      const originalStatusSend = statusRes.send;
      statusRes.send = function(data) {
        if (typeof data === 'string' && !data.startsWith('{') && !data.startsWith('[')) {
          return originalStatusSend.call(this, JSON.stringify({ error: data }));
        }
        return originalStatusSend.call(this, data);
      };
      return statusRes;
    };

    next();
  });

  // Static file serving AFTER API middleware
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // User endpoint for authentication
  app.get("/api/user", (req, res) => {
    try {
      if (req.isAuthenticated() && req.user) {
        res.json(req.user);
      } else {
        res.status(401).json({ error: "Not authenticated" });
      }
    } catch (error) {
      console.error("Error in /api/user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Tasks endpoint - returns tasks based on user role
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      let userTasks = [];

      if (user.role === "staff" || user.role === "intern") {
        // Staff and interns see tasks assigned to them
        userTasks = await db
          .select()
          .from(tasks)
          .where(eq(tasks.assigneeId, user.id))
          .orderBy(desc(tasks.updatedAt));
      } else if (user.role === "client") {
        // Clients see tasks in their projects
        const clientProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, user.id));

        const projectIds = clientProjects.map(p => p.id);
        if (projectIds.length > 0) {
          userTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        }
      } else if (user.role === "project_manager") {
        // Project managers see all tasks in their projects
        const managedProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.managerId, user.id));

        const projectIds = managedProjects.map(p => p.id);
        if (projectIds.length > 0) {
          userTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        }
      } else if (
        user.role === "operations_manager" ||
        user.specialization === "operations_manager" ||
        user.role === "team_lead" ||
        user.role === "customer_support_officer"
      ) {
        // Operations managers, team leads, and customer support officers see all tasks
        userTasks = await db
          .select()
          .from(tasks)
          .orderBy(desc(tasks.updatedAt));
      }

      res.json(userTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Notifications endpoint
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      console.log("Fetching notifications for user:", user.id);

      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt));

      console.log(`Found ${userNotifications.length} notifications for user ${user.id}`);

      res.json(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Update user status endpoint
  app.put("/api/users/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { status } = req.body;
      const user = req.user!;

      // Validate status
      const validStatuses = ["online", "idle", "away", "offline"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      // Update user status in database
      const [updatedUser] = await db
        .update(users)
        .set({
          status: status as any,
          lastActive: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      res.json({ success: true, status: updatedUser.status });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Enhanced deadline and notification checking - runs every hour
  setInterval(async () => {
    try {
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get tasks due within 24 hours
      const tasksDueSoon = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
          deadline: tasks.deadline,
        })
        .from(tasks)
        .where(
          and(
            gte(tasks.deadline, now),
            sql`${tasks.deadline} <= ${tomorrow}`,
            ne(tasks.status, "completed")
          )
        );

      // Send deadline reminder notifications
      for (const task of tasksDueSoon) {
        if (task.assigneeId && task.deadline) {
          const hoursUntilDeadline = Math.ceil((new Date(task.deadline).getTime() - now.getTime()) / (1000 * 60 * 60));
          let reminderMessage = "";

          if (hoursUntilDeadline <= 2) {
            reminderMessage = `⚠️ URGENT: Task "${task.title}" is due in ${hoursUntilDeadline} hour${hoursUntilDeadline !== 1 ? 's' : ''}`;
          } else if (hoursUntilDeadline <= 8) {
            reminderMessage = `⏰ Task "${task.title}" is due in ${hoursUntilDeadline} hours`;
          } else {
            reminderMessage = `📅 Reminder: Task "${task.title}" is due tomorrow`;
          }

          await createNotification(
            task.assigneeId,
            "deadline_reminder",
            reminderMessage,
            task.id,
            "task"
          );
        }
      }

      // Get overdue tasks
      const overdueTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
          deadline: tasks.deadline,
        })
        .from(tasks)
        .where(
          and(
            sql`${tasks.deadline} < ${today}`,
            ne(tasks.status, "completed")
          )
        );

      // Send overdue notifications
      for (const task of overdueTasks) {
        if (task.assigneeId && task.deadline) {
          const daysOverdue = Math.ceil((today.getTime() - new Date(task.deadline).getTime()) / (1000 * 60 * 60 * 24));
          await createNotification(
            task.assigneeId,
            "task_overdue",
            `🔴 Task "${task.title}" is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
            task.id,
            "task"
          );
        }
      }

    } catch (error) {
      console.error("Error in deadline notification check:", error);
    }
  }, 60 * 60 * 1000); // Run every hour

  // User heartbeat endpoint
  app.post("/api/user/heartbeat", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = req.user!;

      // Update last active timestamp
      await db
        .update(users)
        .set({
          lastActive: new Date(),
        })
        .where(eq(users.id, user.id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user heartbeat:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  // Projects API Routes
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    let projectsList;

    try {
      if (user.role === "client") {
        // Clients see projects they're assigned to as clientId
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, user.id))
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "project_manager") {
        if (user.projectManagerType === "supervisor") {
          // Supervisor project managers see only DPL Outright and DPL Partnership projects
          // They see projects they're members of (auto-added) or manage
          const supervisorProjects = await db
            .select({
              project: projects,
            })
            .from(projects)
            .leftJoin(projectMembers, and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, user.id)
            ))
            .where(
              and(
                or(
                  eq(projects.category, "dpl_outright"),
                  eq(projects.category, "dpl_partnership")
                ),
                or(
                  eq(projects.managerId, user.id),
                  eq(projectMembers.userId, user.id)
                )
              )
            )
            .orderBy(desc(projects.updatedAt));

          projectsList = supervisorProjects.map(sp => sp.project);
        } else {
          // Main project managers see projects they manage OR are members of
          const managedProjects = await db
            .select({
              project: projects,
            })
            .from(projects)
            .leftJoin(projectMembers, and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            ))
            .where(
              or(
                eq(projects.managerId, user.id),
                eq(projectMembers.userId, user.id)
              )
            )
            .orderBy(desc(projects.updatedAt));

          // Remove duplicates (in case they manage AND are a member)
          const uniqueProjects = new Map();
          managedProjects.forEach(mp => {
            if (mp.project && !uniqueProjects.has(mp.project.id)) {
              uniqueProjects.set(mp.project.id, mp.project);
            }
          });
          projectsList = Array.from(uniqueProjects.values());
        }
      } else if (user.role === "product_owner") {
        // Product owners see all projects (read-only access)
        projectsList = await db
          .select()
          .from(projects)
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Operations managers see all projects with full access
        projectsList = await db
          .select()
          .from(projects)
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "team_lead") {
        // Team leads see all projects with full access
        projectsList = await db
          .select()
          .from(projects)
          .orderBy(desc(projects.updatedAt));
      }
      else {
        // Staff see projects they're invited to and have accepted
        const memberProjects = await db
          .select({
            project: projects,
          })
          .from(projectMembers)
          .innerJoin(projects, eq(projectMembers.projectId, projects.id))
          .where(
            and(
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .orderBy(desc(projects.updatedAt));

        projectsList = memberProjects.map(mp => mp.project);
      }

      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Get unread mention counts from notifications
  app.get("/api/mentions/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Get unread mention notifications grouped by project
      const mentionNotifications = await db
        .select({
          projectId: notifications.referenceId,
          count: sql<number>`count(*)`,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.type, "team_mention"),
            eq(notifications.read, false),
            eq(notifications.referenceType, "project")
          )
        )
        .groupBy(notifications.referenceId);

      const counts = mentionNotifications.reduce((acc, notification) => {
        if (notification.projectId) {
          acc[notification.projectId] = notification.count;
        }
        return acc;
      }, {} as Record<number, number>);

      res.json(counts);
    } catch (error) {
      console.error("Error fetching mention counts:", error);
      res.status(500).json({ error: "Failed to fetch mention counts" });
    }
  });

  // Get unread message counts for projects
  app.get("/api/projects/unread-counts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Get all projects the user has access to
      let userProjectIds: number[] = [];

      if (user.role === "client") {
        const clientProjects = await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.clientId, user.id));
        userProjectIds = clientProjects.map(p => p.id);
      } else if (user.role === "project_manager") {
        const managerProjects = await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.managerId, user.id));
        userProjectIds = managerProjects.map(p => p.id);
      } else if (user.role === "product_owner" || user.role === "operations_manager" || user.specialization === "operations_manager" || user.role === "team_lead") {
        const allProjects = await db
          .select({ id: projects.id })
          .from(projects);
        userProjectIds = allProjects.map(p => p.id);
      } else {
        // Staff - get projects they're members of
        const memberProjects = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          );
        userProjectIds = memberProjects.map(mp => mp.projectId);
      }

      if (userProjectIds.length === 0) {
        return res.json({});
      }

      // Get unread message counts for each project
      const unreadCounts = await db
        .select({
          projectId: projectMessages.projectId,
          unreadCount: sql<number>`count(*)`,
        })
        .from(projectMessages)
        .leftJoin(
          messageReadReceipts,
          and(
            eq(messageReadReceipts.messageId, projectMessages.id),
            eq(messageReadReceipts.userId, user.id)
          )
        )
        .where(
          and(
            inArray(projectMessages.projectId, userProjectIds),
            ne(projectMessages.senderId, user.id), // Don't count own messages
            isNull(messageReadReceipts.id) // Not read by user
          )
        )
        .groupBy(projectMessages.projectId);

      const counts = unreadCounts.reduce((acc, count) => {
        acc[count.projectId] = count.unreadCount;
        return acc;
      }, {} as Record<number, number>);

      res.json(counts);
    } catch (error) {
      console.error("Error fetching project unread counts:", error);
      res.status(500).json({ error: "Failed to fetch unread counts" });
    }
  });

  // Get available staff by specialization (for KPI reports)
  app.get("/api/staff", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isCustomerSupportOfficer = user.role === "customer_support_officer";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isTeamLead = user.role === "team_lead";
    const isReplitDeveloper = user.specialization === "replit_development" || user.specialization === "Replit Development";

    // Only project managers, customer support officers, operations managers, team leads, and Replit developers can view staff
    if (!isProjectManager && !isCustomerSupportOfficer && !isOperationsManager && !isTeamLead && !isReplitDeveloper) {
      return res.status(403).send("Access denied");
    }

    const {specialization} = req.query;

    // Only apply specialization filter to staff members and interns, not customer support officers or team leads
    let whereCondition;

    if (specialization) {
      whereCondition = or(
        and(
          eq(users.role, "staff"),
          eq(users.specialization, specialization as string)
        ),
        and(
          eq(users.role, "intern"),
          eq(users.specialization, specialization as string)
        ),
        eq(users.role, "customer_support_officer"),
        eq(users.role, "team_lead")
      );
    } else {
      whereCondition = or(
        eq(users.role, "staff"),
        eq(users.role, "intern"),
        eq(users.role, "customer_support_officer"),
        eq(users.role, "team_lead")
      );
    }

    const query = db
      .select()
      .from(users)
      .where(whereCondition);

    const staffAndCustomerSupportOfficers = await query.orderBy(desc(users.lastActive));
    res.json(staffAndCustomerSupportOfficers);
  });

  // Get all users (for staff queries dropdown)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(users)
        .where(eq(users.role, "staff"))
        .orderBy(asc(users.name));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get clients for project form
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isCustomerSupportOfficer = user.role === "customer_support_officer";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isTeamLead = user.role === "team_lead";

    if (!isProjectManager && !isProductOwner && !isCustomerSupportOfficer && !isOperationsManager && !isTeamLead) {
      return res.status(403).json({ error: "Only project managers, product owners, customer support officers, operations managers, and team leads can access clients" });
    }

    try {
      const clients = await db
        .select()
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  // Get clients for management page with project counts
  app.get("/api/clients/management", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    // Only product owners and customer support officers can access client management
    if (user.role !== "product_owner" && user.role !== "customer_support_officer") {
      return res.status(403).json({ error: "Only product owners and customer support officers can access client management" });
    }

    try {
      // Get all clients
      const clients = await db
        .select()
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      // Get project counts for each client
      const clientsWithProjectCounts = await Promise.all(
        clients.map(async (client) => {
          const projectCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(projects)
            .where(eq(projects.clientId, client.id));

          return {
            ...client,
            projectCount: projectCount[0]?.count || 0,
          };
        })
      );

      res.json(clientsWithProjectCounts);
    } catch (error) {
      console.error("Error fetching clients for management:", error);
      res.status(500).json({ error: "Failed to fetch clients for management" });
    }
  });

  // Get all users (for bookings participant selection)
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(users)
        .where(ne(users.role, "client"))
        .orderBy(asc(users.name));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get recent project activity (for active projects check)
  app.get("/api/projects/recent-activity", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      // Get recent team messages
      const recentMessages = await db
        .select({
          projectId: projectMessages.projectId,
          createdAt: projectMessages.createdAt,
        })
        .from(projectMessages)
        .where(gte(projectMessages.createdAt, twentyFourHoursAgo))
        .orderBy(desc(projectMessages.createdAt));

      // Get recent resources
      const recentResources = await db
        .select({
          projectId: resources.projectId,
          createdAt: resources.createdAt,
        })
        .from(resources)
        .where(gte(resources.createdAt, twentyFourHoursAgo))
        .orderBy(desc(resources.createdAt));

      // Group by project
      const activityByProject: Record<number, { hasMessages: boolean; hasResources: boolean; latestActivity: Date }> = {};

      recentMessages.forEach(msg => {
        if (msg.projectId) {
          if (!activityByProject[msg.projectId]) {
            activityByProject[msg.projectId] = { hasMessages: false, hasResources: false, latestActivity: new Date(msg.createdAt) };
          }
          activityByProject[msg.projectId].hasMessages = true;
          const msgDate = new Date(msg.createdAt);
          if (msgDate > activityByProject[msg.projectId].latestActivity) {
            activityByProject[msg.projectId].latestActivity = msgDate;
          }
        }
      });

      recentResources.forEach(resource => {
        if (resource.projectId) {
          if (!activityByProject[resource.projectId]) {
            activityByProject[resource.projectId] = { hasMessages: false, hasResources: false, latestActivity: new Date(resource.createdAt) };
          }
          activityByProject[resource.projectId].hasResources = true;
          const resourceDate = new Date(resource.createdAt);
          if (resourceDate > activityByProject[resource.projectId].latestActivity) {
            activityByProject[resource.projectId].latestActivity = resourceDate;
          }
        }
      });

      res.json(activityByProject);
    } catch (error) {
      console.error("Error fetching recent project activity:", error);
      res.status(500).json({ error: "Failed to fetch recent activity" });
    }
  });

  // Get single user details
  app.get("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = parseInt(req.params.id);
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Get departments (for staff queries dropdown)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // Predefined department list for staff queries
      const departmentList = [
        "Technical support",
        "Design",
        "Development",
        "Media buying",
        "Copywriting",
        "Automation",
        "Community manager",
        "Project manager",
        "Product owner",
        "Replit development"
      ];

      res.json(departmentList);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // KPI Report API Routes

  // Get productivity data for KPI report (Operations Manager and Team Lead only)
  app.get("/api/kpi-report/productivity", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers and team leads can access KPI reports" });
    }

    try {
      const {staffId, startDate, endDate} = req.query;

      if (!staffId || !startDate || !endDate) {
        return res.status(400).json({ error: "Staff ID, start date, and end date are required" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Get all tasks for the staff member within the date range
      const staffTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, parseInt(staffId as string)),
            gte(tasks.updatedAt, start),
            eq(tasks.isTimerRunning, false) // Only completed timer sessions
          )
        )
        .orderBy(desc(tasks.updatedAt));

      // Process daily productivity data
      const dailyMap = new Map();
      const dateRange = [];

      // Create date range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dateRange.push(new Date(d));
      }

      // Initialize daily data
      dateRange.forEach(date => {
        const dateKey = date.toISOString().split('T')[0];
        dailyMap.set(dateKey, {
          date: dateKey,
          totalSpanHours: 0,
          actualWorkHours: 0,
          performanceStatus: 'poor',
          performanceColor: '#EF4444',
          taskCount: 0,
          tasks: []
        });
      });

      // Process tasks and calculate productivity
      staffTasks.forEach(task => {
        if (task.timerStartTime && task.timerDuration) {
          const taskDate = new Date(task.timerStartTime);
          const dateKey = taskDate.toISOString().split('T')[0];

          if (dailyMap.has(dateKey)) {
            const dailyData = dailyMap.get(dateKey);
            const hoursWorked = task.timerDuration / 3600; // Convert seconds to hours

            dailyData.actualWorkHours += hoursWorked;
            dailyData.taskCount += 1;
            dailyData.tasks.push(task.title);

            // Calculate performance status (standardized with productivity page)
            if (dailyData.actualWorkHours >= 4) {
              dailyData.performanceStatus = 'good';
              dailyData.performanceColor = '#10B981';
            } else if (dailyData.actualWorkHours >= 2) {
              dailyData.performanceStatus = 'fair';
              dailyData.performanceColor = '#F59E0B';
            }
          }
        }
      });

      const dailyData = Array.from(dailyMap.values());

      // Calculate weekly data for chart
      const weeklyData = dailyData.map(day => ({
        day: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
        hours: day.actualWorkHours,
        totalSpanHours: Math.max(day.actualWorkHours, 8), // Assume 8-hour work day
        performanceStatus: day.performanceStatus,
        performanceColor: day.performanceColor
      }));

      // Calculate summary
      const totalDays = dailyData.length;
      const avgHoursPerDay = dailyData.reduce((sum, day) => sum + day.actualWorkHours, 0) / totalDays;
      const goodDays = dailyData.filter(day => day.performanceStatus === 'good').length;
      const fairDays = dailyData.filter(day => day.performanceStatus === 'fair').length;
      const poorDays = dailyData.filter(day => day.performanceStatus === 'poor').length;

      const productivityData = {
        dailyData,
        weeklyData,
        summary: {
          totalDays,
          avgHoursPerDay,
          goodDays,
          fairDays,
          poorDays
        }
      };

      res.json(productivityData);
    } catch (error) {
      console.error("Error fetching productivity data:", error);
      res.status(500).json({ error: "Failed to fetch productivity data" });
    }
  });

  // Productivity API endpoint for individual users
  app.get("/api/productivity", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();

    try {
      // Set date boundaries for today
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Set date boundaries for yesterday
      const yesterday = new Date(targetDate);
      yesterday.setDate(targetDate.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get current week start (Monday)
      const now = new Date(targetDate);
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(now.setDate(diff));
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get ALL tasks for the user (not just by update date)
      const allUserTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks by actual work done (timer sessions or time spent) rather than update date
      const todayTasks = allUserTasks.filter(task => {
        // Include tasks that have time spent today or currently running timer
        if (task.isTimerRunning && task.timerStartTime) {
          const timerDate = new Date(task.timerStartTime);
          return timerDate >= startOfDay && timerDate <= endOfDay;
        }

        // Include tasks that have accumulated time and were worked on today
        if (task.timeSpent && task.timeSpent > 0) {
          // Check if task was updated today (as proxy for work done)
          const updateDate = new Date(task.updatedAt);
          return updateDate >= startOfDay && updateDate <= endOfDay;
        }

        // Include tasks that were started or modified today
        const updateDate = new Date(task.updatedAt);
        return updateDate >= startOfDay && updateDate <= endOfDay;
      });

      const yesterdayTasks = allUserTasks.filter(task => {
        const updateDate = new Date(task.updatedAt);
        return updateDate >= startOfYesterday && updateDate <= endOfYesterday;
      });

      const weekTasks = allUserTasks.filter(task => {
        const updateDate = new Date(task.updatedAt);
        return updateDate >= weekStart && updateDate <= weekEnd;
      });

      // Get project names for tasks
      const allTaskIds = [...todayTasks, ...yesterdayTasks, ...weekTasks].map(t => t.projectId).filter(Boolean);
      const projectsData = allTaskIds.length > 0 ? await db
        .select()
        .from(projects)
        .where(inArray(projects.id, allTaskIds)) : [];

      const projectMap = new Map(projectsData.map(p => [p.id, p.name]));

      // Process today's data with current timer sessions
      const todayTaskBreakdown = todayTasks.map(task => {
        let currentTimeSpent = task.timeSpent || 0;

        // Add current session time if timer is running
        if (task.isTimerRunning && task.timerStartTime) {
          const sessionTime = Math.floor((Date.now() - new Date(task.timerStartTime).getTime()) / 1000);
          currentTimeSpent += sessionTime;
        }

        return {
          taskId: task.id,
          title: task.title,
          projectName: projectMap.get(task.projectId) || "Unknown Project",
          timeSpent: currentTimeSpent,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8,
          isTimerRunning: task.isTimerRunning || false,
          timerStartTime: task.timerStartTime
        };
      });

      // Calculate total time including running timers
      const totalTimeWorked = todayTaskBreakdown.reduce((total, task) => total + task.timeSpent, 0);

      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked,
        taskBreakdown: todayTaskBreakdown,
        weeklyBreakdown: [] // Will be populated below
      };

      // Process yesterday's data
      const yesterdayTaskBreakdown = yesterdayTasks.map(task => ({
        taskId: task.id,
        title: task.title,
        projectName: projectMap.get(task.projectId) || "Unknown Project",
        timeSpent: task.timeSpent || 0,
        status: task.status,
        isCompleted: task.status === 'completed',
        workingHours: task.workingHours || 8
      }));

      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTaskBreakdown,
        weeklyBreakdown: []
      };

      // Generate weekly breakdown (Mon-Fri)
      const weeklyBreakdown = [];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(weekStart);
        currentDay.setDate(weekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks for this specific day
        const dayTasks = weekTasks.filter(task => {
          const taskDate = new Date(task.updatedAt);
          return taskDate >= dayStart && taskDate <= dayEnd;
        });

        const totalTime = dayTasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);
        const hours = totalTime / 3600; // Convert seconds to hours

        // Calculate performance status (consistent with daily data)
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444';

        if (hours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#10B981';
        } else if (hours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#F59E0B';
        }

        // Get first and last timer activities for workday span calculation
        const timerTasks = dayTasks.filter(task => task.timerStartTime);
        let workdayStart = null;
        let workdayEnd = null;
        let totalSpanHours = hours; // Default to actual work hours

        if (timerTasks.length > 0) {
          const timerStarts = timerTasks.map(task => new Date(task.timerStartTime)).sort((a, b) => a.getTime() - b.getTime());
          const timerEnds = timerTasks.map(task => {
            const start = new Date(task.timerStartTime);
            return new Date(start.getTime() + ((task.timerDuration || 0) * 1000));
          }).sort((a, b) => b.getTime() - a.getTime());

          workdayStart = timerStarts[0].toISOString();
          workdayEnd = timerEnds[0].toISOString();
          totalSpanHours = Math.max(hours, (timerEnds[0].getTime() - timerStarts[0].getTime()) / (1000 * 60 * 60));
        }

        weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0],
          dayName: dayNames[currentDay.getDay()],
          timeSpent: totalTime,
          hours,
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart,
          workdayEnd,
          totalSpanHours,
          performanceStatus,
          performanceColor
        });
      }

      // Add weekly breakdown to today's data (for the chart)
      todayData.weeklyBreakdown = weeklyBreakdown;

      // Calculate week summary
      const weekData = {
        totalTasks: weekTasks.length,
        completedTasks: weekTasks.filter(task => task.status === 'completed').length,
        totalTime: weekTasks.reduce((total, task) => total + (task.timeSpent || 0), 0)
      };

      const response = {
        today: todayData,
        yesterday: yesterdayData,
        thisWeek: weekData
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching productivity data:", error);
      res.status(500).json({ error: "Failed to fetch productivity data" });
    }
  });

  // Export KPI report (Operations Manager and Team Lead only)
  app.post("/api/kpi-report/export", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers and team leads can export KPI reports" });
    }

    try {
      const { format, staffId, staffName, department, dateRange, productivityData } = req.body;

      if (!format || !staffId || !productivityData) {
        return res.status(400).json({ error: "Format, staff ID, and productivity data are required" });
      }

      const filename = `kpi-report-${staffName || 'staff'}-${Date.now()}`;

      if (format === 'csv') {
        // Create CSV content with proper escaping
        const csvRows = [
          ['Date', 'Total Span Hours', 'Actual Work Hours', 'Tasks', 'Status'],
          ...productivityData.dailyData.map((day: any) => [
            day.date,
            day.totalSpanHours.toFixed(2),
            day.actualWorkHours.toFixed(2),
            day.taskCount,
            day.performanceStatus
          ])
        ];

        const csvContent = csvRows.map(row => 
          row.map(field => 
            typeof field === 'string' && field.includes(',') 
              ? `"${field.replace(/"/g, '""')}"` 
              : field
          ).join(',')
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csvContent);
      } else if (format === 'excel') {
        // Create a simple Excel-compatible CSV format with tab separators
        const excelRows = [
          ['Staff Name', staffName],
          ['Department', department],
          ['Date Range', `${dateRange} days`],
          ['Generated At', new Date().toISOString()],
          [''],
          ['Summary'],
          ['Total Days', productivityData.summary.totalDays],
          ['Average Hours per Day', productivityData.summary.avgHoursPerDay.toFixed(2)],
          ['Good Days', productivityData.summary.goodDays],
          ['Fair Days', productivityData.summary.fairDays],
          ['Poor Days', productivityData.summary.poorDays],
          [''],
          ['Daily Data'],
          ['Date', 'Total Span Hours', 'Actual Work Hours', 'Tasks', 'Status'],
          ...productivityData.dailyData.map((day: any) => [
            day.date,
            day.totalSpanHours.toFixed(2),
            day.actualWorkHours.toFixed(2),
            day.taskCount,
            day.performanceStatus
          ])
        ];

        const excelContent = excelRows.map(row => row.join('\t')).join('\n');

        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xls"`);
        res.send(excelContent);
      } else if (format === 'pdf') {
        // Create a simple text-based report that can be viewed as PDF content
        const pdfContent = `KPI REPORT - ${staffName}
==================================================

Staff Information:
- Name: ${staffName}
- Department: ${department}
- Report Period: Last ${dateRange} days
- Generated: ${new Date().toLocaleString()}

SUMMARY
-------
Total Days: ${productivityData.summary.totalDays}
Average Hours per Day: ${productivityData.summary.avgHoursPerDay.toFixed(2)} hours
Good Performance Days: ${productivityData.summary.goodDays}
Fair Performance Days: ${productivityData.summary.fairDays}
Poor Performance Days: ${productivityData.summary.poorDays}

DAILY BREAKDOWN
---------------
${productivityData.dailyData.map((day: any) => 
  `${day.date} | ${day.totalSpanHours.toFixed(2)}h span | ${day.actualWorkHours.toFixed(2)}h work | ${day.taskCount} tasks | ${day.performanceStatus.toUpperCase()}`
).join('\n')}

WEEKLY OVERVIEW
---------------
${productivityData.weeklyData ? productivityData.weeklyData.map((week: any) => 
  `${week.day}: ${week.hours.toFixed(2)} hours (${week.performanceStatus})`
).join('\n') : 'No weekly data available'}

End of Report
==================================================`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(pdfContent);
      } else {
        return res.status(400).json({ error: "Invalid export format" });
      }

    } catch (error) {
      console.error("Error exporting KPI report:", error);
      res.status(500).json({ error: "Failed to export report" });
    }
  });

  // Staff Report API Route (Project Managers, Operations Managers, and Team Leads only)
  app.get("/api/staff-report", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager") {
      return res.status(403).send("Access denied - Project Manager, Operations Manager, or Team Lead role required");
    }

    try {
      // Get all staff members and interns with their current work status - using only existing fields
      const staffMembers = await db
        .select()
        .from(users)
        .where(or(eq(users.role, "staff"), eq(users.role, "intern")))
        .orderBy(desc(users.lastActive));

      // Get all tasks for these staff members - using actual schema fields
      const allTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          projectId: tasks.projectId,
          assigneeId: tasks.assigneeId,
          assignedBy: tasks.assignedBy,
          deadline: tasks.deadline,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          isTimerRunning: tasks.isTimerRunning,
          timerStartTime: tasks.timerStartTime,
          priority: tasks.priority,
          progress: tasks.progress,
          startDate: tasks.startDate,
          workingHours: tasks.workingHours,
          timeSpent: tasks.timeSpent,
          hasBeenStarted: tasks.hasBeenStarted,
          projectName: projects.name,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(inArray(tasks.assigneeId, staffMembers.map(s => s.id)));

      // Process staff data
      const staffReport = staffMembers.map(staff => {
        const staffTasks = allTasks.filter(task => task.assigneeId === staff.id);
        const activeTasks = staffTasks.filter(task => task.status !== 'completed').length;

        // Find currently engaged task (timer running)
        const engagedTask = staffTasks.find(task => task.isTimerRunning);

        // Calculate engagement info
        let engagedTaskInfo = null;
        if (engagedTask) {
          const totalHoursSpent = engagedTask.timeSpent ? engagedTask.timeSpent / 3600 : 0;
          const assignedHours = engagedTask.workingHours || 0;
          const remainingHours = Math.max(0, assignedHours - totalHoursSpent);

          engagedTaskInfo = {
            staffId: staff.id,
            taskId: engagedTask.id,
            taskTitle: engagedTask.title,
            projectId: engagedTask.projectId,
            projectName: engagedTask.projectName || "Unknown Project",
            assignedHours,
            totalHoursSpent,
            currentSessionHours: 0, // Would need to calculate from timer start time
            remainingHours,
            timerStartTime: engagedTask.timerStartTime,
            isTimerRunning: engagedTask.isTimerRunning,
          };
        }

        // Calculate break info if on break
        let breakInfo = null;
        if (staff.workStatus === 'on_break' && staff.breakStartTime) {
          const breakStart = new Date(staff.breakStartTime);
          const now = new Date();
          const breakDuration = Math.floor((now.getTime() - breakStart.getTime()) / 60000); // minutes

          breakInfo = {
            staffId: staff.id,
            breakStartTime: staff.breakStartTime,
            breakDuration,
            breakCount: staff.breakCount || 0,
            breakOvertime: breakDuration > 60, // 1 hour break limit
          };
        }

        // Calculate absence info
        let absentDaysRemaining = null;
        if (staff.workStatus === 'absent' && staff.absenceEndDate) {
          const endDate = new Date(staff.absenceEndDate);
          const today = new Date();
          absentDaysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        }

        return {
          id: staff.id,
          name: staff.name,
          username: staff.username,
          email: staff.email,
          specialization: staff.specialization,
          status: staff.status,
          workStatus: staff.workStatus,
          breakStartTime: staff.breakStartTime,
          breakCount: staff.breakCount,
          absenceReason: staff.absenceReason,
          absenceEndDate: staff.absenceEndDate,
          currentTaskId: staff.currentTaskId,
          taskStartTime: staff.taskStartTime,
          lastActive: staff.lastActive,
          tasks: staffTasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            projectId: task.projectId,
            projectName: task.projectName || "Unknown Project",
            assigneeId: task.assigneeId,
            deadline: task.deadline,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          })),
          taskCount: staffTasks.length,
          activeTasks,
          isCurrentlyEngaged: !!engagedTask,
          engagedTask: engagedTaskInfo,
          breakInfo,
          absentDaysRemaining,
        };
      });

      res.json(staffReport);
    } catch (error) {
      console.error("Error fetching staff report:", error);
      res.status(500).json({ error: "Failed to fetch staff report" });
    }
  });

  // Client Accounts API Routes (Project Managers, Product Owners, Operations Managers, Team Leads, and Customer Support Officers only)
  app.get("/api/client-accounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.role !== "team_lead" && user.role !== "customer_support_officer" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const clients = await db
        .select()
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clients);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Update client onboarding status
  app.put("/api/clients/:id/onboarding-status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "product_owner" && user.role !== "customer_support_officer") {
      return res.status(403).json({ error: "Only product owners and customer support officers can update onboarding status" });
    }

    try {
      const clientId = parseInt(req.params.id);
      const { onboardingStatus } = req.body;

      if (!onboardingStatus) {
        return res.status(400).json({ error: "Onboarding status is required" });
      }

      const validStatuses = ["onboarded", "not_onboarded", "onboarding_in_progress", "onboarding_pending"];
      if (!validStatuses.includes(onboardingStatus)) {
        return res.status(400).json({ error: "Invalid onboarding status" });
      }

      const [updatedClient] = await db
        .update(users)
        .set({ onboardingStatus: onboardingStatus as any })
        .where(eq(users.id, clientId))
        .returning();

      if (!updatedClient) {
        return res.status(404).json({ error: "Client not found" });
      }

      res.json({ success: true, client: updatedClient });
    } catch (error) {
      console.error("Error updating client onboarding status:", error);
      res.status(500).json({ error: "Failed to update onboarding status" });
    }
  });

  // Create Client Account API Route
  app.post("/api/client-accounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.role !== "customer_support_officer" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const { name, email, username, password, productService, clientType, gender } = req.body;

      if (!name || !email || !username || !password || !productService || !clientType || !gender) {
        return res.status(400).json({ error: "All fields including gender are required" });
      }

      // Validate gender
      if (!["male", "female"].includes(gender)) {
        return res.status(400).json({ error: "Gender must be either 'male' or 'female'" });
      }

      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(or(eq(users.email, email), eq(users.username, username)))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ error: "User with this email or username already exists" });
      }

      // Hash the password using the same method as auth.ts
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create new client
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client" as UserRole,
          productService,
          clientType,
          gender,
          onboardingStatus: "onboarding_pending",
          emailVerified: false,
          status: "active" as UserStatus,
          workStatus: "active" as WorkStatus,
        })
        .returning();

      res.json({ success: true, clientId: newClient.id });
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // SOP API Routes (Operations Manager only)

  // Get all SOPs with optional filtering
  app.get("/api/sops", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access SOPs" });
    }

    try {
      const {department, search} = req.query;

      let whereConditions = [];

      if (department && department !== "all") {
        whereConditions.push(eq(sops.department, department as string));
      }

      if (search) {
        whereConditions.push(sql`${sops.title} ILIKE ${'%' + search + '%'}`);
      }

      // Try to select with reference_link, fallback if column doesn't exist
      let sopList;
      try {
        sopList = await db
          .select()
          .from(sops)
          .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
          .orderBy(desc(sops.updatedAt));
      } catch (dbError) {
        // If reference_link column doesn't exist, select without it
        console.log("reference_link column may not exist, selecting basic fields");
        sopList = await db
          .select({
            id: sops.id,
            title: sops.title,
            department: sops.department,
            createdBy: sops.createdBy,
            createdAt: sops.createdAt,
            updatedAt: sops.updatedAt,
          })
          .from(sops)
          .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
          .orderBy(desc(sops.updatedAt));

        // Add referenceLink as null for compatibility
        sopList = sopList.map(sop => ({ ...sop, referenceLink: null }));
      }

      // Get segments for each SOP
      const sopsWithSegments = await Promise.all(
        sopList.map(async (sop) => {
          const segments = await db
            .select()
            .from(sopSegments)
            .where(eq(sopSegments.sopId, sop.id))
            .orderBy(asc(sopSegments.segmentOrder));

          return {
            ...sop,
            segments
          };
        })
      );

      res.json(sopsWithSegments);
    } catch (error) {
      console.error("Error fetching SOPs:", error);
      res.status(500).json({ error: "Failed to fetch SOPs" });
    }
  });

  // Get unique departments for SOPs (predefined list)
  app.get("/api/sops/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access SOPs" });
    }

    try {
      // Predefined department list for SOPs
      const departmentList = [
        "Technical support",
        "Design",
        "Development", 
        "Media buying",
        "Copywriting",
        "Automation",
        "Community manager",
        "Project manager",
        "Product owner",
        "Replit development"
      ];

      res.json(departmentList);
    } catch (error) {
      console.error("Error fetching SOP departments:", error);
      res.status(500).json({ error: "Failed to fetch SOP departments" });
    }
  });

  // Create new SOP
  app.post("/api/sops", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create SOPs" });
    }

    try {
      const { title, department, referenceLink, segments } = req.body;

      if (!title || !department || !segments || segments.length === 0) {
        return res.status(400).json({ error: "Title, department, and at least one segment are required" });
      }

      // Create SOP
      const [newSop] = await db
        .insert(sops)
        .values({
          title,
          department,
          referenceLink: referenceLink || null,
          createdBy: user.id,
        })
        .returning();

      // Create segments
      const segmentData = segments.map((segment: any, index: number) => ({
        sopId: newSop.id,
        title: segment.title,
        content: segment.content,
        fileUrl: segment.fileUrl || null,
        segmentOrder: segment.segmentOrder || index,
      }));

      await db.insert(sopSegments).values(segmentData);

      res.json({ success: true, sopId: newSop.id });
    } catch (error) {
      console.error("Error creating SOP:", error);
      res.status(500).json({ error: "Failed to create SOP" });
    }
  });

  // Update SOP
  app.put("/api/sops/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update SOPs" });
    }

    try {
      const sopId = parseInt(req.params.id);
      const { title, department, referenceLink, segments } = req.body;

      if (!title || !department || !segments || segments.length === 0) {
        return res.status(400).json({ error: "Title, department, and at least one segment are required" });
      }

      // Update SOP
      await db
        .update(sops)
        .set({
          title,
          department,
          referenceLink: referenceLink || null,
          updatedAt: new Date(),
        })
        .where(eq(sops.id, sopId));

      // Delete existing segments
      await db.delete(sopSegments).where(eq(sopSegments.sopId, sopId));

      // Create new segments
      const segmentData = segments.map((segment: any, index: number) => ({
        sopId,
        title: segment.title,
        content: segment.content,
        fileUrl: segment.fileUrl || null,
        segmentOrder: segment.segmentOrder || index,
      }));

      await db.insert(sopSegments).values(segmentData);

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating SOP:", error);
      res.status(500).json({ error: "Failed to update SOP" });
    }
  });

  // Delete SOP
  app.delete("/api/sops/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete SOPs" });
    }

    try {
      const sopId = parseInt(req.params.id);

      // Delete SOP (segments will be deleted automatically due to CASCADE)
      await db.delete(sops).where(eq(sops.id, sopId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting SOP:", error);
      res.status(500).json({ error: "Failed to delete SOP" });
    }
  });

  // Get individual task details
  app.get("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Check if task exists and get project information in one query
      const [taskWithProject] = await db
        .select({
          task: tasks,
          project: projects,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!taskWithProject || !taskWithProject.task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const existingTask = taskWithProject.task;
      const project = taskWithProject.project;

      if (!project) {
        return res.status(404).json({ error: "Project not found for this task" });
      }

      // Check if user has access to this task's project
      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        existingTask.assigneeId === user.id ||
        (user.role === "staff" && await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, project.id),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1)
          .then(members => members.length > 0)
        );

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  // Start task timer (Staff and Interns only)
  app.post("/api/tasks/:id/start-timer", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "intern")) {
      return res.status(403).send("Only staff members and interns can start timers");
    }

    try {
      const taskId = parseInt(req.params.id);
      const user = req.user!;

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, user.id)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found or not assigned to you" });
      }

      // Check if any other task has a running timer for this user
      const [runningTask] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.assigneeId, user.id),
          eq(tasks.isTimerRunning, true)
        ))
        .limit(1);

      if (runningTask && runningTask.id !== taskId) {
        return res.status(400).json({
          error: "Stop the current task timer before starting a new one."
        });
      }

      // Start the timer and set status to in_progress
      const now = new Date();
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: true,
          timerStartTime: now,
          hasBeenStarted: true,
          status: "in_progress",
          updatedAt: now
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Broadcast timer started event via WebSocket with current timeSpent
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(JSON.stringify({
                type: 'task_timer_started',
                data: {
                  taskId: updatedTask.id,
                  isTimerRunning: updatedTask.isTimerRunning,
                  timerStartTime: updatedTask.timerStartTime,
                  timeSpent: updatedTask.timeSpent || 0,
                  status: updatedTask.status
                }
              }));
            } catch (error) {
              console.error('Error broadcasting timer start:', error);
            }
          }
        });
      }

      // Store interval ID globally to clear it when timer is paused
      if (!global.timerIntervals) {
        global.timerIntervals = new Map();
      }

      // Clear any existing interval for this task
      if (global.timerIntervals.has(taskId)) {
        clearInterval(global.timerIntervals.get(taskId));
      }

      // Set up interval to broadcast time updates every second while timer is running
      const timerInterval = setInterval(async () => {
        try {
          const [currentTask] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

          if (!currentTask || !currentTask.isTimerRunning) {
            clearInterval(timerInterval);
            if (global.timerIntervals) {
              global.timerIntervals.delete(taskId);
            }
            return;
          }

          const elapsedSeconds = Math.floor((new Date().getTime() - new Date(currentTask.timerStartTime!).getTime()) / 1000);
          const currentTimeSpent = (currentTask.timeSpent || 0) + elapsedSeconds;

          if (global.connectedClients) {
            global.connectedClients.forEach((client) => {
              if (client.readyState === 1) {
                try {
                  client.send(JSON.stringify({
                    type: 'task_timer_update',
                    data: {
                      taskId: currentTask.id,
                      timeSpent: currentTimeSpent,
                      isTimerRunning: true,
                      projectId: currentTask.projectId
                    }
                  }));
                } catch (error) {
                  console.error('Error broadcasting timer update:', error);
                }
              }
            });
          }
        } catch (error) {
          console.error('Error in timer update interval:', error);
          clearInterval(timerInterval);
          if (global.timerIntervals) {
            global.timerIntervals.delete(taskId);
          }
        }
      }, 1000);

      // Store the interval ID
      global.timerIntervals.set(taskId, timerInterval);

      res.json(updatedTask);
    } catch (error) {
      console.error("Error starting task timer:", error);
      res.status(500).json({ error: "Failed to start timer" });
    }
  });

  // Pause task timer (Staff and Interns only)
  app.post("/api/tasks/:id/pause-timer", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "intern")) {
      return res.status(403).send("Only staff members and interns can pause timers");
    }

    try {
      const taskId = parseInt(req.params.id);
      const user = req.user!;

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, user.id),
          eq(tasks.isTimerRunning, true)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found, not assigned to you, or timer not running" });
      }

      // Calculate elapsed time
      const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime!).getTime()) / 1000);
      const newTimeSpent = (task.timeSpent || 0) + elapsedSeconds;

      // Clear the timer interval
      if (global.timerIntervals && global.timerIntervals.has(taskId)) {
        clearInterval(global.timerIntervals.get(taskId));
        global.timerIntervals.delete(taskId);
      }

      // Pause the timer and set status to "todo"
      const now = new Date();
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: false,
          timeSpent: newTimeSpent,
          timerStartTime: null,
          status: "todo",
          updatedAt: now
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Broadcast timer paused event via WebSocket
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(JSON.stringify({
                type: 'task_timer_paused',
                data: {
                  taskId: updatedTask.id,
                  isTimerRunning: updatedTask.isTimerRunning,
                  timeSpent: updatedTask.timeSpent,
                  timerStartTime: updatedTask.timerStartTime,
                  status: updatedTask.status,
                  projectId: updatedTask.projectId
                }
              }));
            } catch (error) {
              console.error('Error broadcasting timer pause:', error);
            }
          }
        });
      }

      res.json(updatedTask);
    } catch (error) {
      console.error("Error pausing task timer:", error);
      res.status(500).json({ error: "Failed to pause timer" });
    }
  });

  // Submit task for review (Staff and Interns only)
  app.post("/api/tasks/:id/submit", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "intern")) {
      return res.status(403).send("Only staff members and interns can submit tasks");
    }

    try {
      const taskId = parseInt(req.params.id);
      const user = req.user!;

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, user.id)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found or not assigned to you" });
      }

      // If timer is running, stop it first
      let newTimeSpent = task.timeSpent || 0;
      if (task.isTimerRunning && task.timerStartTime) {
        const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime).getTime()) / 1000);
        newTimeSpent = (task.timeSpent || 0) + elapsedSeconds;

        // Clear the timer interval
        if (global.timerIntervals && global.timerIntervals.has(taskId)) {
          clearInterval(global.timerIntervals.get(taskId));
          global.timerIntervals.delete(taskId);
        }
      }

      // Update task to review status and stop timer
      const now = new Date();
      const [updatedTask] = await db
        .update(tasks)
        .set({
          status: "review",
          isTimerRunning: false,
          timeSpent: newTimeSpent,
          timerStartTime: null,
          updatedAt: now
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Broadcast task update via WebSocket
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) {
            try {
              client.send(JSON.stringify({
                type: 'task_updated',
                data: {
                  taskId: updatedTask.id,
                  projectId: updatedTask.projectId,
                  status: updatedTask.status,
                  isTimerRunning: updatedTask.isTimerRunning,
                  timeSpent: updatedTask.timeSpent,
                  updatedBy: user.id,
                  updatedAt: now.toISOString()
                }
              }));
            } catch (error) {
              console.error('Error broadcasting task submission:', error);
            }
          }
        });
      }

      res.json(updatedTask);
    } catch (error) {
      console.error("Error submitting task:", error);
      res.status(500).json({ error: "Failed to submit task" });
    }
  });

  // Update task (PUT endpoint for operations managers and project managers)
  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      const { title, description, status, assigneeId, startDate, deadline, workingHours, workingMinutes } = req.body;

      // Check if task exists and get project information in one query
      const [taskWithProject] = await db
        .select({
          task: tasks,
          project: projects,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!taskWithProject || !taskWithProject.task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const existingTask = taskWithProject.task;
      const project = taskWithProject.project;

      if (!project) {
        return res.status(404).json({ error: "Project not found for this task" });
      }

      // Check permissions - ensure project.id exists
      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;
      const isTaskAssignee = existingTask.assigneeId === user.id;
      const isCustomerSupportOfficer = user.role === "customer_support_officer";
      const isTeamLead = user.role === "team_lead";

      if (!isOperationsManager && !isProjectManager && !isTaskAssignee && !isCustomerSupportOfficer && !isTeamLead) {
        return res.status(403).json({ error: "Access denied - insufficient permissions to update this task" });
      }

      // Prepare update data
      const updateData: any = {};

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
      if (workingHours !== undefined) updateData.workingHours = workingHours ? parseInt(workingHours) : null;
      if (workingMinutes !== undefined) updateData.workingMinutes = workingMinutes ? parseInt(workingMinutes) : null;

      // Only project managers, operations managers, customer support officers, and team leads can reassign tasks
      if (assigneeId !== undefined && (isOperationsManager || isProjectManager || isCustomerSupportOfficer || isTeamLead)) {
        updateData.assigneeId = assigneeId && assigneeId !== 'unassigned' ? parseInt(assigneeId) : null;
      }

      updateData.updatedAt = new Date();

      // Update the task
      const [updatedTask] = await db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, taskId))
        .returning();

      if (!updatedTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      console.log("Task updated successfully:", updatedTask);

      // If assignee changed, send notification to new assignee
      if (assigneeId !== undefined && assigneeId !== null && assigneeId !== 'unassigned' && assigneeId !== existingTask.assigneeId) {
        await createNotification(
          parseInt(assigneeId),
          "task_assigned",
          `You have been assigned to task: "${updatedTask.title}"`,
          updatedTask.id,
          "task"
        );
        console.log(`Task assignment notification sent to user ${assigneeId}`);
      }

      // Send real-time notification via WebSocket to all connected clients
      if (global.connectedClients) {
        global.connectedClients.forEach((client, clientId) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(JSON.stringify({
                type: 'task_updated',
                data: {
                  taskId: updatedTask.id,
                  projectId: updatedTask.projectId,
                  status: updatedTask.status,
                  updatedBy: user.id,
                  updatedAt: new Date().toISOString()
                }
              }));
            } catch (sendError) {
              console.error(`Error sending task update notification to client ${clientId}:`, sendError);
            }
          }
        });
      }

      return res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      return res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Delete task (DELETE endpoint for operations managers and project managers)
  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      // Check if task exists and get project information in one query
      const [taskWithProject] = await db
        .select({
          task: tasks,
          project: projects,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!taskWithProject || !taskWithProject.task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const existingTask = taskWithProject.task;
      const project = taskWithProject.project;

      if (!project) {
        return res.status(404).json({ error: "Project not found for this task" });
      }

      // Check permissions - ensure project.id exists
      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;
      const isProductOwner = user.role === "product_owner";
      const isTechnicalSupport = user.role === "staff" && user.specialization === "technical_support";
      const isCustomerSupportOfficer = user.role === "customer_support_officer";
      const isTeamLead = user.role === "team_lead";

      if (!isOperationsManager && !isProjectManager && !isProductOwner && !isTechnicalSupport && !isCustomerSupportOfficer && !isTeamLead) {
        return res.status(403).json({ error: "Access denied - insufficient permissions to delete this task" });
      }

      // For product owners, check if the project is Support & Maintenance category
      if (isProductOwner && project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only delete tasks in Support & Maintenance category projects"
        });
      }

      // Delete the task
      await db
        .delete(tasks)
        .where(eq(tasks.id, taskId));

      // Send real-time notification via WebSocket to all connected clients
      if (global.connectedClients) {
        global.connectedClients.forEach((client, clientId) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(JSON.stringify({
                type: 'task_deleted',
                data: {
                  taskId: taskId,
                  projectId: existingTask.projectId,
                  deletedBy: user.id,
                  deletedAt: new Date().toISOString()
                }
              }));
            } catch (sendError) {
              console.error(`Error sending task deletion notification to client ${clientId}:`, sendError);
            }
          }
        });
      }

      return res.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      return res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Upload file for SOP segments
  app.post("/api/sops/upload-file", upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can upload files" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileUrl = `/uploads/leave-proof/${req.file.filename}`;
      const fileName = req.file.originalname;

      res.json({ 
        success: true, 
        fileUrl,
        fileName 
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Test notification creation endpoint
  app.post("/api/notifications/test", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Create a test notification
      const [newNotification] = await db
        .insert(notifications)
        .values({
          userId: user.id,
          type: "task_assignment",
          content: "Test notification - This is a sample notification to verify the system is working",
          read: false,
          referenceId: null,
          referenceType: null,
        })
        .returning();

      console.log("Test notification created:", newNotification);

      res.json({ 
        success: true, 
        message: "Test notification created successfully",
        notificationId: newNotification.id,
        notification: newNotification
      });
    } catch (error) {
      console.error("Error creating test notification:", error);
      res.status(500).json({ error: "Failed to create test notification", details: error.message });
    }
  });

  // Test staff query creation endpoint
  app.post("/api/staff-queries/test", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Get the first staff member for testing
      const [firstStaff] = await db
        .select()
        .from(users)
        .where(eq(users.role, "staff"))
        .limit(1);

      if (!firstStaff) {
        return res.status(400).json({ error: "No staff members found for testing" });
      }

      const testQueryData = {
        staffId: firstStaff.id,
        staffName: firstStaff.name,
        department: "Development",
        staffUniqueValue: firstStaff.email,
        reason: "substandard_delivery",
        whyQuery: "Test query - delivered work below expected standards",
        attachmentPath: null,
        likelyPenalty: "Written warning and additional training",
        additionalNote: "This is a test query created by the system",
        sentBy: user.id,
        status: "pending",
      };

      const [newQuery] = await db
        .insert(staffQueries)
        .values(testQueryData)
        .returning();

      res.json({ 
        success: true, 
        message: "Test staff query created successfully",
        queryId: newQuery.id,
        testData: testQueryData
      });
    } catch (error) {
      console.error("Error creating test staff query:", error);
      res.status(500).json({ error: "Failed to create test staff query", details: error.message });
    }
  });

  // API endpoints for sidebar indicators

  // Check for unread direct messages updates
  app.get("/api/direct-messages/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const unreadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(directMessages)
        .where(
          and(
            eq(directMessages.receiverId, user.id),
            eq(directMessages.read, false)
          )
        );

      res.json({ hasUpdates: (unreadCount[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking direct messages updates:", error);
      res.status(500).json({ error: "Failed to check updates" });
    }
  });

  // Check for leave application updates
  app.get("/api/leave-applications/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const updatedApplications = await db
        .select({ count: sql<number>`count(*)` })
        .from(leaveApplications)
        .where(
          and(
            eq(leaveApplications.userId, user.id),
            ne(leaveApplications.status, "pending"),
            isNotNull(leaveApplications.reviewedAt)
          )
        );

      res.json({ hasUpdates: (updatedApplications[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking leave application updates:", error);
      res.status(500).json({ error: "Failed to check updates" });
    }
  });

  // Check for staff complaint updates (for the person who submitted)
  app.get("/api/staff-complaints/my-complaints/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const updatedComplaints = await db
        .select({ count: sql<number>`count(*)` })
        .from(staffComplaints)
        .where(
          and(
            eq(staffComplaints.submitterId, user.id),
            ne(staffComplaints.status, "pending"),
            isNotNull(staffComplaints.reviewedAt)
          )
        );

      res.json({ hasUpdates: (updatedComplaints[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking staff complaint updates:", error);
      res.status(500).json({ error: "Failed to check updates" });
    }
  });

  // Check for extension request updates
  app.get("/api/deadline-extension-requests/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      let hasUpdates = false;

      if (user.role === "staff") {
        // For staff, check if their requests have been decided
        const decidedRequests = await db
          .select({ count: sql<number>`count(*)` })
          .from(deadlineExtensionRequests)
          .where(
            and(
              eq(deadlineExtensionRequests.requesterId, user.id),
              ne(deadlineExtensionRequests.status, "pending"),
              isNotNull(deadlineExtensionRequests.decidedAt)
            )
          );

        hasUpdates = (decidedRequests[0]?.count || 0) > 0;
      } else if (user.role === "project_manager" || user.role === "operations_manager" || user.specialization === "operations_manager") {
        // For managers, check if there are new pending requests
        const whereCondition = user.role === "operations_manager" || user.specialization === "operations_manager"
          ? eq(deadlineExtensionRequests.status, "pending")
          : and(
              eq(deadlineExtensionRequests.status, "pending"),
              eq(deadlineExtensionRequests.projectManagerId, user.id)
            );

        const pendingRequests = await db
          .select({ count: sql<number>`count(*)` })
          .from(deadlineExtensionRequests)
          .where(whereCondition);

        hasUpdates = (pendingRequests[0]?.count || 0) > 0;
      }

      res.json({ hasUpdates });
    } catch (error) {
      console.error("Error checking extension request updates:", error);
      res.status(500).json({ error: "Failed to check updates" });
    }
  });

  // Check for new client sentiments (for operations managers)
  app.get("/api/client-sentiment/has-new", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
        return res.json({ hasNew: false });
      }

      // Check for sentiments submitted in the last week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentSentiments = await db
        .select({ count: sql<number>`count(*)` })
        .from(clientSentiment)
        .where(gte(clientSentiment.createdAt, weekAgo));

      res.json({ hasNew: (recentSentiments[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking new client sentiments:", error);
      res.status(500).json({ error: "Failed to check new sentiments" });
    }
  });

  // Check for new client complaints (for operations managers)
  app.get("/api/complaints/has-new", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
        return res.json({ hasNew: false });
      }

      const pendingComplaints = await db
        .select({ count: sql<number>`count(*)` })
        .from(complaints)
        .where(eq(complaints.status, "pending"));

      res.json({ hasNew: (pendingComplaints[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking new client complaints:", error);
      res.status(500).json({ error: "Failed to check new complaints" });
    }
  });

  // Check for staff complaints updates (for operations managers)
  app.get("/api/staff-complaints/has-new", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
        return res.json({ hasNew: false });
      }

      const pendingComplaints = await db
        .select({ count: sql<number>`count(*)` })
        .from(staffComplaints)
        .where(eq(staffComplaints.status, "pending"));

      res.json({ hasNew: (pendingComplaints[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking new staff complaints:", error);
      res.status(500).json({ error: "Failed to check new staff complaints" });
    }
  });

  // Check for staff query updates
  app.get("/api/staff-queries/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      let hasUpdates = false;

      if (user.role === "staff") {
        // For staff, check if they have pending queries
        const pendingQueries = await db
          .select({ count: sql<number>`count(*)` })
          .from(staffQueries)
          .where(
            and(
              eq(staffQueries.staffId, user.id),
              eq(staffQueries.status, "pending")
            )
          );

        hasUpdates = (pendingQueries[0]?.count || 0) > 0;
      } else if (user.role === "operations_manager" || user.specialization === "operations_manager" || user.role === "project_manager") {
        // For managers, check if there are new queries in general
        const totalQueries = await db
          .select({ count: sql<number>`count(*)` })
          .from(staffQueries)
          .where(eq(staffQueries.status, "pending"));

        hasUpdates = (totalQueries[0]?.count || 0) > 0;
      }

      res.json({ hasUpdates });
    } catch (error) {
      console.error("Error checking staff query updates:", error);
      res.status(500).json({ error: "Failed to check staff query updates" });
    }
  });

  // Check for new clients (for product owners)
  app.get("/api/clients/has-new", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "product_owner") {
        return res.json({ hasNew: false });
      }

      // Check for clients created in the last week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentClients = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(
          and(
            eq(users.role, "client"),
            gte(users.createdAt, weekAgo)
          )
        );

      res.json({ hasNew: (recentClients[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking new clients:", error);
      res.status(500).json({ error: "Failed to check new clients" });
    }
  });

  // Mark clients as viewed (for product owners)
  app.post("/api/clients/mark-viewed", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "product_owner") {
        return res.status(403).json({ error: "Only product owners can mark clients as viewed" });
      }

      // This endpoint just acknowledges that the user has viewed the clients
      // In a more complex implementation, you might track view timestamps
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking clients as viewed:", error);
      res.status(500).json({ error: "Failed to mark clients as viewed" });
    }
  });

  // Check for client complaint updates (for clients who sent complaints)
  app.get("/api/complaints/my-complaints/has-updates", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const updatedComplaints = await db
        .select({ count: sql<number>`count(*)` })
        .from(complaints)
        .where(
          and(
            eq(complaints.submitterId, user.id),
            ne(complaints.status, "pending"),
            isNotNull(complaints.reviewedAt)
          )
        );

      res.json({ hasUpdates: (updatedComplaints[0]?.count || 0) > 0 });
    } catch (error) {
      console.error("Error checking client complaint updates:", error);
      res.status(500).json({ error: "Failed to check updates" });
    }
  });

  // Check if client needs to submit weekly sentiment
  app.get("/api/client-sentiment/needs-weekly-submission", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      if (user.role !== "client") {
        return res.json({ needsSubmission: false });
      }

      // Get current week's start date (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0, 0, 0, 0);

      const mondayStr = monday.toISOString().split('T')[0];

      const existingSentiment = await db
        .select({ count: sql<number>`count(*)` })
        .from(clientSentiment)
        .where(
          and(
            eq(clientSentiment.clientId, user.id),
            eq(clientSentiment.weekStart, mondayStr)
          )
        );

      res.json({ needsSubmission: (existingSentiment[0]?.count || 0) === 0 });
    } catch (error) {
      console.error("Error checking weekly sentiment submission:", error);
      res.status(500).json({ error: "Failed to check submission status" });
    }
  });

  // Staff Queries API Routes
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isProjectManager = user.role === "project_manager";

    try {
      // All users (operations managers, project managers, and staff) see all queries
      const queries = await db
        .select()
        .from(staffQueries)
        .orderBy(desc(staffQueries.createdAt));

      res.json(queries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  app.post("/api/staff-queries", upload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const { staffId, staffName, department, staffUniqueValue, reason, whyQuery, likelyPenalty, additionalNote } = req.body;

      // Handle uploaded attachment if present
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/leave-proof/${req.file.filename}`;
      }

      console.log("Staff query data:", { staffId, staffName, department, staffUniqueValue, reason, whyQuery, attachmentPath, likelyPenalty, additionalNote });

      if (!staffId || !staffName || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({ error: "All required fields must be filled" });
      }

      // Parse staffId to ensure it's a valid integer
      const parsedStaffId = parseInt(staffId);
      if (isNaN(parsedStaffId)) {
        return res.status(400).json({ error: "Invalid staff ID" });
      }

      // Verify staff member exists
      const [staffMember] = await db
        .select()
        .from(users)
        .where(eq(users.id, parsedStaffId))
        .limit(1);

      if (!staffMember) {
        return res.status(400).json({ error: "Staff member not found" });
      }

      console.log("Staff member found:", staffMember.name);

      // Validate reason enum
      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        console.error("Invalid reason provided:", reason, "Valid reasons:", validReasons);
        return res.status(400).json({ error: "Invalid reason provided", validReasons });
      }

      // Additional validation
      if (!staffName.trim()) {
        return res.status(400).json({ error: "Staff name cannot be empty" });
      }

      if (!whyQuery.trim()) {
        return res.status(400).json({ error: "Query explanation cannot be empty" });
      }

      if (!likelyPenalty.trim()) {
        return res.status(400).json({ error: "Likely penalty cannot be empty" });
      }

      console.log("Validation passed, attempting to insert into database...");

      const [newQuery] = await db
        .insert(staffQueries)
        .values({
          staffId: parsedStaffId,
          staffName: staffName.trim(),
          department: department || "",
          staffUniqueValue: staffUniqueValue || "",
          reason,
          whyQuery: whyQuery.trim(),
          attachmentPath,
          likelyPenalty: likelyPenalty.trim(),
          additionalNote: additionalNote ? additionalNote.trim() : null,
          sentBy: user.id,
          status: "pending",
        })
        .returning();

      console.log("Staff query created successfully:", newQuery);
      res.json({ success: true, queryId: newQuery.id });
    } catch (error) {
      console.error("Error creating staff query:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: "Failed to create staff query", details: error.message });
    }
  });

  // Update staff query status (for staff to acknowledge/resolve)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const { status } = req.body;

    try {
      if (!status || !["acknowledged", "resolved"].includes(status)) {
        return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
      }

      // Check if the query exists and belongs to the user
      const [existingQuery] = await db
        .select()
        .from(staffQueries)
        .where(
          and(
            eq(staffQueries.id, queryId),
            eq(staffQueries.staffId, user.id)
          )
        )
        .limit(1);

      if (!existingQuery) {
        return res.status(404).json({ error: "Staff query not found or access denied" });
      }

      if (existingQuery.status !== "pending") {
        return res.status(400).json({ error: "Query has already been processed" });
      }

      // Update the query status
      const [updatedQuery] = await db
        .update(staffQueries)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(staffQueries.id, queryId))
        .returning();

      console.log("Staff query status updated:", updatedQuery);
      res.json({ success: true, query: updatedQuery });
    } catch (error) {
      console.error("Error updating staff query status:", error);
      res.status(500).json({ error: "Failed to update staff query status", details: error.message });
    }
  });

  // Staff Complaints API Routes
  // Get user's own complaints
  app.get("/api/staff-complaints/my-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const complaints = await db
        .select()
        .from(staffComplaints)
        .where(eq(staffComplaints.submitterId, user.id))
        .orderBy(desc(staffComplaints.createdAt));

      res.json(complaints);
    } catch (error) {
      console.error("Error fetching user's staff complaints:", error);
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  app.get("/api/staff-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isTeamLead = user.role === "team_lead";

    try {
      let complaints;

      if (isOperationsManager || isTeamLead) {
        // Operations managers and team leads can see all complaints
        complaints = await db
          .select()
          .from(staffComplaints)
          .orderBy(desc(staffComplaints.createdAt));
      } else {
        // Regular users can only see their own complaints
        complaints = await db
          .select()
          .from(staffComplaints)
          .where(eq(staffComplaints.submitterId, user.id))
          .orderBy(desc(staffComplaints.createdAt));
      }

      res.json(complaints);
    } catch (error) {
      console.error("Error fetching staff complaints:", error);
      res.status(500).json({ error: "Failed to fetch staff complaints" });
    }
  });

  app.post("/api/staff-complaints", upload.single('screenshot'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const { name, email, department, detailedExplanation } = req.body;

      console.log("Staff complaint submission:", { name, email, department, detailedExplanation, userId: user.id });

      if (!name || !email || !detailedExplanation) {
        return res.status(400).json({ error: "Name, email, and detailed explanation are required" });
      }

      // Handle screenshot if uploaded
      let screenshotUrl = null;
      if (req.file) {
        screenshotUrl = `/uploads/leave-proof/${req.file.filename}`;
        console.log("Screenshot uploaded:", screenshotUrl);
      }

      const [newComplaint] = await db
        .insert(staffComplaints)
        .values({
          name: name.trim(),
          email: email.trim(),
          department: department || null,
          detailedExplanation: detailedExplanation.trim(),
          screenshotUrl,
          submitterId: user.id,
          status: "pending",
        })
        .returning();

      // Create notifications for operations managers
      try {
        const operationsManagers = await db
          .select()
          .from(users)
          .where(or(
            eq(users.role, "operations_manager"),
            eq(users.specialization, "operations_manager")
          ));

        for (const manager of operationsManagers) {
          await db
            .insert(notifications)
            .values({
              userId: manager.id,
              type: "task_assigned", // Using existing type
              content: `New staff complaint from ${name}: ${detailedExplanation.substring(0, 100)}${detailedExplanation.length > 100 ? '...' : ''}`,
              referenceId: newComplaint.id,
              referenceType: "project", // Using existing type
            });
        }

        console.log(`Notifications sent to ${operationsManagers.length} operations managers`);
      } catch (notificationError) {
        console.error("Error creating staff complaint notifications:", notificationError);
      }

      res.json({ success: true, complaintId: newComplaint.id });
    } catch (error) {
      console.error("Error creating staff complaint:", error);
      res.status(500).json({ error: "Failed to create staff complaint", details: error.message });
    }
  });

  // Update staff complaint status (Operations Manager only)
  app.put("/api/staff-complaints/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isTeamLead = user.role === "team_lead";

    if (!isOperationsManager && !isTeamLead) {
      return res.status(403).json({ error: "Only operations managers and team leads can update staff complaints" });
    }

    try {
      const complaintId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

      console.log("Updating staff complaint:", { complaintId, status, reviewComments, userId: user.id });

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const validStatuses = ["pending", "reviewed", "resolved"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: " + validStatuses.join(", ") });
      }

      // Check if complaint exists
      const [existingComplaint] = await db
        .select()
        .from(staffComplaints)
        .where(eq(staffComplaints.id, complaintId))
        .limit(1);

      if (!existingComplaint) {
        return res.status(404).json({ error: "Staff complaint not found" });
      }

      // Update the complaint
      const [updatedComplaint] = await db
        .update(staffComplaints)
        .set({
          status,
          reviewComments: reviewComments || null,
          reviewedAt: new Date(),
        })
        .where(eq(staffComplaints.id, complaintId))
        .returning();

      console.log("Staff complaint updated successfully:", updatedComplaint);

      // Create notification for the staff member who submitted the complaint
      if (existingComplaint.submitterId) {
        try {
          await createNotification(
            existingComplaint.submitterId,
            "task_updated",
            `Your staff complaint has been ${status}${reviewComments ? `: ${reviewComments}` : ''}`,
            complaintId,
            "project"
          );
        } catch (notificationError) {
          console.error("Error creating notification for staff complaint update:", notificationError);
          // Continue execution even if notification fails
        }
      }

      res.json({ success: true, complaint: updatedComplaint });
    } catch (error) {
      console.error("Error updating staff complaint:", error);
      res.status(500).json({ error: "Failed to update staff complaint", details: error.message });
    }
  });

  // Memo API Routes
  app.get("/api/memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    try {
      if (isOperationsManager) {
        // Operations managers see all memos they sent
        const sentMemos = await db
          .select({
            id: memos.id,
            title: memos.title,
            content: memos.content,
            type: memos.type,
            recipients: memos.recipients,
            sentBy: memos.sentBy,
            createdAt: memos.createdAt,
            updatedAt: memos.updatedAt,
            senderName: users.name,
          })
          .from(memos)
          .leftJoin(users, eq(memos.sentBy, users.id))
          .where(eq(memos.sentBy, user.id))
          .orderBy(desc(memos.createdAt));

        // Get read count for each memo
        const memosWithReadCount = await Promise.all(
          sentMemos.map(async (memo) => {
            const readCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(memoReads)
              .where(eq(memoReads.memoId, memo.id));

            return {
              ...memo,
              readCount: readCount[0]?.count || 0,
            };
          })
        );

        res.json(memosWithReadCount);
      } else {
        return res.status(403).json({ error: "Only operations managers can access this endpoint" });
      }
    } catch (error) {
      console.error("Error fetching memos:", error);
      res.status(500).json({ error: "Failed to fetch memos" });
    }
  });

  app.get("/api/memos/my-memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Get memos for this user based on type and recipients
      let userMemos = [];

      // General memos (sent to everyone)
      const generalMemos = await db
        .select({
          id: memos.id,
          title: memos.title,
          content: memos.content,
          type: memos.type,
          recipients: memos.recipients,
          sentBy: memos.sentBy,
          createdAt: memos.createdAt,
          updatedAt: memos.updatedAt,
          senderName: users.name,
        })
        .from(memos)
        .leftJoin(users, eq(memos.sentBy, users.id))
        .where(eq(memos.type, "general"))
        .orderBy(desc(memos.createdAt));

      userMemos.push(...generalMemos);

      // Individual memos where user is in recipients
      const individualMemos = await db
        .select({
          id: memos.id,
          title: memos.title,
          content: memos.content,
          type: memos.type,
          recipients: memos.recipients,
          sentBy: memos.sentBy,
          createdAt: memos.createdAt,
          updatedAt: memos.updatedAt,
          senderName: users.name,
        })
        .from(memos)
        .leftJoin(users, eq(memos.sentBy, users.id))
        .where(
          and(
            eq(memos.type, "individual"),
            sql`${memos.recipients} @> ${JSON.stringify([user.id])}`
          )
        )
        .orderBy(desc(memos.createdAt));

      userMemos.push(...individualMemos);

      // Department memos based on user's role/specialization
      let deptConditions = [sql`${memos.recipients} @> ${JSON.stringify(["all_staff"])}`];

      if (user.specialization) {
        deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify([user.specialization])}`);
      }

      if (user.role === 'project_manager') {
        deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify(["project_managers"])}`);
      }

      if (user.role === 'product_owner') {
        deptConditions.push(sql`${memos.recipients} @> ${JSON.stringify(["product_owners"])}`);
      }

      const departmentMemos = await db
        .select({
          id: memos.id,
          title: memos.title,
          content: memos.content,
          type: memos.type,
          recipients: memos.recipients,
          sentBy: memos.sentBy,
          createdAt: memos.createdAt,
          updatedAt: memos.updatedAt,
          senderName: users.name,
        })
        .from(memos)
        .leftJoin(users, eq(memos.sentBy, users.id))
        .where(
          and(
            eq(memos.type, "department"),
            or(...deptConditions)
          )
        )
        .orderBy(desc(memos.createdAt));

      userMemos.push(...departmentMemos);

      // Remove duplicates and add read status
      const uniqueMemos = userMemos.filter((memo, index, self) => 
        index === self.findIndex(m => m.id === memo.id)
      );

      // Check read status for each memo
      const memosWithReadStatus = await Promise.all(
        uniqueMemos.map(async (memo) => {
          const readRecord = await db
            .select()
            .from(memoReads)
            .where(
              and(
                eq(memoReads.memoId, memo.id),
                eq(memoReads.userId, user.id)
              )
            )
            .limit(1);

          return {
            ...memo,
            isRead: readRecord.length > 0,
            readAt: readRecord[0]?.readAt || null,
          };
        })
      );

      res.json(memosWithReadStatus);
    } catch (error) {
      console.error("Error fetching user memos:", error);
      res.status(500).json({ error: "Failed to fetch memos" });
    }
  });

  app.post("/api/memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create memos" });
    }

    try {
      const { title, content, type, recipients } = req.body;

      if (!title || !content || !type) {
        return res.status(400).json({ error: "Title, content, and type are required" });
      }

      const validTypes = ["individual", "general", "department"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid memo type" });
      }

      // Create the memo
      const [newMemo] = await db
        .insert(memos)
        .values({
          title,
          content,
          type,
          recipients: recipients || [],
          sentBy: user.id,
        })
        .returning();

      res.json({ success: true, memoId: newMemo.id });
    } catch (error) {
      console.error("Error creating memo:", error);
      res.status(500).json({ error: "Failed to create memo" });
    }
  });

  app.post("/api/memos/:id/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const memoId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Insert read record (ignore if already exists)
      await db
        .insert(memoReads)
        .values({
          memoId,
          userId,
        })
        .onConflictDoNothing();

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking memo as read:", error);
      res.status(500).json({ error: "Failed to mark memo as read" });
    }
  });

  app.delete("/api/memos/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete memos" });
    }

    try {
      const memoId = parseInt(req.params.id);

      // Verify the memo exists and was sent by this user
      const [existingMemo] = await db
        .select()
        .from(memos)
        .where(and(eq(memos.id, memoId), eq(memos.sentBy, user.id)))
        .limit(1);

      if (!existingMemo) {
        return res.status(404).json({ error: "Memo not found or not authorized" });
      }

      // Delete the memo (memo reads will be deleted automatically due to CASCADE)
      await db.delete(memos).where(eq(memos.id, memoId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting memo:", error);
      res.status(500).json({ error: "Failed to delete memo" });
    }
  });

  // Direct Messages API Routes

  // Get all conversations for the authenticated user
  app.get("/api/direct-messages/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      // Get conversations where user is either sender or receiver
      const conversations = await db
        .select({
          userId: sql<number>`CASE 
            WHEN ${directMessages.senderId} = ${user.id} THEN ${directMessages.receiverId}
            ELSE ${directMessages.senderId}
          END`,
          lastMessageContent: directMessages.content,
          lastMessageTime: directMessages.createdAt,
          lastMessageSenderId: directMessages.senderId,
        })
        .from(directMessages)
        .where(
          or(
            eq(directMessages.senderId, user.id),
            eq(directMessages.receiverId, user.id)
          )
        )
        .orderBy(desc(directMessages.createdAt));

      // Get unique conversations and user details
      const uniqueConversations = new Map();

      for (const conv of conversations) {
        if (!uniqueConversations.has(conv.userId)) {
          // Get user details
          const [otherUser] = await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
              status: users.status,
              lastActive: users.lastActive,
            })
            .from(users)
            .where(eq(users.id, conv.userId))
            .limit(1);

          if (otherUser) {
            // Count unread messages from this user
            const unreadCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(directMessages)
              .where(
                and(
                  eq(directMessages.senderId, conv.userId),
                  eq(directMessages.receiverId, user.id),
                  eq(directMessages.read, false)
                )
              );

            uniqueConversations.set(conv.userId, {
              user: otherUser,
              lastMessage: {
                content: conv.lastMessageContent,
                createdAt: conv.lastMessageTime,
                senderId: conv.lastMessageSenderId,
              },
              unreadCount: unreadCount[0]?.count || 0,
            });
          }
        }
      }

      res.json(Array.from(uniqueConversations.values()));
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get messages between authenticated user and specific user
  app.get("/api/direct-messages/:userId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const otherUserId = parseInt(req.params.userId);

    try {
      // Validate otherUserId is a valid integer
      if (isNaN(otherUserId) || otherUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const messages = await db
        .select({
          id: directMessages.id,
          content: directMessages.content,
          senderId: directMessages.senderId,
          receiverId: directMessages.receiverId,
          read: directMessages.read,
          createdAt: directMessages.createdAt,
          senderName: users.name,
        })
        .from(directMessages)
        .leftJoin(users, eq(directMessages.senderId, users.id))
        .where(
          or(
            and(
              eq(directMessages.senderId, user.id),
              eq(directMessages.receiverId, otherUserId)
            ),
            and(
              eq(directMessages.senderId, otherUserId),
              eq(directMessages.receiverId, user.id)
            )
          )
        )
        .orderBy(asc(directMessages.createdAt));

      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Mark messages as read
  app.put("/api/direct-messages/:userId/read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const otherUserId = parseInt(req.params.userId);

    try {
      await db
        .update(directMessages)
        .set({ read: true })
        .where(
          and(
            eq(directMessages.senderId, otherUserId),
            eq(directMessages.receiverId, user.id),
            eq(directMessages.read, false)
          )
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Get unread messages count
  app.get("/api/direct-messages/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = req.user!;

      // Ensure user object has an ID
      if (!user || !user.id) {
        console.error("❌ No user ID in session for unread count");
        return res.status(401).json({ error: "Invalid session" });
      }

      const userId = user.id;

      const unreadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(directMessages)
        .where(
          and(
            eq(directMessages.receiverId, userId),
            eq(directMessages.read, false)
          )
        );

      const count = unreadCount[0]?.count || 0;
      res.json({ count });
    } catch (error) {
      console.error("❌ Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Edit direct message
  app.put("/api/direct-messages/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const messageId = parseInt(req.params.messageId);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    try {
      // Check if message exists and belongs to user
      const [message] = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (message.senderId !== user.id) {
        return res.status(403).json({ error: "You can only edit your own messages" });
      }

      // Update the message
      const [updatedMessage] = await db
        .update(directMessages)
        .set({ 
          content: content.trim(),
          updatedAt: new Date()
        })
        .where(eq(directMessages.id, messageId))
        .returning();

      res.json({ success: true, message: updatedMessage });
    } catch (error) {
      console.error("Error editing direct message:", error);
      res.status(500).json({ error: "Failed to edit message" });
    }
  });

  // Delete direct message
  app.delete("/api/direct-messages/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const messageId = parseInt(req.params.messageId);

    try {
      // Check if message exists and belongs to user
      const [message] = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, messageId))
        .limit(1);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (message.senderId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own messages" });
      }

      // Delete the message
      await db
        .delete(directMessages)
        .where(eq(directMessages.id, messageId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting direct message:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Send direct message
  app.post("/api/direct-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const { receiverId, content } = req.body;
    const senderId = user.id; // Define senderId here

    try {
      if (!receiverId || !content || !content.trim()) {
        return res.status(400).json({ error: "Receiver ID and content are required" });
      }

      const messageContent = content.trim(); // Trim content once

      const [newMessage] = await db
        .insert(directMessages)
        .values({
          senderId: senderId,
          receiverId: parseInt(receiverId),
          content: messageContent,
          read: false,
        })
        .returning();

      // Add sender name for immediate display
      const messageWithSender = {
        ...newMessage,
        senderName: user.name,
      };

      // Check if this is a reply and send notification to the original message sender
      if (messageContent.startsWith('> Replying to')) {
        const replyLines = messageContent.split('\n');
        const replyToLine = replyLines[0]; // "> Replying to Name:"
        const replyToName = replyToLine.replace('> Replying to ', '').replace(':', '').trim();

        // Find the user being replied to
        const repliedToUser = await db
          .select()
          .from(users)
          .where(eq(users.name, replyToName))
          .limit(1);

        if (repliedToUser.length > 0 && repliedToUser[0].id !== user.id) {
          // Create notification for the replied user - use 'reply' type for reply notifications
          await createNotification(
            repliedToUser[0].id,
            "reply",
            `${user.name} replied to your message`,
            newMessage.id,
            "direct_message"
          );
        }
      }

      // Create notification for receiver - use 'message' type to trigger sound
      const notification = await createNotification(
        parseInt(receiverId),
        "message",
        `New message from ${user.name}`,
        newMessage.id,
        "direct_message"
      );

      console.log('📧 Direct message notification created:', notification);


      // Send SSE notification to the receiver
      if (global.sseClients && global.sseClients.has(parseInt(receiverId))) {
        const receiverClient = global.sseClients.get(parseInt(receiverId));
        if (receiverClient && !receiverClient.writableEnded) {
          try {
            receiverClient.write(`data: ${JSON.stringify({
              type: "direct_message",
              data: messageWithSender
            })}\n\n`);
            console.log(`SSE notification sent to receiver ${receiverId}`);
          } catch (error) {
            console.error("Error sending SSE notification to receiver:", error);
            global.sseClients.delete(parseInt(receiverId));
          }
        }
      } else {
        console.log(`No SSE client found for receiver ${receiverId}`);
      }

      // Also send SSE notification to the sender for their own UI updates
      if (global.sseClients && global.sseClients.has(senderId)) {
        const senderClient = global.sseClients.get(senderId);
        if (senderClient && !senderClient.writableEnded) {
          try {
            senderClient.write(`data: ${JSON.stringify({
              type: "direct_message",
              data: messageWithSender
            })}\n\n`);
            console.log(`SSE notification sent to sender ${senderId}`);
          } catch (error) {
            console.error("Error sending SSE notification to sender:", error);
            global.sseClients.delete(senderId);
          }
        }
      }

      res.json(messageWithSender);
    } catch (error) {
      console.error("Error sending direct message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Issue Reports API Routes
  app.get("/api/issue-reports", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isProductOwner = user.role === "product_owner";
    const isReplitDeveloper = user.specialization === "replit_development" || user.specialization === "Replit Development";

    try {
      let reports;

      if (isOperationsManager || isProductOwner || isReplitDeveloper) {
        // Operations managers and product owners can see all reports
        reports = await db
          .select({
            id: issueReports.id,
            title: issueReports.title,
            description: issueReports.description,
            suggestions: issueReports.suggestions,
            reporterName: issueReports.reporterName,
            reporterEmail: issueReports.reporterEmail,
            priority: issueReports.priority,
            category: issueReports.category,
            status: issueReports.status,
            submitterId: issueReports.submitterId,
            reviewedBy: issueReports.reviewedBy,
            reviewedAt: issueReports.reviewedAt,
            reviewComments: issueReports.reviewComments,
            screenshotUrl: issueReports.screenshotUrl,
            createdAt: issueReports.createdAt,
            updatedAt: issueReports.updatedAt,
            submitterName: users.name,
          })
          .from(issueReports)
          .leftJoin(users, eq(issueReports.submitterId, users.id))
          .orderBy(desc(issueReports.createdAt));
      } else {
        // Regular users can only see their own reports
        reports = await db
          .select()
          .from(issueReports)
          .where(eq(issueReports.submitterId, user.id))
          .orderBy(desc(issueReports.createdAt));
      }

      res.json(reports);
    } catch (error) {
      console.error("Error fetching issue reports:", error);
      res.status(500).json({ error: "Failed to fetch issue reports" });
    }
  });

  app.post("/api/issue-reports", upload.single('screenshot'), async (req, res) => {
    if (!req.isAuthenticated()) {
      console.error("Issue report submission failed - user not authenticated", {
        hasSession: !!req.session,
        sessionID: req.session?.id,
        cookies: req.headers.cookie
      });
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const { title, description, suggestions, priority, category } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      let screenshotUrl = null;
      if (req.file) {
        screenshotUrl = `/uploads/leave-proof/${req.file.filename}`;
      }

      const [newReport] = await db
        .insert(issueReports)
        .values({
          title: title.trim(),
          description: description.trim(),
          suggestions: suggestions?.trim() || null,
          reporterName: user.name,
          reporterEmail: user.email,
          priority: priority || "medium",
          category: category || "other",
          submitterId: user.id,
          screenshotUrl,
        })
        .returning();

      // Create notifications for operations managers and product owners
      try {
        const managers = await db
          .select()
          .from(users)
          .where(or(
            eq(users.role, "operations_manager"),
            eq(users.specialization, "operations_manager"),
            eq(users.role, "product_owner")
          ));

        for (const manager of managers) {
          await db
            .insert(notifications)
            .values({
              userId: manager.id,
              type: "task_assigned",
              content: `New issue report from ${user.name}: ${title}`,
              referenceId: newReport.id,
              referenceType: "project",
            });
        }
      } catch (notificationError) {
        console.error("Error creating issue report notifications:", notificationError);
      }

      res.json({ success: true, reportId: newReport.id });
    } catch (error) {
      console.error("Error creating issue report:", error);
      res.status(500).json({ error: "Failed to create issue report" });
    }
  });

  app.put("/api/issue-reports/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
    const isProductOwner = user.role === "product_owner";
    const isReplitDeveloper = user.specialization === "replit_development" || user.specialization === "Replit Development";

    if (!isOperationsManager && !isProductOwner && !isReplitDeveloper) {
      return res.status(403).json({ error: "Only operations managers, product owners, and Replit developers can update issue reports" });
    }

    try {
      const reportId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const validStatuses = ["pending", "reviewing", "resolved", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Check if report exists
      const [existingReport] = await db
        .select()
        .from(issueReports)
        .where(eq(issueReports.id, reportId))
        .limit(1);

      if (!existingReport) {
        return res.status(404).json({ error: "Issue report not found" });
      }

      // Update the report
      const [updatedReport] = await db
        .update(issueReports)
        .set({
          status,
          reviewComments: reviewComments || null,
          reviewedBy: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issueReports.id, reportId))
        .returning();

      // Create notification for the reporter
      if (existingReport.submitterId) {
        try {
          await db
            .insert(notifications)
            .values({
              userId: existingReport.submitterId,
              type: "task_updated",
              content: `Your issue report "${existingReport.title}" has been updated to ${status}`,
              referenceId: reportId,
              referenceType: "project",
            });
        } catch (notificationError) {
          console.error("Error creating notification for issue report update:", notificationError);
        }
      }

      res.json({ success: true, report: updatedReport });
    } catch (error) {
      console.error("Error updating issue report:", error);
      res.status(500).json({ error: "Failed to update issue report" });
    }
  });

  // Notes API Routes
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Users can only see their own notes
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.userId, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const { title, content, type, todoItems, category } = req.body;

      // For todo type notes, allow empty content if todoItems are provided
      if (type === "todo") {
        if (!todoItems || !Array.isArray(todoItems) || todoItems.length === 0) {
          return res.status(400).json({ error: "Todo items are required for todo list notes" });
        }
      } else {
        // For freetext notes, content is required
        if (!content || !content.trim()) {
          return res.status(400).json({ error: "Content is required for text notes" });
        }
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "Untitled Note",
          content: content || "",
          type: type || "freetext",
          todoItems: type === "todo" ? todoItems : null,
          userId: user.id,
          createdBy: user.id,
          category: category || "general",
        })
        .returning();

      res.json({ success: true, noteId: newNote.id, note: newNote });
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems, category } = req.body;

      // Validate based on note type
      if (type === "todo") {
        if (!todoItems || !Array.isArray(todoItems) || todoItems.length === 0) {
          return res.status(400).json({ error: "Todo items are required for todo list notes" });
        }
      } else {
        // For freetext notes, content is required
        if (!content || !content.trim()) {
          return res.status(400).json({ error: "Content is required for text notes" });
        }
      }

      // Check if note belongs to user
      const existingNote = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
        .limit(1);

      if (existingNote.length === 0) {
        return res.status(404).json({ error: "Note not found or access denied" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "Untitled Note",
          content: content || "",
          type: type || "freetext",
          todoItems: type === "todo" ? todoItems : null,
          updatedAt: new Date(),
        })
        .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
        .returning();

      res.json({ success: true, note: updatedNote });
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const noteId = parseInt(req.params.id);

      // Check if note belongs to user
      const existingNote = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
        .limit(1);

      if (existingNote.length === 0) {
        return res.status(404).json({ error: "Note not found or access denied" });
      }

      await db
        .delete(notes)
        .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Bookings API Routes
  app.get("/api/bookings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const allBookings = await db
        .select({
          id: bookings.id,
          title: bookings.title,
          description: bookings.description,
          type: bookings.type,
          scheduledBy: bookings.scheduledBy,
          participants: bookings.participants,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
          status: bookings.status,
          meetingLink: bookings.meetingLink,
          notes: bookings.notes,
          createdAt: bookings.createdAt,
          schedulerName: users.name,
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const upcomingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            sql`${bookings.participants} @> ${JSON.stringify([user.id])}`,
            eq(bookings.status, "scheduled"),
            gte(bookings.startTime, new Date())
          )
        )
        .orderBy(asc(bookings.startTime))
        .limit(5);

      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user= req.user!;

    try {
      const { title, description, type, participants, startTime, endTime, meetingLink, notes } = req.body;

      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description,
          type,
          scheduledBy: user.id,
          participants,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          status: "scheduled",
          meetingLink,
          notes,
        })
        .returning();

      res.json({ success: true, bookingId: newBooking.id });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Delete booking
  app.delete("/api/bookings/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const bookingId = parseInt(req.params.id);

    try {
      // Check if booking exists
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check if user has permission to delete (scheduler or participant)
      const canDelete = booking.scheduledBy === user.id || booking.participants.includes(user.id);

      if (!canDelete) {
        return res.status(403).json({ error: "You don't have permission to delete this booking" });
      }

      // Delete the booking
      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Update booking status
  app.put("/api/bookings/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const bookingId = parseInt(req.params.id);
    const { status } = req.body;

    try {
      // Check if booking exists
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check if user has permission to update (scheduler or participant)
      const canUpdate = booking.scheduledBy === user.id || booking.participants.includes(user.id);

      if (!canUpdate) {
        return res.status(403).json({ error: "You don't have permission to update this booking" });
      }

      // Update the booking status
      await db
        .update(bookings)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(bookings.id, bookingId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Technical Support Requests API Routes
  app.get("/api/technical-support/requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      let requests;

      if (user.specialization === 'technical_support' || user.role === 'project_manager' || user.role === 'customer_support_officer' || user.role === 'operations_manager' || user.role === 'team_lead' || user.specialization === 'operations_manager') {
        // Technical support staff, project managers, customer support officers, operations managers, and team leads see all requests
        requests = await db
          .select({
            id: technicalSupportRequests.id,
            title: technicalSupportRequests.title,
            description: technicalSupportRequests.description,
            taskId: technicalSupportRequests.taskId,
            requesterId: technicalSupportRequests.requesterId,
            assignedToId: technicalSupportRequests.assignedToId,
            status: technicalSupportRequests.status,
            priority: technicalSupportRequests.priority,
            resolution: technicalSupportRequests.resolution,
            createdAt: technicalSupportRequests.createdAt,
            updatedAt: technicalSupportRequests.updatedAt,
            resolvedAt: technicalSupportRequests.resolvedAt,
            requesterName: users.name,
            requesterEmail: users.email,
            taskTitle: tasks.title,
            taskProjectId: tasks.projectId,
            projectName: projects.name,
          })
          .from(technicalSupportRequests)
          .leftJoin(users, eq(technicalSupportRequests.requesterId, users.id))
          .leftJoin(tasks, eq(technicalSupportRequests.taskId, tasks.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .orderBy(desc(technicalSupportRequests.createdAt));
      } else {
        // Non-technical support staff see only their own requests
        requests = await db
          .select({
            id: technicalSupportRequests.id,
            title: technicalSupportRequests.title,
            description: technicalSupportRequests.description,
            taskId: technicalSupportRequests.taskId,
            requesterId: technicalSupportRequests.requesterId,
            assignedToId: technicalSupportRequests.assignedToId,
            status: technicalSupportRequests.status,
            priority: technicalSupportRequests.priority,
            resolution: technicalSupportRequests.resolution,
            createdAt: technicalSupportRequests.createdAt,
            updatedAt: technicalSupportRequests.updatedAt,
            resolvedAt: technicalSupportRequests.resolvedAt,
            requesterName: users.name,
            requesterEmail: users.email,
            taskTitle: tasks.title,
            taskProjectId: tasks.projectId,
            projectName: projects.name,
          })
          .from(technicalSupportRequests)
          .leftJoin(users, eq(technicalSupportRequests.requesterId, users.id))
          .leftJoin(tasks, eq(technicalSupportRequests.taskId, tasks.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(eq(technicalSupportRequests.requesterId, user.id))
          .orderBy(desc(technicalSupportRequests.createdAt));
      }

      // For requests that have assignedToId, get the assigned user info separately
      const assignedUserIds = requests.filter(r => r.assignedToId).map(r => r.assignedToId);
      const assignedUsers = assignedUserIds.length > 0 ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, assignedUserIds)) : [];

      const formattedRequests = requests.map(request => ({
        id: request.id,
        title: request.title,
        description: request.description,
        taskId: request.taskId,
        requesterId: request.requesterId,
        assignedToId: request.assignedToId,
        status: request.status,
        priority: request.priority,
        resolution: request.resolution,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        requester: {
          id: request.requesterId,
          name: request.requesterName,
          email: request.requesterEmail,
        },
        assignedTo: request.assignedToId ? 
          assignedUsers.find(u => u.id === request.assignedToId) || null : null,
        task: request.taskId ? {
          id: request.taskId,
          title: request.taskTitle,
          projectId: request.taskProjectId,
          projectName: request.projectName || null,
        } : null,
      }));

      res.json(formattedRequests);
    } catch (error) {
      console.error("Error fetching technical support requests:", error);
      res.status(500).json({ error: "Failed to fetch technical support requests" });
    }
  });

  app.post("/api/technical-support/requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const { title, description, taskId, priority } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      // If there's a related task, stop timer and change status
      if (taskId) {
        const parsedTaskId = parseInt(taskId);
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, parsedTaskId))
          .limit(1);

        if (task) {
          // Calculate time spent if timer is running
          let newTimeSpent = task.timeSpent || 0;
          if (task.isTimerRunning && task.timerStartTime) {
            const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime).getTime()) / 1000);
            newTimeSpent += elapsedSeconds;
          }

          // Stop timer and change status to technical_support
          await db
            .update(tasks)
            .set({
              isTimerRunning: false,
              timerStartTime: null,
              timeSpent: newTimeSpent,
              status: "technical_support",
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, parsedTaskId));

          // Broadcast task update via WebSocket
          if (global.connectedClients) {
            global.connectedClients.forEach((client) => {
              if (client.readyState === 1) {
                try {
                  client.send(JSON.stringify({
                    type: 'task_updated',
                    data: {
                      taskId: parsedTaskId,
                      projectId: task.projectId,
                      status: 'technical_support',
                      isTimerRunning: false,
                      timeSpent: newTimeSpent,
                      updatedAt: new Date().toISOString()
                    }
                  }));
                } catch (error) {
                  console.error('Error broadcasting task update:', error);
                }
              }
            });
          }
        }
      }

      const [newRequest] = await db
        .insert(technicalSupportRequests)
        .values({
          title: title.trim(),
          description: description.trim(),
          taskId: taskId ? parseInt(taskId) : null,
          requesterId: user.id,
          priority: priority || "medium",
          status: "pending",
        })
        .returning();

      // Notify technical support staff about new request
      try {
        const technicalSupportStaff = await db
          .select()
          .from(users)
          .where(eq(users.specialization, "technical_support"));

        for (const staff of technicalSupportStaff) {
          await createNotification(
            staff.id,
            "task_assigned",
            `New technical support request from ${user.name}: ${title}`,
            newRequest.id,
            "technical_support_request"
          );
        }
      } catch (notificationError) {
        console.error("Error creating technical support notifications:", notificationError);
      }

      res.json({ success: true, requestId: newRequest.id });
    } catch (error) {
      console.error("Error creating technical support request:", error);
      res.status(500).json({ error: "Failed to create request" });
    }
  });

  app.post("/api/technical-support/requests/:id/assign", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const requestId = parseInt(req.params.id);

    try {
      // Get request details
      const [request] = await db
        .select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      await db
        .update(technicalSupportRequests)
        .set({
          assignedToId: user.id,
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(technicalSupportRequests.id, requestId));

      // Notify requester about assignment
      await createNotification(
        request.requesterId,
        "task_assigned",
        `Your technical support request "${request.title}" has been assigned to ${user.name}`,
        requestId,
        "technical_support_request"
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error assigning technical support request:", error);
      res.status(500).json({ error: "Failed to assign request" });
    }
  });

  app.put("/api/technical-support/requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const requestId = parseInt(req.params.id);
    const { status, resolution } = req.body;

    try {
      // Get request details
      const [request] = await db
        .select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (resolution) {
        updateData.resolution = resolution;
      }

      if (status === "resolved" || status === "closed") {
        updateData.resolvedAt = new Date();
      }

      await db
        .update(technicalSupportRequests)
        .set(updateData)
        .where(eq(technicalSupportRequests.id, requestId));

      // Notify requester about status change with better messages
      let notificationContent = "";
      if (status === "resolved") {
        notificationContent = `Your technical support request "${request.title}" has been resolved${resolution ? `: ${resolution}` : ''}`;
      } else if (status === "closed") {
        notificationContent = `Your technical support request "${request.title}" has been closed${resolution ? `. ${resolution}` : ''}`;
      } else if (status === "in_progress") {
        notificationContent = `Your technical support request "${request.title}" is now being worked on by ${user.name}`;
      } else {
        notificationContent = `Your technical support request "${request.title}" status has been updated to ${status}${resolution ? `: ${resolution}` : ''}`;
      }

      await createNotification(
        request.requesterId,
        status === "resolved" ? "task_completed" : "task_updated",
        notificationContent,
        requestId,
        "technical_support_request"
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating technical support request:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  // Deadline Extension Requests API Routes
  app.get("/api/deadline-extension-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      let requests;

      if (user.role === "project_manager" || user.role === "operations_manager" || user.role === "team_lead" || user.specialization === "operations_manager") {
        // Project managers see requests for their projects, operations managers and team leads see all requests
        const whereCondition = user.role === "operations_manager" || user.role === "team_lead" || user.specialization === "operations_manager"
          ? undefined // Operations managers and team leads see all requests
          : eq(deadlineExtensionRequests.projectManagerId, user.id); // Project managers see only their projects

        requests = await db
          .select({
            id: deadlineExtensionRequests.id,
            taskId: deadlineExtensionRequests.taskId,
            requesterId: deadlineExtensionRequests.requesterId,
            projectManagerId: deadlineExtensionRequests.projectManagerId,
            reason: deadlineExtensionRequests.reason,
            requestedDeadline: deadlineExtensionRequests.requestedDeadline,
            status: deadlineExtensionRequests.status,
            decisionReason: deadlineExtensionRequests.decisionReason,
            decidedBy: deadlineExtensionRequests.decidedBy,
            decidedAt: deadlineExtensionRequests.decidedAt,
            approvedDeadline: deadlineExtensionRequests.approvedDeadline,
            approvedWorkingHours: deadlineExtensionRequests.approvedWorkingHours,
            createdAt: deadlineExtensionRequests.createdAt,
            updatedAt: deadlineExtensionRequests.updatedAt,
            requesterName: users.name,
            requesterEmail: users.email,
            taskTitle: tasks.title,
            taskDeadline: tasks.deadline,
            taskWorkingHours: tasks.workingHours,
            projectName: projects.name,
            projectId: projects.id,
          })
          .from(deadlineExtensionRequests)
          .leftJoin(users, eq(deadlineExtensionRequests.requesterId, users.id))
          .leftJoin(tasks, eq(deadlineExtensionRequests.taskId, tasks.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(whereCondition)
          .orderBy(desc(deadlineExtensionRequests.createdAt));
      } else {
        // Staff see only their own requests
        requests = await db
          .select({
            id: deadlineExtensionRequests.id,
            taskId: deadlineExtensionRequests.taskId,
            requesterId: deadlineExtensionRequests.requesterId,
            projectManagerId: deadlineExtensionRequests.projectManagerId,
            reason: deadlineExtensionRequests.reason,
            requestedDeadline: deadlineExtensionRequests.requestedDeadline,
            status: deadlineExtensionRequests.status,
            decisionReason: deadlineExtensionRequests.decisionReason,
            decidedBy: deadlineExtensionRequests.decidedBy,
            decidedAt: deadlineExtensionRequests.decidedAt,
            approvedDeadline: deadlineExtensionRequests.approvedDeadline,
            approvedWorkingHours: deadlineExtensionRequests.approvedWorkingHours,
            createdAt: deadlineExtensionRequests.createdAt,
            updatedAt: deadlineExtensionRequests.updatedAt,
            requesterName: users.name,
            requesterEmail: users.email,
            taskTitle: tasks.title,
            taskDeadline: tasks.deadline,
            taskWorkingHours: tasks.workingHours,
            projectName: projects.name,
            projectId: projects.id,
          })
          .from(deadlineExtensionRequests)
          .leftJoin(users, eq(deadlineExtensionRequests.requesterId, users.id))
          .leftJoin(tasks, eq(deadlineExtensionRequests.taskId, tasks.id))
          .leftJoin(projects, eq(tasks.projectId, projects.id))
          .where(eq(deadlineExtensionRequests.requesterId, user.id))
          .orderBy(desc(deadlineExtensionRequests.createdAt));
      }

      res.json(requests);
    } catch (error) {
      console.error("Error fetching deadline extension requests:", error);
      res.status(500).json({ error: "Failed to fetch deadline extension requests" });
    }
  });

  // Create deadline extension request (Staff only)
  app.post("/api/deadline-extension-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    // Only project manager staff can create requests
    if (user.role === "project_manager") {
      return res.status(403).json({ error: "Project managers cannot create deadline extension requests" });
    }

    try {
      const { taskId, reason, requestedDeadline } = req.body;

      if (!taskId || !reason) {
        return res.status(400).json({ error: "Task ID and reason are required" });
      }

      // Get task details to find the project manager
      const [task] = await db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          assigneeId: tasks.assigneeId,
          deadline: tasks.deadline,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Verify the user is assigned to this task
      if (task.assigneeId !== user.id) {
        return res.status(403).json({ error: "You can only request extensions for tasks assigned to you" });
      }

      // Get project manager
      const [project] = await db
        .select({
          managerId: projects.managerId,
        })
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if there's already a pending request for this task
      const [existingRequest] = await db
        .select()
        .from(deadlineExtensionRequests)
        .where(and(
          eq(deadlineExtensionRequests.taskId, taskId),
          eq(deadlineExtensionRequests.status, "pending")
        ))
        .limit(1);

      if (existingRequest) {
        return res.status(400).json({ error: "There is already a pending extension request for this task" });
      }

      // Create the request
      const [newRequest] = await db
        .insert(deadlineExtensionRequests)
        .values({
          taskId,
          requesterId: user.id,
          projectManagerId: project.managerId,
          reason,
          requestedDeadline: requestedDeadline ? new Date(requestedDeadline) : null,
          status: "pending",
        })
        .returning();

      // Create notification for project manager
      const [taskDetails] = await db
        .select({
          title: tasks.title,
          projectName: projects.name,
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, taskId))
        .limit(1);

      try {
        await db
          .insert(notifications)
          .values({
            userId: project.managerId,
            type: "task_updated",
            content: `${user.name} has requested a deadline extension for task: ${taskDetails?.title || 'Unknown Task'}`,
            referenceId: newRequest.id,
            referenceType: "project",
          });
      } catch (notificationError) {
        console.error("Error creating notification:", notificationError);
        // Continue execution even if notification fails
      }

      res.json({ success: true, requestId: newRequest.id });
    } catch (error) {
      console.error("Error creating deadline extension request:", error);
      res.status(500).json({ error: "Failed to create deadline extension request" });
    }
  });

  // Update deadline extension request (Project Managers, Operations Managers, and Customer Support Officers only)
  app.put("/api/deadline-extension-requests/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const requestId = parseInt(req.params.id);
    const { status, decisionReason, approvedDeadline, approvedWorkingHours } = req.body;

    try {
      if (user.role !== "project_manager" && user.role !== "operations_manager" && user.role !== "customer_support_officer" && user.specialization !== "operations_manager") {
        return res.status(403).json({ error: "Only project managers, operations managers, and customer support officers can update extension requests" });
      }

      if (!status || !["approved", "declined"].includes(status)) {
        return res.status(400).json({ error: "Valid status (approved or declined) is required" });
      }

      if (!decisionReason) {
        return res.status(400).json({ error: "Decision reason is required" });
      }

      // Check if request exists
      const [existingRequest] = await db
        .select()
        .from(deadlineExtensionRequests)
        .where(eq(existingRequest.id, requestId))
        .limit(1);

      if (!existingRequest) {
        return res.status(404).json({ error: "Extension request not found" });
      }

      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Request has already been processed" });
      }

      // Project managers can only update requests for their projects
      if (user.role === "project_manager" && existingRequest.projectManagerId !== user.id) {
        return res.status(403).json({ error: "You can only update requests for your projects" });
      }

      // Update the request
      const [updatedRequest] = await db
        .update(deadlineExtensionRequests)
        .set({
          status,
          decisionReason,
          decidedBy: user.id,
          decidedAt: new Date(),
        })
        .where(eq(existingRequest.id, requestId))
        .returning();

      // If approved, update the task
      if (status === "approved") {
        const taskUpdateData: any = {};

        if (approvedDeadline) {
          taskUpdateData.deadline = new Date(approvedDeadline);
        }
        if (approvedWorkingHours) {
          taskUpdateData.workingHours = parseInt(approvedWorkingHours);
        }

        if (Object.keys(taskUpdateData).length > 0) {
          await db
            .update(tasks)
            .set(taskUpdateData)
            .where(eq(tasks.id, existingRequest.taskId));
        }
      }

      // Create notification for the requester
      try {
        await db
          .insert(notifications)
          .values({
            userId: existingRequest.requesterId,
            type: "task_updated",
            content: `Your deadline extension request has been ${status}. Reason: ${decisionReason}`,
            referenceId: requestId,
            referenceType: "project",
          });
      } catch (notificationError) {
        console.error("Error creating notification:", notificationError);
        // Continue execution even if notification fails
      }

      res.json({ success: true, request: updatedRequest });
    } catch (error) {
      console.error("Error updating deadline extension request:", error);
      res.status(500).json({ error: "Failed to update deadline extension request" });
    }
  });

  // Client Sentiment Tracker API Routes
  app.get("/api/client-sentiment/current-week", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // Get current week's start date (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0, 0, 0, 0);

      const mondayStr = monday.toISOString().split('T')[0];

      const [existingSentiment] = await db
        .select()
        .from(clientSentiment)
        .where(
          and(
            eq(clientSentiment.clientId, user.id),
            eq(clientSentiment.weekStart, mondayStr)
          )
        )
        .limit(1);

      if (!existingSentiment) {
        return res.status(404).json({ error: "No sentiment for current week" });
      }

      res.json(existingSentiment);
    } catch (error) {
      console.error("Error fetching current week sentiment:", error);
      res.status(500).json({ error: "Failed to fetch sentiment" });
    }
  });

  // Get all client sentiments (Operations Manager only)
  app.get("/api/client-sentiment/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all client sentiments" });
    }

    try {
      const { week } = req.query;
      let whereConditions = [];

      if (week && week !== "current") {
        const now = new Date();
        let targetDate = new Date();

        if (week === "last") {
          targetDate.setDate(now.getDate() - 7);
        } else {
          const weeksBack = parseInt(week as string);
          if (!isNaN(weeksBack)) {
            targetDate.setDate(now.getDate() - (weeksBack * 7));
          }
        }

        // Get Monday of target week
        const dayOfWeek = targetDate.getDay();
        const diff = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday =      new Date(targetDate.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const mondayStr = monday.toISOString().split('T')[0];
        whereConditions.push(eq(clientSentiment.weekStart, mondayStr));
      } else if (week === "current") {
        // Get current week's Monday
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const mondayStr = monday.toISOString().split('T')[0];
        whereConditions.push(eq(clientSentiment.weekStart, mondayStr));
      }

      // Get sentiments with client information
      const sentiments = await db
        .select({
          id: clientSentiment.id,
          clientId: clientSentiment.clientId,
          clientName: users.name,
          clientEmail: users.email,
          sentiment: clientSentiment.sentiment,
          reason: clientSentiment.reason,
          createdAt: clientSentiment.createdAt,
          weekStart: clientSentiment.weekStart,
          weekEnd: clientSentiment.weekEnd,
        })
        .from(clientSentiment)
        .leftJoin(users, eq(clientSentiment.clientId, users.id))
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(clientSentiment.createdAt));

      res.json(sentiments);
    } catch (error) {
      console.error("Error fetching client sentiments:", error);
      res.status(500).json({ error: "Failed to fetch client sentiments" });
    }
  });

  app.post("/api/client-sentiment", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const { sentiment, reason } = req.body;

    try {
      // Get current week dates
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const [newSentiment] = await db
        .insert(clientSentiment)
        .values({
          clientId: user.id,
          sentiment,
          reason,
          weekStart: monday.toISOString().split('T')[0],
          weekEnd: sunday.toISOString().split('T')[0],
        })
        .returning();

      res.json({ success: true, sentimentId: newSentiment.id });
    } catch (error) {
      console.error("Error creating client sentiment:", error);
      res.status(500).json({ error: "Failed to create sentiment" });
    }
  });

  // Client Complaints API Routes
  app.get("/api/complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const allComplaints = await db
        .select()
        .from(complaints)
        .orderBy(desc(complaints.createdAt));

      res.json(allComplaints);
    } catch (error) {
      console.error("Error fetching complaints:", error);
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  // Submit client complaint
  app.post("/api/complaints", upload.single('screenshot'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const { name, email, productManagerName, developerName, technicalManagerName, valuableThings, detailedExplanation } = req.body;

      console.log("Client complaint submission:", { name, email, productManagerName, developerName, technicalManagerName, valuableThings, detailedExplanation, userId: user.id });

      if (!name || !email || !detailedExplanation) {
        return res.status(400).json({ error: "Name, email, and detailed explanation are required" });
      }

      // Parse valuable things if it's a string
      let parsedValuableThings = [];
      if (valuableThings) {
        try {
          parsedValuableThings = typeof valuableThings === 'string' ? JSON.parse(valuableThings) : valuableThings;
          if (!Array.isArray(parsedValuableThings)) {
            parsedValuableThings = [];
          }
        } catch (error) {
          console.error("Error parsing valuable things:", error);
          parsedValuableThings = [];
        }
      }

      // Handle screenshot if uploaded
      let screenshotUrl = null;
      if (req.file) {
        screenshotUrl = `/uploads/leave-proof/${req.file.filename}`;
        console.log("Screenshot uploaded:", screenshotUrl);
      }

      const [newComplaint] = await db
        .insert(complaints)
        .values({
          name: name.trim(),
          email: email.trim(),
          productManagerName: productManagerName?.trim() || null,
          developerName: developerName?.trim() || null,
          technicalManagerName: technicalManagerName?.trim() || null,
          valuableThings: parsedValuableThings,
          detailedExplanation: detailedExplanation.trim(),
          screenshotUrl,
          submitterId: user.id,
          status: "pending",
        })
        .returning();

      console.log("Client complaint created:", newComplaint.id);

      // Create notifications for operations managers
      try {
        const operationsManagers = await db
          .select()
          .from(users)
          .where(or(
            eq(users.role, "operations_manager"),
            eq(users.specialization, "operations_manager")
          ));

        for (const manager of operationsManagers) {
          await db
            .insert(notifications)
            .values({
              userId: manager.id,
              type: "task_assigned", // Using existing type
              content: `New client complaint from ${name}: ${detailedExplanation.substring(0, 100)}${detailedExplanation.length > 100 ? '...' : ''}`,
              referenceId: newComplaint.id,
              referenceType: "project", // Using existing type
            });
        }

        console.log(`Notifications sent to ${operationsManagers.length} operations managers`);
      } catch (notificationError) {
        console.error("Error creating client complaint notifications:", notificationError);
      }

      res.json({ success: true, complaintId: newComplaint.id });
    } catch (error) {
      console.error("Error creating client complaint:", error);
      res.status(500).json({ error: "Failed to create complaint", details: error.message });
    }
  });

  // Get user's own complaints
  app.get("/api/complaints/my-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    try {
      const userComplaints = await db
        .select()
        .from(complaints)
        .where(eq(complaints.submitterId, user.id))
        .orderBy(desc(complaints.createdAt));

      res.json(userComplaints);
    } catch (error) {
      console.error("Error fetching user's complaints:", error);
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  app.put("/api/complaints/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const complaintId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

      // Check if complaint exists
      const [existingComplaint] = await db
        .select()
        .from(complaints)
        .where(eq(complaints.id, complaintId))
        .limit(1);

      if (!existingComplaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }

      await db
        .update(complaints)
        .set({
          status,
          reviewComments,
          reviewedAt: new Date(),
        })
        .where(eq(complaints.id, complaintId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating complaint:", error);
      res.status(500).json({ error: "Failed to update complaint" });
    }
  });

  // Leave Applications API Routes

  // Submit leave application (Staff, Interns, Customer Support Officers, and Team Leads)
  app.post("/api/leave-applications", upload.single('proofImage'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "staff" && user.role !== "intern" && user.role !== "customer_support_officer" && user.role !== "team_lead") {
      return res.status(403).send("Only staff members, interns, customer support officers, and team leads can submit leave applications");
    }

    try {
      const { leaveType, reason, startDate, endDate } = req.body;

      if (!leaveType || !reason || !startDate || !endDate) {
        return res.status(400).json({ error: "Leave type, reason, start date, and end date are required" });
      }

      // Validate leave type
      const validLeaveTypes = ["day_off", "leave_of_absence"];
      if (!validLeaveTypes.includes(leaveType)) {
        return res.status(400).json({ error: "Invalid leave type" });
      }

      // Parse and validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (start > end) {
        return res.status(400).json({ error: "Start date cannot be after end date" });
      }

      // Calculate total days
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Check leave of absence limit (14 days per year)
      if (leaveType === "leave_of_absence") {
        const currentYear = new Date().getFullYear();

        // Get approved leave of absence applications for current year
        const existingApplications = await db
          .select()
          .from(leaveApplications)
          .where(and(
            eq(leaveApplications.userId, user.id),
            eq(leaveApplications.leaveType, "leave_of_absence"),
            eq(leaveApplications.status, "approved")
          ));

        const usedDays = existingApplications
          .filter(app => new Date(app.startDate).getFullYear() === currentYear)
          .reduce((total, app) => total + app.totalDays, 0);

        if (usedDays + totalDays > 14) {
          return res.status(400).json({
            error: `Leave of absence exceeds annual limit. You have ${14 - usedDays} days remaining.`
          });
        }
      }

      // Handle file upload if present
      let proofImageUrl = null;
      if (req.file) {
        proofImageUrl = `/uploads/leave-proof/${req.file.filename}`;
      }

      // Create leave application
      const [newApplication] = await db
        .insert(leaveApplications)
        .values({
          userId: user.id,
          leaveType,
          reason,
          startDate: start,
          endDate: end,
          totalDays,
          proofImageUrl,
          status: "pending",
          appliedAt: new Date(),
        })
        .returning();

      // Create notification for project managers
      const projectManagers = await db
        .select()
        .from(users)
        .where(eq(users.role, "project_manager"));

      for (const pm of projectManagers) {
        try {
          await db
            .insert(notifications)
            .values({
              userId: pm.id,
              type: "task_assigned", // Using existing type
              content: `${user.name} has submitted a ${leaveType.replace('_', ' ')} application for ${totalDays} day${totalDays !== 1 ? 's' : ''}`,
              referenceId: newApplication.id,
              referenceType: "project", // Using existing type
            });
        } catch (notificationError) {
          console.error("Error creating notification:", notificationError);
          // Continue execution even if notification fails
        }
      }

      res.json({ success: true, applicationId: newApplication.id });
    } catch (error) {
      console.error("Error creating leave application:", error);
      res.status(500).json({ error: "Failed to create leave application" });
    }
  });

  // Get leave applications (Staff and Interns see their own, Managers see all)
  app.get("/api/leave-applications", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      let applications;

      if (user.role === "project_manager" || user.role === "operations_manager" || user.role === "team_lead" || user.specialization === "operations_manager") {
        // Project managers, operations managers, and team leads see all applications with user details
        applications = await db
          .select({
            id: leaveApplications.id,
            userId: leaveApplications.userId,
            leaveType: leaveApplications.leaveType,
            reason: leaveApplications.reason,
            startDate: leaveApplications.startDate,
            endDate: leaveApplications.endDate,
            totalDays: leaveApplications.totalDays,
            proofImageUrl: leaveApplications.proofImageUrl,
            status: leaveApplications.status,
            appliedAt: leaveApplications.appliedAt,
            reviewedAt: leaveApplications.reviewedAt,
            reviewComments: leaveApplications.reviewComments,
            userName: users.name,
            userEmail: users.email,
          })
          .from(leaveApplications)
          .innerJoin(users, eq(leaveApplications.userId, users.id))
          .orderBy(desc(leaveApplications.appliedAt));
      } else if (user.role === "staff" || user.role === "intern" || user.role === "customer_support_officer") {
        // Staff, interns, and customer support officers see only their own applications
        applications = await db
          .select()
          .from(leaveApplications)
          .where(eq(leaveApplications.userId, user.id))
          .orderBy(desc(leaveApplications.appliedAt));
      } else {
        return res.status(403).send("Access denied");
      }

      res.json(applications);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      res.status(500).json({ error: "Failed to fetch leave applications" });
    }
  });

  // Get all leave applications (for project managers, operations managers, and team leads)
  app.get("/api/leave-applications/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user;
    // Only project managers, operations managers, and team leads can view all applications
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const applications = await db
        .select({
          id: leaveApplications.id,
          leaveType: leaveApplications.leaveType,
          reason: leaveApplications.reason,
          startDate: leaveApplications.startDate,
          endDate: leaveApplications.endDate,
          totalDays: leaveApplications.totalDays,
          proofImageUrl: leaveApplications.proofImageUrl,
          status: leaveApplications.status,
          appliedAt: leaveApplications.appliedAt,
          reviewedAt: leaveApplications.reviewedAt,
          reviewComments: leaveApplications.reviewComments,
          userName: users.name,
          userEmail: users.email,
        })
        .from(leaveApplications)
        .leftJoin(users, eq(leaveApplications.userId, users.id))
        .orderBy(desc(leaveApplications.appliedAt));

      res.json(applications);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      res.status(500).json({ error: "Failed to fetch leave applications" });
    }
  });

  // Review leave application (approve/reject)
  app.put("/api/leave-applications/:id/review", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user;
    // Only project managers, operations managers, and team leads can review applications
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.role !== "team_lead" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const applicationId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'rejected'" });
      }

      if (status === "rejected" && !reviewComments?.trim()) {
        return res.status(400).json({ error: "Review comments are required when rejecting an application" });
      }

      // Check if application exists
      const [existingApplication] = await db
        .select()
        .from(leaveApplications)
        .where(eq(existingApplication.id, applicationId))
        .limit(1);

      if (!existingApplication) {
        return res.status(404).json({ error: "Leave application not found" });
      }

      if (existingApplication.status !== "pending") {
        return res.status(400).json({ error: "Application has already been reviewed" });
      }

      // Update the application
      const [updatedApplication] = await db
        .update(leaveApplications)
        .set({
          status,
          reviewComments: reviewComments?.trim() || null,
          reviewedAt: new Date(),
          reviewedBy: user.id,
          updatedAt: new Date(),
        })
        .where(eq(existingApplication.id, applicationId))
        .returning();

      // Create notification for the applicant
      try {
        await db
          .insert(notifications)
          .values({
            userId: updatedApplication.userId,
            type: "task_updated", // Using existing type
            content: `Your leave application has been ${status}${reviewComments ? `: ${reviewComments}` : ''}`,
            referenceId: updatedApplication.id,
            referenceType: "project", // Using existing type
          });
      } catch (notificationError) {
        console.error("Error creating notification:", notificationError);
        // Continue execution even if notification fails
      }

      res.json({ success: true, application: updatedApplication });
    } catch (error) {
      console.error("Error reviewing leave application:", error);
      res.status(500).json({ error: "Failed to review leave application" });
    }
  });

  // Project-specific API Routes

  // Get project by ID
  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      const [project] = await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          progress: projects.progress,
          category: projects.category,
          type: projects.type,
          startDate: projects.startDate,
          endDate: projects.endDate,
          clientId: projects.clientId,
          managerId: projects.managerId,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          client: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(projects)
        .leftJoin(users, eq(projects.clientId, users.id))
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check if user has access to this project
      let hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        project.managerId === user.id ||
        project.clientId === user.id;

      // If not already granted access, check project membership
      if (!hasAccess) {
        const membership = await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1);

        hasAccess = membership.length > 0;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Get project members (dedicated endpoint for form editing)
  app.get("/api/projects/:id/members", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      // Check if project exists and user has access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Check if user is a member of the project (for all roles including customer support)
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        user.role === "project_manager" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        !!membership;

      if (!hasAccess) {
        console.log(`Access denied for user ${user.id} (${user.role}) to project ${projectId} members. Project manager: ${project.managerId}, Client: ${project.clientId}, Membership:`, membership);
        return res.status(403).send("Access denied - You must be a project member to view membersst");
      }

      const members = await db
        .select({
          id: projectMembers.id,
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          role: projectMembers.role,
          invitationStatus: projectMembers.invitationStatus,
          userName: users.name,
          userEmail: users.email,
        })
        .from(projectMembers)
        .leftJoin(users, eq(projectMembers.userId, users.id))
        .where(eq(projectMembers.projectId, projectId));

      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  // Get project tasks
  app.get("/api/projects/:id/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        (user.role === "staff" && await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1)
          .then(members => members.length > 0)
        );

      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      const projectTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(desc(tasks.updatedAt));

      res.json(projectTasks);
    } catch (error) {
      console.error("Error fetching project tasks:", error);
      res.status(500).json({ error: "Failed to fetch project tasks" });
    }
  });

  // Get project resources
  app.get("/api/projects/:id/resources", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        (user.role === "staff" && await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1)
          .then(members => members.length > 0)
        );

      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      const projectResources = await db
        .select({
          id: resources.id,
          name: resources.name,
          type: resources.type,
          size: resources.size,
          path: resources.path,
          link: resources.link,
          uploadedBy: resources.uploadedBy,
          createdAt: resources.createdAt,
          uploaderName: users.name,
        })
        .from(resources)
        .leftJoin(users, eq(resources.uploadedBy, users.id))
        .where(eq(resources.projectId, projectId))
        .orderBy(desc(resources.createdAt));

      res.json(projectResources);
    } catch (error) {
      console.error("Error fetching project resources:", error);
      res.status(500).json({ error: "Failed to fetch project resources" });
    }
  });

  // Upload file resource to project
  app.post("/api/projects/:id/resources/upload", upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { category, customFileName } = req.body;

      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }

      // Check if project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check user access permissions
      const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';
      const isTeamLead = user.role === 'team_lead';
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isCustomerSupportOfficer = user.role === 'customer_support_officer';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isTeamLead || isProjectManager || isCustomerSupportOfficer || isClient;

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied - insufficient permissions" });
      }

      // Store file information
      const filePath = `/uploads/leave-proof/${req.file.filename}`;

      // Use custom file name if provided, otherwise use original file name
      const displayName = customFileName && customFileName.trim() 
        ? customFileName.trim() 
        : req.file.originalname;

      // Insert the new resource
      const [newResource] = await db
        .insert(resources)
        .values({
          name: displayName,
          type: category,
          path: filePath,
          size: req.file.size,
          projectId,
          uploadedBy: user.id,
        })
        .returning();

      res.json({ success: true, resourceId: newResource.id });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ 
        error: "Failed to upload file", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add resource link to project
  app.post("/api/projects/:id/resources/link", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const { name, link, category } = req.body;

    console.log("Resource link endpoint called:", { projectId, name, link, category, userId: user.id, userRole:user.role });

    try {
      // Validate required fields
      if (!name || !link || !category) {
        console.log("Missing required fields:", { name, link, category });
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
      } catch (urlError) {
        console.log("Invalid URL format:", link);
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check if project exists using proper Drizzle syntax
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        console.log("Project not found:", projectId);
        return res.status(404).json({ error: "Project not found" });
      }

      // Check user access permissions
      const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';
      const isTeamLead = user.role === 'team_lead';
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isCustomerSupportOfficer = user.role === 'customer_support_officer';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isTeamLead || isProjectManager || isCustomerSupportOfficer || isClient;

      console.log("Access check:", { 
        isOperationsManager,
        isTeamLead,
        isProjectManager, 
        isCustomerSupportOfficer, 
        isClient, 
        hasAccess,
        userRole: user.role,
        userSpecialization: user.specialization,
        projectManagerId: project.managerId,
        projectClientId: project.clientId
      });

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied - insufficient permissions" });
      }

      // Insert the new resource
      const [newResource] = await db
        .insert(resources)
        .values({
          name: name.trim(),
          type: category,
          link: link.trim(),
          projectId,
          uploadedBy: user.id,
        })
        .returning();

      console.log("Resource created successfully:", newResource);
      res.json({ success: true, resourceId: newResource.id });

    } catch (error) {
      console.error("Error adding resource link:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ 
        error: "Failed to add resource link", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update resource
  app.put("/api/projects/:projectId/resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const resourceId = parseInt(req.params.id);
    const { name, link, category } = req.body;

    try {
      if (!name || !link || !category) {
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
      } catch (urlError) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check if project exists and user has access
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check user access permissions
      const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';
      const isTeamLead = user.role === 'team_lead';
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isCustomerSupportOfficer = user.role === 'customer_support_officer';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isTeamLead || isProjectManager || isCustomerSupportOfficer || isClient;

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied - insufficient permissions" });
      }

      // Update the resource
      const [updatedResource] = await db
        .update(resources)
        .set({
          name: name.trim(),
          type: category,
          link: link.trim(),
        })
        .where(eq(resources.id, resourceId))
        .returning();

      if (!updatedResource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  // Delete resource
  app.delete("/api/projects/:projectId/resources/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const resourceId = parseInt(req.params.id);

    try {
      // Check if project exists and user has access
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check user access permissions
      const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';
      const isTeamLead = user.role === 'team_lead';
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isProductOwner = user.role === 'product_owner';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isTeamLead || isProjectManager || isProductOwner || isClient;

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied - insufficient permissions" });
      }

      // Delete the resource
      const deletedRows = await db
        .delete(resources)
        .where(eq(resources.id, resourceId))
        .returning();

      if (deletedRows.length === 0) {
        return res.status(404).json({ error: "Resource not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // Get project members
  app.get("/api/projects/:id/members", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
       // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Check if user is a member of the project (for all roles including customer support)
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        user.role === "project_manager" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        !!membership;

      if (!hasAccess) {
        console.log(`Access denied for user ${user.id} (${user.role}) to project ${projectId} members. Project manager: ${project.managerId}, Client: ${project.clientId}, Membership:`, membership);
        return res.status(403).send("Access denied - You must be a project member to view membersst");
      }

      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.invitationStatus, "accepted")
          )
        )
        .orderBy(asc(users.name));

      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  // Get project team messages
  app.get("/api/projects/:projectId/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);

    try {
       // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });      // Check if user is a member of the project (for all roles including customer support)
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        user.role === "project_manager" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        !!membership;

      if (!hasAccess) {
        console.log(`Access denied for user ${user.id} to project ${projectId} team members. Project manager: ${project.managerId}, Client: ${project.clientId}, Membership:`, membership);
        return res.status(403).send("Access denied - You must be a project member to view team membersst");
      }

      const rawMessages = await db
        .select({
          id: projectMessages.id,
          content: projectMessages.content,
          createdAt: projectMessages.createdAt,
          updatedAt: projectMessages.updatedAt,
          isEdited: projectMessages.isEdited,
          senderId: projectMessages.senderId,
          senderName: users.name,
          senderEmail: users.email,
          senderUserId: users.id,
        })
        .from(projectMessages)
        .leftJoin(users, eq(projectMessages.senderId, users.id))
        .where(eq(projectMessages.projectId, projectId))
        .orderBy(desc(projectMessages.createdAt))
        .limit(50);

      // Transform the data to match expected format
      const teamMessages = rawMessages.map(msg => ({
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        isEdited: msg.isEdited,
        senderId: msg.senderId,
        sender: msg.senderUserId ? {
          id: msg.senderUserId,
          name: msg.senderName || "Unknown",
          email: msg.senderEmail || "",
        } : null,
      }));

      res.json(teamMessages.reverse());
    } catch (error) {
      console.error("Error fetching team messages:", error);
      res.status(500).json({
        error: "Failed to fetch team messages",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Send team message
  app.post("/api/projects/:projectId/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const { content } = req.body;

    try {
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Check if user is a member of the project (for all roles including customer support)
      const [membership] = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        user.role === "project_manager" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        !!membership;

      if (!hasAccess) {
        console.log(`Access denied for user ${user.id} to send team message in project ${projectId}`);
        return res.status(403).json({ error: "Access denied - You must be a project member to send messages" });
      }

      const now = new Date();
      const [newMessage] = await db
        .insert(projectMessages)
        .values({
          projectId,
          senderId: user.id,
          content: content.trim(),
          createdAt: now,
          updatedAt: now,
          isEdited: false,
        })
        .returning();

      // Check for @mentions in the message - improved regex to handle spaces
      const mentionRegex = /@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;
      const mentions = [...content.matchAll(mentionRegex)];

      if (mentions.length > 0) {
        // Get all project members to find mentioned users
        const allProjectMembers = await db
          .select({
            id: users.id,
            name: users.name,
          })
          .from(projectMembers)
          .innerJoin(users, eq(projectMembers.userId, users.id))
          .where(eq(projectMembers.projectId, projectId));

        // Also add project manager and team leads
        const additionalMembers = await db
          .select({
            id: users.id,
            name: users.name,
          })
          .from(users)
          .where(
            or(
              eq(users.id, project.managerId),
              eq(users.role, "team_lead"),
              eq(users.role, "operations_manager"),
              eq(users.specialization, "operations_manager")
            )
          );

        const allMembers = [...allProjectMembers, ...additionalMembers];

        for (const match of mentions) {
          const mentionedName = match[1].trim();

          // Find user by exact or partial name match
          const mentionedUser = allMembers.find(member => 
            member.name && (
              member.name.toLowerCase() === mentionedName.toLowerCase() ||
              member.name.toLowerCase().startsWith(mentionedName.toLowerCase())
            )
          );

          if (mentionedUser && mentionedUser.id !== user.id) {
            try {
              await createNotification(
                mentionedUser.id,
                "team_mention",
                `${user.name} mentioned you in ${project.name}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
                projectId,
                "project"
              );
            } catch (notifError) {
              console.error(`Failed to create mention notification for user ${mentionedUser.id}:`, notifError);
            }
          }
        }
      }

      // Broadcast via WebSocket
      if (global.wss) {
        global.wss.clients.forEach((client: any) => {
          if (client.readyState === 1 && client.userId) {
            client.send(JSON.stringify({
              type: "project_message",
              data: {
                projectId,
                senderId: user.id,
                senderName: user.name,
                content: content.trim(),
              }
            }));
          }
        });
      }

      res.json({ success: true, messageId: newMessage.id, message: messageWithSender });
    } catch (error) {
      console.error("Error sending team message:", error);
      res.status(500).json({ error: "Failed to send team message" });
    }
  });

  // Edit team message
  app.put("/api/projects/:projectId/team-messages/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const messageId = parseInt(req.params.messageId);
    const { content } = req.body;

    try {
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Check if message exists and belongs to user
      const [existingMessage] = await db
        .select()
        .from(projectMessages)
        .where(eq(projectMessages.id, messageId))
        .limit(1);

      if (!existingMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (existingMessage.senderId !== user.id) {
        return res.status(403).json({ error: "You can only edit your own messages" });
      }

      if (existingMessage.projectId !== projectId) {
        return res.status(400).json({ error: "Message does not belong to this project" });
      }

      // Update the message
      const [updatedMessage] = await db
        .update(projectMessages)
        .set({
          content: content.trim(),          updatedAt: new Date(),
          isEdited: true,
        })
        .where(and(
          eq(projectMessages.id, messageId),
          eq(projectMessages.senderId, user.id)
        ))
        .returning();

      // Note: Message updates are handled via query invalidation on the client
      // No need for WebSocket broadcast here as the client will refetch
      res.json({ success: true, message: updatedMessage });
    } catch (error) {
      console.error("Error editing team message:", error);
      res.status(500).json({ error: "Failed to edit message" });
    }
  });

  // Delete team message
  app.delete("/api/projects/:projectId/team-messages/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const messageId = parseInt(req.params.messageId);

    try {
      // Check if message exists and belongs to user
      const [existingMessage] = await db
        .select()
        .from(projectMessages)
        .where(eq(projectMessages.id, messageId))
        .limit(1);

      if (!existingMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (existingMessage.senderId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own messages" });
      }

      if (existingMessage.projectId !== projectId) {
        return res.status(400).json({ error: "Message does not belong to this project" });
      }

      // Delete the message
      await db
        .delete(projectMessages)
        .where(eq(projectMessages.id, messageId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team message:", error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Mark team messages as read
  app.post("/api/projects/:projectId/team-messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.projectId);
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: "Invalid message IDs" });
    }

    try {
      // Insert read receipts for messages that don't already have them
      const readReceiptsData = messageIds.map(messageId => ({
        messageId: parseInt(messageId),
        userId: user.id,
      }));

      await db.insert(messageReadReceipts).values(readReceiptsData).onConflictDoNothing();

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Mark notification as read
  app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify the notification belongs to the user
      const notification = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        ),
      });

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Update the notification
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, notificationId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify the notification belongs to the user
      const notification = await db.query.notifications.findFirst({
        where: and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        ),
      });

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Delete the notification
      await db
        .delete(notifications)
        .where(eq(notifications.id, notificationId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Get project plans
  app.get("/api/projects/:id/plans", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
       // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        (user.role === "staff" && await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1)
          .then.then(members => members.length > 0)
        );

      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      const plans = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId))
        .orderBy(desc(projectPlans.createdAt));

      res.json(plans);
    } catch (error) {
      console.error("Error fetching project plans:", error);
      res.status(500).json({ error: "Failed to fetch project plans" });
    }
  });

  // Get project plan details
  app.get("/api/project-plans/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const planId = parseInt(req.params.id);

    try {
      const [plan] = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "Project plan not found" });
      }

       // Check project access
      const [project] = await db.select().from(projects).where(eq(projects.id, plan.projectId)).limit(1);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const hasAccess = 
        user.role === "operations_manager" || 
        user.role === "team_lead" ||
        user.specialization === "operations_manager" ||
        user.role === "product_owner" ||
        user.role === "customer_support_officer" ||
        project.managerId === user.id ||
        project.clientId === user.id ||
        (user.role === "staff" && await db
          .select()
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, project.id),
              eq(projectMembers.userId, user.id),
              eq(projectMembers.invitationStatus, "accepted")
            )
          )
          .limit(1)
          .then(members => members.length > 0)
        );

      if (!hasAccess) return res.status(403).json({ error: "Access denied" });

      // Get deliverables for this plan
      const planDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.projectPlanId, planId))
        .orderBy(asc(deliverables.order)); // Order by order field

      const planWithDeliverables ={
        ...plan,
        deliverables: planDeliverables,
      };

      res.json(planWithDeliverables);
    } catch (error) {
      console.error("Error fetching project plan:", error);
      res.status(500).json({ error: "Failed to fetch project plan" });
    }
  });

  // SSE endpoint for real-time notifications
  app.get("/api/notifications/stream", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const userId = req.user!.id;
    console.log(`SSE connection opened for user ${userId}`);

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Update user's last active time and status
    db.update(users)
      .set({
        lastActive: new Date(),
        status: "online" as any
      })
      .where(eq(users.id, userId))
      .catch(err => console.error("Error updating user activity status:", err));

    // Send initial connection message
    try {
      res.write(`data: ${JSON.stringify({type: "connected"})}\n\n`);
    } catch (error) {
      console.error(`Error sending initial SSE message to user ${userId}:`, error);
      return;
    }

    // Store the response object in a Map keyed by user ID
    if (!global.sseClients) {
      global.sseClients = new Map();
    }
    global.sseClients.set(userId, res);

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        global.sseClients?.delete(userId);
        return;
      }
      try {
        res.write(`data: ${JSON.stringify({type: "heartbeat"})}\n\n`);
      } catch (error) {
        console.error(`Error sending heartbeat to user ${userId}:`, error);
        clearInterval(heartbeat);
        global.sseClients?.delete(userId);
        res.end();
      }
    }, 30000);

    // Handle client disconnect
    const cleanup = () => {
      clearInterval(heartbeat);
      global.sseClients?.delete(userId);
      console.log(`SSE connection closed for user ${userId}`);
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('close', cleanup);
  });

  // Create project
  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    // Check if user has permission to create projects
    const canCreateProjects = 
      user.role === "project_manager" || 
      user.role === "customer_support_officer" ||
      user.role === "operations_manager" || 
      user.role === "team_lead" ||
      user.specialization === "operations_manager";

    if (!canCreateProjects) {
      return res.status(403).json({ error: "You don't have permission to create projects" });
    }

    const { name, description, type, category, startDate, endDate, clientId, teamMembers } = req.body;

    try {
      if (!name || !category || !startDate || !endDate) {
        return res.status(400).json({ error: "Name, category, start date, and end date are required" });
      }

      const [newProject] = await db
        .insert(projects)
        .values({
          name,
          description: description || "",
          type: type || "one_time",
          category,
          status: "pending",
          progress: 0,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          clientId: clientId && clientId !== "none" ? parseInt(clientId) : null,
          managerId: user.id,
        })
        .returning();

      // Collect all team member IDs to add
      const allTeamMemberIds = new Set<number>();

      // Add selected team members
      if (teamMembers && teamMembers.length > 0) {
        teamMembers.forEach((memberId: string) => allTeamMemberIds.add(parseInt(memberId)));
      }

      // Auto-add customer support officer to their own projects
      if (user.role === "customer_support_officer") {
        allTeamMemberIds.add(user.id);
      }

      // Add team members to project
      if (allTeamMemberIds.size > 0) {
        const memberData = Array.from(allTeamMemberIds).map((memberId) => ({
          projectId: newProject.id,
          userId: memberId,
          invitedBy: user.id,
          invitationStatus: "accepted" as const,
        }));

        await db.insert(projectMembers).values(memberData);
      }

      // Auto-add supervisor project managers to DPL projects
      if (category === "dpl_outright" || category === "dpl_partnership") {
        const supervisorPMs = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.role, "project_manager"),
              eq(users.projectManagerType, "supervisor")
            )
          );

        if (supervisorPMs.length > 0) {
          const supervisorMemberData = supervisorPMs.map(supervisor => ({
            projectId: newProject.id,
            userId: supervisor.id,
            invitedBy: user.id,
            invitationStatus: "accepted" as const,
          }));

          await db.insert(projectMembers).values(supervisorMemberData).onConflictDoNothing();
        }
      }

      res.json({ success: true, id: newProject.id, project: newProject });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Update project
  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    let { name, description, type, category, startDate, endDate, clientId, teamMembers } = req.body;

    try {
      if (!name || !category || !startDate || !endDate) {
        return res.status(400).json({ error: "Name, category, start date, and end date are required" });
      }

      // Check if project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error:"Project not found" });
      }

      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;
      const isProductOwner = user.role === "product_owner";
      const isCustomerSupportOfficer = user.role === "customer_support_officer";
      const isTeamLead = user.role === "team_lead";

      if (!isOperationsManager && !isProjectManager && !isProductOwner && !isCustomerSupportOfficer && !isTeamLead) {
        return res.status(403).json({ error: "Access denied" });
      }

      // For customer support officers, validate they can only work with support_maintenance projects
      if (isCustomerSupportOfficer) {
        // Check if the existing project is support_maintenance
        if (project.category !== "support_maintenance") {
          return res.status(403).json({ error: "Customer support officers can only edit Support & Maintenance projects" });
        }
        // Force category to remain support_maintenance - don't allow changes
        category = "support_maintenance";
      }

      // Ensure projectId is valid before updating
      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID for update" });
      }

      // Update project - use explicit where clause to prevent accidental creation
      const [updatedProject] = await db
        .update(projects)
        .set({
          name,
          description: description || "",
          type: type || "one_time",
          category,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          clientId: clientId && clientId !== "none" ? parseInt(clientId) : null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      // Verify the update actually happened
      if (!updatedProject) {
        return res.status(500).json({ error: "Failed to update project - no project returned" });
      }

      // Notify client about project updates
      if (updatedProject.clientId && updatedProject.clientId !== user.id) {
        await createNotification(
          updatedProject.clientId,
          "task_updated",
          `Your project "${updatedProject.name}" has been updated`,
          projectId,
          "project"
        );
      }

      // Update team members if provided
      if (teamMembers !== undefined) {
        // Get all team leads to ensure they're always included
        const teamLeads = await db
          .select()
          .from(users)
          .where(eq(users.role, "team_lead"));

        // Remove existing members except the project manager and team leads
        await db
          .delete(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              ne(projectMembers.userId, project.managerId),
              // Don't remove team leads
              sql`${projectMembers.userId} NOT IN (${teamLeads.map(tl => tl.id).join(', ') || 'NULL'})`
            )
          );

        // Combine team members with team leads
        const allMemberIds = new Set<number>();

        // Add selected team members
        if (teamMembers.length > 0) {
          teamMembers.forEach(memberId => allMemberIds.add(parseInt(memberId)));
        }

        // Add all team leads automatically
        teamLeads.forEach(teamLead => allMemberIds.add(teamLead.id));

        // Add new team members (this will include team leads)
        if (allMemberIds.size > 0) {
          const memberData = Array.from(allMemberIds).map((memberId: number) => ({
            projectId,
            userId: memberId,
            invitedBy: user.id,
            invitationStatus: "accepted" as const,
          }));

          // Use onConflictDoNothing to avoid duplicate entries
          await db.insert(projectMembers).values(memberData).onConflictDoNothing();
        }
      }

      res.json({ success: true, project: updatedProject });
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

// Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    // Validate project ID
    if (isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    try {
      // Check if project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Ensure all required fields exist
      if (!project.id || project.managerId === undefined) {
        return res.status(500).json({ error: "Project data is incomplete" });
      }

      // Check permissions
      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;
      const isProductOwner = user.role === "product_owner";
      const isCustomerSupportOfficer = user.role === "customer_support_officer";
      const isTeamLead = user.role === "team_lead";

      if (!isOperationsManager && !isProjectManager && !isProductOwner && !isCustomerSupportOfficer && !isTeamLead) {
        return res.status(403).json({ error: "Access denied" });
      }

      // For product owners, check if the project is Support & Maintenance category
      if (isProductOwner && project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only delete Support & Maintenance category projects"
        });
      }

      // Delete related data first (in order of dependencies)

      // Delete deliverables
      const projectPlanIds = await db
        .select({ id: projectPlans.id })
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

      if (projectPlanIds.length > 0) {
        await db
          .delete(deliverables)
          .where(inArray(deliverables.projectPlanId, projectPlanIds.map(p => p.id)));
      }

      // Delete project plans
      await db
        .delete(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

      // Delete project messages and read receipts
      const projectMessageIds = await db
        .select({ id: projectMessages.id })
        .from(projectMessages)
        .where(eq(projectMessages.projectId, projectId));

      if (projectMessageIds.length > 0) {
        await db
          .delete(messageReadReceipts)
          .where(inArray(messageReadReceipts.messageId, projectMessageIds.map(m => m.id)));
      }

      await db
        .delete(projectMessages)
        .where(eq(projectMessages.projectId, projectId));

      // Delete resources
      await db
        .delete(resources)
        .where(eq(resources.projectId, projectId));

      // Delete project members
      await db
        .delete(projectMembers)
        .where(eq(projectMembers.projectId, projectId));

      // Delete client invitations
      await db
        .delete(clientInvitations)
        .where(eq(clientInvitations.projectId, projectId));

      // Finally delete the project
      await db
        .delete(projects)
        .where(eq(projects.id, projectId));

      res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Helper function to create notifications with proper error handling
  async function createNotification(userId: number, type: string, content: string, referenceId?: number, referenceType?: string) {
    try {
      await db
        .insert(notifications)
        .values({
          userId,
          type,
          content,
          referenceId: referenceId || null,
          referenceType: referenceType || null,
        });

      // Send real-time notification via SSE
      if (global.sseClients && global.sseClients.has(userId)) {
        const client = global.sseClients.get(userId);
        if (client && !client.writableEnded) {
          try {
            client.write(`data: ${JSON.stringify({
              type: "notification",
              notification: {
                userId,
                type,
                content,
                referenceId,
                referenceType,
                read: false,
                createdAt: new Date().toISOString()
              }
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending real-time notification to user ${userId}:`, error);
            global.sseClients.delete(userId);
          }
        }
      }
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  }

  // Create project plan
  app.post("/api/projects/:id/plans", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const { name, description, startDate, endDate, deliverables: requestDeliverables } = req.body;

    try {
      console.log("Creating project plan with data:", { name, description, startDate, endDate, deliverables: requestDeliverables });

      if (!name || !startDate || !endDate) {
        return res.status(400).json({ error: "Name, start date, and end date are required" });
      }

      // Check if project exists and user has access
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;

      if (!isOperationsManager && !isProjectManager) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Parse and validate dates
      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      // Create project plan
      const [newPlan] = await db
        .insert(projectPlans)
        .values({
          projectId,
          name,
          description: description || "",
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          status: "draft",
          createdBy: user.id,
        })
        .returning();

      console.log("Project plan created:", newPlan);

      // Create deliverables if provided
      if (requestDeliverables && Array.isArray(requestDeliverables) && requestDeliverables.length > 0) {
        const deliverableData = requestDeliverables
          .filter((deliverable: any) => deliverable && deliverable.name) // Filter out empty/invalid deliverables
          .map((deliverable: any, index: number) => {
            const deliverableStartDate = deliverable.startDate ? new Date(deliverable.startDate) : parsedStartDate;
            const deliverableEndDate = deliverable.endDate ? new Date(deliverable.endDate) : parsedEndDate;

            // Calculate duration in days
            const duration = Math.ceil((deliverableEndDate.getTime() - deliverableStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            return {
              projectPlanId: newPlan.id,
              name: deliverable.name,
              description: deliverable.description || "",
              startDate: deliverableStartDate,
              endDate: deliverableEndDate,
              duration,
              status: deliverable.status || "pending" as const,
              order: typeof deliverable.order === 'number' ? deliverable.order : index,
            };
          });

        if (deliverableData.length > 0) {
          console.log("Creating deliverables:", deliverableData);
          await db.insert(deliverables).values(deliverableData);
        }
      }

      res.json({ success: true, planId: newPlan.id });
    } catch (error) {
      console.error("Error creating project plan:", error);
      res.status(500).json({ 
        error: "Failed to create project plan",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update project plan
  app.put("/api/project-plans/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const planId = parseInt(req.params.id);
    const { name, description, startDate, endDate, status, deliverables: planDeliverables } = req.body;

    try {
      console.log("Updating project plan:", planId);
      console.log("Plan data:", { name,description, startDate, endDate, deliverables: planDeliverables });

      if (!name) {
        return res.status(400).json({ error: "Plan name is required" });
      }

      if (!planDeliverables || !Array.isArray(planDeliverables) || planDeliverables.length === 0) {
        return res.status(400).json({ error: "At least one deliverable is required" });
      }

      // Verify project plan exists
      const [existingPlan] = await db
        .select()
        .from(projectPlans)
        .where(eq(existingPlan.id, planId))
        .limit(1);

      if (!existingPlan) {
        return res.status(404).json({ error: "Project plan not found" });
      }

      // Check if user has access to the project
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, existingPlan.projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;

      if (!isOperationsManager && !isProjectManager) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Parse dates
      let parsedStartDate: Date | null = null;
      let parsedEndDate: Date | null = null;

      if (startDate) {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({ error: "Invalid start date format" });
        }
      }

      if (endDate) {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "Invalid end date format" });
        }
      }

      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return res.status(400).json({ error: "Start date cannot be after end date" });
      }

      // Update project plan
      const [updatedPlan] = await db
        .update(projectPlans)
        .set({
          name,
          description: description || "",
          startDate: parsedStartDate || existingPlan.startDate,
          endDate: parsedEndDate || existingPlan.endDate,
          status: status || existingPlan.status,
          updatedAt: new Date(),
        })
        .where(eq(existingPlan.id, planId))
        .returning();

      // Delete existing deliverables
      await db
        .delete(deliverables)
        .where(eq(deliverables.projectPlanId, planId));

      // Create new deliverables
      if (planDeliverables && Array.isArray(planDeliverables) && planDeliverables.length > 0) {
        const deliverableValues = planDeliverables
          .filter((deliverable: any) => deliverable && deliverable.name)
          .map((deliverable: any, index: number) => {
            const deliverableStartDate = deliverable.startDate ? new Date(deliverable.startDate) : (parsedStartDate || existingPlan.startDate);
            const deliverableEndDate = deliverable.endDate ? new Date(deliverable.endDate) : (parsedEndDate || existingPlan.endDate);

            if (isNaN(deliverableStartDate.getTime()) || isNaN(deliverableEndDate.getTime())) {
              throw new Error(`Invalid date format in deliverable ${index + 1}`);
            }

            const duration = Math.ceil((deliverableEndDate.getTime() - deliverableStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            return {
              projectPlanId: planId,
              name: deliverable.name,
              description: deliverable.description || "",
              startDate: deliverableStartDate,
              endDate: deliverableEndDate,
              duration,
              status: deliverable.status || "pending" as const,
              order: typeof deliverable.order === 'number' ? deliverable.order : index,
            };
          });

        if (deliverableValues.length > 0) {
          await db.insert(deliverables).values(deliverableValues);
        }
      }

      res.json(updatedPlan);
    } catch (error) {
      console.error("Error updating project plan:", error);
      res.status(500).json({
        error: "Failed to update project plan",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete project plan
  app.delete("/api/project-plans/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const planId = parseInt(req.params.id);

    try {
      // Verify plan exists
      const [plan] = await db
        .select()
        .from(projectPlans)
        .where(eq(plan.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "Project plan not found" });
      }

      // Check if user has access to the project
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, plan.projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";
      const isProjectManager = user.role === "project_manager" && project.managerId === user.id;

      if (!isOperationsManager && !isProjectManager) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete deliverables first
      await db
        .delete(deliverables)
        .where(eq(deliverables.projectPlanId, planId));

      // Delete project plan
      await db
        .delete(projectPlans)
        .where(eq(projectPlans.id, planId));

      res.json({ success: true, message: "Project plan deleted successfully" });
    } catch (error) {
      console.error("Error deleting project plan:", error);
      res.status(500).json({ error: "Failed to delete project plan" });
    }
  });

  // Get all tasks (filtered by user role)
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      let tasksList;

      if (user.role === "staff") {
        // Staff see only tasks assigned to them
        tasksList = await db
          .select()
          .from(tasks)
          .where(eq(tasks.assigneeId, user.id))
          .orderBy(desc(tasks.updatedAt));
      } else if (user.role === "client") {
        // Clients see tasks from their projects
        const clientProjects = await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.clientId, user.id));

        const projectIds = clientProjects.map(p => p.id);

        if (projectIds.length > 0) {
          tasksList = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        } else {
          tasksList = [];
        }
      } else if (user.role === "project_manager") {
        // Project managers see tasks from their managed projects
        const managerProjects = await db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.managerId, user.id));

        const projectIds = managerProjects.map(p => p.id);

        if (projectIds.length > 0) {
          tasksList = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        } else {
          tasksList = [];
        }
      } else if (user.role === "operations_manager" || user.specialization === "operations_manager" || user.role === "team_lead") {
        // Operations managers and team leads see all tasks
        tasksList = await db
          .select()
          .from(tasks)
          .orderBy(desc(tasks.updatedAt));
      } else if (user.role === "product_owner") {
        // Product owners see all tasks
        tasksList = await db
          .select()
          .from(tasks)
          .orderBy(desc(tasks.updatedAt));
      } else {
        tasksList = [];
      }

      res.json(tasksList);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Create task
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const { title, description, projectId, assigneeId, deadline, priority, workingHours, workingMinutes, startDate } = req.body;

    try {
      if (!title || !projectId) {
        return res.status(400).json({ error: "Title and project ID are required" });
      }

      // Validate working hours if provided (can be decimal for hours + minutes)
      let taskWorkingHours = null;
      if (workingHours !== null && workingHours !== undefined) {
        const hoursValue = parseFloat(workingHours);
        if (isNaN(hoursValue) || hoursValue <= 0) {
          return res.status(400).json({ error: "Working hours must be a positive number" });
        }
        // Convert decimal hours to minutes and store as integer
        taskWorkingHours = Math.round(hoursValue * 60);
      }

      const [newTask] = await db
        .insert(tasks)
        .values({
          projectId,
          title,
          description: description || "",
          assigneeId: assigneeId ? parseInt(assigneeId) : null,
          assignedBy: user.id,
          startDate: startDate ? new Date(startDate) : null,
          deadline: deadline ? new Date(deadline) : null,
          workingHours: workingHours ? parseInt(workingHours) : null,
          workingMinutes: workingMinutes ? parseInt(workingMinutes) : null,
          priority: priority || "medium",
          status: "not_started",
          progress: 0,
        })
        .returning();

      console.log("Task created successfully:", newTask);

      // Create notification for assignee if task is assigned
      if (newTask.assigneeId) {
        await createNotification(
          newTask.assigneeId,
          "task_assigned",
          `You have been assigned a new task: "${newTask.title}"`,
          newTask.id,
          "task"
        );
        console.log(`Task assignment notification sent to user ${newTask.assigneeId}`);
      }

      // Send real-time notification via WebSocket to all connected clients
      console.log(`Sending task creation WebSocket notification for task ${newTask.id}`);
      if (global.connectedClients) {
        console.log(`Broadcasting to ${global.connectedClients.size} connected clients`);
        global.connectedClients.forEach((client, clientId) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              const notification = {
                type: 'task_created',
                data: {
                  taskId: newTask.id,
                  projectId: newTask.projectId,
                  title: newTask.title,
                  assigneeId: newTask.assigneeId,
                  createdBy: user.id,
                  createdAt: new Date().toISOString()
                }
              };
              console.log(`Sending task creation notification to client ${clientId}:`, notification);
              client.send(JSON.stringify(notification));
            } catch (sendError) {
              console.error(`Error sending task creation notification to client ${clientId}:`, sendError);
            }
          }
        });
      } else {
        console.log('No connected WebSocket clients found');
      }

      return res.status(201).json(newTask);
    } catch (error) {
      console.error("Error creating task:", error);
      return res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Task timer management endpoints
  app.post("/api/tasks/:id/start-timer", requireAuth, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user!.id;

      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Verify user is assigned to this task
      if (task.assigneeId !== userId) {
        return res.status(403).json({ error: "You are not assigned to this task" });
      }

      // Check if user already has a running timer on another task
      const runningTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.assigneeId, userId),
            eq(tasks.isTimerRunning, true)
          )
        );

      if (runningTasks.length > 0 && !runningTasks.some(t => t.id === taskId)) {
        return res.status(400).json({ 
          error: "You already have a timer running on another task. Please pause it first." 
        });
      }

      const now = new Date();
      const [updatedTask] =await db
        .update(tasks)
        .set({
          isTimerRunning: true,
          timerStartTime: now.toISOString(),
          hasBeenStarted: true,
          status: task.status === 'todo' ? 'in_progress' : task.status,
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Update user's current task
      await db
        .update(users)
        .set({
          currentTaskId: taskId,
          taskStartTime: now,
        })
        .where(eq(users.id, user.id));

      // Get project manager for notification
      const [project] = await db
        .select({ managerId: projects.managerId })
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);

      // Notify project manager about task being started
      if (project && project.managerId && project.managerId !== user.id) {
        await createNotification(
          project.managerId,
          "task_updated",
          `${user.name} started working on task: "${task.title}"`,
          taskId,
          "task"
        );
      }

      // Broadcast timer start to all connected clients
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'task_timer_started',
              data: {
                taskId: updatedTask.id,
                isTimerRunning: updatedTask.isTimerRunning,
                timerStartTime: updatedTask.timerStartTime,
                timeSpent: updatedTask.timeSpent,
              }
            }));
          }
        });
      }

      res.json({ success: true, task: updatedTask });
    } catch (error: any) {
      console.error("Error starting task timer:", error);
      res.status(500).json({ error: "Failed to start timer" });
}
  });

  app.post("/api/tasks/:id/pause-timer", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Verify user is assigned to this task
      if (task.assigneeId !== user.id) {
        return res.status(403).json({ error: "You are not assigned to this task" });
      }

      if (!task.isTimerRunning || !task.timerStartTime) {
        return res.status(400).json({ error: "Timer is not running" });
      }

      // Calculate session duration
      const sessionDuration = Math.floor((Date.now() - new Date(task.timerStartTime).getTime()) / 1000);
      const newTimeSpent = (task.timeSpent || 0) + sessionDuration;

      // Clear the timer interval
      if (global.timerIntervals && global.timerIntervals.has(taskId)) {
        clearInterval(global.timerIntervals.get(taskId));
        global.timerIntervals.delete(taskId);
      }

      // Pause the timer and set status to "todo"
      const now = new Date();
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: false,
          timeSpent: newTimeSpent,
          timerStartTime: null,
          status: "todo",
          updatedAt: now
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Clear user's current task
      await db
        .update(users)
        .set({
          currentTaskId: null,
          taskStartTime: null,
        })
        .where(eq(users.id, user.id));

      // Broadcast timer paused event via WebSocket
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            try {
              client.send(JSON.stringify({
                type: 'task_timer_paused',
                data: {
                  taskId: updatedTask.id,
                  isTimerRunning: updatedTask.isTimerRunning,
                  timeSpent: updatedTask.timeSpent,
                  timerStartTime: updatedTask.timerStartTime,
                  status: updatedTask.status,
                  projectId: updatedTask.projectId
                }
              }));
            } catch (error) {
              console.error('Error broadcasting timer pause:', error);
            }
          }
        });
      }

      res.json(updatedTask);
    } catch (error) {
      console.error("Error pausing task timer:", error);
      res.status(500).json({ error: "Failed to pause timer" });
    }
  });

  app.post("/api/tasks/:id/stop-timer", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      // Get task with current timer info
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (task.assigneeId !== user.id) {
        return res.status(403).json({ error: "You can only stop timer for tasks assigned to you" });
      }

      if (!task.isTimerRunning || !task.timerStartTime) {
        return res.status(400).json({ error: "Timer is not running" });
      }

      // Calculate session duration
      const sessionDuration = Math.floor((Date.now() - new Date(task.timerStartTime).getTime()) / 1000);
      const newTimeSpent = (task.timeSpent || 0) + sessionDuration;

      // Update task with accumulated time and pause timer
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: false,
          timeSpent: newTimeSpent,
          timerStartTime: null,
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Clear user's current task
      await db
        .update(users)
        .set({
          currentTaskId: null,
          taskStartTime: null,
        })
        .where(eq(users.id, user.id));

      // Get project manager for notification
      const [project] = await db
        .select({ managerId: projects.managerId })
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);

      if (project && project.managerId && project.managerId !== user.id) {
        const hours = Math.floor(sessionDuration / 3600);
        const minutes = Math.floor((sessionDuration % 3600) / 60);
        const timeWorked = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        await createNotification(
          project.managerId,
          "task_updated",
          `${user.name} stopped working on task: "${task.title}" (worked ${timeWorked})`,
          taskId,
          "task"
        );
      }

      // Broadcast timer stop to all connected clients
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'task_timer_stopped',
              data: {
                taskId: updatedTask.id,
                isTimerRunning: updatedTask.isTimerRunning,
                timeSpent: updatedTask.timeSpent,
                timerStartTime: null,
              }
            }));
          }
        });
      }

      res.json({ success: true, timeSpent: newTimeSpent, task: updatedTask });
    } catch (error) {
      console.error("Error stopping task timer:", error);
      res.status(500).json({ error: "Failed to stop timer" });
    }
  });

  app.post("/api/tasks/:id/submit", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    try {
      // Get task with current timer info
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (task.assigneeId !== user.id) {
        return res.status(403).json({ error: "You can only submit tasks assigned to you" });
      }

      // Calculate final time if timer is running
      let finalTimeSpent = task.timeSpent || 0;
      if (task.isTimerRunning && task.timerStartTime) {
        const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime).getTime()) / 1000);
        finalTimeSpent += elapsedSeconds;
      }

      // Update task as completed and stop timer
      const [updatedTask] = await db
        .update(tasks)
        .set({
          status: "completed",
          progress: 100,
          isTimerRunning: false,
          timerStartTime: null,
          timeSpent: finalTimeSpent,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // Get project info for notifications
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, task.projectId))
        .limit(1);

      // Notify project manager about task completion
      if (project && project.managerId && project.managerId !== user.id) {
        await createNotification(
          project.managerId,
          "task_completed",
          `${user.name} completed task: "${task.title}"`,
          taskId,
          "task"
        );
      }

      // Notify client about task completion if it's a client project
      if (project && project.clientId) {
        await createNotification(
          project.clientId,
          "task_completed",
          `Task completed in your project "${project.name}": "${task.title}"`,
          taskId,
          "task"
        );
      }

      // Broadcast timer stop and task completion to all connected clients
      if (global.connectedClients) {
        global.connectedClients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'task_timer_stopped',
              data: {
                taskId: updatedTask.id,
                isTimerRunning: updatedTask.isTimerRunning,
                timeSpent: updatedTask.timeSpent,
                timerStartTime: null,
              }
            }));
            client.send(JSON.stringify({
              type: 'task_completed',
              data: {
                taskId: updatedTask.id,
                projectId: updatedTask.projectId,
                status: updatedTask.status,
                completedBy: user.id,
                completedAt: new Date().toISOString()
              }
            }));
          }
        });
      }

      res.json({ success: true, task: updatedTask });
    } catch (error) {
      console.error("Error submitting task:", error);
      res.status(500).json({ error: "Failed to submit task" });
    }
  });

  app.put("/api/tasks/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    try {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (task.assigneeId !== user.id) {
        return res.status(403).json({ error: "You can only update status for tasks assigned to you" });
      }

      // Update task status
      await db
        .update(tasks)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating task status:", error);
      res.status(500).json({ error: "Failed to update task status" });
    }
  });

  // Global error handler for API routes
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);

    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(err);
    }

    // Send JSON error response
    res.status(500).json({
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  });

  // WebSocket setup
  // The setupWebSocket function is responsible for initializing the WebSocket server
  // and handling connections, messages, and disconnections.
  // It's crucial for real-time communication features.
  const wss = setupWebSocket(server);
  return server;
}