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
  sops,
  sopSegments,
} from "@db/schema";
import { eq, and, desc, inArray, asc, isNotNull, or, sql, ne, gte, isNull } from "drizzle-orm";
import WebSocket from "ws";

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

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const server = createServer(app);

  // User endpoint for authentication
  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).send("Not authenticated");
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
        // Project managers see projects they manage
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.managerId, user.id))
          .orderBy(desc(projects.updatedAt));
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
      } else {
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
      } else if (user.role === "product_owner" || user.role === "operations_manager" || user.specialization === "operations_manager") {
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
    const isProductOwner = user.role === "product_owner";
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    // Only project managers, product owners, and operations managers can view staff
    if (!isProjectManager && !isProductOwner && !isOperationsManager) {
      return res.status(403).send("Access denied");
    }

    const {specialization} = req.query;

    // Only apply specialization filter to staff members, not product owners
    let whereCondition;

    if (specialization) {
      whereCondition = or(
        and(
          eq(users.role, "staff"),
          eq(users.specialization, specialization as string)
        ),
        eq(users.role, "product_owner")
      );
    } else {
      whereCondition = or(
        eq(users.role, "staff"),
        eq(users.role, "product_owner")
      );
    }

    const query = db
      .select()
      .from(users)
      .where(whereCondition);

    const staffAndProductOwners = await query.orderBy(desc(users.lastActive));
    res.json(staffAndProductOwners);
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
        .orderBy(asc(users.name));

      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get departments (for staff queries dropdown)
  app.get("/api/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // Get unique specializations from staff members
      const departments = await db
        .selectDistinct({ department: users.specialization })
        .from(users)
        .where(and(eq(users.role, "staff"), isNotNull(users.specialization)))
        .orderBy(asc(users.specialization));

      const departmentList = departments
        .map(d => d.department)
        .filter(Boolean);

      res.json(departmentList);
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  // KPI Report API Routes

  // Get productivity data for KPI report (Operations Manager only)
  app.get("/api/kpi-report/productivity", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access KPI reports" });
    }

    try {
      const { staffId, startDate, endDate } = req.query;

      if (!staffId || !startDate || !endDate) {
        return res.status(400).json({ error: "Staff ID, start date, and end date are required" });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

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

            // Calculate performance status
            if (dailyData.actualWorkHours >= 7) {
              dailyData.performanceStatus = 'good';
              dailyData.performanceColor = '#10B981';
            } else if (dailyData.actualWorkHours >= 5) {
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

  // Export KPI report (Operations Manager only)
  app.post("/api/kpi-report/export", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can export KPI reports" });
    }

    try {
      const { format, staffId, staffName, department, dateRange, productivityData } = req.body;

      if (!format || !staffId || !productivityData) {
        return res.status(400).json({ error: "Format, staff ID, and productivity data are required" });
      }

      const filename = `kpi-report-${staffName || 'staff'}-${Date.now()}`;

      if (format === 'csv') {
        // Create CSV content
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

        const csvContent = csvRows.map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csvContent);
      } else if (format === 'excel') {
        // For Excel, we'll return structured data
        // In a real implementation, you'd use a library like xlsx
        const excelData = {
          staffName,
          department,
          dateRange,
          summary: productivityData.summary,
          dailyData: productivityData.dailyData
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(excelData);
      } else if (format === 'pdf') {
        // For PDF, we'll return structured data
        // In a real implementation, you'd use a library like puppeteer or pdfkit
        const pdfData = {
          title: `KPI Report - ${staffName}`,
          department,
          dateRange,
          generatedAt: new Date().toISOString(),
          summary: productivityData.summary,
          dailyData: productivityData.dailyData,
          weeklyData: productivityData.weeklyData
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(pdfData);
      } else {
        return res.status(400).json({ error: "Invalid export format" });
      }

    } catch (error) {
      console.error("Error exporting KPI report:", error);
      res.status(500).json({ error: "Failed to export report" });
    }
  });

  // Staff Report API Route (Project Managers and Operations Managers only)
  app.get("/api/staff-report", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).send("Access denied - Project Manager or Operations Manager role required");
    }

    try {
      // Get all staff members with their current work status - using only existing fields
      const staffMembers = await db
        .select()
        .from(users)
        .where(eq(users.role, "staff"))
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
          breakCount: staff.breakCount || 0,
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

  // Client Accounts API Routes (Project Managers, Product Owners, and Operations Managers only)
  app.get("/api/client-accounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
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

  // Create Client Account API Route
  app.post("/api/client-accounts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "project_manager" && user.role !== "product_owner" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const { name, email, username, password, productService, clientType } = req.body;

      if (!name || !email || !username || !password || !productService || !clientType) {
        return res.status(400).json({ error: "All fields are required" });
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

      // Create new client
      const [newClient] = await db
        .insert(users)
        .values({
          name,
          email,
          username,
          password, // In production, this should be hashed
          role: "client" as UserRole,
          productService,
          clientType,
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
      const { department, search } = req.query;

      let whereConditions = [];

      if (department && department !== "all") {
        whereConditions.push(eq(sops.department, department as string));
      }

      if (search) {
        whereConditions.push(sql`${sops.title} ILIKE ${'%' + search + '%'}`);
      }

      const sopList = await db
        .select()
        .from(sops)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(sops.updatedAt));

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

  // Get unique departments for SOPs
  app.get("/api/sops/departments", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    if (user.role !== "operations_manager" && user.specialization !== "operations_manager") {
      return res.status(403).json({ error: "Only operations managers can access SOPs" });
    }

    try {
      const departments = await db
        .selectDistinct({ department: sops.department })
        .from(sops)
        .orderBy(asc(sops.department));

      res.json(departments.map(d => d.department));
    } catch (error) {
      console.error("Error fetching departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
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
      const { title, department, segments } = req.body;

      if (!title || !department || !segments || segments.length === 0) {
        return res.status(400).json({ error: "Title, department, and at least one segment are required" });
      }

      // Create SOP
      const [newSop] = await db
        .insert(sops)
        .values({
          title,
          department,
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
      const { title, department, segments } = req.body;

      if (!title || !department || !segments || segments.length === 0) {
        return res.status(400).json({ error: "Title, department, and at least one segment are required" });
      }

      // Update SOP
      await db
        .update(sops)
        .set({
          title,
          department,
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

  // Staff Queries API Routes
  app.get("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    try {
      let queries;

      if (isOperationsManager) {
        // Operations managers can see all queries
        queries = await db
          .select()
          .from(staffQueries)
          .orderBy(desc(staffQueries.createdAt));
      } else {
        // Regular users can only see their own queries
        queries = await db
          .select()
          .from(staffQueries)
          .where(eq(staffQueries.submitterId, user.id))
          .orderBy(desc(staffQueries.createdAt));
      }

      res.json(queries);
    } catch (error) {
      console.error("Error fetching staff queries:", error);
      res.status(500).json({ error: "Failed to fetch staff queries" });
    }
  });

  app.post("/api/staff-queries", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const { staffId, staffName, department, reason, explanation, attachmentUrl } = req.body;

      if (!staffId || !staffName || !reason || !explanation) {
        return res.status(400).json({ error: "All required fields must be filled" });
      }

      const [newQuery] = await db
        .insert(staffQueries)
        .values({
          staffId: parseInt(staffId),
          staffName,
          department,
          reason,
          explanation,
          attachmentUrl,
          submitterId: user.id,
          status: "pending",
        })
        .returning();

      res.json({ success: true, queryId: newQuery.id });
    } catch (error) {
      console.error("Error creating staff query:", error);
      res.status(500).json({ error: "Failed to create staff query" });
    }
  });

  // Staff Complaints API Routes
  app.get("/api/staff-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const isOperationsManager = user.role === "operations_manager" || user.specialization === "operations_manager";

    try {
      let complaints;

      if (isOperationsManager) {
        // Operations managers can see all complaints
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

  app.post("/api/staff-complaints", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      const { name, email, department, detailedExplanation, screenshotUrl } = req.body;

      if (!name || !email || !detailedExplanation) {
        return res.status(400).json({ error: "Name, email, and detailed explanation are required" });
      }

      const [newComplaint] = await db
        .insert(staffComplaints)
        .values({
          name,
          email,
          department,
          detailedExplanation,
          screenshotUrl,
          submitterId: user.id,
          status: "pending",
        })
        .returning();

      res.json({ success: true, complaintId: newComplaint.id });
    } catch (error) {
      console.error("Error creating staff complaint:", error);
      res.status(500).json({ error: "Failed to create staff complaint" });
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
      const { title, content, category } = req.body;

      if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
      }

      const [newNote] = await db
        .insert(notes)
        .values({
          title,
          content,
          category: category || "personal",
          userId: user.id,
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
      const { title, content, category } = req.body;

      if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
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
          title,
          content,
          category: category || "personal",
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

    const user = req.user!;

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

  // Technical Support Requests API Routes
  app.get("/api/technical-support/requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    try {
      let requests;

      if (user.specialization === 'technical_support' || user.role === 'project_manager' || user.role === 'product_owner' || user.role === 'operations_manager' || user.specialization === 'operations_manager') {
        // Technical support staff, project managers, product owners, and operations managers see all requests
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
          })
          .from(technicalSupportRequests)
          .leftJoin(users, eq(technicalSupportRequests.requesterId, users.id))
          .leftJoin(tasks, eq(technicalSupportRequests.taskId, tasks.id))
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
          })
          .from(technicalSupportRequests)
          .leftJoin(users, eq(technicalSupportRequests.requesterId, users.id))
          .leftJoin(tasks, eq(technicalSupportRequests.taskId, tasks.id))
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
        resolvedAt: request.resolvedAt,
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
        } : null,
      }));

      res.json(formattedRequests);
    } catch (error) {
      console.error("Error fetching technical support requests:", error);
      res.status(500).json({ error: "Failed to fetch technical support requests" });
    }
  });

  app.post("/api/technical-support/requests/:id/assign", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const requestId = parseInt(req.params.id);

    try {
      await db
        .update(technicalSupportRequests)
        .set({
          assignedToId: user.id,
          status: "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(technicalSupportRequests.id, requestId));

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

    const requestId = parseInt(req.params.id);
    const { status, resolution } = req.body;

    try {
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
      if (user.role === "project_manager" || user.role === "operations_manager" || user.specialization === "operations_manager") {
        // Project managers see requests for their projects, operations managers see all requests
        const whereCondition = user.role === "operations_manager" || user.specialization === "operations_manager"
          ? undefined // Operations managers see all requests
          : eq(deadlineExtensionRequests.projectManagerId, user.id); // Project managers see only their projects

        const requests = await db
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

        res.json(requests);
      } else {
        return res.status(403).json({ error: "Access denied" });
      }
    } catch (error) {
      console.error("Error fetching deadline extension requests:", error);
      res.status(500).json({ error: "Failed to fetch deadline extension requests" });
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

  app.put("/api/complaints/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const complaintId = parseInt(req.params.id);
      const { status, reviewComments } = req.body;

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
  app.get("/api/leave-applications/all", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;

    // Check if user is project manager or operations manager
    if (user.role !== "project_manager" && user.role !== "operations_manager" && user.specialization !== "operations_manager") {
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
      const hasAccess = 
        user.role === "operations_manager" || 
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

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
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

    const user = req.user!;
    const projectId = parseInt(req.params.id);

    try {
      const projectTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(desc(tasks.createdAt));

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

    const projectId = parseInt(req.params.id);

    try {
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

  // Add resource link to project
  app.post("/api/projects/:id/resources/link", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const { name, link, category } = req.body;

    console.log("Resource link endpoint called:", { projectId, name, link, category, userId: user.id, userRole: user.role });

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
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isProductOwner = user.role === 'product_owner';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isProjectManager || isProductOwner || isClient;

      console.log("Access check:", { 
        isOperationsManager, 
        isProjectManager, 
        isProductOwner, 
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
        details: error.message 
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
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isProductOwner = user.role === 'product_owner';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isProjectManager || isProductOwner || isClient;

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
      const isProjectManager = user.role === 'project_manager' && project.managerId === user.id;
      const isProductOwner = user.role === 'product_owner';
      const isClient = user.role === 'client' && project.clientId === user.id;

      const hasAccess = isOperationsManager || isProjectManager || isProductOwner || isClient;

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

    const projectId = parseInt(req.params.id);

    try {
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
  app.get("/api/projects/:id/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);

    try {
      const messages = await db
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
        .orderBy(asc(projectMessages.createdAt));

      res.json(messages);
    } catch (error) {
      console.error("Error fetching team messages:", error);
      res.status(500).json({ error: "Failed to fetch team messages" });
    }
  });

  // Send team message
  app.post("/api/projects/:id/team-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const { content } = req.body;

    try {
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const [newMessage] = await db
        .insert(projectMessages)
        .values({
          content: content.trim(),
          projectId,
          senderId: user.id,
        })
        .returning();

      res.json({ success: true, messageId: newMessage.id });
    } catch (error) {
      console.error("Error sending team message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Mark team messages as read
  app.post("/api/projects/:id/team-messages/mark-read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    const { messageIds } = req.body;

    try {
      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.json({ success: true }); // No messages to mark
      }

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

  // Get project plans
  app.get("/api/projects/:id/plans", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const projectId = parseInt(req.params.id);

    try {
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

      // Get deliverables for this plan
      const planDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.projectPlanId, planId))
        .orderBy(asc(deliverables.startDate));

      const planWithDeliverables = {
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

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection event
    res.write('data: {"type":"connected"}\n\n');

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write('data: {"type":"heartbeat"}\n\n');
    }, 30000);

    // Clean up on connection close
    req.on('close', () => {
      clearInterval(heartbeat);
    });

    req.on('aborted', () => {
      clearInterval(heartbeat);
    });
  });

  // Create project
  app.post("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
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

      // Add team members if provided
      if (teamMembers && teamMembers.length > 0) {
        const memberData = teamMembers.map((memberId: string) => ({
          projectId: newProject.id,
          userId: parseInt(memberId),
          invitedBy: user.id,
          invitationStatus: "accepted" as const,
        }));

        await db.insert(projectMembers).values(memberData);
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
    const { name, description, type, category, startDate, endDate, clientId, teamMembers } = req.body;

    try {
      if (!name || !category || !startDate || !endDate) {
        return res.status(400).json({ error: "Name, category, start date, and end date are required" });
      }

      // Check if user has permission to update this project
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
      const isProductOwner = user.role === "product_owner";

      if (!isOperationsManager && !isProjectManager && !isProductOwner) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update project
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

      // Update team members if provided
      if (teamMembers && Array.isArray(teamMembers)) {
        // Remove existing members
        await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));

        // Add new members
        if (teamMembers.length > 0) {
          const memberData = teamMembers.map((memberId: string) => ({
            projectId,
            userId: parseInt(memberId),
            invitedBy: user.id,
            invitationStatus: "accepted" as const,
          }));

          await db.insert(projectMembers).values(memberData);
        }
      }

      res.json({ success: true, project: updatedProject });
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Create project plan
  app.post("/api/projects/:id/plans", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const projectId = parseInt(req.params.id);
    const { name, description, startDate, endDate, deliverables } = req.body;

    try {
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

      // Create project plan
      const [newPlan] = await db
        .insert(projectPlans)
        .values({
          projectId,
          name,
          description: description || "",
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: "draft",
          createdBy: user.id,
        })
        .returning();

      // Create deliverables if provided
      if (deliverables && deliverables.length > 0) {
        const deliverableData = deliverables.map((deliverable: any, index: number) => ({
          projectPlanId: newPlan.id,
          name: deliverable.name || `Deliverable ${index + 1}`,
          description: deliverable.description || "",
          startDate: deliverable.startDate ? new Date(deliverable.startDate) : new Date(startDate),
          endDate: deliverable.endDate ? new Date(deliverable.endDate) : new Date(endDate),
          duration: deliverable.duration || 1,
          status: "pending",
          order: deliverable.order || index,
        }));

        await db.insert(deliverables).values(deliverableData);
      }

      res.json({ success: true, planId: newPlan.id });
    } catch (error) {
      console.error("Error creating project plan:", error);
      res.status(500).json({ error: "Failed to create project plan" });
    }
  });

  // Create task
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = req.user!;
    const { title, description, projectId, assigneeId, deadline, priority, workingHours, assignedHours } = req.body;

    try {
      if (!title || !projectId) {
        return res.status(400).json({ error: "Title and project ID are required" });
      }

      const [newTask] = await db
        .insert(tasks)
        .values({
          title,
          description: description || "",
          projectId: parseInt(projectId),
          assigneeId: assigneeId ? parseInt(assigneeId) : null,
          assignedBy: user.id,
          deadline: deadline ? new Date(deadline) : null,
          priority: priority || "medium",
          status: "not_started",
          progress: 0,
          workingHours: workingHours ? parseInt(workingHours) : null,
          assignedHours: assignedHours ? parseFloat(assignedHours) : null,
        })
        .returning();

      res.json({ success: true, taskId: newTask.id, task: newTask });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  const wss = setupWebSocket(server);
  return server;
}