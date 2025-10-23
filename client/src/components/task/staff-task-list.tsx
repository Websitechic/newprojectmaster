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
import { Play, Pause, Send, Clock, ChevronDown, ChevronUp } from "lucide-react";
import type { Task, Project } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface StaffTaskListProps {
  tasks: Task[];
  projectId?: number;
}

export function StaffTaskList({ tasks, projectId }: StaffTaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localTimers, setLocalTimers] = useState<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  // Get all projects to display project names for each task
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects").then(res => {
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    }),
    enabled: !!user,
  });

  // Get all users to display who assigned each task
  const { data: allUsers } = useQuery<{ id: number; name: string; email: string }[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users").then(res => {
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }),
    enabled: !!user,
  });

  // Create a map of project IDs to project names
  const projectMap = projects?.reduce((acc, project) => {
    acc[project.id] = project.name;
    return acc;
  }, {} as Record<number, string>) || {};

  // Filter tasks to show only those assigned to the current staff member
  // Sort by ID to maintain consistent positioning regardless of timer state
  const filteredTasks = tasks
    .filter((task) => task.assigneeId === user?.id)
    .filter(task => task.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.id - b.id);

  // Debug: Check if we have all projects for the tasks
  const missingProjects = filteredTasks.filter(task => !projectMap[task.projectId]);
  if (missingProjects.length > 0) {
    console.warn('Tasks with missing project data:', missingProjects.map(t => ({ taskId: t.id, projectId: t.projectId })));
  }

  // Update local timers every second for running tasks
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
      // Optimistically update the cache
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

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
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
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      if (projectId) {
        await queryClient.cancelQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      }

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(["/api/tasks"]);
      const previousProjectTasks = projectId ? queryClient.getQueryData([`/api/projects/${projectId}/tasks`]) : null;

      // Optimistically update to the new value
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

      // Return a context object with the snapshotted value
      return { previousTasks, previousProjectTasks };
    },
    onSuccess: (updatedTask) => {
      // Update with the actual server data
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
    onError: (error: Error, variables, context) => {
      // If the mutation fails, use the context to roll back
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

  // Removed WebSocket listeners to prevent infinite re-render loop
  // Optimistic updates in mutations handle immediate UI updates

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

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Task & Project</TableHead>
              <TableHead className="min-w-[250px]">Description</TableHead>
              <TableHead className="min-w-[130px]">Assigned By</TableHead>
              <TableHead className="min-w-[160px]">Status</TableHead>
              <TableHead className="min-w-[150px]">Timer</TableHead>
              <TableHead className="min-w-[120px]">Deadline</TableHead>
              <TableHead className="text-right min-w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => {
              const currentTime = localTimers[task.id] || task.timeSpent || 0;
              const timeOverLimit = isTimeOverLimit(task, currentTime);

              const isExpanded = expandedDescriptions[task.id] || false;
              const description = task.description || "No description";
              const isLongDescription = description.length > 100;

              return (
                <TableRow key={task.id}>
                  <TableCell className="min-w-[180px]">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {projectMap[task.projectId] || `Project ID: ${task.projectId}`}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[250px]">
                    <div className="space-y-1">
                      <div className="text-sm text-gray-700">
                        {isLongDescription && !isExpanded
                          ? `${description.substring(0, 100)}...`
                          : description
                        }
                      </div>
                      {isLongDescription && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedDescriptions(prev => ({
                            ...prev,
                            [task.id]: !prev[task.id]
                          }))}
                          className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Show more
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[130px]">
                    <div className="text-sm leading-tight">
                      {task.assignedBy
                        ? (allUsers?.find(u => u.id === task.assignedBy)?.name || "Unknown").split(' ').map((word, idx) => (
                            <div key={idx}>{word}</div>
                          ))
                        : "Not specified"}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <Select
                      value={task.status || 'todo'}
                      onValueChange={(status) => {
                        if (status === 'technical_support' && task.isTimerRunning) {
                          pauseTimer.mutate(task.id);
                        }
                        // Auto-start timer when manually changing to in_progress
                        if (status === 'in_progress' && !task.isTimerRunning) {
                          startTimer.mutate(task.id);
                        }
                        updateTaskStatus.mutate({ taskId: task.id, status });
                      }}
                      disabled={updateTaskStatus.isPending || pauseTimer.isPending || startTimer.isPending}
                    >
                      <SelectTrigger className="w-full h-7 text-[11px] px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="technical_support">Technical Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="min-w-[150px]">
                    <div className="space-y-1">
                      <div className={`flex items-center gap-1 text-sm ${getTimerColor(task, currentTime)}`}>
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className={timeOverLimit ? "animate-pulse font-semibold" : ""}>
                          {formatTime(currentTime)}
                        </span>
                        {task.isTimerRunning && (
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {task.workingHours || task.workingMinutes ? (() => {
                          const hours = task.workingHours || 0;
                          const minutes = task.workingMinutes || 0;
                          if (hours > 0 && minutes > 0) return `${hours}hr ${minutes}mins`;
                          if (hours > 0) return `${hours}hr`;
                          if (minutes > 0) return `${minutes}mins`;
                          return "Not set";
                        })() : "Not set"}
                      </div>
                      {timeOverLimit && (
                        <div className="text-xs text-red-600 font-medium">
                          Over limit!
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    {task.deadline ? (
                      <div className="text-xs whitespace-nowrap">
                        <div>{new Date(task.deadline).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</div>
                        <div className="text-muted-foreground">{new Date(task.deadline).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ) : <span className="text-muted-foreground text-xs">None</span>}
                  </TableCell>
                  <TableCell className="text-right min-w-[200px]">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {task.status !== 'review' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => task.isTimerRunning
                              ? pauseTimer.mutate(task.id)
                              : startTimer.mutate(task.id)
                            }
                            disabled={startTimer.isPending || pauseTimer.isPending}
                            className="h-8 whitespace-nowrap"
                          >
                            {task.isTimerRunning ? (
                              <>
                                <Pause className="h-3.5 w-3.5 mr-1" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Start
                              </>
                            )}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => submitTask.mutate(task.id)}
                            disabled={!task.hasBeenStarted || submitTask.isPending}
                            className="h-8 whitespace-nowrap"
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Submit
                          </Button>
                        </>
                      )}
                      {task.status === 'review' && (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200 whitespace-nowrap">
                          Under Review
                        </Badge>
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
  );
}