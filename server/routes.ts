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

  const wss = setupWebSocket(server);
  return server;
}