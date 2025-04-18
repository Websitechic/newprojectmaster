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
import { Loader2, Users, ClipboardList, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface StaffMember {
  id: number;
  name: string;
  username: string;
  email: string;
  specialization: string | null;
  lastActive: string;
  status: string;
  tasks: Task[];
  taskCount: number;
  activeTasks: number;
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

export default function StaffReport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filterSpecialization, setFilterSpecialization] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<'active' | 'all'>('active');

  const { data: staffReport, isLoading, error } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff-report"],
    enabled: user?.role === "project_manager",
    onError: (error: Error) => {
      toast({
        title: "Error loading staff report",
        description: error.message,
        variant: "destructive",
      });
    },
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

  return (
    <div className="p-6">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Staff Report</h1>
            <p className="text-muted-foreground mt-1">
              Overview of all staff members and their current tasks
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

            <Tabs defaultValue="active" className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger 
                  value="active" 
                  onClick={() => setTaskView('active')}
                >
                  Active Tasks
                </TabsTrigger>
                <TabsTrigger 
                  value="all" 
                  onClick={() => setTaskView('all')}
                >
                  All Tasks
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-md">Staff Summary</CardTitle>
              <CardDescription>
                {filteredStaff?.length} staff members | {filteredStaff?.reduce((sum, staff) => sum + staff.activeTasks, 0)} active tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Active Tasks</TableHead>
                    <TableHead className="text-center">Total Tasks</TableHead>
                    <TableHead className="text-right">Last Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff?.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium">{staff.name}</TableCell>
                      <TableCell>
                        {staff.specialization ? (
                          <Badge variant="outline">
                            {specializationLabels[staff.specialization] || staff.specialization}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Not specified</span>
                        )}
                      </TableCell>
                      <TableCell>{staff.email}</TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={staff.activeTasks > 0 ? "default" : "outline"}
                          className={staff.activeTasks > 3 ? "bg-amber-500" : ""}
                        >
                          {staff.activeTasks}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{staff.taskCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {formatDate(staff.lastActive)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-md">Staff Task Details</CardTitle>
              <CardDescription>
                Detailed breakdown of tasks assigned to each staff member
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {filteredStaff?.map((staff) => {
                  const displayTasks = taskView === 'active' 
                    ? staff.tasks.filter(task => task.status !== 'completed')
                    : staff.tasks;
                    
                  return (
                    <AccordionItem key={staff.id} value={`staff-${staff.id}`}>
                      <AccordionTrigger className="hover:no-underline px-4">
                        <div className="flex justify-between w-full">
                          <span>{staff.name}</span>
                          <span className="text-muted-foreground text-sm">
                            {taskView === 'active' ? staff.activeTasks : staff.taskCount} tasks
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-1">
                        {displayTasks.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Task</TableHead>
                                <TableHead>Project</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Deadline</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayTasks.map((task) => (
                                <TableRow key={task.id}>
                                  <TableCell className="font-medium">{task.title}</TableCell>
                                  <TableCell>{task.projectName}</TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant="secondary"
                                      className={statusColors[task.status] || ""}
                                    >
                                      {task.status.replace('_', ' ')}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatDate(task.deadline)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="flex items-center justify-center py-8">
                            <div className="flex flex-col items-center text-center">
                              <ClipboardList className="h-8 w-8 text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">
                                {taskView === 'active' 
                                  ? 'No active tasks assigned'
                                  : 'No tasks assigned'}
                              </p>
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}