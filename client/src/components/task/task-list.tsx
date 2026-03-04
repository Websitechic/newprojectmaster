import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Pencil, Trash, Plus, Clock, RefreshCw, ChevronDown, ChevronUp, History } from "lucide-react";
import type { Task, Project } from "@db/schema";

interface TaskFormData {
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'review' | 'technical_support' | 'not_approved';
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

function IterationHistory({ taskId, userMap }: { taskId: number; userMap: Record<number, string> }) {
  const { data: iterations, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", taskId, "iterations"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/iterations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch iterations");
      return res.json();
    },
  });

  if (isLoading) return <div className="p-3 text-sm text-muted-foreground">Loading history...</div>;
  if (!iterations || iterations.length === 0) return <div className="p-3 text-sm text-muted-foreground">No previous iterations</div>;

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'not_approved': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'review': return 'bg-yellow-100 text-yellow-800';
      case 'on_hold': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
        <History className="h-3 w-3" /> Iteration History
      </div>
      {iterations.map((iter: any, idx: number) => (
        <div key={iter.id || idx} className="border rounded-md p-3 bg-background text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Iteration #{iter.iterationNumber}</span>
            <Badge className={getStatusBadgeColor(iter.status || 'todo')}>
              {(iter.status || 'todo').replace('_', ' ')}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
            <div>Assignee: <span className="text-foreground">{iter.assigneeName || userMap[iter.assigneeId] || "Unknown"}</span></div>
            <div>Time Spent: <span className="text-foreground">{iter.timeSpent ? `${Math.floor(iter.timeSpent / 3600)}h ${Math.floor((iter.timeSpent % 3600) / 60)}m` : "0m"}</span></div>
            {iter.startDate && <div>Start: <span className="text-foreground">{new Date(iter.startDate).toLocaleDateString()}</span></div>}
            {iter.deadline && <div>Deadline: <span className="text-foreground">{new Date(iter.deadline).toLocaleDateString()}</span></div>}
            {iter.workingHours || iter.workingMinutes ? (
              <div>Allocated: <span className="text-foreground">{iter.workingHours || 0}h {iter.workingMinutes || 0}m</span></div>
            ) : null}
            {iter.completedAt && <div>Ended: <span className="text-foreground">{new Date(iter.completedAt).toLocaleString()}</span></div>}
          </div>
          {iter.notes && (
            <div className="text-xs mt-1 p-2 bg-muted rounded">
              <span className="font-medium">Notes:</span> {iter.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TaskList({ tasks, projectId, isStaffView = false, showNewTaskButton = true, showProjectInfo = false }: TaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>(defaultTask);

  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [reassignData, setReassignData] = useState({
    assigneeId: "",
    startDate: "",
    deadline: "",
    workingHours: "",
    workingMinutes: "0",
    notes: "",
    description: "",
  });
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({});

  const toggleDescription = (taskId: number) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const [localTimers, setLocalTimers] = useState<Record<number, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTimers(prev => {
        const newTimers = { ...prev };
        tasks.forEach(task => {
          if (task.isTimerRunning && task.timerStartTime) {
            const elapsedSinceStart = Math.floor((Date.now() - new Date(task.timerStartTime).getTime()) / 1000);
            newTimers[task.id] = (task.timeSpent || 0) + elapsedSinceStart;
          } else {
            newTimers[task.id] = task.timeSpent || 0;
          }
        });
        return newTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  useEffect(() => {
    const handleTimerEvent = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }
    };

    const handleTaskUpdated = (event: any) => {
      console.log("WebSocket: task_updated received, invalidating queries", event);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }
    };

    window.addEventListener('websocket:task_timer_started', handleTimerEvent);
    window.addEventListener('websocket:task_timer_paused', handleTimerEvent);
    window.addEventListener('websocket:task_timer_update', handleTimerEvent);
    window.addEventListener('websocket:task_created', handleTaskUpdated);
    window.addEventListener('websocket:task_updated', handleTaskUpdated);

    return () => {
      window.removeEventListener('websocket:task_timer_started', handleTimerEvent);
      window.removeEventListener('websocket:task_timer_paused', handleTimerEvent);
      window.removeEventListener('websocket:task_timer_update', handleTimerEvent);
      window.removeEventListener('websocket:task_created', handleTaskUpdated);
      window.removeEventListener('websocket:task_updated', handleTaskUpdated);
    };
  }, [queryClient, projectId]);

  const { data: usersData } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const { data: staff } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    refetchOnWindowFocus: true,
    enabled: !!user,
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    enabled: !!user,
  });

  const allUsers = [...(usersData || []), ...(staff || []), ...(clients || [])];
  const userMap = allUsers.reduce((acc, u) => {
    if (u && u.id) acc[u.id] = u.name;
    return acc;
  }, {} as Record<number, string>);


  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user && showProjectInfo,
  });

  const projectMap = projects?.reduce((acc, project) => {
    acc[project.id] = project.name;
    return acc;
  }, {} as Record<number, string>) || {};

  const { data: stopGapAssignments = {} } = useQuery({
    queryKey: ["/api/stop-gap/assignments", (tasks || []).map(t => t.id)],
    queryFn: async () => {
      const assignments: Record<number, any> = {};
      for (const task of (tasks || [])) {
        if (!task || !task.id) continue;
        const res = await fetch(`/api/stop-gap/task/${task.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            assignments[task.id] = data;
          }
        }
      }
      return assignments;
    },
    enabled: Array.isArray(tasks) && tasks.length > 0,
  });

  const handleEditClick = (task: Task) => {
    setEditTask(task);

    const formatToLocalDateTime = (date: Date | null) => {
      if (!date) return "";
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setFormData({
      title: task.title,
      description: task.description || "",
      status: task.status as TaskFormData["status"] || "todo",
      assigneeId: task.assigneeId?.toString() || "",
      startDate: formatToLocalDateTime(task.startDate),
      deadline: formatToLocalDateTime(task.deadline),
      workingHours: task.workingHours?.toString() || "",
      workingMinutes: task.workingMinutes?.toString() || "0",
    });
    setIsDialogOpen(true);
  };

  const handleNewTask = () => {
    setEditTask(null);
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
      // Invalidate queries to ensure real-time update
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }

      // Prepend for immediate visibility
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        const tasks = Array.isArray(oldTasks) ? oldTasks : [];
        if (tasks.some(t => t.id === newTask.id)) return tasks;
        return [newTask, ...tasks];
      });

      if (projectId) {
        queryClient.setQueryData([`/api/projects/${projectId}/tasks`], (oldTasks: Task[] | undefined) => {
          const tasks = Array.isArray(oldTasks) ? oldTasks : [];
          if (tasks.some(t => t.id === newTask.id)) return tasks;
          return [newTask, ...tasks];
        });
      }

      // Force UI update by resetting pagination
      setCurrentPage(1);

      setIsDialogOpen(false);
      setFormData(defaultTask);
      
      // Notify other clients about the new task via WebSocket
      // We'll use the centralized websocket handling if available
      const ws = (window as any).socket;
      if (ws && ws.readyState === 1) { // 1 is WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'task_created',
          task: newTask
        }));
      }

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

      if ((data.status === 'review' || data.status === 'completed' || data.status === 'technical_support' || data.status === 'on_hold') &&
          editTask.isTimerRunning) {
        try {
          await fetch(`/api/tasks/${editTask.id}/pause-timer`, {
            method: "POST",
            credentials: 'include',
          });
        } catch (error) {
          console.error("Failed to auto-pause timer:", error);
        }
      }

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
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [updatedTask];
        return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
      });

      if (projectId) {
        queryClient.setQueryData(["/api/projects", projectId, "tasks"], (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return [updatedTask];
          return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }

      // Notify other clients about the task update via WebSocket
      const ws = (window as any).socket;
      if (ws && ws.readyState === 1) { // 1 is WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'task_update', // Changed from task_updated to match server expectation
          taskId: updatedTask.id,
          status: updatedTask.status,
          task: updatedTask
        }));
      }

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

  const reassignMutation = useMutation({
    mutationFn: async (data: typeof reassignData) => {
      if (!reassignTask) throw new Error("No task selected for reassignment");
      const response = await fetch(`/api/tasks/${reassignTask.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assigneeId: reassignTask.assigneeId,
          startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
          deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
          workingHours: data.workingHours ? parseInt(data.workingHours) : null,
          workingMinutes: data.workingMinutes ? parseInt(data.workingMinutes) : null,
          description: data.description || undefined,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to reassign task");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }
      if (reassignTask) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", reassignTask.id, "iterations"] });
      }
      setIsReassignOpen(false);
      setReassignTask(null);
      toast({ title: "Success", description: "Task reassigned successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleReassign = (task: Task) => {
    setReassignTask(task);
    setReassignData({
      assigneeId: "",
      startDate: "",
      deadline: "",
      workingHours: "",
      workingMinutes: "0",
      notes: "",
      description: task.description || "",
    });
    setIsReassignOpen(true);
  };

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

  const TaskForm = ({ onSuccess, onCancel }: { onSuccess: () => void, onCancel: () => void }) => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: any) => setFormData({ ...formData, status: value })}
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
              <SelectItem value="not_approved">Not Approved</SelectItem>
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
              {allUsers.map((u) => (
                <SelectItem key={u.id} value={u.id.toString()}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="workingHours">Working Hours</Label>
          <Input
            id="workingHours"
            type="number"
            value={formData.workingHours}
            onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workingMinutes">Working Minutes</Label>
          <Input
            id="workingMinutes"
            type="number"
            value={formData.workingMinutes}
            onChange={(e) => setFormData({ ...formData, workingMinutes: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={createTask.isPending || updateTask.isPending}>
          {editTask ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </form>
  );

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredTasks = isStaffView
    ? (tasks || []).filter((task) => task.assigneeId === (user as any)?.staffId)
    : (tasks || []);

  const sortedTasks = [...filteredTasks].sort((a, b) => b.id - a.id);

  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTasks = sortedTasks.slice(startIndex, startIndex + itemsPerPage);

  const formatDescription = (description: string, taskId: number) => {
    if (!description) return <span className="italic text-slate-400">No description provided</span>;

    const isExpanded = expandedDescriptions[taskId];
    const shouldTruncate = description.length > 100;

    return (
      <div className="space-y-1">
        <div className={`text-sm text-slate-600 leading-relaxed ${!isExpanded && shouldTruncate ? "line-clamp-2" : ""}`}>
          {description}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => toggleDescription(taskId)}
            className="text-blue-600 hover:text-blue-800 text-xs font-semibold transition-colors mt-1"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    );
  };

  const getStatusBadgeColor = (status: string | null, isDeadlineMissed: boolean = false) => {
    if (isDeadlineMissed) return 'bg-red-100 text-red-700 border-red-200';
    switch (status) {
      case 'todo': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'review': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'technical_support': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'not_approved': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'on_hold': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusColor = (status: string | null, isDeadlineMissed: boolean = false) => {
    if (status === 'on_hold') return 'bg-orange-100 text-orange-800';
    if (isDeadlineMissed) return 'bg-red-600 text-white font-bold';
    if (!status) return 'bg-gray-100 text-gray-800';
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'review': return 'bg-yellow-100 text-yellow-800';
      case 'technical_support': return 'bg-red-100 text-red-800';
      case 'not_approved': return 'bg-purple-100 text-purple-800';
      case 'on_hold': return 'bg-orange-100 text-orange-800';
      case 'pending': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {!isStaffView && (
        <div className="space-y-4 mb-4">
          <div className="flex flex-col gap-4">
            { !isStaffView && showNewTaskButton && (user?.role === "project_manager" || user?.role === "operations_manager" || (user as any)?.specialization === "operations_manager" || user?.role === "customer_support_officer" || user?.role === "team_lead" || (user?.role === "staff" && user?.specialization === "technical_support")) && (
              <Button onClick={handleNewTask} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            )}

            {projectId && staff && staff.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center text-sm border rounded-lg p-3 bg-muted/30 w-full">
                <span className="font-semibold mr-2 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Staff Break Times:
                </span>
                {staff.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="bg-background">
                    <span className="font-medium mr-1">{s.name}:</span>
                    <span className="text-muted-foreground">{s.breakOneTime || "Not set"}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="rounded-md border overflow-x-auto">
        <div className="min-w-[800px]">
          <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[200px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Task & Assignee</TableHead>
              <TableHead className="w-[280px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Description</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Status</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Assignee</TableHead>
              {showProjectInfo && (
                <TableHead className="w-[180px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Project</TableHead>
              )}
              {showProjectInfo && (
                <TableHead className="w-[180px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Time Spent</TableHead>
              )}
              <TableHead className="w-[140px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Start Date</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Deadline</TableHead>
              <TableHead className="w-[140px] font-bold text-slate-900 uppercase text-[11px] tracking-wider">Allocated</TableHead>
              <TableHead className="text-right font-bold text-slate-900 uppercase text-[11px] tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.map((task) => {
              const isDeadlineMissed = !!(task.deadline &&
                new Date(task.deadline).getTime() < Date.now() &&
                task.status !== "completed" &&
                task.status !== "review" &&
                task.status !== "on_hold");

              return (
                <React.Fragment key={task.id}>
                <TableRow className={`${isDeadlineMissed ? "bg-red-50/50" : ""} hover:bg-slate-50/50 transition-colors border-b`}>
                  <TableCell className="py-4 align-top w-[200px]">
                    <div className="flex items-center gap-1">
                      <div className="font-bold text-slate-900 text-sm leading-tight">{task.title}</div>
                      {(task as any).iterationNumber > 1 && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-300">
                          #{(task as any).iterationNumber}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-1">
                      Assigned by: {task.assignedBy ? (userMap[task.assignedBy as number] || "Unknown") : "System"}
                    </div>
                    {(task as any).iterationNumber > 1 && (
                      <button
                        onClick={() => setExpandedIterations(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5 font-semibold"
                      >
                        <History className="h-3 w-3" />
                        {expandedIterations[task.id] ? "Hide" : "View"} History
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="py-4 align-top w-[280px]">
                    {formatDescription((task.description as any) || "", task.id)}
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <Badge 
                      variant="outline" 
                      className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeColor(task.status, isDeadlineMissed)}`}
                    >
                      {(task.status || 'todo').replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-sm font-medium text-slate-700 leading-tight">
                      {(() => {
                        const assignee = (task as any).assignee;
                        if (!assignee || !assignee.id) return "Unassigned";
                        return assignee.name || "Unassigned";
                      })()}
                    </div>
                  </TableCell>
                  {showProjectInfo && (
                    <TableCell className="py-4 align-top w-[180px]">
                      <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                        {task && task.projectId ? (projectMap[task.projectId] || `Project: ${task.projectId}`) : "General"}
                      </div>
                    </TableCell>
                  )}
                  {showProjectInfo && (
                    <TableCell className="py-4 align-top w-[180px]">
                      <div className="space-y-1">
                        <div className={`text-sm font-mono ${task.isTimerRunning ? 'text-blue-600 font-bold' : isDeadlineMissed ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                          {formatTime(localTimers[task.id] || task.timeSpent || 0)}
                        </div>
                        {stopGapAssignments[task.id] && (
                          <div className="text-[10px] text-blue-600 font-bold uppercase">
                            Stop Gap: +{Math.floor((stopGapAssignments[task.id].stopGapHours || 0) / 60)}h {(stopGapAssignments[task.id].stopGapHours || 0) % 60}m
                          </div>
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-[11px] leading-tight font-medium">
                      <div className="text-slate-900">{task.startDate ? new Date(task.startDate).toLocaleDateString() : "-"}</div>
                      <div className="text-green-600 font-bold">{task.startDate ? new Date(task.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-[11px] leading-tight font-medium">
                      <div className={`text-slate-900 ${isDeadlineMissed ? "text-red-600 font-bold" : ""}`}>{task.deadline ? new Date(task.deadline).toLocaleDateString() : "-"}</div>
                      <div className={`${isDeadlineMissed ? "text-red-600 font-bold" : "text-slate-500"}`}>{task.deadline ? new Date(task.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-[11px] font-bold text-slate-700">
                      {task.workingHours || task.workingMinutes ? `${task.workingHours || 0}h ${task.workingMinutes || 0}m` : "-"}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => handleEditClick(task)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => handleReassign(task)}
                        title="Reassign Task"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the task.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTask.mutate(task.id)}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedIterations[task.id] && (
                  <TableRow>
                    <TableCell colSpan={showProjectInfo ? 10 : 8} className="p-0 bg-slate-50/30 border-b">
                      <IterationHistory taskId={task.id} userMap={userMap} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-4">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredTasks.length)} of {filteredTasks.length} tasks
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-8 h-8 p-0"
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <TaskForm
            onSuccess={() => setIsDialogOpen(false)}
            onCancel={() => setIsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TaskList;
