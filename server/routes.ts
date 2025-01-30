import { Express } from "express";
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
} from "@db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  setupWebSocket(wss);

  // Projects
  app.get("/api/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const user = req.user!;
    let projectsList = [];

    try {
      if (user.role === "client") {
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.clientId, user.id))
          .orderBy(desc(projects.updatedAt));
      } else if (user.role === "project_manager") {
        projectsList = await db
          .select()
          .from(projects)
          .where(eq(projects.managerId, user.id))
          .orderBy(desc(projects.updatedAt));
      } else {
        const memberProjects = await db
          .select()
          .from(projectMembers)
          .where(eq(projectMembers.userId, user.id));

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

  // Tasks
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const userTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.assigneeId, req.user!.id))
      .orderBy(desc(tasks.updatedAt));

    res.json(userTasks);
  });

  app.post("/api/tasks/:id/progress", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { progress } = req.body;
    const taskId = parseInt(req.params.id);

    await db
      .update(tasks)
      .set({ progress, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    res.json({ success: true });
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