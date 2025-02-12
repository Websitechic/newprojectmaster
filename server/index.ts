import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeEmailService } from "./services/email";
import { setupWebSocket } from "./websocket";
import { WebSocketServer } from "ws";
import session from "express-session";
import createMemoryStore from "memorystore";
import { setupAuth } from "./auth";

// Declare global SSE clients map
declare global {
  var sseClients: Map<number, Response>;
  var connectedClients: Map<number, WebSocket>;
}

// Initialize global SSE clients map
if (!global.sseClients) {
  global.sseClients = new Map();
}

// Initialize global WebSocket clients map
if (!global.connectedClients) {
  global.connectedClients = new Map();
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware setup with consistent configuration
const MemoryStore = createMemoryStore(session);
const sessionMiddleware = session({
  secret: process.env.REPL_ID || "your-secret-key",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
  cookie: {
    secure: app.get("env") === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/"
  }
});

// Apply session middleware
app.use(sessionMiddleware);

// Setup authentication after session middleware
setupAuth(app);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

let emailServiceInitialized = false;

(async () => {
  try {
    log("Starting server initialization...");

    // Initialize email service with timeout
    try {
      log("Initializing email service...");
      await Promise.race([
        initializeEmailService(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Email service initialization timeout")), 5000)
        )
      ]);
      emailServiceInitialized = true;
      log("Email service initialized successfully");
    } catch (error) {
      log("Warning: Email service initialization failed - continuing without email service");
      console.error("Email service error:", error);
    }

    log("Setting up routes and server...");
    const server = registerRoutes(app);

    // Setup WebSocket server
    log("Setting up WebSocket...");
    const wss = new WebSocketServer({ server, path: "/ws" });
    setupWebSocket(wss);

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Error:", err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ error: message });
    });

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      log("Setting up Vite development server...");
      await setupVite(app, server);
    } else {
      log("Setting up static file serving...");
      serveStatic(app);
    }

    // Start the server
    server.listen(5000, "0.0.0.0", () => {
      log(`Server started successfully on port 5000`);
      if (!emailServiceInitialized) {
        log("Note: Server is running without email service functionality");
      }
    });
  } catch (error) {
    console.error("Fatal server initialization error:", error);
    process.exit(1);
  }
})();