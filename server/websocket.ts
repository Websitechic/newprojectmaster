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
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;

    try {
      // Safely check if request has session data from the upgrade
      const extReq = req as any;
      
      // Check for session existence more safely
      if (!extReq || !extReq.session) {
        console.log('WebSocket connection failed - no session object');
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'error',
            message: 'No session found'
          }));
          extWs.close(1008, 'No session');
        }
        return;
      }

      // Check for authenticated user
      const hasValidSession = extReq.session.passport && extReq.session.passport.user;
      
      if (hasValidSession) {
        const user = extReq.session.passport.user;
        console.log(`WebSocket authenticated user: ${user}`);
        extWs.userId = user;

        // Add to global connected clients
        if (global.connectedClients) {
          global.connectedClients.set(user, extWs);
        }

        // Send initial connection success message
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connection established'
          }));
        }
      } else {
        console.log('WebSocket connection not authenticated - no valid user in session');
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'error',
            message: 'Authentication required'
          }));
          extWs.close(1008, 'Not authenticated');
        }
        return;
      }
    } catch (error) {
      console.error('WebSocket connection error:', error);
      try {
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'error',
            message: 'Authentication failed'
          }));
          extWs.close(1008, 'Authentication failed');
        }
      } catch (closeError) {
        console.error('Error closing WebSocket:', closeError);
        // Force terminate if close fails
        if (typeof extWs.terminate === 'function') {
          extWs.terminate();
        }
      }
      return;
    }

    // Handle pong responses
    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    // Handle connection close
    extWs.on('close', () => {
      if (extWs.userId && global.connectedClients) {
        global.connectedClients.delete(extWs.userId);
      }
      console.log(`WebSocket connection closed for user ${extWs.userId}`);
    });

    // Handle messages
    extWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('WebSocket message received:', message);

        // Handle different message types here if needed
        if (message.type === 'ping') {
          extWs.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
  });

  return wss;
}