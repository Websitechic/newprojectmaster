
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskList } from "@/components/task/task-list";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Trash, Users, Send, Upload, FileText, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { Project, Task, ProjectMember, Message } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["api/projects", id],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json())
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["api/projects", id, "tasks"],
    queryFn: () => fetch(`/api/projects/${id}/tasks`).then(res => res.json())
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<ProjectMember[]>({
    queryKey: ["api/projects", id, "members"],
    queryFn: () => fetch(`/api/projects/${id}/members`).then(res => res.json())
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["api/projects", id, "messages"],
    queryFn: () => fetch(`/api/projects/${id}/messages`).then(res => res.json())
  });

  const sendMessage = useMutation({
    mutationFn: async (messageData: { content: string; type: string }) => {
      const response = await fetch(`/api/projects/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messageData),
      });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/projects", id, "messages"] });
      setMessage("");
    },
  });

  if (projectLoading || tasksLoading || membersLoading) {
    return <div>Loading...</div>;
  }

  if (!project) return null;

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-sm text-muted-foreground">{project.description}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {}}>
                <Users className="h-4 w-4 mr-2" />
                Manage Team
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>
                    <Edit className="h-4 w-4 mr-2" /> Edit Project
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">
                    <Trash className="h-4 w-4 mr-2" /> Delete Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Tasks Card */}
            <Card>
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskList tasks={tasks} projectId={parseInt(id!)} />
              </CardContent>
            </Card>

            {/* Team Chat Card */}
            <Card>
              <CardHeader>
                <CardTitle>Team Chat</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] mb-4">
                  <div className="space-y-4">
                    {messages
                      .filter(m => m.type === 'team')
                      .map(message => (
                        <div key={message.id} className="bg-muted p-2 rounded">
                          <p className="text-sm">{message.content}</p>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                  />
                  <Button onClick={() => sendMessage.mutate({ content: message, type: 'team' })}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Client Communication Card */}
            <Card>
              <CardHeader>
                <CardTitle>Client Communication</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] mb-4">
                  <div className="space-y-4">
                    {messages
                      .filter(m => m.type === 'client')
                      .map(message => (
                        <div key={message.id} className="bg-muted p-2 rounded">
                          <p className="text-sm">{message.content}</p>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message..."
                  />
                  <Button onClick={() => sendMessage.mutate({ content: message, type: 'client' })}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Documents & Files Card */}
            <Card>
              <CardHeader>
                <CardTitle>Documents & Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button variant="outline" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New File
                  </Button>
                  <div className="space-y-2">
                    {/* File list would go here */}
                    <div className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        <span className="text-sm">document.pdf</span>
                      </div>
                      <Button variant="ghost" size="sm">
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
