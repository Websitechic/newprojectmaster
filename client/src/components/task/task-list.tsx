
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Task } from "@db/schema";

interface TaskListProps {
  tasks: Task[];
  projectId?: number;
}

export function TaskList({ tasks, projectId }: TaskListProps) {
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assigneeId: "",
    startDate: "",
    endDate: "",
  });

  const createTask = useMutation({
    mutationFn: async (task: typeof newTask) => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, projectId }),
      });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setNewTask({ title: "", description: "", assigneeId: "", startDate: "", endDate: "" });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update task status");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "high": return "bg-red-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date();
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => {
      if (status === "overdue") return isOverdue(task);
      return task.status === status && !isOverdue(task);
    });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={newTask.title}
                  onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={newTask.description}
                  onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div>
                <Label>Assignee ID</Label>
                <Input
                  value={newTask.assigneeId}
                  onChange={e => setNewTask(prev => ({ ...prev, assigneeId: e.target.value }))}
                />
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="datetime-local"
                  value={newTask.startDate}
                  onChange={e => setNewTask(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="datetime-local"
                  value={newTask.endDate}
                  onChange={e => setNewTask(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <Button onClick={() => createTask.mutate(newTask)}>Create Task</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {["new", "in_progress", "completed", "overdue"].map(status => (
          <div key={status} className="space-y-4">
            <h3 className="font-semibold capitalize">{status.replace("_", " ")}</h3>
            <div className="space-y-2">
              {getTasksByStatus(status).map(task => (
                <Card key={task.id} className="p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <h4 className="font-semibold">{task.title}</h4>
                      <Badge variant="secondary" className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} />
                    </div>
                    <div className="flex justify-between items-center">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {task.title?.slice(0, 2).toUpperCase() || "NA"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        Due {task.deadline ? new Date(task.deadline).toLocaleDateString() : "No deadline"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
