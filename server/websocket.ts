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
  // Initialize global connected clients map
  if (!global.connectedClients) {
    global.connectedClients = new Map();
  }

  // Set up ping interval to keep connections alive
  const interval = setInterval(() => {
    if (wss && wss.clients) {
      wss.clients.forEach((ws) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          console.log(`Terminating inactive connection for user ${extWs.userId || 'unknown'}`);
          try {
            if (extWs.readyState === WebSocket.OPEN || extWs.readyState === WebSocket.CONNECTING) {
              extWs.terminate();
            }
          } catch (error) {
            console.error('Error terminating WebSocket:', error);
          }
          return;
        }
        extWs.isAlive = false;
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.ping();
        }
      });
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Authentication middleware
  wss.on('connection', (ws, req) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;

    try {
      // Safely get session from request
      const session = (req as any)?.session;
      
      if (session?.passport?.user) {
        const userId = session.passport.user;
        console.log(`WebSocket authenticated user: ${userId}`);
        extWs.userId = userId;

        // Add to global connected clients
        if (!global.connectedClients) {
          global.connectedClients = new Map();
        }
        global.connectedClients.set(userId, extWs);

        // Send initial connection success message
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connection established',
            authenticated: true,
            userId: userId
          }));
        }
      } else {
        console.log('WebSocket connection without authenticated session - will wait for auth message');
        
        // Send connection established message for unauthenticated connections
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connection established',
            authenticated: false
          }));
        }
      }
    } catch (error) {
      console.error('WebSocket connection error:', error);
      
      // Send basic connection message even if there's an error
      try {
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connection established',
            authenticated: false,
            error: 'Session parsing failed'
          }));
        }
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }

    // Handle pong responses
    extWs.on('pong', () => {
      extWs.isAlive = true;
    });

    // Handle connection close
    extWs.on('close', (code, reason) => {
      if (extWs.userId && global.connectedClients) {
        global.connectedClients.delete(extWs.userId);
      }
      console.log(`WebSocket connection closed for user ${extWs.userId || 'unknown'}, code: ${code}, reason: ${reason?.toString() || 'no reason'}`);
    });

    // Handle messages
    extWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle auth message
        if (message.type === 'auth' && message.userId) {
          extWs.userId = message.userId;
          if (!global.connectedClients) {
            global.connectedClients = new Map();
          }
          global.connectedClients.set(message.userId, extWs);
          console.log(`WebSocket user authenticated via message: ${message.userId}`);
          
          if (extWs.readyState === WebSocket.OPEN) {
            extWs.send(JSON.stringify({
              type: 'auth_success',
              userId: message.userId
            }));
          }
        } else if (message.type === 'ping') {
          if (extWs.readyState === WebSocket.OPEN) {
            extWs.send(JSON.stringify({ type: 'pong' }));
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle WebSocket errors
    extWs.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}