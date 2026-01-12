import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MeetingAlert } from "@/components/dashboard/meeting-alert";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Calendar, Clock, User, Users, Edit, Trash2, Plus } from "lucide-react";
import { ProjectForm } from "@/components/project/project-form";
import { useAuth } from "@/hooks/use-auth";
import { useProjectUnreadCount } from "@/hooks/use-unread-messages";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"; // Added import for Checkbox
import { useState, useEffect } from "react"; //Import useState and useEffect

const deliverableSchema = z.object({
  name: z.string().min(1, "Deliverable name is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
});

const projectPlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  deliverables: z.array(deliverableSchema).min(1, "At least one deliverable is required"),
});

type ProjectPlanFormData = z.infer<typeof projectPlanSchema>;

export default function ProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = parseInt(id!);
  const unreadCount = useProjectUnreadCount(projectId);
  const [showPlanForm, setShowPlanForm] = useState(false); // State to control plan form visibility

  const isProjectManager = user?.role === "project_manager" || user?.role === "operations_manager" || user?.specialization === "operations_manager";

  // Prevent any redirects - staff should see this page
  React.useEffect(() => {
    // No redirect logic - all users can access this page
  }, [user?.role]);

  const { data: project, isLoading, error } = useQuery({
    queryKey: [`/api/projects/${id}`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to load project: ${response.status}`);
      }
      return response.json();
    },
  });

  // Fetch project tasks to calculate progress
  const { data: tasks } = useQuery<any[]>({
    queryKey: [`/api/projects/${id}/tasks`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/tasks`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!id,
  });

  const completedTasksCount = tasks?.filter(t => t.status === "completed").length || 0;
  const totalTasksCount = tasks?.length || 0;
  const calculatedProgress = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
  const allTasksCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount;

  // Mutation to complete project
  const completeProject = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${id}/complete`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to complete project");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}`] });
      toast({
        title: "Success",
        description: "Project marked as completed!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch project manager (creator) information
  const { data: projectManager } = useQuery({
    queryKey: [`/api/users/${project?.managerId}`],
    queryFn: async () => {
      const response = await fetch(`/api/users/${project?.managerId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project manager');
      }
      return response.json();
    },
    enabled: !!project?.managerId,
  });

  const { data: projectPlans, isLoading: plansLoading } = useQuery({
    queryKey: [`/api/projects/${id}/plans`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/plans`);
      const data = await response.json();
      console.log("Project plans response:", data);
      return data;
    },
    enabled: !!id,
  });

  const { data: projectPlan, isLoading: planLoading } = useQuery({
    queryKey: [`/api/project-plans/${projectPlans?.[0]?.id}`],
    queryFn: async () => {
      const response = await fetch(`/api/project-plans/${projectPlans?.[0]?.id}`);
      const data = await response.json();
      console.log("Project plan details response:", data);
      return data;
    },
    enabled: !!projectPlans?.[0]?.id,
  });

  const form = useForm<ProjectPlanFormData>({
    resolver: zodResolver(projectPlanSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      deliverables: [{ name: "", startDate: "", endDate: "" }],
    },
  });

  // Update form when project plan data loads
  React.useEffect(() => {
    if (projectPlan) {
      form.reset({
        name: projectPlan.name || "",
        description: projectPlan.description || "",
        startDate: projectPlan.startDate ? new Date(projectPlan.startDate).toISOString().split('T')[0] : "",
        endDate: projectPlan.endDate ? new Date(projectPlan.endDate).toISOString().split('T')[0] : "",
        deliverables: projectPlan.deliverables?.length > 0 ? projectPlan.deliverables.map((d: any) => ({
          name: d.name || "",
          startDate: d.startDate ? new Date(d.startDate).toISOString().split('T')[0] : "",
          endDate: d.endDate ? new Date(d.endDate).toISOString().split('T')[0] : "",
        })) : [{ name: "", startDate: "", endDate: "" }],
      });
    }
  }, [projectPlan, form]);

  const deleteProject = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete project');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Project deleted successfully",
      });
      setLocation('/dashboard/projects');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProjectPlan = useMutation({
    mutationFn: async (data: ProjectPlanFormData) => {
      if (!projectPlan?.id) {
        // Create new project plan if none exists
        const response = await fetch(`/api/projects/${id}/plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData || "Failed to create project plan");
        }

        return response.json();
      } else {
        // Update existing project plan
        const response = await fetch(`/api/project-plans/${projectPlan.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData || "Failed to update project plan");
        }

        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/plans`] });
      queryClient.invalidateQueries({ queryKey: [`/api/project-plans/${projectPlan?.id}`] });
      toast({
        title: "Success",
        description: projectPlan?.id ? "Project plan updated successfully!" : "Project plan created successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addDeliverable = () => {
    const currentDeliverables = form.getValues("deliverables");
    form.setValue("deliverables", [
      ...currentDeliverables,
      { name: "", startDate: "", endDate: "" }
    ]);
  };

  const removeDeliverable = (index: number) => {
    const currentDeliverables = form.getValues("deliverables");
    if (currentDeliverables.length > 1) {
      form.setValue("deliverables", currentDeliverables.filter((_, i) => i !== index));
    }
  };

  useEffect(() => {
    const handleTaskCreated = (event: any) => {
      const data = event.detail || event;
      // We check for id which is the projectId from params
      if (data.projectId === parseInt(id!) || (data.data && data.data.task && data.data.task.projectId === parseInt(id!))) {
        console.log("Real-time task creation detected for project:", id);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/tasks`] });
      }
    };

    window.addEventListener('websocket:task_created', handleTaskCreated);
    window.addEventListener('websocket:task_updated', handleTaskCreated);
    window.addEventListener('websocket:task_deleted', handleTaskCreated);

    return () => {
      window.removeEventListener('websocket:task_created', handleTaskCreated);
      window.removeEventListener('websocket:task_updated', handleTaskCreated);
      window.removeEventListener('websocket:task_deleted', handleTaskCreated);
    };
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${id}`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <MeetingAlert />
          <div className="flex-1 flex items-center justify-center">
            <div>Loading project...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${id}`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <MeetingAlert />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-red-600 mb-2">Error Loading Project</h2>
              <p className="text-gray-600 mb-4">Failed to load project details. Please try again.</p>
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen">
        <Sidebar currentPath={`/dashboard/projects/${id}`} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <MeetingAlert />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-600 mb-2">Project Not Found</h2>
              <p className="text-gray-600 mb-4">The requested project could not be found.</p>
              <Button onClick={() => setLocation("/dashboard/projects")}>Back to Projects</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      default: return 'bg-gray-300';
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'secondary';
      case 'in_progress': return 'default';
      case 'pending': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <MeetingAlert />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/dashboard/projects")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{project.name}</h1>
                <p className="text-muted-foreground">
                  {project.category?.replace(/_/g, ' ')} • {project.type}
                </p>
              </div>
              {(isProjectManager || user?.role === "customer_support_officer") && (
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Project
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Project</DialogTitle>
                      </DialogHeader>
                      <ProjectForm
                        project={project}
                        onSuccess={() => window.location.reload()}
                      />
                    </DialogContent>
                  </Dialog>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the project and all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteProject.mutate()}
                          disabled={deleteProject.isPending}
                        >
                          {deleteProject.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>

          {/* Project Overview - Hidden for support and maintenance clients */}
          {(user as any)?.clientType !== 'support_maintenance_client' && (
            <div className="mb-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Project Overview</h2>
                    <Badge variant={getStatusVariant(project.status)}>
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Timeline</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Duration</p>
                          <p className="text-sm text-muted-foreground">
                            {Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 3600 * 24))} days
                          </p>
                        </div>
                      </div>

                      {project.client && (
                        <div className="flex items-center gap-3">
                          <User className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Client</p>
                            <p className="text-sm text-muted-foreground">{project.client.name}</p>
                          </div>
                        </div>
                      )}

                      {projectManager && (
                        <div className="flex items-center gap-3">
                          <User className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Created By</p>
                            <p className="text-sm text-muted-foreground">{projectManager.name}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="font-medium mb-2">Progress</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Completion</span>
                            <span>{calculatedProgress}%</span>
                          </div>
                          <Progress value={calculatedProgress} className="w-full" />
                        </div>
                      </div>

                      {isProjectManager && project.status !== "completed" && allTasksCompleted && (
                        <div className="pt-2">
                          <Button 
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => completeProject.mutate()}
                            disabled={completeProject.isPending}
                          >
                            {completeProject.isPending ? "Completing..." : "Click to complete project"}
                          </Button>
                        </div>
                      )}

                      {project.teamMembers && project.teamMembers.length > 0 && (
                        <div className="flex items-center gap-3">
                          <Users className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Team Size</p>
                            <p className="text-sm text-muted-foreground">
                              {project.teamMembers.length} member{project.teamMembers.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="font-medium">Project Details</p>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p><span className="font-medium">Type:</span> {project.type}</p>
                          <p><span className="font-medium">Category:</span> {project.category?.replace(/_/g, ' ')}</p>
                          <p><span className="font-medium">Created:</span> {new Date(project.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {project.description && (
                    <div className="mt-6 pt-4 border-t">
                      <h3 className="font-medium mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Project Plan Section - Hidden for support and maintenance clients */}
          {(user as any)?.clientType !== 'support_maintenance_client' && (
            <div className="mb-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Project Plan</h2>
                    {isProjectManager && (
                      <>
                        <Button variant="outline" onClick={() => setShowPlanForm(!showPlanForm)}>
                          <Edit className="h-4 w-4 mr-2" />
                          {projectPlan || showPlanForm ? "Edit Plan" : "Create Plan"}
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {planLoading || plansLoading ? (
                    <div>Loading project plan...</div>
                  ) : projectPlans && projectPlans.length > 0 ? (
                    projectPlan ? (
                      <div className="space-y-6">
                        <div>
                          <h3 className="font-medium mb-2">{projectPlan.name}</h3>
                          {projectPlan.description && (
                            <p className="text-sm text-muted-foreground mb-4">{projectPlan.description}</p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Start Date:</span> {projectPlan.startDate ? new Date(projectPlan.startDate).toLocaleDateString() : 'Not set'}
                            </div>
                            <div>
                              <span className="font-medium">End Date:</span> {projectPlan.endDate ? new Date(projectPlan.endDate).toLocaleDateString() : 'Not set'}
                            </div>
                          </div>
                        </div>

                        {projectPlan.deliverables && projectPlan.deliverables.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-3">Deliverables</h4>
                            <div className="space-y-3">
                              {projectPlan.deliverables.map((deliverable: any, index: number) => (
                                <div key={index} className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-medium">{deliverable.name}</h5>
                                    <Select
                                      defaultValue={deliverable.status || 'pending'}
                                      onValueChange={async (newStatus) => {
                                        try {
                                          const response = await fetch(`/api/deliverables/${deliverable.id}/status`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ status: newStatus }),
                                          });
                                          if (!response.ok) throw new Error('Failed to update status');
                                          queryClient.invalidateQueries({ queryKey: [`/api/project-plans/${projectPlan.id}`] });
                                          toast({
                                            title: "Success",
                                            description: "Deliverable status updated",
                                          });
                                        } catch (error) {
                                          toast({
                                            title: "Error",
                                            description: "Failed to update status",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="w-[130px] h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="overdue">Overdue</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Start:</span> {deliverable.startDate ? new Date(deliverable.startDate).toLocaleDateString() : 'Not set'}
                                    </div>
                                    <div>
                                      <span className="font-medium">End:</span> {deliverable.endDate ? new Date(deliverable.endDate).toLocaleDateString() : 'Not set'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>Loading project plan details...</div>
                    )
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No project plan created yet.</p>
                      {isProjectManager && (
                        <Button variant="outline" onClick={() => setShowPlanForm(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Project Plan
                        </Button>
                      )}
                    </div>
                  )}
                  {showPlanForm && (
                    <Dialog open={showPlanForm} onOpenChange={setShowPlanForm}>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{projectPlan ? "Edit Project Plan" : "Create Project Plan"}</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit((data) => updateProjectPlan.mutate(data))} className="space-y-6">
                            {/* Same form content as above */}
                            <FormField
                              control={form.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Plan Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Enter plan name" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Plan Description (Optional)</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Enter plan description"
                                      className="min-h-[80px]"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="startDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Plan Start Date</FormLabel>
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
                                    <FormLabel>Plan End Date</FormLabel>
                                    <FormControl>
                                      <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Deliverables Section */}
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <FormLabel>Deliverables</FormLabel>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={addDeliverable}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Deliverable
                                </Button>
                              </div>

                              <FormField
                                control={form.control}
                                name="deliverables"
                                render={({ field }) => (
                                  <FormItem>
                                    <div className="space-y-4">
                                      {field.value.map((deliverable, index) => (
                                        <Card key={index} className="p-4">
                                          <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-medium">Deliverable {index + 1}</h4>
                                            {field.value.length > 1 && (
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeDeliverable(index)}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>

                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                              <FormLabel>Name</FormLabel>
                                              <Input
                                                placeholder="Deliverable name"
                                                value={deliverable.name}
                                                onChange={(e) => {
                                                  const newDeliverables = [...field.value];
                                                  newDeliverables[index].name = e.target.value;
                                                  field.onChange(newDeliverables);
                                                }}
                                              />
                                            </div>

                                            <div>
                                              <FormLabel>Start Date</FormLabel>
                                              <Input
                                                type="date"
                                                value={deliverable.startDate}
                                                onChange={(e) => {
                                                  const newDeliverables = [...field.value];
                                                  newDeliverables[index].startDate = e.target.value;
                                                  field.onChange(newDeliverables);
                                                }}
                                              />
                                            </div>

                                            <div>
                                              <FormLabel>End Date</FormLabel>
                                              <Input
                                                type="date"
                                                value={deliverable.endDate}
                                                onChange={(e) => {
                                                  const newDeliverables = [...field.value];
                                                  newDeliverables[index].endDate = e.target.value;
                                                  field.onChange(newDeliverables);
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </Card>
                                      ))}
                                    </div>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <Button type="submit" className="w-full" disabled={updateProjectPlan.isPending}>
                              {updateProjectPlan.isPending
                                ? (projectPlan ? "Updating..." : "Creating...")
                                : (projectPlan ? "Update Project Plan" : "Create Project Plan")
                              }
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/dashboard/projects/${id}/tasks`)}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">View Tasks</h3>
                    <p className="text-sm text-muted-foreground">Manage project tasks</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/dashboard/projects/${id}/resources`)}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <User className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Resources</h3>
                    <p className="text-sm text-muted-foreground">View project resources</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/dashboard/projects/${id}/team-chat`)}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Team Chat</h3>
                      <p className="text-sm text-muted-foreground">Internal team communication</p>
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <Badge className="bg-red-500 text-white px-2 py-1 text-xs rounded-full">
                      {unreadCount}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            
          </div>
        </div>
      </div>
    </div>
  );
}