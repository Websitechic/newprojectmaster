import { useState, useEffect } from "react";
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
import { Pencil, Trash, Plus, Clock } from "lucide-react";
import type { Task, Project } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface TaskFormData {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'review' | 'technical_support';
  assigneeId: string;
  startDate: string;
  deadline: string;
  workingHours: string;
  workingMinutes: string;
}

const defaultTask: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  assigneeId: "",
  startDate: "",
  deadline: "",
  workingHours: "",
  workingMinutes: "0",
};

interface TaskListProps {
  tasks: Task[];
  projectId?: number;
  isStaffView?: boolean;
  showNewTaskButton?: boolean;
  showProjectInfo?: boolean;
}

export function TaskList({ tasks, projectId, isStaffView = false, showNewTaskButton = true, showProjectInfo = false }: TaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>(defaultTask);

  // State for managing expanded descriptions
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  const toggleDescription = (taskId: number) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const { data: staff, isLoading: staffLoading } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/staff", projectId],
    refetchOnWindowFocus: true,
    enabled: !!user, // Only fetch if user is authenticated
  });

  // Get all projects to display project names when showProjectInfo is true
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user && showProjectInfo,
  });

  // Create a map of project IDs to project names
  const projectMap = projects?.reduce((acc, project) => {
    acc[project.id] = project.name;
    return acc;
  }, {} as Record<number, string>) || {};

  // Removed WebSocket listeners to prevent infinite re-render loop
  // Optimistic updates in mutations handle immediate UI updates

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
      workingMinutes: task.workingMinutes?.toString() || "0",
    });
    setIsDialogOpen(true);
  };

  const handleNewTask = () => {
    setEditTask(null);
    // If technical support staff, default to assigning to themselves
    const initialFormData = user?.role === "staff" && user?.specialization === "technical_support"
      ? { ...defaultTask, assigneeId: user.id.toString() }
      : defaultTask;
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const createTask = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const hours = parseInt(data.workingHours) || 0;
      const minutes = parseInt(data.workingMinutes || '0') || 0;

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
          workingHours: hours || null,
          workingMinutes: minutes || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create task');
      }
      return response.json();
    },
    onSuccess: (newTask) => {
      console.log("Task created, updating cache:", newTask);

      // Immediately update the cache with the new task
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        const updated = oldTasks ? [newTask, ...oldTasks] : [newTask];
        console.log("Updated global tasks cache:", updated.length, "tasks");
        return updated;
      });

      if (projectId) {
        queryClient.setQueryData(["/api/projects", projectId, "tasks"], (oldTasks: Task[] | undefined) => {
          const updated = oldTasks ? [newTask, ...oldTasks] : [newTask];
          console.log("Updated project tasks cache:", updated.length, "tasks");
          return updated;
        });
      }

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

      const hours = parseInt(data.workingHours) || 0;
      const minutes = parseInt(data.workingMinutes || '0') || 0;

      const response = await fetch(`/api/tasks/${editTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          assigneeId: data.assigneeId && data.assigneeId !== 'unassigned' ? parseInt(data.assigneeId) : null,
          startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          workingHours: hours || null,
          workingMinutes: minutes || null,
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
      return taskId;
    },
    onSuccess: (deletedTaskId) => {
      // Optimistically remove the task from cache
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        return oldTasks ? oldTasks.filter(task => task.id !== deletedTaskId) : [];
      });

      if (projectId) {
        queryClient.setQueryData(["/api/projects", projectId, "tasks"], (oldTasks: Task[] | undefined) => {
          return oldTasks ? oldTasks.filter(task => task.id !== deletedTaskId) : [];
        });
      }

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

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

    const getStatusColor = (status: string) => {
        switch (status) {
          case 'todo': return 'bg-gray-100 text-gray-800';
          case 'in_progress': return 'bg-blue-100 text-blue-800';
          case 'completed': return 'bg-green-100 text-green-800';
          case 'review': return 'bg-yellow-100 text-yellow-800';
          case 'technical_support': return 'bg-red-100 text-red-800';
          default: return 'bg-gray-100 text-gray-800';
        }
      };

    const formatDescription = (description: string | null | undefined, taskId: number) => {
        if (!description) return "No description";
        const isExpanded = expandedDescriptions[taskId];
        const maxLength = 50; // Define your desired max length for truncation

        if (description.length <= maxLength) {
          return description;
        }

        return (
          <span>
            {isExpanded ? description : description.substring(0, maxLength) + "..."}
            <button
              onClick={() => toggleDescription(taskId)}
              className="ml-2 text-blue-500 hover:underline"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          </span>
        );
      };

  return (
    <div>
      <div className="flex justify-end mb-4">
        { !isStaffView && showNewTaskButton && (user?.role === "project_manager" || user?.role === "operations_manager" || user?.specialization === "operations_manager" || user?.role === "customer_support_officer" || user?.role === "team_lead" || (user?.role === "staff" && user?.specialization === "technical_support")) && (
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
              {showProjectInfo && <TableHead>Project</TableHead>}
              {showProjectInfo && <TableHead>Time Spent</TableHead>}
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
                <TableCell className="max-w-xs">
                    {formatDescription(task.description, task.id)}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(task.status)}>
                    <div className="text-center leading-tight">
                      {(task.status?.replace('_', ' ') || 'todo').split(' ').map((word, idx) => (
                        <div key={idx}>{word}</div>
                      ))}
                    </div>
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm leading-tight">
                    {(() => {
                      const assignee = staff?.find((s) => s.id === task.assigneeId);
                      const name = assignee?.name || "Unassigned";
                      const role = assignee?.role === 'team_lead' ? ' (Team Lead)' : '';
                      return (name + role).split(' ').map((word, idx) => (
                        <div key={idx}>{word}</div>
                      ));
                    })()}
                  </div>
                </TableCell>
                {showProjectInfo && (
                  <TableCell>
                    <div className="text-sm leading-tight">
                      {(projectMap[task.projectId] || `Project ID: ${task.projectId}`).split(' ').map((word, idx) => (
                        <div key={idx}>{word}</div>
                      ))}
                    </div>
                  </TableCell>
                )}
                {showProjectInfo && (
                  <TableCell>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span>{formatTime(task.timeSpent || 0)}</span>
                    </div>
                  </TableCell>
                )}
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
                  {task.workingHours || task.workingMinutes ? (() => {
                    const hours = task.workingHours || 0;
                    const minutes = task.workingMinutes || 0;
                    if (hours > 0 && minutes > 0) return `${hours}hr ${minutes}mins`;
                    if (hours > 0) return `${hours}hr`;
                    if (minutes > 0) return `${minutes}mins`;
                    return "Not set";
                  })() : "Not set"}
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
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="technical_support">Technical Support</SelectItem>
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
                    {user?.role === "staff" && user?.specialization === "technical_support" ? (
                      // Technical support staff can only assign to themselves
                      <SelectItem value={user.id.toString()}>
                        {user.name} (Me)
                      </SelectItem>
                    ) : (
                      // Project managers can assign to anyone
                      <>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staff?.map((member) => (
                          <SelectItem key={member.id} value={member.id.toString()}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
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

            {/* Working time - Hours and Minutes */}
            <div className="space-y-2">
              <Label>Working Time Allocation</Label>
              <div className="flex gap-4 max-w-md">
                <div className="flex-1">
                  <Label htmlFor="workingHours" className="text-sm text-muted-foreground">Hours</Label>
                  <Input
                    id="workingHours"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.workingHours}
                    onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="workingMinutes" className="text-sm text-muted-foreground">Minutes</Label>
                  <Input
                    id="workingMinutes"
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={formData.workingMinutes || '0'}
                    onChange={(e) => setFormData({ ...formData, workingMinutes: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Total: {formData.workingHours || '0'}h {formData.workingMinutes || '0'}m
              </p>
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