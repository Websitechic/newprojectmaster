import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Message } from "@db/schema";

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, subscribe } = useWebSocket(user?.id);

  useEffect(() => {
    const fetchMessages = async () => {
      const response = await fetch("/api/projects/1/messages");
      const data = await response.json();
      setMessages(data);
    };

    fetchMessages();
  }, []);

  useEffect(() => {
    subscribe((message) => {
      if (message.type === "new_message") {
        setMessages((prev) => [...prev, message.message]);
      }
    });
  }, [subscribe]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !user) return;

    sendMessage(input, 1); // Using project ID 1 for demo
    setInput("");
  };

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="border-b">
        <h3 className="font-semibold">Project Chat</h3>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start gap-2 ${
              message.userId === user?.id ? "flex-row-reverse" : ""
            }`}
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {message.userId ? message.userId.toString().slice(0, 2) : "??"}
              </AvatarFallback>
            </Avatar>
            <div
              className={`rounded-lg p-3 max-w-[70%] ${
                message.userId === user?.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              <p className="text-sm">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </CardContent>
      <CardFooter className="border-t p-4">
        <div className="flex gap-2 w-full">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
          />
          <Button size="icon" onClick={handleSend}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}