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
import { Play, Pause, Send, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, History } from "lucide-react";
import type { Task, Project } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface StaffTaskListProps {
  tasks: Task[];
  projectId?: number;
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

export function StaffTaskList({ tasks, projectId }: StaffTaskListProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { playAlarmSound } = useNotificationSound();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [localTimers, setLocalTimers] = useState<Record<number, number>>({});
  const alarmTriggeredRef = useRef<Record<number, boolean>>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});
  const [expandedIterations, setExpandedIterations] = useState<Record<number, boolean>>({});
  const [stopGapDialogOpen, setStopGapDialogOpen] = useState(false);
  const [selectedTaskForStopGap, setSelectedTaskForStopGap] = useState<number | null>(null);
  const [stopGapHours, setStopGapHours] = useState("0");
  const [stopGapMinutes, setStopGapMinutes] = useState("0");

  useEffect(() => {
    const handleTaskUpdate = (event: any) => {
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
      const response = await fetch(`/api/tasks/${taskId}/pause-timer`, { method: "POST" });
      if (!response.ok) throw new Error('Failed to pause timer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    }
  });

  const startTimer = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/start-timer`, { method: "POST" });
      if (!response.ok) throw new Error('Failed to start timer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    }
  });

  const submitTask = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/tasks/${taskId}/submit`, { method: "POST" });
      if (!response.ok) throw new Error('Failed to submit task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    }
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (projectId) queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    }
  });

  const applyStopGap = useMutation({
    mutationFn: async ({ taskId, hours, minutes }: { taskId: number; hours: number; minutes: number }) => {
      const response = await fetch("/api/stop-gap/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, hours, minutes }),
      });
      if (!response.ok) throw new Error("Failed to apply stop gap");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stop-gap/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stop-gap/assignments"] });
      setStopGapDialogOpen(false);
    }
  });

  const { data: projectsData } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
  });

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const { data: stopGapAllocation } = useQuery<any>({
    queryKey: ["/api/stop-gap/current"],
    enabled: !!user && (user.role === "staff" || user.role === "intern"),
  });

  const { data: stopGapAssignments = {} } = useQuery({
    queryKey: ["/api/stop-gap/assignments", (tasks || []).map(t => t.id)],
    queryFn: async () => {
      const assignments: Record<number, any> = {};
      for (const task of tasks) {
        const res = await fetch(`/api/stop-gap/task/${task.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) assignments[task.id] = data;
        }
      }
      return assignments;
    },
    enabled: tasks.length > 0,
  });

  const projectMap = projectsData?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {} as Record<number, string>) || {};
  const userMap = allUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<number, string>);

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTimers(prev => {
        const newTimers = { ...prev };
        tasks.forEach(task => {
          if (task.isTimerRunning && task.timerStartTime) {
            const elapsed = Math.floor((Date.now() - new Date(task.timerStartTime).getTime()) / 1000);
            newTimers[task.id] = (task.timeSpent || 0) + elapsed;
          } else {
            newTimers[task.id] = task.timeSpent || 0;
          }
        });
        return newTimers;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tasks]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isTimeOverLimit = (task: Task, currentTime: number) => {
    if (!task.workingHours && !task.workingMinutes) return false;
    const limit = ((task.workingHours || 0) * 3600) + ((task.workingMinutes || 0) * 60);
    return currentTime >= limit;
  };

  const getTimerColor = (task: Task, currentTime: number) => {
    if (isTimeOverLimit(task, currentTime)) return "text-red-600 font-bold";
    return task.isTimerRunning ? "text-blue-600 font-medium" : "text-gray-600";
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const filteredTasks = tasks.filter(t => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => b.id - a.id);
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-4">
      <Input placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="max-w-sm" />
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task & Project</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Assigned By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Timer</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Stop Gap</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.map(task => {
              const currentTime = localTimers[task.id] || task.timeSpent || 0;
              const isOver = isTimeOverLimit(task, currentTime);
              const isMissed = task.deadline && new Date(task.deadline).getTime() < Date.now() && task.status !== "completed" && task.status !== "review";
              return (
                <React.Fragment key={task.id}>
                  <TableRow className={cn(isMissed && "bg-red-50 dark:bg-red-900/20")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.title}</span>
                        {task.iterationNumber && task.iterationNumber > 1 && (
                          <Badge variant="outline" className="text-[10px] px-1 h-4 border-orange-200 text-orange-700 bg-orange-50">v{task.iterationNumber}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{projectMap[task.projectId || 0] || "No Project"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {expandedDescriptions[task.id] ? task.description : (task.description?.substring(0, 100) || "")}
                        {task.description && task.description.length > 100 && (
                          <Button variant="link" className="h-auto p-0 ml-1 text-xs" onClick={() => setExpandedDescriptions(p => ({ ...p, [task.id]: !p[task.id] }))}>
                            {expandedDescriptions[task.id] ? "Less" : "More"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{userMap[task.assignedBy || 0] || "System"}</TableCell>
                    <TableCell>
                      <Select value={task.status || "todo"} onValueChange={s => updateTaskStatus.mutate({ taskId: task.id, status: s })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className={cn("text-sm", getTimerColor(task, currentTime))}>{formatTime(currentTime)}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{task.startDate ? new Date(task.startDate).toLocaleDateString() : "Not set"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "No deadline"}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSelectedTaskForStopGap(task.id); setStopGapDialogOpen(true); }}>Apply</Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {task.iterationNumber && task.iterationNumber > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedIterations(p => ({ ...p, [task.id]: !p[task.id] }))}><History className="h-4 w-4" /></Button>
                        )}
                        {task.isTimerRunning ? (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => pauseTimer.mutate(task.id)}><Pause className="h-3 w-3 mr-1" />Pause</Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-8" onClick={() => startTimer.mutate(task.id)}><Play className="h-3 w-3 mr-1" />Start</Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8" onClick={() => submitTask.mutate(task.id)}><Send className="h-3 w-3 mr-1" />Submit</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedIterations[task.id] && (
                    <TableRow>
                      <TableCell colSpan={9} className="p-0 border-b bg-muted/50">
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

      <Dialog open={stopGapDialogOpen} onOpenChange={setStopGapDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Stop Gap</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label>Hours</Label>
              <Input type="number" value={stopGapHours} onChange={e => setStopGapHours(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label>Minutes</Label>
              <Input type="number" value={stopGapMinutes} onChange={e => setStopGapMinutes(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => applyStopGap.mutate({ taskId: selectedTaskForStopGap!, hours: parseInt(stopGapHours), minutes: parseInt(stopGapMinutes) })}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
