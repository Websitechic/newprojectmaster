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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download, FileText, FileSpreadsheet, FileDown, Calendar, User, Building2, TrendingUp, Users } from "lucide-react";
import { format, subDays, subMonths, startOfWeek, endOfWeek } from "date-fns";
import * as XLSX from 'xlsx';

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
  taskBreakdown?: Array<{
    id: number;
    title: string;
    timeSpent: number;
    workingHours?: number;
    workingMinutes?: number;
    isCompleted: boolean;
  }>;
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
  
  // Get tasks from multiple sources with fallbacks
  const tasksList = 
    day.taskBreakdown?.map(t => t.title).filter(Boolean) || 
    day.tasks?.filter(Boolean) || 
    [];
  
  const taskCount = day.taskCount || tasksList.length;
  const displayTasks = showAllTasks ? tasksList : tasksList.slice(0, 3);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {format(new Date(day.date), "MMM dd, yyyy")}
      </TableCell>
      <TableCell>{formatTime(day.totalSpanHours)}</TableCell>
      <TableCell className="w-[250px]">
        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-900 block">
            {taskCount} task{taskCount !== 1 ? 's' : ''}
          </span>
          {tasksList.length > 0 ? (
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
              {tasksList.length > 3 && (
                <button
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
                >
                  {showAllTasks 
                    ? '↑ Show Less' 
                    : `↓ Show ${tasksList.length - 3} More`
                  }
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No tasks recorded</div>
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
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [useCustomRange, setUseCustomRange] = useState(false);

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
      const data = await response.json();
      
      // Filter to only show staff whose specialization matches the selected department
      // This prevents team leads and customer support officers from appearing under wrong departments
      return data.filter((staff: StaffMember) => staff.specialization === selectedDepartment);
    },
    enabled: !!selectedDepartment,
  });

  // Get productivity data for selected staff
  const { data: productivityData, isLoading: isLoadingProductivity } = useQuery<ProductivityData>({
    queryKey: ["/api/kpi-report/productivity", selectedStaff, dateRange, customStartDate, customEndDate, useCustomRange],
    queryFn: async () => {
      if (!selectedStaff) return null;

      let endDate: Date;
      let startDate: Date;

      if (useCustomRange && customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        endDate = new Date();
        startDate = subDays(endDate, dateRange);
      }

      const response = await fetch(
        `/api/kpi-report/productivity?staffId=${selectedStaff}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch productivity data");
      return response.json();
    },
    enabled: !!selectedStaff,
  });

  const formatTimeForExport = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h} hr ${m}m`;
  };

  const formatMinutesForExport = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} hr ${m}m`;
  };

  const handleExportSingleUser = () => {
    if (!selectedStaff || !productivityData) return;

    const staffMember = staffMembers.find(s => s.id.toString() === selectedStaff);
    if (!staffMember) return;

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Get unique tasks for the period
    const allTasks = new Map();
    productivityData.dailyData.forEach((day: any) => {
      if (day.taskBreakdown) {
        day.taskBreakdown.forEach((task: any) => {
          if (!allTasks.has(task.id)) {
            allTasks.set(task.id, task);
          }
        });
      }
    });

    // Calculate totals
    const totalAssignedMinutes = Array.from(allTasks.values()).reduce((sum: number, task: any) => 
      sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
    const totalActualMinutes = Array.from(allTasks.values()).reduce((sum: number, task: any) => 
      sum + Math.floor((task.timeSpent || 0) / 60), 0);
    const productivity = totalActualMinutes > 0 ? Math.round((totalAssignedMinutes / totalActualMinutes) * 100) : 0;

    // Build data array matching reference format
    const data: any[][] = [];
    
    // Title row
    data.push(['STAFF PERFORMANCE REPORT']);
    data.push([]);
    
    // Staff info section
    data.push(['Staff Name:', staffMember.name]);
    data.push(['Department:', selectedDepartment.replace(/_/g, ' ').toUpperCase()]);
    data.push(['Report Period:', useCustomRange && customStartDate && customEndDate 
      ? `${format(customStartDate, 'MMM dd, yyyy')} - ${format(customEndDate, 'MMM dd, yyyy')}`
      : `Last ${dateRange} Days`]);
    data.push(['Generated:', format(new Date(), 'MMM dd, yyyy HH:mm')]);
    data.push([]);
    
    // Summary section
    data.push(['PERFORMANCE SUMMARY']);
    data.push(['Metric', 'Value']);
    data.push(['Total Working Days', productivityData.summary.totalDays]);
    data.push(['Average Daily Hours', formatTimeForExport((() => {
      const totalMinutes = productivityData.dailyData.reduce((sum, day) => sum + (day.totalSpanHours * 60), 0);
      return totalMinutes / productivityData.summary.totalDays / 60;
    })())]);
    data.push(['Good Performance Days', productivityData.summary.goodDays]);
    data.push(['Fair Performance Days', productivityData.summary.fairDays]);
    data.push(['Poor Performance Days', productivityData.summary.poorDays]);
    data.push(['Productivity Score', `${productivity}%`]);
    data.push([]);
    
    // Daily breakdown header
    data.push(['DAILY PERFORMANCE BREAKDOWN']);
    data.push(['Date', 'Total Hours Worked', 'Tasks Completed', 'Performance Status']);
    
    // Daily data sorted by date (newest first)
    const sortedDailyData = [...productivityData.dailyData].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    sortedDailyData.forEach(day => {
      const tasksList = day.taskBreakdown?.map(t => t.title).filter(Boolean) || 
                       day.tasks?.filter(Boolean) || [];
      const tasksDisplay = tasksList.length > 0 
        ? `${tasksList.length} task(s): ${tasksList.join(', ')}` 
        : 'No tasks recorded';
      
      data.push([
        format(new Date(day.date), 'EEE, MMM dd, yyyy'),
        formatTimeForExport(day.totalSpanHours),
        tasksDisplay,
        day.performanceStatus.toUpperCase()
      ]);
    });
    
    data.push([]);
    data.push([]);
    
    // Task breakdown section
    data.push(['TASK-LEVEL ANALYSIS']);
    data.push(['Task Name', 'Assigned Time', 'Actual Time', 'Efficiency', 'Status']);
    
    const taskRows = Array.from(allTasks.values())
      .sort((a: any, b: any) => a.title.localeCompare(b.title))
      .map((task: any) => {
        const assignedMinutes = (task.workingHours || 0) * 60 + (task.workingMinutes || 0);
        const actualMinutes = Math.floor((task.timeSpent || 0) / 60);
        
        let status = 'On Time';
        let efficiency = '100%';
        
        if (assignedMinutes > 0 && actualMinutes > 0) {
          const taskEfficiency = Math.round((assignedMinutes / actualMinutes) * 100);
          efficiency = `${taskEfficiency}%`;
          
          if (actualMinutes < assignedMinutes) {
            status = 'Early';
          } else if (actualMinutes > assignedMinutes) {
            status = 'Delayed';
          }
        }

        return [
          task.title,
          formatMinutesForExport(assignedMinutes),
          formatMinutesForExport(actualMinutes),
          efficiency,
          status
        ];
      });
    
    taskRows.forEach(row => data.push(row));
    
    // Totals row
    data.push([
      'TOTAL',
      formatMinutesForExport(totalAssignedMinutes),
      formatMinutesForExport(totalActualMinutes),
      `${productivity}%`,
      '-'
    ]);
    
    data.push([]);
    data.push([]);
    
    // Weekly averages if applicable
    if (productivityData.weeklyData && productivityData.weeklyData.length > 0) {
      data.push(['WEEKLY PERFORMANCE TREND']);
      data.push(['Week', 'Average Hours', 'Status']);
      
      // Group by weeks
      const weekGroups = new Map();
      sortedDailyData.forEach(day => {
        const weekStart = startOfWeek(new Date(day.date), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(new Date(day.date), { weekStartsOn: 1 });
        const weekKey = format(weekStart, 'MMM dd') + ' - ' + format(weekEnd, 'MMM dd');
        
        if (!weekGroups.has(weekKey)) {
          weekGroups.set(weekKey, []);
        }
        weekGroups.get(weekKey).push(day);
      });
      
      weekGroups.forEach((days, weekKey) => {
        const totalHours = days.reduce((sum: number, day: any) => sum + day.totalSpanHours, 0);
        const avgHours = totalHours / days.length;
        const goodDays = days.filter((d: any) => d.performanceStatus === 'good').length;
        const status = goodDays >= days.length / 2 ? 'GOOD' : goodDays > 0 ? 'FAIR' : 'POOR';
        
        data.push([
          weekKey,
          formatTimeForExport(avgHours),
          status
        ]);
      });
    }
    
    data.push([]);
    data.push(['Report End']);

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
      { wch: 25 },  // Column A - Labels/Dates
      { wch: 20 },  // Column B - Values/Hours
      { wch: 60 },  // Column C - Tasks/Details
      { wch: 18 },  // Column D - Status/Efficiency
      { wch: 15 }   // Column E - Additional
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, staffMember.name.substring(0, 31));

    // Generate and download file
    const fileName = `Performance-Report-${staffMember.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportAllUsers = async () => {
    if (!selectedDepartment) {
      alert('Please select a department first');
      return;
    }

    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // For each staff member in the department
      for (const staff of staffMembers) {
        // Fetch productivity data for this staff member
        let endDate: Date;
        let startDate: Date;

        if (useCustomRange && customStartDate && customEndDate) {
          startDate = customStartDate;
          endDate = customEndDate;
        } else {
          endDate = new Date();
          startDate = subDays(endDate, dateRange);
        }

        const response = await fetch(
          `/api/kpi-report/productivity?staffId=${staff.id}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        );
        
        if (!response.ok) continue;
        
        const staffProductivityData = await response.json();

        // Get unique tasks for the period
        const allTasks = new Map();
        staffProductivityData.dailyData.forEach((day: any) => {
          if (day.taskBreakdown) {
            day.taskBreakdown.forEach((task: any) => {
              if (!allTasks.has(task.id)) {
                allTasks.set(task.id, task);
              }
            });
          }
        });

        // Calculate totals
        const totalAssignedMinutes = Array.from(allTasks.values()).reduce((sum: number, task: any) => 
          sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
        const totalActualMinutes = Array.from(allTasks.values()).reduce((sum: number, task: any) => 
          sum + Math.floor((task.timeSpent || 0) / 60), 0);
        const productivity = totalActualMinutes > 0 ? Math.round((totalAssignedMinutes / totalActualMinutes) * 100) : 0;

        // Build data array matching reference format
        const data: any[][] = [];
        
        // Title row
        data.push(['STAFF PERFORMANCE REPORT']);
        data.push([]);
        
        // Staff info section
        data.push(['Staff Name:', staff.name]);
        data.push(['Department:', selectedDepartment.replace(/_/g, ' ').toUpperCase()]);
        data.push(['Report Period:', useCustomRange && customStartDate && customEndDate 
          ? `${format(customStartDate, 'MMM dd, yyyy')} - ${format(customEndDate, 'MMM dd, yyyy')}`
          : `Last ${dateRange} Days`]);
        data.push(['Generated:', format(new Date(), 'MMM dd, yyyy HH:mm')]);
        data.push([]);
        
        // Summary section
        data.push(['PERFORMANCE SUMMARY']);
        data.push(['Metric', 'Value']);
        data.push(['Total Working Days', staffProductivityData.summary.totalDays]);
        data.push(['Average Daily Hours', formatTimeForExport((() => {
          const totalMinutes = staffProductivityData.dailyData.reduce((sum: any, day: any) => sum + (day.totalSpanHours * 60), 0);
          return totalMinutes / staffProductivityData.summary.totalDays / 60;
        })())]);
        data.push(['Good Performance Days', staffProductivityData.summary.goodDays]);
        data.push(['Fair Performance Days', staffProductivityData.summary.fairDays]);
        data.push(['Poor Performance Days', staffProductivityData.summary.poorDays]);
        data.push(['Productivity Score', `${productivity}%`]);
        data.push([]);
        
        // Daily breakdown header
        data.push(['DAILY PERFORMANCE BREAKDOWN']);
        data.push(['Date', 'Total Hours Worked', 'Tasks Completed', 'Performance Status']);
        
        // Daily data sorted by date (newest first)
        const sortedDailyData = [...staffProductivityData.dailyData].sort((a: any, b: any) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        
        sortedDailyData.forEach((day: any) => {
          const tasksList = day.taskBreakdown?.map((t: any) => t.title).filter(Boolean) || 
                           day.tasks?.filter(Boolean) || [];
          const tasksDisplay = tasksList.length > 0 
            ? `${tasksList.length} task(s): ${tasksList.join(', ')}` 
            : 'No tasks recorded';
          
          data.push([
            format(new Date(day.date), 'EEE, MMM dd, yyyy'),
            formatTimeForExport(day.totalSpanHours),
            tasksDisplay,
            day.performanceStatus.toUpperCase()
          ]);
        });
        
        data.push([]);
        data.push([]);
        
        // Task breakdown section
        data.push(['TASK-LEVEL ANALYSIS']);
        data.push(['Task Name', 'Assigned Time', 'Actual Time', 'Efficiency', 'Status']);
        
        const taskRows = Array.from(allTasks.values())
          .sort((a: any, b: any) => a.title.localeCompare(b.title))
          .map((task: any) => {
            const assignedMinutes = (task.workingHours || 0) * 60 + (task.workingMinutes || 0);
            const actualMinutes = Math.floor((task.timeSpent || 0) / 60);
            
            let status = 'On Time';
            let efficiency = '100%';
            
            if (assignedMinutes > 0 && actualMinutes > 0) {
              const taskEfficiency = Math.round((assignedMinutes / actualMinutes) * 100);
              efficiency = `${taskEfficiency}%`;
              
              if (actualMinutes < assignedMinutes) {
                status = 'Early';
              } else if (actualMinutes > assignedMinutes) {
                status = 'Delayed';
              }
            }

            return [
              task.title,
              formatMinutesForExport(assignedMinutes),
              formatMinutesForExport(actualMinutes),
              efficiency,
              status
            ];
          });
        
        taskRows.forEach(row => data.push(row));
        
        // Totals row
        data.push([
          'TOTAL',
          formatMinutesForExport(totalAssignedMinutes),
          formatMinutesForExport(totalActualMinutes),
          `${productivity}%`,
          '-'
        ]);
        
        data.push([]);
        data.push([]);
        
        // Weekly averages if applicable
        if (staffProductivityData.weeklyData && staffProductivityData.weeklyData.length > 0) {
          data.push(['WEEKLY PERFORMANCE TREND']);
          data.push(['Week', 'Average Hours', 'Status']);
          
          // Group by weeks
          const weekGroups = new Map();
          sortedDailyData.forEach((day: any) => {
            const weekStart = startOfWeek(new Date(day.date), { weekStartsOn: 1 });
            const weekEnd = endOfWeek(new Date(day.date), { weekStartsOn: 1 });
            const weekKey = format(weekStart, 'MMM dd') + ' - ' + format(weekEnd, 'MMM dd');
            
            if (!weekGroups.has(weekKey)) {
              weekGroups.set(weekKey, []);
            }
            weekGroups.get(weekKey).push(day);
          });
          
          weekGroups.forEach((days: any[], weekKey: string) => {
            const totalHours = days.reduce((sum: number, day: any) => sum + day.totalSpanHours, 0);
            const avgHours = totalHours / days.length;
            const goodDays = days.filter((d: any) => d.performanceStatus === 'good').length;
            const status = goodDays >= days.length / 2 ? 'GOOD' : goodDays > 0 ? 'FAIR' : 'POOR';
            
            data.push([
              weekKey,
              formatTimeForExport(avgHours),
              status
            ]);
          });
        }
        
        data.push([]);
        data.push(['Report End']);

        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
          { wch: 25 },  // Column A - Labels/Dates
          { wch: 20 },  // Column B - Values/Hours
          { wch: 60 },  // Column C - Tasks/Details
          { wch: 18 },  // Column D - Status/Efficiency
          { wch: 15 }   // Column E - Additional
        ];

        // Add worksheet to workbook - use staff name as sheet name (max 31 chars)
        const sheetName = staff.name.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      // Generate and download file
      const fileName = `Department-Performance-Report-${selectedDepartment}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
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
              <div className="flex gap-2">
                {selectedStaff && productivityData && (
                  <Button
                    onClick={handleExportSingleUser}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export to Excel
                  </Button>
                )}
                {selectedDepartment && staffMembers.length > 0 && (
                  <Button
                    onClick={handleExportAllUsers}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Users className="h-4 w-4" />
                    Export All Users
                  </Button>
                )}
              </div>
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
                    <div className="flex gap-2">
                      <Select 
                        value={useCustomRange ? "custom" : dateRange.toString()} 
                        onValueChange={(value) => {
                          if (value === "custom") {
                            setUseCustomRange(true);
                          } else {
                            setUseCustomRange(false);
                            setDateRange(parseInt(value));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Last 7 Days</SelectItem>
                          <SelectItem value="14">Last 14 Days</SelectItem>
                          <SelectItem value="30">Last Month</SelectItem>
                          <SelectItem value="60">Last 2 Months</SelectItem>
                          <SelectItem value="180">Last 6 Months</SelectItem>
                          <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-1 max-w-[200px]" align="start">
                          <div className="space-y-1">
                            <div>
                              <label className="text-[8px] font-medium mb-0 block text-gray-700">Start Date</label>
                              <CalendarComponent
                                mode="single"
                                selected={customStartDate}
                                onSelect={(date) => {
                                  setCustomStartDate(date);
                                  setUseCustomRange(true);
                                }}
                                className="p-0"
                              />
                            </div>
                            <div className="border-t pt-1">
                              <label className="text-[8px] font-medium mb-0 block text-gray-700">End Date</label>
                              <CalendarComponent
                                mode="single"
                                selected={customEndDate}
                                onSelect={(date) => {
                                  setCustomEndDate(date);
                                  setUseCustomRange(true);
                                }}
                                disabled={(date) => customStartDate ? date < customStartDate : false}
                                className="p-0"
                              />
                            </div>
                            {customStartDate && customEndDate && (
                              <Button 
                                size="sm"
                                className="w-full text-[9px] h-5 mt-0.5 py-0" 
                                onClick={() => {
                                  setUseCustomRange(true);
                                }}
                              >
                                Apply Range
                              </Button>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
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
                        <p className="text-sm font-medium text-gray-600">Avg Hours</p>
                        <p className="text-2xl font-bold">
                          {(() => {
                            // Convert each day's total span to minutes, sum them up
                            const totalMinutes = productivityData.dailyData.reduce((sum, day) => {
                              return sum + (day.totalSpanHours * 60);
                            }, 0);
                            
                            // Divide by number of days to get average minutes per day
                            const avgMinutesPerDay = totalMinutes / productivityData.summary.totalDays;
                            
                            // Convert to hours and minutes for display
                            const hours = Math.floor(avgMinutesPerDay / 60);
                            const minutes = Math.round(avgMinutesPerDay % 60);
                            
                            return `${hours} hr ${minutes}m`;
                          })()}
                        </p>
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
                    {useCustomRange && customStartDate && customEndDate 
                      ? ` (${format(customStartDate, 'MMM dd, yyyy')} - ${format(customEndDate, 'MMM dd, yyyy')})`
                      : ` (Last ${dateRange === 30 ? 'Month' : dateRange === 60 ? '2 Months' : dateRange === 180 ? '6 Months' : `${dateRange} Days`})`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={productivityData.weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="day" 
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return format(date, 'MMM dd');
                        }}
                      />
                      <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)} hours`,
                          name === "hours" ? "Actual Work" : "Total Span"
                        ]}
                        labelFormatter={(label) => {
                          const date = new Date(label);
                          return format(date, 'EEEE, MMM dd, yyyy');
                        }}
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
                  <Tabs defaultValue="daily" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="daily">Daily Productivity Details</TabsTrigger>
                      <TabsTrigger value="productivity">Productivity Score</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Daily Productivity Details */}
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

                    {/* Tab 2: Productivity Score */}
                    <TabsContent value="productivity" className="space-y-4">
                      <div className="mt-4">
                        {/* Productivity Calculation - Moved to top */}
                        <div className="mb-6 p-6 bg-blue-50 rounded-lg">
                          <div className="text-center space-y-4">
                            <div className="text-lg font-semibold text-gray-900">
                              Productivity Calculation
                            </div>
                            <div className="flex items-center justify-center gap-2 text-xl">
                              <span>Productivity % = </span>
                              <span className="inline-flex items-center">
                                (<span className="mx-1">
                                  {(() => {
                                    // Get all unique tasks from all days in the date range
                                    const allTasks = new Map();
                                    productivityData.dailyData.forEach((day: any) => {
                                      if (day.taskBreakdown) {
                                        day.taskBreakdown.forEach((task: any) => {
                                          // Only add if not already in map (ensures uniqueness)
                                          if (!allTasks.has(task.id)) {
                                            allTasks.set(task.id, task);
                                          }
                                        });
                                      }
                                    });
                                    const uniqueTasks = Array.from(allTasks.values());
                                    const totalAssigned = uniqueTasks.reduce((sum: number, task: any) => 
                                      sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
                                    return totalAssigned;
                                  })()}
                                </span>)
                              </span>
                              <span>/</span>
                              <span className="inline-flex items-center">
                                (<span className="mx-1">
                                  {(() => {
                                    // Get all unique tasks from all days in the date range
                                    const allTasks = new Map();
                                    productivityData.dailyData.forEach((day: any) => {
                                      if (day.taskBreakdown) {
                                        day.taskBreakdown.forEach((task: any) => {
                                          if (!allTasks.has(task.id)) {
                                            allTasks.set(task.id, task);
                                          }
                                        });
                                      }
                                    });
                                    const uniqueTasks = Array.from(allTasks.values());
                                    const totalActual = uniqueTasks.reduce((sum: number, task: any) => 
                                      sum + Math.floor((task.timeSpent || 0) / 60), 0);
                                    return totalActual;
                                  })()}
                                </span>)
                              </span>
                              <span>× 100 = </span>
                              <span className="text-blue-600 font-bold">
                                {(() => {
                                  const allTasks = new Map();
                                  productivityData.dailyData.forEach((day: any) => {
                                    if (day.taskBreakdown) {
                                      day.taskBreakdown.forEach((task: any) => {
                                        if (!allTasks.has(task.id)) {
                                          allTasks.set(task.id, task);
                                        }
                                      });
                                    }
                                  });
                                  const uniqueTasks = Array.from(allTasks.values());
                                  const totalAssigned = uniqueTasks.reduce((sum: number, task: any) => 
                                    sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
                                  const totalActual = uniqueTasks.reduce((sum: number, task: any) => 
                                    sum + Math.floor((task.timeSpent || 0) / 60), 0);
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
                                    const allTasks = new Map();
                                    productivityData.dailyData.forEach((day: any) => {
                                      if (day.taskBreakdown) {
                                        day.taskBreakdown.forEach((task: any) => {
                                          if (!allTasks.has(task.id)) {
                                            allTasks.set(task.id, task);
                                          }
                                        });
                                      }
                                    });
                                    const uniqueTasks = Array.from(allTasks.values());
                                    const totalAssigned = uniqueTasks.reduce((sum: number, task: any) => 
                                      sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
                                    const totalActual = uniqueTasks.reduce((sum: number, task: any) => 
                                      sum + Math.floor((task.timeSpent || 0) / 60), 0);
                                    const productivity = totalActual > 0 ? Math.round((totalAssigned / totalActual) * 100) : 0;
                                    return productivity >= 100 ? "more efficient" : "less efficient";
                                  })()}
                                </span>
                                than expected.
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-2">
                              Showing unique tasks worked on within the selected date range
                            </div>
                          </div>
                        </div>

                        {/* Task Breakdown Table */}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Task Name</TableHead>
                              <TableHead>Assigned Time (min)</TableHead>
                              <TableHead>Actual Time Spent (min)</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              // Get all unique tasks from all days in the date range
                              const allTasks = new Map();
                              productivityData.dailyData.forEach((day: any) => {
                                if (day.taskBreakdown) {
                                  day.taskBreakdown.forEach((task: any) => {
                                    // Use task.id as key to ensure uniqueness
                                    if (!allTasks.has(task.id)) {
                                      allTasks.set(task.id, task);
                                    }
                                  });
                                }
                              });
                              const uniqueTasks = Array.from(allTasks.values());
                              
                              // Sort tasks by title for consistent display
                              uniqueTasks.sort((a: any, b: any) => a.title.localeCompare(b.title));
                              
                              return uniqueTasks.map((task: any) => {
                                // Get assigned time in minutes
                                const assignedMinutes = (task.workingHours || 0) * 60 + (task.workingMinutes || 0);
                                // Get actual time spent in minutes (timeSpent is in seconds)
                                const actualMinutes = Math.floor((task.timeSpent || 0) / 60);

                                // Format time display (e.g., "80 minutes (1hr 20m)")
                                const formatTimeDisplay = (totalMinutes: number) => {
                                  if (totalMinutes === 0) return '0 minutes';
                                  const hours = Math.floor(totalMinutes / 60);
                                  const minutes = totalMinutes % 60;
                                  if (hours === 0) return `${minutes} minutes`;
                                  return `${totalMinutes} minutes (${hours}hr ${minutes}m)`;
                                };

                                // Determine status
                                let status = 'On Time';
                                let statusColor = 'bg-green-100 text-green-800';

                                if (assignedMinutes > 0) {
                                  if (actualMinutes < assignedMinutes) {
                                    status = 'Early';
                                    statusColor = 'bg-blue-100 text-blue-800';
                                  } else if (actualMinutes > assignedMinutes) {
                                    status = 'Late';
                                    statusColor = 'bg-red-100 text-red-800';
                                  }
                                }

                                return (
                                  <TableRow key={task.id}>
                                    <TableCell className="font-medium">{task.title}</TableCell>
                                    <TableCell>{formatTimeDisplay(assignedMinutes)}</TableCell>
                                    <TableCell>{formatTimeDisplay(actualMinutes)}</TableCell>
                                    <TableCell>
                                      <Badge className={statusColor}>
                                        {status}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              });
                            })()}
                            <TableRow className="font-bold bg-gray-50">
                              <TableCell>Total</TableCell>
                              <TableCell>
                                {(() => {
                                  const allTasks = new Map();
                                  productivityData.dailyData.forEach((day: any) => {
                                    if (day.taskBreakdown) {
                                      day.taskBreakdown.forEach((task: any) => {
                                        if (!allTasks.has(task.id)) {
                                          allTasks.set(task.id, task);
                                        }
                                      });
                                    }
                                  });
                                  const uniqueTasks = Array.from(allTasks.values());
                                  const totalAssigned = uniqueTasks.reduce((sum: number, task: any) => 
                                    sum + (task.workingHours || 0) * 60 + (task.workingMinutes || 0), 0);
                                  return totalAssigned;
                                })()}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const allTasks = new Map();
                                  productivityData.dailyData.forEach((day: any) => {
                                    if (day.taskBreakdown) {
                                      day.taskBreakdown.forEach((task: any) => {
                                        if (!allTasks.has(task.id)) {
                                          allTasks.set(task.id, task);
                                        }
                                      });
                                    }
                                  });
                                  const uniqueTasks = Array.from(allTasks.values());
                                  const totalActual = uniqueTasks.reduce((sum: number, task: any) => 
                                    sum + Math.floor((task.timeSpent || 0) / 60), 0);
                                  return totalActual;
                                })()}
                              </TableCell>
                              <TableCell>-</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
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