import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Users, Target, MessageSquare, ClipboardList } from "lucide-react";
import { ProjectChat } from "@/components/project/project-chat";
import type { Project } from "@db/schema";

export default function StaffProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ? parseInt(id) : 0;

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground mt-2">{project.description}</p>
        </div>
        <Badge
          variant={project.status === "active" ? "default" : "secondary"}
          className="text-sm"
        >
          {project.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium">Start Date</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(project.startDate)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium">End Date</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(project.endDate)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium">Progress</span>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.progress || 0}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <span className="text-sm font-medium">Team Members</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team-chat">Team Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Quick Actions</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" asChild>
                  <a href={`/dashboard/projects/${projectId}/staff/tasks`}>
                    View My Tasks
                  </a>
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <a href={`/dashboard/tasks`}>
                    All Tasks
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Project Information</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="font-medium">Type:</span>
                  <span className="ml-2 capitalize">{project.type}</span>
                </div>
                <div>
                  <span className="font-medium">Category:</span>
                  <span className="ml-2 capitalize">{project.category}</span>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <span className="ml-2">{formatDate(project.createdAt)}</span>
                </div>
                <div>
                  <span className="font-medium">Last Updated:</span>
                  <span className="ml-2">{formatDate(project.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team-chat">
          <ProjectChat projectId={projectId} chatType="team" />
        </TabsContent>
      </Tabs>
    </div>
  );
}