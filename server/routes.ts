import { Express, Response, Request, NextFunction } from "express";

// Extend Express Request interface to include authenticated user and body
interface AuthenticatedRequest extends Request {
  user?: any;
  body: any;
  isAuthenticated(): boolean;
}
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
  users,
  projects,
  tasks,
  projectMembers,
  projectPlans,
  deliverables,
  performance,
  UserRole,
  WorkStatus,
  AbsenceReason,
  UserStatus,
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
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull, or, sql, ne, gte, isNull } from "drizzle-orm";
import WebSocket from "ws";

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

// Middleware to check if user is a project manager or operations manager
const isProjectManagerOrOperationsManager = (req: Express.Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = req.user!;
  if (user.role !== UserRole.PROJECT_MANAGER && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
    return res.status(403).json({ error: "Only project managers and operations managers can perform this action" });
  }

  next();
};

// Middleware to check if user can manage tasks (project managers, technical support staff, product owners for Support & Maintenance, or operations managers)
  const canManageTasks = async (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';
    const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';

    // Operations managers have full access to all tasks
    if (isProjectManager || isTechnicalSupport || isOperationsManager) {
      return next();
    }

    if (isProductOwner) {
      // For product owners, check if the project is Support & Maintenance category
      const {projectId} = req.body;
      if (projectId) {
        try {
          const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

          if (!project) {
            return res.status(404).json({ error: "Project not found" });
          }

          if (project.category !== "support_maintenance") {
            return res.status(403).json({
              error: "Product owners can only manage tasks in Support & Maintenance category projects"
            });
          }

          return next();
        } catch (error) {
          console.error("Error checking project category:", error);
          return res.status(500).json({ error: "Failed to verify project permissions" });
        }
      } else {
        // Allow product owners to proceed if no projectId in body (they'll select project in form)
        return next();
      }
    }

    return res.status(403).json({ error: "Only project managers, technical support staff, product owners (for Support & Maintenance projects), and operations managers can perform this action" });
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
  limits: {fileSize: 5 * 1024 * 1024}, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Staff query attachments storage
const staffQueryUploadDir = path.join(process.cwd(), 'uploads', 'staff-query-attachments');
if (!fs.existsSync(staffQueryUploadDir)) {
  fs.mkdirSync(staffQueryUploadDir, { recursive: true });
}

const staffQueryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, staffQueryUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const staffQueryUpload = multer({
  storage: staffQueryStorage,
  limits: {fileSize: 10 * 1024 * 1024}, // 10MB limit for documents
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    const allowedTypes = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDF, and Word documents are allowed'));
    }
  }
});

// Function to broadcast messages to project members
async function broadcastToProject(projectId: number, message: any) {
  try {
    // Get project members
    const projectMembersData = await db
      .select({
        userId: projectMembers.userId
      })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.invitationStatus, "accepted")
      ));

    // Send to all project members via SSE
    for (const member of projectMembersData) {
      if (member.userId) {
        const clientResponse = global.sseClients?.get(member.userId);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify(message)}\n\n`);
          } catch (error) {
            console.error(`Error broadcasting to user ${member.userId}:`, error);
            global.sseClients?.delete(member.userId);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error broadcasting to project:", error);
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const server = createServer(app);

  // Debug endpoint for client team members
  app.get("/api/client/team-members/debug", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "client") {
      return res.status(403).json({ error: "Only clients can access this debug info" });
    }

    try {
      // Get client's projects
      const clientProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.clientId, user.id));

      // Get all users with relevant roles
      const allRelevantUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(users)
        .where(or(
          eq(users.role, "product_owner"),
          eq(users.role, "project_manager"),
          eq(users.role, "operations_manager"),
          and(eq(users.role, "staff"), eq(users.specialization, "technical_support")),
          and(eq(users.role, "staff"), eq(users.specialization, "developer"))
        ));

      res.json({
        clientId: user.id,
        clientName: user.name,
        clientProjects: clientProjects,
        allRelevantUsers: allRelevantUsers,
        message: "Debug info for troubleshooting team members"
      });
    } catch (error) {
      console.error("Error in debug endpoint:", error);
      res.status(500).json({ error: "Failed to fetch debug info" });
    }
  });

  // Get team members for client (Client only) - Filtered based on specific criteria
  app.get("/api/client/team-members", async (req, res) => {
    console.log("Client team members endpoint hit");
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    console.log(`User accessing team members: ${user.name} (${user.role})`);
    if (user.role !== "client") {
      console.log(`Access denied - user role is ${user.role}, not client`);
      return res.status(403).json({ error: "Only clients can access team members" });
    }

    try {
      // Get client's projects
      const clientProjects = await db
        .select({id: projects.id, managerId: projects.managerId})
        .from(projects)
        .where(eq(projects.clientId, user.id));

      const projectIds = clientProjects.map(p => p.id);
      const projectManagerIds = [...new Set(clientProjects.map(p => p.managerId).filter(Boolean))];

      let allowedContacts: any[] = [];

      if (projectIds.length > 0) {
        // 1. Get Project Managers (who manage the client's projects)
        const projectManagers = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(users.id, projectManagerIds)
            )
          )
          .orderBy(users.name);

        // Also get Product Owners who might have created tasks or been involved
        const productOwners = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              eq(users.role, "product_owner")
            )
          )
          .orderBy(users.name);

        // 2. Get Technical Support Staff assigned to client's projects
        const technicalSupportStaff = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .innerJoin(projectMembers, eq(users.id, projectMembers.userId))
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(projectMembers.projectId, projectIds),
              eq(projectMembers.invitationStatus, "accepted"),
              eq(users.role, "staff"),
              eq(users.specialization, "technical_support")
            )
          )
          .orderBy(users.name);

        // 4. Get Developer staff assigned to client's projects
        const developerStaff = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .innerJoin(projectMembers, eq(users.id, projectMembers.userId))
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(projectMembers.projectId, projectIds),
              eq(projectMembers.invitationStatus, "accepted"),
              eq(users.role, "staff"),
              eq(users.specialization, "developer")
            )
          )
          .orderBy(users.name);

        allowedContacts = [...projectManagers, ...productOwners, ...technicalSupportStaff, ...developerStaff];
      }

      // 3. Always include Operations Manager regardless of project assignment
      const operationsManagers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
          status: users.status,
          lastActive: users.lastActive,
        })
        .from(users)
        .where(
          and(
            ne(users.id, user.id), // Exclude the current user
            or(
              eq(users.specialization, "operations_manager"),
              eq(users.role, "operations_manager")
            )
          )
        )
        .orderBy(users.name);

      // Combine and remove duplicates
      const allAllowedContacts = [...allowedContacts, ...operationsManagers];
      const uniqueContacts = allAllowedContacts.filter((contact, index, self) =>
        index === self.findIndex(c => c.id === contact.id)
      );

      console.log(`Found ${uniqueContacts.length} allowed contacts for client ${user.name}`);
      res.json(uniqueContacts);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // Get available clients (for project managers, product owners, and operations managers)
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    if (!isProjectManager && !isProductOwner && !isOperationsManager) {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can access clients" });
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

  // Update existing users' break times (one-time setup)
  app.post("/api/setup-break-times", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "project_manager") {
      return res.status(403).send("Only project managers can perform this action");
    }

    try {
      // Update specific users' break times
      await db.update(users)
        .set({breakOneTime: "22:00", breakTwoTime: "12:00"})
        .where(eq(users.username, "testpm"));

      await db.update(users)
        .set({breakOneTime: "12:30", breakTwoTime: "15:00"})
        .where(eq(users.username, "testuser"));

      await db.update(users)
        .set({breakOneTime: "13:00", breakTwoTime: "16:00"})
        .where(eq(users.username, "Staff1"));

      res.json({message: "Break times updated successfully for existing users"});
    } catch (error) {
      console.error("Error updating break times:", error);
      res.status(500).json({ error: "Failed to update break times" });
    }
  });

  // Get available staff by specialization (for project managers, product owners, and operations managers)
  app.get("/api/staff", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    // Only project managers, product owners, and operations managers can view staff
    if (!isProjectManager && !isProductOwner && !isOperationsManager) {
      return res.status(403).send("Access denied");
    }
    const {specialization} = req.query;

    // Get both staff and product owners
    let query = db
      .select()
      .from(users)
      .where(or(
        eq(users.role, "staff"),
        eq(users.role, "product_owner")
      ));

    // Only apply specialization filter to staff members, not product owners
    if (specialization) {
      query = query.where(and(
        eq(users.role, "staff"),
        eq(users.specialization, specialization as string)
      ));

      // Also include all product owners regardless of specialization filter
      const productOwners = await db
        .select()
        .from(users)
        .where(eq(users.role, "product_owner"))
        .orderBy(desc(users.lastActive));

      const staffWithSpecialization = await query.orderBy(desc(users.lastActive));

      const combined = [...staffWithSpecialization, ...productOwners];
      return res.json(combined);
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

  // Test endpoint to add current staff member or product owner to the first available project
  app.post("/api/debug/add-me-to-project", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).send("Only staff members and product owners can use this endpoint");
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
  app.get("/api/staff-report", isProjectManagerOrOperationsManager, async (req, res) => {
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

          // Calculate remaining hours
          const remainingHours = (task.workingHours || 0) - totalHoursSpent;
          const remainingHoursRounded = Math.ceil(remainingHours);

          return {
            staffId: staff.id,
            taskId: task.id,
            taskTitle: task.title,
            projectId: task.projectId,
            projectName: task.projectName,
            assignedHours: task.workingHours,
            totalHoursSpent: Math.round(totalHoursSpent * 100) / 100,
            currentSessionHours: Math.round(currentSessionHours * 100) / 100,
            remainingHours: remainingHoursRounded,
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
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

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

  // Update project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const {category} = req.body;

    // Verify the project exists first
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check permissions
    if (user.role === "project_manager") {
      // Project managers can edit any project they manage
      if (existingProject.managerId !== user.id) {
        return res.status(403).json({
          error: "You don't have permission to edit this project"
        });
      }
    } else if (user.role === "product_owner") {
      // Product owners can only edit Support & Maintenance projects
      if (existingProject.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only edit Support & Maintenance category projects"
        });
      }
      // Also check if they're trying to change category away from support_maintenance
      if (category && category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners cannot change projects away from Support & Maintenance category"
        });
      }
    } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
      // Operations managers can edit any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can edit projects" });
    }
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

      // Verify project permissions are already checked above
      // No need for additional manager-only check here

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

  // Delete project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.delete("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    // Verify the project exists first
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check permissions
    if (user.role === "project_manager") {
      // Project managers can delete projects they manage
      if (project.managerId !== user.id) {
        return res.status(403).json({
          error: "You don't have permission to delete this project"
        });
      }
    } else if (user.role === "product_owner") {
      // Product owners can only delete Support & Maintenance projects
      if (project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only delete Support & Maintenance category projects"
        });
      }
    } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
      // Operations managers can delete any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can delete projects" });
    }

    try {

      // First delete related records to avoid foreign key constraint errors

      // Delete deliverables from project plans
      const projectPlansList = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

      for (const plan of projectPlansList) {
        await db
          .delete(deliverables)
          .where(eq(deliverables.projectPlanId, plan.id));
      }

      // Delete project plans
      await db
        .delete(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

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

      // Delete project team messages
      await db
        .delete(projectMessages)
        .where(eq(projectMessages.projectId, projectId));

      // Delete client invitations
      await db
        .delete(clientInvitations)
        .where(eq(clientInvitations.projectId, projectId));

      // Delete notifications related to this project
      await db
        .delete(notifications)
        .where(and(
          eq(notifications.referenceId, projectId),
          eq(notifications.referenceType, "project")
        ));

      // Delete project resources
      await db
        .delete(resources)
        .where(eq(resources.projectId, projectId));

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

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          membershipRole: projectMembers.role,
          joinedAt: projectMembers.joinedAt
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
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
        // Clients see projects they're assigned to as clientId
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
      } else if (user.role === "product_owner") {
        // Product owners see all projects (read-only access)
        console.log(`Fetching all projects for product owner user ${user.id} (${user.name})`);
        projectsList = await db
          .select()
          .from(projects)
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Operations managers see all projects with full access
        console.log(`Fetching all projects for operations manager user ${user.id} (${user.name})`);
        projectsList = await db
          .select()
          .from(projects)
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
            console.log("Available projects:", totalProjects.map(p => ({id: p.id, name: p.name})));
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

  // Create Project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const {category} = req.body;

    // Check permissions
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    if (isProjectManager) {
      // Project managers can create any project
    } else if (isProductOwner) {
      // Product owners can only create Support & Maintenance projects
      if (category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only create Support & Maintenance category projects"
        });
      }
    } else if (isOperationsManager) {
      // Operations managers can create any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can create projects" });
    }
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

      // Create project with or without client
      [newProject] = await db
        .insert(projects)
        .values({
          name,
          description,
          type,
          category,
          clientId: clientId || null,
          managerId: req.user!.id,
          status: "pending",
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Automatically add operations manager to all projects
      try {
        const operationsManagers = await db
          .select()
          .from(users)
          .where(or(
            eq(users.role, "operations_manager"),
            eq(users.specialization, "operations_manager")
          ));

        for (const opsManager of operationsManagers) {
          await db
            .insert(projectMembers)
            .values({
              projectId: newProject.id,
              userId: opsManager.id,
              invitedBy: req.user!.id,
              invitationStatus: "accepted",
              joinedAt: new Date()
            });

          // Create notification for the operations manager
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: opsManager.id,
              type: "task_assigned",
              content: `You have been automatically added to the project: ${newProject.name}`,
              referenceId: newProject.id,
              referenceType: "project",
              createdAt: new Date(),
            })
            .returning();

          // Send notification through SSE if user is connected
          const clientResponse = global.sseClients?.get(opsManager.id);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
            } catch (error) {
              console.error(`Error sending SSE notification to operations manager ${opsManager.id}:`, error);
              global.sseClients.delete(opsManager.id);
            }
          }
        }
      } catch (error) {
        console.error("Error adding operations managers to project:", error);
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
      const {userId} = req.body;

      // Verify user is a staff member or product owner
      const [staff] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          or(eq(users.role, "staff"), eq(users.role, "product_owner"))
        ))
        .limit(1);

      if (!staff) {
        return res.status(400).json({ error: "Invalid staff member or product owner" });
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

  // Accept/decline project invitation (Staff and Product Owners only)
  app.post("/api/projects/:id/respond", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).send("Only staff members and product owners can respond to invitations");
    }

    try {
      const projectId = parseInt(req.params.id);
      const {accept} = req.body;

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
      if (req.user!.role === "client") {
        // Clients see tasks in their projects
        const clientProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, req.user!.id));

        const projectIds = clientProjects.map(p => p.id);
        if (projectIds.length > 0) {
          userTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        }
      } else if (req.user!.role === "staff") {
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
      } else if (req.user!.role === "product_owner") {
        // Product owners see all tasks (read-only access)
        userTasks = await db
          .select()
          .from(tasks)
          .orderBy(desc(tasks.updatedAt));
      } else if (req.user!.role === "client" && req.user!.clientType === "support_maintenance_client") {
        // Support maintenance clients see tasks in their projects
        const clientProjects = await db
          .select({projectId: projectMembers.projectId})
          .from(projectMembers)
          .where(eq(projectMembers.userId, req.user!.id));

        if (clientProjects.length > 0) {
          const projectIds = clientProjects.map(p => p.projectId);
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

  // Create Task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const {title, description, status, assigneeId, deadline, projectId, startDate, workingHours} = req.body;

    if (!title || !projectId) {
      return res.status(400).json({ error: "Title and project ID are required" });
    }

    try {
      // Verify project exists and get its category
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check permissions
      const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
      const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
      const isProductOwner = user.role === 'product_owner';

      if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
        return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can create tasks" });
      }

      // For product owners, check if the project is Support & Maintenance category
      if (isProductOwner && project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only create tasks in Support & Maintenance category projects"
        });
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

  // Update task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    // Get the task and its project to check category
    const [task] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        projectCategory: projects.category,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Check permissions
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';

    if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
      return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can update tasks" });
    }

    // For product owners, check if the project is Support & Maintenance category
    if (isProductOwner && task.projectCategory !== "support_maintenance") {
      return res.status(403).json({
        error: "Product owners can only update tasks in Support & Maintenance category projects"
      });
    }
    try {
      const taskId = parseInt(req.params.id);
      const {title, description, status, assigneeId, deadline, startDate, workingHours} = req.body;

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
      const {status} = req.body;

      // Validate status
      const validStatuses = ["todo", "in_progress", "review", "completed", "technical_support"];
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

      // If setting to completed, review, or technical_support, stop the timer
      if (status === "completed" || status === "review" || status === "technical_support") {
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

  // Delete task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    // Get the task and its project to check category
    const [task] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        projectCategory: projects.category,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Check permissions
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';

    if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
      return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can delete tasks" });
    }

    // For product owners, check if the project is Support & Maintenance category
    if (isProductOwner && task.projectCategory !== "support_maintenance") {
      return res.status(403).json({
        error: "Product owners can only delete tasks in Support & Maintenance category projects"
      });
    }
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
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user || !req.user.id) {
      console.log("SSE connection attempted without valid user session");
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

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        global.sseClients?.delete(userId);
        return;
      }
      try {
        res.write(": keepalive\n\n");
      } catch (error) {
        console.error(`Error sending keepalive to user ${userId}:`, error);
        clearInterval(keepAlive);
        global.sseClients?.delete(userId);
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
        .set({read: true})
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
    const {type} = req.query;

    try {
      // Get messages with user information
      let query = db
        .select({
          id: messages.id,
          content: messages.content,
          type: messages.type,
          projectId: messages.projectId,
          userId: messages.userId,
          createdAt: messages.createdAt,
          user: {
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          }
        })
        .from(messages)
        .innerJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.projectId, projectId));

      if (type) {
        query = query.where(eq(messages.type, type as string));
      }

      const projectMessages = await query.orderBy(asc(messages.createdAt));
      console.log(`Returning ${projectMessages.length} messages for project ${projectId}, type: ${type}`);
      res.json(projectMessages);
    } catch (error) {
      console.error("Error fetching project messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Send a message
  app.post("/api/projects/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const {content, type} = req.body;

    try {
      console.log(`Sending message to project ${projectId}, type: ${type}, from user: ${req.user!.id}`);

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

      console.log("Message saved to database:", message);

      // Get project members to notify
      const projectMembersData = await db
        .select({
          userId: projectMembers.userId
        })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.invitationStatus, "accepted")
        ));

      // Send real-time notifications to all project members via SSE
      for (const member of projectMembersData) {
        if (member.userId && member.userId !== req.user!.id) {
          const clientResponse = global.sseClients?.get(member.userId);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "project_message",
                data: {
                  ...message,
                  projectId,
                  type,
                  senderName: req.user!.name
                }
              })}\n\n`);
              console.log(`Project message notification sent to user ${member.userId} via SSE`);
            } catch (error) {
              console.error(`Error sending SSE notification to user ${member.userId}:`, error);
              global.sseClients?.delete(member.userId);
            }
          }
        }
      }

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
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

  // Add link resource (Project Manager, Product Owner, and Operations Manager)
  app.post("/api/projects/:id/resources/link", async (req, res) => {
    console.log("Link upload endpoint called");
    console.log("Request params:", req.params);
    console.log("Request body:", req.body);
    console.log("User:", req.user);

    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    console.log("User role:", user.role);

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      console.log("User role not authorized:", user.role);
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can add links" });
    }

    try {
      const projectId = parseInt(req.params.id);
      const {name, link, category} = req.body;

      console.log("Adding link resource:", {projectId, name, link, category, userId: user.id});

      if (!name || !link || !category) {
        console.log("Missing name, link, or category");
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
        console.log("URL validation passed");
      } catch (error) {
        console.log("URL validation failed:", error);
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        console.log("Checking project manager access");
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
        console.log("Project manager access:", hasAccess);
      } else if (user.role === "product_owner") {
        console.log("Checking product owner access");
        // Product owners can add links to any project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
        console.log("Product owner access:", hasAccess);
      }

      if (!hasAccess) {
        console.log("Access denied to project");
        return res.status(403).json({ error: "Access denied to this project" });
      }

      console.log("Inserting resource into database");
      const [newResource] = await db
        .insert(resources)
        .values({
          name: name.trim(),
          type: category.trim(), // Use the category field directly
          link: link.trim(),
          projectId,
          uploadedBy: user.id,
          createdAt: new Date(),
        })
        .returning();

      console.log("Created resource:", newResource);

      // Get the resource with uploader name
      const [resourceWithUploader] = await db
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
        .where(eq(resources.id, newResource.id))
        .limit(1);

      console.log("Returning resource with uploader:", resourceWithUploader);

      res.json(resourceWithUploader);
    } catch (error) {
      console.error("Error adding link resource:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(500).json({
        error: "Failed to add link resource",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Edit link resource (Project Manager, Product Owner, and Operations Manager)
  app.put("/api/projects/:projectId/resources/:resourceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can edit resources" });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const resourceId = parseInt(req.params.resourceId);
      const {name, link, category} = req.body;

      if (!name || !link || !category) {
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
      } catch (error) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (user.role === "product_owner") {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Verify resource exists and is a link
      const [resource] = await db
        .select()
        .from(resources)
        .where(and(
          eq(resources.id, resourceId),
          eq(resources.projectId, projectId),
          eq(resources.type, "link")
        ))
        .limit(1);

      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      // Update the resource
      const [updatedResource] = await db
        .update(resources)
        .set({
          name: name.trim(),
          link: link.trim(),
          type: category.trim(), // Update category as well
        })
        .where(eq(resources.id, resourceId))
        .returning();

      // Get the updated resource with uploader name
      const [resourceWithUploader] = await db
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
        .where(eq(resources.id, resourceId))
        .limit(1);

      res.json(resourceWithUploader);
    } catch (error) {
      console.error("Error updating link resource:", error);
      res.status(500).json({
        error: "Failed to update link resource",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete resource (Project Manager, Product Owner, and Operations Manager)
  app.delete("/api/projects/:projectId/resources/:resourceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can delete resources" });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const resourceId = parseInt(req.params.resourceId);

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (user.role === "product_owner") {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Verify resource exists in this project
      const [resource] = await db
        .select()
        .from(resources)
        .where(and(
          eq(resources.id, resourceId),
          eq(resources.projectId, projectId)
        ))
        .limit(1);

      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      // Delete the resource
      await db
        .delete(resources)
        .where(eq(resources.id, resourceId));

      res.json({ message: "Resource deleted successfully" });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({
        error: "Failed to delete resource",
        details: error instanceof Error ? error.message : String(error)
      });
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

      return res.json({status: "success"});
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
            .set({status: UserStatus.IDLE})
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
      const {status} = req.body;

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
      console.log(`Fetching project plans for project ${projectId}`);

      const plans = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId))
        .orderBy(desc(projectPlans.updatedAt));

      console.log(`Found ${plans.length} project plans:`, plans);
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

  // Update project plan (Project Manager only)
  app.put("/api/project-plans/:id", isProjectManager, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const {name, description, startDate, endDate, deliverables: planDeliverables} = req.body;

      console.log("Updating project plan:", planId);
      console.log("Plan data:", {name, description, startDate, endDate, deliverables: planDeliverables});

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
          updatedAt: new Date(),
        })
        .where(eq(projectPlans.id, planId))
        .returning();

      // Delete existing deliverables
      await db
        .delete(deliverables)
        .where(eq(deliverables.projectPlanId, planId));

      // Create new deliverables
      if (planDeliverables && Array.isArray(planDeliverables) && planDeliverables.length > 0) {
        const deliverableValues = planDeliverables.map((deliverable: any, index: number) => {
          const deliverableStartDate = new Date(deliverable.startDate);
          const deliverableEndDate = new Date(deliverable.endDate);

          if (isNaN(deliverableStartDate.getTime()) || isNaN(deliverableEndDate.getTime())) {
            throw new Error(`Invalid date format in deliverable ${index + 1}`);
          }

          return {
            projectPlanId: planId,
            name: deliverable.name,
            startDate: deliverableStartDate,
            endDate: deliverableEndDate,
            order: index + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        await db.insert(deliverables).values(deliverableValues);
      }

      // Fetch updated plan with deliverables
      const updatedDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.projectPlanId, planId))
        .orderBy(asc(deliverables.order));

      res.json({...updatedPlan, deliverables: updatedDeliverables});
    } catch (error) {
      console.error("Error updating project plan:", error);
      res.status(500).json({ error: "Failed to update project plan" });
    }
  });

  // Create project plan (Project Manager only)
  app.post("/api/projects/:id/plans", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const {name, description, startDate, endDate, deliverables: createPlanDeliverables} = req.body;

      console.log("Creating project plan for project:", projectId);
      console.log("Plan data:", {name, description, startDate, endDate, deliverables: createPlanDeliverables});

      if (!name) {
        return res.status(400).json({ error: "Plan name is required" });
      }

      if (!createPlanDeliverables || !Array.isArray(createPlanDeliverables) || createPlanDeliverables.length === 0) {
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
        parsedEndDate = new Date(endDate);
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
      if (createPlanDeliverables && Array.isArray(createPlanDeliverables) && createPlanDeliverables.length > 0) {
        const deliverableValues = createPlanDeliverables.map((deliverable: any, index: number) => {
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
      const {name, description, startDate, endDate, status, deliverables: updatePlanDeliverables} = req.body;

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
      if (updatePlanDeliverables && Array.isArray(updatePlanDeliverables)) {
        // Delete existing deliverables
        await db
          .delete(deliverables)
          .where(eq(deliverables.projectPlanId, planId));

        // Create new deliverables
        if (updatePlanDeliverables.length > 0) {
          const deliverableValues = updatePlanDeliverables.map((deliverable: any, index: number) => {
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
      const {status} = req.body;

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

  // Get leave applications for the current user (Staff and Product Owners only)
  app.get("/api/leave-applications", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).json({ error: "Only staff members and product owners can view leave applications" });
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

  // Submit leave application (Staff and Product Owners only)
  app.post("/api/leave-applications", upload.single('proofImage'), async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).json({ error: "Only staff members and product owners can submit leave applications" });
    }

    try {
      const {leaveType, reason, startDate, endDate} = req.body;

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
              global.sseClients?.delete(pm.id);
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

  // Get all leave applications (Project Manager and Operations Manager)
  app.get("/api/leave-applications/all", isProjectManagerOrOperationsManager, async (req, res) => {
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

  // Review leave application (Project Manager and Operations Manager)
  app.put("/api/leave-applications/:id/review", isProjectManagerOrOperationsManager, async (req, res) => {
    try {
      const applicationId = parseInt(req.params.id);
      const {status, reviewComments} = req.body;

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
          // Staff should be on leave
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
          global.sseClients?.delete(updatedApplication.userId);
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

  // Get unread direct messages count
  app.get("/api/direct-messages/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.user!.id;

      // Validate user ID is a valid number
      if (!userId || isNaN(userId) || !Number.isInteger(userId)) {
        console.error("Invalid user ID for unread count:", userId);
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const result = await db
        .select({count: sql<number>`count(*)`})
        .from(directMessages)
        .where(
          and(
            eq(directMessages.receiverId, userId),
            eq(directMessages.read, false)
          )
        );

      const count = result[0]?.count || 0;
      res.json({count});
    } catch (error) {
      console.error("Error fetching unread messages count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Get conversations (list of users the current user has messaged with)
  app.get("/api/direct-messages/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;

      // Validate user ID is a valid number
      if (!userId || isNaN(userId) || !Number.isInteger(userId)) {
        console.error("Invalid user ID for conversations:", userId);
        return res.status(400).json({ error: "Invalid user ID" });
      }

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

      // Validate user IDs
      if (!currentUserId || isNaN(currentUserId) || !Number.isInteger(currentUserId)) {
        console.error("Invalid current user ID:", currentUserId);
        return res.status(400).json({ error: "Invalid current user ID" });
      }

      if (isNaN(otherUserId) || !Number.isInteger(otherUserId)) {
        console.error("Invalid other user ID:", req.params.userId);
        return res.status(400).json({ error: "Invalid user ID parameter" });
      }

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

      // Mark messages as read
      await db
        .update(directMessages)
        .set({read: true})
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
      const {receiverId, content} = req.body;
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
          global.sseClients?.delete(receiverId);
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

      // Validate user IDs
      if (!currentUserId || isNaN(currentUserId) || !Number.isInteger(currentUserId)) {
        console.error("Invalid current user ID:", currentUserId);
        return res.status(400).json({ error: "Invalid current user ID" });
      }

      if (isNaN(otherUserId) || !Number.isInteger(otherUserId)) {
        console.error("Invalid other user ID:", req.params.userId);
        return res.status(400).json({ error: "Invalid user ID parameter" });
      }

      await db
        .update(directMessages)
        .set({read: true})
        .where(
          and(
            eq(directMessages.senderId, otherUserId),
            eq(directMessages.receiverId, currentUserId),
            eq(directMessages.read, false)
          )
        );

      res.json({success: true});
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Get team messages for a project
  app.get("/api/projects/:projectId/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "operations_manager") {
        // Operations managers have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      const teamMessages = await db
        .select({
          id: projectMessages.id,
          content: projectMessages.content,
          createdAt: projectMessages.createdAt,
          senderId: projectMessages.senderId,
          sender: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(projectMessages)
        .leftJoin(users, eq(projectMessages.senderId, users.id))
        .where(eq(projectMessages.projectId, projectId))
        .orderBy(desc(projectMessages.createdAt))
        .limit(50);

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

    try {
      const projectId = parseInt(req.params.projectId);
      const {content} = req.body;
      const userId = req.user!.id;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "operations_manager") {
        // Operations managers have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Get project members for mention processing
      const projectMembersData = await db
        .select({
          userId: projectMembers.userId,
          userName: users.name,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.invitationStatus, "accepted")
        ));

      const [message] = await db
        .insert(projectMessages)
        .values({
          projectId,
          senderId: userId,
          content: content.trim(),
        })
        .returning();

      // Parse mentions from message content
      const mentionRegex = /@([a-zA-Z0-9_\s]+)/g;
      const mentions = [];
      let match;

      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedName = match[1].trim();
        // Find the mentioned user in project members
        const mentionedMember = projectMembersData.find(member =>
          member.userName && member.userName.toLowerCase() === mentionedName.toLowerCase()
        );

        if (mentionedMember && mentionedMember.userId !== userId) {
          mentions.push(mentionedMember.userId);
        }
      }

      // Create notifications for mentioned users
      for (const mentionedUserId of mentions) {
        try {
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: mentionedUserId,
              type: "mention",
              content: `${req.user!.name} mentioned you in team chat: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
              referenceId: projectId,
              referenceType: "project",
              createdAt: new Date(),
            })
            .returning();

          // Send real-time notification via SSE if user is connected
          const clientResponse = global.sseClients?.get(mentionedUserId);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
              console.log(`Team chat mention notification sent to user ${mentionedUserId} via SSE`);
            } catch (error) {
              console.error(`Error sending SSE notification to user ${mentionedUserId}:`, error);
              global.sseClients?.delete(mentionedUserId);
            }
          }
        } catch (error) {
          console.error(`Error creating notification for mentioned user ${mentionedUserId}:`, error);
        }
      }

      // Get the message with sender info
      const messageWithSender = await db
        .select({
          id: projectMessages.id,
          content: projectMessages.content,
          createdAt: projectMessages.createdAt,
          senderId: projectMessages.senderId,
          sender: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(projectMessages)
        .leftJoin(users, eq(projectMessages.senderId, users.id))
        .where(eq(projectMessages.id, message.id))
        .limit(1);

      const messageData = messageWithSender[0];

      // Broadcast to team members via SSE
      broadcastToProject(projectId, {
        type: "team_message",
        data: messageData,
      });

      res.status(201).json(messageData);
    } catch (error) {
      console.error("Error sending team message:", error);
      res.status(500).json({ error: "Failed to send team message" });
    }
  });

  // Get unread team message counts for all user's projects
  app.get("/api/projects/unread-counts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !req.user.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // More lenient validation - just check if userId exists and is a valid number
      if (!userId || typeof userId !== 'number' || isNaN(userId) || userId <= 0) {
        console.error("Invalid user ID:", { userId, userType: typeof userId });
        return res.json({}); // Return empty object instead of error
      }

      let allProjectIds: number[] = [];

      if (userRole === "product_owner" || userRole === "operations_manager" || req.user!.specialization === "operations_manager") {
        // Product owners and operations managers have access to all projects
        const allProjects = await db
          .select({id: projects.id})
          .from(projects);
        allProjectIds = allProjects.map(p => p.id);
      } else {
        // Get user's managed projects
        const managedProjects = await db
          .select({id: projects.id})
          .from(projects)
          .where(eq(projects.managerId, userId));

        // Get user's member projects
        const memberProjects = await db
          .select({projectId: projectMembers.projectId})
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, userId),
              eq(projectMembers.invitationStatus, "accepted")
            )
          );

        allProjectIds = [
          ...managedProjects.map(p => p.id),
          ...memberProjects.map(p => p.projectId).filter(id => id !== null && id !== undefined)
        ];
      }

      // Remove duplicates and filter out null/undefined values
      const uniqueProjectIds = Array.from(new Set(allProjectIds.filter(id => id !== null && id !== undefined)));

      if (uniqueProjectIds.length === 0) {
        return res.json({});
      }

      // Validate project IDs are valid numbers
      const validProjectIds = uniqueProjectIds.filter(id =>
        id !== null && id !== undefined && typeof id === 'number' && !isNaN(id) && Number.isInteger(id) && id > 0
      );

      if (validProjectIds.length === 0) {
        return res.json({});
      }

      // Get unread counts for each project using read receipts for team chat (projectMessages)
      const unreadCounts: Record<number, number> = {};

      for (const projectId of validProjectIds) {
        try {
          // Get all team messages for this project that are not from current user
          const teamMessagesList = await db
            .select({id: projectMessages.id})
            .from(projectMessages)
            .where(
              and(
                eq(projectMessages.projectId, projectId),
                ne(projectMessages.senderId, userId)
              )
            );

          if (teamMessagesList.length === 0) {
            unreadCounts[projectId] = 0;
            continue;
          }

          // Get message IDs that the user has already read (for team messages)
          const readMessageIds = await db
            .select({messageId: messageReadReceipts.messageId})
            .from(messageReadReceipts)
            .where(eq(messageReadReceipts.userId, userId));

          const readIds = new Set(readMessageIds.map(r => r.messageId));

          // Count unread team messages
          const unreadCount = teamMessagesList.filter(msg => !readIds.has(msg.id)).length;
          unreadCounts[projectId] = unreadCount;
        } catch (error) {
          console.error(`Error counting messages for project ${projectId}:`, error);
          unreadCounts[projectId] = 0;
        }
      }

      res.json(unreadCounts);
    } catch (error) {
      console.error("Error fetching unread counts:", error);
      res.status(500).json({ error: "Failed to fetch unread counts" });
    }
  });

  // Mark team messages as read for a user
  app.post("/api/projects/:projectId/team-messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      const {messageIds} = req.body;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ error: "Message IDs are required" });
      }

      // Insert read receipts for team messages
      const readReceipts = messageIds.map(messageId => ({
        messageId: parseInt(messageId),
        userId: userId,
      }));

      await db.insert(messageReadReceipts).values(readReceipts).onConflictDoNothing();

      res.json({success: true});
    } catch (error) {
      console.error("Error marking team messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Mark messages as read for a user
  app.post("/api/projects/:projectId/messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      const {messageIds} = req.body;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ error: "Message IDs are required" });
      }

      // Insert read receipts for each message (ignore duplicates)
      const readReceiptsToInsert = messageIds.map(messageId => ({
        messageId: parseInt(messageId),
        userId: userId
      }));

      await db.insert(messageReadReceipts)
        .values(readReceiptsToInsert)
        .onConflictDoNothing();

      res.json({success: true});
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Mark all project messages as read for current user
  app.post("/api/projects/:projectId/messages/mark-all-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;

      // Get all message IDs for this project that are not from current user
      const projectMessagesList = await db
        .select({id: projectMessages.id})
        .from(projectMessages)
        .where(
          and(
            eq(projectMessages.projectId, projectId),
            ne(projectMessages.senderId, userId)
          )
        );

      if (projectMessagesList.length === 0) {
        return res.json({success: true});
      }

      // Get message IDs that user hasn't read yet
      const readMessageIds = await db
        .select({messageId: messageReadReceipts.messageId})
        .from(messageReadReceipts)
        .where(eq(messageReadReceipts.userId, userId));

      const readIds = new Set(readMessageIds.map(r => r.messageId));
      const unreadMessageIds = projectMessagesList
        .filter(msg => !readIds.has(msg.id))
        .map(msg => msg.id);

      if (unreadMessageIds.length > 0) {
        const readReceiptsToInsert = unreadMessageIds.map(messageId => ({
          messageId: messageId,
          userId: userId
        }));

        await db.insert(messageReadReceipts)
          .values(readReceiptsToInsert)
          .onConflictDoNothing();
      }

      res.json({success: true});
    } catch (error) {
      console.error("Error marking all messages as read:", error);
      res.status(500).json({ error: "Failed to mark all messages as read" });
    }
  });

  // Technical Support API Routes
  app.get("/api/technical-support/requests", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;

      // Get basic technical support requests first
      let basicRequests;
      if (user.specialization === 'technical_support' || user.role === 'project_manager' || user.role === 'product_owner' || user.role === 'operations_manager' || user.specialization === 'operations_manager') {
        // Technical support staff, project managers, product owners, and operations managers see all requests
        console.log(`User ${user.id} (${user.role}) fetching all technical support requests`);
        basicRequests = await db.select()
          .from(technicalSupportRequests)
          .orderBy(desc(technicalSupportRequests.createdAt));
        console.log(`Found ${basicRequests.length} technical support requests for user ${user.id}`);
      } else {
        // Non-technical support staff see only their own requests
        console.log(`User ${user.id} (${user.role}) fetching their own technical support requests`);
        basicRequests = await db.select()
          .from(technicalSupportRequests)
          .where(eq(technicalSupportRequests.requesterId, user.id))
          .orderBy(desc(technicalSupportRequests.createdAt));
        console.log(`Found ${basicRequests.length} technical support requests for user ${user.id}`);
      }

      // Enrich requests with additional data
      const requests = await Promise.all(basicRequests.map(async (request) => {
        // Get requester info
        const [requester] = await db.select({id: users.id, name: users.name, email: users.email})
          .from(users)
          .where(eq(users.id, request.requesterId))
          .limit(1);

        // Get assigned user info if assigned
        let assignedTo = null;
        if (request.assignedToId) {
          const [assigned] = await db.select({id: users.id, name: users.name, email: users.email})
            .from(users)
            .where(eq(users.id, request.assignedToId))
            .limit(1);
          assignedTo = assigned || null;
        }

        // Get task info if related
        let task = null;
        let project = null;
        if (request.taskId) {
          const [taskInfo] = await db.select({id: tasks.id, title: tasks.title, projectId: tasks.projectId})
            .from(tasks)
            .where(eq(tasks.id, request.taskId))
            .limit(1);
          task = taskInfo || null;

          if (task?.projectId) {
            const [projectInfo] = await db.select({id: projects.id, name: projects.name})
              .from(projects)
              .where(eq(projects.id, task.projectId))
              .limit(1);
            project = projectInfo || null;
          }
        }

        return {
          ...request,
          requester,
          assignedTo,
          task,
          project
        };
      }));

      res.json(requests);
    } catch (error) {
      console.error("Error fetching technical support requests:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  app.post("/api/technical-support/requests", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;

      // Only non-technical support staff can create requests
      if (user.specialization === 'technical_support') {
        return res.status(403).json({ error: "Technical support staff cannot create requests" });
      }

      const {title, description, taskId, priority} = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      // Create the technical support request
      const [newRequest] = await db.insert(technicalSupportRequests)
        .values({
          title,
          description,
          taskId: taskId || null,
          requesterId: user.id,
          priority: priority || 'medium',
          status: 'pending',
        })
        .returning();

      // Update task status to "technical_support" if taskId is provided
      if (taskId) {
        await db.update(tasks)
          .set({status: 'technical_support'})
          .where(eq(tasks.id, taskId));
      }

      // Send notifications to technical support staff (simplified approach)
      try {
        // Get technical support staff and create notifications
        const techSupportUsers = await db.query.users.findMany({
          where: eq(users.specialization, 'technical_support'),
          columns: {id: true, name: true, email: true}
        });

        if (techSupportUsers.length > 0) {
          // Create notifications
          for (const staff of techSupportUsers) {
            await db.insert(notifications).values({
              userId: staff.id,
              type: 'mention',
              content: `New technical support request: ${title}`,
              referenceId: newRequest.id,
              referenceType: 'task',
              createdAt: new Date()
            });

            // Send real-time notification via SSE if available
            const clientResponse = global.sseClients?.get(staff.id);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: {
                    type: 'mention',
                    content: `New technical support request: ${title}`,
                    referenceId: newRequest.id,
                    referenceType: 'task',
                    createdAt: new Date().toISOString()
                  }
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${staff.id}:`, error);
                global.sseClients?.delete(staff.id);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error sending notifications to technical support staff:", error);
        // Continue execution even if notifications fail
      }

      res.status(201).json({
        message: "Request submitted successfully",
        request: newRequest
      });
    } catch (error) {
      console.error("Error creating technical support request:", error);
      res.status(500).json({ error: "Failed to create request" });
    }
  });

  app.post("/api/technical-support/requests/:id/assign", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Only technical support staff can assign requests
      if (user.specialization !== 'technical_support') {
        return res.status(403).json({ error: "Only technical support staff can assign requests" });
      }

      // Get the request details to check for related task and project
      const [requestDetails] = await db.select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (!requestDetails) {
        return res.status(404).json({ error: "Request not found" });
      }

      const [updatedRequest] = await db.update(technicalSupportRequests)
        .set({
          assignedToId: user.id,
          status: 'in_progress',
          updatedAt: new Date()
        })
        .where(eq(technicalSupportRequests.id, requestId))
        .returning();

      // If there's a related task, grant project access to the technical support staff
      if (requestDetails.taskId) {
        try {
          // Get task details to find project
          const [taskDetails] = await db.select({id: tasks.id, projectId: tasks.projectId})
            .from(tasks)
            .where(eq(tasks.id, requestDetails.taskId))
            .limit(1);

          if (taskDetails?.projectId) {
            // Check if user is already a member of the project
            const existingMembership = await db.select({id: projectMembers.id})
              .from(projectMembers)
              .where(and(
                eq(projectMembers.projectId, taskDetails.projectId),
                eq(projectMembers.userId, user.id)
              ))
              .limit(1);

            // If not already a member, add them with technical_support role
            if (existingMembership.length === 0) {
              await db.insert(projectMembers).values({
                projectId: taskDetails.projectId,
                userId: user.id,
                role: 'technical_support',
                invitationStatus: 'accepted',
                invitedBy: user.id,
                invitedAt: new Date(),
                joinedAt: new Date()
              });
            }
          }
        } catch (error) {
          console.error("Error granting project access to technical support staff:", error);
          // Continue execution even if project access fails
        }
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error assigning technical support request:", error);
      res.status(500).json({ error: "Failed to assign request" });
    }
  });

  app.put("/api/technical-support/requests/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Check if user has permission to update this request
      const existingRequest = await db.select().from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (existingRequest.length === 0) {
        return res.status(404).json({ error: "Request not found" });
      }

      const request = existingRequest[0];
      const canUpdate = user.specialization === 'technical_support' &&
        (request.assignedToId === user.id || !request.assignedToId) ||
        request.requesterId === user.id;

      if (!canUpdate) {
        return res.status(403).json({ error: "Not authorized to update this request" });
      }

      const updateData: any = {...req.body, updatedAt: new Date()};

      if (req.body.status === 'resolved') {
        updateData.resolvedAt = new Date();
      }

      const [updatedRequest] = await db.update(technicalSupportRequests)
        .set(updateData)
        .where(eq(technicalSupportRequests.id, requestId))
        .returning();

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating technical support request:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  app.delete("/api/technical-support/requests/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Check if request exists and get details
      const existingRequest = await db.select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (existingRequest.length === 0) {
        return res.status(404).json({ error: "Request not found" });
      }

      const request = existingRequest[0];

      // Only allow deletion if:
      // 1. User is the requester AND
      // 2. Request is not assigned to anyone (assignedToId is null)
      if (request.requesterId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own requests" });
      }

      if (request.assignedToId !== null) {
        return res.status(403).json({ error: "Cannot delete request that has been assigned to technical support staff" });
      }

      // Delete the request
      await db.delete(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId));

      // If there was a related task, update its status back to the previous status
      if (request.taskId) {
        await db.update(tasks)
          .set({status: 'in_progress'}) // Reset to in_progress or another appropriate status
          .where(eq(tasks.id, request.taskId));
      }

      res.json({ message: "Request deleted successfully" });
    } catch (error) {
      console.error("Error deleting technical support request:", error);
      res.status(500).json({ error: "Failed to delete request" });
    }
  });

  // Deadline Extension Requests API Routes

  // Get deadline extension requests
  app.get("/api/deadline-extension-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers and operations managers can access deadline extension requests" });
    }

    try {
      let requests;

      if (user.role === "project_manager" || user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Project managers see requests for their projects, operations managers see all requests
        const whereCondition = user.role === "operations_manager" || user.specialization === "operations_manager"
          ? undefined // Operations managers see all requests
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

    // Only non-project manager staff can create requests
    if (user.role === "project_manager") {
      return res.status(403).json({ error: "Project managers cannot create deadline extension requests" });
    }

    try {
      const {taskId, reason, requestedDeadline} = req.body;

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
          createdAt: new Date(),
          updatedAt: new Date(),
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

      const [notification] = await db
        .insert(notifications)
        .values({
          userId: project.managerId,
          type: "task_updated",
          content: `${user.name} has requested a deadline extension for task: ${taskDetails?.title || 'Unknown Task'}`,
          referenceId: newRequest.id,
          referenceType: "task",
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if PM is connected
      const clientResponse = global.sseClients?.get(project.managerId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to PM ${project.managerId}:`, error);
          global.sseClients?.delete(project.managerId);
        }
      }

      res.json(newRequest);
    } catch (error) {
      console.error("Error creating deadline extension request:", error);
      res.status(500).json({ error: "Failed to create deadline extension request" });
    }
  });

  // Approve/Decline deadline extension request (Project Manager and Operations Manager)
  app.put("/api/deadline-extension-requests/:id", isProjectManagerOrOperationsManager, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const {status, decisionReason, approvedDeadline, approvedWorkingHours} = req.body;

      if (!["approved", "declined"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'declined'" });
      }

      if (!decisionReason) {
        return res.status(400).json({ error: "Decision reason is required" });
      }

      // Get the request details
      const [request] = await db
        .select()
        .from(deadlineExtensionRequests)
        .where(and(
          eq(deadlineExtensionRequests.id, requestId),
          eq(deadlineExtensionRequests.projectManagerId, req.user!.id),
          eq(deadlineExtensionRequests.status, "pending")
        ))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: "Request not found or already processed" });
      }

      // Update the request
      const updateData: any = {
        status,
        decisionReason,
        decidedBy: req.user!.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      };

      if (status === "approved") {
        if (approvedDeadline) {
          updateData.approvedDeadline = new Date(approvedDeadline);
        }
        if (approvedWorkingHours) {
          updateData.approvedWorkingHours = parseInt(approvedWorkingHours);
        }
      }

      const [updatedRequest] = await db
        .update(deadlineExtensionRequests)
        .set(updateData)
        .where(eq(deadlineExtensionRequests.id, requestId))
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
          taskUpdateData.updatedAt = new Date();

          await db
            .update(tasks)
            .set(taskUpdateData)
            .where(eq(tasks.id, request.taskId));
        }
      }

      // Create notification for the requester
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: request.requesterId,
          type: "task_updated",
          content: `Your deadline extension request has been ${status}. ${decisionReason}.`,
          referenceId: request.taskId,
          referenceType: "task",
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if user is connected
      const clientResponse = global.sseClients?.get(request.requesterId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to user ${request.requesterId}:`, error);
          global.sseClients?.delete(request.requesterId);
        }
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error processing deadline extension request:", error);
      res.status(500).json({ error: "Failed to process deadline extension request" });
    }
  });

  // Client Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Configure multer for complaint screenshots
  const complaintUploadDir = path.join(process.cwd(), 'uploads', 'complaint-screenshots');
  if (!fs.existsSync(complaintUploadDir)) {
    fs.mkdirSync(complaintUploadDir, { recursive: true });
  }

  const complaintStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, complaintUploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const complaintUpload = multer({
    storage: complaintStorage,
    limits: {fileSize: 5 * 1024 * 1024}, // 5MB limit
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Complaints API endpoint
  app.post("/api/complaints", complaintUpload.single('screenshot'), async (req, res) => {
    console.log("POST /api/complaints - Session:", req.session?.id);
    console.log("POST /api/complaints - User:", req.user);
    console.log("POST /api/complaints - Request body:", req.body);
    console.log("POST /api/complaints - File:", req.file);

    if (!req.isAuthenticated()) {
      console.log("Complaints endpoint - Authentication failed");
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const {name, email, productManagerName, developerName, technicalManagerName, valuableThings, detailedExplanation} = req.body;

      console.log("Complaint submission data:", {name, email, productManagerName, developerName, technicalManagerName, valuableThings, detailedExplanation});

      if (!name?.trim() || !email?.trim() || !detailedExplanation?.trim()) {
        return res.status(400).json({ error: "Name, email, and detailed explanation are required" });
      }

      // Parse valuable things if it's a string
      let parsedValuableThings = [];
      if (valuableThings) {
        try {
          parsedValuableThings = typeof valuableThings === 'string' ? JSON.parse(valuableThings) : valuableThings;
          // Ensure it's an array
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
        screenshotUrl = `/uploads/complaint-screenshots/${req.file.filename}`;
      }

      // Create complaint record using raw SQL since we don't have Drizzle schema for complaints table
      const result = await db.execute(sql`
        INSERT INTO complaints (name, email, product_manager_name, developer_name, technical_manager_name, valuable_things, detailed_explanation, screenshot_url, submitter_id)
        VALUES (${name.trim()}, ${email.trim()}, ${productManagerName?.trim() || null}, ${developerName?.trim() || null}, ${technicalManagerName?.trim() || null}, ${JSON.stringify(parsedValuableThings)}::jsonb, ${detailedExplanation.trim()}, ${screenshotUrl || null}, ${req.user!.id})
        RETURNING *
      `);

      const newComplaint = result.rows[0];

      // Get all operations managers
      const operationsManagers = await db
        .select()
        .from(users)
        .where(or(
          eq(users.specialization, "operations_manager"),
          eq(users.role, "operations_manager")
        ));

      // Send notification to all operations managers
      for (const manager of operationsManagers) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: manager.id,
            type: "technical_support_request",
            content: `New complaint received from ${name}: ${detailedExplanation.substring(0, 100)}...`,
            referenceId: newComplaint.id,
            referenceType: "complaint",
            createdAt: new Date(),
          })
          .returning();

        // Send real-time notification via SSE if manager is connected
        const clientResponse = global.sseClients?.get(manager.id);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: notification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to operations manager ${manager.id}:`, error);
            global.sseClients?.delete(manager.id);
          }
        }
      }

      res.json({ message: "Complaint submitted successfully", complaint: newComplaint });
    } catch (error) {
      console.error("Error submitting complaint:", error);
      res.status(500).json({ error: "Failed to submit complaint" });
    }
  });

  // Get all complaints (Operations Manager only)
  app.get("/api/complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.specialization !== "operations_manager" && user.role !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can view complaints" });
    }

    try {
      const result = await db.execute(sql`
        SELECT * FROM complaints ORDER BY created_at DESC
      `);

      const allComplaints = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        productManagerName: row.product_manager_name,
        developerName: row.developer_name,
        technicalManagerName: row.technical_manager_name,
        valuableThings: row.valuable_things || [],
        detailedExplanation: row.detailed_explanation,
        screenshotUrl: row.screenshot_url,
        status: row.status || 'pending',
        reviewComments: row.review_comments,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at
      }));

      res.json(allComplaints);
    } catch (error) {
      console.error("Error fetching complaints:", error);
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  // Update complaint status (Operations Manager only)
  app.put("/api/complaints/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.specialization !== "operations_manager" && user.role !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update complaints" });
    }

    try {
      const complaintId = parseInt(req.params.id);
      const {status, reviewComments} = req.body;

      const validStatuses = ["pending", "reviewed", "resolved"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const result = await db.execute(sql`
        UPDATE complaints
        SET status = ${status},
            review_comments = ${reviewComments || null},
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ${complaintId}
        RETURNING *
      `);

      const updatedComplaint = result.rows[0];

      if (!updatedComplaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }

      res.json(updatedComplaint);
    } catch (error) {
      console.error("Error updating complaint:", error);
      res.status(500).json({ error: "Failed to update complaint" });
    }
  });

  // Memo API Routes

  // Get all memos (Operations Manager only)
  app.get("/api/memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can view all memos" });
    }

    try {
      const result = await db.execute(sql`
        SELECT m.*, u.name as sender_name
        FROM memos m
        LEFT JOIN users u ON m.sent_by = u.id
        ORDER BY m.created_at DESC
      `);

      const memosWithSender = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        type: row.type,
        recipients: row.recipients || [],
        sentBy: row.sent_by,
        senderName: row.sender_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(memosWithSender);
    } catch (error) {
      console.error("Error fetching memos:", error);
      res.status(500).json({ error: "Failed to fetch memos" });
    }
  });

  // Get memos for current user (Staff members)
  app.get("/api/memos/my-memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role === "operations_manager" || user.specialization === "operations_manager") {
      // Operations managers see all memos they sent
      try {
        const result = await db.execute(sql`
          SELECT m.*, u.name as sender_name,
                 (SELECT COUNT(*) FROM memo_reads mr WHERE mr.memo_id = m.id) as read_count
          FROM memos m
          LEFT JOIN users u ON m.sent_by = u.id
          WHERE m.sent_by = ${user.id}
          ORDER BY m.created_at DESC
        `);

        const memosWithReadCount = result.rows.map(row => ({
          id: row.id,
          title: row.title,
          content: row.content,
          type: row.type,
          recipients: row.recipients || [],
          sentBy: row.sent_by,
          senderName: row.sender_name,
          readCount: row.read_count || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        res.json(memosWithReadCount);
      } catch (error) {
        console.error("Error fetching sent memos:", error);
        res.status(500).json({ error: "Failed to fetch sent memos" });
      }
    } else {
      // Staff members see memos targeted to them
      try {
        // Build dynamic WHERE clause conditions
        let whereConditions = [
          "m.type = 'general'",
          `m.type = 'individual' AND m.recipients @> '${JSON.stringify([user.id])}'::jsonb`
        ];

        // Add department conditions
        let deptConditions = ["m.recipients @> '[\"all_staff\"]'::jsonb"];

        if (user.specialization) {
          deptConditions.push(`m.recipients @> '${JSON.stringify([user.specialization])}'::jsonb`);
        }

        if (user.role === 'project_manager') {
          deptConditions.push(`m.recipients @> '[\"project_managers\"]'::jsonb`);
        }

        if (user.role === 'product_owner') {
          deptConditions.push(`m.recipients @> '[\"product_owners\"]'::jsonb`);
        }

        if (user.specialization === 'technical_support') {
          deptConditions.push(`m.recipients @> '[\"technical_support\"]'::jsonb`);
        }

        whereConditions.push(`m.type = 'department' AND (${deptConditions.join(' OR ')})`);

        const result = await db.execute(sql`
          SELECT m.*, u.name as sender_name,
                 mr.read_at,
                 CASE WHEN mr.read_at IS NOT NULL THEN true ELSE false END as is_read
          FROM memos m
          LEFT JOIN users u ON m.sent_by = u.id
          LEFT JOIN memo_reads mr ON m.id = mr.memo_id AND mr.user_id = ${user.id}
          WHERE ${sql.raw(`(${whereConditions.join(') OR (')})`)}
          ORDER BY m.created_at DESC
        `);

        const userMemos = result.rows.map(row => ({
          id: row.id,
          title: row.title,
          content: row.content,
          type: row.type,
          recipients: row.recipients || [],
          sentBy: row.sent_by,
          senderName: row.sender_name,
          isRead: row.is_read,
          readAt: row.read_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        res.json(userMemos);
      } catch (error) {
        console.error("Error fetching user memos:", error);
        res.status(500).json({ error: "Failed to fetch user memos" });
      }
    }
  });

  // Create memo (Operations Manager only)
  app.post("/api/memos", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create memos" });
    }

    try {
      const {title, content, type, recipients} = req.body;

      if (!title || !content || !type) {
        return res.status(400).json({ error: "Title, content, and type are required" });
      }

      const validTypes = ["individual", "general", "department"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid memo type" });
      }

      // Create the memo
      const result = await db.execute(sql`
        INSERT INTO memos (title, content, type, recipients, sent_by, created_at, updated_at)
        VALUES (${title}, ${content}, ${type}, ${JSON.stringify(recipients || [])}::jsonb, ${user.id}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `);

      const newMemo = result.rows[0];

      // Determine recipients and send notifications
      let targetUsers = [];

      if (type === "general") {
        // Send to all users (everyone in the system except operations managers)
        const allUsersResult = await db.execute(sql`
          SELECT id, name FROM users
          WHERE role != 'operations_manager'
          AND specialization != 'operations_manager'
        `);
        targetUsers = allUsersResult.rows;
      } else if (type === "individual") {
        // Send to specific users
        if (recipients && recipients.length > 0) {
          const userIds = recipients.filter(r => typeof r === 'number');
          const placeholders = userIds.map(() => '?').join(',');
          const staffResult = await db.execute(sql`
            SELECT id, name FROM users WHERE id IN (${userIds.join(',')})
          `);
          targetUsers = staffResult.rows;
        }
      } else if (type === "department") {
        // Send to department members
        if (recipients && recipients.length > 0) {
          let conditions = [];
          recipients.forEach(dept => {
            if (dept === 'all_staff') {
              conditions.push("role = 'staff'");
            } else if (dept === 'project_managers') {
              conditions.push("role = 'project_manager'");
            } else if (dept === 'product_owners') {
              conditions.push("role = 'product_owner'");
            } else {
              conditions.push(`specialization = '${dept}'`);
            }
          });

          if (conditions.length > 0) {
            const staffResult = await db.execute(sql`
              SELECT id, name FROM users WHERE ${sql.raw(conditions.join(' OR '))}
            `);
            targetUsers = staffResult.rows;
          }
        }
      }

      // Send notifications to target users
      for (const targetUser of targetUsers) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: targetUser.id,
            type: "memo_received",
            content: `New memo: ${title}`,
            referenceId: newMemo.id,
            referenceType: "memo",
            createdAt: new Date(),
          })
          .returning();

        // Send real-time notification via SSE if user is connected
        const clientResponse = global.sseClients?.get(targetUser.id);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: notification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to user ${targetUser.id}:`, error);
            global.sseClients?.delete(targetUser.id);
          }
        }
      }

      res.json({
        message: "Memo sent successfully",
        memo: newMemo,
        recipientCount: targetUsers.length
      });
    } catch (error) {
      console.error("Error creating memo:", error);
      res.status(500).json({ error: "Failed to create memo" });
    }
  });

  // Mark memo as read
  app.post("/api/memos/:id/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const memoId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Insert or update read status (handle potential duplicate)
      await db.execute(sql`
        INSERT INTO memo_reads (memo_id, user_id, read_at)
        VALUES (${memoId}, ${userId}, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING
      `);

      res.json({ message: "Memo marked as read" });
    } catch (error) {
      console.error("Error marking memo as read:", error);
      res.status(500).json({ error: "Failed to mark memo as read" });
    }
  });

  // Get memo read receipts (Operations Manager only)
  app.get("/api/memos/:id/read-receipts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can view read receipts" });
    }

    try {
      const memoId = parseInt(req.params.id);

      // Verify the memo exists and was sent by this user
      const checkResult = await db.execute(sql`
        SELECT id, title FROM memos WHERE id = ${memoId} AND sent_by = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Memo not found or not authorized" });
      }

      // Get all users who have read this memo
      const readReceipts = await db.execute(sql`
        SELECT mr.user_id, mr.read_at, u.name, u.email, u.role, u.specialization
        FROM memo_reads mr
        JOIN users u ON mr.user_id = u.id
        WHERE mr.memo_id = ${memoId}
        ORDER BY mr.read_at DESC
      `);

      const readers = readReceipts.rows.map(row => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        specialization: row.specialization,
        readAt: row.read_at,
      }));

      res.json({
        memoId,
        memoTitle: checkResult.rows[0].title,
        totalReads: readers.length,
        readers
      });
    } catch (error) {
      console.error("Error fetching memo read receipts:", error);
      res.status(500).json({ error: "Failed to fetch read receipts" });
    }
  });

  // Delete memo (Operations Manager only)
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
      const checkResult = await db.execute(sql`
        SELECT id FROM memos WHERE id = ${memoId} AND sent_by = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Memo not found or not authorized" });
      }

      // Delete the memo (memo_reads will be deleted automatically due to CASCADE)
      await db.execute(sql`
        DELETE FROM memos WHERE id = ${memoId}
      `);

      res.json({ message: "Memo deleted successfully" });
    } catch (error) {
      console.error("Error deleting memo:", error);
      res.status(500).json({ error: "Failed to delete memo" });
    }
  });

  // Client Sentiment API Routes

  // Get current week sentiment for client
  app.get("/api/client-sentiment/current-week", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "client") {
      return res.status(403).json({ error: "Only clients can access this endpoint" });
    }

    try {
      // Get current week start (Monday) and end (Sunday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const [existingSentiment] = await db
        .select()
        .from(clientSentiment)
        .where(and(
          eq(clientSentiment.clientId, user.id),
          eq(clientSentiment.weekStart, monday)
        ))
        .limit(1);

      if (!existingSentiment) {
        return res.status(404).json({ message: "No sentiment found for current week" });
      }

      res.json({
        id: existingSentiment.id,
        clientId: existingSentiment.clientId,
        sentiment: existingSentiment.sentiment,
        reason: existingSentiment.reason,
        createdAt: existingSentiment.createdAt,
        weekStart: existingSentiment.weekStart,
        weekEnd: existingSentiment.weekEnd
      });
    } catch (error) {
      console.error("Error fetching current week sentiment:", error);
      res.status(500).json({ error: "Failed to fetch current week sentiment" });
    }
  });

  // Submit client sentiment
  app.post("/api/client-sentiment", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "client") {
      return res.status(403).json({ error: "Only clients can submit sentiment" });
    }

    try {
      const {sentiment, reason} = req.body;

      console.log("Client sentiment submission:", {userId: user.id, sentiment, reason});

      if (!sentiment || !reason) {
        return res.status(400).json({ error: "Sentiment and reason are required" });
      }

      if (!reason.trim()) {
        return res.status(400).json({ error: "Reason cannot be empty" });
      }

      const validSentiments = ["satisfied", "dissatisfied", "flags"];
      if (!validSentiments.includes(sentiment)) {
        return res.status(400).json({ error: "Invalid sentiment value" });
      }

      // Get current week start (Monday) and end (Sunday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      // Check if user already submitted for this week
      console.log("Checking for existing sentiment for user", user.id, "week starting", monday.toISOString());

      const existingSubmission = await db
        .select()
        .from(clientSentiment)
        .where(and(
          eq(clientSentiment.clientId, user.id),
          eq(clientSentiment.weekStart, monday)
        ))
        .limit(1);

      if (existingSubmission.length > 0) {
        console.log("User already submitted sentiment for this week");
        return res.status(400).json({ error: "You have already submitted sentiment for this week" });
      }

      // Insert new sentiment
      const mondayStr = monday.toISOString().split('T')[0];
      const sundayStr = sunday.toISOString().split('T')[0];

      console.log("Inserting client sentiment:", {
        client_id: user.id,
        sentiment,
        reason: reason.trim(),
        week_start: mondayStr,
        week_end: sundayStr
      });

      // Use Drizzle ORM instead of raw SQL for better compatibility
      const [newSentiment] = await db
        .insert(clientSentiment)
        .values({
          clientId: user.id,
          sentiment,
          reason: reason.trim(),
          weekStart: monday,
          weekEnd: sunday,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Notify operations managers
      const operationsManagers = await db
        .select()
        .from(users)
        .where(or(
          eq(users.specialization, "operations_manager"),
          eq(users.role, "operations_manager")
        ));

      for (const manager of operationsManagers) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: manager.id,
            type: "client_sentiment",
            content: `${user.name} submitted ${sentiment} sentiment: ${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}`,
            referenceId: newSentiment.id,
            referenceType: "client_sentiment",
            createdAt: new Date(),
          })
          .returning();

        // Send real-time notification via SSE
        const clientResponse = global.sseClients?.get(manager.id);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: notification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to operations manager ${manager.id}:`, error);
            global.sseClients?.delete(manager.id);
          }
        }
      }

      res.json({
        id: newSentiment.id,
        clientId: newSentiment.client_id,
        sentiment: newSentiment.sentiment,
        reason: newSentiment.reason,
        createdAt: newSentiment.created_at,
        weekStart: newSentiment.week_start,
        weekEnd: newSentiment.week_end
      });
    } catch (error) {
      console.error("Error submitting client sentiment:", error);
      res.status(500).json({ error: "Failed to submit client sentiment" });
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
      const {week} = req.query;
      let weekCondition = "";

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

        const dayOfWeek = targetDate.getDay();
        const diff = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(targetDate);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);

        weekCondition = `AND cs.week_start = '${monday.toISOString().split('T')[0]}'`;
      } else {
        // Current week
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);

        weekCondition = `AND cs.week_start = '${monday.toISOString().split('T')[0]}'`;
      }

      const result = await db.execute(sql`
        SELECT cs.*, u.name as client_name, u.email as client_email
        FROM client_sentiment cs
        JOIN users u ON cs.client_id = u.id
        WHERE 1=1 ${sql.raw(weekCondition)}
        ORDER BY cs.created_at DESC
      `);

      const sentiments = result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        clientEmail: row.client_email,
        sentiment: row.sentiment,
        reason: row.reason,
        createdAt: row.created_at,
        weekStart: row.week_start,
        weekEnd: row.week_end
      }));

      res.json(sentiments);
    } catch (error) {
      console.error("Error fetching all client sentiments:", error);
      res.status(500).json({ error: "Failed to fetch client sentiments" });
    }
  });

  // Communication Tracker API Routes

  // Get delayed responses for communication tracker
  app.get("/api/communication-tracker/delayed-responses", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access communication tracker" });
    }

    try {
      const { status, project, date } = req.query;

      // This would typically query a communication_delays table
      // For now, we'll create a mock response structure
      // In a real implementation, you'd need to track team chat message timestamps
      // and identify when responses are delayed beyond 1 hour

      const result = await db.execute(sql`
        SELECT 
          cd.*,
          p.name as project_name,
          u1.name as staff_name,
          u2.name as project_manager_name
        FROM communication_delays cd
        LEFT JOIN projects p ON cd.project_id = p.id
        LEFT JOIN users u1 ON cd.staff_id = u1.id
        LEFT JOIN users u2 ON cd.project_manager_id = u2.id
        WHERE 1=1
        ${status && status !== 'all' ? sql`AND cd.status = ${status}` : sql``}
        ${project && project !== 'all' ? sql`AND cd.project_id = ${parseInt(project as string)}` : sql``}
        ${date === 'today' ? sql`AND DATE(cd.created_at) = CURRENT_DATE` : sql``}
        ${date === 'yesterday' ? sql`AND DATE(cd.created_at) = CURRENT_DATE - INTERVAL '1 day'` : sql``}
        ${date === 'week' ? sql`AND cd.created_at >= CURRENT_DATE - INTERVAL '7 days'` : sql``}
        ${date === 'month' ? sql`AND cd.created_at >= CURRENT_DATE - INTERVAL '30 days'` : sql``}
        ORDER BY cd.created_at DESC
      `);

      const delayedResponses = result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        staffId: row.staff_id,
        staffName: row.staff_name,
        lastResponseTime: row.last_response_time,
        delayHours: row.delay_hours,
        status: row.status,
        projectManagerId: row.project_manager_id,
        projectManagerName: row.project_manager_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json(delayedResponses);
    } catch (error) {
      console.error("Error fetching delayed responses:", error);
      res.status(500).json({ error: "Failed to fetch delayed responses" });
    }
  });

  // Send warning for delayed response
  app.post("/api/communication-tracker/send-warning", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can send warnings" });
    }

    try {
      const { delayedResponseId, reason, advice, monetaryPenalty, staffId } = req.body;

      // Create warning record
      const result = await db.execute(sql`
        INSERT INTO communication_warnings (delayed_response_id, reason, advice, monetary_penalty, staff_id, sent_by)
        VALUES (${delayedResponseId}, ${reason}, ${advice}, ${monetaryPenalty}, ${staffId}, ${user.id})
        RETURNING *
      `);

      // Update the delayed response status
      await db.execute(sql`
        UPDATE communication_delays 
        SET status = 'warned', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${delayedResponseId}
      `);

      // Create notification for the staff member
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: staffId,
          type: "communication_warning",
          content: `Communication Warning: ${reason}`,
          referenceId: delayedResponseId,
          referenceType: "communication_delay",
          createdAt: new Date(),
        })
        .returning();

      // Send real-time notification via SSE
      const clientResponse = global.sseClients?.get(staffId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to staff ${staffId}:`, error);
          global.sseClients?.delete(staffId);
        }
      }

      res.json({ message: "Warning sent successfully", warning: result.rows[0] });
    } catch (error) {
      console.error("Error sending warning:", error);
      res.status(500).json({ error: "Failed to send warning" });
    }
  });

  // Escalate delayed response
  app.post("/api/communication-tracker/escalate", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can escalate" });
    }

    try {
      const { delayedResponseId } = req.body;

      // Create escalation record
      const result = await db.execute(sql`
        INSERT INTO communication_escalations (delayed_response_id, escalated_by, escalated_at, report_generated)
        VALUES (${delayedResponseId}, ${user.id}, CURRENT_TIMESTAMP, true)
        RETURNING *
      `);

      // Update the delayed response status
      await db.execute(sql`
        UPDATE communication_delays 
        SET status = 'escalated', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${delayedResponseId}
      `);

      res.json({ message: "Response escalated successfully", escalation: result.rows[0] });
    } catch (error) {
      console.error("Error escalating response:", error);
      res.status(500).json({ error: "Failed to escalate response" });
    }
  });

  // Discard communication query
  app.post("/api/communication-tracker/discard", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can discard queries" });
    }

    try {
      const { delayedResponseId, dateOfEntry, projectName, hoursLate, reason } = req.body;

      // Get the delayed response details
      const delayResult = await db.execute(sql`
        SELECT * FROM communication_delays WHERE id = ${delayedResponseId}
      `);

      const delay = delayResult.rows[0];
      if (!delay) {
        return res.status(404).json({ error: "Delayed response not found" });
      }

      // Create discard record
      const discardResult = await db.execute(sql`
        INSERT INTO communication_discards (delayed_response_id, date_of_entry, project_name, hours_late, reason, discarded_by)
        VALUES (${delayedResponseId}, ${dateOfEntry}, ${projectName}, ${hoursLate}, ${reason}, ${user.id})
        RETURNING *
      `);

      // Update the delayed response status
      await db.execute(sql`
        UPDATE communication_delays 
        SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${delayedResponseId}
      `);

      // Notify the staff member
      const [staffNotification] = await db
        .insert(notifications)
        .values({
          userId: delay.staff_id,
          type: "communication_query_discarded",
          content: `Communication query for ${projectName} has been discarded by operations manager: ${reason}`,
          referenceId: delayedResponseId,
          referenceType: "communication_delay",
          createdAt: new Date(),
        })
        .returning();

      // Notify the project manager
      const [pmNotification] = await db
        .insert(notifications)
        .values({
          userId: delay.project_manager_id,
          type: "communication_query_discarded",
          content: `Communication query for ${projectName} has been discarded by operations manager: ${reason}`,
          referenceId: delayedResponseId,
          referenceType: "communication_delay",
          createdAt: new Date(),
        })
        .returning();

      // Send real-time notifications
      [delay.staff_id, delay.project_manager_id].forEach(userId => {
        const clientResponse = global.sseClients?.get(userId);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: userId === delay.staff_id ? staffNotification : pmNotification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to user ${userId}:`, error);
            global.sseClients?.delete(userId);
          }
        }
      });

      res.json({ message: "Communication query discarded successfully", discard: discardResult.rows[0] });
    } catch (error) {
      console.error("Error discarding communication query:", error);
      res.status(500).json({ error: "Failed to discard communication query" });
    }
  });

  // Get daily communication report
  app.get("/api/communication-tracker/daily-report", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access reports" });
    }

    try {
      const { date } = req.query;
      const targetDate = date || new Date().toISOString().split('T')[0];

      // Get total delayed responses for the day
      const totalResult = await db.execute(sql`
        SELECT COUNT(*) as total_delayed
        FROM communication_delays
        WHERE DATE(created_at) = ${targetDate}
      `);

      // Get warnings sent for the day
      const warningsResult = await db.execute(sql`
        SELECT COUNT(*) as warnings_sent
        FROM communication_warnings cw
        JOIN communication_delays cd ON cw.delayed_response_id = cd.id
        WHERE DATE(cw.created_at) = ${targetDate}
      `);

      // Get escalations for the day
      const escalationsResult = await db.execute(sql`
        SELECT COUNT(*) as escalated
        FROM communication_escalations ce
        JOIN communication_delays cd ON ce.delayed_response_id = cd.id
        WHERE DATE(ce.escalated_at) = ${targetDate}
      `);

      // Get delays by project
      const projectDelaysResult = await db.execute(sql`
        SELECT p.name as project_name, COUNT(*) as count
        FROM communication_delays cd
        JOIN projects p ON cd.project_id = p.id
        WHERE DATE(cd.created_at) = ${targetDate}
        GROUP BY p.id, p.name
        ORDER BY count DESC
      `);

      const report = {
        date: targetDate,
        totalDelayed: totalResult.rows[0]?.total_delayed || 0,
        warningsSent: warningsResult.rows[0]?.warnings_sent || 0,
        escalated: escalationsResult.rows[0]?.escalated || 0,
        delayedByProject: projectDelaysResult.rows.map(row => ({
          projectName: row.project_name,
          count: row.count
        }))
      };

      res.json(report);
    } catch (error) {
      console.error("Error generating daily report:", error);
      res.status(500).json({ error: "Failed to generate daily report" });
    }
  });

  // Staff Complaint API Routes

  // Submit staff complaint
  app.post("/api/staff-complaints", upload.single('screenshot'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const {name, email, department, detailedExplanation} = req.body;

      if (!name || !email || !detailedExplanation) {
        return res.status(400).json({ error: "Name, email, and detailed explanation are required" });
      }

      // Handle screenshot if uploaded
      let screenshotUrl = null;
      if (req.file) {
        screenshotUrl = `/uploads/complaint-screenshots/${req.file.filename}`;
      }

      // Create staff complaint record
      const result = await db.execute(sql`
        INSERT INTO staff_complaints (name, email, department, detailed_explanation, screenshot_url, submitter_id)
        VALUES (${name.trim()}, ${email.trim()}, ${department || null}, ${detailedExplanation.trim()}, ${screenshotUrl || null}, ${req.user!.id})
        RETURNING *
      `);

      const newComplaint = result.rows[0];

      // Get all operations managers
      const operationsManagers = await db
        .select()
        .from(users)
        .where(or(
          eq(users.specialization, "operations_manager"),
          eq(users.role, "operations_manager")
        ));

      // Send notification to all operations managers
      for (const manager of operationsManagers) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: manager.id,
            type: "staff_complaint",
            content: `New staff complaint from ${name}: ${detailedExplanation.substring(0, 100)}...`,
            referenceId: newComplaint.id,
            referenceType: "staff_complaint",
            createdAt: new Date(),
          })
          .returning();

        // Send real-time notification via SSE if manager is connected
        const clientResponse = global.sseClients?.get(manager.id);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: notification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to operations manager ${manager.id}:`, error);
            global.sseClients?.delete(manager.id);
          }
        }
      }

      res.json({ message: "Staff complaint submitted successfully", complaint: newComplaint });
    } catch (error) {
      console.error("Error submitting staff complaint:", error);
      res.status(500).json({ error: "Failed to submit staff complaint" });
    }
  });

  // Get user's own complaints
  app.get("/api/complaints/my-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const result = await db.execute(sql`
        SELECT * FROM complaints WHERE submitter_id = ${req.user!.id} ORDER BY created_at DESC
      `);

      const userComplaints = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        productManagerName: row.product_manager_name,
        developerName: row.developer_name,
        technicalManagerName: row.technical_manager_name,
        valuableThings: row.valuable_things || [],
        detailedExplanation: row.detailed_explanation,
        screenshotUrl: row.screenshot_url,
        status: row.status || 'pending',
        reviewComments: row.review_comments,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at
      }));

      res.json(userComplaints);
    } catch (error) {
      console.error("Error fetching user complaints:", error);
      res.status(500).json({ error: "Failed to fetch user complaints" });
    }
  });

  // Get user's own staff complaints
  app.get("/api/staff-complaints/my-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const result = await db.execute(sql`
        SELECT * FROM staff_complaints WHERE submitter_id = ${req.user!.id} ORDER BY created_at DESC
      `);

      const userComplaints = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        detailedExplanation: row.detailed_explanation,
        screenshotUrl: row.screenshot_url,
        status: row.status || 'pending',
        reviewComments: row.review_comments,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at
      }));

      res.json(userComplaints);
    } catch (error) {
      console.error("Error fetching user staff complaints:", error);
      res.status(500).json({ error: "Failed to fetch user staff complaints" });
    }
  });

  // Get all staff complaints (Operations Manager only)
  app.get("/api/staff-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.specialization !== "operations_manager" && user.role !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can view staff complaints" });
    }

    try {
      const result = await db.execute(sql`
        SELECT * FROM staff_complaints ORDER BY created_at DESC
      `);

      const allComplaints = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        detailedExplanation: row.detailed_explanation,
        screenshotUrl: row.screenshot_url,
        status: row.status || 'pending',
        reviewComments: row.review_comments,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at
      }));

      res.json(allComplaints);
    } catch (error) {
      console.error("Error fetching staff complaints:", error);
      res.status(500).json({ error: "Failed to fetch staff complaints" });
    }
  });

  // Update staff complaint status (Operations Manager only)
  app.put("/api/staff-complaints/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.specialization !== "operations_manager" && user.role !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update staff complaints" });
    }

    try {
      const complaintId = parseInt(req.params.id);
      const {status, reviewComments} = req.body;

      const validStatuses = ["pending", "reviewed", "resolved"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Get the complaint details first to get submitter info
      const complaintResult = await db.execute(sql`
        SELECT submitter_id, name FROM staff_complaints WHERE id = ${complaintId}
      `);

      if (complaintResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff complaint not found" });
      }

      const complaint = complaintResult.rows[0];

      // Update the complaint
      const result = await db.execute(sql`
        UPDATE staff_complaints
        SET status = ${status},
            review_comments = ${reviewComments || null},
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ${complaintId}
        RETURNING *
      `);

      const updatedComplaint = result.rows[0];

      // Send notification to the staff member who submitted the complaint
      if (complaint.submitter_id) {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: complaint.submitter_id,
            type: "complaint_update",
            content: `Your complaint has been ${status}. ${reviewComments ? 'Review comments have been added.' : ''}`,
            referenceId: complaintId,
            referenceType: "staff_complaint",
            createdAt: new Date(),
          })
          .returning();

        // Send real-time notification via SSE if staff member is connected
        const clientResponse = global.sseClients?.get(complaint.submitter_id);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify({
              type: "notification",
              data: notification
            })}\n\n`);
          } catch (error) {
            console.error(`Error sending SSE notification to staff member ${complaint.submitter_id}:`, error);
            global.sseClients?.delete(complaint.submitter_id);
          }
        }
      }

      res.json(updatedComplaint);
    } catch (error) {
      console.error("Error updating staff complaint:", error);
      res.status(500).json({ error: "Failed to update staff complaint" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  return server;
}
</original>The code is updated to correctly check for operations manager role by including specialization in the team members access checks.
<replit_final_file>
import { Express, Response, Request, NextFunction } from "express";

// Extend Express Request interface to include authenticated user and body
interface AuthenticatedRequest extends Request {
  user?: any;
  body: any;
  isAuthenticated(): boolean;
}
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
  users,
  projects,
  tasks,
  projectMembers,
  projectPlans,
  deliverables,
  performance,
  UserRole,
  WorkStatus,
  AbsenceReason,
  UserStatus,
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
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull, or, sql, ne, gte, isNull } from "drizzle-orm";
import WebSocket from "ws";

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

// Middleware to check if user is a project manager or operations manager
const isProjectManagerOrOperationsManager = (req: Express.Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = req.user!;
  if (user.role !== UserRole.PROJECT_MANAGER && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
    return res.status(403).json({ error: "Only project managers and operations managers can perform this action" });
  }

  next();
};

// Middleware to check if user can manage tasks (project managers, technical support staff, product owners for Support & Maintenance, or operations managers)
  const canManageTasks = async (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';
    const isOperationsManager = user.role === 'operations_manager' || user.specialization === 'operations_manager';

    // Operations managers have full access to all tasks
    if (isProjectManager || isTechnicalSupport || isOperationsManager) {
      return next();
    }

    if (isProductOwner) {
      // For product owners, check if the project is Support & Maintenance category
      const {projectId} = req.body;
      if (projectId) {
        try {
          const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1);

          if (!project) {
            return res.status(404).json({ error: "Project not found" });
          }

          if (project.category !== "support_maintenance") {
            return res.status(403).json({
              error: "Product owners can only manage tasks in Support & Maintenance category projects"
            });
          }

          return next();
        } catch (error) {
          console.error("Error checking project category:", error);
          return res.status(500).json({ error: "Failed to verify project permissions" });
        }
      } else {
        // Allow product owners to proceed if no projectId in body (they'll select project in form)
        return next();
      }
    }

    return res.status(403).json({ error: "Only project managers, technical support staff, product owners (for Support & Maintenance projects), and operations managers can perform this action" });
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
  limits: {fileSize: 5 * 1024 * 1024}, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Staff query attachments storage
const staffQueryUploadDir = path.join(process.cwd(), 'uploads', 'staff-query-attachments');
if (!fs.existsSync(staffQueryUploadDir)) {
  fs.mkdirSync(staffQueryUploadDir, { recursive: true });
}

const staffQueryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, staffQueryUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const staffQueryUpload = multer({
  storage: staffQueryStorage,
  limits: {fileSize: 10 * 1024 * 1024}, // 10MB limit for documents
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    const allowedTypes = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDF, and Word documents are allowed'));
    }
  }
});

// Function to broadcast messages to project members
async function broadcastToProject(projectId: number, message: any) {
  try {
    // Get project members
    const projectMembersData = await db
      .select({
        userId: projectMembers.userId
      })
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.invitationStatus, "accepted")
      ));

    // Send to all project members via SSE
    for (const member of projectMembersData) {
      if (member.userId) {
        const clientResponse = global.sseClients?.get(member.userId);
        if (clientResponse && !clientResponse.writableEnded) {
          try {
            clientResponse.write(`data: ${JSON.stringify(message)}\n\n`);
          } catch (error) {
            console.error(`Error broadcasting to user ${member.userId}:`, error);
            global.sseClients?.delete(member.userId);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error broadcasting to project:", error);
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const server = createServer(app);

  // Debug endpoint for client team members
  app.get("/api/client/team-members/debug", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "client") {
      return res.status(403).json({ error: "Only clients can access this debug info" });
    }

    try {
      // Get client's projects
      const clientProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.clientId, user.id));

      // Get all users with relevant roles
      const allRelevantUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
        })
        .from(users)
        .where(or(
          eq(users.role, "product_owner"),
          eq(users.role, "project_manager"),
          eq(users.role, "operations_manager"),
          and(eq(users.role, "staff"), eq(users.specialization, "technical_support")),
          and(eq(users.role, "staff"), eq(users.specialization, "developer"))
        ));

      res.json({
        clientId: user.id,
        clientName: user.name,
        clientProjects: clientProjects,
        allRelevantUsers: allRelevantUsers,
        message: "Debug info for troubleshooting team members"
      });
    } catch (error) {
      console.error("Error in debug endpoint:", error);
      res.status(500).json({ error: "Failed to fetch debug info" });
    }
  });

  // Get team members for client (Client only) - Filtered based on specific criteria
  app.get("/api/client/team-members", async (req, res) => {
    console.log("Client team members endpoint hit");
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    console.log(`User accessing team members: ${user.name} (${user.role})`);
    if (user.role !== "client") {
      console.log(`Access denied - user role is ${user.role}, not client`);
      return res.status(403).json({ error: "Only clients can access team members" });
    }

    try {
      // Get client's projects
      const clientProjects = await db
        .select({id: projects.id, managerId: projects.managerId})
        .from(projects)
        .where(eq(projects.clientId, user.id));

      const projectIds = clientProjects.map(p => p.id);
      const projectManagerIds = [...new Set(clientProjects.map(p => p.managerId).filter(Boolean))];

      let allowedContacts: any[] = [];

      if (projectIds.length > 0) {
        // 1. Get Project Managers (who manage the client's projects)
        const projectManagers = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(users.id, projectManagerIds)
            )
          )
          .orderBy(users.name);

        // Also get Product Owners who might have created tasks or been involved
        const productOwners = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              eq(users.role, "product_owner")
            )
          )
          .orderBy(users.name);

        // 2. Get Technical Support Staff assigned to client's projects
        const technicalSupportStaff = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .innerJoin(projectMembers, eq(users.id, projectMembers.userId))
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(projectMembers.projectId, projectIds),
              eq(projectMembers.invitationStatus, "accepted"),
              eq(users.role, "staff"),
              eq(users.specialization, "technical_support")
            )
          )
          .orderBy(users.name);

        // 4. Get Developer staff assigned to client's projects
        const developerStaff = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            specialization: users.specialization,
            status: users.status,
            lastActive: users.lastActive,
          })
          .from(users)
          .innerJoin(projectMembers, eq(users.id, projectMembers.userId))
          .where(
            and(
              ne(users.id, user.id), // Exclude the current user
              inArray(projectMembers.projectId, projectIds),
              eq(projectMembers.invitationStatus, "accepted"),
              eq(users.role, "staff"),
              eq(users.specialization, "developer")
            )
          )
          .orderBy(users.name);

        allowedContacts = [...projectManagers, ...productOwners, ...technicalSupportStaff, ...developerStaff];
      }

      // 3. Always include Operations Manager regardless of project assignment
      const operationsManagers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          specialization: users.specialization,
          status: users.status,
          lastActive: users.lastActive,
        })
        .from(users)
        .where(
          and(
            ne(users.id, user.id), // Exclude the current user
            or(
              eq(users.specialization, "operations_manager"),
              eq(users.role, "operations_manager")
            )
          )
        )
        .orderBy(users.name);

      // Combine and remove duplicates
      const allAllowedContacts = [...allowedContacts, ...operationsManagers];
      const uniqueContacts = allAllowedContacts.filter((contact, index, self) =>
        index === self.findIndex(c => c.id === contact.id)
      );

      console.log(`Found ${uniqueContacts.length} allowed contacts for client ${user.name}`);
      res.json(uniqueContacts);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // Get available clients (for project managers, product owners, and operations managers)
  app.get("/api/clients", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    if (!isProjectManager && !isProductOwner && !isOperationsManager) {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can access clients" });
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

  // Update existing users' break times (one-time setup)
  app.post("/api/setup-break-times", async (req, res) => {
    if (!req.isAuthenticated() || req.user!.role !== "project_manager") {
      return res.status(403).send("Only project managers can perform this action");
    }

    try {
      // Update specific users' break times
      await db.update(users)
        .set({breakOneTime: "22:00", breakTwoTime: "12:00"})
        .where(eq(users.username, "testpm"));

      await db.update(users)
        .set({breakOneTime: "12:30", breakTwoTime: "15:00"})
        .where(eq(users.username, "testuser"));

      await db.update(users)
        .set({breakOneTime: "13:00", breakTwoTime: "16:00"})
        .where(eq(users.username, "Staff1"));

      res.json({message: "Break times updated successfully for existing users"});
    } catch (error) {
      console.error("Error updating break times:", error);
      res.status(500).json({ error: "Failed to update break times" });
    }
  });

  // Get available staff by specialization (for project managers, product owners, and operations managers)
  app.get("/api/staff", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    // Only project managers, product owners, and operations managers can view staff
    if (!isProjectManager && !isProductOwner && !isOperationsManager) {
      return res.status(403).send("Access denied");
    }
    const {specialization} = req.query;

    // Get both staff and product owners
    let query = db
      .select()
      .from(users)
      .where(or(
        eq(users.role, "staff"),
        eq(users.role, "product_owner")
      ));

    // Only apply specialization filter to staff members, not product owners
    if (specialization) {
      query = query.where(and(
        eq(users.role, "staff"),
        eq(users.specialization, specialization as string)
      ));

      // Also include all product owners regardless of specialization filter
      const productOwners = await db
        .select()
        .from(users)
        .where(eq(users.role, "product_owner"))
        .orderBy(desc(users.lastActive));

      const staffWithSpecialization = await query.orderBy(desc(users.lastActive));

      const combined = [...staffWithSpecialization, ...productOwners];
      return res.json(combined);
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

  // Test endpoint to add current staff member or product owner to the first available project
  app.post("/api/debug/add-me-to-project", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).send("Only staff members and product owners can use this endpoint");
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
  app.get("/api/staff-report", isProjectManagerOrOperationsManager, async (req, res) => {
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

          // Calculate remaining hours
          const remainingHours = (task.workingHours || 0) - totalHoursSpent;
          const remainingHoursRounded = Math.ceil(remainingHours);

          return {
            staffId: staff.id,
            taskId: task.id,
            taskTitle: task.title,
            projectId: task.projectId,
            projectName: task.projectName,
            assignedHours: task.workingHours,
            totalHoursSpent: Math.round(totalHoursSpent * 100) / 100,
            currentSessionHours: Math.round(currentSessionHours * 100) / 100,
            remainingHours: remainingHoursRounded,
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
      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

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

  // Update project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.put("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const {category} = req.body;

    // Verify the project exists first
    const [existingProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check permissions
    if (user.role === "project_manager") {
      // Project managers can edit any project they manage
      if (existingProject.managerId !== user.id) {
        return res.status(403).json({
          error: "You don't have permission to edit this project"
        });
      }
    } else if (user.role === "product_owner") {
      // Product owners can only edit Support & Maintenance projects
      if (existingProject.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only edit Support & Maintenance category projects"
        });
      }
      // Also check if they're trying to change category away from support_maintenance
      if (category && category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners cannot change projects away from Support & Maintenance category"
        });
      }
    } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
      // Operations managers can edit any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can edit projects" });
    }
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

      // Verify project permissions are already checked above
      // No need for additional manager-only check here

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

  // Delete project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.delete("/api/projects/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    // Verify the project exists first
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check permissions
    if (user.role === "project_manager") {
      // Project managers can delete projects they manage
      if (project.managerId !== user.id) {
        return res.status(403).json({
          error: "You don't have permission to delete this project"
        });
      }
    } else if (user.role === "product_owner") {
      // Product owners can only delete Support & Maintenance projects
      if (project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only delete Support & Maintenance category projects"
        });
      }
    } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
      // Operations managers can delete any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can delete projects" });
    }

    try {

      // First delete related records to avoid foreign key constraint errors

      // Delete deliverables from project plans
      const projectPlansList = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

      for (const plan of projectPlansList) {
        await db
          .delete(deliverables)
          .where(eq(deliverables.projectPlanId, plan.id));
      }

      // Delete project plans
      await db
        .delete(projectPlans)
        .where(eq(projectPlans.projectId, projectId));

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

      // Delete project team messages
      await db
        .delete(projectMessages)
        .where(eq(projectMessages.projectId, projectId));

      // Delete client invitations
      await db
        .delete(clientInvitations)
        .where(eq(clientInvitations.projectId, projectId));

      // Delete notifications related to this project
      await db
        .delete(notifications)
        .where(and(
          eq(notifications.referenceId, projectId),
          eq(notifications.referenceType, "project")
        ));

      // Delete project resources
      await db
        .delete(resources)
        .where(eq(resources.projectId, projectId));

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

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          membershipRole: projectMembers.role,
          joinedAt: projectMembers.joinedAt
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
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
        // Clients see projects they're assigned to as clientId
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
      } else if (user.role === "product_owner") {
        // Product owners see all projects (read-only access)
        console.log(`Fetching all projects for product owner user ${user.id} (${user.name})`);
        projectsList = await db
          .select()
          .from(projects)
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Operations managers see all projects with full access
        console.log(`Fetching all projects for operations manager user ${user.id} (${user.name})`);
        projectsList = await db
          .select()
          .from(projects)
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
            console.log("Available projects:", totalProjects.map(p => ({id: p.id, name: p.name})));
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

  // Create Project (Project Manager, Product Owner for Support & Maintenance, and Operations Manager)
  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const {category} = req.body;

    // Check permissions
    const isProjectManager = user.role === "project_manager";
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    if (isProjectManager) {
      // Project managers can create any project
    } else if (isProductOwner) {
      // Product owners can only create Support & Maintenance projects
      if (category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only create Support & Maintenance category projects"
        });
      }
    } else if (isOperationsManager) {
      // Operations managers can create any project
    } else {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can create projects" });
    }
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

      // Create project with or without client
      [newProject] = await db
        .insert(projects)
        .values({
          name,
          description,
          type,
          category,
          clientId: clientId || null,
          managerId: req.user!.id,
          status: "pending",
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Automatically add operations manager to all projects
      try {
        const operationsManagers = await db
          .select()
          .from(users)
          .where(or(
            eq(users.role, "operations_manager"),
            eq(users.specialization, "operations_manager")
          ));

        for (const opsManager of operationsManagers) {
          await db
            .insert(projectMembers)
            .values({
              projectId: newProject.id,
              userId: opsManager.id,
              invitedBy: req.user!.id,
              invitationStatus: "accepted",
              joinedAt: new Date()
            });

          // Create notification for the operations manager
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: opsManager.id,
              type: "task_assigned",
              content: `You have been automatically added to the project: ${newProject.name}`,
              referenceId: newProject.id,
              referenceType: "project",
              createdAt: new Date(),
            })
            .returning();

          // Send notification through SSE if user is connected
          const clientResponse = global.sseClients?.get(opsManager.id);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
            } catch (error) {
              console.error(`Error sending SSE notification to operations manager ${opsManager.id}:`, error);
              global.sseClients.delete(opsManager.id);
            }
          }
        }
      } catch (error) {
        console.error("Error adding operations managers to project:", error);
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
      const {userId} = req.body;

      // Verify user is a staff member or product owner
      const [staff] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          or(eq(users.role, "staff"), eq(users.role, "product_owner"))
        ))
        .limit(1);

      if (!staff) {
        return res.status(400).json({ error: "Invalid staff member or product owner" });
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

  // Accept/decline project invitation (Staff and Product Owners only)
  app.post("/api/projects/:id/respond", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).send("Only staff members and product owners can respond to invitations");
    }

    try {
      const projectId = parseInt(req.params.id);
      const {accept} = req.body;

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
      if (req.user!.role === "client") {
        // Clients see tasks in their projects
        const clientProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, req.user!.id));

        const projectIds = clientProjects.map(p => p.id);
        if (projectIds.length > 0) {
          userTasks = await db
            .select()
            .from(tasks)
            .where(inArray(tasks.projectId, projectIds))
            .orderBy(desc(tasks.updatedAt));
        }
      } else if (req.user!.role === "staff") {
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
      } else if (req.user!.role === "product_owner") {
        // Product owners see all tasks (read-only access)
        userTasks = await db
          .select()
          .from(tasks)
          .orderBy(desc(tasks.updatedAt));
      } else if (req.user!.role === "client" && req.user!.clientType === "support_maintenance_client") {
        // Support maintenance clients see tasks in their projects
        const clientProjects = await db
          .select({projectId: projectMembers.projectId})
          .from(projectMembers)
          .where(eq(projectMembers.userId, req.user!.id));

        if (clientProjects.length > 0) {
          const projectIds = clientProjects.map(p => p.projectId);
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

  // Create Task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const {title, description, status, assigneeId, deadline, projectId, startDate, workingHours} = req.body;

    if (!title || !projectId) {
      return res.status(400).json({ error: "Title and project ID are required" });
    }

    try {
      // Verify project exists and get its category
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Check permissions
      const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
      const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
      const isProductOwner = user.role === 'product_owner';

      if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
        return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can create tasks" });
      }

      // For product owners, check if the project is Support & Maintenance category
      if (isProductOwner && project.category !== "support_maintenance") {
        return res.status(403).json({
          error: "Product owners can only create tasks in Support & Maintenance category projects"
        });
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

  // Update task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.put("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    // Get the task and its project to check category
    const [task] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        projectCategory: projects.category,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Check permissions
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';

    if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
      return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can update tasks" });
    }

    // For product owners, check if the project is Support & Maintenance category
    if (isProductOwner && task.projectCategory !== "support_maintenance") {
      return res.status(403).json({
        error: "Product owners can only update tasks in Support & Maintenance category projects"
      });
    }
    try {
      const taskId = parseInt(req.params.id);
      const {title, description, status, assigneeId, deadline, startDate, workingHours} = req.body;

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
      const {status} = req.body;

      // Validate status
      const validStatuses = ["todo", "in_progress", "review", "completed", "technical_support"];
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

      // If setting to completed, review, or technical_support, stop the timer
      if (status === "completed" || status === "review" || status === "technical_support") {
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

  // Delete task (Project Manager, Technical Support, and Product Owner for Support & Maintenance only)
  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const taskId = parseInt(req.params.id);

    // Get the task and its project to check category
    const [task] = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        projectCategory: projects.category,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Check permissions
    const isProjectManager = user.role === UserRole.PROJECT_MANAGER;
    const isTechnicalSupport = user.role === UserRole.STAFF && user.specialization === 'technical_support';
    const isProductOwner = user.role === 'product_owner';

    if (!isProjectManager && !isTechnicalSupport && !isProductOwner) {
      return res.status(403).json({ error: "Only project managers, technical support staff, and product owners can delete tasks" });
    }

    // For product owners, check if the project is Support & Maintenance category
    if (isProductOwner && task.projectCategory !== "support_maintenance") {
      return res.status(403).json({
        error: "Product owners can only delete tasks in Support & Maintenance category projects"
      });
    }
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
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.user || !req.user.id) {
      console.log("SSE connection attempted without valid user session");
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

    // Keep connection alive
    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        global.sseClients?.delete(userId);
        return;
      }
      try {
        res.write(": keepalive\n\n");
      } catch (error) {
        console.error(`Error sending keepalive to user ${userId}:`, error);
        clearInterval(keepAlive);
        global.sseClients?.delete(userId);
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
        .set({read: true})
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
    const {type} = req.query;

    try {
      // Get messages with user information
      let query = db
        .select({
          id: messages.id,
          content: messages.content,
          type: messages.type,
          projectId: messages.projectId,
          userId: messages.userId,
          createdAt: messages.createdAt,
          user: {
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          }
        })
        .from(messages)
        .innerJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.projectId, projectId));

      if (type) {
        query = query.where(eq(messages.type, type as string));
      }

      const projectMessages = await query.orderBy(asc(messages.createdAt));
      console.log(`Returning ${projectMessages.length} messages for project ${projectId}, type: ${type}`);
      res.json(projectMessages);
    } catch (error) {
      console.error("Error fetching project messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Send a message
  app.post("/api/projects/:id/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);
    const {content, type} = req.body;

    try {
      console.log(`Sending message to project ${projectId}, type: ${type}, from user: ${req.user!.id}`);

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

      console.log("Message saved to database:", message);

      // Get project members to notify
      const projectMembersData = await db
        .select({
          userId: projectMembers.userId
        })
        .from(projectMembers)
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.invitationStatus, "accepted")
        ));

      // Send real-time notifications to all project members via SSE
      for (const member of projectMembersData) {
        if (member.userId && member.userId !== req.user!.id) {
          const clientResponse = global.sseClients?.get(member.userId);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "project_message",
                data: {
                  ...message,
                  projectId,
                  type,
                  senderName: req.user!.name
                }
              })}\n\n`);
              console.log(`Project message notification sent to user ${member.userId} via SSE`);
            } catch (error) {
              console.error(`Error sending SSE notification to user ${member.userId}:`, error);
              global.sseClients?.delete(member.userId);
            }
          }
        }
      }

      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
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

  // Add link resource (Project Manager, Product Owner, and Operations Manager)
  app.post("/api/projects/:id/resources/link", async (req, res) => {
    console.log("Link upload endpoint called");
    console.log("Request params:", req.params);
    console.log("Request body:", req.body);
    console.log("User:", req.user);

    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    console.log("User role:", user.role);

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      console.log("User role not authorized:", user.role);
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can add links" });
    }

    try {
      const projectId = parseInt(req.params.id);
      const {name, link, category} = req.body;

      console.log("Adding link resource:", {projectId, name, link, category, userId: user.id});

      if (!name || !link || !category) {
        console.log("Missing name, link, or category");
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
        console.log("URL validation passed");
      } catch (error) {
        console.log("URL validation failed:", error);
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        console.log("Checking project manager access");
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
        console.log("Project manager access:", hasAccess);
      } else if (user.role === "product_owner") {
        console.log("Checking product owner access");
        // Product owners can add links to any project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
        console.log("Product owner access:", hasAccess);
      }

      if (!hasAccess) {
        console.log("Access denied to project");
        return res.status(403).json({ error: "Access denied to this project" });
      }

      console.log("Inserting resource into database");
      const [newResource] = await db
        .insert(resources)
        .values({
          name: name.trim(),
          type: category.trim(), // Use the category field directly
          link: link.trim(),
          projectId,
          uploadedBy: user.id,
          createdAt: new Date(),
        })
        .returning();

      console.log("Created resource:", newResource);

      // Get the resource with uploader name
      const [resourceWithUploader] = await db
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
        .where(eq(resources.id, newResource.id))
        .limit(1);

      console.log("Returning resource with uploader:", resourceWithUploader);

      res.json(resourceWithUploader);
    } catch (error) {
      console.error("Error adding link resource:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(500).json({
        error: "Failed to add link resource",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Edit link resource (Project Manager, Product Owner, and Operations Manager)
  app.put("/api/projects/:projectId/resources/:resourceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can edit resources" });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const resourceId = parseInt(req.params.resourceId);
      const {name, link, category} = req.body;

      if (!name || !link || !category) {
        return res.status(400).json({ error: "Name, link, and category are required" });
      }

      // Validate URL format
      try {
        new URL(link);
      } catch (error) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (user.role === "product_owner") {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Verify resource exists and is a link
      const [resource] = await db
        .select()
        .from(resources)
        .where(and(
          eq(resources.id, resourceId),
          eq(resources.projectId, projectId),
          eq(resources.type, "link")
        ))
        .limit(1);

      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      // Update the resource
      const [updatedResource] = await db
        .update(resources)
        .set({
          name: name.trim(),
          link: link.trim(),
          type: category.trim(), // Update category as well
        })
        .where(eq(resources.id, resourceId))
        .returning();

      // Get the updated resource with uploader name
      const [resourceWithUploader] = await db
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
        .where(eq(resources.id, resourceId))
        .limit(1);

      res.json(resourceWithUploader);
    } catch (error) {
      console.error("Error updating link resource:", error);
      res.status(500).json({
        error: "Failed to update link resource",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete resource (Project Manager, Product Owner, and Operations Manager)
  app.delete("/api/projects/:projectId/resources/:resourceId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;

    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can delete resources" });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const resourceId = parseInt(req.params.resourceId);

      // Verify user has access to this project
      let hasAccess = false;
      if (user.role === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, user.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (user.role === "product_owner") {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Verify resource exists in this project
      const [resource] = await db
        .select()
        .from(resources)
        .where(and(
          eq(resources.id, resourceId),
          eq(resources.projectId, projectId)
        ))
        .limit(1);

      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      // Delete the resource
      await db
        .delete(resources)
        .where(eq(resources.id, resourceId));

      res.json({ message: "Resource deleted successfully" });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({
        error: "Failed to delete resource",
        details: error instanceof Error ? error.message : String(error)
      });
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

      return res.json({status: "success"});
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
            .set({status: UserStatus.IDLE})
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
      const {status} = req.body;

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
      console.log(`Fetching project plans for project ${projectId}`);

      const plans = await db
        .select()
        .from(projectPlans)
        .where(eq(projectPlans.projectId, projectId))
        .orderBy(desc(projectPlans.updatedAt));

      console.log(`Found ${plans.length} project plans:`, plans);
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

  // Update project plan (Project Manager only)
  app.put("/api/project-plans/:id", isProjectManager, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const {name, description, startDate, endDate, deliverables: planDeliverables} = req.body;

      console.log("Updating project plan:", planId);
      console.log("Plan data:", {name, description, startDate, endDate, deliverables: planDeliverables});

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
          updatedAt: new Date(),
        })
        .where(eq(projectPlans.id, planId))
        .returning();

      // Delete existing deliverables
      await db
        .delete(deliverables)
        .where(eq(deliverables.projectPlanId, planId));

      // Create new deliverables
      if (planDeliverables && Array.isArray(planDeliverables) && planDeliverables.length > 0) {
        const deliverableValues = planDeliverables.map((deliverable: any, index: number) => {
          const deliverableStartDate = new Date(deliverable.startDate);
          const deliverableEndDate = new Date(deliverable.endDate);

          if (isNaN(deliverableStartDate.getTime()) || isNaN(deliverableEndDate.getTime())) {
            throw new Error(`Invalid date format in deliverable ${index + 1}`);
          }

          return {
            projectPlanId: planId,
            name: deliverable.name,
            startDate: deliverableStartDate,
            endDate: deliverableEndDate,
            order: index + 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        await db.insert(deliverables).values(deliverableValues);
      }

      // Fetch updated plan with deliverables
      const updatedDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.projectPlanId, planId))
        .orderBy(asc(deliverables.order));

      res.json({...updatedPlan, deliverables: updatedDeliverables});
    } catch (error) {
      console.error("Error updating project plan:", error);
      res.status(500).json({ error: "Failed to update project plan" });
    }
  });

  // Create project plan (Project Manager only)
  app.post("/api/projects/:id/plans", isProjectManager, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const {name, description, startDate, endDate, deliverables: createPlanDeliverables} = req.body;

      console.log("Creating project plan for project:", projectId);
      console.log("Plan data:", {name, description, startDate, endDate, deliverables: createPlanDeliverables});

      if (!name) {
        return res.status(400).json({ error: "Plan name is required" });
      }

      if (!createPlanDeliverables || !Array.isArray(createPlanDeliverables) || createPlanDeliverables.length === 0) {
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
        parsedEndDate = new Date(endDate);
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
      if (createPlanDeliverables && Array.isArray(createPlanDeliverables) && createPlanDeliverables.length > 0) {
        const deliverableValues = createPlanDeliverables.map((deliverable: any, index: number) => {
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
      const {name, description, startDate, endDate, status, deliverables: updatePlanDeliverables} = req.body;

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
      if (updatePlanDeliverables && Array.isArray(updatePlanDeliverables)) {
        // Delete existing deliverables
        await db
          .delete(deliverables)
          .where(eq(deliverables.projectPlanId, planId));

        // Create new deliverables
        if (updatePlanDeliverables.length > 0) {
          const deliverableValues = updatePlanDeliverables.map((deliverable: any, index: number) => {
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
      const {status} = req.body;

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

  // Get leave applications for the current user (Staff and Product Owners only)
  app.get("/api/leave-applications", async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).json({ error: "Only staff members and product owners can view leave applications" });
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

  // Submit leave application (Staff and Product Owners only)
  app.post("/api/leave-applications", upload.single('proofImage'), async (req, res) => {
    if (!req.isAuthenticated() || (req.user!.role !== "staff" && req.user!.role !== "product_owner")) {
      return res.status(403).json({ error: "Only staff members and product owners can submit leave applications" });
    }

    try {
      const {leaveType, reason, startDate, endDate} = req.body;

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
              global.sseClients?.delete(pm.id);
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

  // Get all leave applications (Project Manager and Operations Manager)
  app.get("/api/leave-applications/all", isProjectManagerOrOperationsManager, async (req, res) => {
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

  // Review leave application (Project Manager and Operations Manager)
  app.put("/api/leave-applications/:id/review", isProjectManagerOrOperationsManager, async (req, res) => {
    try {
      const applicationId = parseInt(req.params.id);
      const {status, reviewComments} = req.body;

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
          // Staff should be on leave
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
          global.sseClients?.delete(updatedApplication.userId);
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

  // Get unread direct messages count
  app.get("/api/direct-messages/unread-count", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.user!.id;

      // Validate user ID is a valid number
      if (!userId || isNaN(userId) || !Number.isInteger(userId)) {
        console.error("Invalid user ID for unread count:", userId);
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const result = await db
        .select({count: sql<number>`count(*)`})
        .from(directMessages)
        .where(
          and(
            eq(directMessages.receiverId, userId),
            eq(directMessages.read, false)
          )
        );

      const count = result[0]?.count || 0;
      res.json({count});
    } catch (error) {
      console.error("Error fetching unread messages count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Get conversations (list of users the current user has messaged with)
  app.get("/api/direct-messages/conversations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;

      // Validate user ID is a valid number
      if (!userId || isNaN(userId) || !Number.isInteger(userId)) {
        console.error("Invalid user ID for conversations:", userId);
        return res.status(400).json({ error: "Invalid user ID" });
      }

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

      // Validate user IDs
      if (!currentUserId || isNaN(currentUserId) || !Number.isInteger(currentUserId)) {
        console.error("Invalid current user ID:", currentUserId);
        return res.status(400).json({ error: "Invalid current user ID" });
      }

      if (isNaN(otherUserId) || !Number.isInteger(otherUserId)) {
        console.error("Invalid other user ID:", req.params.userId);
        return res.status(400).json({ error: "Invalid user ID parameter" });
      }

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

      // Mark messages as read
      await db
        .update(directMessages)
        .set({read: true})
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
      const {receiverId, content} = req.body;
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
          global.sseClients?.delete(receiverId);
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

  // Get team messages for a project
  app.get("/api/projects/:projectId/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "operations_manager") {
        // Operations managers have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      const teamMessages = await db
        .select({
          id: projectMessages.id,
          content: projectMessages.content,
          createdAt: projectMessages.createdAt,
          senderId: projectMessages.senderId,
          sender: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(projectMessages)
        .leftJoin(users, eq(projectMessages.senderId, users.id))
        .where(eq(projectMessages.projectId, projectId))
        .orderBy(desc(projectMessages.createdAt))
        .limit(50);

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

    try {
      const projectId = parseInt(req.params.projectId);
      const {content} = req.body;
      const userId = req.user!.id;

      if (isNaN(projectId)) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required" });
      }

      // Verify user has access to this project
      const userRole = req.user!.role;
      let hasAccess = false;

      if (userRole === "project_manager") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.managerId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "product_owner") {
        // Product owners have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "operations_manager") {
        // Operations managers have access to all projects
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        hasAccess = !!project;
      } else if (userRole === "staff") {
        const [membership] = await db
          .select()
          .from(projectMembers)
          .where(and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, req.user!.id),
            eq(projectMembers.invitationStatus, "accepted")
          ))
          .limit(1);
        hasAccess = !!membership;
      } else if (userRole === "client") {
        const [project] = await db
          .select()
          .from(projects)
          .where(and(
            eq(projects.id, projectId),
            eq(projects.clientId, req.user!.id)
          ))
          .limit(1);
        hasAccess = !!project;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      // Get project members for mention processing
      const projectMembersData = await db
        .select({
          userId: projectMembers.userId,
          userName: users.name,
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.invitationStatus, "accepted")
        ));

      const [message] = await db
        .insert(projectMessages)
        .values({
          projectId,
          senderId: userId,
          content: content.trim(),
        })
        .returning();

      // Parse mentions from message content
      const mentionRegex = /@([a-zA-Z0-9_\s]+)/g;
      const mentions = [];
      let match;

      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedName = match[1].trim();
        // Find the mentioned user in project members
        const mentionedMember = projectMembersData.find(member =>
          member.userName && member.userName.toLowerCase() === mentionedName.toLowerCase()
        );

        if (mentionedMember && mentionedMember.userId !== userId) {
          mentions.push(mentionedMember.userId);
        }
      }

      // Create notifications for mentioned users
      for (const mentionedUserId of mentions) {
        try {
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: mentionedUserId,
              type: "mention",
              content: `${req.user!.name} mentioned you in team chat: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
              referenceId: projectId,
              referenceType: "project",
              createdAt: new Date(),
            })
            .returning();

          // Send real-time notification via SSE if user is connected
          const clientResponse = global.sseClients?.get(mentionedUserId);
          if (clientResponse && !clientResponse.writableEnded) {
            try {
              clientResponse.write(`data: ${JSON.stringify({
                type: "notification",
                data: notification
              })}\n\n`);
              console.log(`Team chat mention notification sent to user ${mentionedUserId} via SSE`);
            } catch (error) {
              console.error(`Error sending SSE notification to user ${mentionedUserId}:`, error);
              global.sseClients?.delete(mentionedUserId);
            }
          }
        } catch (error) {
          console.error(`Error creating notification for mentioned user ${mentionedUserId}:`, error);
        }
      }

      // Get the message with sender info
      const messageWithSender = await db
        .select({
          id: projectMessages.id,
          content: projectMessages.content,
          createdAt: projectMessages.createdAt,
          senderId: projectMessages.senderId,
          sender: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(projectMessages)
        .leftJoin(users, eq(projectMessages.senderId, users.id))
        .where(eq(projectMessages.id, message.id))
        .limit(1);

      const messageData = messageWithSender[0];

      // Broadcast to team members via SSE
      broadcastToProject(projectId, {
        type: "team_message",
        data: messageData,
      });

      res.status(201).json(messageData);
    } catch (error) {
      console.error("Error sending team message:", error);
      res.status(500).json({ error: "Failed to send team message" });
    }
  });

  // Get unread team message counts for all user's projects
  app.get("/api/projects/unread-counts", async (req, res) => {
    if (!req.isAuthenticated() || !req.user || !req.user.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // More lenient validation - just check if userId exists and is a valid number
      if (!userId || typeof userId !== 'number' || isNaN(userId) || userId <= 0) {
        console.error("Invalid user ID:", { userId, userType: typeof userId });
        return res.json({}); // Return empty object instead of error
      }

      let allProjectIds: number[] = [];

      if (userRole === "product_owner" || userRole === "operations_manager" || req.user!.specialization === "operations_manager") {
        // Product owners and operations managers have access to all projects
        const allProjects = await db
          .select({id: projects.id})
          .from(projects);
        allProjectIds = allProjects.map(p => p.id);
      } else {
        // Get user's managed projects
        const managedProjects = await db
          .select({id: projects.id})
          .from(projects)
          .where(eq(projects.managerId, userId));

        // Get user's member projects
        const memberProjects = await db
          .select({projectId: projectMembers.projectId})
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.userId, userId),
              eq(projectMembers.invitationStatus, "accepted")
            )
          );

        allProjectIds = [
          ...managedProjects.map(p => p.id),
          ...memberProjects.map(p => p.projectId).filter(id => id !== null && id !== undefined)
        ];
      }

      // Remove duplicates and filter out null/undefined values
      const uniqueProjectIds = Array.from(new Set(allProjectIds.filter(id => id !== null && id !== undefined)));

      if (uniqueProjectIds.length === 0) {
        return res.json({});
      }

      // Validate project IDs are valid numbers
      const validProjectIds = uniqueProjectIds.filter(id =>
        id !== null && id !== undefined && typeof id === 'number' && !isNaN(id) && Number.isInteger(id) && id > 0
      );

      if (validProjectIds.length === 0) {
        return res.json({});
      }

      // Get unread counts for each project using read receipts for team chat (projectMessages)
      const unreadCounts: Record<number, number> = {};

      for (const projectId of validProjectIds) {
        try {
          // Get all team messages for this project that are not from current user
          const teamMessagesList = await db
            .select({id: projectMessages.id})
            .from(projectMessages)
            .where(
              and(
                eq(projectMessages.projectId, projectId),
                ne(projectMessages.senderId, userId)
              )
            );

          if (teamMessagesList.length === 0) {
            unreadCounts[projectId] = 0;
            continue;
          }

          // Get message IDs that the user has already read (for team messages)
          const readMessageIds = await db
            .select({messageId: messageReadReceipts.messageId})
            .from(messageReadReceipts)
            .where(eq(messageReadReceipts.userId, userId));

          const readIds = new Set(readMessageIds.map(r => r.messageId));

          // Count unread team messages
          const unreadCount = teamMessagesList.filter(msg => !readIds.has(msg.id)).length;
          unreadCounts[projectId] = unreadCount;
        } catch (error) {
          console.error(`Error counting messages for project ${projectId}:`, error);
          unreadCounts[projectId] = 0;
        }
      }

      res.json(unreadCounts);
    } catch (error) {
      console.error("Error fetching unread counts:", error);
      res.status(500).json({ error: "Failed to fetch unread counts" });
    }
  });

  // Mark team messages as read for a user
  app.post("/api/projects/:projectId/team-messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      const {messageIds} = req.body;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ error: "Message IDs are required" });
      }

      // Insert read receipts for team messages
      const readReceipts = messageIds.map(messageId => ({
        messageId: parseInt(messageId),
        userId: userId,
      }));

      await db.insert(messageReadReceipts).values(readReceipts).onConflictDoNothing();

      res.json({success: true});
    } catch (error) {
      console.error("Error marking team messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Mark messages as read for a user
  app.post("/api/projects/:projectId/messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;
      const {messageIds} = req.body;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ error: "Message IDs are required" });
      }

      // Insert read receipts for each message (ignore duplicates)
      const readReceiptsToInsert = messageIds.map(messageId => ({
        messageId: parseInt(messageId),
        userId: userId
      }));

      await db.insert(messageReadReceipts)
        .values(readReceiptsToInsert)
        .onConflictDoNothing();

      res.json({success: true});
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Mark all project messages as read for current user
  app.post("/api/projects/:projectId/messages/mark-all-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.user!.id;

      // Get all message IDs for this project that are not from current user
      const projectMessagesList = await db
        .select({id: projectMessages.id})
        .from(projectMessages)
        .where(
          and(
            eq(projectMessages.projectId, projectId),
            ne(projectMessages.senderId, userId)
          )
        );

      if (projectMessagesList.length === 0) {
        return res.json({success: true});
      }

      // Get message IDs that user hasn't read yet
      const readMessageIds = await db
        .select({messageId: messageReadReceipts.messageId})
        .from(messageReadReceipts)
        .where(eq(messageReadReceipts.userId, userId));

      const readIds = new Set(readMessageIds.map(r => r.messageId));
      const unreadMessageIds = projectMessagesList
        .filter(msg => !readIds.has(msg.id))
        .map(msg => msg.id);

      if (unreadMessageIds.length > 0) {
        const readReceiptsToInsert = unreadMessageIds.map(messageId => ({
          messageId: messageId,
          userId: userId
        }));

        await db.insert(messageReadReceipts)
          .values(readReceiptsToInsert)
          .onConflictDoNothing();
      }

      res.json({success: true});
    } catch (error) {
      console.error("Error marking all messages as read:", error);
      res.status(500).json({ error: "Failed to mark all messages as read" });
    }
  });

  // Technical Support API Routes
  app.get("/api/technical-support/requests", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;

      // Get basic technical support requests first
      let basicRequests;
      if (user.specialization === 'technical_support' || user.role === 'project_manager' || user.role === 'product_owner' || user.role === 'operations_manager' || user.specialization === 'operations_manager') {
        // Technical support staff, project managers, product owners, and operations managers see all requests
        console.log(`User ${user.id} (${user.role}) fetching all technical support requests`);
        basicRequests = await db.select()
          .from(technicalSupportRequests)
          .orderBy(desc(technicalSupportRequests.createdAt));
        console.log(`Found ${basicRequests.length} technical support requests for user ${user.id}`);
      } else {
        // Non-technical support staff see only their own requests
        console.log(`User ${user.id} (${user.role}) fetching their own technical support requests`);
        basicRequests = await db.select()
          .from(technicalSupportRequests)
          .where(eq(technicalSupportRequests.requesterId, user.id))
          .orderBy(desc(technicalSupportRequests.createdAt));
        console.log(`Found ${basicRequests.length} technical support requests for user ${user.id}`);
      }

      // Enrich requests with additional data
      const requests = await Promise.all(basicRequests.map(async (request) => {
        // Get requester info
        const [requester] = await db.select({id: users.id, name: users.name, email: users.email})
          .from(users)
          .where(eq(users.id, request.requesterId))
          .limit(1);

        // Get assigned user info if assigned
        let assignedTo = null;
        if (request.assignedToId) {
          const [assigned] = await db.select({id: users.id, name: users.name, email: users.email})
            .from(users)
            .where(eq(users.id, request.assignedToId))
            .limit(1);
          assignedTo = assigned || null;
        }

        // Get task info if related
        let task = null;
        let project = null;
        if (request.taskId) {
          const [taskInfo] = await db.select({id: tasks.id, title: tasks.title, projectId: tasks.projectId})
            .from(tasks)
            .where(eq(tasks.id, request.taskId))
            .limit(1);
          task = taskInfo || null;

          if (task?.projectId) {
            const [projectInfo] = await db.select({id: projects.id, name: projects.name})
              .from(projects)
              .where(eq(projects.id, task.projectId))
              .limit(1);
            project = projectInfo || null;
          }
        }

        return {
          ...request,
          requester,
          assignedTo,
          task,
          project
        };
      }));

      res.json(requests);
    } catch (error) {
      console.error("Error fetching technical support requests:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  app.post("/api/technical-support/requests", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;

      // Only non-technical support staff can create requests
      if (user.specialization === 'technical_support') {
        return res.status(403).json({ error: "Technical support staff cannot create requests" });
      }

      const {title, description, taskId, priority} = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      // Create the technical support request
      const [newRequest] = await db.insert(technicalSupportRequests)
        .values({
          title,
          description,
          taskId: taskId || null,
          requesterId: user.id,
          priority: priority || 'medium',
          status: 'pending',
        })
        .returning();

      // Update task status to "technical_support" if taskId is provided
      if (taskId) {
        await db.update(tasks)
          .set({status: 'technical_support'})
          .where(eq(tasks.id, taskId));
      }

      // Send notifications to technical support staff (simplified approach)
      try {
        // Get technical support staff and create notifications
        const techSupportUsers = await db.query.users.findMany({
          where: eq(users.specialization, 'technical_support'),
          columns: {id: true, name: true, email: true}
        });

        if (techSupportUsers.length > 0) {
          // Create notifications
          for (const staff of techSupportUsers) {
            await db.insert(notifications).values({
              userId: staff.id,
              type: 'mention',
              content: `New technical support request: ${title}`,
              referenceId: newRequest.id,
              referenceType: 'task',
              createdAt: new Date()
            });

            // Send real-time notification via SSE if available
            const clientResponse = global.sseClients?.get(staff.id);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: {
                    type: 'mention',
                    content: `New technical support request: ${title}`,
                    referenceId: newRequest.id,
                    referenceType: 'task',
                    createdAt: new Date().toISOString()
                  }
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${staff.id}:`, error);
                global.sseClients?.delete(staff.id);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error sending notifications to technical support staff:", error);
        // Continue execution even if notifications fail
      }

      res.status(201).json({
        message: "Request submitted successfully",
        request: newRequest
      });
    } catch (error) {
      console.error("Error creating technical support request:", error);
      res.status(500).json({ error: "Failed to create request" });
    }
  });

  app.post("/api/technical-support/requests/:id/assign", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Only technical support staff can assign requests
      if (user.specialization !== 'technical_support') {
        return res.status(403).json({ error: "Only technical support staff can assign requests" });
      }

      // Get the request details to check for related task and project
      const [requestDetails] = await db.select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (!requestDetails) {
        return res.status(404).json({ error: "Request not found" });
      }

      const [updatedRequest] = await db.update(technicalSupportRequests)
        .set({
          assignedToId: user.id,
          status: 'in_progress',
          updatedAt: new Date()
        })
        .where(eq(technicalSupportRequests.id, requestId))
        .returning();

      // If there's a related task, grant project access to the technical support staff
      if (requestDetails.taskId) {
        try {
          // Get task details to find project
          const [taskDetails] = await db.select({id: tasks.id, projectId: tasks.projectId})
            .from(tasks)
            .where(eq(tasks.id, requestDetails.taskId))
            .limit(1);

          if (taskDetails?.projectId) {
            // Check if user is already a member of the project
            const existingMembership = await db.select({id: projectMembers.id})
              .from(projectMembers)
              .where(and(
                eq(projectMembers.projectId, taskDetails.projectId),
                eq(projectMembers.userId, user.id)
              ))
              .limit(1);

            // If not already a member, add them with technical_support role
            if (existingMembership.length === 0) {
              await db.insert(projectMembers).values({
                projectId: taskDetails.projectId,
                userId: user.id,
                role: 'technical_support',
                invitationStatus: 'accepted',
                invitedBy: user.id,
                invitedAt: new Date(),
                joinedAt: new Date()
              });
            }
          }
        } catch (error) {
          console.error("Error granting project access to technical support staff:", error);
          // Continue execution even if project access fails
        }
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error assigning technical support request:", error);
      res.status(500).json({ error: "Failed to assign request" });
    }
  });

  app.put("/api/technical-support/requests/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Check if user has permission to update this request
      const existingRequest = await db.select().from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (existingRequest.length === 0) {
        return res.status(404).json({ error: "Request not found" });
      }

      const request = existingRequest[0];
      const canUpdate = user.specialization === 'technical_support' &&
        (request.assignedToId === user.id || !request.assignedToId) ||
        request.requesterId === user.id;

      if (!canUpdate) {
        return res.status(403).json({ error: "Not authorized to update this request" });
      }

      const updateData: any = {...req.body, updatedAt: new Date()};

      if (req.body.status === 'resolved') {
        updateData.resolvedAt = new Date();
      }

      const [updatedRequest] = await db.update(technicalSupportRequests)
        .set(updateData)
        .where(eq(technicalSupportRequests.id, requestId))
        .returning();

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating technical support request:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  app.delete("/api/technical-support/requests/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const user = req.user as Express.User;
      const requestId = parseInt(req.params.id);

      // Check if request exists and get details
      const existingRequest = await db.select()
        .from(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId))
        .limit(1);

      if (existingRequest.length === 0) {
        return res.status(404).json({ error: "Request not found" });
      }

      const request = existingRequest[0];

      // Only allow deletion if:
      // 1. User is the requester AND
      // 2. Request is not assigned to anyone (assignedToId is null)
      if (request.requesterId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own requests" });
      }

      if (request.assignedToId !== null) {
        return res.status(403).json({ error: "Cannot delete request that has been assigned to technical support staff" });
      }

      // Delete the request
      await db.delete(technicalSupportRequests)
        .where(eq(technicalSupportRequests.id, requestId));

      // If there was a related task, update its status back to the previous status
      if (request.taskId) {
        await db.update(tasks)
          .set({status: 'in_progress'}) // Reset to in_progress or another appropriate status
          .where(eq(tasks.id, request.taskId));
      }

      res.json({ message: "Request deleted successfully" });
    } catch (error) {
      console.error("Error deleting technical support request:", error);
      res.status(500).json({ error: "Failed to delete request" });
    }
  });

  // Deadline Extension Requests API Routes

  // Get deadline extension requests
  app.get("/api/deadline-extension-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers and operations managers can access deadline extension requests" });
    }

    try {
      let requests;

      if (user.role === "project_manager" || user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Project managers see requests for their projects, operations managers see all requests
        const whereCondition = user.role === "operations_manager" || user.specialization === "operations_manager"
          ? undefined // Operations managers see all requests
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

    // Only non-project manager staff can create requests
    if (user.role === "project_manager") {
      return res.status(403).json({ error: "Project managers cannot create deadline extension requests" });
    }

    try {
      const {taskId, reason, requestedDeadline} = req.body;

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
          createdAt: new Date(),
          updatedAt: new Date(),
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

      const [notification] = await db
        .insert(notifications)
        .values({
          userId: project.managerId,
          type: "task_updated",
          content: `${user.name} has requested a deadline extension for task: ${taskDetails?.title || 'Unknown Task'}`,
          referenceId: newRequest.id,
          referenceType: "task",
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if PM is connected
      const clientResponse = global.sseClients?.get(project.managerId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to PM ${project.managerId}:`, error);
          global.sseClients?.delete(project.managerId);
        }
      }

      res.json(newRequest);
    } catch (error) {
      console.error("Error creating deadline extension request:", error);
      res.status(500).json({ error: "Failed to create deadline extension request" });
    }
  });

  // Approve/Decline deadline extension request (Project Manager and Operations Manager)
  app.put("/api/deadline-extension-requests/:id", isProjectManagerOrOperationsManager, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const {status, decisionReason, approvedDeadline, approvedWorkingHours} = req.body;

      if (!["approved", "declined"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'approved' or 'declined'" });
      }

      if (!decisionReason) {
        return res.status(400).json({ error: "Decision reason is required" });
      }

      // Get the request details
      const [request] = await db
        .select()
        .from(deadlineExtensionRequests)
        .where(and(
          eq(deadlineExtensionRequests.id, requestId),
          eq(deadlineExtensionRequests.projectManagerId, req.user!.id),
          eq(deadlineExtensionRequests.status, "pending")
        ))
        .limit(1);

      if (!request) {
        return res.status(404).json({ error: "Request not found or already processed" });
      }

      // Update the request
      const updateData: any = {
        status,
        decisionReason,
        decidedBy: req.user!.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      };

      if (status === "approved") {
        if (approvedDeadline) {
          updateData.approvedDeadline = new Date(approvedDeadline);
        }
        if (approvedWorkingHours) {
          updateData.approvedWorkingHours = parseInt(approvedWorkingHours);
        }
      }

      const [updatedRequest] = await db
        .update(deadlineExtensionRequests)
        .set(updateData)
        .where(eq(deadlineExtensionRequests.id, requestId))
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
          taskUpdateData.updatedAt = new Date();

          await db
            .update(tasks)
            .set(taskUpdateData)
            .where(eq(tasks.id, request.taskId));
        }
      }

      // Create notification for the requester
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: request.requesterId,
          type: "task_updated",
          content: `Your deadline extension request has been ${status}. ${decisionReason}.`,
          referenceId: request.taskId,
          referenceType: "task",
          createdAt: new Date(),
        })
        .returning();

      // Send notification through SSE if user is connected
      const clientResponse = global.sseClients?.get(request.requesterId);
      if (clientResponse && !clientResponse.writableEnded) {
        try {
          clientResponse.write(`data: ${JSON.stringify({
            type: "notification",
            data: notification
          })}\n\n`);
        } catch (error) {
          console.error(`Error sending SSE notification to user ${request.requesterId}:`, error);
          global.sseClients?.delete(request.requesterId);
        }
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error processing deadline extension request:", error);
      res.status(500).json({ error: "Failed to process deadline extension request" });
    }
  });

  // Client Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  // Productivity tracking endpoint
  app.get("/api/productivity", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = req.user as Express.User;
      const dateParam = req.query.date as string;
      const targetDate = dateParam ? new Date(dateParam) : new Date();

      // Set target date to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get yesterday's date for comparison
      const yesterday = new Date(targetDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfYesterday = new Date(yesterday);
      startOfYesterday.setHours(0, 0, 0, 0);
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      // Get start of week (Monday)
      const startOfWeek = new Date(targetDate);
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get all tasks for the user
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          projectId: tasks.projectId,
          timeSpent: tasks.timeSpent,
          updatedAt: tasks.updatedAt,
          workingHours: tasks.workingHours,
          projectName: projects.name
        })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assigneeId, user.id));

      // Filter tasks that were worked on today (have time spent and updated today)
      const todayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfDay && taskUpdated <= endOfDay && (task.timeSpent || 0) > 0;
      });

      // Filter tasks worked on yesterday
      const yesterdayTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfYesterday && taskUpdated <= endOfYesterday && (task.timeSpent || 0) > 0;
      });

      // Filter tasks for this week
      const weekTasks = userTasks.filter(task => {
        if (!task.updatedAt) return false;
        const taskUpdated = new Date(task.updatedAt);
        return taskUpdated >= startOfWeek && (task.timeSpent || 0) > 0;
      });

      // Calculate today's data
      const todayData = {
        totalTasksWorkedOn: todayTasks.length,
        totalTasksCompleted: todayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: todayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: todayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed',
          workingHours: task.workingHours || 8
        })),
        weeklyBreakdown: [] as { day: string; dayName: string; timeSpent: number; hours: number; taskCount: number; tasks: string[]; workdayStart: null; workdayEnd: null; totalSpanHours: number; performanceStatus: string; performanceColor: string; }[]
      };

      // Generate weekly breakdown (Monday to Friday of current week)
      const currentWeekStart = new Date(startOfWeek);

      for (let i = 0; i < 5; i++) { // Monday to Friday only
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentWeekStart.getDate() + i);

        const dayStart = new Date(currentDay);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(currentDay);
        dayEnd.setHours(23, 59, 59, 999);

        // Get tasks worked on this specific day
        const dayTasks = userTasks.filter(task => {
          if (!task.updatedAt) return false;
          const taskUpdated = new Date(task.updatedAt);
          return taskUpdated >= dayStart && taskUpdated <= dayEnd && (task.timeSpent || 0) > 0;
        });

        const dayTimeSpent = dayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0);
        const dayHours = dayTimeSpent / 3600; // Convert seconds to hours

        // Calculate performance status and color based on hours worked
        let performanceStatus = 'poor';
        let performanceColor = '#EF4444'; // Red

        if (dayHours >= 4) {
          performanceStatus = 'good';
          performanceColor = '#22C55E'; // Green
        } else if (dayHours >= 2) {
          performanceStatus = 'fair';
          performanceColor = '#EAB308'; // Yellow
        }

        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        todayData.weeklyBreakdown.push({
          day: currentDay.toISOString().split('T')[0], // YYYY-MM-DD format
          dayName: dayNames[i],
          timeSpent: dayTimeSpent,
          hours: Math.round(dayHours * 100) / 100, // Round to 2 decimal places
          taskCount: dayTasks.length,
          tasks: dayTasks.map(task => task.title),
          workdayStart: null, // Will be set by timer tracking if available
          workdayEnd: null, // Will be set by timer tracking if available
          totalSpanHours: Math.round(dayHours * 100) / 100,
          performanceStatus,
          performanceColor
        });
      }

      // Calculate yesterday's data
      const yesterdayData = {
        totalTasksWorkedOn: yesterdayTasks.length,
        totalTasksCompleted: yesterdayTasks.filter(task => task.status === 'completed').length,
        totalTimeWorked: yesterdayTasks.reduce((total, task) => total + (task.timeSpent || 0), 0),
        taskBreakdown: yesterdayTasks.map(task => ({
          taskId: task.id,
          title: task.title,
          projectName: task.projectName || 'Unknown Project',
          timeSpent: task.timeSpent || 0,
          status: task.status,
          isCompleted: task.status === 'completed'
        })),
        hourlyBreakdown: []
      };

      // Calculate week data
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

  // Bookings API Routes

  // Get all bookings (Project Manager only)
  app.get("/api/bookings", isProjectManager, async (req, res) => {
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .orderBy(desc(bookings.startTime));

      res.json(allBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // Create a new booking (Project Manager only)
  app.post("/api/bookings", isProjectManager, async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        participants,
        startTime,
        endTime,
        meetingLink,
        notes
      } = req.body;

      if (!title || !type || !startTime || !endTime || !participants) {
        return res.status(400).json({
          error: "Title, type, start time, end time, and participants are required"
        });
      }

      // Parse dates
      const parsedStartTime = new Date(startTime);
      const parsedEndTime = new Date(endTime);

      if (isNaN(parsedStartTime.getTime()) || isNaN(parsedEndTime.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ error: "End time must be after start time" });
      }

      // Check for time conflicts with existing bookings
      const conflictingBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "scheduled"),
            or(
              and(
                sql`${bookings.startTime} < ${parsedEndTime}`,
                sql`${bookings.endTime} > ${parsedStartTime}`
              )
            )
          )
        );

      // Check if any participants have conflicting bookings
      const participantConflicts = conflictingBookings.filter(booking => {
        const bookingParticipants = booking.participants as number[];
        const newParticipants = participants as number[];
        return bookingParticipants.some(p => newParticipants.includes(p));
      });

      if (participantConflicts.length > 0) {
        return res.status(400).json({
          error: "One or more participants have conflicting meetings at this time"
        });
      }

      // Check for task conflicts
      const conflictingTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          assigneeId: tasks.assigneeId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.isTimerRunning, true),
            inArray(tasks.assigneeId, participants)
          )
        );

      let warningMessage = null;
      if (conflictingTasks.length > 0) {
        const conflictingUsers = conflictingTasks.map(task => task.assigneeId);
        warningMessage = `Warning: ${conflictingUsers.length} participant(s) have running tasks during this meeting time.`;
      }

      // Create the booking
      const [newBooking] = await db
        .insert(bookings)
        .values({
          title,
          description: description || null,
          type,
          scheduledBy: req.user!.id,
          participants,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          meetingLink: meetingLink || null,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create notifications for participants
      for (const participantId of participants) {
        if (participantId !== req.user!.id) {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                userId: participantId,
                type: "task_assigned", // Using existing type
                content: `You have been invited to a meeting: ${title}`,
                referenceId: newBooking.id,
                referenceType: "project", // Using existing type
                createdAt: new Date(),
              })
              .returning();

            // Send notification through SSE if user is connected
            const clientResponse = global.sseClients?.get(participantId);
            if (clientResponse && !clientResponse.writableEnded) {
              try {
                clientResponse.write(`data: ${JSON.stringify({
                  type: "notification",
                  data: notification
                })}\n\n`);
              } catch (error) {
                console.error(`Error sending SSE notification to user ${participantId}:`, error);
                global.sseClients?.delete(participantId);
              }
            }
          } catch (error) {
            console.error(`Error creating notification for participant ${participantId}:`, error);
          }
        }
      }

      res.json({
        booking: newBooking,
        warning: warningMessage
      });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Failed to create booking" });
    }
  });

  // Update booking status (Project Manager only)
  app.put("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const {status, notes} = req.body;

      const validStatuses = ["scheduled", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      const [updatedBooking] = await db
        .update(bookings)
        .set({
          status,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json(updatedBooking);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Delete booking (Project Manager only)
  app.delete("/api/bookings/:id", isProjectManager, async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);

      await db
        .delete(bookings)
        .where(eq(bookings.id, bookingId));

      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  // Get user's upcoming bookings (for persistent alerts)
  app.get("/api/bookings/my-upcoming", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user!.id;
      const now = new Date();

      console.log(`Fetching upcoming bookings for user ${userId} after ${now.toISOString()}`);

      // First get all scheduled future bookings, then filter in JavaScript
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
        .innerJoin(users, eq(bookings.scheduledBy, users.id))
        .where(
          and(
            eq(bookings.status, "scheduled"),
            sql`${bookings.startTime} >= ${now.toISOString()}`
          )
        )
        .orderBy(bookings.startTime);

      console.log(`Retrieved ${allBookings.length} total scheduled bookings`);

      // Filter bookings where user is a participant
      const upcomingBookings = allBookings.filter(booking => {
        try {
          if (!booking.participants) {
            console.log(`Booking ${booking.id} has no participants`);
            return false;
          }

          let participants;
          if (Array.isArray(booking.participants)) {
            participants = booking.participants;
          } else if (typeof booking.participants === 'string') {
            participants = JSON.parse(booking.participants);
          } else {
            console.log(`Booking ${booking.id} has invalid participants format:`, typeof booking.participants);
            return false;
          }

          if (!Array.isArray(participants)) {
            console.log(`Booking ${booking.id} participants is not an array:`, participants);
            return false;
          }

          console.log(`Booking ${booking.id} participants:`, participants, `User ${userId} included:`, participants.includes(userId));
          return participants.includes(userId);
        } catch (error) {
          console.error(`Error parsing participants for booking ${booking.id}:`, error);
          return false;
        }
      });

      console.log(`Found ${upcomingBookings.length} upcoming bookings for user ${userId}`);
      res.json(upcomingBookings);
    } catch (error) {
      console.error("Error fetching upcoming bookings:", error);
      res.status(500).json({ error: "Failed to fetch upcoming bookings" });
    }
  });

  // Client Account Management API Routes

  // Middleware to check if user can manage client accounts
  const canManageClientAccounts = (req: Express.Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only project managers, product owners, and operations managers can manage client accounts" });
    }

    next();
  };

  // Get all client accounts
  app.get("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const clientAccounts = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          role: users.role,
          productService: users.productService,
          clientType: users.clientType,
          onboardingStatus: users.onboardingStatus,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          lastActive: users.lastActive,
          gender: users.gender,
        })
        .from(users)
        .where(eq(users.role, "client"))
        .orderBy(desc(users.createdAt));

      res.json(clientAccounts);
    } catch (error) {
      console.error("Error fetching client accounts:", error);
      res.status(500).json({ error: "Failed to fetch client accounts" });
    }
  });

  // Create a new client account
  app.post("/api/client-accounts", canManageClientAccounts, async (req, res) => {
    try {
      const {name, email, username, password, productService, clientType} = req.body;

      // Validate required fields
      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Check if username already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email already exists
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password (using same method as auth.ts)
      const { scrypt, randomBytes } = await import("crypto");
      const { promisify } = await import("util");
      const scryptAsync = promisify(scrypt);

      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      // Create the client account
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password: hashedPassword,
          role: "client",
          productService,
          clientType,
          onboardingStatus: "not_onboarded",
          emailVerified: false,
          status: "offline",
          workStatus: "active",
          absenceReason: "not_applicable",
          breakCount: 0,
          createdAt: new Date(),
          lastActive: new Date(),
        })
        .returning();

      // Remove password from response
      const { password: _, ...clientResponse } = newClient;

      // Create notification for the client
      await db
        .insert(notifications)
        .values({
          userId: newClient.id,
          type: "task_updated", // Using existing type
          content: `Welcome! Your account has been created. You can now log in to access your dashboard.`,
          referenceId: newClient.id,
          referenceType: "project", // Using existing type
          createdAt: new Date(),
        });

      res.status(201).json(clientResponse);
    } catch (error) {
      console.error("Error creating client account:", error);
      res.status(500).json({ error: "Failed to create client account" });
    }
  });

  // Get all users for staff selection (Operations Manager only)
  app.get("/api/users/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access all users" });
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
        .where(or(
          eq(users.role, "staff"),
          eq(users.role, "project_manager"),
          eq(users.role, "product_owner")
        ))
        .orderBy(users.name);

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get all departments for department selection (Operations Manager only)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access departments" });
    }

    try {
      // Get unique departments from users (role and specialization fields)
      const rolesResult = await db.execute(sql`
        SELECT DISTINCT role as department
        FROM users
        WHERE role IS NOT NULL AND role != ''
        UNION
        SELECT DISTINCT specialization as department
        FROM users
        WHERE specialization IS NOT NULL AND specialization != ''
        ORDER BY department
      `);

      const departments = rolesResult.rows.map(row => row.department);
      res.json(departments);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // Notes API Routes (Operations Manager only)

  // Get all notes (Operations Manager only)
  app.get("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access notes" });
    }

    try {
      const userNotes = await db
        .select()
        .from(notes)
        .where(eq(notes.createdBy, user.id))
        .orderBy(desc(notes.updatedAt));

      res.json(userNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create note (Operations Manager only)
  app.post("/api/notes", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create notes" });
    }

    try {
      const { title, content, type, todoItems } = req.body;

      if (!content && (!todoItems || todoItems.length === 0)) {
        return res.status(400).json({ error: "Content or todo items are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json(newNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update note (Operations Manager only)
  app.put("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can update notes" });
    }

    try {
      const noteId = parseInt(req.params.id);
      const { title, content, type, todoItems } = req.body;

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      const [updatedNote] = await db
        .update(notes)
        .set({
          title: title || "",
          content: content || "",
          type: type || "freetext",
          todoItems: todoItems || [],
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      res.json(updatedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete note (Operations Manager only)
  app.delete("/api/notes/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can delete notes" });
    }

    try {
      const noteId = parseInt(req.params.id);

      // Verify note exists and belongs to user
      const [existingNote] = await db
        .select()
        .from(notes)
        .where(and(
          eq(notes.id, noteId),
          eq(notes.createdBy, user.id)
        ))
        .limit(1);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      await db
        .delete(notes)
        .where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Staff Queries API
  // Get all staff queries (all users see all queries)
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      // All users (operations managers and staff) see all queries
      const result = await db.execute(sql`
        SELECT sq.*,
               u.name as staff_name_full,
               sender.name as sender_name
        FROM staff_queries sq
        LEFT JOIN users u ON sq.staff_id = u.id
        LEFT JOIN users sender ON sq.sent_by = sender.id
        ORDER BY sq.created_at DESC
      `);

      const staffQueries = result.rows.map(row => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        staffNameFull: row.staff_name_full,
        department: row.department,
        staffUniqueValue: row.staff_unique_value,
        reason: row.reason,
        whyQuery: row.why_query,
        attachmentPath: row.attachment_path,
        likelyPenalty: row.likely_penalty,
        additionalNote: row.additional_note,
        sentBy: row.sent_by,
        senderName: row.sender_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(staffQueries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  // Create staff query (Operations Manager only)
  app.post("/api/staff-queries", staffQueryUpload.single('attachment'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can create staff queries" });
    }

    try {
      const {
        staffId,
        staffName,
        department,
        staffUniqueValue,
        reason,
        whyQuery,
        likelyPenalty,
        additionalNote
      } = req.body;

      // Handle uploaded file
      let attachmentPath = null;
      if (req.file) {
        attachmentPath = `/uploads/staff-query-attachments/${req.file.filename}`;
      }

      if (!staffId || !staffName || !department || !staffUniqueValue || !reason || !whyQuery || !likelyPenalty) {
        return res.status(400).json({
          error: "Staff ID, staff name, department, staff unique value, reason, why query, and likely penalty are required"
        });
      }

      const validReasons = [
        "wrongly_using_work_app",
        "substandard_delivery",
        "repeatedly_missed_deadlines",
        "disrespectful_communication",
        "disregard_company_policy"
      ];

      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "Invalid reason" });
      }

      // Create the staff query
      const result = await db.execute(sql`
        INSERT INTO staff_queries (
          staff_id, staff_name, department, staff_unique_value, reason,
          why_query, attachment_path, likely_penalty, additional_note, sent_by,
          created_at, updated_at
        )
        VALUES (
          ${staffId}, ${staffName}, ${department}, ${staffUniqueValue}, ${reason},
          ${whyQuery}, ${attachmentPath || null}, ${likelyPenalty}, ${additionalNote || null}, ${user.id},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);

      const newQuery = result.rows[0];

      // Send notification to the staff member
      try {
        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, created_at)
          VALUES (${staffId}, 'New Staff Query', 'You have received a new staff query from Operations Management', 'staff_query', CURRENT_TIMESTAMP)
        `);
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
        // Don't fail the entire request if notification fails
      }

      res.status(201).json({
        id: newQuery.id,
        staffId: newQuery.staff_id,
        staffName: newQuery.staff_name,
        department: newQuery.department,
        staffUniqueValue: newQuery.staff_unique_value,
        reason: newQuery.reason,
        whyQuery: newQuery.why_query,
        attachmentPath: newQuery.attachment_path,
        likelyPenalty: newQuery.likely_penalty,
        additionalNote: newQuery.additional_note,
        sentBy: newQuery.sent_by,
        status: newQuery.status,
        createdAt: newQuery.created_at,
        updatedAt: newQuery.updated_at,
      });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Update staff query status (for staff to acknowledge)
  app.patch("/api/staff-queries/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const queryId = parseInt(req.params.id);
    const {status} = req.body;

    if (!status || !["acknowledged", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required (acknowledged or resolved)" });
    }

    try {
      // Check if the query exists and belongs to the user
      const checkResult = await db.execute(sql`
        SELECT * FROM staff_queries WHERE id = ${queryId} AND staff_id = ${user.id}
      `);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Staff query not found or not authorized" });
      }

      // Update the status
      const result = await db.execute(sql`
        UPDATE staff_queries
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${queryId} AND staff_id = ${user.id}
        RETURNING *
      `);

      const updatedQuery = result.rows[0];
      res.json({
        id: updatedQuery.id,
        status: updatedQuery.status,
        updatedAt: updatedQuery.updated_at,
      });
    } catch (error) {
      console.error("Error updating staff query:", error);
      res.status(500).json({ error: "Failed to update staff query" });
    }
  });

  return server;
}