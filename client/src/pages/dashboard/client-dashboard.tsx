
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Calendar, Clock, CheckCircle, AlertCircle, TrendingUp, Users, Target } from "lucide-react";
import { format } from "date-fns";

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

const PROGRESS_COLORS = {
  completed: '#22C55E',
  inProgress: '#3B82F6',
  pending: '#F59E0B',
  overdue: '#EF4444',
  remaining: '#E5E7EB'
};

const STATUS_COLORS = {
  active: '#22C55E',
  pending: '#F59E0B',
  completed: '#10B981',
  on_hold: '#6B7280'
};

export default function ClientDashboard() {
  const { user } = useAuth();

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
        project
      };
    });
  }, [projects, allTasks]);

  // Prepare pie chart data for the main project (first project)
  const mainProject = projectsProgress[0];
  const pieChartData = mainProject ? [
    { name: 'Completed', value: mainProject.completedTasks, color: PROGRESS_COLORS.completed },
    { name: 'In Progress', value: mainProject.inProgressTasks, color: PROGRESS_COLORS.inProgress },
    { name: 'Pending', value: mainProject.pendingTasks, color: PROGRESS_COLORS.pending },
    { name: 'Overdue', value: mainProject.overdueTasks, color: PROGRESS_COLORS.overdue }
  ].filter(item => item.value > 0) : [];

  // Time progress data
  const timeProgressData = mainProject ? [
    { 
      name: 'Time Spent', 
      value: Math.round(mainProject.totalTimeSpent / 3600), 
      color: PROGRESS_COLORS.completed 
    },
    { 
      name: 'Remaining', 
      value: Math.max(0, Math.round((mainProject.estimatedTotalTime - mainProject.totalTimeSpent) / 3600)), 
      color: PROGRESS_COLORS.remaining 
    }
  ] : [];

  // All projects overview for bar chart
  const projectsOverviewData = projectsProgress.map(project => ({
    name: project.projectName.length > 15 ? project.projectName.substring(0, 15) + '...' : project.projectName,
    completed: project.completedTasks,
    inProgress: project.inProgressTasks,
    pending: project.pendingTasks,
    overdue: project.overdueTasks,
    progressPercentage: project.progressPercentage
  }));

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
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
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Project Dashboard</h1>
            <p className="text-muted-foreground">
              Track the progress of your projects and stay updated on development milestones.
            </p>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Projects</p>
                    <p className="text-2xl font-bold">{projects.length}</p>
                  </div>
                  <Target className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Projects</p>
                    <p className="text-2xl font-bold">
                      {projects.filter(p => p.status === 'active').length}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                    <p className="text-2xl font-bold">
                      {projectsProgress.reduce((sum, p) => sum + p.totalTasks, 0)}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                    <p className="text-2xl font-bold">
                      {projectsProgress.length > 0 
                        ? Math.round(projectsProgress.reduce((sum, p) => sum + p.progressPercentage, 0) / projectsProgress.length)
                        : 0}%
                    </p>
                  </div>
                  <Target className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Project Progress */}
          {mainProject && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Task Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>{mainProject.projectName} - Task Progress</CardTitle>
                  <CardDescription>
                    Current status of all tasks in your main project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value, percent }) => 
                            `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                          }
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <div className="text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No tasks available for this project</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Time Progress */}
              <Card>
                <CardHeader>
                  <CardTitle>Time Progress</CardTitle>
                  <CardDescription>
                    Time spent vs estimated time for {mainProject.projectName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeProgressData.length > 0 && mainProject.estimatedTotalTime > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={timeProgressData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}h`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {timeProgressData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} hours`, 'Time']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <div className="text-center">
                        <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No time estimates available</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* All Projects Overview */}
          {projectsProgress.length > 1 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>All Projects Overview</CardTitle>
                <CardDescription>
                  Task distribution across all your projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={projectsOverviewData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="completed" stackId="a" fill={PROGRESS_COLORS.completed} name="Completed" />
                    <Bar dataKey="inProgress" stackId="a" fill={PROGRESS_COLORS.inProgress} name="In Progress" />
                    <Bar dataKey="pending" stackId="a" fill={PROGRESS_COLORS.pending} name="Pending" />
                    <Bar dataKey="overdue" stackId="a" fill={PROGRESS_COLORS.overdue} name="Overdue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Project Details */}
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>
                Detailed information about your projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {projectsProgress.map((project) => (
                  <div key={project.projectId} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{project.projectName}</h3>
                        <p className="text-sm text-gray-600 capitalize">
                          {project.project.category?.replace(/_/g, ' ')} • {project.project.type?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <Badge 
                        className={`${project.project.status === 'active' ? 'bg-green-100 text-green-800' : 
                          project.project.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'}`}
                      >
                        {project.project.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Overall Progress</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <Progress value={project.progressPercentage} className="flex-1" />
                          <span className="text-sm font-medium">{project.progressPercentage}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Tasks Completed</p>
                        <p className="text-lg font-semibold">{project.completedTasks} / {project.totalTasks}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600">Time Spent</p>
                        <p className="text-lg font-semibold">{formatTime(project.totalTimeSpent)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Completed: {project.completedTasks}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span>In Progress: {project.inProgressTasks}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <span>Pending: {project.pendingTasks}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span>Overdue: {project.overdueTasks}</span>
                      </div>
                    </div>

                    {project.project.startDate && project.project.endDate && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4" />
                            <span>Start: {format(new Date(project.project.startDate), "MMM d, yyyy")}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4" />
                            <span>End: {format(new Date(project.project.endDate), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
