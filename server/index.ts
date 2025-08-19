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

    // WebSocket upgrade handling
    server.on('upgrade', (request, socket, head) => {
      console.log('WebSocket upgrade request received');

      // Parse session from upgrade request with error handling
      try {
        sessionParser(request as any, {} as any, (err: any) => {
          if (err) {
            console.log('Session parsing error during upgrade:', err);
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
            return;
          }

          console.log('Session parsed for WebSocket upgrade');

          // Ensure request has session property
          const extRequest = request as any;
          if (!extRequest.session) {
            console.log('No session found in upgrade request');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          wss.handleUpgrade(request, socket, head, (ws) => {
            console.log('WebSocket upgrade completed, emitting connection');
            wss.emit('connection', ws, request);
          });
        });
      } catch (error) {
        console.error('Error during WebSocket upgrade:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
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