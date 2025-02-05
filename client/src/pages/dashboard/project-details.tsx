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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function ProjectDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "" });

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
    mutationFn: async (task: Partial<Task>) => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, projectId: id }),
      });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api/projects", id, "tasks"] });
      setIsTaskDialogOpen(false);
      setNewTask({ title: "", description: "" });
      toast({ title: "Success", description: "Task created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message });
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
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">{project?.name}</h1>
            <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Task</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <Input
                    placeholder="Task title"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Task description"
                    value={newTask.description}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <Button onClick={() => createTask.mutate(newTask)}>Create Task</Button>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="tasks" className="space-y-4">
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="team">Team Members</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks">
              <TaskList tasks={tasks} projectId={parseInt(id!)} />
            </TabsContent>

            <TabsContent value="team">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((member) => (
                  <div key={member.id} className="p-4 border rounded-lg">
                    <h3 className="font-semibold">{member.userId}</h3>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}