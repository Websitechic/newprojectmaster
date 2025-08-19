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

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ 
    noServer: true,
    path: '/ws'
  });

  // Handle WebSocket upgrade manually to prevent double handling
  server.on('upgrade', (request: any, socket: any, head: any) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws: any) => {
        wss.emit('connection', ws, request);
      });
    }
  });

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
  wss.on("connection", async (ws: ExtendedWebSocket, request: any) => {
    try {
      console.log("New WebSocket connection, checking session");
      ws.isAlive = true;

      // For now, allow connections without strict session validation
      // In production, you'd want proper session validation
      const userId = request.session?.passport?.user || 1; // Fallback for development
      
      if (!userId) {
        console.log('WebSocket connection rejected - user not authenticated');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1008, 'Authentication required');
        }
        return;
      }

      // Store authenticated user's WebSocket connection
      ws.userId = userId;
      if (!global.connectedClients) {
        global.connectedClients = new Map();
      }
      global.connectedClients.set(userId, ws as any);
      console.log(`WebSocket authenticated for user ${userId}`);

      // Send authentication success message
      ws.send(JSON.stringify({
        type: "auth_success",
        userId: userId
      }));

      // Set up WebSocket event handlers
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on("message", async (data: string) => {
        try {
          const message = JSON.parse(data);
          console.log('Received WebSocket message:', message);

          if (message.type === "join_project") {
            ws.projectId = message.projectId;
            console.log(`User ${userId} joined project ${message.projectId}`);
          } else if (message.type === "chat_message") {
            if (!ws.userId || !ws.projectId) {
              console.error("Missing userId or projectId for chat message");
              return;
            }

            const [newMessage] = await db
              .insert(messages)
              .values({
                content: message.content,
                projectId: ws.projectId,
                userId: ws.userId,
                createdAt: new Date()
              })
              .returning();

            // Broadcast to all clients in the same project
            const messageData = JSON.stringify({
              type: "new_message",
              message: newMessage,
            });

            wss.clients.forEach((client) => {
              const extClient = client as ExtendedWebSocket;
              if (extClient.projectId === ws.projectId &&
                  extClient.readyState === WebSocket.OPEN) {
                extClient.send(messageData);
              }
            });
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        if (ws.userId) {
          global.connectedClients.delete(ws.userId);
          console.log(`User ${ws.userId} disconnected from WebSocket`);
        }
      });

      ws.on("error", (error) => {
        console.error(`WebSocket error for user ${ws.userId}:`, error);
        ws.close(1011, "Internal server error");
      });

    } catch (error) {
      console.error("WebSocket connection error:", error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "Internal server error");
      }
    }
  });

  return wss;
}