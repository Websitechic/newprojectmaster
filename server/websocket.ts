import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "express-session";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";
import type http from "http"; // Ensure http is imported for type safety

// Global map to store active WebSocket connections, keyed by userId
// This is a placeholder; a more robust solution might use a dedicated class or module
// for managing connections.
declare global {
  namespace NodeJS {
    interface Global {
      connectedClients: Map<number, ExtendedWebSocket>;
    }
  }
}

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

// Placeholder for updateUserStatus function, assuming it exists elsewhere
// This function would typically update a user's status in the database or cache.
function updateUserStatus(userId: number, status: 'online' | 'offline'): void {
  console.log(`User ${userId} status updated to: ${status}`);
  // Implement actual status update logic here
}

// Placeholder for activeConnections map, assuming it's managed elsewhere or globally
// This map would track all active WebSocket connections for each user.
// For simplicity, we'll manage it within setupWebSocket for now, but a real app
// might need a more centralized approach.
const activeConnections = new Map<number, ExtendedWebSocket[]>();

export function setupWebSocket(wss: WebSocketServer) {
  // WebSocket server is now passed from index.ts

  // Initialize global connected clients map if it doesn't exist
  if (typeof global.connectedClients === 'undefined') {
    global.connectedClients = new Map();
  }

  // Set up ping interval to keep connections alive (increased to 45 seconds for better balance)
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
            // If ping fails, mark as not alive to terminate on next check
            extWs.isAlive = false;
          }
        }
      });
    }
  }, 45000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Authentication middleware and connection handling
  wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
    console.log('WebSocket connection established');

    // Access session from request with fallback
    const session = (request as any).session;
    if (!session) {
      console.log("WebSocket connection rejected: No session found");
      ws.close(1008, "Session not found");
      return;
    }

    if (!session.user) {
      console.log("WebSocket connection rejected: No authenticated user");
      ws.close(1008, "Authentication required");
      return;
    }

    let userId: number | null = session.user.id || null;
    let heartbeatInterval: NodeJS.Timeout;
    let isAlive = true;

    // Ping/pong mechanism for connection health
    ws.on('pong', () => {
      isAlive = true;
    });

    // Start heartbeat with ping/pong
    const startHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        if (!isAlive) {
          console.log(`Terminating inactive WebSocket connection for user ${userId}`);
          ws.terminate();
          return;
        }

        isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          } catch (error) {
            console.error('Error in heartbeat:', error);
            isAlive = false;
          }
        }
      }, 25000); // Reduced to 25 seconds to match client ping interval
    };

    startHeartbeat();

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonString = reason.toString() || 'no reason provided';
      console.log(`WebSocket connection closed for user ${userId || 'unknown'}, code: ${code || 'unknown'}, reason: ${reasonString}`);

      clearInterval(heartbeatInterval);

      if (userId) {
        // Remove from active connections
        const userConnections = activeConnections.get(userId);
        if (userConnections) {
          const index = userConnections.indexOf(ws as ExtendedWebSocket);
          if (index > -1) {
            userConnections.splice(index, 1);
            if (userConnections.length === 0) {
              activeConnections.delete(userId);
              updateUserStatus(userId, 'offline');
            }
          }
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(heartbeatInterval);
    });

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle authentication message if not authenticated via session
        if (message.type === 'auth' && message.userId) {
          if (userId !== null) {
            console.warn(`User ${userId} trying to re-authenticate with ID ${message.userId}`);
            return; // User already authenticated, ignore re-auth attempt
          }
          userId = message.userId;
          console.log(`WebSocket user authenticated via message: ${userId}`);

          // Update global connected clients map
          if (!global.connectedClients) {
            global.connectedClients = new Map();
          }
          global.connectedClients.set(userId, ws as ExtendedWebSocket);

          // Add to activeConnections for user-specific management
          if (!activeConnections.has(userId)) {
            activeConnections.set(userId, []);
          }
          activeConnections.get(userId)?.push(ws as ExtendedWebSocket);
          updateUserStatus(userId, 'online');

          // Send authentication success response
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'auth_success',
              userId: userId
            }));
          }
        } else if (message.type === 'ping') {
          // Respond to ping with pong
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } else {
          // Handle other message types
          console.log('Received message:', message);

          // Handle project-specific messages (e.g., chat)
          if (message.projectId && message.text && userId) {
            const projectId = message.projectId;
            const senderUserId = userId;

            // Broadcast message to other clients in the same project
            if (global.connectedClients) {
              global.connectedClients.forEach((client, clientId) => {
                // Ensure client is not the sender and is in the same project and is open
                if (client.userId === senderUserId) return; // Don't send back to sender
                if (client.projectId === projectId && client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: 'message',
                      sender: senderUserId,
                      text: message.text,
                      projectId: projectId
                    }));
                  } catch (sendError) {
                    console.error(`Error sending message to client ${clientId}:`, sendError);
                  }
                }
              });
            }
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        // Optionally send an error back to the client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      }
    });
  });

  return wss;
}