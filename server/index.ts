import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupWebSocket } from "./websocket";
import { setupVideoSocket } from "./video-socket";
import { setupVite, serveStatic, log } from "./vite";
import { breakScheduler } from "./break-scheduler";
import { communicationMonitor } from "./communication-monitor";
import { setupAuth } from "./auth";
import { initializeDatabase } from "./init-db";
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

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
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

    // Initialize and check database with timeout
    log("Checking database connection...");
    let dbReady = false;
    
    try {
      dbReady = await Promise.race([
        initializeDatabase(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error("Database initialization timeout")), 10000)
        )
      ]);
    } catch (error) {
      console.warn("Database initialization failed or timed out:", error);
      dbReady = false;
    }
    
    if (!dbReady) {
      log("Warning: Database not ready. Server will start in limited mode.");
      log("Some features may not work correctly until database connection is established.");
    } else {
      log("Database connection established successfully");
    }

    log("Setting up routes and server...");
    const server = registerRoutes(app);

    // Setup WebSocket server with separate path from Vite HMR
    log("Setting up WebSocket...");
    const wss = new WebSocketServer({
      noServer: true,
      path: "/api/ws"
    });

    // Session parser middleware for WebSocket upgrades with comprehensive error handling
    const sessionParser = (req: any, res: any, next: any) => {
      try {
        // Create a comprehensive mock response object for WebSocket requests
        if (!res || typeof res.getHeader !== 'function') {
          res = {
            getHeader: () => null,
            setHeader: () => {},
            removeHeader: () => {},
            end: () => {},
            writeHead: () => {},
            write: () => {},
            headersSent: false,
            statusCode: 200,
            locals: {}
          };
        }
        
        // Apply session middleware with error handling
        sessionMiddleware(req, res, (err: any) => {
          if (err) {
            console.warn('Session middleware warning during WebSocket upgrade:', err);
          }
          
          // Always ensure session object exists with safe defaults
          if (!req.session || typeof req.session !== 'object') {
            req.session = {
              id: null,
              cookie: {
                originalMaxAge: 24 * 60 * 60 * 1000,
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
                secure: false,
                httpOnly: true,
                path: '/'
              },
              passport: {},
              user: null
            };
            console.log('Created default session object for WebSocket');
          }
          
          if (typeof next === 'function') {
            next(); // Don't pass error to prevent connection failure
          }
        });
      } catch (error) {
        console.error('Critical session parser error:', error);
        
        // Ensure minimal session object exists
        if (!req.session) {
          req.session = {
            id: null,
            passport: {},
            user: null
          };
        }
        
        if (typeof next === 'function') {
          next(); // Continue without error
        }
      }
    };

    // WebSocket upgrade handling with improved error management and path filtering
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);

      // Only handle our application WebSocket upgrades, let Vite handle HMR WebSocket
      if (url.pathname !== '/api/ws') {
        console.log('Ignoring non-application WebSocket upgrade:', url.pathname);
        return;
      }

      console.log('Application WebSocket upgrade request received for /api/ws');

      // Set upgrade timeout with longer duration
      const upgradeTimeout = setTimeout(() => {
        console.log('WebSocket upgrade timeout');
        if (socket && !socket.destroyed) {
          socket.write('HTTP/1.1 408 Request Timeout\r\n\r\n');
          socket.destroy();
        }
      }, 10000);

      // Parse session for WebSocket connection with improved error handling
      sessionParser(request, {} as any, (err) => {
        clearTimeout(upgradeTimeout);

        // Don't fail WebSocket connection for session parsing errors
        if (err) {
          console.warn('Session parsing warning during WebSocket upgrade:', err);
          // Continue with upgrade even if session parsing fails
        }

        try {
          console.log('Processing WebSocket upgrade with session state:', !!request.session);

          // Ensure session exists for WebSocket handler
          if (!request.session) {
            request.session = {} as any;
            console.log('Created empty session object for WebSocket');
          }

          wss.handleUpgrade(request, socket, head, (ws) => {
            console.log('WebSocket upgrade completed, emitting connection');
            wss.emit('connection', ws, request);
          });
        } catch (error) {
          console.error('WebSocket upgrade error:', error);
          if (socket && !socket.destroyed) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
          }
        }
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

    // Validate environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Start the server
    const port = 5000;
    server.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
      
      try {
        // Start the break scheduler
        breakScheduler.start();
        console.log('Break scheduler started');

        // Initialize communication monitor
        communicationMonitor.start();
        console.log('Communication monitor started');
      } catch (error) {
        console.error('Error starting schedulers:', error);
      }
    });
  } catch (error) {
    console.error("Fatal server initialization error:", error);
    process.exit(1);
  }
})();