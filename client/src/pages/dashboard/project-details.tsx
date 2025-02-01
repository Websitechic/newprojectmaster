
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskList } from "@/components/task/task-list";
import type { Project, Task, ProjectMember } from "@db/schema";

export default function ProjectDetails() {
  const { id } = useParams();

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["/api/projects", id, "tasks"],
  });

  const { data: members } = useQuery<ProjectMember[]>({
    queryKey: ["/api/projects", id, "members"],
  });

  if (!project) return null;

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={`/dashboard/projects/${id}`} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground mt-2">{project.description}</p>
            <div className="flex items-center gap-4 mt-4">
              <Badge variant="secondary">{project.type}</Badge>
              <Badge 
                variant="outline" 
                className={
                  project.status === 'active' ? 'bg-green-500' :
                  project.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-500'
                }
              >
                {project.status}
              </Badge>
            </div>
          </div>

          <div className="mb-6">
            <Card>
              <CardContent className="py-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{project.progress || 0}%</span>
                  </div>
                  <Progress value={project.progress || 0} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="team">Team Members</TabsTrigger>
            </TabsList>
            <TabsContent value="tasks">
              <TaskList tasks={tasks || []} />
            </TabsContent>
            <TabsContent value="team">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {members?.map((member) => (
                  <Card key={member.userId}>
                    <CardHeader>
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarFallback>
                            {member.user?.name?.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{member.user?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {member.role}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
