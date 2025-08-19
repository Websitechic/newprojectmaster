import { useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth"; // Assuming useAuth is available

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
    // Don't try to connect if we've exceeded max attempts
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.error('Max WebSocket reconnect attempts reached.');
      toast({
        title: "Connection Warning",
        description: "Chat features may be limited. Try refreshing the page.",
        variant: "destructive",
      });
      return;
    }

    // Construct WebSocket URL based on current window location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    // If connection is already open, do nothing
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Close existing connection if it's in connecting or closing state
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      ws.current.close();
      ws.current = null;
    }

    try {
      ws.current = new WebSocket(wsUrl);

      // Connection opened handler
      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
        // Send authentication message with userId if available
        if (ws.current?.readyState === WebSocket.OPEN && userId) {
          ws.current.send(JSON.stringify({ type: "auth", userId }));
        }
      };

      // Message received handler
      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          // This is where you would typically handle incoming messages
          // For example: if (message.type === 'chat_message') { ... }
          // console.log("Received message:", message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      // Connection closed handler
      ws.current.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        
        // Don't reconnect if the close was intentional or if we don't have a userId
        const intentionalClose = event.code === 1000 || event.code === 1001;
        const authFailure = event.code === 1008;
        const serverError = event.code === 1011;
        
        // Only attempt reconnection for unexpected closes and if we have a valid userId
        if (!intentionalClose && !authFailure && userId && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          // Longer delay for server errors to give server time to stabilize
          const baseDelay = serverError ? 3000 : 1000;
          const delay = baseDelay * Math.min(reconnectAttempts.current, 3);
          console.log(`Attempting WebSocket reconnection ${reconnectAttempts.current}/${maxReconnectAttempts} in ${delay}ms`);
          setTimeout(connect, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max WebSocket reconnect attempts reached.');
          toast({
            title: "Connection Warning",
            description: "Chat features may be limited. Try refreshing the page.",
            variant: "destructive",
          });
        }
      };

      // Error handler
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Ensure onclose is called if an error occurs before onopen
        if (ws.current && ws.current.readyState !== WebSocket.OPEN) {
           // This might be redundant if onclose is already handling this, but good for robustness
           // ws.current.onclose({code: 1, reason: "Error occurred"});
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      reconnectAttempts.current++;
      // Attempt to reconnect if within limits
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = 1000 * Math.min(reconnectAttempts.current, 5);
        setTimeout(connect, delay);
      } else {
         // Show toast for persistent connection failures on initial connection attempt
         toast({
           title: "Connection Warning",
           description: "Chat features may be limited. Try refreshing the page.",
           variant: "destructive",
         });
      }
    }
  }, [userId, toast]); // Depend on userId and toast

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (userId) {
      connect(); // Initiate connection when userId is available
    }

    // Cleanup function to close the WebSocket connection when the component unmounts
    return () => {
      if (ws.current) {
        ws.current.close(1000, "Component unmounted"); // Clean close code
        ws.current = null;
      }
      // Clear any pending reconnect timers if they exist (though not explicitly set in this block, it's good practice)
      // If setTimeout was called directly here, clear it.
    };
  }, [connect, userId]); // Re-run effect if connect or userId changes

  // Functions to interact with the WebSocket
  const joinProject = useCallback((projectId: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "join_project", projectId }));
    } else {
      console.warn("Cannot join project: WebSocket not open.");
    }
  }, []);

  const sendMessage = useCallback((content: string, projectId: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "chat_message",
        content,
        projectId,
      }));
    } else {
      console.warn("Cannot send message: WebSocket not open.");
    }
  }, []);

  const updateStatus = useCallback((status: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "status_update",
        status,
      }));
    } else {
      console.warn("Cannot update status: WebSocket not open.");
    }
  }, []);

  // Subscribe to messages
  const subscribe = useCallback((callback: (message: WebSocketMessage) => void) => {
    if (!ws.current) {
      console.warn("Cannot subscribe: WebSocket is not initialized.");
      return;
    }

    // Assign the onmessage handler. This will overwrite any previous handler.
    // If multiple components need to subscribe, a pub/sub pattern within this hook would be better.
    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        callback(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message in subscribe:', error);
      }
    };

    // Ensure error and close handlers are also managed or can be overridden if needed
    // For simplicity, we'll rely on the main handlers, but a more robust solution might
    // manage these subscriptions more granularly.
  }, []);

  return {
    joinProject,
    sendMessage,
    updateStatus,
    subscribe,
  };
}