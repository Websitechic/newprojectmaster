import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Users, Search, MoreVertical, Edit2, Trash2, X, Check, CornerUpLeft, Copy, Forward, CheckCheck, Reply } from "lucide-react";
import { OnlineStatus } from "@/components/ui/online-status";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
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
  const [showSearch, setShowSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [view, setView] = useState<"conversations" | "new">("conversations");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DirectMessage | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [selectedForwardUsers, setSelectedForwardUsers] = useState<number[]>([]);
  const [readCounts, setReadCounts] = useState<Record<number, number>>({});
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  // Assuming recipientId is available from context or props in a real app, or derived from selectedUser
  // For this example, we'll derive it from selectedUser.id when available.
  const recipientId = selectedUser ? String(selectedUser.id) : null;


  // Fetch conversations with polling backup
  const { data: fetchedConversations } = useQuery({
    queryKey: ["/api/direct-messages/conversations"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds instead of 2
  });

  // Update conversations state when data changes
  useEffect(() => {
    if (fetchedConversations) {
      setConversations(fetchedConversations);
    }
  }, [fetchedConversations]);

  // Fetch all users for new conversations
  const { data: fetchedUsers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  // Update users state when data changes
  useEffect(() => {
    if (fetchedUsers) {
      setAllUsers(fetchedUsers);
    }
  }, [fetchedUsers]);

  // Fetch messages when a user is selected with polling backup
  const { data: fetchedMessages } = useQuery<DirectMessage[]>({
    queryKey: [`/api/direct-messages/${selectedUser?.id}`],
    enabled: !!selectedUser,
    refetchInterval: 5000, // Poll every 5 seconds instead of 2
  });

  // Update messages state when data changes
  useEffect(() => {
    if (fetchedMessages) {
      setMessages(fetchedMessages);

      // Fetch read counts for each message
      fetchedMessages.forEach(async (msg) => {
        try {
          const response = await fetch(`/api/direct-messages/${msg.id}/read-count`);
          if (response.ok) {
            const data = await response.json();
            setReadCounts(prev => ({ ...prev, [msg.id]: data.count }));
          }
        } catch (error) {
          console.error("Error fetching read count:", error);
        }
      });
    }
  }, [fetchedMessages]);

  // Fetch read counts for messages - optimized to only fetch for recent messages
  useEffect(() => {
    const fetchReadCounts = async () => {
      if (!messages.length || !user?.id) return;

      // Only fetch read counts for the last 20 messages from current user
      const recentUserMessages = messages
        .filter(msg => msg.senderId === user.id)
        .slice(-20);

      if (recentUserMessages.length === 0) return;

      const counts: Record<number, number> = {};
      for (const msg of recentUserMessages) {
        try {
          const response = await fetch(`/api/direct-messages/${msg.id}/read-count`);
          if (response.ok) {
            const data = await response.json();
            counts[msg.id] = data.count || 0;
          }
        } catch (error) {
          console.error(`Error fetching read count for message ${msg.id}:`, error);
        }
      }
      setReadCounts(counts);
    };

    // Debounce the fetch to avoid excessive calls
    const timer = setTimeout(fetchReadCounts, 500);
    return () => clearTimeout(timer);
  }, [messages.length, user?.id]); // Only re-run when message count changes

  // Filter messages by search query
  const filteredMessages = messages.filter(msg =>
    msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!showScrollButton) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showScrollButton]);

  // Detect scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  };

  // Listen for real-time message updates via SSE and custom events
  useEffect(() => {
    if (!user?.id) {
      console.log('❌ User not authenticated, skipping direct message listener setup');
      return;
    }

    console.log('✅ Setting up direct message event listener for user:', user.id);

    const handleDirectMessage = (event: Event) => {
      const customEvent = event as CustomEvent;
      const messageData = customEvent.detail;
      console.log("📬 Direct message event received in conversation component:", {
        messageId: messageData.id,
        messageData,
        currentUserId: user?.id,
        selectedUserId: selectedUser?.id
      });

      // Update conversations list first
      setConversations(prev => {
        const updated = [...prev];
        const otherUserId = messageData.senderId === user.id ? messageData.receiverId : messageData.senderId;
        const existingIndex = updated.findIndex(conv => conv.user.id === otherUserId);

        if (existingIndex >= 0) {
          // Move conversation to top and update last message
          const conversation = updated[existingIndex];
          updated.splice(existingIndex, 1);
          updated.unshift({
            ...conversation,
            lastMessage: {
              content: messageData.content,
              createdAt: messageData.createdAt,
              senderId: messageData.senderId,
            },
            unreadCount: messageData.senderId === user.id ? 0 : conversation.unreadCount + 1,
          });
        }

        return updated;
      });

      // If viewing a conversation, check if message is part of it
      if (selectedUser) {
        const isMessageInConversation =
          (messageData.senderId === selectedUser.id && messageData.receiverId === user.id) ||
          (messageData.senderId === user.id && messageData.receiverId === selectedUser.id);

        if (isMessageInConversation) {
          console.log("✅ Adding message to current conversation immediately");
          setMessages(prev => {
            // Check if message already exists to avoid duplicates
            const exists = prev.some(m => m.id === messageData.id);
            if (!exists) {
              console.log("✅ Message added to conversation");
              return [...prev, messageData];
            }
            console.log("⚠️ Message already exists, skipping");
            return prev;
          });
        }
      }

      // Invalidate queries to ensure fresh data on next poll
      queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/direct-messages/${selectedUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/unread-count"] });
    };

    window.addEventListener('direct-message-received', handleDirectMessage);

    return () => {
      window.removeEventListener('direct-message-received', handleDirectMessage);
    };
  }, [user?.id, selectedUser, queryClient]);

  // WebSocket event listeners for direct messages
  useEffect(() => {
    const handleDirectMessage = (event: CustomEvent) => {
      const messageData = event.detail;
      console.log("Direct message received via WebSocket:", messageData);

      // Note: Notifications and sounds are handled globally in App.tsx

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
        // Update messages in local state with the full content (including quoted part)
        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? { ...msg, content: finalContent, updatedAt: now }
              : msg
          )
        );

        // Also update conversations to reflect the change (show only the actual message, not the quote)
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

  const handleSendMessage = async (e?: React.FormEvent) => {
    // Prevent default form submission if event is provided
    if (e) {
      e.preventDefault();
    }

    if (!newMessage.trim() || !selectedUser) {
      console.log("Cannot send message: missing content or selected user");
      return;
    }

    try {
      console.log("Sending message to user:", selectedUser.id, "Content:", newMessage);

      const messageToSend = newMessage.trim();
      let messageContent = messageToSend;

      if (replyingTo) {
        const quotedLines = replyingTo.content
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n');
        messageContent = `> Replying to ${replyingTo.senderName}:\n${quotedLines}\n\n${messageToSend}`;
      }

      // Create optimistic message for immediate UI update
      const optimisticMessage: DirectMessage = {
        id: Date.now(), // Temporary ID
        content: messageContent,
        senderId: user!.id,
        receiverId: selectedUser.id,
        read: false,
        createdAt: new Date().toISOString(),
        senderName: user!.name,
        replyToMessageId: replyingTo?.id,
        replyToSenderName: replyingTo?.senderName,
      };

      // Add message to UI immediately (optimistic update)
      setMessages(prev => [...prev, optimisticMessage]);

      // Clear input immediately for better UX
      setNewMessage("");
      setReplyingTo(null);

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

        // Replace optimistic message with real message from server
        setMessages(prev => 
          prev.map(m => m.id === optimisticMessage.id ? sentMessage : m)
        );

        // Update conversations list
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
              unreadCount: 0,
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

        // Invalidate queries to ensure data consistency
        queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/direct-messages/unread-count"] });

      } else {
        const errorText = await response.text();
        console.error("Failed to send message:", response.status, errorText);
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        // Restore the message if sending failed
        setNewMessage(messageToSend);
        throw new Error(`Failed to send message: ${response.status}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      // Restore input
      setNewMessage(messageToSend);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReplyToMessage = (message: DirectMessage) => {
    // Extract only the actual message content, not any nested quotes
    let cleanContent = message.content;
    if (message.content.startsWith('> Replying to')) {
      const firstDoubleNewline = message.content.indexOf('\n\n');
      cleanContent = firstDoubleNewline !== -1
        ? message.content.substring(firstDoubleNewline + 2)
        : message.content;
    }

    setReplyingTo({
      ...message,
      content: cleanContent
    });

    // Auto-focus the input field with longer delay and multiple attempts
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    });
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

  const renderMessageContent = (message: DirectMessage) => {
    const maxLength = 150;
    let quotedContent = "";
    let quotedSenderName = "";
    let actualMessageContent = message.content;

    if (message.content.startsWith('> Replying to')) {
      const firstDoubleNewline = message.content.indexOf('\n\n');
      if (firstDoubleNewline !== -1) {
        const quotePart = message.content.substring(0, firstDoubleNewline);
        actualMessageContent = message.content.substring(firstDoubleNewline + 2);

        const replyToMatch = quotePart.match(/^> Replying to (.*?):/);
        if (replyToMatch && replyToMatch[1]) {
          quotedSenderName = replyToMatch[1];
        }

        const rawQuote = quotePart
          .split('\n')
          .slice(1)
          .map(l => l.startsWith('> ') ? l.substring(2) : l)
          .join('\n');

        quotedContent = rawQuote.length > maxLength
          ? rawQuote.substring(0, maxLength) + "..."
          : rawQuote;
      }
    }

    const isOwnMessage = message.senderId === user?.id;
    const readCount = readCounts[message.id] || 0;

    return (
      <div
        className={cn(
          "rounded-lg p-3 relative",
          isOwnMessage
            ? "bg-primary text-primary-foreground"
            : "bg-secondary"
        )}
      >
        {quotedContent && (
          <div
            className={cn(
              "mb-2 p-2 rounded-md text-sm break-words whitespace-pre-wrap cursor-pointer hover:bg-muted/30 transition-all",
              isOwnMessage
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
              {message.content.startsWith('🔄 Forwarded:\n') ? (
                <div>
                  <p className="text-xs italic text-muted-foreground mb-1">Forwarded</p>
                  {message.content.replace('🔄 Forwarded:\n', '').split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
                    if (/^https?:\/\/[^\s]+$/.test(part)) {
                      return (
                        <a
                          key={index}
                          href={part}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "underline hover:opacity-80 break-all",
                            isOwnMessage
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
              ) : quotedContent ? (
                <div>
                  {actualMessageContent.split(/(https?:\/\/[^\s]+)/g).map((urlPart, urlIdx) => {
                    if (/^https?:\/\/[^\s]+$/.test(urlPart)) {
                      return (
                        <a
                          key={urlIdx}
                          href={urlPart}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "underline hover:opacity-80 break-all",
                            isOwnMessage
                              ? "text-primary-foreground"
                              : "text-blue-600"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {urlPart}
                        </a>
                      );
                    }
                    return urlPart;
                  })}
                </div>
              ) : (
                message.content.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
                  if (/^https?:\/\/[^\s]+$/.test(part)) {
                    return (
                      <a
                        key={index}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "underline hover:opacity-80 break-all",
                          isOwnMessage
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
                })
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs opacity-70">
                {new Date(message.createdAt).toLocaleTimeString()}
                {message.updatedAt && new Date(message.updatedAt).getTime() > new Date(message.createdAt).getTime() + 1000 && (
                  <span className="italic ml-1">• edited</span>
                )}
              </p>
              {isOwnMessage && readCount > 0 && (
                <CheckCheck className="h-3 w-3 text-blue-500" title={`Read by ${readCount} user(s)`} />
              )}
            </div>
          </>
        )}

        {message.senderId === user?.id && editingMessageId !== message.id && (
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
                {!message.content.startsWith('🔄 Forwarded:\n') && (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingMessageId(message.id);
                      if (message.content.startsWith('> Replying to')) {
                        const parts = message.content.split('\n\n');
                        setEditingContent(parts.length > 1 ? parts.slice(1).join('\n\n') : '');
                      } else {
                        setEditingContent(message.content);
                      }
                    }}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
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
                <DropdownMenuItem onClick={() => setForwardingMessage(message)}>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {message.senderId !== user?.id && (
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
                <DropdownMenuItem onClick={() => setForwardingMessage(message)}>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleForwardMessage = async () => {
    if (!forwardingMessage || selectedForwardUsers.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one recipient",
        variant: "destructive",
      });
      return;
    }

    try {
      // Extract clean content (without nested quotes or forwarded labels)
      let cleanContent = forwardingMessage.content;
      if (cleanContent.startsWith('> Replying to')) {
        const parts = cleanContent.split('\n\n');
        cleanContent = parts.length > 1 ? parts.slice(1).join('\n\n') : cleanContent;
      }
      if (cleanContent.startsWith('🔄 Forwarded:\n')) {
        cleanContent = cleanContent.replace('🔄 Forwarded:\n', '');
      }

      const forwardContent = `🔄 Forwarded:\n${cleanContent}`;

      // Send to each selected user
      const promises = selectedForwardUsers.map(async (receiverId) => {
        const response = await fetch("/api/direct-messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            receiverId,
            content: forwardContent,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to forward message to user ${receiverId}`);
        }
        return response.json();
      });

      await Promise.all(promises);

      toast({
        title: "Success",
        description: `Message forwarded to ${selectedForwardUsers.length} user(s)`,
      });

      // Reset state
      setForwardingMessage(null);
      setSelectedForwardUsers([]);
      setForwardSearchQuery("");
    } catch (error) {
      console.error("Error forwarding message:", error);
      toast({
        title: "Error",
        description: "Failed to forward message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleUserSelection = (userId: number) => {
    setSelectedForwardUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
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
      <Card className="h-[calc(100vh-8rem)] flex flex-col">
        <CardHeader className="border-b space-y-2 flex-shrink-0">
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
            <div className="flex-1">
              <h3 className="font-semibold">{selectedUser.name}</h3>
              <OnlineStatus
                status={selectedUser.status}
                lastActive={selectedUser.lastActive}
                showText={true}
                size="sm"
              />
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="pl-8"
              value={messageSearchQuery}
              onChange={(e) => setMessageSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0 relative">
          <ScrollArea className="h-full p-4" ref={scrollAreaRef} onScrollCapture={handleScroll}>
            <div className="space-y-4">
              {filteredMessages.map((message, index) => {
                // Check if we need to show a date separator
                const currentDate = new Date(message.createdAt).toDateString();
                const previousDate = index > 0 ? new Date(filteredMessages[index - 1].createdAt).toDateString() : null;
                const showDateSeparator = currentDate !== previousDate;

                return (
                  <div key={message.id} id={`dm-message-${message.id}`}>
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-4">
                        <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                          {new Date(message.createdAt).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    <div
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
                        {renderMessageContent(message)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Scroll to Bottom Button */}
          {showScrollButton && (
            <Button
              onClick={scrollToBottom}
              className="absolute bottom-4 right-4 rounded-full h-10 w-10 p-0 shadow-lg z-10"
              size="icon"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </Button>
          )}
        </CardContent>

        {/* Forward Message Dialog */}
        <Dialog open={!!forwardingMessage} onOpenChange={(open) => !open && setForwardingMessage(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Forward Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  className="pl-8"
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                />
              </div>
              <ScrollArea className="h-[300px] border rounded-md p-2">
                <div className="space-y-1">
                  {allUsers
                    .filter(u =>
                      u.id !== user?.id &&
                      (u.name.toLowerCase().includes(forwardSearchQuery.toLowerCase()) ||
                       u.email.toLowerCase().includes(forwardSearchQuery.toLowerCase()))
                    )
                    .map((u) => (
                      <div
                        key={u.id}
                        onClick={() => toggleUserSelection(u.id)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted",
                          selectedForwardUsers.includes(u.id) && "bg-primary/10"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForwardUsers.includes(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          className="h-4 w-4"
                        />
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {u.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.role}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
              {selectedForwardUsers.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {selectedForwardUsers.length} user(s) selected
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setForwardingMessage(null)}>
                Cancel
              </Button>
              <Button onClick={handleForwardMessage} disabled={selectedForwardUsers.length === 0}>
                Forward
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
            <form onSubmit={handleSendMessage} className="flex gap-2 w-full items-end">
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
              <Button type="submit" size="icon" disabled={!newMessage.trim()} className="mb-1">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="h-[calc(100vh-8rem)] flex flex-col">
      <CardHeader className="border-b p-3 sm:p-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Button
              variant={view === "conversations" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("conversations")}
            >
              <MessageCircle className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Chats</span>
            </Button>
            <Button
              variant={view === "new" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("new")}
            >
              <Users className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Users</span>
            </Button>
          </div>
          {showSearch ? (
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 pr-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-6 w-6 p-0"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="h-8 w-8 p-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
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