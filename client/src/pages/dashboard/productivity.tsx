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
import { ProductivityCard } from "@/components/ui/productivity-card";

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
    workingHours?: number;
  }[];
  weeklyBreakdown: {
    day: string;
    dayName: string;
    timeSpent: number; // in seconds
    hours: number;
    taskCount: number;
    tasks: string[];
    workdayStart: string | null;
    workdayEnd: string | null;
    totalSpanHours: number;
    performanceStatus: string;
    performanceColor: string;
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

// Color scheme based on task time tracking status
const getTaskStatusColor = (task: any, workingHours?: number) => {
  if (!task || typeof task.timeSpent !== 'number') {
    return '#6B7280'; // Gray for invalid task data
  }
  
  if (!workingHours || workingHours <= 0) {
    return '#6B7280'; // Gray for tasks without time allocation
  }
  
  const allocatedTimeInSeconds = workingHours * 3600;
  const timeUsedPercentage = (task.timeSpent / allocatedTimeInSeconds) * 100;
  
  // Red: Poor (over 100%)
  if (timeUsedPercentage > 100) {
    return '#EF4444'; // Red
  }
  
  // Yellow: Fair (80-99% of allocated time)
  if (timeUsedPercentage >= 80 && timeUsedPercentage <= 99) {
    return '#EAB308'; // Yellow
  }
  
  // Green: Good - Completed within time or in progress with good time management
  if (task.isCompleted || timeUsedPercentage < 80) {
    return '#22C55E'; // Green
  }
  
  return '#6B7280'; // Default gray
};

const getStatusLabel = (task: any, workingHours?: number) => {
  if (!task || typeof task.timeSpent !== 'number') {
    return 'Invalid Data';
  }
  
  if (!workingHours || workingHours <= 0) {
    return 'No Time Allocation';
  }
  
  const allocatedTimeInSeconds = workingHours * 3600;
  const timeUsedPercentage = (task.timeSpent / allocatedTimeInSeconds) * 100;
  
  if (timeUsedPercentage > 100) {
    return 'Poor';
  }
  
  if (timeUsedPercentage >= 80 && timeUsedPercentage <= 99) {
    return 'Fair';
  }
  
  if (task.isCompleted || timeUsedPercentage < 80) {
    return 'Good';
  }
  
  return 'Unknown';
};

export default function ProductivityPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: productivityData, isLoading, error, refetch } = useQuery<ProductivityStats>({
    queryKey: ["/api/productivity", selectedDate],
    queryFn: async () => {
      console.log("Fetching productivity data for date:", selectedDate);
      const response = await fetch(`/api/productivity?date=${selectedDate}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Productivity API error:", response.status, errorText);
        throw new Error(`Failed to fetch productivity data: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      console.log("Productivity data received:", data);
      
      // Validate and sanitize the data
      const sanitizedData = {
        today: {
          totalTasksWorkedOn: data?.today?.totalTasksWorkedOn || 0,
          totalTasksCompleted: data?.today?.totalTasksCompleted || 0,
          totalTimeWorked: data?.today?.totalTimeWorked || 0,
          taskBreakdown: Array.isArray(data?.today?.taskBreakdown) ? data.today.taskBreakdown : [],
          weeklyBreakdown: Array.isArray(data?.today?.weeklyBreakdown) ? data.today.weeklyBreakdown : []
        },
        yesterday: data?.yesterday || { totalTasksWorkedOn: 0, totalTasksCompleted: 0, totalTimeWorked: 0, taskBreakdown: [], weeklyBreakdown: [] },
        thisWeek: data?.thisWeek || { totalTasks: 0, completedTasks: 0, totalTime: 0 }
      };
      
      return sanitizedData;
    },
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10 seconds for live timer updates
    retry: 3,
    retryDelay: 1000,
  });

  // Force refresh when date changes or when returning to the page
  React.useEffect(() => {
    if (user) {
      refetch();
    }
  }, [selectedDate, user, refetch]);

  // Log any query errors
  if (error) {
    console.error("Productivity query error:", error);
  }

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

  // Prepare pie chart data for tasks worked on today with dynamic colors
  const taskPieData = productivityData?.today?.taskBreakdown?.filter(task => 
    task && task.title && typeof task.timeSpent === 'number' && task.timeSpent > 0
  ).map((task, index) => {
    // Note: You may need to add workingHours to the task data from the API
    // For now, we'll use a placeholder or derive from existing data
    const workingHours = (task as any).workingHours || 8; // Default to 8 hours if not provided
    
    return {
      name: task.title || `Task ${index + 1}`,
      value: task.timeSpent || 0,
      project: task.projectName || 'Unknown Project',
      status: task.status || 'unknown',
      isCompleted: Boolean(task.isCompleted),
      color: getTaskStatusColor(task, workingHours),
      statusLabel: getStatusLabel(task, workingHours),
      workingHours: workingHours,
      timeUsedPercentage: workingHours > 0 ? Math.round((task.timeSpent / (workingHours * 3600)) * 100) : 0
    };
  }) || [];

  // Prepare weekly breakdown data
  const weeklyData = productivityData?.today?.weeklyBreakdown?.filter(item => 
    item && item.dayName && typeof item.hours === 'number'
  ).map(item => ({
    day: item.dayName || 'Unknown',
    hours: Math.max(0, item.hours || 0),
    timeSpent: Math.max(0, item.timeSpent || 0),
    taskCount: Math.max(0, item.taskCount || 0),
    tasks: Array.isArray(item.tasks) ? item.tasks : [],
    workdayStart: item.workdayStart || null,
    workdayEnd: item.workdayEnd || null,
    totalSpanHours: Math.max(0, item.totalSpanHours || item.hours || 0),
    performanceStatus: item.performanceStatus || 'poor',
    performanceColor: item.performanceColor || '#6B7280'
  })) || [];

  // Calculate productivity metrics for the productivity card
  const totalAssignedTime = productivityData?.today?.taskBreakdown?.reduce((total, task) => {
    // Get working hours from task or estimate based on task status and complexity
    const workingHours = (task as any).workingHours || 
      (task.status === 'completed' ? Math.max(task.timeSpent / 3600, 1) : // If completed, use actual time or minimum 1 hour
       task.timeSpent > 0 ? Math.max(task.timeSpent / 3600 * 1.25, 2) : // If in progress, estimate 25% more than current time, minimum 2 hours
       3); // Default estimate for new tasks
    return total + (workingHours * 3600);
  }, 0) || 0;
  
  const totalActualTime = productivityData?.today?.totalTimeWorked || 0;

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

  // Add error handling for missing data
  if (!productivityData) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/productivity" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500">No productivity data available</p>
              <p className="text-sm text-gray-400 mt-2">Try refreshing the page or check your connection</p>
            </div>
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

            {/* Productivity Card */}
            <div className="mb-6">
              <ProductivityCard
                assignedTime={totalAssignedTime}
                actualTime={totalActualTime}
                taskCount={todayData?.totalTasksWorkedOn || 0}
                period={`${format(new Date(selectedDate), "MMM d, yyyy")}`}
              />
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
                          label={({ name, value, timeUsedPercentage }) => 
                            `${name}: ${formatTime(value || 0)} (${timeUsedPercentage || 0}%)`
                          }
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {taskPieData.map((entry, index) => (
                            <Cell key={`pie-cell-${entry.name}-${index}`} fill={entry.color || '#8884d8'} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => {
                            const timeUsedPercentage = props?.payload?.timeUsedPercentage || 0;
                            return [
                              formatTime(value || 0), 
                              `Time Spent (${timeUsedPercentage}% of allocated)`
                            ];
                          }}
                          labelFormatter={(label, payload) => {
                            if (payload && payload.length > 0 && payload[0].payload) {
                              const data = payload[0].payload;
                              const safeLabel = label || data.name || 'Unknown Task';
                              const statusLabel = data.statusLabel || 'Unknown';
                              const workingHours = data.workingHours || 0;
                              
                              return (
                                <div>
                                  <div className="font-medium">{safeLabel}</div>
                                  <div className="text-sm text-gray-600">
                                    Status: {statusLabel}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Allocated: {formatTime(workingHours * 3600)}
                                  </div>
                                </div>
                              );
                            }
                            return `Task: ${label || 'Unknown'}`;
                          }}
                        />
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
                
                {/* Color Legend */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Time Tracking Status Legend</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-red-500"></div>
                      <div className="text-sm">
                        <div className="font-medium text-red-700">Poor</div>
                        <div className="text-gray-600">Over 100% of allocated time</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                      <div className="text-sm">
                        <div className="font-medium text-yellow-700">Fair</div>
                        <div className="text-gray-600">80-99% of allocated time</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-green-500"></div>
                      <div className="text-sm">
                        <div className="font-medium text-green-700">Good</div>
                        <div className="text-gray-600">Under 80% or completed on time</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Weekly Activity Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Activity Tracking</CardTitle>
                  <CardDescription>
                    Workday span and performance for each day (Monday to Friday)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {weeklyData.length > 0 ? (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={weeklyData} margin={{ top: 40, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="day" 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
                            tick={{ fontSize: 12 }}
                            domain={[0, 'dataMax']}
                          />
                          <Tooltip 
                            formatter={(value: number, name: string, props: any) => {
                              const data = props?.payload;
                              const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
                              const displayName = name === 'totalSpanHours' ? 'Total Span' : 
                                                name === 'hours' ? 'Actual Work Hours' : name;
                              return [
                                `${safeValue.toFixed(2)} hours`,
                                displayName
                              ];
                            }}
                            labelFormatter={(label, payload) => {
                              if (payload && payload.length > 0 && payload[0].payload) {
                                const data = payload[0].payload;
                                const safeLabel = label || data.day || 'Unknown Day';
                                
                                const formatTime = (isoString: string | null) => {
                                  if (!isoString) return 'N/A';
                                  try {
                                    return new Date(isoString).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    });
                                  } catch (e) {
                                    return 'Invalid time';
                                  }
                                };
                                
                                const performanceStatus = data.performanceStatus || 'unknown';
                                const hours = data.hours || 0;
                                const totalSpanHours = data.totalSpanHours || 0;
                                const taskCount = data.taskCount || 0;
                                const tasks = data.tasks || [];
                                
                                return (
                                  <div className="space-y-2">
                                    <div className="font-medium">{safeLabel}</div>
                                    
                                    {data.workdayStart && data.workdayEnd ? (
                                      <div className="text-sm text-gray-600">
                                        <div><strong>Started:</strong> {formatTime(data.workdayStart)}</div>
                                        <div><strong>Ended:</strong> {formatTime(data.workdayEnd)}</div>
                                        <div><strong>Total Span:</strong> {totalSpanHours.toFixed(2)}h</div>
                                        <div><strong>Actual Work:</strong> {hours.toFixed(2)}h</div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-600">
                                        No timer activity recorded
                                      </div>
                                    )}
                                    
                                    <div className="text-sm text-gray-600">
                                      <div><strong>Tasks worked on:</strong> {taskCount}</div>
                                      {tasks && tasks.length > 0 && (
                                        <div className="mt-1">
                                          <div className="font-medium">Tasks:</div>
                                          {tasks.slice(0, 3).map((task: string, index: number) => (
                                            <div key={index} className="text-xs">• {task || 'Untitled Task'}</div>
                                          ))}
                                          {tasks.length > 3 && (
                                            <div className="text-xs text-gray-500">
                                              +{tasks.length - 3} more tasks
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className={`text-sm font-medium px-2 py-1 rounded text-center ${
                                      performanceStatus === 'good' ? 'bg-green-100 text-green-800' :
                                      performanceStatus === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      Performance: {performanceStatus && typeof performanceStatus === 'string' 
                                        ? performanceStatus.charAt(0).toUpperCase() + performanceStatus.slice(1) 
                                        : 'Unknown'}
                                    </div>
                                  </div>
                                );
                              }
                              return label || 'Unknown';
                            }}
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #ccc',
                              borderRadius: '6px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                              maxWidth: '300px'
                            }}
                          />
                          <Bar 
                            dataKey="totalSpanHours" 
                            fill="#E5E7EB"
                            radius={[4, 4, 0, 0]}
                            name="Total Span"
                          />
                          <Bar 
                            dataKey="hours" 
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                            name="Actual Work"
                          />
                          
                          {/* Performance status indicators above bars */}
                          {weeklyData.map((entry, index) => {
                            if (entry && entry.hours > 0 && entry.performanceStatus) {
                              const statusText = typeof entry.performanceStatus === 'string' 
                                ? entry.performanceStatus.toUpperCase() 
                                : 'UNKNOWN';
                              
                              return (
                                <text
                                  key={index}
                                  x={`${(index + 0.5) * (100 / weeklyData.length)}%`}
                                  y={30}
                                  textAnchor="middle"
                                  fontSize={10}
                                  fontWeight="bold"
                                  fill={entry.performanceColor || '#666'}
                                >
                                  {statusText}
                                </text>
                              );
                            }
                            return null;
                          })}
                        </BarChart>
                      </ResponsiveContainer>
                      
                      {/* Performance Legend */}
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Daily Performance Status Legend</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-red-500"></div>
                            <div className="text-sm">
                              <div className="font-medium text-red-700">Poor</div>
                              <div className="text-gray-600">Less than 2 hours worked</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                            <div className="text-sm">
                              <div className="font-medium text-yellow-700">Fair</div>
                              <div className="text-gray-600">2-4 hours worked</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-green-500"></div>
                            <div className="text-sm">
                              <div className="font-medium text-green-700">Good</div>
                              <div className="text-gray-600">4+ hours worked</div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-gray-500">
                          <strong>Note:</strong> Light gray bars show total workday span (first timer start to last timer end). 
                          Blue bars show actual work hours. Performance is based on actual work hours.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[350px] text-gray-500">
                      <div className="text-center">
                        <TrendingUp className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No weekly activity data</p>
                        <p className="text-sm mt-1">Start some timers to see your weekly progress</p>
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
                            <div className="flex flex-col gap-1">
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
                              {(() => {
                                const workingHours = (task as any).workingHours || 8;
                                const timeUsedPercentage = workingHours > 0 ? (task.timeSpent / (workingHours * 3600)) * 100 : 0;
                                const statusLabel = getStatusLabel(task, workingHours);
                                const statusColor = 
                                  timeUsedPercentage > 100 ? 'bg-red-100 text-red-800' :
                                  timeUsedPercentage >= 80 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800';
                                
                                return (
                                  <Badge variant="secondary" className={`text-xs ${statusColor}`}>
                                    {statusLabel} ({Math.round(timeUsedPercentage)}%)
                                  </Badge>
                                );
                              })()}
                            </div>
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