import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Clock, CheckCircle, Target, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";

interface DailyProductivityData {
  totalTasksWorkedOn: number;
  totalTasksCompleted: number;
  totalTimeWorked: number; // in seconds
  taskBreakdown: {
    taskId: number;
    title: string;
    projectName: string;
    timeSpent: number; // in seconds
    status: string;
    isCompleted: boolean;
  }[];
  hourlyBreakdown: {
    hour: number;
    timeSpent: number; // in seconds
  }[];
}

interface ProductivityStats {
  today: DailyProductivityData;
  yesterday: DailyProductivityData;
  thisWeek: {
    totalTasks: number;
    completedTasks: number;
    totalTime: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C'];

export default function ProductivityPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: productivityData, isLoading } = useQuery<ProductivityStats>({
    queryKey: ["/api/productivity", selectedDate],
    queryFn: async () => {
      const response = await fetch(`/api/productivity?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error("Failed to fetch productivity data");
      }
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 60000, // Refresh every minute for real-time updates
  });

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatTimeDetailed = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Prepare pie chart data for tasks worked on today
  const taskPieData = productivityData?.today.taskBreakdown.map((task, index) => ({
    name: task.title,
    value: task.timeSpent,
    project: task.projectName,
    status: task.status,
    isCompleted: task.isCompleted,
    color: COLORS[index % COLORS.length]
  })) || [];

  // Prepare hourly breakdown data
  const hourlyData = productivityData?.today.hourlyBreakdown.map(item => ({
    hour: `${item.hour}:00`,
    timeSpent: item.timeSpent / 60, // Convert to minutes for better visualization
  })) || [];

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/productivity" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  const todayData = productivityData?.today;
  const weekData = productivityData?.thisWeek;

  return (
    <div className="flex h-screen">
      <Sidebar currentPath="/dashboard/productivity" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Productivity Tracking</h1>
                <p className="text-gray-600 mt-1">Monitor your daily task completion and time spent</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Tasks Worked On</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-500" />
                    <span className="text-2xl font-bold">{todayData?.totalTasksWorkedOn || 0}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Tasks Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-2xl font-bold">{todayData?.totalTasksCompleted || 0}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Time Worked</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-orange-500" />
                    <span className="text-2xl font-bold">{formatTime(todayData?.totalTimeWorked || 0)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Today</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Weekly Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-500" />
                    <span className="text-2xl font-bold">{weekData?.completedTasks || 0}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Tasks this week</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Task Time Distribution Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Time Distribution by Task</CardTitle>
                  <CardDescription>
                    Time spent on each task today ({format(new Date(selectedDate), "MMM d, yyyy")})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {taskPieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={taskPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${formatTime(value)}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {taskPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [formatTime(value), "Time Spent"]}
                          labelFormatter={(label) => `Task: ${label}`}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <div className="text-center">
                        <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No task activity for this date</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Hourly Activity Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Hourly Activity</CardTitle>
                  <CardDescription>
                    Time spent working each hour of the day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hourlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value: number) => [`${Math.round(value)} min`, "Time Worked"]}
                        />
                        <Bar dataKey="timeSpent" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      <div className="text-center">
                        <TrendingUp className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No hourly activity data</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Task Details Table */}
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
                <CardDescription>
                  Detailed breakdown of tasks worked on today
                </CardDescription>
              </CardHeader>
              <CardContent>
                {todayData?.taskBreakdown.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Time Spent</TableHead>
                        <TableHead className="text-center">Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayData.taskBreakdown.map((task) => (
                        <TableRow key={task.taskId}>
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell>{task.projectName}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={task.status === 'completed' ? 'default' : 'secondary'}
                              className={
                                task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                task.status === 'review' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }
                            >
                              {task.status === 'in_progress' ? 'In Progress' :
                               task.status === 'todo' ? 'To Do' :
                               task.status === 'review' ? 'Review' :
                               task.status === 'completed' ? 'Completed' : task.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatTimeDetailed(task.timeSpent)}
                          </TableCell>
                          <TableCell className="text-center">
                            {task.isCompleted ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <div className="w-4 h-4 border border-gray-300 rounded mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No tasks worked on this date</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}