import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(userId: number | undefined) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!userId || reconnectAttempts.current >= maxReconnectAttempts) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    if (ws.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      reconnectAttempts.current = 0; // Reset attempts on successful connection
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "auth", userId }));
      }
    };

    ws.current.onclose = () => {
      reconnectAttempts.current++;
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setTimeout(connect, 1000 * Math.min(reconnectAttempts.current, 5)); // Exponential backoff
      }
    };

    ws.current.onerror = () => {
      // Only show error toast if we've exhausted our reconnection attempts
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        toast({
          title: "Connection Warning",
          description: "Chat features may be limited. Try refreshing the page.",
          variant: "destructive",
        });
      }
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
      try {
        const message = JSON.parse(event.data);
        callback(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
      console.log('WebSocket connection closed');
    };
  }, []);

  return {
    joinProject,
    sendMessage,
    updateStatus,
    subscribe,
  };
}