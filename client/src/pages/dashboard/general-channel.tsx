import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, MoreVertical, Edit2, Trash2, X, Check, Copy, Reply, Forward, CheckCheck, Pin, Search, Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Add CSS for highlight animation
const style = document.createElement('style');
style.textContent = `
  @keyframes highlight-flash {
    0%, 100% { background-color: transparent; }
    50% { background-color: rgba(59, 130, 246, 0.3); }
  }

  .highlight-flash {
    animation: highlight-flash 2s ease-in-out;
  }
`;
document.head.appendChild(style);

// Lightweight emoji picker — no external dependencies
const EMOJI_CATEGORIES = [
  { label: "Smileys", emojis: ["😀","😂","😍","😎","🤔","😅","😊","🙃","😏","😢","😡","🤯","🥳","😴","🤗","😷","🥺","😤","🤩","😶"] },
  { label: "Gestures", emojis: ["👍","👎","👏","🙏","🤝","✌️","🤞","👌","🤙","💪","🖐️","✋","🫡","🫶","❤️","💔","💯","🔥","⭐","✅"] },
  { label: "Objects", emojis: ["📌","📎","✏️","🗒️","📅","💡","🔔","🔕","📢","📣","📧","📱","💻","🖥️","🖨️","⌨️","🖱️","🗂️","📂","📁"] },
  { label: "Symbols", emojis: ["❗","❓","‼️","⁉️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘"] },
];

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose?: () => void }) {
  const [activeCategory, setActiveCategory] = useState(0);
  return (
    <div className="w-80 rounded-lg border bg-popover shadow-md p-3 flex flex-col gap-2">
      <div className="flex gap-1 border-b pb-2 mb-1 overflow-x-auto no-scrollbar">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            onClick={() => setActiveCategory(i)}
            className={cn("whitespace-nowrap text-xs px-2 py-1 rounded transition-colors", activeCategory === i ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground")}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-60 overflow-y-auto pr-1">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose?.(); }}
            className="text-2xl hover:bg-muted rounded p-1.5 leading-none transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper function to check if we should show a date separator
const shouldShowDateSeparator = (currentMsg: any, previousMsg: any): boolean => {
  if (!previousMsg) return true;
  
  const currentDate = new Date(currentMsg.createdAt);
  const previousDate = new Date(previousMsg.createdAt);
  
  return currentDate.toDateString() !== previousDate.toDateString();
};

// Helper function to format the date separator
const formatDateSeparator = (date: string | Date): string => {
  const messageDate = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (messageDate.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (messageDate.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return messageDate.toLocaleDateString([], { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }
};

interface GeneralChannelMessage {
  id: number;
  content: string;
  senderId: number;
  senderName: string;
  senderEmail: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  isPinned?: boolean;
  reactions?: { emoji: string, userIds: number[] }[];
}

export default function GeneralChannel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<GeneralChannelMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<GeneralChannelMessage | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [selectedForwardUsers, setSelectedForwardUsers] = useState<number[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearchQuery, setMentionSearchQuery] = useState("");
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const [readCounts, setReadCounts] = useState<{ [key: number]: number }>({});
  const [pinnedMessages, setPinnedMessages] = useState<GeneralChannelMessage[]>([]);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<GeneralChannelMessage[]>({
    queryKey: ["/api/general-channel/messages"],
    refetchInterval: 5000, // Poll every 5 seconds instead of 2
    enabled: !!user,
  });

  // Fetch read counts for recent user messages only
  useEffect(() => {
    if (!messages.length || !user?.id) return;

    const fetchReadCounts = async () => {
      // Only fetch read counts for the last 20 messages from current user
      const recentUserMessages = messages
        .filter(msg => msg.senderId === user.id)
        .slice(-20);
      
      if (recentUserMessages.length === 0) return;
      
      const counts: { [key: number]: number } = {};
      
      for (const msg of recentUserMessages) {
        try {
          const response = await fetch(`/api/general-channel/messages/${msg.id}/read-count`);
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

    // Debounce the fetch
    const timer = setTimeout(fetchReadCounts, 500);
    
    // Filter pinned messages
    setPinnedMessages(messages.filter(msg => msg.isPinned));
    
    return () => clearTimeout(timer);
  }, [messages.length, user?.id]); // Only re-run when message count changes

  const { data: allUsers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch("/api/general-channel/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
      setMessage("");
      setReplyingTo(null);
      toast({ title: "Success", description: "Message sent successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(`/api/general-channel/messages/${messageId}/pin`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to pin message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
      toast({ title: "Success", description: "Message pinned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to pin message", description: error.message, variant: "destructive" });
    },
  });

  const unpinMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(`/api/general-channel/messages/${messageId}/unpin`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to unpin message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
      toast({ title: "Success", description: "Message unpinned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unpin message", description: error.message, variant: "destructive" });
    },
  });

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

  useEffect(() => {
    if (!user?.id) return;

    const handleGeneralChannelMessage = (event: Event) => {
      const customEvent = event as CustomEvent;
      const messageData = customEvent.detail;

      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
    };

    window.addEventListener('general-channel-message', handleGeneralChannelMessage as EventListener);

    return () => {
      window.removeEventListener('general-channel-message', handleGeneralChannelMessage as EventListener);
    };
  }, [user?.id, queryClient]);

  useEffect(() => {
    if (!messages.length || !user?.id) return;

    const markMessagesAsRead = async () => {
      const messageIdsToMarkRead = messages
        .filter(msg => msg.senderId !== user.id)
        .map(msg => msg.id);

      if (messageIdsToMarkRead.length === 0) return;

      try {
        const response = await fetch("/api/general-channel/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageIds: messageIdsToMarkRead }),
        });
        if (response.ok) {
          const data = await response.json();
          setReadCounts(prevCounts => ({ ...prevCounts, ...data.readCounts }));
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    };

    markMessagesAsRead();
  }, [messages, user?.id]);

  const handleEditMessage = async (messageId: number) => {
    if (!editingContent.trim()) {
      toast({ title: "Error", description: "Message cannot be empty", variant: "destructive" });
      return;
    }

    try {
      const originalMessage = messages.find(m => m.id === messageId);
      let contentToSave = editingContent.trim();

      // If the original message was a reply, preserve the quote part
      if (originalMessage?.content.startsWith('> Replying to')) {
        const quotePart = originalMessage.content.split('\n\n')[0];
        contentToSave = `${quotePart}\n\n${editingContent.trim()}`;
      }

      const response = await fetch(`/api/general-channel/messages/${messageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
        setEditingMessageId(null);
        setEditingContent("");
        toast({ title: "Success", description: "Message updated successfully" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to edit message", variant: "destructive" });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    try {
      const response = await fetch(`/api/general-channel/messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
        toast({ title: "Success", description: "Message deleted successfully" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Message copied to clipboard" });
  };

  const handleReplyToMessage = (msg: GeneralChannelMessage) => {
    let cleanContent = msg.content;
    if (msg.content.startsWith('> Replying to')) {
      const parts = msg.content.split('\n\n');
      cleanContent = parts.length > 1 ? parts.slice(1).join('\n\n') : msg.content;
    }

    setReplyingTo({ ...msg, content: cleanContent });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleForwardToDM = async () => {
    if (!forwardingMessage || selectedForwardUsers.length === 0) {
      toast({ title: "Error", description: "Please select at least one recipient", variant: "destructive" });
      return;
    }

    try {
      let cleanContent = forwardingMessage.content;
      if (cleanContent.startsWith('> Replying to')) {
        const parts = cleanContent.split('\n\n');
        cleanContent = parts.length > 1 ? parts.slice(1).join('\n\n') : cleanContent;
      }
      if (cleanContent.startsWith('🔄 Forwarded:\n')) {
        cleanContent = cleanContent.replace('🔄 Forwarded:\n', '');
      }

      const forwardContent = `🔄 Forwarded:\n${cleanContent}`;

      const promises = selectedForwardUsers.map(async (receiverId) => {
        const response = await fetch("/api/direct-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiverId, content: forwardContent }),
        });
        if (!response.ok) throw new Error(`Failed to forward message to user ${receiverId}`);
        return response.json();
      });

      await Promise.all(promises);

      toast({ title: "Success", description: `Message forwarded to ${selectedForwardUsers.length} user(s)` });
      setForwardingMessage(null);
      setSelectedForwardUsers([]);
      setForwardSearchQuery("");
    } catch (error) {
      toast({ title: "Error", description: "Failed to forward message", variant: "destructive" });
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    let messageToSend = message.trim();
    
    // Replace @all or @everyone with mentions of all users (excluding self) - case insensitive
    const everyoneRegex = /@(everyone|all)\b/gi;
    if (everyoneRegex.test(messageToSend)) {
      const allUserNames = allUsers
        .filter((u: any) => u.id !== user?.id && u.role !== 'client')
        .map((u: any) => `@${u.name}`)
        .join(' ');
      
      messageToSend = messageToSend.replace(/@(everyone|all)\b/gi, allUserNames);
    }
    
    if (replyingTo) {
      const quotedMessage = `> Replying to ${replyingTo.senderName}:\n> ${replyingTo.content}\n\n${messageToSend}`;
      messageToSend = quotedMessage;
    }

    sendMessageMutation.mutate(messageToSend);
  };

  const reactToMessageMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number, emoji: string }) => {
      const response = await fetch(`/api/general-channel/messages/${messageId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to react to message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to react", description: error.message, variant: "destructive" });
    },
  });

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    setMessage(value);
    setMentionCursorPosition(cursorPos);

    // Check for @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's a space after @ (which would end the mention)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearchQuery(textAfterAt);
        setShowMentionSuggestions(true);
        return;
      }
    }

    setShowMentionSuggestions(false);
  };

  const handleMentionSelect = (userName: string) => {
    const textBeforeCursor = message.substring(0, mentionCursorPosition);
    const textAfterCursor = message.substring(mentionCursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const newMessage = 
        message.substring(0, lastAtIndex) + 
        `@${userName} ` + 
        textAfterCursor;

      setMessage(newMessage);
      setShowMentionSuggestions(false);

      // Focus back on input
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = lastAtIndex + userName.length + 2;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const filteredMentionUsers = allUsers.filter((u: any) => 
    u.name && 
    u.role !== 'client' && 
    u.id !== user?.id &&
    u.name.toLowerCase().includes(mentionSearchQuery.toLowerCase())
  );

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

  const renderMessageContent = (content: string) => {
    // Combined regex for URLs and mentions
    const combinedRegex = /(https?:\/\/[^\s]+)|(@[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;

    return content.split(combinedRegex).filter(Boolean).map((part, index) => {
      // Check if it's a URL
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a 
            key={`url-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }

      // Check if it's a mention
      if (/^@[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*$/.test(part)) {
        const mentionedName = part.substring(1).trim();

        // Find the mentioned user
        const mentionedUser = allUsers.find((u: any) => 
          u.name && (
            u.name.toLowerCase() === mentionedName.toLowerCase() ||
            u.name.toLowerCase().startsWith(mentionedName.toLowerCase())
          )
        );

        if (mentionedUser) {
          const isSelfMention = mentionedUser.id === user?.id;

          return (
            <span 
              key={`mention-${index}`}
              className={`${
                isSelfMention 
                  ? 'bg-blue-700 text-white font-bold px-1.5 py-0.5 rounded mx-0.5' 
                  : 'bg-blue-500 text-white font-medium px-1.5 py-0.5 rounded mx-0.5'
              }`}
            >
              {part}
            </span>
          );
        }
      }

      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  const handleClickRepliedMessage = (quotedContent: string) => {
    // Find the original message by matching content
    const originalMsg = messages.find(m => {
      // Check if message content matches exactly
      if (m.content === quotedContent) return true;

      // Check if it's in a reply chain
      if (m.content.startsWith('> Replying to')) {
        const parts = m.content.split('\n\n');
        const actualContent = parts.slice(1).join('\n\n');
        return actualContent === quotedContent;
      }

      // Partial match for truncated content
      return m.content.includes(quotedContent);
    });

    if (originalMsg) {
      const originalMessageElement = document.getElementById(`gc-message-${originalMsg.id}`);
      if (originalMessageElement) {
        // Add highlight effect
        originalMessageElement.classList.add('highlight-flash');

        // Scroll to message
        originalMessageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after animation
        setTimeout(() => {
          originalMessageElement.classList.remove('highlight-flash');
        }, 2000);
      }
    }
  };

  const handlePinMessage = async (message: GeneralChannelMessage) => {
    try {
      const response = await fetch(`/api/general-channel/messages/${message.id}/pin`, {
        method: message.isPinned ? 'DELETE' : 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to update pin status');

      // Refetch messages to update UI
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
      
      toast({ 
        title: "Success", 
        description: message.isPinned ? "Message unpinned" : "Message pinned successfully" 
      });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update pin status", 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard/general-channel" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 lg:p-6">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold truncate">
                    General Discussion
                  </h3>
                  {pinnedMessages.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:underline whitespace-nowrap">
                        <Pin className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500" />
                        <span className="hidden sm:inline">{pinnedMessages.length}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
                        {pinnedMessages.map((msg) => (
                          <DropdownMenuItem key={msg.id} onClick={() => {
                            const element = document.getElementById(`gc-message-${msg.id}`);
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              element.classList.add('highlight-flash');
                              setTimeout(() => element.classList.remove('highlight-flash'), 2000);
                            }
                          }}>
                            <span className="line-clamp-1 text-sm">
                              {msg.content.length > 50 ? `${msg.content.substring(0, 50)}...` : msg.content}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {showMessageSearch ? (
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search messages..."
                        className="pl-8 w-full sm:w-48"
                        value={messageSearchQuery}
                        onChange={(e) => setMessageSearchQuery(e.target.value)}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1 h-6 w-6 p-0"
                        onClick={() => {
                          setShowMessageSearch(false);
                          setMessageSearchQuery("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMessageSearch(true)}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  )}
                  <Badge variant="outline" className="text-xs whitespace-nowrap">
                    {messages.length} msg{messages.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-4 space-y-4" onScroll={handleScroll}>
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">
                      <p className="text-lg font-medium mb-2">No messages yet</p>
                      <p className="text-sm">Be the first to start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  messages
                    .filter(msg => 
                      !messageSearchQuery || 
                      msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase()) ||
                      msg.senderName.toLowerCase().includes(messageSearchQuery.toLowerCase())
                    )
                    .map((msg, index, filteredMessages) => (
                    <div key={`msg-wrapper-${msg.id}`}>
                      {/* Date Separator */}
                      {shouldShowDateSeparator(msg, filteredMessages[index - 1]) && (
                        <div className="flex items-center gap-4 my-4">
                          <div className="flex-1 border-t"></div>
                          <span className="text-xs text-muted-foreground font-medium px-2">
                            {formatDateSeparator(msg.createdAt)}
                          </span>
                          <div className="flex-1 border-t"></div>
                        </div>
                      )}
                    <div key={msg.id} id={`gc-message-${msg.id}`} className="flex gap-3 group transition-all duration-300">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(msg.senderName || "Unknown")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{msg.senderName || "Unknown User"}</span>
                          <span className="text-xs text-muted-foreground">{formatMessageTime(msg.createdAt || new Date())}</span>
                          {msg.isPinned && <Pin className="h-4 w-4 text-blue-500" />}
                        </div>
                        {editingMessageId === msg.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              className="min-h-[60px] text-sm"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => handleEditMessage(msg.id)}>
                                <Check className="h-4 w-4 mr-1" />
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingMessageId(null); setEditingContent(""); }}>
                                <X className="h-4 w-4 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className={cn("text-sm rounded-lg p-3 whitespace-pre-wrap break-words", msg.senderId === user?.id ? "bg-primary/20" : "bg-muted/50")}>
                              {msg.content.startsWith('> Replying to') ? (
                                <div>
                                  {msg.content.split('\n\n').map((part, idx) => {
                                    if (idx === 0) {
                                      // Extract quoted content for navigation
                                      const replyLines = part.split('\n');
                                      const quotedContent = replyLines.slice(1).map(l => l.replace(/^> /, '')).join('\n');

                                      return (
                                        <div 
                                          key={idx} 
                                          className="border-l-4 border-primary pl-3 mb-2 text-muted-foreground italic cursor-pointer hover:bg-muted/50 transition-colors rounded"
                                          onClick={() => handleClickRepliedMessage(quotedContent)}
                                        >
                                          {part.split('\n').map((line, lineIdx) => (
                                            <div key={lineIdx}>{line.replace(/^> /, '')}</div>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return <div key={idx}>{renderMessageContent(part)}</div>;
                                  })}
                                </div>
                              ) : (
                                renderMessageContent(msg.content)
                              )}
                            </div>

                            {msg.reactions && msg.reactions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {msg.reactions.map((reaction, i) => (
                                  <button
                                    key={i}
                                    onClick={() => reactToMessageMutation.mutate({ messageId: msg.id, emoji: reaction.emoji })}
                                    className={cn(
                                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors border",
                                      reaction.userIds.includes(user?.id!)
                                        ? "bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                                        : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
                                    )}
                                  >
                                    <span>{reaction.emoji}</span>
                                    <span>{reaction.userIds.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {msg.isEdited && <p className="text-xs text-muted-foreground italic mt-0.5">edited</p>}
                            {/* Read Receipt - Show double tick if viewed by at least one user */}
                            {msg.senderId === user?.id && (
                              <div className="flex items-center gap-1 mt-1">
                                <CheckCheck className={cn(
                                  "h-3 w-3",
                                  readCounts[msg.id] > 0 ? "text-blue-500" : "text-muted-foreground"
                                )} />
                                {readCounts[msg.id] > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Seen by {readCounts[msg.id]} {readCounts[msg.id] === 1 ? 'person' : 'people'}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <div className="flex items-center w-full cursor-pointer">
                                          <Smile className="h-4 w-4 mr-2" />
                                          React
                                        </div>
                                      </PopoverTrigger>
                                      <PopoverContent className="p-0 border-none w-auto" side="left">
                                        <EmojiPicker 
                                          onSelect={(emoji) => {
                                            reactToMessageMutation.mutate({ messageId: msg.id, emoji });
                                          }} 
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleCopyMessage(msg.content)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleReplyToMessage(msg)}>
                                    <Reply className="h-4 w-4 mr-2" />
                                    Reply
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setForwardingMessage(msg)}>
                                    <Forward className="h-4 w-4 mr-2" />
                                    Forward to DM
                                  </DropdownMenuItem>
                                  {(msg.senderId === user?.id || user?.role === 'operations_manager' || user?.role === 'team_lead' || user?.specialization === 'operations_manager') && (
                                    <>
                                      <DropdownMenuItem onClick={() => handlePinMessage(msg)}>
                                        <Pin className="h-4 w-4 mr-2" />
                                        {msg.isPinned ? 'Unpin' : 'Pin'}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => { 
                                        setEditingMessageId(msg.id); 
                                        // Extract only the actual message content, not the quoted part
                                        if (msg.content.startsWith('> Replying to')) {
                                          const parts = msg.content.split('\n\n');
                                          setEditingContent(parts.length > 1 ? parts.slice(1).join('\n\n') : '');
                                        } else {
                                          setEditingContent(msg.content);
                                        }
                                      }}>
                                        <Edit2 className="h-4 w-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDeleteMessage(msg.id)} className="text-destructive">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
                
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
              </div>

              <Dialog open={!!forwardingMessage} onOpenChange={(open) => !open && setForwardingMessage(null)}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Forward to Direct Message</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input placeholder="Search users..." value={forwardSearchQuery} onChange={(e) => setForwardSearchQuery(e.target.value)} />
                    <ScrollArea className="h-[300px] border rounded-md p-2">
                      <div className="space-y-1">
                        {allUsers.filter((u: any) => u.id !== user?.id && u.name.toLowerCase().includes(forwardSearchQuery.toLowerCase())).map((u: any) => (
                          <div key={u.id} onClick={() => setSelectedForwardUsers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])} className={cn("flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted", selectedForwardUsers.includes(u.id) && "bg-primary/10")}>
                            <input type="checkbox" checked={selectedForwardUsers.includes(u.id)} onChange={() => {}} className="h-4 w-4" />
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>{getUserInitials(u.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.role}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setForwardingMessage(null)}>Cancel</Button>
                    <Button onClick={handleForwardToDM} disabled={selectedForwardUsers.length === 0}>Forward</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="border-t p-4 relative">
                {replyingTo && (
                  <div className="mb-3 p-3 bg-muted/50 border-l-4 border-primary rounded-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Reply className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium text-sm">Replying to {replyingTo.senderName}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                          {replyingTo.content.length > 100 ? `${replyingTo.content.substring(0, 100)}...` : replyingTo.content}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setReplyingTo(null)} className="h-6 w-6 p-0 flex-shrink-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {showMentionSuggestions && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-[300px] overflow-y-auto z-50">
                    {filteredMentionUsers.map((u: any) => (
                      <div
                        key={u.id}
                        onClick={() => handleMentionSelect(u.name)}
                        className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getUserInitials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Textarea
                      ref={inputRef}
                      value={message}
                      onChange={handleMessageChange}
                      placeholder="Type your message... (Use @ to mention someone, Shift+Enter for new line, Enter to send)"
                      className="min-h-[60px] max-h-[200px] resize-y pr-10"
                      disabled={sendMessageMutation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !showMentionSuggestions) {
                          e.preventDefault();
                          handleSendMessage(e);
                        } else if (e.key === 'Escape' && showMentionSuggestions) {
                          setShowMentionSuggestions(false);
                        }
                      }}
                    />
                    <div className="absolute right-2 bottom-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                            <Smile className="h-5 w-5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 border-none w-auto" side="top" align="end">
                          <EmojiPicker onSelect={handleEmojiSelect} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <Button type="submit" disabled={!message.trim() || sendMessageMutation.isPending} size="sm" className="mb-1">
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