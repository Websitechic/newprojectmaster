import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { db } from "@db";
import { projectMembers } from "@db/schema";
import { eq } from "drizzle-orm";
import type { Session } from "express-session";

interface JoinRoomData {
  roomId: string;
  userId: number;
}

interface SignalData {
  signal: any;
  userToSignal?: string;
  callerId?: string;
}

// Properly extend the Socket type with session
interface CustomSocket extends Socket {
  request: Socket["request"] & {
    session: Session & {
      passport?: {
        user?: number;
      };
    };
  };
}

export function setupVideoSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.NODE_ENV === "production" 
        ? "https://" + process.env.REPL_SLUG + "." + process.env.REPL_OWNER + ".repl.co"
        : "http://localhost:5000",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"],
    cookie: {
      name: "io",
      path: "/",
      httpOnly: true,
      sameSite: "lax"
    }
  });

  // Socket authentication middleware
  io.use(async (socket: CustomSocket, next) => {
    try {
      if (!socket.request.session) {
        console.error("No session found in socket request");
        return next(new Error("No session found"));
      }

      const userId = socket.request.session?.passport?.user;
      if (!userId) {
        console.error("No user found in session passport");
        return next(new Error("Authentication required"));
      }

      socket.data.userId = userId;
      console.log("Socket authenticated for user:", userId);
      next();
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: CustomSocket) => {
    console.log("New socket connection:", socket.id, "User:", socket.data.userId);

    socket.on("join-room", async ({ roomId, userId }: JoinRoomData) => {
      try {
        // Extract projectId from roomId (format: "project-{id}")
        const projectId = parseInt(roomId.split("-")[1]);

        // Verify user is a member of the project
        const [member] = await db
          .select()
          .from(projectMembers)
          .where(eq(projectMembers.userId, userId))
          .limit(1);

        if (!member) {
          socket.emit("error", "Not authorized to join this room");
          return;
        }

        console.log(`User ${userId} joined room ${roomId}`);

        socket.join(roomId);
        socket.to(roomId).emit("user-connected", socket.id);

        socket.on("disconnect", () => {
          console.log(`User ${userId} left room ${roomId}`);
          socket.to(roomId).emit("user-disconnected", socket.id);
        });

        socket.on("sending-signal", ({ userToSignal, signal }: SignalData) => {
          io.to(userToSignal!).emit("receiving-signal", {
            signal,
            callerId: socket.id,
          });
        });

        socket.on("returning-signal", ({ callerId, signal }: SignalData) => {
          io.to(callerId!).emit("signal-returned", {
            signal,
            id: socket.id,
          });
        });
      } catch (error) {
        console.error("Error in join-room handler:", error);
        socket.emit("error", "Failed to join room");
      }
    });
  });

  return io;
}