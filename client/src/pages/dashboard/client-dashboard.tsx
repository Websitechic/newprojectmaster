
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Calendar, Clock, CheckCircle, AlertCircle, TrendingUp, Users, Target, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

// Support & Maintenance Client Dashboard Component
function SupportMaintenanceClientDashboard() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff"],
  });

  // Get tasks for client's projects
  const clientTasks = React.useMemo(() => {
    if (!projects.length || !allTasks.length) return [];
    
    const clientProjectIds = projects.map(p => p.id);
    return allTasks.filter(task => clientProjectIds.includes(task.projectId));
  }, [projects, allTasks]);

  // Categorize tasks by status
  const tasksByStatus = React.useMemo(() => {
    return {
      todo: clientTasks.filter(task => task.status === 'todo'),
      in_progress: clientTasks.filter(task => task.status === 'in_progress'),
      review: clientTasks.filter(task => task.status === 'review'),
      completed: clientTasks.filter(task => task.status === 'completed'),
      technical_support: clientTasks.filter(task => task.status === 'technical_support')
    };
  }, [clientTasks]);

  const getAssignedStaffName = (assigneeId: number | null) => {
    if (!assigneeId) return "Unassigned";
    const staffMember = staff.find((s: any) => s.id === assigneeId);
    return staffMember?.name || "Unknown";
  };

  const getProjectName = (projectId: number) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-purple-100 text-purple-800';
      case 'todo':
        return 'bg-gray-100 text-gray-800';
      case 'technical_support':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No deadline";
    return format(new Date(dateString), "MMM d, yyyy");
  };

  const TaskCard = ({ task }: { task: Task }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-sm">{task.title}</h4>
          <Badge className={`text-xs ${getStatusBadgeColor(task.status)}`}>
            {task.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Assigned to: {getAssignedStaffName(task.assigneeId)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span>Project: {getProjectName(task.projectId)}</span>
          </div>
          {task.deadline && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Due: {formatDate(task.deadline)}</span>
            </div>
          )}
          {task.description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{task.description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (projectsLoading || tasksLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading your dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Support & Maintenance Dashboard</h1>
            <p className="text-muted-foreground">
              View-only access to your support and maintenance tasks.
            </p>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6 mb-6 md:mb-8">
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                    <p className="text-2xl font-bold">{clientTasks.length}</p>
                  </div>
                  <Target className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">To Do</p>
                    <p className="text-2xl font-bold">{tasksByStatus.todo.length}</p>
                  </div>
                  <Clock className="h-6 w-6 md:h-8 md:w-8 text-gray-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">In Progress</p>
                    <p className="text-2xl font-bold">{tasksByStatus.in_progress.length}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">In Review</p>
                    <p className="text-2xl font-bold">{tasksByStatus.review.length}</p>
                  </div>
                  <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className="text-2xl font-bold">{tasksByStatus.completed.length}</p>
                  </div>
                  <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Task Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* To Do Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-gray-500" />
                  To Do ({tasksByStatus.todo.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {tasksByStatus.todo.length > 0 ? (
                  tasksByStatus.todo.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    <p className="text-sm">No pending tasks</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* In Progress Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  In Progress ({tasksByStatus.in_progress.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {tasksByStatus.in_progress.length > 0 ? (
                  tasksByStatus.in_progress.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    <p className="text-sm">No tasks in progress</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* In Review Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-purple-500" />
                  In Review ({tasksByStatus.review.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {tasksByStatus.review.length > 0 ? (
                  tasksByStatus.review.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    <p className="text-sm">No tasks in review</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Technical Support Tasks */}
            {tasksByStatus.technical_support.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Technical Support ({tasksByStatus.technical_support.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  {tasksByStatus.technical_support.map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Completed Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Completed ({tasksByStatus.completed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {tasksByStatus.completed.length > 0 ? (
                  tasksByStatus.completed.slice(0, 10).map(task => (
                    <TaskCard key={task.id} task={task} />
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    <p className="text-sm">No completed tasks</p>
                  </div>
                )}
                {tasksByStatus.completed.length > 10 && (
                  <div className="text-center text-gray-500 py-2">
                    <p className="text-xs">Showing latest 10 completed tasks</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Projects Overview */}
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Your Projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map(project => {
                    const projectTasks = clientTasks.filter(task => task.projectId === project.id);
                    const completedTasks = projectTasks.filter(task => task.status === 'completed');
                    const progressPercentage = projectTasks.length > 0 
                      ? Math.round((completedTasks.length / projectTasks.length) * 100)
                      : 0;

                    return (
                      <Card key={project.id} className="p-4">
                        <h4 className="font-medium mb-2">{project.name}</h4>
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span>Progress</span>
                            <span>{progressPercentage}%</span>
                          </div>
                          <Progress value={progressPercentage} className="h-2" />
                          <div className="flex justify-between">
                            <span>Tasks</span>
                            <span>{completedTasks.length}/{projectTasks.length}</span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  category: string;
  type: string;
  createdAt: string;
}

interface Task {
  id: number;
  title: string;
  status: string;
  projectId: number;
  timeSpent: number;
  workingHours: number;
  deadline: string;
  createdAt: string;
}

interface ProjectProgress {
  projectId: number;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  totalTimeSpent: number;
  estimatedTotalTime: number;
  progressPercentage: number;
}

interface TaskPieData {
  name: string;
  value: number;
  status: string;
  color: string;
  taskId: number;
}

const TASK_COLORS = {
  completed: '#22C55E', // Green
  incomplete: '#EAB308', // Yellow
};

const STATUS_COLORS = {
  completed: '#22C55E',
  in_progress: '#EAB308',
  todo: '#6B7280',
  review: '#3B82F6',
};

// Custom tooltip component for pie chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border rounded shadow-lg">
        <p className="font-medium">{data.name}</p>
        <p className="text-sm text-gray-600">Status: {data.status}</p>
      </div>
    );
  }
  return null;
};

// Custom label component to show task names on slices
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  // Only show label if there's enough space
  if (name.length > 15) {
    return null;
  }

  return (
    <text 
      x={x} 
      y={y} 
      fill="black" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      fontSize="12"
      fontWeight="bold"
    >
      {name.length > 10 ? `${name.substring(0, 10)}...` : name}
    </text>
  );
};

// Custom center label to show completion percentage
const CenterLabel = ({ viewBox, completedTasks, totalTasks }: any) => {
  const { cx, cy } = viewBox;
  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} y={cy - 10} fontSize="24" fontWeight="bold" fill="#374151">
        {percentage}%
      </tspan>
      <tspan x={cx} y={cy + 15} fontSize="14" fill="#6B7280">
        Complete
      </tspan>
    </text>
  );
};

export default function ClientDashboard() {
  const { user } = useAuth();

  // If this is a Support & Maintenance client, show a view-only task management dashboard
  if (user?.clientType === "support_maintenance_client") {
    return <SupportMaintenanceClientDashboard />;
  }

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Calculate progress for each project
  const projectsProgress = React.useMemo(() => {
    if (!projects.length || !allTasks.length) return [];

    return projects.map(project => {
      const projectTasks = allTasks.filter(task => task.projectId === project.id);
      const completedTasks = projectTasks.filter(task => task.status === 'completed');
      const inProgressTasks = projectTasks.filter(task => task.status === 'in_progress');
      const pendingTasks = projectTasks.filter(task => task.status === 'todo');
      const overdueTasks = projectTasks.filter(task => {
        if (!task.deadline) return false;
        return new Date(task.deadline) < new Date() && task.status !== 'completed';
      });

      const totalTimeSpent = projectTasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);
      const estimatedTotalTime = projectTasks.reduce((sum, task) => sum + ((task.workingHours || 0) * 3600), 0);

      const progressPercentage = projectTasks.length > 0 
        ? Math.round((completedTasks.length / projectTasks.length) * 100)
        : 0;

      return {
        projectId: project.id,
        projectName: project.name,
        totalTasks: projectTasks.length,
        completedTasks: completedTasks.length,
        inProgressTasks: inProgressTasks.length,
        pendingTasks: pendingTasks.length,
        overdueTasks: overdueTasks.length,
        totalTimeSpent,
        estimatedTotalTime,
        progressPercentage,
        project,
        tasks: projectTasks
      };
    });
  }, [projects, allTasks]);

  // Prepare pie chart data for each project
  const projectPieData = React.useMemo(() => {
    return projectsProgress.map(project => {
      const pieData: TaskPieData[] = project.tasks.map(task => ({
        name: task.title,
        value: 1, // Each task is 1 slice
        status: task.status,
        color: task.status === 'completed' ? TASK_COLORS.completed : TASK_COLORS.incomplete,
        taskId: task.id
      }));

      return {
        projectId: project.projectId,
        projectName: project.projectName,
        pieData,
        completedTasks: project.completedTasks,
        totalTasks: project.totalTasks,
        tasks: project.tasks
      };
    });
  }, [projectsProgress]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'todo':
        return 'bg-gray-100 text-gray-800';
      case 'review':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'todo':
        return 'Pending';
      case 'review':
        return 'In Review';
      default:
        return status;
    }
  };

  if (projectsLoading || tasksLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading your project progress...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Target className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No Projects Found</h2>
              <p className="text-gray-500">You don't have any projects assigned yet.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Project Dashboard</h1>
            <p className="text-muted-foreground">
              Track the progress of your projects and view task completion status.
            </p>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Projects</p>
                    <p className="text-2xl font-bold">{projects.length}</p>
                  </div>
                  <Target className="h-6 w-6 md:h-8 md:w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Projects</p>
                    <p className="text-2xl font-bold">
                      {projects.filter(p => p.status === 'active').length}
                    </p>
                  </div>
                  <TrendingUp className="h-6 w-6 md:h-8 md:w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                    <p className="text-2xl font-bold">
                      {projectsProgress.reduce((sum, p) => sum + p.totalTasks, 0)}
                    </p>
                  </div>
                  <CheckCircle className="h-6 w-6 md:h-8 md:w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                    <p className="text-2xl font-bold">
                      {projectsProgress.length > 0 
                        ? Math.round(projectsProgress.reduce((sum, p) => sum + p.progressPercentage, 0) / projectsProgress.length)
                        : 0}%
                    </p>
                  </div>
                  <Target className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Project Progress Charts */}
          <div className="space-y-6 md:space-y-8">
            {projectPieData.map((projectData) => (
              <Card key={projectData.projectId} className="w-full">
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">{projectData.projectName}</CardTitle>
                  <CardDescription>
                    Task progress visualization - {projectData.completedTasks} of {projectData.totalTasks} tasks completed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {projectData.totalTasks > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                      {/* Pie Chart */}
                      <div className="flex flex-col items-center">
                        <div className="w-full max-w-md relative">
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie
                                data={projectData.pieData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={renderCustomizedLabel}
                                outerRadius={100}
                                innerRadius={60}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {projectData.pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                          
                          {/* Center percentage overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <div className="text-2xl md:text-3xl font-bold text-gray-700">
                                {Math.round((projectData.completedTasks / projectData.totalTasks) * 100)}%
                              </div>
                              <div className="text-sm text-gray-500">Complete</div>
                            </div>
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-4 mt-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-sm">Completed</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-sm">Incomplete</span>
                          </div>
                        </div>
                      </div>

                      {/* Task List */}
                      <div className="space-y-3">
                        <h4 className="text-lg font-semibold">Task Details</h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {projectData.tasks.map((task) => (
                            <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {task.title}
                                </p>
                                {task.deadline && (
                                  <p className="text-xs text-gray-500">
                                    Due: {format(new Date(task.deadline), "MMM d, yyyy")}
                                  </p>
                                )}
                              </div>
                              <Badge className={`ml-2 ${getStatusBadgeColor(task.status)}`}>
                                {getStatusLabel(task.status)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No tasks available for this project</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
