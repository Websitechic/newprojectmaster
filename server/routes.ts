import { Express, Response, Request, NextFunction } from "express";
import { createServer, Server } from "http";
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
  WorkStatus,
  AbsenceReason,
  clientInvitations,
  notifications
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull } from "drizzle-orm";

// Middleware to check if user is a project manager
const isProjectManager = (req: Express.Request, res: Response, next: NextFunction) => {
  console.log("Auth check - Session:", req.session?.id);
  console.log("Auth check - User:", req.user);

  if (!req.isAuthenticated()) {
    console.log("Authentication failed - no valid session");
    return res.status(401).send("Not authenticated");
  }

  if (req.user!.role !== UserRole.PROJECT_MANAGER) {
    console.log("Authorization failed - not a project manager");
    return res.status(403).send("Only project managers can perform this action");
  }

  next();
};

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const server = createServer(app);

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
  
  // Get staff with their assigned tasks
  app.get("/api/staff-report", isProjectManager, async (req, res) => {
    try {
      // Get all staff members with their current task details
      const staffMembers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          specialization: users.specialization,
          role: users.role,
          status: users.status,
          workStatus: users.workStatus,
          breakStartTime: users.breakStartTime,
          breakCount: users.breakCount,
          absenceReason: users.absenceReason,
          absenceEndDate: users.absenceEndDate,
          currentTaskId: users.currentTaskId,
          taskStartTime: users.taskStartTime,
          lastActive: users.lastActive
        })
        .from(users)
        .where(eq(users.role, "staff"))
        .orderBy(asc(users.name));
      
      // Get all tasks assigned to staff
      const allTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          projectId: tasks.projectId,
          assigneeId: tasks.assigneeId,
          deadline: tasks.deadline,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          projectName: projects.name,
        })
        .from(tasks)
        .where(isNotNull(tasks.assigneeId))
        .innerJoin(projects, eq(tasks.projectId, projects.id));
      
      // Get current project information for each staff member
      const staffCurrentTasks = await Promise.all(
        staffMembers
          .filter(staff => staff.currentTaskId !== null)
          .map(async (staff) => {
            const currentTask = allTasks.find(task => task.id === staff.currentTaskId);
            
            if (!currentTask) return null;
            
            return {
              staffId: staff.id,
              taskId: currentTask.id,
              taskTitle: currentTask.title,
              projectId: currentTask.projectId,
              projectName: currentTask.projectName,
              startTime: staff.taskStartTime,
              // Calculate hours worked based on start time
              hoursWorked: staff.taskStartTime 
                ? Math.round((new Date().getTime() - new Date(staff.taskStartTime).getTime()) / 36000) / 100 
                : 0
            };
          })
      );
      
      // Filter out nulls and organize by staff ID
      const currentTasksByStaffId = staffCurrentTasks
        .filter(Boolean)
        .reduce((acc, task) => {
          if (task) acc[task.staffId] = task;
          return acc;
        }, {} as Record<number, typeof staffCurrentTasks[0]>);
      
      // Prepare break information
      const staffBreakInfo = staffMembers
        .filter(staff => staff.workStatus === WorkStatus.ON_BREAK && staff.breakStartTime)
        .map(staff => {
          // Calculate break duration in minutes
          const breakDuration = staff.breakStartTime 
            ? Math.round((new Date().getTime() - new Date(staff.breakStartTime).getTime()) / 60000)
            : 0;
          
          return {
            staffId: staff.id,
            breakStartTime: staff.breakStartTime,
            breakDuration: breakDuration,
            breakCount: staff.breakCount,
            // Check if break is exceeding one hour (60 minutes)
            breakOvertime: breakDuration > 60
          };
        });
      
      // Organize by staff ID
      const breakInfoByStaffId = staffBreakInfo.reduce((acc, info) => {
        acc[info.staffId] = info;
        return acc;
      }, {} as Record<number, typeof staffBreakInfo[0]>);
      
      // Group tasks by assignee and add categorized information
      const staffReport = staffMembers.map(staff => {
        const assignedTasks = allTasks.filter(task => task.assigneeId === staff.id);
        const currentTask = currentTasksByStaffId[staff.id] || null;
        const breakInfo = breakInfoByStaffId[staff.id] || null;
        
        return {
          ...staff,
          tasks: assignedTasks,
          taskCount: assignedTasks.length,
          activeTasks: assignedTasks.filter(task => task.status !== 'completed').length,
          currentTask,
          breakInfo,
          // Time until absence ends (in days), only if absent
          absentDaysRemaining: staff.workStatus === WorkStatus.ABSENT && staff.absenceEndDate
            ? Math.ceil((new Date(staff.absenceEndDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
            : null
        };
      });
      
      res.json(staffReport);
    } catch (error) {
      console.error("Error generating staff report:", error);
      res.status(500).json({ error: "Failed to generate staff report" });
    }
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
  
  // Delete project (Project Manager only)
  app.delete("/api/projects/:id", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Verify the project exists and is managed by this PM
      const [project] = await db
        .select()
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.managerId, req.user!.id)
        ))
        .limit(1);
      
      if (!project) {
        return res.status(404).json({ 
          error: "Project not found or you don't have permission to delete it" 
        });
      }
      
      // First delete related records to avoid foreign key constraint errors
      // Delete project members
      await db
        .delete(projectMembers)
        .where(eq(projectMembers.projectId, projectId));
        
      // Delete project tasks
      await db
        .delete(tasks)
        .where(eq(tasks.projectId, projectId));
        
      // Delete project messages
      await db
        .delete(messages)
        .where(eq(messages.projectId, projectId));
        
      // Delete client invitations
      await db
        .delete(clientInvitations)
        .where(eq(clientInvitations.projectId, projectId));
        
      // Finally delete the project
      await db
        .delete(projects)
        .where(eq(projects.id, projectId));
      
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
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
    console.log("GET /api/tasks - Session:", req.session?.id);
    console.log("GET /api/tasks - User:", req.user);

    if (!req.isAuthenticated()) {
      console.log("Tasks endpoint - Authentication failed");
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
      const { title, description, status, assigneeId, deadline, projectId } = req.body;

      if (!title || !projectId) {
        return res.status(400).json({ error: "Title and project ID are required" });
      }

      // Convert deadline string to Date if present
      let taskDeadline = null;
      if (deadline) {
        try {
          taskDeadline = new Date(deadline);
          if (isNaN(taskDeadline.getTime())) {
            return res.status(400).json({ error: "Invalid deadline date format" });
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid deadline date format" });
        }
      }

      // Verify project exists
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create the task
      const [newTask] = await db
        .insert(tasks)
        .values({
          title,
          description: description || "",
          status: status || "todo",
          assigneeId: assigneeId ? parseInt(assigneeId) : null,
          projectId,
          deadline: taskDeadline,
          assignedBy: req.user!.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // If there's an assignee, create a notification with enhanced content
      if (newTask.assigneeId) {
        try {
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: newTask.assigneeId,
              type: "task_assigned",
              content: `${req.user!.name} has assigned you a new task: ${newTask.title}`,
              referenceId: newTask.id,
              referenceType: "task",
              createdAt: new Date(),
            })
            .returning();

          // Send notification through SSE if user is connected
          const clientResponse = global.sseClients?.get(newTask.assigneeId);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
              console.log(`Notification sent to user ${newTask.assigneeId} via SSE`);
            } catch (error) {
              console.error(`Error sending SSE notification to user ${newTask.assigneeId}:`, error);
              // Remove the client if there was an error sending
              global.sseClients.delete(newTask.assigneeId);
            }
          } else {
            console.log(`User ${newTask.assigneeId} not connected via SSE`);
          }
        } catch (error) {
          console.error("Error creating or sending notification:", error);
        }
      }

      res.json(newTask);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Update task (Project Manager only)
  app.put("/api/tasks/:id", isProjectManager, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const { title, description, status, assigneeId, deadline } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      // Convert deadline string to Date if present
      let taskDeadline = null;
      if (deadline) {
        try {
          taskDeadline = new Date(deadline);
          if (isNaN(taskDeadline.getTime())) {
            return res.status(400).json({ error: "Invalid deadline date format" });
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid deadline date format" });
        }
      }

      // Verify task exists
      const [existingTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Update the task
      const [updatedTask] = await db
        .update(tasks)
        .set({
          title,
          description: description || "",
          status: status || "todo",
          assigneeId: assigneeId ? parseInt(assigneeId) : null,
          deadline: taskDeadline,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
        .returning();

      // If assignee has changed, create a notification
      if (updatedTask.assigneeId && updatedTask.assigneeId !== existingTask.assigneeId) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: updatedTask.assigneeId,
            type: "task_assigned",
            content: `You have been assigned to task: ${updatedTask.title}`,
            referenceId: updatedTask.id,
            referenceType: "task",
            createdAt: new Date(),
          })
          .returning();

        // Send notification through WebSocket if user is connected
        const ws = global.connectedClients?.get(updatedTask.assigneeId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "notification",
            data: notification
          }));
        }
      }

      return res.json({
        success: true,
        task: updatedTask
      });
    } catch (error) {
      console.error("Error updating task:", error);
      return res.status(500).json({
        error: "Failed to update task",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add new endpoints for notifications
  // Add SSE endpoint with proper error handling
  app.get("/api/notifications/stream", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    // Store the response object in a Map keyed by user ID
    const userId = req.user!.id;
    if (!global.sseClients) {
      global.sseClients = new Map();
    }
    global.sseClients.set(userId, res);

    // Handle client disconnect
    req.on("close", () => {
      global.sseClients.delete(userId);
      console.log(`SSE connection closed for user ${userId}`);
    });

    // Handle errors
    req.on("error", (error) => {
      console.error(`SSE error for user ${userId}:`, error);
      global.sseClients.delete(userId);
      res.end();
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        return;
      }
      res.write(": keepalive\n\n");
    }, 30000);

    // Cleanup on connection close
    req.on("close", () => {
      clearInterval(keepAlive);
    });
  });


  // Get user notifications
  app.get("/api/notifications", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user!.id))
        .orderBy(desc(notifications.createdAt));

      res.json(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.put("/api/notifications/:id/read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const notificationId = parseInt(req.params.id);

      const [updatedNotification] = await db
        .update(notifications)
        .set({ read: true })
        .where(and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, req.user!.id)
        ))
        .returning();

      if (!updatedNotification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      res.json(updatedNotification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  // Messages
  // Get messages by type (team/client)
  app.get("/api/projects/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const { type } = req.query;

    let query = db
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId));

    if (type) {
      query = query.where(eq(messages.type, type as string));
    }

    const projectMessages = await query.orderBy(desc(messages.createdAt));
    res.json(projectMessages);
  });

  // Send a message
  app.post("/api/projects/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const { content, type } = req.body;

    const [message] = await db
      .insert(messages)
      .values({
        content,
        type,
        projectId,
        userId: req.user!.id,
        createdAt: new Date()
      })
      .returning();

    res.json(message);
  });

  // Upload resource
  app.post("/api/projects/:id/resources", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    // Handle file upload
    const projectId = parseInt(req.params.id);
    const file = req.files?.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const [resource] = await db
      .insert(resources)
      .values({
        name: file.name,
        type: file.mimetype,
        size: file.size,
        path: `/uploads/${projectId}/${file.name}`,
        projectId,
        uploadedBy: req.user!.id,
        createdAt: new Date()
      })
      .returning();

    res.json(resource);
  });

  // Get resources
  app.get("/api/projects/:id/resources", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const projectResources = await db
      .select()
      .from(resources)
      .where(eq(resources.projectId, projectId))
      .orderBy(desc(resources.createdAt));

    res.json(projectResources);
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