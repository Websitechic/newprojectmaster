import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "express-session";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  projectId?: number;
  isAlive: boolean;
}

interface ExtendedRequest extends Request {
  session: Session & {
    passport?: {
      user?: number;
    };
  };
}

export function setupWebSocket(wss: WebSocketServer) {
  // WebSocket upgrade is now handled in server/index.ts to avoid duplication

  // Set up ping interval to keep connections alive
  const interval = setInterval(() => {
    if (wss && wss.clients) {
      wss.clients.forEach((ws) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          console.log(`Terminating inactive connection for user ${extWs.userId}`);
          return extWs.terminate();
        }

        extWs.isAlive = false;
        extWs.ping();
      });
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Authentication middleware
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection, checking session');

    try {
      // Check if request has session data from the upgrade
      if (req.session && req.session.passport && req.session.passport.user) {
        const user = req.session.passport.user;
        console.log(`WebSocket authenticated user: ${user}`);
        ws.userId = user;

        // Send initial connection success message
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connection established'
          }));
        }
      } else {
        console.log('WebSocket connection not authenticated - no session data');
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Authentication required'
          }));
        }
        ws.close(1008, 'Not authenticated');
      }
    } catch (error) {
      console.error('WebSocket connection error:', error.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication failed'
        }));
      }
      ws.close(1008, 'Authentication failed');
    }
  });

  return wss;
}