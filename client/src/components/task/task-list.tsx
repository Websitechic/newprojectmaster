import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash, Plus } from "lucide-react";
import type { Task } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface StaffMember {
  id: number;
  name: string;
}

interface TaskListProps {
  tasks: Task[];
  projectId: number;
}

interface TaskFormData {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'review';
  assigneeId: string;
  deadline: string;
}

export function TaskList({ tasks, projectId }: TaskListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState<TaskFormData>({
    title: "",
    description: "",
    status: "todo",
    assigneeId: "",
    deadline: "",
  });

  const { data: staff } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
  });

  const createTask = useMutation({
    mutationFn: async (task: TaskFormData) => {
      const formattedTask = {
        ...task,
        assigneeId: task.assigneeId ? parseInt(task.assigneeId) : null,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      };

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formattedTask, projectId }),
      });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Success",
        description: "Task created successfully",
      });
      setNewTask({
        title: "",
        description: "",
        status: "todo",
        assigneeId: "",
        deadline: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (task: Task) => {
      const formattedTask = {
        ...task,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
      };

      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formattedTask),
      });
      if (!response.ok) throw new Error("Failed to update task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditTask(null);
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "todo":
        return "bg-gray-500";
      case "in_progress":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "review":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
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
            <TaskForm
              task={newTask}
              staff={staff}
              onSubmit={(task) => createTask.mutate(task as TaskFormData)}
              onChange={setNewTask}
              projectId={projectId}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell>{task.description}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusColor(task.status || 'todo')}>
                    {(task.status || 'todo').replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {staff?.find((s) => s.id === (task.assigneeId ? parseInt(String(task.assigneeId)) : null))?.name || "Unassigned"}
                </TableCell>
                <TableCell>
                  {task.deadline
                    ? new Date(task.deadline).toLocaleDateString()
                    : "No deadline"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTask(task)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTask.mutate(task.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editTask && (
            <TaskForm
              task={{
                ...editTask,
                assigneeId: editTask.assigneeId?.toString() || "",
                deadline: editTask.deadline ? new Date(editTask.deadline).toISOString().slice(0, 16) : "",
                status: editTask.status || "todo",
              }}
              staff={staff}
              onSubmit={(task) => updateTask.mutate({ ...editTask, ...task } as Task)}
              onChange={(task) => setEditTask({ ...editTask, ...task } as Task)}
              projectId={projectId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TaskFormProps {
  task: TaskFormData;
  staff?: StaffMember[];
  onSubmit: (task: TaskFormData) => void;
  onChange: (task: TaskFormData) => void;
  projectId: number;
}

function TaskForm({ task, staff, onSubmit, onChange }: TaskFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input
          value={task.title}
          onChange={e => onChange({ ...task, title: e.target.value })}
          placeholder="Enter task title"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={task.description}
          onChange={e => onChange({ ...task, description: e.target.value })}
          placeholder="Enter task description"
        />
      </div>
      <div>
        <Label>Status</Label>
        <Select
          value={task.status}
          onValueChange={(value: 'todo' | 'in_progress' | 'completed' | 'review') => 
            onChange({ ...task, status: value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="review">Review</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Assignee</Label>
        <Select
          value={task.assigneeId}
          onValueChange={(value) => onChange({ ...task, assigneeId: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select assignee" />
          </SelectTrigger>
          <SelectContent>
            {staff?.map((member) => (
              <SelectItem key={member.id} value={member.id.toString()}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Deadline</Label>
        <Input
          type="datetime-local"
          value={task.deadline}
          onChange={e => onChange({ ...task, deadline: e.target.value })}
        />
      </div>
      <Button onClick={() => onSubmit(task)} className="w-full">
        {task.id ? 'Update Task' : 'Create Task'}
      </Button>
    </div>
  );
}