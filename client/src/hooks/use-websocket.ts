import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(userId: number | undefined) {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!userId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "auth", userId }));
      }
    };

    ws.current.onclose = () => {
      setTimeout(connect, 1000); // Reconnect after 1 second
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server",
        variant: "destructive",
      });
    };
  }, [userId, toast]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  const joinProject = useCallback((projectId: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "join_project", projectId }));
    }
  }, []);

  const sendMessage = useCallback((content: string, projectId: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "chat_message",
        content,
        projectId,
      }));
    }
  }, []);

  const updateStatus = useCallback((status: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "status_update",
        status,
      }));
    }
  }, []);

  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    if (!ws.current) return;

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      callback(message);
    };
  }, []);

  return {
    joinProject,
    sendMessage,
    updateStatus,
    subscribe,
  };
}
