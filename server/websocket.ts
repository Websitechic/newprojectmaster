import { WebSocketServer, WebSocket } from "ws";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages } from "@db/schema";

interface Client extends WebSocket {
  userId?: number;
  projectId?: number;
}

export function setupWebSocket(wss: WebSocketServer) {
  const clients = new Set<Client>();

  wss.on("connection", (ws: Client) => {
    clients.add(ws);

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case "auth":
            ws.userId = message.userId;
            break;

          case "join_project":
            ws.projectId = message.projectId;
            break;

          case "chat_message":
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

            for (const client of clients) {
              if (client.projectId === ws.projectId) {
                client.send(messageData);
              }
            }
            break;

          case "status_update":
            // Broadcast status updates to all connected clients
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "status_update",
                  userId: ws.userId,
                  status: message.status,
                }));
              }
            }
            break;
        }
      } catch (error) {
        console.error("WebSocket error:", error);
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({ type: "connected" }));
  });
}
