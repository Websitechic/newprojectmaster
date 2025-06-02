import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  UserCheck
} from "lucide-react";
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
  currentTask?: {
    staffId: number;
    taskId: number;
    taskTitle: string;
    projectId: number;
    projectName: string;
    startTime: string | null;
    hoursWorked: number;
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
  completed: "bg-green-100 text-green-800"
};

const specializationLabels: Record<string, string> = {
  developer: "Developer",
  designer: "Designer",
  copywriter: "Copywriter",
  media_buyer: "Media Buyer",
  automation_expert: "Automation Expert",
  marketing_specialist: "Marketing Specialist"
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
  const [filterSpecialization, setFilterSpecialization] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'active' | 'all'>('active');

  const { data: staffReport, isLoading, error } = useQuery<StaffMember[], Error>({
    queryKey: ["/api/staff-report"],
    enabled: user?.role === "project_manager",
    retry: 3,
    refetchOnWindowFocus: false,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const filteredStaff = filterSpecialization
    ? staffReport?.filter(member => member.specialization === filterSpecialization)
    : staffReport;

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

  // Group staff by work status
  const activeStaff = filteredStaff?.filter(staff => staff.workStatus === 'active') || [];
  const onBreakStaff = filteredStaff?.filter(staff => staff.workStatus === 'on_break') || [];
  const absentStaff = filteredStaff?.filter(staff => staff.workStatus === 'absent') || [];
  
  // Free staff: those with no tasks assigned or all tasks completed
  const freeStaff = filteredStaff?.filter(staff => {
    // Only consider staff who are not absent
    if (staff.workStatus === 'absent') return false;
    
    // Staff with no tasks assigned
    if (staff.taskCount === 0) return true;
    
    // Staff with all tasks completed
    if (staff.taskCount > 0 && staff.activeTasks === 0) return true;
    
    return false;
  }) || [];

  return (
    <div className="p-6">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Staff Report</h1>
            <p className="text-muted-foreground mt-1">
              Real-time monitoring of staff activity and task status
            </p>
          </div>
          <div className="flex items-center space-x-3">
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
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md">Staff Status Overview</CardTitle>
              <CardDescription>
                {activeStaff.length} staff active | {onBreakStaff.length} on scheduled break | {absentStaff.length} absent | {freeStaff.length} available
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
                  <p className="mt-1 text-2xl font-bold text-green-800">{activeStaff.length}</p>
                  <p className="text-xs text-green-700">Staff actively working on tasks</p>
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
                  <p className="mt-1 text-2xl font-bold text-blue-800">{freeStaff.length}</p>
                  <p className="text-xs text-blue-700">
                    {freeStaff.filter(s => s.taskCount === 0).length} no tasks, 
                    {freeStaff.filter(s => s.taskCount > 0 && s.activeTasks === 0).length} completed all
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Staff Section */}
          <Card className="border-green-200">
            <CardHeader className="pb-2 border-b border-green-100">
              <div className="flex items-center">
                <div className="bg-green-100 p-1.5 rounded-full mr-2">
                  <Play className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Currently Engaged Staff</CardTitle>
                  <CardDescription>
                    {activeStaff.length} staff members actively working on projects
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {activeStaff.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Current Project</TableHead>
                      <TableHead>Current Task</TableHead>
                      <TableHead className="text-center">Hours Worked</TableHead>
                      <TableHead className="text-right">Start Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {staff.specialization ? specializationLabels[staff.specialization] : 'No specialization'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {staff.currentTask ? (
                            <div>{staff.currentTask.projectName}</div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No active project</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {staff.currentTask ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                              {staff.currentTask.taskTitle}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No active task</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {staff.currentTask?.hoursWorked ? (
                            <div className="font-medium">
                              {staff.currentTask.hoursWorked.toFixed(2)} hrs
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {staff.taskStartTime ? formatDate(staff.taskStartTime, "h:mm a") : "N/A"}
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
                  <h3 className="text-md font-medium mb-1">No Active Staff</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    There are currently no staff members actively engaged in tasks.
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
                            Scheduled Break
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

          {/* Free Staff Section */}
          <Card className="border-blue-200">
            <CardHeader className="pb-2 border-b border-blue-100">
              <div className="flex items-center">
                <div className="bg-blue-100 p-1.5 rounded-full mr-2">
                  <UserCheck className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <CardTitle className="text-md">Available Staff</CardTitle>
                  <CardDescription>
                    {freeStaff.length} staff members available for new assignments
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {freeStaff.length > 0 ? (
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
                    {freeStaff.map((staff) => (
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
                          ) : (
                            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-800">
                              All tasks completed ({staff.taskCount})
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
                    All staff members are currently assigned to active tasks or are absent.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}