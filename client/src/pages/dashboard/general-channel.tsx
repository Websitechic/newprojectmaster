
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, MoreVertical, Edit2, Trash2, X, Check, Copy, Reply, Forward } from "lucide-react";
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

interface GeneralChannelMessage {
  id: number;
  content: string;
  senderId: number;
  senderName: string;
  senderEmail: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<GeneralChannelMessage[]>({
    queryKey: ["/api/general-channel/messages"],
    refetchInterval: 2000,
    enabled: !!user,
  });

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        await fetch("/api/general-channel/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageIds: messageIdsToMarkRead }),
        });
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
      const response = await fetch(`/api/general-channel/messages/${messageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingContent }),
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
    if (replyingTo) {
      const quotedMessage = `> Replying to ${replyingTo.senderName}:\n> ${replyingTo.content}\n\n${messageToSend}`;
      messageToSend = quotedMessage;
    }

    sendMessageMutation.mutate(messageToSend);
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

  const renderMessageContent = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.split(urlRegex).map((part, index) => {
      if (urlRegex.test(part)) {
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
      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard/general-channel" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          <div className="flex items-center gap-4 mb-4 flex-shrink-0">
            <div>
              <h1 className="text-2xl font-bold">General Channel</h1>
              <p className="text-muted-foreground">Platform-wide communication for all users</p>
            </div>
          </div>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    General Discussion
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Open channel for all platform users
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-muted-foreground">
                      <p className="text-lg font-medium mb-2">No messages yet</p>
                      <p className="text-sm">Be the first to start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} id={`message-${msg.id}`} className="flex gap-3 group transition-all duration-300">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(msg.senderName || "Unknown")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{msg.senderName || "Unknown User"}</span>
                          <span className="text-xs text-muted-foreground">{formatMessageTime(msg.createdAt || new Date())}</span>
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
                                      return (
                                        <div key={idx} className="border-l-4 border-primary pl-3 mb-2 text-muted-foreground italic">
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
                            {msg.isEdited && <p className="text-xs text-muted-foreground italic mt-0.5">edited</p>}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
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
                                  {msg.senderId === user?.id && (
                                    <>
                                      <DropdownMenuItem onClick={() => { setEditingMessageId(msg.id); setEditingContent(msg.content); }}>
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
                  ))
                )}
                <div ref={messagesEndRef} />
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

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message... (Shift+Enter for new line, Enter to send)"
                    className="flex-1 min-h-[60px] max-h-[200px] resize-y"
                    disabled={sendMessageMutation.isPending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
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
