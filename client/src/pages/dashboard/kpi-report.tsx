
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download, FileText, FileSpreadsheet, FileDown, Calendar, User, Building2, TrendingUp } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";

interface StaffMember {
  id: number;
  name: string;
  email: string;
  specialization: string;
  role: string;
}

interface DailyProductivity {
  date: string;
  totalSpanHours: number;
  actualWorkHours: number;
  performanceStatus: 'poor' | 'fair' | 'good';
  performanceColor: string;
  taskCount: number;
  tasks: string[];
}

interface WeeklyData {
  day: string;
  hours: number;
  totalSpanHours: number;
  performanceStatus: string;
  performanceColor: string;
}

interface ProductivityData {
  dailyData: DailyProductivity[];
  weeklyData: WeeklyData[];
  summary: {
    totalDays: number;
    avgHoursPerDay: number;
    goodDays: number;
    fairDays: number;
    poorDays: number;
  };
}

const departments = [
  { value: "technical_support", label: "Technical Support" },
  { value: "development", label: "Development" },
  { value: "design", label: "Design" },
  { value: "media_buying", label: "Media Buying" },
  { value: "copywriting", label: "Copywriting" },
  { value: "automation", label: "Automation" },
  { value: "community_manager", label: "Community Manager" },
  { value: "project_manager", label: "Project Manager" },
  { value: "product_owner", label: "Product Owner" },
  { value: "replit_development", label: "Replit Development" }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'good': return 'bg-green-100 text-green-800';
    case 'fair': return 'bg-yellow-100 text-yellow-800';
    case 'poor': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const formatTime = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
};

function DailyProductivityRow({ day }: { day: DailyProductivity }) {
  const [showAllTasks, setShowAllTasks] = useState(false);
  const displayTasks = showAllTasks ? day.tasks : day.tasks.slice(0, 3);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {format(new Date(day.date), "MMM dd, yyyy")}
      </TableCell>
      <TableCell>{formatTime(day.totalSpanHours)}</TableCell>
      <TableCell className="font-medium">
        {formatTime(day.actualWorkHours)}
      </TableCell>
      <TableCell className="w-[250px]">
        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-900 block">
            {day.taskCount} task{day.taskCount !== 1 ? 's' : ''}
          </span>
          {day.tasks.length > 0 && (
            <div className="space-y-1">
              {displayTasks.map((task, taskIndex) => (
                <div 
                  key={taskIndex}
                  className="text-xs text-gray-600 break-words"
                  style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                >
                  • {task}
                </div>
              ))}
              {day.tasks.length > 3 && (
                <button
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
                >
                  {showAllTasks 
                    ? '↑ Show Less' 
                    : `↓ Show ${day.tasks.length - 3} More`
                  }
                </button>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge className={getStatusColor(day.performanceStatus)}>
          {day.performanceStatus.charAt(0).toUpperCase() + day.performanceStatus.slice(1)}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export default function KPIReportPage() {
  const { user } = useAuth();
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedStaff, setSelectedStaff] = useState<string>("");
  const [dateRange, setDateRange] = useState<number>(30); // Last 30 days

  // Check if user is operations manager or team lead
  if (user?.role !== "operations_manager" && user?.role !== "team_lead" && user?.specialization !== "operations_manager") {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/kpi-report" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-600">Only operations managers and team leads can access KPI reports.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get staff members for selected department
  const { data: staffMembers = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff", selectedDepartment],
    queryFn: async () => {
      if (!selectedDepartment) return [];
      const response = await fetch(`/api/staff?specialization=${selectedDepartment}`);
      if (!response.ok) throw new Error("Failed to fetch staff");
      return response.json();
    },
    enabled: !!selectedDepartment,
  });

  // Get productivity data for selected staff
  const { data: productivityData, isLoading: isLoadingProductivity } = useQuery<ProductivityData>({
    queryKey: ["/api/kpi-report/productivity", selectedStaff, dateRange],
    queryFn: async () => {
      if (!selectedStaff) return null;
      
      const endDate = new Date();
      const startDate = subDays(endDate, dateRange);
      
      const response = await fetch(
        `/api/kpi-report/productivity?staffId=${selectedStaff}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch productivity data");
      return response.json();
    },
    enabled: !!selectedStaff,
  });

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (!selectedStaff || !productivityData) return;

    try {
      const staffMember = staffMembers.find(s => s.id.toString() === selectedStaff);
      const response = await fetch('/api/kpi-report/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format,
          staffId: selectedStaff,
          staffName: staffMember?.name,
          department: selectedDepartment,
          dateRange,
          productivityData,
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kpi-report-${staffMember?.name}-${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const selectedStaffMember = staffMembers.find(s => s.id.toString() === selectedStaff);

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath="/dashboard/kpi-report" />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-6 w-full">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">KPI Report</h1>
                <p className="text-gray-600 mt-1">Employee performance and productivity tracking</p>
              </div>
              {selectedStaff && productivityData && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleExport('csv')}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button
                    onClick={() => handleExport('excel')}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button
                    onClick={() => handleExport('pdf')}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              )}
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Filter & Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Department
                    </label>
                    <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.value} value={dept.value}>
                            {dept.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Employee
                    </label>
                    <Select 
                      value={selectedStaff} 
                      onValueChange={setSelectedStaff}
                      disabled={!selectedDepartment}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffMembers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id.toString()}>
                            {staff.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Date Range
                    </label>
                    <Select value={dateRange.toString()} onValueChange={(value) => setDateRange(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="14">Last 14 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="60">Last 60 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedStaffMember && (
                    <div className="flex flex-col justify-end">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-blue-900">{selectedStaffMember.name}</p>
                            <p className="text-xs text-blue-600">{selectedStaffMember.specialization}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Productivity Summary */}
            {productivityData && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Days</p>
                        <p className="text-2xl font-bold">{productivityData.summary.totalDays}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Avg Hours/Day</p>
                        <p className="text-2xl font-bold">{productivityData.summary.avgHoursPerDay.toFixed(1)}h</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Good Days</p>
                        <p className="text-2xl font-bold text-green-600">{productivityData.summary.goodDays}</p>
                      </div>
                      <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                        <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Poor Days</p>
                        <p className="text-2xl font-bold text-red-600">{productivityData.summary.poorDays}</p>
                      </div>
                      <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                        <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Weekly Activity Chart */}
            {productivityData?.weeklyData && (
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Activity Tracking</CardTitle>
                  <CardDescription>
                    Daily productivity trend for {selectedStaffMember?.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={productivityData.weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)} hours`,
                          name === "hours" ? "Actual Work" : "Total Span"
                        ]}
                        labelFormatter={(label) => `Day: ${label}`}
                      />
                      <Bar dataKey="totalSpanHours" fill="#94A3B8" name="Total Span" />
                      <Bar dataKey="hours" fill="#3b82f6" name="Actual Work" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Tabbed Content - Productivity Score & Daily Details */}
            {productivityData && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Performance Analysis</CardTitle>
                      <CardDescription>
                        Detailed productivity metrics and daily breakdown
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="productivity" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="productivity">Productivity Score</TabsTrigger>
                      <TabsTrigger value="daily">Daily Productivity Details</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Productivity Score */}
                    <TabsContent value="productivity" className="space-y-4">
                      <div className="mt-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Task Name</TableHead>
                              <TableHead>Assigned Time</TableHead>
                              <TableHead>Actual Time Spent</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productivityData.dailyData.flatMap(day => 
                              day.tasks.map((taskName, idx) => {
                                const task = productivityData.dailyData
                                  .find(d => d.date === day.date)
                                  ?.tasks[idx];
                                
                                // Get assigned time from task breakdown
                                const assignedMinutes = ((day as any).taskBreakdown?.[idx]?.workingHours || 0) * 60 + 
                                                       ((day as any).taskBreakdown?.[idx]?.workingMinutes || 0);
                                const actualMinutes = Math.floor(((day as any).taskBreakdown?.[idx]?.timeSpent || 0) / 60);
                                
                                const formatMinutes = (minutes: number) => {
                                  const hours = Math.floor(minutes / 60);
                                  const mins = minutes % 60;
                                  return hours > 0 ? `${minutes} minutes (${hours}hr${mins > 0 ? ` ${mins}m` : ''})` : `${minutes} minutes`;
                                };

                                return (
                                  <TableRow key={`${day.date}-${idx}`}>
                                    <TableCell className="font-medium">{taskName}</TableCell>
                                    <TableCell>{formatMinutes(assignedMinutes)}</TableCell>
                                    <TableCell>{formatMinutes(actualMinutes)}</TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                            <TableRow className="font-bold bg-gray-50">
                              <TableCell>Total</TableCell>
                              <TableCell>
                                {(() => {
                                  const totalAssigned = productivityData.dailyData.reduce((sum, day) => {
                                    return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                      taskSum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0) || 0);
                                  }, 0);
                                  return totalAssigned;
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const totalActual = productivityData.dailyData.reduce((sum, day) => {
                                    return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                      taskSum + Math.floor((task.timeSpent || 0) / 60), 0) || 0);
                                  }, 0);
                                  return totalActual;
                                })()}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                        {/* Productivity Calculation */}
                        <div className="mt-6 p-6 bg-blue-50 rounded-lg">
                          <div className="text-center space-y-4">
                            <div className="text-lg font-semibold text-gray-900">
                              Productivity Calculation
                            </div>
                            <div className="flex items-center justify-center gap-2 text-2xl font-mono">
                              <span>Productivity % = </span>
                              <span className="inline-flex items-center">
                                (<span className="mx-1">
                                  {(() => {
                                    const totalAssigned = productivityData.dailyData.reduce((sum, day) => {
                                      return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                        taskSum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0) || 0);
                                    }, 0);
                                    return totalAssigned;
                                  })()}
                                </span>)
                              </span>
                              <span>/</span>
                              <span className="inline-flex items-center">
                                (<span className="mx-1">
                                  {(() => {
                                    const totalActual = productivityData.dailyData.reduce((sum, day) => {
                                      return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                        taskSum + Math.floor((task.timeSpent || 0) / 60), 0) || 0);
                                    }, 0);
                                    return totalActual;
                                  })()}
                                </span>)
                              </span>
                              <span>× 100 = </span>
                              <span className="text-blue-600 font-bold">
                                {(() => {
                                  const totalAssigned = productivityData.dailyData.reduce((sum, day) => {
                                    return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                      taskSum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0) || 0);
                                  }, 0);
                                  const totalActual = productivityData.dailyData.reduce((sum, day) => {
                                    return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                      taskSum + Math.floor((task.timeSpent || 0) / 60), 0) || 0);
                                  }, 0);
                                  const productivity = totalActual > 0 ? Math.round((totalAssigned / totalActual) * 100) : 0;
                                  return productivity;
                                })()}%
                              </span>
                            </div>
                            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                              <span className="inline-flex items-center gap-1">
                                ℹ️ This means the worker was
                                <span className="font-semibold text-blue-600">
                                  {(() => {
                                    const totalAssigned = productivityData.dailyData.reduce((sum, day) => {
                                      return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                        taskSum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0) || 0);
                                    }, 0);
                                    const totalActual = productivityData.dailyData.reduce((sum, day) => {
                                      return sum + ((day as any).taskBreakdown?.reduce((taskSum: number, task: any) => 
                                        taskSum + Math.floor((task.timeSpent || 0) / 60), 0) || 0);
                                    }, 0);
                                    const productivity = totalActual > 0 ? Math.round((totalAssigned / totalActual) * 100) : 0;
                                    return productivity >= 100 ? "more efficient" : "less efficient";
                                  })()}
                                </span>
                                than expected.
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Tab 2: Daily Productivity Details */}
                    <TabsContent value="daily" className="space-y-4">
                      {/* Status Legend - Moved to top */}
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Performance Status Legend</h4>
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
                              <div className="text-gray-600">2 to 4 hours worked</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-green-500"></div>
                            <div className="text-sm">
                              <div className="font-medium text-green-700">Good</div>
                              <div className="text-gray-600">4 hours or more worked</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {isLoadingProductivity ? (
                        <div className="flex items-center justify-center p-8">
                          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Total Span</TableHead>
                              <TableHead>Actual Work</TableHead>
                              <TableHead className="w-[250px]">Tasks</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...productivityData.dailyData]
                              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                              .map((day, index) => (
                                <DailyProductivityRow key={index} day={day} />
                              ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* No Data State */}
            {!selectedStaff && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Employee</h3>
                    <p className="text-gray-600">
                      Choose a department and employee to view their KPI report and productivity data.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
