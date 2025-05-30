import { useState } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, Trash2, Edit } from "lucide-react";
import type { Project } from "@db/schema";
import { VideoCall } from "@/components/video/video-call";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isProjectManager = user?.role === 'project_manager';
  
  // Debug logging
  console.log('User role:', user?.role, 'Is PM:', isProjectManager);

  const statusColors = {
    active: "bg-green-500",
    inactive: "bg-gray-500",
    pending: "bg-yellow-500",
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString();
  };

  const deleteProject = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${project.id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Prevent card click when clicking delete button
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  // Prevent card click when clicking edit button
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditDialogOpen(true);
  };

  // Prevent card click when clicking video button
  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVideoCall(true);
  };

  const handleCardClick = () => {
    const targetPath = user?.role === 'staff'
      ? `/dashboard/projects/${project.id}/staff`
      : `/dashboard/projects/${project.id}`;
    window.location.href = targetPath;
  };

  return (
    <>
      <Card onClick={handleCardClick} className="cursor-pointer hover:shadow-lg transition-shadow h-full flex flex-col min-h-[160px]">
        <CardHeader className="pb-0 pt-2 px-3 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 mr-1.5 min-w-0">
              <h3 className="font-semibold text-base truncate" title={project.name}>{project.name}</h3>
              <p className="text-xs text-muted-foreground whitespace-nowrap text-ellipsis overflow-hidden">
                {formatDate(project.startDate)} - {formatDate(project.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {isProjectManager && (
                <>
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleEditClick}
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 h-6 w-6 p-0"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Project</DialogTitle>
                      </DialogHeader>
                      <ProjectForm 
                        project={project} 
                        onSuccess={() => setIsEditDialogOpen(false)} 
                      />
                    </DialogContent>
                  </Dialog>
                  
                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDeleteClick}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-red-600">Delete Project</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p className="font-medium">
                          Are you sure you want to delete the project "{project.name}"?
                        </p>
                        <p className="text-sm text-muted-foreground">
                          This action cannot be undone. This will permanently delete:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                          <li>All project tasks and their progress</li>
                          <li>All messages and communications</li>
                          <li>Team member assignments</li>
                          <li>Project resources and files</li>
                        </ul>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel className="bg-gray-100 hover:bg-gray-200">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deleteProject.mutate()}
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={deleteProject.isPending}
                      >
                        {deleteProject.isPending ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                            Deleting...
                          </>
                        ) : (
                          "Delete Project"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleVideoClick}
                className="h-6 w-6 p-0"
              >
                <Video className="h-3 w-3" />
              </Button>
              <Badge
                variant="secondary"
                className={`${statusColors[project.status as keyof typeof statusColors] || "bg-gray-500"} text-[0.65rem] px-1 py-0 h-4`}
              >
                {project.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 py-2 flex-grow flex flex-col justify-center">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[0.65rem]">
              <span>Progress</span>
              <span>{project.progress || 0}%</span>
            </div>
            <Progress value={project.progress || 0} className="h-1" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between p-2 pt-0 pb-2 flex-shrink-0 items-center">
          <div className="flex -space-x-1 items-center">
            <Avatar className="h-5 w-5 border border-background">
              <AvatarFallback className="text-[0.65rem]">JD</AvatarFallback>
            </Avatar>
            <Avatar className="h-5 w-5 border border-background">
              <AvatarFallback className="text-[0.65rem]">AB</AvatarFallback>
            </Avatar>
          </div>
          <Badge variant="outline" className="ml-auto text-[0.65rem] px-1 py-0 h-4">
            {formatDate(project.updatedAt)}
          </Badge>
        </CardFooter>
      </Card>

      {showVideoCall && (
        <VideoCall
          projectId={project.id}
          onClose={() => setShowVideoCall(false)}
        />
      )}
    </>
  );
}