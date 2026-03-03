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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredTasks = isStaffView
    ? (tasks || []).filter((task) => task.assigneeId === (user as any)?.staffId)
    : (tasks || []);

  const sortedTasks = [...filteredTasks].sort((a, b) => b.id - a.id);

  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTasks = sortedTasks.slice(startIndex, startIndex + itemsPerPage);

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

  const formatDescription = (description: string | null | undefined, taskId: number) => {
    if (!description) return "No description";
    const isExpanded = expandedDescriptions[taskId];
    const maxLength = 50;

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
            {paginatedTasks.map((task) => {
              const isDeadlineMissed = !!(task.deadline &&
                new Date(task.deadline).getTime() < Date.now() &&
                task.status !== "completed" &&
                task.status !== "review" &&
                task.status !== "on_hold");

              return (
                <React.Fragment key={task.id}>
                <TableRow className={isDeadlineMissed ? "bg-red-50 dark:bg-red-900/20 text-foreground dark:text-white" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1">
                      {task.title}
                      {(task as any).iterationNumber > 1 && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-300">
                          #{(task as any).iterationNumber}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight italic mt-1">
                      Assigned by: {task.assignedBy ? (userMap[task.assignedBy as number] || "Unknown User") : "System"}
                    </div>
                    {(task as any).iterationNumber > 1 && (
                      <button
                        onClick={() => setExpandedIterations(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                      >
                        <History className="h-3 w-3" />
                        {expandedIterations[task.id] ? "Hide" : "View"} History
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                      {formatDescription((task.description as any) || "", task.id)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge className={getStatusColor(task.status, isDeadlineMissed)}>
                        <div className="text-center leading-tight">
                          {isDeadlineMissed ? (
                            <div className="flex flex-col items-center">
                              <div>Deadline</div>
                              <div>Missed</div>
                            </div>
                          ) : (
                            (task.status?.replace('_', ' ') || 'todo').split(' ').map((word: string, idx: number) => (
                              <div key={idx}>{word}</div>
                            ))
                          )}
                        </div>
                      </Badge>
                      {/* Show pending review time for tasks in review */}
                      {task.status === 'review' && (task as any).reviewStartedAt && (
                        <div className="text-xs text-black dark:text-white font-medium">
                          Pending: {(() => {
                            const reviewStart = new Date((task as any).reviewStartedAt).getTime();
                            const now = Date.now();
                            const diffMs = now - reviewStart;
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
                            return `${diffMins}m`;
                          })()}
                        </div>
                      )}
                      {/* Show total review time for completed tasks */}
                      {task.status === 'completed' && (task as any).reviewStartedAt && (task as any).completedAt && (
                        <div className="text-xs text-black dark:text-white font-medium">
                          Review: {(() => {
                            const reviewStart = new Date((task as any).reviewStartedAt).getTime();
                            const completedAt = new Date((task as any).completedAt).getTime();
                            const diffMs = completedAt - reviewStart;
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            if (diffHours > 0) return `${diffHours}h`;
                            return `${diffMins}m`;
                          })()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm leading-tight">
                      {(() => {
                        const assignee = (task as any).assignee;
                        if (!assignee || !assignee.id) return "Unassigned";
                        const name = assignee.name || "Unassigned";
                        const role = assignee.role === 'team_lead' ? ' (Team Lead)' : '';
                        return (name + role).split(' ').map((word: string, idx: number) => (
                          <div key={idx}>{word}</div>
                        ));
                      })()}
                    </div>
                  </TableCell>
                  {showProjectInfo && (
                    <TableCell>
                      <div className="text-sm leading-tight">
                        {task && task.projectId ? (projectMap[task.projectId] || `Project ID: ${task.projectId}`).split(' ').map((word: string, idx: number) => (
                          <div key={idx}>{word}</div>
                        )) : "No Project"}
                      </div>
                    </TableCell>
                  )}
                  {showProjectInfo && (
                    <TableCell>
                      <div className="space-y-1">
                        <div className={`flex items-center gap-1 ${task.isTimerRunning ? 'text-blue-600 font-medium' : isDeadlineMissed ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          <Clock className="h-4 w-4" />
                          <span className={isDeadlineMissed ? "animate-pulse" : ""}>{formatTime(localTimers[task.id] || task.timeSpent || 0)}</span>
                          {task.isTimerRunning && (
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse ml-1"></div>
                          )}
                        </div>
                        {stopGapAssignments[task.id] && (
                          <div className="text-xs text-blue-600 font-medium">
                            Stop Gap: +{Math.floor((stopGapAssignments[task.id].stopGapHours || 0) / 60)}h {(stopGapAssignments[task.id].stopGapHours || 0) % 60}m
                          </div>
                        )}
                        {isDeadlineMissed && (
                          <div className="text-xs text-red-600 font-medium">
                            Deadline Missed
                          </div>
                        )}
                      </div>
                    </TableCell>
                  )}
                  <TableCell>
                    {task.startDate ? (
                      <div className="text-sm">
                        <div>{new Date(task.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
                        <div className="text-muted-foreground">{new Date(task.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        {/* Show actual start time when work was started */}
                        {(task as any).actualStartTime && (
                          <div className="text-[10px] text-green-600 font-semibold mt-1">
                                                        Started: {task.actualStartTime 
                              ? new Date(task.actualStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : (task.startDate ? new Date(task.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Not started')}
                          </div>
                        )}
                      </div>
                    ) : "Not set"}
                  </TableCell>
                  <TableCell>
                    {task.deadline ? (
                      <div className={`text-sm ${isDeadlineMissed ? "text-red-600 font-bold" : ""}`}>
                        <div>{new Date(task.deadline).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
                        <div className="text-muted-foreground flex flex-col">
                          <span>{new Date(task.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                          {task.status === 'review' && (task as any).reviewStartedAt && (
                            <span className="text-[10px] text-green-600 font-semibold mt-0.5">
                              Ended: {new Date((task as any).reviewStartedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-sm">No deadline</span>
                        {task.status === 'review' && (task as any).reviewStartedAt && (
                          <span className="text-[10px] text-green-600 font-semibold mt-0.5">
                            Ended: {new Date((task as any).reviewStartedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}
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
                        {(task.status === 'review' || task.status === 'completed' || task.status === 'not_approved' || isDeadlineMissed) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reassign Task"
                            className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            onClick={() => handleReassign(task)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (task && task.id) {
                              handleEditClick(task);
                            }
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the task
                                "{task.title}" and remove its data from our servers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => deleteTask.mutate(task.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <span className="text-xs text-muted-foreground mr-2">View Only</span>
                        {(task as any).iterationNumber > 1 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-50 text-orange-700 border-orange-300">
                            Iter #{(task as any).iterationNumber}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                {expandedIterations[task.id] && (
                  <TableRow>
                    <TableCell colSpan={showProjectInfo ? 10 : 8} className="bg-muted/30 p-0">
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
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[800px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTask ? "Edit Task" : "Create New Task"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="space-y-2">
              <Label htmlFor="description">Task Details</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter task details"
                className="min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: TaskFormData["status"]) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="not_approved">Not Approved</SelectItem>
                    <SelectItem value="technical_support">Technical Support</SelectItem>
                    {(user?.role !== "staff" && user?.role !== "intern") && (
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    )}
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
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {(staff ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="pt-4 border-t">
              <Button type="submit" className="w-full md:w-auto md:min-w-[200px]">
                {editTask ? "Update Task" : "Create Task"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isReassignOpen} onOpenChange={setIsReassignOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-600" />
              Reassign Task: {reassignTask?.title}
            </DialogTitle>
          </DialogHeader>
          {reassignTask && (
            <form onSubmit={(e) => { e.preventDefault(); reassignMutation.mutate(reassignData); }} className="space-y-4">
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <div className="font-medium">Current Assignment (will be saved as Iteration #{(reassignTask as any).iterationNumber || 1})</div>
                <div className="text-muted-foreground">
                  Assignee: {(() => { const a = (reassignTask as any).assignee; return a?.name || userMap[reassignTask.assigneeId as number] || "Unassigned"; })()}
                </div>
                <div className="text-muted-foreground">
                  Status: {reassignTask.status?.replace('_', ' ')}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Updated Task Details</Label>
                <Textarea
                  value={reassignData.description}
                  onChange={(e) => setReassignData({ ...reassignData, description: e.target.value })}
                  placeholder="Update task description/details if needed"
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Start Date</Label>
                  <Input
                    type="datetime-local"
                    value={reassignData.startDate}
                    onChange={(e) => setReassignData({ ...reassignData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Deadline</Label>
                  <Input
                    type="datetime-local"
                    value={reassignData.deadline}
                    onChange={(e) => setReassignData({ ...reassignData, deadline: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Working Time Allocation</Label>
                <div className="flex gap-4 max-w-md">
                  <div className="flex-1">
                    <Label className="text-sm text-muted-foreground">Hours</Label>
                    <Input
                      type="number"
                      min="0"
                      value={reassignData.workingHours}
                      onChange={(e) => setReassignData({ ...reassignData, workingHours: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-sm text-muted-foreground">Minutes</Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={reassignData.workingMinutes}
                      onChange={(e) => setReassignData({ ...reassignData, workingMinutes: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex gap-2">
                <Button
                  type="submit"
                  disabled={reassignMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {reassignMutation.isPending ? "Reassigning..." : "Reassign Task"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsReassignOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
