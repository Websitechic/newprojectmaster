import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "express-session";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";

declare global {
  var connectedClients: Map<number, WebSocket>;
}

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  projectId?: number;
}

interface CustomRequest extends Express.Request {
  session: Session & {
    passport?: {
      user?: number;
    };
  };
}

export function setupWebSocket(wss: WebSocketServer) {
  // Initialize global connected clients map if not exists
  if (!global.connectedClients) {
    global.connectedClients = new Map();
  }

  wss.on("connection", (ws: ExtendedWebSocket) => {
    console.log("New WebSocket connection");

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "auth") {
          const userId = message.userId;
          if (userId) {
            ws.userId = userId;
            global.connectedClients.set(userId, ws);
            console.log(`User ${userId} authenticated via WebSocket`);

            // Send acknowledgment
            ws.send(JSON.stringify({
              type: "auth_success",
              userId: userId
            }));
          }
        } else if (message.type === "join_project") {
          ws.projectId = message.projectId;
        } else if (message.type === "chat_message") {
          if (!ws.userId || !ws.projectId) {
            return;
          }

          const newMessage = await db
            .insert(messages)
            .values({
              content: message.content,
              projectId: ws.projectId,
              userId: ws.userId,
            })
            .returning();

          // Broadcast to all clients in the same project
          const messageData = JSON.stringify({
            type: "new_message",
            message: newMessage[0],
          });

          for (const [userId, client] of global.connectedClients) {
            if (client.projectId === ws.projectId && client.readyState === WebSocket.OPEN) {
              client.send(messageData);
            }
          }
        } else if (message.type === "status_update") {
          // Broadcast status updates to all connected clients
          for (const [userId, client] of global.connectedClients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "status_update",
                userId: ws.userId,
                status: message.status,
              }));
            }
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        global.connectedClients.delete(ws.userId);
        console.log(`User ${ws.userId} disconnected`);
      }
    });

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({ type: "connected" }));
  });

  return wss;
}