import { useState } from "react";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, Trash2, Edit, Calendar, User, Users } from "lucide-react";
import { useLocation } from "wouter";
import type { Project } from "@db/schema";
import { VideoCall } from "@/components/video/video-call";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useProjectUnreadCount } from "@/hooks/use-unread-messages";
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
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  handleClick: () => void;
}

export function ProjectCard({ project, handleClick }: ProjectCardProps) {
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const unreadCount = useProjectUnreadCount(project.id);

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

  const handleCardClick = (e: React.MouseEvent) => {
    // Prevent navigation if clicking on buttons or interactive elements
    if ((e.target as HTMLElement).closest('button, [role="button"]')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (handleClick) {
      handleClick();
    } else {
      window.location.href = `/dashboard/projects/${project.id}`;
    }
  };

  return (
    <>
    <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200 rounded-xl bg-white" onClick={handleCardClick}>
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 line-clamp-2 break-words hyphens-auto leading-tight">
                {project.name}
              </CardTitle>
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white px-1.5 py-0.5 text-xs rounded-full shrink-0">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 capitalize">
              {project.category?.replace(/_/g, ' ')}
            </p>
          </div>
          <Badge 
            variant={project.status === "completed" ? "default" : "secondary"}
            className={cn(
              "rounded-full px-2 sm:px-3 py-1 text-xs font-medium shrink-0 self-start",
              project.status === "completed" 
                ? "bg-green-100 text-green-700"
                : project.status === "in_progress"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700"
            )}
          >
            {project.status === "in_progress" ? "Active" : project.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {project.description && (
          <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3">
            {project.description}
          </p>
        )}

        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center shrink-0">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
            </div>
            <span className="text-gray-600 truncate">
              {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
            </span>
          </div>

          {project.client && (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center shrink-0">
                <User className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
              </div>
              <span className="text-gray-600 truncate">{project.client.name}</span>
            </div>
          )}

          {project.teamMembers && project.teamMembers.length > 0 && (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center shrink-0">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
              </div>
              <span className="text-gray-600">
                {project.teamMembers.length} team member{project.teamMembers.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Mobile Action Buttons */}
        {isProjectManager && (
          <div className="flex sm:hidden items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleVideoClick}
              className="h-8 w-8 p-0"
            >
              <Video className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEditClick}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDeleteClick}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the project "{project.name}" from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject.mutate();
                      setIsDeleteDialogOpen(false);
                    }}
                    disabled={deleteProject.isPending}
                  >
                    {deleteProject.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
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