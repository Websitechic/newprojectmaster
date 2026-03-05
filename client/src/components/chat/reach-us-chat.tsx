import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, Users, Search } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  specialization?: string;
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
  senderName: string;
  updatedAt?: string;
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

export function ReachUsChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"conversations" | "team">("team");
  const { user } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  let isMounted = true;

  // Fetch available team members for the client
  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        console.log("Fetching team members for reach us page...");
        const response = await fetch("/api/client/team-members");
        console.log("Team members response status:", response.status);

        if (response.ok) {
          const data = await response.json();
          console.log("Team members data:", data);
          setAvailableUsers(data);
        } else {
          const errorText = await response.text();
          console.error("Failed to fetch team members:", response.status, errorText);
        }
      } catch (error) {
        console.error("Error fetching team members:", error);
      }
    };

    if (user) {
      fetchTeamMembers();
    }
  }, [user]);

  // Fetch existing conversations with team members
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch("/api/direct-messages/conversations");
        if (response.ok) {
          const allConversations = await response.json();
          // Filter conversations to only show team members
          const teamMemberIds = availableUsers.map(u => u.id);
          const teamConversations = allConversations.filter(
            (conv: Conversation) => teamMemberIds.includes(conv.user.id)
          );
          setConversations(teamConversations);
        }
      } catch (error) {
        console.error("Error fetching conversations:", error);
      }
    };

    if (availableUsers.length > 0) {
      fetchConversations();
    }
  }, [availableUsers]);

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

  // Listen for direct message events from GlobalNotificationListener (App.tsx)
  useEffect(() => {
    const handleDirectMessage = () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/direct-messages"]
      }).catch(console.error);
    };

    window.addEventListener('direct-message-received', handleDirectMessage);

    return () => {
      isMounted = false;
      window.removeEventListener('direct-message-received', handleDirectMessage);
    };
  }, [queryClient]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const response = await fetch("/api/direct-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receiverId: selectedUser.id,
          content: newMessage,
        }),
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages(prev => [...prev, sentMessage]);
        setNewMessage("");

        // Update conversations list
        setConversations(prev => {
          const updated = [...prev];
          const existingIndex = updated.findIndex(conv => conv.user.id === selectedUser.id);

          if (existingIndex >= 0) {
            updated[existingIndex] = {
              ...updated[existingIndex],
              lastMessage: {
                content: sentMessage.content,
                createdAt: sentMessage.createdAt,
                senderId: sentMessage.senderId,
              },
            };
          } else {
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
      }
    } catch (error) {
      console.error("Error sending message:", error);
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

  const getRoleDisplayName = (role: string, specialization?: string) => {
    switch (role) {
      case 'product_owner':
        return 'Product Owner';
      case 'operations_manager':
        return 'Operations Manager';
      case 'staff':
        if (specialization === 'technical_support') {
          return 'Technical Support';
        }
        return 'Developer';
      default:
        return role.replace('_', ' ');
    }
  };

  const filteredUsers = availableUsers.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getRoleDisplayName(u.role, u.specialization).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredConversations = conversations.filter(conv =>
    conv.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getRoleDisplayName(conv.user.role, conv.user.specialization).toLowerCase().includes(searchQuery.toLowerCase())
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
              <p className="text-sm text-muted-foreground">
                {getRoleDisplayName(selectedUser.role, selectedUser.specialization)}
              </p>
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
                    "flex items-start gap-2",
                    message.senderId === user?.id ? "flex-row-reverse" : ""
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {message.senderName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "rounded-lg p-3 max-w-[70%]",
                      message.senderId === user?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary"
                    )}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(message.createdAt).toLocaleTimeString()}
                      {message.updatedAt && new Date(message.updatedAt).getTime() > new Date(message.createdAt).getTime() + 1000 && (
                        <span className="italic ml-1">• edited</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="border-t p-4">
          <div className="flex gap-2 w-full">
            <Input
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            />
            <Button size="icon" onClick={handleSendMessage}>
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
          <h3 className="font-semibold">Your Project Team</h3>
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
              variant={view === "team" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("team")}
            >
              <Users className="h-4 w-4 mr-1" />
              Team
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
                  <p className="text-sm">Start a new conversation from the Team tab</p>
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
                        {getRoleDisplayName(conversation.user.role, conversation.user.specialization)} • {new Date(conversation.lastMessage.createdAt).toLocaleTimeString()}
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
                  <p>No team members available</p>
                </div>
              ) : (
                filteredUsers.map((teamUser) => (
                  <Button
                    key={teamUser.id}
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto"
                    onClick={() => handleUserSelect(teamUser)}
                  >
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarFallback>
                        {teamUser.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{teamUser.name}</p>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          teamUser.status === "online" ? "bg-green-500" :
                          teamUser.status === "idle" ? "bg-yellow-500" : "bg-gray-400"
                        )} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getRoleDisplayName(teamUser.role, teamUser.specialization)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {teamUser.email}
                      </p>
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