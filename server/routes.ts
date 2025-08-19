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
      // Get all staff members with their current work status
      const staffMembers = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          email: users.email,
          specialization: users.specialization,
          status: users.status,
          workStatus: users.workStatus,
          breakStartTime: users.breakStartTime,
          breakCount: users.breakCount,
          absenceReason: users.absenceReason,
          absenceEndDate: users.absenceEndDate,
          currentTaskId: users.currentTaskId,
          taskStartTime: users.taskStartTime,
          lastActive: users.lastActive,
        })
        .from(users)
        .where(eq(users.role, "staff"))
        .orderBy(desc(users.lastActive));

      // Get all tasks for these staff members
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
          isTimerRunning: tasks.isTimerRunning,
          timerStartTime: tasks.timerStartTime,
          timerDuration: tasks.timerDuration,
          assignedHours: tasks.assignedHours,
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
          const totalHoursSpent = engagedTask.timerDuration ? engagedTask.timerDuration / 3600 : 0;
          const assignedHours = engagedTask.assignedHours || 0;
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

  const wss = setupWebSocket(server);
  return server;
}