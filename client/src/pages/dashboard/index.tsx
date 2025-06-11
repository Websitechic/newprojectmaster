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
import { ChevronDown, ChevronUp, Clock, Play, AlertCircle, CheckCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Project, Task } from "@db/schema";

export default function Dashboard() {
  const [location] = useLocation();
  const { user } = useUser();
  const { updateStatus } = useWebSocket(user?.id);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    inProgress: false,
    pending: false,
    review: false,
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  useEffect(() => {
    // Update user status when dashboard mounts
    updateStatus("online");

    return () => {
      updateStatus("offline");
    };
  }, [updateStatus]);

  // Filter tasks for staff user
  const staffTasks = user?.role === "staff" 
    ? tasks?.filter(task => task.assigneeId === user?.id) || []
    : tasks || [];

  // Categorize tasks
  const activeTask = staffTasks.find(task => task.isTimerRunning);
  const tasksInProgress = staffTasks.filter(task => 
    task.status === "in_progress" && !task.isTimerRunning
  );
  const pendingTasks = staffTasks.filter(task => task.status === "todo");
  const tasksInReview = staffTasks.filter(task => task.status === "review");

  // Calculate overall progress
  const totalTasks = staffTasks.length;
  const completedTasks = staffTasks.filter(task => task.status === "completed").length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const TaskCard = ({ task, showTimer = false }: { task: Task; showTimer?: boolean }) => (
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
      <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
      <div className="flex justify-between items-center">
        <Badge variant="outline" className="text-xs">
          {task.status === "in_progress" ? "In Progress" : 
           task.status === "todo" ? "To Do" : 
           task.status === "review" ? "Review" : task.status}
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
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <MeetingAlert />
        <div className="flex-1 overflow-auto p-6">
          <BookingAlert />
          {user?.role === "staff" ? (
            <>
              {/* Staff Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {/* Active Task */}
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-green-700">
                      <Play className="h-5 w-5" />
                      Active Task
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activeTask ? (
                      <TaskCard task={activeTask} showTimer={true} />
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm">No active task</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tasks in Progress */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <AlertCircle className="h-5 w-5" />
                        Tasks in Progress
                      </div>
                      <Badge variant="secondary">{tasksInProgress.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tasksInProgress.length > 0 ? (
                      <Collapsible open={openSections.inProgress} onOpenChange={() => toggleSection('inProgress')}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            View Tasks
                            {openSections.inProgress ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInProgress.map(task => (
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
                      <Collapsible open={openSections.pending} onOpenChange={() => toggleSection('pending')}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            View Tasks
                            {openSections.pending ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {pendingTasks.map(task => (
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
                      <Collapsible open={openSections.review} onOpenChange={() => toggleSection('review')}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            View Tasks
                            {openSections.review ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {tasksInReview.map(task => (
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

                {/* Progress */}
                <Card className="md:col-span-2 lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-700">Overall Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-blue-600 mb-2">
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
                  </CardContent>
                </Card>
              </div>

              {/* Full Task List */}
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">All Your Tasks</h2>
                {staffTasks.length > 0 ? (
                  <StaffTaskList 
                    tasks={tasks || []} 
                    projectId={staffTasks[0]?.projectId || 0}
                  />
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Projects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {projects?.filter(p => p.status === "active").length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Pending Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {tasks?.filter(t => t.status === "todo").length || 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {projects && projects.length > 0
                        ? Math.round(
                            projects.reduce((acc, p) => acc + (p.progress || 0), 0) /
                              projects.length
                          )
                        : 0}
                      %
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl font-bold">All Tasks</h2>
                {tasks && tasks.length > 0 ? (
                  <TaskList 
                    tasks={tasks?.slice(0, 5) || []} 
                    projectId={tasks[0]?.projectId || 0}
                    showNewTaskButton={false}
                  />
                ) : (
                  <div className="text-center text-muted-foreground mt-8">
                    No tasks available.
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