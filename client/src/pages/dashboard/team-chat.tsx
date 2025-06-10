
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Message, Project, User } from "@db/schema";

interface MessageWithUser extends Message {
  user?: User;
}

export default function TeamChat() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const projectId = parseInt(id!);

  const { data: project } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => fetch(`/api/projects/${projectId}`).then(res => res.json()),
    enabled: !!projectId,
  });

  const { data: messages = [] } = useQuery<MessageWithUser[]>({
    queryKey: [`/api/projects/${projectId}/team-messages`],
    queryFn: async () => {
      console.log(`Fetching team messages for project ${projectId}`);
      const response = await fetch(`/api/projects/${projectId}/team-messages`);
      if (!response.ok) {
        console.error(`Failed to fetch messages: ${response.status} ${response.statusText}`);
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      console.log(`Fetched ${data.length} team messages:`, data);
      return data;
    },
    enabled: !!projectId,
    refetchInterval: 2000, // Poll every 2 seconds for new messages
  });

  const { data: projectMembers = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/members`],
    queryFn: () => fetch(`/api/projects/${projectId}/members`).then(res => res.json()),
    enabled: !!projectId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      console.log(`Sending team message to project ${projectId}:`, content);
      const response = await fetch(`/api/projects/${projectId}/team-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send message: ${response.status} ${response.statusText}`, errorText);
        throw new Error("Failed to send message");
      }
      const result = await response.json();
      console.log("Team message sent successfully:", result);
      return result;
    },
    onSuccess: () => {
      console.log("Team message sent, invalidating queries");
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/team-messages`] 
      });
      setMessage("");
    },
    onError: (error: Error) => {
      console.error("Error sending team message:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Set up SSE for real-time updates
  useEffect(() => {
    if (!user?.id || !projectId) return;

    console.log(`Setting up SSE for team chat in project ${projectId}`);
    
    const eventSource = new EventSource("/api/notifications/stream", {
      withCredentials: true
    });

    eventSource.onopen = () => {
      console.log("SSE connection opened for team chat");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE message received in team chat:", data);
        if (data.type === "team_message" && data.data.projectId === projectId) {
          console.log("Team message received via SSE, invalidating queries");
          queryClient.invalidateQueries({ 
            queryKey: [`/api/projects/${projectId}/team-messages`] 
          });
        }
      } catch (error) {
        console.error("Error parsing SSE message in team chat:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error in team chat:", error);
    };

    return () => {
      console.log("Closing SSE connection for team chat");
      eventSource.close();
    };
  }, [user?.id, projectId, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  const formatMessageTime = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${projectId}/team-chat`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col p-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/dashboard/projects/${projectId}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Project
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Team Chat</h1>
              <p className="text-muted-foreground">
                {project?.name} - Internal team communication
              </p>
            </div>
          </div>

          {/* Chat Area */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Team Discussion</h3>
                  <p className="text-sm text-muted-foreground">
                    {projectMembers.length} team member{projectMembers.length !== 1 ? 's' : ''} in this project
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh]">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">
                      <p className="text-lg font-medium mb-2">No messages yet</p>
                      <p className="text-sm">Start the conversation with your team!</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(msg.sender?.name || "Unknown")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {msg.sender?.name || "Unknown User"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm bg-muted/50 rounded-lg p-3">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t p-4">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1"
                    disabled={sendMessageMutation.isPending}
                  />
                  <Button 
                    type="submit" 
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    size="sm"
                  >
                    {sendMessageMutation.isPending ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
