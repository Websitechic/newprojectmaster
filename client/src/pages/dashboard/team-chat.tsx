import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, ArrowLeft, Users, MoreVertical, Edit2, Trash2, X, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Message, Project, User } from "@db/schema";
import { useNotificationSound } from "@/hooks/use-notification-sound";

interface MessageWithSender {
  id: number;
  content: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
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
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectId = parseInt(id!);
  const { playNotificationSound } = useNotificationSound();
  const lastMessageCountRef = useRef<number>(0);

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
    queryKey: [`/api/projects/${projectId}/members`, project?.managerId],
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
      
      // Map the API response to include user details in a consistent format
      const mappedData = Array.isArray(data) ? data.map((member: any) => ({
        id: member.id || member.userId,
        userId: member.id || member.userId,
        name: member.name || member.userName,
        userName: member.name || member.userName,
        email: member.email || member.userEmail,
        role: member.role,
        specialization: member.specialization,
        invitationStatus: member.invitationStatus || 'accepted',
      })) : [];
      
      // Fetch all team leads and operations managers (they're automatically on all projects)
      try {
        const allUsersResponse = await fetch('/api/users');
        if (allUsersResponse.ok) {
          const allUsers = await allUsersResponse.json();
          
          // Add team leads and operations managers
          allUsers.forEach((u: any) => {
            const isTeamLead = u.role === 'team_lead';
            const isOperationsManager = u.role === 'operations_manager' || u.specialization === 'operations_manager';
            
            if ((isTeamLead || isOperationsManager) && !mappedData.some((m: any) => m.id === u.id)) {
              mappedData.push({
                id: u.id,
                userId: u.id,
                name: u.name,
                userName: u.name,
                email: u.email,
                role: u.role,
                specialization: u.specialization,
                invitationStatus: 'accepted',
              });
            }
          });
        }
      } catch (error) {
        console.error('Error fetching team leads and operations managers:', error);
      }
      
      // Add project manager if not already in the list and if project data is available
      if (project?.managerId) {
        const managerExists = mappedData.some((m: any) => m.id === project.managerId);
        if (!managerExists) {
          // Fetch project manager details
          try {
            const managerResponse = await fetch(`/api/users/${project.managerId}`);
            if (managerResponse.ok) {
              const managerData = await managerResponse.json();
              mappedData.push({
                id: managerData.id,
                userId: managerData.id,
                name: managerData.name,
                userName: managerData.name,
                email: managerData.email,
                role: managerData.role,
                specialization: managerData.specialization,
                invitationStatus: 'accepted',
              });
            }
          } catch (error) {
            console.error('Error fetching project manager:', error);
          }
        }
      }
      
      console.log(`Mapped project members with manager, team leads, and operations managers:`, mappedData);
      return mappedData;
    },
    enabled: !!projectId && !!project,
    retry: 1,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      console.log(`Sending team message to project ${projectId}:`, content);
      const response = await fetch(`/api/projects/${projectId}/team-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!response.ok) {
        let errorMessage = "Failed to send message";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        console.error(`Failed to send message: ${response.status} ${response.statusText}`, errorMessage);
        throw new Error(errorMessage);
      }
      const result = await response.json();
      console.log("Team message sent successfully:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("Team message sent, invalidating queries", data);
      queryClient.invalidateQueries({ 
        queryKey: [`/api/projects/${projectId}/team-messages`] 
      });
      setMessage("");
      setShowMentionSuggestions(false);
      toast({
        title: "Success",
        description: "Message sent successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Error sending team message:", error);
      toast({
        title: "Failed to send message",
        description: error.message || "Please check your permissions and try again",
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
          
          // Play sound if message is from someone else
          if (data.data.senderId !== user?.id) {
            console.log('🔔 Team message from another user, playing sound. Sender:', data.data.senderId);
            // Use setTimeout to ensure sound plays reliably
            setTimeout(() => {
              try {
                playNotificationSound();
              } catch (error) {
                console.error('Error playing team chat sound:', error);
              }
            }, 100);
          }
          
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
        
        // Play sound if message is from someone else
        if (messageData.senderId !== user?.id) {
          playNotificationSound();
        }
        
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

  const handleEditMessage = async (messageId: number) => {
    if (!editingContent.trim()) {
      toast({
        title: "Error",
        description: "Message cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/team-messages/${messageId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: editingContent.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Invalidate and refetch messages
        queryClient.invalidateQueries({ 
          queryKey: [`/api/projects/${projectId}/team-messages`] 
        });
        
        setEditingMessageId(null);
        setEditingContent("");
        toast({
          title: "Success",
          description: "Message updated successfully",
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to edit message");
      }
    } catch (error) {
      console.error("Error editing message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to edit message",
        variant: "destructive",
      });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm("Are you sure you want to delete this message?")) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/team-messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Invalidate and refetch messages
        queryClient.invalidateQueries({ 
          queryKey: [`/api/projects/${projectId}/team-messages`] 
        });
        
        toast({
          title: "Success",
          description: "Message deleted successfully",
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete message");
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete message",
        variant: "destructive",
      });
    }
  };

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
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;

    setMessage(value);
    
    // Update cursor position after state update
    setTimeout(() => {
      setCursorPosition(position);
    }, 0);

    // Check for @ mentions - allow spaces and handle partial names
    const beforeCursor = value.substring(0, position);
    const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9_\s]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].trim();
      setMentionQuery(query);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
      setMentionQuery("");
    }
  };

  // Update cursor position when textarea value changes
  const handleTextareaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  const handleTextareaKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  // Handle mention selection
  const selectMention = (member: any) => {
    if (!member?.name) return;

    const beforeMention = message.substring(0, cursorPosition - mentionQuery.length - 1);
    const afterCursor = message.substring(cursorPosition);
    const newMessage = `${beforeMention}@${member.name} ${afterCursor}`;
    const newPosition = beforeMention.length + member.name.length + 2; // Position after the space

    setMessage(newMessage);
    setShowMentionSuggestions(false);
    setMentionQuery("");

    // Focus back to input and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPosition, newPosition);
        setCursorPosition(newPosition);
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

  // Render message content with highlighted mentions and clickable links
  const renderMessageContent = (content: string) => {
    if (!content) return content;

    // Combined regex for mentions and URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Updated regex to better handle multi-word names - matches until end of word boundary or special chars
    const mentionRegex = /@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;
    
    // First, split by URLs
    const urlParts = content.split(urlRegex);
    
    return urlParts.map((urlPart, urlIndex) => {
      // Check if this part is a URL
      if (urlRegex.test(urlPart)) {
        return (
          <a 
            key={`url-${urlIndex}`}
            href={urlPart}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {urlPart}
          </a>
        );
      }

      // Process mentions in non-URL parts
      const parts: Array<{ text: string; isMention: boolean; mentionedName?: string }> = [];
      let lastIndex = 0;
      let match;
      const mentionRegexCopy = new RegExp(mentionRegex.source, mentionRegex.flags);

      while ((match = mentionRegexCopy.exec(urlPart)) !== null) {
        // Add text before mention
        if (match.index > lastIndex) {
          parts.push({ text: urlPart.substring(lastIndex, match.index), isMention: false });
        }

        // Add mention - extract the full captured name
        const mentionedName = match[1].trim();
        parts.push({ text: `@${mentionedName}`, isMention: true, mentionedName });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < urlPart.length) {
        parts.push({ text: urlPart.substring(lastIndex), isMention: false });
      }

      if (parts.length === 0) {
        return <span key={`text-${urlIndex}`}>{urlPart}</span>;
      }

      return parts.map((part, index) => {
        if (part.isMention && part.mentionedName) {
          // Check if this is a valid team member mention - try exact match first, then partial
          let mentionedMember = projectMembers.find((member: any) => {
            const memberName = member?.name || member?.userName || '';
            return memberName && memberName.toLowerCase() === part.mentionedName!.toLowerCase();
          });

          // If no exact match, try to find a member whose name starts with the mention
          if (!mentionedMember) {
            mentionedMember = projectMembers.find((member: any) => {
              const memberName = member?.name || member?.userName || '';
              return memberName && memberName.toLowerCase().startsWith(part.mentionedName!.toLowerCase());
            });
          }

          if (mentionedMember) {
            // Check if this is the current user being mentioned
            const isSelfMention = mentionedMember.id === user?.id;

            // ALL mentions show in blue for ALL users
            // Self-mentions have extra emphasis (darker blue, bold)
            return (
              <span 
                key={`mention-${urlIndex}-${index}`}
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
        return <span key={`text-${urlIndex}-${index}`}>{part.text}</span>;
      });
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex flex-wrap gap-1 items-center hover:bg-muted/50 p-1 rounded-md transition-colors">
                            <span className="font-medium">{projectMembers.length} member{projectMembers.length !== 1 ? 's' : ''}</span>
                            <span className="text-xs opacity-70">(click to view all)</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
                          {projectMembers.map((member: any) => (
                            <DropdownMenuItem key={member.id || member.userId} className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {getUserInitials(member.name || member.userName || 'Unknown')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">
                                  {member.name || member.userName || 'Unknown'}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {member.specialization || member.role || 'Team Member'}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    <div key={msg.id} className="flex gap-3 group">
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
                        {editingMessageId === msg.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="min-h-[60px] text-sm text-black dark:text-white bg-white dark:bg-gray-800"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditMessage(msg.id)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingContent("");
                                }}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-words">
                              {renderMessageContent(msg.content)}
                            </div>
                            {msg.isEdited && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">edited</p>
                            )}
                            {msg.senderId === user?.id && (
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditingContent(msg.content);
                                      }}
                                    >
                                      <Edit2 className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteMessage(msg.id)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                        )}
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

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef as any}
                    value={message}
                    onChange={handleInputChange}
                    onClick={handleTextareaClick}
                    onKeyUp={handleTextareaKeyUp}
                    placeholder="Type your message... (use @ to mention teammates, Shift+Enter for new line, Enter to send)"
                    className="flex-1 min-h-[60px] max-h-[200px] resize-y"
                    disabled={sendMessageMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowMentionSuggestions(false);
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !showMentionSuggestions) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                      // Navigate mention suggestions with arrow keys
                      if (showMentionSuggestions) {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                        }
                      }
                    }}
                  />
                  <Button 
                    type="submit" 
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    size="sm"
                    className="mb-1"
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
                  Type @ to mention team members • Shift+Enter for new line • Enter to send
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}