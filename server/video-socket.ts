import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db } from "@db";
import { projectMembers } from "@db/schema";
import { eq } from "drizzle-orm";

interface JoinRoomData {
  roomId: string;
  userId: number;
}

interface SignalData {
  signal: any;
  userToSignal?: string;
  callerId?: string;
}

export function setupVideoSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("join-room", async ({ roomId, userId }: JoinRoomData) => {
      // Extract projectId from roomId (format: "project-{id}")
      const projectId = parseInt(roomId.split("-")[1]);
      
      // Verify user is a member of the project
      const member = await db.query.projectMembers.findFirst({
        where: eq(projectMembers.userId, userId),
      });

      if (!member) {
        socket.emit("error", "Not authorized to join this room");
        return;
      }

      socket.join(roomId);
      socket.to(roomId).emit("user-connected", socket.id);

      socket.on("disconnect", () => {
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
    });
  });

  return io;
}
