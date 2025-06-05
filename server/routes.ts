import { Express, Response, Request, NextFunction } from "express";
import express from "express";
import { createServer, Server } from "http";
import { setupWebSocket } from "./websocket";
import { setupAuth } from "./auth";
import { db } from "@db";
import { breakScheduler } from "./break-scheduler";
import multer from "multer";
import path from "path";
import fs from "fs";
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
  UserStatus,
  clientInvitations,
  notifications,
  projectPlans,
  deliverables,
  leaveApplications,
  directMessages
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull, or, count } from "drizzle-orm";

// Middleware to check if user is a project manager
const isProjectManager = (req: Express.Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (req.user!.role !== UserRole.PROJECT_MANAGER) {
    return res.status(403).json({ error: "Only project managers can perform this action" });
  }

  next();
};

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

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

  // Update existing users' break times (one-time setup)
  app.post("/api/setup-break-times", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "project_manager") {
      return res.status(403).send("Only project managers can perform this action");
    }

    try {
      // Update specific users' break times
      await db.update(users)
        .set({ breakOneTime: "22:00", breakTwoTime: "12:00" })
        .where(eq(users.username, "testpm"));

      await db.update(users)
        .set({ breakOneTime: "12:30", breakTwoTime: "15:00" })
        .where(eq(users.username, "testuser"));

      await db.update(users)
        .set({ breakOneTime: "13:00", breakTwoTime: "16:00" })
        .where(eq(users.username, "Staff1"));

      res.json({ message: "Break times updated successfully for existing users" });
    } catch (error) {
      console.error("Error updating break times:", error);
      res.status(500).json({ error: "Failed to update break times" });
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

  // Debug endpoint to check project memberships
  app.get("/api/debug/project-memberships", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const allProjects = await db.select().from(projects);
      const allMembers = await db.select().from(projectMembers);
      const allUsers = await db.select({
        id: users.id,
        name: users.name,
        role: users.role
      }).from(users);

      res.json({
        projects: allProjects,
        projectMembers: allMembers,
        users: allUsers,
        currentUser: req.user
      });
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({ error: "Failed to fetch debug data" });
    }
  });

  // Test endpoint to add current staff member to the first available project
  app.post("/api/debug/add-me-to-project", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can use this endpoint");
    }

    try {
      // Find the first project
      const [firstProject] = await db.select().from(projects).limit(1);

      if (!firstProject) {
        return res.status(404).json({ error: "No projects found to join" });
      }

      // Check if already a member
      const [existingMember] = await db
        .select()
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, firstProject.id),
          eq(projectMembers.userId, req.user!.id)
        ))
        .limit(1);

      if (existingMember) {
        return res.json({ 
          message: "Already a member of this project",
          project: firstProject,
          membership: existingMember
        });
      }

      // Add the staff member to the project
      const [newMember] = await db
        .insert(projectMembers)
        .values({
          projectId: firstProject.id,
          userId: req.user!.id,
          invitedBy: firstProject.managerId,
          invitationStatus: "accepted",
          joinedAt: new Date()
        })
        .returning();

      res.json({
        message: "Successfully added to project",
        project: firstProject,
        membership: newMember
      });
    } catch (error) {
      console.error("Error adding staff to project:", error);
      res.status(500).json({ error: "Failed to add staff to project" });
    }
  });

  // Get staff with their assigned tasks
  app.get("/api/staff-report", isProjectManager, async (req, res) => {
    try {
      // First update staff status based on approved leave applications
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get all approved leave applications
      const approvedLeaves = await db
        .select()
        .from(leaveApplications)
        .where(eq(leaveApplications.status, "approved"));

      // Update staff status based on current leave applications
      for (const leave of approvedLeaves) {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const leaveStartDate = new Date(leaveStart.getFullYear(), leaveStart.getMonth(), leaveStart.getDate());
        const leaveEndDate = new Date(leaveEnd.getFullYear(), leaveEnd.getMonth(), leaveEnd.getDate());

        if (today >= leaveStartDate && today <= leaveEndDate) {
          // Staff should be on leave
          await db
            .update(users)
            .set({
              workStatus: WorkStatus.ABSENT,
              absenceReason: 'leave',
              absenceEndDate: leaveEnd,
              lastActive: now
            })
            .where(eq(users.id, leave.userId));

          console.log(`Updated user ${leave.userId} to absent status for approved leave`);
        } else if (today > leaveEndDate) {
          // Leave has ended, staff should be active
          await db
            .update(users)
            .set({
              workStatus: WorkStatus.ACTIVE,
              absenceReason: null,
              absenceEndDate: null,
              lastActive: now
            })
            .where(eq(users.id, leave.userId));

          console.log(`Updated user ${leave.userId} back to active status - leave ended`);
        }
      }

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

      // Get all tasks assigned to staff with additional timer and hours information
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
          workingHours: tasks.workingHours,
          timeSpent: tasks.timeSpent,
          isTimerRunning: tasks.isTimerRunning,
          timerStartTime: tasks.timerStartTime,
        })
        .from(tasks)
        .where(isNotNull(tasks.assigneeId))
        .innerJoin(projects, eq(tasks.projectId, projects.id));

      // Get currently engaged staff - those with running task timers
      const engagedStaffTasks = allTasks
        .filter(task => task.isTimerRunning && task.timerStartTime)
        .map(task => {
          const staff = staffMembers.find(s => s.id === task.assigneeId);
          if (!staff) return null;

          // Calculate current session hours (from timer start)
          const currentSessionHours = task.timerStartTime 
            ? Math.round((new Date().getTime() - new Date(task.timerStartTime).getTime()) / 36000) / 100 
            : 0;

          // Calculate total hours spent (including previous sessions)
          const totalHoursSpent = ((task.timeSpent || 0) + (currentSessionHours * 3600)) / 3600;

          return {
            staffId: staff.id,
            taskId: task.id,
            taskTitle: task.title,
            projectId: task.projectId,
            projectName: task.projectName,
            assignedHours: task.workingHours || 0,
            totalHoursSpent: Math.round(totalHoursSpent * 100) / 100,
            currentSessionHours: Math.round(currentSessionHours * 100) / 100,
            timerStartTime: task.timerStartTime,
            isTimerRunning: task.isTimerRunning
          };
        })
        .filter(Boolean);

      // Organize engaged tasks by staff ID
      const engagedTasksByStaffId = engagedStaffTasks.reduce((acc, task) => {
        if (task) acc[task.staffId] = task;
        return acc;
      }, {} as Record<number, typeof engagedStaffTasks[0]>);

      // Prepare break information
      const staffBreakInfo = staffMembers
        .filter(staff => staff.workStatus === WorkStatus.ON_BREAK && staff.breakStartTime)
        .map(staff => {
          // Calculate break duration in minutes
          const breakDuration = staff.breakStartTime 
            ? Math.round((new Date().getTime() - new Date(staff.breakStartTime).getTime()) / 60000)
            : 0;

          // Limit display duration to maximum 60 minutes for UI purposes
          const displayDuration = Math.min(breakDuration, 60);

          return {
            staffId: staff.id,
            breakStartTime: staff.breakStartTime,
            breakDuration: displayDuration,
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
        const engagedTask = engagedTasksByStaffId[staff.id] || null;
        const breakInfo = breakInfoByStaffId[staff.id] || null;

        return {
          ...staff,
          tasks: assignedTasks,
          taskCount: assignedTasks.length,
          activeTasks: assignedTasks.filter(task => task.status !== 'completed').length,
          engagedTask, // Current task with running timer
          breakInfo,
          // Determine if staff is currently engaged (has running timer)
          isCurrentlyEngaged: !!engagedTask,
          // Time until absence ends (in days), only if absent
          absentDaysRemaining: staff.workStatus === WorkStatus.ABSENT && staff.absenceEndDate
            ? Math.ceil((new Date(staff.absenceEndDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
            : null
        };
      });

      res.json(staffReport);
    } catch (error) {
      console.error("Error generating staff report:", error);
      res.status(500).json({ 
        error: "Failed to generate staff report",
        details: error instanceof Error ? error.message : String(error)
      });
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

  // Update project (Project Manager only)
  app.put("/api/projects/:id", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      console.log("Updating project:", projectId, "with data:", req.body);

      const { 
        name, 
        description, 
        category, 
        clientId, 
        pendingClientEmail, 
        teamMembers, 
        startDate, 
        endDate 
      } = req.body;

      // Validate required fields
      if (!name || !category || !startDate || !endDate) {
        return res.status(400).json({ 
          error: "Name, category, start date, and end date are required" 
        });
      }

      // Verify the project exists and is managed by this PM
      const [existingProject] = await db
        .select()
        .from(projects)
        .where(and(
          eq(projects.id, projectId),
          eq(projects.managerId, req.user!.id)
        ))
        .limit(1);

      if (!existingProject) {
        return res.status(404).json({ 
          error: "Project not found or you don't have permission to edit it" 
        });
      }

      // Parse and validate dates
      let parsedStartDate: Date | null = null;
      let parsedEndDate: Date | null = null;

      try {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);

        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          throw new Error("Invalid date format");
        }

        if (parsedStartDate > parsedEndDate) {
          return res.status(400).json({ error: "Start date cannot be after end date" });
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      // Update the project
      const [updatedProject] = await db
        .update(projects)
        .set({
          name: name.trim(),
          description: description?.trim() || null,
          type: "web_development", // Keep default type
          category,
          clientId: clientId && clientId !== 0 ? clientId : null,
          pendingClientEmail: (!clientId || clientId === 0) && pendingClientEmail ? pendingClientEmail.trim() : null,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      // Update team members if provided
      if (teamMembers && Array.isArray(teamMembers)) {
        // Remove existing team members
        await db
          .delete(projectMembers)
          .where(eq(projectMembers.projectId, projectId));

        // Add new team members
        if (teamMembers.length > 0) {
          await db.insert(projectMembers).values(
            teamMembers.map((memberId: number) => ({
              projectId,
              userId: memberId,
              role: "member" as const,
              invitationStatus: "accepted" as const,
              invitedBy: req.user!.id,
              joinedAt: new Date(),
            }))
          );
        }
      }

      console.log("Project updated successfully:", updatedProject);
      res.json(updatedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ 
        error: "Failed to update project",
        details: error instanceof Error ? error.message : String(error)
      });
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
        // Staff see projects they're invited to and have accepted
        console.log(`Fetching projects for staff user ${user.id} (${user.name})`);

        // First, check ALL memberships for this user (not just accepted ones)
        const allMemberships = await db
          .select()
          .from(projectMembers)
          .where(eq(projectMembers.userId, user.id));

        console.log(`Found ${allMemberships.length} total project memberships for user ${user.id}:`, allMemberships);

        const memberProjects = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.userId, user.id),
            eq(projectMembers.invitationStatus, "accepted")
          ));

        console.log(`Found ${memberProjects.length} accepted project memberships for user ${user.id}:`, memberProjects);

        if (memberProjects.length > 0) {
          const projectIds = memberProjects.map(pm => pm.projectId).filter(id => id !== null);
          console.log(`Project IDs for user ${user.id}:`, projectIds);

          projectsList = await db
            .select()
            .from(projects)
            .where(inArray(projects.id, projectIds))
            .orderBy(desc(projects.updatedAt));

          console.log(`Final projects list for user ${user.id}:`, projectsList);
        } else {
          console.log(`No accepted project memberships found for user ${user.id}`);

          // Check if there are any projects at all
          const totalProjects = await db.select().from(projects);
          console.log(`Total projects in database: ${totalProjects.length}`);

          if (totalProjects.length > 0) {
            console.log("Available projects:", totalProjects.map(p => ({ id: p.id, name: p.name })));
            console.log("Hint: Use POST /api/debug/add-me-to-project to join the first project");
          }
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
      const { 
        name, 
        description, 
        type,
        category, 
        clientId, 
        teamMembers, 
        startDate, 
        endDate 
      } = req.body;

      console.log("Creating project with data:", req.body);

      // Validate required fields
      if (!name || !category || !startDate || !endDate) {
        return res.status(400).json({ error: "Name, category, start date, and end date are required" });
      }

      if (!type) {
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
            name,
            description,
            type,
            category,
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
        // If the client ID is not present, return an error.
        return res.status(400).json({ error: "Client ID is required" });
      }

      // If team members were specified in the request, invite them and send notifications
      if (teamMembers && Array.isArray(teamMembers)) {
        for (const memberId of teamMembers) {
          try {
            // Add team member to project with accepted status (auto-accept for staff)
            await db
              .insert(projectMembers)
              .values({
                projectId: newProject.id,
                userId: memberId,
                invitedBy: req.user!.id,
                invitationStatus: "accepted",
                joinedAt: new Date()
              });

            // Create notification for the team member
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: memberId,
                type: "task_assigned", // Using existing type
                content: `You have been added to the project: ${newProject.name}`,
                referenceId: newProject.id,
                referenceType: "project",
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(memberId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
                console.log(`Project addition notification sent to user ${memberId} via SSE`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${memberId}:`, error);
                global.sseClients.delete(memberId);
              }
            }
          } catch (error) {
            console.error(`Error adding team member ${memberId} to project:`, error);
            // Continue with other members even if one fails
          }
        }
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

      // Get project details for notification
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      // Create notification for the invited staff member
      const [notification] = await db
        .insert(notifications)
        .values({
          userId,
          type: "task_assigned", // Using existing type, could add new type for project invitations
          content: `You have been invited to join project: ${project?.name || 'Unknown Project'}`,
          referenceId: projectId,
          referenceType: "project",
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if user is connected
      const clientResponse = global.sseClients?.get(userId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
          console.log(`Project invitation notification sent to user ${userId} via SSE`);
        } catch (error) {
          console.error(`Error sending SSE notification to user ${userId}:`, error);
          global.sseClients.delete(userId);
        }
      } else {
        console.log(`User ${userId} not connected via SSE for project invitation`);
      }

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
      const { title, description, status, assigneeId, deadline, projectId, startDate, workingHours } = req.body;

      if (!title || !projectId) {
        return res.status(400).json({ error: "Title and project ID are required" });
      }

      // Convert startDate and deadline strings to Date if present
      let taskStartDate = null;
      let taskDeadline = null;

      if (startDate) {
        try {
          taskStartDate = new Date(startDate);
          if (isNaN(taskStartDate.getTime())) {
            return res.status(400).json({ error: "Invalid start date format" });
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid start date format" });
        }
      }

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

      // Validate working hours if provided
      let taskWorkingHours = null;
      if (workingHours !== null && workingHours !== undefined) {
        taskWorkingHours = parseInt(workingHours);
        if (isNaN(taskWorkingHours) || taskWorkingHours < 1) {
          return res.status(400).json({ error: "Working hours must be a positive number" });
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
          startDate: taskStartDate,
          workingHours: taskWorkingHours
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
      const { title, description, status, assigneeId, deadline, startDate, workingHours } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      // Convert startDate and deadline strings to Date if present
      let taskStartDate = null;
      let taskDeadline = null;

      if (startDate) {
        try {
          taskStartDate = new Date(startDate);
          if (isNaN(taskStartDate.getTime())) {
            return res.status(400).json({ error: "Invalid start date format" });
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid start date format" });
        }
      }

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

      // Validate working hours if provided
      let taskWorkingHours = null;
      if (workingHours !== null && workingHours !== undefined) {
        taskWorkingHours = parseInt(workingHours);
        if (isNaN(taskWorkingHours) || taskWorkingHours < 1) {
          return res.status(400).json({ error: "Working hours must be a positive number" });
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
          startDate: taskStartDate,
          workingHours: taskWorkingHours
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

  // Start task timer (Staff only)
  app.post("/api/tasks/:id/start-timer", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can start timers");
    }

    try {
      const taskId = parseInt(req.params.id);

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, req.user!.id)
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
          eq(tasks.assigneeId, req.user!.id),
          eq(tasks.isTimerRunning, true)
        ))
        .limit(1);

      if (runningTask && runningTask.id !== taskId) {
        return res.status(400).json({ 
          error: "Stop the current task timer before starting a new one." 
        });
      }

      // Start the timer
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: true,
          timerStartTime: new Date(),
          hasBeenStarted: true,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error) {
      console.error("Error starting timer:", error);
      res.status(500).json({ error: "Failed to start timer" });
    }
  });

  // Pause task timer (Staff only)
  app.post("/api/tasks/:id/pause-timer", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can pause timers");
    }

    try {
      const taskId = parseInt(req.params.id);

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, req.user!.id),
          eq(tasks.isTimerRunning, true)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found, not assigned to you, or timer not running" });
      }

      // Calculate elapsed time
      const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime!).getTime()) / 1000);
      const newTimeSpent = (task.timeSpent || 0) + elapsedSeconds;

      // Pause the timer
      const [updatedTask] = await db
        .update(tasks)
        .set({
          isTimerRunning: false,
          timerStartTime: null,
          timeSpent: newTimeSpent,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error) {
      console.error("Error pausing timer:", error);
      res.status(500).json({ error: "Failed to pause timer" });
    }
  });

  // Submit task (Staff only)
  app.post("/api/tasks/:id/submit", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can submit tasks");
    }

    try {
      const taskId = parseInt(req.params.id);

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, req.user!.id)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found or not assigned to you" });
      }

      if (!task.hasBeenStarted) {
        return res.status(400).json({ error: "Task must be started before it can be submitted" });
      }

      // Update task status to review
      const [updatedTask] = await db
        .update(tasks)
        .set({
          status: "review",
          isTimerRunning: false,
          timerStartTime: null,
          updatedAt: new Date()
        })
        .where(eq(tasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error) {
      console.error("Error submitting task:", error);
      res.status(500).json({ error: "Failed to submit task" });
    }
  });

  // Update task status (Staff only)
  app.put("/api/tasks/:id/status", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).send("Only staff members can update task status");
    }

    try {
      const taskId = parseInt(req.params.id);
      const { status } = req.body;

      // Validate status
      const validStatuses = ["todo", "in_progress", "review", "completed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      // Check if task exists and is assigned to this staff member
      const [task] = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.assigneeId, req.user!.id)
        ))
        .limit(1);

      if (!task) {
        return res.status(404).json({ error: "Task not found or not assigned to you" });
      }

      // Update task status
      const updateData: any = {
        status,
        updatedAt: new Date()
      };

      // If setting to completed or review, stop the timer
      if (status === "completed" || status === "review") {
        updateData.isTimerRunning = false;
        updateData.timerStartTime = null;

        // If timer was running, add elapsed time
        if (task.isTimerRunning && task.timerStartTime) {
          const elapsedSeconds = Math.floor((new Date().getTime() - new Date(task.timerStartTime).getTime()) / 1000);
          updateData.timeSpent = (task.timeSpent || 0) + elapsedSeconds;
        }
      }

      // If changing from completed back to another status, allow it
      // Staff can now modify completed tasks to any other status

      const [updatedTask] = await db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task status:", error);
      res.status(500).json({ error: "Failed to update task status" });
    }
  });

  // Delete task (Project Manager only)
  app.delete("/api/tasks/:id", isProjectManager, async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);

      // Verify task exists
      const [existingTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Delete the task
      await db
        .delete(tasks)
        .where(eq(tasks.id, taskId));

      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Add new endpoints for notifications
  // Add SSE endpoint with proper error handling
  app.get("/api/notifications/stream", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      console.log("SSE connection attempted without authentication");
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.user!.id;
    console.log(`SSE connection established for user ${userId}`);

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering

    // Update user's last active time and status
    db.update(users)
      .set({ 
        lastActive: new Date(),
        status: UserStatus.ONLINE 
      })
      .where(eq(users.id, userId))
      .catch(err => console.error("Error updating user activity status:", err));

    // Send initial connection message
    try {
      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    } catch (error) {
      console.error(`Error sending initial SSE message to user ${userId}:`, error);
      return;
    }

    // Store the response object in a Map keyed by user ID
    if (!global.sseClients) {
      global.sseClients = new Map();
    }
    global.sseClients.set(userId, res);

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        global.sseClients.delete(userId);
        return;
      }
      try {
        res.write(": keepalive\n\n");
      } catch (error) {
        console.error(`Error sending keepalive to user ${userId}:`, error);
        clearInterval(keepAlive);
        global.sseClients.delete(userId);
        res.end();
      }
    }, 30000);

    // Handle client disconnect
    const cleanup = () => {
      clearInterval(keepAlive);
      global.sseClients?.delete(userId);
      console.log(`SSE connection closed for user ${userId}`);

      // When SSE connection closes, update user status to idle
      db.update(users)
        .set({ 
          lastActive: new Date(),
          status: UserStatus.IDLE
        })
        .where(eq(users.id, userId))
        .catch(err => console.error("Error updating user status on SSE disconnect:", err));
    };

    req.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("close", cleanup);
    res.on("error", (error) => {
      console.error(`SSE error for user ${userId}:`, error);
      cleanup();
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

    try {
      const projectId = parseInt(req.params.id);

      // For now, return empty array as resources table doesn't exist yet
      // This can be implemented when file upload functionality is added
      res.json([]);
    } catch (error) {
      console.error("Error fetching project resources:", error);
      res.status(500).json({ error: "Failed to fetch project resources" });
    }
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

  // User Status APIs

  // Heartbeat endpoint to update user's last active time
  app.post("/api/user/heartbeat", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      console.log("Heartbeat attempted without authentication");
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      await db.update(users)
        .set({ 
          lastActive: new Date(),
          status: UserStatus.ONLINE 
        })
        .where(eq(users.id, req.user!.id));

      return res.json({ status: "success" });
    } catch (error) {
      console.error("Error updating user heartbeat:", error);
      return res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Get user status (can be used to get status of a single user)
  app.get("/api/users/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = parseInt(req.params.id);

      const [user] = await db.select({
        id: users.id,
        name: users.name,
        status: users.status,
        lastActive: users.lastActive,
        role: users.role,
        workStatus: users.workStatus
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user is online but inactive for 10+ minutes
      if (user.status === UserStatus.ONLINE && user.lastActive) {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

        if (new Date(user.lastActive) < tenMinutesAgo) {
          // Update user status to idle
          await db.update(users)
            .set({ status: UserStatus.IDLE })
            .where(eq(users.id, userId));

          user.status = UserStatus.IDLE;
        }
      }

      return res.json(user);
    } catch (error) {
      console.error("Error fetching user status:", error);
      return res.status(500).json({ error: "Failed to fetch user status" });
    }
  });

  // Update user status (to manually set status)
  app.put("/api/users/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { status } = req.body;

      // Validate status
      if (!Object.values(UserStatus).includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedUser] = await db.update(users)
        .set({ 
          status,
          lastActive: new Date() 
        })
        .where(eq(users.id, req.user!.id))
        .returning();

      return res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user status:", error);
      return res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Project Plans API Routes

  // Get project plans for a project
  app.get("/api/projects/:id/plans", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.id);

      const plans = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId))
        .orderBy(desc(projectPlans.updatedAt));

      res.json(plans);
    } catch (error) {
      console.error("Error fetching project plans:", error);
      res.status(500).json({ error: "Failed to fetch project plans" });
    }
  });

  // Get specific project plan with deliverables
  app.get("/api/project-plans/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const planId = parseInt(req.params.id);

      const [plan] = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "Project plan not found" });
      }

      const planDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.projectPlanId, planId))
        .orderBy(asc(deliverables.order));

      res.json({ ...plan, deliverables: planDeliverables });
    } catch (error) {
      console.error("Error fetching project plan:", error);
      res.status(500).json({ error: "Failed to fetch project plan" });
    }
  });

  // Create project plan (Project Manager only)
  app.post("/api/projects/:id/plans", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { name, description, startDate, endDate, deliverables: planDeliverables } = req.body;

      console.log("Creating project plan for project:", projectId);
      console.log("Plan data:", { name, description, startDate, endDate, deliverables: planDeliverables });

      if (!name) {
        return res.status(400).json({ error: "Plan name is required" });
      }

      if (!planDeliverables || !Array.isArray(planDeliverables) || planDeliverables.length === 0) {
        return res.status(400).json({ error: "At least one deliverable is required" });
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
        parsedDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: "Invalid end date format" });
        }
      }

      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        return res.status(400).json({ error: "Start date cannot be after end date" });
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
          createdBy: req.user!.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create deliverables if provided
      if (planDeliverables && Array.isArray(planDeliverables) && planDeliverables.length > 0) {
        const deliverableValues = planDeliverables.map((deliverable: any, index: number) => {
          const deliverableStartDate = new Date(deliverable.startDate);
          const deliverableEndDate = new Date(deliverable.endDate);

          if (isNaN(deliverableStartDate.getTime()) || isNaN(deliverableEndDate.getTime())) {
            throw new Error(`Invalid date format for deliverable: ${deliverable.name}`);
          }

          const duration = Math.ceil((deliverableEndDate.getTime() - deliverableStartDate.getTime()) / (1000 * 3600 * 24));

          return {
            projectPlanId: newPlan.id,
            name: deliverable.name,
            description: deliverable.description || "",
            startDate: deliverableStartDate,
            endDate: deliverableEndDate,
            duration,
            order: index,
            assigneeId: deliverable.assigneeId ? parseInt(deliverable.assigneeId) : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        await db.insert(deliverables).values(deliverableValues);
      }

      res.json(newPlan);
    } catch (error) {
      console.error("Error creating project plan:", error);
      res.status(500).json({ 
        error: "Failed to create project plan",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update project plan (Project Manager only)
  app.put("/api/project-plans/:id", isProjectManager, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const { name, description, startDate, endDate, status, deliverables: planDeliverables } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Plan name is required" });
      }

      // Verify plan exists
      const [existingPlan] = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.id, planId))
        .limit(1);

      if (!existingPlan) {
        return res.status(404).json({ error: "Project plan not found" });
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
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          status: status || "draft",
          updatedAt: new Date(),
        })
        .where(eq(projectPlans.id, planId))
        .returning();

      // Update deliverables if provided
      if (planDeliverables && Array.isArray(planDeliverables)) {
        // Delete existing deliverables
        await db
          .delete(deliverables)
          .where(eq(deliverables.projectPlanId, planId));

        // Create new deliverables
        if (planDeliverables.length > 0) {
          const deliverableValues = planDeliverables.map((deliverable: any, index: number) => {
            const deliverableStartDate = new Date(deliverable.startDate);
            const deliverableEndDate = new Date(deliverable.endDate);

            if (isNaN(deliverableStartDate.getTime()) || isNaN(deliverableEndDate.getTime())) {
              throw new Error(`Invalid date format for deliverable: ${deliverable.name}`);
            }

            const duration = Math.ceil((deliverableEndDate.getTime() - deliverableStartDate.getTime()) / (1000 * 3600 * 24));

            return {
              projectPlanId: planId,
              name: deliverable.name,
              description: deliverable.description || "",
              startDate: deliverableStartDate,
              endDate: deliverableEndDate,
              duration,
              order: index,
              assigneeId: deliverable.assigneeId ? parseInt(deliverable.assigneeId) : null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          });

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

  // Delete project plan (Project Manager only)
  app.delete("/api/project-plans/:id", isProjectManager, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);

      // Verify plan exists
      const [plan] = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.id, planId))
        .limit(1);

      if (!plan) {
        return res.status(404).json({ error: "Project plan not found" });
      }

      // Delete deliverables first
      await db
        .delete(deliverables)
        .where(eq(deliverables.projectPlanId, planId));

      // Delete project plan
      await db
        .delete(projectPlans)
        .where(eq(projectPlans.id, planId));

      res.json({ message: "Project plan deleted successfully" });
    } catch (error) {
      console.error("Error deleting project plan:", error);
      res.status(500).json({ error: "Failed to delete project plan" });
    }
  });

  // Update deliverable status
  app.put("/api/deliverables/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const deliverableId = parseInt(req.params.id);
      const { status } = req.body;

      const validStatuses = ["pending", "in_progress", "completed", "overdue"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedDeliverable] = await db
        .update(deliverables)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(deliverables.id, deliverableId))
        .returning();

      if (!updatedDeliverable) {
        return res.status(404).json({ error: "Deliverable not found" });
      }

      res.json(updatedDeliverable);
    } catch (error) {
      console.error("Error updating deliverable status:", error);
      res.status(500).json({ error: "Failed to update deliverable status" });
    }
  });

  // Get active break sessions (for debugging/monitoring)
  app.get("/api/break-status", isProjectManager, async (req, res) => {
    try {
      const activeBreaks = breakScheduler.getActiveBreaks();
      res.json(activeBreaks);
    } catch (error) {
      console.error("Error fetching break status:", error);
      res.status(500).json({ error: "Failed to fetch break status" });
    }
  });

  // Leave Applications API Routes

  // Get leave applications for the current user (Staff only)
  app.get("/api/leave-applications", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).json({ error: "Only staff members can view leave applications" });
    }

    try {
      const applications = await db
        .select()
        .from(leaveApplications)
        .where(eq(leaveApplications.userId, req.user!.id))
        .orderBy(desc(leaveApplications.createdAt));

      res.json(applications);
    } catch (error) {
      console.error("Error fetching leave applications:", error);
      res.status(500).json({ error: "Failed to fetch leave applications" });
    }
  });

  // Submit leave application (Staff only)
  app.post("/api/leave-applications", upload.single('proofImage'), async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "staff") {
      return res.status(403).json({ error: "Only staff members can submit leave applications" });
    }

    try {
      const { leaveType, reason, startDate, endDate } = req.body;

      if (!leaveType || !reason || !startDate || !endDate) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Parse dates
      const start = new Date(startDate);
      const end = new Date(endDate);

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
            eq(leaveApplications.userId, req.user!.id),
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
          userId: req.user!.id,
          leaveType,
          reason,
          startDate: start,
          endDate: end,
          totalDays,
          proofImageUrl,
          status: "pending",
          appliedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notification for project managers
      const projectManagers = await db
        .select()
        .from(users)
        .where(eq(users.role, "project_manager"));

      for (const pm of projectManagers) {
        try {
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: pm.id,
              type: "task_assigned", // Using existing type
              content: `${req.user!.name} has submitted a ${leaveType.replace('_', ' ')} application for ${totalDays} day${totalDays !== 1 ? 's' : ''}`,
              referenceId: newApplication.id,
              referenceType: "project", // Using existing type
              createdAt: new Date(),
            })
            .returning();

          // Send notification through SSE if PM is connected
          const clientResponse = global.sseClients?.get(pm.id);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
            } catch (error) {
              console.error(`Error sending SSE notification to PM ${pm.id}:`, error);
              global.sseClients.delete(pm.id);
            }
          }
        } catch (error) {
          console.error(`Error creating notification for PM ${pm.id}:`, error);
        }
      }

      res.json(newApplication);
    } catch (error) {
      console.error("Error creating leave application:", error);
      res.status(500).json({ error: "Failed to create leave application" });
    }
  });

  // Get all leave applications (Project Manager only)
  app.get("/api/leave-applications/all", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(leaveApplications.userId, users.id))
        .orderBy(desc(leaveApplications.createdAt));

      res.json(applications);
    } catch (error) {
      console.error("Error fetching all leave applications:", error);
      res.status(500).json({ error: "Failed to fetch leave applications" });
    }
  });

  // Review leave application (Project Manager only)
  app.put("/api/leave-applications/:id/review", isProjectManager, async (req, res) => {
    try {
      const applicationId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [updatedApplication] = await db
        .update(leaveApplications)
        .set({
          status,
          reviewComments: reviewComments || null,
          reviewedAt: new Date(),
          reviewedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(leaveApplications.id, applicationId))
        .returning();

      if (!updatedApplication) {
        return res.status(404).json({ error: "Leave application not found" });
      }

      // If approved, update user status immediately if the leave is starting today
      if (status === "approved") {
        const now = new Date();
        const leaveStart = new Date(updatedApplication.startDate);
        const leaveEnd = new Date(updatedApplication.endDate);

        if (now >= leaveStart && now <= leaveEnd) {
          // Staff should be on leave now
          await db
            .update(users)
            .set({
              workStatus: WorkStatus.ABSENT,
              absenceReason: 'leave',
              absenceEndDate: leaveEnd,
              lastActive: now
            })
            .where(eq(users.id, updatedApplication.userId));
        }
      }

      // Create notification for the applicant
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: updatedApplication.userId,
          type: "task_updated", // Using existing type
          content: `Your leave application has been ${status}${reviewComments ? `: ${reviewComments}` : ''}`,
          referenceId: updatedApplication.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if user is connected
      const clientResponse = global.sseClients?.get(updatedApplication.userId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to user ${updatedApplication.userId}:`, error);
          global.sseClients.delete(updatedApplication.userId);
        }
      }

      res.json(updatedApplication);
    } catch (error) {
      console.error("Error reviewing leave application:", error);
      res.status(500).json({ error: "Failed to review leave application" });
    }
  });

  // Direct Messages API Routes

  // Get all users for direct messaging (excluding current user)
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
          status: users.status,
          lastActive: users.lastActive,
        })
        .from(users);

      // Filter out current user
      const otherUsers = allUsers.filter(user => user.id !== req.user!.id);

      res.json(otherUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get conversations (list of users the current user has messaged with)
  app.get("/api/direct-messages/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;

      // Get all messages involving the current user
      const allMessages = await db
        .select()
        .from(directMessages)
        .where(
          or(
            eq(directMessages.senderId, userId),
            eq(directMessages.receiverId, userId)
          )
        )
        .orderBy(desc(directMessages.createdAt));

      // Get unique conversations with latest message and unread count
      const uniqueConversations = new Map();

      // Process messages to create conversation list
      for (const message of allMessages) {
        const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;

        if (!uniqueConversations.has(otherUserId)) {
          // Get other user details
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
            .where(eq(users.id, otherUserId))
            .limit(1);

          if (otherUser) {
            // Count unread messages from this user
            const unreadMessages = await db
              .select()
              .from(directMessages)
              .where(
                and(
                  eq(directMessages.senderId, otherUserId),
                  eq(directMessages.receiverId, userId),
                  eq(directMessages.read, false)
                )
              );

            const unreadCount = unreadMessages.length;

            uniqueConversations.set(otherUserId, {
              user: otherUser,
              lastMessage: {
                content: message.content,
                createdAt: message.createdAt,
                senderId: message.senderId,
              },
              unreadCount,
            });
          }
        }
      }

      const conversationList = Array.from(uniqueConversations.values());
      res.json(conversationList);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get messages with a specific user
  app.get("/api/direct-messages/:userId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const currentUserId = req.user!.id;
      const otherUserId = parseInt(req.params.userId);

      // Get all messages between these two users
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
        .innerJoin(users, eq(directMessages.senderId, users.id))
        .where(
          or(
            and(
              eq(directMessages.senderId, currentUserId),
              eq(directMessages.receiverId, otherUserId)
            ),
            and(
              eq(directMessages.senderId, otherUserId),
              eq(directMessages.receiverId, currentUserId)
            )
          )
        )
        .orderBy(asc(directMessages.createdAt));

      // Mark messages from the other user as read
      await db
        .update(directMessages)
        .set({ read: true })
        .where(
          and(
            eq(directMessages.senderId, otherUserId),
            eq(directMessages.receiverId, currentUserId),
            eq(directMessages.read, false)
          )
        );

      res.json(messages);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).json({ error: "Failed to fetch direct messages" });
    }
  });

  // Send a direct message
  app.post("/api/direct-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { receiverId, content } = req.body;
      const senderId = req.user!.id;

      if (!receiverId || !content?.trim()) {
        return res.status(400).json({ error: "Receiver ID and content are required" });
      }

      if (receiverId === senderId) {
        return res.status(400).json({ error: "Cannot send message to yourself" });
      }

      // Verify receiver exists
      const [receiver] = await db
        .select()
        .from(users)
        .where(eq(users.id, receiverId))
        .limit(1);

      if (!receiver) {
        return res.status(404).json({ error: "Receiver not found" });
      }

      // Create the message
      const [newMessage] = await db
        .insert(directMessages)
        .values({
          senderId,
          receiverId,
          content: content.trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Send real-time notification to receiver if connected
      const clientResponse = global.sseClients?.get(receiverId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "direct_message",
            data: {
              ...newMessage,
              senderName: req.user!.name,
            }
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to user ${receiverId}:`, error);
          global.sseClients.delete(receiverId);
        }
      }

      // Also send through WebSocket if connected
      const ws = global.connectedClients?.get(receiverId);
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({
            type: "direct_message",
            data: {
              ...newMessage,
              senderName: req.user!.name,
            }
          }));
        } catch (error) {
          console.error(`Error sending WebSocket message to user ${receiverId}:`, error);
        }
      }

      res.json({
        ...newMessage,
        senderName: req.user!.name,
      });
    } catch (error) {
      console.error("Error sending direct message:", error);
      res.status(500).json({ error: "Failed to send direct message" });
    }
  });

  // Mark messages as read
  app.put("/api/direct-messages/:userId/read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const currentUserId = req.user!.id;
      const otherUserId = parseInt(req.params.userId);

      await db
        .update(directMessages)
        .set({ read: true })
        .where(
          and(
            eq(directMessages.senderId, otherUserId),
            eq(directMessages.receiverId, currentUserId),
            eq(directMessages.read, false)
          )
        );

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Get unread direct messages count
  app.get("/api/direct-messages/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.user!.id;
      const unreadCount = await db
        .select({ count: count() })
        .from(directMessages)
        .where(
          and(
            eq(directMessages.receiverId, userId),
            eq(directMessages.read, false)
          )
        );

      res.json({ count: unreadCount[0]?.count || 0 });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  return server;
}