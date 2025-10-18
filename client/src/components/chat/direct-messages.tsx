import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Users, Search, MoreVertical, Edit2, Trash2, X, Check, CornerUpLeft, Copy, Reply } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";

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
  replyToMessageId?: number | null;
  replyToSenderName?: string | null;
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
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { playNotificationSound } = useNotificationSound();
  const { user } = useAuth();
  const { toast } = useToast();

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
          console.log("🔔 Direct message received:", message);

          // Play sound if message is from someone else
          if (message.senderId !== user?.id) {
            console.log('🔊 Direct message from another user, playing sound');

            // Play sound with multiple retry attempts
            const attemptSound = async (attemptNumber: number) => {
              try {
                console.log(`🔊 Direct message sound attempt ${attemptNumber}`);
                await playNotificationSound();
                console.log(`✅ Direct message sound attempt ${attemptNumber} completed`);
              } catch (error) {
                console.error(`❌ Direct message sound attempt ${attemptNumber} failed:`, error);
              }
            };

            // Multiple attempts with delays
            setTimeout(() => attemptSound(1), 50);
            setTimeout(() => attemptSound(2), 200);
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
  }, [selectedUser, user?.id, playNotificationSound]);

  // WebSocket event listeners for direct messages
  useEffect(() => {
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

    return () => {
      window.removeEventListener('websocket:direct_message', handleDirectMessage as EventListener);
    };
  }, [selectedUser, user?.id, queryClient]);

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
      // Find the original message to check if it has a reply context
      const originalMsg = messages.find(m => m.id === messageId);
      let finalContent = editingContent.trim();

      // If the original message was a reply, preserve the quoted part
      if (originalMsg && originalMsg.content.startsWith('> Replying to')) {
        const quotedPart = originalMsg.content.split('\n\n')[0];
        finalContent = `${quotedPart}\n\n${editingContent.trim()}`;
      }

      const response = await fetch(`/api/direct-messages/${messageId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: finalContent,
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
        } else if (selectedUser && messages.length === 1) {
          // If it was the last message, clear the lastMessage in the conversation
          setConversations(prev =>
            prev.map(conv =>
              conv.user.id === selectedUser.id
                ? { ...conv, lastMessage: undefined, unreadCount: 0 }
                : conv
            )
          );
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

      let messageContent = newMessage.trim();
      let quotedPreviewContent = "";
      let quotedPreviewSenderName = "";

      if (replyingTo) {
        const maxLength = 100; // Max length for quoted preview
        let contentToQuote = replyingTo.content;
        if (contentToQuote.length > maxLength) {
          contentToQuote = contentToQuote.substring(0, maxLength) + "...";
        }
        quotedPreviewContent = contentToQuote;
        quotedPreviewSenderName = replyingTo.senderName;

        messageContent = `> Replying to ${replyingTo.senderName}:\n> ${replyingTo.content}\n\n${messageContent}`;
      }

      const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiverId: selectedUser.id,
          content: messageContent,
          replyToMessageId: replyingTo?.id,
          replyToSenderName: replyingTo?.senderName,
        }),
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        const sentMessage = await response.json();
        console.log("Message sent successfully:", sentMessage);

        // Clear the input and reply state immediately
        setNewMessage("");
        setReplyingTo(null);

        // Update messages state to include the sent message only if it doesn't exist
        setMessages(prev => {
          const exists = prev.some(m => m.id === sentMessage.id);
          if (!exists) {
            return [...prev, sentMessage];
          }
          return prev;
        });

        // Update conversations list immediately
        setConversations(prev => {
          const updated = [...prev];
          const existingIndex = updated.findIndex(conv => conv.user.id === selectedUser.id);

          if (existingIndex >= 0) {
            // Move conversation to top and update last message
            const conversation = updated[existingIndex];
            updated.splice(existingIndex, 1);
            updated.unshift({
              ...conversation,
              lastMessage: {
                content: sentMessage.content,
                createdAt: sentMessage.createdAt,
                senderId: sentMessage.senderId,
              },
              unreadCount: 0, // We sent it, so it's not unread for us
            });
          } else {
            // Add new conversation at the top
            updated.unshift({
              user: selectedUser,
              lastMessage: {
                content: sentMessage.content,
                createdAt: sentMessage.createdAt,
                senderId: sentMessage.senderId,
              },
              unreadCount: 0,
            });
          }

          return updated;
        });

      } else {
        const errorText = await response.text();
        console.error("Failed to send message:", response.status, errorText);
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReplyToMessage = (message: DirectMessage) => {
    setReplyingTo(message);
    // Optionally focus the input field
    inputRef.current?.focus();
  };

  const handleClickRepliedMessage = (originalMessageId: number) => {
    // Find the original message element
    const messageElement = document.getElementById(`dm-message-${originalMessageId}`);
    if (messageElement) {
      // Scroll to the message
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add highlight effect
      messageElement.classList.add('highlight-flash');

      // Remove highlight after animation
      setTimeout(() => {
        messageElement.classList.remove('highlight-flash');
      }, 2000);
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
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
              {messages.map((message) => {
                const maxLength = 100; // Max length for quoted preview
                let quotedContent = "";
                let quotedSenderName = "";
                let actualMessageContent = message.content;

                if (message.replyToMessageId && message.content.startsWith('> Replying to')) {
                  const parts = message.content.split('\n\n');
                  const replyToLine = parts[0];
                  const originalMessage = parts.slice(1).join('\n\n');

                  const replyToMatch = replyToLine.match(/^> Replying to (.*?):/);
                  if (replyToMatch && replyToMatch[1]) {
                    quotedSenderName = replyToMatch[1];
                  }

                  if (originalMessage.length > maxLength) {
                    quotedContent = originalMessage.substring(0, maxLength) + "...";
                  } else {
                    quotedContent = originalMessage;
                  }
                  actualMessageContent = parts.slice(1).join('\n\n'); // Content after the quote
                }

                return (
                  <div
                    key={message.id}
                    id={`dm-message-${message.id}`}
                    className={cn(
                      "flex items-start gap-2 group transition-all duration-300",
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
                        {message.replyToMessageId && quotedContent && (
                          <div
                            className={cn(
                              "mb-2 p-2 rounded-md text-sm break-words whitespace-pre-wrap cursor-pointer hover:bg-muted/30 transition-all",
                              message.senderId === user?.id
                                ? "bg-primary/20"
                                : "bg-secondary/50"
                            )}
                            onClick={() => {
                              if (message.replyToMessageId) {
                                handleClickRepliedMessage(message.replyToMessageId);
                              }
                            }}
                          >
                            <p className="font-semibold text-xs">
                              Replying to {quotedSenderName}
                            </p>
                            <p className="text-xs">
                              {quotedContent}
                            </p>
                          </div>
                        )}
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
                            <div className="text-sm break-words whitespace-pre-wrap">
                              {actualMessageContent.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
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
                            </div>
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
                                <DropdownMenuItem onClick={() => {
                                  navigator.clipboard.writeText(message.content);
                                  toast({
                                    title: "Copied",
                                    description: "Message copied to clipboard",
                                  });
                                }}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditingContent(actualMessageContent);
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
                                <DropdownMenuItem onClick={() => handleReplyToMessage(message)}>
                                  <CornerUpLeft className="h-4 w-4 mr-2" />
                                  Reply
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                         {message.senderId !== user?.id && (
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
                                <DropdownMenuItem onClick={() => {
                                  navigator.clipboard.writeText(message.content);
                                  toast({
                                    title: "Copied",
                                    description: "Message copied to clipboard",
                                  });
                                }}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleReplyToMessage(message)}>
                                  <CornerUpLeft className="h-4 w-4 mr-2" />
                                  Reply
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="border-t p-4">
          <div className="w-full space-y-2">
            {replyingTo && (
              <div className="p-3 bg-muted/50 border-l-4 border-primary rounded-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Reply className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm">Replying to {replyingTo.senderName}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                      {replyingTo.content.length > 100 
                        ? `${replyingTo.content.substring(0, 100)}...` 
                        : replyingTo.content}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelReply}
                    className="h-6 w-6 p-0 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 w-full items-end">
              <Textarea
                ref={inputRef}
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