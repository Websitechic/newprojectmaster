
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskList } from "@/components/task/task-list";
import { Plus, MessageSquare, Upload, FileText } from "lucide-react";
import type { Project, Task, ProjectMember } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState({ title: "", description: "" });
  const [newMessage, setNewMessage] = useState("");
  const [newClientMessage, setNewClientMessage] = useState("");

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

  const createTask = useMutation({
    mutationFn: (task: Partial<Task>) => 
      fetch(`/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, projectId: id })
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/projects", id, "tasks"] });
      setNewTask({ title: "", description: "" });
    }
  });

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      fetch(`/api/projects/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, type: 'team' })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/projects", id, "messages"] });
      setNewMessage("");
    }
  });

  const sendClientMessage = useMutation({
    mutationFn: (message: string) =>
      fetch(`/api/projects/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, type: 'client' })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/projects", id, "messages"] });
      setNewClientMessage("");
    }
  });

  if (projectLoading || tasksLoading || membersLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${id}`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex items-center justify-center flex-1">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${id}`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex items-center justify-center flex-1">
            <p className="text-red-500">Error loading project details</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground mt-2">{project.description}</p>
            <div className="flex items-center gap-4 mt-4">
              <Badge variant="secondary">{project.type}</Badge>
              <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                {project.status}
              </Badge>
            </div>
          </div>

          <div className="mb-6">
            <Card>
              <CardContent className="py-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{project.progress || 0}%</span>
                  </div>
                  <Progress value={project.progress || 0} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="tasks" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="client-chat">Client Chat</TabsTrigger>
              <TabsTrigger value="team-chat">Team Chat</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-4 mb-4">
                    <Input 
                      placeholder="Task title"
                      value={newTask.title}
                      onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    />
                    <Textarea 
                      placeholder="Task description"
                      value={newTask.description}
                      onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    />
                    <Button onClick={() => createTask.mutate(newTask)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Task
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <TaskList tasks={tasks} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="client-chat">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="h-[400px] overflow-y-auto border rounded-lg p-4">
                      {/* Client messages will be displayed here */}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={newClientMessage}
                        onChange={e => setNewClientMessage(e.target.value)}
                      />
                      <Button onClick={() => sendClientMessage.mutate(newClientMessage)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team-chat">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="h-[400px] overflow-y-auto border rounded-lg p-4">
                      {/* Team messages will be displayed here */}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                      />
                      <Button onClick={() => sendMessage.mutate(newMessage)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="resources">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div 
                      className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary cursor-pointer"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        // Handle file drop
                      }}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2" />
                      <p>Drag and drop files here or click to browse</p>
                    </div>
                    <div className="space-y-2">
                      {/* Resources list will be displayed here */}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
