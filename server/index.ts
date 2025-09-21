
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { WebSocketServer } from 'ws';
import session from "express-session";
import MemoryStore from "memorystore";
import { initializeEmailService } from "./services/email";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Session configuration
const sessionMiddleware = session({
  secret: process.env.REPL_ID || "fallback-secret-key",
  resave: false,
  saveUninitialized: false,
  store: new (MemoryStore(session))({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 86400000, // 24 hours
  },
});

app.use(sessionMiddleware);

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

    // Setup WebSocket server with separate path from Vite HMR
    log("Setting up WebSocket...");
    const wss = new WebSocketServer({
      noServer: true,
      path: "/api/ws"
    });

    // Session parser middleware for WebSocket upgrades
    const sessionParser = (req: any, res: any, next: any) => {
      sessionMiddleware(req, res, next);
    };

    // WebSocket upgrade handling with improved error management and path filtering
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      
      // Only handle WebSocket upgrades for our API path, let Vite handle HMR
      if (url.pathname !== '/api/ws') {
        log(`WebSocket upgrade request for ${url.pathname} - ignoring (not our path)`);
        return; // Let other handlers (like Vite) handle this
      }

      log(`WebSocket upgrade request for ${url.pathname}`);
      
      sessionParser(request, {} as any, (err: any) => {
        if (err) {
          log(`Session parsing error during WebSocket upgrade: ${err.message}`);
          socket.destroy();
          return;
        }

        // Ensure session exists before proceeding
        if (!request.session) {
          log("No session found during WebSocket upgrade");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });
    });

    // WebSocket connection handling
    wss.on('connection', (ws, request) => {
      try {
        // Safely access session with null check
        const session = (request as any).session;
        if (!session) {
          log("WebSocket connection attempted without valid session");
          ws.close(1008, "No valid session");
          return;
        }

        const userId = session.passport?.user?.id;
        if (!userId) {
          log("WebSocket connection attempted without authenticated user");
          ws.close(1008, "Not authenticated");
          return;
        }

        log(`WebSocket connection established for user ${userId}`);
        
        // Store user info on WebSocket connection
        (ws as any).userId = userId;
        (ws as any).sessionId = session.id;

        // Handle WebSocket messages
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            log(`WebSocket message from user ${userId}: ${data.type}`);
            
            // Handle different message types here
            switch (data.type) {
              case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
              default:
                log(`Unknown WebSocket message type: ${data.type}`);
            }
          } catch (error) {
            log(`Error processing WebSocket message: ${error}`);
          }
        });

        ws.on('close', (code, reason) => {
          log(`WebSocket connection closed for user ${userId}: ${code} ${reason}`);
        });

        ws.on('error', (error) => {
          log(`WebSocket error for user ${userId}: ${error.message}`);
        });

        // Send connection confirmation
        ws.send(JSON.stringify({ type: 'connected', userId }));

      } catch (error) {
        log(`Error in WebSocket connection handler: ${error}`);
        ws.close(1011, "Internal server error");
      }
    });

    // In development, setup Vite middleware
    if (process.env.NODE_ENV !== "production") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Global error handler
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      log(`Global error handler: ${err.message}`);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ error: message });
    });

    const port = parseInt(process.env.PORT || "5000");
    server.listen(port, "0.0.0.0", () => {
      log(`Server running on port ${port}`);
      log(`Environment: ${process.env.NODE_ENV || "development"}`);
      log(`Email service: ${emailServiceInitialized ? "initialized" : "disabled"}`);
    });

  } catch (error) {
    log(`Server startup error: ${error}`);
    console.error("Full error:", error);
    process.exit(1);
  }
})();
