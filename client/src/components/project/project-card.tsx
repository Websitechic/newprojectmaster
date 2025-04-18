import { useState } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, Trash2 } from "lucide-react";
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

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isProjectManager = user?.role === 'project_manager';

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
  
  // Prevent card click when clicking video button
  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowVideoCall(true);
  };
  
  const handleCardClick = () => {
    window.location.href = `/dashboard/projects/${project.id}`;
  };

  return (
    <>
      <Card onClick={handleCardClick} className="cursor-pointer hover:shadow-lg transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">{project.name}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(project.startDate)} - {formatDate(project.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isProjectManager && (
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleDeleteClick}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the project 
                        "{project.name}" and all associated data including tasks, messages, and 
                        team member assignments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deleteProject.mutate()}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {deleteProject.isPending ? "Deleting..." : "Delete Project"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={handleVideoClick}
              >
                <Video className="h-4 w-4" />
              </Button>
              <Badge
                variant="secondary"
                className={statusColors[project.status as keyof typeof statusColors] || "bg-gray-500"}
              >
                {project.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {project.description || "No description available"}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{project.progress || 0}%</span>
            </div>
            <Progress value={project.progress || 0} />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex -space-x-2">
            <Avatar className="border-2 border-background">
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar className="border-2 border-background">
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar className="border-2 border-background">
              <AvatarFallback>+2</AvatarFallback>
            </Avatar>
          </div>
          <Badge variant="outline" className="ml-auto">
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