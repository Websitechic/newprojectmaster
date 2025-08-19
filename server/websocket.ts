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
  // Set up ping interval to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (!ws.isAlive) {
        console.log(`Terminating inactive connection for user ${ws.userId}`);
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Authentication middleware
  wss.on("connection", async (ws: ExtendedWebSocket, request: ExtendedRequest) => {
    try {
      console.log("New WebSocket connection, checking session");
      ws.isAlive = true;

      const userId = request.session && request.session.passport ? request.session.passport.user : null;
      console.log("WebSocket connection - Session user ID:", userId);

      if (!userId) {
        console.error("No authenticated user found in session");
        ws.close(1008, "Authentication required");
        return;
      }

      // Store authenticated user's WebSocket connection
      ws.userId = userId;
      if (!global.connectedClients) {
        global.connectedClients = new Map();
      }
      global.connectedClients.set(userId, ws);
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

            wss.clients.forEach((client: ExtendedWebSocket) => {
              if (client.projectId === ws.projectId && 
                  client.readyState === WebSocket.OPEN) {
                client.send(messageData);
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