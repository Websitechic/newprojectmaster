import { useState } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Video } from "lucide-react";
import type { Project } from "@db/schema";
import { VideoCall } from "@/components/video/video-call";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [showVideoCall, setShowVideoCall] = useState(false);

  const statusColors = {
    active: "bg-green-500",
    inactive: "bg-gray-500",
    pending: "bg-yellow-500",
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString();
  };

  return (
    <>
      <Card onClick={() => window.location.href = `/dashboard/projects/${project.id}`} className="cursor-pointer hover:shadow-lg transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">{project.name}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(project.startDate)} - {formatDate(project.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowVideoCall(true)}
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