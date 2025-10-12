import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Users, Search, MoreVertical, Edit2, Trash2, X, Check } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useNotificationSound } from "@/hooks/use-notification-sound";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "online" | "offline" | "idle";
  lastActive: string;
}

interface DirectMessage {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  read: boolean;
  createdAt: string;
  updatedAt?: string;
  senderName: string;
}

interface Conversation {
  user: User;
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: number;
  };
  unreadCount: number;
}

export function DirectMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"conversations" | "new">("conversations");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const { user } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { playNotificationSound } = useNotificationSound();

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch("/api/direct-messages/conversations");
        if (response.ok) {
          const data = await response.json();
          setConversations(data);
        }
      } catch (error) {
        console.error("Error fetching conversations:", error);
      }
    };

    fetchConversations();
  }, []);

  // Fetch all users for new conversations
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("/api/users");
        if (response.ok) {
          const data = await response.json();
          setAllUsers(data);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, []);

  // Fetch messages when a user is selected
  useEffect(() => {
    if (selectedUser) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(`/api/direct-messages/${selectedUser.id}`);
          if (response.ok) {
            const data = await response.json();
            setMessages(data);
          }
        } catch (error) {
          console.error("Error fetching messages:", error);
        }
      };

      fetchMessages();
    }
  }, [selectedUser]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for real-time messages via SSE
  useEffect(() => {
    if (!user?.id) return;

    console.log("Setting up SSE connection for direct messages...");
    const eventSource = new EventSource("/api/notifications/stream", {
      withCredentials: true
    });

    eventSource.onopen = () => {
      console.log("SSE connection opened for direct messages");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE message received in direct messages:", data);

        if (data.type === "direct_message") {
          const message = data.data;
          console.log("Direct message received:", message);

          // Play sound if message is from someone else
          if (message.senderId !== user?.id) {
            console.log('🔔 Direct message from another user, playing sound. Sender:', message.senderId);
            // Use setTimeout to ensure sound plays reliably
            setTimeout(() => {
              try {
                playNotificationSound();
              } catch (error) {
                console.error('Error playing direct message sound:', error);
              }
            }, 100);
          }

          // If the message is from the currently selected user, add it to messages immediately
          if (selectedUser && message.senderId === selectedUser.id) {
            console.log("Adding message to current conversation");
            setMessages(prev => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some(m => m.id === message.id);
              if (!exists) {
                return [...prev, message];
              }
              return prev;
            });
          }

          // If the message is TO the currently selected user (we sent it), also add it
          if (selectedUser && message.receiverId === selectedUser.id && message.senderId === user?.id) {
            console.log("Adding sent message to current conversation");
            setMessages(prev => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some(m => m.id === message.id);
              if (!exists) {
                return [...prev, message];
              }
              return prev;
            });
          }

          // Update conversations list
          setConversations(prev => {
            const updated = [...prev];
            const otherUserId = message.senderId === user?.id ? message.receiverId : message.senderId;
            const existingIndex = updated.findIndex(conv => conv.user.id === otherUserId);

            if (existingIndex >= 0) {
              // Move conversation to top and update
              const conversation = updated[existingIndex];
              updated.splice(existingIndex, 1);
              updated.unshift({
                ...conversation,
                lastMessage: {
                  content: message.content,
                  createdAt: message.createdAt,
                  senderId: message.senderId,
                },
                unreadCount: selectedUser?.id === otherUserId ? 0 : conversation.unreadCount + (message.senderId === user?.id ? 0 : 1),
              });
            } else {
              // Add new conversation (fetch user details)
              fetch(`/api/users/${otherUserId}`)
                .then(res => res.json())
                .then(userData => {
                  setConversations(prev => [{
                    user: userData,
                    lastMessage: {
                      content: message.content,
                      createdAt: message.createdAt,
                      senderId: message.senderId,
                    },
                    unreadCount: message.senderId === user?.id ? 0 : 1,
                  }, ...prev]);
                })
                .catch(error => console.error("Error fetching user data:", error));
            }

            return updated;
          });
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error in direct messages:", error);
    };

    return () => {
      console.log("Closing SSE connection for direct messages");
      eventSource.close();
    };
  }, [selectedUser, user?.id]);

  // WebSocket event listeners for direct messages
    const handleDirectMessage = (event: CustomEvent) => {
      const messageData = event.detail;
      console.log("Direct message received via WebSocket:", messageData);

      // If the message is from the currently selected user, add it to messages immediately
      if (selectedUser && messageData.senderId === selectedUser.id) {
        console.log("Adding message to current conversation");
        setMessages(prev => {
          // Check if message already exists to avoid duplicates
          const exists = prev.some(m => m.id === messageData.id);
          if (!exists) {
            return [...prev, messageData];
          }
          return prev;
        });
      }

      // If the message is TO the currently selected user (we sent it), also add it
      if (selectedUser && messageData.receiverId === selectedUser.id && messageData.senderId === user?.id) {
        console.log("Adding sent message to current conversation");
        setMessages(prev => {
          // Check if message already exists to avoid duplicates
          const exists = prev.some(m => m.id === messageData.id);
          if (!exists) {
            return [...prev, messageData];
          }
          return prev;
        });
      }

      // Update conversations list
      queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
    };

    window.addEventListener('websocket:direct_message', handleDirectMessage as EventListener);

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
      const response = await fetch(`/api/direct-messages/${messageId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: editingContent.trim(),
        }),
      });

      if (response.ok) {
        const now = new Date().toISOString();
        // Update messages in local state
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, content: editingContent.trim(), updatedAt: now }
              : msg
          )
        );
        
        // Also update conversations to reflect the change
        if (selectedUser) {
          setConversations(prev =>
            prev.map(conv =>
              conv.user.id === selectedUser.id
                ? {
                    ...conv,
                    lastMessage: {
                      ...conv.lastMessage,
                      content: editingContent.trim(),
                    }
                  }
                : conv
            )
          );
        }
        
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
      const response = await fetch(`/api/direct-messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove message from local state
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
        
        // Update conversations to reflect the deletion
        if (selectedUser && messages.length > 1) {
          const remainingMessages = messages.filter(msg => msg.id !== messageId);
          const lastMessage = remainingMessages[remainingMessages.length - 1];
          
          if (lastMessage) {
            setConversations(prev =>
              prev.map(conv =>
                conv.user.id === selectedUser.id
                  ? {
                      ...conv,
                      lastMessage: {
                        content: lastMessage.content,
                        createdAt: lastMessage.createdAt,
                        senderId: lastMessage.senderId,
                      }
                    }
                  : conv
              )
            );
          }
        }
        
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) {
      console.log("Cannot send message: missing content or selected user");
      return;
    }

    try {
      console.log("Sending message to user:", selectedUser.id, "Content:", newMessage);

      const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiverId: selectedUser.id,
          content: newMessage.trim(),
        }),
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        const sentMessage = await response.json();
        console.log("Message sent successfully:", sentMessage);

        // Clear the input immediately
        setNewMessage("");

        // Don't add the message to local state here - let SSE handle it to avoid duplicates
        // The message will be added via the SSE event listener

      } else {
        const errorText = await response.text();
        console.error("Failed to send message:", response.status, errorText);
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // You could add a toast notification here to inform the user
    }
  };

  const handleUserSelect = (selectedUser: User) => {
    setSelectedUser(selectedUser);
    setView("conversations");

    // Mark messages as read
    fetch(`/api/direct-messages/${selectedUser.id}/read`, {
      method: "PUT",
    });

    // Update unread count in conversations
    setConversations(prev => 
      prev.map(conv => 
        conv.user.id === selectedUser.id 
          ? { ...conv, unreadCount: 0 }
          : conv
      )
    );
  };

  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredConversations = conversations.filter(conv =>
    conv.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedUser) {
    return (
      <Card className="h-[600px] flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedUser(null)}
            >
              ← Back
            </Button>
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {selectedUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{selectedUser.name}</h3>
              <p className="text-sm text-muted-foreground capitalize">{selectedUser.role}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-start gap-2 group",
                    message.senderId === user?.id ? "flex-row-reverse" : ""
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {message.senderName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 max-w-[70%]">
                    <div
                      className={cn(
                        "rounded-lg p-3 relative",
                        message.senderId === user?.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary"
                      )}
                    >
                      {editingMessageId === message.id ? (
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
                              onClick={() => handleEditMessage(message.id)}
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
                        <>
                          <p className="text-sm break-words whitespace-pre-wrap">
                            {message.content.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
                              if (/^https?:\/\/[^\s]+$/.test(part)) {
                                return (
                                  <a
                                    key={index}
                                    href={part}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "underline hover:opacity-80 break-all",
                                      message.senderId === user?.id
                                        ? "text-primary-foreground"
                                        : "text-blue-600"
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {part}
                                  </a>
                                );
                              }
                              return part;
                            })}
                          </p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.createdAt).toLocaleTimeString()}
                            {message.updatedAt && message.updatedAt !== message.createdAt && (
                              <span className="italic ml-1">• edited</span>
                            )}
                          </p>
                        </>
                      )}
                      
                      {message.senderId === user?.id && editingMessageId !== message.id && (
                        <div className={cn(
                          "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity",
                          message.senderId === user?.id ? "left-2" : "right-2"
                        )}>
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
                                  setEditingMessageId(message.id);
                                  setEditingContent(message.content);
                                }}
                              >
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteMessage(message.id)}
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
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="border-t p-4">
          <div className="flex gap-2 w-full items-end">
            <Textarea
              placeholder="Type a message... (Shift+Enter for new line, Enter to send)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="min-h-[60px] max-h-[200px] resize-y"
            />
            <Button size="icon" onClick={handleSendMessage} className="mb-1">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Direct Messages</h3>
          <div className="flex gap-2">
            <Button
              variant={view === "conversations" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("conversations")}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Chats
            </Button>
            <Button
              variant={view === "new" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("new")}
            >
              <Users className="h-4 w-4 mr-1" />
              Users
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          {view === "conversations" ? (
            <div className="space-y-1 p-2">
              {filteredConversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="text-sm">Start a new conversation from the Users tab</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <Button
                    key={conversation.user.id}
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto"
                    onClick={() => handleUserSelect(conversation.user)}
                  >
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarFallback>
                        {conversation.user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{conversation.user.name}</p>
                        {conversation.unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {conversation.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {conversation.lastMessage.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(conversation.lastMessage.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </Button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto"
                    onClick={() => handleUserSelect(user)}
                  >
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarFallback>
                        {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{user.name}</p>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          user.status === "online" ? "bg-green-500" :
                          user.status === "idle" ? "bg-yellow-500" : "bg-gray-400"
                        )} />
                      </div>
                      <p className="text-sm text-muted-foreground capitalize">{user.role}</p>
                    </div>
                  </Button>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}