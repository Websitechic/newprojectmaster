
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, Clock, User, Users, Edit, Trash2 } from "lucide-react";
import { ProjectForm } from "@/components/project/project-form";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
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

export default function ProjectDetails() {
  const { id } = useParams();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isProjectManager = user?.role === "project_manager";

  const { data: project, isLoading } = useQuery({
    queryKey: [`/api/projects/${id}`],
    queryFn: () => fetch(`/api/projects/${id}`).then(res => res.json()),
  });

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

  if (isLoading || !project) {
    return <div>Loading...</div>;
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
              {isProjectManager && (
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

          {/* Project Overview */}
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
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="font-medium mb-2">Progress</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Completion</span>
                          <span>{project.progress || 0}%</span>
                        </div>
                        <Progress value={project.progress || 0} className="w-full" />
                      </div>
                    </div>

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

            {project.client && (
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(`/dashboard/client-chat/${project.clientId}`)}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">Client Chat</h3>
                      <p className="text-sm text-muted-foreground">Communicate with client</p>
                    </div>
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
