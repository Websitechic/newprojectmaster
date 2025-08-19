import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupWebSocket } from "./websocket";
import { setupVideoSocket } from "./video-socket";
import { setupVite, serveStatic, log } from "./vite";
import { breakScheduler } from "./break-scheduler";
import { communicationMonitor } from "./communication-monitor";
import { setupAuth } from "./auth";
import session from "express-session";
import createMemoryStore from "memorystore";
import { initializeEmailService } from "./services/email";
import { WebSocketServer } from "ws";

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
    secure: false, // Set to false for development
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/"
  },
  name: "session_id" // Custom session cookie name
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

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: app.get("env") === "development" ? err.message : "Internal Server Error"
  });
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
    const wss = new WebSocketServer({
      noServer: true,
      path: "/ws"
    });

    // Session parser middleware for WebSocket upgrades
    const sessionParser = (req: any, res: any, next: any) => {
      sessionMiddleware(req, res, next);
    };

    // Handle WebSocket upgrade with proper session handling
    server.on('upgrade', (request, socket, head) => {
      console.log('WebSocket upgrade - Session:', request.headers.cookie);

      sessionParser(request as any, {} as any, () => {
        const session = (request as any).session;
        const user = session?.passport?.user;

        console.log('WebSocket upgrade - User:', user);

        // Check if this socket is already being handled
        if ((socket as any)._wsHandled) {
          console.log('Socket already handled, skipping');
          return;
        }
        (socket as any)._wsHandled = true;

        // Allow upgrade - authentication will be checked per message
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
    });

    setupWebSocket(wss);

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      log("Setting up Vite development server...");
      await setupVite(app, server);
    } else {
      log("Setting up static file serving...");
      serveStatic(app);
    }

    // Start the server
    const port = 5000;
    server.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);

      // Start the break scheduler
      breakScheduler.start();

      // Initialize communication monitor
      communicationMonitor.start();
    });
  } catch (error) {
    console.error("Fatal server initialization error:", error);
    process.exit(1);
  }
})();