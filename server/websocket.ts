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
    try {
      console.log('WebSocket connection established');

      let userId: number | null = null;
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;

      // Check if user is authenticated - safely access session with proper error handling
      let session = null;
      try {
        // Handle different request object structures
        if (request && typeof request === 'object') {
          session = request.session || (request.req && request.req.session) || null;
        }
      } catch (error) {
        console.error('Error accessing session in WebSocket connection:', error);
        session = null;
      }

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

        // Handle auth message for unauthenticated connections
        ws.once('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'auth' && message.userId) { // Corrected to use userId from message
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
            console.error("Error parsing WebSocket auth message:", error);
          }
        });

      } else {
        userId = session.passport.user;
        console.log(`WebSocket authenticated for user ${userId}`);

        // Set user properties
        extWs.userId = userId;

        // Store the connection
        if (!global.connectedClients) {
          global.connectedClients = new Map();
        }
        global.connectedClients.set(userId, extWs);

        // Handle pong responses
        ws.on('pong', () => {
          extWs.isAlive = true;
        });
      }

      // Handle connection close
      ws.on('close', (code: number, reason: Buffer) => {
        const reasonString = reason ? reason.toString() : 'no reason provided';
        console.log(`WebSocket connection closed for user ${userId || 'unknown'}, code: ${code}, reason: ${reasonString}`);

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

          // Handle auth message (if not handled during initial connection setup)
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
          } else {
            // Handle other message types here
            console.log('Received message:', message);
            // Example: broadcast message to other clients in the same project
            if (message.projectId && message.text && userId) {
              const projectId = message.projectId;
              const senderUserId = userId;
              if (global.connectedClients) {
                global.connectedClients.forEach((client, clientId) => {
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
        }
      });
    } catch (error) {
      console.error('Error in WebSocket connection setup:', error);
      ws.close(1011, 'Server error during connection setup');
    }
  });

  return wss;
}