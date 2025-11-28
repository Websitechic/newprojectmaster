import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Users,
  ClipboardList,
  AlertCircle,
  Clock,
  Coffee,
  CalendarDays,
  CheckCircle2,
  Calendar,
  TimerOff,
  TimerReset,
  Play,
  UserCheck,
  FileSpreadsheet,
  FileText,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface StaffMember {
  id: number;
  name: string;
  username: string;
  email: string;
  specialization: string | null;
  status: string;
  workStatus: 'active' | 'on_break' | 'absent';
  breakStartTime: string | null;
  breakCount: number;
  absenceReason: 'leave' | 'off_day' | 'not_applicable' | null;
  absenceEndDate: string | null;
  currentTaskId: number | null;
  taskStartTime: string | null;
  lastActive: string;
  tasks: Task[];
  taskCount: number;
  activeTasks: number;
  isCurrentlyEngaged: boolean;
  isInMeeting?: boolean; // Added for meeting status
  meetingInfo?: { // Added for meeting details
    title: string;
    scheduledBy: string;
  } | null;
  engagedTask?: {
    staffId: number;
    taskId: number;
    taskTitle: string;
    projectId: number;
    projectName: string;
    assignedHours: number;
    totalHoursSpent: number;
    currentSessionHours: number;
    remainingHours: number;
    timerStartTime: string;
    isTimerRunning: boolean;
  } | null;
  breakInfo?: {
    staffId: number;
    breakStartTime: string;
    breakDuration: number;
    breakCount: number;
    breakOvertime: boolean;
  } | null;
  absentDaysRemaining: number | null;
}

interface Task {
  id: number;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed' | 'review';
  projectId: number;
  projectName: string;
  assigneeId: number;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

const statusColors = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  review: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  technical_support: "bg-red-100 text-red-800"
};

const specializationLabels: Record<string, string> = {
  automation: "Automation",
  copywriting: "Copy Writing",
  design: "Design",
  media_buying: "Media Buying",
  development: "Development",
  community_manager: "Community Manager",
  operations_manager: "Operations Manager",
  technical_support: "Technical Support",
  product_owner: "Product Owner",
  replit_development: "Replit Development",
};

const workStatusLabels: Record<string, string> = {
  active: "Active",
  on_break: "On Break",
  absent: "Absent"
};

const absenceReasonLabels: Record<string, string> = {
  leave: "On Leave",
  off_day: "Off Day",
  not_applicable: "N/A"
};

const workStatusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-300",
  on_break: "bg-amber-100 text-amber-800 border-amber-300",
  absent: "bg-red-100 text-red-800 border-red-300"
};

export default function StaffReport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  // Check authentication and authorization FIRST
  const hasAccess = user?.role === "project_manager" || user?.role === "operations_manager" || user?.role === "team_lead" || user?.specialization === "operations_manager" || user?.specialization === "replit_development" || user?.specialization === "Replit Development";

  const [filterSpecialization, setFilterSpecialization] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'active' | 'all'>('active');

  const { data: staffReport, isLoading, error } = useQuery<StaffMember[], Error>({
    queryKey: ["/api/staff-report"],
    queryFn: async () => {
      const response = await fetch("/api/staff-report", {
        credentials: "include",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentication required");
        }
        if (response.status === 403) {
          throw new Error("Access denied - Project Manager role required");
        }
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}: Failed to fetch staff report`);
      }

      return response.json();
    },
    enabled: hasAccess && !!user,
    retry: (failureCount, error) => {
      // Don't retry on 401/403 errors (authentication/authorization)
      if (error?.message?.includes('Authentication') || error?.message?.includes('Access denied')) {
        return false;
      }
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
    refetchInterval: 30000, // Refresh every 30 seconds
    onError: (error) => {
      console.error("Staff report query error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load staff report. Please try refreshing the page.",
        variant: "destructive",
      });
    },
  });

  // Early returns for auth checks
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive">You must be logged in to view this page</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive">Only project managers, operations managers, team leads, and Replit developers can access the staff report</p>
        <p className="text-xs text-muted-foreground mt-1">Your role: {user?.role}, Specialization: {user?.specialization}</p>
      </div>
    );
  }

  const filteredStaff = filterSpecialization
    ? staffReport?.filter(member => member.specialization === filterSpecialization)
    : staffReport;

  // Function to handle export
  const handleExport = (format: 'csv' | 'json') => {
    if (!staffReport) return;

    let dataToExport: any[] = [];
    if (filterSpecialization) {
      dataToExport = staffReport.filter(member => member.specialization === filterSpecialization);
    } else {
      dataToExport = staffReport;
    }

    if (format === 'csv') {
      const csvRows = [];
      // CSV headers
      const headers = [
        "ID", "Name", "Username", "Email", "Specialization", "Work Status",
        "Break Start Time", "Break Count", "Absence Reason", "Absence End Date",
        "Current Task ID", "Task Start Time", "Last Active", "Task Count",
        "Active Tasks", "Is Currently Engaged", "Engaged Task Title", "Engaged Project Name",
        "Assigned Hours", "Total Hours Spent", "Remaining Hours", "Timer Start Time",
        "Break Duration", "Break Overtime", "In Meeting", "Meeting Title", "Scheduled By" // Added meeting info
      ];
      csvRows.push(headers.join(','));

      // CSV rows
      dataToExport.forEach(staff => {
        const row = [
          staff.id,
          `"${staff.name.replace(/"/g, '""')}"`,
          `"${staff.username.replace(/"/g, '""')}"`,
          staff.email,
          staff.specialization || "",
          staff.workStatus,
          staff.breakStartTime ? formatDate(staff.breakStartTime, "yyyy-MM-dd HH:mm:ss") : "",
          staff.breakCount,
          staff.absenceReason || "",
          staff.absenceEndDate ? formatDate(staff.absenceEndDate, "yyyy-MM-dd") : "",
          staff.currentTaskId || "",
          staff.taskStartTime ? formatDate(staff.taskStartTime, "yyyy-MM-dd HH:mm:ss") : "",
          formatDate(staff.lastActive, "yyyy-MM-dd HH:mm:ss"),
          staff.taskCount,
          staff.activeTasks,
          staff.isCurrentlyEngaged,
          staff.engagedTask?.taskTitle || "",
          staff.engagedTask?.projectName || "",
          staff.engagedTask?.assignedHours || "",
          staff.engagedTask?.totalHoursSpent.toFixed(2) || "",
          staff.engagedTask?.remainingHours || "",
          staff.engagedTask?.timerStartTime ? formatDate(staff.engagedTask.timerStartTime, "yyyy-MM-dd HH:mm:ss") : "",
          staff.breakInfo?.breakDuration || "",
          staff.breakInfo?.breakOvertime || "",
          staff.isInMeeting || false, // Added meeting status
          staff.meetingInfo?.title || "", // Added meeting title
          staff.meetingInfo?.scheduledBy || "", // Added scheduled by
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `staff_report_${formatDate(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (format === 'json') {
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `staff_report_${formatDate(new Date(), 'yyyy-MM-dd')}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <p className="text-sm text-muted-foreground">Loading staff report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive">Failed to load staff report</p>
        <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
      </div>
    );
  }

  if (!staffReport || staffReport.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Users className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No staff members found</p>
      </div>
    );
  }

  // Get unique specializations from staff members
  const specializations = [...new Set(staffReport.map(member => member.specialization).filter(Boolean))];

  // Group staff by engagement status
  const engagedStaff = filteredStaff?.filter(staff => staff.isCurrentlyEngaged) || [];

  // Show all staff currently on break - server ensures breaks are ended after 60 minutes
  const onBreakStaff = filteredStaff?.filter(staff => staff.workStatus === 'on_break') || [];

  const absentStaff = filteredStaff?.filter(staff => staff.workStatus === 'absent') || [];

  // Staff in meetings
  const inMeetingStaff = filteredStaff?.filter(staff => staff.isInMeeting) || [];

  // Available staff: those not absent, not on break, not in meeting, and not currently engaged with running timers
  const availableStaff = filteredStaff?.filter(staff => {
    // Exclude absent staff
    if (staff.workStatus === 'absent') return false;

    // Exclude staff on break
    if (staff.workStatus === 'on_break') return false;

    // Exclude currently engaged staff (those with running timers)
    if (staff.isCurrentlyEngaged) return false;

    // Exclude staff in meetings
    if (staff.isInMeeting) return false;

    return true;
  }) || [];

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 xl:ml-72">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Staff Report</h1>
            <p className="text-muted-foreground mt-1">
              Real-time monitoring of staff activity and task status
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={filterSpecialization || "all"}
              onValueChange={(value) => setFilterSpecialization(value === "all" ? null : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specializations</SelectItem>
                {specializations.map((spec) => (
                  <SelectItem key={spec} value={spec as string}>
                    {specializationLabels[spec as string] || spec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleExport('csv')}
              variant="outline"
              className="flex items-center"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button
              onClick={() => handleExport('json')}
              variant="outline"
              className="flex items-center"
            >
              <FileText className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export JSON</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md">Staff Status Overview</CardTitle>
              <CardDescription>
                {engagedStaff.length} currently engaged | {onBreakStaff.length} on scheduled break | {absentStaff.length} absent | {inMeetingStaff.length} in meeting | {availableStaff.length} available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Automatic Break System:</strong> Staff members are automatically put on break during their scheduled break times.
                  Running task timers are paused and will resume after the 1-hour break period.
                </p>
              </div>
            </CardContent>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-md border border-green-300 bg-green-50 p-3">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-green-700" />
                    <h3 className="text-sm font-medium text-green-800">Currently Engaged</h3>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-green-800">{engagedStaff.length}</p>
                  <p className="text-xs text-green-700">Staff with active task timers</p>
                </div>

                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-700" />
                    <h3 className="text-sm font-medium text-amber-800">On Break</h3>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-amber-800">{onBreakStaff.length}</p>
                  <p className="text-xs text-amber-700">
                    Automatic 1-hour scheduled breaks
                  </p>
                </div>

                <div className="rounded-md border border-red-300 bg-red-50 p-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-red-700" />
                    <h3 className="text-sm font-medium text-red-800">Absent</h3>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-red-800">{absentStaff.length}</p>
                  <p className="text-xs text-red-700">
                    {absentStaff.filter(s => s.absenceReason === 'leave').length} on leave,
                    {absentStaff.filter(s => s.absenceReason === 'off_day').length} off day
                  </p>
                </div>

                <div className="rounded-md border border-blue-300 bg-blue-50 p-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-blue-700" />
                    <h3 className="text-sm font-medium text-blue-800">Available</h3>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-blue-800">{availableStaff.length}</p>
                  <p className="text-xs text-blue-700">
                    Staff ready for new assignments
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Currently Engaged Staff Section */}
          <Card className="border-green-200">
            <CardHeader className="pb-2 border-b border-green-100">
              <div className="flex items-center">
                <div className="bg-green-100 p-1.5 rounded-full mr-2">
                  <Play className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Currently Engaged Staff</CardTitle>
                  <CardDescription>
                    {engagedStaff.length} staff members with active task timers
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {engagedStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Current Project</TableHead>
                      <TableHead>Current Task</TableHead>
                      <TableHead className="text-center">Assigned Hours</TableHead>
                      <TableHead className="text-center">Total Hours Spent</TableHead>
                      <TableHead className="text-center">Remaining Time</TableHead>
                      <TableHead className="text-right">Timer Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {engagedStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {staff.engagedTask ? (
                            <div className="font-medium">{staff.engagedTask.projectName}</div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No project</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {staff.engagedTask ? (
                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                {staff.engagedTask.taskTitle}
                              </div>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No task</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.engagedTask?.assignedHours ? (
                            <div className="font-medium text-blue-700">
                              {staff.engagedTask.assignedHours} hrs
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.engagedTask ? (
                            <div className="font-medium">
                              {staff.engagedTask.totalHoursSpent.toFixed(2)} hrs
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.engagedTask ? (
                            <div className={`font-medium ${staff.engagedTask.remainingHours <= 1 ? 'text-red-700' : 'text-blue-700'}`}>
                              {staff.engagedTask.remainingHours} hrs
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {staff.engagedTask?.timerStartTime ? (
                            formatDate(staff.engagedTask.timerStartTime, "h:mm a")
                          ) : (
                            "N/A"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-green-50 p-3 rounded-full mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="text-md font-medium mb-1">No Currently Engaged Staff</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    There are currently no staff members with active task timers running.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* On Break Staff Section */}
          <Card className="border-amber-200">
            <CardHeader className="pb-2 border-b border-amber-100">
              <div className="flex items-center">
                <div className="bg-amber-100 p-1.5 rounded-full mr-2">
                  <Coffee className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Staff On Break</CardTitle>
                  <CardDescription>
                    {onBreakStaff.length} staff members currently on scheduled break
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {onBreakStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Break Started</TableHead>
                      <TableHead className="text-center">Duration</TableHead>
                      <TableHead className="text-center">Break Type</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onBreakStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {staff.breakInfo?.breakStartTime ? (
                            formatDate(staff.breakInfo.breakStartTime, "h:mm a")
                          ) : (
                            <span className="text-xs text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.breakInfo?.breakDuration ? (
                            <div className={`font-medium ${staff.breakInfo.breakOvertime ? 'text-red-600' : 'text-amber-700'}`}>
                              {staff.breakInfo.breakDuration} mins
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-800">
                            Daily Break
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {staff.breakInfo?.breakOvertime ? (
                            <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100">
                              Overtime
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                              Within limit
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-amber-50 p-3 rounded-full mb-3">
                    <TimerReset className="h-6 w-6 text-amber-500" />
                  </div>
                  <h3 className="text-md font-medium mb-1">No Staff On Break</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    All staff members are currently active. Breaks are automatically scheduled based on individual break times.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Absent Staff Section */}
          <Card className="border-red-200">
            <CardHeader className="pb-2 border-b border-red-100">
              <div className="flex items-center">
                <div className="bg-red-100 p-1.5 rounded-full mr-2">
                  <Calendar className="h-5 w-5 text-red-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Absent Staff</CardTitle>
                  <CardDescription>
                    {absentStaff.length} staff members currently absent
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {absentStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-center">Days Remaining</TableHead>
                      <TableHead className="text-right">Expected Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-red-50 border-red-200 text-red-800">
                            {staff.absenceReason ? absenceReasonLabels[staff.absenceReason] : 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.absentDaysRemaining !== null ? (
                            <div className="font-medium">
                              {staff.absentDaysRemaining} {staff.absentDaysRemaining === 1 ? 'day' : 'days'}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unspecified</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {staff.absenceEndDate ? (
                            formatDate(staff.absenceEndDate, "MMM d, yyyy")
                          ) : (
                            <span className="text-xs text-muted-foreground">Not specified</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-red-50 p-3 rounded-full mb-3">
                    <TimerOff className="h-6 w-6 text-red-500" />
                  </div>
                  <h3 className="text-md font-medium mb-1">No Absent Staff</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    There are currently no staff members absent.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* In Meeting Staff Section */}
          <Card className="border-purple-200">
            <CardHeader className="pb-2 border-b border-purple-100">
              <div className="flex items-center">
                <div className="bg-purple-100 p-1.5 rounded-full mr-2">
                  <CalendarDays className="h-5 w-5 text-purple-700" /> {/* Using CalendarDays as a placeholder icon */}
                </div>
                <div>
                  <CardTitle className="text-md">Staff in Meeting</CardTitle>
                  <CardDescription>
                    {inMeetingStaff.length} staff members currently in a booked meeting
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {inMeetingStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Meeting Title</TableHead>
                      <TableHead>Scheduled By</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inMeetingStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-800">
                            {staff.meetingInfo?.title || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-800">
                            {staff.meetingInfo?.scheduledBy || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                            In Meeting
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-purple-50 p-3 rounded-full mb-3">
                    <CalendarDays className="h-6 w-6 text-purple-500" />
                  </div>
                  <h3 className="text-md font-medium mb-1">No Staff in Meetings</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Currently, no staff members are in booked meetings.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Staff Section */}
          <Card className="border-blue-200">
            <CardHeader className="pb-2 border-b border-blue-100">
              <div className="flex items-center">
                <div className="bg-blue-100 p-1.5 rounded-full mr-2">
                  <UserCheck className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Available Staff</CardTitle>
                  <CardDescription>
                    {availableStaff.length} staff members available for new assignments
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {availableStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead className="text-center">Task Status</TableHead>
                      <TableHead className="text-center">Work Status</TableHead>
                      <TableHead className="text-right">Last Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">{staff.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-800">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.taskCount === 0 ? (
                            <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-800">
                              No tasks assigned
                            </Badge>
                          ) : staff.activeTasks === 0 ? (
                            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-800">
                              All tasks completed ({staff.taskCount})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-800">
                              {staff.activeTasks} active tasks
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={workStatusColors[staff.workStatus]}>
                            {workStatusLabels[staff.workStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatDate(staff.lastActive, "MMM d, h:mm a")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-blue-50 p-3 rounded-full mb-3">
                    <UserCheck className="h-6 w-6 text-blue-500" />
                  </div>
                  <h3 className="text-md font-medium mb-1">No Available Staff</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    All staff members are currently engaged, on break, absent, or in a meeting.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}