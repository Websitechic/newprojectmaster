
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  FileText,
  Upload,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";

const leaveApplicationSchema = z.object({
  leaveType: z.enum(["day_off", "leave_of_absence"], {
    required_error: "Please select a leave type",
  }),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  proofImage: z.any().optional(),
});

type LeaveApplicationFormData = z.infer<typeof leaveApplicationSchema>;

interface LeaveApplication {
  id: number;
  leaveType: "day_off" | "leave_of_absence";
  reason: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  proofImageUrl?: string;
  status: "pending" | "approved" | "rejected";
  appliedAt: string;
  reviewedAt?: string;
  reviewComments?: string;
}

const leaveTypeLabels = {
  day_off: "Day Off",
  leave_of_absence: "Leave of Absence",
};

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

const statusIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

export default function LeaveApplication() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<LeaveApplicationFormData>({
    resolver: zodResolver(leaveApplicationSchema),
    defaultValues: {
      leaveType: undefined,
      reason: "",
      startDate: "",
      endDate: "",
    },
  });

  // Check if user is staff, intern, customer support officer, team lead, or project manager
  if (!user || (user.role !== "staff" && user.role !== "intern" && user.role !== "customer_support_officer" && user.role !== "team_lead" && user.role !== "project_manager")) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath="/dashboard/leave-application" />
        <div className="flex-1 flex flex-col">
          <Header />
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive">Only staff members, interns, customer support officers, team leads, and project managers can access leave applications</p>
          </div>
        </div>
      </div>
    );
  }

  // Interns and project managers have same permissions as staff
  const isStaffOrIntern = user.role === "staff" || user.role === "intern" || user.role === "project_manager";

  // Fetch existing leave applications
  const { data: leaveApplications, isLoading } = useQuery<LeaveApplication[]>({
    queryKey: ["/api/leave-applications"],
    queryFn: async () => {
      const response = await fetch("/api/leave-applications", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch leave applications");
      return response.json();
    },
  });

  // Get current year's leave of absence count
  const currentYear = new Date().getFullYear();
  const leaveOfAbsenceDaysUsed = leaveApplications
    ?.filter(app => 
      app.leaveType === "leave_of_absence" && 
      app.status === "approved" &&
      new Date(app.startDate).getFullYear() === currentYear
    )
    .reduce((total, app) => total + app.totalDays, 0) || 0;

  const remainingLeaveOfAbsenceDays = Math.max(0, 14 - leaveOfAbsenceDaysUsed);

  // Submit leave application
  const submitApplication = useMutation({
    mutationFn: async (data: LeaveApplicationFormData) => {
      const formData = new FormData();
      formData.append("leaveType", data.leaveType);
      formData.append("reason", data.reason);
      formData.append("startDate", data.startDate);
      formData.append("endDate", data.endDate);
      
      if (selectedFile) {
        formData.append("proofImage", selectedFile);
      }

      const response = await fetch("/api/leave-applications", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Leave application submitted successfully",
      });
      form.reset();
      setSelectedFile(null);
      setPreviewUrl(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leave-applications"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const calculateDays = () => {
    const startDate = form.watch("startDate");
    const endDate = form.watch("endDate");
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays;
    }
    return 0;
  };

  const requestedDays = calculateDays();
  const leaveType = form.watch("leaveType");

  return (
    <div className="flex h-screen w-full">
      <Sidebar currentPath="/dashboard/leave-application" />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Leave Application</h1>
              <p className="text-muted-foreground mt-1">
                Apply for day off or leave of absence
              </p>
            </div>

            <Tabs defaultValue="apply" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="apply" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Apply for Leave
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Application History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="apply" className="space-y-6">
            {/* Leave Balance Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Balance ({currentYear})</CardTitle>
                <CardDescription>
                  Your available leave days for this year
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-blue-600" />
                      <h3 className="font-medium text-blue-800">Day Off</h3>
                    </div>
                    <p className="text-2xl font-bold text-blue-800 mt-2">Unlimited</p>
                    <p className="text-sm text-blue-600">Subject to approval</p>
                  </div>
                  
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-green-600" />
                      <h3 className="font-medium text-green-800">Leave of Absence</h3>
                    </div>
                    <p className="text-2xl font-bold text-green-800 mt-2">
                      {remainingLeaveOfAbsenceDays} days
                    </p>
                    <p className="text-sm text-green-600">
                      {leaveOfAbsenceDaysUsed} of 14 days used
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Application Form */}
            <Card>
              <CardHeader>
                <CardTitle>Submit Leave Application</CardTitle>
                <CardDescription>
                  Fill out the form below to apply for leave
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => submitApplication.mutate(data))} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="leaveType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Leave Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select leave type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="day_off">
                                <div className="flex flex-col">
                                  <span>Day Off</span>
                                  <span className="text-xs text-muted-foreground">
                                    Single or multiple days off
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="leave_of_absence">
                                <div className="flex flex-col">
                                  <span>Leave of Absence</span>
                                  <span className="text-xs text-muted-foreground">
                                    Max 14 days per year
                                  </span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {requestedDays > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-sm text-blue-800">
                          <strong>Requested Days:</strong> {requestedDays} day{requestedDays !== 1 ? 's' : ''}
                        </p>
                        {leaveType === "leave_of_absence" && requestedDays > remainingLeaveOfAbsenceDays && (
                          <p className="text-sm text-red-600 mt-1">
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            You have only {remainingLeaveOfAbsenceDays} leave of absence days remaining this year
                          </p>
                        )}
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reason for Leave</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Please provide a detailed reason for your leave request..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <Label>Proof/Documentation (Optional)</Label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                        <div className="text-center">
                          <Upload className="mx-auto h-12 w-12 text-gray-400" />
                          <div className="mt-4">
                            <label htmlFor="proof-upload" className="cursor-pointer">
                              <span className="mt-2 block text-sm font-medium text-gray-900">
                                Upload supporting documentation
                              </span>
                              <span className="mt-1 block text-sm text-gray-500">
                                PNG, JPG, GIF up to 5MB
                              </span>
                            </label>
                            <input
                              id="proof-upload"
                              name="proof-upload"
                              type="file"
                              className="sr-only"
                              accept="image/*"
                              onChange={handleFileChange}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {previewUrl && (
                        <div className="mt-4">
                          <img
                            src={previewUrl}
                            alt="Proof preview"
                            className="max-w-xs h-32 object-cover rounded-md border"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setSelectedFile(null);
                              setPreviewUrl(null);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={submitApplication.isPending || (leaveType === "leave_of_absence" && requestedDays > remainingLeaveOfAbsenceDays)}
                      className="w-full"
                    >
                      {submitApplication.isPending ? "Submitting..." : "Submit Application"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Application History</CardTitle>
                <CardDescription>
                  Your previous leave applications and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Loading applications...</p>
                  </div>
                ) : !leaveApplications || leaveApplications.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No leave applications found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Applied</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveApplications.map((application) => {
                        const StatusIcon = statusIcons[application.status];
                        return (
                          <TableRow key={application.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {leaveTypeLabels[application.leaveType]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {formatDate(application.startDate, "MMM d, yyyy")} - {formatDate(application.endDate, "MMM d, yyyy")}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">{application.totalDays}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusColors[application.status]}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(application.appliedAt, "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <p className="text-sm truncate" title={application.reason}>
                                {application.reason}
                              </p>
                              {application.reviewComments && (
                                <p className="text-xs text-muted-foreground mt-1" title={application.reviewComments}>
                                  Review: {application.reviewComments}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
