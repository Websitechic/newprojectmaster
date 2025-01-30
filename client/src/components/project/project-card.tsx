import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Project } from "@db/schema";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const statusColors = {
    active: "bg-green-500",
    inactive: "bg-gray-500",
    pending: "bg-yellow-500",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{project.name}</h3>
            <p className="text-sm text-muted-foreground">
              {new Date(project.startDate!).toLocaleDateString()} -{" "}
              {new Date(project.endDate!).toLocaleDateString()}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={`${statusColors[project.status as keyof typeof statusColors]}`}
          >
            {project.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {project.description}
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{project.progress}%</span>
          </div>
          <Progress value={project.progress} />
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
          {new Date(project.updatedAt).toLocaleDateString()}
        </Badge>
      </CardFooter>
    </Card>
  );
}
