import { useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from "lucide-react";
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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    const newSocket = io(window.location.origin, { path: "/socket.io" });
    setSocket(newSocket);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (!socket || !stream || !user) return;

    socket.emit("join-room", { roomId: `project-${projectId}`, userId: user.id });

    socket.on("user-connected", (userId: string) => {
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream,
      });

      peer.on("signal", (signal) => {
        socket.emit("sending-signal", { userToSignal: userId, signal });
      });

      setPeers((prev) => ({ ...prev, [userId]: peer }));
    });

    socket.on("receiving-signal", ({ signal, callerId }) => {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream,
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
  }, [socket, stream, projectId, user]);

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

  return (
    <Card className="fixed inset-4 z-50 flex flex-col">
      <CardHeader className="flex-none">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Project Video Call</h3>
          <div className="flex gap-2">
            <Button
              variant={videoEnabled ? "default" : "destructive"}
              size="icon"
              onClick={toggleVideo}
            >
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </Button>
            <Button
              variant={audioEnabled ? "default" : "destructive"}
              size="icon"
              onClick={toggleAudio}
            >
              {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </Button>
            <Button variant="destructive" size="icon" onClick={onClose}>
              <PhoneOff size={20} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4 h-full">
          <div className="relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-lg"
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
  );
}

function PeerVideo({ peer }: { peer: Peer.Instance }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    peer.on("stream", (stream) => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });
  }, [peer]);

  return (
    <div className="relative">
      <video
        ref={ref}
        autoPlay
        playsInline
        className="w-full h-full object-cover rounded-lg"
      />
      <span className="absolute bottom-2 left-2 bg-background/80 px-2 py-1 rounded text-sm">
        Peer
      </span>
    </div>
  );
}
