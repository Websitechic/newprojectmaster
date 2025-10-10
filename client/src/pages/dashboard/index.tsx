import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MeetingAlert } from "@/components/dashboard/meeting-alert";
import { BookingAlert } from "@/components/booking/booking-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectCard } from "@/components/project/project-card";
import { TaskList } from "@/components/task/task-list";
import { StaffTaskList } from "@/components/task/staff-task-list";
import { ChatWindow } from "@/components/chat/chat-window";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
  AlertCircle,
  CheckCircle,
  HelpCircle,
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
import type { Project, Task } from "@db/schema";

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { updateStatus } = useWebSocket(user?.id);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    inProgress: false,
    pending: false,
    review: false,
  });

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
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  useEffect(() => {
    // Update user status when dashboard mounts
    updateStatus("online");

    return () => {
      updateStatus("offline");
    };
  }, [updateStatus]);

  // Filter tasks for staff user or all tasks for managers and support maintenance clients
  const staffTasks =
    user?.role === "staff"
      ? tasks?.filter((task) => task.assigneeId === user?.id) || []
      : tasks || [];

  // Use appropriate task set based on user role - support maintenance clients see all tasks like managers
  const userTasks =
    user?.role === "staff"
      ? staffTasks
      : user?.role === "client" &&
          user?.clientType === "support_maintenance_client"
        ? tasks || []
        : user?.role === "operations_manager" ||
            user?.specialization === "operations_manager" ||
            user?.role === "team_lead"
          ? tasks || []
          : user?.role === "project_manager"
            ? tasks || []
            : user?.role === "product_owner"
              ? tasks || []
              : tasks || [];

  // Categorize tasks
  const activeTask = staffTasks.find((task) => task.isTimerRunning);
  const tasksInProgress = userTasks.filter(
    (task) => task.status === "in_progress" && !task.isTimerRunning,
  );
  const pendingTasks = userTasks.filter((task) => task.status === "todo");
  const tasksInReview = userTasks.filter((task) => task.status === "review");
  const technicalSupportTasks = userTasks.filter(
    (task) => task.status === "technical_support",
  );

  // Calculate overall progress
  const totalTasks = userTasks.length;
  const completedTasks = userTasks.filter(
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
    <div className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-sm truncate flex-1">{task.title}</h4>
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
    <div className="flex min-h-screen w-full max-w-full overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
          <BookingAlert />
          {user?.role === "staff" ||
          (user?.role === "client" &&
            user?.clientType === "support_maintenance_client") ? (
            <>
              {/* Staff & Support Maintenance Client Dashboard */}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6 w-full">
                {/* Tasks in Progress */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <AlertCircle className="h-5 w-5" />
                        Tasks in Progress
                      </div>
                      <Badge variant="secondary">
                        {tasksInProgress.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No tasks in progress</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Tasks */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-orange-700">
                        <Clock className="h-5 w-5" />
                        Pending Tasks
                      </div>
                      <Badge variant="secondary">{pendingTasks.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No pending tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tasks in Review */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-purple-700">
                        <CheckCircle className="h-5 w-5" />
                        Tasks in Review
                      </div>
                      <Badge variant="secondary">{tasksInReview.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No tasks in review</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Technical Support */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-700">
                        <HelpCircle className="h-5 w-5" />
                        Technical Support
                      </div>
                      <Badge variant="secondary">
                        {technicalSupportTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                                  <span className="font-medium text-sm">
                                    {task.title}
                                  </span>
                                  <span className="text-xs text-gray-500 truncate">
                                    {task.description?.substring(0, 50)}...
                                  </span>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No technical support tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Full Task List */}
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">All Your Tasks</h2>

                {staffTasks && staffTasks.length > 0 ? (
                  <StaffTaskList tasks={staffTasks} projectId={undefined} />
                ) : (
                  <div className="text-center text-muted-foreground mt-8">
                    No tasks assigned to you yet.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Manager/Admin Dashboard */}
              {(user?.role === "operations_manager" ||
                user?.specialization === "operations_manager" ||
                user?.role === "team_lead") && (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Project Status</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6 w-full">
                  {/* Active Projects */}

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-700">
                          <Play className="h-5 w-5" />
                          Active Projects
                        </div>
                        <Badge variant="secondary">
                          {(() => {
                            const activeProjects =
                              projects?.filter((project) => {
                                // Projects with tasks currently being worked on (in_progress or timer running)
                                return tasks?.some(
                                  (task) =>
                                    task.projectId === project.id &&
                                    (task.status === "in_progress" ||
                                      task.isTimerRunning),
                                );
                              }) || [];
                            return activeProjects.length;
                          })()}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-48 overflow-y-auto">
                      {(() => {
                        const activeProjects =
                          projects?.filter((project) => {
                            return tasks?.some(
                              (task) =>
                                task.projectId === project.id &&
                                (task.status === "in_progress" ||
                                  task.isTimerRunning),
                            );
                          }) || [];

                        if (activeProjects.length === 0) {
                          return (
                            <p className="text-sm text-muted-foreground">
                              No active projects currently
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {activeProjects.map((project) => (
                              <div
                                key={project.id}
                                className="p-2 bg-green-50 rounded-md border border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `/dashboard/projects/${project.id}`;
                                }}
                              >
                                <p className="font-medium text-sm text-green-900">
                                  {project.name}
                                </p>
                                <p className="text-xs text-green-700">
                                  {project.category?.replace("_", " ")}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Pending Projects */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-yellow-700">
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
                    <CardContent className="max-h-48 overflow-y-auto">
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
                              const projectTasks = tasks?.filter(
                                (task) => task.projectId === project.id
                              ) || [];

                              const reasonText = projectTasks.length === 0 
                                ? "No tasks assigned" 
                                : "No work activity for 1+ week";

                              return (
                                <div
                                  key={project.id}
                                  className="p-2 bg-yellow-50 rounded-md border border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.location.href = `/dashboard/projects/${project.id}`;
                                  }}
                                >
                                  <p className="font-medium text-sm text-yellow-900">
                                    {project.name}
                                  </p>
                                  <p className="text-xs text-yellow-700">
                                    {project.category?.replace("_", " ")}
                                  </p>
                                  <p className="text-xs text-yellow-600 italic">
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
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-700">
                          <CheckCircle className="h-5 w-5" />
                          Completed Projects
                        </div>
                        <Badge variant="secondary">
                          {(() => {
                            const oneMonthAgo = new Date();
                            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

                            return (
                              projects?.filter((project) => {
                                // Projects completed in the last month
                                return (
                                  project.status === "completed" ||
                                  (project.progress === 100 &&
                                    project.updatedAt &&
                                    new Date(project.updatedAt) >= oneMonthAgo)
                                );
                              }).length || 0
                            );
                          })()}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-48 overflow-y-auto">
                      {(() => {
                        const oneMonthAgo = new Date();
                        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

                        const completedProjects =
                          projects?.filter((project) => {
                            return (
                              project.status === "completed" ||
                              (project.progress === 100 &&
                                project.updatedAt &&
                                new Date(project.updatedAt) >= oneMonthAgo)
                            );
                          }) || [];

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
                                className="p-2 bg-blue-50 rounded-md border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `/dashboard/projects/${project.id}`;
                                }}
                              >
                                <p className="font-medium text-sm text-blue-900">
                                  {project.name}
                                </p>
                                <p className="text-xs text-blue-700">
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
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Task Status</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6 w-full">
                {/* Tasks in Progress */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <AlertCircle className="h-5 w-5" />
                        Tasks in Progress
                      </div>
                      <Badge variant="secondary">
                        {tasksInProgress.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No tasks in progress</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Tasks */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-orange-700">
                        <Clock className="h-5 w-5" />
                        Pending Tasks
                      </div>
                      <Badge variant="secondary">{pendingTasks.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No pending tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tasks in Review */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-purple-700">
                        <CheckCircle className="h-5 w-5" />
                        Tasks in Review
                      </div>
                      <Badge variant="secondary">{tasksInReview.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No tasks in review</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Technical Support */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-700">
                        <HelpCircle className="h-5 w-5" />
                        Technical Support
                      </div>
                      <Badge variant="secondary">
                        {technicalSupportTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
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
                                  <span className="font-medium text-sm">
                                    {task.title}
                                  </span>
                                  <span className="text-xs text-gray-500 truncate">
                                    {task.description?.substring(0, 50)}...
                                  </span>
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
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">No technical support tasks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Overall Progress */}
              <div className="grid grid-cols-1 gap-6 mb-6">
                <Card className="max-w-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-blue-700">
                      <CheckCircle className="h-5 w-5" />
                      Overall Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-2">
                          {overallProgress}%
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                          <div
                            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${overallProgress}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-500">
                          {completedTasks} of {totalTasks} tasks completed
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl font-bold">All Tasks</h2>
                {tasksLoading ? (
                  <div className="text-center text-muted-foreground mt-8">
                    Loading tasks...
                  </div>
                ) : tasks && tasks.length > 0 ? (
                  <TaskList
                    tasks={tasks}
                    projectId={undefined}
                    showNewTaskButton={false}
                    showProjectInfo={true}
                  />
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