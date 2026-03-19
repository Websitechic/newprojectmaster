import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupWebSocket } from "./websocket";
import { setupVideoSocket } from "./video-socket";
import { setupVite, serveStatic, log } from "./vite";
import { breakScheduler } from "./break-scheduler";
import { communicationMonitor } from "./communication-monitor";
import { setupAuth } from "./auth";
import { initializeEmailService } from "./services/email";
import { WebSocketServer } from "ws";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "../db";

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

// Trust proxy - MUST be set before session middleware
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware (before auth to log all requests)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  
  // Special logging for authentication endpoints
  if (path === '/api/login' || path === '/api/user') {
    console.log(`\n🔐 Auth Request: ${req.method} ${path}`);
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'cookie': req.headers.cookie ? 'present' : 'absent',
      'origin': req.headers.origin,
      'referer': req.headers.referer
    });
  }
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLevel = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';
      log(`${logLevel} ${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

// Setup authentication (which includes session middleware)
setupAuth(app);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ Server Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Send appropriate error response
  const isDevelopment = app.get("env") === "development";
  res.status(500).json({
    error: isDevelopment ? err.message : "Internal Server Error",
    ...(isDevelopment && { stack: err.stack })
  });
});

let emailServiceInitialized = false;

(async () => {
  try {
    log("Starting server initialization...");
    log("Environment:", app.get("env"));
    log("Node version:", process.version);
    
    // Log production environment detection
    const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
    console.log('========== ENVIRONMENT DETECTION ==========');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('REPLIT_DEPLOYMENT:', process.env.REPLIT_DEPLOYMENT || 'not set');
    console.log('Detected as:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
    console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
    console.log('============================================');

    // Check for required environment variables
    if (!process.env.DATABASE_URL) {
      console.error("❌ FATAL: DATABASE_URL environment variable is not set!");
      console.error("Please set your database connection string in the Secrets tab");
      process.exit(1);
    }

    log("Database URL configured:", process.env.DATABASE_URL.substring(0, 20) + "...");

    // Test database connection first
    try {
      log("Testing database connection...");
      await db.execute("SELECT 1 as test");
      log("✅ Database connection successful");
    } catch (error: any) {
      console.error("❌ FATAL: Cannot connect to database!");
      console.error("Error:", error.message || error);
      console.error("Please check your DATABASE_URL in the Secrets tab");
      process.exit(1);
    }

    // Auto-migrate database on startup with better error handling
    try {
      log("Starting database migrations...");
      await migrate(db, { migrationsFolder: "./migrations" });
      log("✅ Database migrations completed successfully");
    } catch (error: any) {
      console.error("⚠️ Database migration error:", error.message || error);
      console.error("Error code:", error.code);
      console.error("Full error:", error);
      
      // Only continue if it's a duplicate column/constraint error (already applied)
      const isDuplicateError = error.message && (
        error.message.includes('already exists') || 
        error.code === '42701' || // duplicate column
        error.code === '42P07' || // duplicate table
        error.code === '42710'    // duplicate object
      );
      
      if (!isDuplicateError) {
        console.error("❌ CRITICAL migration error - cannot continue");
        console.error("To fix: Check your database connection and schema");
        process.exit(1);
      } else {
        log("⚠️ Migration skipped - schema already up to date");
      }
    }

    // Ensure review_links table has required columns and constraints (manual schema fix)
    // This is CRITICAL - if schema update fails, we must not start the server in a broken state
    log("Checking review_links schema for required columns...");
    
    let schemaUpdateNeeded = false;
    let schemaUpdateFailed = false;
    
    try {
      // Check if review_comment column exists
      const reviewCommentCheck = await db.execute(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'review_links' AND column_name = 'review_comment'
      `);
      
      if (reviewCommentCheck.length === 0) {
        schemaUpdateNeeded = true;
        log("Adding missing review_comment column...");
        await db.execute(`ALTER TABLE review_links ADD COLUMN review_comment TEXT`);
        log("✅ Added review_comment column");
      } else {
        log("✓ review_comment column exists");
      }
      
      // Check if commented_at column exists
      const commentedAtCheck = await db.execute(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'review_links' AND column_name = 'commented_at'
      `);
      
      if (commentedAtCheck.length === 0) {
        schemaUpdateNeeded = true;
        log("Adding missing commented_at column...");
        await db.execute(`ALTER TABLE review_links ADD COLUMN commented_at TIMESTAMP`);
        log("✅ Added commented_at column");
      } else {
        log("✓ commented_at column exists");
      }
      
      // Check and update status constraint to include new values
      const constraintCheck = await db.execute(`
        SELECT pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint 
        WHERE conrelid = 'review_links'::regclass 
        AND conname = 'review_links_status_check'
      `);
      
      if (constraintCheck.length > 0) {
        const constraintDef = (constraintCheck[0] as any).constraint_def || '';
        if (!constraintDef.includes('needs_revision')) {
          schemaUpdateNeeded = true;
          log("Updating status constraint to include new values...");
          await db.execute(`ALTER TABLE review_links DROP CONSTRAINT IF EXISTS review_links_status_check`);
          await db.execute(`ALTER TABLE review_links ADD CONSTRAINT review_links_status_check 
            CHECK (status IN ('pending', 'reviewed', 'needs_revision', 'not_approved'))`);
          log("✅ Updated status constraint");
        } else {
          log("✓ status constraint is up to date");
        }
      }
      
      log("✅ review_links schema verified");
    } catch (schemaError: any) {
      console.error("❌ CRITICAL: Failed to update review_links schema!");
      console.error("Error message:", schemaError.message);
      console.error("Error code:", schemaError.code);
      console.error("Full error:", schemaError);
      schemaUpdateFailed = true;
      
      // If schema update was needed and failed, this is critical
      if (schemaUpdateNeeded) {
        console.error("❌ FATAL: Required schema update failed - cannot start server");
        process.exit(1);
      } else {
        // Schema check failed but no updates were needed, continue with warning
        console.error("⚠️ Schema check had issues but columns appear to exist - continuing...");
      }
    }

    // Initialize email service with timeout (non-critical)
    try {
      log("Initializing email service...");
      await Promise.race([
        initializeEmailService(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Email service initialization timeout")), 5000)
        )
      ]);
      emailServiceInitialized = true;
      log("✅ Email service initialized successfully");
    } catch (error: any) {
      log("⚠️ Warning: Email service initialization failed - continuing without email service");
      console.error("Email service error:", error.message || error);
      // Non-critical, continue
    }

    log("Setting up routes and server...");
    let server;
    try {
      server = registerRoutes(app);
      log("✅ Routes registered successfully");
    } catch (error: any) {
      console.error("❌ FATAL: Failed to register routes:", error.message || error);
      console.error("Stack:", error.stack);
      process.exit(1);
    }

    // Setup WebSocket server with separate path from Vite HMR
    log("Setting up WebSocket server...");
    let wss;
    try {
      wss = new WebSocketServer({
        noServer: true,
        path: "/api/ws"
      });
      log("✅ WebSocket server created");
    } catch (error: any) {
      console.error("❌ FATAL: Failed to create WebSocket server:", error.message || error);
      process.exit(1);
    }

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
      }, 15000);

      try {
        clearTimeout(upgradeTimeout);
        
        wss.handleUpgrade(request, socket, head, (ws) => {
          console.log('WebSocket upgrade completed, emitting connection');
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        clearTimeout(upgradeTimeout);
        console.error('WebSocket upgrade error:', error);
        if (socket && !socket.destroyed) {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        }
      }
    });

    try {
      setupWebSocket(wss);
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      log("Setting up Vite development server...");
      await setupVite(app, server);
    } else {
      log("Setting up static file serving...");
      serveStatic(app);
    }

    // Start the server with error handling
    const port = 5000;
    log(`Attempting to start server on port ${port}...`);
    
    server.listen(port, "0.0.0.0", () => {
      console.log("\n" + "=".repeat(50));
      console.log(`✅ Server successfully started!`);
      console.log(`🌐 Server running on http://0.0.0.0:${port}`);
      console.log(`📝 Environment: ${app.get("env")}`);
      console.log("=".repeat(50) + "\n");

      // Start the break scheduler
      try {
        breakScheduler.start();
        log("✅ Break scheduler started");
      } catch (error: any) {
        console.error("⚠️ Break scheduler failed to start:", error.message);
      }

      // Initialize communication monitor
      try {
        communicationMonitor.start();
        log("✅ Communication monitor started");
      } catch (error: any) {
        console.error("⚠️ Communication monitor failed to start:", error.message);
      }
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ FATAL: Port ${port} is already in use!`);
        console.error("Please stop any other processes using this port and try again.");
        process.exit(1);
      } else {
        console.error("❌ FATAL: Server error:", error.message || error);
        console.error("Stack:", error.stack);
        process.exit(1);
      }
    });

  } catch (error: any) {
    console.error("\n" + "=".repeat(50));
    console.error("❌ FATAL SERVER INITIALIZATION ERROR");
    console.error("=".repeat(50));
    console.error("Error:", error.message || error);
    console.error("Stack:", error.stack);
    console.error("=".repeat(50) + "\n");
    process.exit(1);
  }
})();