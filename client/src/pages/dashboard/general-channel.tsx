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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
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
    <div className="w-[min(320px,90vw)] rounded-lg border bg-popover shadow-md p-2 flex flex-col gap-2">
      <div className="flex gap-1 border-b pb-2 mb-1 overflow-x-auto">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={i}
            onClick={() => setActiveCategory(i)}
            className={cn(
              "whitespace-nowrap text-xs px-2 py-1 rounded transition-colors flex-shrink-0",
              activeCategory === i
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-muted text-muted-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 max-h-52 overflow-y-auto">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose?.(); }}
            className="text-xl hover:bg-muted rounded p-1 leading-none transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
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
  const [openReactionId, setOpenReactionId] = useState<number | null>(null);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearchQuery, setMentionSearchQuery] = useState("");
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const [readCounts, setReadCounts] = useState<{ [key: number]: number }>({});
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<GeneralChannelMessage[]>({
    queryKey: ["/api/general-channel/messages"],
    refetchInterval: 5000,
    enabled: !!user,
  });

  const pinnedMessages = messages.filter(msg => msg.isPinned);

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
    // setPinnedMessages is no longer needed since we use a derived constant
    
    return () => clearTimeout(timer);
  }, [messages.length, user?.id]); // Only re-run when message count changes

  // SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/sse");
    
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'general_channel_message_updated') {
          queryClient.setQueryData(["/api/general-channel/messages"], (old: any) => {
            if (!old) return old;
            return old.map((msg: any) => 
              msg.id === payload.data.id ? payload.data : msg
            );
          });
        } else if (payload.type === 'general_channel_message_new') {
          queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
        }
      } catch (err) {
        console.error("SSE Error:", err);
      }
    };

    return () => eventSource.close();
  }, [queryClient]);
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
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/general-channel/messages"] });
      const previousMessages = queryClient.getQueryData(["/api/general-channel/messages"]);

      const optimisticMessage: GeneralChannelMessage = {
        id: Date.now(),
        content,
        senderId: user?.id || 0,
        senderName: user?.name || "You",
        senderEmail: user?.email || "",
        createdAt: new Date().toISOString(),
        isPinned: false,
        reactions: [],
      };

      queryClient.setQueryData(["/api/general-channel/messages"], (old: GeneralChannelMessage[] | undefined) =>
        old ? [...old, optimisticMessage] : [optimisticMessage]
      );

      return { previousMessages };
    },
    onError: (error: Error, _content, context: any) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/general-channel/messages"], context.previousMessages);
      }
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
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
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/general-channel/messages"], (old: any) => {
        if (!old) return old;
        return old.map((msg: any) => 
          msg.id === data.id ? data : msg
        );
      });
      toast({ title: "Success", description: "Message pinned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to pin message", description: error.message, variant: "destructive" });
    },
  });

  const unpinMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const response = await fetch(`/api/general-channel/messages/${messageId}/pin`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to unpin message");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/general-channel/messages"], (old: any) => {
        if (!old) return old;
        return old.map((msg: any) => 
          msg.id === data.id ? data : msg
        );
      });
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
      const firstDoubleNewline = msg.content.indexOf('\n\n');
      if (firstDoubleNewline !== -1) {
        cleanContent = msg.content.substring(firstDoubleNewline + 2);
      }
    }

    // Capture the target reply state immediately
    const targetReply = { ...msg, content: cleanContent };

    // RESET STATE AND DOM AGGRESSIVELY
    setMessage("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    
    // Set the reply target
    setReplyingTo(targetReply);
    
    // Multiple delayed clears to fight any browser/React state persistence
    const clearInput = () => {
      setMessage("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    };

    setTimeout(clearInput, 10);
    setTimeout(() => {
      clearInput();
      inputRef.current?.focus();
    }, 150);
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
    
    // Capturing the current input state safely and IMMEDIATELY
    const currentInput = message.trim();
    if (!currentInput) return;

    // Capture the current reply state
    const currentReply = replyingTo;
    
    // RESET STATE AND DOM IMMEDIATELY
    // We clear the state AND the input field before doing any processing
    setMessage(""); 
    setReplyingTo(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    let finalMessageBody = currentInput;
    
    // Handle mentions
    const everyoneRegex = /@(everyone|all)/gi;
    if (everyoneRegex.test(finalMessageBody)) {
      const allUserNames = allUsers
        .filter((u: any) => u.id !== user?.id && u.role !== 'client')
        .map((u: any) => `@${u.name}`)
        .join(' ');
      
      finalMessageBody = finalMessageBody.replace(everyoneRegex, allUserNames);
    }
    
    // Wrap with quote if replying
    if (currentReply) {
      // Strip any existing > prefix from each line, then re-join with \n>
      // so every line carries the > prefix. This prevents any \n\n inside
      // the quoted content from being confused with the quote/message separator.
      const strippedLines = currentReply.content
        .split('\n')
        .map((line: string) => line.startsWith('> ') ? line.substring(2) : line);

      const contentToQuote = strippedLines.join('\n> ');

      finalMessageBody = `> Replying to ${currentReply.senderName}:\n> ${contentToQuote}\n\n${currentInput}`;
    }

    // Send via mutation
    sendMessageMutation.mutate(finalMessageBody);
    
    // Final cleanup pass to ensure DOM is empty
    setTimeout(() => {
      setMessage("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }, 50);
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
    onMutate: async ({ messageId, emoji }: { messageId: number, emoji: string }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/general-channel/messages"] });
      const previousMessages = queryClient.getQueryData(["/api/general-channel/messages"]);

      queryClient.setQueryData(["/api/general-channel/messages"], (old: GeneralChannelMessage[] | undefined) => {
        if (!old) return old;
        return old.map((msg) => {
          if (msg.id !== messageId) return msg;
          const reactions = [...(msg.reactions || [])];
          const existingIdx = reactions.findIndex((r) => r.emoji === emoji);
          if (existingIdx > -1) {
            const userIds = [...reactions[existingIdx].userIds];
            const userIdx = userIds.indexOf(user?.id!);
            if (userIdx > -1) {
              userIds.splice(userIdx, 1);
              if (userIds.length === 0) {
                reactions.splice(existingIdx, 1);
              } else {
                reactions[existingIdx] = { ...reactions[existingIdx], userIds };
              }
            } else {
              reactions[existingIdx] = { ...reactions[existingIdx], userIds: [...userIds, user?.id!] };
            }
          } else {
            reactions.push({ emoji, userIds: [user?.id!] });
          }
          return { ...msg, reactions };
        });
      });

      return { previousMessages };
    },
    onError: (error: Error, _vars, context: any) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/general-channel/messages"], context.previousMessages);
      }
      toast({ title: "Failed to react", description: error.message, variant: "destructive" });
    },
    onSettled: (_data, _error, { messageId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/general-channel/messages"] });
    },
  });

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Use the actual event value to update state
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
    // Check if the message is a reply (starts with > Replying to)
    const isReply = content.startsWith('> Replying to');
    
    let displayContent = content;
    let quotePart = "";
    
    if (isReply) {
      // Find the first occurrence of double newline which separates quote from message
      const firstDoubleNewline = content.indexOf('\n\n');
      if (firstDoubleNewline !== -1) {
        quotePart = content.substring(0, firstDoubleNewline);
        displayContent = content.substring(firstDoubleNewline + 2);
      }
    }

    const renderText = (text: string) => {
      const combinedRegex = /(https?:\/\/[^\s]+)|(@[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;
      return text.split(combinedRegex).filter(Boolean).map((part, index) => {
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
        if (/^@[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*$/.test(part)) {
          const mentionedName = part.substring(1).trim();
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
                className={cn(
                  "px-1 rounded font-medium",
                  isSelfMention ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {part}
              </span>
            );
          }
        }
        return part;
      });
    };

    return (
      <div className="flex flex-col gap-1">
        {quotePart && (
          <div 
            className="border-l-4 border-primary/30 pl-3 py-1 mb-1 bg-muted/30 rounded-r text-sm text-muted-foreground italic line-clamp-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => {
              const replyLines = quotePart.split('\n');
              const quotedText = replyLines.slice(1).map(l => l.replace(/^> /, '')).join('\n');
              handleClickRepliedMessage(quotedText);
            }}
          >
            {quotePart.split('\n').map((line, i) => (
              <div key={i}>{line.startsWith('> ') ? line.substring(2) : line}</div>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">
          {renderText(displayContent)}
        </div>
      </div>
    );
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
    if (message.isPinned) {
      unpinMessageMutation.mutate(message.id);
    } else {
      pinMessageMutation.mutate(message.id);
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
                          {msg.isPinned && (
                            <div className="flex items-center gap-1 mt-1 px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full w-fit">
                              <Pin className="h-3 w-3" />
                              <span className="text-[10px] font-medium uppercase tracking-wider">Pinned</span>
                            </div>
                          )}
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
                              {renderMessageContent(msg.content)}
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
                            <div className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border shadow-sm rounded-lg p-1 z-30 before:content-[''] before:absolute before:-bottom-2 before:left-0 before:right-0 before:h-2">
                              <Popover open={openReactionId === msg.id} onOpenChange={(open) => setOpenReactionId(open ? msg.id : null)}>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-primary hover:bg-primary/10 rounded-md">
                                    <Smile className="h-4.5 w-4.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent 
                                  className="p-0 border-none w-auto z-[300]" 
                                  side="top" 
                                  align="end" 
                                  avoidCollisions
                                  sideOffset={5}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <EmojiPicker 
                                      onSelect={(emoji) => {
                                        reactToMessageMutation.mutate({ messageId: msg.id, emoji });
                                        setOpenReactionId(null);
                                      }} 
                                    />
                                  </div>
                                </PopoverContent>
                              </Popover>

                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 hover:text-primary hover:bg-primary/10 rounded-md"
                                onClick={() => handleReplyToMessage(msg)}
                              >
                                <Reply className="h-4.5 w-4.5" />
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-muted rounded-md">
                                    <MoreVertical className="h-4.5 w-4.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[250]">
                                  <DropdownMenuItem onClick={() => handleCopyMessage(msg.content)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy
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
                      placeholder={replyingTo ? `Replying to ${replyingTo.senderName}...` : "Type your message... (Use @ to mention someone, Shift+Enter for new line, Enter to send)"}
                      className="min-h-[80px] max-h-[250px] resize-y pr-10"
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
                  <Button type="submit" disabled={!message.trim()} size="sm" className="mb-1">
                    <Send className="h-4 w-4" />
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