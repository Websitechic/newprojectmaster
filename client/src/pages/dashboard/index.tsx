import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MeetingAlert } from "@/components/dashboard/meeting-alert";
import { BookingAlert } from "@/components/booking/booking-alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectCard } from "@/components/project/project-card";
import { TaskList } from "@/components/task/task-list";
import { StaffTaskList } from "@/components/task/staff-task-list";
import { ChatWindow } from "@/components/chat/chat-window";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Search,
  CheckSquare,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Project, Task } from "@db/schema";
import { StopGapCard } from "@/components/dashboard/stop-gap-card";

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { updateStatus, sendMessage } = useWebSocket(user?.id);
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    inProgress: false,
    pending: false,
    review: false,
    todo: false, // Added state for todo section
  });

  // State for managing expanded descriptions
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  const toggleDescription = (taskId: number) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleProjectClick = (projectId: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log("Navigating to project:", projectId);
    setLocation(`/dashboard/projects/${projectId}`);
  };

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Fetch staff data for assignee names
  const { data: staff, isLoading: staffLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/staff"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Alias for compatibility - always ensure it's an array
  const allUsers = staff || [];

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Fetch recent project activity (messages and resources from last 24 hours)
  const { data: projectActivity } = useQuery<Record<number, { hasMessages: boolean; hasResources: boolean; latestActivity: string }>>({
    queryKey: ["/api/projects/recent-activity"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  // Function to handle task status changes, including auto-pausing timer
  const handleTaskStatusChange = async (taskId: number, newStatus: string, projectId?: number) => {
    const statusToPauseTimer = ["review", "completed", "technical_support"];
    let taskToUpdate = (tasks ?? []).find(task => task?.id === taskId);

    if (!taskToUpdate) return;

    const originalStatus = taskToUpdate.status;
    const originalIsTimerRunning = taskToUpdate.isTimerRunning;

    // Optimistically update UI
    queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) =>
      oldTasks?.map(task =>
        task.id === taskId ? { ...task, status: newStatus, isTimerRunning: statusToPauseTimer.includes(newStatus) ? false : task.isTimerRunning } : task
      )
    );

    try {
      // Send update to backend
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus, isTimerRunning: statusToPauseTimer.includes(newStatus) }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task status");
      }

      // Invalidate queries to refetch data from the server
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/recent-activity"] });

      // If the status change should pause the timer and it was running, send a WebSocket message
      if (statusToPauseTimer.includes(newStatus) && originalIsTimerRunning) {
        sendMessage({
          type: "TASK_TIMER_PAUSED",
          payload: { taskId: taskId, projectId: projectId, userId: user?.id },
        });
      }
    } catch (error) {
      console.error("Error updating task status:", error);
      // Revert optimistic update if error occurs
      queryClient.setQueryData(["/api/tasks"], (oldTasks: Task[] | undefined) =>
        (oldTasks ?? []).map(task =>
          task?.id === taskId ? { ...(tasks ?? []).find(t => t?.id === taskId), status: originalStatus, isTimerRunning: originalIsTimerRunning } : task
        )
      );
    }
  };

  // Listen for real-time updates via WebSocket
  useEffect(() => {
    const handleTaskUpdate = () => {
      console.log('Task update event received, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/recent-activity"] });
    };

    const handleProjectMessage = () => {
      console.log('Project message event received, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/recent-activity"] });
    };

    const handleTimerEvent = () => {
      console.log('Timer event received, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/recent-activity"] });
    };

    const handleResourceUpdate = () => {
      console.log('Resource update event received, invalidating queries');
      queryClient.invalidateQueries({ queryKey: ["/api/projects/recent-activity"] });
    };

    // Handle direct message notification sound
    const handleDirectMessage = () => {
      console.log('Direct message event received');
      // Check if the notification sound is enabled for the user
      const notificationsEnabled = localStorage.getItem('enableNotificationSound') === 'true';
      if (notificationsEnabled) {
        const audio = new Audio('/path/to/notification_sound.wav'); // Replace with the actual path to your sound file
        audio.play().catch(e => console.error("Audio playback failed:", e));
      }
    };


    window.addEventListener('websocket:task_update', handleTaskUpdate);
    window.addEventListener('websocket:task_created', handleTaskUpdate);
    window.addEventListener('websocket:task_deleted', handleTaskUpdate);
    window.addEventListener('websocket:task_updated', handleTaskUpdate);
    window.addEventListener('websocket:project_message', handleProjectMessage);
    window.addEventListener('websocket:task_timer_started', handleTimerEvent);
    window.addEventListener('websocket:task_timer_paused', handleTimerEvent);
    window.addEventListener('websocket:task_timer_update', handleTimerEvent);
    window.addEventListener('websocket:resource_added', handleResourceUpdate);
    window.addEventListener('websocket:direct_message', handleDirectMessage); // Listen for direct message event

    return () => {
      window.removeEventListener('websocket:task_update', handleTaskUpdate);
      window.removeEventListener('websocket:task_created', handleTaskUpdate);
      window.removeEventListener('websocket:task_deleted', handleTaskUpdate);
      window.removeEventListener('websocket:task_updated', handleTaskUpdate);
      window.removeEventListener('websocket:project_message', handleProjectMessage);
      window.removeEventListener('websocket:task_timer_started', handleTimerEvent);
      window.removeEventListener('websocket:task_timer_paused', handleTimerEvent);
      window.removeEventListener('websocket:task_timer_update', handleTimerEvent);
      window.removeEventListener('websocket:resource_added', handleResourceUpdate);
      window.removeEventListener('websocket:direct_message', handleDirectMessage); // Remove listener
    };
  }, [queryClient]);

  useEffect(() => {
    // Update user status when dashboard mounts
    updateStatus("online");

    return () => {
      updateStatus("offline");
    };
  }, [updateStatus]);

  // Filter tasks for staff/intern user or all tasks for managers, PMs, CSOs, and support maintenance clients
  const staffTasks =
    user?.role === "staff" || user?.role === "intern"
      ? ((tasks ?? []).filter((task) => task.assigneeId === user?.id))
      : (tasks ?? []);

  // Categorize tasks - moved before userTasks to avoid dependency issues
  const activeTask = (tasks ?? []).find((task) => task?.isTimerRunning && (user?.role === 'staff' || user?.role === 'intern' ? task.assigneeId === user?.id : true));

  // Use appropriate task set based on user role
  const userTasks =
    user?.role === "staff" || user?.role === "intern" || user?.role === "product_owner"
      ? (tasks ?? []).filter((task) => task.assigneeId === user?.id)
      : (tasks ?? []);

  const tasksInProgress = (userTasks ?? []).filter(
    (task) => task.status === "in_progress"
  );
  const pendingTasks = (userTasks ?? []).filter((task) => task.status === "pending"); // Changed to filter for 'pending' status
  const todoTasks = (userTasks ?? []).filter((task) => task.status === "todo"); // Added filtering for 'todo' status
  const tasksInReview = (userTasks ?? []).filter((task) => task.status === "review");
  const technicalSupportTasks = (userTasks ?? []).filter(
    (task) => task.status === "technical_support",
  );

  // Calculate overall progress
  const totalTasks = (userTasks ?? []).length;
  const completedTasks = (userTasks ?? []).filter(
    (task) => task.status === "completed",
  ).length;
  const overallProgress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const TaskCard = ({
    task,
    showTimer = false,
  }: {
    task: Task;
    showTimer?: boolean;
  }) => (
    <div className="border rounded-lg p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-sm truncate flex-1 text-gray-800 dark:text-gray-200">{task.title}</h4>
        {showTimer && task.isTimerRunning && (
          <div className="flex items-center gap-1 text-green-600 text-xs">
            <Clock className="h-3 w-3" />
            <span>{formatTime(task.timeSpent || 0)}</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-2 line-clamp-2">
        {task.description}
      </p>
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-xs">
          {task.status === "in_progress"
            ? "In Progress"
            : task.status === "todo"
              ? "To Do"
              : task.status === "review"
                ? "Review"
                : task.status === "pending" // Added pending status display
                  ? "Pending"
                  : task.status}
        </Badge>
        {task.deadline && (
          <span className="text-xs text-gray-400">
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background w-full max-w-full overflow-hidden">
      <Sidebar currentPath={location} />

      <div className="flex-1 flex flex-col lg:pl-64 min-w-0 max-w-full">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full max-w-full">
          <BookingAlert />
          {user?.role === "staff" ||
          (user?.role === "client" &&
            user?.clientType === "support_maintenance_client") ||
          user?.role === "intern" ? ( // Added intern role here
            <>
              {/* Staff & Support Maintenance Client & Intern Dashboard */}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 w-full max-w-full overflow-hidden">
                {/* Tasks in Progress */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <AlertCircle className="h-5 w-5" />
                        Tasks in Progress
                      </div>
                      <Badge variant="secondary">
                        {tasksInProgress.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {tasksInProgress.length > 0 ? (
                      <Collapsible
                        open={openSections.inProgress}
                        onOpenChange={() => toggleSection("inProgress")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.inProgress ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInProgress.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No tasks in progress</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Tasks (paused timer) */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                        <Clock className="h-5 w-5" />
                        Pending Tasks
                      </div>
                      <Badge variant="secondary">
                        {pendingTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {pendingTasks.length > 0 ? (
                      <Collapsible
                        open={openSections.pending}
                        onOpenChange={() => toggleSection("pending")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.pending ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {pendingTasks.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No pending tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Todo Tasks */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-400">
                        <Clock className="h-5 w-5" />
                        Todo Tasks
                      </div>
                      <Badge variant="secondary">
                        {todoTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {todoTasks.length > 0 ? (
                      <Collapsible
                        open={openSections.todo}
                        onOpenChange={() => toggleSection("todo")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.todo ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {todoTasks.map((task) => (
                              <div
                                key={task.id}
                                className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded"
                              >
                                <div className="font-medium truncate">
                                  {task.title}
                                </div>
                                {task.deadline && (
                                  <div className="text-muted-foreground">
                                    Due: {new Date(task.deadline).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No todo tasks
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Tasks in Review */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <CheckCircle className="h-5 w-5" />
                        Tasks in Review
                      </div>
                      <Badge variant="secondary">{tasksInReview.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {tasksInReview.length > 0 ? (
                      <Collapsible
                        open={openSections.review}
                        onOpenChange={() => toggleSection("review")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.review ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInReview.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No tasks in review</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Technical Support Card - Only for staff and interns */}
                {(user.role === "staff" || user.role === "intern") && user.specialization !== "technical_support" && (
                  <Card className="w-full min-w-0">
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                      <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                          <HelpCircle className="h-5 w-5" />
                          Technical Support
                        </div>
                        <Badge variant="secondary">
                          {technicalSupportTasks.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                      {technicalSupportTasks.length > 0 ? (
                        <div className="space-y-3">
                          <Select>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a support task..." />
                            </SelectTrigger>
                            <SelectContent>
                              {technicalSupportTasks.map((task) => (
                                <SelectItem
                                  key={task.id}
                                  value={task.id.toString()}
                                >
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium text-sm text-foreground">{task.title}</span>
                                    <span className="text-xs text-muted-foreground truncate">{task.description?.substring(0, 50)}...</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Collapsible
                            open={openSections.technical}
                            onOpenChange={() => toggleSection("technical")}
                          >
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between"
                              >
                                View All
                                {openSections.technical ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-2 mt-3">
                              {technicalSupportTasks.map((task) => (
                                <TaskCard key={task.id} task={task} />
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      ) : (
                        <div className="text-center text-muted-foreground py-4">
                          <p className="text-sm">No technical support tasks</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Stop Gap Card - Only for staff and interns */}
                {(user.role === "staff" || user.role === "intern") && (
                  <StopGapCard />
                )}

                {/* Active Tasks Card */}
              </div>

              {/* Full Task List with Completed Tab */}
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">
                    {user?.role === "staff" || user?.role === "intern" ? "All Your Tasks" : "All Tasks"}
                  </h2>
                  <div className="relative w-full md:w-64">
                    <Input
                      type="text"
                      placeholder="Search task or staff..."
                      className="w-full pr-8"
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                    />
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <Tabs defaultValue="active" className="w-full">
                  <div className="flex items-center justify-between mb-4">
                    <TabsList className="flex w-full p-1 bg-muted">
                      <TabsTrigger value="active" className="flex-1 text-xs sm:text-sm px-4 py-2">Active Tasks</TabsTrigger>
                      <TabsTrigger value="completed" className="flex-1 text-xs sm:text-sm px-4 py-2">Completed</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="active" className="mt-0">
                    {staffTasks && staffTasks.filter(t => t.status !== 'completed').length > 0 ? (
                      <StaffTaskList
                        tasks={staffTasks.filter(t => {
                          const matchesSearch = !taskSearchQuery || 
                            t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                            (staff?.find(s => s.id === t.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                          return t.status !== 'completed' && matchesSearch;
                        })}
                        projectId={undefined}
                      />
                    ) : (
                      <div className="text-center text-muted-foreground mt-8">
                        No active tasks assigned to you yet.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="completed" className="mt-0">
                    {staffTasks && staffTasks.filter(t => t.status === 'completed').length > 0 ? (
                      <StaffTaskList
                        tasks={staffTasks.filter(t => {
                          const matchesSearch = !taskSearchQuery || 
                            t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                            (staff?.find(s => s.id === t.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                          return t.status === 'completed' && matchesSearch;
                        })}
                        projectId={undefined}
                      />
                    ) : (
                      <div className="text-center text-muted-foreground mt-8">
                        No completed tasks yet.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <>
              {/* Manager/Admin/Team Lead Dashboard */}
              {(user?.role === "operations_manager" ||
                user?.specialization === "operations_manager" ||
                user?.role === "team_lead") && (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Project Status</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6 w-full max-w-full overflow-hidden">
                  {/* Active Projects */}

                  <Card className="w-full min-w-0">
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                      <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                          <Play className="h-5 w-5" />
                          Active Projects
                        </div>
                        <Badge variant="secondary">
                          {(() => {
                            const activeProjects =
                              projects?.filter((project) => {
                                // Check for tasks in progress or with running timers
                                const hasActiveTasks = tasks?.some(
                                  (task) =>
                                    task.projectId === project.id &&
                                    (task.status === "in_progress" || task.isTimerRunning)
                                );

                                // Check for recent team chat messages and resources (last 24 hours)
                                const activity = projectActivity?.[project.id];
                                const hasRecentActivity = activity && (activity.hasMessages || activity.hasResources);

                                return hasActiveTasks || hasRecentActivity;
                              }) || [];
                            return activeProjects.length;
                          })()}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 max-h-48 overflow-y-auto">
                      {(() => {
                        const activeProjects =
                          (projects ?? []).filter((project) => {
                            const hasActiveTasks = (tasks ?? []).some(
                              (task) =>
                                task?.projectId === project?.id &&
                                (task?.status === "in_progress" || task?.isTimerRunning)
                            );

                            const activity = projectActivity?.[project.id];
                            const hasRecentActivity = activity && (activity.hasMessages || activity.hasResources);

                            return hasActiveTasks || hasRecentActivity;
                          });

                        if (activeProjects.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No active projects currently
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {activeProjects.map((project) => {
                              const hasRunningTimer = (tasks ?? []).some(
                                (task) =>
                                  task?.projectId === project?.id && task?.isTimerRunning
                              );
                              const hasInProgress = (tasks ?? []).some(
                                (task) =>
                                  task?.projectId === project?.id && task?.status === "in_progress"
                              );

                              const activity = projectActivity?.[project.id];
                              const hasMessages = activity?.hasMessages || false;
                              const hasResources = activity?.hasResources || false;

                              // Build activity reason
                              const reasons = [];
                              if (hasRunningTimer) reasons.push("Task timer running");
                              else if (hasInProgress) reasons.push("Task in progress");
                              if (hasMessages) reasons.push("Recent team chat");
                              if (hasResources) reasons.push("Resource added");

                              const activityReason = reasons.length > 0 ? reasons.join(" • ") : "Active";

                              return (
                                <div
                                  key={project.id}
                                  className="p-2 bg-green-50 dark:bg-green-900/30 rounded-md border border-green-200 dark:border-green-700 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/dashboard/projects/${project.id}`;
                                  }}
                                >
                                  <p className="font-medium text-sm text-green-900 dark:text-green-100">
                                    {project.name}
                                  </p>
                                  <p className="text-xs text-green-700 dark:text-green-300">
                                    {project.category?.replace("_", " ")}
                                  </p>
                                  <p className="text-xs text-green-600 dark:text-green-400 italic">
                                    {activityReason}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Pending Projects */}
                  <Card className="w-full min-w-0">
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                      <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                          <Clock className="h-5 w-5" />
                          Pending Projects
                        </div>
                        <Badge variant="secondary">
                          {(() => {
                            const oneWeekAgo = new Date();
                            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                            const pendingProjects = projects?.filter((project) => {
                              const projectTasks = tasks?.filter(
                                (task) => task.projectId === project.id
                              ) || [];

                              // If no tasks, it's pending
                              if (projectTasks.length === 0) {
                                return true;
                              }

                              // If has tasks, check if any has been worked on in the last week
                              const hasRecentWork = projectTasks.some((task) => {
                                // Check if task has been started and worked on recently
                                if (task.hasBeenStarted && task.timerStartTime) {
                                  const lastWorked = new Date(task.timerStartTime);
                                  return lastWorked >= oneWeekAgo;
                                }
                                // Also check updatedAt for recent activity
                                if (task.updatedAt) {
                                  const lastUpdated = new Date(task.updatedAt);
                                  return lastUpdated >= oneWeekAgo && (task.hasBeenStarted || task.status !== 'todo');
                                }
                                return false;
                              });

                              // If no recent work, it's pending
                              return !hasRecentWork;
                            }) || [];

                            return pendingProjects.length;
                          })()}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 max-h-48 overflow-y-auto">
                      {(() => {
                        const oneWeekAgo = new Date();
                        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

                        const pendingProjects = (projects ?? []).filter((project) => {
                          const projectTasks = (tasks ?? []).filter(
                            (task) => task?.projectId === project?.id
                          );

                          // If no tasks, it's pending
                          if (projectTasks.length === 0) {
                            return true;
                          }

                          // If has tasks, check if any has been worked on in the last week
                          const hasRecentWork = projectTasks.some((task) => {
                            // Check if task has been started and worked on recently
                            if (task?.hasBeenStarted && task?.timerStartTime) {
                              const lastWorked = new Date(task.timerStartTime);
                              return lastWorked >= oneWeekAgo;
                            }
                            // Also check updatedAt for recent activity
                            if (task?.updatedAt) {
                              const lastUpdated = new Date(task.updatedAt);
                              return lastUpdated >= oneWeekAgo && (task?.hasBeenStarted || task?.status !== 'todo');
                            }
                            return false;
                          });

                          // If no recent work, it's pending
                          return !hasRecentWork;
                        });

                        if (pendingProjects.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No pending projects
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {pendingProjects.map((project) => {
                              const projectTasks = (tasks ?? []).filter(
                                (task) => task?.projectId === project?.id
                              );

                              const reasonText = projectTasks.length === 0
                                ? "No tasks assigned"
                                : "No work activity for 1+ week";

                              return (
                                <div
                                  key={project.id}
                                  className="p-2 bg-yellow-50 dark:bg-yellow-900/30 rounded-md border border-yellow-200 dark:border-yellow-700 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/dashboard/projects/${project.id}`;
                                  }}
                                >
                                  <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
                                    {project.name}
                                  </p>
                                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                    {project.category?.replace("_", " ")}
                                  </p>
                                  <p className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                                    {reasonText}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Completed Projects */}
                  <Card className="w-full min-w-0">
                    <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                      <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                          <CheckCircle className="h-5 w-5" />
                          Completed Projects
                        </div>
                        <Badge variant="secondary">
                          {(() => {
                            const oneMonthAgo = new Date();
                            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

                            return (
                              (projects ?? []).filter((project) => {
                                // Projects completed in the last month
                                return (
                                  project?.status === "completed" ||
                                  (project?.progress === 100 &&
                                    project?.updatedAt &&
                                    new Date(project.updatedAt) >= oneMonthAgo)
                                );
                              }).length
                            );
                          })()}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 max-h-48 overflow-y-auto">
                      {(() => {
                        const oneMonthAgo = new Date();
                        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

                        const completedProjects =
                          (projects ?? []).filter((project) => {
                            return (
                              project?.status === "completed" ||
                              (project?.progress === 100 &&
                                project?.updatedAt &&
                                new Date(project.updatedAt) >= oneMonthAgo)
                            );
                          });

                        if (completedProjects.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No projects completed this month
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {completedProjects.map((project) => (
                              <div
                                key={project.id}
                                className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-700 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `/dashboard/projects/${project.id}`;
                                }}
                              >
                                <p className="font-medium text-sm text-blue-900 dark:text-blue-100">
                                  {project.name}
                                </p>
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                  {project.category?.replace("_", " ")}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>
                </>
              )}

              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Task Status</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6 w-full max-w-full overflow-hidden">
                {/* Tasks in Progress */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <AlertCircle className="h-5 w-5" />
                        Tasks in Progress
                      </div>
                      <Badge variant="secondary">
                        {tasksInProgress.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {tasksInProgress.length > 0 ? (
                      <Collapsible
                        open={openSections.inProgress}
                        onOpenChange={() => toggleSection("inProgress")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.inProgress ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInProgress.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No tasks in progress</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Tasks (paused timer) */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                        <Clock className="h-5 w-5" />
                        Pending Tasks
                      </div>
                      <Badge variant="secondary">
                        {pendingTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {pendingTasks.length > 0 ? (
                      <Collapsible
                        open={openSections.pending}
                        onOpenChange={() => toggleSection("pending")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.pending ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {pendingTasks.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No pending tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Todo Tasks */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-400">
                        <Clock className="h-5 w-5" />
                        Todo Tasks
                      </div>
                      <Badge variant="secondary">
                        {todoTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {todoTasks.length > 0 ? (
                      <Collapsible
                        open={openSections.todo}
                        onOpenChange={() => toggleSection("todo")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.todo ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {todoTasks.map((task) => (
                              <div
                                key={task.id}
                                className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded"
                              >
                                <div className="font-medium truncate">
                                  {task.title}
                                </div>
                                {task.deadline && (
                                  <div className="text-muted-foreground">
                                    Due: {new Date(task.deadline).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No todo tasks
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Tasks in Review */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <CheckCircle className="h-5 w-5" />
                        Tasks in Review
                      </div>
                      <Badge variant="secondary">{tasksInReview.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {tasksInReview.length > 0 ? (
                      <Collapsible
                        open={openSections.review}
                        onOpenChange={() => toggleSection("review")}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            View Tasks
                            {openSections.review ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInReview.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No tasks in review</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Technical Support */}
                <Card className="w-full min-w-0">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center justify-between text-sm sm:text-base">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <HelpCircle className="h-5 w-5" />
                        Technical Support
                      </div>
                      <Badge variant="secondary">
                        {technicalSupportTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    {technicalSupportTasks.length > 0 ? (
                      <div className="space-y-3">
                        <Select>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a support task..." />
                          </SelectTrigger>
                          <SelectContent>
                            {technicalSupportTasks.map((task) => (
                              <SelectItem
                                key={task.id}
                                value={task.id.toString()}
                              >
                                <div className="flex flex-col items-start">
                                  <span className="font-medium text-sm text-foreground">{task.title}</span>
                                  <span className="text-xs text-muted-foreground truncate">{task.description?.substring(0, 50)}...</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Collapsible
                          open={openSections.technical}
                          onOpenChange={() => toggleSection("technical")}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between"
                            >
                              View All
                              {openSections.technical ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 mt-3">
                            {technicalSupportTasks.map((task) => (
                              <TaskCard key={task.id} task={task} />
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">
                        <p className="text-sm">No technical support tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Overall Progress */}
              <div className="grid grid-cols-1 gap-6 mb-6">
                <Card className="max-w-md w-full">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm sm:text-base">
                      <CheckCircle className="h-5 w-5" />
                      Overall Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                          {overallProgress}%
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
                          <div
                            className="bg-blue-600 dark:bg-blue-400 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${overallProgress}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {completedTasks} of {totalTasks} tasks completed
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Team Lead and Intern Tasks Section */}
              {(user?.role === "team_lead" || user?.role === "intern") && (
                <div className="space-y-6 mb-8">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">My Tasks</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {user?.role === "team_lead" ? "Tasks assigned to you as Team Lead" : "Tasks assigned to you"}
                    </p>
                  </div>

                  {(tasks ?? []).filter(task => task?.assigneeId === user?.id).length > 0 ? (
                    <StaffTaskList
                      tasks={(tasks ?? []).filter(task => task?.assigneeId === user?.id)}
                      projectId={undefined}
                    />
                  ) : (
                    <div className="text-center text-muted-foreground py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      No tasks assigned to you yet.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">
                    {user?.role === "staff" || user?.role === "intern" ? "All Your Tasks" : "All Tasks"}
                  </h2>
                  <div className="relative w-full md:w-64">
                    <Input
                      type="text"
                      placeholder="Search task or staff..."
                      className="w-full pr-8"
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                    />
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {tasksLoading ? (
                  <div className="text-center text-muted-foreground mt-8">
                    Loading tasks...
                  </div>
                ) : (tasks ?? []).length > 0 ? (
                  <Tabs defaultValue="active" className="w-full mt-4 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <TabsList className="flex w-full p-1 bg-muted">
                        <TabsTrigger value="active" className="flex-1 text-xs sm:text-sm px-4 py-2">Active Tasks</TabsTrigger>
                        <TabsTrigger value="completed" className="flex-1 text-xs sm:text-sm px-4 py-2">Completed</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="active" className="mt-0">
                      <TaskList
                        tasks={
                          user?.role === "staff" || user?.role === "intern"
                            ? (tasks ?? []).filter((task) => {
                                const matchesSearch = !taskSearchQuery || 
                                  task?.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                                  (staff?.find(s => s.id === task.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                                return task?.assigneeId === user?.id &&
                                  task?.status !== 'completed' && matchesSearch;
                              })
                            : (tasks ?? []).filter((task) => {
                                const matchesSearch = !taskSearchQuery || 
                                  task?.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                                  (staff?.find(s => s.id === task.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                                return task?.status !== 'completed' && matchesSearch;
                              })
                        }
                        projectId={undefined}
                        showNewTaskButton={false}
                        showProjectInfo={true}
                      />
                    </TabsContent>

                    <TabsContent value="completed" className="mt-0">
                      <TaskList
                        tasks={
                          user?.role === "staff" || user?.role === "intern"
                            ? (tasks ?? []).filter((task) => {
                                const matchesSearch = !taskSearchQuery || 
                                  task?.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                                  (staff?.find(s => s.id === task.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                                return task?.assigneeId === user?.id &&
                                  task?.status === 'completed' && matchesSearch;
                              })
                            : (tasks ?? []).filter((task) => {
                                const matchesSearch = !taskSearchQuery || 
                                  task?.title?.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
                                  (staff?.find(s => s.id === task.assigneeId)?.name || "").toLowerCase().includes(taskSearchQuery.toLowerCase());
                                return task?.status === 'completed' && matchesSearch;
                              })
                        }
                        projectId={undefined}
                        showNewTaskButton={false}
                        showProjectInfo={true}
                      />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="text-center text-muted-foreground mt-8">
                    No tasks available. Tasks from all projects will appear here.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}