import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "express-session";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";
import { eq } from "drizzle-orm";
import { users, UserStatus } from "@db/schema"; // Assuming users and UserStatus are exported from schema

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
  wss.on('connection', (ws, req) => {
    const extWs = ws as ExtendedWebSocket;
    extWs.isAlive = true;

    // Keep track of clients using a Map for easier lookup
    const clients = new Map<WebSocket, { userId?: number; lastSeen: number }>();

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

        // Add to local clients map for message handling within this connection scope
        clients.set(ws, { userId: userId, lastSeen: Date.now() });


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
      // Clean up from global map
      if (extWs.userId && global.connectedClients) {
        global.connectedClients.delete(extWs.userId);
      }
      // Clean up from local map
      clients.delete(ws);
      console.log(`WebSocket connection closed for user ${extWs.userId || 'unknown'}, code: ${code}, reason: ${reason?.toString() || 'no reason'}`);
    });

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'auth') {
          // For now, we'll use a simple auth check
          // In production, you might want to validate a token
          const userId = message.userId;
          if (userId) {
            clients.set(ws, { userId, lastSeen: Date.now() });
            console.log(`WebSocket authenticated for user ${userId}`);

            // Send confirmation
            ws.send(JSON.stringify({ type: 'auth_success', userId }));

            // Update user status to online
            try {
              await db.update(users)
                .set({
                  status: UserStatus.ONLINE,
                  lastActive: new Date()
                })
                .where(eq(users.id, userId));

              console.log(`User ${userId} is now online`);
            } catch (dbError) {
              console.error('Error updating user status:', dbError);
            }
          }
          return;
        }

        // Check if connection is authenticated for other message types
        const client = clients.get(ws);
        if (!client || client.userId === undefined) {
          console.log('Unauthenticated WebSocket message received');
          // Optionally send an error back to the client
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
          }
          return;
        }

        // Handle other message types here
        // Example: Handle direct messages
        if (message.type === 'direct_message') {
          const { recipientId, content } = message;
          const senderId = client.userId;

          // Ensure sender and recipient are valid
          if (senderId && recipientId && content) {
            // Save message to database
            const newMessage: Message = {
              id: crypto.randomUUID(), // Assuming message IDs are UUIDs
              senderId: senderId,
              recipientId: recipientId,
              content: content,
              timestamp: new Date(),
              // Add projectId if applicable and available in extWs
              projectId: extWs.projectId,
            };

            await db.insert(messages).values(newMessage);
            console.log(`Message sent from ${senderId} to ${recipientId}: ${content}`);

            // Notify recipient if they are online
            const recipientWs = global.connectedClients.get(recipientId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
              recipientWs.send(JSON.stringify({
                type: 'new_message',
                message: newMessage
              }));
            }
          } else {
            console.error('Invalid direct message payload:', message);
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

    // Handle WebSocket errors
    extWs.on('error', (error) => {
      console.error('WebSocket error:', error);
      // Ensure cleanup if an error occurs
      if (extWs.userId && global.connectedClients) {
        global.connectedClients.delete(extWs.userId);
      }
      clients.delete(ws);
    });
  });

  return wss;
}

// Mock implementations for missing types/functions if not provided elsewhere
declare global {
  namespace NodeJS {
    interface Global {
      connectedClients: Map<number, ExtendedWebSocket>;
    }
  }
}

// Mock db, users, UserStatus, eq, messages for demonstration if they are not globally available
// In a real app, these would be properly imported and configured.
// const db = {
//   update: () => ({ set: () => ({ where: () => {} }) }),
//   insert: () => ({ values: () => {} }),
// };
// const users = { id: 'users', name: 'users' };
// const UserStatus = { ONLINE: 'online' };
// const messages = { id: 'messages', senderId: 'senderId', recipientId: 'recipientId', content: 'content', timestamp: 'timestamp', projectId: 'projectId' };
// const eq = (a: any, b: any) => `${a} = ${b}`;
// const crypto = { randomUUID: () => 'mock-uuid' };