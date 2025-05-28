import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash, Plus } from "lucide-react";
import type { Task } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface TaskFormData {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'review';
  assigneeId: string;
  startDate: string;
  deadline: string;
  workingHours: string;
}

const defaultTask: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  assigneeId: "",
  startDate: "",
  deadline: "",
  workingHours: "",
};

interface TaskListProps {
  tasks: Task[];
  projectId?: number;
  isStaffView?: boolean;
}

export function TaskList({ tasks, projectId, isStaffView = false }: TaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>(defaultTask);

  const { data: staff } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/staff", projectId],
    refetchOnWindowFocus: true,
    enabled: !!user, // Only fetch if user is authenticated
  });

  const handleEditClick = (task: Task) => {
    setEditTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      status: task.status as TaskFormData["status"] || "todo",
      assigneeId: task.assigneeId?.toString() || "",
      startDate: task.startDate ? new Date(task.startDate).toISOString().slice(0, 16) : "",
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "",
      workingHours: task.workingHours?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleNewTask = () => {
    setEditTask(null);
    setFormData(defaultTask);
    setIsDialogOpen(true);
  };

  const createTask = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          projectId,
          assigneeId: data.assigneeId && data.assigneeId !== 'unassigned' ? parseInt(data.assigneeId) : null,
          startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          workingHours: data.workingHours ? parseInt(data.workingHours) : null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create task');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update both global and project-specific tasks
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [data];
        return [...oldTasks, data];
      });

      queryClient.setQueryData(["/api/projects", projectId, "tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [data];
        return [...oldTasks, data];
      });

      // Invalidate queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });

      setIsDialogOpen(false);
      setFormData(defaultTask);
      toast({
        title: "Success",
        description: "Task created successfully",
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
    mutationFn: async (data: TaskFormData) => {
      if (!editTask) throw new Error("No task selected for update");

      const response = await fetch(`/api/tasks/${editTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          assigneeId: data.assigneeId && data.assigneeId !== 'unassigned' ? parseInt(data.assigneeId) : null,
          startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          workingHours: data.workingHours ? parseInt(data.workingHours) : null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to update task");
      }

      return response.json();
    },
    onSuccess: (response) => {
      // Update the cache immediately
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [response.task];
        return oldTasks.map(task => task.id === response.task.id ? response.task : task);
      });

      queryClient.setQueryData(["/api/projects", projectId, "tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [response.task];
        return oldTasks.map(task => task.id === response.task.id ? response.task : task);
      });

      setIsDialogOpen(false);
      setEditTask(null);
      setFormData(defaultTask);
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
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete task');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] }); //Invalidate project tasks as well
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editTask) {
      updateTask.mutate(formData);
    } else {
      createTask.mutate(formData);
    }
  };

  // Filter tasks for staff view to only show tasks assigned to the current user
  const filteredTasks = isStaffView
    ? tasks.filter((task) => task.assigneeId === user?.staffId)
    : tasks;

  return (
    <div>
      <div className="flex justify-end mb-4">
        { !isStaffView && (
          <Button onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Working Hours</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell className="max-w-xs truncate">{task.description}</TableCell>
                <TableCell>
                  <Badge className={`bg-${task.status === 'completed' ? 'green' : task.status === 'in_progress' ? 'blue' : task.status === 'review' ? 'yellow' : 'gray'}-500`}>
                    {task.status?.replace('_', ' ') || 'todo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {staff?.find((s) => s.id === task.assigneeId)?.name || "Unassigned"}
                </TableCell>
                <TableCell>
                  {task.startDate
                    ? new Date(task.startDate).toLocaleDateString()
                    : "Not set"}
                </TableCell>
                <TableCell>
                  {task.deadline
                    ? new Date(task.deadline).toLocaleDateString()
                    : "No deadline"}
                </TableCell>
                <TableCell>
                  {task.workingHours ? `${task.workingHours}h` : "Not set"}
                </TableCell>
                <TableCell className="text-right">
                  {!isStaffView ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(task)}
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
                  ) : (
                    <span className="text-xs text-muted-foreground">View Only</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[800px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTask ? "Edit Task" : "Create New Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title - Full width */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter task title"
                required
              />
            </div>

            {/* Task Details - Full width */}
            <div className="space-y-2">
              <Label htmlFor="description">Task Details</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter detailed task description..."
                rows={4}
                className="resize-none min-h-[100px]"
              />
            </div>

            {/* Two column grid for medium screens and up */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: TaskFormData["status"]) =>
                    setFormData({ ...formData, status: value })
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

              <div className="space-y-2">
                <Label htmlFor="assignee">Assignee</Label>
                <Select
                  value={formData.assigneeId}
                  onValueChange={(value) => setFormData({ ...formData, assigneeId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staff?.map((member) => (
                      <SelectItem key={member.id} value={member.id.toString()}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
              </div>
            </div>

            {/* Working hours - Full width but smaller */}
            <div className="space-y-2">
              <Label htmlFor="workingHours">Number of Working Hours</Label>
              <div className="max-w-xs">
                <Input
                  id="workingHours"
                  type="number"
                  min="1"
                  step="1"
                  value={formData.workingHours}
                  onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                  placeholder="Enter estimated hours"
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-4 border-t">
              <Button type="submit" className="w-full md:w-auto md:min-w-[200px]">
                {editTask ? "Update Task" : "Create Task"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}