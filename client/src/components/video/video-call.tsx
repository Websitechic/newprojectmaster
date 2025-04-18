import { useEffect, useRef, useState } from "react";
// @ts-ignore
import Peer from "simple-peer/simplepeer.min.js";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface VideoCallProps {
  projectId: number;
  onClose: () => void;
}

export function VideoCall({ projectId, onClose }: VideoCallProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<{ [key: string]: Peer.Instance }>({});
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const { user } = useUser();
  const { toast } = useToast();
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Initialize socket connection with proper configuration
    const newSocket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);

    // Request media permissions with proper error handling
    navigator.mediaDevices
      .getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: true 
      })
      .then((currentStream) => {
        setStream(currentStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        toast({
          title: "Camera Access Error",
          description: "Please allow camera and microphone access to join the video call.",
          variant: "destructive",
        });
        onClose();
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      newSocket.close();
    };
  }, [toast, onClose]);

  useEffect(() => {
    if (!socket || !stream || !user) return;

    socket.emit("join-room", { roomId: `project-${projectId}`, userId: user.id });

    socket.on("user-connected", (userId: string) => {
      // Create a new peer with proper configuration
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { 
              urls: "stun:global.stun.twilio.com:3478",
              credentialType: "none"
            }
          ]
        }
      });

      peer.on("signal", (signal) => {
        socket.emit("sending-signal", { userToSignal: userId, signal });
      });

      peer.on("error", (err) => {
        console.error("Peer connection error:", err);
        toast({
          title: "Connection Error",
          description: "Failed to establish peer connection. Please try again.",
          variant: "destructive",
        });
      });

      setPeers((prev) => ({ ...prev, [userId]: peer }));
    });

    socket.on("receiving-signal", ({ signal, callerId }) => {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { 
              urls: "stun:global.stun.twilio.com:3478",
              credentialType: "none"
            }
          ]
        }
      });

      peer.on("signal", (signal) => {
        socket.emit("returning-signal", { signal, callerId });
      });

      peer.signal(signal);
      setPeers((prev) => ({ ...prev, [callerId]: peer }));
    });

    socket.on("user-disconnected", (userId: string) => {
      if (peers[userId]) {
        peers[userId].destroy();
        setPeers((prev) => {
          const newPeers = { ...prev };
          delete newPeers[userId];
          return newPeers;
        });
      }
    });

    return () => {
      socket.off("user-connected");
      socket.off("receiving-signal");
      socket.off("user-disconnected");
    };
  }, [socket, stream, projectId, user, peers, toast]);

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    Object.values(peers).forEach((peer) => peer.destroy());
    socket?.close();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <Card className="absolute inset-6 flex flex-col">
        <CardHeader className="flex-none">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Project Video Call</h3>
            <div className="flex gap-2">
              <Button
                variant={videoEnabled ? "default" : "destructive"}
                size="icon"
                onClick={toggleVideo}
                className="transition-colors"
              >
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </Button>
              <Button
                variant={audioEnabled ? "default" : "destructive"}
                size="icon"
                onClick={toggleAudio}
                className="transition-colors"
              >
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </Button>
              <Button 
                variant="destructive" 
                size="icon" 
                onClick={handleClose}
                className="transition-colors"
              >
                <PhoneOff size={20} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <div className="relative bg-muted rounded-lg overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 bg-background/80 px-2 py-1 rounded text-sm">
                You
              </span>
            </div>
            {Object.entries(peers).map(([peerId, peer]) => (
              <PeerVideo key={peerId} peer={peer} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PeerVideo({ peer }: { peer: Peer.Instance }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    peer.on("stream", (stream: MediaStream) => {
      if (ref.current) {
        ref.current.srcObject = stream;
        setLoading(false);
      }
    });

    return () => {
      if (ref.current?.srcObject) {
        (ref.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, [peer]);

  return (
    <div className="relative bg-muted rounded-lg overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
      <video
        ref={ref}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <span className="absolute bottom-2 left-2 bg-background/80 px-2 py-1 rounded text-sm">
        Peer
      </span>
    </div>
  );
}