
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: number;
  content: string;
  userId: number;
  projectId: number;
  type: "team" | "client";
  createdAt: string;
  user?: {
    id: number;
    name: string;
    role: string;
  };
}

interface ProjectChatProps {
  projectId: number;
  chatType: "team" | "client";
}

export function ProjectChat({ projectId, chatType }: ProjectChatProps) {
  const [message, setMessage] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/projects", projectId, "messages", chatType],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/messages?type=${chatType}`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: chatType }),
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", projectId, "messages", chatType] 
      });
      setMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set up real-time messaging
  useEffect(() => {
    if (!user?.id || !projectId) return;

    const eventSource = new EventSource("/api/notifications/stream", {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "project_message" && data.data.projectId === projectId) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/projects", projectId, "messages", chatType] 
          });
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [user?.id, projectId, chatType, queryClient]);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-2">
        <h3 className="font-semibold capitalize">{chatType} Chat</h3>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${
                msg.userId === user?.id ? "justify-end" : "justify-start"
              }`}
            >
              {msg.userId !== user?.id && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {msg.user?.name?.slice(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  msg.userId === user?.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {msg.userId !== user?.id && (
                  <div className="text-xs font-medium mb-1 opacity-75">
                    {msg.user?.name || "Unknown User"}
                  </div>
                )}
                <div className="text-sm">{msg.content}</div>
                <div className="text-xs opacity-75 mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </div>
              </div>
              {msg.userId === user?.id && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {user?.name?.slice(0, 2).toUpperCase() || "ME"}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSendMessage} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Type a message to ${chatType}...`}
              className="flex-1"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!message.trim() || sendMessageMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
