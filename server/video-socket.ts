import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db } from "@db";
import { projectMembers } from "@db/schema";
import { eq } from "drizzle-orm";
import { Session } from "express-session";
import { Server as WsServer } from "socket.io";

interface JoinRoomData {
  roomId: string;
  userId: number;
}

interface SignalData {
  signal: any;
  userToSignal?: string;
  callerId?: string;
}

// Extend the Socket type to include session
declare module "socket.io" {
  interface Socket {
    request: {
      session: Session & {
        passport?: {
          user?: number;
        };
      };
    };
  }
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
    transports: ["websocket", "polling"]
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const session = socket.request.session;
      if (session?.passport?.user) {
        socket.data.userId = session.passport.user;
        next();
      } else {
        next(new Error("Authentication required"));
      }
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log("New socket connection:", socket.id);

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