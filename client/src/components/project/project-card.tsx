import { useState } from "react";
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video, Trash2, Edit, Calendar, User, Users } from "lucide-react";
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

  const handleCardClick = () => {
    const targetPath = user?.role === 'staff'
      ? `/dashboard/projects/${project.id}/staff`
      : `/dashboard/projects/${project.id}`;
    window.location.href = targetPath;
  };

  return (
    <>
    <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200 rounded-xl bg-white" onClick={handleClick}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-2">{project.name}</CardTitle>
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white px-2 py-0.5 text-xs rounded-full">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              {project.category?.replace(/_/g, ' ')}
            </p>
          </div>
          <Badge 
            variant={project.status === "completed" ? "default" : "secondary"}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
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
          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
            {project.description}
          </p>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-5 h-5 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-gray-400" />
            </div>
            <span className="text-gray-600">
              {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
            </span>
          </div>

          {project.client && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 flex items-center justify-center">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              <span className="text-gray-600">{project.client.name}</span>
            </div>
          )}

          {project.teamMembers && project.teamMembers.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 flex items-center justify-center">
                <Users className="h-4 w-4 text-gray-400" />
              </div>
              <span className="text-gray-600">
                {project.teamMembers.length} team member{project.teamMembers.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
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