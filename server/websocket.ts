import { WebSocketServer, WebSocket } from "ws";
import type { Session } from "express-session";
import type { Message } from "@db/schema";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { sendOneSignalNotification } from "./onesignal";
import { eq } from "drizzle-orm";

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

      // Log session details for debugging
      console.log('WebSocket connection session check:', {
        hasSession: !!session,
        hasPassport: !!(session && session.passport),
        hasUser: !!(session && session.passport && session.passport.user)
      });

      if (!session || !session.passport || !session.passport.user) {
        console.log('WebSocket connection without authenticated session - will wait for auth message');

        // Set a timeout to close unauthenticated connections
        const authTimeout = setTimeout(() => {
          if (!userId && ws.readyState === ws.OPEN) {
            console.log('Closing unauthenticated WebSocket connection after timeout');
            try {
              ws.close(1008, 'Authentication timeout');
            } catch (error) {
              console.error('Error closing WebSocket on timeout:', error);
            }
          }
        }, 10000); // Reduced to 10 seconds timeout

        // Clear timeout if connection closes
        ws.on('close', () => {
          clearTimeout(authTimeout);
        });

        // Handle auth message for unauthenticated connections
        const handleAuthMessage = (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            console.log('Received WebSocket message for unauthenticated connection:', message);
            
            if (message.type === 'auth' && message.userId) {
              userId = message.userId;
              extWs.userId = userId;
              
              if (!global.connectedClients) {
                global.connectedClients = new Map();
              }
              global.connectedClients.set(message.userId, ws as ExtendedWebSocket);
              console.log(`WebSocket user authenticated via message: ${message.userId}`);

              clearTimeout(authTimeout);

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'auth_success',
                  userId: message.userId
                }));
              }

              // Remove the auth-specific message handler and set up the main message handler
              ws.removeListener('message', handleAuthMessage);
              setupMessageHandler();
            } else if (message.type === 'ping') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
              }
            }
          } catch (error) {
            console.error("Error parsing WebSocket auth message:", error);
          }
        };

        ws.on('message', handleAuthMessage);

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

      // Set up the main message handler
      const setupMessageHandler = () => {
        ws.on('message', handleMainMessages);
      };

      // Handle messages
      const handleMainMessages = async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received WebSocket message from authenticated user:', message);

          if (message.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } else {
            // Handle other message types here
            console.log('Received message:', message);
            
            // Handle project messages
            if (message.type === 'project_message' && message.projectId && message.content && userId) {
              const projectId = message.projectId;
              const senderUserId = userId;
              const recipientIds: number[] = [];
              
              if (global.connectedClients) {
                global.connectedClients.forEach((client, clientId) => {
                  if (client.userId === senderUserId) return; // Don't send back to sender
                  recipientIds.push(clientId as number);
                  if (client.readyState === WebSocket.OPEN) {
                    try {
                      client.send(JSON.stringify({
                        type: 'project_message',
                        data: {
                          projectId: projectId,
                          content: message.content,
                          senderId: senderUserId,
                          createdAt: new Date().toISOString()
                        }
                      }));
                    } catch (sendError) {
                      console.error(`Error sending project message to client ${clientId}:`, sendError);
                    }
                  }
                });
              }
              
              // Send OneSignal notifications for WebSocket project messages
              if (recipientIds.length > 0) {
                try {
                  const senderUser = await db.select().from(users).where(eq(users.id, senderUserId)).limit(1);
                  const senderName = senderUser[0]?.name || 'Team Member';
                  
                  console.log(`\n🔵 WebSocket TEAM MESSAGE OneSignal:`, { projectId, recipientIds: recipientIds.length });
                  await sendOneSignalNotification(
                    recipientIds,
                    `Team Chat Message`,
                    `${senderName}: ${message.content.substring(0, 100)}`
                  );
                  console.log(`✅ WebSocket team message OneSignal sent to ${recipientIds.length} users`);
                } catch (oneSignalError) {
                  console.error(`❌ WebSocket team message OneSignal failed:`, oneSignalError);
                }
              }
            }
            
            // Handle direct messages
            if (message.type === 'direct_message' && message.receiverId && message.content && userId) {
              const receiverId = message.receiverId;
              const receiverClient = global.connectedClients?.get(receiverId);
              if (receiverClient && receiverClient.readyState === WebSocket.OPEN) {
                try {
                  receiverClient.send(JSON.stringify({
                    type: 'direct_message',
                    data: {
                      senderId: userId,
                      receiverId: receiverId,
                      content: message.content,
                      createdAt: new Date().toISOString()
                    }
                  }));
                } catch (sendError) {
                  console.error(`Error sending direct message to user ${receiverId}:`, sendError);
                }
              }
              
              // Send OneSignal notification for WebSocket direct messages
              try {
                const senderUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
                const senderName = senderUser[0]?.name || 'Team Member';
                
                console.log(`\n🔴 WebSocket DIRECT MESSAGE OneSignal:`, { receiverId, senderId: userId });
                await sendOneSignalNotification(
                  receiverId,
                  `${senderName} sent you a message`,
                  message.content.substring(0, 100)
                );
                console.log(`✅ WebSocket direct message OneSignal sent to ${receiverId}`);
              } catch (oneSignalError) {
                console.error(`❌ WebSocket direct message OneSignal failed:`, oneSignalError);
              }
            }
            
            // Handle task status updates
            if (message.type === 'task_update' && message.taskId && userId) {
              if (global.connectedClients) {
                global.connectedClients.forEach((client, clientId) => {
                  if (client.userId === userId) return; // Don't send back to sender
                  if (client.readyState === WebSocket.OPEN) {
                    try {
                      client.send(JSON.stringify({
                        type: 'task_update',
                        data: {
                          taskId: message.taskId,
                          status: message.status,
                          updatedBy: userId,
                          updatedAt: new Date().toISOString()
                        }
                      }));
                    } catch (sendError) {
                      console.error(`Error sending task update to client ${clientId}:`, sendError);
                    }
                  }
                });
              }
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      // If user is already authenticated, set up main message handler immediately
      if (userId) {
        setupMessageHandler();
      }
    } catch (error) {
      console.error('Error in WebSocket connection setup:', error);
      ws.close(1011, 'Server error during connection setup');
    }
  });

  return wss;
}