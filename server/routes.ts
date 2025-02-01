import { Express, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./websocket";
import { setupAuth } from "./auth";
import { db } from "@db";
import {
  projects,
  tasks,
  messages,
  projectMembers,
  performance,
  users,
  UserRole,
  clientInvitations
} from "@db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";

// Middleware to check if user is a project manager
const isProjectManager = (req: Express.Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }

  if (req.user!.role !== UserRole.PROJECT_MANAGER) {
    return res.status(403).send("Only project managers can perform this action");
  }

  next();
};

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  setupWebSocket(wss);

  // Get available clients (for project managers)
  app.get("/api/clients", isProjectManager, async (req, res) => {
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

  // Get available staff by specialization (for project managers)
  app.get("/api/staff", isProjectManager, async (req, res) => {
    const { specialization } = req.query;
    let query = db
      .select()
      .from(users)
      .where(eq(users.role, "staff"));

    if (specialization) {
      query = query.where(eq(users.specialization, specialization as string));
    }

    const staff = await query.orderBy(desc(users.lastActive));
    res.json(staff);
  });

  // Get project by ID
  app.get("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.id);
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Get project tasks
  app.get("/api/projects/:id/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.id);
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

  // Get project members
  app.get("/api/projects/:id/members", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.id);
      const members = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.invitationStatus, "accepted")
        ));

      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Failed to fetch project members" });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    let projectsList = [];

    try {
      if (user.role === "client") {
        // Clients see their own projects
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, user.id))
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "project_manager") {
        // Project managers see projects they manage
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.managerId, user.id))
          .orderBy(desc(projects.updatedAt));
      } else {
        // Staff see projects they're invited to
        const memberProjects = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.userId, user.id),
            eq(projectMembers.invitationStatus, "accepted")
          ));

        if (memberProjects.length > 0) {
          const projectIds = memberProjects.map(pm => pm.projectId).filter(id => id !== null);
          projectsList = await db
            .select()
            .from(projects)
            .where(inArray(projects.id, projectIds))
            .orderBy(desc(projects.updatedAt));
        }
      }

      res.json(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Create Project (Project Manager only)
  app.post("/api/projects", isProjectManager, async (req, res) => {
    try {
      const { clientId, pendingClientEmail, startDate, endDate, ...projectData } = req.body;

      if (!clientId && !pendingClientEmail) {
        return res.status(400).json({ error: "Either clientId or pendingClientEmail must be provided" });
      }

      if (!projectData.type) {
        return res.status(400).json({ error: "Project type is required" });
      }

      // Parse dates
      let parsedStartDate: Date | null = null;
      let parsedEndDate: Date | null = null;

      try {
        parsedStartDate = startDate ? new Date(startDate) : null;
        parsedEndDate = endDate ? new Date(endDate) : null;
      } catch (error) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (!parsedStartDate || !parsedEndDate) {
        return res.status(400).json({ error: "Valid start and end dates are required" });
      }

      if (parsedStartDate > parsedEndDate) {
        return res.status(400).json({ error: "Start date cannot be after end date" });
      }

      let newProject;

      if (clientId) {
        // Create project with existing client
        [newProject] = await db
          .insert(projects)
          .values({
            ...projectData,
            clientId,
            managerId: req.user!.id,
            status: "pending",
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      } else {
        // Create project with pending client email
        [newProject] = await db
          .insert(projects)
          .values({
            ...projectData,
            pendingClientEmail,
            managerId: req.user!.id,
            status: "pending",
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      }

      res.json(newProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Invite staff to project (Project Manager only)
  app.post("/api/projects/:id/invite", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { userId } = req.body;

      // Verify user is a staff member
      const [staff] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          eq(users.role, "staff")
        ))
        .limit(1);

      if (!staff) {
        return res.status(400).json({ error: "Invalid staff member" });
      }

      // Check if already invited
      const [existingInvite] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        ))
        .limit(1);

      if (existingInvite) {
        return res.status(400).json({ error: "User already invited to this project" });
      }

      const [invitation] = await db
        .insert(projectMembers)
        .values({
          projectId,
          userId,
          invitedBy: req.user!.id,
          invitationStatus: "pending"
        })
        .returning();

      res.json(invitation);
    } catch (error) {
      console.error("Error inviting staff:", error);
      res.status(500).json({ error: "Failed to invite staff member" });
    }
  });

  // Accept/decline project invitation (Staff only)
  app.post("/api/projects/:id/respond", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can respond to invitations");
    }

    try {
      const projectId = parseInt(req.params.id);
      const { accept } = req.body;

      const [invitation] = await db
        .update(projectMembers)
        .set({
          invitationStatus: accept ? "accepted" : "declined",
          joinedAt: accept ? new Date() : null
        })
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, req.user!.id),
          eq(projectMembers.invitationStatus, "pending")
        ))
        .returning();

      res.json(invitation);
    } catch (error) {
      console.error("Error responding to invitation:", error);
      res.status(500).json({ error: "Failed to respond to invitation" });
    }
  });

  // Tasks
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      let userTasks = [];
      if (req.user!.role === "staff") {
        // Staff see tasks assigned to them
        userTasks = await db
          .select()
          .from(tasks)
          .where(eq(tasks.assigneeId, req.user!.id))
          .orderBy(desc(tasks.updatedAt));
      } else if (req.user!.role === "project_manager") {
        // Project managers see all tasks in their projects
        const managedProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.managerId, req.user!.id));

        const projectIds = managedProjects.map(p => p.id);
        if (projectIds.length > 0) {
          userTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        }
      }

      res.json(userTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Create Task (Project Manager only)
  app.post("/api/tasks", isProjectManager, async (req, res) => {
    try {
      const [newTask] = await db
        .insert(tasks)
        .values({
          ...req.body,
          assignedBy: req.user!.id,
          status: "todo",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newTask);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Update task status/progress (Staff only)
  app.put("/api/tasks/:id/progress", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can update task progress");
    }

    try {
      const taskId = parseInt(req.params.id);
      const { status, progress } = req.body;

      const [updatedTask] = await db
        .update(tasks)
        .set({
          status,
          progress,
          updatedAt: new Date()
        })
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, req.user!.id)
        ))
        .returning();

      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Messages
  app.get("/api/projects/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const projectMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(desc(messages.createdAt));

    res.json(projectMessages);
  });

  // Performance
  app.get("/api/performance", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const userPerformance = await db
      .select()
      .from(performance)
      .where(eq(performance.userId, req.user!.id))
      .orderBy(desc(performance.date))
      .limit(7);

    res.json(userPerformance);
  });

  return server;
}