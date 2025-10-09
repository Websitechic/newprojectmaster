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
import { Send, ArrowLeft, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Message, Project, User } from "@db/schema";

interface MessageWithSender {
  id: number;
  content: string;
  createdAt: string;
  senderId: number;
  sender?: {
    id: number;
    name: string;
    email: string;
  };
}

export default function TeamChat() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectId = parseInt(id!);

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<Project>({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch project");
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: messages = [], isLoading: messagesLoading, error: messagesError } = useQuery<MessageWithSender[]>({
    queryKey: [`/api/projects/${projectId}/team-messages`],
    queryFn: async () => {
      console.log(`Fetching team messages for project ${projectId}`);
      const response = await fetch(`/api/projects/${projectId}/team-messages`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch messages: ${response.status} ${response.statusText}`, errorText);
        throw new Error(errorText || "Failed to fetch messages");
      }
      const data = await response.json();
      console.log(`Fetched ${data.length} team messages:`, data);
      return data;
    },
    enabled: !!projectId,
    refetchInterval: 2000, // Poll every 2 seconds for new messages
  });

  const { data: projectMembers = [], isLoading: membersLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/members`],
    queryFn: async () => {
      console.log(`Fetching project members for project ${projectId}`);
      const response = await fetch(`/api/projects/${projectId}/members`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch members: ${response.status}`, errorText);
        throw new Error("Failed to fetch members");
      }
      const data = await response.json();
      console.log(`Fetched project members:`, data);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!projectId,
    retry: 1,
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

  // Set up SSE and WebSocket for real-time updates
  useEffect(() => {
    if (!user?.id || !projectId) return;

    console.log(`Setting up real-time updates for team chat in project ${projectId}`);

    // SSE connection
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
        if (data.type === "project_message" && data.data.projectId === projectId) {
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

    // WebSocket event listeners
    const handleProjectMessage = (event: CustomEvent) => {
      const messageData = event.detail;
      if (messageData.projectId === projectId) {
        console.log("Team message received via WebSocket, invalidating queries");
        queryClient.invalidateQueries({ 
          queryKey: [`/api/projects/${projectId}/team-messages`] 
        });
      }
    };

    window.addEventListener('websocket:project_message', handleProjectMessage as EventListener);

    return () => {
      console.log("Cleaning up real-time connections for team chat");
      eventSource.close();
      window.removeEventListener('websocket:project_message', handleProjectMessage as EventListener);
    };
  }, [user?.id, projectId, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark team messages as read when user views them
  useEffect(() => {
    if (!user?.id || !messages.length || !projectId) return;

    const markMessagesAsRead = async () => {
      // Get message IDs that are not from current user
      const messageIdsToMarkRead = messages
        .filter(msg => msg.senderId !== user.id)
        .map(msg => msg.id);

      if (messageIdsToMarkRead.length === 0) return;

      try {
        await fetch(`/api/projects/${projectId}/team-messages/mark-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageIds: messageIdsToMarkRead }),
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    };

    markMessagesAsRead().catch(console.error);
  }, [messages, user?.id, projectId]);

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

  // Handle mention detection in input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;

    setMessage(value);
    setCursorPosition(position);

    // Check for @ mentions - allow spaces and handle partial names
    const beforeCursor = value.substring(0, position);
    const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9_\s]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1];
      setMentionQuery(query);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
      setMentionQuery("");
    }
  };

  // Handle mention selection
  const selectMention = (member: any) => {
    if (!member?.name) return;

    const beforeMention = message.substring(0, cursorPosition - mentionQuery.length - 1);
    const afterCursor = message.substring(cursorPosition);
    const newMessage = `${beforeMention}@${member.name} ${afterCursor}`;

    setMessage(newMessage);
    setShowMentionSuggestions(false);
    setMentionQuery("");

    // Focus back to input and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPosition = beforeMention.length + member.name.length + 2;
        inputRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  // Filter members for mentions
  const filteredMembers = projectMembers.filter((member: any) => {
    const memberName = member?.name || member?.userName || '';
    return memberName && 
      memberName.toLowerCase().includes(mentionQuery.toLowerCase()) &&
      member.id !== user?.id;
  });

  // Render message content with highlighted mentions for all users
  const renderMessageContent = (content: string) => {
    if (!content) return content;

    // Match @mentions with word boundaries
    const mentionRegex = /@([a-zA-Z0-9_\s]+?)(?=\s|$|@)/g;
    const parts: Array<{ text: string; isMention: boolean; mentionedName?: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push({ text: content.substring(lastIndex, match.index), isMention: false });
      }

      // Add mention
      const mentionedName = match[1].trim();
      parts.push({ text: `@${mentionedName}`, isMention: true, mentionedName });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push({ text: content.substring(lastIndex), isMention: false });
    }

    return parts.map((part, index) => {
      if (part.isMention && part.mentionedName) {
        // Check if this is a valid team member mention
        const mentionedMember = projectMembers.find((member: any) => {
          const memberName = member?.name || member?.userName || '';
          return memberName && memberName.toLowerCase() === part.mentionedName!.toLowerCase();
        });

        if (mentionedMember) {
          // Check if this is the current user being mentioned
          const isSelfMention = mentionedMember.id === user?.id;

          // ALL mentions show in blue for ALL users
          // Self-mentions have extra emphasis (darker blue, bold)
          return (
            <span 
              key={index} 
              className={`${
                isSelfMention 
                  ? 'bg-blue-700 text-white font-bold px-1.5 py-0.5 rounded mx-0.5' 
                  : 'bg-blue-500 text-white font-medium px-1.5 py-0.5 rounded mx-0.5'
              }`}
            >
              {part.text}
            </span>
          );
        }
      }
      return <span key={index}>{part.text}</span>;
    });
  };

  // Show error if access denied
  if (projectError || messagesError) {
    const errorMessage = projectError?.message || messagesError?.message || "An error occurred";
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${projectId}/team-chat`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-600 mb-4">{errorMessage}</p>
              <Button onClick={() => setLocation(`/dashboard/projects/${projectId}`)}>
                Back to Project
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                <div className="flex-1">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Discussion
                  </h3>
                  <div className="text-sm text-muted-foreground mt-1">
                    {membersLoading ? (
                      <span>Loading team members...</span>
                    ) : projectMembers.length === 0 ? (
                      <span>No team members</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <span className="font-medium">{projectMembers.length} member{projectMembers.length !== 1 ? 's' : ''}:</span>
                        {projectMembers.slice(0, 4).map((member: any, index: number) => (
                          <span key={member.id || index} className="inline-flex items-center">
                            <span className="bg-muted px-2 py-0.5 rounded-full text-xs font-medium">
                              {member.name || member.userName || 'Unknown'}
                            </span>
                            {index < Math.min(projectMembers.length - 1, 3) && <span className="mx-1">•</span>}
                          </span>
                        ))}
                        {projectMembers.length > 4 && (
                          <span className="text-xs">+{projectMembers.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
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
                            {formatMessageTime(msg.createdAt || new Date())}
                          </span>
                        </div>
                        <div className="text-sm bg-muted/50 rounded-lg p-3">
                          {renderMessageContent(msg.content)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t p-4 relative">
                {/* Mention Suggestions Dropdown */}
                {showMentionSuggestions && filteredMembers.length > 0 && (
                  <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                    {filteredMembers.map((member: any) => {
                      const memberName = member?.name || member?.userName || 'Unknown';
                      const memberRole = member?.specialization || member?.role || 'Team Member';
                      return (
                        <button
                          key={member.id || memberName}
                          type="button"
                          onClick={() => selectMention({...member, name: memberName})}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectMention({...member, name: memberName});
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                        >
                          <Avatar className="h-6 w-6 flex-shrink-0">
                            <AvatarFallback className="text-xs">
                              {getUserInitials(memberName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{memberName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{memberRole}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={handleInputChange}
                    placeholder="Type your message... (use @ to mention teammates)"
                    className="flex-1"
                    disabled={sendMessageMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowMentionSuggestions(false);
                      }
                    }}
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

                {/* Typing hint */}
                <div className="text-xs text-muted-foreground mt-2">
                  Type @ to mention team members
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}