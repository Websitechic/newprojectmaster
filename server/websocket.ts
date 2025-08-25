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

  // Set up ping interval to keep connections alive (increased to 60 seconds to reduce aggressive pinging)
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
          // Remove from connected clients when terminating
          if (extWs.userId && global.connectedClients) {
            global.connectedClients.delete(extWs.userId);
          }
          return;
        }
        extWs.isAlive = false;
        if (extWs.readyState === WebSocket.OPEN) {
          try {
            extWs.ping();
          } catch (error) {
            console.error('Error sending ping:', error);
          }
        }
      });
    }
  }, 60000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Authentication middleware
  wss.on('connection', (ws: WebSocket, request: any) => {
    console.log('WebSocket connection established');

    let userId: number | null = null;

    // Check if user is authenticated - safely access session
    const session = (request as any).session || null;
    if (!session || !session.passport || !session.passport.user) {
      console.log('WebSocket connection without authenticated session - will wait for auth message');

      // Set a timeout to close unauthenticated connections
      const authTimeout = setTimeout(() => {
        if (!userId && ws.readyState === ws.OPEN) {
          console.log('Closing unauthenticated WebSocket connection after timeout');
          ws.close(1008, 'Authentication timeout');
        }
      }, 30000); // 30 seconds timeout

      // Clear timeout if connection closes
      ws.on('close', () => {
        clearTimeout(authTimeout);
      });
    } else {
      userId = session.passport.user;
      console.log(`WebSocket authenticated for user ${userId}`);

      // Store the connection
      global.connectedClients.set(userId, ws as ExtendedWebSocket);
    }

    // Handle pong responses
    ws.on('pong', () => {
      (ws as ExtendedWebSocket).isAlive = true;
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonString = reason.toString();
      console.log(`WebSocket connection closed for user ${userId || 'unknown'}, code: ${code}, reason: ${reasonString || 'no reason'}`);

      if (userId) {
        global.connectedClients.delete(userId);
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      if (userId) {
        global.connectedClients.delete(userId);
      }

      // Close the connection gracefully on error
      if (ws.readyState === ws.OPEN) {
        ws.close(1011, 'Server error');
      }
    });

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle auth message
        if (message.type === 'auth' && message.userId) {
          userId = message.userId;
          if (!global.connectedClients) {
            global.connectedClients = new Map();
          }
          global.connectedClients.set(message.userId, ws as ExtendedWebSocket);
          console.log(`WebSocket user authenticated via message: ${message.userId}`);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'auth_success',
              userId: message.userId
            }));
          }
        } else if (message.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
  });

  return wss;
}