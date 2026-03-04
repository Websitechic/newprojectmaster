import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Pause, Send, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import type { Task, Project } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

interface StaffTaskListProps {
  tasks: Task[];
  projectId?: number;
}

export function StaffTaskList({ tasks, projectId }: StaffTaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { playAlarmSound } = useNotificationSound();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [localTimers, setLocalTimers] = useState<Record<number, number>>({});
  const alarmTriggeredRef = useRef<Record<number, boolean>>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});
  const [stopGapDialogOpen, setStopGapDialogOpen] = useState(false);
  const [selectedTaskForStopGap, setSelectedTaskForStopGap] = useState<number | null>(null);
  const [stopGapHours, setStopGapHours] = useState("0");
  const [stopGapMinutes, setStopGapMinutes] = useState("0");

  useEffect(() => {
    const handleTaskUpdate = (event: any) => {
      console.log("WebSocket update received in StaffTaskList:", event);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      }
    };

    window.addEventListener('websocket:task_created', handleTaskUpdate);
    window.addEventListener('websocket:task_updated', handleTaskUpdate);
    window.addEventListener('websocket:task_deleted', handleTaskUpdate);

    return () => {
      window.removeEventListener('websocket:task_created', handleTaskUpdate);
      window.removeEventListener('websocket:task_updated', handleTaskUpdate);
      window.removeEventListener('websocket:task_deleted', handleTaskUpdate);
    };
  }, [queryClient, projectId]);

  const pauseTimer = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/pause-timer`, {
        method: "POST",
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to pause timer');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Timer Paused",
        description: "Task timer has been paused",
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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredTasks = tasks
    .filter((task) => {
      // Apply search filter
      if (typeof searchQuery === 'string' && searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = (task.title || "").toLowerCase().includes(query);
        const matchesDescription = (task.description || "").toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription) return false;
      }
      return true;
    })
    .sort((a, b) => b.id - a.id);

  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTasks = filteredTasks.slice(startIndex, startIndex + itemsPerPage);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects").then(res => {
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    }),
    enabled: !!user,
  });

  const { data: stopGapAllocation } = useQuery<any>({
    queryKey: ["/api/stop-gap/current"],
    enabled: !!user && (user.role === "staff" || user.role === "intern"),
    refetchInterval: 10000,
  });

  const { data: stopGapAssignments = {} } = useQuery({
    queryKey: ["/api/stop-gap/assignments", (filteredTasks || []).map(t => t.id)],
    queryFn: async () => {
      const assignments: Record<number, any> = {};
      for (const task of (filteredTasks || [])) {
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
    enabled: Array.isArray(filteredTasks) && filteredTasks.length > 0,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: !!user,
  });

  const projectMap = projects?.reduce((acc, project) => {
    acc[project.id] = project.name;
    return acc;
  }, {} as Record<number, string>) || {};

  useEffect(() => {
    const interval = setInterval(() => {
      tasks.forEach(task => {
        const isDeadlineMissed = task.deadline &&
          new Date(task.deadline).getTime() < Date.now() &&
          task.status !== "completed" &&
          task.status !== "review" &&
          task.status !== "on_hold";

        if (isDeadlineMissed && task.isTimerRunning) {
          pauseTimer.mutate(task.id);
        }

        // Check for 10-minute deadline warning
        if (task.deadline && task.status !== "completed" && task.status !== "review") {
          const deadlineTime = new Date(task.deadline).getTime();
          const timeUntilDeadline = deadlineTime - Date.now();
          const tenMinutesInMs = 10 * 60 * 1000;

          if (timeUntilDeadline > 0 && timeUntilDeadline <= tenMinutesInMs && !alarmTriggeredRef.current[task.id]) {
            console.log(`🚨 Deadline alarm triggered for task: ${task.title}`);
            playAlarmSound();
            alarmTriggeredRef.current[task.id] = true;
            toast({
              title: "DEADLINE APPROACHING",
              description: `Task "${task.title}" is due in less than 10 minutes!`,
              variant: "destructive",
            });
          }
        }
      });

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
  }, [tasks, pauseTimer]);

  const startTimer = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/start-timer`, {
        method: "POST",
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start timer');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Timer Started",
        description: "Task timer has been started",
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

  const submitTask = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit task');
      }
      return response.json();
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [updatedTask];
        return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
      });

      if (projectId) {
        queryClient.setQueryData([`/api/projects/${projectId}/tasks`], (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return [updatedTask];
          return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
        });
      }

      toast({
        title: "Task Submitted",
        description: "Task has been submitted for review",
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

  const applyStopGap = useMutation({
    mutationFn: async ({ taskId, hours, minutes }: { taskId: number; hours: number; minutes: number }) => {
      const response = await fetch("/api/stop-gap/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId, hours, minutes }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to apply stop gap");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stop-gap/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stop-gap/assignments"] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      }
      setStopGapDialogOpen(false);
      setStopGapHours("0");
      setStopGapMinutes("0");
      toast({
        title: "Stop Gap Applied",
        description: "Stop gap time has been added to the task",
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

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.isTimerRunning &&
          (status === 'review' || status === 'completed' || status === 'technical_support')) {
        try {
          await fetch(`/api/tasks/${taskId}/pause-timer`, {
            method: "POST",
            credentials: 'include',
          });
        } catch (error) {
          console.error("Failed to auto-pause timer:", error);
        }
      }

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update task status');
      }
      return response.json();
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      }

      const previousTasks = queryClient.getQueryData(["/api/tasks"]);
      const previousProjectTasks = projectId ? queryClient.getQueryData([`/api/projects/${projectId}/tasks`]) : null;

      queryClient.setQueryData(["/api/tasks"], (old: Task[] | undefined) => {
        if (!old) return old;
        return old.map(task =>
          task.id === taskId ? { ...task, status: status as any } : task
        );
      });

      if (projectId) {
        queryClient.setQueryData([`/api/projects/${projectId}/tasks`], (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map(task =>
            task.id === taskId ? { ...task, status: status as any } : task
          );
        });
      }

      return { previousTasks, previousProjectTasks };
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) => {
        if (!oldTasks) return [updatedTask];
        return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
      });

      if (projectId) {
        queryClient.setQueryData([`/api/projects/${projectId}/tasks`], (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return [updatedTask];
          return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
        });
      }

      toast({
        title: "Status Updated",
        description: "Task status has been updated",
      });
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["/api/tasks"], context.previousTasks);
      }
      if (context?.previousProjectTasks && projectId) {
        queryClient.setQueryData([`/api/projects/${projectId}/tasks`], context.previousProjectTasks);
      }

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

  const isTimeOverLimit = (task: Task, currentTime: number) => {
    if (!task.workingHours && !task.workingMinutes) return false;
    const hours = task.workingHours || 0;
    const minutes = task.workingMinutes || 0;
    const limitInSeconds = (hours * 3600) + (minutes * 60);
    return currentTime >= limitInSeconds;
  };

  const getTimerColor = (task: Task, currentTime: number) => {
    if (isTimeOverLimit(task, currentTime)) {
      return "text-red-600 font-bold";
    }
    return task.isTimerRunning ? "text-blue-600 font-medium" : "text-gray-600";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
          <svg
            className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            fill="none"
            height="24"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <div className="min-w-[800px]">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Task & Project</TableHead>
              <TableHead className="w-[280px]">Description</TableHead>
              <TableHead className="w-[140px]">Assigned By</TableHead>
              <TableHead className="w-[180px]">Status</TableHead>
              <TableHead className="w-[180px]">Timer</TableHead>
              <TableHead className="w-[140px]">Start Date</TableHead>
              <TableHead className="w-[140px]">Deadline</TableHead>
              <TableHead className="w-[200px]">Stop Gap</TableHead>
              <TableHead className="text-right w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.map((task) => {
              const currentTime = localTimers[task.id] || task.timeSpent || 0;
              const timeOverLimit = isTimeOverLimit(task, currentTime);
              const isDeadlineMissed = task.deadline &&
                new Date(task.deadline).getTime() < Date.now() &&
                task.status !== "completed" &&
                task.status !== "review" &&
                task.status !== "on_hold";

              const isExpanded = expandedDescriptions[task.id] || false;
              const description = task.description || "No description";
              const isLongDescription = description.length > 100;

              return (
                <TableRow key={task.id} className={isDeadlineMissed ? "bg-red-50 dark:bg-red-900/20 text-foreground dark:text-white" : ""}>
                  <TableCell className="py-4 align-top w-[200px]">
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900 text-sm leading-tight">{task.title}</div>
                      <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                        {task.projectId ? (projectMap[task.projectId] || `Project: ${task.projectId}`) : "General"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[280px]">
                    <div className="space-y-1">
                      <div className={`text-sm text-slate-600 leading-relaxed ${!isExpanded ? "line-clamp-2" : ""}`}>
                        {description || <span className="italic text-slate-400">No description provided</span>}
                      </div>
                      {description.length > 60 && (
                        <button
                          onClick={() => setExpandedDescriptions(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                          className="text-blue-600 hover:text-blue-800 text-xs font-semibold transition-colors mt-1"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-sm font-medium text-slate-700 leading-tight">
                      {task.assignedBy
                        ? (allUsers?.find(u => u.id === task.assignedBy)?.name || "Unknown")
                        : "System"}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[180px]">
                    <Badge 
                      variant="outline" 
                      className={`uppercase text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isDeadlineMissed 
                        ? "bg-red-100 text-red-700 border-red-200" 
                        : (task.status === 'in_progress' ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600 border-slate-200")
                      }`}
                    >
                      {(task.status || 'todo').replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[180px]">
                    <div className="space-y-2">
                      <div className={`text-lg font-mono tracking-tight ${getTimerColor(task, currentTime)}`}>
                        {formatTime(currentTime)}
                      </div>
                      <div className="flex gap-1">
                        {task.isTimerRunning ? (
                          <Button size="sm" variant="outline" className="h-7 px-2 border-slate-200" onClick={() => pauseTimer.mutate(task.id)}>
                            <Pause className="h-3 w-3 mr-1" /> Pause
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 px-2 border-slate-200" onClick={() => startTimer.mutate(task.id)}>
                            <Play className="h-3 w-3 mr-1" /> Start
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-[11px] leading-tight font-medium">
                      <div className="text-slate-400 uppercase mb-0.5 text-[9px] tracking-tight">Start Date</div>
                      <div className="text-slate-900">{task.startDate ? new Date(task.startDate).toLocaleDateString() : "-"}</div>
                      <div className="text-green-600 font-bold">{task.startDate ? new Date(task.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[140px]">
                    <div className="text-[11px] leading-tight font-medium">
                      <div className="text-slate-400 uppercase mb-0.5 text-[9px] tracking-tight">Deadline</div>
                      <div className={`text-slate-900 ${isDeadlineMissed ? "text-red-600 font-bold" : ""}`}>{task.deadline ? new Date(task.deadline).toLocaleDateString() : "-"}</div>
                      <div className={`${isDeadlineMissed ? "text-red-600 font-bold" : "text-slate-500"}`}>{task.deadline ? new Date(task.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top w-[200px]">
                    {task.status === "completed" ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px] font-bold uppercase px-2 py-0.5 border-green-200 w-full justify-center rounded-full">
                        Completed
                      </Badge>
                    ) : stopGapAssignments[task.id] ? (
                      <div className="space-y-1">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] font-bold uppercase px-2 py-0.5 border-blue-200 w-full justify-center rounded-full">
                          +{Math.floor((stopGapAssignments[task.id].stopGapHours || 0) / 60)}h {(stopGapAssignments[task.id].stopGapHours || 0) % 60}m
                        </Badge>
                      </div>
                    ) : stopGapAllocation && stopGapAllocation.remainingHours === 0 ? (
                      <span className="text-[10px] text-slate-400 uppercase font-medium">No hours left</span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] font-bold uppercase w-full border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          setSelectedTaskForStopGap(task.id);
                          setStopGapDialogOpen(true);
                        }}
                      >
                        Add Stop Gap
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="py-4 align-top text-right w-[200px]">
                    <div className="flex justify-end gap-1">
                      {task.status !== 'completed' && task.status !== 'review' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => submitTask.mutate(task.id)}
                          disabled={submitTask.isPending}
                          className="h-7 text-[10px] font-bold uppercase bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Submit
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
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

      <Dialog open={stopGapDialogOpen} onOpenChange={setStopGapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Stop Gap Hours</DialogTitle>
            <DialogDescription>
              Add extra working hours to this task.
              {stopGapAllocation && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-blue-700 text-sm">
                  Remaining stop gap: {Math.floor(stopGapAllocation.remainingHours / 60)}h {stopGapAllocation.remainingHours % 60}m
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hours" className="text-right">Hours</Label>
              <Input
                id="hours"
                type="number"
                value={stopGapHours}
                onChange={(e) => setStopGapHours(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="minutes" className="text-right">Minutes</Label>
              <Input
                id="minutes"
                type="number"
                value={stopGapMinutes}
                onChange={(e) => setStopGapMinutes(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedTaskForStopGap) {
                  applyStopGap.mutate({
                    taskId: selectedTaskForStopGap,
                    hours: parseInt(stopGapHours) || 0,
                    minutes: parseInt(stopGapMinutes) || 0,
                  });
                }
              }}
              disabled={applyStopGap.isPending || (parseInt(stopGapHours) === 0 && parseInt(stopGapMinutes) === 0)}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
